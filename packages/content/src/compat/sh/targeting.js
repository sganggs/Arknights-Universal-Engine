// Stands in for Stronghold's server/sim/targeting.js (兼容-2): the names its operator kits import — the range keys, a
// unit's tile key, whether an ability may select an enemy and the order of an ability's candidates, by the engine's own
// rules (索敌-1…索敌-3, 体积-1); the rest still gaps.
import { targeting, body, attrs, routes } from '@aue/sim';
import { COLS, ROWS } from '../grid.js';
import { gap } from './gap.js';

/**
 * The keys of the tiles a facing-RIGHT grid of [dRow, dCol] covers from tile (r, c) facing `d`, stretched `extend`
 * tiles ahead (索敌-1), in the grid's order.
 * @param {readonly number[][] | null} grid @param {number} r @param {number} c @param {unknown} d @param {number} [extend] @returns {number[]}
 */
export function absoluteRangeKeys(grid, r, c, d, extend = 0) {
  const offsets = (grid ?? []).map(([row, col]) => ({ row, col }));
  return [...targeting.rangeKeys({ rows: ROWS, cols: COLS }, { x: c, y: r, dir: d }, offsets, extend)];
}

/** The key of the tile a unit stands on (体积-1). @param {{ x: number, y: number }} u */
export function tileKeyOf(u) {
  const [r, c] = body.tileOf(u);
  return r * COLS + c;
}

/** @typedef {{ alive: boolean, u: import('@aue/sim').Unit | null }} Target a kit's unit (compat/unit.js) */

/** Whether 隐匿 is in effect (索敌-2): a block or a restore window counts as not. @param {Target} e */
export const enemyStealthed = (e) => !!e.u && targeting.stealthed(e.u);

/**
 * Whether an ability with Stronghold's profile may select an enemy (索敌-2): on the field with HP, not disappeared,
 * 无法选中, 隐匿 in effect or out of the battle; asleep only for a profile that hits sleepers; flying only for one that
 * can hit flying units and is not ground-only; never one the profile skips.
 * @param {unknown} _attacker @param {Target} e @param {Record<string, any> | null | undefined} profile
 */
export function canTargetEnemy(_attacker, e, profile) {
  const u = e?.u, p = profile ?? {};
  if (!u || !e.alive || u.hidden) return false;
  const s = attrs.statsOf(u), f = s.flags;
  if (f.untargetable || targeting.stealthed(u) || f.sidelined || (f.sleep && !p.hitSleep)) return false;
  if (s.flying && (!p.canHitFly || p.groundOnly)) return false;
  return !(typeof p.skipEnemy === 'function' && p.skipEnemy(e));
}

/** Stronghold's priorities that are the engine's own 仇恨过滤器 (索敌-3). @type {Record<string, import('@aue/sim').targeting.FilterName>} */
const FILTER = { lowDef: 'DEF_ASC', heaviest: 'MASS_DES' };

/** Its other priorities, as a key (lower first) over the engine's order. @type {Record<string, (e: any, a: any) => number>} */
const KEY = {
  fly: (e) => (e.isFlying ? 0 : 1), ground: (e) => (e.isFlying ? 1 : 0), highDef: (e) => -(e.s?.def ?? 0), highestAtk: (e) => -(e.s?.atk ?? 0),
  lowestHp: (e) => e.hp, highestHp: (e) => -e.hp, lowestHpRatio: (e) => e.hpRatio, notBurst: (e) => (e.flags.burstLock ? 1 : 0),
  nearest: (e, a) => body.bodyDist(e, a.x, a.y), farthest: (e, a) => -body.bodyDist(e, a.x, a.y),
  ranged: (e) => (e.base?.rangeRadius > 0 && e.base?.applyWay !== 'MELEE' ? 0 : 1), boss: (e) => (e.base?.levelType === 'BOSS' ? 0 : 1),
  elite: (e) => (e.base?.levelType === 'ELITE' || e.base?.levelType === 'BOSS' ? 0 : 1),
};

/**
 * An ability's candidates in order (索敌-3), in place: the engine's order with the priority's 仇恨过滤器, or by 仇恨值
 * and then the priority's key; the enemies the attacker blocks first — after the flying ones for the air priority (as
 * Stronghold has it).
 * @param {{ c: import('@aue/sim').Content }} battle @param {{ u: import('@aue/sim').Unit | null, x: number, y: number }} attacker
 * @param {Target[]} cands @param {string | null | undefined} priority @returns {Target[]}
 */
export function sortEnemyTargets(battle, attacker, cands, priority) {
  if (cands.length <= 1) return cands;
  const of = new Map(cands.filter((e) => e.u).map((e) => [e.u, e])), p = priority ?? '';
  const order = targeting.sortEnemies(/** @type {any} */ (attacker.u), [...of.keys()].map((u) => /** @type {import('@aue/sim').Unit} */ (u)),
    { blockedFirst: false, pathDist: (e) => routes.pathDistance(battle.c, e), filter: FILTER[p] ?? 'HATRED_DES' });
  let list = order.map((u) => /** @type {Target} */ (of.get(u)));
  const key = KEY[p];
  if (key) list = targeting.insertionSort(list.map((e) => ({ e, k: key(e, attacker) })), (a, b) => a.k - b.k).map((r) => r.e);
  const id = attacker.u?.id ?? -2, mine = (/** @type {Target} */ e) => e.u?.blockedBy === id;
  if (p !== 'fly') list = [...list.filter(mine), ...list.filter((e) => !mine(e))];
  cands.splice(0, cands.length, ...list);
  return cands;
}

export const aggroCmp = gap('targeting.aggroCmp');
