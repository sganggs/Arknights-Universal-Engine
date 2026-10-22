// 闪现 (docs/spec/foes.md 敌能-73): “灰礼帽” and “见习灰礼帽”. The page's 在2s内 is an even glide of `dist`
// tiles over 2 seconds, the first step on the trigger frame. The 1s 不可阻挡 and the 0.3s hit are that same sentence's
// durations, not blackboard keys, so the shape stays { atk_scale, dist }. Other blink blackboards stay uncovered (关卡-2).
import { hypot } from '@aue/math';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */

/** Page durations, in seconds (敌能-73): ① 1s, the glide 2s, the hit 0.3s after the trigger. */
const SLIP_S = 1;
const GLIDE_S = 2;
const LAG_S = 0.3;
/** The only blackboard keys this blink reads. */
const SHAPE = new Set(['atk_scale', 'dist']);

/**
 * Whether `bb` is this blink (敌能-73): numeric atk_scale and dist, and nothing else.
 * @param {Record<string, unknown>} bb
 */
function blinkShape(bb) {
  if (typeof bb.atk_scale !== 'number' || typeof bb.dist !== 'number') return false;
  for (const k of Object.keys(bb)) if (!SHAPE.has(k)) return false;
  return true;
}

/**
 * Whether a behaviour of this name is this family's, when the name is blink (敌能-73). Any other name is not this
 * family's concern.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function blinkOwns(name, bb) {
  return name !== 'blink' || blinkShape(bb);
}

/** Full bar, blocked, ready, able to act, not silenced (敌能-73). @param {FoeContext} ctx */
function armed(ctx) {
  const s = ctx.stats(ctx.self);
  return blinkShape(ctx.bb) && ctx.sp > 0 && ctx.state.get('sp') >= ctx.sp && ctx.ready && ctx.blocked
    && !s.disabled && !s.flags.silence;
}

/**
 * The point `dist` tiles toward course(), when that point is a tile it may stand on (敌能-73).
 * @param {FoeContext} ctx @returns {{ x: number, y: number } | null}
 */
function destination(ctx) {
  const aim = ctx.course();
  if (!aim) return null;
  const dx = aim.x - ctx.self.x, dy = aim.y - ctx.self.y, d = hypot(dx, dy), dist = ctx.bb.dist;
  if (d === 0 || typeof dist !== 'number' || !(dist > 0)) return null;
  const x = ctx.self.x + (dx / d) * dist, y = ctx.self.y + (dy / d) * dist;
  return ctx.open(x, y) ? { x, y } : null;
}

/** Spends the bar, slips the block, and — when the destination is open — starts the glide (敌能-73). @param {FoeContext} ctx */
function begin(ctx) {
  ctx.state.set('sp', 0);
  ctx.use();
  ctx.addBuff(ctx.self, { key: 'blinkSlip', flags: { unblockable: true }, left: ctx.frames(SLIP_S) });
  const who = ctx.blocker();
  ctx.state.set('who', who ? who.id : -1);
  ctx.state.set('due', ctx.frame + ctx.frames(LAG_S));
  const to = destination(ctx);
  if (!to) return;
  ctx.state.set('fx', ctx.self.x);
  ctx.state.set('fy', ctx.self.y);
  ctx.state.set('tx', to.x);
  ctx.state.set('ty', to.y);
  ctx.state.set('n', ctx.frames(GLIDE_S));
  ctx.state.set('k', 0);
  ctx.addBuff(ctx.self, { key: 'blinkGlide', flags: { unblockable: true, invincible: true, noDisplace: true }, left: ctx.frames(GLIDE_S) });
}

/** One even step of a glide already started (敌能-73). A later silence does not stop it. @param {FoeContext} ctx */
function glide(ctx) {
  const n = ctx.state.get('n'), k = ctx.state.get('k');
  if (!(n > 0) || k >= n) return;
  const step = k + 1, fx = ctx.state.get('fx'), fy = ctx.state.get('fy');
  ctx.place(fx + (ctx.state.get('tx') - fx) * (step / n), fy + (ctx.state.get('ty') - fy) * (step / n));
  ctx.state.set('k', step);
}

/** The hit on the unit that blocked it, 0.3s after the trigger, at the attack it has then (敌能-73). @param {FoeContext} ctx */
function strike(ctx) {
  const due = ctx.state.get('due');
  if (!(due > 0) || ctx.frame < due) return;
  ctx.state.set('due', 0);
  const t = ctx.unit(ctx.state.get('who'));
  if (!t || t.hp <= 0) return;
  ctx.dealDamage(t, { type: 'phys', amount: ctx.bb.atk_scale * ctx.stats(ctx.self).atk });
}

/** 闪现 (敌能-73). The attack only fills the bar; the tick spends it. @type {FoeBehavior} */
const blink = Object.freeze({
  attack: (ctx, mods) => {
    if (!blinkShape(ctx.bb)) return mods;
    ctx.state.set('sp', Math.min(ctx.sp, ctx.state.get('sp') + 1));
    return mods;
  },
  tick: (ctx) => {
    if (!blinkShape(ctx.bb)) return;
    if (armed(ctx)) begin(ctx);
    glide(ctx);
    strike(ctx);
  },
});

/**
 * 失衡免疫 (敌能-73): the page names it and the data has no talent. Lasting from spawn. Not silence-gated.
 * @type {FoeBehavior}
 */
const ShiftImmune = Object.freeze({
  spawn: (ctx) => { ctx.addBuff(ctx.self, { key: 'shiftImmune', flags: { noDisplace: true } }); },
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const blinkBehaviors = Object.freeze({ blink, ShiftImmune });
