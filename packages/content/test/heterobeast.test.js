// 异质裂兽 and 异质裂兽·α (docs/spec/foes.md 敌能-135). Neither is in an extracted level, so the records are the
// enemy_database 17759cc8 level-0 rows; “惘核” (enemy_10128_fearpj) is here only for its other `M0Shield` shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, damage, status, buffs, blocking, bus } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { foeBehaviors, uncoveredAbilities, withoutIncomplete } from '../src/foes.js';
import { heteroBehaviors } from '../src/heteroslime.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const KEY = 'enemy_10127_rkmbst', ALPHA = 'enemy_10127_rkmbst_2';
const BARRIER = 'heteroBeastBarrier';
const BLOCK_MCREEP = Object.freeze({ range_radius: 0.9, block_mcreep_cnt: 3, range_radius_add: 0.1 });

/** The data's `M0Shield` (both rows), or with other values. @param {Record<string, unknown>} [o] @returns {Record<string, any>} */
const m0 = (o = {}) => ({ init_shield_hp_ratio: 0.05, damage_resistance: 0.5, attack_speed: 100, ...o });

/**
 * A level-0 row of enemy_database 17759cc8: 异质裂兽, or 异质裂兽·α with `alpha`. `shield` is the `M0Shield` blackboard;
 * null leaves the talent out. @param {boolean} alpha @param {Record<string, unknown> | null} [shield] @returns {EnemyDef}
 */
function beast(alpha, shield = m0()) {
  return /** @type {EnemyDef} */ ({
    name: alpha ? '异质裂兽·α' : '异质裂兽', maxHp: alpha ? 27500 : 20000, atk: alpha ? 1250 : 1000, def: 100, res: 20, moveSpeed: 0.5,
    baseAttackTime: 3, rangeRadius: 1, applyWay: 'MELEE', motion: 'WALK', massLevel: 3, levelType: 'ELITE', lifePointReduce: 1, tags: ['infection'],
    talents: { ...(shield ? { M0Shield: shield } : {}), BlockMcreep: { ...BLOCK_MCREEP } },
    skills: [{ key: 'M1Start', cooldown: 0, initCooldown: 0, sp: 0, bb: {} }],
  });
}

/** “惘核”'s talents (enemy_database 17759cc8, level 0). @returns {EnemyDef} */
const fearpj = () => /** @type {EnemyDef} */ ({ name: '“惘核”', maxHp: 1, atk: 1, def: 0, res: 0, moveSpeed: 1,
  talents: { M0Shield: { init_shield_hp_ratio: 0.1, damage_resistance: 0.6 }, CrazyBonus: { attack_speed: 200 }, BlockMcreep: { ...BLOCK_MCREEP } } });

/** @param {World} w @param {string} key */
function unitOf(w, key) {
  const u = w.units.find((x) => x.key === key);
  assert.ok(u, key);
  return /** @type {Unit} */ (u);
}

/**
 * The tiny map: the enemy all but standing at the start of row 1, a guard on (1, 2) and a neutral unit beside it (合作-9).
 * `atSpawn`: the enemy's 屏障 buffs as its `enemySpawn` event fires, before its first turn.
 * @param {string} key @param {EnemyDef} d
 */
function open(key, d) {
  const c = /** @type {any} */ (tinyContent());
  c.level.routes = [{ start: { row: 1, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [] }];
  c.enemies = { [key]: d, civ: { name: 'civ', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key), spawnAt(0, 'civ')])];
  c.level.options = { ...c.level.options, moveMultiplier: 0.001, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators = { ...c.operators, guard: { ...c.operators.guard, maxHp: 1e6, def: 0, res: 0, atk: 1 } };
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @type {number[]} */
  const atSpawn = [];
  bus.on(w, 'enemySpawn', (k) => { if (k.enemy.key === key) atSpawn.push(k.enemy.buffs.filter((/** @type {any} */ b) => b.key === BARRIER).length); });
  step(w, c);
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  return { c, w, e: unitOf(w, key), g: unitOf(w, 'guard'), civ: unitOf(w, 'civ'), atSpawn };
}

/** HP one hit takes from full. @param {{ w: World, c: any, e: Unit }} box @param {Unit | null} src @param {Record<string, unknown>} dmg */
function lost(box, src, dmg) {
  box.e.hp = box.e.maxHp;
  damage.dealDamage(box.w, src, box.e, /** @type {any} */ ({ ...dmg }), box.c);
  return box.e.maxHp - box.e.hp;
}

/** The 屏障's buff: exactly one. @param {Unit} e */
function barrier(e) {
  const all = e.buffs.filter((b) => b.key === BARRIER);
  assert.equal(all.length, 1);
  return all[0];
}

/** @param {number} got @param {number} want */
const near = (got, want) => assert.ok(Math.abs(got - want) < 1e-9, `${got} ≠ ${want}`);

test('[敌能-135] both rows are covered (BlockMcreep and M1Start are still 敌能-102\'s); “惘核”\'s M0Shield, a text value, a missing or an extra key are not', () => {
  for (const alpha of [false, true]) {
    const row = beast(alpha);
    assert.deepEqual(uncoveredAbilities([row]), []);
    assert.equal(withoutIncomplete(row), row, 'nothing is dropped');
  }
  assert.equal(foeBehaviors.BlockMcreep, heteroBehaviors.BlockMcreep);
  assert.equal(foeBehaviors.M1Start, heteroBehaviors.M1Start);
  assert.deepEqual(uncoveredAbilities([fearpj()]), ['M0Shield', 'CrazyBonus']);
  assert.equal(withoutIncomplete(fearpj()).talents?.M0Shield, undefined);
  const { attack_speed: _speed, ...two } = m0();
  for (const bb of [m0({ init_shield_hp_ratio: '0.05' }), m0({ damage_resistance: '0.5' }), m0({ attack_speed: '100' }), two, m0({ value: 200 })]) {
    assert.deepEqual(uncoveredAbilities([beast(false, bb)]), ['M0Shield'], JSON.stringify(bb));
  }
});

test('[敌能-135] from the spawn, one buff for good: 嘲讽等级 + 1, 攻击速度 + attack_speed, 恐惧 and 沉睡 immune; another shape gets nothing', () => {
  for (const [key, alpha] of /** @type {[string, boolean][]} */ ([[KEY, false], [ALPHA, true]])) {
    const { w, c, e, atSpawn } = open(key, beast(alpha));
    assert.deepEqual(atSpawn, [1], 'on as it spawns, before its first turn');
    const s = attrs.statsOf(e);
    assert.deepEqual([s.taunt, s.aspd, s.interval], [1, 200, 1.5], key);
    const b = barrier(e);
    assert.deepEqual([b.left, b.mods, b.flags], [-1, { taunt: 1, aspd: 100, physTakenMul: 0.5, artsTakenMul: 0.5 }, { 'immune:fear': true, 'immune:sleep': true }]);
    for (let i = 0; i < 300; i++) step(w, c);
    assert.equal(barrier(e).left, -1, 'still one, a buff of no end');
  }
  const tuned = open(KEY, beast(false, m0({ attack_speed: 40, damage_resistance: 0.3 })));
  assert.deepEqual([attrs.statsOf(tuned.e).taunt, attrs.statsOf(tuned.e).aspd], [1, 140]);
  for (const other of [open(KEY, beast(false, fearpj().talents?.M0Shield)), open(KEY, beast(false, null))]) {
    const s = attrs.statsOf(other.e);
    assert.equal(other.e.buffs.some((b) => b.key === BARRIER), false);
    assert.deepEqual([s.taunt, s.aspd, lost(other, other.g, { type: 'phys', amount: 1100 })], [0, 100, 1000]);
  }
});

test('[敌能-135] physical and arts × (1 − damage_resistance) from any source or none, attack or skill; true, elemental and 生命流失 whole; the 屏障 absorbs nothing', () => {
  const box = open(KEY, beast(false)), { g, civ } = box;
  // DEF 100 and RES 20: 1100 physical is 1000 and 1000 arts is 800 before the 伤判
  assert.equal(lost(box, g, { type: 'phys', amount: 1100, isAttack: true }), 500);
  assert.equal(lost(box, g, { type: 'arts', amount: 1000, isSkill: true }), 400);
  assert.equal(lost(box, null, { type: 'phys', amount: 1100 }), 500, 'no source');
  assert.equal(lost(box, g, { type: 'arts', amount: 1000, sourceless: true }), 400, 'sourceless');
  assert.equal(lost(box, civ, { type: 'phys', amount: 1100 }), 500, 'a neutral unit is not 矿工游击队');
  assert.equal(lost(box, g, { type: 'true', amount: 1000 }), 1000);
  assert.equal(lost(box, g, { type: 'elemental', amount: 1000 }), 1000);
  assert.equal(lost(box, g, { type: 'phys', amount: 1000, hpLoss: true }), 1000);
  buffs.addBuff(g, buffs.makeBuff({ key: 'hidden', flags: { camou: true, stealth: true } }));
  assert.equal(lost(box, g, { type: 'phys', amount: 1100 }), 500, '迷彩 and 隐匿 change nothing');
  // 5 % of 20000 would be a 1000 屏障: a big hit loses all of its halved 5000, whatever the ratio
  assert.equal(lost(box, g, { type: 'phys', amount: 10100 }), 5000);
  const wide = open(KEY, beast(false, m0({ init_shield_hp_ratio: 0.5 })));
  assert.equal(lost(wide, wide.g, { type: 'phys', amount: 10100 }), 5000);
  const tuned = open(KEY, beast(false, m0({ damage_resistance: 0.3 })));
  near(lost(tuned, tuned.g, { type: 'phys', amount: 1100 }), 700);
  near(lost(tuned, tuned.g, { type: 'arts', amount: 1000 }), 560);
  assert.equal(barrier(box.e).mods.physTakenMul, 0.5, 'no hit spent anything');
});

test('[敌能-135] 恐惧 and 沉睡 add their buffs but do not hold — blockable, hit, able to act — while the 屏障 lasts; silence leaves it all; dodge and 无敌 as ever', () => {
  const box = open(KEY, beast(false)), { e, g } = box;
  assert.notEqual(status.applyStatus(e, 'fear', { seconds: 5 }), null);
  assert.notEqual(status.applyStatus(e, 'sleep', { seconds: 5 }), null);
  let s = attrs.statsOf(e);
  assert.deepEqual([!!s.flags.fear, !!s.flags.sleep, s.invincible, s.disabled, blocking.blockable(s)], [false, false, false, false, true]);
  assert.equal(lost(box, g, { type: 'phys', amount: 1100 }), 500, 'asleep, still hit, still halved');
  assert.notEqual(status.applyStatus(e, 'silence', { seconds: 8 }), null);
  // a second of silenced turns: no ability of its may drop the 屏障 meanwhile
  for (let i = 0; i < 30; i++) step(box.w, box.c);
  s = attrs.statsOf(e);
  assert.deepEqual([s.flags.silence, s.taunt, s.aspd, barrier(e).left, lost(box, g, { type: 'arts', amount: 1000 })], [true, 1, 200, -1, 400]);
  buffs.addBuff(e, buffs.makeBuff({ key: 'evade', mods: { dodgePhys: 1 } }));
  assert.equal(lost(box, g, { type: 'phys', amount: 1100 }), 0, 'dodged');
  // were the 屏障 gone (矿工游击队 only), the buffs it left in the list would hold again (状态-7)
  const kept = barrier(e);
  buffs.removeBuff(e, kept);
  s = attrs.statsOf(e);
  assert.deepEqual([!!s.flags.fear, !!s.flags.sleep, s.invincible, blocking.blockable(s), s.taunt, s.aspd], [true, true, true, false, 0, 100]);
  buffs.addBuff(e, kept);
  status.applyStatus(e, 'invincible', {});
  assert.deepEqual([lost(box, g, { type: 'arts', amount: 1000 }), barrier(e).mods.artsTakenMul], [0, 0.5], '无敌');
});

test('[敌能-135] blocked, it attacks every 3 s × 100 / (100 + attack_speed): 45 frames, 60 with attack_speed 50', () => {
  for (const [shield, gap] of /** @type {[Record<string, any>, number][]} */ ([[m0(), 45], [m0({ attack_speed: 50 }), 60]])) {
    const { w, c, e, g } = open(KEY, beast(false, shield));
    e.x = g.x; e.y = g.y;
    /** @type {number[]} */
    const at = [];
    for (let i = 0; i < 300 && at.length < 3; i++) if (step(w, c).some((x) => x.type === 'hit' && x.id === e.id && x.target === g.id)) at.push(w.frame);
    assert.equal(e.blockedBy, g.id);
    assert.deepEqual([at[1] - at[0], at[2] - at[1]], [gap, gap]);
  }
});
