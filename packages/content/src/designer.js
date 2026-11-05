// 心虚设计师 / 顺从内心的设计师 (docs/spec/foes.md 敌能-132): physical and arts damage from the front × (1 −
// `damage_resistance`). It is 敌能-118's front on the same buff, so the 伤判 judges the side by columns and the facing is
// 敌能-90's. The talent is the lowercase `weakness`; FOE_EXTRAS adds the pages' `front: 1`. The pages' turn toward the
// light of a 摄影区域 is left out: no level of the engine has one (敌能-65). Their `block` is in radio.js, the capitalised
// `Weakness` in bristle.js.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * `weakness` counts only as the two read pages give it: a numeric `damage_resistance` and `front: 1`, nothing more
 * (敌能-132). Without the marker it is the bare data, read on no page. Another name is not this check's.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function designerOwns(name, bb) {
  if (name !== 'weakness') return true;
  return typeof bb.damage_resistance === 'number' && bb.front === 1 && Object.keys(bb).length === 2;
}

/**
 * `weakness` (敌能-132): the buff from its spawn until it leaves; no status takes it off (INF-0790). A shape
 * `designerOwns` refuses adds nothing.
 * @type {FoeBehavior}
 */
const weakness = Object.freeze({
  spawn: (ctx) => {
    if (!designerOwns('weakness', ctx.bb)) return;
    ctx.addBuff(ctx.self, { key: 'weakness', mods: { frontTakenMul: 1 - ctx.bb.damage_resistance } });
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const designerBehaviors = Object.freeze({ weakness });
