// 锋盔骑士团 (docs/spec/foes.md 敌能-78): 削弱斗志 — the unit of ours with the highest ATK on the whole field gains
// 【锋盔削弱】 — and a duration-only 重生. The rebirth is 敌能-18's, at full HP and without the extra 无敌. They act
// only through the context (ADR 0055).

import { FPS } from '@aue/math';
import { targeting } from '@aue/sim';
import { beginRebirth, endRebirth } from './avenger.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** 【锋盔削弱】, one key for all three knights so a unit weakened by any of them is skipped by the others (敌能-78). */
const WEAK = 'atkDesWeaken';
/** Current ATK compared at this step (属性-1): 0.001, the same precision a HP ratio uses (索敌-3). */
const ATK_STEP = 0.001;
/** Keys a read 锋盔 `reborn` may hold. `page` is the page marker; unread `{ duration }` users do not have it (关卡-2). */
const REBORN_KEYS = new Set(['duration', 'page']);

/** Whether this unit already holds 【锋盔削弱】. A queued second copy is still that effect (状态-2). @param {Unit} u */
const holding = (u) => u.buffs.some((b) => b.key === WEAK);

/**
 * The duration-only 重生 the three read pages describe (敌能-78). Any other `reborn` shape is not this talent.
 * @param {Record<string, unknown>} bb
 */
function durationOnly(bb) {
  if (typeof bb.duration !== 'number' || typeof bb.page !== 'number') return false;
  for (const k of Object.keys(bb)) if (!REBORN_KEYS.has(k)) return false;
  return true;
}

/**
 * Whether a talent of this name, with this blackboard, is the 锋盔 重生 (敌能-78). Any other name is not this
 * family's concern: the caller still asks FOE_NEEDS.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function rebornOwns(name, bb) {
  if (name !== 'reborn') return true;
  return durationOnly(bb);
}

/** 索敌-5 hatred, without the blocker-first step the page declines (敌能-78). @param {FoeContext} ctx @param {Unit} u */
function hateOf(ctx, u) {
  return targeting.characterHatred(ctx.stats(u).taunt, u.born / FPS, u.bornN);
}

/**
 * Higher current ATK first (precision 0.001); ties take the higher 索敌-5 hatred, then the lower id (敌能-78).
 * A negative result means `a` comes first.
 * @param {FoeContext} ctx @param {Unit} a @param {Unit} b
 */
function ahead(ctx, a, b) {
  const atk = targeting.precisionKey(ctx.stats(b).atk, ATK_STEP) - targeting.precisionKey(ctx.stats(a).atk, ATK_STEP);
  if (atk !== 0) return atk;
  const hate = targeting.precisionKey(hateOf(ctx, b)) - targeting.precisionKey(hateOf(ctx, a));
  return hate || a.id - b.id;
}

/**
 * Our operators (a summon is one) and our devices on the whole field, flyers included, not already weakened (敌能-78).
 * Neutrals are not 我方单位. 索敌-2 still drops 隐匿, 无法选中, 沉睡, 迷彩 and a unit that is not on the field.
 * @param {FoeContext} ctx @returns {Unit[]}
 */
function pick(ctx) {
  const list = ctx.foes(Infinity, { canHitFly: true }).filter((u) => u.base.neutral !== true && !holding(u));
  return list.toSorted((a, b) => ahead(ctx, a, b));
}

/**
 * 削弱斗志 / 攻击削弱 (敌能-78): ready, able to act and not silenced, the highest-ATK unit of ours gains ATK ×(1+`atk`)
 * for `duration` seconds. Nobody eligible, and it stays ready. Being blocked does not matter, and neither does 缴械.
 * @type {FoeBehavior}
 */
const AtkDesWeaken = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, s = ctx.stats(ctx.self);
    if (!ctx.ready || s.disabled || s.flags.silence) return;
    if (typeof bb.atk !== 'number' || typeof bb.duration !== 'number') return;
    const [t] = pick(ctx);
    if (!t) return;
    ctx.use();
    ctx.addBuff(t, { key: WEAK, mods: { atkMul: 1 + bb.atk }, left: ctx.frames(bb.duration) });
  },
});

/**
 * 重生 (敌能-78): the first fatal hit stays, at full HP — there is no `hp_ratio` — for `duration` seconds of 敌能-18's
 * reviving. A blackboard this shape does not know does nothing, so an unread `reborn` is not revived if it is left on.
 * @type {FoeBehavior}
 */
const reborn = Object.freeze({
  fatal: (ctx) => (durationOnly(ctx.bb) ? beginRebirth(ctx, 1) : false),
  tick: (ctx) => { if (durationOnly(ctx.bb)) endRebirth(ctx); },
});

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const helmKnightBehaviors = Object.freeze({ AtkDesWeaken, reborn });
