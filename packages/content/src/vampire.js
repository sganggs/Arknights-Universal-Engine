// 吸血 (docs/spec/foes.md 敌能-75): after a normal-attack hit deals damage, heal for a share of that
// amount. The hit hook already carries it (敌能-2); there is no bus listener. A page marker keeps an unread
// enemy with the same blackboard uncovered (关卡-2).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** Keys a read `vampire` blackboard may hold. `page` is the content marker, not enemy data. */
const KEYS = new Set(['heal_scale', 'attack@max_target', 'page']);

/**
 * The numbers this ability understands (敌能-75): `heal_scale`, optionally `attack@max_target`, optionally `page` 1.
 * Any other key is a different use of the name.
 * @param {Record<string, unknown>} bb
 */
function vampireShape(bb) {
  if (typeof bb.heal_scale !== 'number') return false;
  const n = bb['attack@max_target'];
  if (n !== undefined && typeof n !== 'number') return false;
  if (bb.page !== undefined && bb.page !== 1) return false;
  for (const k of Object.keys(bb)) if (!KEYS.has(k)) return false;
  return true;
}

/** A read page (关卡-2): the marker is 1 and the blackboard is this ability. @param {Record<string, unknown>} bb */
const armed = (bb) => bb.page === 1 && vampireShape(bb);

/**
 * Whether a talent of this name, with this blackboard, is 吸血 (敌能-75). Any other name is not this family's concern.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function vampireOwns(name, bb) {
  if (name !== 'vampire') return true;
  return armed(bb);
}

/**
 * 吸血 (敌能-75). No marker, or a blackboard this is not, and nothing changes.
 * `attack@max_target` above 0 is how many this attack locks (敌能-27). The heal is 治疗 of `dealt` × `heal_scale` (伤害-11).
 * @type {FoeBehavior}
 */
const vampire = Object.freeze({
  attack: (ctx, mods) => {
    if (!armed(ctx.bb)) return mods;
    const n = ctx.bb['attack@max_target'];
    if (typeof n !== 'number' || !(n > 0)) return mods;
    return { ...mods, targets: n };
  },
  hit: (ctx, _target, dealt) => {
    if (!armed(ctx.bb) || !(dealt > 0)) return;
    ctx.heal(ctx.self, dealt * ctx.bb.heal_scale);
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const vampireBehaviors = Object.freeze({ vampire });
