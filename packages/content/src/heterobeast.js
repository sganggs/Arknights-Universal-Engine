// 异质裂兽 and 异质裂兽·α (docs/spec/foes.md 敌能-135): `M0Shield`. Their special 屏障 takes only 矿工游击队's physical
// damage and the engine's levels have none, so it is never spent and what lasts while it does lasts from the spawn on
// (INF-0820): taunt + 1, attack speed + `attack_speed`, 恐惧 and 沉睡 do not take hold, and physical and arts damage is
// × (1 − `damage_resistance`) — from any source, or none, since none is 矿工游击队. That is one buff of plain modifiers
// and flags (ADR 0054). Their `BlockMcreep` and `M1Start` stay 敌能-102's (heteroslime.js). It acts only through the
// context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** The 屏障's buff (敌能-135): a key of its own, so nothing else adds or removes it. */
const BARRIER = 'heteroBeastBarrier';
/** 嘲讽等级+1 while the 屏障 lasts: the pages' number, the data has none (敌能-135). */
const TAUNT = 1;
/** The shape the two pages were read for (敌能-135). “惘核”'s `M0Shield` has only the first two. */
const KEYS = Object.freeze(['init_shield_hp_ratio', 'damage_resistance', 'attack_speed']);

/** 异质裂兽's `M0Shield` (敌能-135): exactly these keys, each a number. @param {Record<string, unknown>} bb */
export const beastShield = (bb) => Object.keys(bb).length === KEYS.length && KEYS.every((k) => typeof bb[k] === 'number');

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export const heteroBeastOwns = (name, bb) => name !== 'M0Shield' || beastShield(bb);

/**
 * The 屏障 at the spawn (敌能-135). 恐惧 and 沉睡 still add their buffs; the immunity only keeps their flags from holding
 * (状态-7). The reduction is the buff's 伤判 multiplier (伤害-8): true and elemental damage keep theirs. The 屏障's own
 * amount (`init_shield_hp_ratio` of the maximum HP) would take only 矿工游击队's hits, so it is not a shield here. A
 * talent: silence does not stop it. Another shape (“惘核”'s) gets nothing.
 * @param {FoeContext} ctx
 */
function spawn(ctx) {
  const bb = ctx.bb;
  if (!beastShield(bb)) return;
  const keep = 1 - bb.damage_resistance;
  ctx.addBuff(ctx.self, {
    key: BARRIER, mods: { taunt: TAUNT, aspd: bb.attack_speed, physTakenMul: keep, artsTakenMul: keep },
    flags: { 'immune:fear': true, 'immune:sleep': true },
  });
}

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const heteroBeastBehaviors = Object.freeze({ M0Shield: Object.freeze({ spawn }) });
