// 箭棘兽 (docs/spec/foes.md 敌能-91): its weak point is its front — physical and arts damage from behind it × (1 −
// `damage_resistance`) (`Weakness`) —, and each pass of its 已损失生命值判定 (敌能-89) sprays quills over the half disc
// behind it (`QuillSpray`). Front and back are its left or right (敌能-90). `WeaknessUI` is the page's mark of it.
import { lostLifePassed } from './lostlife.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * `Weakness` (敌能-91): from its spawn, a buff of damage from behind × (1 − `damage_resistance`) — on an enemy whose page
 * says the weak point is its front (the content's `back`); the other users of the name stay uncovered.
 * @type {FoeBehavior}
 */
const Weakness = Object.freeze({
  spawn: (ctx) => { if (ctx.bb.back === 1) ctx.addBuff(ctx.self, { key: 'weakness', mods: { backTakenMul: 1 - ctx.bb.damage_resistance } }); },
});

/**
 * `QuillSpray` (敌能-91): after each turn it was hurt, the 已损失生命值判定 at `hp_ratio`; passed, every unit of ours
 * within `range_radius` behind it takes 攻击力 × `atk_scale` physical damage.
 * @type {FoeBehavior}
 */
const QuillSpray = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb;
    if (!ctx.hurt || !lostLifePassed(ctx, bb.hp_ratio)) return;
    const amount = ctx.stats(ctx.self).atk * bb.atk_scale;
    for (const u of ctx.foes(bb.range_radius).filter((t) => ctx.behind(t))) ctx.dealDamage(u, { type: 'phys', amount });
  },
});

/** The behaviours of this file; `WeaknessUI` shows the weak point and does nothing. @type {Readonly<Record<string, FoeBehavior>>} */
export const bristleBehaviors = Object.freeze({ Weakness, QuillSpray, WeaknessUI: Object.freeze({}) });
