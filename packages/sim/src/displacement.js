// Displacement (docs/spec/displacement.md 位移-1…位移-5): a push gives an enemy a speed at once by its 受力等级 — the
// force's 力度 less its 重量等级 — away from the pusher or along a direction; a pull drags it for a second toward a
// point in front of the puller with a force that falls off as it nears; the enemy is then in 失衡 (UNBALANCE): each
// frame friction takes μg·dt off its speed, a pull adds its force, then it moves, a wall stops it, and the state ends
// once its speed is at most 0.1, its 0.1 s 失衡硬直 and its pull are over. A 静态刚体 enters the same state with no speed
// and leaves it when the force does (位移-5). In 失衡 it neither walks, attacks nor is blocked.
import { FPS, hypot } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { release } from './blocking.js';
import { tileAt } from './level.js';
import { displace } from './routes.js';
import { crossable } from './paths.js';
import { dealDamage } from './damage.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/**
 * A push's source and kind (位移-2): the pusher's centre, a direction for a directional push, the corrections waived
 * (`fixed` both, `anyAngle` the angle one), towards the pusher, an effect's push.
 * @typedef {{ from: { x: number, y: number }, dir?: { x: number, y: number } | null, fixed?: boolean, anyAngle?: boolean, toward?: boolean, effect?: boolean }} PushOptions
 */

/** A push's speed (tiles/s) by 受力等级 −2…3 (位移-2): ≤ −3 none, ≥ 3 as 3. */
export const PUSH_SPEED = Object.freeze({ '-2': 1, '-1': 2, 0: 4, 1: 4.5, 2: 5.3, 3: 5.8 });

/** Friction's deceleration (位移-3): μ 0.5 × g 9.81, tiles/s². */
export const FRICTION = 0.5 * 9.81;

/** 失衡 ends at or below this speed (tiles/s), its 硬直 over (位移-3). */
export const STOP_SPEED = 0.1;

/** The 失衡硬直 in frames (位移-3: 0.1 s). */
export const HARD_FRAMES = 3;

/** A pull's force at its start (N on a mass of 1) by 受力等级 −2…3 (位移-4): ≤ −3 none, ≥ 3 as 3. */
export const PULL_FORCE = Object.freeze({ '-2': 2, '-1': 10, 0: 40, 1: 42, 2: 44, 3: 46 });

/** A pull's point: this far in front of its puller (位移-4). */
export const PULL_POINT = 0.5;

/** Within this distance of its puller's centre a pulled enemy stops (位移-4: 急停). */
export const PULL_STOP = 0.6708;

/**
 * A pull (位移-4) of 力度 `force` on `t` toward `to` (a point in front of the puller at `by`): none at a 受力等级 of −3 or
 * below; else for 1 s (0.5 s below −1) it is pulled each frame by the 受力等级's force × (its distance to `to` ÷ that
 * distance as the pull began)⁴; it is released from its blocker and its swing cut. Whether it is pulled. A 静态刚体 is
 * pulled into 失衡 with no speed for the same duration (位移-5).
 * With `trauma` (移动创伤, 职业-23), the distance it is moved is damage of `per` a tile, dealt every `every` frames by `src`.
 * @param {World} w @param {Content} c @param {Unit} t @param {number} force
 * @param {{ to: { x: number, y: number }, by: { x: number, y: number }, trauma?: { per: number, every: number, src: number } }} o
 */
export function pull(w, c, t, force, o) {
  if (isStatic(t)) return staticPull(t, force, o);
  const level = displaceable(t) ? forceLevel(t, force) : -3, x0 = len(t.x - o.to.x, t.y - o.to.y);
  if (level <= -3 || !(x0 > 0)) return false;
  const s = t.slide ?? { vx: 0, vy: 0, hard: 0 }, f = PULL_FORCE[/** @type {keyof typeof PULL_FORCE} */ (String(Math.min(3, level)))];
  t.slide = { vx: s.vx, vy: s.vy, hard: HARD_FRAMES, pull: { x: o.to.x, y: o.to.y, bx: o.by.x, by: o.by.y, f, x0, left: level < -1 ? FPS / 2 : FPS, stop: false,
    ...(o.trauma ? { trauma: { ...o.trauma, moved: 0, frames: 0 } } : {}) } };
  release(t);
  t.swing = null;
  return true;
}

/**
 * The speed a pull gives this frame (位移-4): its force toward its point, dt long; none once its target came within
 * PULL_STOP of its puller, which stops it.
 * @param {Unit} t @param {NonNullable<NonNullable<Unit['slide']>['pull']>} p @param {number} vx @param {number} vy @returns {[number, number]}
 */
function pulled(t, p, vx, vy) {
  if (p.stop || len(t.x - p.bx, t.y - p.by) <= PULL_STOP) { p.stop = true; return [0, 0]; }
  const dx = p.x - t.x, dy = p.y - t.y, d = len(dx, dy), k = d / p.x0;
  if (!(d > 0)) return [vx, vy];
  const a = (p.f * k * k * k * k) / FPS;
  return [vx + (dx / d) * a, vy + (dy / d) * a];
}

/** A directional push nearer than this, or more than 45° off its direction, turns radial with 受力等级 −2 (位移-2). */
const DIRECTIONAL_MIN = 0.25;

/** @param {number} x @param {number} y */
const len = (x, y) => Math.sqrt(x * x + y * y);

/** An enemy still on the field (位移-1): alive, not disappeared, not neutral. @param {Unit} u */
function present(u) {
  return u.kind === KIND.ENEMY && u.hp > 0 && !u.hidden && u.base.neutral !== true;
}

/**
 * Whether a unit can be displaced (位移-1): an enemy on the field with HP, not disappeared, not in the air, not 失衡免疫
 * (flag `noDisplace`), not a 静态刚体 (flag `staticBody`, 位移-5).
 * @param {Unit} u
 */
export function displaceable(u) {
  if (!present(u)) return false;
  const s = statsOf(u);
  return !s.flying && !s.flags.noDisplace && !s.flags.staticBody;
}

/** A 静态刚体 a force can put into 失衡 (位移-5): on the field, the flag set, and not 失衡免疫. @param {Unit} u */
function isStatic(u) {
  if (!present(u)) return false;
  const s = statsOf(u);
  return s.flags.staticBody === true && !s.flags.noDisplace;
}

/** A push's 受力等级 on a unit (位移-1): its 力度 less the unit's 重量等级. @param {Unit} u @param {number} force */
export const forceLevel = (u, force) => Math.round(force) - statsOf(u).massLevel;

/**
 * The direction and 受力等级 of a push (位移-2): along `dir` when given — radial with 受力等级 −2 when the target stands
 * nearer than 0.25 tiles or more than 45° off it, unless `fixed` (`anyAngle`: the angle does not count) —, else radial
 * (away from `from`, towards it when `toward`); none when there is no way to go.
 * @param {Unit} t @param {number} level @param {PushOptions} o
 * @returns {{ ux: number, uy: number, level: number } | null}
 */
function aim(t, level, o) {
  const vx = t.x - o.from.x, vy = t.y - o.from.y, d = len(vx, vy), dl = o.dir ? len(o.dir.x, o.dir.y) : 0;
  if (dl > 0 && o.dir) {
    const ux = o.dir.x / dl, uy = o.dir.y / dl;
    if (o.fixed || (d >= DIRECTIONAL_MIN && (o.anyAngle || vx * ux + vy * uy >= d * Math.SQRT1_2))) return { ux, uy, level };
    return d > 0 ? { ux: vx / d, uy: vy / d, level: level - 2 } : null;
  }
  if (!(d > 0)) return null;
  const k = o.toward ? -1 : 1;
  return { ux: (k * vx) / d, uy: (k * vy) / d, level };
}

/**
 * Puts a 静态刚体 into 失衡 with no speed (位移-5): released, its swing cut. `pull` is a force that is still acting.
 * @param {Unit} t @param {NonNullable<NonNullable<Unit['slide']>['pull']>} [pull]
 */
function holdStatic(t, pull) {
  t.slide = { vx: 0, vy: 0, hard: 0, ...(pull ? { pull } : {}) };
  release(t);
  t.swing = null;
}

/**
 * A push on a 静态刚体 (位移-5): the same direction rules as 位移-2, but no speed and no immediate step. It enters 失衡
 * when the force would have given a speed. Whether it did.
 * @param {Unit} t @param {number} force @param {PushOptions} o
 */
function staticPush(t, force, o) {
  const a = aim(t, forceLevel(t, force), o);
  if (!a || a.level <= -3) return false;
  holdStatic(t);
  return true;
}

/**
 * A pull on a 静态刚体 (位移-5): the same 受力等级 and duration as 位移-4, kept so the state can see the force, but no
 * speed. Whether it entered 失衡.
 * @param {Unit} t @param {number} force @param {{ to: { x: number, y: number }, by: { x: number, y: number } }} o
 */
function staticPull(t, force, o) {
  const level = forceLevel(t, force), x0 = len(t.x - o.to.x, t.y - o.to.y);
  if (level <= -3 || !(x0 > 0)) return false;
  const f = PULL_FORCE[/** @type {keyof typeof PULL_FORCE} */ (String(Math.min(3, level)))];
  holdStatic(t, { x: o.to.x, y: o.to.y, bx: o.by.x, by: o.by.y, f, x0, left: level < -1 ? FPS / 2 : FPS, stop: false });
  return true;
}

/**
 * A push (位移-2) of 力度 `force` on `t`: its speed by the 受力等级 (none at −3 or below) in the push's direction, added to
 * what it slides at; it is released from its blocker and its swing cut; a ballistic push (the default) moves it one
 * frame at that speed at once, an effect's (`effect`) from the next frame. Whether the force took: a speed, or a
 * 静态刚体 entering 失衡 (位移-5).
 * @param {World} w @param {Content} c @param {Unit} t @param {number} force @param {PushOptions} o
 */
export function push(w, c, t, force, o) {
  if (isStatic(t)) return staticPush(t, force, o);
  if (!displaceable(t)) return false;
  const a = aim(t, forceLevel(t, force), o);
  if (!a || a.level <= -3) return false;
  const v = PUSH_SPEED[/** @type {keyof typeof PUSH_SPEED} */ (String(Math.min(3, a.level)))];
  const s = t.slide ?? { vx: 0, vy: 0, hard: 0 };
  t.slide = { vx: s.vx + a.ux * v, vy: s.vy + a.uy * v, hard: HARD_FRAMES };
  release(t);
  t.swing = null;
  if (!o.effect) step(c, t, t.slide.vx / FPS, t.slide.vy / FPS);
  return true;
}

/**
 * Moves a sliding unit by (dx, dy) unless that leaves the map or, for a ground unit, enters a tile it cannot walk or
 * crosses a closed edge (位移-3, 地图-2): then it stops where it is.
 * @param {Content} c @param {Unit} t @param {number} dx @param {number} dy
 */
function step(c, t, dx, dy) {
  const m = c.level, nx = t.x + dx, ny = t.y + dy, r = Math.round(ny), col = Math.round(nx), r0 = Math.round(t.y), c0 = Math.round(t.x), tile = tileAt(m, r, col);
  const walled = (r !== r0 || col !== c0) && tileAt(m, r0, c0) !== null && !crossable(m, r0 * m.width + c0, r * m.width + col, false);
  if (!tile || tile.passable !== 'ALL' || walled) {
    if (t.slide) t.slide = { ...t.slide, vx: 0, vy: 0 };
    return;
  }
  displace(t, nx, ny);
}

/**
 * One frame of a 静态刚体's 失衡 (位移-5): it stays put. The state ends on the frame that spends the last of the force
 * (a push has none left), or at once when it is lifted (浮空).
 * @param {Content} c @param {Unit} t @param {World} [w]
 */
function staticStep(c, t, w) {
  const p = t.slide?.pull;
  if (statsOf(t).flags.levitate || !p || p.left <= 1) return settle(t, w, c);
  t.slide = { vx: 0, vy: 0, hard: 0, pull: { ...p, left: p.left - 1 } };
  return true;
}

/**
 * One frame of 失衡 (位移-3, 位移-4): friction first, then a pull's force, then the move; the state ends — the slide gone,
 * its way planned afresh — once its speed is at most 0.1 with its 硬直 and pull over, or when it is lifted (浮空). A
 * 静态刚体 does not move and leaves when the force does (位移-5). Whether it is still in 失衡.
 * @param {Content} c @param {Unit} t @param {World} [w] the world, for 移动创伤's damage (职业-23)
 */
export function slideStep(c, t, w) {
  const s = t.slide;
  if (!s) return false;
  if (statsOf(t).flags.staticBody) return staticStep(c, t, w);
  const v = len(s.vx, s.vy), nv = Math.max(0, v - FRICTION / FPS), k = v > 0 ? nv / v : 0, p = s.pull && s.pull.left > 0 ? s.pull : undefined;
  const [vx, vy] = p ? pulled(t, p, s.vx * k, s.vy * k) : [s.vx * k, s.vy * k];
  t.slide = { vx, vy, hard: Math.max(0, s.hard - 1), ...(p ? { pull: { ...p, left: p.left - 1 } } : {}) };
  if (statsOf(t).flags.levitate) return settle(t, w, c);
  const x0 = t.x, y0 = t.y;
  step(c, t, t.slide.vx / FPS, t.slide.vy / FPS);
  const tr = t.slide.pull?.trauma;
  if (tr && w) traumaStep(w, c, t, tr, hypot(t.x - x0, t.y - y0));
  return len(t.slide.vx, t.slide.vy) <= STOP_SPEED && t.slide.hard === 0 && !t.slide.pull ? settle(t, w, c) : true;
}

/**
 * 移动创伤 (职业-23): the distance a pull moved its target this frame added up; every `every` frames, and as the pull ends,
 * the distance so far × `per` as arts damage from the puller (none when it left).
 * @param {World} w @param {Content} c @param {Unit} t @param {{ per: number, every: number, src: number, moved: number, frames: number }} tr @param {number} moved
 */
function traumaStep(w, c, t, tr, moved) {
  tr.moved += moved; tr.frames++;
  const pull = /** @type {NonNullable<NonNullable<Unit['slide']>['pull']>} */ (t.slide?.pull);
  if (tr.frames % tr.every !== 0 && pull.left > 0) return;
  const amount = tr.moved * tr.per;
  tr.moved = 0;
  if (amount > 0 && t.hp > 0) dealDamage(w, w.units.find((u) => u.id === tr.src && u.hp > 0) ?? null, t, { type: 'arts', amount }, c);
}

/**
 * 失衡 ends: no slide, the way planned afresh from where it stands (路线-5); 移动创伤 not yet dealt is dealt (职业-23).
 * Always false. @param {Unit} t @param {World} [w] @param {Content} [c]
 */
function settle(t, w, c) {
  const tr = t.slide?.pull?.trauma;
  if (tr && w && c && tr.moved > 0 && t.hp > 0) dealDamage(w, w.units.find((u) => u.id === tr.src && u.hp > 0) ?? null, t, { type: 'arts', amount: tr.moved * tr.per }, c);
  t.slide = undefined;
  displace(t, t.x, t.y);
  return false;
}
