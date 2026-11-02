// 寒冷免疫, and 冻结免疫 given by a buff (docs/spec/status.md 状态-5…状态-7): both colds carry 寒冷's flag `cold`; on a
// unit immune to it — by its data or a buff's flag `immune:cold` — a cold stays with its time running and its −30 does not
// count. A unit immune to freezing by a buff is as one immune by its data: colds on it stay colds (INF-1150…INF-1153).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { KIND } from '@aue/schema';
import { tinyContent } from '@aue/testkit';
import { newSchedule } from '../src/waves.js';
import { newStageState } from '../src/stage.js';
import { makeBuff, addBuff, removeBuff, tickUnitBuffs } from '../src/buffs.js';
import { applyStatus, inflict } from '../src/status.js';
import { statsOf, computeStats, maxHpOf } from '../src/attrs.js';
import { makeBall } from '../src/ball.js';
import { createWorld, step } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { auras } from '../src/aura.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/** @param {number} id @param {Record<string, unknown>} [base] @param {number} [kind] @returns {Unit} */
function mk(id, base = {}, kind = KIND.ENEMY) {
  const b = /** @type {any} */ ({ maxHp: 1000, atk: 100, def: 0, res: 20, aspd: 100, bat: 1, blockCnt: 0, moveSpeed: 1, tauntLevel: 0,
    massLevel: 0, epDamageResistance: 0, epResistance: 0, motion: 'WALK', immune: [], dmgType: 'phys', ...base });
  return { id, kind, key: 'u', owner: -1, x: 0, y: 0, z: 0, dir: 'RIGHT', base: b, buffs: [], hp: b.maxHp, maxHp: b.maxHp,
    atkCd: 0, blockedBy: -1, blockedAt: -1, born: 0, bornN: id, route: -1, leg: 0, path: [], pt: 0, wait: -1, hidden: false, frag: 0, wave: -1, ab: {}, skill: null, ep: {}, paid: 0, swing: null, anim: 0 };
}
/** @param {Unit[]} units @returns {World} */
const world = (units) => /** @type {World} */ (/** @type {unknown} */ ({ frame: 0, rng: 1, nextId: 9, players: [], units, sched: newSchedule(), predefined: [],
  result: -1, stage: newStageState(), bornThisFrame: 0, shots: [], blasts: [], bolts: [], events: [] }));
/** A buff that makes its holder immune to a flag, lasting `left` frames (−1: no end). @param {string} flag @param {number} [left] */
const immunity = (flag, left = -1) => makeBuff({ key: `no:${flag}`, left, flags: { [`immune:${flag}`]: true } });
/** The unit's buffs but its immunity buffs, as [key, frames left]. @param {Unit} u */
const held = (u) => u.buffs.filter((b) => !b.key.startsWith('no:')).map((b) => [b.key, b.left]);
/** The frames left on the unit's first buff of a key. @param {Unit} u @param {string} key */
const leftOf = (u, key) => u.buffs.find((b) => b.key === key)?.left;

test('[状态-5] [状态-7] both colds carry 寒冷\'s flag; immune to it by its data or a buff flag, the cold stays and its −30 does not count (INF-1150)', () => {
  const op = mk(9, {}, KIND.OPERATOR), foe = mk(8);
  for (const aspd of [100, 137]) {
    const plain = mk(1, { aspd }), opPlain = mk(2, { aspd }, KIND.OPERATOR);
    applyStatus(plain, 'cold', { src: op, frames: 90 });
    applyStatus(opPlain, 'cold', { src: foe, frames: 90 });
    for (const [u, key] of /** @type {[Unit, string][]} */ ([[plain, 'cold'], [opPlain, 'enemyCold']])) {
      assert.deepEqual([u.buffs[0].key, u.buffs[0].flags.cold, statsOf(u).aspd, statsOf(u).flags.cold], [key, true, aspd - 30, true], key);
    }
    const byData = mk(3, { aspd, immune: ['cold'] }), byBuff = mk(4, { aspd }), opByBuff = mk(5, { aspd }, KIND.OPERATOR);
    addBuff(byBuff, immunity('cold'));
    addBuff(opByBuff, immunity('cold'));
    applyStatus(byData, 'cold', { src: op, frames: 90 });
    applyStatus(byBuff, 'cold', { src: op, frames: 90 });
    applyStatus(opByBuff, 'cold', { src: foe, frames: 90 });
    for (const [u, key] of /** @type {[Unit, string][]} */ ([[byData, 'cold'], [byBuff, 'cold'], [opByBuff, 'enemyCold']])) {
      assert.deepEqual([held(u), statsOf(u).aspd, statsOf(u).flags.cold], [[[key, 90]], aspd, undefined], `${key} held off at ${aspd}`);
    }
  }
});

test('[状态-7] a cold given before the immunity is held off from then on, its time running; when the immunity ends its −30 is back', () => {
  const op = mk(9, {}, KIND.OPERATOR), u = mk(1, { aspd: 110 }), w = world([u]);
  applyStatus(u, 'cold', { src: op, frames: 75 });
  for (let f = 0; f < 20; f++) tickUnitBuffs(w, u, {});
  assert.equal(statsOf(u).aspd, 80);
  addBuff(u, immunity('cold', 33));
  assert.deepEqual([statsOf(u).aspd, statsOf(u).flags.cold, leftOf(u, 'cold')], [110, undefined, 55], 'held off at once');
  for (let f = 0; f < 32; f++) tickUnitBuffs(w, u, {});
  assert.deepEqual([statsOf(u).aspd, leftOf(u, 'cold')], [110, 23], 'its time ran while held off');
  tickUnitBuffs(w, u, {});
  assert.deepEqual([held(u), u.buffs.length, statsOf(u).aspd, statsOf(u).flags.cold], [[['cold', 22]], 1, 80, true], 'the immunity ran out: it slows again');
  for (let f = 0; f < 22; f++) tickUnitBuffs(w, u, {});
  assert.deepEqual([u.buffs.length, statsOf(u).aspd], [0, 110]);
  const v = mk(2, { immune: ['cold'] });
  applyStatus(v, 'cold', { src: op, frames: 30 });
  assert.equal(statsOf(v).aspd, 100);
  v.base.immune = [];
  assert.deepEqual([statsOf(v).aspd, statsOf(v).flags.cold], [70, true], 'an immunity of its data taken away');
  v.base.immune = ['cold'];
  assert.equal(statsOf(v).aspd, 100, 'and given back');
});

test('[状态-6] [状态-7] immune to freezing by a buff flag as by its data: two colds stay colds, friendly and enemy ones; without it they freeze', () => {
  const op = mk(9, {}, KIND.OPERATOR), foe = mk(8);
  const byData = mk(1, { immune: ['freeze'] }), byBuff = mk(2), bare = mk(3);
  addBuff(byBuff, immunity('freeze'));
  for (const u of [byData, byBuff, bare]) for (const n of [60, 45]) applyStatus(u, 'cold', { src: op, frames: n });
  assert.deepEqual([held(byData), held(byBuff), held(bare)], [[['cold', 60], ['cold', 45]], [['cold', 60], ['cold', 45]], [['freeze', 60]]]);
  assert.deepEqual([statsOf(byBuff).disabled, statsOf(byBuff).res, statsOf(bare).disabled, statsOf(bare).res], [false, 20, true, 5], 'no freeze, no 法抗 cut');
  const opData = mk(4, { immune: ['freeze'] }, KIND.OPERATOR), opBuff = mk(5, {}, KIND.OPERATOR), opBare = mk(6, {}, KIND.OPERATOR);
  addBuff(opBuff, immunity('freeze'));
  for (const u of [opData, opBuff, opBare]) for (const n of [50, 40, 35]) applyStatus(u, 'cold', { src: foe, frames: n });
  const colds = [['enemyCold', 50], ['enemyCold', 40], ['enemyCold', 35]];
  assert.deepEqual([held(opData), held(opBuff), held(opBare)], [colds, colds, [['enemyCold', 50], ['enemyFreeze', 40], ['enemyFreeze', 35]]]);
});

test('[状态-6] the immunity to freezing ends with colds held: they stay colds; the next cold pairs as 状态-6 says (INF-1151)', () => {
  const op = mk(9, {}, KIND.OPERATOR), foe = mk(8), u = mk(1);
  applyStatus(u, 'cold', { src: op, frames: 70 });
  addBuff(u, immunity('freeze'));
  applyStatus(u, 'cold', { src: op, frames: 85 });
  assert.deepEqual(held(u), [['cold', 70], ['cold', 85]], 'a cold given before the immunity does not pair with one given during it');
  removeBuff(u, 'no:freeze');
  assert.deepEqual([held(u), statsOf(u).disabled], [[['cold', 70], ['cold', 85]], false], 'no freeze when it ends');
  applyStatus(u, 'cold', { src: op, frames: 40 });
  assert.deepEqual([held(u), statsOf(u).disabled], [[['cold', 85], ['freeze', 70]], true], 'the earliest cold and the new one: the longer of the two');
  const t = mk(2, {}, KIND.OPERATOR);
  addBuff(t, immunity('freeze'));
  for (const n of [70, 85]) applyStatus(t, 'cold', { src: foe, frames: n });
  removeBuff(t, 'no:freeze');
  assert.deepEqual(held(t), [['enemyCold', 70], ['enemyCold', 85]]);
  applyStatus(t, 'cold', { src: foe, frames: 40 });
  assert.deepEqual([held(t), statsOf(t).disabled], [[['enemyCold', 70], ['enemyCold', 85], ['enemyFreeze', 40]], true]);
});

test('[状态-6] [状态-7] immune to 寒冷 but not to freezing: two colds still freeze it (INF-1152)', () => {
  const op = mk(9, {}, KIND.OPERATOR), byData = mk(1, { immune: ['cold'] }), byBuff = mk(2);
  addBuff(byBuff, immunity('cold'));
  for (const u of [byData, byBuff]) {
    applyStatus(u, 'cold', { src: op, frames: 30 });
    assert.equal(statsOf(u).aspd, 100);
    applyStatus(u, 'cold', { src: op, frames: 55 });
    assert.deepEqual([held(u), statsOf(u).disabled, statsOf(u).res], [[['freeze', 55]], true, 5]);
  }
});

test('[状态-7] [状态-2] only a buff that takes effect gives the immunity; a held-off cold\'s other flags still take effect', () => {
  const op = mk(9, {}, KIND.OPERATOR), u = mk(1, { aspd: 120 });
  // Two buffs of one key: only the first takes effect (状态-2), so the immunities of the second give nothing yet.
  addBuff(u, makeBuff({ key: 'no:shell' }));
  addBuff(u, makeBuff({ key: 'no:shell', flags: { 'immune:cold': true, 'immune:freeze': true } }));
  applyStatus(u, 'cold', { src: op, frames: 50 });
  assert.deepEqual([statsOf(u).aspd, statsOf(u).flags.cold], [90, true], 'no 寒冷 immunity from the waiting buff');
  applyStatus(u, 'cold', { src: op, frames: 40 });
  assert.deepEqual([held(u), statsOf(u).disabled], [[['freeze', 50]], true], 'no 冻结 immunity either: the pair freezes');
  removeBuff(u, u.buffs[0]);
  for (const n of [30, 20]) applyStatus(u, 'cold', { src: op, frames: n });
  assert.deepEqual([held(u), statsOf(u).disabled, statsOf(u).aspd], [[['freeze', 50], ['cold', 30], ['cold', 20]], false, 120], 'once it takes effect, both');
  const v = mk(2, { aspd: 120, immune: ['cold'] });
  addBuff(v, makeBuff({ key: 'odd', flags: { cold: true, root: true }, mods: { aspd: -10 } }));
  assert.deepEqual([statsOf(v).aspd, statsOf(v).flags.cold, statsOf(v).flags.root, statsOf(v).immobile], [120, undefined, true, true], 'only 寒冷\'s flag and the modifiers are left out');
});

test('[状态-7] a freeze held while immune to freezing: its flag waits, the friendly freeze\'s 法术抗性 −15 counts (INF-1153); it takes hold when the immunity ends', () => {
  for (const res of [20, 33]) {
    const byBuff = mk(1, { res }), byData = mk(2, { res, immune: ['freeze'] });
    addBuff(byBuff, immunity('freeze'));
    applyStatus(byBuff, 'freeze', { frames: 60 });
    applyStatus(byData, 'freeze', { frames: 60 });
    for (const u of [byBuff, byData]) assert.deepEqual([held(u), statsOf(u).flags.freeze, statsOf(u).disabled, statsOf(u).res], [[['freeze', 60]], undefined, false, res - 15]);
    removeBuff(byBuff, 'no:freeze');
    byData.base.immune = [];
    for (const u of [byBuff, byData]) assert.deepEqual([statsOf(u).flags.freeze, statsOf(u).disabled, statsOf(u).res], [true, true, res - 15]);
  }
});

test('[足球-2] [状态-7] the ball: 寒冷 does not slow it, two colds do not freeze it; a battle\'s cold too', () => {
  const op = mk(9, {}, KIND.OPERATOR), ball = mk(1), w = world([ball, op]);
  makeBall(ball, { friction: 0.7, restitution: 0.75, force: 450, need: 2300, block: 0, points: 1 });
  applyStatus(ball, 'cold', { src: op, frames: 60 });
  inflict(w, ball, 'cold', { src: op, seconds: 2 });
  assert.deepEqual([held(ball), statsOf(ball).aspd, statsOf(ball).flags.cold, statsOf(ball).disabled], [[['ball', -1], ['cold', 60], ['cold', 60]], 100, undefined, false]);
});

test('[部署-6] [状态-7] coldOnly: an enemy holding a cold it is immune to, by its data or a buff, is not cold; a frozen one is not either', () => {
  const c = tinyContent();
  c.level.waves = [];
  Object.assign(c.operators.guard, { range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
    rangeTalents: [{ side: 'enemy', ranged: false, when: { when: 'coldOnly' }, mods: { artsTakenMul: 1.27 } }] });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  /** @param {number} col @param {string[]} immune */
  const foe = (col, immune) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = 1;
    e.base = { ...e.base, immune };
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  const [plain, byData, byBuff, frozen] = [foe(2, []), foe(2, ['cold']), foe(3, []), foe(3, [])];
  addBuff(byBuff, immunity('cold'));
  for (const e of [plain, byData, byBuff, frozen]) inflict(w, e, 'cold', { src: g, seconds: 9 });
  applyStatus(frozen, 'freeze', { seconds: 9 });
  assert.deepEqual(held(frozen).map(([k]) => k), ['root', 'cold', 'freeze']);
  auras(w, c);
  const marked = (/** @type {Unit} */ e) => e.buffs.some((b) => b.key === `range:${g.id}:0`);
  assert.deepEqual([plain, byData, byBuff, frozen].map(marked), [true, false, false, false]);
  removeBuff(byBuff, 'no:cold');
  auras(w, c);
  assert.equal(marked(byBuff), true, 'cold once the immunity ends');
});

/** What each random change does to a unit (a buff picked by index among those it has). @type {Record<string, (x: any, o: any, b: any) => void>} */
const CHANGE = {
  add: (x, o) => { x.buffs.push(makeBuff({ key: o.key, rule: o.rule, mods: { [o.k]: o.v } })); },
  flag: (_x, o, b) => { if (b) b.flags[o.k] = o.on; },
  immune: (x, o) => { x.base.immune = o.on ? ['cold'] : []; },
  drop: (x, _o, b) => { if (b) x.buffs.splice(x.buffs.indexOf(b), 1); },
};

test('[属性-1] [状态-7] statsOf and maxHpOf leave out a held-off cold\'s modifiers alike, to the bit', () => {
  const u = /** @type {any} */ ({ base: { maxHp: 1000, aspd: 100, immune: [] }, buffs: [makeBuff({ key: 'odd', flags: { cold: true }, mods: { hpPct: 0.5, aspd: -10 } })] });
  assert.deepEqual([maxHpOf(u), statsOf(u).maxHp, statsOf(u).aspd], [1500, 1500, 90]);
  u.base.immune = ['cold'];
  assert.deepEqual([maxHpOf(u), statsOf(u).maxHp, statsOf(u).aspd, statsOf(u).sum.hpPct], [1000, 1000, 100, undefined]);
  u.buffs[0].flags.cold = false;
  assert.deepEqual([maxHpOf(u), statsOf(u).maxHp, statsOf(u).aspd], [1500, 1500, 90], 'a flag set to false is no flag');
  u.buffs[0].flags.cold = true;
  u.base.immune = [];
  u.buffs.push(makeBuff({ key: 'warm', flags: { 'immune:cold': false } }));
  assert.deepEqual([maxHpOf(u), statsOf(u).maxHp, statsOf(u).aspd], [1500, 1500, 90], 'nor is an immunity set to false');
  const mod = fc.constantFrom('hpFlat', 'hpPct', 'hpMul', 'aspd', 'atkFlat');
  const op = fc.oneof(
    fc.record({ t: fc.constant('add'), key: fc.constantFrom('a', 'b'), rule: fc.constantFrom('queue', 'independent'), k: mod, v: fc.double({ min: -1, max: 2, noNaN: true }) }),
    fc.record({ t: fc.constant('flag'), i: fc.nat(5), k: fc.constantFrom('cold', 'immune:cold', 'stun'), on: fc.boolean() }),
    fc.record({ t: fc.constant('immune'), on: fc.boolean() }), fc.record({ t: fc.constant('drop'), i: fc.nat(5) }),
  );
  fc.assert(fc.property(fc.array(op, { maxLength: 24 }), (ops) => {
    const x = /** @type {any} */ ({ base: { maxHp: 1000, aspd: 100, immune: [] }, buffs: [] });
    for (const o of /** @type {any[]} */ (ops)) {
      CHANGE[o.t](x, o, x.buffs.length ? x.buffs[(o.i ?? 0) % x.buffs.length] : null);
      assert.ok(Object.is(maxHpOf(x), computeStats(x).maxHp));
      assert.deepStrictEqual(statsOf(x), computeStats(x));
    }
  }), { seed: 20261103, numRuns: 300 });
});
