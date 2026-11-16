// Stronghold's barriers and shield layers on a kit's buff (docs/spec/compat.md 兼容-4) as the engine's (伤害-8): the
// barrier (`shield`), the 护盾 layers (`shieldHits`) and the damage types they absorb (`shieldType`: a type, a list of
// them, or none for every type) go onto the engine's buff. Two rules of Stronghold's buffs are kept: a spent one whose
// spec gave modifiers or flags stays (its damage.js absorbShields removes only a buff with neither), and `extend` raises
// the barrier and layers of the buff it merges into (its battle/status.js addBuff).
import { damage } from '@aue/sim';
import { modsOf, flagsOf } from './mods.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').Buff} Buff */

/** The damage types a shield may name: the engine's (types.js DamageType), the same names as Stronghold's HP damage. */
const DAMAGE_TYPES = Object.freeze(['phys', 'arts', 'true', 'elemental']);

/**
 * The type of a shield that names no damage type. It absorbs nothing, as in Stronghold: a named type absorbs only that
 * type (伤害-8), and no damage has this one.
 */
const NO_TYPE = 'none';

/**
 * The flag that keeps a spent kit shield whose spec gave modifiers or flags, even empty ones (林's 琉璃璧 `mods: {}`):
 * Stronghold keeps such a buff, and a buff with a flag is more than a shield to the engine (伤害-8). It changes nothing
 * else.
 */
export const SHIELD_KEEP = 'kitShieldKeep';

/**
 * Stronghold's `shieldType` as the engine's (伤害-8): none is every type (""); a damage type, or a list of them, is just
 * those, joined with "+"; names that are no damage type count for nothing, and with no damage type it absorbs nothing.
 * @param {unknown} t @returns {string}
 */
export function shieldTypeOf(t) {
  if (!t) return '';
  const named = Array.isArray(t) ? t : [t];
  const types = DAMAGE_TYPES.filter((x) => named.includes(x));
  return types.length ? types.join('+') : NO_TYPE;
}

/**
 * The shield fields of a kit's buff spec on the engine's buff (兼容-4), none for a spec without a barrier, layers or a
 * type: the barrier (`shield`, else its modifiers' `shield`, as Stronghold reads it; at least 0), the layers (whole,
 * part of one counting as one: Stronghold's last layer still negates a hit while above 0) and their type. When the spec
 * gave modifiers or flags but none of them reach the engine's buff, the fields also carry flags holding SHIELD_KEEP
 * alone: placed after the buff's own (then none), they take their place.
 * @param {Record<string, any>} spec @returns {Partial<Buff>}
 */
export function shieldOf(spec) {
  const shield = Math.max(0, Number(spec.shield ?? spec.mods?.shield) || 0);
  const shieldHits = Math.max(0, Math.ceil(Number(spec.shieldHits) || 0));
  if (!(shield > 0) && !(shieldHits > 0) && !spec.shieldType) return {};
  const fields = { shield, shieldHits, shieldType: shieldTypeOf(spec.shieldType) };
  const given = spec.mods != null || spec.flags != null;
  if (!given || Object.keys(modsOf(spec.mods)).length > 0 || Object.keys(flagsOf(spec.flags)).length > 0) return fields;
  return { ...fields, flags: { [SHIELD_KEEP]: true } };
}

/**
 * Stronghold's `extend` merging into the buff of the key there was: that buff's barrier and layers rise to the new
 * one's where those are higher. The engine's merge (状态-2) keeps the old buff's own, as Stronghold's `stack` does.
 * @param {Unit} u @param {Buff} kept the buff the engine's addBuff returned @param {Buff} given the buff given to it
 * @param {unknown} refresh the spec's refresh rule
 */
export function raiseMerged(u, kept, given, refresh) {
  if (refresh !== 'extend' || kept === given) return;
  if (given.shield > kept.shield) damage.setShield(u, kept, given.shield);
  if (given.shieldHits > kept.shieldHits) damage.setShieldHits(u, kept, given.shieldHits);
}
