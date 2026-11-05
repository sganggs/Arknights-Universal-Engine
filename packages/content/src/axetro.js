// “遗弃者” (docs/spec/foes.md 敌能-138): each hit of its normal attack that deals damage adds a layer of ATK and attack
// speed, and `delay` s out of the attack state take every layer away. The layers are its `atkup` in one exact shape —
// a name shared with 敌能-8 and 敌能-27, so foes.js's one `atkup` hands this shape to `axetroHit` —; the clearing is its
// `checker`, which no other enemy has. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** The layers: one stacking buff with no end (状态-2). Not `atkup`, the key of 低血强化's buff (敌能-8). */
const LAYERS = 'axetroStack';
/** The stacking `atkup` (敌能-138): exactly these three numbers. */
const STACK_KEYS = Object.freeze(['atk', 'attack_speed', 'max_stack_cnt']);
/** Keys no other `atkup` shape has (敌能-8, 敌能-27): an `atkup` with one of them is the stacking one or nothing. */
const OWN_KEYS = Object.freeze(['attack_speed', 'max_stack_cnt']);
/** The `checker` (敌能-138): exactly the seconds out of the attack state. */
const CHECK_KEYS = Object.freeze(['delay']);

/**
 * Whether `bb` has exactly these keys and each value is a number.
 * @param {Record<string, unknown>} bb @param {readonly string[]} keys
 */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/**
 * Whether an `atkup` blackboard has a key only the stacking shape has (敌能-138): then it is neither 低血强化 nor
 * 冻结增伤, and does something only in its exact shape. @param {Record<string, unknown>} bb
 */
export const axetroKeyed = (bb) => OWN_KEYS.some((k) => Object.hasOwn(bb, k));

/**
 * Whether a talent of this name, with this blackboard, is one this family understands (敌能-138): an `atkup` with the
 * stacking keys only in the exact shape — every other `atkup` is 敌能-8's or 敌能-27's and passes —, a `checker` only
 * as exactly `delay`. Any other name is not this family's concern.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function axetroOwns(name, bb) {
  if (name === 'atkup') return !axetroKeyed(bb) || exact(bb, STACK_KEYS);
  if (name === 'checker') return exact(bb, CHECK_KEYS);
  return true;
}

/**
 * One layer for a hit of its normal attack that took HP (敌能-138, INF-0850): ATK 直接乘算 +`atk` and attack speed
 * 直接加算 +`attack_speed` a layer, at most `max_stack_cnt`, no end. A dodged, blocked, absorbed or invincible hit took
 * none. `hit` runs after the damage, so this hit was dealt at the ATK before its layer.
 * @type {NonNullable<FoeBehavior['hit']>}
 */
export const axetroHit = (ctx, _target, dealt) => {
  const bb = ctx.bb;
  if (!exact(bb, STACK_KEYS) || !(dealt > 0)) return;
  ctx.addBuff(ctx.self, { key: LAYERS, rule: 'stack', stacks: 1, maxStacks: bb.max_stack_cnt, left: -1, mods: { atkPct: bb.atk, aspd: bb.attack_speed } });
};

/**
 * The attack state and its end (敌能-138, INF-0851): from an attack's start (`attack`) to its hit or its cancel — a
 * swing still under way as its turn starts —, `at` being the last such frame. `delay` s after it, with no attack started
 * since, every layer goes as its turn starts, before that frame's attack. A talent: silence does not stop it.
 * @type {FoeBehavior}
 */
const checker = Object.freeze({
  attack: (ctx, mods) => {
    if (exact(ctx.bb, CHECK_KEYS)) ctx.state.set('at', ctx.frame);
    return mods;
  },
  tick: (ctx) => {
    const self = ctx.self;
    if (!exact(ctx.bb, CHECK_KEYS)) return;
    if (self.swing) { ctx.state.set('at', ctx.frame); return; }
    if (!self.buffs.some((b) => b.key === LAYERS)) return;
    if (ctx.frame - ctx.state.get('at') >= ctx.frames(ctx.bb.delay)) ctx.removeBuff(self, LAYERS);
  },
});

/** The behaviours of this file, by talent name. `atkup` stays the one object in foes.js. @type {Readonly<Record<string, FoeBehavior>>} */
export const axetroBehaviors = Object.freeze({ checker });
