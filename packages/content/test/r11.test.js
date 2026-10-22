// R-11 / R-11a 突击动力装甲 (docs/spec/foes.md 敌能-68). 血珀's Passive stays in the whip tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/** @param {number} atk @param {Record<string, Record<string, number>>} talents */
function armor(atk, talents) {
  return {
    name: 'armor', maxHp: 25000, atk, def: 1200, res: 20, moveSpeed: 0.3, baseAttackTime: 5, massLevel: 5,
    applyWay: 'RANGED', rangeRadius: 5, motion: 'WALK', talents,
  };
}

const MARKED = { Passive: { 'attack@ranged.atk_scale': 0.5, targets: 4 } };
const MARKED_NO_FLY = { Passive: { 'attack@ranged.atk_scale': 0.5, targets: 4 }, noFly: {} };
const BARE = { Passive: { 'attack@ranged.atk_scale': 0.5 } };

/** @param {any} c */
function squad(c) {
  for (const key of ['p0', 'p1', 'p2', 'p3']) c.operators[key] = { ...c.operators.guard, name: key };
}

/**
 * The enemy stands on the road at (2, 1) with its attack ready. Operators deal and take no defence, so a hit is the
 * attack times the scale.
 * @param {string} key @param {ReturnType<typeof armor>} def @param {(c: any) => void} [tweak]
 */
function field(key, def, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  if (tweak) tweak(c);
  for (const op of Object.values(c.operators)) {
    const row = /** @type {any} */ (op);
    row.cost = 0;
    row.def = 0;
    row.atk = 0;
    row.maxHp = 5000;
  }
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === key));
  e.x = 2;
  e.y = 1;
  e.path = [];
  return { c, w, e };
}

/** @param {World} w @param {any} c @param {{ op: string, row: number, col: number }[]} list */
const deployAll = (w, c, list) => step(w, c, list.map((p) => [0, { type: 'deploy', op: p.op, row: p.row, col: p.col, dir: 0 }]));

/** @param {World} w @param {any} c @param {number} n */
function settle(w, c, n) {
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < n; i++) ev.push(...step(w, c));
  return ev;
}

/** @param {World} w @param {string} key @returns {Unit} */
const opOf = (w, key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));
/** @param {any[]} ev @param {number} id */
const hitsOf = (ev, id) => ev.filter((e) => e.type === 'hit' && e.id === id);
/** @param {any[]} ev @param {number} id */
const shotsOf = (ev, id) => ev.filter((e) => e.type === 'shot' && e.id === id);

const FIVE = [
  { op: 'p0', row: 1, col: 0 }, { op: 'p1', row: 1, col: 1 }, { op: 'p2', row: 1, col: 3 },
  { op: 'p3', row: 1, col: 4 }, { op: 'sniper', row: 2, col: 2 },
];

test('[敌能-68] blocked melee hits the blocker for the full attack and nobody else, with no projectile', () => {
  const { c, w, e } = field('enemy_1256_lyacpa', armor(1200, MARKED), squad);
  const ev = deployAll(w, c, [{ op: 'p0', row: 1, col: 2 }, { op: 'sniper', row: 2, col: 2 }]);
  const blocker = opOf(w, 'p0');
  assert.equal(e.blockedBy, blocker.id);
  assert.equal(shotsOf(ev, e.id).length, 0);
  const hits = hitsOf(ev, e.id);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].target, blocker.id);
  assert.equal(hits[0].damage, 1200);
  assert.equal(opOf(w, 'sniper').hp, opOf(w, 'sniper').maxHp);
});

test('[敌能-68] unblocked ranged shots hit four of five at half strength, later deployed first', () => {
  const { c, w, e } = field('enemy_1256_lyacpa', armor(1200, MARKED), squad);
  const ev = deployAll(w, c, FIVE);
  assert.equal(e.blockedBy, -1);
  const want = ['sniper', 'p3', 'p2', 'p1'].map((k) => opOf(w, k).id);
  assert.deepEqual(shotsOf(ev, e.id).map((s) => s.target), want);
  assert.equal(hitsOf(ev, e.id).length, 0);
  const hits = hitsOf(settle(w, c, 20), e.id);
  assert.equal(hits.length, 4);
  assert.ok(hits.every((h) => h.damage === 600));
  assert.deepEqual([...hits.map((h) => h.target)].sort((a, b) => a - b), [...want].sort((a, b) => a - b));
  assert.equal(opOf(w, 'p0').hp, opOf(w, 'p0').maxHp);
});

test('[敌能-68] fewer than four targets in range are all hit at half strength', () => {
  const { c, w, e } = field('enemy_1256_lyacpa', armor(1200, MARKED), squad);
  const ev = deployAll(w, c, [{ op: 'p0', row: 1, col: 0 }, { op: 'p1', row: 1, col: 4 }]);
  assert.equal(shotsOf(ev, e.id).length, 2);
  const hits = hitsOf(settle(w, c, 20), e.id);
  assert.equal(hits.length, 2);
  assert.ok(hits.every((h) => h.damage === 600));
  assert.equal(opOf(w, 'p0').hp, 4400);
  assert.equal(opOf(w, 'p1').hp, 4400);
});

test('[敌能-68] R-11 melees a flying blocker and does not hit a flyer that is only in range', () => {
  const blocked = field('enemy_1256_lyacpa', armor(1200, MARKED), (c) => { c.operators.guard.motion = 'FLY'; });
  const ev = deployAll(blocked.w, blocked.c, [{ op: 'guard', row: 1, col: 2 }, { op: 'sniper', row: 2, col: 2 }]);
  const flyer = opOf(blocked.w, 'guard');
  assert.equal(blocked.e.blockedBy, flyer.id);
  assert.equal(shotsOf(ev, blocked.e.id).length, 0);
  const hits = hitsOf(ev, blocked.e.id);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].target, flyer.id);
  assert.equal(hits[0].damage, 1200);
  assert.equal(opOf(blocked.w, 'sniper').hp, opOf(blocked.w, 'sniper').maxHp);
  const open = field('enemy_1256_lyacpa', armor(1200, MARKED), (c) => { c.operators.sniper.motion = 'FLY'; });
  const shot = deployAll(open.w, open.c, [{ op: 'sniper', row: 2, col: 2 }, { op: 'guard', row: 1, col: 0 }]);
  assert.equal(open.e.blockedBy, -1);
  assert.deepEqual(shotsOf(shot, open.e.id).map((s) => s.target), [opOf(open.w, 'guard').id]);
  const landed = hitsOf(settle(open.w, open.c, 20), open.e.id);
  assert.equal(landed.length, 1);
  assert.equal(landed[0].damage, 600);
  assert.equal(opOf(open.w, 'sniper').hp, opOf(open.w, 'sniper').maxHp);
});

test('[敌能-68] R-11a ignores a flying blocker and does not hit someone else instead', () => {
  const blocked = field('enemy_1256_lyacpa_2', armor(1350, MARKED_NO_FLY), (c) => { c.operators.guard.motion = 'FLY'; });
  const ev = deployAll(blocked.w, blocked.c, [{ op: 'guard', row: 1, col: 2 }, { op: 'sniper', row: 2, col: 2 }]);
  assert.equal(blocked.e.blockedBy, opOf(blocked.w, 'guard').id);
  assert.equal(shotsOf(ev, blocked.e.id).length, 0);
  assert.equal(hitsOf(ev, blocked.e.id).length, 0);
  assert.equal(opOf(blocked.w, 'guard').hp, opOf(blocked.w, 'guard').maxHp);
  assert.equal(opOf(blocked.w, 'sniper').hp, opOf(blocked.w, 'sniper').maxHp);
  const open = field('enemy_1256_lyacpa_2', armor(1350, MARKED_NO_FLY), (c) => { c.operators.sniper.motion = 'FLY'; });
  const shot = deployAll(open.w, open.c, [{ op: 'sniper', row: 2, col: 2 }, { op: 'guard', row: 1, col: 0 }]);
  assert.equal(open.e.blockedBy, -1);
  assert.deepEqual(shotsOf(shot, open.e.id).map((s) => s.target), [opOf(open.w, 'guard').id]);
  const landed = hitsOf(settle(open.w, open.c, 20), open.e.id);
  assert.equal(landed.length, 1);
  assert.equal(landed[0].damage, 675);
  assert.equal(opOf(open.w, 'sniper').hp, opOf(open.w, 'sniper').maxHp);
});

test('[敌能-68] silence does not stop the unblocked half-strength shots', () => {
  const { c, w, e } = field('enemy_1256_lyacpa', armor(1200, MARKED), squad);
  assert.equal(status.applyStatus(e, 'silence', {}) !== null, true);
  const ev = deployAll(w, c, [{ op: 'p0', row: 1, col: 0 }, { op: 'p1', row: 1, col: 4 }]);
  assert.equal(shotsOf(ev, e.id).length, 2);
  const hits = hitsOf(settle(w, c, 20), e.id);
  assert.equal(hits.length, 2);
  assert.ok(hits.every((h) => h.damage === 600));
});

test('[敌能-68] a Passive scale without the page cap stays a normal one-target shot', () => {
  const { c, w, e } = field('plain', armor(1200, BARE), squad);
  const ev = deployAll(w, c, [{ op: 'p0', row: 1, col: 0 }, { op: 'p1', row: 1, col: 4 }]);
  const shots = shotsOf(ev, e.id);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].target, opOf(w, 'p1').id);
  const hits = hitsOf(settle(w, c, 20), e.id);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].damage, 1200);
  assert.equal(opOf(w, 'p0').hp, opOf(w, 'p0').maxHp);
});

test('[敌能-68] only the seed shape and the armor shape with its cap are covered', () => {
  const gaps = (/** @type {any} */ def) => uncoveredAbilities([def]);
  const row = (/** @type {Record<string, number>} */ bb) => ({ name: 'p', maxHp: 1, atk: 1, def: 0, res: 0, moveSpeed: 0, talents: { Passive: bb } });
  const raw = row({ 'attack@ranged.atk_scale': 0.5 });
  assert.deepEqual(gaps(raw), ['Passive']);
  assert.deepEqual(gaps(withFoeExtras('enemy_1256_lyacpa', raw)), []);
  const a = withFoeExtras('enemy_1256_lyacpa_2', raw);
  assert.equal(a.talents?.Passive?.targets, 4);
  assert.deepEqual(a.talents?.noFly, {});
  assert.deepEqual(gaps(a), []);
  assert.deepEqual(gaps(row({ 'attack@ranged.atk_scale': 0.5, targets: 4, extra: 1 })), ['Passive']);
  assert.deepEqual(gaps(row({ targets: 4 })), ['Passive']);
  assert.deepEqual(gaps(row({ damage_resistance: 0, hp_ratio: 0.1 })), []);
  assert.deepEqual(gaps(row({ damage_resistance: 0.3, hp_ratio: 0.1 })), ['Passive']);
  assert.deepEqual(gaps(row({ hp_ratio: 0.04 })), ['Passive']);
  assert.deepEqual(gaps(row({ damage_resistance: 0, hp_ratio: 0.1, duration: 1 })), ['Passive']);
});
