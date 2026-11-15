// Stronghold's buffs with callbacks (docs/spec/compat.md 兼容-4, ADR 0054): a kit's buff that ticks (`onTick` every
// `interval` seconds, every frame without one) or acts when its time runs out (`onExpire`) is the engine's plain buff
// with the behaviour key KIT_BUFF (状态-1) and the interval as its trigger (状态-4); its callbacks stay with the battle,
// by buff, and that one behaviour runs them with Stronghold's context. `onRemove` runs when the kit removes the buff.
import { FPS, secondsToFrames } from '@aue/math';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').Buff} Buff */
/** @typedef {import('./battle.js').ShBattle} ShBattle */
/** @typedef {{ onTick?: Function, onExpire?: Function, onRemove?: Function, dt: number }} Hooks */

/** The behaviour key of every kit buff with callbacks. */
export const KIT_BUFF = 'compat:kit';

/** The battle of each world that has kits (kits.js). @type {WeakMap<World, ShBattle>} */
export const worldBattles = new WeakMap();

/**
 * A buff spec's callbacks and its trigger in whole frames (at least 1; every frame without an interval; 0 without
 * `onTick`), or null when it has none.
 * @param {Record<string, any>} spec @returns {{ every: number, hooks: Hooks } | null}
 */
export function hooksOf(spec) {
  const fn = (/** @type {unknown} */ f) => (typeof f === 'function' ? f : undefined);
  const onTick = fn(spec.onTick), onExpire = fn(spec.onExpire), onRemove = fn(spec.onRemove), s = Number(spec.interval);
  if (!onTick && !onExpire && !onRemove) return null;
  const timed = s > 0 && Number.isFinite(s);
  return { every: onTick ? (timed ? Math.max(1, secondsToFrames(s)) : 1) : 0, hooks: { onTick, onExpire, onRemove, dt: timed ? s : 1 / FPS } };
}

/**
 * Runs one of a kit buff's callbacks with Stronghold's context (recorded and skipped when it throws).
 * @param {ShBattle} battle @param {Unit} u @param {Buff} b @param {'onTick' | 'onExpire' | 'onRemove'} name
 */
export function runHook(battle, u, b, name) {
  const hooks = battle.buffHooks.get(b), fn = hooks?.[name];
  if (!hooks || typeof fn !== 'function') return;
  const unit = battle.unitOf(u), buff = battle.buffOf(u, b);
  battle.safe(() => fn({ battle, unit, buff, ...(name === 'onTick' ? { dt: hooks.dt } : {}) }), `buff.${name}`, unit);
}

/** The behaviour of KIT_BUFF (状态-1): its trigger runs `onTick`, its expiry `onExpire`. @type {Readonly<import('@aue/sim').buffs.Behavior>} */
export const KIT_BUFF_BEHAVIOR = Object.freeze({
  /** @param {World} w @param {Unit} u @param {Buff} b */
  tick(w, u, b) { const battle = worldBattles.get(w); if (battle) runHook(battle, u, b, 'onTick'); },
  /** @param {World} w @param {Unit} u @param {Buff} b */
  expire(w, u, b) { const battle = worldBattles.get(w); if (battle) runHook(battle, u, b, 'onExpire'); },
});
