// 箭棘兽 (docs/spec/foes.md 敌能-91): its weak point is its front — physical and arts damage from behind it × (1 −
// `damage_resistance`) (`Weakness`) —, and each pass of its 已损失生命值判定 (敌能-89) sprays quills over the half disc
// behind it (`QuillSpray`). 硬甲爪兽, 刚甲爪兽 and 棘兽 share that back (敌能-118); 岩冠兽 and 坚岩冠兽 take the same off
// the front. Front and back are columns (敌能-90). `WeaknessUI` is the page's mark of it.
import { lostLifePassed } from './lostlife.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * `Weakness` counts only with a numeric `damage_resistance` and exactly one of `back: 1` / `front: 1` (敌能-118).
 * Another name is not this check's. Two markers, or any further key, stays uncovered.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function weaknessOwns(name, bb) {
  if (name !== 'Weakness') return true;
  if (typeof bb.damage_resistance !== 'number' || Object.keys(bb).length !== 2) return false;
  const back = bb.back === 1, ahead = bb.front === 1;
  return back !== ahead;
}

/**
 * `Weakness` (敌能-91, 敌能-118): from its spawn, physical and arts damage × (1 − `damage_resistance`) from behind
 * (`back: 1`) or from the front (`front: 1`). The shape check allows one of the two; `back` is the one 敌能-91 already
 * applied.
 * @type {FoeBehavior}
 */
const Weakness = Object.freeze({
  spawn: (ctx) => {
    const bb = ctx.bb, mul = 1 - bb.damage_resistance;
    if (bb.back === 1) ctx.addBuff(ctx.self, { key: 'weakness', mods: { backTakenMul: mul } });
    else if (bb.front === 1) ctx.addBuff(ctx.self, { key: 'weakness', mods: { frontTakenMul: mul } });
  },
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
