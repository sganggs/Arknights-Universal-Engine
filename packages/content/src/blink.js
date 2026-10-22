// 闪现 (docs/spec/foes.md 敌能-73, 敌能-84). One behaviour for the shared name.
// “灰礼帽”: { atk_scale, dist }, a full SP bar, an even 2s glide, then a hit 0.3s after the trigger.
// 弑君者: { dist, glide }, a cooldown, an even glide of `glide` seconds (the page's 0.5s, not a data key), and no hit.
// { dist } alone is 卢西恩 and stays uncovered (关卡-2). The 1s 不可阻挡 is the page's duration, not a blackboard key.
import { hypot } from '@aue/math';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */

/** Page durations, in seconds (敌能-73): ① 1s, the hat glide 2s, the hit 0.3s after the trigger. */
const SLIP_S = 1;
const HAT_GLIDE_S = 2;
const LAG_S = 0.3;
/** Hat keys (敌能-73). A crown key here would be a different skill. */
const HAT_KEYS = new Set(['atk_scale', 'dist']);
/** 弑君者 (敌能-84). `glide` is the page's seconds; the data has only `dist`. */
const CROWN_KEYS = new Set(['dist', 'glide']);

/**
 * Whether `bb` has a number for every key in `need` and no key outside `allow`.
 * @param {Record<string, unknown>} bb @param {Set<string>} need @param {Set<string>} allow
 */
function shape(bb, need, allow) {
  for (const k of need) if (typeof bb[k] !== 'number') return false;
  for (const k of Object.keys(bb)) if (!allow.has(k)) return false;
  return true;
}

/** @param {Record<string, unknown>} bb */
const hatShape = (bb) => shape(bb, HAT_KEYS, HAT_KEYS);
/** @param {Record<string, unknown>} bb */
const crownShape = (bb) => shape(bb, CROWN_KEYS, CROWN_KEYS);

/**
 * Whether a behaviour of this name is one of these blinks, when the name is blink (敌能-73, 敌能-84). Any other name
 * is not this family's concern.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function blinkOwns(name, bb) {
  return name !== 'blink' || hatShape(bb) || crownShape(bb);
}

/** Ready, blocked, able to act, not silenced (敌能-73, 敌能-84). @param {FoeContext} ctx */
function acting(ctx) {
  const s = ctx.stats(ctx.self);
  return ctx.ready && ctx.blocked && !s.disabled && !s.flags.silence;
}

/** Hat: a full bar. Crown: the dist+glide shape, no SP (敌能-84). @param {FoeContext} ctx */
function armed(ctx) {
  if (!acting(ctx)) return false;
  if (hatShape(ctx.bb)) return ctx.sp > 0 && ctx.state.get('sp') >= ctx.sp;
  return crownShape(ctx.bb);
}

/**
 * The point `dist` tiles toward course(), when that point is a tile it may stand on (敌能-73, 敌能-84).
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

/** The unit that blocked it, and when the hat's hit lands (敌能-73). Crowns have no hit. @param {FoeContext} ctx */
function noteBlocker(ctx) {
  const who = ctx.blocker();
  ctx.state.set('who', who ? who.id : -1);
  ctx.state.set('due', ctx.frame + ctx.frames(LAG_S));
}

/** One even glide of `sec` seconds, and the unblockable / invincible / 失衡免疫 that lasts it. @param {FoeContext} ctx @param {{ x: number, y: number }} to @param {number} sec */
function startGlide(ctx, to, sec) {
  ctx.state.set('fx', ctx.self.x);
  ctx.state.set('fy', ctx.self.y);
  ctx.state.set('tx', to.x);
  ctx.state.set('ty', to.y);
  ctx.state.set('n', ctx.frames(sec));
  ctx.state.set('k', 0);
  ctx.addBuff(ctx.self, { key: 'blinkGlide', flags: { unblockable: true, invincible: true, noDisplace: true }, left: ctx.frames(sec) });
}

/** Slips the block. A hat also spends its bar and stores the hit; a crown only restarts the cooldown (敌能-84). @param {FoeContext} ctx */
function begin(ctx) {
  const hat = hatShape(ctx.bb);
  if (hat) ctx.state.set('sp', 0);
  ctx.use();
  ctx.addBuff(ctx.self, { key: 'blinkSlip', flags: { unblockable: true }, left: ctx.frames(SLIP_S) });
  if (hat) noteBlocker(ctx);
  const to = destination(ctx);
  if (!to) return;
  const glide = ctx.bb.glide;
  startGlide(ctx, to, hat ? HAT_GLIDE_S : (typeof glide === 'number' ? glide : 0));
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

/** 闪现 (敌能-73, 敌能-84). A hat's attack only fills the bar. A crown's attack is ordinary and adds nothing. @type {FoeBehavior} */
const blink = Object.freeze({
  attack: (ctx, mods) => {
    if (!hatShape(ctx.bb)) return mods;
    ctx.state.set('sp', Math.min(ctx.sp, ctx.state.get('sp') + 1));
    return mods;
  },
  tick: (ctx) => {
    if (!hatShape(ctx.bb) && !crownShape(ctx.bb)) return;
    if (armed(ctx)) begin(ctx);
    glide(ctx);
    if (hatShape(ctx.bb)) strike(ctx);
  },
});

/**
 * 失衡免疫 (敌能-73): the hat pages name it and the data has no talent. Lasting from spawn. Not silence-gated.
 * 弑君者 has no such talent (敌能-84); the glide's own noDisplace is the only one it gets.
 * @type {FoeBehavior}
 */
const ShiftImmune = Object.freeze({
  spawn: (ctx) => { ctx.addBuff(ctx.self, { key: 'shiftImmune', flags: { noDisplace: true } }); },
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const blinkBehaviors = Object.freeze({ blink, ShiftImmune });
