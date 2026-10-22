// 咸鳞汁推荐者 / 朗姆酒推荐者 (docs/spec/foes.md 敌能-62): carrying the barrel and spending it with 尝尝这个！
// (`BlockedBoom`). Talent `1` gives the barrel's move speed; it is also 悖谬谍报官's ammunition (敌能-31), and that
// behaviour leaves this shape alone, so the skill reads it, as `Devour` reads `Stronger`. They act only through the
// context (ADR 0055).
import { spyShape } from './devourers.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** The carry buff (敌能-62): no attack and the move speed, until the barrel is spent. */
const CARRY = 'barrel';
/** Keys the barrel talent may hold. `carry` is the page-only marker (敌能-62). */
const CARRY_KEYS = new Set(['move_speed', 'carry']);
/** Every number 尝尝这个！ reads. `radius` is the page-only marker, so an unread BlockedBoom stays inert. */
const BOOM_KEYS = ['radius', 'attack_speed', 'prob', 'fixed_duration', 'blockee_atk_scale'];

/**
 * The barrel talent (敌能-62): `move_speed` and `carry`, and nothing else. 冰翼兽's extra attack keys are not this.
 * @param {Record<string, unknown>} bb
 */
export function barrelTalent(bb) {
  if (typeof bb.move_speed !== 'number' || typeof bb.carry !== 'number') return false;
  for (const k of Object.keys(bb)) if (!CARRY_KEYS.has(k)) return false;
  return true;
}

/** 尝尝这个！ (敌能-62): the four data numbers and the page's radius. @param {Record<string, unknown>} bb */
export function barrelSkill(bb) {
  for (const k of BOOM_KEYS) if (typeof bb[k] !== 'number') return false;
  return true;
}

/**
 * Whether this name and blackboard are one this family finishes (关卡-2). Talent `1` is the spy's when `ammo` is a
 * number (敌能-31) or the barrel. `BlockedBoom` needs the whole blackboard. Any other name is not this family's concern.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function wineOwns(name, bb) {
  if (name === '1') return spyShape(bb) || barrelTalent(bb);
  if (name === 'BlockedBoom') return barrelSkill(bb);
  return true;
}

/** The barrel's move speed, from talent `1`; null when it has no barrel (敌能-62). @param {FoeContext} ctx */
function barrelSpeed(ctx) {
  const t = ctx.talent('1');
  return t && barrelTalent(t) ? t.move_speed : null;
}

/** The carry buff, put back when something removed it before the barrel was spent (敌能-62). @param {FoeContext} ctx @param {number} speed */
function carry(ctx, speed) {
  if (!ctx.self.buffs.some((b) => b.key === CARRY)) ctx.addBuff(ctx.self, { key: CARRY, flags: { noAttack: true }, mods: { moveMul: speed } });
}

/** Able to spend the barrel this frame (敌能-62): blocked, able to act, not silenced, not 缴械 while blocked. @param {FoeContext} ctx */
function maySmash(ctx) {
  const s = ctx.stats(ctx.self);
  return ctx.blocked && !s.disabled && !s.flags.silence && !s.flags.disarmedCombat;
}

/**
 * 尝尝这个！ (敌能-62): it carries the barrel from its first frame; blocked and able to, it spends it once — the hit on
 * the blocker, the attack interval taken, the area poured. Without the page-only radius it does nothing.
 * @type {FoeBehavior}
 */
const BlockedBoom = Object.freeze({
  spawn: (ctx) => {
    const speed = barrelSpeed(ctx);
    if (speed !== null && barrelSkill(ctx.bb)) carry(ctx, speed);
  },
  tick: (ctx) => {
    const bb = ctx.bb, speed = barrelSpeed(ctx);
    if (!barrelSkill(bb) || speed === null || ctx.state.get('spent')) return;
    carry(ctx, speed);
    const target = maySmash(ctx) ? ctx.blocker() : null;
    if (!target || target.hp <= 0) return;
    ctx.state.set('spent', 1);
    ctx.removeBuff(ctx.self, CARRY);
    ctx.dealDamage(target, { type: 'phys', amount: ctx.stats(ctx.self).atk * bb.blockee_atk_scale, isAttack: false, isSkill: true });
    ctx.holdAttack();
    ctx.pour(target, { radius: bb.radius, seconds: bb.fixed_duration, aspd: bb.attack_speed, dodge: bb.prob });
  },
});

/** Behaviours of this family. Talent `1` keeps the spy's registration (敌能-31). @type {Readonly<Record<string, FoeBehavior>>} */
export const wineBehaviors = Object.freeze({ BlockedBoom });
