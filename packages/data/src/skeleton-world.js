// The level part of the skeleton: tiles, routes and waves. Row convention of the output: row 0 is the BOTTOM row.
import { asArray, asInt, asNumber, asObject, asPos, asString, field } from './validate.js';
import { readAction } from './waves.js';

/** @typedef {{ row: number, col: number }} Pos */
/** @typedef {{ key: string, height: string, buildable: string, passable: string, side: string, goal?: string, landball?: boolean }} Tile */

/** A co-op goal tile's side (合作-1): its blackboard `side`, Side_A → 'A', Side_B → 'B', Shared → 'Shared'. */
const GOAL_SIDES = Object.freeze({ Side_A: 'A', Side_B: 'B', Shared: 'Shared' });
/** @typedef {{ type: string, row: number, col: number, time: number, dx: number, dy: number }} Checkpoint */
/** @typedef {{ start: Pos, end: Pos, checkpoints: Checkpoint[], motion: string, allowDiagonal: boolean, spawnOffset: { x: number, y: number } }} Route */
/** @typedef {import('./waves.js').Wave} Wave */

/**
 * @param {unknown} raw
 * @param {string} p
 * @returns {Tile}
 */
function readTileDef(raw, p) {
  const t = asObject(raw, p);
  const key = asString(field(t, 'tileKey', p), `${p}.tileKey`);
  const tile = {
    key,
    height: asString(field(t, 'heightType', p), `${p}.heightType`),
    buildable: asString(field(t, 'buildableType', p), `${p}.buildableType`),
    passable: asString(field(t, 'passableMask', p), `${p}.passableMask`),
    side: asString(field(t, 'playerSideMask', p), `${p}.playerSideMask`),
  };
  const bb = Array.isArray(t.blackboard) ? t.blackboard : [];
  // a tile of our half a ball card may be deployed on (足球-14)
  if (bb.some((b) => asObject(b, `${p}.blackboard`).key === 'tile' && asObject(b, `${p}.blackboard`).valueStr === 'landball')) return { ...tile, landball: true };
  if (!key.startsWith('tile_end')) return tile;
  const side = bb.map((b, i) => asObject(b, `${p}.blackboard[${i}]`)).find((b) => b.key === 'side');
  const goal = side ? /** @type {Record<string, string>} */ (GOAL_SIDES)[String(side.valueStr)] : undefined;
  return goal ? { ...tile, goal } : tile;
}

/**
 * The tile grid, rows from the bottom: tiles[r] = mapData.map[height - 1 - r] (the file lists rows from the top).
 * @param {unknown} mapDataRaw
 * @returns {{ width: number, height: number, tiles: Tile[][] }}
 */
export function extractTiles(mapDataRaw) {
  const mapData = asObject(mapDataRaw, 'level.mapData');
  const defs = asArray(field(mapData, 'tiles', 'level.mapData'), 'level.mapData.tiles').map((raw, i) =>
    readTileDef(raw, `level.mapData.tiles[${i}]`),
  );
  const rows = asArray(field(mapData, 'map', 'level.mapData'), 'level.mapData.map');
  if (rows.length === 0) throw new Error('level.mapData.map: empty');
  const grid = rows.map((row, r) =>
    asArray(row, `level.mapData.map[${r}]`).map((c, k) => defs[asInt(c, `level.mapData.map[${r}][${k}]`, 0, defs.length - 1)]),
  );
  const width = grid[0].length;
  if (width === 0 || grid.some((r) => r.length !== width)) throw new Error('level.mapData.map: rows must be non-empty and of equal length');
  return { width, height: grid.length, tiles: grid.reverse() };
}

/** The directions and masks a closed edge may have (地图-2). */
const EDGE_DIRS = Object.freeze(['UP', 'RIGHT', 'DOWN', 'LEFT']), EDGE_MASKS = Object.freeze(['WALK_ONLY', 'FLY_ONLY', 'ALL', 'NONE']);

/**
 * The closed tile edges (地图-2), in data order: a tile (row 0 at the bottom, as route positions), the side of it — UP
 * is toward row + 1 — and whom the edge stops. None when the map has no `blockEdges`.
 * @param {unknown} mapDataRaw @returns {{ row: number, col: number, dir: string, mask: string }[]}
 */
export function extractEdges(mapDataRaw) {
  const raw = asObject(mapDataRaw, 'level.mapData').blockEdges;
  return (raw === undefined || raw === null ? [] : asArray(raw, 'level.mapData.blockEdges')).map((e, i) => {
    const p = `level.mapData.blockEdges[${i}]`, o = asObject(e, p), dir = asString(field(o, 'direction', p), `${p}.direction`), mask = asString(field(o, 'blockMask', p), `${p}.blockMask`);
    if (!EDGE_DIRS.includes(dir)) throw new Error(`${p}.direction: unknown ${dir}`);
    if (!EDGE_MASKS.includes(mask)) throw new Error(`${p}.blockMask: unknown ${mask}`);
    return { ...asPos(field(o, 'pos', p), `${p}.pos`), dir, mask };
  });
}

/**
 * @param {unknown} raw
 * @param {string} p
 * @returns {Checkpoint}
 */
function readCheckpoint(raw, p) {
  const c = asObject(raw, p);
  const time = c.time === undefined ? 0 : asNumber(c.time, `${p}.time`, 0, 1e6), type = asString(field(c, 'type', p), `${p}.type`);
  // a waiting or disappearing checkpoint does not use its position, which may lie off the map
  const { row, col } = asPos(field(c, 'position', p), `${p}.position`, /^WAIT_|^DISAPPEAR$/.test(type) ? -255 : 0);
  const off = readOffset(c.reachOffset, `${p}.reachOffset`);
  return { type, row, col, time, dx: off.x, dy: off.y };
}

/**
 * An { x, y } offset in tiles (each within ±16); missing or null is no offset.
 * @param {unknown} raw
 * @param {string} p
 * @returns {{ x: number, y: number }}
 */
function readOffset(raw, p) {
  if (raw === undefined || raw === null) return { x: 0, y: 0 };
  const o = asObject(raw, p);
  return { x: asNumber(field(o, 'x', p), `${p}.x`, -16, 16), y: asNumber(field(o, 'y', p), `${p}.y`, -16, 16) };
}

/**
 * @param {unknown} raw
 * @param {string} p
 * @returns {Route}
 */
export function readRoute(raw, p) {
  const r = asObject(raw, p);
  const cps = r.checkpoints === null || r.checkpoints === undefined ? [] : asArray(r.checkpoints, `${p}.checkpoints`);
  return {
    start: asPos(field(r, 'startPosition', p), `${p}.startPosition`),
    end: asPos(field(r, 'endPosition', p), `${p}.endPosition`),
    checkpoints: cps.map((c, i) => readCheckpoint(c, `${p}.checkpoints[${i}]`)),
    motion: asString(field(r, 'motionMode', p), `${p}.motionMode`),
    allowDiagonal: r.allowDiagonalMove === undefined ? true : r.allowDiagonalMove === true,
    spawnOffset: readOffset(r.spawnOffset, `${p}.spawnOffset`),
  };
}

/**
 * The first 6 SPAWN actions of the first fragment holding at least 4 of them, with the time that fragment starts.
 * Skeleton simplification: earlier waves are assumed to take no time, so the fragment starts at its wave's preDelay plus
 * the preDelays of the wave's fragments up to and including it; it becomes the one fragment of the skeleton's one wave.
 * @param {unknown} wavesRaw
 * @returns {{ start: number, actions: { a: unknown, p: string }[] }}
 */
export function pickSpawnActions(wavesRaw) {
  for (const [wi, wRaw] of asArray(wavesRaw, 'level.waves').entries()) {
    const wp = `level.waves[${wi}]`;
    const wave = asObject(wRaw, wp);
    let start = asNumber(field(wave, 'preDelay', wp), `${wp}.preDelay`, 0, 1e6);
    for (const [fi, fRaw] of asArray(field(wave, 'fragments', wp), `${wp}.fragments`).entries()) {
      const fp = `${wp}.fragments[${fi}]`;
      const frag = asObject(fRaw, fp);
      start += asNumber(field(frag, 'preDelay', fp), `${fp}.preDelay`, 0, 1e6);
      const spawns = asArray(field(frag, 'actions', fp), `${fp}.actions`)
        .map((a, ai) => ({ a, p: `${fp}.actions[${ai}]` }))
        .filter(({ a, p }) => asObject(a, p).actionType === 'SPAWN');
      if (spawns.length >= 4) return { start, actions: spawns.slice(0, 6) };
    }
  }
  throw new Error('level.waves: no fragment with at least 4 SPAWN actions');
}

/**
 * The skeleton's waves (波次-1) and the routes they use, renumbered in first-use order: one wave of one fragment holding
 * the picked spawn actions.
 * @param {unknown} wavesRaw
 * @param {unknown} routesRaw
 * @returns {{ routes: Route[], waves: Wave[] }}
 */
export function extractRoutesAndWaves(wavesRaw, routesRaw) {
  const all = asArray(routesRaw, 'level.routes');
  /** @type {Map<number, number>} */
  const renumber = new Map();
  /** @type {Route[]} */
  const routes = [];
  const routeOf = (/** @type {number} */ index) => {
    if (index >= all.length) throw new Error(`a spawn uses route ${index}, which does not exist`);
    if (!renumber.has(index)) {
      renumber.set(index, routes.length);
      routes.push(readRoute(all[index], `level.routes[${index}]`));
    }
    return /** @type {number} */ (renumber.get(index));
  };
  const { start, actions } = pickSpawnActions(wavesRaw);
  const read = actions.map(({ a, p }) => /** @type {Wave['fragments'][number]['actions'][number]} */ (readAction(a, p, routeOf)));
  return { routes, waves: [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: start, actions: read.filter(Boolean) }] }] };
}
