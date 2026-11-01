// 深池伙友卫队 and 深池伙友影刃 (docs/spec/foes.md 敌能-126): their talent `traitAbility`, told apart by its shape. While
// one of the other kind stands within the pages' 1.4 (`partner`, which FOE_EXTRAS adds: the data has no such radius),
// the 卫队's field takes `attack_speed` off the attack speed of ours within its `range_radius`, and the 影刃's attack
// interval drops by its `base_attack_time`. Both are talents the pages do not mark silenceable. The 卫队's skill `Flame`
// does nothing: its pages list no skill. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** The 卫队's `traitAbility` (敌能-126): the data's three numbers and the page's `partner`. */
const GUARD = Object.freeze(['range_radius', 'taunt_level', 'attack_speed', 'partner']);
/** The 影刃's (敌能-126). */
const BLADE = Object.freeze(['base_attack_time', 'partner']);

/**
 * Whether a blackboard is exactly these keys, each a number (敌能-126): any other shape is neither of the pair.
 * @param {Record<string, unknown> | null} bb @param {readonly string[]} keys
 */
const shaped = (bb, keys) => bb !== null && Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/**
 * Whether a living enemy whose `traitAbility` has the other shape stands within `partner` of this one (敌能-126,
 * INF-0730); this one is never of the other shape. `allies` leaves out neutral and disappeared units; a 隐匿 one
 * counts, as it hides only from the other side.
 * @param {FoeContext} ctx @param {readonly string[]} other
 */
const partnered = (ctx, other) => ctx.allies(ctx.bb.partner).some((u) => shaped(ctx.talentOf(u, 'traitAbility'), other));

/**
 * The units of ours the 卫队's field reaches (敌能-126, INF-0731): those it may select within `range_radius`, flyers and
 * 迷彩 included, as for an aura; not neutral units, not 无敌 ones (沉睡 too: 无敌 is one of 异常效果's five 无法选择
 * effects, which 索敌-2's `selectable` does not test), and from a holder on the ground not one that took off (对地规避).
 * @param {FoeContext} ctx @returns {Unit[]}
 */
function fieldOf(ctx) {
  const ground = !ctx.stats(ctx.self).flying;
  return ctx.foes(ctx.bb.range_radius, { canHitFly: true, ignoreCamou: true }).filter((u) => {
    const s = ctx.stats(u);
    return u.base.neutral !== true && !s.invincible && !(ground && s.flags.liftoff);
  });
}

/**
 * `traitAbility` (敌能-126): each turn, the 影刃 shape lends itself `base_attack_time` on its attack interval while a
 * 卫队 is near; the 卫队 shape lends `attack_speed` to each unit its field reaches while a 影刃 is near (both 直接加算,
 * INF-0733). One key each, so two 卫队 give one −30 (INF-0732). Silence does not stop them; lent, they end within two
 * frames of the last turn the condition held.
 * @type {FoeBehavior}
 */
const traitAbility = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb;
    if (shaped(bb, BLADE)) {
      if (partnered(ctx, GUARD)) ctx.lend(ctx.self, 'partnerHaste', { mods: { batFlat: bb.base_attack_time } });
    } else if (shaped(bb, GUARD) && partnered(ctx, BLADE)) {
      for (const u of fieldOf(ctx)) ctx.lend(u, 'partnerField', { mods: { aspd: bb.attack_speed } });
    }
  },
});

/**
 * The 卫队's `Flame` (敌能-126, INF-0735): its pages list no skill, so the data's skill does nothing. Only the two marked
 * `idle` are covered (FOE_NEEDS); 深池焚毁者's `Flame` has another shape and no marker, and stays uncovered.
 * @type {FoeBehavior}
 */
const Flame = Object.freeze({});

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const partnerBehaviors = Object.freeze({ traitAbility, Flame });
