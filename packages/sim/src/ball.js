// 足球 (docs/spec/football.md 足球-2…足球-5): a ball takes no damage; what our units deal it adds up — a direction for
// each hit, a fifth of it from a unit not on its tile or the four beside it — until the total reaches the ball's
// threshold, and then it is kicked at its own force along the summed direction (the kick itself is displacement.js's,
// the hook football.js's). It slides like any 失衡 (位移-3) but the exact way under its own friction, bounces off walls
// and barriers by its restitution — a barrier hurt by it —, rolls through our units, stops by one of ours that can
// still block it, and a goal is scored when its centre enters a goal tile.
import { FPS } from '@aue/math';
import { KIND, SCORE_GOAL } from '@aue/schema';
import { FRICTION, ALLY_COLLIDER_RADIUS } from './constants.js';
import { statsOf } from './attrs.js';
import { addBuff, makeBuff } from './buffs.js';
import { tileOf } from './body.js';
import { tileAt } from './level.js';
import { passable } from './paths.js';
import { blockLoad, canBlock } from './blocking.js';
import { dealDamage } from './damage.js';
import { isKeeper, catchBall } from './pitch.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {NonNullable<Unit['ball']>} Ball */

/** A ball's hit and collision circle, in tiles (足球-2). */
export const BALL_RADIUS = 0.3;

/** One of ours within this distance of a ball's centre that can still block it stops it (足球-4). */
export const BALL_STOP_RADIUS = 0.35;

/** A push's force (力度) as a speed, tiles/s: the list value × 0.01 on a mass of 1 (位移-2, 足球-3). */
export const FORCE_TO_SPEED = 0.01;

/** The share of a hit's direction from a unit that is not on the ball's tile or the four beside it (足球-3). */
export const FAR_SHARE = 0.2;

/** The goal tiles (足球-1): a ball in ours is the other side's goal, in theirs ours. */
export const GOAL_TILES = Object.freeze({ ours: 'tile_allygoal', theirs: 'tile_enemygoal' });

/**
 * A ball's record (足球-2): `physic`'s friction factor, restitution, default force and the damage that kicks it, the
 * block that stops it (`aura`'s `block_cnt`), and the points a goal of it scores (足球-7: 1, 至纯源石球 3).
 * @typedef {{ friction: number, restitution: number, force: number, need: number, block: number, points: number, cover?: number }} BallParams
 */

/**
 * Makes an enemy a ball (足球-2): its physics, nothing summed, touching nobody; and the buff of what a ball is — it
 * does not attack, cannot be blocked, stays where it is unless kicked (束缚), and 晕眩, 寒冷, 冻结 and 沉睡 do not take.
 * @param {Unit} u @param {BallParams} p
 */
export function makeBall(u, p) {
  u.ball = { f: p.friction, e: p.restitution, force: p.force, need: p.need, block: p.block, points: p.points, sum: 0, ax: 0, ay: 0, touch: [], ...(p.cover ? { cover: p.cover } : {}) };
  addBuff(u, makeBuff({ key: 'ball', src: u.id, flags: { noAttack: true, unblockable: true, root: true,
    'immune:stun': true, 'immune:cold': true, 'immune:enemyCold': true, 'immune:freeze': true, 'immune:enemyFreeze': true, 'immune:sleep': true } }));
}

/** @param {number} x @param {number} y */
const len = (x, y) => Math.sqrt(x * x + y * y);

/** Whether a unit is one of ours whose hits move a ball (足球-3): an operator or a device of ours. @param {Unit} u */
export const kicker = (u) => u.kind === KIND.OPERATOR || u.kind === KIND.DEVICE;

/**
 * The direction one hit adds (足球-3): from the source to the ball, or (1, 0) when they share a tile; a fifth of it
 * when the source is not on the ball's tile or the four beside it.
 * @param {Unit} b @param {Unit} src @returns {[number, number]}
 */
export function hitDirection(b, src) {
  const [br, bc] = tileOf(b), [sr, sc] = tileOf(src);
  if (br === sr && bc === sc) return [1, 0];
  const dx = b.x - src.x, dy = b.y - src.y, d = len(dx, dy);
  const k = Math.abs(br - sr) + Math.abs(bc - sc) <= 1 ? 1 : FAR_SHARE;
  return d > 0 ? [(dx / d) * k, (dy / d) * k] : [k, 0];
}

/**
 * A hit summed on a ball (足球-3, 锦标-4): from one of ours, while the ball is neither in 失衡 nor hidden, the hit's
 * direction and its damage are added up. Whether it was. @param {Unit} b @param {Unit | null} src @param {number} amount
 */
export function chargeBall(b, src, amount) {
  const s = b.ball;
  if (!s || !src || !kicker(src) || b.slide || b.hidden || !(amount > 0)) return false;
  const [dx, dy] = hitDirection(b, src);
  s.ax += dx;
  s.ay += dy;
  s.sum += amount;
  return true;
}

/**
 * A hit on a ball (足球-3): summed (chargeBall); once the damage reaches the ball's threshold both start again and the
 * kick's direction — the sum as a unit vector, (1, 0) when the sum is nothing — is returned. Null when the hit kicks nothing.
 * @param {Unit} b @param {Unit | null} src @param {number} amount @returns {[number, number] | null}
 */
export function ballHit(b, src, amount) {
  const s = b.ball;
  if (!s || !chargeBall(b, src, amount) || s.sum < s.need) return null;
  const d = len(s.ax, s.ay);
  /** @type {[number, number]} */
  const dir = d > 0 ? [s.ax / d, s.ay / d] : [1, 0];
  s.sum = 0;
  s.ax = 0;
  s.ay = 0;
  return dir;
}

/** The ice or slime on a ball's tile (足球-16): its friction change, 0 for none. @param {World | undefined} w @param {Content} c @param {Unit} b */
const coverOf = (w, c, b) => {
  const [r, col] = tileOf(b);
  return w?.football?.cover?.[String(r * c.level.width + col)] ?? 0;
};

/** A ball's friction (足球-4, 足球-16): 位移-3's μg × its own factor with its tile's ice or slime, not below 0. @param {Content} c @param {Unit} b @param {World} [w] */
export const ballFriction = (c, b, w) => FRICTION * Math.max(0, (b.ball?.f ?? 1) + coverOf(w, c, b));

/**
 * How far a ball rolls in a frame (足球-4): at speed v (tiles/s) under a deceleration f (tiles/s²), the exact way — v·dt −
 * f·dt²/2 —, or v²/2f when it stops within the frame. @param {number} v @param {number} f
 */
export const ballRoll = (v, f) => (v > f / FPS ? (v - f / (2 * FPS)) / FPS : (v * v) / (2 * f));

/**
 * A ball that leaves ice or slime covers the 球场 tile it is on with it (足球-16), whatever covered it before.
 * @param {World} w @param {Content} c @param {Unit} b
 */
function coverTile(w, c, b) {
  const st = w.football, mod = b.ball?.cover;
  if (!st || !mod) return;
  const [r, col] = tileOf(b);
  if (tileAt(c.level, r, col)?.key !== PITCH_TILE) return;
  (st.cover ??= {})[String(r * c.level.width + col)] = mod;
}

/** The tile a ball's ice or slime covers (足球-16): the field's own. */
const PITCH_TILE = 'tile_football';

/**
 * Whether a ball's circle at (x, y) overlaps the square of half side h centred at (cx, cy).
 * @param {number} x @param {number} y @param {number} cx @param {number} cy @param {number} h
 */
function overlaps(x, y, cx, cy, h) {
  const nx = Math.min(Math.max(x, cx - h), cx + h), ny = Math.min(Math.max(y, cy - h), cy + h);
  return (x - nx) * (x - nx) + (y - ny) * (y - ny) < BALL_RADIUS * BALL_RADIUS;
}

/**
 * Whether a ball's circle at (x, y) overlaps a tile a ground unit cannot enter, or leaves the map (足球-4).
 * @param {Content} c @param {number} x @param {number} y
 */
export function walled(c, x, y) {
  const r = BALL_RADIUS;
  for (let row = Math.round(y - r); row <= Math.round(y + r); row++) {
    for (let col = Math.round(x - r); col <= Math.round(x + r); col++) {
      if (!passable(tileAt(c.level, row, col), false) && overlaps(x, y, col, row, 0.5)) return true;
    }
  }
  return false;
}

/** Half the side of a device's square body on the field (足球-12: 阵地屏障), or 0. @param {Content} c @param {Unit} u */
export const squareHalf = (c, u) => (u.kind === KIND.DEVICE && u.hp > 0 && !u.hidden ? (c.devices?.[u.key]?.square ?? 0) / 2 : 0);

/**
 * What a ball's circle at (x, y) runs into (足球-4, 足球-12): a wall ('wall'), else a device whose square body it
 * overlaps, else null. @param {World | undefined} w @param {Content} c @param {number} x @param {number} y
 * @returns {'wall' | Unit | null}
 */
function blockerAt(w, c, x, y) {
  if (walled(c, x, y)) return 'wall';
  return w?.units.find((u) => { const h = squareHalf(c, u); return h > 0 && overlaps(x, y, u.x, u.y, h); }) ?? null;
}

/**
 * Where a sliding ball's move by (dx, dy) takes it this frame (足球-4, 足球-12): along x, then along y; a move that
 * would put its circle into a wall or a device's square body does not happen, and that axis bounces; the devices it
 * bounced off.
 * @param {World | undefined} w @param {Content} c @param {Unit} b @param {number} dx @param {number} dy
 * @returns {{ x: number, y: number, bx: boolean, by: boolean, hit: Unit[] }}
 */
export function ballMove(w, c, b, dx, dy) {
  const ax = blockerAt(w, c, b.x + dx, b.y), x = ax ? b.x : b.x + dx;
  const ay = blockerAt(w, c, x, b.y + dy), y = ay ? b.y : b.y + dy;
  /** @type {Unit[]} */
  const hit = [];
  for (const u of [ax, ay]) if (u && u !== 'wall' && !hit.includes(u)) hit.push(u);
  return { x, y, bx: !!ax, by: !!ay, hit };
}

/** The radius a unit of ours runs into a ball at (足球-4): an operator's or a device's collider. */
const COLLIDER = ALLY_COLLIDER_RADIUS;

/** @typedef {{ x: number, y: number }} Point */

/**
 * Whether the segment from a to b passes within r of a point p.
 * @param {Point} a @param {Point} b @param {Point} p @param {number} r
 */
function nearSegment(a, b, p, r) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t = l2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  const px = a.x + dx * t - p.x, py = a.y + dy * t - p.y;
  return px * px + py * py < r * r;
}

/**
 * Whether the segment from a to b passes through the square of half side h centred at p (a slab test).
 * @param {Point} a @param {Point} b @param {Point} p @param {number} h
 */
function crossesSquare(a, b, p, h) {
  let lo = 0, hi = 1;
  for (const [s0, d, m] of [[a.x, b.x - a.x, p.x], [a.y, b.y - a.y, p.y]]) {
    if (d === 0) { if (Math.abs(s0 - m) > h) return false; continue; }
    const t0 = (m - h - s0) / d, t1 = (m + h - s0) / d;
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
  }
  return lo <= hi;
}

/**
 * Whether a ball could roll from a to b touching none of ours and no device's square body (足球-15): no operator or
 * device of ours within the ball's radius and its collider of the line, no square body within the ball's radius of it.
 * @param {World} w @param {Content} c @param {Point} a @param {Point} b
 */
export function clearLine(w, c, a, b) {
  return !w.units.some((u) => {
    const h = squareHalf(c, u);
    if (h > 0) return crossesSquare(a, b, u, h + BALL_RADIUS);
    return u.hp > 0 && !u.hidden && (u.kind === KIND.OPERATOR || (u.kind === KIND.DEVICE && u.base.hostile !== true)) && nearSegment(a, b, u, BALL_RADIUS + COLLIDER);
  });
}

/**
 * A shot's hurt on a ball (足球-15): every `every` frames until `until`, `amount` physical damage to each of ours its
 * circle touches (as 足球-4's collisions), from the ball. @param {World} w @param {Content} c @param {Unit} b
 */
export function hurtStep(w, c, b) {
  const h = b.ball?.hurt;
  if (!h || b.hidden) return;
  if (w.frame >= h.next) {
    h.next += h.every;
    const reach = BALL_RADIUS + COLLIDER;
    for (const u of w.units.filter((x) => kicker(x) && x.hp > 0 && !x.hidden && squareHalf(c, x) === 0 && (x.x - b.x) * (x.x - b.x) + (x.y - b.y) * (x.y - b.y) < reach * reach)) {
      dealDamage(w, b, u, { type: 'phys', amount: h.amount }, c);
    }
  }
  if (w.frame >= h.until && b.ball) delete b.ball.hurt;
}

/** What a ball's damage to a unit is multiplied by (足球-12): a device's `ballDamage`, else 1. @param {Content} c @param {Unit} u */
export const ballScale = (c, u) => (u.kind === KIND.DEVICE ? c.devices?.[u.key]?.ballDamage ?? 1 : 1);

/**
 * Whether a sliding ball runs into a unit this frame (足球-4, 足球-12): only a unit with a square body (阵地屏障), when
 * the ball bounced off it; an operator or another device it passes, untouched.
 * @param {Content} c @param {Set<number>} bumped @param {Unit} u
 */
const touches = (c, bumped, u) => kicker(u) && u.hp > 0 && !u.hidden && squareHalf(c, u) > 0 && bumped.has(u.id);

/**
 * The units a sliding ball runs into this frame (足球-4, 足球-12): each new one takes true damage of the ball's speed
 * (tiles/s) × its attack, × a device's `ballDamage`; one still touching it from the frame before takes none.
 * @param {World} w @param {Content} c @param {Unit} b @param {number} speed its speed this frame, tiles/s
 */
export function collide(w, c, b, speed) {
  const s = /** @type {Ball} */ (b.ball), bumped = new Set(s.bump ?? []);
  delete s.bump;
  const now = w.units.filter((u) => touches(c, bumped, u));
  const before = new Set(s.touch);
  s.touch = now.map((u) => u.id);
  const amount = speed * statsOf(b).atk;
  if (!(amount > 0)) return;
  for (const u of now) if (!before.has(u.id)) dealDamage(w, b, u, { type: 'true', amount: amount * ballScale(c, u) }, c);
}

/**
 * The one of ours near a ball that stops it (足球-4), or null: an operator within BALL_STOP_RADIUS of its centre, able
 * to block, with at least the ball's `block` of its block count left; the first in the units' order.
 * @param {World} w @param {Unit} b
 */
export function stopper(w, b) {
  const s = /** @type {Ball} */ (b.ball), r = BALL_STOP_RADIUS;
  return w.units.find((u) => u.kind === KIND.OPERATOR && u.hp > 0 && !u.hidden && (u.x - b.x) * (u.x - b.x) + (u.y - b.y) * (u.y - b.y) <= r * r
    && canBlock(statsOf(u)) && statsOf(u).blockCnt - blockLoad(w, u) >= s.block) ?? null;
}

/**
 * The goal a ball's centre is in (足球-5): 'ours' (our goal: the other side scores), 'theirs', or null.
 * @param {Content} c @param {Unit} b @returns {'ours' | 'theirs' | null}
 */
export function goalOf(c, b) {
  const [r, col] = tileOf(b), key = tileAt(c.level, r, col)?.key;
  return key === GOAL_TILES.ours ? 'ours' : key === GOAL_TILES.theirs ? 'theirs' : null;
}

/**
 * A ball goes into a goal (足球-5): the event `score` (its `goal` by SCORE_GOAL); the ball notes the goal, and leaves
 * the field quietly at the frame's end (足球-7).
 * @param {World} w @param {Unit} b @param {'ours' | 'theirs'} goal
 */
export function scored(w, b, goal) {
  w.events.push({ type: 'score', id: b.id, goal: SCORE_GOAL[goal] });
  if (b.ball) b.ball.goal = SCORE_GOAL[goal];
}

/**
 * After a sliding ball's move this frame (足球-4, 足球-5, 足球-14): it hurts the units it ran into; then a goal ('goal':
 * it stops and leaves at the frame's end), or one of ours that stops it — a goalkeeper catches it ('catch') —
 * ('stop'); null while it slides on.
 * @param {World} w @param {Content} c @param {Unit} b @param {number} speed @returns {'goal' | 'stop' | 'catch' | null}
 */
export function ballMoved(w, c, b, speed) {
  collide(w, c, b, speed);
  coverTile(w, c, b);
  const goal = goalOf(c, b);
  if (goal) { scored(w, b, goal); return 'goal'; }
  const by = stopper(w, b);
  if (!by) return null;
  if (!isKeeper(by)) return 'stop';
  catchBall(w, b, by);
  return 'catch';
}
