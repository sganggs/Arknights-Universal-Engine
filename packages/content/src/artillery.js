// 帝国炮火先兆者 and 帝国炮火中枢先兆者 (docs/spec/foes.md 敌能-130): each normal attack puts a shell down on the target's
// spot; 3 s later it hits everyone of ours there, as sourceless physical damage of the attack it was fired with. Their
// ranged attacks prefer neutral units among the most taunting. The data has neither ability, so FOE_EXTRAS gives both
// the talent `DelayShell`. It acts only through the context (ADR 0055).

import { constants } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** 「于3秒后命中」 (敌能-130): the shell's flight, in seconds. */
const FLIGHT = 3;

/**
 * 「半径1.2」 with 「碰撞」 (敌能-130, INF-0771): one of ours counts once its collider (常量-2) touches the circle, so the
 * blast's centre-distance radius is 1.2 + 0.25. A neutral unit gets the same 1.45: an explosion has one radius (敌能-3).
 */
const REACH = 1.2 + constants.ALLY_COLLIDER_RADIUS;

/**
 * The shell (敌能-130): an explosion (敌能-3) at the target's coordinates as the attack lands. The amount is fixed now
 * (「弹道始终使用缓存攻击力」), the damage has no source (「无来源」), and the air is not left out: the page does not say
 * 不可对空. Returning true stops the main hit, so the shell is all the attack does.
 * @param {FoeContext} ctx @param {Unit} t
 */
function fire(ctx, t) {
  ctx.blast({ x: t.x, y: t.y, radius: REACH, delay: FLIGHT, air: true, sourced: false, type: 'phys', amount: ctx.stats(ctx.self).atk });
  return true;
}

/**
 * 「目标嘲讽等级相同时，远程攻击优先攻击乌萨斯平民…」 (敌能-130, read as 敌能-8): unblocked, the neutral units among the most
 * taunting candidates when there are any. Blocked, the blocker stays first (索敌-5).
 * @param {FoeContext} ctx @param {Unit[]} cands
 */
function neutralFirst(ctx, cands) {
  if (ctx.blocked) return cands;
  const top = Math.max(...cands.map((u) => ctx.stats(u).taunt)), tied = cands.filter((u) => ctx.stats(u).taunt === top);
  return tied.some((u) => u.base.neutral) ? tied.filter((u) => u.base.neutral) : cands;
}

/**
 * 帝国炮火先兆者's attack (敌能-130). `direct` keeps the projectile out: the shell is aimed where the target stands when
 * the attack lands (攻击-2), not where a projectile would catch it.
 * @type {FoeBehavior}
 */
const DelayShell = Object.freeze({
  targets: neutralFirst,
  attack: (_ctx, mods) => ({ ...mods, direct: true }),
  cancelHit: fire,
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const artilleryBehaviors = Object.freeze({ DelayShell });
