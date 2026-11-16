// A trait's 倍率 by the target (docs/spec/traits.md 职业-17): the conditions on the target, attack 倍率 before 防御 and
// 伤害倍率 after, the distance's and the enemies in range's, a whole attack's by its splash, and heals by the one healed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { vsDamage, vsHeal } from '../src/vs.js';
import { creditedDamage } from '../src/traits.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny level without spawns, the guard's trait (and range) set first; `foe` adds a rooted enemy. @param {Record<string, any>} trait
 * @param {{ row: number, col: number }[]} [range]
 */
function arena(trait, range = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]) {
  const c = tinyContent();
  c.level.waves = [];
  c.operators.guard.trait = { targets: 'all', ...trait };
  c.operators.guard.range = range;
  const w = createWorld(c, { seed: 1, players: 2 });
  /** @param {number} row @param {number} col @param {Record<string, any>} [over] */
  const foe = (row, col, over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, maxHp: 1e6, def: 0, ...over };
    e.hp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  return { w, c, foe };
}
/** Deploys the guard at (row, col) facing right and runs a frame. @param {any} w @param {any} c @returns {Unit} */
function guardAt(w, c, row = 1, col = 1) {
  step(w, c, [[0, { type: 'deploy', op: 'guard', row, col, dir: 0 }]]);
  return /** @type {Unit} */ (w.units.find((/** @type {Unit} */ u) => u.key === 'guard'));
}
/** A hit of the guard on a target through vsDamage: its amount and mul after. @param {any} w @param {any} c @param {Unit} op @param {Unit} t */
function scaled(w, c, op, t, dmg = /** @type {import('../src/damage.js').Damage} */ ({ type: 'phys', amount: 100 })) {
  vsDamage(w, c, op, t, dmg);
  return [dmg.amount, dmg.mul ?? 1];
}

test('[职业-17] blocked: against an enemy blocked by any unit, or one that blocks; attack 倍率 before 防御, 伤害倍率 after', () => {
  const { w, c, foe } = arena({ vs: [{ when: 'blocked', atk: 1.15 }] });
  const op = guardAt(w, c), mine = foe(1, 2), other = foe(1, 3), free = foe(0, 2), blocker = foe(2, 2);
  mine.blockedBy = op.id; other.blockedBy = 999; free.blockedBy = -1; blocker.blockedBy = -1;
  const held = foe(2, 3);
  held.blockedBy = blocker.id;
  assert.deepEqual([mine, other, free, blocker].map((t) => scaled(w, c, op, t)[0]), [100 * 1.15, 100 * 1.15, 100, 100 * 1.15]);
  const d = arena({ vs: [{ when: 'blocked', dmg: 1.1 }] }), dop = guardAt(d.w, d.c), dt = d.foe(1, 2);
  dt.blockedBy = dop.id;
  assert.deepEqual(scaled(d.w, d.c, dop, dt), [100, 1.1], '伤害倍率 on the hit\'s mul');
});

test('[职业-17] the hits of an attack take it as they are dealt: the attack 倍率 meets the 防御 after it', () => {
  const { w, c, foe } = arena({ vs: [{ when: 'blocked', atk: 1.2 }] });
  guardAt(w, c);
  const held = foe(1, 1, { def: 20 }), free = foe(1, 3, { def: 20 });
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < 40 && ev.filter((e) => e.type === 'hit').length < 2; i++) ev.push(...step(w, c, []));
  assert.deepEqual(ev.filter((e) => e.type === 'hit').map((e) => [e.target, e.damage]).sort((a, b) => a[0] - b[0]), [[held.id, 50 * 1.2 - 20], [free.id, 30]]);
});

test('[职业-17] the target conditions: flying, below an HP share, heavy, straight in front, near, in a burst, ground while the skill runs', () => {
  const { w, c, foe } = arena({ vs: [
    { when: 'flying', atk: 2 }, { when: 'hpBelow', atk: 3, value: 0.4 }, { when: 'heavy', atk: 5, value: 3 }, { when: 'front', atk: 7, noDodge: true },
    { when: 'near', atk: 11 }, { when: 'burst', dmg: 13 }, { when: 'skillGround', atk: 17 },
  ] });
  const op = guardAt(w, c, 1, 1);
  const fly = foe(0, 4, { motion: 'FLY' }), low = foe(2, 4), heavy = foe(2, 5, { massLevel: 3 }), ahead = foe(1, 4), beside = foe(0, 2), hot = foe(2, 5);
  low.hp = 0.3 * statsOf(low).maxHp;
  addBuff(hot, makeBuff({ key: 'burst:fire' }));
  assert.deepEqual([fly, low, heavy, ahead, beside, hot].map((t) => scaled(w, c, op, t)), [[200, 1], [300, 1], [500, 1], [700, 1], [1100, 1], [100, 13]]);
  const dodge = /** @type {any} */ ({ type: 'phys', amount: 1 }), arts = /** @type {any} */ ({ type: 'arts', amount: 1 });
  vsDamage(w, c, op, ahead, dodge); vsDamage(w, c, op, ahead, arts);
  assert.deepEqual([dodge.noDodgeCancel, dodge.canDodge, arts.noDodgeCancel], [true, undefined, undefined], 'in front: a dodge cannot cancel its physical hit (伤害-12)');
  op.skill = /** @type {any} */ ({ active: true });
  assert.deepEqual([scaled(w, c, op, low)[0], scaled(w, c, op, fly)[0]], [300 * 17, 200], 'ground ones while the skill runs');
});

test('[职业-17] none for a sourceless hit, 生命流失, elemental damage, or a unit that is not an operator', () => {
  const { w, c, foe } = arena({ vs: [{ when: 'near', atk: 2, dmg: 3 }] });
  const op = guardAt(w, c), t = foe(1, 2);
  const kinds = [{ type: 'phys', amount: 1, sourceless: true }, { type: 'true', amount: 1, hpLoss: true }, { type: 'elemental', amount: 1 }];
  assert.deepEqual(kinds.map((d) => scaled(w, c, op, t, /** @type {any} */ (d))), [[1, 1], [1, 1], [1, 1]]);
  assert.deepEqual(scaled(w, c, t, op), [100, 1], 'an enemy\'s hit');
  assert.equal(creditedDamage(w, c, op, t, { type: 'true', amount: 10 }), 20 * 3, 'a behaviour\'s damage through the context takes it too');
});

test('[职业-17] the distance\'s 伤害倍率 in a line from min to max; the enemies in range\'s, capped', () => {
  const far = arena({ far: { min: 1, max: 4.5, dmg: 0.15 } }), op = guardAt(far.w, far.c, 1, 1);
  const at = [2, 3.75, 5.5, 6].map((col) => scaled(far.w, far.c, op, far.foe(1, col))[1]);
  assert.deepEqual(at.map((m) => Math.round(m * 1e6) / 1e6), [1, 1.075, 1.15, 1.15]);
  const crowd = arena({ crowd: { step: 0.03, cap: 2 } }), cop = guardAt(crowd.w, crowd.c, 1, 1), t = crowd.foe(1, 2);
  assert.equal(scaled(crowd.w, crowd.c, cop, t)[1], 1.03);
  crowd.foe(1, 3); crowd.foe(1, 3); crowd.foe(0, 3);
  assert.equal(scaled(crowd.w, crowd.c, cop, t)[1], 1.06, 'three in range, two counted');
});

test('[职业-17] an attack whose splash reaches enough enemies, the target\'s included, hits all of them at its 倍率', () => {
  const run = (/** @type {number} */ n) => {
    const { w, c, foe } = arena({ splash: { radius: 1, scale: 0.5, ground: false }, packed: { cnt: 3, atk: 1.2 }, targets: 1 }, [{ row: 0, col: 0 }, { row: 0, col: 1 }]);
    guardAt(w, c);
    const main = foe(1, 2);
    for (let k = 1; k < n; k++) foe(k === 1 ? 0 : 2, 2);
    /** @type {any[]} */
    const ev = [];
    for (let i = 0; i < 40 && !ev.some((e) => e.type === 'hit'); i++) ev.push(...step(w, c, []));
    return ev.filter((e) => e.type === 'hit').map((e) => (e.target === main.id ? e.damage : -e.damage));
  };
  assert.deepEqual([run(2), run(3)], [[50, -25], [60, -30, -30]]);
});

test('[职业-17] heals by the one healed: below an HP share, on a ground tile; 1 for a healer that is no operator', () => {
  const { w, c, foe } = arena({ vs: [{ when: 'hpBelow', heal: 1.15, value: 0.5 }, { when: 'onGround', heal: 1.1 }] });
  const op = guardAt(w, c), enemy = foe(1, 3);
  op.hp = 0.4 * statsOf(op).maxHp;
  assert.equal(vsHeal(w, c, op, op), 1.15 * 1.1);
  op.hp = statsOf(op).maxHp; op.z = 1;
  assert.deepEqual([vsHeal(w, c, op, op), vsHeal(w, c, enemy, op), vsHeal(w, c, null, op)], [1, 1, 1]);
});

test('[职业-17] a hit of its skill: the hit is the skill\'s; never a heal', () => {
  const { w, c, foe } = arena({ vs: [{ when: 'skill', dmg: 1.1 }] });
  const op = guardAt(w, c), t = foe(1, 2);
  assert.deepEqual([scaled(w, c, op, t, /** @type {any} */ ({ type: 'phys', amount: 100, isSkill: true })), scaled(w, c, op, t)], [[100, 1.1], [100, 1]]);
  assert.equal(vsHeal(w, c, op, op), 1);
});
