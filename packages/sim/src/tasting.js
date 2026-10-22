// 【免费品尝】 areas (docs/spec/foes.md 敌能-62). The list exists only after one was placed, so a match that
// never pours one keeps the same state hash. The name is not `zones`: that one belongs to 污染秽蚀.
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { bodyInRadius } from './body.js';
import { addBuff, makeBuff, removeBuff, retune } from './buffs.js';
import { ENEMY_COLLIDER_RADIUS } from './constants.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Tasting} Tasting */

/** One shared buff, so two areas do not queue a second copy (敌能-62). */
const KEY = 'freeTaste';
/** The same slack 体积-3 gives a rectangle: a collider that lands on the circle still counts. */
const EPS = 1e-9;

/**
 * Places an area (敌能-62). The list is created here, not with the world.
 * @param {World} w @param {Tasting} area
 */
export function placeTasting(w, area) {
  (w.tastings ??= []).push(area);
}

/**
 * A point enemy's collider (常量-6) overlaps the circle; a huge one's rectangle does, without the extra 0.1 (体积-3).
 * @param {Unit} u @param {Tasting} a
 */
function overlaps(u, a) {
  if (/** @type {Unit & { hitArea?: object | null }} */ (u).hitArea) return bodyInRadius(u, a.x, a.y, a.radius);
  const dx = u.x - a.x, dy = u.y - a.y, r = a.radius + ENEMY_COLLIDER_RADIUS + EPS;
  return dx * dx + dy * dy <= r * r;
}

/** A ground enemy still on the field (敌能-62): not neutral, not gone, not flying. @param {Unit} u */
function grounded(u) {
  return u.kind === KIND.ENEMY && u.base.neutral !== true && u.hp > 0 && !u.hidden && !statsOf(u).flying;
}

/** The first live area this unit's collider overlaps. @param {Unit} u @param {Tasting[]} areas @returns {Tasting | null} */
function firstOverlap(u, areas) {
  for (const a of areas) if (overlaps(u, a)) return a;
  return null;
}

/** Gives, retunes or takes the one shared buff (敌能-62). @param {Unit} u @param {Tasting | null} area */
function syncOne(u, area) {
  const b = u.buffs.find((x) => x.key === KEY);
  if (!area) {
    if (b) removeBuff(u, KEY);
    return;
  }
  const mods = { aspd: area.aspd, dodgePhys: area.dodge };
  if (!b) addBuff(u, makeBuff({ key: KEY, src: -1, mods }));
  else if (b.mods.aspd !== mods.aspd || b.mods.dodgePhys !== mods.dodgePhys) retune(u, b, b.value, mods);
}

/**
 * One frame of the areas (敌能-62, 帧-1 step 8): count down, drop those that ended, then give or take the buff.
 * The buff is gone the same frame the enemy is outside every area that is still up.
 * @param {World} w
 */
export function tickTastings(w) {
  const list = w.tastings;
  if (!list) return;
  /** @type {Tasting[]} */
  const stay = [];
  for (const a of list) {
    const remain = a.remain - 1;
    if (remain > 0) stay.push({ ...a, remain });
  }
  w.tastings = stay;
  for (const u of w.units) {
    const has = u.buffs.some((b) => b.key === KEY);
    if (!grounded(u) && !has) continue;
    syncOne(u, grounded(u) ? firstOverlap(u, stay) : null);
  }
}
