// Attacks (spec 攻击-1…攻击-3, 敌人攻击-1, 索敌-1…索敌-5, 伤害-7, 职业-1…职业-5): when the cooldown is out, the first
// candidates in the official order are locked and a swing starts; at the end of its wind-up they take hits of the
// attacker's attack — a healer's heals, a ranged attacker's projectiles — and the attacker waits out its interval.
import { FPS, secondsToFrames, hypot } from '@aue/math';
import { KIND, ANIM } from '@aue/schema';
import { offsetTile, dirVec, frontOf } from './dir.js';
import { push, pull, PULL_POINT } from './displacement.js';
import { statsOf, computeStats, intervalFrames } from './attrs.js';
import { inKeys, selectable, sortEnemies, sortAllies, firstN, evadesGround, hostile, friendly, stealthed } from './targeting.js';
import { dealDamage, heal } from './damage.js';
import { emit, hasHook } from './bus.js';
import { pathDistance } from './routes.js';
import { enforceCapacity } from './blocking.js';
import { blockingImmunity } from './upkeep.js';
import { zoneScale, chainOf } from './chain.js';
import { vsDamage, vsHeal, vsEp, tagsOf } from './vs.js';
import { traitWhiles } from './whiles.js';
import { afterOwnHit, attacked, hitSp, caughtSp } from './riders.js';
import { reachKeys } from './reach.js';
import { ALLY_COLLIDER_RADIUS } from './constants.js';
import { foeTargets, foeAttack, foeHit, isFoeOf } from './foes.js';
import { makeBuff, addBuff, removeBuff } from './buffs.js';
import { tileOf } from './body.js';
import { tickSkill, beforeAttack, attackMods, afterAttack } from './skills.js';
import { skillCounter } from './skilltext.js';
import { palsyInterrupts, inflict } from './status.js';
import { draw } from './rng.js';
import { dealEp, rampageAttack, restoreEp } from './elements.js';
import { mayAttack, healsNow, healerNow, inSkill, skillIdle, holdFrames, modeMods, releaseEnergy, healOrder, funnelScale, fortressTargets, fortressSplash } from './modes.js';
import { traitOf, traitOfDef, traitTargets, traitHit, traitKill, traitDealt, traitAsk, traitSkip, summonHeld, dollNow } from './traits.js';
import { timingOf, windupFrames, shoots, launch, flyShots, boomerangOut, PALSY_CUT_FRAMES } from './swing.js';
import { talentSp, hurtAttackSp } from './talentfx.js';
import { epHealMul } from './talentmore.js';
import { healMore } from './talentheal.js';
import { gainSp } from './sp.js';
import { sameTargetStep, attackerHit, critScale, powerAttack, ammoChance } from './talentfight.js';
import { timedAttack, attackEnded } from './talenttime.js';
import { lowestArts } from './talentfoe.js';
import { palsyCut, epOnHit, healDotOn } from './talentelem.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').Cell} Cell @typedef {import('./attrs.js').Stats} Stats */

/**
 * The tile an operator's range offset lands on: offsets are written facing right and turn with the facing (spec 攻击-1,
 * 方向-2).
 * @param {Unit} op @param {Cell} off @returns {Cell}
 */
export function rangeCell(op, off) {
  const [row, col] = offsetTile(op.y, op.x, off.row, off.col, op.dir);
  return { row, col };
}

/**
 * What an operator's normal attack can target, in the official order (索敌-1…索敌-3, 职业-1, 职业-2, 职业-12, 职业-14).
 * One that heals now: the operators in range that are not at full HP (or, restoring element values, have element
 * damage) and not under 禁疗, by 生命比例升序. Otherwise the selectable enemies with a tile in range (flying ones only
 * with 可对空) and, when the trait prefers them, the enemies it blocks wherever they stand, flying or not (阻挡-4), and,
 * when the trait reaches them, those its own summons block — ordered by the trait's filters.
 * @param {World} w @param {Content} c @param {Unit} op @returns {Unit[]}
 */
export function targetsOf(w, c, op) {
  const grid = { rows: c.level.height, cols: c.level.width }, d = c.operators[op.key], t = traitOfDef(d);
  const keys = reachKeys(c, op);
  if (healsNow(c, op)) return healOrder(c, op, w.units.filter((u) => u.kind === KIND.OPERATOR && u.hp > 0 && inKeys(u, keys, grid) && !statsOf(u).flags.healFree && !statsOf(u).flags.noAllyHeal));
  const held = (/** @type {Unit} */ u) => t.blockedFirst && u.blockedBy === op.id, air = t.idleAirOnly && !inSkill(op), sleep = t.hurtSleeping;
  const any = { canHitFly: true, canHitSleep: sleep, canHitStealth: t.seeStealth }, sel = { canHitFly: t.antiAir || !!dollNow(c, op)?.antiAir, canHitSleep: sleep, canHitStealth: t.seeStealth };
  const bySummon = t.summonBlocked ? summonHeld(w, op) : () => false, skip = talentSkip(c, op, traitSkip(w, c, op));
  const cands = w.units.filter((u) => hostile(u)
    && ((held(u) && selectable(u, any)) || ((bySummon(u) || (inKeys(u, keys, grid, t.rangeTiles) && (!air || statsOf(u).flying))) && selectable(u, sel))) && !skip?.(u));
  const prefer = t.prefer.map((p) => preferOf(w, c, op, p));
  return fortressTargets(w, c, op, sortEnemies(op, cands, { blockedFirst: t.blockedFirst, pathDist: (e) => pathDistance(c, e), filter: t.filter, secondary: t.secondary, prefer }));
}

/**
 * A 二次过滤器 of a talent (职业-28, 职业-35): an enemy with the status, with the tag, or — for its `during` seconds from the
 * deployment — without a hit's mark of the operator (`lacksHit`). @param {World} w @param {Content} c @param {Unit} op
 * @param {import('./types.js').TraitDef['prefer'][number]} p @returns {(e: Unit) => boolean}
 */
function preferOf(w, c, op, p) {
  if (p.during !== undefined && w.frame - op.born >= secondsToFrames(p.during)) return () => false;
  if (p.lacksHit) return (e) => !e.buffs.some((b) => b.key.startsWith(`talentHit:${op.id}:`));
  return (e) => (p.status ? !!statsOf(e).flags[p.status] : !!p.tag && tagsOf(c, e).includes(p.tag));
}

/**
 * The targets an operator's talents leave alone (职业-34), with its trait's: those under its `skipStatus`, the 重伤 ones
 * for a `nonLethal` one. @param {Content} c @param {Unit} op @param {((u: Unit) => boolean) | null | undefined} skip
 */
function talentSkip(c, op, skip) {
  const t = traitOf(c, op), status = t.skipStatus, dying = !!t.nonLethal;
  if (!status && !dying) return skip;
  return (/** @type {Unit} */ u) => !!skip?.(u) || (!!status && !!statsOf(u).flags[status]) || (dying && !!statsOf(u).flags.dying);
}

/**
 * Content sets the frames until a unit's next attack may start (攻击-2): content that resets or clears it; at least 0.
 * @param {Unit} u @param {number} frames
 */
export function setAtkCd(u, frames) {
  u.atkCd = Math.max(0, Math.round(frames));
}

/** The enemy an operator attacks first (索敌-3). @param {World} w @param {Content} c @param {Unit} op @returns {Unit | null} */
export const pickTarget = (w, c, op) => targetsOf(w, c, op)[0] ?? null;

/** @typedef {import('./skills.js').AttackMods} AttackMods @typedef {import('./types.js').Swing} Swing */
/**
 * What an attack carries to one target: its damage type and amount, hits, 元素损伤, and an operator's splash and
 * aftershock (职业-8) and chain (职业-11); whether the skill makes it, and which of its hits this is (钩子-3).
 * @typedef {{ type: import('./types.js').DamageType, amount: number, times: number, element: string, ep: number, splash?: import('./types.js').Splash | null,
 *   aftershock?: number, chain?: import('./types.js').Chain | null, ranged?: boolean, hitStatus?: { key: import('./status.js').StatusKey, seconds: number, value?: number, prob?: number } | null,
 *   hitDebuff?: { seconds: number, mods: Record<string, number> }, displace?: { pull: boolean, force: number, along?: boolean },
 *   skill?: boolean, hit?: 'splash' | 'chain' | 'aftershock', mark?: number, frozen?: number, packed?: { cnt: number, atk: number }, aftershocks?: number, ignoreDef?: number }} Load
 */

/**
 * A hit's damage, with where it comes from (钩子-3, the names of Stronghold's content): an attack's hit on its target,
 * on one splashed or jumped to; an aftershock is a splash and no attack's hit; whether the skill made it; a projectile's.
 * Its amount × `frozen` on a target 冻结 as the hit is worked out (敌能-27).
 * @param {Load} load @param {Unit} t @returns {import('./damage.js').Damage}
 */
function damageOf(load, t) {
  const amount = load.frozen && statsOf(t).flags.freeze ? load.amount * load.frozen : load.amount;
  const how = load.hit, d = /** @type {import('./damage.js').Damage} */ ({ type: load.type, amount, isAttack: how !== 'aftershock', isSkill: !!load.skill, isProjectile: !!load.ranged,
    ...(load.ignoreDef ? { defIgnorePct: load.ignoreDef } : {}) });
  if (how === 'splash' || how === 'aftershock') d.isSplash = true;
  if (how === 'chain' || how === 'aftershock') d.tags = [how];
  return d;
}

/**
 * One target's hits of an attack that lands (伤害-6, 伤害-7, 元素-2, 职业-4, 职业-5): `times` hits of the amount, each
 * followed by the attack's 元素损伤 if it carries one; an operator's hit that kills is credited to it, then its trait
 * acts on the hit; then the `attackHit` event with what they took (钩子-3). The source may be gone (a projectile whose
 * shooter left): then the hit has no source and no event.
 * @param {World} w @param {Content} c @param {Unit | null} src @param {Unit} t @param {Load} load
 */
function hitTarget(w, c, src, t, load) {
  let total = 0;
  for (let k = 0; k < load.times; k++) total += oneHit(w, c, src, t, load);
  if (src && load.displace && t.hp > 0) displaceOnHit(w, c, src, t, load.displace);
  if (src) emit(w, 'attackHit', { attacker: src, target: t, dealt: total, kind: load.hit ?? 'main', isSkill: !!load.skill, mark: load.mark ?? 0 });
}

/**
 * A skill's push or pull on a target its attack reached, once per attack (技能-9, 位移-2, 位移-4): a pull toward 0.5
 * tiles in front of the attacker — stronger on a far target, with 移动创伤, as its trait says (职业-23) —; a push along its
 * facing (`along`), else away from it.
 * @param {World} w @param {Content} c @param {Unit} src @param {Unit} t @param {{ pull: boolean, force: number, along?: boolean }} d
 */
function displaceOnHit(w, c, src, t, d) {
  const [dr, dc] = dirVec(src.dir), at = { x: src.x, y: src.y }, tr = traitOf(c, src);
  if (!d.pull) { push(w, c, t, d.force, { from: at, ...(d.along ? { dir: { x: dc, y: dr } } : {}) }); return; }
  const far = tr.pullBoost && hypot(t.x - src.x, t.y - src.y) > tr.pullBoost.range ? tr.pullBoost.level : 0;
  pull(w, c, t, d.force + far, { to: { x: src.x + dc * PULL_POINT, y: src.y + dr * PULL_POINT }, by: at,
    ...(tr.pullTrauma ? { trauma: { per: tr.pullTrauma.perTile, every: Math.max(1, secondsToFrames(tr.pullTrauma.every)), src: src.id } } : {}) });
}

/**
 * A hit's damage on a target (damageOf), an operator's by its trait's 倍率 for the target (职业-17).
 * @param {World} w @param {Content} c @param {Unit | null} op @param {Unit} t @param {Load} load
 */
function hitDamage(w, c, op, t, load) {
  const dmg = damageOf(load, t);
  if (op) vsDamage(w, c, op, t, dmg);
  return dmg;
}

/**
 * The options of a hit's status (状态-5): its seconds, its source, its strength when it has one.
 * @param {{ seconds: number, value?: number }} h @param {Unit | null} src
 */
const statusOf = (h, src) => ({ seconds: h.seconds, src, ...(h.value !== undefined ? { value: h.value } : {}) });

/**
 * What rides on a hit of an attack, after the rest of it (职业-20, 职业-25): on an operator's, its trait's riders and the SP
 * for it on its main target; on an operator an enemy's attack hit, its trait's reply and, when it took HP, its talents'
 * SP for it.
 * @param {World} w @param {Content} c @param {{ src: Unit | null, t: Unit, load: Load }} h @param {import('./damage.js').Damage} dmg @param {number} dealt
 */
function ridesOn(w, c, h, dmg, dealt) {
  const { src, t, load } = h;
  if (src && src.kind === KIND.OPERATOR) {
    afterOwnHit(w, c, src, t, { dmg, taken: dealt });
    if (!load.hit) hitSp(c, src, t);
  } else if (src && t.kind === KIND.OPERATOR) {
    attacked(w, c, t, src, dmg);
    skillCounter(w, c, t, src, dmg);
    attackerHit(c, t, src);
    if (dealt > 0 && t.hp > 0) talentSp(w, c, t, 'attacked');
  }
}

/**
 * One hit of an attack on a target (伤害-7, 元素-2, 职业-5, 职业-17, 职业-20): the damage, what it sets off, a kill
 * credited, the 元素损伤 it carries, the status it gives, the trait's hit, what rides on it. Returns the HP taken.
 * @param {World} w @param {Content} c @param {Unit | null} src @param {Unit} t @param {Load} load
 */
function oneHit(w, c, src, t, load) {
  const el = /** @type {import('./elements.js').Element | ''} */ (load.element), op = src && src.kind === KIND.OPERATOR ? src : null;
  const alive = t.hp > 0, dmg = hitDamage(w, c, op, t, load), dealt = dealDamage(w, src, t, dmg, c);
  if (op) traitDealt(w, c, op, t, { dmg, taken: dealt });
  if (dealt > 0) afterDamage(w, c, { src, t, dealt, ranged: !!load.ranged });
  if (op && alive && t.hp <= 0) traitKill(w, c, op, t);
  if (el && load.ep > 0) dealEp(w, t, el, load.ep * vsEp(w, c, src, t), src);
  if (alive && t.hp > 0) hitEffects(w, t, load, src);
  if (op && alive) traitHit(w, c, op, t);
  ridesOn(w, c, { src, t, load }, dmg, dealt);
  return dealt;
}

/**
 * What a hit gives a target that is still up (状态-5, 技能-9): its status — at its chance when it has one —, its timed
 * modifiers.
 * @param {World} w @param {Unit} t @param {Load} load @param {Unit | null} src
 */
function hitEffects(w, t, load, src) {
  const h = load.hitStatus;
  if (h && !(h.prob !== undefined && draw(w) >= h.prob)) inflict(w, t, h.key, statusOf(h, src));
  if (load.hitDebuff) debuffOnHit(t, load.hitDebuff, src);
}

/**
 * A skill's modifiers on a target its hit reached, for some seconds (技能-9): one buff per source, `hitDebuff:<its id>`,
 * the time starting again at each hit.
 * @param {Unit} t @param {{ seconds: number, mods: Record<string, number> }} d @param {Unit | null} src
 */
function debuffOnHit(t, d, src) {
  const key = `hitDebuff:${src ? src.id : -1}`;
  removeBuff(t, key);
  addBuff(t, makeBuff({ key, src: src ? src.id : -1, left: secondsToFrames(d.seconds), mods: d.mods }));
}

/**
 * What an enemy's hit that dealt damage sets off (敌能-2). An operator's heal for damage it dealt is traitDealt (职业-11).
 * @param {World} w @param {Content} c @param {{ src: Unit | null, t: Unit, dealt: number, ranged: boolean }} h
 */
function afterDamage(w, c, h) {
  if (h.src && h.src.kind === KIND.ENEMY) foeHit(w, c, h.src, h.t, { dealt: h.dealt, ranged: h.ranged });
}

/** The attack of an attacker, with an attack bonus for this attack only (敌能-11). @param {Unit} a @param {number} [pct] */
const atkOf = (a, pct) => (pct ? computeStats({ base: a.base, buffs: [...a.buffs, makeBuff({ key: 'attackBonus', mods: { atkPct: pct } })] }).atk : statsOf(a).atk);

/**
 * What an attack carries to each target (攻击-2): its type, the attack × 攻击力倍率 (the attack's × the attacker's, 伤害-6),
 * hits, 元素损伤. @param {Unit} a @param {AttackMods} mods @returns {Load}
 */
const loadOf = (a, mods) => ({
  type: mods.type ?? a.base.dmgType, amount: atkOf(a, mods.atkPct) * mods.scale * statsOf(a).atkScaleMul, times: mods.times, element: mods.element ?? '',
  ep: (mods.ep ?? 0) + (mods.epScale ? statsOf(a).atk * mods.epScale : 0),
  ...(mods.hitStatus ? { hitStatus: mods.hitStatus } : {}), ...(mods.hitDebuff ? { hitDebuff: mods.hitDebuff } : {}), ...(mods.displace ? { displace: mods.displace } : {}), ...(mods.skill ? { skill: true } : {}), ...(mods.mark ? { mark: mods.mark } : {}),
  ...(mods.frozen ? { frozen: mods.frozen } : {}), ...(mods.ignoreDef ? { ignoreDef: mods.ignoreDef } : {}),
});

/**
 * The units an enemy's tile splash reaches (敌能-7, 敌能-8): those it may attack on the target's tile and the four tiles
 * next to it (a cross), or the eight around it (a square). The locked target is included while 隐匿; the others are not
 * when 隐匿 is in effect (索敌-2). 迷彩 does not leave one out.
 * @param {World} w @param {Unit} a @param {Unit} t @param {'cross' | 'square'} area @returns {Unit[]}
 */
function areaOf(w, a, t, area) {
  const [r, col] = tileOf(t);
  return w.units.filter((u) => {
    if (u.hp <= 0 || u.hidden || !isFoeOf(u, a) || evadesGround(a, u)) return false;
    if (u !== t && stealthed(u)) return false;
    const [ur, uc] = tileOf(u), dr = Math.abs(ur - r), dc = Math.abs(uc - col);
    return area === 'square' ? Math.max(dr, dc) <= 1 : dr + dc <= 1;
  });
}

/**
 * An operator's attack against one target (职业-8, 职业-11, 职业-12, 职业-14): its amount × the trait's 倍率 for enemies
 * it does not block or its summons block, its zone's 倍率 and its funnel's, and the trait's splash, aftershock and chain;
 * an enemy's as it is.
 * @param {World} w @param {Content} c @param {Unit} a @param {Unit} t @param {Load} load @returns {Load}
 */
function loadFor(w, c, a, t, load) {
  if (a.kind !== KIND.OPERATOR) return load;
  const tr = traitOf(c, a);
  return {
    ...load, amount: load.amount * traitScale(w, c, a, t) * funnelScale(c, a, t), splash: tr.skillSplash && inSkill(a) ? tr.skillSplash : tr.splash, aftershock: tr.aftershock, chain: tr.chain,
    ...(tr.aftershocks !== 1 ? { aftershocks: tr.aftershocks } : {}),
    ...(tr.packed ? { packed: tr.packed } : {}),
  };
}

/**
 * An attacker's attack 倍率 against one target by its trait (职业-8, 职业-11, 职业-14): an operator's trait 倍率 for an
 * enemy it does not block × its 倍率 for one its own summons block × its zone's 倍率; 1 for any other attacker.
 * @param {World} w @param {Content} c @param {Unit} a @param {Unit} t
 */
export function traitScale(w, c, a, t) {
  if (a.kind !== KIND.OPERATOR) return 1;
  const tr = traitOf(c, a), bySummon = tr.summonBlockedScale !== 1 && summonHeld(w, a)(t);
  return (t.blockedBy !== a.id ? tr.unblockedScale : 1) * (bySummon ? tr.summonBlockedScale : 1) * zoneScale(c, a, t, tr);
}

/**
 * The enemies a splash around a target reaches (职业-8): every other enemy on the field within the radius of it —
 * hidden ones not, 隐匿 ones not while it is in effect (索敌-2), 迷彩 ones still; flying ones only when the splash is
 * not ground-only.
 * @param {World} w @param {Unit} t @param {import('./types.js').Splash} s @returns {Unit[]}
 */
function splashOf(w, t, s) {
  return w.units.filter((u) => u !== t && hostile(u) && u.hp > 0 && !u.hidden && !stealthed(u)
    && !(s.ground && statsOf(u).flying) && (u.x - t.x) * (u.x - t.x) + (u.y - t.y) * (u.y - t.y) <= s.radius * s.radius);
}

/**
 * An attack reaching its target (攻击-2, 攻击-3, 职业-8, 职业-17): the target takes the hits; with a splash every other
 * enemy around it takes them at the splash's share; an aftershock repeats both at its share of the amount. An attack
 * whose splash reaches enough enemies, the target's included, hits at the trait's 倍率 for that.
 * @param {World} w @param {Content} c @param {Unit | null} src @param {Unit} t @param {Load} load
 */
export function impact(w, c, src, t, load) {
  const s = load.splash, around = s ? splashOf(w, t, s) : [];
  const amount = load.packed && around.length + 1 >= load.packed.cnt ? load.amount * load.packed.atk : load.amount;
  for (const k of load.aftershock ? [1, ...Array.from({ length: load.aftershocks ?? 1 }, () => /** @type {number} */ (load.aftershock))] : [1]) {
    const shock = k === 1 ? {} : { hit: /** @type {const} */ ('aftershock') };
    if (t.hp > 0) hitTarget(w, c, src, t, { ...load, amount: amount * k, ...shock });
    for (const u of around) if (u.hp > 0) hitTarget(w, c, src, u, { ...load, amount: amount * k * (s?.scale ?? 1), hit: 'splash', ...shock });
  }
  if (load.chain) jumpHits(w, c, src, t, load);
}

/**
 * A damage chain's jumps after its first target was hit (职业-11): each next enemy takes the hits at the chain's share
 * of the one before.
 * @param {World} w @param {Content} c @param {Unit | null} src @param {Unit} t @param {Load} load
 */
function jumpHits(w, c, src, t, load) {
  const ch = /** @type {import('./types.js').Chain} */ (load.chain), antiAir = !src || traitOf(c, src).antiAir;
  let amount = load.amount;
  for (const u of chainOf(w, c, t, ch, { heals: false, antiAir })) {
    amount *= ch.scale;
    hitTarget(w, c, src, u, { ...load, amount, hit: 'chain' });
  }
}

/**
 * A healer's heals on one target (职业-2, 职业-11, 职业-12), then a heal chain's on each operator it jumps to, at the
 * chain's share of the one before; each heal also restores element values by the trait's share of it (× its talents' on
 * a ground unit, 职业-31), gives the one healed its talents' SP for it (职业-25) and leaves their heal over time (职业-29);
 * what the talents give for any heal is the heal hook's (职业-33).
 * @param {World} w @param {Content} c @param {Unit} a @param {Unit} t @param {{ load: Load, jumps: Unit[] }} how
 */
function heals(w, c, a, t, how) {
  const ep = traitOf(c, a).epHeal;
  let amount = how.load.amount;
  for (const u of [t, ...how.jumps]) {
    for (let k = 0; k < how.load.times; k++) {
      w.events.push({ type: 'heal', id: a.id, target: u.id, amount: heal(w, a, u, amount * vsHeal(w, c, a, u)) });
      if (ep > 0 && !statsOf(u).flags.healFree) restoreEp(u, amount * ep * epHealMul(c, a, u));
      talentSp(w, c, a, 'heal', u);
      healDotOn(c, a, u);
    }
    amount *= how.load.chain?.scale ?? 1;
  }
}

/**
 * The locked targets still on the field and alive take a landing attack (攻击-2); returns them.
 * @param {World} w @param {Content} c @param {Unit} a @param {Swing} sw @param {boolean} heals @returns {Unit[]}
 */
function deliverAll(w, c, a, sw, heals) {
  const load = loadOf(a, sw.mods), area = sw.mods.square ? 'square' : sw.mods.cross ? 'cross' : null, reached = [];
  const share = sw.mods.splashScale ?? 1, direct = !!sw.mods.direct;
  for (const id of sw.targets) {
    const t = w.units.find((u) => u.id === id);
    if (t && t.hp > 0 && !t.hidden) { deliver(w, c, a, t, { load, heals, area, share, direct }); reached.push(t); }
  }
  return reached;
}

/**
 * An attack lands at the end of its wind-up (攻击-2, 攻击-3): 麻痹 may interrupt an enemy's (状态-8, and the talents
 * that answer it, 职业-29); the locked
 * targets still on the field and alive take it — out of range or not — as hits, a healer's heals (职业-2), or the
 * projectiles a ranged attacker launches; then an operator's skill counts the attack (技能-2, 技能-4).
 * @param {World} w @param {Content} c @param {Unit} a
 */
function land(w, c, a) {
  const sw = /** @type {Swing} */ (a.swing);
  a.swing = null;
  if (palsyInterrupts(a)) { a.anim = ANIM.IDLE; palsyCut(w, c, a); return; }
  const op = a.kind === KIND.OPERATOR, heals = op && (healerNow(c, a) || !!sw.mods.heal);
  if (op) attackEnded(w, a);
  const reached = deliverAll(w, c, a, sw, !!heals);
  const noAmmo = reached.length > 0 && (!!emit(w, 'attack', { attacker: a, targets: reached, isSkill: !!sw.mods.skill, noAmmo: false }).noAmmo || !!sw.free);
  if (op) operatorLanded(w, c, a, { sw, reached: reached.length, heals: !!heals, noAmmo });
  const ch = sw.mods.channel;
  if (ch && !sw.now && (sw.left ?? ch.hits) > 1) a.swing = { ...sw, wind: secondsToFrames(ch.duration / ch.hits), since: 0, left: (sw.left ?? ch.hits) - 1 };
}

/**
 * After an operator's attack landed (职业-9, 职业-12, 技能-2, 职业-25): its stored energy goes at the first target, its
 * talents' SP for an attack that reached enemies, the field's for its hurt-recovery skill (职业-30), it heals itself for
 * the enemies reached, its skill counts the attack.
 * @param {World} w @param {Content} c @param {Unit} a @param {{ sw: Swing, reached: number, heals: boolean, noAmmo: boolean }} how
 */
function operatorLanded(w, c, a, how) {
  const first = w.units.find((u) => u.id === how.sw.targets[0] && u.hp > 0 && !u.hidden);
  if (first && !how.heals) releaseEnergy(w, a, first, traitOf(c, a).energyScale);
  if (!how.heals && how.reached > 0) talentSp(w, c, a, 'attack');
  if (how.reached > 0) hurtAttackSp(w, c, a);
  if (!how.heals) lowestArts(w, c, a, how.sw.targets);
  selfHeal(w, c, a, how.reached);
  if (!how.heals) epOnHit(c, a, how.reached);
  afterAttack(w, c, a, how.sw.mods, how.noAmmo);
}

/**
 * An operator's own heal after its attack reached enemies (职业-9): the trait's amount for each of them, at most its
 * cap (a number, or its 阻挡数 and at least 1) — a trait that heals for every hit instead heals as it deals them (traitDealt).
 * @param {World} w @param {Content} c @param {Unit} a @param {number} reached
 */
function selfHeal(w, c, a, reached) {
  const t = traitOf(c, a);
  if (t.selfHeal <= 0 || t.selfHealOn === 'damage' || reached === 0 || t.heal) return;
  const cap = t.selfHealMax === 'blockCnt' ? Math.max(1, statsOf(a).blockCnt) : t.selfHealMax;
  for (let k = 0; k < Math.min(reached, cap); k++) w.events.push({ type: 'heal', id: a.id, target: a.id, amount: heal(w, a, a, t.selfHeal, { trait: true }) });
}

/**
 * One locked target of a landing attack (攻击-2, 攻击-3, 职业-2, 敌能-7, 敌能-8): a healer's heals, a tile splash's hits
 * around it (the others at the splash's share, 敌能-26), a ranged attacker's projectile — not for an attack that hits
 * directly (敌能-27) —, or the hits.
 * @param {World} w @param {Content} c @param {Unit} a @param {Unit} t
 * @param {{ load: Load, heals: boolean, area: 'cross' | 'square' | null, share: number, direct: boolean }} how
 */
function deliver(w, c, a, t, how) {
  const far = how.heals ? null : fortressSplash(c, a, t), load = far ? { ...loadFor(w, c, a, t, how.load), splash: far } : loadFor(w, c, a, t, how.load);
  if (how.heals) heals(w, c, a, t, { load, jumps: load.chain ? chainOf(w, c, t, load.chain, { heals: true, antiAir: true }) : [] });
  else if (how.area) for (const u of areaOf(w, a, t, how.area)) hitTarget(w, c, a, u, u === t ? load : { ...load, amount: load.amount * how.share, hit: 'splash' });
  else if (far || (shoots(c, a, how.heals) && !how.direct)) launch(w, a, t, a.kind === KIND.OPERATOR ? { ...load, boomerang: traitOf(c, a).boomerang } : load);
  else impact(w, c, a, t, load);
}

/**
 * The `beforeAttack` event as an attack locks its targets (钩子-3): handlers may change them — those still on the field
 * with HP are the attack's, none while the attacker has none —, this attack's 倍率 (`scale`, × the mods') and its mark
 * (`mark`, carried to its hits). The targets and the attack's mods with these.
 * @param {World} w @param {Unit} a @param {Unit[]} targets @param {AttackMods} mods @returns {{ targets: Unit[], mods: AttackMods }}
 */
function lockTargets(w, a, targets, mods) {
  if (!hasHook(w, 'beforeAttack')) return { targets, mods };
  const k = emit(w, 'beforeAttack', { attacker: a, targets: [...targets], isSkill: !!mods.skill, scale: 1, mark: 0 });
  const scale = Number.isFinite(k.scale) && k.scale >= 0 ? k.scale : 1, mark = Number.isInteger(k.mark) ? k.mark : 0;
  return {
    targets: a.hp > 0 ? (Array.isArray(k.targets) ? k.targets : []).filter((t) => t && t.hp > 0 && w.units.includes(t)) : [],
    mods: scale === 1 && mark === 0 ? mods : { ...mods, scale: mods.scale * scale, ...(mark ? { mark } : {}) },
  };
}

/**
 * Starts an attack (攻击-2): the cooldown starts — the next attack may start an attack interval from now —, the
 * targets are locked (the `beforeAttack` event; none left: no swing, the cooldown runs all the same) and the swing
 * waits its wind-up; it lands at once without one. An attack during a 狂躁 burst counts once (元素-4).
 * @param {World} w @param {Content} c @param {Unit} a @param {Unit[]} found @param {AttackMods} mods
 */
function startSwing(w, c, a, found, mods) {
  const s = statsOf(a), ch = mods.channel, every = ch ? secondsToFrames(ch.duration / ch.hits) : 0;
  const interval = ch ? ch.hits * every + secondsToFrames(ch.after) : intervalFrames(s.bat, s.aspd);
  a.atkCd = interval - 1;
  const { targets, mods: locked } = lockTargets(w, a, found, mods);
  if (targets.length === 0) { a.anim = ANIM.IDLE; return; }
  a.anim = ANIM.ATTACK;
  rampageAttack(a);
  const wind = ch ? every : windupFrames(timingOf(c, a), interval);
  // 渲染-4: whether the model faces what it hits. Facing one target is the normal case; a swing that hits several only
  // faces them when it is an attack-everything-it-blocks (there is one thing it stands against), and a splash / extra-target
  // swing turns nobody (there is no single target to face). The highest-priority target is the first locked one.
  const face = targets.length === 1 || locked.blocked ? 1 : 0;
  for (const t of targets) w.events.push({ type: 'attack', id: a.id, target: t.id, wind, face });
  a.swing = { wind, since: 0, targets: targets.map((t) => t.id), mods: locked };
  if (a.swing.wind === 0) land(w, c, a);
}

/**
 * One frame of a swing (攻击-2): it lands when its wind-up is over; 麻痹 cuts an enemy's 2 s into it at the latest
 * (状态-8).
 * @param {World} w @param {Content} c @param {Unit} a
 */
function advanceSwing(w, c, a) {
  const sw = /** @type {Swing} */ (a.swing);
  sw.wind--;
  sw.since++;
  if (sw.wind <= 0) { land(w, c, a); return; }
  if (sw.since >= PALSY_CUT_FRAMES && palsyInterrupts(a)) { a.swing = null; a.anim = ANIM.IDLE; palsyCut(w, c, a); }
}

/**
 * One operator's attack (攻击-1, 攻击-2, 技能-3…技能-5, 职业-2, 职业-3): a swing under way goes on; with the cooldown
 * out, no swing and a target, its skill may start or end, the first targets are locked — as many as the skill's mods or
 * the trait allow, whichever is more; the trait's hits multiply the skill's — and a new swing starts.
 * @param {World} w @param {Content} c @param {Unit} op
 */
function operatorAttack(w, c, op) {
  if (op.swing) advanceSwing(w, c, op);
  if (op.atkCd > 0) { op.atkCd--; return; }
  if (op.swing || boomerangOut(w, op)) return;
  const found = mayAttack(c, op) && traitAsk(w, c, op, 'canAttack') !== false ? targetsOf(w, c, op) : [], hold = holdFrames(w, c, op, found.length > 0);
  if (hold > 0) { op.atkCd = hold - 1; op.anim = ANIM.IDLE; return; }
  if (found.length === 0) { op.anim = ANIM.IDLE; return; }
  const a = armed(w, c, op, timedAttack(w, c, op, critMods(w, c, op, beforeAttack(w, c, op))));
  startSwing(w, c, op, a.targets, a.mods);
}

/**
 * An operator's attack with these mods (攻击-1, 职业-3): the first targets — as many as the mods or the trait allow,
 * whichever is more — and the mods with the trait's hits (and its skill's arts, or a 替身's arts, 职业-16) on them.
 * @param {World} w @param {Content} c @param {Unit} op @param {AttackMods} mods @returns {{ targets: Unit[], mods: AttackMods }}
 */
function armed(w, c, op, mods) {
  const t = traitOf(c, op), most = mods.blocked ? Math.max(1, statsOf(op).blockCnt) : Math.max(mods.targets, traitTargets(t, op)) + (mods.more ?? 0);
  const arts = ((t.skillArts && op.skill?.active) || dollNow(c, op)?.arts) && !mods.type ? { type: /** @type {const} */ ('arts') } : {};
  const targets = firstN(targetsOf(w, c, op), most);
  sameTargetStep(c, op, targets[0]);
  powerAttack(op);
  return { targets, mods: modeMods(c, op, { ...mods, times: mods.times * t.hits, ...arts }) };
}

/**
 * An attack now (攻击-5): content makes an operator attack at once — on the targets given that are on the field with HP,
 * or on those its attack would take —: its attack as it is now (no skill starts for it, its chance talents drawn), the
 * targets locked (`beforeAttack`), no wind-up and its cooldown untouched; it lands as any attack (攻击-2) — spending no
 * ammo with `noAmmo`. A swing under way goes on after it. Whether it attacked.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit[] | null} [given] @param {{ noAmmo?: boolean }} [o]
 */
export function attackNow(w, c, op, given = null, o = {}) {
  if (op.kind !== KIND.OPERATOR || op.hp <= 0 || !w.units.includes(op)) return false;
  const a = armed(w, c, op, timedAttack(w, c, op, critMods(w, c, op, attackMods(w, c, op))));
  const { targets, mods } = lockTargets(w, op, given ? given.filter((u) => u.hp > 0 && w.units.includes(u)) : a.targets, a.mods);
  if (targets.length === 0 || op.hp <= 0) return false;
  const prev = op.swing;
  for (const t of targets) w.events.push({ type: 'attack', id: op.id, target: t.id, wind: 0 });
  op.swing = { wind: 0, since: 0, targets: targets.map((t) => t.id), mods, now: true, free: !!o.noAmmo };
  land(w, c, op);
  op.swing = prev;
  return true;
}

/**
 * One of a chance talent's effects at random (攻击-4, 职业-34: 空构): one draw (随机-1) picks it — more hits, a stun, 防御
 * ignored. @param {World} w @param {AttackMods} out @param {NonNullable<import('./types.js').CritTalent['pick']>} pick @returns {AttackMods}
 */
function picked(w, out, pick) {
  const k = pick[Math.min(pick.length - 1, Math.floor(draw(w) * pick.length))];
  return { ...out, ...(k.times ? { times: out.times * k.times } : {}), ...(k.stun ? { hitStatus: { key: 'stun', seconds: k.stun } } : {}),
    ...(k.ignoreDef ? { ignoreDef: Math.max(out.ignoreDef ?? 0, k.ignoreDef) } : {}) };
}

/**
 * Whether the target's centre is on the tiles a front chance names (干员-12, 攻击-4). One tile is the tile ahead, not
 * the operator's own. More than one also counts the operator's tile: the module remark says the check is then 范围内
 * and includes it, read as the text's N tiles plus this one (推断 INF-0313).
 * @param {Unit} op @param {Unit} t @param {number} n
 */
function ahead(op, t, n) {
  const [r, c] = tileOf(op), [tr, tc] = tileOf(t);
  if (n > 1 && r === tr && c === tc) return true;
  for (let k = 1; k <= n; k++) {
    const [fr, fc] = frontOf(r, c, op.dir, k);
    if (fr === tr && fc === tc) return true;
  }
  return false;
}

/**
 * A chance talent's chance now (攻击-4): `skillProb` while the skill runs; `front.prob` when the primary target's
 * centre is on the tiles ahead, looked up as the chance is drawn and not when the hit lands (干员-12). No primary
 * target keeps the original chance. The ammo bonus is added either way (职业-35).
 * @param {World} w @param {Content} c @param {Unit} op @param {import('./types.js').CritTalent} k
 */
function chanceOf(w, c, op, k) {
  let p = k.skillProb !== undefined && inSkill(op) ? k.skillProb : k.prob;
  const f = k.front;
  if (f) {
    const primary = targetsOf(w, c, op)[0];
    if (primary && ahead(op, primary, f.tiles)) p = f.prob;
  }
  return p + ammoChance(op, k);
}

/**
 * The chance talents of an operator's attack (攻击-4): for each, in order, one draw (随机-1); under its chance — its
 * `skillProb` while its skill runs, or `front.prob` when the primary target stands on the tiles ahead — the
 * attack's 倍率 × its scale, its stun on each hit, its more targets, its attack bonus for this attack (added to the
 * attack's), the share of the targets' 防御 it ignores (the most), its hits × its `times`. A healing attack draws none.
 * @param {World} w @param {Content} c @param {Unit} op @param {AttackMods} mods @returns {AttackMods}
 */
function critMods(w, c, op, mods) {
  let out = mods;
  if (mods.heal || healerNow(c, op)) return healMore(w, c, op, out);
  for (const k of c.operators[op.key].critTalents ?? []) {
    if (draw(w) >= chanceOf(w, c, op, k)) continue;
    out = k.pick ? picked(w, out, k.pick) : crit(op, out, k);
  }
  return out;
}

/**
 * A chance talent under its chance (攻击-4): the attack's 倍率 × its scale (critScale), its stun, more targets, attack
 * bonus, 防御 ignored and hits as above; its SP for an attack-recovery skill (职业-35).
 * @param {Unit} op @param {AttackMods} out @param {import('./types.js').CritTalent} k @returns {AttackMods}
 */
function crit(op, out, k) {
  if (k.sp && op.skill?.spType === 'attack') gainSp(op.skill, k.sp);
  return { ...out, scale: out.scale * critScale(op, k), ...(k.stun ? { hitStatus: { key: 'stun', seconds: k.stun } } : {}), ...(k.more ? { more: (out.more ?? 0) + k.more } : {}),
    ...(k.atk ? { atkPct: (out.atkPct ?? 0) + k.atk } : {}), ...(k.ignoreDef ? { ignoreDef: Math.max(out.ignoreDef ?? 0, k.ignoreDef) } : {}), ...(k.times ? { times: out.times * k.times } : {}) };
}

/**
 * Every operator's turn this frame (攻击-1). It lets go of what its block count no longer holds (阻挡-3); its skill runs
 * (技能-2…技能-4); then, if it can act (not 晕眩, 冻结 …), its attack — one that cannot act neither attacks nor counts
 * its cooldown down, and loses the swing it was in (攻击-2).
 * @param {World} w @param {Content} c
 */
export function operatorsAttack(w, c) {
  for (const op of w.units) {
    if (op.kind !== KIND.OPERATOR || op.hp <= 0) continue;
    enforceCapacity(w, c, op);
    blockingImmunity(w, op, traitOf(c, op).immuneBlocking);
    traitWhiles(w, c, op);
    tickSkill(w, c, op);
    skillIdle(op, traitOf(c, op));
    if (!statsOf(op).disabled) operatorAttack(w, c, op);
    else op.swing = null;
  }
}

/**
 * Every projectile's frame (攻击-3, 职业-12): one that reaches its target hits it with what it carries, its shooter as the
 * source while that is still on the field; then for a boomerang the `boomerangHit` event, whose handler may hold it
 * there (`hold`).
 * @param {World} w @param {Content} c
 */
export function shotsFly(w, c) {
  flyShots(w, (s, t) => {
    const src = w.units.find((u) => u.id === s.src && u.hp > 0) ?? null;
    impact(w, c, src, t, { ...s, ranged: true });
    return !!(s.back && src && hasHook(w, 'boomerangHit') && emit(w, 'boomerangHit', { unit: src, target: t, x: s.sx, y: s.sy, isSkill: !!s.skill, shot: s, hold: false }).hold);
  }, (s, thrower) => {
    caughtSp(c, thrower);
    emit(w, 'boomerangCaught', { unit: thrower, x: s.sx, y: s.sy, isSkill: !!s.skill });
  });
}

/**
 * Content hits another unit with what a boomerang it holds carries (职业-12), as on its arrival; its thrower the source.
 * @param {World} w @param {Content} c @param {import('./types.js').Shot} s @param {Unit} t
 */
export function boomerangStrike(w, c, s, t) {
  if (t.hp > 0 && w.units.includes(t)) impact(w, c, w.units.find((u) => u.id === s.src && u.hp > 0) ?? null, t, { ...s, ranged: true });
}

/**
 * Who an enemy can attack (敌人攻击-1, 合作-9, 装置-2): a melee enemy only the unit blocking it; a ranged one every
 * selectable operator, neutral unit or device of ours whose collider (radius 0.25) its attack radius reaches — distance ≤ radius + 0.25 — and
 * the unit blocking it in any case.
 * @param {World} w @param {Unit} e @returns {Unit[]}
 */
export function enemyTargets(w, e) {
  const blocker = e.blockedBy >= 0 ? w.units.find((u) => u.id === e.blockedBy) ?? null : null;
  if (e.base.applyWay === 'MELEE' || !(e.base.rangeRadius > 0)) return blocker ? [blocker] : [];
  const reach = e.base.rangeRadius + ALLY_COLLIDER_RADIUS, r2 = reach * reach;
  const out = w.units.filter((u) => u !== e && friendly(u) && u.hp > 0 && (u.x - e.x) * (u.x - e.x) + (u.y - e.y) * (u.y - e.y) <= r2
    && (u === blocker || selectable(u)) && !evadesGround(e, u));
  if (blocker && !out.includes(blocker)) out.push(blocker);
  return out;
}

/**
 * An enemy's attack this frame (敌人攻击-1, 攻击-2): like an operator's — a swing under way goes on; the cooldown counts
 * down while it can act; when it is out and there is a target, the first in the official order (索敌-5) — as many as
 * its abilities' mods say (敌能-2), one by default — are locked and a swing starts — not while it is blocked under 战栗 (状态-5; a swing under way goes on). One that cannot act, has no
 * attack or has disappeared loses its swing. Returns whether it is attacking this frame (it does not walk).
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function enemyAttack(w, c, e) {
  const s = statsOf(e);
  // 恐惧 cancels a swing already under way, unlike 战栗 (状态-10, INF-0293). It is not one of the eight 阻止攻击 flags.
  if (s.disabled || s.atk <= 0 || e.hidden || s.flags.noAttack || s.flags.fear) { e.swing = null; return false; }
  const swinging = e.swing !== null;
  if (e.swing) advanceSwing(w, c, e);
  if (e.atkCd > 0) { e.atkCd--; return swinging; }
  if (e.swing) return true;
  if (s.flags.disarmedCombat && e.blockedBy >= 0) return false;
  const order = sortAllies(e, foeTargets(w, c, e, enemyTargets(w, e)), FPS);
  if (order.length === 0) return swinging;
  const mods = foeAttack(w, c, e, { scale: 1, times: 1, targets: 1, skill: false });
  startSwing(w, c, e, order.slice(0, Math.max(1, mods.targets)), mods);
  return true;
}
