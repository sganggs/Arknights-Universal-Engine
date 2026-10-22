// Buffs and statuses (docs/spec/status.md): the same-name rules, the decay rate, triggers, the status catalogue, cold
// turning into freeze, immunity. Where the catalogue's modifiers mean the same as the pinned Stronghold oracle's, they
// are its values; how buffs combine and run down follows PRTS and differs from it (DIF-0006, DIF-0008, DIF-0011,
// DIF-0012).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadOracle } from '@aue/testkit';
import { KIND, STATUS_BIT } from '@aue/schema';
import { newSchedule } from '../src/waves.js';
import { newStageState } from '../src/stage.js';
import { makeBuff, addBuff, removeBuff, tickUnitBuffs, tickBuffs, decayRate, setLeft } from '../src/buffs.js';
import { STATUS, applyStatus, statusBuff } from '../src/status.js';
import { statusBits } from '../src/view.js';
import { statsOf, activeBuffs } from '../src/attrs.js';

/** @type {any} */
let sh;
before(async () => { sh = await loadOracle('server/sim/buffs.js'); });

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */
/** @typedef {import('../src/buffs.js').Behavior} Behavior */

/** @param {number} id @param {Record<string, unknown>} [base] @param {number} [kind] @returns {Unit} */
function mk(id, base = {}, kind = KIND.ENEMY) {
  const b = /** @type {any} */ ({ maxHp: 1000, atk: 100, def: 0, res: 20, aspd: 100, bat: 1, blockCnt: 0, moveSpeed: 1, tauntLevel: 0,
    massLevel: 0, epDamageResistance: 0, epResistance: 0, motion: 'WALK', immune: [], dmgType: 'phys', ...base });
  return { id, kind, key: 'u', owner: -1, x: 0, y: 0, z: 0, dir: 'RIGHT', base: b, buffs: [], hp: b.maxHp, maxHp: b.maxHp,
    atkCd: 0, blockedBy: -1, blockedAt: -1, born: 0, bornN: id, route: -1, leg: 0, path: [], pt: 0, wait: -1, hidden: false, frag: 0, wave: -1, ab: {}, skill: null, ep: {}, paid: 0, swing: null, anim: 0 };
}
/** @param {Unit[]} units @returns {World} */
const world = (units) => ({ frame: 0, rng: 1, nextId: 9, players: [], units, sched: newSchedule(), predefined: [], result: -1, stage: newStageState(), bornThisFrame: 0, shots: [], blasts: [], bolts: [], events: [] });
/** Frames until the unit has no buff of the key, at most `max`. @param {Unit} u @param {string} key @param {Record<string, Behavior>} [beh] */
function framesUntilGone(u, key, beh = {}, max = 10000) {
  const w = world([u]);
  for (let f = 1; f <= max; f++) {
    tickUnitBuffs(w, u, beh);
    if (!u.buffs.some((b) => b.key === key)) return f;
  }
  return -1;
}

test('[状态-1] a buff holds every field, in a fixed order; triggers are whole frames', () => {
  const b = makeBuff({ key: 'k', left: 90, mods: { atkFlat: 5 } });
  assert.deepEqual(Object.keys(b), ['key', 'src', 'rule', 'value', 'left', 'every', 'fixed', 'resist', 'decay', 'prio', 'shield',
    'shieldHits', 'shieldType', 'n', 'tag', 'act', 'mods', 'flags', 'stacks', 'maxStacks', 'acc']);
  assert.equal(b.rule, 'queue');
  assert.equal(makeBuff({ key: 'n' }).left, -1, 'no end');
  assert.throws(() => makeBuff({ key: 'x', every: 1.5 }), RangeError);
  assert.throws(() => makeBuff({ key: 'x', every: -1 }), RangeError);
  const u = mk(1);
  /** @type {string[]} */
  const ran = [];
  u.buffs.push(makeBuff({ key: 'a', left: 5 }));
  assert.equal(removeBuff(u, 'a'), 1);
  assert.equal(removeBuff(u, 'a'), 0);
  tickUnitBuffs(world([u]), u, { a: { expire: () => ran.push('a') } });
  assert.deepEqual(ran, [], 'removal is not expiry');
  u.buffs.push(makeBuff({ key: 'x', act: 'shared', left: 2, every: 1 }), makeBuff({ key: 'y', act: 'shared', left: 1 }), makeBuff({ key: 'shared', left: 1 }));
  /** @type {string[]} */
  const by = [];
  const beh = { shared: { tick: (/** @type {any} */ _w, /** @type {any} */ _u, /** @type {any} */ x) => by.push(`tick ${x.key}`), expire: (/** @type {any} */ _w, /** @type {any} */ _u, /** @type {any} */ x) => by.push(`end ${x.key}`) } };
  for (let f = 0; f < 2; f++) tickUnitBuffs(world([u]), u, beh);
  assert.deepEqual(by, ['tick x', 'end y', 'end shared', 'tick x', 'end x'], 'found by the behaviour key it names, else by its key');
});

test('[状态-2] queue: the earliest takes effect; the later one waits with its time running, then takes over', () => {
  const u = mk(1);
  addBuff(u, makeBuff({ key: 'w', left: 30, mods: { atkFlat: 10 } }));
  addBuff(u, makeBuff({ key: 'w', left: 50, mods: { atkFlat: 20 } }));
  assert.equal(statsOf(u).atk, 110);
  const w = world([u]);
  for (let f = 0; f < 30; f++) tickUnitBuffs(w, u, {});
  assert.equal(statsOf(u).atk, 120, 'the second takes over');
  assert.equal(u.buffs[0].left, 20, 'its time ran while it waited (INF-0016)');
  for (let f = 0; f < 20; f++) tickUnitBuffs(w, u, {});
  assert.equal(u.buffs.length, 0);
});

test('[状态-2] 效果取最高: the strongest takes effect, the earliest of equals; the weaker resumes', () => {
  const u = mk(1);
  applyStatus(u, 'weaken', { value: 0.2, frames: 60 });
  applyStatus(u, 'weaken', { value: 0.5, frames: 30 });
  applyStatus(u, 'weaken', { value: 0.5, frames: 90 });
  assert.equal(statsOf(u).atk, 50);
  assert.deepEqual(activeBuffs(u.buffs).map((b) => b.left), [30]);
  const w = world([u]);
  for (let f = 0; f < 30; f++) tickUnitBuffs(w, u, {});
  assert.deepEqual(activeBuffs(u.buffs).map((b) => b.left), [60], 'the equal one acquired later');
  for (let f = 0; f < 60; f++) tickUnitBuffs(w, u, {});
  assert.equal(u.buffs.length, 0, 'the 0.2 one ran out while it waited');
});

test('[状态-2] stack, extend, independent', () => {
  const u = mk(1);
  addBuff(u, makeBuff({ key: 's', rule: 'stack', maxStacks: 3, left: 100, mods: { atkFlat: 1 } }));
  addBuff(u, makeBuff({ key: 's', rule: 'stack', stacks: 3, maxStacks: 3, left: 40, mods: { atkFlat: 2 } }));
  assert.deepEqual(u.buffs.map((b) => [b.stacks, b.left]), [[3, 40]], 'capped; the new time');
  assert.equal(statsOf(u).atk, 106);
  addBuff(u, makeBuff({ key: 'e', rule: 'extend', left: 50 }));
  addBuff(u, makeBuff({ key: 'e', rule: 'extend', left: 20 }));
  assert.equal(u.buffs[1].left, 50, 'the longer');
  addBuff(u, makeBuff({ key: 'e', rule: 'extend' }));
  assert.equal(u.buffs[1].left, -1, 'no end is the longest');
  for (let i = 1; i <= 3; i++) addBuff(u, makeBuff({ key: 'i', rule: 'independent', maxStacks: 2, value: i, mods: { atkFlat: 100 } }));
  assert.deepEqual(u.buffs.filter((b) => b.key === 'i').map((b) => b.value), [2, 3]);
  assert.equal(statsOf(u).atk, 306, 'every independent one counts');
});

test('[状态-3] resistible statuses run down by 1 / 一减状态抵抗率; 抵抗 halves them, from the frame it arrives (DIF-0006)', () => {
  const a = mk(1);
  applyStatus(a, 'stun', { seconds: 3 });
  assert.equal(framesUntilGone(a, 'stun'), 90);
  const b = mk(2);
  applyStatus(b, 'buffres', {});
  applyStatus(b, 'stun', { seconds: 3 });
  assert.equal(statsOf(b).statusRes, 0.5);
  assert.equal(framesUntilGone(b, 'stun'), 45);
  const c = mk(3), w = world([c]);
  applyStatus(c, 'stun', { seconds: 3 });
  for (let f = 0; f < 30; f++) tickUnitBuffs(w, c, {});
  applyStatus(c, 'buffres', {});
  assert.equal(framesUntilGone(c, 'stun'), 30, '60 frames left at rate 2');
  const d = mk(4);
  addBuff(d, makeBuff({ key: 'deep', mods: { statusResMul: 1e-9 } }));
  assert.equal(decayRate(statusBuff('stun', d, {}), statsOf(d).statusRes), 1000, 'the 0.001 floor');
  applyStatus(d, 'root', { frames: 10 });
  assert.equal(framesUntilGone(d, 'root'), 10, 'not resistible');
});

test('[状态-3] 浮空 and 缚地 on a unit heavier than 3 last half as long, by its weight when applied', () => {
  const light = mk(1, { massLevel: 3 }), heavy = mk(2, { massLevel: 4 });
  applyStatus(light, 'levitate', { frames: 60 });
  applyStatus(heavy, 'levitate', { frames: 60 });
  assert.equal(framesUntilGone(light, 'levitate'), 60);
  addBuff(heavy, makeBuff({ key: 'lighter', mods: { massFlat: -4 } }));
  assert.equal(framesUntilGone(heavy, 'levitate'), 30);
  const flyer = mk(3, { motion: 'FLY', massLevel: 5 });
  applyStatus(flyer, 'groundbind', { frames: 61 });
  assert.equal(framesUntilGone(flyer, 'groundbind'), 31);
});

test('[状态-4] triggers every k frames of progress: decay speeds them up unless fixed; several in one frame', () => {
  /** @type {number[]} */
  const at = [];
  let f = 0;
  /** @type {Record<string, Behavior>} */
  const beh = { t: { tick: () => { at.push(f); } } };
  const u = mk(1), w = world([u]);
  addBuff(u, makeBuff({ key: 't', every: 30, resist: true }));
  for (f = 1; f <= 90; f++) tickUnitBuffs(w, u, beh);
  assert.deepEqual(at, [30, 60, 90], 'the first after a full interval');
  at.length = 0;
  addBuff(u, makeBuff({ key: 'r', mods: { statusResMul: 0.5 } }));
  for (f = 1; f <= 30; f++) tickUnitBuffs(w, u, beh);
  assert.deepEqual(at, [15, 30]);
  at.length = 0;
  u.buffs[0].fixed = true;
  for (f = 1; f <= 30; f++) tickUnitBuffs(w, u, beh);
  assert.deepEqual(at, [30]);
  at.length = 0;
  const v = mk(2);
  addBuff(v, makeBuff({ key: 't', every: 1, resist: true }));
  addBuff(v, makeBuff({ key: 'r', mods: { statusResMul: 0.25 } }));
  f = 1;
  tickBuffs(world([v]), beh);
  assert.deepEqual(at, [1, 1, 1, 1]);
});

test('[状态-4] a trigger that removes its own buff stops; expiry runs after the buff left the list', () => {
  const u = mk(1), w = world([u]);
  /** @type {string[]} */
  const seen = [];
  /** @type {Record<string, Behavior>} */
  const beh = {
    once: { tick: (_w, x, b) => { seen.push('tick'); removeBuff(x, b); } },
    end: { expire: (_w, x) => { seen.push(`expire ${x.buffs.length}`); } },
  };
  addBuff(u, makeBuff({ key: 'once', every: 1, left: 100 }));
  addBuff(u, makeBuff({ key: 'end', left: 1 }));
  tickUnitBuffs(w, u, beh);
  assert.deepEqual(seen, ['tick', 'expire 0']);
});

test('[状态-5] the catalogue: what each status does to the stats', () => {
  const u = mk(1, { motion: 'WALK' });
  const s0 = statsOf(u);
  assert.ok(!s0.disabled && !s0.immobile && !s0.flying && !s0.invincible);
  /** @type {[import('../src/status.js').StatusKey, (s: ReturnType<typeof statsOf>) => boolean][]} */
  const cases = [
    ['stun', (s) => s.disabled && s.immobile], ['enemyFreeze', (s) => s.disabled && s.res === 20],
    ['freeze', (s) => s.disabled && s.res === 5], ['sleep', (s) => s.disabled && s.invincible], ['root', (s) => !s.disabled && s.immobile],
    ['sluggish', (s) => s.moveSpeed === 0.2], ['cold', (s) => s.aspd === 70], ['levitate', (s) => s.flying && s.disabled],
    ['invincible', (s) => s.invincible && !s.disabled], ['healFree', (s) => s.flags.healFree], ['silence', (s) => s.flags.silence],
  ];
  for (const [key, ok] of cases) {
    const x = mk(2);
    applyStatus(x, key, { frames: 30 });
    assert.ok(ok(statsOf(x)), key);
  }
  const g = mk(3, { motion: 'FLY' });
  applyStatus(g, 'groundbind', {});
  assert.ok(!statsOf(g).flying && statsOf(g).immobile && !statsOf(g).disabled);
  assert.throws(() => applyStatus(mk(4), 'fragile', {}), RangeError, 'a valued status needs its value');
  const p = mk(5);
  for (let i = 0; i < 5; i++) applyStatus(p, 'palsy', {});
  assert.deepEqual(p.buffs.map((b) => [b.stacks, b.left]), [[3, -1]]);
});

test('[渲染-12] [状态-5] the render state shows the statuses a unit has, an enemy freeze or cold as freeze or cold; others nothing', () => {
  const u = mk(1), enemy = mk(2);
  assert.equal(statusBits(u), 0);
  applyStatus(u, 'stun', { frames: 30 });
  applyStatus(u, 'freeze', { frames: 30, src: enemy });
  applyStatus(u, 'healFree', { frames: 30 });
  assert.equal(statusBits(u), STATUS_BIT.stun | STATUS_BIT.freeze);
  const v = mk(3);
  applyStatus(v, 'fragile', { frames: 30, value: 0.2 });
  applyStatus(v, 'levitate', { frames: 30 });
  assert.equal(statusBits(v), STATUS_BIT.fragile | STATUS_BIT.levitate);
});

test('[状态-5] modifiers that mean the same as the oracle\'s catalogue are its values', () => {
  /** @param {any} t @param {number} [v] */
  const mods = (t, v) => (typeof t.mods === 'function' ? t.mods(v) : t.mods);
  assert.deepEqual(STATUS.cold.mods(0), mods(sh.STATUS.cold));
  assert.deepEqual(STATUS.freeze.mods(0), mods(sh.STATUS.freeze));
  assert.deepEqual(STATUS.sluggish.mods(0), mods(sh.STATUS.sluggish));
  for (const v of [0.1, 0.25, 0.65]) {
    assert.deepEqual(STATUS.weaken.mods(v), mods(sh.STATUS.weaken, v));
    assert.deepEqual(STATUS.fragile.mods(v), mods(sh.STATUS.fragile, v));
    assert.deepEqual(STATUS.artsFragile.mods(v), mods(sh.STATUS.artsFragile, v));
    assert.deepEqual(STATUS.elemFragile.mods(v), mods(sh.STATUS.elemFragile, v));
  }
  assert.equal(STATUS.buffres.value, 0.5, '抵抗: 一减状态抵抗率 × 0.5 by default');
});

test('[状态-6] a friendly cold on a friendly cold: a friendly freeze for the longer of the two; enemy colds stack into an enemy freeze', () => {
  const op = mk(9, {}, KIND.OPERATOR), foe = mk(8);
  const a = mk(1);
  applyStatus(a, 'cold', { src: op, frames: 90 });
  applyStatus(a, 'cold', { src: op, frames: 40 });
  assert.deepEqual(a.buffs.map((b) => [b.key, b.left]), [['freeze', 90]]);
  assert.equal(statsOf(a).res, 5, 'the friendly freeze: 法术抗性 −15');
  const b = mk(2, {}, KIND.OPERATOR);
  applyStatus(b, 'cold', { src: foe, frames: 90 });
  assert.equal(b.buffs[0].key, 'enemyCold');
  applyStatus(b, 'cold', { src: foe, frames: 40 });
  assert.deepEqual(b.buffs.map((x) => [x.key, x.left]), [['enemyCold', 90], ['enemyFreeze', 40]], 'INF-0018');
  applyStatus(b, 'cold', { src: foe, frames: 50 });
  assert.deepEqual(b.buffs.map((x) => x.key), ['enemyCold', 'enemyFreeze', 'enemyFreeze']);
  assert.equal(statsOf(b).res, 20, 'no 法抗 cut from an enemy freeze');
  const c = mk(3, { immune: ['freeze'] });
  applyStatus(c, 'cold', { src: op, frames: 30 });
  applyStatus(c, 'cold', { src: op, frames: 30 });
  assert.deepEqual(c.buffs.map((x) => x.key), ['cold', 'cold'], 'never a freeze');
  const d = mk(4);
  applyStatus(d, 'cold', { src: op });
  applyStatus(d, 'cold', { src: op, frames: 10 });
  assert.equal(d.buffs[0].left, -1, 'no end is the longer');
});

test('[状态-7] immunity: the buff stays, its flag does not take effect; refusals add nothing', () => {
  const u = mk(1, { immune: ['stun'] });
  assert.ok(applyStatus(u, 'stun', { frames: 30 }));
  assert.equal(u.buffs.length, 1);
  assert.ok(!statsOf(u).disabled);
  u.base.immune = [];
  assert.ok(statsOf(u).disabled, 'it takes effect once the immunity ends');
  assert.equal(applyStatus(mk(2, { motion: 'FLY' }), 'levitate', {}), null);
  assert.equal(applyStatus(mk(3), 'groundbind', {}), null);
  assert.equal(applyStatus(mk(4, {}, KIND.OPERATOR), 'fear', {}), null);
  const e = mk(5);
  assert.ok(applyStatus(e, 'fear', { frames: 3 }));
  assert.equal(applyStatus(e, 'stun', { frames: 0 }), null);
  assert.equal(e.buffs.length, 1);
});

test('[状态-6] [状态-1] freeze from an enemy is the enemy kind; the buff records who gave it', () => {
  const foe = mk(8), op = mk(9, {}, KIND.OPERATOR), u = mk(1, {}, KIND.OPERATOR);
  const b = applyStatus(u, 'freeze', { src: foe, frames: 30 });
  assert.equal(b?.key, 'enemyFreeze');
  assert.equal(b?.src, 8);
  assert.equal(applyStatus(u, 'stun', { src: op, seconds: 1 })?.src, 9);
  assert.equal(applyStatus(u, 'silence', {})?.src, -1);
});


test('[状态-1] content may set the frames a buff has left: whole frames, −1 for no end', () => {
  const b = makeBuff({ key: 'x', left: 30 });
  setLeft(b, 12.4);
  assert.equal(b.left, 12);
  setLeft(b, -3);
  assert.equal(b.left, -1);
  setLeft(b, 0);
  assert.equal(b.left, 0);
});
