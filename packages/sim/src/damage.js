// Damage and healing (docs/spec/damage.md): the official formulas, then the source's damage multipliers, then the
// target's 伤判 effects one buff at a time in event priority and acquisition order, then the HP; the hook events on the
// way (钩子-3).
import { powi, FPS } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf, activeBuffs } from './attrs.js';
import { removeBuff, stamp, count, makeBuff, addBuff } from './buffs.js';
import { draw } from './rng.js';
import { MIN_DAMAGE_RATIO } from './constants.js';
import { hurtSp, gainSp } from './sp.js';
import { emit, hasHook } from './bus.js';
import { worksMul } from './works.js';
import { inflict } from './status.js';
import { damageFloor } from './talentmore.js';
import { nonLethalCap } from './talentfight.js';
import { stealthed, liftoffRefused } from './targeting.js';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Buff} Buff @typedef {import('./types.js').World} World */
/** @typedef {import('./types.js').DamageType} DamageType */

/**
 * A hit, with the names of the Stronghold-compatible content interface (ADR 0012). `amount` is the base damage (伤害-6);
 * `mul` multiplies it after the defences and `cancel` stops it — both a `hit` handler's (钩子-3); the four ignore values
 * add to the source's penetration for this hit. Where it comes from: `isAttack` (an attack's hit), `isSkill` (made while
 * the skill runs or by it), `isSplash`, `isProjectile`, `tags`. `hpLoss` makes it 生命流失 (伤害-10). `canDodge` defaults
 * to true for physical and arts damage.
 * @typedef {object} Damage
 * @property {DamageType} type
 * @property {number} amount
 * @property {number} [mul]
 * @property {boolean} [cancel]
 * @property {number} [defIgnorePct] @property {number} [defIgnoreFlat] @property {number} [resIgnorePct] @property {number} [resIgnoreFlat]
 * @property {boolean} [isAttack] @property {boolean} [isSkill] @property {boolean} [isSplash] @property {boolean} [isProjectile]
 * @property {string[]} [tags]
 * @property {boolean} [canDodge]
 * @property {boolean} [hpLoss]
 * @property {boolean} [sourceless] 无来源 though credited to its source: the events see no source, the kill is its source's,
 *   without the source's penetration and multiplier (伤害-7)
 * @property {boolean} [throughSleep] 沉睡's invincibility does not stop it (伤害-7: a skill that damages the enemies it puts
 *   to sleep; 职业-28: an operator that can attack sleeping enemies); 无敌 still does, and so does 沉睡 on a unit also
 *   隐匿 or 无法选中
 * @property {import('./types.js').VsScale[]} [foe] the target 倍率 that held before the hit, for after it (职业-28)
 */

/** @typedef {{ defIgnorePct: number, defIgnoreFlat: number, resIgnorePct: number, resIgnoreFlat: number }} Penetration */
/** @typedef {{ def: number, res: number, epDamageResistance: number }} Defences */

/** @param {number} x */
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Damage after the target's defences (伤害-1…伤害-5): physical max(0.05A, A − (1 − I_p)·max(0, D − I_v)); arts
 * max(0.05A, A·(1 − R′/100)) with R′ = (1 − I_p)·max(0, R − I_v); elemental max(0.05A, A·(1 − E/100)); true A.
 * @param {number} amount A @param {DamageType} type @param {Defences} t @param {Penetration} pen
 */
export function mitigate(amount, type, t, pen) {
  if (type === 'phys') {
    const eff = (1 - pen.defIgnorePct) * Math.max(0, t.def - pen.defIgnoreFlat);
    return Math.max(amount - eff, MIN_DAMAGE_RATIO * amount);
  }
  if (type === 'arts') {
    const eff = (1 - pen.resIgnorePct) * Math.max(0, t.res - pen.resIgnoreFlat);
    return Math.max(amount * (1 - eff / 100), MIN_DAMAGE_RATIO * amount);
  }
  if (type === 'elemental') return Math.max(amount * (1 - t.epDamageResistance / 100), MIN_DAMAGE_RATIO * amount);
  return amount;
}

/**
 * The penetration of a hit: the source's plus the hit's own, the ratios held to [0, 1] and the fixed values to ≥ 0
 * (属性-3).
 * @param {import('./attrs.js').Stats | null} s @param {Partial<Penetration>} [extra] the hit's own (a Damage) @returns {Penetration}
 */
export function penetration(s, extra = {}) {
  /** @param {'defIgnorePct' | 'defIgnoreFlat' | 'resIgnorePct' | 'resIgnoreFlat'} k */
  const sum = (k) => (s ? s[k] : 0) + (extra[k] ?? 0);
  return {
    defIgnorePct: clamp01(sum('defIgnorePct')), defIgnoreFlat: Math.max(0, sum('defIgnoreFlat')),
    resIgnorePct: clamp01(sum('resIgnorePct')), resIgnoreFlat: Math.max(0, sum('resIgnoreFlat')),
  };
}

/** The source's damage multiplier (伤害-7 step 3). @param {import('./attrs.js').Stats} s @param {DamageType} type */
export const dealtMul = (s, type) => s.dmgDealtMul * (type === 'phys' ? s.physDealtMul : type === 'arts' ? s.artsDealtMul : 1);

/** A buff's taken multiplier for a type (伤害-8): 脆弱 covers physical, arts and true damage. @param {Buff} b @param {DamageType} type */
export function takenMul(b, type) {
  const m = b.mods, own = type === 'phys' ? m.physTakenMul : type === 'arts' ? m.artsTakenMul : type === 'true' ? m.trueTakenMul : m.elementalTakenMul;
  const all = type === 'elemental' ? undefined : m.dmgTakenMul, f = (all ?? 1) * (own ?? 1);
  return b.stacks === 1 ? f : powi(f, b.stacks);
}

/**
 * A buff's 受到伤害倍率 for a hit from a unit the target blocks (职业-18: 不屈者 UNY-X), its stacks' power; 1 for any
 * other hit. @param {Unit} u @param {Buff} b @param {Unit | null} src
 */
const blockedMul = (u, b, src) => (b.mods.blockedTakenMul !== undefined && src && src.blockedBy === u.id ? powi(b.mods.blockedTakenMul, b.stacks) : 1);

/** Whether a shield or barrier of the buff absorbs this type. @param {Buff} b @param {DamageType} type */
const absorbs = (b, type) => b.shieldType === '' || b.shieldType === type;

/** A buff that is only a shield goes once it is used up. @param {Unit} u @param {Buff} b */
function dropIfSpent(u, b) {
  const empty = b.shield <= 0 && b.shieldHits <= 0 && Object.keys(b.mods).length === 0 && Object.keys(b.flags).length === 0;
  if (empty) removeBuff(u, b);
}

/**
 * Sets what a buff's shield holds (content that changes it, 伤害-8): at least 0; a buff that is only a used-up shield goes.
 * @param {Unit} u @param {Buff} b @param {number} amount
 */
export function setShield(u, b, amount) {
  b.shield = Math.max(0, Number(amount) || 0);
  if (b.shield === 0) dropIfSpent(u, b);
}

/**
 * Sets a buff's 护盾 layers (a talent that adds them, 职业-27): whole layers, at least 0; a buff that is only used-up
 * layers goes. @param {Unit} u @param {Buff} b @param {number} n
 */
export function setShieldHits(u, b, n) {
  b.shieldHits = Math.max(0, Math.round(Number(n) || 0));
  if (b.shieldHits === 0) dropIfSpent(u, b);
}

/**
 * A buff's chance to dodge a hit (伤害-8, 伤害-12): its 物理闪避 or 法术闪避 by the hit's type, with its 近战物理闪避
 * (`dodgeMelee`) on a physical hit of the 近战途径 (one that is not a projectile's) — 1 − the product of what each lets
 * through; 0 without one.
 * @param {Buff} b @param {Damage} dmg
 */
function dodgeOf(b, dmg) {
  const m = b.mods, own = dmg.type === 'phys' ? m.dodgePhys : dmg.type === 'arts' ? m.dodgeArts : undefined;
  const melee = dmg.type === 'phys' && !dmg.isProjectile ? m.dodgeMelee : undefined;
  if (own === undefined && melee === undefined) return 0;
  return 1 - (1 - clamp01(own ?? 0)) * (1 - clamp01(melee ?? 0));
}

/** Whether a hit's source is an enemy whose 攻击方式 includes ranged (伤害-12). @param {Unit | null} src */
const rangedFoe = (src) => !!src && src.kind === KIND.ENEMY && (src.base.applyWay === 'RANGED' || src.base.applyWay === 'ALL');

/**
 * A buff's chance of 抵挡 for a hit (伤害-12): 伤害抵挡 (`blockAll`) for physical, arts and true damage, `blockPA` for
 * physical and arts, `blockPhys` for physical, `blockRangedPhys` for physical damage from an enemy whose 攻击方式 includes
 * ranged — 1 − the product of what each lets through; 0 for elemental damage.
 * @param {Buff} b @param {Damage} dmg @param {Unit | null} src
 */
function blockOf(b, dmg, src) {
  const m = b.mods, t = dmg.type;
  if (t === 'elemental') return 0;
  let keep = 1;
  for (const q of [m.blockAll, t !== 'true' ? m.blockPA : undefined, t === 'phys' ? m.blockPhys : undefined, t === 'phys' && rangedFoe(src) ? m.blockRangedPhys : undefined]) {
    if (q !== undefined && q > 0) keep *= 1 - clamp01(q);
  }
  return 1 - keep;
}

/**
 * A buff's taken multiplier by a hit's source (伤害-12), its stacks' power: `airTakenMul` on physical and arts damage
 * from a flying source; `from:<tag>` on physical, arts and true damage from an enemy with the tag, `fromPA:<tag>` on
 * physical and arts damage from one.
 * @param {Buff} b @param {Damage} dmg @param {{ src: Unit | null, tags: readonly string[] }} at
 */
function sourceMul(b, dmg, at) {
  const m = b.mods, t = dmg.type, pa = t === 'phys' || t === 'arts';
  const k = (m.airTakenMul !== undefined && pa && at.src && statsOf(at.src).flying ? m.airTakenMul : 1) * (at.tags.length && t !== 'elemental' ? tagMul(m, at.tags, pa) : 1);
  return b.stacks === 1 ? k : powi(k, b.stacks);
}

/**
 * The product of a buff's `from:<tag>` multipliers for the tags, and of its `fromPA:<tag>` ones on physical and arts
 * damage (伤害-12). @param {Record<string, number>} m @param {readonly string[]} tags @param {boolean} pa
 */
function tagMul(m, tags, pa) {
  let k = 1;
  for (const key in m) {
    if (!Object.hasOwn(m, key)) continue;
    if (key.startsWith('from:') && tags.includes(key.slice(5))) k *= m[key];
    else if (pa && key.startsWith('fromPA:') && tags.includes(key.slice(7))) k *= m[key];
  }
  return k;
}

/**
 * Whether a hit can be dodged (伤害-8): physical and arts damage unless the hit says not, nor a physical hit of a source
 * whose flags ignore 物理闪避 (`ignoreDodgePhys`, 伤害-12).
 * @param {Damage} dmg @param {Unit | null} src
 */
const dodgeable = (dmg, src) => (dmg.canDodge ?? true) && !(dmg.type === 'phys' && src && statsOf(src).flags.ignoreDodgePhys);

/**
 * One buff's 伤判 effects on a hit, in a fixed order within the buff: dodge, 抵挡, taken multipliers, shield, barrier
 * (伤害-8, 伤害-12); a hit from a unit it blocks also takes its 受到伤害倍率 for that, a physical or arts hit its 伤害减免 (a
 * number off, 职业-20). Returns the damage left — 0 ends the step (抵挡 too), −1 when the hit is dodged.
 * @param {World} w @param {Unit} u @param {Buff} b @param {number} amount @param {{ dmg: Damage, src: Unit | null, tags: readonly string[] }} hit
 */
function judge(w, u, b, amount, hit) {
  const { dmg, src } = hit, p = dodgeOf(b, dmg), q = blockOf(b, dmg, src);
  if (p > 0 && dodgeable(dmg, src) && draw(w) < 1 - powi(1 - p, b.stacks)) return -1;
  if (q > 0 && draw(w) < 1 - powi(1 - q, b.stacks)) return 0;
  let left = amount * takenMul(b, dmg.type) * blockedMul(u, b, src) * sourceMul(b, dmg, hit);
  if (b.mods.dmgReduceFlat && (dmg.type === 'phys' || dmg.type === 'arts')) left = Math.max(0, left - b.mods.dmgReduceFlat * b.stacks);
  if (b.shieldHits > 0 && absorbs(b, dmg.type)) {
    b.shieldHits--;
    dropIfSpent(u, b);
    return 0;
  }
  if (b.shield > 0 && absorbs(b, dmg.type)) {
    const take = Math.min(b.shield, left);
    b.shield -= take;
    left -= take;
    dropIfSpent(u, b);
  }
  return left;
}

/**
 * Whether a hit misses by its source's 命中率 (伤害-8, 技能-13): a physical or arts hit that can be dodged and has a source
 * whose hit rate (`hitRateMul`, 最终乘算) is below 1 misses at the chance 1 − the rate.
 * @param {World} w @param {Damage} dmg @param {Unit | null} src
 */
function misses(w, dmg, src) {
  if (!src || dmg.sourceless || (dmg.type !== 'phys' && dmg.type !== 'arts') || dmg.canDodge === false) return false;
  const h = statsOf(src).prod.hitRateMul;
  return h !== undefined && h < 1 && draw(w) >= h;
}

/** A unit's buff that keeps the frame of a tracked event (职业-26), when it has one. @param {Unit} u @param {string} key */
const tracker = (u, key) => u.buffs.find((b) => b.key === key);

/**
 * What a hit sets off on an operator as its 伤判 begins (职业-26, 职业-27) — dodged, 抵挡 or not —: the frame on its
 * `lastJudged` tracker; its talents' heal of itself, by its HP before the hit (`hurt.heal`: `high` HP below `below` of its
 * maximum, else `low`), and their status on an enemy source that is not invincible, 隐匿 or 无法选中 (`hurt.status`).
 * @param {World} w @param {Unit} u @param {Unit | null} src @param {import('./types.js').Content | undefined} c
 */
function judged(w, u, src, c) {
  const t = tracker(u, 'lastJudged');
  if (t) stamp(t, w.frame);
  const h = c && u.kind === KIND.OPERATOR ? c.operators[u.key]?.talentTrait?.hurt : undefined;
  if (!h || u.hp <= 0) return;
  if (h.heal) w.events.push({ type: 'heal', id: u.id, target: u.id, amount: heal(w, u, u, u.hp < h.heal.below * statsOf(u).maxHp ? h.heal.high : h.heal.low) });
  if (h.status && src && reachable(src)) inflict(w, src, h.status.key, { seconds: h.status.seconds, src: u });
}

/** Whether a talent's status reaches the enemy that hurt it (职业-27): one with HP, not invincible, 隐匿 or 无法选中. @param {Unit} e */
function reachable(e) {
  const f = statsOf(e).flags;
  return e.kind === KIND.ENEMY && e.hp > 0 && !f.invincible && !stealthed(e) && !f.untargetable;
}

/** A dodge or a miss (伤害-8): the `dodge` event (钩子-3), and one more on the target's `dodges` tracker (职业-26). @param {World} w @param {Unit} u @param {Unit | null} src @param {Damage} dmg */
function dodged(w, u, src, dmg) {
  emit(w, 'dodge', { source: src, target: u, dmg });
  const t = tracker(u, 'dodges');
  if (t) count(t, 1);
}

/**
 * One layer of a deployment shield broke (部署-8, 干员-14). The talent's break stacks its ATK and DEF — additive, and
 * with no end, the description's 持续时间无限 — and grants SP. gainSp grants none while the skill runs (技能-2). A
 * shield that is not tagged is not one of these layers. Without `max`, the cap grows so the stacks are not stuck at 1.
 * @param {Unit} u @param {number} n @param {import('./types.js').Content | undefined} c
 */
function brokeShield(u, n, c) {
  const br = c && u.kind === KIND.OPERATOR ? c.operators[u.key]?.deployTalents?.[n]?.break : undefined;
  if (!br) return;
  if (br.sp && u.skill) gainSp(u.skill, br.sp);
  if (!br.mods) return;
  const cur = u.buffs.find((b) => b.key === 'shieldBreak');
  const cap = br.max ?? (cur ? cur.stacks + 1 : 1);
  addBuff(u, makeBuff({ key: 'shieldBreak', src: u.id, rule: 'stack', mods: br.mods, maxStacks: cap }));
}

/**
 * The target's 伤判 effects in turn (伤害-8): what the hit sets off as they begin (judged), a miss by the source's hit
 * rate, then its active buffs by event priority, highest first, then acquisition order. One that cancels the hit or
 * brings it to 0 ends the step; a dodge or a miss is the `dodge` event (钩子-3). `from`: the source the events see, the
 * source the kill is counted for (`credit`; the events' source when omitted), the tags of an enemy source (伤害-12), the
 * content (for the target's talents and a buff's `take`).
 * @param {World} w @param {Unit} u @param {number} amount @param {Damage} dmg
 * @param {{ src?: Unit | null, credit?: Unit | null, tags?: readonly string[], c?: import('./types.js').Content }} [from]
 */
export function takeDamage(w, u, amount, dmg, from = {}) {
  const src = from.src ?? null, tags = from.tags ?? [], credit = from.credit === undefined ? src : from.credit;
  judged(w, u, src, from.c);
  if (misses(w, dmg, src)) { dodged(w, u, src, dmg); return 0; }
  const order = activeBuffs(u.buffs).map((b, i) => ({ b, i })).sort((x, y) => y.b.prio - x.b.prio || x.i - y.i);
  let left = amount;
  for (const { b } of order) {
    const hits = b.shieldHits;
    const hit = { dmg, src, credit, tags, c: from.c };
    left = judge(w, u, b, left, hit);
    // The layer is already spent, and the buff may already be gone: the object still shows the drop (部署-8).
    if (b.tag === 'shieldBreak' && b.shieldHits < hits) brokeShield(u, b.n, from.c);
    if (left > 0) left = applyTake(w, u, b, left, hit);
    if (left < 0) dodged(w, u, src, dmg);
    if (!(left > 0)) return 0;
  }
  return left;
}

/**
 * A buff behaviour's replacement of the damage this buff has left (伤害-8), after its own dodge, block, multipliers,
 * shield and barrier. The behaviour is the content's, by `act` or the buff's key. A result that is not a finite number
 * leaves the damage as it was.
 * @param {World} w @param {Unit} u @param {Buff} b @param {number} amount
 * @param {{ dmg: Damage, src: Unit | null, credit: Unit | null, tags: readonly string[], c?: import('./types.js').Content }} hit
 */
function applyTake(w, u, b, amount, hit) {
  const next = hit.c?.behaviors?.buffs?.[b.act || b.key]?.take?.(w, u, b, amount, hit);
  return typeof next === 'number' && Number.isFinite(next) ? Math.max(0, next) : amount;
}

/** The source a hit's events show (钩子-3): none for a `sourceless` one (伤害-7). @param {Unit | null} src @param {Damage} dmg */
const seenOf = (src, dmg) => (dmg.sourceless ? null : src);

/**
 * HP a 特殊生命值 hit removes (敌能-39, 敌能-43): 1, or 0 when a type filter rejects the hit. No filter accepts every
 * type. 生命流失 is the whole amount. The event and the return stay `amount` either way.
 * @param {Record<string, boolean>} flags @param {Damage} dmg @param {number} amount
 */
function countedLoss(flags, dmg, amount) {
  if (dmg.hpLoss || !flags.hitCount) return amount;
  const typed = flags.hitPhys || flags.hitArts || flags.hitTrue || flags.hitElement;
  if (!typed) return 1;
  if (dmg.type === 'phys') return flags.hitPhys ? 1 : 0;
  if (dmg.type === 'arts') return flags.hitArts ? 1 : 0;
  if (dmg.type === 'true') return flags.hitTrue ? 1 : 0;
  if (dmg.type === 'elemental') return flags.hitElement ? 1 : 0;
  return 0;
}

/**
 * Takes HP (伤害-9): never below 1 for an undying unit (不死; its maximum when below 1); at 0 or below the unit is at 0
 * and leaves the field at the end of the frame (帧-1) — unless a `fatal` handler prevents it (钩子-3): then it keeps 1 HP
 * (its maximum when below 1). A 特殊生命值 unit (敌能-39) loses 1 instead of `amount`, or 0 when its type filter rejects
 * the hit (敌能-43), except for 生命流失; the event and the return stay `amount`. Then the `damaged` event. The
 * hit counts as its source's (the kill's), also when the events see none.
 * @param {World} w @param {Unit | null} src @param {Unit} t @param {number} amount @param {Damage} dmg
 */
function loseHp(w, src, t, amount, dmg) {
  const seen = seenOf(src, dmg), s = statsOf(t);
  const hurt = !dmg.hpLoss && amount > 0 ? tracker(t, 'lastHurt') : undefined;
  if (hurt) stamp(hurt, w.frame);
  t.hp -= countedLoss(s.flags, dmg, amount);
  if (t.hp <= 0 && s.flags.undying) t.hp = Math.min(1, s.maxHp);
  if (t.hp <= 0) {
    t.hp = 0;
    const saved = hasHook(w, 'fatal') && emit(w, 'fatal', { unit: t, source: seen, credit: src, dmg, amount, prevented: false }).prevented;
    if (saved && t.hp < 1) t.hp = Math.min(1, statsOf(t).maxHp);
  }
  w.events.push({ type: 'hit', id: src ? src.id : -1, target: t.id, damage: amount });
  if (hasHook(w, 'damaged')) emit(w, 'damaged', { source: seen, credit: src, target: t, amount, type: dmg.type, dmg });
  return amount;
}

/** A hit's fields the events show, filled in (钩子-3): `mul` 1, no `tags`, not cancelled, no penetration. @param {Damage} dmg */
function settle(dmg) {
  dmg.mul ??= 1;
  dmg.tags ??= [];
  dmg.cancel ??= false;
  dmg.defIgnorePct ??= 0;
  dmg.defIgnoreFlat ??= 0;
  dmg.resIgnorePct ??= 0;
  dmg.resIgnoreFlat ??= 0;
}

/**
 * Whether a unit's invincibility stops a hit (伤害-7, 状态-5): 无敌 always, 沉睡 unless the hit goes through it and the
 * unit is neither 隐匿 nor 无法选中 (with those it counts as invincible anyway).
 * @param {Unit} target @param {Damage} dmg
 */
function untouchable(target, dmg) {
  const f = statsOf(target).flags;
  return !!(f.invincible || (f.sleep && !(dmg.throughSleep && !stealthed(target) && !f.untargetable)));
}

/**
 * Whether a hit stops before the defences (伤害-7, 阻挡-2): the target is invincible or gone, or a ground enemy or
 * hostile device is hitting a unit that took off. 起飞 is judged once here, before `hit`, so that event does not see a
 * refused hit and a handler that lifts the target does not cancel this one. A sourceless hit has no selecting source.
 * @param {World} w @param {Unit | null} src @param {Unit} target @param {Damage} dmg
 */
function hitStops(w, src, target, dmg) {
  if (untouchable(target, dmg) || target.hidden) return true;
  if (liftoffRefused(dmg.sourceless ? null : src, target)) return true;
  return !hitGoesOn(w, src, target, dmg);
}

/**
 * The `hit` event before the defences (钩子-3): whether the hit goes on — not cancelled, the target still on the field
 * with HP, not made invincible by a handler.
 * @param {World} w @param {Unit | null} src @param {Unit} target @param {Damage} dmg
 */
function hitGoesOn(w, src, target, dmg) {
  if (!hasHook(w, 'hit')) return true;
  emit(w, 'hit', { source: seenOf(src, dmg), credit: src, target, dmg });
  return !dmg.cancel && target.hp > 0 && w.units.includes(target) && !untouchable(target, dmg);
}

/**
 * The `hpDamage` event after the 伤判 effects (钩子-3): a handler may lower what reaches the HP, never raise it.
 * @param {World} w @param {Unit | null} src @param {Unit} target @param {number} amount @param {Damage} dmg
 */
function hpDamage(w, src, target, amount, dmg) {
  if (!(amount > 0) || !hasHook(w, 'hpDamage')) return amount;
  const k = emit(w, 'hpDamage', { source: seenOf(src, dmg), credit: src, target, amount, dmg });
  return Number.isFinite(k.amount) ? Math.max(0, Math.min(amount, k.amount)) : amount;
}

/**
 * Every unit's 生命回复 this frame (属性-6): one on the field with HP below its maximum regains its 生命回复速度 — and its
 * 生命回复速度（百分比） (`hpRegenRatio`, summed, held to [0, 1]) × its maximum HP — ÷ 30, up to the maximum. It is not a heal: no event, no
 * healing multipliers, 禁疗 does not stop it.
 * @param {World} w
 */
export function regenAll(w) {
  for (const u of w.units) {
    if (u.hp <= 0) continue;
    const s = statsOf(u), per = s.hpRecoveryPerSec + Math.min(1, Math.max(0, s.sum.hpRegenRatio ?? 0)) * s.maxHp;
    if (per > 0 && u.hp < s.maxHp) u.hp = Math.min(s.maxHp, u.hp + per / FPS);
  }
}

/**
 * A hit's source with its seat runes' SP on dealing damage (符文-4): for each, with its chance (one draw), its SP.
 * @param {World} w @param {import('./types.js').Content} c @param {Unit} src
 */
function runeSp(w, c, src) {
  const chances = c.operators[src.key]?.probSp;
  if (!chances || !src.skill) return;
  for (const p of chances) if (draw(w) < p.prob) gainSp(src.skill, p.sp);
}

/**
 * An enemy source's tags (关卡-1), for the multipliers by them (伤害-12); none without the content, or for another source.
 * @param {import('./types.js').Content | undefined} c @param {Unit | null} src @returns {readonly string[]}
 */
const tagsOf = (c, src) => (c && src && src.kind === KIND.ENEMY ? /** @type {{ tags?: string[] }} */ (c.enemies[src.key] ?? {}).tags ?? [] : []);

/**
 * An attack's hit after the defences, not below its source's floor (职业-31: damageFloor), nor above what its source may
 * take without killing (职业-34: nonLethalCap); given the content.
 * @param {import('./types.js').Content | undefined} c @param {Unit | null} seen @param {Unit} target @param {Damage} dmg @param {number} amount
 */
const floored = (c, seen, target, dmg, amount) => (c && seen ? nonLethalCap(c, seen, target, dmg.isAttack ? Math.max(amount, damageFloor(c, seen, target)) : amount) : amount);

/**
 * An accepted hit counts for an enemy's on-hit talent (敌能-38), at the same gate as 受击回复 — only once an ability of
 * its has asked for the count, so other enemies carry nothing. Operators are not counted.
 * @param {Unit} target
 */
function tallyTaken(target) {
  if (target.kind === KIND.ENEMY && target.ab && Object.hasOwn(target.ab, '@taken')) target.ab['@taken'] += 1;
}

/**
 * Deals a hit (伤害-7): nothing to a unit already at 0 HP; 生命流失 goes straight to the HP; nothing to an invincible
 * unit (无敌, 沉睡, disappeared: 路线-4); nothing from a ground enemy or a hostile device onto a unit that took off
 * (起飞, 阻挡-2) — judged once, before `hit`, so a handler that lifts the target does not cancel this hit; otherwise the
 * `hit` event, then the hit counts for 受击回复 (技能-2) — and, for an enemy, its on-hit tally (敌能-38) — and for
 * its source's rune SP (符文-4; given the content), then the target's defences, `mul`, an attack's floor by its source's
 * talents (职业-31; given the content), the source's multiplier, the 工事 multiplier (地图-3; given the content), the target's 伤判
 * effects, the `hpDamage` event, then the HP. A `sourceless` hit takes neither its source's penetration nor its
 * multipliers, and its events see no source (`credit` names it). Returns the damage that reached the HP (伤害-9): for
 * 特殊生命值 (敌能-39) that is still the calculated damage, while the HP itself falls by 1.
 * @param {World} w @param {Unit | null} src @param {Unit} target @param {Damage} dmg @param {import('./types.js').Content} [c]
 */
export function dealDamage(w, src, target, dmg, c) {
  if (target.hp <= 0) return 0;
  settle(dmg);
  if (dmg.hpLoss) return loseHp(w, src, target, dmg.amount, dmg);
  if (hitStops(w, src, target, dmg)) return 0;
  hurtSp(target);
  tallyTaken(target);
  if (c && src && !dmg.sourceless) runeSp(w, c, src);
  const seen = seenOf(src, dmg), ss = seen ? statsOf(seen) : null;
  let amount = mitigate(dmg.amount, dmg.type, statsOf(target), penetration(ss, dmg)) * /** @type {number} */ (dmg.mul);
  amount = floored(c, seen, target, dmg, amount);
  if (ss) amount *= dealtMul(ss, dmg.type) * (c && seen ? worksMul(c, seen, target) : 1);
  amount = hpDamage(w, src, target, takeDamage(w, target, amount, dmg, { src: seen, credit: src, tags: tagsOf(c, seen), ...(c ? { c } : {}) }), dmg);
  return amount > 0 ? loseHp(w, src, target, amount, dmg) : 0;
}

/**
 * A unit knocked down outright (敌能-24, 敌能-30): its HP to 0, 不死 or not; it leaves at the frame's end as any whose HP
 * ran out.
 * @param {Unit} u
 */
export function knockDown(u) {
  u.hp = 0;
}

/**
 * Content sets a unit's HP outright (伤害-9): between 0 (1 for an undying unit) and its maximum — neither damage nor a
 * heal, no event; a unit set to 0 leaves at the frame's end as any whose HP ran out.
 * @param {Unit} u @param {number} hp
 */
export function setHp(u, hp) {
  const s = statsOf(u);
  u.hp = Math.min(s.maxHp, Math.max(s.flags.undying ? Math.min(1, s.maxHp) : 0, Number(hp) || 0));
}

/**
 * Heals (伤害-11): the amount times the healer's 治疗倍率 and the target's 受到治疗倍率, nothing under 禁疗, never above
 * the maximum HP; a `heal` handler may change the amount before it is applied (钩子-3) and sees whether it is the
 * healer's trait's self-heal (`trait`, 职业-9). A unit no ally may heal (`noAllyHeal`, 职业-9) takes heals only from
 * itself, and those even under 禁疗; one that is `free` of 禁疗 (职业-29) heals under it. Returns the HP restored.
 * @param {World} w @param {Unit | null} src @param {Unit} target @param {number} amount @param {{ trait?: boolean, free?: boolean }} [how]
 */
export function heal(w, src, target, amount, how = {}) {
  if (target.hp <= 0) return 0;
  const ts = statsOf(target), own = src === target && ts.flags.noAllyHeal === true;
  if ((ts.flags.noAllyHeal && src !== target) || (ts.flags.healFree && !own && !how.free)) return 0;
  let amt = amount * (src ? statsOf(src).healingDealtMul : 1) * ts.healingTakenMul;
  if (hasHook(w, 'heal')) {
    const k = emit(w, 'heal', { source: src, target, amount: amt, trait: how.trait === true });
    amt = Number.isFinite(k.amount) ? Math.max(0, k.amount) : 0;
    if (target.hp <= 0 || !w.units.includes(target)) return 0;
  }
  const actual = Math.max(0, Math.min(amt, ts.maxHp - target.hp));
  target.hp = Math.min(ts.maxHp, target.hp + actual);
  return actual;
}
