// 长臂投手 / 「精准制导」长臂投手 (docs/spec/foes.md 敌能-121): unblockable (敌能-69) and noFly (敌能-33).
// The 200% against 设施 and the attack order are not this family. Records come from the fortress levels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelContent } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const PITCH = 'enemy_4010_mubsbl';
const PITCH2 = 'enemy_4010_mubsbl_2';
const IRON = 'enemy_4009_murgby';
const IRON2 = 'enemy_4009_murgby_2';
const RM = 'act1multi_fortress_rm01';
const HARD = 'act1multi_fortress_hard-01';

const rm = levelContent(RM, 'NORMAL').enemies;
const rm4 = levelContent(RM, 'FOUR_STAR').enemies;
const hard = levelContent(HARD, 'NORMAL').enemies;
const hard4 = levelContent(HARD, 'FOUR_STAR').enemies;

/** @param {Record<string, any>} enemies @param {string} key */
function record(enemies, key) {
  const d = enemies[key];
  if (!d) throw new Error(`missing ${key}`);
  return d;
}

/**
 * One real enemy on the tiny map, after the spawn frame. Operators do not hurt it.
 * @param {string} key @param {any} def @param {(c: any) => void} [tweak]
 */
function open(key, def, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: { ...def } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  for (const op of Object.values(c.operators)) {
    const row = /** @type {any} */ (op);
    row.atk = 0;
    row.maxHp = 1e7;
    row.cost = 0;
  }
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.key === key);
  if (!e) throw new Error(`missing ${key}`);
  return { c, w, e };
}

/** @param {any[]} ev @param {number} id */
const attacks = (ev, id) => ev.filter((x) => x.type === 'attack' && x.id === id);
/** @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col */
const deploy = (w, c, op, row, col) => step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
/** @param {World} w @param {string} key @returns {Unit} */
function opOf(w, key) {
  const u = w.units.find((x) => x.key === key);
  if (!u) throw new Error(key);
  return u;
}

/** Holds the enemy on the road with its attack ready. @param {Unit} e */
function pin(e) {
  e.x = 2;
  e.y = 1;
  e.atkCd = 0;
  status.applyStatus(e, 'root', {});
}

/** A guard on the road they walk onto cannot hold them, and they pass it. @param {string} key @param {any} def */
function walksPast(key, def) {
  const { c, w, e } = open(key, def);
  deploy(w, c, 'guard', 1, 0);
  assert.equal(e.blockedBy, -1);
  assert.equal(attrs.statsOf(e).flags.unblockable, true);
  assert.equal(attrs.statsOf(e).flags.noAttack, undefined);
  for (let i = 0; i < 400; i++) step(w, c);
  assert.equal(e.blockedBy, -1);
  assert.equal(attrs.statsOf(e).flags.unblockable, true);
  assert.ok(e.x > 1, `${key} x=${e.x}`);
}

/**
 * A flyer in range is not the attack; a ground sniper is. The flyer stands outside the block radius.
 * An unblocked ranged search already skips a flyer who is not the blocker (敌人攻击-1). noFly still drops a flyer
 * who is already a candidate; that path is not reachable here, because unblockable releases a forced block first.
 * The played record's empty `noFly` is what pins the marker (敌能-121).
 * @param {string} key @param {any} def
 */
function skipsFlyer(key, def) {
  const { c, w, e } = open(key, def, (cc) => { cc.operators.guard.motion = 'FLY'; });
  pin(e);
  const ev = deploy(w, c, 'guard', 1, 1);
  const flyer = opOf(w, 'guard');
  assert.equal(attrs.statsOf(flyer).flying, true);
  assert.equal(e.blockedBy, -1);
  assert.equal(attacks(ev, e.id).length, 0);
  assert.equal(flyer.hp, flyer.maxHp);
  const shot = deploy(w, c, 'sniper', 2, 2);
  const got = attacks(shot, e.id);
  assert.equal(got.length, 1);
  assert.equal(got[0].target, opOf(w, 'sniper').id);
  assert.equal(flyer.hp, flyer.maxHp);
}

/** Walks onto a guard. Events run through the first attack after the block. @param {string} key @param {any} def @param {(c: any) => void} [tweak] */
function meet(key, def, tweak) {
  const { c, w, e } = open(key, def, tweak);
  deploy(w, c, 'guard', 1, 0);
  /** @type {any[]} */
  const ev = [];
  for (let n = 0; n < 180 && e.blockedBy < 0; n++) ev.push(...step(w, c));
  if (e.blockedBy < 0) throw new Error(`${key} was not blocked`);
  for (let n = 0; n < 120 && attacks(ev, e.id).length === 0; n++) ev.push(...step(w, c));
  return { e, ev, g: opOf(w, 'guard') };
}

test('[敌能-121] fortress records give both pitchers unblockable and noFly, and not 铁头前锋', () => {
  for (const [enemies, key] of [[rm, PITCH], [rm4, PITCH2], [hard, PITCH2], [hard4, PITCH2]]) {
    const d = record(/** @type {Record<string, any>} */ (enemies), /** @type {string} */ (key));
    assert.deepEqual(d.talents?.unblockable, {});
    assert.deepEqual(d.talents?.noFly, {});
  }
  assert.equal(rm4[PITCH], undefined);
  assert.equal(hard[PITCH], undefined);
  assert.equal(hard4[PITCH], undefined);
  for (const [enemies, key] of [[rm, IRON], [rm4, IRON2], [hard, IRON2], [hard4, IRON2]]) {
    const d = record(/** @type {Record<string, any>} */ (enemies), /** @type {string} */ (key));
    assert.equal(d.talents?.unblockable, undefined);
    assert.equal(d.talents?.noFly, undefined);
  }
  assert.equal(rm4[IRON], undefined);
});

test('[敌能-121] a guard cannot block either pitcher, and they walk past', () => {
  walksPast(PITCH, record(rm, PITCH));
  walksPast(PITCH2, record(hard, PITCH2));
});

test('[敌能-121] a flying operator is not a candidate; a ground operator is', () => {
  skipsFlyer(PITCH, record(rm, PITCH));
  skipsFlyer(PITCH2, record(rm4, PITCH2));
});

test('[敌能-121] 铁头前锋 is still blocked and still attacks a flying blocker', () => {
  const held = meet(IRON, record(rm, IRON));
  assert.equal(held.e.blockedBy, held.g.id);
  assert.equal(attrs.statsOf(held.e).flags.unblockable, undefined);
  const fly = meet(IRON2, record(hard, IRON2), (c) => { c.operators.guard.motion = 'FLY'; });
  assert.equal(fly.e.blockedBy, fly.g.id);
  assert.equal(attrs.statsOf(fly.g).flying, true);
  assert.equal(attrs.statsOf(fly.e).flags.unblockable, undefined);
  const got = attacks(fly.ev, fly.e.id);
  assert.equal(got.length >= 1, true);
  assert.equal(got[0].target, fly.g.id);
});

test('[敌能-121] silence does not let a guard block them or make a flyer a candidate', () => {
  const { c, w, e } = open(PITCH, record(rm, PITCH), (cc) => { cc.operators.guard.motion = 'FLY'; });
  assert.equal(status.applyStatus(e, 'silence', {}) !== null, true);
  pin(e);
  const ev = deploy(w, c, 'guard', 1, 0);
  assert.equal(attrs.statsOf(e).flags.silence, true);
  assert.equal(attrs.statsOf(e).flags.unblockable, true);
  assert.equal(e.blockedBy, -1);
  assert.equal(attacks(ev, e.id).length, 0);
  assert.equal(opOf(w, 'guard').hp, opOf(w, 'guard').maxHp);
});
