// 投矛的士兵 and 投矛的勇士 (docs/spec/foes.md 敌能-105): a ranged throw at first, not at flying units (the page's
// `noFly`); a throw dodged or missed gives it the 失手标记, and from then on it attacks only what blocks it; its skill
// `change` — never silenced — then turns it to its melee mode, which attacks only what blocks it. The data's `change` is
// empty; the page's `spear` marks it as this one. It acts only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** `change` with the page's marker alone (敌能-105). @param {Record<string, unknown>} bb */
const empty = (bb) => Object.keys(bb).length === 1 && bb.spear === 1;

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export const spearOwns = (name, bb) => name !== 'change' || empty(bb);

/**
 * 切换武器 (敌能-105): a hit of its normal attack that was dodged or missed gives the 失手标记; ready with it, the
 * skill turns it to its melee mode. With the mark, or in melee mode, only what blocks it is attacked.
 * @type {FoeBehavior}
 */
const change = Object.freeze({
  landed: (ctx, _t, how) => { if (empty(ctx.bb) && how.missed) ctx.state.set('miss', 1); },
  targets: (ctx, cands) => {
    if (!empty(ctx.bb) || ctx.state.get('miss') === 0) return cands;
    const b = ctx.blocker();
    return b ? cands.filter((u) => u.id === b.id) : [];
  },
  tick: (ctx) => {
    if (!empty(ctx.bb) || ctx.state.get('miss') === 0 || ctx.state.get('melee') === 1 || !ctx.ready || ctx.stats(ctx.self).disabled) return;
    ctx.use();
    ctx.state.set('melee', 1);
  },
});

/** The behaviours of this file, by name. @type {Readonly<Record<string, FoeBehavior>>} */
export const spearBehaviors = Object.freeze({ change });
