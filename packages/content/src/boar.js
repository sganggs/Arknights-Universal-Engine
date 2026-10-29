// 凶豕兽 (docs/spec/foes.md 敌能-92): it takes 2 blocks; unblocked it charges — each `interval` seconds a try at a layer
// of 移动速度 + `move_speed`, at most `trig_cnt` tries, those in its first `predelay` seconds failing —, and 晕眩, 冻结, 浮空 or
// 束缚 end the charge with its layers. Moving on its own it rams each of ours on low ground that comes within 0.5
// (`Crash`), and while it charges its normal attack hits once more, after which the charge ends (`FirstAttack`). Its
// `Rush` and `FirstAttack` blackboards are this family's shape; the others are 敌能-19's and 敌能-7's, and 赏金猎人“骑士”'s
// `Rush` (敌能-95).
import { knightShape } from './lancer.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** The charge's blackboard keys (敌能-92). */
const SPEED = 'mhboar_t[trigger].move_speed', INTERVAL = 'mhboar_t[trigger].interval', TRIES = 'mhboar_t[trigger].trig_cnt', WARM = 'mhboar_t_predelay.predelay';
/** The buffs of a charge (敌能-92): the charge itself, and its layers of 移动速度. */
const CHARGE = 'boarCharge', LAYERS = 'boarSpeed';
/** How often it checks whether it charges (敌能-92: 「每0.1秒检测一次」), seconds. */
const CHECK = 0.1;
/** How near one of ours is rammed (敌能-92: 「半径0.5范围内」). */
const RAM = 0.5;

/** Whether a `Rush` blackboard is 凶豕兽's charge (敌能-92). @param {Record<string, unknown>} bb */
export const boarRush = (bb) => [SPEED, INTERVAL, TRIES, WARM].every((k) => typeof bb[k] === 'number');

/** Whether a `Crash` blackboard is 凶豕兽's (敌能-92): `atk_scale` and `stun` alone. @param {Record<string, unknown>} bb */
const crashShape = (bb) => Object.keys(bb).length === 2 && typeof bb.atk_scale === 'number' && typeof bb.stun === 'number';

/** Whether a `Rush` blackboard is 冲锋's (敌能-19): `duration`, `move_speed` and `range_radius`. @param {Record<string, unknown>} bb */
const dashShape = (bb) => ['duration', 'move_speed', 'range_radius'].every((k) => typeof bb[k] === 'number');

/** Whether a `FirstAttack` blackboard is 凶豕兽's (敌能-92): `atk_scale` alone. @param {Record<string, unknown>} bb */
export const boarFirst = (bb) => Object.keys(bb).length === 1 && typeof bb.atk_scale === 'number';

/**
 * The shapes of the shared names this family reads (关卡-2): `Rush` 敌能-19's, 凶豕兽's or 赏金猎人“骑士”'s (敌能-95),
 * `FirstAttack` 敌能-7's (`attack@first_atk_scale`) or 凶豕兽's, `Crash` 凶豕兽's; any other name passes. @param {string} k @param {Record<string, unknown>} bb
 */
export function boarOwns(k, bb) {
  if (k === 'Rush') return dashShape(bb) || boarRush(bb) || knightShape(bb);
  if (k === 'FirstAttack') return typeof bb['attack@first_atk_scale'] === 'number' || boarFirst(bb);
  if (k === 'Crash') return crashShape(bb);
  return true;
}

/** Whether it is charging (敌能-92). @param {FoeContext} ctx */
const charging = (ctx) => ctx.buffValue(ctx.self, CHARGE) !== null;

/** Ends the charge and its layers (敌能-92). @param {FoeContext} ctx */
function stop(ctx) {
  ctx.removeBuff(ctx.self, CHARGE);
  ctx.removeBuff(ctx.self, LAYERS);
}

/**
 * The charge (敌能-92), on 凶豕兽's `Rush`: every 0.1 seconds 晕眩, 冻结, 浮空 or 束缚 end it, and unblocked it starts;
 * charging, each `interval` seconds one of `trig_cnt` tries at a layer — none in its first `predelay` seconds.
 * @param {FoeContext} ctx
 */
export function boarTick(ctx) {
  const st = ctx.state, bb = ctx.bb, f = ctx.stats(ctx.self).flags;
  if (ctx.frame >= st.get('check')) {
    st.set('check', ctx.frame + ctx.frames(CHECK));
    if (f.stun || f.freeze || f.levitate || f.root) stop(ctx);
    else if (!ctx.blocked && !charging(ctx)) {
      ctx.addBuff(ctx.self, { key: CHARGE });
      st.set('since', ctx.frame);
      st.set('tries', 0);
      st.set('try', ctx.frame + ctx.frames(bb[INTERVAL]));
    }
  }
  if (!charging(ctx) || ctx.frame < st.get('try')) return;
  st.set('try', ctx.frame + ctx.frames(bb[INTERVAL]));
  if (st.get('tries') >= bb[TRIES]) return;
  st.set('tries', st.get('tries') + 1);
  if (ctx.frame - st.get('since') < ctx.frames(bb[WARM])) return;
  ctx.addBuff(ctx.self, { key: LAYERS, rule: 'stack', stacks: 1, maxStacks: bb[TRIES], mods: { movePct: bb[SPEED] } });
}

/** 凶豕兽's bulk (敌能-92: 「占用2个阻挡数」): one block more than an enemy's one, from its spawn. @param {FoeContext} ctx */
export const boarSpawn = (ctx) => { ctx.addBuff(ctx.self, { key: 'boarBulk', mods: { blockCnt: 1 } }); };

/** Whether it moves on its own now (敌能-92): unblocked, able to move, not in 失衡. @param {FoeContext} ctx */
function moving(ctx) {
  const s = ctx.stats(ctx.self);
  return !ctx.blocked && !s.immobile && !s.disabled && !ctx.unbalanced;
}

/**
 * `Crash` (敌能-92): moving on its own, each of ours on low ground (flying too) that comes within 0.5 of it takes
 * 移动速度 × `atk_scale` physical damage, worked out then, and `stun` seconds of 晕眩 when that is above 0; once until it
 * is out of reach again. @type {FoeBehavior}
 */
const Crash = Object.freeze({
  tick: (ctx) => {
    const st = ctx.state, self = ctx.self, bb = ctx.bb;
    if (!crashShape(bb)) return;
    const near = moving(ctx) ? ctx.ours().filter((u) => ctx.onLow(u) && (u.x - self.x) * (u.x - self.x) + (u.y - self.y) * (u.y - self.y) <= RAM * RAM) : [];
    const speed = ctx.stats(self).moveSpeed;
    for (const u of near) {
      if (st.get(`in${u.id}`) === ctx.frame - 1) { st.set(`in${u.id}`, ctx.frame); continue; }
      st.set(`in${u.id}`, ctx.frame);
      ctx.dealDamage(u, { type: 'phys', amount: speed * bb.atk_scale });
      if (bb.stun > 0) ctx.applyStatus(u, 'stun', { seconds: bb.stun });
    }
  },
});

/**
 * 凶豕兽's `FirstAttack` (敌能-92): charging, a hit of its normal attack is followed by 移动速度 × `atk_scale` physical
 * damage, worked out then, and the charge ends. @param {FoeContext} ctx @param {import('@aue/sim').Unit} target
 */
export function boarHit(ctx, target) {
  if (!charging(ctx)) return;
  ctx.dealDamage(target, { type: 'phys', amount: ctx.stats(ctx.self).moveSpeed * ctx.bb.atk_scale });
  stop(ctx);
}

/** The behaviours of this file; `Rush` and `FirstAttack` dispatch here by their shapes (foes.js). @type {Readonly<Record<string, FoeBehavior>>} */
export const boarBehaviors = Object.freeze({ Crash });
