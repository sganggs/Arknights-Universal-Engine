// PF-3's enemies on the tiny map (docs/spec/foes.md 敌能-5, 敌能-104…敌能-107), with the data's blackboards and the
// pages' extras: 水遁's two forms, the spear's 失手标记, the stones and the thrown 注亡拟嗣, the 注亡拟嗣 itself, and the
// 冰原卫法者's blast from its page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, buffs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { foeBehaviors, withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/** An enemy record. @param {Record<string, any>} p */
const def = (p) => ({ name: 'foe', maxHp: 1e6, atk: 600, def: 0, res: 0, moveSpeed: 0.7, applyWay: 'MELEE', motion: 'WALK', massLevel: 1, baseAttackTime: 1.5, rangeRadius: 0, ...p });

/**
 * The tiny map with one enemy of the key on a straight way along row 1, our units sturdy and harmless.
 * @param {string} key @param {any} d @param {Record<string, any>} [more] other enemy records
 */
function open(key, d, more = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.level.routes = [{ start: { row: 1, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [] }];
  c.enemies = { [key]: withFoeExtras(key, d), ...more };
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, moveMultiplier: 0.001, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators = { guard: { ...c.operators.guard, maxHp: 1e5, def: 100, res: 0, atk: 0 }, sniper: { ...c.operators.sniper, maxHp: 1e5, def: 0, res: 0, atk: 0 } };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w, e: /** @type {Unit} */ (w.units.find((u) => u.key === key)) };
}

/** Steps n frames, the events collected. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(...step(w, c));
  return out;
}
/** Deploys one of ours. @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col */
function put(w, c, op, row, col) {
  step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
  return /** @type {Unit} */ (w.units.find((u) => u.key === op));
}

const NINJA = { talents: { ProtectionTime: { protection_duration: 1 }, EndRotate: { rotate_duration: 60 }, RotateDamage: { 'attack@atk_scale': 1.2, 'attack@range_radius': 1, interval: 1 } },
  skills: ['SwitchModeTrigger', 'EndAnim', 'BeginAnim'].map((key) => ({ key, cooldown: key === 'SwitchModeTrigger' ? 60 : 0, initCooldown: key === 'SwitchModeTrigger' ? 10 : 0, sp: 0, bb: {} })) };

test('[敌能-104] 水遁忍者: at 10 s into the 漩涡, its 攻击力 × 1.2 each second on ours within 1.0 and no attack; back after 60 s', () => {
  assert.deepEqual(uncoveredAbilities([def(NINJA)]), []);
  const { c, w, e } = open('enemy_10116_ymgtop', def(NINJA));
  const g = put(w, c, 'guard', 1, 2);
  e.x = g.x - 0.9;
  run(w, c, 30 * 10 - 3);
  assert.equal(e.ab['SwitchModeTrigger.spin'], 0);
  run(w, c, 3);
  assert.equal(e.ab['SwitchModeTrigger.spin'], 1, 'the 漩涡 at 10 s');
  const hp = g.hp;
  const ev = run(w, c, 30 * 3);
  assert.equal(hp - g.hp, 3 * (720 - 100), 'three beats');
  assert.equal(ev.filter((x) => x.type === 'attack' && x.id === e.id).length, 0, 'no attack');
  run(w, c, 30 * 57);
  assert.equal(e.ab['SwitchModeTrigger.spin'], 0, 'back at 60 s');
});

test('[敌能-105] 投矛的士兵: a throw dodged gives the 失手标记; then only what blocks it is attacked, and the skill turns it to melee', () => {
  const skills = [{ key: 'change', cooldown: 1, initCooldown: 0, sp: 0, bb: {} }];
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_10155_mntjsd', def({ skills }))]), []);
  assert.deepEqual(uncoveredAbilities([def({ skills })]), ['change'], 'not without the page');
  const { c, w, e } = open('enemy_10155_mntjsd', def({ atk: 360, applyWay: 'ALL', rangeRadius: 2, baseAttackTime: 2.5, skills }));
  const s = put(w, c, 'sniper', 0, 2);
  buffs.addBuff(s, buffs.makeBuff({ key: 'dodge', mods: { dodgePhys: 1 } }));
  e.x = 0.8;
  let thrown = 0;
  for (let i = 0; i < 30 * 6 && e.ab['change.miss'] !== 1; i++) thrown += step(w, c).filter((x) => x.type === 'attack' && x.id === e.id).length;
  assert.equal(e.ab['change.miss'], 1, 'the mark');
  step(w, c);
  assert.equal(e.ab['change.melee'], 1, 'melee');
  assert.equal(run(w, c, 30 * 6).filter((x) => x.type === 'attack' && x.id === e.id).length, 0, 'unblocked: no more throws');
  assert.ok(thrown >= 1);
});

test('[敌能-106] 自制投石机: three stones 0.3 s apart on the target\'s spot, each its 攻击力 within 1.5; 投嗣育母: only ours on low ground, a 注亡拟嗣 on each hit; IntoFire covered', () => {
  const stones = { 'attack@times': 3, 'attack@projectile_range': 0.5, 'attack@offset_bound': 3, 'attack@hit_interval': 0.3 };
  assert.deepEqual(uncoveredAbilities([def({ talents: { Attack: stones } }), def({ talents: { Attack: { enemy_key: 'enemy_2024_synut' } } }), def({ talents: { IntoFire: { move_speed: -0.7 } } })]), []);
  const a = open('enemy_10162_mnctpt', def({ atk: 750, applyWay: 'RANGED', rangeRadius: 4, baseAttackTime: 7, talents: { Attack: stones } }));
  const g = put(a.w, a.c, 'guard', 1, 3);
  a.e.x = 0.5;
  for (let i = 0; i < 30 * 10 && g.hp === 1e5; i++) step(a.w, a.c);
  const first = 1e5 - g.hp;
  run(a.w, a.c, 20);
  assert.deepEqual([first, 1e5 - g.hp], [650, 3 * 650], 'three stones of 750 on def 100');
  const synut = def({ maxHp: 2400, atk: 200, moveSpeed: 0, applyWay: 'MELEE', baseAttackTime: 1.6 });
  const b = open('enemy_2023_sypult', def({ applyWay: 'RANGED', rangeRadius: 4, baseAttackTime: 8, talents: { Attack: { enemy_key: 'enemy_2024_synut' } } }), { enemy_2024_synut: synut });
  const s = put(b.w, b.c, 'sniper', 0, 2), gd = put(b.w, b.c, 'guard', 1, 4);
  b.e.x = 1;
  for (let i = 0; i < 30 * 10 && !b.w.units.some((u) => u.key === 'enemy_2024_synut'); i++) step(b.w, b.c);
  const brood = /** @type {Unit} */ (b.w.units.find((u) => u.key === 'enemy_2024_synut'));
  assert.ok(brood && Math.abs(brood.x - 4) <= 0.2 + 1e-9 && Math.abs(brood.y - 1) <= 0.2 + 1e-9, 'on the guard\'s tile');
  assert.equal(s.hp, 1e5, 'not the sniper on high ground');
  assert.ok(gd.hp < 1e5);
});

test('[敌能-107] 注亡拟嗣: 自缚, 100 true damage on itself each second, 侵蚀损伤 on its hits', () => {
  const t = { EpDamage: { 'attack@ep_damage_ratio': 0.6, damage: 100 } };
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_2024_synut', def({ talents: t }))]), []);
  assert.deepEqual(uncoveredAbilities([def({ talents: t })]), ['EpDamage'], 'not without the page\'s element');
  const { c, w, e } = open('enemy_2024_synut', def({ maxHp: 2400, def: 150, talents: t }));
  assert.equal(attrs.statsOf(e).flags.root, true);
  run(w, c, 60);
  assert.equal(2400 - e.hp, 200);
});

test('[敌能-5] 冰原卫法者 and 冰原御法者: their blast from the pages — 1.65, 1.2 s, arts, not the air', () => {
  for (const key of ['enemy_1191_krgrg', 'enemy_1191_krgrg_2']) {
    const e = withFoeExtras(key, def({ talents: { boom: { atk_scale: 20, freeze: 5, cold: 5 } } }));
    assert.deepEqual(e.talents?.boom, { atk_scale: 20, freeze: 5, cold: 5, radius: 1.65, delay: 1.2, arts: 1, air: 0, sourced: 1 });
    assert.deepEqual(uncoveredAbilities([e]), [], key);
  }
});
