// 深溟巢涌者 and 富营养的巢涌者 (docs/spec/foes.md 敌能-47). The pulse shares EpDamage with the on-hit element
// (敌能-38): it runs only when the content marker `pulse` is on the blackboard. 抵抗 and 停顿免疫 are the other talent,
// `Buff`, in its one_minus_status_resistance shape. `form` is the page: 1 深溟, 2 富营养. They are talents, so silence does
// not stop them (如无特殊说明，天赋默认不可沉默). They act only through the context (ADR 0055).

import { KIND } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit */

/** Keys the pulse blackboard may hold. */
const PULSE_KEYS = new Set(['ep_damage_ratio', 'pulse', 'form']);
/** Keys the 抵抗 blackboard may hold. */
const BUFF_KEYS = new Set(['one_minus_status_resistance', 'form']);
/** 不进行普通攻击. */
const STILL = 'nestStill';
/** 停顿免疫 (状态-7: 停顿 has no flag, so `immune:sluggish` refuses it). */
const UNSLOWED = 'nestUnslowed';
/** 富营养's multiplier. Not `buffres`, so it is not 抵抗 for anything that looks the status up. */
const PLAIN = 'nestRes';
/** 神经损伤 (元素-1). */
const NEURAL = 'SANITY';

/** @param {Record<string, unknown>} bb @param {Set<string>} keys */
function onlyKeys(bb, keys) {
  for (const k of Object.keys(bb)) if (!keys.has(k)) return false;
  return true;
}

/** Which page a blackboard is (1 深溟, 2 富营养), or 0. @param {Record<string, unknown>} bb */
const formOf = (bb) => (bb.form === 1 || bb.form === 2 ? bb.form : 0);

/**
 * Whether this talent is the nest pulse (敌能-47), not the on-hit element (敌能-38): the ratio, `pulse` 1 and a `form`.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function nestPulseOwns(name, bb) {
  return name === 'EpDamage' && typeof bb.ep_damage_ratio === 'number' && bb.pulse === 1 && formOf(bb) > 0 && onlyKeys(bb, PULSE_KEYS);
}

/** Whether this `Buff` is the nest 抵抗 and 停顿免疫 (敌能-47): the one number and a `form`. @param {Record<string, unknown>} bb */
export function nestBuffOwns(bb) {
  return typeof bb.one_minus_status_resistance === 'number' && formOf(bb) > 0 && onlyKeys(bb, BUFF_KEYS);
}

/** Gives a buff once; it is given again only if something took it away. @param {FoeContext} ctx @param {import('@aue/sim').buffs.BuffInit} init */
function keep(ctx, init) {
  if (!ctx.self.buffs.some((b) => b.key === init.key)) ctx.addBuff(ctx.self, init);
}

/** 抵抗 (深溟), or the same number without the status (富营养), and 停顿免疫 (敌能-47). @param {FoeContext} ctx */
function holdBuff(ctx) {
  const bb = ctx.bb;
  keep(ctx, { key: UNSLOWED, flags: { 'immune:sluggish': true } });
  if (formOf(bb) === 2) { keep(ctx, { key: PLAIN, mods: { statusResFlat: bb.one_minus_status_resistance } }); return; }
  if (!ctx.self.buffs.some((b) => b.key === 'buffres')) ctx.applyStatus(ctx.self, 'buffres', { value: -bb.one_minus_status_resistance });
}

/** Attack range (敌人攻击-1): `rangeRadius` plus the ally collider. Neutrals are in `foes` and are not 我方. @param {FoeContext} ctx */
function pulseTargets(ctx) {
  return ctx.foes(ctx.self.base.rangeRadius + 0.25).filter((u) => u.kind !== KIND.ENEMY);
}

/**
 * One target of the pulse (敌能-47). Arts first. 深溟 then adds 神经损伤 anyway; 富营养 only when that arts hit took HP
 * (自身造成伤害时). 元素损伤 does not go through here again.
 * @param {FoeContext} ctx @param {Unit} t @param {number} atk
 */
function strike(ctx, t, atk) {
  const hp = ctx.dealDamage(t, { type: 'arts', amount: atk });
  if (formOf(ctx.bb) === 1 || hp > 0) ctx.dealEp(t, NEURAL, atk * ctx.bb.ep_damage_ratio);
}

/** The flag, from the spawn frame, before the first attack (敌能-47). @param {FoeContext} ctx */
export function nestPulseUp(ctx) {
  keep(ctx, { key: STILL, flags: { noAttack: true } });
}

/**
 * One turn of the pulse (敌能-47). The count starts at 0 and the spawn frame's later tick is the first step, so the
 * first hit is a full second after spawn. While 富营养 is 消失 the count stays where it is.
 * @param {FoeContext} ctx
 */
export function nestPulseTick(ctx) {
  nestPulseUp(ctx);
  if (formOf(ctx.bb) === 2 && ctx.self.hidden) return;
  const n = ctx.state.get('n') + 1;
  if (n < ctx.frames(1)) { ctx.state.set('n', n); return; }
  ctx.state.set('n', 0);
  const atk = ctx.stats(ctx.self).atk;
  for (const t of pulseTargets(ctx)) strike(ctx, t, atk);
}

/** 抵抗 and 停顿免疫 (敌能-47). A blackboard this is not does nothing, and stays incomplete (关卡-2). @type {FoeBehavior} */
const nestBuff = Object.freeze({
  spawn: (ctx) => { if (nestBuffOwns(ctx.bb)) holdBuff(ctx); },
  tick: (ctx) => { if (nestBuffOwns(ctx.bb)) holdBuff(ctx); },
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const nestBehaviors = Object.freeze({ Buff: nestBuff });
