// The Stronghold functions its pinned kits call that were gaps (docs/spec/compat.md 兼容-4), on the engine's own rules:
// the next jump of a 链愈师 heal chain (职业-11) and an attack now with a profile of the kit's (攻击-5); and the layers of
// a 麻痹 a kit gives (状态-8). The stand-in module sh/ai.js exports the first two.
import rangeTable from '../../data/ranges.json' with { type: 'json' };
import { attrs, bus, status, attackNow, healJump, healsThrough } from '@aue/sim';

/** @typedef {import('./battle.js').ShBattle} ShBattle @typedef {import('./unit.js').ShUnit} ShUnit @typedef {import('@aue/sim').Unit} Unit */

/** A 链愈师 heal chain's jumps: the 3 × 3 around the one healed last (range_table x-4; PRTS 链愈师「跳跃范围为x-4」, 职业-11). */
const X4 = /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)['x-4'];

/**
 * Whether the healer heals `a` through its refusal of allies' heals (伤害-13: the answer of its kit trait's
 * `healThrough`, Mon3tr on her 重构体, which the engine reads for the heal and the choice of targets alike).
 * @param {ShBattle} b @param {ShUnit} healer @param {ShUnit} a
 */
const healsA = (b, healer, a) => !!healer.u && healsThrough(b.w, b.c, healer.u, /** @type {Unit} */ (a.u));

/**
 * Stronghold's chainHealNext: the next unit of `healer`'s heal chain from `prev` — the engine's jump (职业-11: x-4
 * around prev's tile, on the field, full HP or not, the lowest 生命比例 at 0.001, then the latest deployed), none of
 * `seen` (the kits' ids). As a kit picks allies: never a 孤立 one; one that refuses allies' heals only when the healer
 * heals it through that (伤害-13, INF-1130); the healer itself either way (its own heal reaches it, 职业-9; Stronghold's
 * `a !== healer`). Null for none.
 * Neither this, the engine's own jump nor Stronghold's passes over an ally under 禁疗 (the heal then restores
 * nothing, 伤害-11) or under 隐匿 (only another side may not select it, 索敌-2). Stronghold's passes over its
 * `hidden` allies too; the engine makes only enemies disappear (路线-4, 敌能-16), and the jump takes operators only
 * — devices never, as Stronghold's.
 * @param {ShBattle} b @param {ShUnit | null} healer @param {ShUnit} prev @param {Set<number>} seen @returns {ShUnit | null}
 */
export function chainHealNext(b, healer, prev, seen) {
  if (!prev?.u || !healer) return null;
  const may = (/** @type {Unit} */ u) => {
    const a = b.unitOf(u), f = attrs.statsOf(u).flags;
    if (seen.has(a.id)) return false;
    if (a === healer) return true;
    return !f.isolated && (!f.noAllyHeal || healsA(b, healer, a));
  };
  const next = healJump(b.w, b.c, prev.u, new Set(), { cells: X4, may });
  return next ? b.unitOf(next) : null;
}

/** A profile's 倍率 (its `atkScale`, 1 without one). @param {Record<string, any> | null | undefined} p */
const atkScaleOf = (p) => (typeof p?.atkScale === 'number' && Number.isFinite(p.atkScale) && p.atkScale >= 0 ? p.atkScale : 1);

/**
 * Stronghold's performAttack: `unit` attacks the targets given now (攻击-5; `noAmmo` spends no ammo) — a heal of them
 * when the profile heals (its `heal`, with `dmgType` 'heal': Stronghold's test), whatever its attack is now. The 倍率 is
 * the profile's — `atkScale`, a heal's times its `healScale` — over its profile now (effectiveProfile). The rest of the
 * profile is its attack's now. Whether it attacked.
 * @param {ShBattle} b @param {ShUnit} unit @param {Record<string, any>} prof @param {ShUnit[]} targets @param {{ noAmmo?: boolean } | null} [opts]
 * @returns {boolean}
 */
export function performAttack(b, unit, prof, targets, opts = null) {
  if (!unit?.u || !unit.alive) return false;
  const heal = !!prof?.heal && prof.dmgType === 'heal', now = atkScaleOf(b.effectiveProfile(unit));
  const scale = (atkScaleOf(prof) * (heal && typeof prof.healScale === 'number' && Number.isFinite(prof.healScale) ? prof.healScale : 1)) / (now > 0 ? now : 1);
  const given = (targets ?? []).map((t) => t?.u).filter((u) => !!u);
  return attackNow(b.w, b.c, unit.u, /** @type {Unit[]} */ (given), { noAmmo: !!opts?.noAmmo, heal, scale });
}

/** 麻痹's cap of layers (状态-8). */
const PALSY_MAX = status.STATUS.palsy.maxStacks;

/**
 * The layers a kit's 麻痹 value gives (Stronghold's palsyBuff): a whole number, at least 1, at most the cap (状态-8); 1 for
 * none or no number.
 * @param {unknown} v @returns {number}
 */
export const palsyLayers = (v) => Math.max(1, Math.min(PALSY_MAX, Math.floor(typeof v === 'number' && Number.isFinite(v) ? v : 1)));

/**
 * A 麻痹 a kit gives (兼容-4): its value is its layers (palsyLayers), given at once and added to those there up to the
 * cap (状态-2, 状态-8). The `beforeStatus` event carries the value as the kit gave it, and the layers are what its
 * handlers leave — Stronghold makes its 麻痹 from the value after them. So `stacks` is a getter, and this relies on
 * status.inflict sending `beforeStatus` before it reads the options' `stacks` (it reads them as it makes the buff,
 * after the event): read first, the layers would be the kit's value from before the handlers. The getter reads this
 * application's own event, which a handler ahead of all others keeps (one sent from inside a handler comes later);
 * without a `beforeStatus` handler inflict sends none and the layers are the kit's value. The test「a handler's new
 * value gives the layers」(compat-kitstubs.test.js) fails if inflict reads them first. Whether it took hold.
 * @param {ShBattle} b @param {ShUnit} target @param {number | undefined} frames @param {{ source?: ShUnit | null, value?: number }} o
 * @returns {boolean}
 */
export function givePalsy(b, target, frames, o) {
  const w = b.w, u = /** @type {Unit} */ (target.u), ev = /** @type {{ k: Record<string, any> | null }} */ ({ k: null });
  // a getter, read as the engine makes the buff (these options are no unit's own `stacks`, ADR 0045)
  const opts = { frames, src: o.source?.u ?? null, value: o.value, get stacks() { return palsyLayers(ev.k ? ev.k.strength : o.value); } };
  if (!bus.hasHook(w, 'beforeStatus')) return status.inflict(w, u, 'palsy', opts) !== null;
  const first = bus.on(w, 'beforeStatus', (k) => { if (!ev.k && k.target === u) ev.k = k; }, { priority: Infinity });
  try {
    return status.inflict(w, u, 'palsy', opts) !== null;
  } finally {
    bus.off(w, first);
  }
}
