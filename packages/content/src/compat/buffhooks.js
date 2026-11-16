// Stronghold's buffs with callbacks (docs/spec/compat.md 兼容-4, ADR 0054): a kit's buff that ticks (`onTick` every
// `interval` seconds, every frame without one) or acts when its time runs out (`onExpire`) is the engine's plain buff
// with the behaviour key KIT_BUFF (状态-1) and the interval as its trigger (状态-4); its callbacks stay with the battle,
// by buff, and that one behaviour runs them with Stronghold's context. `onRemove` runs when the kit removes the buff, and
// when the engine drops it as a used-up shield. Its 伤判 callbacks (`injury`, `observeInjury`) and its flat
// `damageReduction` run in the buff's own turn of the engine's 伤判 (伤害-8), as Stronghold's injuryEffects runs them.
import { FPS, secondsToFrames } from '@aue/math';
import { damage } from '@aue/sim';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').Buff} Buff */
/** @typedef {import('./battle.js').ShBattle} ShBattle @typedef {import('./unit.js').ShUnit} ShUnit */
/** @typedef {import('@aue/sim').buffs.TakeHit} TakeHit */
/**
 * A kit buff's callbacks; `reduction` its flat damage reduction by damage type, `group` the name under which only the
 * strongest reduction of a type counts; `owner` the unit its errors are recorded for.
 * @typedef {{ onTick?: Function, onExpire?: Function, onRemove?: Function, injury?: Function, observeInjury?: Function,
 *   reduction?: Record<string, number>, group: string, owner?: ShUnit | null, dt: number }} Hooks
 */

/** The behaviour key of every kit buff with callbacks. */
export const KIT_BUFF = 'compat:kit';

/** The battle of each world that has kits (kits.js). @type {WeakMap<World, ShBattle>} */
export const worldBattles = new WeakMap();

/** A spec's flat reductions above 0 by damage type, or undefined for none. @param {unknown} r */
function reductionOf(r) {
  if (!r || typeof r !== 'object') return undefined;
  const out = Object.fromEntries(Object.entries(r).filter(([, v]) => Number.isFinite(v) && Number(v) > 0).map(([k, v]) => [k, Number(v)]));
  return Object.keys(out).length ? out : undefined;
}

/**
 * A buff spec's callbacks and its trigger in whole frames (at least 1; every frame without an interval; 0 without
 * `onTick`), or null when it has none.
 * Errors of its callbacks are recorded for the unit that gave it (`source`).
 * @param {Record<string, any>} spec @returns {{ every: number, hooks: Hooks } | null}
 */
export function hooksOf(spec) {
  const fn = (/** @type {unknown} */ f) => (typeof f === 'function' ? f : undefined);
  const onTick = fn(spec.onTick), onExpire = fn(spec.onExpire), onRemove = fn(spec.onRemove), s = Number(spec.interval);
  const injury = fn(spec.injury), observeInjury = fn(spec.observeInjury), reduction = reductionOf(spec.damageReduction);
  if (!onTick && !onExpire && !onRemove && !injury && !observeInjury && !reduction) return null;
  const timed = s > 0 && Number.isFinite(s);
  return { every: onTick ? (timed ? Math.max(1, secondsToFrames(s)) : 1) : 0,
    hooks: { onTick, onExpire, onRemove, injury, observeInjury, reduction, group: String(spec.reductionGroup ?? spec.key), owner: spec.source ?? null, dt: timed ? s : 1 / FPS } };
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

/**
 * Whether this buff's reduction of a type is the one that counts on the unit (PRTS 伤害减免: same-named ones take the
 * highest, differently named ones stack): of the kit buffs with a reduction of the type under its name, the strongest,
 * the first in 伤判 order on a tie, as Stronghold picks it.
 * @param {ShBattle} battle @param {Unit} u @param {Buff} b @param {Hooks} hooks @param {string} type
 */
function counts(battle, u, b, hooks, type) {
  const v = hooks.reduction?.[type] ?? 0;
  if (!(v > 0)) return false;
  let earlier = true;
  for (const { x } of u.buffs.map((x, i) => ({ x, i })).sort((p, q) => q.x.prio - p.x.prio || p.i - q.i)) {
    if (x === b) { earlier = false; continue; }
    const h = battle.buffHooks.get(x), w = h?.group === hooks.group ? h.reduction?.[type] ?? 0 : 0;
    if (earlier ? w >= v : w > v) return false;
  }
  return true;
}

/**
 * The hit as Stronghold's 伤判 context gives it: the source (none for a 无来源 hit, 伤害-7), the credit, the damage info
 * (the engine's own, ADR 0012), the target and the buff.
 * @param {ShBattle} battle @param {Unit} u @param {Buff} b @param {TakeHit} hit
 */
function contextOf(battle, u, b, hit) {
  const dmg = /** @type {Record<string, any>} */ (hit.dmg), sh = (/** @type {Unit | null} */ x) => (x ? battle.unitOf(x) : null);
  return { source: dmg.sourceless ? null : sh(hit.src), credit: sh(hit.credit), dmg, battle, target: battle.unitOf(u), buff: battle.buffOf(u, b), type: dmg.type };
}

/**
 * A kit buff's turn in the 伤判 with damage left (伤害-8, `take`): its flat reduction when it is the one that counts,
 * then `injury` — which may change the amount, dodge (`dodge(p)`) or block (`block(p)`) the hit, or defer a callback —,
 * then `observeInjury` with what is left. A dodge that cancels is the engine's dodge (its event and tracker); a draw is
 * from the battle's random numbers, as Stronghold's. Deferred callbacks run at the end of the buff's turn.
 * @param {ShBattle} battle @param {Unit} u @param {Buff} b @param {number} amount @param {TakeHit} hit @returns {number}
 */
function injure(battle, u, b, amount, hit) {
  const hooks = /** @type {Hooks} */ (battle.buffHooks.get(b)), ctx = contextOf(battle, u, b, hit), dmg = ctx.dmg;
  const owner = hooks.owner ?? ctx.target, after = /** @type {Function[]} */ ([]);
  let rest = amount, cancelled = false, outcome = /** @type {string | null} */ (null);
  if (counts(battle, u, b, hooks, ctx.type)) rest = Math.max(0, rest - /** @type {number} */ (hooks.reduction?.[ctx.type]));
  const succeeds = (/** @type {unknown} */ p) => p === undefined || (Number.isFinite(p) && Number(p) > 0 && battle.rng() < Math.min(1, Number(p)));
  const dodge = (/** @type {unknown} */ p) => {
    if (cancelled || !(rest > 0) || dmg.canDodge === false || !succeeds(p)) return false;
    // 无视闪避 (伤害-12): drawn, but it cancels nothing
    if (damage.dodgeProof(/** @type {any} */ (dmg), hit.src)) return true;
    cancelled = true; rest = 0; outcome = 'dodged';
    damage.dodged(battle.w, u, hit.src, /** @type {any} */ (dmg));
    return true;
  };
  const block = (/** @type {unknown} */ p) => {
    if (cancelled || !(rest > 0) || !succeeds(p)) return false;
    if (Array.isArray(dmg.ignoreCancelReasons) && dmg.ignoreCancelReasons.includes('block')) return true;
    cancelled = true; rest = 0; outcome = 'blocked';
    return true;
  };
  if (rest > 0 && hooks.injury) {
    const injury = hooks.injury, event = { ...ctx, amount: rest, dodge, block, defer: (/** @type {unknown} */ f) => { if (typeof f === 'function') after.push(f); } };
    battle.safe(() => injury(event), 'buff.injury', owner);
    rest = cancelled ? 0 : Number.isFinite(event.amount) ? Math.max(0, event.amount) : 0;
  }
  if (!(rest > 0) && outcome === null) outcome = 'zero';
  observe(battle, hooks, { ...ctx, amount: rest, cancelled, outcome }, owner);
  for (const f of after) battle.safe(() => f(), 'buff.injury', owner);
  return rest;
}

/** `observeInjury` with a copy of the hit's values: what it writes changes nothing. @param {ShBattle} battle @param {Hooks} hooks @param {Record<string, any>} event @param {ShUnit} owner */
function observe(battle, hooks, event, owner) {
  const fn = hooks.observeInjury;
  if (fn) battle.safe(() => fn(event), 'buff.observeInjury', owner);
}

/** The behaviour of KIT_BUFF (状态-1): its trigger runs `onTick`, its expiry `onExpire`, its 伤判 turn the 伤判 callbacks. @type {Readonly<import('@aue/sim').buffs.Behavior>} */
export const KIT_BUFF_BEHAVIOR = Object.freeze({
  /** @param {World} w @param {Unit} u @param {Buff} b */
  tick(w, u, b) { const battle = worldBattles.get(w); if (battle) runHook(battle, u, b, 'onTick'); },
  /** @param {World} w @param {Unit} u @param {Buff} b */
  expire(w, u, b) { const battle = worldBattles.get(w); if (battle) runHook(battle, u, b, 'onExpire'); },
  /** @param {World} w @param {Unit} u @param {Buff} b @param {number} amount @param {TakeHit} hit */
  take(w, u, b, amount, hit) {
    const battle = worldBattles.get(w);
    return battle?.buffHooks.has(b) ? injure(battle, u, b, amount, hit) : amount;
  },
  /** An earlier effect cancelled the hit: `observeInjury` still sees it, with nothing left. @param {World} w @param {Unit} u @param {Buff} b @param {TakeHit} hit */
  afterCancel(w, u, b, hit) {
    const battle = worldBattles.get(w), hooks = battle?.buffHooks.get(b);
    if (!battle || !hooks?.observeInjury) return;
    const ctx = contextOf(battle, u, b, hit);
    observe(battle, hooks, { ...ctx, amount: 0, cancelled: true, outcome: ctx.dmg.dodged ? 'dodged' : 'blocked' }, hooks.owner ?? ctx.target);
  },
  /** The engine dropped it as a used-up shield: Stronghold's removal calls `onRemove` then too. @param {World} w @param {Unit} u @param {Buff} b */
  spent(w, u, b) { const battle = worldBattles.get(w); if (battle) runHook(battle, u, b, 'onRemove'); },
});

