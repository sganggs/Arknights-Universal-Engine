// 与高地碰撞 (docs/spec/foes.md 敌能-150): the step a 失衡 slide stops in because the tile it would enter is high ground
// (位移-3) is noted on the enemy, and its abilities see the note at its next turn (the context's `bumpedHigh`). Only an
// enemy an ability of which has asked keeps the note, as 敌能-38's hit count does, so no other unit's state changes.

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./level.js').Tile} Tile */

/** The note's key in the enemy's ability state (敌能-2). */
const NOTE = '@highBump';

/**
 * A slide of `u` stopped before tile `t` (位移-3): a collision with high ground when `t` is a 高地 tile, whatever else
 * stopped it there; off the map, a 低地 tile it cannot enter, a closed edge before a 低地 tile are not (敌能-150). Kept
 * only once an ability asked.
 * @param {Unit} u @param {Tile | null} t @returns {void}
 */
export function stoppedBy(u, t) {
  if (t?.height === 'HIGHLAND' && Object.hasOwn(u.ab, NOTE)) u.ab[NOTE] = 1;
}

/**
 * Whether a slide of the enemy with this ability state hit high ground since its last turn's abilities ran (敌能-150).
 * The first call starts the note, so a collision before it does not count.
 * @param {Record<string, number>} ab @returns {boolean}
 */
export function bumpedHigh(ab) {
  if (!Object.hasOwn(ab, NOTE)) ab[NOTE] = 0;
  return ab[NOTE] === 1;
}

/** Its turn's abilities have seen the note: cleared for the next one (敌能-150). @param {Record<string, number>} ab @returns {void} */
export function seenBump(ab) {
  if (ab[NOTE] === 1) ab[NOTE] = 0;
}
