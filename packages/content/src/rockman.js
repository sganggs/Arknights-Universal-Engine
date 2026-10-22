// 迷路的巨像's 眩晕击 (docs/spec/foes.md 敌能-83). `StunAttack` is shared with other blackboards; only the
// three-number shape this page marks with `page` throws. The others stay uncovered (关卡-2) and do nothing here.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit */

/** Keys 眩晕击 may hold. `page` is the page marker (敌能-83); `range_radius` belongs to another shape. */
const STONE_KEYS = new Set(['atk_scale', 'stun', 'page']);

/**
 * Whether a talent or skill of this name, with this blackboard, is 眩晕击 (敌能-83). Any other name is not this
 * family's concern: the caller still asks FOE_NEEDS. A `StunAttack` with another key, or without `page`, is not.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function stunAttackOwns(name, bb) {
  if (name !== 'StunAttack') return true;
  if (typeof bb.atk_scale !== 'number' || typeof bb.stun !== 'number' || typeof bb.page !== 'number') return false;
  for (const k of Object.keys(bb)) if (!STONE_KEYS.has(k)) return false;
  return true;
}

/** Centre distance squared (敌能-83): compared without a hypotenuse. @param {Unit} a @param {Unit} b */
const centre2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/**
 * The nearest unstunned unit it may hit inside its attack radius (敌能-83). Flyers count (the page does not exclude
 * them); a unit that took off does not (阻挡-2). Equal centre distance breaks by 索敌-5, blocker then hatred.
 * @param {FoeContext} ctx @returns {Unit | null}
 */
function stoneTarget(ctx) {
  let best = Infinity;
  /** @type {Unit[]} */
  const tied = [];
  for (const u of ctx.foes(ctx.self.base.rangeRadius, { canHitFly: true })) {
    const f = ctx.stats(u).flags;
    if (f.stun || f.liftoff) continue;
    const d = centre2(u, ctx.self);
    if (d < best) { best = d; tied.length = 0; }
    if (d === best) tied.push(u);
  }
  return ctx.order(tied)[0] ?? null;
}

/**
 * 眩晕击 (敌能-83). Ready, able to act, not silenced, and with a target: throw, and the cooldown starts. Otherwise it
 * stays ready. The throw is not an attack, so it does not take the attack interval and 战栗 does not stop it.
 * @param {FoeContext} ctx
 */
function throwStone(ctx) {
  if (!stunAttackOwns('StunAttack', ctx.bb)) return;
  const s = ctx.stats(ctx.self);
  if (!ctx.ready || s.disabled || s.flags.silence) return;
  const t = stoneTarget(ctx);
  if (!t) return;
  ctx.use();
  ctx.hurl(t, { type: 'phys', amount: s.atk * ctx.bb.atk_scale, status: { key: 'stun', seconds: ctx.bb.stun } });
}

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const rockmanBehaviors = Object.freeze({ StunAttack: Object.freeze({ tick: throwStone }) });
