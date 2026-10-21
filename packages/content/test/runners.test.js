// Enemies that run when hurt (docs/spec/foes.md 敌能-40) on the tiny map: 鸭爵 does not attack and cannot be blocked,
// and the first time its HP is lower than last turn it keeps a faster move speed; 简饲源石虫, the first time its HP is
// strictly below half, is unblockable and faster for 3 s. Not 冲锋 (敌能-19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, buffs, damage, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const DUCK_KEY = 'enemy_2001_duckmi';
const DUCK2_KEY = 'enemy_2001_duckmi_2';
const SLUG_KEY = 'enemy_10001_trslim';

/** @param {string} name @param {number} maxHp @param {number} pct @returns {EnemyDef} */
const duck = (name, maxHp, pct) => ({
  name, maxHp, atk: 100, def: 200, res: 30, moveSpeed: 0.4, baseAttackTime: 1, massLevel: 3,
  applyWay: 'NONE', rangeRadius: 0, motion: 'WALK', talents: { run: { 'attack@move_speed': pct } },
});

const DUCK = duck(DUCK_KEY, 18000, 4);
const DUCK2 = duck(DUCK2_KEY, 6000, 3);

/** @type {EnemyDef} */
const SLUG = {
  name: SLUG_KEY, maxHp: 4500, atk: 200, def: 50, res: 0, moveSpeed: 1, baseAttackTime: 1.7, massLevel: 1,
  applyWay: 'MELEE', rangeRadius: -1, motion: 'WALK',
  skills: [{ key: 'StartRun', cooldown: 10, initCooldown: 0, sp: 0, bb: { move_speed: 1.5, block_free_time: 3 } }],
};

/**
 * The tiny map, `key` spawning at once. `ops` deploy on the next frame as [op, row, col, dir].
 * @param {string} key @param {EnemyDef} def @param {[string, number, number, number?][]} [ops] @param {(c: any) => void} [tune]
 */
function arena(key, def, ops = [], tune = () => {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 50, maxCost: 99, costIncreaseTime: 1000 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e7 });
  tune(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  step(w, c, ops.map(([op, row, col, dir]) => [0, { type: 'deploy', op, row, col, dir: dir ?? 0 }]));
  const e = w.units.find((u) => u.key === key);
  if (!e) throw new Error(`missing ${key}`);
  return { c, w, e };
}

/** Steps n frames. @param {World} w @param {any} c @param {number} n */
const frames = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };

/**
 * Steps until `pred` or `cap` frames. How many frames were stepped.
 * @param {World} w @param {any} c @param {() => boolean} pred @param {number} cap
 */
function until(w, c, pred, cap) {
  let n = 0;
  while (n < cap && !pred()) { step(w, c); n++; }
  return n;
}

/** @param {Unit} u */
const speed = (u) => attrs.statsOf(u).moveSpeed;
/** @param {Unit} u @param {string} key */
const has = (u, key) => u.buffs.some((b) => b.key === key);
/** @param {Unit} u @param {string} name */
const flagged = (u, name) => attrs.statsOf(u).flags[name] === true;
/** @param {Unit} u */
const runs = (u) => u.buffs.filter((b) => b.key === 'run').length;

test('[敌能-40] 鸭爵: a 0-damage hit and a heal-back do not start the run; the first HP loss does, once, with no end', () => {
  const { c, w, e } = arena(DUCK_KEY, DUCK);
  assert.equal(speed(e), 0.4);
  assert.equal(has(e, 'run:still'), true);
  assert.equal(has(e, 'run'), false);
  assert.equal(flagged(e, 'noAttack'), true);
  assert.equal(flagged(e, 'unblockable'), true);
  buffs.addBuff(e, buffs.makeBuff({ key: 'shield', shieldHits: 1 }));
  assert.equal(damage.dealDamage(w, null, e, { type: 'true', amount: 40 }), 0);
  frames(w, c, 2);
  assert.equal(speed(e), 0.4);
  status.applyStatus(e, 'invincible', {});
  assert.equal(damage.dealDamage(w, null, e, { type: 'true', amount: 40 }), 0);
  buffs.removeBuff(e, 'invincible');
  frames(w, c, 2);
  assert.equal(speed(e), 0.4);
  assert.equal(damage.dealDamage(w, null, e, { type: 'true', amount: 0 }), 0);
  frames(w, c, 2);
  assert.equal(speed(e), 0.4);
  damage.dealDamage(w, null, e, { type: 'true', amount: 40 });
  damage.heal(w, null, e, 40);
  frames(w, c, 2);
  assert.equal(e.hp, 18000);
  assert.equal(speed(e), 0.4);
  damage.dealDamage(w, null, e, { type: 'true', amount: 1 });
  assert.equal(speed(e), 0.4);
  step(w, c);
  assert.equal(speed(e), 2);
  assert.equal(runs(e), 1);
  damage.dealDamage(w, null, e, { type: 'true', amount: 1 });
  step(w, c);
  assert.equal(speed(e), 2);
  assert.equal(runs(e), 1);
  status.applyStatus(e, 'root', {});
  frames(w, c, 200);
  assert.equal(speed(e), 2);
  assert.equal(e.buffs.find((b) => b.key === 'run')?.left, -1);
});

test('[敌能-40] 鸭爵: 生命流失 and setHp that lower HP start the run; enemy_2001_duckmi_2 uses +300%', () => {
  const loss = arena(DUCK_KEY, DUCK);
  damage.dealDamage(loss.w, null, loss.e, { type: 'true', amount: 10, hpLoss: true });
  assert.equal(speed(loss.e), 0.4);
  step(loss.w, loss.c);
  assert.equal(speed(loss.e), 2);
  const set = arena(DUCK_KEY, DUCK);
  damage.setHp(set.e, set.e.hp - 10);
  assert.equal(speed(set.e), 0.4);
  step(set.w, set.c);
  assert.equal(speed(set.e), 2);
  const d2 = arena(DUCK2_KEY, DUCK2);
  damage.dealDamage(d2.w, null, d2.e, { type: 'true', amount: 1 });
  step(d2.w, d2.c);
  assert.equal(speed(d2.e), 1.6);
});

test('[敌能-40] 鸭爵 still runs while silenced', () => {
  const { c, w, e } = arena(DUCK_KEY, DUCK);
  status.applyStatus(e, 'silence', {});
  assert.equal(flagged(e, 'silence'), true);
  damage.dealDamage(w, null, e, { type: 'true', amount: 1 });
  step(w, c);
  assert.equal(speed(e), 2);
});

test('[敌能-40] 鸭爵 does not attack and is not blocked, and a chip-free guard does not start the run', () => {
  const { c, w, e } = arena(DUCK_KEY, DUCK, [['guard', 1, 0]], (content) => {
    content.operators.guard.atk = 0;
    content.operators.guard.def = 0;
  });
  const g = w.units.find((u) => u.key === 'guard');
  if (!g) throw new Error('no guard');
  const hp = g.hp;
  // The route waits 3 s on the guard's tile. 400 frames clears that wait and a tile past it at 0.4.
  frames(w, c, 400);
  assert.ok(e.x > 1, `walked to x ${e.x}`);
  assert.equal(e.blockedBy, -1);
  assert.equal(e.swing, null);
  assert.equal(g.hp, hp);
  assert.equal(speed(e), 0.4);
  assert.equal(has(e, 'run'), false);
});

test('[敌能-40] 简饲源石虫: strictly below half, +150% and unblockable for 3s, once, and it does not detour', () => {
  const { c, w, e } = arena(SLUG_KEY, SLUG);
  assert.equal(speed(e), 1);
  assert.equal(has(e, 'run'), false);
  frames(w, c, 5);
  const path = e.path.length;
  assert.ok(path > 0);
  status.applyStatus(e, 'root', {});
  damage.dealDamage(w, null, e, { type: 'true', amount: 1 });
  frames(w, c, 2);
  assert.equal(has(e, 'run'), false);
  damage.setHp(e, 2250);
  frames(w, c, 2);
  assert.equal(has(e, 'run'), false);
  damage.setHp(e, 2249);
  assert.equal(speed(e), 1);
  step(w, c);
  assert.equal(speed(e), 2.5);
  assert.equal(flagged(e, 'unblockable'), true);
  assert.equal(has(e, 'rush'), false);
  assert.equal(e.path.length, path);
  frames(w, c, 89);
  assert.equal(has(e, 'run'), true);
  assert.equal(speed(e), 2.5);
  step(w, c);
  assert.equal(has(e, 'run'), false);
  assert.equal(speed(e), 1);
  assert.equal(flagged(e, 'unblockable'), false);
  frames(w, c, 320);
  assert.equal(has(e, 'run'), false);
  assert.equal(speed(e), 1);
});

test('[敌能-40] 简饲源石虫: a hit after its turn waits until the next turn', () => {
  const { c, w, e } = arena(SLUG_KEY, SLUG, [['guard', 1, 0, 1]], (content) => { content.operators.guard.atk = 3000; });
  assert.ok(e.hp * 2 < 4500, `hp ${e.hp} was not below half in the same frame`);
  assert.equal(has(e, 'run'), false);
  assert.equal(speed(e), 1);
  step(w, c);
  assert.equal(speed(e), 2.5);
  assert.equal(flagged(e, 'unblockable'), true);
});

test('[敌能-40] 简饲源石虫: silence or stun does not spend the cast, and neither cancels a run already started', () => {
  const silenced = arena(SLUG_KEY, SLUG);
  status.applyStatus(silenced.e, 'root', {});
  status.applyStatus(silenced.e, 'silence', {});
  damage.setHp(silenced.e, 2249);
  frames(silenced.w, silenced.c, 5);
  assert.equal(has(silenced.e, 'run'), false);
  buffs.removeBuff(silenced.e, 'silence');
  step(silenced.w, silenced.c);
  assert.equal(speed(silenced.e), 2.5);
  status.applyStatus(silenced.e, 'silence', {});
  frames(silenced.w, silenced.c, 3);
  assert.equal(has(silenced.e, 'run'), true);
  assert.equal(speed(silenced.e), 2.5);
  const stunned = arena(SLUG_KEY, SLUG);
  status.applyStatus(stunned.e, 'root', {});
  status.applyStatus(stunned.e, 'stun', { seconds: 5 });
  damage.setHp(stunned.e, 2249);
  frames(stunned.w, stunned.c, 5);
  assert.equal(has(stunned.e, 'run'), false);
  assert.equal(attrs.statsOf(stunned.e).disabled, true);
  buffs.removeBuff(stunned.e, 'stun');
  step(stunned.w, stunned.c);
  assert.equal(speed(stunned.e), 2.5);
});

test('[敌能-40] 简饲源石虫: back to half or above before its turn does not start the run, and a later dip still does', () => {
  const { c, w, e } = arena(SLUG_KEY, SLUG);
  status.applyStatus(e, 'root', {});
  damage.setHp(e, 2249);
  damage.heal(w, null, e, 4500);
  step(w, c);
  assert.equal(e.hp, 4500);
  assert.equal(has(e, 'run'), false);
  damage.setHp(e, 2249);
  step(w, c);
  assert.equal(speed(e), 2.5);
});

test('[敌能-40] 简饲源石虫 attacks its blocker, and not while the run leaves it unblockable', () => {
  const { c, w, e } = arena(SLUG_KEY, SLUG, [['guard', 1, 0]], (content) => { content.operators.guard.atk = 0; });
  const g = w.units.find((u) => u.key === 'guard');
  if (!g) throw new Error('no guard');
  const before = g.hp;
  assert.ok(until(w, c, () => e.blockedBy >= 0, 60) < 60, 'reached the guard');
  assert.ok(until(w, c, () => g.hp < before, 5) < 5, 'hit the blocker');
  assert.equal(g.hp, before - 100);
  status.applyStatus(e, 'root', {});
  const held = g.hp;
  damage.setHp(e, 2249);
  step(w, c);
  assert.equal(e.blockedBy, -1);
  assert.equal(flagged(e, 'unblockable'), true);
  frames(w, c, 89);
  assert.equal(g.hp, held);
  assert.equal(has(e, 'run'), true);
  step(w, c);
  assert.equal(has(e, 'run'), false);
  assert.equal(e.blockedBy, g.id);
  assert.equal(g.hp, held - 100);
});
