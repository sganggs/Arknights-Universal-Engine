// The howling and boiling knight orders (docs/spec/foes.md 敌能-71). `buff` and `enhance` are shared talent names, so
// only these two blackboards, with the page marker of the six pages read, are this family (关卡-2). The armour is one
// buff from the appearance frame; a layer comes from the `down` hook when another enemy is knocked down (敌能-2). They
// act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').Unit} Unit */

/** One armour, so a second copy cannot queue behind it (状态-2). Not the talent name: that name is shared. */
const ARMOUR = 'howl';
/** One stacking layer buff. Permanent, so a later death replaces nothing that would expire. */
const BLOOD = 'blood';
/** The howling armour blackboard and the page marker (敌能-71). */
const ARMOUR_KEYS = ['duration', 'def', 'magic_resistance', 'page'];
/** The boiling layer blackboard and the page marker (敌能-71). */
const BLOOD_KEYS = ['atk', 'attack_speed', 'max_stack_cnt', 'page'];

/**
 * Whether `bb` has exactly these keys and each value is a number.
 * @param {Record<string, unknown> | null | undefined} bb @param {readonly string[]} keys
 */
function exact(bb, keys) {
  if (!bb) return false;
  return Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');
}

/**
 * Whether a talent of this name, with this blackboard, is this family's (敌能-71). Any other name is not this family's
 * concern.
 * @param {string} name @param {Record<string, unknown> | null | undefined} bb
 */
export function knightOwns(name, bb) {
  if (name === 'buff') return exact(bb, ARMOUR_KEYS);
  if (name === 'enhance') return exact(bb, BLOOD_KEYS);
  return true;
}

/**
 * The howling armour (敌能-71): DEF and RES from the appearance frame, for `duration` seconds. One buff; the appearance
 * frame's buff tick consumes the first frame (帧-1, 状态-3). Not silenceable.
 * @type {FoeBehavior}
 */
const buff = Object.freeze({
  spawn(ctx) {
    const bb = ctx.bb;
    if (!knightOwns('buff', bb)) return;
    ctx.addBuff(ctx.self, { key: ARMOUR, left: ctx.frames(bb.duration), mods: { defFlat: bb.def, resFlat: bb.magic_resistance } });
  },
});

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
