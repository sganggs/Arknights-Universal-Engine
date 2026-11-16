// Abilities whose counterpart the engine's levels do not have (docs/spec/foes.md 敌能-116): 集团军盾卫's `ExtraPower` acts
// under a 指挥官指令, and “家族专用轿车”'s `DeathRattle` brings in 家族士兵, whom the level's data does not carry. Each is
// covered in its shape and does nothing. `DeathRattle` has a second shape that does act: the boats' `enemy_key`, whose
// crew goes on fighting (敌能-133, boats.js).

import { boatShape, boatDeath } from './boats.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** “家族专用轿车”'s `DeathRattle` (敌能-116): `attack@cnt` alone, whole without page values. @param {Record<string, unknown>} bb */
export const sedanShape = (bb) => Object.keys(bb).length === 1 && typeof bb['attack@cnt'] === 'number';

/** Whether a behaviour of this name is this file's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function absentOwns(name, bb) {
  if (name === 'ExtraPower') return Object.keys(bb).length === 1 && typeof bb.damage_resistance === 'number';
  if (name === 'DeathRattle') return sedanShape(bb) || boatShape(bb);
  return true;
}

/** The behaviours of this file, by name: the sedan's `DeathRattle` does nothing, the boats' brings their crew (敌能-133). @type {Readonly<Record<string, FoeBehavior>>} */
export const absentBehaviors = Object.freeze({ ExtraPower: Object.freeze({}), DeathRattle: Object.freeze({ death: boatDeath }) });
