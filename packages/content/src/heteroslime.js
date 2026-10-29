// 异质源石虫 (docs/spec/foes.md 敌能-102). Its special 屏障 takes only 矿工游击队's physical damage, and the engine's
// levels have none: the 屏障 stays, and while it does the taunt is one higher, and a physical or arts hit is halved —
// on a sourced hit only when the 反伤 it tries on the source lands (`Shield`). `BlockMcreep` (交战 with 矿工游击队, attacks
// on 乌萨斯平民, 斗士塔露拉 and 矿工游击队) and the empty skill `M1Start` have nothing to act on. The halving and the 反伤
// are the 屏障 buff's take, through the sim's damage module as 敌能-41's chalice does.
import { damage, attrs } from '@aue/sim';
import { KIND } from '@aue/schema';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** The 屏障's buff, its take's act (敌能-102). */
const BARRIER = 'heteroShield';

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** 异质源石虫's `Shield` (敌能-102). @param {Record<string, unknown>} bb */
export const heteroShield = (bb) => exact(bb, ['init_shield_hp_ratio', 'damage_resistance', 'value']);

/** Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. @param {string} name @param {Record<string, unknown>} bb */
export function heteroOwns(name, bb) {
  if (name === 'BlockMcreep') return exact(bb, ['range_radius', 'block_mcreep_cnt', 'range_radius_add']);
  if (name === 'M1Start') return Object.keys(bb).length === 0;
  return true;
}

/** The 屏障 from its spawn (敌能-102): taunt + 1, and the take below. @param {FoeContext} ctx */
export function heteroSpawn(ctx) {
  ctx.addBuff(ctx.self, { key: BARRIER, mods: { taunt: 1 } });
}

/**
 * Whether the 反伤 on a hit's source lands (敌能-102): the source is still on the field, neither 无敌 nor 不可选中, and
 * `value` sourceless arts does it some damage. @param {import('@aue/sim').World} w @param {import('@aue/sim').Unit} src
 * @param {number} value @param {import('@aue/sim').Content | undefined} c
 */
function reflected(w, src, value, c) {
  const f = attrs.statsOf(src).flags;
  if (src.hp <= 0 || f.invincible || f.untargetable) return false;
  return damage.dealDamage(w, null, src, { type: 'arts', amount: value, sourceless: true }, c) > 0;
}

/**
 * The 屏障's take (敌能-102): a sourced hit from anything but a device tries the 反伤 first; a physical or arts hit is
 * then × (1 − `damage_resistance`) unless that 反伤 failed.
 * @type {NonNullable<import('@aue/sim').buffs.Behavior['take']>}
 */
function take(w, u, b, amount, hit) {
  const bb = hit.c?.enemies[u.key]?.talents?.Shield;
  if (!bb || !heteroShield(bb)) return amount;
  const typed = hit.dmg.type === 'phys' || hit.dmg.type === 'arts', src = hit.src;
  const landed = !src || src.kind === KIND.DEVICE || reflected(w, src, bb.value, hit.c);
  return typed && landed ? amount * (1 - bb.damage_resistance) : amount;
}

/** `BlockMcreep` and `M1Start` (敌能-102): nothing to act on. @type {FoeBehavior} */
const idle = Object.freeze({});

/** The behaviours of this file, by name; `Shield` dispatches here by its shape (blockdamage.js). @type {Readonly<Record<string, FoeBehavior>>} */
export const heteroBehaviors = Object.freeze({ BlockMcreep: idle, M1Start: idle });

/** The 屏障's take (敌能-102). @type {Readonly<Record<string, import('@aue/sim').buffs.Behavior>>} */
export const heteroBuffs = Object.freeze({ [BARRIER]: { take } });
