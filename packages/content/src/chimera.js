// 孽罪奇美拉 / 渎罪奇美拉 (docs/spec/foes.md 敌能-162). Their talents OrigAura and AtkBoost are the 污染模式 the pages
// give once 源石污染区 or 活性源石风暴 affected them; neither is an engine object, so the mode is never entered and the
// names are covered with no effect (敌能-116, INF-1230). triggerAnim has no page text and does nothing (as 敌能-45's
// BornAnim). No other enemy uses these names.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** The data's blackboards (敌能-162): OrigAura's two numbers, AtkBoost's one, triggerAnim's none. @type {Readonly<Record<string, readonly string[]>>} */
const SHAPES = Object.freeze({ OrigAura: ['damage', 'sp_recover_ratio'], AtkBoost: ['atk'], triggerAnim: [] });

/** Exactly these keys, each a number (关卡-2). @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const shaped = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/**
 * Whether OrigAura, AtkBoost or triggerAnim has the data's blackboard (关卡-2, 敌能-162); a different one stays
 * uncovered. Other names pass.
 * @param {string} name @param {Record<string, unknown>} bb @returns {boolean}
 */
export function chimeraOwns(name, bb) {
  return Object.hasOwn(SHAPES, name) ? shaped(bb, SHAPES[name]) : true;
}

/** Covered, doing nothing (敌能-162). @type {Readonly<Record<string, FoeBehavior>>} */
export const chimeraBehaviors = Object.freeze({ OrigAura: Object.freeze({}), AtkBoost: Object.freeze({}), triggerAnim: Object.freeze({}) });
