// Stronghold's statuses that have no counterpart among the official abnormal effects, so none in the engine's catalogue
// (状态-5), as the compatibility layer's stand-ins (docs/spec/compat.md 兼容-4): a buff of the status's own key with
// Stronghold's modifiers that keeps the strongest value (状态-2 `max`, its value as its data), given after the same
// `beforeStatus` event (钩子-3) as the engine's statuses — a handler may cancel it or change its frames or its value.
// 反隐 is no abnormal effect either (PRTS 异常效果: 隐匿免疫, an immunity; its old flag is unused): its stand-in carries
// the engine's own 反隐 flag (索敌-2) and keeps the longer time, as Stronghold refreshes a status.
import { secondsToFrames } from '@aue/math';
import { bus, buffs } from '@aue/sim';

/** @typedef {import('./battle.js').ShBattle} ShBattle @typedef {import('./unit.js').ShUnit} ShUnit @typedef {import('@aue/sim').Unit} Unit */

/** @param {number} x */
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * The stand-ins, by Stronghold's key: their modifiers by value and the value when none is given (Stronghold's catalogue);
 * the flags of one that has them, and its same-key rule when it is not 效果取最高 (状态-2).
 * @type {Readonly<Record<string, { mods: (v: number) => Record<string, number>, value: number, flags?: Record<string, boolean>, rule?: 'extend' }>>}
 */
export const STAND_INS = Object.freeze({
  // DEF × (1 − v), 最终乘算
  defDown: { mods: (v) => ({ defMul: 1 - clamp01(v) }), value: 0.3 },
  // 反隐: 隐匿 does not take effect (索敌-2); one buff, the longer time kept (延长时间)
  reveal: { mods: () => ({}), value: 0, flags: { unstealth: true }, rule: 'extend' },
});

/**
 * Gives a stand-in status (whether it took hold): seconds as frames (none: no end).
 * @param {ShBattle} b @param {ShUnit} target @param {string} key @param {{ duration?: number, source?: ShUnit | null, value?: number }} o
 */
export function giveStandIn(b, target, key, o) {
  const s = STAND_INS[key], u = /** @type {Unit} */ (target.u), src = o.source?.u ?? null;
  const k = { source: src, target: u, status: key, frames: o.duration === undefined || o.duration === Infinity ? -1 : secondsToFrames(Math.max(0, o.duration)),
    strength: Number.isFinite(o.value) ? Number(o.value) : s.value, cancel: false };
  if (bus.hasHook(b.w, 'beforeStatus')) bus.emit(b.w, 'beforeStatus', k);
  const frames = Number.isFinite(k.frames) ? Math.trunc(k.frames) : -1, v = Number(k.strength);
  if (k.cancel || u.hp <= 0 || (frames <= 0 && frames !== -1) || !Number.isFinite(v)) return false;
  const buff = buffs.makeBuff({ key, src: src ? src.id : -1, rule: s.rule ?? 'max', value: v, mods: s.mods(v), flags: s.flags, left: frames });
  b.buffData.set(buff, { value: v });
  buffs.addBuff(u, buff);
  return true;
}
