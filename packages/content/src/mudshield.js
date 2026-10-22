// 泥岩小队践行者 / 组长 (docs/spec/foes.md 敌能-66): an arts barrier on appearance, and more max HP and attack
// speed while any of it remains. The amount is three times `dynamic` (INF-0488). One buff holds both, and its take
// absorbs only arts: a typed shield (伤害-8 `shieldType`) that also carries modifiers is not removed when it fully
// absorbs, and take is not called once the hit is already 0, so the bonus would last a frame too long (INF-0489).
import { buffs } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** Page marker (关卡-2). Only the two read enemies carry it; the same shape without it stays uncovered. */
const PAGE = 'page';
/** Buff key and behaviour key. Not the talent name: that key is the enemy ability, shared with other shapes. */
const ACT = 'mudShield';
/** Keys this shape may hold. `page` is the content marker, not enemy data. */
const SHIELD_KEYS = new Set(['dynamic', 'max_hp', 'attack_speed', PAGE]);

/**
 * Whether a talent named `shield` is this barrier (敌能-66). Any other name is not this family's concern.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function shieldOwns(name, bb) {
  if (name !== 'shield') return true;
  if (typeof bb.dynamic !== 'number' || typeof bb.max_hp !== 'number' || typeof bb.attack_speed !== 'number') return false;
  for (const k of Object.keys(bb)) if (!SHIELD_KEYS.has(k)) return false;
  return true;
}

/**
 * The page's barrier, three times `dynamic` (敌能-66, INF-0488). No marker, or a non-positive product, and there is none.
 * @param {Record<string, number>} bb
 */
function barrierAmount(bb) {
  if (bb[PAGE] !== 1) return 0;
  if (typeof bb.dynamic !== 'number' || typeof bb.max_hp !== 'number' || typeof bb.attack_speed !== 'number') return 0;
  const n = bb.dynamic * 3;
  return n > 0 ? n : 0;
}

/** On appearance (敌能-66): one buff, the arts barrier and the bonuses together. @param {import('@aue/sim').FoeContext} ctx */
function grant(ctx) {
  const amount = barrierAmount(ctx.bb);
  if (!(amount > 0)) return;
  ctx.addBuff(ctx.self, { key: ACT, act: ACT, value: amount, mods: { hpPct: ctx.bb.max_hp, aspd: ctx.bb.attack_speed } });
}

/** @type {FoeBehavior} */
const shield = Object.freeze({ spawn: grant });

/**
 * 伤判 (敌能-66): only arts comes off `value`. At 0 the buff goes in this same step, before leftover HP loss, so the
 * bonus ends and the ratio (属性-4) is already the unboosted one (INF-0489). Physical, true and elemental are unchanged.
 * @type {NonNullable<import('@aue/sim').buffs.Behavior['take']>}
 */
function absorb(w, u, b, amount, hit) {
  if (hit.dmg.type !== 'arts' || !(b.value > 0)) return amount;
  const used = Math.min(b.value, amount);
  const left = b.value - used;
  // `value` is written only in buffs.js (ADR 0045). retune keeps the modifiers while any barrier remains.
  if (left > 0) buffs.retune(u, b, left, b.mods);
  else buffs.removeBuff(u, b);
  return amount - used;
}

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const mudShieldBehaviors = Object.freeze({ shield });

/** @type {Readonly<Record<string, import('@aue/sim').buffs.Behavior>>} */
export const mudShieldBuffs = Object.freeze({ [ACT]: { take: absorb } });
