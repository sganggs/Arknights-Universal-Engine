// A kit's 【移动】 (docs/spec/compat.md 兼容-4: moveRedeploy, field.md 部署-9's keeping move) keeps HP, buffs and the skill
// but starts the element values afresh and ends a burst, before the kit's own deploy handlers run: with a kit of our
// own, and with the pinned kits that reach it unchanged — 贝洛内 (S3 moves at the cast) and 赤刃明霄陈 (S2 moves after its
// slashes).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir, tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, bus, attrs, buffs, elements } from '@aue/sim';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf } from '../src/compat/records.js';
import { kitsBehaviors } from '../src/compat/kits.js';
import { loadTraining, operatorAt } from '../src/operators.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle */

const DEMETR = 'char_4037_demetr', CHEN3 = 'char_1050_chen3';
/** E2 90, 潜能 6, 专精 3 of skill `skill` (an index), the first module at stage 3. @param {number} skill */
const buildOf = (skill) => ({ elite: 2, level: 90, potential: 6, trust: 100, skill, skillLevel: 10, module: 0, moduleLevel: 3 });
/** @type {Record<string, { factory: any, training: any }>} */
const real = {};

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  for (const [id, file] of [[DEMETR, 'op-demetr.js'], [CHEN3, 'op-chen3.js']]) {
    const mod = await loadUnderGrid(() => import(pathToFileURL(join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops', file)).href));
    real[id] = { factory: mod.default[id], training: await loadTraining(id) };
  }
});

/** @param {any} w @param {string} key */
const unit = (w, key) => w.units.find((/** @type {any} */ u) => u.key === key);
/** Whether a unit has a buff of a key. @param {any} u @param {string} key */
const has = (u, key) => u.buffs.some((/** @type {any} */ b) => b.key === key);
/** Element damage as a kit deals it, by Stronghold's element names (兼容-4). @param {ShBattle} b @param {any} to @param {string} element @param {number} amount */
const epHit = (b, to, element, amount) => b.dealDamage(null, to, { type: 'element', element, amount });

/**
 * The tiny level without waves with the guard on (1, 0) and a copy of it, `twin`, on (1, 1), each under our own kit:
 * its skill `s` (MANUAL, 2 SP, 5 s) 【移动】s it two tiles on at its start (moveRedeploy, as kits do), and its deploy
 * handler notes what each move's event shows of it. A million HP, RES 50.
 */
function ours() {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  Object.assign(c.level.options, { initialCost: 60, maxCost: 99, characterLimit: 4 });
  Object.assign(c.operators.guard, { maxHp: 1e6, res: 50 });
  c.operators.guard.skill = { id: 's', type: 'MANUAL', sp: 'time', cost: 2, init: 2, charges: 1, duration: 5, ammo: false, bb: {} };
  c.operators.twin = { ...c.operators.guard, name: 'twin' };
  c.decks = [['guard', 'twin']];
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null }), seen = /** @type {any[]} */ ([]);
  const factory = () => ({
    skills: { s: { kind: 'duration', duration: 5, onStart: (/** @type {any} */ x) => { x.battle.moveRedeploy(x.unit, x.unit.tileR, x.unit.tileC + 2); } } },
    install(/** @type {ShBattle} */ b, /** @type {any} */ u) {
      b.on('deploy', (k) => { if (k.unit === u && k.move) seen.push([u.defId, !!u.flags.burstLock, u.findBuff('burnBurst'), { ...u.u.ep }]); }, { owner: u });
    },
  });
  const def = (/** @type {string} */ name) => ({ name, skill: { id: 's', bb: {} } });
  c.behaviors = kitsBehaviors({ guard: { factory, def: def('guard') }, twin: { factory, def: def('twin') } }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 0, dir: 0 }], [0, { type: 'deploy', op: 'twin', row: 1, col: 1, dir: 0 }]]);
  return { w, c, b: /** @type {ShBattle} */ (box.b), seen, guard: unit(w, 'guard'), twin: unit(w, 'twin') };
}

test('[兼容-4] [部署-9] a kit\'s 【移动】 (our own kit): one unit\'s 元素损伤 and another\'s burst gone before its deploy handlers; HP, buffs and the running skill kept', () => {
  const { w, c, b, seen, guard, twin } = ours(), g = b.unitOf(guard), t = b.unitOf(twin);
  epHit(b, g, 'burn', 300);
  epHit(b, g, 'neural', 450);
  epHit(b, t, 'burn', 1000);
  buffs.addBuff(guard, buffs.makeBuff({ key: 'test:mine', mods: { atkFlat: 10 } }));
  assert.deepEqual([guard.ep, twin.ep, t.flags.burstLock, t.findBuff('burnBurst')?.key, attrs.statsOf(twin).res], [{ FIRE: 700, SANITY: 550 }, { FIRE: 0 }, true, 'burnBurst', 30]);
  const hp = [guard.hp, twin.hp];
  step(w, c, [[0, { type: 'skill', unit: guard.id }], [0, { type: 'skill', unit: twin.id }]]);
  assert.deepEqual(seen, [['guard', false, null, {}], ['twin', false, null, {}]], 'its handlers see both afresh');
  assert.deepEqual([[g.tileR, g.tileC], [t.tileR, t.tileC], [guard.hp, twin.hp], [guard.skill.active, twin.skill.active]], [[1, 2], [1, 3], hp, [true, true]]);
  assert.deepEqual([has(guard, 'test:mine'), attrs.statsOf(twin).res], [true, 50], 'its buff kept; the burst\'s −20 RES gone with the burst');
  epHit(b, t, 'burn', 200);
  assert.deepEqual(twin.ep, { FIRE: 800 }, 'no lock: 元素损伤 lands again, from the maximum');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] [部署-9] a refused 【移动】 (onto the tile another ally stands on) changes nothing: the element values and the burst stay', () => {
  const { b, guard, twin } = ours(), g = b.unitOf(guard), t = b.unitOf(twin);
  epHit(b, g, 'burn', 300);
  epHit(b, t, 'burn', 1000);
  assert.deepEqual([b.moveRedeploy(g, 1, 1), b.moveRedeploy(t, 1, 0)], [false, false], 'each onto the other\'s tile');
  assert.deepEqual([guard.ep, twin.ep, !!t.flags.burstLock, attrs.statsOf(twin).res], [{ FIRE: 700 }, { FIRE: 0 }, true, 30]);
  assert.deepEqual([[g.tileR, g.tileC], [t.tileR, t.tileC]], [[1, 0], [1, 1]]);
});

/**
 * The tiny level with a pinned kit's operator `op` (its record at buildOf(skill), a million HP, RES 50) on (1, 1) facing
 * right, two seconds in; with `slime`, a slime (a million HP) that comes along the road; no enemy otherwise.
 * @param {string} id @param {number} skill @param {boolean} [slime]
 */
function pinned(id, skill, slime = false) {
  const { factory, training } = real[id], build = buildOf(skill), c = /** @type {any} */ (tinyContent());
  Object.assign(c.level.options, { initialCost: 60, maxCost: 99, characterLimit: 4 });
  c.level.waves = slime ? [oneWave([spawnAt(0.1, 'slime')])] : [];
  c.enemies.slime.maxHp = 1e6;
  c.operators.op = { ...operatorAt(training, build), maxHp: 1e6, res: 50, respawnTime: 1 };
  c.decks = [['op']];
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  c.behaviors = kitsBehaviors({ op: { factory, def: defOf(id, training, build) } }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'op', row: 1, col: 1, dir: 0 }]]);
  for (let i = 0; i < 60; i++) step(w, c);
  const op = unit(w, 'op'), moves = /** @type {any[]} */ ([]);
  bus.on(w, 'deploy', (k) => { if (k.move) moves.push({ f: w.frame, at: [k.unit.y, k.unit.x], ep: { ...k.unit.ep }, burst: elements.bursting(k.unit) }); });
  /** Casts its skill: its SP full first. */
  const cast = () => { op.skill.sp = op.skill.cost; step(w, c, [[0, { type: 'skill', unit: op.id }]]); };
  return { w, c, b: /** @type {ShBattle} */ (box.b), op, moves, cast };
}

test('[兼容-4] [部署-9] 贝洛内\'s S3 (the pinned kit, unchanged): its 【移动】 at the cast starts his element values afresh; HP, buffs and the skill stay', () => {
  const { b, op, moves, cast } = pinned(DEMETR, 2), u = b.unitOf(op);
  epHit(b, u, 'burn', 300);
  epHit(b, u, 'apoptosis', 450);
  buffs.addBuff(op, buffs.makeBuff({ key: 'test:mine', mods: { atkFlat: 10 } }));
  assert.deepEqual(op.ep, { FIRE: 700, DARK: 550 });
  const hp = op.hp;
  cast();
  assert.deepEqual(moves.map((m) => [m.at, m.ep, m.burst]), [[[1, 1], {}, false]], 'one move, in place (no enemy near): afresh at its event');
  assert.deepEqual([op.ep, op.hp, op.skill.active, has(op, 'test:mine')], [{}, hp, true, true]);
  epHit(b, u, 'burn', 250);
  assert.deepEqual(op.ep, { FIRE: 750 });
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] [部署-9] 贝洛内\'s S3 in a burst: the move ends it — the lock, its −20 RES — and the kit sees no burstLock after', () => {
  const { b, op, moves, cast } = pinned(DEMETR, 2), u = b.unitOf(op);
  epHit(b, u, 'burn', 1000);
  assert.deepEqual([u.flags.burstLock, u.findBuff('burnBurst')?.key, attrs.statsOf(op).res, epHit(b, u, 'burn', 100)], [true, 'burnBurst', 30, 0], 'locked: no 元素损伤 lands');
  cast();
  assert.equal(moves.length, 1);
  assert.deepEqual([!!u.flags.burstLock, u.findBuff('burnBurst'), attrs.statsOf(op).res, op.ep], [false, null, 50, {}]);
  assert.equal(epHit(b, u, 'burn', 100), 100, 'unlocked');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] [部署-9] 赤刃明霄陈\'s S2 (the pinned kit, unchanged): a 侵蚀 burst still on after her slashes ends at her 【移动】 onto the slime\'s tile; its DEF cut stays', () => {
  const { w, c, b, op, moves, cast } = pinned(CHEN3, 1, true), u = b.unitOf(op), def = attrs.statsOf(op).def;
  epHit(b, u, 'erosion', 1000);
  assert.deepEqual([u.findBuff('erosionBurst')?.key, has(op, 'erosion'), attrs.statsOf(op).def], ['erosionBurst', true, def - 100]);
  const start = w.frame, bursting = /** @type {boolean[]} */ ([]);
  cast();
  for (let i = 0; i < 200 && moves.length === 0; i++) { bursting.push(elements.bursting(op)); step(w, c); }
  assert.equal(moves.length, 1, 'one move after the slashes');
  const [m] = moves;
  assert.ok(m.f - start < 300, `before the burst's 10 s run out (frame ${m.f - start})`);
  assert.deepEqual([bursting.at(-1), m.burst, m.ep, m.at], [true, false, {}, [1, 0]], 'in the burst until the move; then none, on the tile of her last target');
  assert.deepEqual([!!u.flags.burstLock, u.findBuff('erosionBurst'), has(op, 'erosion'), attrs.statsOf(op).def], [false, null, true, def - 100], 'the lock gone, 侵蚀\'s −100 DEF kept');
  assert.deepEqual(b.errors, []);
});
