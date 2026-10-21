// 弧光锋卫's bleed while 失衡, and 冒失的小弟's stun when 失衡 ends (docs/spec/foes.md 敌能-42). They act only through
// the context (ADR 0055). The interval is the blackboard's; a missing one is not filled in.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * 失衡持续伤害 (敌能-42): one true sourceless hit per `interval` of frames spent in 失衡. The first is after one full
 * interval (状态-4). Not 生命流失 (伤害-10).
 * @param {import('@aue/sim').FoeContext} ctx
 */
function bleed(ctx) {
  if (!ctx.unbalanced) { ctx.state.set('n', 0); return; }
  const interval = ctx.bb.interval;
  if (!(interval > 0)) return;
  const every = ctx.frames(interval);
  if (!(every > 0)) return;
  const n = ctx.state.get('n') + 1;
  if (n < every) { ctx.state.set('n', n); return; }
  ctx.state.set('n', 0);
  const amount = ctx.bb.damage;
  if (!(amount > 0)) return;
  ctx.dealDamage(ctx.self, { type: 'true', amount, sourceless: true, tags: ['dot', 'periodic'] });
}

/**
 * A broken interval does not carry into the next 失衡 (敌能-42). Cleared here, not on a later tick: the next tick may
 * already be a new slide, because a push can land after this turn.
 * @param {import('@aue/sim').FoeContext} ctx
 */
function bleedEnd(ctx) {
  ctx.state.set('n', 0);
}

/**
 * 退出失衡 (敌能-42): a resistible stun sourced to itself (状态-5). Nothing once it is already at 0 HP.
 * @param {import('@aue/sim').FoeContext} ctx
 */
function stunAfter(ctx) {
  if (ctx.self.hp <= 0 || !(ctx.bb.stun > 0)) return;
  ctx.applyStatus(ctx.self, 'stun', { seconds: ctx.bb.stun });
}

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const unbalanceBehaviors = Object.freeze({
  unbalanced_bleed: Object.freeze({ tick: bleed, unbalanceEnd: bleedEnd }),
  StunAfterUnbalance: Object.freeze({ unbalanceEnd: stunAfter }),
});
