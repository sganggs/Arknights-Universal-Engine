// 恐惧 and 诱导 (docs/spec/status.md 状态-10, 状态-11). The controller lives on the enemy, so a snapshot
// carries the checkpoint and the path. Numbers the PRTS page states are named below; the rest are INF-0292…INF-0298.
import { hypot } from '@aue/math';
import { statsOf } from './attrs.js';
import { draw } from './rng.js';
import { yieldRoute, planLeg } from './routes.js';
import { flowField, keyAt, passable, isHole, HOLE_COST, OBSTACLE_COST } from './paths.js';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content @typedef {import('./types.js').World} World */
/** @typedef {import('./types.js').Level} Level @typedef {import('./types.js').Drift} Drift @typedef {import('./types.js').Route} Route */

/** 半径 10 格（诱发移动 oldid=383760）. */
const FEAR_RADIUS = 10;
/** 寻路距离 5 格内. */
const FEAR_REACH = 5;
/** 0.5 边长正方形（格心为中心的取法是 INF-0292）. */
const FEAR_SIDE = 0.5;

/** @returns {Drift} */
function fresh() {
  return {
    fearSeq: 0, seenSeq: 0, fearN: 0, self: 1, hx: 0, hy: 0, srcX: 0, srcY: 0, tiles: [],
    aim: -1, ax: 0, ay: 0, way: [], head: 0, placed: 0, seenX: 0, seenY: 0, stamp: '', mode: '',
    nextMark: 0, attractN: -1, marks: [],
  };
}

/** @param {Unit} u @returns {Drift} */
function ensure(u) {
  if (!u.drift) u.drift = fresh();
  return u.drift;
}

/**
 * A fear was applied (状态-10): remember where it hit and where the source stood. The tile list waits until the enemy
 * walks, because applying a status has no map.
 * @param {Unit} u @param {Unit | null} src
 */
export function noteFear(u, src) {
  const d = ensure(u), self = !src || src === u;
  d.fearSeq += 1;
  d.hx = u.x;
  d.hy = u.y;
  d.self = self ? 1 : 0;
  d.srcX = self ? u.x : src.x;
  d.srcY = self ? u.y : src.y;
}

/**
 * An attract was applied (状态-11): a given point, or the source's position, keyed by the buff's `n`.
 * @param {Unit} u @param {Unit | null} src @param {{ x: number, y: number } | undefined} point @returns {number}
 */
export function noteAttract(u, src, point) {
  const d = ensure(u), n = d.nextMark + 1, fixed = point != null;
  d.nextMark = n;
  d.marks.push({ n, src: !fixed && src ? src.id : -1, x: fixed ? point.x : (src ? src.x : 0), y: fixed ? point.y : (src ? src.y : 0), fixed: fixed ? 1 : 0 });
  return n;
}

/** Passable, obstacle, hole and closed edges (状态-10): a change here replans, and the string survives a snapshot. @param {Level} m */
function gridStamp(m) {
  let s = '';
  for (let r = 0; r < m.height; r++) for (let c = 0; c < m.width; c++) {
    const t = m.tiles[r][c];
    s += t.passable === 'ALL' ? 'A' : t.passable === 'NONE' ? 'N' : 'F';
    s += t.obstacle ? 'o' : '.';
    s += isHole(t) ? 'h' : '.';
  }
  for (const e of m.blockEdges ?? []) s += `/${e.row},${e.col},${e.dir},${e.mask}`;
  return s;
}

/** @param {Content} c @param {Unit} e */
const flying = (c, e) => (e.route >= 0 ? c.level.routes[e.route].motion : e.base.motion) === 'FLY';

/** @param {Drift} d @returns {{ dx: number, dy: number, hx: number, hy: number } | null} */
function fanOf(d) {
  if (d.self) return null;
  const dx = d.hx - d.srcX, dy = d.hy - d.srcY;
  if (dx === 0 && dy === 0) return null;
  return { dx, dy, hx: d.hx, hy: d.hy };
}

/**
 * Centre (cx, cy) is inside the radius-10, ±45° fan, boundary included (状态-10). Squares, not a square root: `hypot`
 * rounds an exact 45° or an exact 10 back outside the fan.
 * @param {number} cx @param {number} cy @param {{ dx: number, dy: number, hx: number, hy: number }} away
 */
function inFan(cx, cy, away) {
  const vx = cx - away.hx, vy = cy - away.hy, vv = vx * vx + vy * vy;
  if (vv > FEAR_RADIUS * FEAR_RADIUS) return false;
  if (vv === 0) return true;
  const dot = vx * away.dx + vy * away.dy;
  if (!(dot > 0)) return false;
  const dd = away.dx * away.dx + away.dy * away.dy;
  return 2 * dot * dot >= vv * dd;
}

/** A protection goal or a 地穴 (状态-10, INF-0294). @param {Level} m @param {number} r @param {number} c */
function blockedOut(m, r, c) {
  const t = m.tiles[r][c];
  if (isHole(t) || t.key.startsWith('tile_end') || t.goal) return true;
  for (const rt of m.routes) if (rt.end.row === r && rt.end.col === c) return true;
  return false;
}

/** Flow-field distance from `here` to `dest`, or Infinity when there is none (寻路-1). @param {Level} m @param {number} here @param {number} dest @param {boolean} fly */
function steps(m, here, dest, fly) {
  if (here < 0 || dest < 0) return Infinity;
  if (here === dest) return 0;
  const dist = flowField(m, Math.floor(dest / m.width), dest % m.width, { fly }).dist[here];
  return dist < 0 ? Infinity : dist;
}

/**
 * 恐惧可达地块 in row-major order (状态-10).
 * @param {Level} m @param {Unit} e @param {Drift} d @param {boolean} fly @returns {number[]}
 */
function listTiles(m, e, d, fly) {
  const away = fanOf(d);
  if (!away || e.route < 0) return [];
  const route = m.routes[e.route];
  const goal = flowField(m, route.end.row, route.end.col, { fly, diagonal: route.allowDiagonal ?? true });
  /** @type {number[]} */
  const out = [];
  for (let r = 0; r < m.height; r++) for (let c = 0; c < m.width; c++) {
    const k = r * m.width + c, t = m.tiles[r][c];
    if (!passable(t, fly) || blockedOut(m, r, c) || goal.dist[k] < 0 || !inFan(c, r, away)) continue;
    out.push(k);
  }
  return out;
}

/** The temporary path to the stored checkpoint (路线-2). @param {Content} c @param {Unit} e @param {Drift} d @returns {number[]} */
function planAim(c, e, d) {
  const route = e.route >= 0 ? c.level.routes[e.route] : /** @type {Route} */ ({ motion: e.base.motion, allowDiagonal: true, start: { row: 0, col: 0 }, end: { row: 0, col: 0 }, checkpoints: [] });
  const col = Math.floor(d.aim % c.level.width), row = Math.floor(d.aim / c.level.width);
  return planLeg(c, route, e, { t: 'move', r: row, c: col, x: d.ax, y: d.ay, final: false, patrol: false });
}

/** One checkpoint (状态-10): a random tile within 5 steps, else the tile underfoot, then the square's offset. @param {World} w @param {Content} c @param {Unit} e @param {Drift} d @param {boolean} fly */
function pickFear(w, c, e, d, fly) {
  const m = c.level, here = keyAt(m, e.x, e.y);
  let key = here;
  if (d.tiles.length > 0) {
    const i = Math.floor(draw(w) * d.tiles.length), cand = d.tiles[i];
    if (steps(m, here, cand, fly) <= FEAR_REACH) key = cand;
    else d.tiles.splice(i, 1);
  }
  const ox = (draw(w) - 0.5) * FEAR_SIDE, oy = (draw(w) - 0.5) * FEAR_SIDE;
  if (!fly && key !== here && steps(m, here, key, false) === Infinity) key = here;
  if (key < 0) { d.aim = -1; d.way = []; d.head = 0; return; }
  d.aim = key;
  d.ax = (key % m.width) + ox;
  d.ay = Math.floor(key / m.width) + oy;
  d.way = planAim(c, e, d);
  d.head = 0;
}

/** The checkpoint tile can still be walked to (状态-10). @param {Level} m @param {Unit} e @param {Drift} d @param {boolean} fly */
function aimOpen(m, e, d, fly) {
  if (d.aim < 0) return false;
  const t = m.tiles[Math.floor(d.aim / m.width)][d.aim % m.width];
  if (!passable(t, fly) || isHole(t)) return false;
  return fly || steps(m, keyAt(m, e.x, e.y), d.aim, false) < Infinity;
}

/** Spend `budget` along `way`. Returns what is left once the end is reached. @param {Unit} e @param {Drift} d @param {number} budget */
function walk(e, d, budget) {
  let left = budget;
  while (left > 0 && d.head * 2 < d.way.length) {
    const px = d.way[d.head * 2], py = d.way[d.head * 2 + 1], dx = px - e.x, dy = py - e.y, dist = hypot(dx, dy);
    if (dist > left) { e.x += (dx / dist) * left; e.y += (dy / dist) * left; return 0; }
    e.x = px; e.y = py; left -= dist; d.head += 1;
  }
  return left;
}

/** Fear walking, picking a new checkpoint whenever the current one is reached (状态-10). @param {World} w @param {Content} c @param {Unit} e @param {Drift} d @param {number} speed */
function marchFear(w, c, e, d, speed) {
  const fly = flying(c, e);
  let left = speed;
  for (let guard = 8; guard > 0 && left > 0; guard--) {
    if (d.head * 2 >= d.way.length) pickFear(w, c, e, d, fly);
    if (d.head * 2 >= d.way.length) return;
    left = walk(e, d, left);
  }
}

/** @param {World} w @param {Content} c @param {Unit} e @param {Drift} d @param {number} speed */
function fearMove(w, c, e, d, speed) {
  const fly = flying(c, e), stamp = gridStamp(c.level);
  let nFear = 0;
  for (const b of e.buffs) if (b.key === 'fear') nFear += 1;
  const rebuilt = d.seenSeq !== d.fearSeq;
  if (rebuilt) { d.tiles = listTiles(c.level, e, d, fly); d.seenSeq = d.fearSeq; d.aim = -1; }
  const shoved = d.placed === 1 && (e.x !== d.seenX || e.y !== d.seenY || d.stamp !== stamp);
  const lost = !rebuilt && nFear < d.fearN;
  if (rebuilt || lost || d.aim < 0) pickFear(w, c, e, d, fly);
  else if (shoved && !aimOpen(c.level, e, d, fly)) pickFear(w, c, e, d, fly);
  else if (shoved) { d.way = planAim(c, e, d); d.head = 0; }
  marchFear(w, c, e, d, speed);
  d.fearN = nFear;
  d.mode = 'fear';
  d.placed = 1;
  d.seenX = e.x;
  d.seenY = e.y;
  d.stamp = stamp;
}

/** The newest attract buff still on the enemy (状态-11). @param {Unit} e @returns {import('./types.js').Buff | null} */
function newestAttract(e) {
  /** @type {import('./types.js').Buff | null} */
  let best = null;
  for (const b of e.buffs) if (b.key === 'attract' && (!best || b.n >= best.n)) best = b;
  return best;
}

/** The attract's tile centre, tracking a live source (状态-11). @param {World} w @param {Level} m @param {Drift} d @param {import('./types.js').Buff} b */
function attractAim(w, m, d, b) {
  const mark = d.marks.find((x) => x.n === b.n);
  if (!mark || (mark.fixed === 0 && mark.src < 0)) return null;
  if (mark.fixed === 0) {
    const src = w.units.find((u) => u.id === mark.src && u.hp > 0);
    if (src) { mark.x = src.x; mark.y = src.y; }
  }
  const k = keyAt(m, mark.x, mark.y);
  return k < 0 ? null : { k, x: k % m.width, y: Math.floor(k / m.width) };
}

/** Cost of leaving tile k (寻路-1), subtracted so a unit can be pulled off a high-cost tile (状态-11). @param {Level} m @param {number} k */
function leaveCost(m, k) {
  const t = m.tiles[Math.floor(k / m.width)][k % m.width];
  return isHole(t) ? HOLE_COST : t.obstacle ? OBSTACLE_COST : 1;
}

/**
 * The attract walk does not happen this frame (状态-11, INF-0297): no tile, no field, or — on the ground, after the
 * current tile's own cost — a step of 1000 or more remains.
 * @param {Level} m @param {Unit} e @param {{ k: number, x: number, y: number }} aim @param {boolean} fly
 */
function attractUnsafe(m, e, aim, fly) {
  const here = keyAt(m, e.x, e.y);
  if (here < 0) return true;
  if (here === aim.k) return false;
  const dist = flowField(m, aim.y, aim.x, { fly }).dist[here];
  if (dist < 0) return true;
  return !fly && dist - leaveCost(m, here) >= OBSTACLE_COST;
}

/**
 * The attract path is due a new plan (状态-11): shoved, a different buff, a moved target, or the path ran out short of
 * the centre. Standing on the centre does not replan.
 * @param {Drift} d @param {Unit} e @param {{ k: number, x: number, y: number }} aim @param {import('./types.js').Buff} buff @param {string} stamp
 */
function retarget(d, e, aim, buff, stamp) {
  const shoved = d.placed === 1 && d.mode === 'attract' && (e.x !== d.seenX || e.y !== d.seenY || d.stamp !== stamp);
  if (shoved || d.attractN !== buff.n || d.aim !== aim.k) return true;
  return d.head * 2 >= d.way.length && (e.x !== aim.x || e.y !== aim.y);
}

/** @param {World} w @param {Content} c @param {Unit} e @param {Drift} d @param {number} speed */
function attractMove(w, c, e, d, speed) {
  const m = c.level, fly = flying(c, e), stamp = gridStamp(m), buff = newestAttract(e);
  const aim = buff ? attractAim(w, m, d, buff) : null;
  if (!buff || !aim || attractUnsafe(m, e, aim, fly)) d.way = [];
  else if (retarget(d, e, aim, buff, stamp)) {
    d.aim = aim.k; d.ax = aim.x; d.ay = aim.y; d.attractN = buff.n;
    d.way = planAim(c, e, d); d.head = 0;
  }
  walk(e, d, speed);
  d.mode = 'attract';
  d.placed = 1;
  d.seenX = e.x;
  d.seenY = e.y;
  d.stamp = stamp;
  if (buff) d.attractN = buff.n;
  const live = new Set(e.buffs.filter((b) => b.key === 'attract').map((b) => b.n));
  d.marks = d.marks.filter((mark) => live.has(mark.n));
}

/**
 * One frame of 诱发移动 (状态-10, 状态-11), for an enemy that is feared or attracted and free to walk. Fear outranks
 * attract. Returns nothing; the caller reads the position.
 * @param {World} w @param {Content} c @param {Unit} e @param {number} speed
 */
export function induceStep(w, c, e, speed) {
  const d = ensure(e), flags = statsOf(e).flags;
  yieldRoute(w, c, e);
  if (flags.fear) fearMove(w, c, e, d, speed);
  else { d.fearN = 0; attractMove(w, c, e, d, speed); }
}
