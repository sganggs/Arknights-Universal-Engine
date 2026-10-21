// Talent `bus` (docs/spec/foes.md 敌能-16): 伊利昂的木驮兽 is not in a level yet, so the record is built here.
// “越长尘” is the real enemy_1302_ymtro_2 and must keep the centre unload.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, draw, routes } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { foeBehaviors, levelContent } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const CAMEL = {
  name: '伊利昂的木驮兽', maxHp: 28000, atk: 0, def: 600, res: 10, moveSpeed: 1, tags: ['machine'],
  talents: { bus: { max_cnt: 5, move_speed: -0.2, half_cnt: 2 } },
};
const RIDER = { name: 'rider', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 1 };
const FAR = { start: { row: 0, col: 5 }, end: { row: 0, col: 4 }, motion: 'WALK', checkpoints: [{ type: 'MOVE', row: 0, col: 4, time: 0 }] };

/**
 * Tiny map, camel first on route 0 and the other keys on a far route. One frame has already run.
 * @param {number} seed @param {string[]} keys @param {(c: any) => void} [tweak]
 */
function world(seed, keys, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { ...c.enemies, camel: CAMEL, rider: RIDER };
  c.behaviors = { foes: foeBehaviors };
  c.level.routes.push(FAR);
  c.level.waves = [oneWave(keys.map((k, i) => spawnAt(0, k, { route: i === 0 ? 0 : 1 })))];
  c.level.options = { ...c.level.options, initialCost: 50, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  tweak?.(c);
  const w = createWorld(c, { seed, players: 1 });
  step(w, c);
  return { c, w };
}

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  for (let i = 0; i < n; i++) step(w, c);
}

/** @param {Unit} u */
const speedOf = (u) => attrs.statsOf(u).moveSpeed;

/** Root every enemy and put the riders on the camel, except those left far. @param {World} w @param {number} near */
function pile(w, near) {
  const units = w.units.filter((u) => u.owner < 0);
  for (const u of units) status.applyStatus(u, 'root', {});
  const camel = /** @type {Unit} */ (units.find((u) => u.key === 'camel'));
  const riders = units.filter((u) => u.key === 'rider');
  camel.x = 1.3;
  camel.y = 0.2;
  riders.forEach((r, i) => { r.x = i < near ? camel.x : 5; r.y = i < near ? camel.y : 0; });
  return { camel, riders };
}

/** One tenth, so 0.799999999 and 0.8000000001 both read 0.8. @param {number} v */
const tenth = (v) => Math.round(v * 10) / 10;

test('[敌能-16] 木驮兽: each passenger is −20% move speed, added, and five sit on the 0.1 floor', () => {
  const { w, c } = world(1, ['camel', 'rider', 'rider', 'rider', 'rider', 'rider', 'rider']);
  const { camel, riders } = pile(w, 0);
  run(w, c, 1);
  /** @type {number[]} */
  const got = [speedOf(camel)];
  for (let i = 0; i < 5; i++) {
    riders[i].x = camel.x;
    riders[i].y = camel.y;
    run(w, c, 1);
    got.push(speedOf(camel));
  }
  riders[5].x = camel.x;
  riders[5].y = camel.y;
  run(w, c, 1);
  assert.deepEqual(got.map(tenth), [1, 0.8, 0.6, 0.4, 0.2, 0.1]);
  assert.equal(tenth(speedOf(camel)), 0.1, 'a sixth passenger does not board');
  assert.equal(riders.filter((r) => r.hidden).length, 5);
  assert.equal(attrs.statsOf(camel).blockCnt, 1, 'no extra 阻挡数');
  c.level.tiles[0][1] = { ...c.level.tiles[0][1], key: 'tile_stairs' };
  run(w, c, 2);
  assert.equal(riders.filter((r) => r.hidden).length, 5, 'a 云梯 is not where it unloads');
  assert.equal(tenth(speedOf(camel)), 0.1);
});

test('[敌能-16] 木驮兽 does not board while it cannot act', () => {
  const { w, c } = world(1, ['camel', 'rider']);
  const { camel, riders } = pile(w, 1);
  status.applyStatus(camel, 'stun', {});
  run(w, c, 1);
  assert.equal(riders[0].hidden, false);
});

/**
 * Board two riders, stand the camel on a wait leg off the tile centre, then knock it down.
 * @param {number} seed
 */
function unloaded(seed) {
  const { w, c } = world(seed, ['camel', 'rider', 'rider']);
  const { camel, riders } = pile(w, 2);
  camel.leg = 1;
  for (const r of riders) { r.route = 1; r.leg = 0; }
  run(w, c, 1);
  assert.ok(riders.every((r) => r.hidden));
  const rng = w.rng;
  camel.hp = 0;
  run(w, c, 1);
  return { c, camel, riders, rng };
}

/** @param {Unit} camel @param {Unit[]} riders @param {number} rng */
function expectSquare(camel, riders, rng) {
  const ghost = { rng };
  const half = 0.2;
  const want = riders.map(() => [camel.x + (draw(ghost) * 2 - 1) * half, camel.y + (draw(ghost) * 2 - 1) * half]);
  const got = riders.map((r) => [r.x, r.y]);
  assert.deepEqual(got, want, 'the battle rng, x then y, in unit order');
  for (const r of riders) {
    assert.ok(Math.abs(r.x - camel.x) <= half + 1e-9 && Math.abs(r.y - camel.y) <= half + 1e-9);
  }
  assert.ok(riders.some((r) => r.x !== Math.round(camel.x) || r.y !== Math.round(camel.y)));
}

test('[敌能-16] 木驮兽 knocked down: its passengers alight inside the 0.4 square from the seeded RNG, onto its remaining route', () => {
  const a = unloaded(1);
  const b = unloaded(1);
  const d = unloaded(2);
  expectSquare(a.camel, a.riders, a.rng);
  assert.deepEqual(a.riders.map((r) => [r.x, r.y]), b.riders.map((r) => [r.x, r.y]));
  assert.notDeepEqual(a.riders.map((r) => [r.x, r.y]), d.riders.map((r) => [r.x, r.y]));
  assert.equal(routes.legsOf(a.c.level.routes[0])[1].t, 'wait');
  for (const r of a.riders) assert.deepEqual([r.route, r.leg, r.hidden], [a.camel.route, 2, false], 'the wait it was on is skipped');
});

test('[敌能-16] 木驮兽 walks through a guard that blocks an ordinary enemy', () => {
  const blocked = (/** @type {string} */ key) => {
    const { w, c } = world(1, [key]);
    step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 0, dir: 0 }]]);
    run(w, c, 40);
    const e = /** @type {Unit} */ (w.units.find((u) => u.key === key));
    const g = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
    return { e, held: e.blockedBy === g.id, on: (e.x - g.x) * (e.x - g.x) + (e.y - g.y) * (e.y - g.y) < 0.25 };
  };
  const camel = blocked('camel');
  const slime = blocked('slime');
  assert.equal(attrs.statsOf(camel.e).flags.unblockable, true);
  assert.deepEqual([camel.on, camel.held], [true, false], 'it stands on the guard');
  assert.equal(slime.held, true, 'the same guard blocks an ordinary enemy on the way in');
});

test('[敌能-16] 越长尘 still unloads at the tile centre, keeps the passenger\'s route, and does not slow', () => {
  const real = levelContent('act1multi_06', 'NORMAL');
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { ...c.enemies, ...real.enemies };
  c.behaviors = real.behaviors;
  c.level.routes.push(FAR);
  c.level.tiles[0][5] = { ...c.level.tiles[0][5], key: 'tile_stairs' };
  c.level.waves = [oneWave([spawnAt(0, 'enemy_1302_ymtro_2'), spawnAt(0, 'enemy_1337_bhrknf')])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const [bus, rider] = w.units.filter((u) => u.owner < 0);
  status.applyStatus(bus, 'root', {});
  status.applyStatus(rider, 'root', {});
  bus.x = 1;
  bus.y = 0;
  rider.x = 1.2;
  rider.y = 0;
  run(w, c, 1);
  assert.equal(rider.hidden, true);
  assert.equal(speedOf(bus), bus.base.moveSpeed);
  assert.equal(attrs.statsOf(bus).blockCnt, 4);
  rider.route = 1;
  rider.leg = 0;
  bus.leg = 2;
  bus.x = 5.3;
  bus.y = 0.2;
  const rng = w.rng;
  run(w, c, 1);
  assert.deepEqual([rider.hidden, rider.x, rider.y, rider.route, rider.leg], [false, 5, 0, 1, 0]);
  assert.equal(w.rng, rng, 'the centre unload draws nothing');
  assert.equal(speedOf(bus), bus.base.moveSpeed);
});
