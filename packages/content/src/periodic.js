// Self true damage each second (docs/spec/foes.md 敌能-50). The clock counts this enemy's own turns, so it does not
// advance while the enemy is carried or not yet on the field. The hit is sourceless and credited to the enemy itself
// (伤害-7), like 敌能-42's 失衡持续伤害.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * 自身每秒受到 `damage` 点无来源真实伤害 (敌能-50). The turn it appears is not a tick; a non-positive `damage` is none.
 * @type {FoeBehavior}
 */
const periodic_damage = Object.freeze({
  tick: (ctx) => {
    const due = ctx.state.get('t');
    ctx.state.set('t', due + 1);
    if (due === 0 || due % ctx.frames(1) !== 0) return;
    const d = ctx.bb.damage;
    if (typeof d !== 'number' || d <= 0) return;
    ctx.dealDamage(ctx.self, { type: 'true', amount: d, sourceless: true });
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const periodicBehaviors = Object.freeze({ periodic_damage });
