// 堡垒守御's five 丰碑 (docs/spec/foes.md 敌能-69): the first time HP is at or under 80/60/40/20 %, that stage stays.
// Attack and move speed multiply per stage; ATK and block weight add. 热情丰碑 splashes; 狂奔丰碑 cannot be blocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, buffs, damage, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelContent } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const POWER = 'enemy_4035_mufbsa';
const TOUGH = 'enemy_4036_mufbsb';
const AIM = 'enemy_4037_mufbsc';
const WARM = 'enemy_4038_mufbsd';
const RUSH = 'enemy_4039_mufbse';
const STAGES = ['hp80', 'hp60', 'hp40', 'hp20'];
const MAX = 1000000;

/** Integer percent of the monuments' max HP (80/60/40/20 are fifths). @param {number} pct */
const hpOf = (pct) => MAX * pct / 100;

/** Real defs from the fortress level, extras already merged. Not mutated. */
const real = levelContent('act1multi_fortress_rm01', 'NORMAL').enemies;

/**
 * One monument on the tiny map, after the spawn frame (full HP, so no stage yet).
 * @param {string} key
 */
function stand(key) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: { ...real[key] } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.key === key);
  if (!e) throw new Error(`missing ${key}`);
  return { c, w, e };
}

/** Sets HP to `pct` percent and steps once, so the next turn sees it. @param {string} key @param {number} pct */
function drop(key, pct) {
  const box = stand(key);
  damage.setHp(box.e, hpOf(pct));
  step(box.w, box.c);
  return box;
}

/** One permanent stage buff. @param {Unit} e @param {string} key @param {string} mod @param {number} v */
function oneBuff(e, key, mod, v) {
  const found = e.buffs.filter((b) => b.key === key);
  if (found.length !== 1) throw new Error(`${key} x${found.length}`);
  const b = found[0];
  if (!b) throw new Error(key);
  assert.equal(b.mods[mod], v);
  assert.equal(b.left, -1);
}

/** @param {Unit} e @param {string} mod @param {number} v */
function four(e, mod, v) {
  for (const key of STAGES) oneBuff(e, key, mod, v);
}

/** The first three stages, and not hp20. @param {Unit} e @param {string} mod @param {number} v */
function three(e, mod, v) {
  for (const key of ['hp80', 'hp60', 'hp40']) oneBuff(e, key, mod, v);
  assert.equal(e.buffs.filter((b) => b.key === 'hp20').length, 0);
}

/** @param {Unit} e */
function noStage(e) {
  for (const key of STAGES) assert.equal(e.buffs.some((b) => b.key === key), false);
}

test('[敌能-69] 巨力丰碑: 81% stays 100; 80% is 150; 41% is 225; 20% is 506.25', () => {
  const full = stand(POWER);
  assert.equal(attrs.statsOf(full.e).aspd, 100);
  noStage(full.e);
  const over = drop(POWER, 81);
  assert.equal(attrs.statsOf(over.e).aspd, 100);
  noStage(over.e);
  const at80 = drop(POWER, 80);
  assert.equal(attrs.statsOf(at80.e).aspd, 150);
  oneBuff(at80.e, 'hp80', 'aspdMul', 1.5);
  assert.equal(attrs.statsOf(drop(POWER, 41).e).aspd, 225);
  const low = drop(POWER, 20);
  assert.equal(attrs.statsOf(low.e).aspd, 506.25);
  four(low.e, 'aspdMul', 1.5);
});

test('[敌能-69] 巨力丰碑: one hit to 30% latches three stages next turn; a heal keeps them; a heal before the turn does not', () => {
  const box = stand(POWER);
  damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 700000 });
  assert.equal(box.e.hp, 300000);
  assert.equal(attrs.statsOf(box.e).aspd, 100);
  step(box.w, box.c);
  assert.equal(attrs.statsOf(box.e).aspd, 337.5);
  three(box.e, 'aspdMul', 1.5);
  damage.heal(box.w, null, box.e, MAX);
  step(box.w, box.c);
  assert.equal(box.e.hp, MAX);
  assert.equal(attrs.statsOf(box.e).aspd, 337.5);
  three(box.e, 'aspdMul', 1.5);
  const early = stand(POWER);
  damage.dealDamage(early.w, null, early.e, { type: 'true', amount: 700000 });
  damage.heal(early.w, null, early.e, 700000);
  step(early.w, early.c);
  assert.equal(early.e.hp, MAX);
  assert.equal(attrs.statsOf(early.e).aspd, 100);
  noStage(early.e);
});

test('[敌能-69] 巨力丰碑: a second drop does not add another copy of a latched stage', () => {
  const box = drop(POWER, 20);
  step(box.w, box.c);
  four(box.e, 'aspdMul', 1.5);
});

test('[敌能-69] 巨力丰碑 still latches while silenced or stunned', () => {
  const quiet = stand(POWER);
  status.applyStatus(quiet.e, 'silence', {});
  assert.equal(attrs.statsOf(quiet.e).flags.silence, true);
  damage.setHp(quiet.e, hpOf(20));
  step(quiet.w, quiet.c);
  assert.equal(attrs.statsOf(quiet.e).aspd, 506.25);
  const held = stand(POWER);
  status.applyStatus(held.e, 'stun', { seconds: 5 });
  assert.equal(attrs.statsOf(held.e).disabled, true);
  damage.setHp(held.e, hpOf(80));
  step(held.w, held.c);
  assert.equal(attrs.statsOf(held.e).aspd, 150);
  oneBuff(held.e, 'hp80', 'aspdMul', 1.5);
});

test('[敌能-69] 神射丰碑: atk stays 2000 above 80%, then 4000 / 6000 / 10000, and 8000 from one hit to 30%', () => {
  assert.equal(attrs.statsOf(drop(AIM, 81).e).atk, 2000);
  const at80 = drop(AIM, 80);
  assert.equal(attrs.statsOf(at80.e).atk, 4000);
  oneBuff(at80.e, 'hp80', 'atkPct', 1);
  assert.equal(attrs.statsOf(drop(AIM, 41).e).atk, 6000);
  const low = drop(AIM, 20);
  assert.equal(attrs.statsOf(low.e).atk, 10000);
  four(low.e, 'atkPct', 1);
  const box = stand(AIM);
  damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 700000 });
  step(box.w, box.c);
  assert.equal(attrs.statsOf(box.e).atk, 8000);
  three(box.e, 'atkPct', 1);
});

test('[敌能-69] 热情丰碑: atk 1300 / 2600 / 3900 / 6500, and 5200 from one hit to 30%', () => {
  assert.equal(attrs.statsOf(stand(WARM).e).atk, 1300);
  assert.equal(attrs.statsOf(drop(WARM, 80).e).atk, 2600);
  assert.equal(attrs.statsOf(drop(WARM, 41).e).atk, 3900);
  const low = drop(WARM, 20);
  assert.equal(attrs.statsOf(low.e).atk, 6500);
  four(low.e, 'atkPct', 1);
  const box = stand(WARM);
  damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 700000 });
  step(box.w, box.c);
  assert.equal(attrs.statsOf(box.e).atk, 5200);
  three(box.e, 'atkPct', 1);
});

test('[敌能-69] 坚韧丰碑: block weight 1 / 2 / 3 / 5, and 4 from one hit to 30%', () => {
  assert.equal(attrs.statsOf(stand(TOUGH).e).blockCnt, 1);
  assert.equal(attrs.statsOf(drop(TOUGH, 81).e).blockCnt, 1);
  const at80 = drop(TOUGH, 80);
  assert.equal(attrs.statsOf(at80.e).blockCnt, 2);
  oneBuff(at80.e, 'hp80', 'blockCnt', 1);
  assert.equal(attrs.statsOf(drop(TOUGH, 41).e).blockCnt, 3);
  const low = drop(TOUGH, 20);
  assert.equal(attrs.statsOf(low.e).blockCnt, 5);
  four(low.e, 'blockCnt', 1);
  const box = stand(TOUGH);
  damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 700000 });
  step(box.w, box.c);
  assert.equal(attrs.statsOf(box.e).blockCnt, 4);
  three(box.e, 'blockCnt', 1);
});

/**
 * Walks 坚韧丰碑 onto a guard of `blockCnt` and stops once it is blocked.
 * @param {number} blockCnt
 */
function meet(blockCnt) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [TOUGH]: { ...real[TOUGH] } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, TOUGH)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators.guard = { ...c.operators.guard, atk: 0, blockCnt, maxHp: 1e7, def: 0 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 0, dir: 0 }]]);
  const e = w.units.find((u) => u.key === TOUGH);
  const g = w.units.find((u) => u.key === 'guard');
  if (!e || !g) throw new Error('missing blocker');
  let n = 0;
  while (n < 180 && e.blockedBy < 0) { step(w, c); n++; }
  if (e.blockedBy < 0) throw new Error('never blocked');
  return { c, w, e, g };
}

test('[敌能-69] [阻挡-3] 坚韧丰碑: weight 2 releases a blocker of 1, and the next turn does not take it again', () => {
  const { c, w, e } = meet(1);
  damage.setHp(e, hpOf(80));
  step(w, c);
  assert.equal(e.blockedBy, -1);
  assert.equal(attrs.statsOf(e).blockCnt, 2);
  step(w, c);
  assert.equal(e.blockedBy, -1);
});

test('[敌能-69] [阻挡-3] 坚韧丰碑: a blocker of 3 keeps weight 2', () => {
  const { c, w, e, g } = meet(3);
  damage.setHp(e, hpOf(80));
  step(w, c);
  assert.equal(e.blockedBy, g.id);
  assert.equal(attrs.statsOf(e).blockCnt, 2);
});

test('[敌能-69] 狂奔丰碑: move speed 0.5 / 0.75 / 1.125 / 2.53125, and 1.6875 from one hit to 30%', () => {
  const born = stand(RUSH);
  assert.equal(attrs.statsOf(born.e).moveSpeed, 0.5);
  assert.equal(attrs.statsOf(born.e).flags.unblockable, true);
  assert.notEqual(attrs.statsOf(born.e).flags.noAttack, true);
  assert.equal(attrs.statsOf(drop(RUSH, 81).e).moveSpeed, 0.5);
  const at80 = drop(RUSH, 80);
  assert.equal(attrs.statsOf(at80.e).moveSpeed, 0.75);
  oneBuff(at80.e, 'hp80', 'moveMul', 1.5);
  assert.equal(attrs.statsOf(drop(RUSH, 41).e).moveSpeed, 1.125);
  const low = drop(RUSH, 20);
  assert.equal(attrs.statsOf(low.e).moveSpeed, 2.53125);
  four(low.e, 'moveMul', 1.5);
  const box = stand(RUSH);
  damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 700000 });
  step(box.w, box.c);
  assert.equal(attrs.statsOf(box.e).moveSpeed, 1.6875);
  three(box.e, 'moveMul', 1.5);
});

test('[敌能-69] 狂奔丰碑 is unblockable from spawn and walks past a guard', () => {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [RUSH]: { ...real[RUSH] } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, RUSH)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators.guard = { ...c.operators.guard, atk: 0, maxHp: 1e7 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 0, dir: 0 }]]);
  const e = w.units.find((u) => u.key === RUSH);
  if (!e) throw new Error('missing rush');
  assert.equal(e.blockedBy, -1);
  assert.equal(attrs.statsOf(e).flags.unblockable, true);
  // The route waits 3 s on the guard's tile. 400 frames clears that wait and a tile past it at 0.5.
  for (let i = 0; i < 400; i++) step(w, c);
  assert.ok(e.x > 1, `walked to x ${e.x}`);
  assert.equal(e.blockedBy, -1);
  assert.notEqual(attrs.statsOf(e).flags.noAttack, true);
});

/**
 * A rooted 热情丰碑 that will not shoot until the test says so, and quiet guard copies.
 * @returns {{ c: any, w: World, e: Unit }}
 */
function warmStand() {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [WARM]: { ...real[WARM] } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, WARM)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  c.operators.guard = { ...c.operators.guard, atk: 0, blockCnt: 0, def: 0, res: 0, maxHp: 10000 };
  for (let i = 0; i < 5; i++) c.operators[`g${i}`] = { ...c.operators.guard, name: `g${i}` };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.key === WARM);
  if (!e) throw new Error('missing warm');
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0, atkCd: 9999 });
  status.applyStatus(e, 'root', {});
  return { c, w, e };
}

/** Deploys `n` guard copies on the road. @param {ReturnType<typeof warmStand>} box @param {number} n */
function deploy(box, n) {
  /** @type {[number, any][]} */
  const cmds = [];
  for (let i = 0; i < n; i++) cmds.push([0, { type: 'deploy', op: `g${i}`, row: 1, col: i, dir: 0 }]);
  step(box.w, box.c, cmds);
  return cmds.map(([, cmd]) => {
    const u = box.w.units.find((x) => x.key === cmd.op);
    if (!u) throw new Error(`deploy ${cmd.op} failed`);
    return u;
  });
}

test('[敌能-69] [攻击-3] 热情丰碑 splashes arts within 1.8, including a flying neighbour and a camouflaged one, not past 1.8', () => {
  const box = warmStand();
  const [primary, inside, outside, flying, camou] = deploy(box, 5);
  primary.x = box.e.x + 0.5;
  primary.buffs.push(buffs.makeBuff({ key: 'taunt', mods: { taunt: 2 } }));
  inside.x = primary.x + 1.8;
  outside.x = primary.x + 2;
  flying.x = primary.x;
  flying.y = primary.y + 1;
  status.applyStatus(flying, 'levitate', {});
  camou.x = primary.x - 0.5;
  camou.buffs.push(buffs.makeBuff({ key: 'camou', flags: { camou: true } }));
  assert.equal(attrs.statsOf(box.e).flags.seeCamou, undefined);
  box.e.atkCd = 0;
  step(box.w, box.c);
  const shot = box.w.shots[0];
  if (!shot || !shot.splash) throw new Error('no splash');
  assert.equal(box.w.shots.length, 1);
  assert.equal(primary.hp, 10000);
  assert.equal(shot.type, 'arts');
  assert.equal(shot.amount, 1300);
  assert.equal(shot.splash.radius, 1.8);
  assert.equal(shot.splash.scale, 1);
  assert.equal(shot.splash.side, 'friendly');
  assert.equal(shot.splash.ground, false);
  step(box.w, box.c);
  assert.equal(attrs.statsOf(flying).flying, true);
  assert.equal(10000 - primary.hp, 1300);
  assert.equal(10000 - inside.hp, 1300);
  assert.equal(outside.hp, 10000);
  assert.equal(10000 - flying.hp, 1300);
  assert.equal(10000 - camou.hp, 1300);
});

test('[敌能-69] [索敌-2] 热情丰碑 does not target a camouflaged operator, and does not see through camouflage', () => {
  const box = warmStand();
  const [only] = deploy(box, 1);
  only.x = box.e.x + 0.5;
  only.buffs.push(buffs.makeBuff({ key: 'camou', flags: { camou: true } }));
  assert.equal(attrs.statsOf(box.e).flags.seeCamou, undefined);
  box.e.atkCd = 0;
  step(box.w, box.c);
  step(box.w, box.c);
  assert.equal(box.w.shots.length, 0);
  assert.equal(only.hp, 10000);
});

test('[敌能-69] rm01 gives 热情丰碑 a Splash of radius 1.8 that can hit the air, and 狂奔丰碑 the unblockable talent', () => {
  const warm = real[WARM];
  const rush = real[RUSH];
  assert.equal(warm.dmgType, 'arts');
  assert.deepEqual(warm.talents?.Splash, { radius: 1.8, air: 1 });
  assert.deepEqual(rush.talents?.unblockable, {});
  assert.equal(rush.talents?.hp80?.move_speed, 1.5);
});
