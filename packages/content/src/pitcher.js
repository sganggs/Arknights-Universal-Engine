// 长臂投手 / 「精准制导」长臂投手's 攻击优先度 (docs/spec/foes.md 敌能-123): a unit of ours deployed on a 折叠式堡垒模块
// first, then the modules themselves — the raw box too, though it cannot be selected —, then everyone else. The modules
// are 守御-3's facilities (INF-0702). The talent is the pages' (the data has none); the order is the simulation's
// 特殊优先级 step (索敌-5).

import { constants } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** Whether a unit is a facility (守御-3), at any level. @param {Unit} u */
const isModule = (u) => u.fac !== undefined;

/** Whether a unit of ours that is not a facility stands on a facility's tile. @param {FoeContext} ctx @param {Unit} u */
const onModule = (ctx, u) => !isModule(u) && ctx.ours().some((m) => isModule(m) && m.x === Math.round(u.x) && m.y === Math.round(u.y));

/**
 * `moduleFirst` (敌能-123): its attack's candidates gain the facilities in its reach that cannot be selected (无视无法选择:
 * the raw box, 守御-3), and rank on a module 0, a module 1, the rest 2. The pages do not call it silenceable.
 * @type {FoeBehavior}
 */
const moduleFirst = Object.freeze({
  targets: (ctx, cands) => {
    const reach = ctx.self.base.rangeRadius + constants.ALLY_COLLIDER_RADIUS;
    const boxes = ctx.foes(reach, { ignoreUntargetable: true }).filter((u) => isModule(u) && !cands.includes(u));
    return boxes.length > 0 ? [...cands, ...boxes] : cands;
  },
  rank: (ctx, u) => (isModule(u) ? 1 : onModule(ctx, u) ? 0 : 2),
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const pitcherBehaviors = Object.freeze({ moduleFirst });
