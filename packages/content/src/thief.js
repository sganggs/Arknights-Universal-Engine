// 荒原窃盗者 and 荒原劫掠者's theft (docs/spec/foes.md 敌能-12): what a hit of 资源偷取 or 劫掠 that dealt damage takes.
// Their pages: 「目标非装置/召唤物时在成功造成伤害后扣除1点已有部署费用」. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/**
 * Whether a skill hit of 敌能-12 robs its target: one of a player's units that is neither a summon nor a 装置 (a
 * 携带物, a 装置类 summon …: `device`, read as 敌能-151 does). A neutral unit or a device unit belongs to no player
 * (INF-1070).
 * @param {FoeContext} ctx @param {Unit} t @returns {boolean}
 */
function robbed(ctx, t) {
  return t.owner >= 0 && t.summoner === undefined && !ctx.device(t);
}

/**
 * The theft of a skill hit that dealt damage (敌能-12): −`cost` from the target's player, down to 0, and for 劫掠
 * (`hp_ratio`) a heal of that share of the enemy's maximum HP. 劫掠's page puts the heal under the same condition
 * 「目标非装置/召唤物时在成功造成伤害后扣除3点已有部署费用，并治疗自身最大生命值5%的生命」, so a summon or a 装置 gives neither.
 * @param {FoeContext} ctx @param {Unit} t
 */
export function rob(ctx, t) {
  if (!robbed(ctx, t)) return;
  ctx.drainCost(t, -ctx.bb.cost);
  if (ctx.bb.hp_ratio) ctx.heal(ctx.self, ctx.bb.hp_ratio * ctx.stats(ctx.self).maxHp);
}
