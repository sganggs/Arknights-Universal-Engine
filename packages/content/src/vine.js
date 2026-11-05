// 纠缠藤蔓 (docs/spec/foes.md 敌能-140). Its `StunAttack` — only `stun`, plus this page's `page` — is 致幻缠绕, 敌能-36's
// attack-recovery stun; the one `StunAttack` behaviour stays in rockman.js and asks this file for the shape. Its `Weak`
// answers only 环境伤害, which no terrain or device of the engine deals: that shape is covered and does nothing. They act
// only through the context (ADR 0055).

import { chargedBehaviors } from './charged.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').skills.AttackMods} AttackMods */

/** 致幻缠绕's keys (敌能-140): the data's `stun` and the page marker. 眩晕击's carry `atk_scale` too (敌能-83). */
const TANGLE_KEYS = Object.freeze(['stun', 'page']);
/** The vine's `Weak` (敌能-140): the data's two numbers and the page marker. 古老藤蔓 has the two and no marker. */
const WEAK_KEYS = Object.freeze(['weak[limit]', 'damage_scale', 'page']);

/** Whether a blackboard has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exactly = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** Whether a `StunAttack` blackboard is 致幻缠绕's (敌能-140). @param {Record<string, unknown>} bb */
export const tangleShape = (bb) => exactly(bb, TANGLE_KEYS);

/**
 * 致幻缠绕 (敌能-140): 敌能-36's 眩晕打击 as it is — each attack started gathers a point, and the attack that starts with
 * the cost gathered (ready, not silenced) is the skill's: it spends the points and stuns its target `stun` seconds.
 * @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods}
 */
export const tangle = (ctx, mods) => chargedBehaviors.stuncombat.attack?.(ctx, mods) ?? mods;

/**
 * Whether a talent or skill of this name is this file's shape (关卡-2): a `Weak` only as the vine's, so 量产巨像's, 虚像's,
 * “超甜微笑”'s and the unmarked 古老藤蔓's stay uncovered. Any other name passes.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export const vineOwns = (name, bb) => name !== 'Weak' || exactly(bb, WEAK_KEYS);

/**
 * The vine's `Weak` (敌能-140, INF-0872): its 脆弱 comes only from 环境伤害 — 热泵通道 on its stage. A sourceless hit is
 * not that (元素爆发, an operator talent's), so there is nothing for it to answer.
 * @type {Readonly<Record<string, FoeBehavior>>}
 */
export const vineBehaviors = Object.freeze({ Weak: Object.freeze({}) });
