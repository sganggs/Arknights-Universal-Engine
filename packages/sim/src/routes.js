// Routes (docs/spec/paths.md 路线-1…路线-5, 索敌-6): an enemy's route as legs — moves along the flow field (flyers
// straight), waits, disappearing and appearing, patrols — walked a frame at a time; units content moves; and its 路径距离
// for 仇恨值.
import { FPS, secondsToFrames, hypot } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { flowField, chain, keyAt, passable, crossable, isHole, routeTiles } from './paths.js';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content @typedef {import('./types.js').World} World */
/** @typedef {import('./types.js').Route} Route @typedef {import('./types.js').Cell} Cell @typedef {import('./types.js').Checkpoint} Checkpoint */
/** @typedef {import('./types.js').Level} Level */

/**
 * A leg of a route. A move goes to tile (r, c), ending at (x, y) = the tile centre moved by the checkpoint's offset.
 * @typedef {{ t: 'move', r: number, c: number, x: number, y: number, final: boolean, patrol: boolean }
 *   | { t: 'wait', frames: number } | { t: 'until', frames: number } | { t: 'disappear' } | { t: 'appear', x: number, y: number }} Leg
 */

/** @type {WeakMap<Route, Leg[]>} */
const LEGS = new WeakMap();

/** @param {Checkpoint} cp @param {boolean} patrol @returns {Leg} */
const moveTo = (cp, patrol) => ({ t: 'move', r: cp.row, c: cp.col, x: cp.col + (cp.dx ?? 0), y: cp.row + (cp.dy ?? 0), final: false, patrol });

/**
 * The legs of one checkpoint (路线-1).
 * @param {Checkpoint} cp @returns {Leg[]}
 */
function legsOfCheckpoint(cp) {
  switch (cp.type) {
    case 'MOVE': return [moveTo(cp, false)];
    case 'PATROL_MOVE': return [moveTo(cp, true)];
    case 'WAIT_FOR_SECONDS': return [{ t: 'wait', frames: secondsToFrames(cp.time) }];
    case 'WAIT_CURRENT_FRAGMENT_TIME': return [{ t: 'until', frames: secondsToFrames(cp.time) }];
    case 'DISAPPEAR': return cp.time > 0 ? [{ t: 'disappear' }, { t: 'wait', frames: secondsToFrames(cp.time) }] : [{ t: 'disappear' }];
    case 'APPEAR_AT_POS': return [{ t: 'appear', x: cp.col, y: cp.row }];
    default: throw new RangeError(`route: unknown checkpoint type ${cp.type}`);
  }
}

/**
 * A route's legs (路线-1): its checkpoints in order, then a final move to its end. Cached beside the route.
 * @param {Route} r @returns {Leg[]}
 */
export function legsOf(r) {
  let legs = LEGS.get(r);
  if (!legs) {
    legs = [...r.checkpoints.flatMap(legsOfCheckpoint), { t: 'move', r: r.end.row, c: r.end.col, x: r.end.col, y: r.end.row, final: true, patrol: false }];
    LEGS.set(r, legs);
  }
  return legs;
}

/**
 * The leg after leg i (路线-3): the next one, except that after the last patrol move of a run of patrol moves the route
 * goes back to the first of them.
 * @param {Leg[]} legs @param {number} i
 */
export function nextLeg(legs, i) {
  const leg = legs[i];
  if (leg.t !== 'move' || !leg.patrol || (legs[i + 1]?.t === 'move' && /** @type {any} */ (legs[i + 1]).patrol)) return i + 1;
  let j = i;
  while (j > 0 && legs[j - 1].t === 'move' && /** @type {any} */ (legs[j - 1]).patrol) j--;
  return j;
}

/**
 * An enemy's speed in tiles per frame (移动-1): its move speed × the level's moveMultiplier / FPS; 0 while it cannot
 * move (状态-5).
 * @param {Content} c @param {Unit} u
 */
export function speedOf(c, u) {
  const s = statsOf(u);
  return s.immobile ? 0 : (s.moveSpeed * c.level.options.moveMultiplier) / FPS;
}

/**
 * The tiles a straight segment passes through, in order (路线-2): tile (r, c) spans [c − ½, c + ½] × [r − ½, r + ½]; a
 * segment through a corner point steps diagonally and crosses neither tile beside it. Whether all are passable — for a
 * ground unit none a 地穴 (地图-4) — and no step crosses a closed edge (地图-2).
 * @param {Level} m @param {{ x: number, y: number }} p @param {{ x: number, y: number }} q @param {boolean} fly
 */
export function segmentClear(m, p, q, fly) {
  const x0 = p.x, y0 = p.y, x1 = q.x, y1 = q.y, X0 = x0 + 0.5, Y0 = y0 + 0.5, dx = x1 + 0.5 - X0, dy = y1 + 0.5 - Y0;
  let c = Math.floor(X0), r = Math.floor(Y0);
  const cEnd = Math.floor(x1 + 0.5), rEnd = Math.floor(y1 + 0.5), sc = Math.sign(dx), sr = Math.sign(dy);
  const ddx = dx !== 0 ? 1 / Math.abs(dx) : Infinity, ddy = dy !== 0 ? 1 / Math.abs(dy) : Infinity;
  let tx = dx !== 0 ? (sc > 0 ? c + 1 - X0 : X0 - c) * ddx : Infinity, ty = dy !== 0 ? (sr > 0 ? r + 1 - Y0 : Y0 - r) * ddy : Infinity;
  const cell = (/** @type {number} */ rr, /** @type {number} */ cc) => rr >= 0 && rr < m.height && cc >= 0 && cc < m.width && passable(m.tiles[rr][cc], fly) && (fly || !isHole(m.tiles[rr][cc]));
  if (!cell(r, c)) return false;
  for (let n = Math.abs(cEnd - c) + Math.abs(rEnd - r); n > 0 && (r !== rEnd || c !== cEnd); n--) {
    const from = r * m.width + c;
    if (tx < ty) { c += sc; tx += ddx; }
    else if (ty < tx) { r += sr; ty += ddy; }
    else { c += sc; r += sr; tx += ddx; ty += ddy; }
    if (!cell(r, c) || !crossable(m, from, r * m.width + c, fly)) return false;
  }
  return true;
}

/** Whether this leg is flown straight (路线-2): an air route, or a unit that has itself become a flyer (敌能-34).
 * @param {Route} route @param {Unit} e */
const air = (route, e) => route.motion === 'FLY' || e.base.motion === 'FLY';

/**
 * The path of a move leg from where the enemy stands (路线-2): a flyer — an air route, or a unit that has itself become
 * one (敌能-34) — straight to the end; a ground enemy along the flow field from its tile — straight to the end when the
 * field does not reach it — first back to its tile centre when it stands off the centre and the straight line to the
 * first point would cross a tile it cannot walk. Flat [x, y, …].
 * @param {Content} c @param {Route} route @param {Unit} e @param {Extract<Leg, { t: 'move' }>} leg @returns {number[]}
 */
export function planLeg(c, route, e, leg) {
  if (air(route, e)) return [leg.x, leg.y];
  const m = c.level, k = keyAt(m, e.x, e.y), f = flowField(m, leg.r, leg.c, { diagonal: route.allowDiagonal ?? true });
  const pts = chain(f, k).flatMap((t) => [t % m.width, Math.floor(t / m.width)]);
  if (pts.length === 0 || pts[pts.length - 2] !== leg.x || pts[pts.length - 1] !== leg.y) pts.push(leg.x, leg.y);
  if (k < 0 || f.dist[k] < 0) return pts;
  const cx = k % m.width, cy = Math.floor(k / m.width);
  if ((e.x !== cx || e.y !== cy) && !segmentClear(m, e, { x: pts[0], y: pts[1] }, false)) pts.unshift(cx, cy);
  return pts;
}

/**
 * Walks the planned path of a move leg (路线-2) up to `budget` tiles; returns what is left of the budget once the leg's
 * end is reached, or −1 when the budget ran out on the way.
 * @param {Unit} e @param {number} budget
 */
function walkPath(e, budget) {
  let left = budget;
  while (e.pt * 2 < e.path.length) {
    const px = e.path[e.pt * 2], py = e.path[e.pt * 2 + 1], dx = px - e.x, dy = py - e.y, d = Math.sqrt(dx * dx + dy * dy);
    if (d > left) { e.x += (dx / d) * left; e.y += (dy / d) * left; return -1; }
    e.x = px; e.y = py; left -= d; e.pt++;
  }
  return left;
}

/** Ends the current leg: the next one, its path not planned yet. @param {Unit} e @param {Leg[]} legs */
function endLeg(e, legs) {
  e.leg = nextLeg(legs, e.leg);
  e.path = [];
  e.pt = 0;
  e.wait = -1;
}

/**
 * Whether a waiting leg still holds the enemy this frame (路线-1): a wait of n frames holds it for n whole frames — when
 * it arrived by moving in this frame, from the next frame on; a wait for the fragment holds it until n frames after its
 * fragment began.
 * @param {World} w @param {Unit} e @param {Extract<Leg, { t: 'wait' | 'until' }>} leg @param {boolean} moved
 */
function holds(w, e, leg, moved) {
  if (leg.t === 'until') return w.frame < e.frag + leg.frames;
  if (e.wait < 0) {
    e.wait = leg.frames;
    if (moved && e.wait > 0) return true;
  }
  if (e.wait === 0) return false;
  e.wait--;
  return true;
}

/**
 * The enemy's own motion becomes flying (敌能-34, 路线-2): the leg it is on is planned again from here, as a content
 * move drops a plan (路线-5).
 * @param {Unit} e
 */
export function becomeFlyer(e) {
  e.base.motion = 'FLY';
  e.path = [];
  e.pt = 0;
}

/**
 * Content moves a unit (路线-5): it stands at (x, y) at once; an enemy plans the move leg it is on afresh from there —
 * its leg, a wait it is in and its route stay.
 * @param {Unit} u @param {number} x @param {number} y
 */
export function displace(u, x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  u.x = x;
  u.y = y;
  if (u.kind !== KIND.ENEMY) return;
  u.path = [];
  u.pt = 0;
}

/**
 * The tile keys of an enemy's way from its tile to the end of the move leg it is on (寻路-2), its own tile first; none
 * when it is not on a move leg or off the map.
 * @param {Content} c @param {Unit} e @returns {number[]}
 */
export function wayKeys(c, e) {
  const m = c.level, route = m.routes[e.route], leg = e.route >= 0 ? legsOf(route)[e.leg] : null, k = keyAt(m, e.x, e.y);
  if (!leg || leg.t !== 'move' || k < 0) return [];
  return routeTiles(m, k, leg.r * m.width + leg.c, { fly: air(route, e), diagonal: route.allowDiagonal ?? true }) ?? [k];
}

/**
 * A detour (路线-6): on a move leg, the enemy goes to the centre of tile (row, col) first, then on to the leg's end —
 * both planned as a leg is (路线-2).
 * @param {Content} c @param {Unit} e @param {number} row @param {number} col
 */
export function detour(c, e, row, col) {
  const route = c.level.routes[e.route], leg = legsOf(route)[e.leg];
  if (leg.t !== 'move') return;
  const first = planLeg(c, route, e, { t: 'move', r: row, c: col, x: col, y: row, final: false, patrol: false });
  e.path = [...first, ...planLeg(c, route, /** @type {Unit} */ ({ ...e, x: col, y: row }), leg)];
  e.pt = 0;
}

/**
 * An enemy goes aboard a carrier (敌能-16): it disappears and stops where it is in its route.
 * @param {Unit} u
 */
export function board(u) {
  u.hidden = true;
  u.path = [];
  u.pt = 0;
  u.wait = -1;
}

/**
 * A passenger alights (敌能-16). It appears at the centre of `at`, unless `how.exact`, and goes on from there.
 * `how.route` switches it to that route and leg first — the carrier's remaining route. A wait it is then on is skipped.
 * @param {Content} c @param {Unit} u @param {{ x: number, y: number }} at
 * @param {{ exact?: boolean, route?: number, leg?: number }} [how]
 */
export function alight(c, u, at, how) {
  u.x = how?.exact ? at.x : Math.round(at.x);
  u.y = how?.exact ? at.y : Math.round(at.y);
  u.hidden = false;
  if (how?.route !== undefined) {
    u.route = how.route;
    u.leg = how.leg ?? u.leg;
  }
  const legs = legsOf(c.level.routes[u.route]), leg = legs[u.leg];
  if (leg && (leg.t === 'wait' || leg.t === 'until')) endLeg(u, legs);
  u.path = [];
  u.pt = 0;
  u.wait = -1;
}

/**
 * An enemy brought in by another (敌能-22) goes on with that one's route from the leg it was given — that leg skipped
 * when it is a wait, as for a passenger (敌能-16).
 * @param {Content} c @param {Unit} u
 */
export function joinRoute(c, u) {
  const legs = legsOf(c.level.routes[u.route]), leg = legs[u.leg];
  if (leg.t === 'wait' || leg.t === 'until') endLeg(u, legs);
}

/**
 * While 恐惧 or 诱导 moves the enemy (状态-10, 状态-11): disappearing and appearing still happen, and a wait keeps
 * counting down — these are not 「无法移动」, which would freeze the wait (移动-1). A move leg is not walked; its plan is
 * dropped so the route starts again from wherever the induced move leaves the enemy.
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function yieldRoute(w, c, e) {
  if (e.route < 0) return;
  const legs = legsOf(c.level.routes[e.route]);
  for (let guard = legs.length + 2; guard > 0; guard--) {
    const leg = legs[e.leg];
    if (!leg || leg.t === 'move') { e.path = []; e.pt = 0; return; }
    if (leg.t === 'wait' || leg.t === 'until') {
      if (holds(w, e, leg, false)) return;
    } else {
      e.hidden = leg.t === 'disappear';
      if (leg.t === 'appear') { e.x = leg.x; e.y = leg.y; }
    }
    endLeg(e, legs);
  }
}

/**
 * One frame of an enemy's route (路线-1…路线-3), for an enemy free to follow it (not blocked, not attacking, able to
 * move): disappearing and appearing take no time, waits hold it, moves spend `speed` tiles, the rest carrying over to
 * the next leg. Returns true when it reached the end of its route.
 * @param {World} w @param {Content} c @param {Unit} e @param {number} speed
 */
export function followRoute(w, c, e, speed) {
  const route = c.level.routes[e.route], legs = legsOf(route);
  let budget = speed;
  for (let guard = legs.length * 2 + 2; guard > 0; guard--) {
    const leg = legs[e.leg];
    if (leg.t === 'disappear' || leg.t === 'appear') {
      e.hidden = leg.t === 'disappear';
      if (leg.t === 'appear') { e.x = leg.x; e.y = leg.y; }
    } else if (leg.t === 'wait' || leg.t === 'until') {
      if (holds(w, e, leg, budget < speed)) return false;
    } else {
      if (e.path.length === 0) e.path = planLeg(c, route, e, leg);
      budget = walkPath(e, budget);
      if (budget < 0) return false;
      if (leg.final) return true;
    }
    endLeg(e, legs);
  }
  return false;
}

/**
 * The 终点距离 from tile k through the move legs from leg i on (索敌-6): the flow-field distances — tile steps — from
 * each point to the next; after an appear the next distance starts where the enemy appears; a leg no field reaches
 * counts its straight length. Patrol runs are counted once. `fly` is this enemy's leg (路线-2): an air route, or a unit
 * that has itself become a flyer (敌能-34).
 * @param {Level} m @param {Leg[]} legs @param {number} i @param {number} k @param {boolean} fly
 */
function stepsFrom(m, legs, i, k, fly) {
  let d = 0, from = k;
  for (let j = i; j < legs.length; j++) {
    const leg = legs[j];
    if (leg.t === 'appear') from = keyAt(m, leg.x, leg.y);
    if (leg.t !== 'move') continue;
    const f = flowField(m, leg.r, leg.c, { fly });
    const fx = from % m.width, fy = Math.floor(from / m.width);
    d += from >= 0 && f.dist[from] >= 0 ? f.dist[from] : hypot(leg.x - fx, leg.y - fy);
    from = f.dest;
  }
  return d;
}

/**
 * An enemy's 路径距离 for 仇恨值 (索敌-6). When its tile can reach the target point of its current (or next) move: the
 * 终点距离 from its tile, plus the projection of the vector from its position to its tile centre onto the direction it
 * heads (可负). Otherwise — off the map, or cut off — the straight distance to that target point. A unit with no route
 * (a device, 装置-3) has 0.
 * @param {Content} c @param {Unit} e
 */
export function pathDistance(c, e) {
  if (e.route < 0) return 0;
  const m = c.level, route = m.routes[e.route], legs = legsOf(route), k = keyAt(m, e.x, e.y);
  let i = e.leg;
  while (legs[i].t !== 'move') i++;
  const leg = /** @type {Extract<Leg, { t: 'move' }>} */ (legs[i]);
  const flying = air(route, e);
  const f = flowField(m, leg.r, leg.c, { fly: flying });
  if (k < 0 || f.dist[k] < 0) return hypot(leg.x - e.x, leg.y - e.y);
  const tx = i === e.leg && e.pt * 2 < e.path.length ? e.path[e.pt * 2] : leg.x;
  const ty = i === e.leg && e.pt * 2 < e.path.length ? e.path[e.pt * 2 + 1] : leg.y;
  const hx = tx - e.x, hy = ty - e.y, len = hypot(hx, hy);
  const corr = len > 0 ? ((k % m.width - e.x) * hx + (Math.floor(k / m.width) - e.y) * hy) / len : 0;
  return stepsFrom(m, legs, i, k, flying) + corr;
}
