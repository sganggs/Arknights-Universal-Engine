// More of the engine's events (docs/spec/hooks.md 钩子-5): after a status took hold, at an enemy's attack landing before
// 麻痹 is checked, and as 麻痹 interrupts an attack. Names and contexts are Stronghold's, whose kits listen to them
// (酒神's 堕梦, 真言's 噤声限域). With no handler nothing more is done, so the state is what it was without them.
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { emit, hasHook } from './bus.js';
import { disarmed } from './disarm.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Buff} Buff */
/** @typedef {import('./types.js').Swing} Swing */

/**
 * The status keys a unit holds before a status is given (钩子-5 `entered`), when `statusApplied` has a handler; else null.
 * @param {World} w @param {Unit} u @returns {Set<string> | null}
 */
export const heldBefore = (w, u) => (hasHook(w, 'statusApplied') ? new Set(u.buffs.map((b) => b.key)) : null);

/**
 * After a status is given in a battle (钩子-5): when it took hold — `b`, the buff now in the list — and `had` was taken,
 * the `statusApplied` event with what took hold (a friendly cold pair is a freeze, 状态-6), its frames left, its value,
 * and whether the target held none of it before. Returns `b`.
 * @param {World} w @param {Unit} target @param {Unit | null} src @param {Set<string> | null} had @param {Buff | null} b @returns {Buff | null}
 */
export function announce(w, target, src, had, b) {
  if (had && b) emit(w, 'statusApplied', { source: src, target, status: b.key, frames: b.left, strength: b.value, entered: !had.has(b.key) });
  return b;
}

/**
 * 麻痹 interrupting an enemy's attack, before its layer goes (钩子-5, 状态-8): the `palsyTrigger` event; whether a handler
 * keeps the layer. The attack is interrupted either way.
 * @param {World} w @param {Unit} e @param {Buff} b @returns {boolean}
 */
export const palsyKept = (w, e, b) => hasHook(w, 'palsyTrigger') && !!emit(w, 'palsyTrigger', { enemy: e, buff: b, keep: false }).keep;

/**
 * Whether an enemy loses an attack under way (攻击-2 step 4, 敌人攻击-1, 状态-10, 状态-12): it cannot act, has no attack,
 * has disappeared, may not attack (`noAttack`), is afraid (恐惧) or is under 缴械 or 强制缴械 (two of the eight 阻止攻击:
 * it may walk). The one list for both an enemy's turn (combat.js enemyAttack) and its attack landing after the
 * `enemyAttackStart` handlers, so a reason added here holds for both.
 * @param {Unit} e @param {import('./attrs.js').Stats} [s] @returns {boolean}
 */
export function swingLost(e, s = statsOf(e)) {
  return s.disabled || s.atk <= 0 || !!e.hidden || !!s.flags.noAttack || !!s.flags.fear || disarmed(e);
}

/**
 * An enemy's attack landing (钩子-5, 攻击-2 step 3), before 麻痹 is checked: the `enemyAttackStart` event with the locked
 * targets still on the field, alive and not disappeared (a copy). Whether the attack goes on: not when, after the
 * handlers, the enemy has no HP, has left the field, or loses an attack under way as on its turn (`swingLost` — a
 * handler's 晕眩, say). Any other attacker, and any attack without a handler, goes on.
 * @param {World} w @param {Unit} a @param {Swing} sw @returns {boolean}
 */
export function strikes(w, a, sw) {
  if (a.kind !== KIND.ENEMY || !hasHook(w, 'enemyAttackStart')) return true;
  const targets = sw.targets.flatMap((id) => w.units.filter((u) => u.id === id && u.hp > 0 && !u.hidden));
  emit(w, 'enemyAttackStart', { enemy: a, targets });
  return a.hp > 0 && w.units.includes(a) && !swingLost(a);
}
