// The training levels' enemies on the tiny map (docs/spec/foes.md 敌能-110…敌能-116), with the data's blackboards and the
// pages' extras: the cost chain and the card bomb, the fire bottles, the charge, the big brother's shield, 卢鲁 and
// 伊斯贝塔, the crossroads machine, and the two whose counterparts are absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { foeBehaviors, withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/** An enemy record. @param {Record<string, any>} p */
const def = (p) => ({ name: 'foe', maxHp: 1e6, atk: 1000, def: 0, res: 0, moveSpeed: 0.7, applyWay: 'MELEE', motion: 'WALK', massLevel: 1, baseAttackTime: 4, rangeRadius: 0, ...p });
/** A skill. @param {string} key @param {Record<string, any>} bb @param {number} [cooldown] @param {number} [initCooldown] */
const sk = (key, bb, cooldown = 0, initCooldown = 0) => ({ key, cooldown, initCooldown, sp: 0, bb });

/** The tiny map with one enemy of the key on a straight way along row 1, our units sturdy and harmless. @param {string} key @param {any} d */
function open(key, d) {
  const c = /** @type {any} */ (tinyContent());
  c.level.routes = [{ start: { row: 1, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [] }];
  c.enemies = { [key]: withFoeExtras(key, d) };
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, moveMultiplier: 0.001, characterLimit: 8, initialCost: 10, maxCost: 99, costIncreaseTime: 1 };
  c.operators = { guard: { ...c.operators.guard, maxHp: 1e5, def: 100, res: 0, atk: 0, cost: 5 }, sniper: { ...c.operators.sniper, maxHp: 1e5, def: 0, res: 0, atk: 0, cost: 3 } };
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

test('[敌能-110] the chain: 0.8 s after its cast at 5 s the cost stops for 30 s; the bomb: the costliest card waiting is sealed 20 s', () => {
  const chain = [sk('StopCost', { projectile_life_time: 30, cost_add_locked: 0 }, 5, 5)], bomb = [sk('CardBoom', { duration: 20, respawn_disabled: 1 }, 5, 5)];
  assert.deepEqual(uncoveredAbilities([def({ skills: chain }), def({ skills: bomb })]), []);
  const a = open('enemy_10079_mpmage_2', def({ skills: chain }));
  run(a.w, a.c, 30 * 5 + 24);
  const p = a.w.players[0], cost = p.cost;
  run(a.w, a.c, 30 * 10);
  assert.equal(p.cost, cost, 'no regeneration while locked');
  run(a.w, a.c, 30 * 21);
  assert.ok(p.cost > cost, 'back after 30 s');
  const b = open('enemy_10080_mpiced_2', def({ motion: 'FLY', applyWay: 'NONE', skills: bomb }));
  run(b.w, b.c, 30 * 6 + 2);
  const card = b.w.players[0].cards.guard;
  assert.ok(card?.seal !== undefined && card.seal > b.w.frame, 'the guard (5) sealed, not the sniper (3)');
  assert.equal(b.w.players[0].cards.sniper?.seal, undefined);
  b.w.players[0].cost = 99;
  step(b.w, b.c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  assert.ok(!b.w.units.some((u) => u.key === 'guard'), 'sealed: no deployment');
});

test('[敌能-111] “与我无关”: unblocked, no attack; each pass of its 30% check leaves a zone of 100 true damage a second within 1.5', () => {
  const d = def({ applyWay: 'NONE', talents: { FireBottleTrigger: { hp_ratio: 0.3 } }, skills: [sk('FireBottle', { damage: 100 }, 99999, 99999)] });
  assert.deepEqual([uncoveredAbilities([withFoeExtras('enemy_1285_sgwlf', d)]), uncoveredAbilities([d])], [[], ['FireBottle']]);
  const { c, w, e } = open('enemy_1285_sgwlf', d);
  assert.equal(attrs.statsOf(e).flags.unblockable, true);
  const g = put(w, c, 'guard', 1, 2);
  e.x = g.x - 1;
  e.hp = 0.6e6;
  e.ab['@hurt'] = 1;
  run(w, c, 2);
  assert.equal(w.zones?.length, 1, 'a zone');
  const hp = g.hp;
  run(w, c, 61);
  assert.equal(hp - g.hp, 200, 'true damage each second');
});

test('[敌能-112] 神勇的帕拉杜利斯: unblocked with one of ours ahead in its row, it charges; the first within 0.45 takes 攻击力 × 2 and the charge ends', () => {
  const d = def({ atk: 1900, talents: { CollideChar: { atk_scale_collide: 2 } }, skills: [sk('rush', {}, 10, 5), sk('rushEndNormal', {}, 1), sk('rushEndAdvance', { stun: 15, cooldown: 5, atk_scale_pure: 10 }, 1)] });
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_10163_mnctur_2', d)]), []);
  assert.deepEqual(uncoveredAbilities([d]), ['rush'], 'not without the page');
  const { c, w, e } = open('enemy_10163_mnctur_2', d);
  const g = put(w, c, 'guard', 1, 3);
  e.x = 0.5;
  for (let i = 0; i < 30 * 6 && e.ab['rush.on'] !== 1; i++) step(w, c);
  assert.equal(e.ab['rush.on'], 1, 'charging at 5 s');
  c.level.options.moveMultiplier = 1;
  e.atkCd = 999;
  for (let i = 0; i < 30 * 5 && e.ab['rush.on'] === 1; i++) step(w, c);
  assert.equal(1e5 - g.hp, 3800 - 100, 'the hit');
  assert.equal(e.ab['rush.on'], 0);
});

test('[敌能-113] 绝望的大哥: an 8000 屏障; after a 失衡 ends it drops the shield and its 防御力 is halved', () => {
  const d = def({ def: 1500, talents: { Shield: { dynamic: 8000, range_radius: 0.4 }, DefDesc: { def: -0.5 } }, skills: [sk('EndShieldSwitchMode', {})] });
  assert.deepEqual(uncoveredAbilities([d]), []);
  const { c, w, e } = open('enemy_10114_ymgsld_2', d);
  assert.equal(e.buffs.find((b) => b.key === 'bigShield')?.shield, 8000);
  e.ab['Shield.fell'] = 1;
  run(w, c, 4);
  assert.ok(!e.buffs.some((b) => b.key === 'bigShield'), 'the 屏障 dropped');
  assert.equal(attrs.statsOf(e).def, 750);
});

test('[敌能-114] 卢鲁: blocked, it charges 8 s then hits for 攻击力; broken by a stun, a 角力失败模式 instead; 伊斯贝塔 splashes within 1.5', () => {
  const lulu = def({ talents: { data: { 'attack@fail_duration': 5, 'attack@fail_duration2': 4 } }, skills: [sk('skill', { duration: 8, atk_scale_s: 1 }, 20)] });
  const rock = def({ atk: 1500, rangeRadius: 1.5, talents: { data: { 'attack@atk_scale': 1, 'attack@atk_scale_2': 1 } }, skills: [sk('start', {})] });
  assert.deepEqual([uncoveredAbilities([lulu]), uncoveredAbilities([withFoeExtras('enemy_10145_xdrock', rock)]), uncoveredAbilities([rock])], [[], [], ['start']]);
  const a = open('enemy_10144_xdelk_2', lulu), g = put(a.w, a.c, 'guard', 1, 2);
  a.e.x = g.x; a.e.y = g.y;
  a.e.atkCd = 999;
  run(a.w, a.c, 30 * 8 + 2);
  assert.equal(1e5 - g.hp, 1000 - 100, 'the hit after 8 s');
  const b = open('enemy_10144_xdelk_2', lulu), g2 = put(b.w, b.c, 'guard', 1, 2);
  b.e.x = g2.x; b.e.y = g2.y;
  b.e.atkCd = 999;
  run(b.w, b.c, 30 * 7);
  status.applyStatus(b.e, 'stun', { seconds: 2 });
  run(b.w, b.c, 32);
  assert.ok(b.e.ab['skill.dull'] > b.w.frame + 30 * 3, 'the second 角力失败模式');
  assert.equal(1e5 - g2.hp, 0);
  const r = open('enemy_10145_xdrock', rock), gr = put(r.w, r.c, 'guard', 1, 2), s = put(r.w, r.c, 'sniper', 0, 2);
  r.e.x = gr.x; r.e.y = gr.y;
  r.e.atkCd = 1;
  run(r.w, r.c, 30);
  assert.deepEqual([1e5 - gr.hp, 1e5 - s.hp], [1400, 1500], 'the target and the splash on the sniper');
});

test('[敌能-115] “十字路口”试做型: each second arts on the first of ours along each way within 1.4, and on ours within 0.7; 失衡免疫', () => {
  const d = def({ atk: 250, talents: { AttackTrigger: { 'attack@FourDirAttack': 0.5, 'attack@CloseAttack': 1 } } });
  assert.deepEqual(uncoveredAbilities([d]), []);
  const { c, w, e } = open('enemy_1331_cbsisy_2', d);
  assert.equal(attrs.statsOf(e).flags.noDisplace, true);
  const g = put(w, c, 'guard', 1, 2), s = put(w, c, 'sniper', 0, 2);
  e.x = 2; e.y = 1 + 0.6;
  run(w, c, 31);
  assert.deepEqual([1e5 - g.hp, 1e5 - s.hp], [125 + 250, 0], 'the guard along the column and close; the sniper out of reach');
});

test('[敌能-116] ExtraPower and DeathRattle of these shapes are covered and do nothing', () => {
  assert.deepEqual(uncoveredAbilities([def({ talents: { ExtraPower: { damage_resistance: 0.4 }, DeathRattle: { 'attack@cnt': 3 } } })]), []);
  assert.deepEqual(uncoveredAbilities([def({ talents: { DeathRattle: { 'attack@cnt': 3, enemy_key: 1 } } })]), ['DeathRattle']);
});
