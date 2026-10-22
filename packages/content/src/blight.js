// 萨卡兹枯朽系 (docs/spec/foes.md 敌能-46): 污染秽蚀 on death and on the 战车's charged attack, and 逐腐 bleed.
// Page-only rules (可对空, 无视无法选择, 低地过滤, 尖端's gate and refund) arrive as blackboard extras. A shared name
// whose blackboard has the same keys follows the numbers; it does not gain those extras. They act only through the
// context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {Parameters<NonNullable<FoeBehavior['attack']>>[1]} Atk */

/** The collider an enemy's attack radius reaches past, in tiles (敌人攻击-1). */
const COL = 0.25;

/**
 * A 污染秽蚀 zone from a blackboard (敌能-46). `air` / `open` / `wide` are page extras, absent on an unread enemy.
 * @param {FoeContext} ctx @param {number} x @param {number} y @param {number} radius
 */
function putZone(ctx, x, y, radius) {
  const bb = ctx.bb;
  ctx.zone({
    x, y, radius, life: bb.projectile_life_time, low: bb.polluted_damage_low, high: bb.polluted_damage_high,
    air: bb.air === 1, open: bb.open === 1, wide: bb.wide === 1,
  });
}

/** 死亡的污染秽蚀 (敌能-46): where it fell, including a fall, unless it is silenced. @type {FoeBehavior} */
const PollutedDie = Object.freeze({
  death: (ctx) => {
    if (ctx.stats(ctx.self).flags.silence) return;
    if (typeof ctx.bb.projectile_range !== 'number') return;
    putZone(ctx, ctx.self.x, ctx.self.y, ctx.bb.projectile_range);
  },
});

/**
 * 逐腐 bleed (敌能-46): a connecting normal attack, even one that took no HP. A skill attack does not. Refresh is the
 * context's, which replaces the numbers without a second buff.
 * @type {FoeBehavior}
 */
const Bleeding = Object.freeze({
  landed: (ctx, t, how) => {
    if (how.skill) return;
    const d = ctx.bb['attack@bleeding_damage'], s = ctx.bb['attack@duration'];
    if (typeof d !== 'number' || typeof s !== 'number') return;
    ctx.bleed(t, d, s);
  },
});

/**
 * 被阻挡时的 200%，以及只打低地、不打飞行 (敌能-46). The 200% runs before the skill hook, which then sets the skill
 * swing back to 100%. `low` is a page extra: an unread enemy with the same talent does not filter.
 * @type {FoeBehavior}
 */
const Empty = Object.freeze({
  targets: (ctx, cands) => (ctx.bb.low === 1 ? cands.filter((u) => !ctx.stats(u).flying && ctx.onLow(u)) : cands),
  attack: (ctx, mods) => {
    const scale = ctx.bb['attack@chuang_atk_scale'];
    if (mods.skill || !ctx.blocked || typeof scale !== 'number') return mods;
    return { ...mods, scale: mods.scale * scale };
  },
});

/**
 * A 低地 non-flying ally inside the attack radius (敌能-46). The blocker counts even when 迷彩 or 无法选择 hides it
 * from `foes`, because the attack it would replace still hits the blocker (敌人攻击-1).
 * @param {FoeContext} ctx
 */
function lowAlly(ctx) {
  const list = ctx.foes(ctx.self.base.rangeRadius + COL), b = ctx.blocker();
  if (b && !list.includes(b)) list.push(b);
  return list.some((u) => !ctx.stats(u).flying && ctx.onLow(u));
}

/**
 * Spends a full bar on this attack, or stores 1 SP (敌能-46). A 尖端 whose gate fails keeps the bar and the attack.
 * @param {FoeContext} ctx @param {Atk} mods @returns {Atk}
 */
function charge(ctx, mods) {
  const st = ctx.state, full = st.get('sp') >= ctx.sp && !ctx.stats(ctx.self).flags.silence;
  if (full && ctx.bb.gate === 1 && !lowAlly(ctx)) return mods;
  if (!full) { st.set('sp', Math.min(ctx.sp, st.get('sp') + 1)); return mods; }
  st.set('sp', 0);
  st.set('armed', 1);
  if (ctx.bb.refund === 1) st.set('owed', 1);
  return { ...mods, scale: 1, skill: true };
}

/**
 * 秽蚀侵心 / 秽蚀轰击 (敌能-46): the attack that spends the bar is the skill. The zone is placed when that hit connects.
 * `owed` is the spent bar; the next turn after the swing is gone without a hit gives it back (尖端 only).
 * @type {FoeBehavior}
 */
const PollutedRangedAtk = Object.freeze({
  spawn: (ctx) => { ctx.state.set('sp', ctx.sp); },
  tick: (ctx) => {
    if (ctx.bb.refund !== 1 || ctx.state.get('owed') !== 1 || ctx.self.swing) return;
    ctx.state.set('owed', 0);
    ctx.state.set('armed', 0);
    ctx.state.set('sp', ctx.sp);
  },
  attack: (ctx, mods) => charge(ctx, mods),
  landed: (ctx, t, how) => {
    if (ctx.state.get('armed') !== 1 || !how.skill) return;
    ctx.state.set('armed', 0);
    ctx.state.set('owed', 0);
    if (typeof ctx.bb.range_radius !== 'number') return;
    putZone(ctx, t.x, t.y, ctx.bb.range_radius);
  },
});

/** Behaviours by talent or skill name (敌能-46). @type {Readonly<Record<string, FoeBehavior>>} */
export const blightBehaviors = Object.freeze({ PollutedDie, Bleeding, Empty, PollutedRangedAtk });
