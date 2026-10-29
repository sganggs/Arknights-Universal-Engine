// 智能裁判官 (docs/spec/cup.md 锦标-2: 智能时代球场): a device of ours that, every so many seconds, takes one ball on the
// ground within its radius — drags it in and makes it vanish —, then puts it out again at its own tile, shot at the
// ball's force × its own toward the right half (toward their goal), never into a wall beside it.
import { sin, cos, secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { draw } from './rng.js';
import { kickSlide, stopSlide } from './displacement.js';
import { displace, board, alight } from './routes.js';
import { tileAt } from './level.js';
import { passable } from './paths.js';
import { FORCE_TO_SPEED } from './ball.js';
import { statsOf } from './attrs.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').RefereeDef} RefereeDef */

/** Frames a ball taken is dragged in before it vanishes (锦标-2: 「0.3秒后使其进入消失状态」). */
export const DRAG_FRAMES = secondsToFrames(0.3);
/** Frames a ball stays vanished before it is shot out again (锦标-2; the page leaves it unknown: INF-0664). */
export const HOLD_FRAMES = secondsToFrames(1);

/** The ball a referee holds, or null. @param {World} w @param {Unit} d */
const heldBy = (w, d) => w.units.find((u) => u.ball?.ref?.by === d.id) ?? null;

/**
 * The ball a referee may take now (锦标-2): the nearest within its radius that is on the ground, in play and not taken.
 * @param {World} w @param {Unit} d @param {RefereeDef} r
 */
function takeable(w, d, r) {
  let best = null, bd = r.radius * r.radius;
  for (const b of w.units) {
    if (!b.ball || b.hidden || b.hp <= 0 || b.ball.goal !== undefined || b.ball.ref || statsOf(b).flying) continue;
    const dx = b.x - d.x, dy = b.y - d.y, d2 = dx * dx + dy * dy;
    if (d2 <= bd) { best = b; bd = d2; }
  }
  return best;
}

/**
 * The angle a referee shoots at (锦标-2): one at random in its right half — straight up and down too —, the half toward
 * a wall beside it left out. @param {World} w @param {Content} c @param {Unit} d
 */
function shotAngle(w, c, d) {
  const row = Math.round(d.y), col = Math.round(d.x), open = (/** @type {number} */ r) => passable(tileAt(c.level, r, col), false);
  const lo = open(row - 1) ? -Math.PI / 2 : 0, hi = open(row + 1) ? Math.PI / 2 : 0;
  return lo + draw(w) * (hi - lo);
}

/**
 * A taken ball's next frame (锦标-2): dragged in to the referee's centre; vanished; after the hold, back on the referee's
 * tile and shot out. @param {World} w @param {Content} c @param {Unit} d @param {Unit} b @param {RefereeDef} r
 */
function holdStep(w, c, d, b, r) {
  const s = /** @type {NonNullable<Unit['ball']>} */ (b.ball), ref = /** @type {NonNullable<typeof s.ref>} */ (s.ref), e = w.frame - ref.at;
  if (e < DRAG_FRAMES) {
    const k = (e + 1) / DRAG_FRAMES;
    displace(b, ref.x + (d.x - ref.x) * k, ref.y + (d.y - ref.y) * k);
    if (e + 1 === DRAG_FRAMES) board(b);
    return;
  }
  if (e < DRAG_FRAMES + HOLD_FRAMES) return;
  alight(c, b, { x: d.x, y: d.y });
  delete s.ref; delete s.sel; delete s.selUntil;
  const a = shotAngle(w, c, d);
  kickSlide(b, cos(a), sin(a), s.force * r.force * FORCE_TO_SPEED);
}

/**
 * The referees' frame (锦标-2): each on the field carries on with the ball it holds, or, ready, takes one — stopped,
 * held for no player —, then waits its interval. @param {World} w @param {Content} c
 */
export function refereeStep(w, c) {
  for (const d of w.units) {
    const r = d.kind === KIND.DEVICE && d.hp > 0 && !d.hidden ? c.devices?.[d.key]?.referee : undefined;
    if (!r) continue;
    const held = heldBy(w, d);
    if (held) { holdStep(w, c, d, held, r); continue; }
    if ((d.ab['@ref'] ?? 0) > w.frame) continue;
    const b = takeable(w, d, r);
    if (!b?.ball) continue;
    stopSlide(b);
    b.ball.ref = { by: d.id, at: w.frame, x: b.x, y: b.y };
    b.ball.sel = d.id;
    b.ball.selUntil = Number.MAX_SAFE_INTEGER;
    d.ab['@ref'] = w.frame + secondsToFrames(r.every);
  }
}
