// Damage and healing (docs/spec/damage.md). The formulas equal the pinned Stronghold oracle's `mitigate` bit for bit
// whenever a hit has at most one kind of penetration; with both kinds the official order differs (DIF-0004). The
// resolution order, the 伤判 effects one buff at a time, 生命流失 and healing are checked on hand-made units.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { loadOracle } from '@aue/testkit';
import { mitigate, penetration, dealtMul, takenMul, takeDamage, dealDamage, heal, setShield, setHp } from '../src/damage.js';
import { makeBuff } from '../src/buffs.js';
import { applyStatus } from '../src/status.js';
import { seedState } from '../src/rng.js';
import { newSchedule } from '../src/waves.js';
import { newStageState } from '../src/stage.js';

const SEED = 20261011;
/** @type {any} */
let sh;
before(async () => { sh = await loadOracle('server/sim/damage.js'); });

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

const NO_PEN = Object.freeze({ defIgnorePct: 0, defIgnoreFlat: 0, resIgnorePct: 0, resIgnoreFlat: 0 });

/** A unit for the damage step. @param {number} id @param {Record<string, unknown>} [base] @returns {Unit} */
function mk(id, base = {}) {
  const b = /** @type {any} */ ({ maxHp: 1000, atk: 100, def: 0, res: 0, aspd: 100, bat: 1, blockCnt: 0, moveSpeed: 1, tauntLevel: 0,
    massLevel: 0, epDamageResistance: 0, epResistance: 0, motion: 'WALK', immune: [], dmgType: 'phys', ...base });
  return { id, kind: 1, key: 'u', owner: -1, x: 0, y: 0, z: 0, dir: 'RIGHT', base: b, buffs: [], hp: b.maxHp, maxHp: b.maxHp,
    atkCd: 0, blockedBy: -1, blockedAt: -1, born: 0, bornN: id, route: -1, leg: 0, path: [], pt: 0, wait: -1, hidden: false, frag: 0, wave: -1, ab: {}, skill: null, ep: {}, paid: 0, swing: null, anim: 0 };
}
/** @param {number} [seed] @returns {World} */
const world = (seed = 1) => ({ frame: 0, rng: seedState(seed), nextId: 9, players: [], units: [], sched: newSchedule(), predefined: [], result: -1, stage: newStageState(), bornThisFrame: 0, shots: [], blasts: [], bolts: [], events: [] });

const amount = fc.double({ min: 0, max: 1e5, noNaN: true });
const defence = fc.double({ min: 0, max: 5000, noNaN: true });
const res = fc.double({ min: 0, max: 100, noNaN: true });
const pct = fc.double({ min: 0, max: 1, noNaN: true });

test('[伤害-1] [伤害-2] [伤害-3] [伤害-5] one kind of penetration: the oracle\'s mitigate, bit for bit', () => {
  const pen = fc.oneof(
    fc.record({ pct, flat: fc.constant(0) }),
    fc.record({ pct: fc.constant(0), flat: fc.double({ min: 0, max: 3000, noNaN: true }) }),
  );
  fc.assert(fc.property(amount, defence, res, pen, (a, d, r, p) => {
    const ours = { defIgnorePct: p.pct, defIgnoreFlat: p.flat, resIgnorePct: p.pct, resIgnoreFlat: p.flat };
    const t = { def: d, res: r, epDamageResistance: r };
    assert.ok(Object.is(mitigate(a, 'phys', t, ours), sh.mitigate(a, 'phys', t, ours)));
    assert.ok(Object.is(mitigate(a, 'arts', t, ours), sh.mitigate(a, 'arts', t, ours)));
    assert.ok(Object.is(mitigate(a, 'elemental', t, NO_PEN), sh.mitigate(a, 'elemental', t, { elementalRes: r })));
    assert.ok(Object.is(mitigate(a, 'true', t, ours), sh.mitigate(a, 'true', t, ours)));
  }), { seed: SEED, numRuns: 500 });
});

test('[伤害-1] [伤害-3] both kinds of penetration: the fixed value first, then the ratio (DIF-0004)', () => {
  const pen = { defIgnorePct: 0.5, defIgnoreFlat: 50, resIgnorePct: 0.5, resIgnoreFlat: 20 }, t = { def: 100, res: 60, epDamageResistance: 0 };
  assert.equal(mitigate(200, 'phys', t, pen), 200 - 0.5 * 50);
  assert.equal(sh.mitigate(200, 'phys', t, pen), 200, 'the oracle: max(0, 100 × 0.5 − 50) = 0 defence left');
  assert.equal(mitigate(1000, 'arts', t, pen), 1000 * (1 - 20 / 100));
  assert.equal(sh.mitigate(1000, 'arts', t, pen), 1000 * (1 - 10 / 100));
});

test('[伤害-2] never below 5 % of A; not rising with defence; not falling with penetration (invariants)', () => {
  fc.assert(fc.property(amount, defence, defence, pct, (a, d1, d2, p) => {
    const t = (/** @type {number} */ d) => ({ def: d, res: Math.min(100, d / 50), epDamageResistance: Math.min(100, d / 50) });
    for (const type of /** @type {const} */ (['phys', 'arts', 'elemental'])) {
      const lo = mitigate(a, type, t(Math.max(d1, d2)), NO_PEN), hi = mitigate(a, type, t(Math.min(d1, d2)), NO_PEN);
      assert.ok(lo >= 0.05 * a && lo <= hi, `${type} ${a} ${d1} ${d2}`);
      const pen = { ...NO_PEN, defIgnorePct: p, resIgnorePct: p };
      assert.ok(mitigate(a, type, t(d1), pen) >= mitigate(a, type, t(d1), NO_PEN));
    }
  }), { seed: SEED, numRuns: 300 });
  assert.equal(mitigate(100, 'phys', { def: 300, res: 0, epDamageResistance: 0 }, NO_PEN), 5);
});

test('[伤害-4] true damage ignores defences; [数值-7] arts damage at 0 resistance is exactly A', () => {
  assert.equal(mitigate(123.5, 'true', { def: 1e4, res: 100, epDamageResistance: 100 }, NO_PEN), 123.5);
  fc.assert(fc.property(amount, (a) => mitigate(a, 'arts', { def: 0, res: 0, epDamageResistance: 0 }, NO_PEN) === a), { seed: SEED });
});

test('[伤害-1] penetration: the source\'s plus the hit\'s, ratios held to [0, 1], fixed values to ≥ 0', () => {
  const s = /** @type {any} */ ({ defIgnorePct: 0.7, defIgnoreFlat: -30, resIgnorePct: 0.2, resIgnoreFlat: 10 });
  assert.deepEqual(penetration(s, { defIgnorePct: 0.6, resIgnoreFlat: 5 }), { defIgnorePct: 1, defIgnoreFlat: 0, resIgnorePct: 0.2, resIgnoreFlat: 15 });
  assert.deepEqual(penetration(null), NO_PEN);
});

test('[伤害-6] [伤害-7] a hit: defences, then the source\'s multiplier, then the target\'s 伤判, then the HP', () => {
  const w = world(), src = mk(1, { atk: 300 }), t = mk(2, { def: 100 });
  src.buffs.push(makeBuff({ key: 'up', mods: { dmgDealtMul: 1.5, physDealtMul: 2 } }));
  t.buffs.push(makeBuff({ key: 'fragile', rule: 'max', value: 0.25, mods: { dmgTakenMul: 1.25 } }));
  const dealt = dealDamage(w, src, t, { type: 'phys', amount: 300 });
  assert.equal(dealt, (300 - 100) * 3 * 1.25);
  assert.equal(t.hp, 1000 - 750);
  assert.deepEqual(w.events, [{ type: 'hit', id: 1, target: 2, damage: 750 }]);
  assert.equal(dealtMul(/** @type {any} */ ({ dmgDealtMul: 2, physDealtMul: 3, artsDealtMul: 5 }), 'true'), 2);
  const none = dealDamage(w, null, t, { type: 'arts', amount: 100 });
  assert.equal(none, 125, 'no source: no source multiplier; 脆弱 covers arts');
  assert.equal(w.events[1].id, -1);
});

test('[伤害-7] nothing to a unit at 0 HP or invincible (无敌, 沉睡), and no random draw for it', () => {
  const w = world(), t = mk(2);
  t.hp = 0;
  assert.equal(dealDamage(w, null, t, { type: 'true', amount: 50 }), 0);
  const u = mk(3);
  u.buffs.push(makeBuff({ key: 'dodge', mods: { dodgePhys: 0.5 } }));
  applyStatus(u, 'sleep', { frames: 30 });
  const rng = w.rng;
  assert.equal(dealDamage(w, null, u, { type: 'phys', amount: 50 }), 0);
  assert.equal(w.rng, rng);
  assert.equal(u.hp, 1000);
  assert.equal(w.events.length, 0);
});

test('[伤害-7] [状态-5] a hit that goes through 沉睡 hurts a sleeping unit; 无敌 still stops it', () => {
  const w = world(), u = mk(3), v = mk(4);
  applyStatus(u, 'sleep', { frames: 30 });
  assert.equal(dealDamage(w, null, u, { type: 'true', amount: 50, throughSleep: true }), 50);
  assert.equal(dealDamage(w, null, u, { type: 'true', amount: 50 }), 0, 'a plain hit does not');
  applyStatus(v, 'sleep', { frames: 30 });
  applyStatus(v, 'invincible', { frames: 30 });
  assert.equal(dealDamage(w, null, v, { type: 'true', amount: 50, throughSleep: true }), 0);
});

test('[伤害-8] 伤判 in acquisition order: a barrier before 脆弱 absorbs first; after it, the raised damage (DIF-0007)', () => {
  const a = mk(1), b = mk(2);
  const barrier = () => makeBuff({ key: 'barrier', shield: 100 }), fragile = () => makeBuff({ key: 'fragile', rule: 'max', value: 0.5, mods: { dmgTakenMul: 1.5 } });
  a.buffs.push(barrier(), fragile());
  b.buffs.push(fragile(), barrier());
  assert.equal(takeDamage(world(), a, 300, { type: 'phys', amount: 300 }), (300 - 100) * 1.5);
  assert.equal(takeDamage(world(), b, 300, { type: 'phys', amount: 300 }), 300 * 1.5 - 100);
  assert.equal(a.buffs.length, 1, 'a used-up barrier that is only a barrier goes');
  const c = mk(3);
  c.buffs.push(fragile(), makeBuff({ key: 'late', prio: 5, shield: 100 }));
  assert.equal(takeDamage(world(), c, 300, { type: 'phys', amount: 300 }), (300 - 100) * 1.5, 'a higher event priority goes first');
});

test('[伤害-8] shields: a layer stops a whole hit; barriers absorb; types; a stop ends the step', () => {
  const u = mk(1), w = world();
  u.buffs.push(makeBuff({ key: 'shield', shieldHits: 2, shieldType: 'arts' }), makeBuff({ key: 'barrier', shield: 50, mods: { defFlat: 0 } }));
  assert.equal(takeDamage(w, u, 80, { type: 'phys', amount: 80 }), 30, 'the arts shield lets physical damage through to the barrier');
  assert.equal(u.buffs[1].shield, 0);
  assert.equal(u.buffs.length, 2, 'a barrier buff with modifiers stays');
  assert.equal(takeDamage(w, u, 500, { type: 'arts', amount: 500 }), 0);
  assert.equal(u.buffs[0].shieldHits, 1);
  assert.equal(takeDamage(w, u, 500, { type: 'arts', amount: 500 }), 0);
  assert.equal(u.buffs.length, 1, 'the last layer used, the shield goes');
});

test('[伤害-8] taken multipliers by type and stacks: 脆弱 skips elemental damage', () => {
  const b = makeBuff({ key: 'x', stacks: 2, maxStacks: 3, mods: { dmgTakenMul: 1.5, artsTakenMul: 2, elementalTakenMul: 3 } });
  assert.equal(takenMul(b, 'phys'), 2.25);
  assert.equal(takenMul(b, 'arts'), 9);
  assert.equal(takenMul(b, 'true'), 2.25);
  assert.equal(takenMul(b, 'elemental'), 9);
  assert.equal(takenMul(makeBuff({ key: 'y', mods: { trueTakenMul: 2 } }), 'true'), 2);
});

test('[伤害-8] dodge: a draw only when the chance is above 0 and the hit can be dodged; about p of hits miss', () => {
  const u = mk(1), w = world(SEED);
  u.base.maxHp = 1e9;
  u.hp = 1e9;
  u.buffs.push(makeBuff({ key: 'dodge', mods: { dodgePhys: 0.5, dodgeArts: 0 } }));
  const r0 = w.rng;
  dealDamage(w, null, u, { type: 'arts', amount: 10 });
  dealDamage(w, null, u, { type: 'phys', amount: 10, canDodge: false });
  dealDamage(w, null, u, { type: 'true', amount: 10 });
  assert.equal(w.rng, r0, 'no draws');
  let hits = 0;
  for (let i = 0; i < 2000; i++) if (dealDamage(w, null, u, { type: 'phys', amount: 10 }) > 0) hits++;
  assert.ok(hits > 900 && hits < 1100, `${hits} of 2000`);
  const v = mk(2), two = world(SEED);
  v.buffs.push(makeBuff({ key: 'd2', stacks: 2, maxStacks: 2, mods: { dodgePhys: 0.5 } }));
  let h2 = 0;
  for (let i = 0; i < 2000; i++) if (takeDamage(two, v, 10, { type: 'phys', amount: 10 }) > 0) h2++;
  assert.ok(h2 > 420 && h2 < 580, `two stacks miss 1 − 0.5² = 75 %: ${h2} of 2000 hit`);
});

test('[伤害-9] HP goes to 0, not below; damage is not rounded', () => {
  const w = world(), t = mk(1, { maxHp: 100 });
  assert.equal(dealDamage(w, null, t, { type: 'true', amount: 33.3 }), 33.3);
  assert.equal(t.hp, 100 - 33.3);
  dealDamage(w, null, t, { type: 'true', amount: 500 });
  assert.equal(t.hp, 0);
  assert.equal(dealDamage(w, null, t, { type: 'true', amount: 5 }), 0);
});

test('[伤害-10] 生命流失 skips defences, 伤判 and invincibility', () => {
  const w = world(), t = mk(1, { def: 900 });
  t.buffs.push(makeBuff({ key: 'shield', shieldHits: 3 }), makeBuff({ key: 'fragile', rule: 'max', value: 1, mods: { dmgTakenMul: 2 } }));
  applyStatus(t, 'invincible', {});
  assert.equal(dealDamage(w, null, t, { type: 'phys', amount: 40, hpLoss: true }), 40);
  assert.equal(t.hp, 960);
  assert.equal(t.buffs[0].shieldHits, 3);
});

test('[伤害-11] healing: the healer\'s and the target\'s multipliers, capped at the maximum, nothing under 禁疗', () => {
  const w = world(), src = mk(1), t = mk(2);
  t.hp = 500;
  src.buffs.push(makeBuff({ key: 'h', mods: { healingDealtMul: 1.5 } }));
  t.buffs.push(makeBuff({ key: 'r', mods: { healingTakenMul: 2 } }));
  assert.equal(heal(w, src, t, 100), 300);
  assert.equal(t.hp, 800);
  assert.equal(heal(w, null, t, 1000), 200);
  assert.equal(t.hp, 1000);
  applyStatus(t, 'healFree', {});
  t.hp = 10;
  assert.equal(heal(w, src, t, 100), 0);
  assert.equal(heal(w, null, mk(3), 100), 0, 'full HP');
  const dead = mk(4);
  dead.hp = 0;
  assert.equal(heal(w, null, dead, 100), 0, 'no healing at 0 HP');
  assert.equal(dead.hp, 0);
});

test('[伤害-8] content may set what a shield holds: at least 0; a buff that is only a used-up shield goes', () => {
  const u = mk(1), w = world();
  u.buffs.push(makeBuff({ key: 's', shield: 100 }), makeBuff({ key: 'm', shield: 50, mods: { atkPct: 0.1 } }));
  setShield(u, u.buffs[0], 30);
  assert.equal(takeDamage(w, u, 40, { type: 'phys', amount: 40 }), 0, '30, then 10 of the 50');
  assert.deepEqual(u.buffs.map((b) => [b.key, b.shield]), [['m', 40]], 'the first used up: gone');
  setShield(u, u.buffs[0], -5);
  assert.deepEqual(u.buffs.map((b) => [b.key, b.shield]), [['m', 0]], 'at least 0; it has modifiers: it stays');
  u.buffs.push(makeBuff({ key: 'only', shield: 20 }));
  setShield(u, u.buffs[1], 0);
  assert.deepEqual(u.buffs.map((b) => b.key), ['m'], 'only a shield, now empty: gone');
});

test('[伤害-8] a buff behaviour take replaces what that buff left, and priority −3000 runs after a priority-0 modifier', () => {
  const u = mk(1), w = world();
  /** @type {any} */
  const c = { behaviors: { buffs: { cut: { take: (/** @type {unknown} */ _w, /** @type {unknown} */ _u, /** @type {unknown} */ _b, /** @type {number} */ amount) => amount - 30 } } } };
  u.buffs.push(makeBuff({ key: 'cut', act: 'cut', prio: -3000 }), makeBuff({ key: 'fragile', mods: { dmgTakenMul: 2 } }));
  assert.equal(takeDamage(w, u, 100, { type: 'true', amount: 100 }, { c }), 170, '脆弱 doubles first, then take subtracts 30');
  const v = mk(2);
  let ran = 0;
  /** @type {any} */
  const wall = { behaviors: { buffs: { cut: { take: () => { ran += 1; return 1; } } } } };
  v.buffs.push(makeBuff({ key: 'cut', act: 'cut', prio: -3000 }), makeBuff({ key: 'wall', shield: 1000 }));
  assert.equal(takeDamage(w, v, 50, { type: 'true', amount: 50 }, { c: wall }), 0);
  assert.equal(ran, 0, 'a buff that brings the hit to 0 ends the step before a later take');
});

test('[伤害-9] content sets HP outright: between 0 and the maximum, no event', () => {
  const u = mk(1, { maxHp: 1000 });
  setHp(u, 1500);
  assert.equal(u.hp, 1000);
  setHp(u, -5);
  assert.equal(u.hp, 0);
  setHp(u, 420.5);
  assert.equal(u.hp, 420.5);
});
