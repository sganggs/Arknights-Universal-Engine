// 「巨大的丑东西」's first form (docs/spec/foes.md 敌能-124): blocked, a melee hit at the data's
// `attack@mcmstr_rage_attack.atk_scale`; not blocked, an attack on one ground unit of ours within the page's radius
// (2.5, a content extra) that hits the target's 3×3 at 100% (敌能-26). The talent name `combat` is shared — 敌能-38's
// element hit lives on it too (elementhit.js) — so only this shape is this attack.

import { constants } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').skills.AttackMods} AttackMods @typedef {import('@aue/sim').Unit} Unit */

/** The blocked melee's 攻击力倍率, in the data. */
const RAGE = 'attack@mcmstr_rage_attack.atk_scale';

/** 丑东西's `combat` (敌能-124): exactly the data's scale and the page's `radius`. @param {Record<string, unknown>} bb */
export const rageShape = (bb) => Object.keys(bb).length === 2 && typeof bb[RAGE] === 'number' && typeof bb.radius === 'number';

/**
 * Its candidates (敌能-124): blocked, the blocker alone, as its data range (0) already gives; not blocked, the units of
 * ours it may select within `radius` + 0.25 (敌人攻击-1). The default selection leaves out flying units; a ground enemy
 * does not select 起飞 either (阻挡-2).
 * @param {FoeContext} ctx @param {Unit[]} cands @returns {Unit[]}
 */
export function rageTargets(ctx, cands) {
  if (!rageShape(ctx.bb) || ctx.blocked) return cands;
  return ctx.foes(/** @type {number} */ (ctx.bb.radius) + constants.ALLY_COLLIDER_RADIUS).filter((u) => !ctx.stats(u).flags.liftoff);
}

/**
 * Its attack (敌能-124), on its own shape: blocked, × the data's scale on the blocker; not blocked, the target's 3×3 at
 * the same 100% — the target normal damage, the others splash, flying ones too (敌能-26). Not a projectile: its
 * applyWay is ALL, and the square lands with the swing (INF-0703).
 * @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods}
 */
export function rageAttack(ctx, mods) {
  if (ctx.blocked) return { ...mods, scale: mods.scale * /** @type {number} */ (ctx.bb[RAGE]) };
  return { ...mods, square: true, splashScale: 1 };
}
