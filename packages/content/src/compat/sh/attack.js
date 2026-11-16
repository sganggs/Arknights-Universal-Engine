// Stands in for Stronghold's server/sim/attack.js (兼容-2), the settlement façade its kits import since v0.3.2: the
// helpers that read or mark a damage info and a share of an HP hit set aside for a transfer. The damage, heal, HP loss
// and element calls themselves are the battle's methods (battle.js, field.js). The rest are gaps.
import { hasHp, isHpLoss, mitigate, periodicDamage, burstLocked } from './damage.js';
import { gap } from './gap.js';

export { hasHp, isHpLoss, mitigate, periodicDamage, burstLocked };
export const attackInput = gap('attack.attackInput');
export const elementView = gap('attack.elementView');
export const palsyBuff = gap('attack.palsyBuff');

/** @typedef {Record<string, any>} Dmg */

/**
 * How a hit is applied (近战 / 远程; PRTS 伤害分类): the instance's own, else a projectile's 'RANGED', an attack's
 * 'MELEE', anything else 'NONE'.
 * @param {Dmg} d
 */
export const damageApplyWay = (d) => d.applyWay ?? (d.isProjectile ? 'RANGED' : d.isAttack ? 'MELEE' : 'NONE');

/**
 * A hit's 攻击类型 (PRTS 伤害分类): its own, else 'SPLASH' for a splash, 'BUFF' for a damage over time (tags `dot`,
 * `necrosis`, `apoptosis`), else 'NORMAL'.
 * @param {Dmg} d
 */
export const damageAttackType = (d) => d.attackType ?? (d.isSplash ? 'SPLASH'
  : Array.isArray(d.tags) && d.tags.some((t) => t === 'dot' || t === 'necrosis' || t === 'apoptosis') ? 'BUFF' : 'NORMAL');

/**
 * Whether a hit refuses to be cancelled for `reason` ('dodge', 'block', 'miss'): listed in its `ignoreCancelReasons`,
 * or for a dodge, a hit that ignores dodging (`dodgeMode` 'ignore' or 'uncancellable', or `canDodge` false).
 * @param {Dmg} d @param {string} reason
 */
const ignoresCancel = (d, reason) => (Array.isArray(d.ignoreCancelReasons) && d.ignoreCancelReasons.includes(reason))
  || (reason === 'dodge' && (d.dodgeMode === 'uncancellable' || d.dodgeMode === 'ignore' || (d.dodgeMode == null && d.canDodge === false)));

/**
 * A hit's dodge mode: 'ignore' (no dodge is drawn), 'uncancellable' (one is drawn but cannot cancel it, 伤害-12 无视闪避)
 * or 'normal'.
 * @param {Dmg} d
 */
export function damageDodgeMode(d) {
  const mode = d.dodgeMode ?? (d.canDodge === false ? 'ignore' : 'normal');
  return mode === 'ignore' ? mode : ignoresCancel(d, 'dodge') ? 'uncancellable' : mode;
}

/**
 * Cancels a hit for `reason` unless it refuses that reason; a miss is marked as one either way. Whether it was cancelled.
 * @param {Dmg} d @param {string} reason
 */
export function cancelDamage(d, reason) {
  if (reason === 'miss') d.missed = true;
  if (ignoresCancel(d, reason)) return false;
  d.cancel = true;
  return true;
}

/**
 * Sets aside a share of an HP hit for a transfer, from an `hpDamage` handler's context (伤害-9): `ratio` of the amount
 * the first transfer saw, at most what is left, once per tag; the hit loses it, and `apply(amount, tags)` is called
 * after every `hpDamage` handler (battle.js). The amount set aside.
 * @param {{ amount: number, transfers?: { base: number, entries: { amount: number, tag: string, apply: Function }[] } }} ctx
 * @param {number} ratio @param {string} tag @param {(amount: number, tags: string[]) => void} apply
 */
export function reserveTransfer(ctx, ratio, tag, apply) {
  if (!(ctx.amount > 0) || !(ratio > 0) || typeof apply !== 'function') return 0;
  const group = (ctx.transfers ??= { base: ctx.amount, entries: [] });
  if (group.entries.some((e) => e.tag === tag)) return 0;
  const amount = Math.min(ctx.amount, group.base * Math.min(1, ratio));
  ctx.amount -= amount;
  group.entries.push({ amount, tag, apply });
  return amount;
}
