// Stands in for Stronghold's server/sim/professions.js (兼容-2): the names its operator kits import.

/** How long (seconds) the 生命回复速度 a bard's trait gives lasts unless refreshed: it lapses within this once the bard stops (兼容-4). */
export const BARD_REGEN_DUR = 0.5;

/**
 * A bard's regeneration on one ally, as Stronghold's kits give it (兼容-4, 兼容-5): a buff that adds `value` to the ally's
 * 生命回复速度 for `duration` seconds, one for each bard — a second give of the same bard replaces it, those of two bards
 * add up. No heal: it is the ally's own regeneration, so 禁疗 does not stop it. The event `bardRegen` ({ unit: the bard,
 * target, value }) lets a handler change this ally's share; a share that is not above 0 gives nothing.
 * @param {any} battle @param {any} bard @param {any} ally @param {number} value @param {number} [duration]
 */
export function bardRegen(battle, bard, ally, value, duration = BARD_REGEN_DUR) {
  if (!bard || !ally || !ally.alive || !(value > 0)) return;
  let v = value;
  if (battle.hasHook('bardRegen')) {
    const given = Number(battle.emit('bardRegen', { unit: bard, target: ally, value: v }).value);
    v = Number.isFinite(given) ? given : 0;
  }
  if (v > 0) battle.addBuff(ally, { key: `trait:bard:${bard.id}`, duration, source: bard, mods: { hpRegen: v } });
}
