// The partisans, the demolitionists and the ice-field enemies (docs/spec/foes.md 敌能-25…敌能-27): a 传令兵's 战术命令 over
// every enemy and what it gives the others, the 盾卫's taunt, splashes around the target, attacks on several targets
// at once, the 冰原术师's 寒霜一击, 抵抗, and the 冰原猎人's two attacks. They act only through the context (ADR 0055).

import { SPLASH, splashAoe, pulseAoe, cauldronSpawn, cauldronTick } from './cauldron.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** Whether an enemy is under a 传令兵's 战术命令 (敌能-25). @param {FoeContext} ctx */
const commanded = (ctx) => ctx.buffValue(ctx.self, 'command') !== null;

/**
 * 战术命令 and what it gives (敌能-25), by the blackboard: a 传令兵 (`atk`, `def`) gives every enemy on the field, itself
 * and those that cannot be selected too, 攻击力 + `atk` (直接乘算), 防御力 + `def` and the 战术命令 while it is on the field
 * — one such effect at most, however many give it —; a 战士 under it has 移动速度 + `move_speed` (直接乘算), a 迫击炮兵
 * 攻击速度 + `attack_speed`.
 * @type {FoeBehavior}
 */
const strength = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb;
    if (bb.atk !== undefined || bb.def !== undefined) {
      for (const u of ctx.enemies()) ctx.lend(u, 'command', { mods: { atkPct: bb.atk ?? 0, defFlat: bb.def ?? 0 } });
    } else if (commanded(ctx)) {
      ctx.lend(ctx.self, 'strength', { mods: bb.move_speed !== undefined ? { movePct: bb.move_speed } : { aspd: bb.attack_speed ?? 0 } });
    }
  },
});

/** 盾卫 (敌能-25): 嘲讽等级 + `taunt_level` throughout. @type {FoeBehavior} */
const taunt = Object.freeze({
  spawn: (ctx) => { ctx.setBuff(ctx.self, 'taunt', 0, { taunt: ctx.bb.taunt_level }); },
});

/**
 * `aoe` by its shape. 爆破攻坚手 (敌能-26): its attack hits the target and, at `attack@bsthmr_range.atk_scale` of it, the
 * other units on the four tiles next to the target's (a cross; ground units only). 鼎沸 and 飘香 (敌能-129): the pulse in
 * cauldron.js. Any other blackboard of the name does nothing, and stays uncovered (关卡-2).
 * @type {FoeBehavior}
 */
const aoe = Object.freeze({
  spawn: (ctx) => { if (pulseAoe(ctx.bb)) cauldronSpawn(ctx); },
  tick: (ctx) => { if (pulseAoe(ctx.bb)) cauldronTick(ctx); },
  attack: (ctx, mods) => (splashAoe(ctx.bb) ? { ...mods, cross: true, splashScale: ctx.bb[SPLASH] } : mods),
});

/** 迫击炮兵 (敌能-26): its shell hits the target and every unit on the eight tiles around the target's, alike. @type {FoeBehavior} */
const Shell = Object.freeze({
  attack: (_ctx, mods) => ({ ...mods, square: true }),
});

/** Several targets at once (敌能-27): `n` of them; with `direct` its hits come without a projectile. @type {FoeBehavior} */
const Targets = Object.freeze({
  attack: (ctx, mods) => ({ ...mods, targets: ctx.bb.n, ...(ctx.bb.direct === 1 ? { direct: true } : {}) }),
});

/**
 * 寒霜一击 (敌能-27): each normal attack gains a point; with the skill's SP cost gathered the next attack is the skill's —
 * its hits give `freeze` seconds of 寒冷 — and the points start again.
 * @type {FoeBehavior}
 */
const coldattack = Object.freeze({
  attack: (ctx, mods) => {
    const sp = ctx.state.get('sp');
    if (sp < ctx.sp) { ctx.state.set('sp', sp + 1); return mods; }
    ctx.state.set('sp', 0);
    return { ...mods, hitStatus: { key: 'cold', seconds: ctx.bb.freeze } };
  },
});

/** 抵抗 (敌能-27): the enemy has 抵抗 throughout. @type {FoeBehavior} */
const Resist = Object.freeze({
  spawn: (ctx) => { ctx.applyStatus(ctx.self, 'buffres'); },
});

/**
 * 冰原猎人 (敌能-27): blocked, it attacks the unit blocking it, without a projectile; unblocked, among the most taunting it
 * can reach those with the lowest 防御力.
 * @type {FoeBehavior}
 */
const LowDef = Object.freeze({
  targets: (ctx, cands) => {
    const b = ctx.blocker();
    if (b) return cands.filter((u) => u === b);
    const top = Math.max(...cands.map((u) => ctx.stats(u).taunt)), tied = cands.filter((u) => ctx.stats(u).taunt === top);
    const low = Math.min(...tied.map((u) => ctx.stats(u).def));
    return tied.filter((u) => ctx.stats(u).def === low);
  },
  attack: (ctx, mods) => (ctx.blocked ? { ...mods, direct: true } : mods),
});

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const partisanBehaviors = Object.freeze({ strength, taunt, aoe, Shell, Targets, coldattack, Resist, LowDef });
