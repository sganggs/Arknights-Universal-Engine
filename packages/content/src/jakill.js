// 杰斯顿·威廉姆斯 (docs/spec/foes.md 敌能-146): two forms. 狱警形态 from the start — RES up, ranged arts attacks that never
// pick a flyer, and 钢铁风暴 (攻击回复, 敌能-36's count) stunning two —; the first knockdown is 敌能-18's rebirth at full HP,
// and the frame it ends 杀手形态 begins: every prisoner on the field is liberated (敌能-17), ATK, DEF, attack interval and
// speed change, it attacks only what blocks it, physical, and 装甲穿刺 hits twice through 60 % of DEF. `reborn` (敌能-78's
// name) and `enhance` (敌能-71's) are shared: helmknights.js's `reborn` hands this shape to the hooks below, and `enhance`
// only holds the numbers `reborn` reads. They act only through the context (ADR 0055).

import { beginRebirth, endRebirth } from './avenger.js';
import { liberate } from './prisoners.js';
import { isSkillAttack } from './charged.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** 狱警形态's RES, from its appearance until the rebirth clears every buff (敌能-146). No other family uses the key. */
const WARDEN = 'warden';
/** 杀手形态's ATK, DEF, attack interval and speed, from the frame the rebirth ends; holding it is being in that form. */
const KILLER = 'killer';

/** The read page's shapes, each with its `page` marker (敌能-146, INF-0930). */
const REBORN_KEYS = Object.freeze(['sp', 'duration', 'page']);
const ENHANCE_KEYS = Object.freeze(['magic_resistance', 'atk', 'def', 'base_attack_time', 'move_speed', 'page']);
const STORM_KEYS = Object.freeze(['stun', 'max_target', 'page']);
const PIERCE_KEYS = Object.freeze(['times', 'def_penetrate', 'page']);

/**
 * Whether `bb` has exactly these keys, each a number.
 * @param {Record<string, unknown> | null | undefined} bb @param {readonly string[]} keys
 */
const exact = (bb, keys) => !!bb && Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/**
 * The read `reborn` (敌能-146): `sp` below 0 is the page's 清空自身SP; no source says what another value would be (INF-0930).
 * @param {Record<string, unknown> | null | undefined} bb
 */
export const wardenReborn = (bb) => exact(bb, REBORN_KEYS) && Number(bb?.sp) < 0;

/** The read `enhance`: both forms' numbers, read by `reborn` (敌能-146). @param {Record<string, unknown> | null | undefined} bb */
export const wardenEnhance = (bb) => exact(bb, ENHANCE_KEYS);

/**
 * Whether a skill of this name, with this blackboard, is the read page's (敌能-146); any other name passes. `reborn` and
 * `enhance` are their owners' (rebornOwns, knightOwns), which ask wardenReborn and wardenEnhance.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function jakillOwns(name, bb) {
  if (name === 'ironsandstorm') return exact(bb, STORM_KEYS);
  if (name === 'armorpiercing') return exact(bb, PIERCE_KEYS);
  return true;
}

/** Whether it is in 杀手形态 (敌能-146). @param {FoeContext} ctx */
const killer = (ctx) => ctx.self.buffs.some((b) => b.key === KILLER);

/**
 * A form's buff, given again when it is missing (INF-0935): one copy, no end.
 * @param {FoeContext} ctx @param {string} key @param {Record<string, number>} mods
 */
function keep(ctx, key, mods) {
  if (!ctx.self.buffs.some((b) => b.key === key)) ctx.addBuff(ctx.self, { key, mods });
}

/** `enhance`'s numbers, or null when that talent is not the read shape (敌能-146). @param {FoeContext} ctx */
function numbers(ctx) {
  const e = ctx.talent('enhance');
  return e && wardenEnhance(e) ? e : null;
}

/** 狱警形态: RES +`magic_resistance`, 直接加算 (INF-0932). @param {FoeContext} ctx @returns {Record<string, number>} */
function guardMods(ctx) {
  const n = numbers(ctx);
  return n ? { resFlat: n.magic_resistance } : {};
}

/** 杀手形态: ATK, DEF, attack interval and speed, each 直接加算 (INF-0935). @param {FoeContext} ctx @returns {Record<string, number>} */
function killerMods(ctx) {
  const n = numbers(ctx);
  return n ? { atkFlat: n.atk, defFlat: n.def, batFlat: n.base_attack_time, moveFlat: n.move_speed } : {};
}

/** 狱警形态 from its appearance (敌能-146). @type {NonNullable<FoeBehavior['spawn']>} */
export function wardenSpawn(ctx) {
  if (wardenReborn(ctx.bb)) keep(ctx, WARDEN, guardMods(ctx));
}

/** The first knockdown stays: 敌能-18's rebirth at full HP, as 敌能-78's (敌能-146). @type {NonNullable<FoeBehavior['fatal']>} */
export const wardenFatal = (ctx) => wardenReborn(ctx.bb) && beginRebirth(ctx, 1);

/**
 * Each turn (敌能-146): the rebirth ends as 敌能-18's; until it has, 狱警形态's buff stays. From the frame it has ended,
 * 杀手形态 — every prisoner on the field liberated, once — and its buff stays (INF-0931, INF-0935, INF-0937).
 * @type {NonNullable<FoeBehavior['tick']>}
 */
export function wardenTick(ctx) {
  if (!wardenReborn(ctx.bb)) return;
  endRebirth(ctx);
  const st = ctx.state;
  if (st.get('reviving')) return;
  if (!st.get('done')) { keep(ctx, WARDEN, guardMods(ctx)); return; }
  if (!st.get('killer')) {
    st.set('killer', 1);
    for (const u of ctx.allies(Infinity)) liberate(ctx, u);
  }
  keep(ctx, KILLER, killerMods(ctx));
}

/**
 * Whom it attacks (敌能-146): 狱警形态 never a flyer, its skill neither (INF-0932); 杀手形态 only what blocks it (INF-0936).
 * @type {NonNullable<FoeBehavior['targets']>}
 */
export function wardenTargets(ctx, cands) {
  if (!wardenReborn(ctx.bb)) return cands;
  if (!killer(ctx)) return cands.filter((u) => !ctx.stats(u).flying);
  const b = ctx.blocker();
  return b ? cands.filter((u) => u === b) : [];
}

/** 狱警形态's attacks are arts, 杀手形态's physical (敌能-146). @type {NonNullable<FoeBehavior['attack']>} */
export const wardenAttack = (ctx, mods) => {
  if (!wardenReborn(ctx.bb)) return mods;
  return { ...mods, type: killer(ctx) ? 'phys' : 'arts' };
};

/**
 * 钢铁风暴 (敌能-146): 狱警形态's 攻击回复 skill, counted as 敌能-36's (INF-0933); the attack it replaces reaches the first
 * `max_target` of that attack's targets at 100 %, each hit stunning `stun` s (INF-0934). Arts is the form's: a talent's
 * attack hook runs before a skill's. 杀手形态 neither counts nor casts it.
 * @type {FoeBehavior}
 */
const ironsandstorm = Object.freeze({
  attack: (ctx, mods) => {
    if (killer(ctx) || !jakillOwns('ironsandstorm', ctx.bb) || !isSkillAttack(ctx)) return mods;
    return { ...mods, skill: true, targets: ctx.bb.max_target, hitStatus: { key: 'stun', seconds: ctx.bb.stun } };
  },
});

/**
 * 装甲穿刺 (敌能-146): 杀手形态's 攻击回复 skill, counted the same way; the attack it replaces is `times` hits at 100 %, each
 * ignoring `def_penetrate` of the target's DEF (攻击-4's `ignoreDef`, INF-0936), physical as the form's. 狱警形态 neither
 * counts nor casts it.
 * @type {FoeBehavior}
 */
const armorpiercing = Object.freeze({
  attack: (ctx, mods) => {
    if (!killer(ctx) || !jakillOwns('armorpiercing', ctx.bb) || !isSkillAttack(ctx)) return mods;
    return { ...mods, skill: true, times: mods.times * ctx.bb.times, ignoreDef: Math.max(mods.ignoreDef ?? 0, ctx.bb.def_penetrate) };
  },
});

/** The behaviours of this file, by skill name; its talents' are helmknights.js's `reborn` and knights.js's `enhance`. @type {Readonly<Record<string, FoeBehavior>>} */
export const jakillBehaviors = Object.freeze({ ironsandstorm, armorpiercing });
