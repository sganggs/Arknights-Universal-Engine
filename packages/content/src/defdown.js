// 碎骨's grenade (docs/spec/foes.md 敌能-70). The talent name `defdown` is also a flat DEF on other
// enemies (def −10 / −15). Only the ratio, plus the page's scale, square and duration, is this grenade;
// any other shape stays uncovered (关卡-2) and does not change the attack.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** Keys a 碎骨 grenade blackboard may hold. `scale`, `duration` and `square` are content extras. */
const GRENADE_KEYS = new Set(['def', 'scale', 'duration', 'square']);

/**
 * 碎骨's grenade blackboard (敌能-70): a DEF ratio in (−1, 0), not a flat −10 / −15, and the page's
 * scale, 3×3 and duration. An extra key is a different ability that shares the name.
 * @param {Record<string, unknown>} bb
 */
function grenadeShape(bb) {
  const { def, scale, duration, square } = bb;
  if (typeof def !== 'number' || !(def > -1 && def < 0)) return false;
  if (typeof scale !== 'number' || !(scale > 0)) return false;
  if (typeof duration !== 'number' || !(duration > 0)) return false;
  if (square !== 1) return false;
  for (const k of Object.keys(bb)) if (!GRENADE_KEYS.has(k)) return false;
  return true;
}

/**
 * Whether a `defdown` blackboard is this grenade (敌能-70). Any other name is not this family's concern.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function defdownOwns(name, bb) {
  return name !== 'defdown' || grenadeShape(bb);
}

/**
 * The grenade (敌能-70). Blocked, it is the ordinary hit (敌人攻击-1): no square, no DEF loss. Unblocked,
 * it is that attack at `scale`, on the target's 3×3 (敌能-26), and a `defPct` for `duration` seconds on
 * whoever the hit leaves standing (技能-9's `hitDebuff`, 推断 INF-0507). Not silenced: the page does not
 * say 可被沉默. Not a projectile: applyWay is ALL, so the square lands with the swing (推断 INF-0506).
 * @type {FoeBehavior}
 */
const defdown = Object.freeze({
  attack: (ctx, mods) => {
    const bb = ctx.bb;
    if (ctx.blocked || !grenadeShape(bb)) return mods;
    return {
      ...mods, scale: mods.scale * /** @type {number} */ (bb.scale), square: true, splashScale: 1,
      hitDebuff: { seconds: /** @type {number} */ (bb.duration), mods: { defPct: /** @type {number} */ (bb.def) } },
    };
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const defdownBehaviors = Object.freeze({ defdown });
