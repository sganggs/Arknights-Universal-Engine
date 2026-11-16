// Stronghold's battle grid over the level's tiles (docs/spec/compat.md 兼容-4): the whole map is the battle's
// rectangle; each tile as Stronghold describes it — low or high ground, what may be deployed on it, how units pass it
// (地形-1), start and goal tiles; the tiles an enemy's ground way crosses and its waypoints (寻路-2). Obstacles that content
// places and the flow field itself are not here yet (gaps).
import { paths } from '@aue/sim';
import { gap } from './sh/gap.js';

/** @typedef {{ key: string, height: string, buildable: string, passable: string }} LevelTile */
/** @typedef {{ key: string, height: 'LOW' | 'HIGH', build: string, pass: 'ALL' | 'FLY' | 'NONE', special: string | null }} TileInfo */

/** Outside the map: nothing stands, nothing passes. @type {Readonly<TileInfo>} */
const NOWHERE = Object.freeze({ key: '', height: 'LOW', build: 'NONE', pass: 'NONE', special: null });

/** The special tiles by key. @type {Record<string, string>} */
const SPECIAL = { tile_start: 'start', tile_end: 'end', tile_flystart: 'start', tile_telin: 'telin', tile_telout: 'telout' };

/** A level tile as Stronghold's tile info. @param {LevelTile} t @returns {Readonly<TileInfo>} */
const infoOf = (t) => Object.freeze({
  key: t.key, height: t.height === 'HIGHLAND' ? 'HIGH' : 'LOW', build: t.buildable,
  pass: t.passable === 'ALL' ? 'ALL' : t.passable === 'NONE' ? 'NONE' : 'FLY', special: SPECIAL[t.key] ?? (t.key.startsWith('tile_end') ? 'end' : null),
});

export class ShGrid {
  /** @param {{ width: number, height: number, tiles: LevelTile[][] }} level */
  constructor(level) {
    /** the level, for its ways (寻路-2) */
    this.level = level;
    this.rows = level.height; this.cols = level.width;
    this.rect = Object.freeze({ r0: 0, r1: level.height - 1, c0: 0, c1: level.width - 1 });
    /** @type {Readonly<TileInfo>[]} */
    this.tiles = level.tiles.flatMap((row) => row.map(infoOf));
  }

  /** @param {number} r @param {number} c */
  key(r, c) { return r * this.cols + c; }
  /** @param {number} r @param {number} c */
  inBounds(r, c) { return r >= 0 && r < this.rows && c >= 0 && c < this.cols; }
  /** @param {number} r @param {number} c */
  inRect(r, c) { return this.inBounds(r, c); }
  /** @param {number} r @param {number} c @returns {Readonly<TileInfo>} */
  tile(r, c) { return this.inBounds(r, c) ? this.tiles[r * this.cols + c] : NOWHERE; }
  /**
   * The tiles an enemy's ground way from (sr, sc) to (er, ec) crosses (寻路-2), as [row, col]; null when it cannot reach.
   * No content obstacles exist, so Stronghold's `ignoreObstacles` changes nothing.
   * @param {number} sr @param {number} sc @param {number} er @param {number} ec @returns {[number, number][] | null}
   */
  findPath(sr, sc, er, ec) {
    if (!this.inBounds(sr, sc) || !this.inBounds(er, ec)) return null;
    const tiles = paths.routeTiles(/** @type {any} */ (this.level), this.key(sr, sc), this.key(er, ec));
    return tiles ? tiles.map((k) => /** @type {[number, number]} */ ([Math.floor(k / this.cols), k % this.cols])) : null;
  }

  /**
   * Stronghold's waypoints of an enemy's ground way from (sr, sc) to (er, ec) (兼容-4): the start, then each tile the
   * engine's ground flow field toward the goal points it on to (寻路-1, 寻路-2), the goal last, as [row, col] — joined by
   * their lines they are findPath's tiles; [[sr, sc]] on the goal itself; null off the map, for a row or column that is
   * not a whole number (the field has no such tile) or when the start cannot reach the goal. `allowDiagonal`, as
   * Stronghold's, is on when left out; given a false value, lines of sight run along a row or a column only. No content
   * obstacles exist, so `ignoreObstacles` changes nothing; the way is the engine's, not Stronghold's preference (INF-1180,
   * INF-1181).
   * @param {number} sr @param {number} sc @param {number} er @param {number} ec @param {{ allowDiagonal?: unknown, ignoreObstacles?: boolean }} [o]
   * @returns {[number, number][] | null}
   */
  waypoints(sr, sc, er, ec, o = {}) {
    if (![sr, sc, er, ec].every(Number.isInteger) || !this.inBounds(sr, sc) || !this.inBounds(er, ec)) return null;
    const start = this.key(sr, sc);
    if (start === this.key(er, ec)) return [[sr, sc]];
    const f = paths.flowField(/** @type {any} */ (this.level), er, ec, { diagonal: o.allowDiagonal === undefined || !!o.allowDiagonal });
    if (f.dist[start] < 0) return null;
    return [[sr, sc], ...paths.chain(f, start).map((k) => /** @type {[number, number]} */ ([Math.floor(k / this.cols), k % this.cols]))];
  }

  /** Ground units may stand here. @param {number} r @param {number} c */
  groundPassable(r, c) { return this.tile(r, c).pass === 'ALL'; }
  /** @param {number} r @param {number} c */
  walkable(r, c) { return this.groundPassable(r, c); }
  /** @param {number} r @param {number} c */
  flyPassable(r, c) { return this.tile(r, c).pass !== 'NONE'; }
  /** @param {number} r @param {number} c */
  isLow(r, c) { return this.tile(r, c).height === 'LOW'; }
  /** Ground a melee operator can be deployed on. @param {number} r @param {number} c */
  blockable(r, c) { const t = this.tile(r, c); return t.height === 'LOW' && (t.build === 'ALL' || t.build === 'MELEE'); }

  /**
   * Whether a unit may be placed here (Stronghold's rule): a ranged one on ranged or any-unit tiles and on low melee
   * ones; a melee one on low melee or any-unit tiles.
   * @param {number} r @param {number} c @param {{ ranged?: boolean }} [o]
   */
  canStand(r, c, o = {}) {
    const t = this.tile(r, c);
    if (t.build === 'NONE') return false;
    if (o.ranged) return t.build === 'ALL' || t.build === 'RANGED' || (t.height === 'LOW' && t.build === 'MELEE');
    return t.height === 'LOW' && (t.build === 'ALL' || t.build === 'MELEE');
  }

  /** Whether an obstacle is on a tile (`(r, c)`): none yet. */
  isObstacle() { return false; }
  /** Whether a hard block is on a tile (`(r, c)`): none yet. */
  isBlocked() { return false; }

  /** The tiles of a special kind ('start', 'end', 'telin', 'telout'), by row then column. @param {string} kind @returns {number[][]} */
  specialTiles(kind) {
    const out = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.tile(r, c).special === kind) out.push([r, c]);
    return out;
  }
}

Object.assign(ShGrid.prototype, { setObstacle: gap('grid.setObstacle'), flowField: gap('grid.flowField') });
