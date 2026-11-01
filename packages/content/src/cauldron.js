// 鼎沸 and 飘香 (docs/spec/foes.md 敌能-129), and the shapes of the shared talent `aoe`: 爆破攻坚手's splash share alone is
// 敌能-26's cross splash (partisans.js), `atk_scale` and `ep_damage_ratio` alone is this pulse, and any other `aoe` stays
// uncovered (关卡-2) and does nothing. The pulse is the whole talent row of the two pages: no normal attack, 停顿免疫, and
// each second arts damage and 灼燃损伤 on the units in its attack range. It is a talent, so silence does not stop it
// (如无特殊说明，天赋默认不可沉默). It acts only through the context (ADR 0055).
// A third shape, 腐败骑士's with its page marker, is 敌能-145's cross (rotknights.js).

import { constants } from '@aue/sim';
import { knightAoe } from './rotknights.js';

/** @typedef {import('@aue/sim').FoeContext} FoeContext */

/** 爆破攻坚手's splash share (敌能-26), the only key of its `aoe`. */
export const SPLASH = 'attack@bsthmr_range.atk_scale';
/** The two numbers of the pulse's `aoe` (敌能-129). */
const PULSE_KEYS = Object.freeze(['atk_scale', 'ep_damage_ratio']);
/** 不进行普通攻击, under a key no other ability gives. */
const STILL = 'cauldronStill';
/** 停顿免疫: 停顿 has no flag of its own, so `immune:sluggish` refuses it (状态-7). */
const UNSLOWED = 'cauldronUnslowed';
/** 灼燃损伤 (元素-1). */
const FIRE = 'FIRE';

/** Whether a blackboard holds exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exactly = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** 爆破攻坚手's `aoe` (敌能-26): its splash share alone. @param {Record<string, unknown>} bb */
export const splashAoe = (bb) => exactly(bb, [SPLASH]);

/** 鼎沸's and 飘香's `aoe` (敌能-129): `atk_scale` and `ep_damage_ratio` alone. @param {Record<string, unknown>} bb */
export const pulseAoe = (bb) => exactly(bb, PULSE_KEYS);

/**
 * Whether an `aoe` blackboard is a shape the engine knows (敌能-26, 敌能-129, 敌能-145). Any other name is not this
 * check's: the caller still asks FOE_NEEDS (关卡-2).
 * @param {string} name @param {Record<string, unknown>} bb
 */
export const aoeOwns = (name, bb) => name !== 'aoe' || splashAoe(bb) || pulseAoe(bb) || knightAoe(bb);

/** Gives a buff once; it is given again only if something took it away. @param {FoeContext} ctx @param {import('@aue/sim').buffs.BuffInit} init */
function keep(ctx, init) {
  if (!ctx.self.buffs.some((b) => b.key === init.key)) ctx.addBuff(ctx.self, init);
}

/** No normal attack and 停顿免疫 (敌能-129). @param {FoeContext} ctx */
function hold(ctx) {
  keep(ctx, { key: STILL, flags: { noAttack: true } });
  keep(ctx, { key: UNSLOWED, flags: { 'immune:sluggish': true } });
}

/**
 * The spawn (敌能-129): the flags before its first turn, and the first pulse a whole second (30 frames) after this frame —
 * the spawn frame is not one of them, so 1 s is not 29 frames.
 * @param {FoeContext} ctx
 */
export function cauldronSpawn(ctx) {
  hold(ctx);
  ctx.state.set('next', ctx.frame + ctx.frames(1));
}

/**
 * Its turn (敌能-129). Each second, on every unit its attack could select within its attack range — 攻击半径 plus the
 * operators' collider, as 敌人攻击-1 measures it; no flying unit (不可对空); neutral units too —: arts damage of 攻击力 ×
 * `atk_scale`, then 灼燃损伤 of 攻击力 × `ep_damage_ratio` whatever the arts did. The page says 每秒, not its attack
 * interval; its own stun, sleep or 消失 do not hold the count.
 * @param {FoeContext} ctx
 */
export function cauldronTick(ctx) {
  hold(ctx);
  if (ctx.frame < ctx.state.get('next')) return;
  ctx.state.set('next', ctx.frame + ctx.frames(1));
  const atk = ctx.stats(ctx.self).atk, bb = ctx.bb;
  for (const t of ctx.foes(ctx.self.base.rangeRadius + constants.ALLY_COLLIDER_RADIUS)) {
    ctx.dealDamage(t, { type: 'arts', amount: atk * bb.atk_scale });
    ctx.dealEp(t, FIRE, atk * bb.ep_damage_ratio);
  }
}
