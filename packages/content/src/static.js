// 静态刚体 enemies (docs/spec/foes.md 敌能-37, 位移-5): 御4, 寒霜 and the others whose page names it. The enemy tables
// have no field for it, and FOE_EXTRAS can only merge a blackboard, so content gives them a talent the data lacks — the
// same shape as PlaceFlag — whose spawn sets the flag. Their other abilities stay on the talents the data names.
/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * 静态刚体 (敌能-37): a lasting flag, from spawn. Not silence-scoped: the page does not call it a silenceable aura.
 * @type {FoeBehavior}
 */
const Static = Object.freeze({
  spawn: (ctx) => { ctx.addBuff(ctx.self, { key: 'static', flags: { staticBody: true } }); },
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const staticBehaviors = Object.freeze({ Static });
