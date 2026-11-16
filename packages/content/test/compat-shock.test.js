// A kit's splash radius and aftershock count while the piece stands (docs/spec/compat.md 兼容-4, docs/spec/traits.md 职业-8).
// 迷迭香's chess kit, unchanged: S2 writes both and writes them back. A probe kit shows a radius on a splash the trait
// does not have, and a count that must not create aftershocks. The engine settles every aftershock in the main hit's frame.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, bus, status, traits } from '@aue/sim';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf } from '../src/compat/records.js';
import { kitsBehaviors, withKitTrait } from '../src/compat/kits.js';
import { chessKit } from '../src/compat/kitmod.js';
import { loadTraining, operatorAt } from '../src/operators.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle */
/** @typedef {{ frame: number, id: number, shock: boolean, splash: boolean, amount: number }} Hit */
/** @typedef {{ x: number, y: number, fly?: boolean }} Spot */
/**
 * @typedef {object} Box
 * @property {any} w @property {any} c @property {ShBattle} b
 * @property {(n: number, cmds?: any[]) => void} run
 * @property {(k: string, i?: number) => any} unit
 * @property {Hit[]} log
 */

const ROS = 'char_391_rosmon';
/** E2 90, 潜能 6, S2 at 专精 3, no module: the trait's one aftershock, not the module's two. */
const BUILD = { elite: 2, level: 90, potential: 6, trust: 100, skill: 1, skillLevel: 10 };
/** @type {any} */
let factory;
/** @type {any} */
let training;

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  const file = join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops', 'chess_char_6_12-rosmon.js');
  const mod = await loadUnderGrid(() => import(pathToFileURL(file).href));
  factory = chessKit(mod.default.chess_char_6_12_a);
  training = await loadTraining(ROS);
});

/** The engine's record without its talents: the kit applies them (兼容-6). @param {Record<string, any>} d */
const bare = ({ talentBb, talentMods, talentTrait, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest }) => rest;
/** A low tile. @param {string} key @param {string} [buildable] */
const tile = (key, buildable = 'ALL') => ({ key, height: 'LOWLAND', buildable, passable: 'ALL', side: 'ALL' });

/**
 * An open 7×5 field (start (2, 0), goal (2, 6); `n` rooted-later slimes at 0.1 s) and the kit `entry` on operator `key`.
 * @param {string} key @param {any} op @param {any} entry @param {number} n @returns {Box}
 */
function open(key, op, entry, n) {
  const tiles = Array.from({ length: 5 }, (_, r) => Array.from({ length: 7 }, (_, c) => (r === 2 && c === 0 ? tile('tile_start', 'NONE') : r === 2 && c === 6 ? tile('tile_end', 'NONE') : tile('tile_road'))));
  const lv = { id: 'open', width: 7, height: 5, options: { maxLifePoint: 9, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 9, moveMultiplier: 1 }, tiles,
    routes: [{ start: { row: 2, col: 0 }, end: { row: 2, col: 6 }, motion: 'WALK', checkpoints: [] }], waves: n ? [oneWave(Array.from({ length: n }, () => spawnAt(0.1, 'slime')))] : [] };
  const c = /** @type {any} */ ({ level: lv, enemies: { slime: { name: 'slime', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0 } }, decks: [[key]],
    operators: { [key]: { ...withKitTrait(op, entry, lv), respawnTime: 1 } } });
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  c.behaviors = kitsBehaviors({ [key]: entry }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @param {number} frames @param {any[]} [cmds] */
  const run = (frames, cmds = []) => { for (let i = 0; i < frames; i++) step(w, c, i === 0 ? cmds : []); };
  /** @param {string} k @param {number} [i] */
  const unit = (k, i = 0) => w.units.filter((u) => u.key === k)[i];
  if (n) run(6);
  /** @type {Hit[]} */
  const log = [];
  bus.on(w, 'damaged', (k) => {
    if (k.source?.key !== key) return;
    const tags = k.dmg.tags ?? [];
    log.push({ frame: w.frame, id: k.target.id, shock: tags.includes('aftershock'), splash: !!k.dmg.isSplash && !tags.includes('aftershock'), amount: k.amount });
  });
  return { w, c, b: /** @type {ShBattle} */ (box.b), run, unit, log };
}

/** Puts each slime on a spot and holds it; a `fly` spot is a flying unit. @param {any[]} foes @param {Spot[]} spots */
function place(foes, spots) {
  foes.forEach((e, i) => {
    const s = spots[i];
    e.x = s.x;
    e.y = s.y;
    if (s.fly) e.base = { ...e.base, motion: 'FLY' };
    status.applyStatus(e, 'root', {});
  });
  return foes;
}

/** Frames on which `id` took a main hit, in order. @param {Hit[]} log @param {number} id @returns {number[]} */
function attackFrames(log, id) {
  /** @type {number[]} */
  const frames = [];
  for (const h of log) if (h.id === id && !h.shock && !h.splash && !frames.includes(h.frame)) frames.push(h.frame);
  return frames;
}

/** Steps until `id` has `n` main hits. @param {Box} box @param {number} id @param {number} n @returns {number[]} */
function untilAttacks(box, id, n) {
  for (let i = 0; i < 500 && attackFrames(box.log, id).length < n; i++) box.run(1);
  const frames = attackFrames(box.log, id);
  assert.ok(frames.length >= n, `${n} attacks, saw ${frames.length}`);
  return frames;
}

/** The hits of one frame. @param {Hit[]} log @param {number} frame @returns {Hit[]} */
const frameHits = (log, frame) => log.filter((h) => h.frame === frame);
/** @param {Hit[]} hits @param {number} id @param {number} main @param {number} shocks @param {number} splash */
function expectCounts(hits, id, main, shocks, splash) {
  assert.equal(hits.filter((h) => h.id === id && !h.shock && !h.splash).length, main, `main ${id}`);
  assert.equal(hits.filter((h) => h.id === id && h.shock).length, shocks, `shocks ${id}`);
  assert.equal(hits.filter((h) => h.id === id && h.splash).length, splash, `splash ${id}`);
}

/** Aftershocks on `id` are half the main hit. Returns the main amount. @param {Hit[]} hits @param {number} id @returns {number} */
function mainAmount(hits, id) {
  const h = hits.find((x) => x.id === id && !x.shock && !x.splash);
  assert.ok(h, `main hit ${id}`);
  for (const x of hits) if (x.id === id && x.shock) assert.equal(x.amount, h.amount * 0.5);
  return h.amount;
}

/** Radius, shockTimes, and the profileShock buff. @param {ShBattle} b @param {any} u @returns {[unknown, unknown, any]} */
function shockState(b, u) {
  const p = b.unitOf(u).profile;
  return [p.splashRadius, p.shockTimes, u.buffs.find((/** @type {{ key: string }} */ x) => x.key === traits.SHOCK_BUFF) ?? null];
}

/** @param {ShBattle} b */
const shockGaps = (b) => b.errors.filter((e) => e.label === 'profile.splashRadius' || e.label === 'profile.shockTimes');
/** Ends a running skill on the next frames (its duration ticks down after the frame it started). @param {Box} box @param {any} u */
function letEnd(box, u) {
  u.skill.dur = 1;
  for (let i = 0; i < 8 && u.skill.active; i++) box.run(1);
  assert.equal(u.skill.active, false);
}

test('[兼容-4] [职业-8] 迷迭香\'s chess kit S2, unchanged: 3 aftershocks in the main hit\'s frame during the skill, 1 before and after; radius 1.5 reaches one ground enemy the trait\'s 0.9 does not', async () => {
  // She stands at (2, 1) facing right. The dummy at (2, 4) is the only ground enemy in range. (3, 5) is √2 from it
  // (outside 0.9, inside 1.5) and out of her range. (0, 4) is 2 away. The flyer at (2.4, 4) is inside 0.9.
  const box = open('rosmon', bare(operatorAt(training, BUILD)), { factory, chess: true, def: defOf(ROS, training, BUILD) }, 4);
  const foes = box.w.units.filter((/** @type {any} */ u) => u.key === 'slime');
  assert.equal(foes.length, 4);
  const [main, near, far, fly] = place(foes, [{ x: 4, y: 2 }, { x: 5, y: 3 }, { x: 4, y: 0 }, { x: 4, y: 2.4, fly: true }]);
  box.run(1, [[0, { type: 'deploy', op: 'rosmon', row: 2, col: 1, dir: 0 }]]);
  const op = box.unit('rosmon');
  const before = frameHits(box.log, untilAttacks(box, main.id, 1)[0]);
  expectCounts(before, main.id, 1, 1, 0);
  expectCounts(before, near.id, 0, 0, 0);
  expectCounts(before, far.id, 0, 0, 0);
  expectCounts(before, fly.id, 0, 0, 0);
  mainAmount(before, main.id);
  assert.deepEqual(shockState(box.b, op), [0.9, 2, null]);

  op.skill.sp = op.skill.cost;
  box.run(1, [[0, { type: 'skill', unit: op.id }]]);
  assert.equal(op.skill.active, true);
  const add = /** @type {{ skill: { bb: { add_times: number } } }} */ (box.b.unitOf(op).def).skill.bb.add_times;
  assert.equal(add, 2);
  const on = shockState(box.b, op);
  assert.deepEqual([on[0], on[1]], [1.5, 2 + add]);
  assert.deepEqual([on[2].value, on[2].n], [1.5, 3]);
  const mid = frameHits(box.log, untilAttacks(box, main.id, 2)[1]);
  expectCounts(mid, main.id, 1, 3, 0);
  expectCounts(mid, near.id, 0, 3, 1);
  expectCounts(mid, far.id, 0, 0, 0);
  expectCounts(mid, fly.id, 0, 0, 0);
  const amt = mainAmount(mid, main.id);
  assert.equal(mid.find((h) => h.id === near.id && h.splash)?.amount, amt);
  for (const h of mid) if (h.id === near.id && h.shock) assert.equal(h.amount, amt * 0.5);

  letEnd(box, op);
  assert.deepEqual(shockState(box.b, op), [0.9, 2, null]);
  const after = frameHits(box.log, untilAttacks(box, main.id, 3)[2]);
  expectCounts(after, main.id, 1, 1, 0);
  expectCounts(after, near.id, 0, 0, 0);
  expectCounts(after, far.id, 0, 0, 0);
  expectCounts(after, fly.id, 0, 0, 0);
  mainAmount(after, main.id);
  assert.deepEqual(shockGaps(box.b), []);
});

/** A ranged operator with one forward tile and the trait given. @param {Record<string, any>} trait */
function probeOp(trait) {
  return { name: 'probe', position: 'RANGED', cost: 1, blockCnt: 1, baseAttackTime: 1, maxHp: 1000, atk: 100, def: 0, res: 0, range: [{ row: 0, col: 2 }], trait };
}

test('[兼容-4] [职业-8] a probe kit\'s splashRadius replaces a fortress ranged splash (written before deploy, and again by assigning the profile); shockTimes does not give aftershocks the trait does not have', () => {
  // Range is only (2, 3). The dummy stands there. 0.7 ahead is inside radius 1; 1.2 off the row is inside 1.7 only; 2 ahead is outside both.
  const entry = { factory: () => ({ install(/** @type {any} */ _b, /** @type {any} */ u) { u.profile.splashRadius = 1.7; u.profile.shockTimes = 5; } }), def: { name: 'fort', skill: null, raw: {} } };
  const box = open('fort', probeOp({ fortress: 1 }), entry, 4);
  const foes = box.w.units.filter((/** @type {any} */ u) => u.key === 'slime');
  const [main, close, mid, far] = place(foes, [{ x: 3, y: 2 }, { x: 3.7, y: 2 }, { x: 3, y: 3.2 }, { x: 5, y: 2 }]);
  box.run(1, [[0, { type: 'deploy', op: 'fort', row: 2, col: 1, dir: 0 }]]);
  const op = box.unit('fort'), wide = shockState(box.b, op);
  assert.deepEqual([wide[0], wide[1], wide[2].value, wide[2].n], [1.7, 5, 1.7, 4]);
  const first = frameHits(box.log, untilAttacks(box, main.id, 1)[0]);
  expectCounts(first, main.id, 1, 0, 0);
  expectCounts(first, close.id, 0, 0, 1);
  expectCounts(first, mid.id, 0, 0, 1);
  expectCounts(first, far.id, 0, 0, 0);

  const p = box.b.unitOf(op);
  p.profile.splashRadius = undefined;
  p.profile.shockTimes = undefined;
  assert.equal(shockState(box.b, op)[2], null);
  const back = frameHits(box.log, untilAttacks(box, main.id, 2)[1]);
  expectCounts(back, close.id, 0, 0, 1);
  expectCounts(back, mid.id, 0, 0, 0);
  expectCounts(back, far.id, 0, 0, 0);
  p.profile = { ...p.profile, splashRadius: 1.7 };
  const again = frameHits(box.log, untilAttacks(box, main.id, 3)[2]);
  expectCounts(again, mid.id, 0, 0, 1);
  expectCounts(again, far.id, 0, 0, 0);
  assert.equal(shockState(box.b, op)[2].value, 1.7);
  assert.deepEqual(shockGaps(box.b), []);
});

test('[兼容-4] [职业-8] shockTimes 1 is the trait\'s own one aftershock and leaves no profileShock buff', () => {
  const entry = { factory: () => ({ install(/** @type {any} */ _b, /** @type {any} */ u) { u.profile.shockTimes = 1; } }), def: { name: 'bom', skill: null, raw: {} } };
  const box = open('bom', probeOp({ splash: { radius: 0.9, scale: 1, ground: true }, aftershock: 0.5 }), entry, 1);
  const foe = place(box.w.units.filter((/** @type {any} */ u) => u.key === 'slime'), [{ x: 3, y: 2 }])[0];
  box.run(1, [[0, { type: 'deploy', op: 'bom', row: 2, col: 1, dir: 0 }]]);
  const op = box.unit('bom');
  assert.deepEqual(shockState(box.b, op), [0.9, 1, null]);
  const hit = frameHits(box.log, untilAttacks(box, foe.id, 1)[0]);
  expectCounts(hit, foe.id, 1, 1, 0);
  mainAmount(hit, foe.id);
  assert.deepEqual(shockGaps(box.b), []);
});
