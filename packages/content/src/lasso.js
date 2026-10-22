// 枷锁 (docs/spec/foes.md 敌能-72). `page` is the read-page marker (关卡-2); without it this does nothing, so the
// unread 业余术师 stays uncovered. Channel state is the ability's own, not a unit field. The stun is the catalogue
// 晕眩 tagged `lasso`, so removing it leaves every other stun (状态-2, 状态-5).

import { KIND } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** Buff tag of this skill's 晕眩, and the caster's channel buff key. */
const MARK = 'lasso';

/** The read pages' blackboard (敌能-72): the marker and the three data numbers. @param {FoeContext} ctx */
function armed(ctx) {
  const b = ctx.bb;
  return b.page === 1 && typeof b.hit_duration === 'number' && typeof b.atk_scale === 'number' && typeof b.range_radius === 'number';
}

/** Selectable non-flying operators (summons included) and our devices inside the skill radius (敌能-72). @param {FoeContext} ctx @returns {Unit[]} */
function oursInReach(ctx) {
  return ctx.foes(ctx.bb.range_radius).filter((u) => u.kind !== KIND.ENEMY);
}

/**
 * Who 枷锁 locks (敌能-72): an unstunned blocker, even outside the radius and even when unselectable; otherwise the
 * first unstunned ally in reach (索敌-5). A stunned unit is never the target.
 * @param {FoeContext} ctx @param {Unit[]} ours @returns {Unit | null}
 */
function pick(ctx, ours) {
  const b = ctx.blocker();
  if (b && b.hp > 0 && !ctx.stats(b).flags.stun) return b;
  return ctx.order(ours.filter((u) => !ctx.stats(u).flags.stun))[0] ?? null;
}

/** The locked unit while it still blocks, or while it can still be selected, alive (敌能-72). @param {FoeContext} ctx @returns {Unit | null} */
function locked(ctx) {
  const id = ctx.state.get('target'), b = ctx.blocker();
  if (b && b.id === id && b.hp > 0) return b;
  return ctx.foes(Infinity).find((u) => u.id === id) ?? null;
}

/** One pulse: the infinite 晕眩 if this skill's is not already there, then this second's arts (敌能-72). @param {FoeContext} ctx @param {Unit} t */
function pulse(ctx, t) {
  if (!t.buffs.some((b) => b.key === 'stun' && b.tag === MARK)) ctx.applyStatus(t, 'stun', { tag: MARK });
  ctx.dealDamage(t, { type: 'arts', amount: ctx.stats(ctx.self).atk * ctx.bb.atk_scale, isSkill: true, tags: ['dot', 'periodic'] });
}

/** The channel over: the caster may move and attack again, and only this skill's 晕眩 comes off (敌能-72). @param {FoeContext} ctx */
function end(ctx) {
  const t = ctx.unit(ctx.state.get('target'));
  ctx.state.set('left', 0);
  ctx.removeBuff(ctx.self, MARK);
  if (t) ctx.removeBuff(t, 'stun', MARK);
}

/** Start 枷锁 once there is someone to lock (敌能-72). Cooldown 0 would be ready again; `done` is what makes it once. @param {FoeContext} ctx */
function begin(ctx) {
  if (ctx.state.get('done') || !ctx.ready) return;
  const s = ctx.stats(ctx.self);
  if (s.disabled || s.flags.silence) return;
  const ours = oursInReach(ctx);
  if (ours.length === 0) return;
  const t = pick(ctx, ours);
  if (!t) return;
  const span = ctx.frames(ctx.bb.hit_duration);
  ctx.use();
  ctx.state.set('done', 1);
  ctx.state.set('target', t.id);
  ctx.state.set('left', span);
  ctx.state.set('t', 0);
  ctx.addBuff(ctx.self, { key: MARK, flags: { root: true, noAttack: true } });
  pulse(ctx, t);
  if (!(span > 0) || t.hp <= 0) end(ctx);
}

/**
 * One frame of the channel (敌能-72). Silence, being unable to act, or the target gone ends it before this frame's
 * pulse. The pulse on the trigger frame already happened; later pulses are every second, and the frame `left` hits 0
 * only lets go.
 * @param {FoeContext} ctx
 */
function channel(ctx) {
  const self = ctx.self, s = ctx.stats(self), t = locked(ctx);
  if (s.flags.silence || s.disabled || self.hp <= 0 || !t) { end(ctx); return; }
  const left = ctx.state.get('left') - 1, n = ctx.state.get('t') + 1;
  ctx.state.set('left', left);
  ctx.state.set('t', n);
  if (left <= 0) { end(ctx); return; }
  if (n % ctx.frames(1) === 0) pulse(ctx, t);
  if (t.hp <= 0) end(ctx);
}

/**
 * 枷锁 (敌能-72). Ready, able to act, not silenced, with a non-flying unit of ours in `range_radius`: lock one target
 * and channel for up to `hit_duration` seconds. Once, even though the cooldown is 0.
 * @type {FoeBehavior}
 */
const lasso = Object.freeze({
  tick: (ctx) => {
    if (!armed(ctx)) return;
    if (ctx.state.get('left') > 0) { channel(ctx); return; }
    begin(ctx);
  },
  death: (ctx) => { if (armed(ctx) && ctx.state.get('left') > 0) end(ctx); },
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const lassoBehaviors = Object.freeze({ lasso });
