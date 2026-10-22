// 超负载 (docs/spec/foes.md 敌能-67). `Punch` is shared: 朔壳's blackboard is only `range_radius`, and 神拳机甲 has this
// shape but no saved page, so the page's 0.8 is a content extra the behaviour requires. The 10 s of punches are not
// the unmovable part — the page and `unmovable_duration` name only the 1 s end animation.

import { KIND } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit */

/** No normal attacks for the whole skill, including the end animation (敌能-67). Not a shown status. */
const PUNCH = 'punch';
/** The end animation: unmovable, and not the 束缚 status (the key is not `root`). */
const HOLD = 'punch:hold';
/** Seconds between punches. The page states it; the blackboard has no such key. */
const GAP = 1;
/** Keys this shape may hold. `radius` is the page marker, not enemy data. */
const KEYS = new Set(['stun', 'atk_scale', 'duration', 'unmovable_duration', 'radius']);

/** @param {unknown} n */
const num = (n) => typeof n === 'number';

/**
 * Whether `Punch` with this blackboard is 超负载 (敌能-67). Any other name is not this family's concern.
 * 朔壳's `range_radius` blackboard is not, even if the four numbers were also present.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function punchOwns(name, bb) {
  if (name !== 'Punch') return true;
  if (!num(bb.stun) || !num(bb.atk_scale) || !num(bb.duration) || !num(bb.unmovable_duration)) return false;
  for (const k of Object.keys(bb)) if (!KEYS.has(k)) return false;
  return true;
}

/** This enemy's blackboard is the shape and carries the page radius. @param {FoeContext} ctx */
const armed = (ctx) => punchOwns('Punch', ctx.bb) && num(ctx.bb.radius);

/** A non-flying unit of ours inside the radius: operators (summons included) and our devices, not neutrals. @param {FoeContext} ctx */
const groundNear = (ctx) => ctx.foes(ctx.bb.radius).some((u) => u.kind !== KIND.ENEMY);

/** Ready, not silenced, able to act, blocked, and a ground unit of ours is in reach (敌能-67). @param {FoeContext} ctx */
function canStart(ctx) {
  const s = ctx.stats(ctx.self);
  return ctx.ready && !s.disabled && !s.flags.silence && ctx.blocked && groundNear(ctx);
}

/**
 * One punch: `atk_scale` of current ATK, physical, then `stun` seconds if the target is still up.
 * False when that punch dropped them.
 * @param {FoeContext} ctx @param {Unit} t
 */
function strike(ctx, t) {
  ctx.dealDamage(t, { type: 'phys', amount: ctx.stats(ctx.self).atk * ctx.bb.atk_scale });
  if (t.hp <= 0) return false;
  ctx.applyStatus(t, 'stun', { seconds: ctx.bb.stun });
  return true;
}

/** The skill stops: drop both locks and start the cooldown (敌能-67). @param {FoeContext} ctx */
function finish(ctx) {
  ctx.removeBuff(ctx.self, PUNCH);
  ctx.removeBuff(ctx.self, HOLD);
  ctx.state.set('on', 0);
  ctx.use();
}

/** The stored target, still listed, or null once it has left. @param {FoeContext} ctx */
const targetOf = (ctx) => ctx.unit(ctx.state.get('t'));

/** Trigger frame: let go, lock out normal attacks, punch once. @param {FoeContext} ctx @param {Unit} blocker */
function begin(ctx, blocker) {
  const gap = ctx.frames(GAP);
  const count = Math.floor(ctx.frames(ctx.bb.duration) / gap);
  if (count < 1) return;
  const span = ctx.frames(ctx.bb.duration) + ctx.frames(ctx.bb.unmovable_duration);
  ctx.release();
  ctx.addBuff(ctx.self, { key: PUNCH, flags: { noAttack: true }, left: span });
  const st = ctx.state;
  st.set('on', 1);
  st.set('t', blocker.id);
  st.set('next', ctx.frame + gap);
  st.set('last', ctx.frame + gap * (count - 1));
  st.set('end', ctx.frame + ctx.frames(ctx.bb.duration));
  st.set('tail', ctx.frame + span);
  if (!strike(ctx, blocker)) finish(ctx);
}

/** The 1 s end animation, once (敌能-67). @param {FoeContext} ctx */
function hold(ctx) {
  if (ctx.self.buffs.some((b) => b.key === HOLD)) return;
  ctx.addBuff(ctx.self, { key: HOLD, flags: { root: true }, left: ctx.frames(ctx.bb.unmovable_duration) });
}

/**
 * One frame of a running 超负载. A missed punch (frozen that frame) is not made up; the clock is not paused.
 * @param {FoeContext} ctx
 */
function running(ctx) {
  const t = targetOf(ctx);
  if (!t || t.hp <= 0) { finish(ctx); return; }
  const frame = ctx.frame, st = ctx.state;
  if (frame < st.get('end')) {
    if (frame === st.get('next') && frame <= st.get('last')) {
      if (!ctx.stats(ctx.self).disabled && !strike(ctx, t)) { finish(ctx); return; }
      st.set('next', frame + ctx.frames(GAP));
    }
    return;
  }
  if (frame < st.get('tail')) { hold(ctx); return; }
  finish(ctx);
}

/**
 * 超负载 (敌能-67). Idle until the trigger; then punch the blocker it had, and do not pick a new one.
 * @type {FoeBehavior}
 */
const Punch = Object.freeze({
  tick: (ctx) => {
    if (!armed(ctx)) return;
    if (ctx.state.get('on')) { running(ctx); return; }
    if (!canStart(ctx)) return;
    const blocker = ctx.blocker();
    if (blocker) begin(ctx, blocker);
  },
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const punchBehaviors = Object.freeze({ Punch });
