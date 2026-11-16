// An enemy's left or right (docs/spec/foes.md 敌能-90, PRTS's 左右面向机制): right as it appears; a move turns it by the
// move's x, being blocked by the x toward its blocker, starting an attack by the x toward what it attacks; no x, no turn.
// Behind it, and in front of it (敌能-118): a unit whose tile is past its own column on that side. Its own column is neither.
import { KIND } from '@aue/schema';
import { tileOf } from './body.js';
import { statsOf } from './attrs.js';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').World} World */

/** Turns an enemy by an x (敌能-90): left for one below 0, right above; none for 0 or another unit. @param {Unit} u @param {number} dx */
export function turnLR(u, dx) {
  if (u.kind !== KIND.ENEMY || !(Math.abs(dx) > 1e-9)) return;
  if (dx < 0) u.lr = -1;
  else delete u.lr;
}

/** Whether an enemy faces left (敌能-90); one never turned faces right. @param {Unit} u */
export const facesLeft = (u) => u.lr === -1;

/**
 * Whether a unit is behind an enemy (敌能-90): its tile in a column past the enemy's on the side it faces from — right
 * of it when it faces left, left of it when it faces right; the enemy's own column is neither.
 * @param {Unit} u @param {{ x: number, y: number }} other
 */
export function behind(u, other) {
  const [, col] = tileOf(u), [, oc] = tileOf(/** @type {Unit} */ (other));
  return facesLeft(u) ? oc > col : oc < col;
}

/**
 * Whether a unit is in front of an enemy (敌能-118): the other side of `behind`. Facing left, a smaller column; facing
 * right, a greater one. Its own column is neither, the same as a hit with no source (作战机制 §3.2.2).
 * @param {Unit} u @param {{ x: number, y: number }} other
 */
export function front(u, other) {
  const [, col] = tileOf(u), [, oc] = tileOf(/** @type {Unit} */ (other));
  return facesLeft(u) ? oc < col : oc > col;
}

/**
 * Whether a point is in the half of the plane behind an enemy (敌能-91: 「180°…扇形区域」): past its centre on the side
 * it faces from. @param {Unit} u @param {{ x: number, y: number }} p
 */
export const inBack = (u, p) => (facesLeft(u) ? p.x > u.x : p.x < u.x);

/**
 * Turns an enemy toward the side with more of our operators (敌能-119): those in the columns left of its own against
 * those right of it; summons, devices and its own column do not count; equal keeps its facing. Only with the flag
 * `faceCrowd`, or `faceCrowdFree` while it is not blocked. Run after its turn (enemies.js), so this is the facing the
 * frame ends with, whatever 敌能-90's turns did.
 * @param {World} w @param {Unit} e
 */
export function crowdTurn(w, e) {
  const f = statsOf(e).flags;
  if (!f.faceCrowd && !(f.faceCrowdFree && e.blockedBy < 0)) return;
  const [, col] = tileOf(e);
  let side = 0;
  for (const u of w.units) {
    if (u.kind !== KIND.OPERATOR || u.summoner !== undefined || u.hp <= 0 || u.hidden) continue;
    const [, c] = tileOf(u);
    side += c < col ? -1 : c > col ? 1 : 0;
  }
  if (side < 0) e.lr = -1;
  else if (side > 0) delete e.lr;
}
