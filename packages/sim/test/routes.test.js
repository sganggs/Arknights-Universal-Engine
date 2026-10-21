// Routes (docs/spec/paths.md 路线-1…路线-4) and the path distance of 仇恨值 (targeting.md 索敌-6), on hand-made maps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/index.js';
import { oneWave, spawnAt } from '@aue/testkit';
import { legsOf, nextLeg, planLeg, segmentClear, followRoute, pathDistance, displace } from '../src/routes.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { selectable } from '../src/targeting.js';
import { tryBlock } from '../src/blocking.js';
import { dealDamage } from '../src/damage.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

const ROAD = { key: 'tile_road', height: 'LOWLAND', buildable: 'MELEE', passable: 'ALL', side: 'ALL' };
const WALL = { key: 'tile_wall', height: 'HIGHLAND', buildable: 'RANGED', passable: 'FLY_ONLY', side: 'ALL' };

/**
 * Content on a map of '.' road and '#' wall, rows bottom first, with the given routes and an enemy of move speed 3 (a
 * tenth of a tile per frame at moveMultiplier 1).
 * @param {string[]} rows @param {any[]} routes @returns {any}
 */
function content(rows, routes) {
  return {
    level: { id: 't', width: rows[0].length, height: rows.length, tiles: rows.map((s) => [...s].map((ch) => (ch === '#' ? WALL : ROAD))), waves: [],
      options: { maxLifePoint: 3, initialCost: 10, maxCost: 99, costIncreaseTime: 1, characterLimit: 9, moveMultiplier: 1 }, routes },
    enemies: { e: { name: 'e', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 3 } },
    operators: { g: { name: 'g', position: 'MELEE', cost: 1, blockCnt: 1, baseAttackTime: 1, maxHp: 1000, atk: 0, def: 0, res: 0, range: [] } },
  };
}
/** @param {number} row @param {number} col */
const at = (row, col) => ({ row, col });
/** @param {string} type @param {number} row @param {number} col @param {number} [time] @param {[number, number]} [off] the reach offset */
const cp = (type, row, col, time = 0, off = [0, 0]) => ({ type, row, col, time, dx: off[0], dy: off[1] });
const OPEN = ['........', '........', '........', '........'];

/** A world with one enemy of route 0 placed. @param {any} c @param {number} [frag] @returns {[World, Unit]} */
function withEnemy(c, frag = 0) {
  const w = createWorld(c, { seed: 1, players: 1 }), e = makeEnemy(w, c, { key: 'e', route: 0, frag });
  w.units.push(e);
  return [w, e];
}
/** Frames of the enemy's route until it reaches the end (or `max`), recording (frame, x, y). @param {World} w @param {any} c @param {Unit} e */
function runRoute(w, c, e, max = 600) {
  /** @type {[number, number, number][]} */
  const trail = [];
  for (let f = 0; f < max; f++) {
    w.frame = f;
    const done = followRoute(w, c, e, 0.1);
    trail.push([f, e.x, e.y]);
    if (done) return { trail, end: f };
  }
  return { trail, end: -1 };
}

test('[路线-1] legs: every checkpoint type, then a final move to the end; an unknown type is refused', () => {
  const r = { start: at(0, 0), end: at(0, 7), motion: 'WALK', checkpoints: [cp('MOVE', 1, 1, 0, [0.25, -0.5]), cp('WAIT_FOR_SECONDS', 0, 0, 1.5), cp('PATROL_MOVE', 2, 2),
    cp('WAIT_CURRENT_FRAGMENT_TIME', 0, 0, 2), cp('DISAPPEAR', 0, 0, 0.1), cp('APPEAR_AT_POS', 3, 4)] };
  assert.deepEqual(legsOf(r), [
    { t: 'move', r: 1, c: 1, x: 1.25, y: 0.5, final: false, patrol: false }, { t: 'wait', frames: 45 },
    { t: 'move', r: 2, c: 2, x: 2, y: 2, final: false, patrol: true }, { t: 'until', frames: 60 }, { t: 'disappear' }, { t: 'wait', frames: 3 },
    { t: 'appear', x: 4, y: 3 }, { t: 'move', r: 0, c: 7, x: 7, y: 0, final: true, patrol: false },
  ]);
  assert.equal(legsOf(r), legsOf(r), 'cached beside the route');
  assert.throws(() => legsOf({ ...r, checkpoints: [cp('ALERT', 0, 0)] }), /unknown checkpoint type ALERT/);
});

test('[路线-2] ground enemies follow the smoothed field around walls; flyers go straight; the end is the reach point', () => {
  const rows = ['........', '..##....', '..##....', '........'];
  const c = content(rows, [{ start: at(2, 0), end: at(2, 6), motion: 'WALK', checkpoints: [] }, { start: at(2, 0), end: at(2, 6), motion: 'FLY', checkpoints: [] }]);
  const [w, e] = withEnemy(c);
  const leg = /** @type {any} */ (legsOf(c.level.routes[0])[0]);
  assert.deepEqual(planLeg(c, c.level.routes[0], e, leg), [1, 3, 6, 3, 6, 2], 'round the walls by row 3');
  assert.deepEqual(planLeg(c, c.level.routes[1], e, leg), [6, 2]);
  const { trail, end } = runRoute(w, c, e);
  assert.ok(end > 0 && e.x === 6 && e.y === 2);
  for (const [, x, y] of trail) assert.ok(!(x > 1.5 && x < 3.5 && y > 0.5 && y < 2.5), `never inside the walls: ${x},${y}`);
});

test('[路线-2] a leg no field reaches goes straight; an off-centre start backs up to the tile centre when the straight line is cut', () => {
  const rows = ['...#.#.', '#..#...', '.......', '###....', '....#..'];
  const c = content(rows, [{ start: at(0, 0), end: at(4, 2), motion: 'WALK', checkpoints: [] }]);
  const [, e] = withEnemy(c);
  const leg = /** @type {any} */ (legsOf(c.level.routes[0])[0]);
  assert.deepEqual(planLeg(c, c.level.routes[0], e, leg), [2, 1, 2, 2, 3, 2, 3, 4, 2, 4], 'from the centre of (0, 0)');
  e.y = 0.4;
  assert.deepEqual(planLeg(c, c.level.routes[0], e, leg), [0, 0, 2, 1, 2, 2, 3, 2, 3, 4, 2, 4], 'the line from (0, 0.4) to (2, 1) cuts the wall at (1, 0): back to the centre first');
  e.x = 0.3; e.y = 0;
  assert.deepEqual(planLeg(c, c.level.routes[0], e, leg).slice(0, 2), [2, 1], 'from (0.3, 0) the line is clear');
  const cut = content(['........', '########', '........'], [{ start: at(2, 0), end: at(0, 0), motion: 'WALK', checkpoints: [] }]);
  const [, f] = withEnemy(cut);
  assert.deepEqual(planLeg(cut, cut.level.routes[0], f, /** @type {any} */ (legsOf(cut.level.routes[0])[0])), [0, 0], 'no field: straight');
});

test('[路线-2] the tiles a straight segment passes through; through a corner point it crosses neither tile beside it', () => {
  const m = content(['....', '.#..', '....'], []).level;
  assert.ok(!segmentClear(m, { x: 0, y: 0 }, { x: 2, y: 2 }, false), 'through the wall at (1, 1)');
  assert.ok(segmentClear(m, { x: 0, y: 1.5 }, { x: 3, y: 1.5 }, false), 'a segment along the edge of rows 1 and 2 is in row 2');
  assert.ok(!segmentClear(m, { x: 0, y: 1.4 }, { x: 3, y: 1.4 }, false), 'just inside row 1 it meets the wall');
  const corner = content(['.#..', '#...'], []).level;
  assert.ok(segmentClear(corner, { x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }, false), 'through the corner point (0.5, 0.5): (0, 1) and (1, 0) are not crossed');
  assert.ok(!segmentClear(corner, { x: 0.2, y: 0.2 }, { x: 0.9, y: 0.7 }, false), 'beside the corner it crosses (0, 1)');
  assert.ok(segmentClear(m, { x: 0, y: 0 }, { x: 3, y: 0 }, false));
  assert.ok(segmentClear(m, { x: 0, y: 0 }, { x: 1, y: 1 }, true), 'flyers pass walls');
  assert.ok(segmentClear(m, { x: 2, y: 0 }, { x: 2, y: 0 }, false));
  assert.ok(!segmentClear(m, { x: -1, y: 0 }, { x: 0, y: 0 }, false), 'off the map');
});

test('[路线-1] waits hold whole frames after arrival; fragment waits until n frames after the fragment began', () => {
  const c = content(OPEN, [{ start: at(0, 0), end: at(0, 2), motion: 'WALK', checkpoints: [cp('MOVE', 0, 1), cp('WAIT_FOR_SECONDS', 0, 0, 1)] },
    { start: at(0, 0), end: at(0, 1), motion: 'WALK', checkpoints: [cp('WAIT_CURRENT_FRAGMENT_TIME', 0, 0, 2), cp('WAIT_FOR_SECONDS', 0, 0, 0)] }]);
  const [w, e] = withEnemy(c);
  const { trail, end } = runRoute(w, c, e);
  const still = trail.filter(([, x]) => x === 1).length;
  assert.equal(still, 31, 'the arrival frame and 30 frames of wait');
  assert.equal(end, 9 + 31 + 10);
  const w2 = createWorld(c, { seed: 1, players: 1 }), f = makeEnemy(w2, c, { key: 'e', route: 1, frag: 15 });
  const r2 = runRoute(w2, c, f);
  assert.equal(r2.trail.findIndex(([, x]) => x > 0), 75, 'waits until frame 15 + 60');
});

test('[路线-3] patrol moves loop for ever: after the last of a run, back to the first', () => {
  const r = { start: at(0, 0), end: at(0, 7), motion: 'WALK', checkpoints: [cp('WAIT_FOR_SECONDS', 0, 0, 0), cp('PATROL_MOVE', 0, 3), cp('PATROL_MOVE', 2, 3), cp('PATROL_MOVE', 2, 6)] };
  const legs = legsOf(r);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => nextLeg(legs, i)), [1, 2, 3, 1, 5]);
  const c = content(OPEN, [r]), [w, e] = withEnemy(c);
  /** @type {number[]} */
  const seen = [];
  for (let f = 0; f < 900; f++) {
    w.frame = f;
    assert.equal(followRoute(w, c, e, 0.1), false, 'it never reaches the end');
    if (seen[seen.length - 1] !== e.leg) seen.push(e.leg);
  }
  assert.deepEqual(seen.slice(0, 8), [1, 2, 3, 1, 2, 3, 1, 2], 'from the last patrol point back to the first');
});

test('[路线-3] a patrol of zero-length moves cannot spin for ever within one frame', () => {
  const c = content(OPEN, [{ start: at(0, 0), end: at(0, 7), motion: 'WALK', checkpoints: [cp('PATROL_MOVE', 0, 0), cp('PATROL_MOVE', 0, 0)] }]);
  const [w, e] = withEnemy(c);
  assert.equal(followRoute(w, c, e, 0.1), false);
  assert.deepEqual([e.x, e.y], [0, 0]);
});

test('[路线-4] disappeared: not selectable, not blocked, takes no damage, does not attack; it appears where the route says', () => {
  const c = content(OPEN, [{ start: at(0, 0), end: at(3, 7), motion: 'WALK', checkpoints: [cp('DISAPPEAR', 0, 0), cp('WAIT_FOR_SECONDS', 0, 0, 1), cp('APPEAR_AT_POS', 3, 5)] }]);
  const [w, e] = withEnemy(c);
  followRoute(w, c, e, 0.1);
  assert.ok(e.hidden && !selectable(e));
  w.units.push(makeOperator(w, c, { key: 'g', owner: 0, row: 0, col: 0, dir: 0 }));
  assert.ok(!tryBlock(w, c, e));
  assert.equal(dealDamage(w, null, e, { type: 'true', amount: 50 }), 0);
  for (let f = 0; f < 30; f++) followRoute(w, c, e, 0.1);
  assert.ok(!e.hidden && e.x > 5 && e.y === 3, `${e.x},${e.y}`);
});

test('[出怪-1] an enemy appears at its start tile\'s centre moved by the spawn offset; it keeps its fragment\'s start', () => {
  const c = content(OPEN, [{ start: at(1, 2), end: at(1, 6), motion: 'WALK', checkpoints: [], spawnOffset: { x: 0.3, y: -0.2 } }]);
  c.level.waves = [oneWave([spawnAt(0.5, 'e')], 0.5)];
  const w = createWorld(c, { seed: 1, players: 1 });
  const placed = makeEnemy(w, c, { key: 'e', route: 0 });
  assert.deepEqual([placed.x, placed.y, placed.frag], [2.3, 0.8, 0]);
  for (let f = 0; f <= 30; f++) step(w, c);
  assert.equal(w.units[0].frag, 15, 'its fragment began at 0.5 s');
});

test('[索敌-6] 路径距离: tile steps along the route plus the projection onto the heading; cut off, the straight distance', () => {
  const rows = ['........', '..##....', '..##....', '........'];
  const c = content(rows, [{ start: at(2, 0), end: at(2, 6), motion: 'WALK', checkpoints: [cp('MOVE', 0, 0)] }]);
  const [, e] = withEnemy(c);
  // from (2, 0) to (0, 0): 2 steps; from (0, 0) to (2, 6): 8 steps — 10 in all, at the tile centre
  assert.equal(pathDistance(c, e), 10);
  e.y = 1.8;
  e.path = [0, 0];
  assert.ok(Math.abs(pathDistance(c, e) - (10 - 0.2)) < 1e-12, 'past the centre of (2, 0) by 0.2 towards (0, 0)');
  e.y = 2.2;
  assert.ok(Math.abs(pathDistance(c, e) - (10 + 0.2)) < 1e-12, 'before the centre: + 0.2');
  e.x = 2.4; e.y = 1.6;
  assert.ok(Math.abs(pathDistance(c, e) - Math.hypot(2.4, 1.6)) < 1e-12, 'inside a wall tile: the straight distance to the target point');
});

test('[索敌-6] after appearing the distance counts from where the enemy appears; a patrol is counted once', () => {
  const c = content(OPEN, [{ start: at(0, 0), end: at(3, 7), motion: 'WALK', checkpoints: [cp('MOVE', 0, 2), cp('DISAPPEAR', 0, 0), cp('APPEAR_AT_POS', 3, 5)] }]);
  const [, e] = withEnemy(c);
  assert.equal(pathDistance(c, e), 2 + 2);
});

test('[路线-5] content moves an enemy: it stands there at once and walks its leg on from there, round the walls', () => {
  const rows = ['........', '..##....', '..##....', '........'];
  const c = content(rows, [{ start: at(2, 0), end: at(2, 6), motion: 'WALK', checkpoints: [] }]);
  const [w, e] = withEnemy(c);
  for (let f = 0; f < 5; f++) { w.frame = f; followRoute(w, c, e, 0.1); }
  displace(e, 1, 0);
  assert.deepEqual([e.x, e.y, e.path, e.leg], [1, 0, [], 0], 'its plan dropped, its leg kept');
  const { end } = runRoute(w, c, e);
  assert.ok(end > 0 && e.x === 6 && e.y === 2);
  displace(e, NaN, 3);
  assert.deepEqual([e.x, e.y], [6, 2], 'no number: it stays');
});

test('[路线-2] [敌能-34] a unit whose own motion becomes flying replans its current leg straight across the walls', () => {
  const rows = ['........', '..##....', '..##....', '........'];
  const c = content(rows, [{ start: at(2, 0), end: at(2, 6), motion: 'WALK', checkpoints: [] }]);
  const [w, e] = withEnemy(c);
  const leg = /** @type {any} */ (legsOf(c.level.routes[0])[0]);
  const ground = pathDistance(c, e);
  e.base.motion = 'FLY';
  e.path = [];
  assert.deepEqual(planLeg(c, c.level.routes[0], e, leg), [6, 2]);
  assert.equal(pathDistance(c, e), 6);
  assert.ok(ground > 6);
  const { trail, end } = runRoute(w, c, e);
  assert.ok(end > 0);
  for (const [, , y] of trail) assert.equal(y, 2);
  assert.ok(trail.some(([, x]) => x > 2 && x < 4));
});
