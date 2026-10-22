// Stands in for Stronghold's server/sim/body.js (兼容-2): the engine's own hit areas (体积-1…体积-4), which keep its
// names, on the level's grid (兼容-1).
import { body, constants } from '@aue/sim';
import { COLS, ROWS } from '../grid.js';

/** The level's grid while content code runs. */
const grid = () => ({ rows: ROWS, cols: COLS });

/** @typedef {import('@aue/sim').body.Body} Body */

export const { bodyDist, bodyInRadius, bodyOnTile, hitRect } = body;
/** The tile keys a unit occupies. @param {Body} u */
export const bodyKeys = (u) => body.bodyKeys(u, grid());
/** Whether a unit is on any of the tiles. @param {Body} u @param {{ has(k: number): boolean } | number[]} keys */
export const bodyInKeys = (u, keys) => body.bodyInKeys(u, keys, grid());
/** The Chebyshev reach from a tile to a unit's body. @param {Body} u @param {number} r @param {number} c */
export const bodyTileReach = (u, r, c) => body.bodyTileReach(u, r, c, grid());

/** @param {{ has(k: number): boolean } | number[]} keys @param {number} k */
function hasKey(keys, k) {
  return 'has' in keys ? keys.has(k) : keys.includes(k);
}

/**
 * Whether a unit is in a range of tile keys (体积-5): a huge unit or an ally by the tiles it occupies (体积-1, 体积-2),
 * a regular enemy by the tiles its collider overlaps. Tile rules use bodyInKeys.
 * @param {Body & { side?: string }} u @param {{ has(k: number): boolean } | number[] | null | undefined} keys
 */
export function bodyInRange(u, keys) {
  if (!u || !keys) return false;
  const g = grid();
  const at = u.hitArea || u.side === 'ally' ? body.bodyKeys(u, g) : body.colliderKeys(u, g, constants.ENEMY_COLLIDER_RADIUS);
  for (const k of at) if (hasKey(keys, k)) return true;
  return false;
}

/** Whether the unit's range covers the one tile (r, c) (bodyInRange). False off the grid. @param {Body & { side?: string }} u @param {number} r @param {number} c */
export function bodyInRangeTile(u, r, c) {
  const g = grid();
  if (!u || r < 0 || r >= g.rows || c < 0 || c >= g.cols) return false;
  return bodyInRange(u, [r * g.cols + c]);
}
