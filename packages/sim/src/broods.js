// Enemies an enemy brings in (docs/spec/foes.md 敌能-22): where they appear — the enemy's own position, or the centre of
// the passable ground tile nearest it, moved at random within a square —, on the enemy's route from the leg it is on;
// at once, or after a delay kept in the world until they appear.
import { secondsToFrames } from '@aue/math';
import { draw } from './rng.js';
import { passable, isHole } from './paths.js';
import { spawnEnemy } from './spawn.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Brood} Brood @typedef {import('./types.js').Level} Level */

/**
 * How an enemy brings others in (敌能-22): how many, after how many seconds, from the centre of the nearest passable
 * ground tile (`tile`) or its own position, each moved by up to `bound` along x and along y. `dx` and `dy` are a fixed
 * offset applied before that jitter (default 0). 枯朽召唤 is the caller that sets them (敌能-64); everyone else leaves
 * them unset, so a summon without them is unchanged.
 * @typedef {{ cnt?: number, delay?: number, bound?: number, tile?: boolean, dx?: number, dy?: number }} BringIn
 */

/**
 * The centre of the passable ground tile (not a 地穴) nearest a point (敌能-22); ties go to the first in row order.
 * Null on a map without one.
 * @param {Level} m @param {{ x: number, y: number }} p @returns {{ x: number, y: number } | null}
 */
export function nearestGround(m, p) {
  let best = null, at = Infinity;
  for (let r = 0; r < m.height; r++) {
    for (let col = 0; col < m.width; col++) {
      const t = m.tiles[r][col], d = (col - p.x) * (col - p.x) + (r - p.y) * (r - p.y);
      if (d < at && passable(t, false) && !isHole(t)) { at = d; best = { x: col, y: r }; }
    }
  }
  return best;
}

/** An offset in [−bound, bound], one draw (随机-1); none without a bound. @param {World} w @param {number} bound */
const jitter = (w, bound) => (bound > 0 ? (draw(w) * 2 - 1) * bound : 0);

/** A brood appears (敌能-22): on its route from its leg, at its point; it waits for no wave. @param {World} w @param {Content} c @param {Brood} b */
const appear = (w, c, b) => spawnEnemy(w, c, { key: b.key, route: b.route, place: { leg: b.leg, x: b.x, y: b.y } }, b.frag, -1);

/**
 * Enemy `e` brings in `cnt` enemies of `key` (敌能-22): each where it appears — x then y drawn —, then at once or kept
 * until its delay is over. Returns those that appeared now; none for a key the content does not have.
 * @param {World} w @param {Content} c @param {Unit} e @param {string} key @param {BringIn} o @returns {Unit[]}
 */
export function bringIn(w, c, e, key, o) {
  const from = o.tile ? nearestGround(c.level, e) : { x: e.x, y: e.y };
  if (!from || !Object.hasOwn(c.enemies, key) || e.route < 0) return [];
  /** @type {Unit[]} */
  const now = [];
  for (let i = 0; i < (o.cnt ?? 1); i++) {
    const x = from.x + (o.dx ?? 0) + jitter(w, o.bound ?? 0), y = from.y + (o.dy ?? 0) + jitter(w, o.bound ?? 0);
    const b = { key, x, y, route: e.route, leg: e.leg, frag: e.frag, left: secondsToFrames(o.delay ?? 0) };
    if (b.left > 0) (w.broods ??= []).push(b);
    else now.push(appear(w, c, b));
  }
  return now;
}

/**
 * One frame of the enemies kept to appear later (帧-1 step 8, 敌能-22): each counts down; at 0 it appears, in the order
 * they were brought in.
 * @param {World} w @param {Content} c
 */
export function hatch(w, c) {
  if (!w.broods || w.broods.length === 0) return;
  /** @type {Brood[]} */
  const keep = [], due = [];
  for (const b of w.broods) {
    if (b.left - 1 > 0) keep.push({ ...b, left: b.left - 1 });
    else due.push(b);
  }
  w.broods = keep;
  for (const b of due) appear(w, c, b);
}
