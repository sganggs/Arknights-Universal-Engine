// Abilities whose counterpart the engine's levels do not have (docs/spec/foes.md 敌能-116): 集团军盾卫's `ExtraPower` acts
// under a 指挥官指令, and “家族专用轿车”'s `DeathRattle` brings in 家族士兵, whom the level's data does not carry. Each is
// covered in its shape and does nothing.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** Whether a behaviour of this name is this file's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function absentOwns(name, bb) {
  if (name === 'ExtraPower') return Object.keys(bb).length === 1 && typeof bb.damage_resistance === 'number';
  if (name === 'DeathRattle') return Object.keys(bb).length === 1 && typeof bb['attack@cnt'] === 'number';
  return true;
}

/** The behaviours of this file, by name. @type {Readonly<Record<string, FoeBehavior>>} */
export const absentBehaviors = Object.freeze({ ExtraPower: Object.freeze({}), DeathRattle: Object.freeze({}) });
