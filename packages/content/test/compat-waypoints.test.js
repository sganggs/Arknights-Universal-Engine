// The grid's waypoints a Stronghold kit asks for (docs/spec/compat.md 兼容-4): the engine's ground flow field (寻路-1,
// 寻路-2) as Stronghold's waypoints — bit for bit the pinned oracle's on random maps of road and wall, its official
// pointers where its own blockable-ground preference takes another way (INF-1180) —; the same tile, off the map, a
// fraction, a start the ground cannot leave, closed edges (地图-2), a goal no one stands on, no diagonal moves, the
// level's own tiles (INF-1181); findPath as the points joined by their lines; and the 行动方式 (`motion`) a kit reads.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadOracle, tinyContent, spawnAt } from '@aue/testkit';
import { createWorld, step, routes, status, paths, devices, KIND } from '@aue/sim';
import { ShGrid } from '../src/compat/tiles.js';
import { kitsBehaviors } from '../src/compat/kits.js';

/** The oracle's grid size (its constants module): our maps take it too. */
const ROWS = 19, COLS = 21;
/** @type {any} */
let G;
before(async () => { G = await loadOracle('server/sim/grid.js'); });

const ROAD = { key: 'tile_road', height: 'LOWLAND', buildable: 'MELEE', passable: 'ALL', side: 'ALL' };
const FLOOR = { key: 'tile_floor', height: 'LOWLAND', buildable: 'NONE', passable: 'ALL', side: 'ALL' };
const WALL = { key: 'tile_wall', height: 'HIGHLAND', buildable: 'RANGED', passable: 'FLY_ONLY', side: 'ALL' };
const VOID = { key: 'tile_forbidden', height: 'HIGHLAND', buildable: 'NONE', passable: 'NONE', side: 'ALL' };
/** @type {Record<string, any>} */
const TILE = { r: ROAD, f: FLOOR, '#': WALL, X: VOID };

/**
 * Our grid and the oracle's from rows of 'r' (road), 'f' (floor), '#' (wall), 'X' (impassable), bottom row first;
 * shorter rows and missing rows are wall. @param {string[]} rows @param {any[]} [blockEdges]
 */
function grids(rows, blockEdges = []) {
  const full = Array.from({ length: ROWS }, (_, r) => (rows[r] ?? '').padEnd(COLS, '#'));
  const level = /** @type {any} */ ({ width: COLS, height: ROWS, tiles: full.map((s) => [...s].map((ch) => TILE[ch])), blockEdges });
  const theirs = new G.Grid({ id: 't', rows: full }, { r0: 0, r1: ROWS - 1, c0: 0, c1: COLS - 1 });
  return { level, ours: new ShGrid(level), theirs };
}

/** A seeded generator (no Math.random in the repository): numbers in [0, 1). @param {number} seed */
function draws(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s / 4294967296; };
}

/** Random maps: each tile a wall with probability `wall`, else a floor with probability `floor`, else a road. @param {() => number} rnd @param {number} wall @param {number} floor */
const randomRows = (rnd, wall, floor) => Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => (rnd() < wall ? '#' : rnd() < floor ? 'f' : 'r')).join(''));

/** The oracle's official pointers from a tile to the goal (its field's `official`, no preference), or null. @param {any} theirs @param {number[]} from @param {number[]} to @param {boolean} diagonal */
function officialChain(theirs, [sr, sc], [er, ec], diagonal) {
  const f = theirs.flowField(er, ec, { allowDiagonal: diagonal }), out = [[sr, sc]];
  let k = sr * COLS + sc;
  if (k === er * COLS + ec) return out;
  if (f.dist[k] < 0) return null;
  while (k !== er * COLS + ec) { k = f.official[k]; out.push([Math.floor(k / COLS), k % COLS]); }
  return out;
}

/** Joins waypoints by their Bresenham lines (the oracle's bresenhamTiles), each point once. @param {number[][]} wp */
function joined(wp) {
  const out = [wp[0]];
  for (let i = 1; i < wp.length; i++) out.push(...G.bresenhamTiles(wp[i - 1], wp[i]).slice(1));
  return out;
}

test('[兼容-4] [寻路-2] waypoints: the oracle\'s, bit for bit, on random maps of road and wall, with and without diagonal moves', () => {
  const rnd = draws(20261103);
  let found = 0, none = 0;
  for (let run = 0; run < 150; run++) {
    const { ours, theirs } = grids(randomRows(rnd, 0.25, 0));
    const at = () => [Math.floor(rnd() * ROWS), Math.floor(rnd() * COLS)], [sr, sc] = at(), [er, ec] = at(), diagonal = rnd() < 0.5;
    const wp = ours.waypoints(sr, sc, er, ec, { allowDiagonal: diagonal });
    assert.deepEqual(wp, theirs.waypoints(sr, sc, er, ec, { allowDiagonal: diagonal }), `run ${run}`);
    if (wp) found++; else none++;
  }
  assert.ok(found > 40 && none > 40, `both kinds: ${found} found, ${none} null`);
});

test('[兼容-4] the engine\'s way, not Stronghold\'s blockable-ground preference: the oracle\'s official pointers on maps with floor (INF-1180)', () => {
  // the oracle's own waypoints walk round the floor tile on the straight line: (0, 1) → (0, 0) → (2, 0)
  const { ours, theirs } = grids(['rrfr', 'rfrr', 'fr#r', 'rrrr']);
  assert.deepEqual(theirs.waypoints(0, 1, 2, 0), [[0, 1], [0, 0], [2, 0]]);
  assert.deepEqual(ours.waypoints(0, 1, 2, 0), [[0, 1], [2, 0]], 'straight over the floor, as the official pointer');
  assert.deepEqual(theirs.waypoints(0, 2, 2, 0), [[0, 2], [0, 0], [2, 0]]);
  assert.deepEqual(ours.waypoints(0, 2, 2, 0), [[0, 2], [1, 1], [2, 0]]);
  const rnd = draws(4417);
  for (let run = 0; run < 100; run++) {
    const { ours: o, theirs: t } = grids(randomRows(rnd, 0.2, 0.35));
    const at = () => [Math.floor(rnd() * ROWS), Math.floor(rnd() * COLS)], from = at(), to = at(), diagonal = rnd() < 0.5;
    assert.deepEqual(o.waypoints(from[0], from[1], to[0], to[1], { allowDiagonal: diagonal }), officialChain(t, from, to, diagonal), `run ${run}`);
  }
});

test('[兼容-4] [寻路-2] findPath is the waypoints joined by their lines; ignoreObstacles changes nothing', () => {
  const rnd = draws(77);
  for (let run = 0; run < 60; run++) {
    const { ours } = grids(randomRows(rnd, 0.25, 0.2));
    const at = () => [Math.floor(rnd() * ROWS), Math.floor(rnd() * COLS)], [sr, sc] = at(), [er, ec] = at();
    const wp = ours.waypoints(sr, sc, er, ec);
    assert.deepEqual(wp ? joined(wp) : null, ours.findPath(sr, sc, er, ec), `run ${run}`);
    assert.deepEqual(ours.waypoints(sr, sc, er, ec, { ignoreObstacles: true }), wp);
  }
});

test('[兼容-4] the same tile, off the map, a fraction, a start the ground cannot leave, closed edges, a goal no one stands on, no diagonals', () => {
  // row 3: r r r r r      a wall (2, 1) and (1, 1), an impassable tile (2, 3)
  // row 2: r # r X r
  // row 1: r # r r r
  // row 0: r r r r r
  const rows = ['rrrrr', 'r#rrr', 'r#rXr', 'rrrrr'];
  const { ours } = grids(rows);
  assert.deepEqual([ours.waypoints(2, 1, 2, 1), ours.waypoints(2, 3, 2, 3)], [[[2, 1]], [[2, 3]]], 'on the goal: the start alone, whatever the tile');
  assert.deepEqual([ours.waypoints(-1, 0, 0, 4), ours.waypoints(0, 0, 0, COLS), ours.waypoints(0, 0.5, 0, 4), ours.waypoints(0, 0, 3, Number.NaN)], [null, null, null, null]);
  assert.equal(ours.waypoints(2, 1, 0, 4), null, 'a wall: the ground cannot leave it');
  assert.equal(ours.waypoints(0, 0, 3, 7), null, 'the goal is beyond the map\'s walls');
  // the goal on a wall: the line of sight never reaches it, the last point before it is the tile beside it
  assert.deepEqual(ours.waypoints(0, 0, 2, 1), [[0, 0], [2, 0], [2, 1]]);
  assert.deepEqual(ours.waypoints(3, 2, 0, 0), [[3, 2], [3, 0], [0, 0]], 'round the walls');
  assert.deepEqual(ours.waypoints(0, 4, 3, 3), [[0, 4], [3, 4], [3, 3]], 'the diagonal would cross the impassable (2, 3)');
  assert.deepEqual(ours.waypoints(0, 2, 1, 4), [[0, 2], [1, 4]]);
  assert.deepEqual(ours.waypoints(0, 2, 1, 4, { allowDiagonal: false }), [[0, 2], [0, 4], [1, 4]], 'no diagonal moves: along rows and columns');
  assert.deepEqual(ours.waypoints(0, 2, 1, 4, { allowDiagonal: null }), [[0, 2], [0, 4], [1, 4]], 'on only when left out, as Stronghold\'s');
  // closed edges (地图-2) cut (0, 4) off for ground units: the edges above and left of it
  const cut = grids(rows, [{ row: 0, col: 4, dir: 'UP', mask: 'WALK_ONLY' }, { row: 0, col: 4, dir: 'LEFT', mask: 'WALK_ONLY' }]).ours;
  assert.deepEqual([cut.waypoints(0, 4, 3, 3), cut.waypoints(3, 3, 0, 4)], [null, null]);
  assert.deepEqual(ours.waypoints(0, 3, 3, 3), [[0, 3], [1, 4], [3, 4], [3, 3]]);
  assert.deepEqual(cut.waypoints(0, 3, 3, 3), [[0, 3], [1, 3], [1, 4], [3, 4], [3, 3]], 'nor across the corner of a closed edge');
  const air = grids(rows, [{ row: 0, col: 4, dir: 'UP', mask: 'FLY_ONLY' }, { row: 0, col: 4, dir: 'LEFT', mask: 'FLY_ONLY' }]).ours;
  assert.deepEqual(air.waypoints(0, 4, 3, 3), [[0, 4], [3, 4], [3, 3]], 'edges closed to flyers only do not stop the ground way');
});

test('[兼容-4] the level\'s own tiles, as findPath: an obstacle tile the field gets from a building only costs more, and is not on this map (INF-1181)', () => {
  // row 2: r r r      the engine's field with (0, 1) a 类障碍物地块 (寻路-1) goes round it; the level's own tiles do not
  // row 1: r # r
  // row 0: r r r
  const { level, ours } = grids(['rrr', 'r#r', 'rrr']);
  const built = { ...level, tiles: level.tiles.map((/** @type {any[]} */ row, /** @type {number} */ r) => row.map((t, c) => (r === 0 && c === 1 ? { ...t, obstacle: true } : t))) };
  const field = paths.flowField(built, 0, 2);
  assert.deepEqual([field.dist[0], paths.chain(field, 0).map((x) => [Math.floor(x / COLS), x % COLS])], [6, [[2, 0], [2, 2], [0, 2]]]);
  assert.deepEqual(new ShGrid(built).waypoints(0, 0, 0, 2), [[0, 0], [2, 0], [2, 2], [0, 2]], 'a grid on that map would follow it');
  assert.deepEqual(ours.waypoints(0, 0, 0, 2), [[0, 0], [0, 2]], 'the level\'s own: straight along row 0');
  for (let k = 0; k < ROWS * COLS; k++) assert.equal(field.dist[k] >= 0, paths.flowField(level, 0, 2).dist[k] >= 0, `the same tiles reach the goal (${k})`);
});

/**
 * The tiny level with a guard under a kit of our own and, besides its slimes, a flying `bat` and a flying neutral `moth`:
 * the battle the kit sees.
 * @returns {{ w: any, c: any, b: any }}
 */
function tiny() {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 1e6;
  c.enemies.bat = { name: 'bat', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 1, motion: 'FLY' };
  c.enemies.moth = { ...c.enemies.bat, name: 'moth', neutral: true };
  c.level.waves[0].fragments[0].actions.push(spawnAt(0.5, 'bat'), spawnAt(0.5, 'moth'));
  c.decks = [['guard']];
  const box = /** @type {{ b: any }} */ ({ b: null });
  c.behaviors = kitsBehaviors({ guard: { factory: () => ({}), def: { name: 'guard' } } }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  return { w, c, b: box.b };
}

test('[兼容-4] the 行动方式 a kit reads: an enemy\'s own FLY or WALK, which becoming a flyer or ground changes, not 浮空; GROUND for an ally or a device', () => {
  const { w, c, b } = tiny();
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  for (let i = 0; i < 30; i++) step(w, c);
  const slime = w.units.find((/** @type {any} */ u) => u.key === 'slime'), bat = w.units.find((/** @type {any} */ u) => u.key === 'bat');
  const guard = w.units.find((/** @type {any} */ u) => u.key === 'guard');
  const s = b.unitOf(slime), moth = w.units.find((/** @type {any} */ u) => u.key === 'moth');
  assert.deepEqual([s.motion, b.unitOf(bat).motion, b.unitOf(guard).motion, b.pieces.get('0|guard').motion], ['WALK', 'FLY', 'GROUND', 'GROUND']);
  assert.deepEqual([moth.base.neutral, b.unitOf(moth).motion], [true, 'FLY'], 'a neutral unit is an enemy with its own motion');
  status.applyStatus(slime, 'levitate', { frames: 60 });
  assert.deepEqual([s.isFlying, s.motion], [true, 'WALK'], '浮空: an air unit, its own motion still on the ground');
  routes.becomeFlyer(slime);
  assert.equal(s.motion, 'FLY');
  routes.becomeGround(slime);
  assert.equal(s.motion, 'WALK');
  assert.deepEqual(b.grid.waypoints(1, 0, 1, 5), [[1, 0], [1, 5]], 'units on the way do not count: the guard stands on (1, 2)');
  assert.equal(b.grid.level, c.level, 'the battle\'s grid is its content\'s own level (INF-1181)');
  // a device is an 'enemy'-side unit to the kits here; Stronghold makes it an ally with no motion of its own
  c.devices = { box: { name: 'box', maxHp: 100, atk: 0, def: 0, res: 0, blockCnt: 0 } };
  assert.ok(devices.spawnDevice(w, c, 'box', 0, 4));
  const box = b.unitOf(w.units.find((/** @type {any} */ u) => u.kind === KIND.DEVICE));
  assert.deepEqual([box.side, box.motion], ['enemy', 'GROUND']);
});
