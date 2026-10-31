// The howling and boiling knight orders (docs/spec/foes.md 敌能-71) and 斗志昂扬无人机 (敌能-85). `buff` and
// `enhance` are shared talent names, so only the blackboards below, each with the marker of the pages read, are this
// family (关卡-2). The armour is one buff from the appearance frame; a layer comes from the `down` hook when another
// enemy is knocked down (敌能-2). The drone's blast is the `death` hook. They act only through the context (ADR 0055).

import { KIND } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** One armour, so a second copy cannot queue behind it (状态-2). Not the talent name: that name is shared. */
const ARMOUR = 'howl';
/** One stacking layer buff. Permanent, so a later death replaces nothing that would expire. */
const BLOOD = 'blood';
/** One 【斗志昂扬】 on our operators (敌能-85). Not the talent name, and not the drone's own refusal to attack. */
const ZEAL = 'zeal';
/** The drone's refusal to attack, with no end (敌能-85, 敌人攻击-1). A separate key: `zeal` is timed and not on the drone. */
const HOLD = 'noAttack';
/** The howling armour blackboard and the page marker (敌能-71). */
const ARMOUR_KEYS = ['duration', 'def', 'magic_resistance', 'page'];
/** The boiling layer blackboard and the page marker (敌能-71). */
const BLOOD_KEYS = ['atk', 'attack_speed', 'max_stack_cnt', 'page'];
/** The drone's blackboard and its own marker (敌能-85). The radius is not a key: the data has none, and 30 is only this page. */
const ZEAL_KEYS = ['duration', 'attack_speed', 'def', 'zeal'];
/** 【斗志昂扬】's radius in tiles (敌能-85). Centre distance, and the edge counts (敌能-3's rule, INF-0608). */
const ZEAL_REACH = 30;
/**
 * Who the blast may hit before the kind filter (敌能-85). 无法选择 and 迷彩 are named. Flying and 沉睡 are not excluded
 * (INF-0610, INF-0611). 隐匿 is not named, so it stays unselectable (索敌-2, INF-0612).
 */
const ZEAL_PICK = Object.freeze({ ignoreUntargetable: true, ignoreCamou: true, canHitFly: true, canHitSleep: true });

/**
 * Whether `bb` has exactly these keys and each value is a number.
 * @param {Record<string, unknown> | null | undefined} bb @param {readonly string[]} keys
 */
function exact(bb, keys) {
  if (!bb) return false;
  return Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');
}

/**
 * Whether a talent of this name, with this blackboard, is this family's (敌能-71, 敌能-85). Any other name is not
 * this family's concern.
 * @param {string} name @param {Record<string, unknown> | null | undefined} bb
 */
export function knightOwns(name, bb) {
  if (name === 'buff') return exact(bb, ARMOUR_KEYS) || exact(bb, ZEAL_KEYS);
  if (name === 'enhance') return exact(bb, BLOOD_KEYS);
  return true;
}

/**
 * One 【斗志昂扬】 (敌能-85). Attack speed is a flat add and DEF a direct multiplier (INF-0613). A second blast adds
 * `duration` seconds onto what is left (INF-0614): extend keeps the longer remainder, so the remainder offered is the
 * old one plus this blast.
 * @param {FoeContext} ctx @param {Unit} u
 */
function grantZeal(ctx, u) {
  const add = ctx.frames(ctx.bb.duration);
  const held = u.buffs.find((b) => b.key === ZEAL);
  const left = (held && held.left > 0 ? held.left : 0) + add;
  ctx.addBuff(u, { key: ZEAL, rule: 'extend', left, mods: { aspd: ctx.bb.attack_speed, defPct: ctx.bb.def } });
}

/**
 * The drone's blast (敌能-85): our operators and summons inside the radius, both seats. `foes` also returns neutrals
 * and our devices (敌人攻击-1); the page names 干员 and 召唤物, and a summon is an operator with `summoner`.
 * @param {FoeContext} ctx
 */
function zealBlast(ctx) {
  if (!exact(ctx.bb, ZEAL_KEYS)) return;
  for (const u of ctx.foes(ZEAL_REACH, ZEAL_PICK)) if (u.kind === KIND.OPERATOR) grantZeal(ctx, u);
}

/**
 * The howling armour (敌能-71), or the drone's refusal to attack (敌能-85). The armour is DEF and RES from the
 * appearance frame, for `duration` seconds; that frame's buff tick consumes the first frame (帧-1, 状态-3). The drone
 * does not wear the armour. Neither is silenceable.
 * @param {FoeContext} ctx
 */
function arm(ctx) {
  const bb = ctx.bb;
  if (!knightOwns('buff', bb)) return;
  if (exact(bb, ZEAL_KEYS)) {
    ctx.addBuff(ctx.self, { key: HOLD, flags: { noAttack: true } });
    return;
  }
  ctx.addBuff(ctx.self, { key: ARMOUR, left: ctx.frames(bb.duration), mods: { defFlat: bb.def, resFlat: bb.magic_resistance } });
}

/** The shared `buff` talent: howling armour on spawn, the drone's blast when it is knocked down (敌能-71, 敌能-85). @type {FoeBehavior} */
const buff = Object.freeze({ spawn: arm, death: zealBlast });

/**
 * One layer for each other enemy knocked down while it is on the field (敌能-71): ATK ×(1 + `atk`) and attack speed
 * +`attack_speed` per layer, up to `max_stack_cnt`, never expiring. A neutral unit does not count; a goal is no
 * knockdown (敌能-2). Not silenceable.
 * @type {FoeBehavior}
 */
const enhance = Object.freeze({
  down(ctx, dead) {
    const bb = ctx.bb;
    if (!knightOwns('enhance', bb) || dead.base.neutral === true) return;
    ctx.addBuff(ctx.self, { key: BLOOD, rule: 'stack', stacks: 1, maxStacks: bb.max_stack_cnt, left: -1, mods: { atkPct: bb.atk, aspd: bb.attack_speed } });
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const knightBehaviors = Object.freeze({ buff, enhance });
