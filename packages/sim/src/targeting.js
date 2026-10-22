// Targeting (docs/spec/targeting.md): the tiles of a range, who can be selected, and the official order of candidates —
// 阻挡, then 仇恨值 compared at a precision of 0.1, then the order they appeared in — by a stable insertion sort.
import { KIND } from '@aue/schema';
import { offsetTile } from './dir.js';
import { bodyKeys, cornerIn, crossing } from './body.js';
import { ENEMY_COLLIDER_RADIUS } from './constants.js';
import { roundHalfEven } from '@aue/math';
import { statsOf } from './attrs.js';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Cell} Cell @typedef {import('./body.js').Grid} Grid */

/**
 * The keys (row × cols + col) of the tiles a range covers (索敌-1): each offset turned with the facing of a unit on
 * tile (y, x), every tile stretched `extend` tiles straight ahead (攻击距离), tiles off the board dropped.
 * @param {Grid} grid @param {{ x: number, y: number, dir: unknown }} at @param {readonly Cell[]} offsets @param {number} [extend]
 * @returns {Set<number>}
 */
export function rangeKeys(grid, at, offsets, extend = 0) {
  /** @type {Set<number>} */
  const keys = new Set();
  for (const off of offsets) {
    for (let k = 0; k <= extend; k++) {
      const [r, c] = offsetTile(at.y, at.x, off.row, off.col + k, at.dir);
      if (r >= 0 && r < grid.rows && c >= 0 && c < grid.cols) keys.add(r * grid.cols + c);
    }
  }
  return keys;
}

/** Whether tile (r, c) is on the grid and among the keys. @param {Set<number>} keys @param {Grid} grid @param {number} r @param {number} c */
const keyed = (keys, grid, r, c) => r >= 0 && r < grid.rows && c >= 0 && c < grid.cols && keys.has(r * grid.cols + c);

/**
 * Whether a unit is in a range of tiles (索敌-1, 体积-5): a huge unit when a tile of its rectangle is (体积-2); a regular
 * enemy when its collider overlaps one of them — its own tile, or the next row, column or diagonal tile its circle
 * reaches (`byTile`: by its own tile alone, as 谬因 searches); any other unit by its tile (体积-1). No allocation: the
 * targeting of every frame asks it for every unit.
 * @param {Unit} u @param {Set<number>} keys @param {Grid} grid @param {boolean} [byTile]
 */
export function inKeys(u, keys, grid, byTile = false) {
  if (/** @type {any} */ (u).hitArea) return bodyKeys(u, grid).some((k) => keys.has(k));
  const r = roundHalfEven(u.y), col = roundHalfEven(u.x);
  if (keyed(keys, grid, r, col)) return true;
  if (byTile || u.kind !== KIND.ENEMY) return false;
  const dy = u.y - r, dx = u.x - col, sr = crossing(dy, ENEMY_COLLIDER_RADIUS), sc = crossing(dx, ENEMY_COLLIDER_RADIUS);
  if (sr !== 0 && keyed(keys, grid, r + sr, col)) return true;
  if (sc !== 0 && keyed(keys, grid, r, col + sc)) return true;
  return sr !== 0 && sc !== 0 && cornerIn(dx, dy, ENEMY_COLLIDER_RADIUS) && keyed(keys, grid, r + sr, col + sc);
}

/**
 * @typedef {object} Selector what an attack can select
 * @property {boolean} [canHitFly] it can select flying units
 * @property {boolean} [ignoreCamou] it ignores 迷彩
 * @property {boolean} [ignoreUntargetable] it can select 无法选择 units (敌能-85); omitted, they stay unselectable (索敌-2)
 * @property {boolean} [canHitSleep] it can select sleeping units (职业-28)
 * @property {boolean} [canHitStealth] it can select 隐匿 units (职业-31)
 */

/** Whether a stealth-off window for this source is still running (索敌-2). @param {Unit} u @param {string} key */
const windowOpen = (u, key) => u.buffs.some((o) => o.key === `stealthOff:${key}` && o.left !== 0);

/**
 * Whether 隐匿 is in effect (索敌-2): the flag, not undone by `unstealth` (职业-34). An enemy's is not, while it is
 * blocked or every stealth source still has its restore window; an operator's is not lifted by a block. A flag with no
 * source buff has nothing to time, so it stays.
 * @param {Unit} u
 */
export function stealthed(u) {
  const f = statsOf(u).flags;
  if (!f.stealth || f.unstealth) return false;
  if (u.kind !== KIND.ENEMY) return true;
  if (u.blockedBy >= 0) return false;
  let sourced = false, open = false;
  for (const b of u.buffs) {
    if (!b.flags.stealth) continue;
    sourced = true;
    if (!windowOpen(u, b.key)) open = true;
  }
  return !sourced || open;
}

/**
 * Whether a unit can be selected by the other side (索敌-2): on the field and not disappeared (路线-4), not 无法选中,
 * not 隐匿 (unless the attack can select them, 职业-31), not asleep (unless the attack can select sleeping units, 职业-28), not camouflaged (unless the attack ignores
 * 迷彩), not flying (unless the attack can hit flying units).
 * @param {Unit} u @param {Selector} [sel]
 */
export function selectable(u, sel = {}) {
  if (u.hp <= 0 || u.hidden) return false;
  const s = statsOf(u), f = s.flags;
  if ((f.untargetable && !sel.ignoreUntargetable) || (stealthed(u) && !sel.canHitStealth) || (f.sleep && !sel.canHitSleep) || f.sidelined) return false;
  if (f.camou && !f.uncamou && !sel.ignoreCamou) return false;
  return !s.flying || !!sel.canHitFly;
}

/** Whether operators fight a unit (装置-3): an enemy that is not neutral (合作-9), or a device on the enemies' side. @param {Unit} u */
export const hostile = (u) => (u.kind === KIND.ENEMY && u.base.neutral !== true) || (u.kind === KIND.DEVICE && u.base.hostile === true);

/** Whether enemies fight a unit (敌人攻击-1, 合作-9, 装置-2, 装置-3): an operator, a neutral unit, or a device on our side. @param {Unit} u */
export const friendly = (u) => u.kind === KIND.OPERATOR || (u.kind === KIND.ENEMY && u.base.neutral === true) || (u.kind === KIND.DEVICE && u.base.hostile !== true);

/**
 * 对地规避 of a unit that took off (起飞, flag `liftoff`, 阻挡-2): an enemy that is not flying cannot select it.
 * Damage and status use `liftoffRefused` — a shot already in flight is not a new selection.
 * @param {Unit} src @param {Unit} u
 */
export const evadesGround = (src, u) => src.kind === KIND.ENEMY && !statsOf(src).flying && !!statsOf(u).flags.liftoff;

/**
 * Whether `src` cannot land a hit, 元素损伤 or a status on `target` because it took off (起飞, 阻挡-2).
 * A ground enemy cannot. A hostile device is a character, so its 行动方式 stays ground even when its motion says
 * otherwise, unless it is 浮空. A flying enemy can. No source is not a selection, and neither is the same side.
 * @param {Unit | null | undefined} src @param {Unit} target
 */
export function liftoffRefused(src, target) {
  if (!src || !statsOf(target).flags.liftoff) return false;
  const s = statsOf(src);
  if (s.flags.levitate) return false;
  const foe = src.kind === KIND.DEVICE ? src.base.hostile === true : src.kind === KIND.ENEMY && !s.flying;
  return foe && friendly(target);
}

/** 仇恨值 of an enemy-type unit (索敌-3): 10⁸ × 嘲讽等级 − clamp(路径距离, −10⁸, 10⁸). @param {number} taunt @param {number} dist */
export const enemyHatred = (taunt, dist) => 1e8 * taunt - Math.min(1e8, Math.max(-1e8, dist));

/**
 * 仇恨值 of a character-type unit (索敌-5): 3 × 10⁸ × 嘲讽等级 + clamp(创建时间 × 1000 + 同帧部署数, ±3 × 10⁸), the time in
 * seconds.
 * @param {number} taunt @param {number} seconds @param {number} sameFrame
 */
export const characterHatred = (taunt, seconds, sameFrame) => 3e8 * taunt + Math.min(3e8, Math.max(-3e8, seconds * 1000 + sameFrame));

/** A value at a comparison precision: times its reciprocal, then to an integer toward zero (索敌-3). @param {number} v @param {number} [precision] */
export const precisionKey = (v, precision = 0.1) => Math.trunc(v * (1 / precision)) + 0;

/**
 * A stable insertion sort (索敌-3): each item moves before the earlier ones it compares below, never past an equal one.
 * @template T @param {T[]} items sorted in place @param {(a: T, b: T) => number} cmp @returns {T[]}
 */
export function insertionSort(items, cmp) {
  for (let i = 1; i < items.length; i++) {
    const x = items[i];
    let j = i - 1;
    while (j >= 0 && cmp(items[j], x) > 0) {
      items[j + 1] = items[j];
      j--;
    }
    items[j + 1] = x;
  }
  return items;
}

/** @typedef {import('./types.js').TraitDef['filter']} FilterName @typedef {import('./types.js').TraitDef['secondary']} SecondaryName */

/**
 * The 仇恨过滤器 an operator's attack may use (索敌-3): each candidate's reference values, lower first, each compared at
 * the filter's precision; `null` keeps the list as it is. `h` is the candidate's 仇恨值.
 * @type {Readonly<Record<FilterName, ((e: Unit, h: number) => number[]) | null>>}
 */
export const FILTERS = Object.freeze({
  HATRED_DES: (_e, h) => [precisionKey(-h, 0.1)],
  DEF_ASC: (e, h) => [precisionKey(statsOf(e).def, 0.001), precisionKey(-h, 0.001)],
  MASS_DES: (e, h) => [precisionKey(statsOf(e).massLevel * -1000 - h, 0.001)],
  ALL: null,
});

/** Lexicographic comparison of reference values. @param {number[]} a @param {number[]} b */
function compareKeys(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * A 二次过滤器 (索敌-3): from the front, each unit that meets the condition swaps with the first unit before it that
 * does not — a swap, not a sort.
 * @template T @param {T[]} list changed in place @param {(x: T) => boolean} meets @returns {T[]}
 */
export function swapForward(list, meets) {
  for (let i = 0; i < list.length; i++) {
    if (!meets(list[i])) continue;
    const j = list.findIndex((x, k) => k < i && !meets(x));
    if (j >= 0) [list[j], list[i]] = [list[i], list[j]];
  }
  return list;
}

/** The 二次过滤器 by name: the condition a unit must meet to move forward. @type {Readonly<Record<Exclude<SecondaryName, ''>, (e: Unit) => boolean>>} */
export const SECONDARY = Object.freeze({ FLY_FIRST: (e) => statsOf(e).flying });

/**
 * @typedef {object} EnemyOrder
 * @property {boolean} blockedFirst the enemies the attacker blocks go first (melee operators by default)
 * @property {(e: Unit) => number} pathDist the enemy's 路径距离, in tiles
 * @property {FilterName} [filter] the 仇恨过滤器 (default HATRED_DES)
 * @property {SecondaryName} [secondary] the 二次过滤器, if any
 * @property {((e: Unit) => boolean)[]} [prefer] the targets its talents prefer, each a 二次过滤器 after it (职业-28)
 */

/**
 * An operator's candidates in the official order (索敌-3): the 仇恨过滤器 by a stable insertion sort (by default 仇恨值
 * high to low at a precision of 0.1, then who appeared first), the 二次过滤器, its talents' preferred targets each the
 * same way (职业-28), then the enemies it blocks moved to the front in that order.
 * @param {Unit} attacker @param {readonly Unit[]} cands in the order they appeared @param {EnemyOrder} o @returns {Unit[]}
 */
export function sortEnemies(attacker, cands, o) {
  const f = FILTERS[o.filter ?? 'HATRED_DES'];
  const rows = cands.map((e) => ({ e, k: f ? f(e, enemyHatred(statsOf(e).taunt, o.pathDist(e))) : [] }));
  const list = insertionSort(rows, (a, b) => compareKeys(a.k, b.k)).map((r) => r.e);
  if (o.secondary) swapForward(list, SECONDARY[o.secondary]);
  for (const meets of o.prefer ?? []) swapForward(list, meets);
  if (!o.blockedFirst) return list;
  const mine = (/** @type {Unit} */ e) => e.blockedBy === attacker.id;
  return [...list.filter(mine), ...list.filter((e) => !mine(e))];
}

/**
 * A healer's candidates (职业-2): the 仇恨过滤器 生命比例升序(满生命值除外) — units at full HP left out, the lowest HP
 * ratio first at a precision of 0.001, then the order they come in.
 * @param {readonly Unit[]} cands in creation order @returns {Unit[]}
 */
export function sortHealTargets(cands) {
  const rows = cands.filter((u) => u.hp < u.maxHp).map((u) => ({ u, k: precisionKey(u.hp / u.maxHp, 0.001) }));
  return insertionSort(rows, (a, b) => a.k - b.k).map((r) => r.u);
}

/** The 仇恨值 of one of our units from its creation (索敌-5). @param {Unit} u @param {number} fps */
const hatredOfCharacter = (u, fps) => characterHatred(statsOf(u).taunt, u.born / fps, u.bornN);

/**
 * An enemy's candidates in the official order (索敌-5): the unit blocking it, 仇恨值 high to low at a precision of 0.1 —
 * so the last deployed first — then the order the candidates come in.
 * @param {Unit} enemy @param {readonly Unit[]} cands @param {number} fps @returns {Unit[]}
 */
export function sortAllies(enemy, cands, fps) {
  const rows = cands.map((a) => ({ a, b: a.id === enemy.blockedBy ? 0 : 1, h: precisionKey(hatredOfCharacter(a, fps)) }));
  return insertionSort(rows, (x, y) => x.b - y.b || y.h - x.h).map((r) => r.a);
}

/** The first n of an ordered list (索敌-3: 目标数). @template T @param {readonly T[]} list @param {number} n @returns {T[]} */
export const firstN = (list, n) => list.slice(0, Math.max(1, Math.floor(n)));
