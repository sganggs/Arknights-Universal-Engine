// 弧光镜卫 (docs/spec/foes.md 敌能-52, 敌能-2): one 抗性降低 layer per hit with damage left after 伤判.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, damage, status, buffs, elements, bus } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, withoutIncomplete, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const SHIELD = { max_stack_cnt: 80, def: -4000, magic_resistance: -160, change1_stack_cnt: 15, change2_stack_cnt: 45 };
const LONG = { max_stack_cnt: 85, def: -4250, magic_resistance: -170, change1_stack_cnt: 15, change2_stack_cnt: 60 };
const KEY = 'enemy_1329_cbshld';
const LONG_KEY = 'enemy_1329_cbshld_2';
const FAST = 'enemy_15086_dqcbld';

/** @param {number} def @param {Record<string, number>} bb @returns {EnemyDef} */
function record(def, bb) {
  return {
    name: 'mirror', maxHp: 10000, atk: 700, def, res: 60, moveSpeed: 0.75, baseAttackTime: 3,
    applyWay: 'MELEE', motion: 'WALK', talents: { def_reduce: bb },
  };
}

/** @param {string} key @param {EnemyDef} enemy */
function field(key, enemy) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: enemy };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w, e: /** @type {Unit} */ (w.units.find((u) => u.key === key)) };
}

const guard = () => field(KEY, withFoeExtras(KEY, record(3300, SHIELD)));
const elder = () => field(LONG_KEY, withFoeExtras(LONG_KEY, record(3500, LONG)));
/** @param {Unit} e */
const layers = (e) => e.ab['def_reduce.n'] ?? 0;
/** @param {Unit} e */
const cut = (e) => e.buffs.find((b) => b.key === 'def_reduce');

/** @param {World} w @param {any} c @param {Unit} e @param {number} n @param {{ type: 'phys' | 'arts' | 'true' | 'elemental', amount: number }} dmg */
function strike(w, c, e, n, dmg) {
  for (let i = 0; i < n; i++) damage.dealDamage(w, null, e, dmg, c);
}

test('[敌能-52] one layer per hit; below 2 the stats stay; from 2 the cut is n times each layer', () => {
  const { c, w, e } = guard();
  assert.equal(attrs.statsOf(e).def, 3300);
  assert.equal(attrs.statsOf(e).res, 60);
  strike(w, c, e, 1, { type: 'true', amount: 1 });
  assert.equal(layers(e), 1);
  assert.equal(cut(e)?.stacks, 1);
  assert.deepEqual(cut(e)?.mods, { defFlat: 0, resFlat: 0 });
  assert.equal(attrs.statsOf(e).def, 3300);
  assert.equal(attrs.statsOf(e).res, 60);
  strike(w, c, e, 1, { type: 'true', amount: 1 });
  assert.equal(layers(e), 2);
  assert.deepEqual(cut(e)?.mods, { defFlat: -100, resFlat: -4 });
  assert.equal(attrs.statsOf(e).def, 3200);
  assert.equal(attrs.statsOf(e).res, 56);
  strike(w, c, e, 13, { type: 'true', amount: 1 });
  assert.equal(layers(e), 15);
  assert.deepEqual(cut(e)?.mods, { defFlat: -750, resFlat: -30 });
  assert.equal(attrs.statsOf(e).def, 2550);
  assert.equal(attrs.statsOf(e).res, 30);
  strike(w, c, e, 30, { type: 'true', amount: 1 });
  assert.equal(layers(e), 45);
  assert.deepEqual(cut(e)?.mods, { defFlat: -2250, resFlat: -90 });
  assert.equal(attrs.statsOf(e).def, 1050);
  assert.equal(attrs.statsOf(e).res, 0);
});

test('[敌能-52] the cut stops at 80 layers; the stats clamp at 0 and a further hit does not deepen them', () => {
  const { c, w, e } = guard();
  strike(w, c, e, 80, { type: 'true', amount: 1 });
  assert.equal(layers(e), 80);
  assert.deepEqual(cut(e)?.mods, { defFlat: -4000, resFlat: -160 });
  assert.equal(attrs.statsOf(e).def, 0);
  assert.equal(attrs.statsOf(e).res, 0);
  const hp = e.hp;
  strike(w, c, e, 1, { type: 'true', amount: 1 });
  assert.equal(layers(e), 80);
  assert.deepEqual(cut(e)?.mods, { defFlat: -4000, resFlat: -160 });
  assert.equal(e.hp, hp - 1);
});

test('[敌能-2] [敌能-52] this hit still uses the old DEF; the next hit uses the reduced DEF; hurt is not a layer', () => {
  const { c, w, e } = guard();
  const frame = w.frame, full = e.hp;
  strike(w, c, e, 2, { type: 'phys', amount: 4000 });
  assert.equal(full - e.hp, 1400);
  assert.equal(attrs.statsOf(e).def, 3200);
  assert.equal(attrs.statsOf(e).res, 56);
  const mid = e.hp;
  damage.dealDamage(w, null, e, { type: 'phys', amount: 4000 }, c);
  assert.equal(mid - e.hp, 800);
  assert.equal(w.frame, frame);
  step(w, c);
  assert.equal(layers(e), 3);
  assert.equal(e.ab['@hurt'], 1);
});

test('[敌能-52] splash, sourceless and elemental HP damage each add one layer; nothing left after 伤判 adds none', () => {
  const { c, w, e } = guard();
  damage.dealDamage(w, null, e, { type: 'true', amount: 0 }, c);
  assert.equal(layers(e), 0, 'a 0 hit is not damage taken');
  damage.dealDamage(w, null, e, { type: 'true', amount: 5, isSplash: true }, c);
  assert.equal(layers(e), 1);
  damage.dealDamage(w, null, e, { type: 'arts', amount: 10, sourceless: true }, c);
  assert.equal(layers(e), 2);
  damage.dealDamage(w, null, e, { type: 'elemental', amount: 7 }, c);
  assert.equal(layers(e), 3);
  const hp = e.hp;
  buffs.addBuff(e, buffs.makeBuff({ key: 'evade', mods: { dodgePhys: 1 } }));
  damage.dealDamage(w, null, e, { type: 'phys', amount: 4000 }, c);
  assert.equal(e.hp, hp);
  assert.equal(layers(e), 3, 'dodged');
  buffs.removeBuff(e, 'evade');
  buffs.addBuff(e, buffs.makeBuff({ key: 'wall', mods: { blockAll: 1 } }));
  damage.dealDamage(w, null, e, { type: 'true', amount: 40 }, c);
  assert.equal(e.hp, hp);
  assert.equal(layers(e), 3, 'blocked');
  buffs.removeBuff(e, 'wall');
  buffs.addBuff(e, buffs.makeBuff({ key: 'shell', shieldHits: 1 }));
  damage.dealDamage(w, null, e, { type: 'true', amount: 40 }, c);
  assert.equal(e.hp, hp);
  assert.equal(layers(e), 3, 'a shield layer took it');
  buffs.addBuff(e, buffs.makeBuff({ key: 'bar', shield: 30 }));
  damage.dealDamage(w, null, e, { type: 'true', amount: 20 }, c);
  assert.equal(e.hp, hp);
  assert.equal(layers(e), 3, 'the barrier took all of it');
  damage.dealDamage(w, null, e, { type: 'true', amount: 20 }, c);
  assert.equal(e.hp, hp - 10);
  assert.equal(layers(e), 4, 'the barrier took part of it');
});

test('[敌能-52] life loss, the element gauge, heals, setHp, invincibility, sleep, a cancelled hit and a dead target add no layer', () => {
  const { c, w, e } = guard();
  damage.dealDamage(w, null, e, { type: 'true', amount: 40, hpLoss: true }, c);
  assert.equal(e.hp, 9960);
  assert.equal(layers(e), 0);
  elements.dealEp(w, e, 'SANITY', 100);
  assert.equal(layers(e), 0);
  assert.equal(e.hp, 9960);
  damage.heal(w, null, e, 10);
  damage.setHp(e, 5000);
  assert.equal(e.hp, 5000);
  assert.equal(layers(e), 0);
  status.applyStatus(e, 'invincible', {});
  damage.dealDamage(w, null, e, { type: 'true', amount: 50 }, c);
  assert.equal(e.hp, 5000);
  assert.equal(layers(e), 0);
  buffs.removeBuff(e, 'invincible');
  status.applyStatus(e, 'sleep', {});
  damage.dealDamage(w, null, e, { type: 'true', amount: 10 }, c);
  assert.equal(layers(e), 0);
  damage.dealDamage(w, null, e, { type: 'true', amount: 10, throughSleep: true }, c);
  assert.equal(layers(e), 1);
  assert.equal(e.hp, 4990);
  buffs.removeBuff(e, 'sleep');
  bus.on(w, 'hit', (ctx) => { ctx.dmg.cancel = true; });
  damage.dealDamage(w, null, e, { type: 'true', amount: 10 }, c);
  assert.equal(layers(e), 1);
  assert.equal(e.hp, 4990);
  e.hp = 0;
  damage.dealDamage(w, null, e, { type: 'true', amount: 10 }, c);
  assert.equal(layers(e), 1);
});

test('[敌能-52] an element burst\'s HP damage adds one layer and the gauge alone does not', () => {
  const { w, e } = guard();
  elements.dealEp(w, e, 'SANITY', 100);
  assert.equal(layers(e), 0);
  assert.equal(e.hp, 10000);
  elements.dealEp(w, e, 'SANITY', 1000);
  assert.equal(layers(e), 1);
  assert.ok(e.hp < 10000);
});

test('[敌能-52] 弧光镜卫长 also needs 2 layers, and stops at 85', () => {
  const { c, w, e } = elder();
  const hp = e.hp;
  damage.dealDamage(w, null, e, { type: 'phys', amount: 4000 }, c);
  assert.equal(hp - e.hp, 500);
  assert.equal(layers(e), 1);
  assert.deepEqual(cut(e)?.mods, { defFlat: 0, resFlat: 0 });
  assert.equal(attrs.statsOf(e).def, 3500);
  const mid = e.hp;
  damage.dealDamage(w, null, e, { type: 'phys', amount: 4000 }, c);
  assert.equal(mid - e.hp, 500);
  assert.deepEqual(cut(e)?.mods, { defFlat: -100, resFlat: -4 });
  assert.equal(attrs.statsOf(e).def, 3400);
  assert.equal(attrs.statsOf(e).res, 56);
  const low = e.hp;
  damage.dealDamage(w, null, e, { type: 'phys', amount: 4000 }, c);
  assert.equal(low - e.hp, 600);
  strike(w, c, e, 82, { type: 'true', amount: 1 });
  assert.equal(layers(e), 85);
  assert.deepEqual(cut(e)?.mods, { defFlat: -4250, resFlat: -170 });
  assert.equal(attrs.statsOf(e).def, 0);
  assert.equal(attrs.statsOf(e).res, 0);
  strike(w, c, e, 1, { type: 'true', amount: 1 });
  assert.equal(layers(e), 85);
});

test('[敌能-52] 速胜卫士 has no page marker, so def_reduce stays uncovered and does not act', () => {
  const raw = record(2500, SHIELD);
  assert.deepEqual(uncoveredAbilities([withFoeExtras(FAST, raw)]), ['def_reduce']);
  const stripped = withoutIncomplete(withFoeExtras(FAST, raw));
  assert.equal(stripped.talents?.def_reduce, undefined);
  const { c, w, e } = field(FAST, stripped);
  strike(w, c, e, 5, { type: 'true', amount: 1 });
  assert.equal(layers(e), 0);
  assert.equal(attrs.statsOf(e).def, 2500);
  assert.equal(attrs.statsOf(e).res, 60);
  const read = withFoeExtras(KEY, record(3300, SHIELD));
  assert.equal(read.talents?.def_reduce?.gate, 2);
  assert.deepEqual(uncoveredAbilities([read]), []);
  assert.equal(withFoeExtras(LONG_KEY, record(3500, LONG)).talents?.def_reduce?.gate, 2);
});

test('[敌能-52] silence does not stop a new layer, and layers do not expire', () => {
  const { c, w, e } = guard();
  status.applyStatus(e, 'silence', {});
  strike(w, c, e, 2, { type: 'true', amount: 1 });
  assert.equal(attrs.statsOf(e).flags.silence, true);
  assert.equal(layers(e), 2);
  assert.equal(attrs.statsOf(e).def, 3200);
  assert.equal(cut(e)?.left, -1);
  for (let i = 0; i < 45; i++) step(w, c);
  assert.equal(layers(e), 2);
  assert.equal(cut(e)?.left, -1);
  assert.equal(attrs.statsOf(e).def, 3200);
});

test('[敌能-2] hpDamage gets the hit: its source, credit, amount after 伤判, and dmg; a sourceless hit has no source', () => {
  /** @type {any[]} */
  const seen = [];
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { probe: { ...record(0, {}), talents: { probe: {} } } };
  c.behaviors = { foes: { probe: { hpDamage: (/** @type {any} */ _ctx, /** @type {any} */ hit) => { seen.push(hit); } } } };
  c.level.waves = [oneWave([spawnAt(0, 'probe')])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === 'probe'));
  damage.dealDamage(w, e, e, { type: 'true', amount: 30 }, c);
  damage.dealDamage(w, e, e, { type: 'arts', amount: 20, sourceless: true }, c);
  damage.dealDamage(w, null, e, { type: 'true', amount: 0 }, c);
  assert.equal(seen.length, 2);
  assert.equal(seen[0].source, e);
  assert.equal(seen[0].credit, e);
  assert.equal(seen[0].amount, 30);
  assert.equal(seen[0].dmg.type, 'true');
  assert.equal(seen[1].source, null);
  assert.equal(seen[1].credit, e);
});
