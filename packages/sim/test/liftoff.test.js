// 起飞 on damage and status (docs/spec/blocking.md 阻挡-2): a ground enemy's hit, including one already in flight or
// locked, does nothing to a unit that took off; a flying enemy still hits; a sourceless hit lands; a ground enemy's
// status is refused. A hostile device counts as ground motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator, makeDevice } from '../src/units.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { dealDamage } from '../src/damage.js';
import { inflict, applyStatus } from '../src/status.js';
import { dealEp, epOf } from '../src/elements.js';
import { on } from '../src/bus.js';

/** @typedef {import('../src/types.js').World} World @typedef {import('../src/types.js').Unit} Unit */

/** A quiet field: the guard does not hit back, the slime stands and stuns whatever it hits. @returns {{ w: World, c: any, guard: Unit }} */
function battle() {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  Object.assign(c.operators.guard, { atk: 0, def: 0 });
  Object.assign(c.enemies.slime, {
    atk: 80, def: 0, moveSpeed: 0, maxHp: 5000, applyWay: 'RANGED', rangeRadius: 4,
    attack: { duration: 1, hit: 0.1 }, talents: { mark: {} },
  });
  c.behaviors = { foes: { mark: {
    attack(/** @type {any} */ _ctx, /** @type {any} */ mods) { return { ...mods, hitStatus: { key: 'stun', seconds: 2 } }; },
    hit(/** @type {any} */ ctx) { ctx.state.set('landed', 1); },
  } } };
  const w = createWorld(c, { seed: 1, players: 1 });
  const guard = makeOperator(w, c, { key: 'guard', owner: 0, row: 1, col: 2, dir: 0 });
  w.units.push(guard);
  return { w, c, guard };
}

/** @param {World} w @param {any} c @param {number} x @param {string} [motion] */
function spawn(w, c, x, motion) {
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = x;
  e.y = 1;
  if (motion) e.base.motion = motion;
  w.units.push(e);
  return e;
}

/** @param {Unit} u */
const lift = (u) => { addBuff(u, makeBuff({ key: 'up', flags: { liftoff: true } })); };

/** @param {World} w @param {any} c @param {() => boolean} done @param {number} n */
function until(w, c, done, n) {
  for (let i = 0; i < n && !done(); i++) step(w, c);
}

/** @param {Unit} u */
const stunned = (u) => u.buffs.some((b) => b.key === 'stun');

test('[阻挡-2] a ground enemy projectile in flight does nothing once the target takes off', () => {
  const { w, c, guard } = battle(), e = spawn(w, c, 5);
  until(w, c, () => w.shots.length > 0, 20);
  assert.equal(w.shots.length, 1);
  const hp = guard.hp;
  lift(guard);
  until(w, c, () => w.shots.length === 0, 30);
  assert.equal(w.shots.length, 0);
  assert.equal(guard.hp, hp);
  assert.equal(stunned(guard), false);
  assert.equal(e.ab['mark.landed'] ?? 0, 0);
});

test('[阻挡-2] a hit locked before takeoff does nothing when it lands', () => {
  const { w, c, guard } = battle();
  c.enemies.slime.applyWay = 'MELEE';
  c.enemies.slime.rangeRadius = 0;
  c.enemies.slime.attack = { duration: 1, hit: 0.5 };
  const e = spawn(w, c, 2.3);
  until(w, c, () => e.swing !== null, 5);
  assert.ok(e.swing, 'the ground enemy locked the guard it blocks');
  const hp = guard.hp;
  lift(guard);
  until(w, c, () => e.swing === null, 30);
  assert.equal(e.swing, null);
  assert.equal(guard.hp, hp);
  assert.equal(stunned(guard), false);
});

test('[阻挡-2] a flying enemy projectile still hits a unit that took off while it was in flight', () => {
  const { w, c, guard } = battle(), e = spawn(w, c, 5, 'FLY');
  until(w, c, () => w.shots.length > 0, 20);
  assert.equal(w.shots.length, 1);
  const hp = guard.hp;
  lift(guard);
  until(w, c, () => w.shots.length === 0, 30);
  assert.equal(w.shots.length, 0);
  assert.equal(guard.hp, hp - 80);
  assert.equal(stunned(guard), true);
  assert.equal(e.ab['mark.landed'], 1);
});

test('[阻挡-2] a ground enemy hit on a lifted-off unit is refused; 生命流失 still lands', () => {
  const { w, c, guard } = battle(), e = spawn(w, c, 5);
  lift(guard);
  const hp = guard.hp;
  assert.equal(dealDamage(w, e, guard, { type: 'true', amount: 40 }), 0);
  assert.equal(dealDamage(w, e, guard, { type: 'true', amount: 15, hpLoss: true }), 15);
  assert.equal(guard.hp, hp - 15);
});

test('[阻挡-2] sourceless damage still lands on a lifted-off unit', () => {
  const { w, c, guard } = battle(), e = spawn(w, c, 5);
  lift(guard);
  const hp = guard.hp;
  assert.equal(dealDamage(w, e, guard, { type: 'true', amount: 40, sourceless: true }), 40);
  assert.equal(dealDamage(w, null, guard, { type: 'true', amount: 10 }), 10);
  assert.equal(guard.hp, hp - 50);
});

test('[阻挡-2] a projectile whose shooter has left is sourceless and still lands after takeoff', () => {
  const { w, c, guard } = battle(), e = spawn(w, c, 5);
  until(w, c, () => w.shots.length > 0, 20);
  assert.equal(w.shots.length, 1);
  lift(guard);
  e.hp = 0;
  const hp = guard.hp;
  until(w, c, () => w.shots.length === 0, 30);
  assert.equal(w.shots.length, 0);
  assert.equal(guard.hp, hp - 80);
  assert.equal(stunned(guard), true);
});

test('[阻挡-2] statuses from a ground enemy are refused; a flying enemy, no source, and the same side still apply', () => {
  const { w, c, guard } = battle();
  const ground = spawn(w, c, 5), fly = spawn(w, c, 4, 'FLY'), mate = spawn(w, c, 3);
  lift(guard);
  lift(mate);
  let hooks = 0;
  on(w, 'beforeStatus', () => { hooks++; });
  assert.equal(inflict(w, guard, 'stun', { seconds: 1, src: ground }), null);
  assert.equal(applyStatus(guard, 'root', { seconds: 1, src: ground }), null);
  assert.equal(hooks, 0);
  assert.equal(stunned(guard), false);
  assert.ok(inflict(w, guard, 'silence', { seconds: 1, src: fly }));
  assert.ok(applyStatus(guard, 'root', { frames: 4 }));
  assert.ok(inflict(w, guard, 'cold', { seconds: 1, src: guard }));
  assert.ok(inflict(w, mate, 'stun', { seconds: 1, src: ground }));
});

test('[阻挡-2] taking off inside hit or beforeStatus does not cancel that application', () => {
  const { w, c, guard } = battle(), e = spawn(w, c, 5);
  on(w, 'hit', () => { lift(guard); });
  assert.equal(dealDamage(w, e, guard, { type: 'true', amount: 20 }), 20);
  assert.equal(guard.hp, guard.maxHp - 20);
  const other = makeOperator(w, c, { key: 'guard', owner: 0, row: 1, col: 3, dir: 0 });
  on(w, 'beforeStatus', () => { lift(other); });
  assert.ok(inflict(w, other, 'stun', { seconds: 1, src: e }));
  assert.equal(stunned(other), true);
});

test('[阻挡-2] a lifted-off unit takes no element injury from a ground enemy', () => {
  const { w, c, guard } = battle(), e = spawn(w, c, 5);
  lift(guard);
  assert.equal(dealEp(w, guard, 'FIRE', 100, e), 0);
  assert.equal(epOf(guard, 'FIRE'), epOf(guard, 'SANITY'));
  e.base.motion = 'FLY';
  assert.ok(dealEp(w, guard, 'FIRE', 100, e) > 0);
  assert.ok(epOf(guard, 'FIRE') < epOf(guard, 'SANITY'));
});

test('[阻挡-2] a hostile device counts as ground motion; 浮空 does not; our device does not', () => {
  const { w, c, guard } = battle();
  lift(guard);
  const def = { name: 'trap', maxHp: 100, atk: 10, def: 0, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} };
  c.devices = { trap: { ...def, side: 'ENEMY' }, ours: { ...def } };
  const trap = makeDevice(w, c, { key: 'trap', row: 1, col: 3, alias: 't', hidden: false });
  const ours = makeDevice(w, c, { key: 'ours', row: 1, col: 4, alias: 'u', hidden: false });
  const hp = guard.hp;
  assert.equal(dealDamage(w, trap, guard, { type: 'true', amount: 25 }), 0);
  assert.equal(inflict(w, guard, 'stun', { seconds: 1, src: trap }), null);
  assert.equal(dealDamage(w, ours, guard, { type: 'true', amount: 25 }), 25);
  trap.base.motion = 'FLY';
  assert.equal(dealDamage(w, trap, guard, { type: 'true', amount: 25 }), 0);
  addBuff(trap, makeBuff({ key: 'air', flags: { levitate: true } }));
  assert.equal(dealDamage(w, trap, guard, { type: 'true', amount: 7 }), 7);
  assert.equal(guard.hp, hp - 32);
  assert.equal(stunned(guard), false);
});
