// 缴械 and 强制缴械 (docs/spec/status.md 状态-12): PRTS 异常效果 puts both among the eight effects that stop a unit's
// attack (阻止攻击), with 晕眩 and the others that stop it acting, so the attack obeys them as it obeys those (攻击-1,
// 敌人攻击-1) while skills, blocking and movement go on. 缴械 does nothing while the unit is 无敌; 强制缴械 holds through it.
import { statsOf } from './attrs.js';

/** @typedef {import('./types.js').Unit} Unit */

/**
 * Whether 缴械 or 强制缴械 holds a unit's normal attack back now (状态-12): 强制缴械 always, 缴械 unless the unit is 无敌
 * (状态-5: 无敌 or 沉睡). An immunity to the flag (状态-7) leaves that one out.
 * @param {Pick<Unit, 'base' | 'buffs'>} u
 * @returns {boolean}
 */
export function disarmed(u) {
  const s = statsOf(u);
  return !!s.flags.forceDisarm || (!!s.flags.disarm && !s.invincible);
}
