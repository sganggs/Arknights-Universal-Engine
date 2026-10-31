// The effect player without a GPU (docs/spec/render.md 渲染-10, 渲染-11): curves, a particle system's emission and
// motion, the triangles it makes, an instance's timing, the roots, and the effects played from battle events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KIND, DIR, SKILL_STATE, STATUS_BIT } from '@aue/schema';
import { mm, evalKeys, grad, startColor, trackAt, trackValue, scroll, uvThrough, euler, rot } from '../src/fx/curves.js';
import { FxSystem, shapePoint } from '../src/fx/system.js';
import { FxBatch, fxMaterial, quad, strip, particleAxes } from '../src/fx/geometry.js';
import { FxInstance, rootAt, rootToward, rootAlong, effectLead, sizesOf } from '../src/fx/player.js';
import { createEffects, FX } from '../src/effects.js';

const near = (/** @type {number} */ a, /** @type {number} */ b, e = 1e-6) => Math.abs(a - b) < e;
const seeded = (s = 7) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const C = (/** @type {number} */ v) => ({ st: 0, sc: v, mn: v, cx: [], cn: [] });
/** A plain system: no shape, everything constant, one burst of `n` at 0. @param {Record<string, any>} [o] */
const sys = (o = {}) => ({ dur: 1, loop: false, delay: C(0), space: 0, scaling: 0, life: C(1), speed: C(0), size: C(0.5), rot: C(0), color: { st: 0, cmax: [1, 1, 1, 1] },
  gravity: C(0), max: 1000, rate: C(0), rateD: C(0), bursts: [{ t: 0, n: C(3), cycles: 1, iv: 0.01 }], shape: { on: false, rot: [0, 0, 0] }, render: { mode: 0, align: 0 }, blend: 'add', tex: 'a', ...o });
const host = (/** @type {Record<string, any>} */ o = {}) => ({ t: 0, R: rootAt([0, 0, 0], 1), v: [0, 0, 0], rand: seeded(), stopped: false, kind: 'hit', sysAt: /** @type {any[]} */ ([]), ...o });

test('[渲染-10] curves: constants, Hermite keys held at the ends, two constants, gradients, start colours, tracks', () => {
  assert.equal(mm(C(2), 0.5, 0.9), 2);
  const keys = /** @type {any} */ ([[0, 0, 0, 0], [1, 1, 0, 0]]);
  assert.ok(near(/** @type {number} */ (evalKeys(keys, 0.5)), 0.5) && evalKeys(keys, -1) === 0 && evalKeys(keys, 2) === 1);
  assert.equal(evalKeys(/** @type {any} */ ([[0, 3, 0, 1e30], [1, 9, 0, 0]]), 0.5), 3, 'an infinite slope holds');
  assert.equal(mm({ st: 3, sc: 4, mn: 2 }, 0, 0.5), 3);
  assert.equal(mm({ st: 1, sc: 2, cx: keys }, 0.5, 0), 1);
  assert.deepEqual(grad({ c: [[1, 0, 0, 0], [0, 0, 1, 1]], a: [[1, 0], [0, 1]] }, 0.5), [0.5, 0, 0.5, 0.5]);
  assert.deepEqual(startColor({ st: 2, cmin: [0, 0, 0, 0], cmax: [1, 1, 1, 1] }, 0, 0.25), [0.25, 0.25, 0.25, 0.25]);
  const an = { n: 3, L: 1, loop: 0 };
  assert.deepEqual(trackAt(an, 0.25), [0, 1, 0.5]);
  assert.deepEqual(trackValue([0, 10, 20], 1, trackAt(an, 0.75)), [15]);
  assert.deepEqual(trackAt({ ...an, loop: 1 }, 1.25), [0, 1, 0.5], 'a looping track wraps');
});

test('[渲染-10] texture coordinates: tiling, offset, rotation about the centre, scroll; Euler angles z, x, y', () => {
  const out = [0, 0];
  uvThrough([1, 0], { st: [2, 1, 0.5, 0], off: [0, 0], R: null, sc: [0.25, 0] }, out, 0);
  assert.deepEqual(out, [2.75, 0]);
  uvThrough([1, 0.5], { st: [1, 1, 0, 0], off: [0, 0], R: [0, 1, -1, 0], sc: [0, 0] }, out, 0);
  assert.ok(near(out[0], 0.5) && near(out[1], 1), 'a quarter turn about the centre');
  assert.deepEqual(scroll({ uvspd: [0.5, 0, 0, 0] }, 3).slice(0, 2), [0.5, 0], 'scrolls wrap');
  const v = rot(euler([0, 0, 90]), [1, 0, 0]);
  assert.ok(near(v[0], 0) && near(v[1], 1));
});

test('[渲染-10] a system: a burst at its time, emission over time, gravity, lifetime, the max', () => {
  const h = host(), s = new FxSystem(sys({ life: C(0.5), gravity: C(1) }), h);
  h.sysAt = [s];
  s.step(1 / 30);
  assert.equal(s.ps.length, 3);
  const vy = s.ps[0].vy;
  s.step(0.1);
  assert.ok(s.ps[0].vy < vy, 'gravity pulls along −y (south)');
  s.step(0.5);
  assert.equal(s.ps.length, 0, 'gone at the end of their life');
  const r = new FxSystem(sys({ bursts: [], rate: C(100), loop: true }), host());
  for (let i = 0; i < 10; i++) r.step(0.1);
  assert.equal(r.ps.length, 100, 'a rate of 100 a second for a second (looping start effects emit for a second)');
  const big = new FxSystem(sys({ bursts: [{ t: 0, n: C(500), cycles: 1, iv: 0.01 }] }), host());
  big.step(0.01);
  assert.equal(big.ps.length, 120, 'at most 120 particles a system');
});

test('[渲染-10] shapes: a cone emits within its angle; sub-emitters and collision planes', () => {
  const r = seeded(3);
  for (let i = 0; i < 50; i++) { const { d } = shapePoint({ type: 4, radius: 0, angle: 30, arc: 360, thick: 1 }, r); assert.ok(d[2] >= Math.cos(Math.PI / 6) - 1e-9); }
  const h = host(), parent = sys({ speed: C(1), shape: { on: true, type: 4, radius: 0, angle: 0, arc: 360, thick: 1, pos: [0, 0, 0], rot: [0, 0, 0] }, bursts: [{ t: 0, n: C(1), cycles: 1, iv: 0.01 }],
    sub: [{ i: 1, type: 0, inh: 0, p: 1 }], coll: { pl: [[0, 0, 0.5, 0, 0, -1]], b: C(1), d: C(0) } });
  const child = sys({ subOf: 0, bursts: [{ t: 0, n: C(2), cycles: 1, iv: 0.01 }] });
  const P = new FxSystem(parent, h), K = new FxSystem(child, h);
  h.sysAt = [P, K];
  for (let i = 0; i < 10; i++) { P.step(0.05); K.step(0.05); }
  assert.equal(K.ps.length, 2, 'the sub-emitter burst from the parent particle');
  assert.ok(P.ps[0].z <= 0.5 && P.ps[0].vz < 0, 'the parent bounced off the plane z = 0.5');
});

test('[渲染-10] triangles: a quad takes its sheet cell; a strip faces the camera; billboards turn with the camera', () => {
  const b = new FxBatch(new THREE.MeshBasicMaterial()), uv = (/** @type {number} */ u, /** @type {number} */ v) => [u, v, 0, 0, 0, 0, 0, 0];
  b.begin();
  quad(b, { c: [0, 0, 0], a: [1, 0, 0], b: [0, 1, 0] }, { f: 1, tx: 2, ty: 2 }, uv, { C: [1, 1, 1, 1], S: [0, 0.1, 0, 0] });
  strip(b, { P: [[0, 0, 0], [1, 0, 0], [2, 0, 0]], U: [0, 0.5, 1], W: [0.2, 0.2, 0.2], C: [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]] }, uv, [0, 0.1, 0, 0], [0, 0, -1]);
  b.end();
  assert.deepEqual([b.n, b.ni], [4 + 6, 6 + 12]);
  const U = b.a.uvMain;
  assert.deepEqual([U[0], U[1], U[6], U[7]], [0.5, 0.5, 1, 1], 'frame 1 of a 2 × 2 sheet: the top right cell');
  assert.ok(near(Math.abs(b.a.position[4 * 3 + 1]), 0.1), 'the strip is 0.2 wide across the view');
  const cam = { right: [1, 0, 0], up: [0, 1, 0], view: [0, 0, -1] }, q = { x: 0, y: 0, z: 0, rot: 0, svx: 0, svy: 0, svz: 0 };
  const ax = particleAxes({ render: { mode: 0, align: 0 } }, q, { R: rootAt([0, 0, 0], 1), M: [1, 0, 0, 0, 1, 0, 0, 0, 1], size: 2, sizeY: 2 }, cam);
  assert.deepEqual([ax.a, ax.b], [[1, 0, 0], [0, 1, 0]]);
  const lying = particleAxes({ render: { mode: 0, align: 2 } }, q, { R: rootAt([0, 0, 0], 1), M: [1, 0, 0, 0, 1, 0, 0, 0, 1], size: 2, sizeY: 2 }, cam);
  assert.deepEqual(lying.b, [0, 0, -1], 'a local-aligned particle lies in its system plane: its y is north');
  assert.equal(fxMaterial({ tex: 'x', blend: 'add' }, new Map()).blendDst, THREE.OneFactor);
  b.dispose();
});

test('[渲染-10] sizes: one start size grows alike on every axis, or apart when the system sizes the axes apart; 3D start sizes their own', () => {
  const q = { size: 0.5, sizeY: 0, sizeZ: 0, r2: 0.3 };
  assert.deepEqual(sizesOf({ sizeOL: C(2) }, q, 0.5), { size: 1, sizeY: 1, sizeZ: 1 });
  assert.deepEqual(sizesOf({ sizeOL: C(2), sizeOLY: C(0.1), sizeOLZ: C(1) }, q, 0.5), { size: 1, sizeY: 0.05, sizeZ: 0.5 }, 'a streak from one start size');
  assert.deepEqual(sizesOf({ size3D: 1, sizeOL: C(2) }, { ...q, sizeY: 0.25, sizeZ: 0 }, 0.5), { size: 1, sizeY: 0.5, sizeZ: 1 }, '3D start sizes, alike over life');
});

test('[渲染-10] an instance: it waits, plays, stops at its cap, fades, and is done', () => {
  const tex = new Map([['a', new THREE.Texture()]]), e = { d: 0.5, w: 0.2, ps: [sys({ life: C(0.3) })], tr: [{ kind: 'trail', tex: 'a', time: 0.3, grad: { c: [[1, 1, 1, 0]], a: [[1, 0]] }, texMode: 0, width: 0.1, blend: 'add' }] };
  const i = new FxInstance(e, rootAt([0, 0, 0], 1), { kind: 'hit', tex, rand: seeded() });
  i.step(0.1);
  assert.deepEqual([i.t, i.done], [0, false], 'still waiting');
  for (let k = 0; k < 10; k++) i.step(0.1);
  assert.ok(i.stopped, 'stopped at its cap');
  for (let k = 0; k < 20; k++) i.step(0.1);
  assert.ok(i.done && i.fade === 0);
  assert.equal(effectLead({ w: 0.1, ps: [sys({ delay: C(0.2) })], tr: [] }), 0.30000000000000004);
  i.dispose();
});

test('[渲染-10] roots: the battle axes (x east, y north −z, z down −y), mirrored, turned toward a way, along a flight', () => {
  assert.deepEqual(rootAt([1, 2, 3], -1), { o: [1, 2, 3], ex: [-1, 0, 0], ey: [0, 0, -1], ez: [0, -1, 0] });
  const t = rootToward([0, 0, 0], [1, 0, 0]);
  assert.deepEqual([t.ey, t.ex.map((v) => Math.round(v) + 0)], [[1, 0, 0], [0, 0, 1]], 'its y east, its x south');
  const f = rootAlong([0, 0, 0], [-2, 0, 0]);
  assert.deepEqual([f.ex, f.ey.map((v) => v + 0)], [[-1, 0, 0], [0, 0, 1]], 'flying west: x west, y south (turned, not mirrored)');
});

test(`[渲染-11] events: waiting starts with the attack, a shot's trail flies and stops at the hit, hits turned as placed`, () => {
  const tex = new Map([['a', new THREE.Texture()]]), e = (/** @type {Record<string, any>} */ o = {}) => ({ d: 0.5, ps: [sys()], tr: [], ...o });
  const data = { by: { op: { s: 'st', ss: ['st', 'st2'], h: 'hitOp' }, foe: { t: 'trail', h: 'hitFoe', v: 5, arc: 0.5 } },
    fx: { st: e({ w: 0.2 }), st2: e(), hitOp: e({ rt: 1 }), hitFoe: e({ rt: 2 }), trail: e({ ps: [sys({ loop: true, rate: C(10), bursts: [] })] }) } };
  const fx = createEffects({ data, textures: tex }, { width: 4, height: 2 });
  const unit = (/** @type {Record<string, any>} */ o) => ({ owner: 0, z: 0, dir: DIR.RIGHT, hp: 1, maxHp: 1, anim: 0, sp: -1, spCost: 0, skill: 0, skillLeft: -1, ...o });
  const view = (/** @type {number} */ frame) => /** @type {any} */ ({ frame, players: [], units: [unit({ id: 1, kind: KIND.OPERATOR, x: 0, y: 0 }), unit({ id: 2, kind: KIND.ENEMY, owner: -1, x: 2, y: 0 })] });
  const cam = new THREE.PerspectiveCamera();
  cam.updateMatrixWorld();
  fx.update(view(1), { 1: 'op', 2: 'foe' }, [{ type: 'attack', id: 1, target: 2, wind: 5 }, { type: 'shot', id: 2, target: 1 }]);
  assert.equal(fx.count(), 3, 'both starts of the operator (its first waits 0.2 s) and the trail');
  assert.equal(fx.flights.length, 1);
  fx.step(0.1, cam);
  const trail = fx.flights[0].inst;
  assert.ok(trail.R.o[0] < 0.5, 'the trail flies west toward its target');
  fx.update(view(2), {}, [{ type: 'hit', id: 2, target: 1 }, { type: 'hit', id: 1, target: 2 }]);
  assert.ok(trail.stopped && fx.flights.length < 1, 'the hit stops it');
  const hits = fx.live.slice(-2);
  assert.deepEqual(hits[0].R.ey, [-1, 0, 0], 'type 2: its y turned toward the attack (west)');
  assert.deepEqual(hits[1].R.ex, [1, 0, 0], 'type 1: not mirrored, the attack goes east');
  assert.ok(Math.abs(hits[1].R.o[1] - FX.chest * cam.up.y) < 1e-9 || hits[1].R.o[1] > 0, 'at the chest, above the feet along the camera up');
  fx.dispose();
});

test('[渲染-12] markers on the start and end tiles, a skill\'s own hit, deploying and dying, a status while it lasts', () => {
  const tex = new Map([['a', new THREE.Texture()]]), e = (/** @type {Record<string, any>} */ o = {}) => ({ d: 0.5, ps: [sys()], tr: [], ...o });
  const lasting = e({ ps: [sys({ loop: true, rate: C(5), bursts: [] })] });
  const data = { by: { op: { h: 'hitA', m: { 2: { h: 'hitS' } } } }, named: { tile_start: 'mk', tile_end_coop_1: 'mk2', deploy: 'dep', die_enemy: 'die', status_stun: 'stun' },
    fx: { hitA: e(), hitS: e(), mk: lasting, mk2: lasting, dep: e(), die: e(), stun: { ...lasting, sl: 4 } } };
  const road = (/** @type {string} */ key) => ({ key, height: 'LOWLAND' });
  const fx = createEffects({ data, textures: tex }, { width: 3, height: 1, tiles: [[road('tile_start_cooperate'), road('tile_road'), road('tile_end_cooperate')]] }, { skills: { op: 2 } });
  assert.equal(fx.count(), 2, 'a marker on each end tile');
  const unit = (/** @type {Record<string, any>} */ o) => ({ owner: 0, z: 0, dir: DIR.RIGHT, hp: 1, maxHp: 1, anim: 0, sp: -1, spCost: 0, skill: 0, skillLeft: -1, status: 0, element: 0, ep: 1, burst: 0, y: 0, ...o });
  const view = (/** @type {number} */ frame, /** @type {number} */ status) => /** @type {any} */ ({ frame, players: [], units: [
    unit({ id: 1, kind: KIND.OPERATOR, x: 1, skill: SKILL_STATE.RUNNING }), unit({ id: 2, kind: KIND.ENEMY, owner: -1, x: 2, status })] });
  fx.update(view(1, STATUS_BIT.stun), { 1: 'op', 2: 'foe' }, [{ type: 'deploy', id: 1, key: 'op', owner: 0 }, { type: 'hit', id: 1, target: 2 }]);
  const named = (/** @type {string} */ n) => fx.live.filter((i) => i.e === data.fx[/** @type {keyof typeof data.fx} */ (n)]);
  assert.deepEqual([named('dep').length, named('hitS').length, named('hitA').length, fx.statuses.size], [1, 1, 0, 1], 'the skill runs: its own hit');
  const stun = [...fx.statuses.values()][0].inst;
  assert.ok(Math.abs(stun.R.o[1] - FX.head * fx.up[1]) < 1e-9, 'spawn location 4: at the head');
  fx.update(view(2, 0), {}, [{ type: 'death', id: 2 }]);
  assert.ok(stun.stopped && fx.statuses.size === 0, 'the status gone: its effect stops');
  assert.equal(named('die').length, 1);
  fx.dispose();
});

test('[渲染-12] co-op goals by the viewer: their own goal and one of no single side take the first co-op marker, the partner\'s the second', () => {
  const lasting = { d: 0.5, ps: [sys({ loop: true, rate: C(5), bursts: [] })], tr: [] };
  const data = { by: {}, named: { tile_end_coop_1: 'blue', tile_end_coop_2: 'teal' }, fx: { blue: lasting, teal: { ...lasting } } };
  const end = (/** @type {string | undefined} */ goal) => ({ key: 'tile_end_cooperate', height: 'LOWLAND', ...(goal ? { goal } : {}) });
  const level = { width: 3, height: 1, tiles: [[end('A'), end('B'), end(undefined)]] };
  const seen = (/** @type {number | undefined} */ seat) => {
    const fx = createEffects({ data, textures: new Map() }, level, seat === undefined ? {} : { seat });
    const kinds = fx.live.map((i) => (i.e === data.fx.blue ? 'blue' : 'teal'));
    fx.dispose();
    return kinds;
  };
  assert.deepEqual(seen(0), ['blue', 'teal', 'blue'], 'seat 0: goal A its own');
  assert.deepEqual(seen(1), ['teal', 'blue', 'blue'], 'seat 1: goal B its own');
  assert.deepEqual(seen(undefined), ['blue', 'teal', 'blue'], 'no seat given: seat 0');
  const only = createEffects({ data: { ...data, named: { tile_end_coop_1: 'blue' } }, textures: new Map() }, level, { seat: 0 });
  assert.equal(only.live.filter((i) => i.e === data.fx.blue).length, 3, 'a pack without the second marker: the first');
  only.dispose();
});

test('[渲染-12] [渲染-26] 阵地足球: our goal takes the third co-op end marker, theirs the start marker; the 守门位, ice and slime their effects while they last', () => {
  const lasting = () => ({ d: 0.5, ps: [sys({ loop: true, rate: C(5), bursts: [] })], tr: [] });
  const data = { by: {}, named: { tile_start: 'red', tile_end_coop_1: 'blue1', tile_end_coop_3: 'blue3', football_spot: 'spot', football_ice: 'ice' },
    fx: { red: lasting(), blue1: lasting(), blue3: lasting(), spot: lasting(), ice: lasting() } };
  const tile = (/** @type {string} */ key) => ({ key, height: 'LOWLAND' });
  const fx = createEffects({ data, textures: new Map() }, { width: 3, height: 2, tiles: [[tile('tile_allygoal'), tile('tile_football'), tile('tile_enemygoal')], [tile('tile_allygoal'), tile('tile_football'), tile('tile_enemygoal')]] });
  const kinds = () => fx.live.filter((i) => !i.stopped).map((i) => Object.keys(data.fx).find((k) => data.fx[/** @type {keyof typeof data.fx} */ (k)] === i.e)).sort();
  assert.deepEqual(kinds(), ['blue3', 'blue3', 'red', 'red'], 'a marker on each goal tile');
  const drawn = fx.pitch({ spots: [3], cover: { 1: -0.3, 4: 0.3 }, kicks: [] });
  assert.deepEqual([...drawn].sort(), ['ice', 'spot'], 'the slime has no effect in this pack: its square stays');
  assert.deepEqual(kinds(), ['blue3', 'blue3', 'ice', 'red', 'red', 'spot']);
  fx.pitch({ spots: [3], cover: { 1: -0.3, 4: 0.3 }, kicks: [] });
  assert.equal(fx.field.size, 2, 'kept, not started again');
  fx.pitch({ spots: [3], cover: {}, kicks: [] });
  assert.deepEqual(kinds(), ['blue3', 'blue3', 'red', 'red', 'spot'], 'the ice gone: its effect stops');
  fx.pitch(null);
  assert.equal(fx.field.size, 0);
  fx.dispose();
});

test('[渲染-25] a 炼金单元: its trail flies to the landing tile, its effects loop there, drift and grow with it, and stop at its end', () => {
  const tex = new Map([['a', new THREE.Texture()]]), lasting = () => ({ d: 0.5, ps: [sys({ loop: true, rate: C(5), bursts: [] })], tr: [] });
  const data = { by: { alc: { z: { 2: { t: 'trail', v: 2, arc: 0.5, r: ['range', 'token'] } } } }, fx: { trail: lasting(), range: lasting(), token: lasting() } };
  const fx = createEffects({ data, textures: tex }, { width: 4, height: 2 }, { skills: { alc: 2 } });
  const unit = { id: 1, kind: KIND.OPERATOR, owner: 0, x: 0, y: 0, z: 0, dir: DIR.RIGHT, hp: 1, maxHp: 1, anim: 0, sp: -1, spCost: 0, skill: 0, skillLeft: -1, status: 0 };
  const view = /** @type {any} */ ({ frame: 1, players: [], units: [unit] }), cam = new THREE.PerspectiveCamera();
  cam.updateMatrixWorld();
  fx.update(view, { 1: 'alc' }, [{ type: 'alchemy', id: 9, src: 1, x: 2, y: 0, r: 1, frames: 120, vx: 0.5, vy: 0, grow: 1, drift: 90 }]);
  const named = (/** @type {string} */ n) => fx.live.filter((i) => i.e === data.fx[/** @type {keyof typeof data.fx} */ (n)] && !i.stopped);
  assert.deepEqual([named('trail').length, named('range').length], [1, 0], 'thrown: the trail, nothing landed yet');
  const t0 = named('trail')[0].R.o[0];
  fx.step(0.5, cam);
  assert.ok(named('trail')[0].R.o[0] > t0, 'it flies east');
  fx.step(0.6, cam);
  assert.deepEqual([named('trail').length, named('range').length, named('token').length], [0, 1, 1], 'two tiles at 2 a second: landed after a second');
  const range = named('range')[0], o0 = range.R.o[0];
  fx.step(0.5, cam);
  assert.ok(range.R.o[0] > o0 && Math.hypot(...range.R.ex) > 1, 'it drifts east and grows');
  fx.step(2.5, cam);
  assert.deepEqual([range.stopped, fx.pots.length], [true, 0], 'four seconds: over');
  const none = createEffects({ data: { by: {}, fx: {} }, textures: tex }, { width: 4, height: 2 });
  none.update(view, { 1: 'op' }, [{ type: 'alchemy', id: 9, src: 1, x: 2, y: 0, r: 1, frames: 90, vx: 0, vy: 0, grow: 0, drift: 0 }]);
  assert.equal(none.pots.length, 0, 'no throw in the pack: nothing');
  fx.dispose(); none.dispose();
});

test('[渲染-27] 锦标 lightning on a ball: its warning kept on the ball, then the bolt and the burning until it is over', () => {
  const lasting = () => ({ d: 0.5, ps: [sys({ loop: true, rate: C(5), bursts: [] })], tr: [] });
  const data = { by: {}, named: { thunder_warn: 'warn', thunder_hit: 'hit', thunder_burn: 'burn' }, fx: { warn: lasting(), hit: { d: 0.5, ps: [sys()], tr: [] }, burn: lasting() } };
  const fx = createEffects({ data, textures: new Map([['a', new THREE.Texture()]]) }, { width: 4, height: 2 });
  const ball = { id: 5, kind: KIND.ENEMY, owner: -1, x: 1, y: 0, z: 0, dir: DIR.RIGHT, hp: 1, maxHp: 1, anim: 0, sp: -1, spCost: 0, skill: 0, skillLeft: -1, status: 0 };
  const cam = new THREE.PerspectiveCamera();
  cam.updateMatrixWorld();
  const on = () => fx.live.filter((i) => !i.stopped).map((i) => Object.keys(data.fx).find((k) => data.fx[/** @type {keyof typeof data.fx} */ (k)] === i.e)).sort();
  fx.update(/** @type {any} */ ({ frame: 1, players: [], units: [ball] }), { 5: 'ball' }, [{ type: 'thunder', id: 5, phase: 0 }]);
  assert.deepEqual(on(), ['warn']);
  const o0 = fx.storms.get(5)?.inst.R.o[0] ?? 0;
  fx.update(/** @type {any} */ ({ frame: 2, players: [], units: [{ ...ball, x: 2 }] }), {}, []);
  fx.step(0.1, cam);
  assert.ok((fx.storms.get(5)?.inst.R.o[0] ?? 0) > o0, 'the warning follows the ball');
  fx.update(/** @type {any} */ ({ frame: 3, players: [], units: [{ ...ball, x: 2 }] }), {}, [{ type: 'thunder', id: 5, phase: 1 }]);
  assert.deepEqual(on(), ['burn', 'hit'], 'the bolt: the warning stops');
  fx.update(/** @type {any} */ ({ frame: 4, players: [], units: [{ ...ball, x: 2 }] }), {}, [{ type: 'thunder', id: 5, phase: 2 }]);
  assert.deepEqual([on().includes('burn'), fx.storms.size], [false, 0], 'over');
  fx.dispose();
});

test('[渲染-28] a unit drawn by an effect: its look while on the field, following it; its end where it left instead of the death effect', () => {
  const lasting = () => ({ d: 0.5, ps: [sys({ loop: true, rate: C(5), bursts: [] })], tr: [] }), once = () => ({ d: 0.5, ps: [sys()], tr: [] });
  const data = { by: { wind: { b: 'loop', e: 'end' }, ghost: { b: 'missing' } }, named: { die_enemy: 'die' }, fx: { loop: { ...lasting(), sl: 2 }, end: once(), die: once() } };
  const fx = createEffects({ data, textures: new Map([['a', new THREE.Texture()]]) }, { width: 4, height: 2 });
  const foe = (/** @type {number} */ id, /** @type {number} */ x) => ({ id, kind: KIND.ENEMY, owner: -1, x, y: 0, z: 0, dir: DIR.RIGHT, hp: 1, maxHp: 1, anim: 0, sp: -1, spCost: 0, skill: 0, skillLeft: -1, status: 0 });
  const cam = new THREE.PerspectiveCamera();
  cam.updateMatrixWorld();
  const on = () => fx.live.filter((i) => !i.stopped).map((i) => Object.keys(data.fx).find((k) => data.fx[/** @type {keyof typeof data.fx} */ (k)] === i.e)).sort();
  fx.update(/** @type {any} */ ({ frame: 1, players: [], units: [foe(5, 1), foe(6, 2)] }), { 5: 'wind', 6: 'ghost' }, []);
  assert.deepEqual([on(), fx.looks.size], [['loop'], 1], 'a look the pack has; none for the other');
  const look = /** @type {any} */ (fx.looks.get(5)).inst, o0 = look.R.o[0];
  fx.step(0.1, cam);
  assert.ok(Math.abs(look.R.o[1] - FX.chest * fx.up[1]) < 1e-9, 'lifted by its spawn location (2: the chest)');
  fx.update(/** @type {any} */ ({ frame: 2, players: [], units: [foe(5, 2), foe(6, 2)] }), {}, []);
  fx.step(0.1, cam);
  assert.ok(look.R.o[0] > o0, 'it follows the unit');
  fx.update(/** @type {any} */ ({ frame: 3, players: [], units: [] }), {}, [{ type: 'death', id: 5 }, { type: 'death', id: 6 }]);
  assert.ok(look.stopped && fx.looks.size === 0, 'gone: the look stops');
  assert.deepEqual(on(), ['die', 'end'], 'its end where it left, the death effect only for the other');
  const end = fx.live.find((i) => i.e === data.fx.end);
  assert.ok(end && Math.abs(end.R.o[0] - look.R.o[0]) < 1e-9, 'at its last place');
  fx.update(/** @type {any} */ ({ frame: 4, players: [], units: [foe(5, 3)] }), {}, []);
  assert.equal(fx.looks.size, 1, 'back on the field: its look again');
  fx.dispose();
});
