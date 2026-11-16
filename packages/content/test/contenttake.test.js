// The engine's own damage meets the content's real 伤判 behaviours (docs/spec/damage.md 伤害-8): the soul chalice
// (敌能-41) shares a burst's damage at once and each second (元素-4), also one a kit's 元素损伤 sets off (兼容-4); the
// 泥岩小队践行者 barrier (敌能-66) absorbs a talent's arts damage over time (职业-25) and its arts damage at once (职业-28);
// 异质源石虫's 屏障 (敌能-102) halves that damage over time as 无来源.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, buffs, elements, traits, status, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { takeDmg, chaliceBuffs } from '../src/chalice.js';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras } from '../src/foes.js';
import { ShBattle } from '../src/compat/battle.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const ROOK = 'enemy_1430_lrrook';
const GROUND = ['g1', 'g2', 'g3', 'g4'];

/** @param {number} a @param {number} b */
const close = (a, b) => Math.abs(a - b) < 1e-6;

/** @param {World} w @param {string} key @returns {Unit} */
function unit(w, key) {
  const u = w.units.find((x) => x.key === key);
  if (!u) throw new Error(`missing ${key}`);
  return u;
}

/**
 * A chalice (敌能-41's record: 5% kept within 1.7) and four ground enemies of 100000 HP at the route start, and the guard
 * deployed, its attack 0. Each ground enemy holds the lent 伤判 buff after the first frame.
 */
function covered() {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [oneWave([ROOK, ...GROUND].map((key) => spawnAt(0, key)))];
  c.enemies[ROOK] = { name: ROOK, maxHp: 1e5, atk: 0, def: 0, res: 30, moveSpeed: 0, motion: 'FLY', applyWay: 'NONE', rangeRadius: 1.7,
    talents: { takeDmg: { damage_scale: 0.05, range_radius: 1.7 } } };
  for (const key of GROUND) c.enemies[key] = { name: key, maxHp: 1e5, atk: 0, def: 0, res: 0, moveSpeed: 0, motion: 'WALK' };
  c.operators.guard.atk = 0;
  c.behaviors = { foes: { takeDmg }, buffs: chaliceBuffs };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 0, dir: 0 }]]);
  for (const key of GROUND) assert.ok(unit(w, key).buffs.some((b) => b.key === 'takeDmg'), `${key} is covered`);
  return { c, w, op: unit(w, 'guard'), cup: unit(w, ROOK) };
}

/** The HP two units lost while `f` ran. @param {Unit} a @param {Unit} b @param {() => void} f */
function lost(a, b, f) {
  const [ha, hb] = [a.hp, b.hp];
  f();
  return [ha - a.hp, hb - b.hp];
}

test('[伤害-8] [敌能-41] [元素-4] the chalice shares a 灼燃 burst\'s 7000 elemental damage: 5% kept, the rest true damage on it', () => {
  const { c, w, op, cup } = covered();
  const g = unit(w, 'g1');
  const [kept, taken] = lost(g, cup, () => elements.dealEpFrom(w, g, 'FIRE', 1000, { src: op, c }));
  assert.ok(close(kept, 7000 * 0.05) && close(taken, 7000 * 0.95), `${kept} kept, ${taken} on the chalice`);
  const share = w.events.filter((e) => e.type === 'hit' && e.target === cup.id);
  assert.deepEqual(share.map((e) => e.id), [op.id], 'from the source the burst is credited to');
  const bare = unit(w, 'g2');
  assert.deepEqual(lost(bare, cup, () => elements.dealEp(w, bare, 'FIRE', 1000, op)), [7000, 0], 'without the content the chalice sees nothing');
});

test('[伤害-8] [敌能-41] [元素-4] the chalice shares the 凋亡 burst\'s 800 a second, the burst set off without the content', () => {
  const { c, w, cup } = covered();
  const g = unit(w, 'g3');
  elements.dealEp(w, g, 'DARK', 1000);
  const [kept, taken] = lost(g, cup, () => { for (let i = 0; i < 30; i++) step(w, c, []); });
  assert.ok(close(kept, 800 * 0.05) && close(taken, 800 * 0.95), `${kept} kept, ${taken} on the chalice`);
});

test('[伤害-8] [敌能-41] [兼容-4] a kit\'s 元素损伤 carries the battle\'s content: the chalice shares the burst it sets off', () => {
  const { c, w, op, cup } = covered();
  const b = new ShBattle(w, c), g = unit(w, 'g4');
  const [kept, taken] = lost(g, cup, () => b.dealDamage(b.unitOf(op), b.unitOf(g), { type: 'element', element: 'burn', amount: 1000 }));
  assert.ok(close(kept, 7000 * 0.05) && close(taken, 7000 * 0.95), `${kept} kept, ${taken} on the chalice`);
  assert.deepEqual(w.events.filter((e) => e.type === 'hit' && e.target === cup.id).map((e) => e.id), [op.id], 'the burst is the kit\'s operator\'s');
});

/**
 * 泥岩小队践行者 (敌能-66: an arts barrier of 6000, HP 15000 with it) rooted at the route start with the content's real
 * behaviours, and the guard deployed out of its reach with this talentTrait.
 * @param {Record<string, unknown>} talentTrait
 */
function shielded(talentTrait) {
  const c = /** @type {any} */ (tinyContent());
  const key = 'enemy_1091_mdhmmr';
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.behaviors = skeletonContent.behaviors;
  c.enemies[key] = withFoeExtras(key, /** @type {EnemyDef} */ ({ name: key, maxHp: 10000, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { shield: { dynamic: 2000, max_hp: 0.5, attack_speed: 50 } } }));
  c.operators.guard.talentTrait = talentTrait;
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 0 }]]);
  const e = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.ENEMY));
  status.applyStatus(e, 'root', {});
  /** @returns {[number, number | null]} */
  const view = () => [e.hp, e.buffs.find((b) => b.key === 'mudShield')?.value ?? null];
  return { c, w, e, op: unit(w, 'guard'), view };
}

test('[伤害-8] [敌能-66] [职业-25] the arts barrier absorbs a talent\'s arts damage over time; the HP stays', () => {
  const { c, w, e, op, view } = shielded({});
  assert.deepEqual(view(), [15000, 6000]);
  buffs.addBuff(e, buffs.makeBuff({ key: `dot:${op.id}:0`, src: op.id, left: 93, every: 30, fixed: true, value: 85, act: 'talentDot' }));
  for (let i = 0; i < 60; i++) step(w, c, []);
  assert.deepEqual(view(), [15000, 6000 - 2 * 85]);
});

test('[伤害-8] [敌能-102] [职业-25] 异质源石虫\'s 屏障 halves a talent\'s sourceless arts over time and tries no 反伤 on the operator it is credited to', () => {
  const c = /** @type {any} */ (tinyContent());
  const key = 'enemy_10126_rkbomb';
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.behaviors = skeletonContent.behaviors;
  c.enemies[key] = withFoeExtras(key, /** @type {EnemyDef} */ ({ name: key, maxHp: 4500, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { Shield: { init_shield_hp_ratio: 0.1, damage_resistance: 0.5, value: 200 } } }));
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 0 }]]);
  const e = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.ENEMY)), op = unit(w, 'guard');
  status.applyStatus(e, 'root', {});
  assert.ok(e.buffs.some((b) => b.key === 'heteroShield'));
  buffs.addBuff(e, buffs.makeBuff({ key: `dot:${op.id}:0`, src: op.id, left: 93, every: 30, fixed: true, value: 85, act: 'talentDot' }));
  const [hp, opHp] = [e.hp, op.hp];
  for (let i = 0; i < 60; i++) step(w, c, []);
  assert.deepEqual([hp - e.hp, opHp - op.hp], [2 * 85 * 0.5, 0], 'halved as 无来源; no 200 back on the operator');
});

test('[伤害-8] [敌能-66] [职业-28] the arts barrier absorbs the arts damage at once on an enemy standing still; the physical hit goes to the HP', () => {
  const { c, w, e, op, view } = shielded({ vs: [{ when: 'still', on: 'damage', arts: 0.16 }] });
  traits.creditedDamage(w, c, op, e, { type: 'phys', amount: 100, isAttack: true });
  assert.deepEqual(view(), [15000 - 100, 6000 - 50 * 0.16]);
});
