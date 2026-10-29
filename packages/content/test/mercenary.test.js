// “飞鞋党”佣兵, 赏金猎人“骑士” and 裹骸死士 (docs/spec/foes.md 敌能-94, 敌能-95, 敌能-96) on the tiny map, with the
// data's blackboards: the dodges from spawn, the knight's speed-up and its arts extra hit, the skull's one blink.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { foeBehaviors, withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const KNIGHT = { 'enemy_mmstck_t[trigger].move_speed': 0.5, 'enemy_mmstck_t[trigger].interval': 0.5, 'enemy_mmstck_t[trigger].trig_cnt': 25 };

/** A melee enemy of the given abilities. @param {Record<string, any>} talents @param {any[]} [skills] @param {number} [move] */
const def = (talents, skills = [], move = 0.25) => ({
  name: 'merc', maxHp: 10000, atk: 400, def: 200, res: 60, moveSpeed: move, applyWay: 'MELEE', motion: 'WALK', massLevel: 1, baseAttackTime: 4, rangeRadius: 0, talents, skills,
});

/** @param {string} key @param {any} d @param {boolean} [straight] along row 1 from column 0 to the end, no checkpoints */
function open(key, d, straight = false) {
  const c = /** @type {any} */ (tinyContent());
  if (straight) c.level.routes = [{ start: { row: 1, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [] }];
  c.enemies = { [key]: withFoeExtras(key, d) };
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, moveMultiplier: 0.02, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w, e: /** @type {Unit} */ (w.units.find((u) => u.key === key)) };
}

/** @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** @param {World} w @param {any} c */
function guardOn(w, c) {
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  return /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
}

test('[敌能-94] PhysicalEvade: a physical dodge of prob from spawn; Evade: physical and arts; another shape is not covered', () => {
  const shoe = open('enemy_1410_mmelee', def({ PhysicalEvade: { prob: 0.4 } }, [], 2)).e, skull = open('enemy_1419_mmcike', def({ Evade: { prob: 0.4 } })).e;
  const mods = (/** @type {Unit} */ u) => u.buffs.find((b) => b.key === 'evade')?.mods;
  assert.deepEqual([mods(shoe), mods(skull)], [{ dodgePhys: 0.4 }, { dodgePhys: 0.4, dodgeArts: 0.4 }], 'lasting dodges (伤害-8)');
  assert.ok(shoe.buffs.find((b) => b.key === 'evade')?.left === -1);
  assert.deepEqual(uncoveredAbilities([def({ PhysicalEvade: { prob: 0.4 } }), def({ Evade: { prob: 0.4 } })]), []);
  assert.deepEqual(uncoveredAbilities([def({ Evade: { prob: 0.4, duration: 3 } })]), ['Evade']);
});

test('[敌能-95] 赏金猎人“骑士”: a layer of +50% every 0.5 s unblocked; its first hit when blocked adds move speed × 550 as arts, then the layers go', () => {
  const { c, w, e } = open('enemy_1413_mmstck', def({ Rush: KNIGHT, FirstAttack: { atk_scale: 550 } }));
  assert.deepEqual(uncoveredAbilities([def({ Rush: KNIGHT, FirstAttack: { atk_scale: 550 } })]), []);
  run(w, c, 15);
  assert.equal(attrs.statsOf(e).moveSpeed, 0.25 * 1.5, 'one layer');
  const g = guardOn(w, c);
  e.x = g.x; e.y = g.y;
  e.atkCd = 20;
  /** @type {any[]} */
  let hs = [];
  for (let i = 0; i < 40 && hs.length === 0; i++) hs = step(w, c).filter((ev) => ev.type === 'hit' && ev.id === e.id);
  assert.equal(e.blockedBy, g.id);
  assert.equal(hs.length, 2, 'the attack and the extra hit');
  assert.equal(hs[1].damage, 0.375 * 550, 'arts on res 0');
  assert.equal(attrs.statsOf(e).moveSpeed, 0.25, 'the layers gone');
});

test('[敌能-96] 裹骸死士: blocked below half its HP it is unblockable 0.2 s and at once 1.5 on its course; once', () => {
  const { c, w, e } = open('enemy_1419_mmcike', def({}, [{ key: 'Blink', cooldown: 99999, initCooldown: 0, sp: 0, bb: { max_hp_ratio: 0.5, dist: 1.5 } }]), true);
  assert.deepEqual(uncoveredAbilities([def({}, [{ key: 'Blink', cooldown: 99999, initCooldown: 0, sp: 0, bb: { max_hp_ratio: 0.5, dist: 1.5 } }])]), []);
  run(w, c, 10);
  const g = guardOn(w, c);
  e.x = g.x; e.y = g.y;
  e.atkCd = 999;
  run(w, c, 5);
  assert.deepEqual([e.blockedBy, e.x], [g.id, g.x], 'half its HP or more: no blink');
  e.hp = 4999;
  step(w, c);
  assert.ok(Math.abs(e.x - (g.x + 1.5)) < 1e-9 && e.y === g.y, `1.5 on toward its end: ${e.x}`);
  assert.ok(e.buffs.some((b) => b.key === 'blinkSlip' && b.flags.unblockable), 'unblockable');
  run(w, c, 7);
  assert.ok(!e.buffs.some((b) => b.key === 'blinkSlip'), 'for 0.2 s');
  e.x = g.x; e.y = g.y;
  run(w, c, 5);
  assert.deepEqual([e.blockedBy, e.x], [g.id, g.x], 'no second blink');
});
