// 深池逐火's `aura` (docs/spec/foes.md 敌能-159). The burn and the guard's damage reduction both need a 燃烧的芦苇丛
// within `range_radius`. This engine has no such device, so the shape is covered and does nothing (敌能-116, 敌能-154).
// This file only tells this family's blackboards from the other `aura` shapes; the one `aura` object is unchanged.

/** 深池逐火战士 / 深池逐火精锐战士 (敌能-159). */
const WARRIOR = Object.freeze(['ep_damage_ratio', 'range_radius']);
/** 深池逐火护卫 / 深池逐火精锐护卫 (敌能-159): the warriors' keys plus `damage_resistance`. */
const GUARD = Object.freeze(['damage_resistance', 'ep_damage_ratio', 'range_radius']);

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys @returns {boolean} */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** The two warriors (敌能-159). @param {Record<string, unknown>} bb @returns {boolean} */
const duskWarrior = (bb) => exact(bb, WARRIOR);

/** The two guards (敌能-159). @param {Record<string, unknown>} bb @returns {boolean} */
const duskGuard = (bb) => exact(bb, GUARD);

/** Either of this family's shapes (敌能-159). @param {Record<string, unknown>} bb @returns {boolean} */
export const duskAura = (bb) => duskWarrior(bb) || duskGuard(bb);
