// Element damage on a normal attack (docs/spec/foes.md 敌能-38). The enemy data has only the ratio; which element it
// is comes from a content extra `el` (the 元素-1 / burst-event index). A talent name here is shared with other
// blackboards, so a shape this file does not know stays uncovered (关卡-2) and does nothing at runtime.

import { elements } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** Talent names whose simple ratio blackboard is this ability (敌能-38). */
const ELEMENT_NAMES = new Set(['epdamage', 'empty', 'EpDamage', 'combat', 'attack']);
/** Keys that simple ratio blackboard may hold. `el` and `cross` are content extras, not enemy data. */
const ELEMENT_KEYS = new Set(['attack@ep_damage_ratio', 'el', 'cross']);
/** Keys 绯红歌伶's `AttackSpeedUp` may hold. `warning_stack_cnt` is the smoke, and is not read. */
const SPEED_KEYS = new Set(['attack_speed', 'duration', 'stack_cnt', 'warning_stack_cnt']);

/** An element id 1..5 (元素-1), and an integer — no exponent. @param {unknown} n */
function elementId(n) {
  return typeof n === 'number' && n === (n | 0) && n >= 1 && n <= 5;
}

/**
 * The ratio-only blackboard this ability claims (敌能-38): the ratio, and optionally `el` and `cross`.
 * @param {Record<string, unknown>} bb
 */
function elementShape(bb) {
  if (typeof bb['attack@ep_damage_ratio'] !== 'number') return false;
  for (const k of Object.keys(bb)) if (!ELEMENT_KEYS.has(k)) return false;
  if (bb.el !== undefined && !elementId(bb.el)) return false;
  if (bb.cross !== undefined && bb.cross !== 1) return false;
  return true;
}

/** 绯红歌伶's hit-count buff (敌能-38): the three numbers, and the smoke key if the data brought it. @param {Record<string, unknown>} bb */
function speedShape(bb) {
  if (typeof bb.attack_speed !== 'number' || typeof bb.duration !== 'number' || typeof bb.stack_cnt !== 'number') return false;
  for (const k of Object.keys(bb)) if (!SPEED_KEYS.has(k)) return false;
  return bb.warning_stack_cnt === undefined || typeof bb.warning_stack_cnt === 'number';
}

/**
 * Whether a talent of this name, with this blackboard, is the ability those names also mean (敌能-38). Any other name
 * is not this family's concern: the caller still asks FOE_NEEDS.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function elementHitOwns(name, bb) {
  if (ELEMENT_NAMES.has(name)) return elementShape(bb);
  if (name === 'AttackSpeedUp') return speedShape(bb);
  return true;
}

/**
 * The element hit (敌能-38). No `el`, or a blackboard this is not, and the attack is unchanged — never a default 凋亡.
 * `cross` 1 is the four neighbouring tiles (敌能-26), the element damage unscaled.
 * @type {FoeBehavior}
 */
const onHit = Object.freeze({
  attack: (ctx, mods) => {
    const bb = ctx.bb;
    if (!elementShape(bb) || typeof bb.el !== 'number') return mods;
    const el = elements.ELEMENTS[bb.el - 1];
    if (!el) return mods;
    const ep = ctx.stats(ctx.self).atk * bb['attack@ep_damage_ratio'];
    const hit = { ...mods, element: el, ep };
    return bb.cross === 1 ? { ...hit, cross: true, splashScale: 1 } : hit;
  },
});

/** One shared key: a second buff of it would wait out the first and then extend it (状态-2), which 不可叠加 is not. */
const PULSE = 'attackSpeedUp';

/**
 * 绯红歌伶 (敌能-38): every `stack_cnt` hits that count for 受击回复 (技能-2, `taken`), the enemies on the field then
 * gain `attack_speed` (直接加算) for `duration` seconds. One batch a turn. While the buff is up the batch is still
 * spent, and nothing is added or refreshed. Two of them in one turn still add it once.
 * @type {FoeBehavior}
 */
const AttackSpeedUp = Object.freeze({
  // Reading `taken` as it appears starts its count from 0 (敌能-2).
  spawn: (ctx) => { ctx.state.set('seen', ctx.taken); },
  tick: (ctx) => {
    const bb = ctx.bb;
    if (!speedShape(bb)) return;
    const seen = ctx.state.get('seen');
    if (ctx.taken - seen < bb.stack_cnt) return;
    ctx.state.set('seen', seen + bb.stack_cnt);
    if (ctx.self.buffs.some((b) => b.key === PULSE)) return;
    const left = ctx.frames(bb.duration);
    for (const u of ctx.enemies()) ctx.addBuff(u, { key: PULSE, left, mods: { aspd: bb.attack_speed } });
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const elementHitBehaviors = Object.freeze({
  epdamage: onHit, empty: onHit, EpDamage: onHit, combat: onHit, attack: onHit, AttackSpeedUp,
});
