// 萨卡兹悖谬暴虐兵 (docs/spec/foes.md 敌能-55). The talent and the skill share the name AOEAttack, so they share one
// state. Cooldown 0 stays ready (敌能-2's once-only form is a negative cooldown), so the spent flag is what fires once.
// The block cost is not on the enemy record: a buff adds block − 1 on top of the default 1 (阻挡-2, the same way as 敌能-16).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').skills.AttackMods} AttackMods */

/**
 * Three block slots, from the talent's `block` (敌能-55). The skill's blackboard has no `block`, so it does not add a
 * second copy. Without the page marker `once` this is not the read shape.
 * @param {FoeContext} ctx
 */
function takeBlock(ctx) {
  const block = ctx.bb.block;
  if (ctx.bb.once !== 1 || typeof block !== 'number') return;
  ctx.addBuff(ctx.self, { key: 'aoeBlock', mods: { blockCnt: block - 1 } });
}

/**
 * The first attack is this skill's hit: 150% physical on the locked target and the four orthogonal tiles (敌能-55).
 * The talent's hook sees `sp` 0 and must not spend the shared state. Silence skips the hit without spending it; these
 * two enemies are immune, so the flag never sticks (状态-7).
 * @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods}
 */
function splashOnce(ctx, mods) {
  if (ctx.sp <= 0 || ctx.bb.once !== 1 || typeof ctx.bb.atk_scale !== 'number') return mods;
  if (ctx.state.get('spent') || !ctx.ready || ctx.stats(ctx.self).flags.silence) return mods;
  ctx.state.set('spent', 1);
  ctx.use();
  return { ...mods, scale: ctx.bb.atk_scale, cross: true, splashScale: 1, ignoreSelect: true };
}

/** @type {FoeBehavior} */
const AOEAttack = Object.freeze({ spawn: takeBlock, attack: splashOnce });

/** The behaviours of this file, by talent and skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const tyrantBehaviors = Object.freeze({ AOEAttack });
