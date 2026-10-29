// 闪避 (docs/spec/foes.md 敌能-94): “飞鞋党”佣兵's `PhysicalEvade` and 裹骸死士's `Evade`, each `{ prob }` alone — from
// its spawn a lasting physical dodge of `prob`, and for `Evade` an arts dodge of `prob` too (伤害-8). 稳固锁链, which
// ends it on both pages, is not in the engine (敌能-88). It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** The buff of the dodge (敌能-94). */
const EVADE = 'evade';

/** Whether a blackboard is `{ prob }` alone (敌能-94). @param {Record<string, unknown>} bb */
const probShape = (bb) => Object.keys(bb).length === 1 && typeof bb.prob === 'number';

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export const evadeOwns = (name, bb) => (name !== 'PhysicalEvade' && name !== 'Evade') || probShape(bb);

/** The dodge from spawn (敌能-94): physical, and arts as well for `Evade`. @param {boolean} arts @returns {FoeBehavior} */
const evade = (arts) => Object.freeze({
  spawn: (ctx) => {
    if (!probShape(ctx.bb)) return;
    const p = ctx.bb.prob;
    ctx.addBuff(ctx.self, { key: EVADE, mods: { dodgePhys: p, ...(arts ? { dodgeArts: p } : {}) } });
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const evadeBehaviors = Object.freeze({ PhysicalEvade: evade(false), Evade: evade(true) });
