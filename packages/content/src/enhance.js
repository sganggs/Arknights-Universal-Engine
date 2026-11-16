// 铁头前锋 and 长臂投手 attacking a facility (docs/spec/foes.md 敌能-122). The talent name `enhance` is shared
// with 沸血 (敌能-71): knightOwns, the one shape check of the name, accepts this file's `{ atk_scale }` beside
// the boiling shape; the behaviour object is knights.js's `enhance`, whose attack hook is facilityAttack.

/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').skills.AttackMods} AttackMods */

/**
 * The facility multiplier (敌能-122): one numeric `atk_scale` and no other key. 1.5 / 2 on the four read pages.
 * @param {Record<string, unknown> | null | undefined} bb
 */
export function scaleShape(bb) {
  return !!bb && Object.keys(bb).length === 1 && typeof bb.atk_scale === 'number';
}

/**
 * The normal attack's 攻击力倍率 becomes `atk_scale` when the hit's target is a 守御-3 facility (敌能-122).
 * The attack hook does not see the target (敌能-2); `facScale` is applied per target as the hit is built.
 * Not silenceable: the page does not say 可被沉默. A boiling board is not this hook.
 * @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods}
 */
export function facilityAttack(ctx, mods) {
  if (!scaleShape(ctx.bb)) return mods;
  return { ...mods, facScale: ctx.bb.atk_scale };
}
