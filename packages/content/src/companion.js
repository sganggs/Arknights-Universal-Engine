// 安眠伴随兽 and 沉眠伴随兽 (docs/spec/foes.md 敌能-109). Its attack adds 神经损伤 at `GetEnmey`'s `attack@ep_damage_ratio`.
// In its 通常模式 it carries off one of ours — with its skill `GetChar` a stunned operator on the ground within
// `range_radius`, or one its normal attack has just knocked down — and goes into 伴随模式: the passenger's 阻挡数 more
// blocks taken and `move_speed` faster; after `first_trigger_interval` s, or stunned or frozen, it puts the passenger
// back on its tile, stunned `stun` s, and carries nothing for `cooldown` s. Falling, it lets go. `GetEnmey`'s own
// passengers, the 梦城堡造物 in 休眠, are not in the engine's levels. It acts only through the context (ADR 0055).
import { elements } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** The 伴随模式 buff (敌能-109). */
const RIDE = 'companion';
/** 神经损伤 (元素-2, 敌能-109). */
const NEURAL = elements.ELEMENTS[0];

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

const ENEMY_KEYS = Object.freeze(['max_cnt', 'range_radius', 'move_speed', 'duration', 'cooldown', 'attack@ep_damage_ratio', 'value']);
const CHAR_KEYS = Object.freeze(['cooldown', 'move_speed', 'range_radius', 'first_trigger_interval', 'value', 'stun']);
/** `GetEnmey` (敌能-109). @param {Record<string, unknown>} bb */
const enemyShape = (bb) => exact(bb, ENEMY_KEYS);
/** `GetChar`, its `stun` the page's where the data has none (敌能-109). @param {Record<string, unknown>} bb */
const charShape = (bb) => exact(bb, CHAR_KEYS);

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function companionOwns(name, bb) {
  if (name === 'GetEnmey') return enemyShape(bb);
  if (name === 'GetChar') return charShape(bb);
  return true;
}

/** Stunned or frozen (敌能-109). @param {FoeContext} ctx @param {Unit} u */
const held = (ctx, u) => { const f = ctx.stats(u).flags; return f.stun === true || f.freeze === true; };

/** Into 伴随模式 with a passenger (敌能-109). @param {FoeContext} ctx @param {Unit} t */
function board(ctx, t) {
  ctx.state.set('ride', 1);
  ctx.state.set('since', ctx.frame);
  ctx.addBuff(ctx.self, { key: RIDE, mods: { blockCnt: t.base.blockCnt ?? 1, moveFlat: ctx.bb.move_speed } });
}

/** The passenger put back, stunned, and the rest before the next (敌能-109). @param {FoeContext} ctx */
function alight(ctx) {
  ctx.putBack(ctx.bb.stun);
  ctx.removeBuff(ctx.self, RIDE);
  ctx.state.set('ride', 0);
  ctx.state.set('rest', ctx.frame + ctx.frames(ctx.bb.cooldown));
}

/**
 * 搬运式伴随 (敌能-109): carrying, it puts the passenger back in time or when held; resting, nothing; else, ready, a
 * stunned operator of ours on the ground within `range_radius` — never silenced, whether it is blocked or not.
 * @param {FoeContext} ctx
 */
function ride(ctx) {
  const st = ctx.state, bb = ctx.bb, self = ctx.self;
  if (st.get('ride') === 1) {
    if (ctx.frame - st.get('since') >= ctx.frames(bb.first_trigger_interval) || held(ctx, self)) alight(ctx);
    return;
  }
  if (ctx.frame < st.get('rest') || !ctx.ready) return;
  const r = bb.range_radius, t = ctx.ours().find((u) => held(ctx, u) && !ctx.stats(u).flying && (u.x - self.x) * (u.x - self.x) + (u.y - self.y) * (u.y - self.y) <= r * r);
  if (!t || !ctx.carryOff(t)) return;
  ctx.use();
  board(ctx, t);
}

/** `GetChar` (敌能-109). @type {FoeBehavior} */
const GetChar = Object.freeze({
  tick: (ctx) => { if (charShape(ctx.bb)) ride(ctx); },
  hit: (ctx, t) => {
    const st = ctx.state;
    if (!charShape(ctx.bb) || st.get('ride') === 1 || ctx.frame < st.get('rest') || t.hp > 0 || !ctx.carryOff(t)) return;
    board(ctx, t);
  },
  death: (ctx) => { if (charShape(ctx.bb) && ctx.state.get('ride') === 1) ctx.unlock(false); },
});

/** `GetEnmey` (敌能-109): the 神经损伤 its attack adds. @type {FoeBehavior} */
const GetEnmey = Object.freeze({
  attack: (ctx, mods) => (enemyShape(ctx.bb) ? { ...mods, element: NEURAL, ep: ctx.stats(ctx.self).atk * ctx.bb['attack@ep_damage_ratio'] } : mods),
});

/** The behaviours of this file, by name. @type {Readonly<Record<string, FoeBehavior>>} */
export const companionBehaviors = Object.freeze({ GetChar, GetEnmey });
