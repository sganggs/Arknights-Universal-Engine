// 酸液源石虫, 异质源石虫 and “庞贝” (docs/spec/foes.md 敌能-101, 敌能-102, 敌能-103) on the tiny map, with the data's
// blackboards and the pages' extras: the acid's layers, the 屏障's halving and 反伤, the burn, the burst and the rage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, damage, buffs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { foeBehaviors, withFoeExtras, uncoveredAbilities } from '../src/foes.js';
import { heteroBuffs } from '../src/heteroslime.js';
import { pompeiiBuffs } from '../src/pompeii.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/** An enemy record. @param {Record<string, any>} p */
const def = (p) => ({ name: 'slime', maxHp: 40000, atk: 230, def: 0, res: 0, moveSpeed: 1, applyWay: 'RANGED', motion: 'WALK', massLevel: 1, baseAttackTime: 3, rangeRadius: 1.8, ...p });

/** The tiny map with one enemy of the key on a straight way along row 1 and a sturdy guard. @param {string} key @param {any} d */
function open(key, d) {
  const c = /** @type {any} */ (tinyContent());
  c.level.routes = [{ start: { row: 1, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [] }];
  c.enemies = { [key]: withFoeExtras(key, d) };
  c.behaviors = { foes: foeBehaviors, buffs: { ...heteroBuffs, ...pompeiiBuffs } };
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, moveMultiplier: 0.001, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators = { ...c.operators, guard: { ...c.operators.guard, maxHp: 1e5, def: 100, res: 0, atk: 1 } };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === key));
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  return { c, w, e, g: /** @type {Unit} */ (w.units.find((u) => u.key === 'guard')) };
}

/** Steps n frames, the events collected. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(...step(w, c));
  return out;
}

test('[敌能-101] 酸液源石虫: each hit a layer of 【源石虫酸液】 with no end, n layers n × the first DEF loss', () => {
  const { c, w, e, g } = open('enemy_1004_mslime', def({ talents: { defdown: { def: -10 } } }));
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_1004_mslime', def({ talents: { defdown: { def: -10 } } }))]), []);
  assert.deepEqual(uncoveredAbilities([def({ talents: { defdown: { def: -10 } } })]), ['defdown'], 'not without the page');
  e.x = 1;
  let n = 0;
  for (let i = 0; i < 30 * 10 && n < 3; i++) n += step(w, c).filter((x) => x.type === 'hit' && x.id === e.id).length;
  assert.equal(n, 3);
  const b = g.buffs.find((x) => x.key === 'acid');
  assert.deepEqual([b?.value, b?.mods.defFlat, b?.left, attrs.statsOf(g).def], [3, -30, -1, 70]);
});

test('[敌能-102] 异质源石虫: taunt + 1; a sourced hit tries 200 arts on its source, and only when that lands is a physical or arts hit halved', () => {
  const sh = { init_shield_hp_ratio: 0.1, damage_resistance: 0.5, value: 200 };
  const d = def({ maxHp: 4500, def: 100, res: 20, applyWay: 'MELEE', rangeRadius: 0, talents: { Shield: sh, BlockMcreep: { range_radius: 0.9, block_mcreep_cnt: 1, range_radius_add: 0.1 } }, skills: [{ key: 'M1Start', cooldown: 0, initCooldown: 0, sp: 0, bb: {} }] });
  assert.deepEqual(uncoveredAbilities([d]), []);
  const { c, w, e, g } = open('enemy_10126_rkbomb', d);
  assert.equal(attrs.statsOf(e).taunt, 1);
  e.hp = 4500;
  damage.dealDamage(w, g, e, { type: 'phys', amount: 1100 }, c);
  assert.deepEqual([4500 - e.hp, 1e5 - g.hp], [500, 200], 'the 反伤 lands: halved');
  buffs.addBuff(g, buffs.makeBuff({ key: 'safe', flags: { invincible: true } }));
  e.hp = 4500;
  damage.dealDamage(w, g, e, { type: 'phys', amount: 1100 }, c);
  assert.equal(4500 - e.hp, 1000, 'an invincible source: the 反伤 fails, the whole hit');
  e.hp = 4500;
  damage.dealDamage(w, null, e, { type: 'arts', amount: 1000 }, c);
  assert.equal(4500 - e.hp, 400, 'sourceless: halved, no 反伤');
});

test('[敌能-103] “庞贝”: its hit burns 20 arts each 0.33 s for 10 s; blocked, 1000 within 1.4 every 10 s; below half its HP, 攻击速度 + 40', () => {
  const talents = { dot: { duration: 10, damage: 20, interval: 0.33 }, rangedamage: { interval: 10, 'attack@damage': 1000 }, selfbuff: { attack_speed: 40, hp_ratio: 0.5 } };
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_1050_lslime', def({ talents }))]), []);
  const { c, w, e, g } = open('enemy_1050_lslime', def({ talents, rangeRadius: 3.5, baseAttackTime: 3.5 }));
  e.x = 1;
  let hit = -1;
  for (let i = 0; i < 30 * 5 && hit < 0; i++) if (step(w, c).some((x) => x.type === 'hit' && x.id === e.id)) hit = w.frame;
  const burn = g.buffs.find((x) => x.key === 'pompeiiBurn');
  assert.deepEqual([burn?.left, burn?.every, burn?.value], [300, 10, 20]);
  const hp = g.hp;
  e.atkCd = 999;
  run(w, c, 30);
  assert.equal(hp - g.hp, 60, 'three ticks a second');
  e.x = g.x; e.y = g.y;
  e.atkCd = 9999;
  const burst = run(w, c, 30 * 10 + 2).filter((x) => x.type === 'hit' && x.id === e.id && x.damage === 1000);
  assert.equal(e.blockedBy, g.id);
  assert.equal(burst.length, 1, 'one burst in 10 s blocked');
  assert.equal(attrs.statsOf(e).aspd, 100);
  e.hp = 19999;
  step(w, c);
  assert.equal(attrs.statsOf(e).aspd, 140);
});
