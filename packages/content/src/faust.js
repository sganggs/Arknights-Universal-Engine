// 浮士德 and 锈锤战士 (docs/spec/foes.md 敌能-79): invincible on appearance, 致命一击 in place of an attack when a
// ground unit of ours is in range, and 浮士德's 召唤弩炮 from the level's preset ballistae. They act only through the
// context (ADR 0055).

import { constants } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').skills.AttackMods} AttackMods */

/** 出场无敌 (敌能-79). Separate from 重生's `reborn:invincible`. */
const APPEAR = 'appear:invincible';
/** 不可阻挡 and 沉睡免疫, which do not end with the 无敌 (敌能-79). */
const BODY = 'faust:body';

/**
 * Whether this family's talent is the one the pages were read for (关卡-2). 「寒灾」 has `duration` and no `page`.
 * @param {Record<string, unknown>} bb
 */
const pageRead = (bb) => bb.page === 1 && typeof bb.duration === 'number';

/**
 * 出场时获得 duration 秒无敌 (敌能-79): untargetable as well as immune to damage, from the appearance frame.
 * The spawn buff is decremented on that frame (状态-3), so the frames left are one more than the duration.
 * 不可阻挡 and 沉睡免疫 stay for good. Without `page`, nothing — 「寒灾」 is not this.
 * @type {FoeBehavior}
 */
const invincible = Object.freeze({
  spawn: (ctx) => {
    if (!pageRead(/** @type {Record<string, unknown>} */ (ctx.bb))) return;
    const self = ctx.self;
    ctx.addBuff(self, { key: BODY, flags: { unblockable: true, 'immune:sleep': true } });
    ctx.addBuff(self, { key: APPEAR, flags: { invincible: true, untargetable: true }, left: ctx.frames(ctx.bb.duration) + 1 });
  },
});

/** A skill the header says can be silenced (敌能-79). Immunity means the flag never takes effect. @param {FoeContext} ctx */
const silenced = (ctx) => !!ctx.stats(ctx.self).flags.silence;

/**
 * A non-flying unit of ours inside the attack reach (敌人攻击-1: radius + 0.25). An out-of-range blocker is not one.
 * 起飞 is not flying, so it does not count as a flyer here; the attack itself still will not lock it (阻挡-2).
 * @param {FoeContext} ctx
 */
function groundInReach(ctx) {
  const reach = ctx.self.base.rangeRadius + constants.ALLY_COLLIDER_RADIUS;
  return ctx.foes(reach).some((u) => !ctx.stats(u).flying);
}

/**
 * 致命一击 (敌能-79): this attack, once the cooldown is ready and a ground unit of ours is in range. It replaces the
 * normal hit. `arts` 1 is 法术, 0 is 物理. The target is whoever the attack already locked (索敌-5).
 * @type {FoeBehavior}
 */
const CriticalHit = Object.freeze({
  attack: (ctx, mods) => {
    const scale = ctx.bb.atk_scale, arts = ctx.bb.arts;
    if (!ctx.ready || silenced(ctx) || typeof scale !== 'number' || (arts !== 0 && arts !== 1) || !groundInReach(ctx)) return mods;
    ctx.use();
    return { ...mods, skill: true, scale: mods.scale * scale, type: arts === 1 ? 'arts' : 'phys' };
  },
});

/** The branch a 召唤弩炮 names (敌能-79). A string blackboard; absent or empty does not cast. @param {Record<string, number>} bb */
function branchOf(bb) {
  const id = /** @type {Record<string, unknown>} */ (bb).branch_id;
  return typeof id === 'string' ? id : '';
}

/**
 * 召唤弩炮 (敌能-79): one unsummoned plain SPAWN of `branch_id`, at that entry's own route start. It takes the attack
 * (no hit, no projectile) unless an earlier skill already did. Nothing left to summon: the attack stays ordinary and
 * the cooldown is not started again.
 * @type {FoeBehavior}
 */
const SummonBallis = Object.freeze({
  attack: (ctx, mods) => {
    const id = branchOf(ctx.bb);
    if (!id || mods.skill || !ctx.ready || silenced(ctx)) return mods;
    if (!ctx.summonNext(id)) return mods;
    ctx.use();
    return { ...mods, skill: true, times: 0, direct: true };
  },
});

/**
 * Whether a blackboard is this family's (敌能-79, 关卡-2). Any other name is not our concern.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function faustOwns(name, bb) {
  if (name === 'invincible') return pageRead(bb);
  if (name === 'CriticalHit') return typeof bb.atk_scale === 'number' && (bb.arts === 0 || bb.arts === 1);
  if (name === 'SummonBallis') return branchOf(/** @type {Record<string, number>} */ (bb)).length > 0;
  return true;
}

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const faustBehaviors = Object.freeze({ invincible, CriticalHit, SummonBallis });
