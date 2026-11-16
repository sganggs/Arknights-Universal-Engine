// 赏金猎人弩手 and 赏金猎人弩手队长's 赏金攫取 (docs/spec/foes.md 敌能-151): the `{cost}` shape of the skill name
// `PowerHit`, whose `{atk}` shape is 战线推进者's 强击 (敌能-11). foes.js keeps the one `PowerHit` object and hands this
// shape's hooks here. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').skills.AttackMods} AttackMods */

/** Whether a blackboard has exactly these keys. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
function exactly(bb, keys) {
  const got = Object.keys(bb);
  return got.length === keys.length && keys.every((k) => Object.hasOwn(bb, k));
}

/**
 * 赏金攫取's blackboard (敌能-151): the data's theft — `cost`, a number below 0 — and the read pages' marker `page` 1,
 * nothing else. 赛场无赖射手 has the same `cost` and no saved page, so no marker (关卡-2).
 * @param {Record<string, unknown>} bb @returns {boolean}
 */
export function bountyShape(bb) {
  return exactly(bb, ['cost', 'page']) && typeof bb.cost === 'number' && bb.cost < 0 && bb.page === 1;
}

/**
 * Whether a `PowerHit` blackboard is one of the two shapes its one object runs (关卡-2): 强击's bonus alone, a number
 * (敌能-11), or 赏金攫取's (敌能-151). Any other name is not this family's concern: the caller still asks the others.
 * @param {string} name @param {Record<string, unknown>} bb @returns {boolean}
 */
export function powerHitOwns(name, bb) {
  if (name !== 'PowerHit') return true;
  return (exactly(bb, ['atk']) && typeof bb.atk === 'number') || bountyShape(bb);
}

/**
 * Whether this attack is 赏金攫取 (敌能-151): 攻击回复 as 敌能-36 counts it. Below its cost an attack gives 1 point,
 * up to the cost; with the cost gathered and the cooldown ready the attack is the skill — its points back to 0, its
 * cooldown started. Silence is not read: the page says 「※此技能无法被沉默」.
 * @param {FoeContext} ctx @returns {boolean}
 */
function skillNow(ctx) {
  const st = ctx.state, sp = st.get('sp');
  if (sp >= ctx.sp && ctx.ready) {
    st.set('sp', 0);
    ctx.use();
    return true;
  }
  st.set('sp', Math.min(ctx.sp, sp + 1));
  return false;
}

/**
 * 赏金攫取's turn (敌能-151): this attack is a physical cross splash at 100 % on its target and the four tiles next to
 * it (敌能-26). A tile splash lands without a projectile (INF-0982). `live` marks the skill until the next attack starts.
 * @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods}
 */
export function bountyAttack(ctx, mods) {
  const now = skillNow(ctx);
  ctx.state.set('live', now ? 1 : 0);
  return now ? { ...mods, skill: true, type: 'phys', cross: true, splashScale: 1 } : mods;
}

/**
 * A hit of 赏金攫取 that dealt damage (敌能-151): −`cost` from the player of that operator, down to 0. `hit` comes only
 * for a hit that took HP, which is 成功造成伤害 (INF-0985). Summons and 装置 are hit and give nothing (「非装置/召唤物」):
 * a 携带物 is an operator unit of a player too, and only `device` tells it; neutral units belong to no player, so
 * `drainCost` takes nothing for them (INF-0984). The cross never comes by projectile, so a hit that did is an earlier
 * ordinary shot still in flight.
 * @param {FoeContext} ctx @param {Unit} t @param {boolean} ranged
 */
export function bountyHit(ctx, t, ranged) {
  if (ctx.state.get('live') !== 1 || ranged || t.summoner !== undefined || ctx.device(t)) return;
  ctx.drainCost(t, -ctx.bb.cost);
}
