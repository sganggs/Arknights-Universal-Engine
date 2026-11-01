// “墓碑” (docs/spec/foes.md 敌能-139). Unblocked, its attack is the page's ranged attack: talent `atkdown`'s
// `atk_scale` on the target and the 3×3 around it. 刷新护盾 (`refreshshield`) takes the place of an attack and sets its
// 屏障 to its max HP × `hp_ratio`. The page's map-wide halving is a map effect, not this enemy's ability, and is not
// here. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** The 屏障's buff key (敌能-139). Only this family gives it, so dropping the key drops nobody else's buff. */
const BARRIER = 'tombBarrier';

/** A finite number above 0. A text value from the data, 0 or NaN is not one. @param {unknown} v */
const positive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** 墓碑's ranged attack (敌能-139): the data's `atk_scale` and the page's `square` 1, nothing else. @param {Record<string, unknown>} bb */
export const tombRanged = (bb) => Object.keys(bb).length === 2 && positive(bb.atk_scale) && bb.square === 1;

/** 刷新护盾 (敌能-139): `hp_ratio` alone. @param {Record<string, unknown>} bb */
export const tombShield = (bb) => Object.keys(bb).length === 1 && positive(bb.hp_ratio);

/**
 * Whether a blackboard of this family's names is the shape it understands (关卡-2). Any other name passes.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function tombOwns(name, bb) {
  if (name === 'atkdown') return tombRanged(bb);
  if (name === 'refreshshield') return tombShield(bb);
  return true;
}

/**
 * 墓碑's attack (敌能-139). Blocked, the ordinary hit on its blocker (敌人攻击-1, INF-0862). Unblocked, the ranged
 * attack: the main target and the units on its 3×3 take the current ATK × `atk_scale` (敌能-26, INF-0860) as the swing
 * lands, since applyWay ALL fires no projectile (INF-0861). No filter for 「不会攻击飞行单位」: an enemy's choice already
 * leaves air units out unless one blocks it (索敌-2, 敌人攻击-1). A talent, so silence does not stop it.
 * @type {FoeBehavior}
 */
const atkdown = Object.freeze({
  attack: (ctx, mods) => (ctx.blocked || !tombRanged(ctx.bb) ? mods : { ...mods, scale: mods.scale * ctx.bb.atk_scale, square: true, splashScale: 1 }),
});

/**
 * 刷新护盾 (敌能-139): ready and not silenced, it is released in place of the attack it can start now, so whatever
 * stops that attack (no target, the interval, 缴械, 恐惧, 战栗 while blocked) also holds the release, and so does an
 * attack a skill listed before it already took (INF-0864). The attack deals nothing and splashes nothing; its interval
 * is spent. The 屏障 is max HP × `hp_ratio` in place of what is left, a new buff (INF-0865). The cooldown starts again
 * once the barrier is set (INF-0866).
 * @type {FoeBehavior}
 */
const refreshshield = Object.freeze({
  attack: (ctx, mods) => {
    if (mods.skill || !ctx.ready || !tombShield(ctx.bb) || ctx.stats(ctx.self).flags.silence) return mods;
    const amount = ctx.stats(ctx.self).maxHp * ctx.bb.hp_ratio;
    if (!(amount > 0)) return mods;
    ctx.removeBuff(ctx.self, BARRIER);
    ctx.addBuff(ctx.self, { key: BARRIER, shield: amount });
    ctx.use();
    return { ...mods, skill: true, times: 0, direct: true, square: false };
  },
});

/** The behaviours of this file, by talent and skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const tombBehaviors = Object.freeze({ atkdown, refreshshield });
