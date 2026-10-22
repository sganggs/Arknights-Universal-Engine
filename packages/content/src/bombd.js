// 投弹 (docs/spec/foes.md 敌能-56). Only the { move_speed } blackboard: one instant bomb on the target's 3×3,
// then moveMul × move_speed for good. Sports-mode boomb stays uncovered (关卡-2). 不进行普通攻击 uses noAttack
// (敌人攻击-1), not Static (敌能-37).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit */

/** A normal attack's reach past the radius (敌人攻击-1: the ally collider is 0.25). */
const REACH = 0.25;

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

/** @type {FoeBehavior} */
const boomb = Object.freeze({
  spawn: (ctx) => {
    if (typeof ctx.bb.move_speed !== 'number') return;
    ctx.addBuff(ctx.self, { key: 'noAttack', flags: { noAttack: true } });
  },
  tick: dropBomb,
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const bombdBehaviors = Object.freeze({ boomb });
