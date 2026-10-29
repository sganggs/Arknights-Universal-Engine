// Attack-recovery enemy skills (docs/spec/foes.md 敌能-36): points come from attacks, and the attack once the cost is
// already gathered — cooldown ready, and not silenced — is the skill. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').skills.AttackMods} AttackMods */

/**
 * Whether this attack is the skill (敌能-36). The cost is already gathered, the cooldown is ready (the skill table:
 * ready is not enough, the points have to be spent) and the enemy is not silenced. That attack clears the points and
 * starts the cooldown. Anything else stays an ordinary attack and counts once, capped at the cost — silence stops the
 * skill, not the count.
 * @param {FoeContext} ctx
 */
function isSkillAttack(ctx) {
  const st = ctx.state, sp = st.get('sp');
  if (sp >= ctx.sp && ctx.ready && !ctx.stats(ctx.self).flags.silence) {
    st.set('sp', 0);
    ctx.use();
    return true;
  }
  st.set('sp', Math.min(ctx.sp, sp + 1));
  return false;
}

/**
 * This attack's hit count (敌能-36): the attack's own, times the blackboard's `times` when PRTS gives one. 澪's 二连击
 * is that extra (INF-0311); a skill without it is unchanged.
 * @param {AttackMods} mods @param {Record<string, number>} bb
 */
const hitsOf = (mods, bb) => (typeof bb.times === 'number' ? { ...mods, times: mods.times * bb.times } : mods);

/** 眩晕打击 (敌能-36; 狙击步兵组长's is named `stunattack`): the skill's hit stuns for `stun` seconds. @type {FoeBehavior} */
const stuncombat = Object.freeze({
  attack: (ctx, mods) => {
    const out = hitsOf(mods, ctx.bb);
    if (!isSkillAttack(ctx)) return out;
    const seconds = ctx.bb.stun;
    return { ...out, skill: true, ...(typeof seconds === 'number' ? { hitStatus: { key: 'stun', seconds } } : {}) };
  },
});

/**
 * 强力击 / 寒晖 (敌能-36): the skill's hit multiplies 攻击力 by `atk_scale`. `ep_damage_ratio` is the 侵蚀 half and is
 * left to that family. A `times` on the blackboard (澪) applies to the ordinary attacks as well as the skill.
 * @type {FoeBehavior}
 */
const PowerAttack = Object.freeze({
  attack: (ctx, mods) => {
    const out = hitsOf(mods, ctx.bb);
    if (!isSkillAttack(ctx)) return out;
    const scale = ctx.bb.atk_scale;
    return { ...out, skill: true, ...(typeof scale === 'number' ? { scale: out.scale * scale } : {}) };
  },
});

/** The behaviours of this file, by skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const chargedBehaviors = Object.freeze({ stuncombat, stunattack: stuncombat, PowerAttack });
