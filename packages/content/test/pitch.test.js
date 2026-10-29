// 阵地足球's pitch (docs/spec/football.md 足球-13, 足球-14) with IG-FT-1's records as extracted: one of ours on a 守门位
// blocks 3 more and takes no place in the deploy limit; a ball it stops is caught as a card of its seat, deployed on our
// half — the ball back there at rest — or, after 5 s, back where it was caught.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, attrs, deployProblem } from '@aue/sim';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities } from '../src/foes.js';
import { profiledDevices } from '../src/devices.js';
import { withBallCards } from '../src/pitch.js';
import football from '../data/levels/act1multi_football.json' with { type: 'json' };

/** @typedef {import('@aue/sim').Unit} Unit */

const E = /** @type {Record<string, any>} */ (football.enemies), F = /** @type {any} */ (football);
const SPOT = 'enemy_4021_muredy', BALL = 'enemy_4015_musucr', CARD = 'trap_165_muftbl#0';

/** IG-FT-1's tiles as extracted: our half (columns 1…6) marked for the ball card. */
const TILES = F.level.tiles;

/**
 * IG-FT-1's field with these enemies at points, each where it spawned, and a deck of two operators and the ball card.
 * @param {[string, number, number][]} units [key, x, y] @param {number} [limit] the deploy limit
 */
function field(units, limit = 4) {
  const routes = units.map(([, x, y]) => ({ start: { row: y, col: x }, end: { row: y, col: 0 }, motion: 'WALK',
    checkpoints: [{ type: 'WAIT_FOR_SECONDS', row: y, col: x, time: 999, dx: 0, dy: 0 }] }));
  const op = { position: 'MELEE', maxHp: 1e6, atk: 1, def: 0, res: 0, cost: 10, blockCnt: 1, baseAttackTime: 1, respawnTime: 1, range: [] };
  const devices = profiledDevices({ trap_165_muftbl: F.devices.trap_165_muftbl }).devices, decks = [['a#0', 'b#0', 'c#0']];
  /** @type {Record<string, any>} */
  const operators = { 'a#0': { ...op, name: 'a' }, 'b#0': { ...op, name: 'b' }, 'c#0': { ...op, name: 'c' } };
  withBallCards(F.level, devices, operators, decks);
  const c = /** @type {any} */ ({
    level: { id: 'ft', width: 13, height: 9, tiles: TILES, routes, cards: F.level.cards, football: F.level.football,
      waves: [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions: units.map(([key], i) => ({ type: 'SPAWN', key, route: i, count: 1, preDelay: 0, interval: 1 })) }] }],
      options: { maxLifePoint: 99, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: limit, moveMultiplier: 0.5 } },
    enemies: Object.fromEntries(units.map(([k]) => [k, E[k]])), devices, operators, decks, behaviors: skeletonContent.behaviors,
  });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  for (const [i, u] of w.units.entries()) { u.x = units[i][1]; u.y = units[i][2]; }
  return { w, c };
}

const by = (/** @type {any} */ w, /** @type {string} */ key) => /** @type {Unit} */ (w.units.find((/** @type {Unit} */ u) => u.key === key));
const run = (/** @type {any} */ w, /** @type {any} */ c, /** @type {number} */ n, /** @type {any[]} */ cmds = []) => { for (let i = 0; i < n; i++) step(w, c, i === 0 ? cmds : []); };
/** @param {string} op @param {number} row @param {number} col */
const deploy = (op, row, col) => /** @type {[number, any]} */ ([0, { type: 'deploy', op, row, col, dir: 1 }]);

test('[足球-13] one of ours on a 守门位 blocks 3 more and takes no place; the 守门位 takes no harm and is no target', () => {
  const { w, c } = field([[SPOT, 1, 4]], 1);
  run(w, c, 1, [deploy('a#0', 4, 3)]);
  assert.equal(deployProblem(w, c, 0, deploy('b#0', 2, 3)[1]), 'deploy limit reached');
  assert.equal(deployProblem(w, c, 0, deploy('b#0', 4, 1)[1]), null, 'onto the 守门位 at the limit');
  run(w, c, 1, [deploy('b#0', 4, 1)]);
  const keeper = by(w, 'b#0');
  assert.equal(attrs.statsOf(keeper).blockCnt, 1 + 3);
  assert.equal(attrs.statsOf(by(w, 'a#0')).blockCnt, 1);
  assert.equal(deployProblem(w, c, 0, deploy('c#0', 2, 3)[1]), 'deploy limit reached', 'the keeper takes no place, the other does');
  const spot = by(w, SPOT), flags = attrs.statsOf(spot).flags;
  assert.deepEqual([flags.invincible, flags.untargetable, flags.unblockable, flags.root, flags.noAttack], [true, true, true, true, true]);
  damage.dealDamage(w, keeper, spot, { type: 'true', amount: 100 }, c);
  assert.equal(spot.hp, spot.maxHp);
  assert.deepEqual(uncoveredAbilities([E[SPOT]]), []);
});

test('[足球-14] the goalkeeper catches a ball: hidden, a card of its seat; deployed on our half it is back there at rest, its cost paid', () => {
  const { w, c } = field([[SPOT, 1, 4], [BALL, 4, 4]]);
  run(w, c, 1, [deploy('b#0', 4, 1)]);
  run(w, c, 1, [deploy('a#0', 4, 6)]);
  const b = by(w, BALL);
  damage.dealDamage(w, by(w, 'a#0'), b, { type: 'phys', amount: 1e5 }, c);
  assert.ok(b.slide && b.slide.vx < 0, 'kicked toward our goal');
  for (let i = 0; i < 90 && !b.hidden; i++) step(w, c);
  assert.equal(b.hidden, true, 'caught');
  assert.equal(b.slide, undefined);
  assert.deepEqual(w.players[0].balls?.map((x) => [x.id, x.row, x.col]), [[b.id, 4, 1]]);
  assert.equal(deployProblem(w, c, 0, deploy(CARD, 4, 8)[1]), 'not on our half');
  const cost = w.players[0].cost;
  run(w, c, 1, [deploy(CARD, 2, 3)]);
  assert.deepEqual([b.hidden, b.x, b.y, b.slide], [false, 3, 2, undefined]);
  assert.equal(w.players[0].cost, cost - 3, 'the record\'s cost, 3');
  assert.equal(w.players[0].balls, undefined);
  assert.equal(deployProblem(w, c, 0, deploy(CARD, 2, 4)[1]), 'no ball held');
});

test('[足球-14] a card not deployed in 5 s puts the ball back where it was caught', () => {
  const { w, c } = field([[SPOT, 1, 4], [BALL, 4, 4]]);
  run(w, c, 1, [deploy('b#0', 4, 1)]);
  run(w, c, 1, [deploy('a#0', 4, 6)]);
  const b = by(w, BALL);
  damage.dealDamage(w, by(w, 'a#0'), b, { type: 'phys', amount: 1e5 }, c);
  for (let i = 0; i < 90 && !b.hidden; i++) step(w, c);
  const until = /** @type {any} */ (w.players[0].balls)[0].until;
  while (w.frame < until) step(w, c);
  assert.equal(b.hidden, true, 'not before its last frame');
  step(w, c);
  assert.deepEqual([b.hidden, b.x, b.y], [false, 1, 4]);
  assert.equal(w.players[0].balls, undefined);
});

test('[渲染-1] [足球-14] a caught ball is not in the render state; back on the field it is again', async () => {
  const { toView } = await import('@aue/sim');
  const { readView } = await import('@aue/schema');
  const { w, c } = field([[SPOT, 1, 4], [BALL, 4, 4]]);
  run(w, c, 1, [deploy('b#0', 4, 1)]);
  run(w, c, 1, [deploy('a#0', 4, 6)]);
  const b = by(w, BALL), ids = () => readView(toView(w)).units.map((u) => u.id);
  damage.dealDamage(w, by(w, 'a#0'), b, { type: 'phys', amount: 1e5 }, c);
  for (let i = 0; i < 90 && !b.hidden; i++) step(w, c);
  assert.equal(ids().includes(b.id), false);
  run(w, c, 1, [deploy(CARD, 2, 3)]);
  assert.equal(ids().includes(b.id), true);
});
