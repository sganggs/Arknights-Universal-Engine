// 吉兆飞鳞 (docs/spec/foes.md 敌能-147). No level the engine ships has it, so its record is built here from enemy_database
// (ArknightsGameData 17759cc8, level 0), as defdown.test.js builds 碎骨. Frame counts come from 时间-2, not from literals:
// a status put on between two steps is first ticked in the next step's buff phase (帧-1), before the enemy's turn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, damage, displacement, KIND } from '@aue/sim';
import { secondsToFrames } from '@aue/math';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, FOE_EXTRAS } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const KEY = 'enemy_10045_parrot';
const SAILOR = 'enemy_10043_sailor';
/** The buffs of 初始模式, 晕眩模式 and the speed-up. */
const FLOAT = 'parrot:float';
const DOWN = 'parrot:down';
const RUN = 'parrot:run';
/** Its abilities in the data's order; the skill `ThrowEnemy` shares a talent's name. */
const NAMES = ['M0SpeedUp', 'ThrowEnemy', 'M1SpeedUp', 'Stun', 'Mode', 'StateController'];

/**
 * The level-0 record (enemy_database 17759cc8); `talents` replaces those blackboards.
 * @param {Record<string, Record<string, unknown>>} [talents] @param {string} [sailor] @returns {EnemyDef}
 */
function parrot(talents = {}, sailor = SAILOR) {
  return /** @type {any} */ ({
    name: '吉兆飞鳞', maxHp: 10000, atk: 100, def: 0, res: 10, moveSpeed: 0.6, baseAttackTime: 1, massLevel: 0,
    applyWay: 'NONE', motion: 'WALK', rangeRadius: -1,
    talents: {
      M0SpeedUp: { duration: 5, move_speed: 3 }, ThrowEnemy: { checkpoint: 0 }, M1SpeedUp: { duration: 5, move_speed: 3 },
      Stun: { duration: 8 }, Mode: { mode: 0 }, StateController: { enemy_key: sailor, cnt: 1, delay: 1 }, ...talents,
    },
    skills: [{ key: 'ThrowEnemy', cooldown: 0, initCooldown: 0, sp: 0, bb: { enemy_key: sailor, cnt: 1, delay: 0.5, mode: 2 } }],
  });
}

/** The record with this page's extras. @param {Record<string, Record<string, unknown>>} [talents] */
const marked = (talents) => withFoeExtras(KEY, parrot(talents));

/** 寻险水手, level 0 (enemy_database 17759cc8). @returns {EnemyDef} */
const sailor = () => /** @type {any} */ ({
  name: '寻险水手', maxHp: 5500, atk: 350, def: 50, res: 10, moveSpeed: 0.9, baseAttackTime: 2, massLevel: 1, applyWay: 'MELEE', motion: 'WALK',
  talents: { 1: { 'attack@ep_damage_ratio': 0.3 }, MoveSpeedUp: { move_speed: 2, speed_up_duration: 1 } },
});

/**
 * It stands on the start tile (made deployable) unless `mult` lets it walk; operators of no attack (unless `atk`) and ten
 * million HP are deployed in the first frame, as [name, row, col].
 * @param {EnemyDef} def @param {{ mult?: number, deploy?: [string, number, number][], atk?: number }} [o]
 */
function world(def, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [KEY]: def, [SAILOR]: sailor() };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, KEY)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 6, moveMultiplier: o.mult ?? 0 };
  c.level.tiles[2][0] = { ...c.level.tiles[2][0], buildable: 'ALL' };
  Object.assign(c.operators.guard, { cost: 0, maxHp: 1e7, atk: o.atk ?? 0, def: 0, res: 0, blockCnt: 3 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, (o.deploy ?? []).map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  const e = w.units.find((u) => u.key === KEY);
  if (!e) throw new Error('吉兆飞鳞 did not spawn');
  return { c, w, e, guard: w.units.find((u) => u.key === 'guard') };
}

/** @typedef {ReturnType<typeof world>} Box */

/** @param {Unit} e @param {string} key */
const count = (e, key) => e.buffs.filter((b) => b.key === key).length;
/** @param {Unit} e @param {string} key */
const has = (e, key) => count(e, key) > 0;
/** The stuns' frames left, in the list's order. @param {Unit} e */
const stuns = (e) => e.buffs.filter((b) => b.key === 'stun').map((b) => b.left);
/** Steps `n` frames and returns their events. @param {Box} box @param {number} [n] */
function run(box, n = 1) {
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...step(box.w, box.c));
  return ev;
}
/** How many steps until `done` holds. @param {Box} box @param {() => boolean} done */
function until(box, done) {
  for (let i = 1; i <= 2000; i++) {
    step(box.w, box.c);
    if (done()) return i;
  }
  throw new Error('it never happened');
}
/** Damage that lowers its HP, between two steps. @param {Box} box @param {number} [amount] */
const hurt = (box, amount = 100) => damage.dealDamage(box.w, null, box.e, { type: 'true', amount }, box.c);
/** @param {Unit} u */
const sky = (u) => buffs.addBuff(u, buffs.makeBuff({ key: 'sky', flags: { blockFly: true } }));
/** 晕眩模式 from a 1 s stun; returns the box after the step that switched it. @param {EnemyDef} def @param {object} [o] */
function grounded(def, o) {
  const box = world(def, o);
  status.applyStatus(box.e, 'stun', { seconds: 1 });
  run(box);
  assert.ok(has(box.e, DOWN));
  return box;
}

test('[敌能-147] [关卡-2] the page marker covers 吉兆飞鳞; 噩兆飞鳞 and the record without it stay uncovered', () => {
  const e = marked();
  assert.deepEqual(uncoveredAbilities([e]), []);
  assert.deepEqual(e.talents?.Mode, { mode: 0, parrot: 1 });
  assert.deepEqual(e.talents?.Stun, { duration: 8, parrot: 1 });
  assert.deepEqual(e.talents?.NoAttack, {});
  assert.deepEqual(e.skills?.[0].bb, { enemy_key: SAILOR, cnt: 1, delay: 0.5, mode: 2, parrot: 1 });
  assert.match(FOE_EXTRAS[KEY].source, /title=%E5%90%89%E5%85%86%E9%A3%9E%E9%B3%9E&oldid=401248$/);
  assert.deepEqual(uncoveredAbilities([parrot()]), NAMES, 'without the marker');
  assert.equal(FOE_EXTRAS.enemy_10045_parrot_2, undefined);
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_10045_parrot_2', parrot({}, 'enemy_10043_sailor_2'))]), NAMES, '噩兆飞鳞');
  assert.deepEqual(uncoveredAbilities([withFoeExtras(SAILOR, sailor())]), ['1', 'MoveSpeedUp'], '寻险水手 is not covered: 搬运模式 is out');
});

/** The other users of `Stun` and `Mode` (enemy_database 17759cc8), each with only that talent. @type {[string, string, Record<string, number>][]} */
const OTHERS = [
  ['enemy_1308_mheagl', 'Stun', { duration: 10 }], ['enemy_1308_mheagl_2', 'Stun', { duration: 10 }], ['enemy_15092_dqudg', 'Stun', { stun: 10 }],
  ['enemy_1537_mhrors', 'Stun', { duration: 12, duration_2: 10, duration_3: 8, damage_scale: 2 }], ['enemy_2026_syudg', 'Stun', { stun: 10 }],
  ['enemy_2027_syudg2', 'Stun', { stun: 10 }], ['enemy_7509_rtrslm', 'Stun', { stun: 3 }],
  ['enemy_1308_mheagl', 'Mode', { mode: 1, 'attack@atk_scale': 4.5 }], ['enemy_1308_mheagl_2', 'Mode', { mode: 0, 'attack@atk_scale': 5 }],
  ['enemy_1311_mhkryk', 'Mode', { mode: 0 }], ['enemy_1311_mhkryk_2', 'Mode', { mode: 0 }],
];

test('[敌能-147] [关卡-2] the other enemies with Stun or Mode have no marker and stay uncovered, the same shapes included', () => {
  for (const [key, name, bb] of OTHERS) {
    const e = withFoeExtras(key, /** @type {any} */ ({ name: key, maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { [name]: bb } }));
    assert.deepEqual(uncoveredAbilities([e]), [name], `${key} ${name}`);
  }
});

/** The marked record with one blackboard replaced: what is left uncovered. @param {string} name @param {Record<string, unknown>} bb */
function gap(name, bb) {
  const e = /** @type {any} */ (marked());
  e.talents[name] = bb;
  return uncoveredAbilities([e]);
}

test('[敌能-147] [关卡-2] every shape is exact: another mode, a key more or less, text for a number, a negative time', () => {
  assert.deepEqual(gap('Mode', { mode: 1, parrot: 1 }), ['Mode'], 'a level starting it in 搬运模式');
  assert.deepEqual(gap('Mode', { mode: '0', parrot: 1 }), ['Mode']);
  assert.deepEqual(gap('Stun', { duration: '8', parrot: 1 }), ['Stun'], 'text');
  assert.deepEqual(gap('Stun', { duration: 8, parrot: 1, stun: 1 }), ['Stun'], 'a key more');
  assert.deepEqual(gap('Stun', { duration: -1, parrot: 1 }), ['Stun'], 'a negative time');
  assert.deepEqual(gap('M0SpeedUp', { duration: 5, parrot: 1 }), ['M0SpeedUp'], 'a key less');
  assert.deepEqual(gap('M1SpeedUp', { duration: 5, move_speed: '3', parrot: 1 }), ['M1SpeedUp']);
  assert.deepEqual(gap('StateController', { enemy_key: 7, cnt: 1, delay: 1, parrot: 1 }), ['StateController'], 'a number for the name');
  assert.deepEqual(gap('ThrowEnemy', { checkpoint: 0, mode: 2, parrot: 1 }), ['ThrowEnemy']);
  assert.deepEqual(gap('ThrowEnemy', { checkpoint: 3, parrot: 1 }), [], 'any checkpoint: 搬运模式 never begins');
  assert.deepEqual(gap('Stun', { duration: 6.5, parrot: 1 }), []);
  const e = /** @type {any} */ (marked());
  e.skills[0].bb = { ...e.skills[0].bb, cnt: '1' };
  assert.deepEqual(uncoveredAbilities([e]), ['ThrowEnemy'], 'the skill');
});

test('[敌能-147] 初始模式 hovers from its spawn: only a blockFly unit blocks it, 失衡免疫, a ground move, no normal attack', () => {
  const box = world(marked(), { deploy: [['guard', 2, 0]] });
  const e = box.e, guard = /** @type {Unit} */ (box.guard);
  assert.equal(e.base.motion, 'WALK');
  assert.equal(attrs.statsOf(e).flying, true);
  assert.equal(attrs.statsOf(e).flags.noDisplace, true);
  assert.equal(attrs.statsOf(e).flags.noAttack, true);
  assert.equal(e.blockedBy, -1, 'a ground operator does not block it');
  sky(guard);
  const ev = run(box, 90);
  assert.equal(e.blockedBy, guard.id);
  assert.equal(ev.filter((x) => x.type === 'hit' && x.id === e.id).length, 0, 'ATK 100 and blocked, yet no attack');
  assert.equal(count(e, FLOAT), 1, 'one buff, not one per frame');
  status.applyStatus(e, 'groundbind', { seconds: 2 });
  run(box);
  assert.equal(attrs.statsOf(e).flying, false, '缚地 puts it on the ground');
  assert.equal(displacement.displaceable(e), false, '失衡免疫 still holds');
  assert.ok(has(e, FLOAT) && !has(e, DOWN), '缚地 is not one of the three');
});

test('[敌能-147] 晕眩 grounds it: the block ends at once, unblockable, no 失衡免疫, and Stun.duration of stun beside the first', () => {
  for (const seconds of [8, 6.5]) {
    const box = world(marked({ Stun: { duration: seconds } }), { deploy: [['guard', 2, 0]] });
    const e = box.e, guard = /** @type {Unit} */ (box.guard);
    sky(guard);
    run(box);
    assert.equal(e.blockedBy, guard.id);
    status.applyStatus(e, 'stun', { seconds: 1 });
    run(box);
    assert.equal(e.blockedBy, -1, 'released on the turn it switched');
    assert.ok(has(e, DOWN) && !has(e, FLOAT));
    assert.deepEqual(stuns(e), [secondsToFrames(1) - 1, secondsToFrames(seconds)]);
    const s = attrs.statsOf(e);
    assert.equal(s.flying, false);
    assert.equal(s.flags.unblockable, true);
    assert.equal(displacement.displaceable(e), true, 'no 失衡免疫 in 晕眩模式');
    run(box, 30);
    assert.equal(e.blockedBy, -1, 'unblockable, the blockFly guard on its tile included');
    assert.equal(count(e, DOWN), 1);
  }
});

test('[敌能-147] it floats again on the turn neither 晕眩 nor 沉睡 holds it: Stun.duration, or a longer stun or sleep', () => {
  for (const seconds of [8, 6.5]) {
    const box = grounded(marked({ Stun: { duration: seconds } }));
    assert.equal(until(box, () => has(box.e, FLOAT)), secondsToFrames(seconds), `${seconds} s`);
    assert.ok(!has(box.e, DOWN));
    assert.equal(attrs.statsOf(box.e).flying, true);
    assert.equal(attrs.statsOf(box.e).flags.noDisplace, true);
  }
  for (const kind of ['stun', 'sleep']) {
    const box = world(marked());
    status.applyStatus(box.e, /** @type {any} */ (kind), { seconds: 10 });
    run(box);
    assert.ok(has(box.e, DOWN), kind);
    assert.equal(until(box, () => has(box.e, FLOAT)), secondsToFrames(10) - 1, `the 10 s ${kind} outlasts the 8 s`);
  }
});

test('[敌能-147] 冻结, 浮空, 麻痹震颤, 束缚, 沉默 do not ground it; 晕眩 in 晕眩模式 does not ground it again', () => {
  for (const kind of ['freeze', 'enemyFreeze', 'palsyShake', 'root', 'silence', 'levitate']) {
    const box = world(marked());
    if (kind === 'levitate') buffs.addBuff(box.e, buffs.makeBuff({ key: kind, flags: { levitate: true }, left: 60 }));
    else status.applyStatus(box.e, /** @type {any} */ (kind), { seconds: 2 });
    run(box, 10);
    assert.ok(has(box.e, FLOAT) && !has(box.e, DOWN), kind);
    assert.deepEqual(stuns(box.e), [], kind);
  }
  const box = grounded(marked());
  const down = box.e.buffs.find((b) => b.key === DOWN);
  status.applyStatus(box.e, 'stun', { seconds: 1 });
  status.applyStatus(box.e, 'sleep', { seconds: 1 });
  run(box);
  assert.equal(box.e.buffs.find((b) => b.key === DOWN), down, 'the same 晕眩模式');
  assert.equal(stuns(box.e).filter((n) => n > secondsToFrames(1)).length, 1, 'no second 8 s');
});

test('[敌能-147] 【失温坠落】: the turn after a freeze ends, 0.05 s of stun (2 frames), then 晕眩模式 at once', () => {
  for (const kind of ['freeze', 'enemyFreeze']) {
    const box = world(marked());
    status.applyStatus(box.e, /** @type {any} */ (kind), { seconds: 1 });
    const steps = until(box, () => has(box.e, DOWN));
    assert.equal(steps, secondsToFrames(1), `${kind}: grounded on the turn the freeze is gone`);
    assert.deepEqual(stuns(box.e), [secondsToFrames(0.05), secondsToFrames(8)]);
    assert.equal(secondsToFrames(0.05), 2);
  }
});

test('[敌能-147] the 8 s and the 0.05 s are the 晕眩 status: 抵抗 halves them as it halves any stun', () => {
  const box = world(marked());
  status.applyStatus(box.e, 'buffres', {});
  status.applyStatus(box.e, 'stun', { seconds: 1 });
  run(box);
  assert.ok(has(box.e, DOWN));
  assert.equal(until(box, () => has(box.e, FLOAT)), secondsToFrames(8) / 2, 'the 8 s at twice the speed');
  const cold = world(marked());
  status.applyStatus(cold.e, 'buffres', {});
  status.applyStatus(cold.e, 'freeze', { seconds: 1 });
  assert.equal(until(cold, () => has(cold.e, DOWN)), secondsToFrames(1) / 2);
  assert.deepEqual(stuns(cold.e), [secondsToFrames(0.05), secondsToFrames(8)]);
  run(cold);
  assert.deepEqual(stuns(cold.e), [secondsToFrames(8) - 2], 'the 0.05 s went at twice the speed too');
});

test('[敌能-147] 【失温坠落】: the 8 s ending in a freeze floats it, and the freeze ending grounds it again; ending inside 晕眩模式 it does not', () => {
  const box = grounded(marked());
  status.applyStatus(box.e, 'freeze', { seconds: 10 });
  assert.equal(until(box, () => has(box.e, FLOAT)), secondsToFrames(8), 'back to 初始模式 while frozen');
  assert.ok(attrs.statsOf(box.e).flags.freeze);
  assert.equal(until(box, () => has(box.e, DOWN)), secondsToFrames(10) - secondsToFrames(8));
  assert.deepEqual(stuns(box.e), [secondsToFrames(0.05), secondsToFrames(8)]);
  const again = grounded(marked());
  const down = again.e.buffs.find((b) => b.key === DOWN);
  status.applyStatus(again.e, 'freeze', { seconds: 1 });
  run(again, secondsToFrames(1));
  assert.equal(again.e.buffs.find((b) => b.key === DOWN), down);
  assert.deepEqual(stuns(again.e), [secondsToFrames(8) - secondsToFrames(1), secondsToFrames(0.05)], 'the 0.05 s is added, no new 8 s');
  assert.equal(until(again, () => has(again.e, FLOAT)), secondsToFrames(8) - secondsToFrames(1));
});

test('[敌能-147] the first damage: move speed × move_speed (最终乘算) for duration s, once, not refreshed', () => {
  for (const [secs, mul] of [[5, 3], [4, 2.5]]) {
    const box = world(marked({ M0SpeedUp: { duration: secs, move_speed: mul } }));
    run(box, 5);
    assert.equal(attrs.statsOf(box.e).moveSpeed, 0.6);
    hurt(box);
    run(box);
    const b = box.e.buffs.find((x) => x.key === RUN);
    assert.deepEqual([b?.mods, b?.left], [{ moveMul: mul }, secondsToFrames(secs)]);
    assert.ok(Math.abs(attrs.statsOf(box.e).moveSpeed - 0.6 * mul) < 1e-9);
    run(box, 10);
    hurt(box);
    run(box);
    assert.deepEqual([count(box.e, RUN), box.e.buffs.find((x) => x.key === RUN)?.left], [1, secondsToFrames(secs) - 11], 'not refreshed');
    assert.equal(until(box, () => !has(box.e, RUN)), secondsToFrames(secs) - 11);
    hurt(box);
    run(box);
    assert.ok(!has(box.e, RUN), 'only the first');
  }
});

test('[敌能-147] the speed-up multiplies the current move speed (最终乘算); a duration of 0 gives none', () => {
  for (const mul of [3, 2.5]) {
    const box = world(marked({ M0SpeedUp: { duration: 5, move_speed: mul } }));
    buffs.addBuff(box.e, buffs.makeBuff({ key: 'haste', mods: { movePct: 0.5 } }));
    hurt(box);
    run(box);
    assert.ok(Math.abs(attrs.statsOf(box.e).moveSpeed - 0.6 * 1.5 * mul) < 1e-9, `+50% (直接乘算), then ×${mul}`);
  }
  const none = world(marked({ M0SpeedUp: { duration: 0, move_speed: 3 } }));
  hurt(none);
  run(none);
  assert.ok(!has(none.e, RUN));
  assert.equal(attrs.statsOf(none.e).moveSpeed, 0.6);
});

test('[敌能-147] damage in 晕眩模式 neither speeds it up nor spends it, up to the turn it floats; a melee guard hits it only there', () => {
  const box = grounded(marked(), { deploy: [['guard', 2, 0]], atk: 100 });
  const guardHits = (/** @type {any[]} */ ev) => ev.filter((x) => x.type === 'hit' && x.id === box.guard?.id && x.target === box.e.id).length;
  const down = run(box, secondsToFrames(8) - 1);
  assert.ok(guardHits(down) > 0, 'on the ground a melee operator can choose it');
  assert.ok(box.e.hp < 10000 && !has(box.e, RUN));
  hurt(box);
  run(box);
  assert.ok(has(box.e, FLOAT), 'the turn it floats again');
  assert.ok(!has(box.e, RUN), 'that damage was taken in 晕眩模式');
  assert.equal(guardHits(run(box, 90)), 0, 'hovering again');
  hurt(box);
  run(box);
  assert.ok(has(box.e, RUN), 'the first damage in 初始模式');
});

test('[敌能-147] switching to 晕眩模式 removes the speed-up; damage and a stun seen on the same turn spend it', () => {
  const box = world(marked());
  hurt(box);
  run(box);
  assert.ok(has(box.e, RUN));
  status.applyStatus(box.e, 'stun', { seconds: 1 });
  run(box);
  assert.ok(has(box.e, DOWN) && !has(box.e, RUN));
  until(box, () => has(box.e, FLOAT));
  assert.ok(!has(box.e, RUN), 'it does not come back');
  const same = world(marked());
  hurt(same);
  status.applyStatus(same.e, 'stun', { seconds: 1 });
  run(same);
  assert.ok(has(same.e, DOWN) && !has(same.e, RUN));
  until(same, () => has(same.e, FLOAT));
  hurt(same);
  run(same);
  assert.ok(!has(same.e, RUN), 'spent on that turn');
});

test('[敌能-147] a hit that leaves its HP whole (无敌) does not count; silence stops none of it', () => {
  const box = world(marked());
  status.applyStatus(box.e, 'invincible', { seconds: 1 });
  hurt(box);
  assert.equal(box.e.hp, 10000);
  run(box);
  assert.ok(!has(box.e, RUN));
  until(box, () => !attrs.statsOf(box.e).invincible);
  status.applyStatus(box.e, 'silence', { seconds: 60 });
  hurt(box);
  run(box);
  assert.ok(has(box.e, RUN), 'silenced, and the first damage that counted');
  status.applyStatus(box.e, 'freeze', { seconds: 1 });
  assert.equal(until(box, () => has(box.e, DOWN)), secondsToFrames(1), 'silenced, 【失温坠落】 and the switch');
  assert.equal(until(box, () => has(box.e, FLOAT)), secondsToFrames(8));
});

test('[敌能-147] the mode\'s buff comes back when something else removes it, one of each', () => {
  const box = world(marked());
  buffs.removeBuff(box.e, FLOAT);
  run(box);
  assert.equal(count(box.e, FLOAT), 1);
  assert.equal(attrs.statsOf(box.e).flying, true);
  status.applyStatus(box.e, 'stun', { seconds: 1 });
  run(box);
  buffs.removeBuff(box.e, DOWN);
  run(box);
  assert.equal(count(box.e, DOWN), 1);
  assert.ok(!has(box.e, FLOAT));
});

test('[敌能-147] off its shape it does nothing at runtime: no marker, another mode, a Stun or a M0SpeedUp of another shape', () => {
  const shapes = [parrot(), parrot({ Mode: { mode: 1, parrot: 1 }, Stun: { duration: 8, parrot: 1 } }), marked({ Stun: { stun: 8 } })];
  for (const def of shapes) {
    const box = world(def);
    assert.equal(attrs.statsOf(box.e).flying, false);
    status.applyStatus(box.e, 'stun', { seconds: 1 });
    run(box);
    assert.ok(!has(box.e, FLOAT) && !has(box.e, DOWN));
    assert.deepEqual(stuns(box.e), [secondsToFrames(1) - 1]);
  }
  const loose = world(marked({ M0SpeedUp: { duration: 5, move_speed: 3, speed: 1 } }));
  assert.ok(has(loose.e, FLOAT), 'the modes still run');
  hurt(loose);
  run(loose);
  assert.ok(!has(loose.e, RUN), 'no speed-up from a M0SpeedUp of another shape');
});

test('[敌能-147] 搬运模式 is out: walking its whole route and leaving, the ready ThrowEnemy and StateController bring no 寻险水手', () => {
  const box = world(marked({ ThrowEnemy: { checkpoint: 1 } }), { mult: 1 });
  const ev = run(box, 600);
  assert.ok(ev.some((x) => x.type === 'goal' && x.id === box.e.id), 'it reached the goal');
  assert.equal(box.w.units.filter((u) => u.kind === KIND.ENEMY).length, 0);
  assert.equal(ev.filter((x) => x.type === 'spawn').length, 0);
  const down = world(marked());
  hurt(down, 1e6);
  run(down, 2);
  assert.equal(down.w.units.filter((u) => u.kind === KIND.ENEMY).length, 0, 'knocked down: nothing either');
});
