// Traits (docs/spec/traits.md 职业-1…职业-6): what a profession branch changes about its operators, as data — who it
// can target and in which order, how many, whether its attack heals, hits per attack, lasting modifiers, cost on a
// kill, the retreat refund — plus behaviours by branch for the rest, acting through a context (ADR 0055).
import { FPS, secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff } from './buffs.js';
import { inflict } from './status.js';
import { dealDamage, heal } from './damage.js';
import { draw } from './rng.js';
import { dealEp } from './elements.js';
import { vsDamage, vsHeal, vsEp } from './vs.js';
import { afterOwnHit } from './riders.js';
import { talentKill, talentDealt, dotOnHit } from './talentfx.js';
import { trackTime } from './talenttime.js';
import { lifeDeploy } from './talentlife.js';
import { dealtSp } from './talentmore.js';
import { fightKill, comboHit, afterNonLethal } from './talentfight.js';
import { rangeKeys, inKeys } from './targeting.js';
import { woundedInRange } from './chain.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').TraitDef} TraitDef @typedef {import('./types.js').OperatorDef} OperatorDef */

/**
 * What every trait leaves out, by position (职业-1): a melee operator can and prefers to attack the enemies it blocks
 * (even flying or out of range) and cannot select other flying ones; a ranged one can select flying enemies and does
 * not prefer the ones it blocks.
 * @param {string} position @returns {TraitDef}
 */
export const defaultTrait = (position) => ({
  antiAir: position !== 'MELEE', blockedFirst: position === 'MELEE', filter: 'HATRED_DES', secondary: '', targets: 1,
  heal: false, hits: 1, mods: {}, flags: {}, killCost: 0, refund: 0.5, hitStatus: null, splash: null, aftershock: 0, unblockedScale: 1, selfHeal: 0, selfHealMax: Infinity, selfHealOn: 'attack',
  rangedTiles: false, meleeTiles: false, skillArts: false, immuneBlocking: [], hpDrain: 0, costDrain: null, zone: null, chain: null, healOnHit: 0,
  attackInSkill: false, idleMods: {}, idleFlags: {}, idleAirOnly: false, skillSplash: null, liftoffBlock: 0, fortress: 0, charge: null, skillHeal: 0, bullets: null, store: 0, epHeal: 0, funnel: null, boomerang: null, noAttack: false, free: false, noInspire: false, spendAtk: null, regenAura: 0,
  summonBlocked: false, summonBlockedScale: 1, trapTiles: false, doll: null, rangeTiles: false, vs: [], far: null, crowd: null, packed: null, whiles: [], extraArts: 0, counterArts: 0, epRider: null, burstHit: null, spOn: null, payStack: null, auras: [],
  firstCost: 0, firstRetreatRespawn: 1, refundUncapped: false, freeSummons: 0, summonRangedTiles: false, summonBoost: null, aftershocks: 1, secondLife: null, pushBoost: null, pullBoost: null, pullTrauma: null, rangedRefund: 0, onHit: [], stacks: [], talentSp: [], grit: null, nextAttack: [], rhythm: null, idleShield: null, layers: null, lowHp: null,
  lastStand: null, frostLife: null, costLife: null, hurt: null, reflect: null, prefer: [], hurtSleeping: false, sleepDot: 0, lowestArts: null,
  burstOn: [], pulses: [], palsyHit: 0, epOnHit: 0, healDot: null, startCost: 0, costCuts: [], retreatCut: 0, deployCut: null, costRate: 1, aloneCost: 0, deploySp: [],
  allySkill: null, spPulse: null, hurtAttackSp: 0, deployPick: [], downHeal: [], deployBuff: null, fieldRegen: 0, healGives: null, groundEpHeal: 1, seeStealth: false,
  minDamage: null, deployStun: null, deployBlast: null, fieldBuffs: [], shareGain: null, stackShare: null, healShare: 0, healMore: 0, statusHeal: null, lowHeal: null,
  overhealBarrier: null, healBarrier: null, skillEndHeal: null, resistRegen: 0, overflowBarrier: 0, sameTarget: null, skipStatus: '', attackerMods: null, hitStatusPlus: 0,
  energyScale: 1, kindStack: null, slainKinds: false, skillStrike: null, spendBoost: null, stayVuln: null, combo: null, nonLethal: null, chargedRider: 0, fieldVs: null,
  powerAttacks: null, timedBlast: null, firstBlock: null, bb: {},
});

/**
 * Each record's last trait and what it was made from — its position, its trait object and that object's own fields in
 * order, its talents' additions — given again while they are the same (the trait is asked for many times a frame). Not
 * part of the state.
 * @type {WeakMap<OperatorDef, { trait: TraitDef, position: string, src: unknown, fields: unknown[], talents: unknown }>}
 */
const traitMemo = new WeakMap();

/** An object's own fields and values in order. @param {unknown} o @returns {unknown[]} */
function fieldsOf(o) {
  const out = [];
  if (o !== null && typeof o === 'object') for (const k in o) if (Object.hasOwn(o, k)) out.push(k, /** @type {Record<string, unknown>} */ (o)[k]);
  return out;
}

/** Whether an object's own fields and values are still those listed. @param {unknown} o @param {unknown[]} fields */
function sameFields(o, fields) {
  if (o === null || typeof o !== 'object') return fields.length === 0;
  let i = 0;
  for (const k in o) {
    if (!Object.hasOwn(o, k)) continue;
    if (i >= fields.length || fields[i] !== k || !Object.is(fields[i + 1], /** @type {Record<string, unknown>} */ (o)[k])) return false;
    i += 2;
  }
  return i === fields.length;
}

/** The single fields only talents give (职业-26…职业-35): each the talents' when they have it. */
const TALENT_ONLY = Object.freeze(/** @type {const} */ (['rhythm', 'idleShield', 'layers', 'lowHp', 'lastStand', 'frostLife', 'costLife', 'hurt', 'reflect', 'hurtSleeping', 'sleepDot', 'lowestArts', 'palsyHit', 'epOnHit', 'healDot',
  'startCost', 'costCuts', 'retreatCut', 'deployCut', 'costRate', 'aloneCost', 'deploySp', 'allySkill', 'spPulse', 'hurtAttackSp', 'deployPick', 'downHeal', 'deployBuff',
  'fieldRegen', 'healGives', 'groundEpHeal', 'seeStealth', 'minDamage', 'deployStun', 'deployBlast', 'fieldBuffs', 'shareGain', 'stackShare', 'healShare', 'healMore', 'statusHeal',
  'lowHeal', 'overhealBarrier', 'healBarrier', 'skillEndHeal', 'resistRegen', 'overflowBarrier', 'sameTarget', 'skipStatus', 'attackerMods', 'hitStatusPlus', 'energyScale', 'kindStack',
  'slainKinds', 'skillStrike', 'spendBoost', 'stayVuln', 'combo', 'nonLethal', 'chargedRider', 'fieldVs', 'powerAttacks', 'timedBlast', 'firstBlock']));

/**
 * A trait with what its operator's talents add (职业-24…职业-27, 职业-30): their conditional modifiers, target 倍率, hit
 * effects, stacks, SP, auras and next attacks after the trait's own, their 法术伤害 on each hit and their first
 * deployment's cost added to its, their number of targets when it is more than a number the trait has, their 坚忍 and
 * the fields only talents give, their 倍率 by the enemies a splash reaches and their second life when the trait has none.
 * @param {TraitDef} t @param {Partial<TraitDef> | undefined} a @returns {TraitDef}
 */
function withTalents(t, a) {
  if (!a) return t;
  const more = typeof a.targets === 'number' && typeof t.targets === 'number' && a.targets > t.targets;
  const only = Object.fromEntries(TALENT_ONLY.filter((k) => a[k]).map((k) => [k, a[k]]));
  return {
    ...t, ...talentLists(t, a), extraArts: t.extraArts + (a.extraArts ?? 0), firstCost: t.firstCost + (a.firstCost ?? 0), ...(more ? { targets: a.targets } : {}),
    ...(a.grit ? { grit: a.grit } : {}), ...only, ...(a.packed && !t.packed ? { packed: a.packed } : {}), ...(a.secondLife && !t.secondLife ? { secondLife: a.secondLife } : {}),
  };
}

/** The trait's lists with its talents' after them (职业-24…职业-26, 职业-28, 职业-29). @param {TraitDef} t @param {Partial<TraitDef>} a */
const talentLists = (t, a) => ({
  whiles: [...t.whiles, ...(a.whiles ?? [])], vs: [...t.vs, ...(a.vs ?? [])], onHit: [...t.onHit, ...(a.onHit ?? [])], stacks: [...t.stacks, ...(a.stacks ?? [])],
  talentSp: [...t.talentSp, ...(a.talentSp ?? [])], auras: [...t.auras, ...(a.auras ?? [])], nextAttack: [...t.nextAttack, ...(a.nextAttack ?? [])],
  prefer: [...t.prefer, ...(a.prefer ?? [])], burstOn: [...t.burstOn, ...(a.burstOn ?? [])], pulses: [...t.pulses, ...(a.pulses ?? [])],
});

/**
 * An operator record's trait: its own fields over the defaults of its position (职业-1), with its talents' additions
 * (职业-24). The same object as the last time while the record's position, trait fields and talents' additions are the
 * same; never change it.
 * @param {OperatorDef} d @returns {TraitDef}
 */
export function traitOfDef(d) {
  const m = traitMemo.get(d);
  if (m !== undefined && m.position === d.position && m.src === d.trait && m.talents === d.talentTrait && sameFields(d.trait, m.fields)) return m.trait;
  const trait = withTalents({ ...defaultTrait(d.position), ...d.trait }, d.talentTrait);
  traitMemo.set(d, { trait, position: d.position, src: d.trait, fields: fieldsOf(d.trait), talents: d.talentTrait });
  return trait;
}

/** A deployed operator's trait. @param {Content} c @param {Unit} op @returns {TraitDef} */
export const traitOf = (c, op) => traitOfDef(c.operators[op.key]);

/** The key of the buff that holds a 傀儡师's phase (职业-15). */
export const DOLL = 'doll';
/** The phases, as the buff's value (职业-15): switching to the 替身, the 替身, switching back. Its own form has no buff. */
export const DOLL_PHASE = Object.freeze({ IN: 1, DOLL: 2, OUT: 3 });

/** A 傀儡师's phase: 0 in its own form (职业-15). @param {Unit} u */
export const dollPhase = (u) => u.buffs.find((b) => b.key === DOLL)?.value ?? 0;

/**
 * A 傀儡师's 替身 while it fights (职业-15 phase 2, 职业-16): its trait's `doll`; null in another phase, or for a unit
 * that is not one.
 * @param {Content} c @param {Unit} op @returns {TraitDef['doll']}
 */
export const dollNow = (c, op) => (dollPhase(op) === DOLL_PHASE.DOLL ? traitOf(c, op).doll : null);

/**
 * Whether an enemy is blocked by one of an operator's own summons (职业-14), as a test made for the units of now.
 * @param {World} w @param {Unit} op @returns {(e: Unit) => boolean}
 */
export function summonHeld(w, op) {
  const own = new Set(w.units.filter((u) => u.summoner === op.id).map((u) => u.id));
  return (e) => e.blockedBy >= 0 && own.has(e.blockedBy);
}

/**
 * A normal attack's maximum number of targets (职业-3): a number, the operator's 阻挡数 (at least 1), or every candidate.
 * @param {TraitDef} t @param {Unit} op
 */
export const traitTargets = (t, op) => (t.targets === 'all' ? Infinity : t.targets === 'blockCnt' ? Math.max(1, statsOf(op).blockCnt) : t.targets);

/**
 * The context a trait behaviour acts through (ADR 0055): the same functions as a skill's, with the trait's blackboard.
 * @typedef {object} TraitContext
 * @property {Readonly<Unit>} self
 * @property {Readonly<Record<string, number>>} bb
 * @property {number} frame
 * @property {(u: Unit) => import('./attrs.js').Stats} stats
 * @property {(target: Unit, init: import('./buffs.js').BuffInit) => void} addBuff
 * @property {(target: Unit, key: string) => void} removeBuff
 * @property {(target: Unit, key: import('./status.js').StatusKey, o?: import('./status.js').StatusOptions) => void} applyStatus
 * @property {(target: Unit, dmg: import('./damage.js').Damage) => number} dealDamage
 * @property {(target: Unit, element: import('./elements.js').Element, amount: number) => number} dealEp
 * @property {(target: Unit, amount: number) => number} heal
 * @property {(n: number) => void} gainCost
 */

/**
 * A trait's behaviour, by branch id (ADR 0055): at deployment, after each hit of its attacks, after a kill; whether its
 * operator may attack now (false: it may not); what an attack turn without a target does (true: it stored, its attack
 * interval starts again; false: nothing; undefined: the engine's own rule — 职业-6, 职业-12); which enemies it does not
 * select now (`skip`: true for one); whether it takes the place of the branch's own deployment effects for this operator
 * (true: no trait buff or upkeep from the engine).
 * @typedef {object} TraitBehavior
 * @property {(ctx: TraitContext) => void} [deploy]
 * @property {(ctx: TraitContext, target: Unit) => void} [hit]
 * @property {(ctx: TraitContext, target: Unit) => void} [kill]
 * @property {(ctx: TraitContext) => boolean | undefined} [canAttack]
 * @property {(ctx: TraitContext) => boolean | undefined} [store]
 * @property {(ctx: TraitContext) => boolean | undefined} [own]
 * @property {(ctx: TraitContext, target: Unit) => boolean | undefined} [skip]
 */

/** Gives the owner cost, up to the level's maximum (费用-1). @param {World} w @param {Content} c @param {number} seat @param {number} n */
export function gainCost(w, c, seat, n) {
  const p = w.players[seat];
  p.cost = Math.min(c.level.options.maxCost, p.cost + n);
}

/**
 * The context a behaviour of an operator acts through (技能-6, 职业-6; api.js CONTEXT_MEMBERS): its damage is the
 * operator's, and a kill by it is credited to the operator (职业-5).
 * @param {World} w @param {Content} c @param {Unit} op @param {Readonly<Record<string, number>>} bb @returns {TraitContext}
 */
export function actorContext(w, c, op, bb) {
  return {
    self: op, bb, frame: w.frame, stats: statsOf,
    addBuff: (t, init) => { addBuff(t, makeBuff({ src: op.id, ...init })); },
    removeBuff: (t, key) => { removeBuff(t, key); },
    applyStatus: (t, key, o) => { inflict(w, t, key, { ...o, src: op }); },
    dealDamage: (t, dmg) => creditedDamage(w, c, op, t, dmg),
    dealEp: (t, el, amount) => dealEp(w, t, el, amount * vsEp(w, c, op, t), op),
    heal: (t, amount) => heal(w, op, t, amount * vsHeal(w, c, op, t)),
    gainCost: (n) => { gainCost(w, c, op.owner, n); },
  };
}

/** @param {World} w @param {Content} c @param {Unit} op */
const contextOf = (w, c, op) => actorContext(w, c, op, traitOf(c, op).bb);

/** @param {Content} c @param {Unit} op @returns {TraitBehavior | null} */
function behaviorOf(c, op) {
  const branch = c.operators[op.key].branch ?? '', own = c.behaviors?.traits;
  return own && Object.hasOwn(own, branch) ? own[branch] : null;
}

/**
 * What an operator's trait behaviour answers (职业-6): its `canAttack`, `store` or `own`, undefined without one.
 * @param {World} w @param {Content} c @param {Unit} op @param {'canAttack' | 'store' | 'own'} name @returns {boolean | undefined}
 */
export function traitAsk(w, c, op, name) {
  const fn = behaviorOf(c, op)?.[name];
  return typeof fn === 'function' ? fn(contextOf(w, c, op)) : undefined;
}

/**
 * The enemies an operator's trait behaviour says it does not select now (职业-6: `skip`), as a test; null without one.
 * @param {World} w @param {Content} c @param {Unit} op @returns {((target: Unit) => boolean) | null}
 */
export function traitSkip(w, c, op) {
  const fn = behaviorOf(c, op)?.skip;
  if (typeof fn !== 'function') return null;
  const ctx = contextOf(w, c, op);
  return (t) => fn(ctx, t) === true;
}

/**
 * A newly deployed operator's trait (职业-4, 职业-10): its lasting modifiers and flags as a buff, its upkeep —
 * the HP drain each second, the cost it consumes — as buffs without an end — unless its behaviour owns them (职业-6),
 * then its talents' trackers and their buffs on its life (职业-26, 职业-27), then its behaviour's deploy.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function traitDeploy(w, c, op) {
  const t = traitOf(c, op);
  if (traitAsk(w, c, op, 'own') !== true) {
    if (Object.keys(t.mods).length > 0 || Object.keys(t.flags).length > 0) addBuff(op, makeBuff({ key: 'trait', src: op.id, mods: t.mods, flags: t.flags }));
    if (t.hpDrain > 0) addBuff(op, makeBuff({ key: 'drain', src: op.id, every: FPS, fixed: true, value: t.hpDrain }));
    if (t.costDrain) addBuff(op, makeBuff({ key: 'upkeep', src: op.id, every: secondsToFrames(t.costDrain.every), fixed: true, value: t.costDrain.cost }));
  }
  trackTime(w, c, op);
  lifeDeploy(w, c, op);
  behaviorOf(c, op)?.deploy?.(contextOf(w, c, op));
}

/**
 * After each hit of an operator's attack (职业-4, 职业-24): the trait's status on the target, its talents' hit effects in
 * order, then its behaviour.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target
 */
export function traitHit(w, c, op, target) {
  const t = traitOf(c, op);
  if (t.hitStatus && target.hp > 0) inflict(w, target, t.hitStatus.key, { seconds: t.hitStatus.seconds + (t.hitStatus.key === 'sluggish' ? t.hitStatusPlus : 0), src: op, ...(t.hitStatus.value !== undefined ? { value: t.hitStatus.value } : {}) });
  t.onHit.forEach((h, i) => { if ((h.when !== 'beyondRange' || !inBaseRange(c, op, target)) && (h.during === undefined || w.frame - op.born < secondsToFrames(h.during))) talentHit(w, op, target, { h, i }); });
  behaviorOf(c, op)?.hit?.(contextOf(w, c, op), target);
}

/** Whether a target has a tile in an operator's own range without its extensions (职业-34: 「原本攻击范围」). @param {Content} c @param {Unit} op @param {Unit} t */
function inBaseRange(c, op, t) {
  const grid = { rows: c.level.height, cols: c.level.width };
  return inKeys(t, rangeKeys(grid, op, op.range ?? c.operators[op.key].range, 0), grid);
}

/**
 * A talent's effect on a target its operator's attack hit (职业-24, 职业-25), while the target has HP (and is blocked by no
 * unit, for one that says so): once on each enemy for a
 * `first` one — the target keeps a buff `seen:<operator id>:<n>` without an end —; at its chance (one draw) when it has
 * one; its status (状态-5), or its modifiers for its seconds as a buff `talentHit:<operator id>:<n>`, the time starting
 * again at each hit; its damage over time (dotOnHit).
 * @param {World} w @param {Unit} op @param {Unit} target @param {{ h: import('./types.js').TalentHit, i: number }} at
 */
function talentHit(w, op, target, { h, i }) {
  if (target.hp <= 0 || (h.when === 'unblocked' && target.blockedBy >= 0)) return;
  if (h.first) {
    const seen = `seen:${op.id}:${i}`;
    if (target.buffs.some((b) => b.key === seen)) return;
    addBuff(target, makeBuff({ key: seen, src: op.id }));
  }
  if (h.prob !== undefined && draw(w) >= h.prob) return;
  if (h.status) inflict(w, target, h.status.key, { seconds: h.status.seconds, src: op, ...(h.status.value !== undefined ? { value: h.status.value } : {}) });
  if (h.debuff) {
    const key = `talentHit:${op.id}:${i}`;
    removeBuff(target, key);
    addBuff(target, makeBuff({ key, src: op.id, left: secondsToFrames(h.debuff.seconds), mods: h.debuff.mods }));
  }
  if (h.dot) dotOnHit(op, target, h.dot, i);
  if (h.ep && target.hp > 0) dealEp(w, target, /** @type {import('./elements.js').Element} */ (h.ep.el), h.ep.amount, op);
}

/**
 * An operator's attack or skill killed an enemy (职业-5, 职业-25): the trait's cost, its talents on kinds and 重伤 (fightKill,
 * 职业-34), its talents' kill (talentKill), then its behaviour.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target
 */
export function traitKill(w, c, op, target) {
  if (op.kind !== KIND.OPERATOR || target.kind !== KIND.ENEMY) return;
  const t = traitOf(c, op);
  if (t.killCost > 0) gainCost(w, c, op.owner, t.killCost);
  fightKill(w, c, op, target);
  talentKill(w, c, op);
  behaviorOf(c, op)?.kill?.(contextOf(w, c, op), target);
}

/**
 * Deals damage as an operator's attack or skill and credits a kill to it (职业-5): the target had HP before and has
 * none after. Returns the HP taken.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target @param {import('./damage.js').Damage} dmg
 */
export function creditedDamage(w, c, op, target, dmg) {
  vsDamage(w, c, op, target, dmg);
  const alive = target.hp > 0, taken = dealDamage(w, op, target, dmg, c);
  traitDealt(w, c, op, target, { dmg, taken });
  if (alive && target.hp <= 0) traitKill(w, c, op, target);
  afterOwnHit(w, c, op, target, { dmg, taken });
  return taken;
}

/**
 * Heals one operator for a share of damage this operator just dealt an enemy (职业-11): the most wounded one in attack
 * range; no such operator, no heal. The share is of the damage already determined (`taken`), including what the
 * enemy's remaining HP could not absorb.
 * @param {World} w @param {Content} c @param {Unit} op @param {number} taken @param {number} share
 */
function healOnDamage(w, c, op, taken, share) {
  const to = woundedInRange(w, c, op);
  if (to) w.events.push({ type: 'heal', id: op.id, target: to.id, amount: heal(w, op, to, taken * share * vsHeal(w, c, op, to)) });
}

/**
 * What a hit this operator dealt an enemy sets off (职业-9, 职业-11). A trait that heals itself for every hit
 * (`selfHealOn` 'damage', 武者) restores its `selfHeal` once for each hit of its that took HP from an enemy — any hit
 * with it as the source, an attack's or not. One that heals for the damage (`healOnHit`, 咒愈师) restores one operator
 * by that share of it. 生命流失 and a sourceless hit (伤害-7) aside, and so is a hit on anyone but an enemy. Such a hit
 * is also a step of its talents' damage stacks (职业-25) and gives their SP for damage (职业-31); a run of hits counts
 * it, a blow that may not kill leaves 重伤 (职业-34).
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target @param {{ dmg: import('./damage.js').Damage, taken: number }} hit the hit and the HP it took
 */
export function traitDealt(w, c, op, target, hit) {
  if (!(hit.taken > 0) || hit.dmg.hpLoss || hit.dmg.sourceless || target.kind !== KIND.ENEMY || op.hp <= 0) return;
  const t = traitOf(c, op);
  if (t.selfHealOn === 'damage' && t.selfHeal > 0) w.events.push({ type: 'heal', id: op.id, target: op.id, amount: heal(w, op, op, t.selfHeal, { trait: true }) });
  if (t.healOnHit > 0) healOnDamage(w, c, op, hit.taken, t.healOnHit);
  if (t.stacks.length) talentDealt(c, op, hit.dmg);
  if (t.talentSp.length) dealtSp(w, c, op);
  comboHit(w, c, op);
  afterNonLethal(w, c, op, target);
}
