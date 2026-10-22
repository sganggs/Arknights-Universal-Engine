// 投弹 (docs/spec/foes.md 敌能-56) and 爆炸汽水布设 (敌能-86). One behaviour name, `boomb`.
// { move_speed } is the instant bomb, then moveMul × move_speed. { soda, atk_scale, projectile_life_time,
// projectile_range } is the bottle. `soda` is a page-only extra: the same three keys without it stay uncovered (关卡-2).
// 不进行普通攻击 uses noAttack (敌人攻击-1), not Static (敌能-37).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit */

/** A normal attack's reach past the radius (敌人攻击-1: the ally collider is 0.25). */
const REACH = 0.25;
/** Keys the bottle's blackboard carries besides the page marker (敌能-86). */
const SODA_KEYS = ['atk_scale', 'projectile_life_time', 'projectile_range'];

/** 暴鸰's blackboard (敌能-56). Extra keys do not change it. @param {Record<string, unknown>} bb */
function bombShape(bb) {
  return typeof bb.move_speed === 'number';
}

/**
 * The two read carts (敌能-86). `soda` 1 is the page-only marker, so the unread 补给员 with the same three keys are not this.
 * A `move_speed` board is the other shape, never this one.
 * @param {Record<string, unknown>} bb
 */
export function sodaShape(bb) {
  return !bombShape(bb) && bb.soda === 1 && SODA_KEYS.every((k) => typeof bb[k] === 'number');
}

/**
 * Whether `boomb` with this blackboard is a shape this behaviour runs (敌能-56, 敌能-86). Any other name is not this
 * family's concern: the caller still asks FOE_NEEDS.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function bombdOwns(name, bb) {
  if (name !== 'boomb') return true;
  return bombShape(bb) || sodaShape(bb);
}

/**
 * One physical hit of the bomb (敌能-56). Splash is everyone in the square but the main target.
 * @param {FoeContext} ctx @param {Unit} u @param {number} atk @param {boolean} splash
 */
function hit(ctx, u, atk, splash) {
  ctx.dealDamage(u, splash
    ? { type: 'phys', amount: atk, isAttack: true, isSkill: true, isSplash: true }
    : { type: 'phys', amount: atk, isAttack: true, isSkill: true });
}

/**
 * Ready, able to act, and someone a normal attack could pick in range: bomb that unit's square once, then the speed.
 * A prevented trigger is not spent. Silence is not one of the things that prevents it (敌能-56).
 * @param {FoeContext} ctx
 */
function dropBomb(ctx) {
  if (typeof ctx.bb.move_speed !== 'number' || ctx.state.get('done')) return;
  if (!ctx.ready || ctx.stats(ctx.self).disabled) return;
  const [t] = ctx.order(ctx.foes(ctx.self.base.rangeRadius + REACH, { canHitFly: true }));
  if (!t) return;
  ctx.use();
  ctx.state.set('done', 1);
  const atk = ctx.stats(ctx.self).atk;
  for (const u of ctx.around(t, 'square')) hit(ctx, u, atk, u !== t);
  ctx.addBuff(ctx.self, { key: 'boomb', mods: { moveMul: ctx.bb.move_speed } });
}

/**
 * Ready, able to act, and not silenced: leave a bottle at the cart's point (敌能-86). A prevented drop is not spent.
 * The amount is the attack at the drop; the blast keeps it (敌能-3). `all` is every unit, enemies included.
 * @param {FoeContext} ctx
 */
function dropSoda(ctx) {
  const bb = ctx.bb;
  if (!sodaShape(bb)) return;
  const s = ctx.stats(ctx.self);
  if (!ctx.ready || s.disabled || s.flags.silence) return;
  ctx.use();
  ctx.blast({
    x: ctx.self.x, y: ctx.self.y, radius: bb.projectile_range, delay: bb.projectile_life_time,
    air: true, sourced: true, all: true, type: 'true', amount: s.atk * bb.atk_scale,
  });
}

/**
 * 不进行普通攻击 on either shape. The carts are also 无法被阻挡 (敌能-86); 暴鸰 is not — its page does not say that.
 * @param {FoeContext} ctx
 */
function mark(ctx) {
  if (bombShape(ctx.bb)) {
    ctx.addBuff(ctx.self, { key: 'noAttack', flags: { noAttack: true } });
    return;
  }
  if (!sodaShape(ctx.bb)) return;
  ctx.addBuff(ctx.self, { key: 'soda', flags: { noAttack: true, unblockable: true } });
}

/** @type {FoeBehavior} */
const boomb = Object.freeze({
  spawn: mark,
  tick: (ctx) => { dropBomb(ctx); dropSoda(ctx); },
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const bombdBehaviors = Object.freeze({ boomb });
