// Skills (docs/spec/skills.md 技能-1…技能-6): the state a skill runs with, when it starts — by command, on its own, at
// deployment — how long it lasts, what it does to the operator's attacks, and the native behaviour interface content
// writes against (ADR 0055): data first, a behaviour by skill id, and a context that is the only way it acts.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { timeSp, gainSp, spendSp } from './sp.js';
import { actorContext, traitOf } from './traits.js';
import { addBuff, makeBuff, removeBuff } from './buffs.js';
import { throwAlchemy } from './alchemy.js';
import { heal } from './damage.js';
import { emit } from './bus.js';
import { grantSummons, endSummons } from './summons.js';
import { restartCharge } from './modes.js';
import { talentSkillEnd, talentSkillStart } from './talentfx.js';
import { openSkillText, closeSkillText, healSkillAllies } from './skilltext.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').SkillDef} SkillDef @typedef {import('./types.js').SkillState} SkillState */
/** @typedef {'passive' | 'ammo' | 'duration' | 'next' | 'instant'} SkillKind */

/**
 * What a skill's attacks change (技能-5): the 攻击力倍率, hits per target, the number of targets; `skill` marks an attack
 * the skill makes (it gives no attack SP); `element` and `ep`, 元素损伤 each hit carries (元素-2).
 * An attack's modifiers: 倍率, hits, targets, whether a skill makes it, its 元素损伤; and for enemy abilities (敌能-6…敌能-11)
 * a damage type in place of the attacker's, a cross-shaped splash, an attack bonus for this attack only, and a channel
 * (`hits` hits spread over `duration` seconds, the k-th at k × duration ÷ hits, then `after` seconds of cooldown), the
 * tile splash's share on the others (`splashScale`, 敌能-26), hits without a projectile (`direct`) and a 倍率 on a
 * frozen target (`frozen`, 敌能-27); `mark`, a mark content gave this attack (钩子-3 beforeAttack); a skill's timed modifiers on
 * each target (`hitDebuff`), the operator's HP back after it (`selfHeal`), 元素损伤 of `epScale` × its attack (技能-9); the
 * share of the targets' 防御 its hits ignore (`ignoreDef`, 攻击-4).
 * @typedef {{ scale: number, times: number, targets: number, skill: boolean, element?: import('./elements.js').Element, ep?: number,
 *   type?: import('./types.js').DamageType, cross?: boolean, atkPct?: number, channel?: { hits: number, duration: number, after: number }, heal?: boolean, square?: boolean, blocked?: boolean, more?: number,
 *   hitStatus?: { key: import('./status.js').StatusKey, seconds: number, prob?: number }, mark?: number, splashScale?: number, direct?: boolean, frozen?: number,
 *   hitDebuff?: { seconds: number, mods: Record<string, number> }, selfHeal?: number, epScale?: number,
 *   displace?: { pull: boolean, force: number, along?: boolean }, ignoreDef?: number, splash?: import('./types.js').Splash }} AttackMods
 */

/**
 * The context a skill behaviour acts through (ADR 0055, 技能-6): the common one (traits.js TraitContext, api.js) with
 * the skill's blackboard, and the skill's kind. It reads the operator, its blackboard and its stats, and changes the
 * battle only through its functions.
 * @typedef {import('./traits.js').TraitContext & { kind: SkillKind, extra: Record<string, number> }} SkillContext
 */

/**
 * A skill's behaviour (ADR 0055). `trigger` says when an AUTO skill starts: as soon as it is ready, or when the
 * operator is about to attack. `attack` may change the mods of the attacks the skill makes. `timing` may give the
 * operator's skill another kind and time than its record's (技能-6).
 * @typedef {object} SkillBehavior
 * @property {'ready' | 'attack' | ((ctx: SkillContext) => 'ready' | 'attack')} [trigger]
 * @property {(ctx: SkillContext) => { kind?: SkillKind, seconds?: number } | null} [timing]
 * @property {(ctx: SkillContext) => void} [start]
 * @property {(ctx: SkillContext) => void} [tick]
 * @property {(ctx: SkillContext, reason: string) => void} [end] told why the skill ends, as the `skillEnd` event (API 3)
 * @property {(ctx: SkillContext, mods: AttackMods) => AttackMods} [attack]
 * @property {(op: Unit) => import('./types.js').Cell[] | null} [range] the running skill's range now, over its record's (技能-8; API 5)
 */

/** Blackboard keys of the operator's own attributes and the mod each becomes during the skill (技能-5). */
export const STAT_KEYS = Object.freeze({
  atk: 'atkPct', def: 'defPct', max_hp: 'hpPct', attack_speed: 'aspd', magic_resistance: 'resFlat', block_cnt: 'blockCnt',
  move_speed: 'movePct', sp_recovery_per_sec: 'spRecoveryFlat', base_attack_time: 'batFlat', ability_range_forward_extend: 'rangeExtend',
  taunt_level: 'taunt', def_penetrate: 'defIgnorePct', def_penetrate_fixed: 'defIgnoreFlat', magic_resist_penetrate: 'resIgnorePct',
  magic_resist_penetrate_fixed: 'resIgnoreFlat', hp_recovery_per_sec: 'hpRegen',
});

/** Blackboard keys of the attacks a skill makes (技能-5). */
const ATTACK_KEYS = Object.freeze(['atk_scale', 'attack@atk_scale', 'times', 'attack@times', 'max_target', 'attack@max_target']);

/** Why a skill may have ended on its own, so one that switches at its end may ask for the switch (职业-15). A switch or a move does not. */
const OWN_END = new Set(['duration', 'instant', 'ammo', 'stopped']);

/**
 * A skill's kind (技能-1): passive; ammo; one that throws a 炼金单元 is instant (技能-13); with a duration, or running until it
 * is closed (技能-4); one that switches to the 替身 as it starts, with no duration, is instant — its attack keys belong to the
 * 替身, not a next attack (职业-15); a next-attack skill (no duration, attack keys, or 技能-14 heals an ally on the attack); instant.
 * @param {SkillDef} def @returns {SkillKind}
 */
export function kindOf(def) {
  if (def.type === 'PASSIVE') return 'passive';
  if (def.ammo) return 'ammo';
  if (def.alchemy) return 'instant';
  if (def.duration > 0 || def.forever) return 'duration';
  if (def.doll === 'start') return 'instant';
  if (def.extra?.allyHeal?.on === 'attack') return 'next';
  return ATTACK_KEYS.some((k) => k in def.bb) ? 'next' : 'instant';
}

/** A skill's state when its operator is deployed: the initial SP (技能-2); the cost it takes to start (技能-10). @param {SkillDef} def @returns {SkillState} */
export function makeSkillState(def) {
  const cap = def.cost * Math.max(1, def.charges);
  return { id: def.id, spType: def.sp, cost: def.cost, cap, sp: Math.min(def.init, cap), slot: 0, active: false, armed: false, dur: -1, ammo: 0, at: -1, ...(def.spend ? { spend: def.spend } : {}) };
}

/** The mods of the blackboard's attribute keys (技能-5). @param {Readonly<Record<string, number>>} bb */
export function statMods(bb) {
  /** @type {Record<string, number>} */
  const mods = {};
  for (const [k, mod] of Object.entries(STAT_KEYS)) if (Number.isFinite(bb[k])) mods[mod] = bb[k];
  return mods;
}

/**
 * The generic behaviour (技能-5): while a skill with a duration, ammo or a passive one runs, its attribute keys are a
 * buff on the operator — `hp_recovery_per_sec_by_max_hp_ratio` 生命回复速度 of that share of its maximum HP as it starts —;
 * an instant or duration skill's `cost` gives the owner that much cost when it starts.
 * @type {Required<Pick<SkillBehavior, 'start' | 'end'>>}
 */
export const GENERIC = Object.freeze({
  start(ctx) {
    if ((ctx.kind === 'instant' || ctx.kind === 'duration') && ctx.bb.cost > 0) ctx.gainCost(ctx.bb.cost);
    if (ctx.kind === 'instant' || ctx.kind === 'next') return;
    const mods = { ...statMods(ctx.bb), ...ctx.extra }, byMax = ctx.bb.hp_recovery_per_sec_by_max_hp_ratio;
    if (byMax > 0) mods.hpRegen = (mods.hpRegen ?? 0) + byMax * ctx.stats(ctx.self).maxHp;
    if (Object.keys(mods).length > 0) ctx.addBuff(ctx.self, { key: 'skill', mods });
  },
  end(ctx) { ctx.removeBuff(ctx.self, 'skill'); },
});

/** @param {Content} c @param {Unit} op @returns {SkillDef} */
const defOf = (c, op) => /** @type {SkillDef} */ (c.operators[op.key].skill);

/**
 * The blackboard a skill's behaviour reads (技能-5, 技能-10): the record's — without `cost` for a skill that costs it to
 * start, whose `cost` is the price, not cost it gives.
 * @param {SkillDef} def @returns {Record<string, number>}
 */
function bbOf(def) {
  return def.spend ? Object.fromEntries(Object.entries(def.bb).filter(([k]) => k !== 'cost')) : def.bb;
}
/** @param {Content} c @param {string} id @returns {SkillBehavior} */
const behaviorOf = (c, id) => (c.behaviors?.skills && Object.hasOwn(c.behaviors.skills, id) ? c.behaviors.skills[id] : GENERIC);

/**
 * A skill's kind and seconds for its operator now (技能-1, 技能-6): its behaviour's timing over its record's.
 * @param {World} w @param {Content} c @param {Unit} op @returns {{ kind: SkillKind, seconds: number, ctx: SkillContext }}
 */
function timingOf(w, c, op) {
  const def = defOf(c, op), ctx = { ...actorContext(w, c, op, bbOf(def)), kind: kindOf(def), extra: def.extra?.mods ?? {} };
  const t = behaviorOf(c, def.id).timing?.(ctx) ?? null;
  return { kind: t?.kind ?? ctx.kind, seconds: t?.seconds ?? def.duration, ctx: { ...ctx, kind: t?.kind ?? ctx.kind } };
}

/** @param {World} w @param {Content} c @param {Unit} op @returns {SkillContext} */
const contextOf = (w, c, op) => timingOf(w, c, op).ctx;

/**
 * Ends a skill (技能-4): its behaviour's end, then the state at rest (a 解放者's charge back at 0, 职业-12), its talents'
 * SP for it (职业-25, 职业-30), then the `skillEnd` event (钩子-3) with why — `duration`, `instant`, `ammo` or `stopped` (closed, 技能-7).
 * @param {World} w @param {Content} c @param {Unit} op @param {string} [reason]
 */
export function endSkill(w, c, op, reason = 'duration') {
  const st = /** @type {SkillState} */ (op.skill);
  // 技能-14: the end burst still sees the skill's range, and a tied barrier is this skill's, so both go before the buff does.
  closeSkillText(w, c, op, reason);
  behaviorOf(c, st.id).end?.(contextOf(w, c, op), reason);
  removeBuff(op, 'spendAtk');
  removeBuff(op, 'skillFlags');
  st.active = false; st.armed = false; st.dur = -1; st.ammo = 0;
  restartCharge(op);
  w.events.push({ type: 'skill', id: op.id, active: 0 });
  talentSkillEnd(w, c, op, reason);
  endSummons(w, c, op);
  grantSummons(w, c, op, 'end');
  emit(w, 'skillEnd', { unit: op, reason });
  // Asked here, started by the frame's flush (doll.js): skills.js must not import doll.js. Not for a switch that ended
  // this skill, nor a move that discards the operator — either would start the switch a second time (职业-15).
  if (defOf(c, op).doll === 'end' && OWN_END.has(reason)) st.dollPending = true;
}

/**
 * Sets the shots a running ammo skill has left (content that adds or spends them, 技能-4): at least 0.
 * @param {SkillState} st @param {number} n
 */
export function setAmmo(st, n) {
  if (st.active) st.ammo = Math.max(0, Math.round(n));
}

/**
 * Sets the frames a running timed skill has left (content that shortens or lengthens it, 技能-4): at least 1 — it ends
 * in that frame's turn.
 * @param {SkillState} st @param {number} frames
 */
export function setTimeLeft(st, frames) {
  if (st.active && st.dur > 0) st.dur = Math.max(1, Math.round(frames));
}

/**
 * The frames a skill that starts runs for (技能-4): its seconds for a duration, passive or ammo skill that has them; −1
 * for none — an instant or next-attack one, one that runs until closed.
 * @param {SkillKind} kind @param {number} seconds
 */
const runFrames = (kind, seconds) => ((kind === 'duration' || kind === 'passive' || kind === 'ammo') && seconds > 0 && Number.isFinite(seconds) ? secondsToFrames(seconds) : -1);

/**
 * Starts a skill (技能-3, 技能-4): it takes its cost; by kind it lasts its duration, holds its ammo (more by its holder's
 * `ammoFlat`, summed: 部署-7), waits for the next attack, or acts at once and ends. The `skillStart` event (钩子-3) follows its behaviour's start, with why: `manual`,
 * `auto` or `deploy` (a passive skill). A free start (content's own, 技能-3) takes no cost.
 * @param {World} w @param {Content} c @param {Unit} op @param {string} [reason] @param {boolean} [free]
 */
export function activate(w, c, op, reason = 'auto', free = false) {
  const st = /** @type {SkillState} */ (op.skill), def = defOf(c, op), { kind, seconds } = timingOf(w, c, op);
  if (!free) spendSp(st);
  if (!free && def.spend) payFor(w, c, op, def.spend);
  st.active = true; st.at = w.frame;
  st.armed = kind === 'next';
  st.dur = runFrames(kind, seconds);
  st.ammo = kind === 'ammo' ? Math.max(1, def.bb['attack@trigger_time'] ?? def.bb.trigger_time ?? def.bb.cnt ?? 1) + Math.max(0, Math.floor(statsOf(op).sum.ammoFlat ?? 0)) : 0;
  w.events.push({ type: 'skill', id: op.id, active: 1 });
  talentSkillStart(w, c, op);
  behaviorOf(c, st.id).start?.(contextOf(w, c, op));
  holdFlags(op, def, kind);
  openSkillText(w, c, op);
  if (def.alchemy) throwAlchemy(w, c, op, def.alchemy);
  grantSummons(w, c, op, 'start');
  emit(w, 'skillStart', { unit: op, reason });
  if (kind === 'instant') endSkill(w, c, op, 'instant');
  // After an instant skill's own end, so that end is not the switch and this request is still there for the flush (职业-15).
  if (def.doll === 'start') st.dollPending = true;
}

/**
 * The flags a skill's description gives while it runs (技能-9, e.g. 不死): a buff `skillFlags` from its start until it
 * ends, whatever its behaviour; none for a skill that does not run (instant, next attack).
 * @param {Unit} op @param {SkillDef} def @param {SkillKind} kind
 */
function holdFlags(op, def, kind) {
  const flags = def.extra?.flags;
  if (flags && kind !== 'instant' && kind !== 'next') addBuff(op, makeBuff({ key: 'skillFlags', src: op.id, flags }));
}

/**
 * The owner pays a skill's cost (技能-10); an operator whose trait gives attack for cost paid (佣兵 MCN-X) holds a step
 * for each — a buff `spendAtk` until the skill ends (职业-20).
 * @param {World} w @param {Content} c @param {Unit} op @param {number} n
 */
function payFor(w, c, op, n) {
  w.players[op.owner].cost -= n;
  const s = traitOf(c, op).spendAtk;
  if (s) addBuff(op, makeBuff({ key: 'spendAtk', src: op.id, value: Math.min(s.max, n), mods: { atkPct: s.atk * Math.min(s.max, n) } }));
}

/** Whether the owner holds what a skill costs to start (技能-10). @param {World} w @param {Content} c @param {Unit} op */
const affords = (w, c, op) => !((defOf(c, op).spend ?? 0) > w.players[op.owner].cost);

/** Whether an operator may trigger its skill (技能-3, 技能-7): it can act and is not silenced (沉默, 静默). @param {Unit} op */
function mayTrigger(op) {
  const s = statsOf(op);
  return !s.disabled && !s.flags.silence && !s.flags.mute;
}

/**
 * Whether a skill may start now (技能-3): it is not running, it holds its cost, its operator may trigger it, and its
 * type is the one asked for.
 * @param {Content} c @param {Unit} op @param {'AUTO' | 'MANUAL'} type
 */
export function canStart(c, op, type) {
  const st = op.skill;
  if (!st || st.active || st.sp < st.cost || defOf(c, op).type !== type) return false;
  return mayTrigger(op);
}

/**
 * Whether the player may close a skill now (技能-7): it is running, it can be closed, and its operator may trigger it —
 * closing is a second trigger.
 * @param {Content} c @param {Unit} op
 */
export function canClose(c, op) {
  const st = op.skill;
  return !!st && st.active && defOf(c, op).stoppable === true && mayTrigger(op);
}

/**
 * When an AUTO skill starts (技能-3): as its behaviour says — or as its behaviour works out now —, else an instant one,
 * or one of an operator that makes no normal attacks (职业-13), as soon as it is ready and the others as the operator is
 * about to attack — one that throws a 炼金单元 at the enemies needs a target (技能-13).
 * @param {World} w @param {Content} c @param {Unit} op @returns {'ready' | 'attack'}
 */
function triggerOf(w, c, op) {
  const t = behaviorOf(c, defOf(c, op).id).trigger;
  if (typeof t === 'function') return t(contextOf(w, c, op));
  const def = defOf(c, op);
  if (t === undefined && def.alchemy) return def.alchemy.at === 'enemy' ? 'attack' : 'ready';
  return t ?? (kindOf(def) === 'instant' || traitOf(c, op).noAttack ? 'ready' : 'attack');
}

/**
 * One frame of an operator's skill, at the start of its turn (技能-2…技能-4): the duration runs down (not in the frame
 * it started), the running skill ticks, SP recovers over time, and an AUTO skill that starts when ready starts.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function tickSkill(w, c, op) {
  const st = op.skill;
  if (!st) return;
  if (st.active && st.dur > 0 && st.at < w.frame && --st.dur === 0) endSkill(w, c, op);
  if (st.active) behaviorOf(c, st.id).tick?.(contextOf(w, c, op));
  if (!statsOf(op).flags.noSp) timeSp(st, statsOf(op).spRecovery);
  if (canStart(c, op, 'AUTO') && affords(w, c, op) && triggerOf(w, c, op) === 'ready') activate(w, c, op);
}

/**
 * Before an operator attacks (技能-3, 技能-4): an ammo skill out of ammo ends; an AUTO skill that starts on attack
 * starts. Returns the mods of this attack (技能-5).
 * @param {World} w @param {Content} c @param {Unit} op @returns {AttackMods}
 */
export function beforeAttack(w, c, op) {
  const st = op.skill;
  if (st && st.active && timingOf(w, c, op).kind === 'ammo' && st.ammo <= 0) endSkill(w, c, op, 'ammo');
  if (st && canStart(c, op, 'AUTO') && affords(w, c, op) && triggerOf(w, c, op) === 'attack') activate(w, c, op);
  return attackMods(w, c, op);
}

/**
 * The mods of an operator's attack as it is now (技能-5): its running skill's — its behaviour may change them —, plain
 * without one; nothing starts or ends for it.
 * @param {World} w @param {Content} c @param {Unit} op @returns {AttackMods}
 */
export function attackMods(w, c, op) {
  const st = op.skill, plain = { scale: 1, times: 1, targets: 1, skill: false };
  if (!st) return plain;
  const kind = timingOf(w, c, op).kind;
  if (st.active && kind === 'passive' && behaviorOf(c, st.id) === GENERIC) return pushed(w, c, op, hitExtra(plain, defOf(c, op)));
  if (!st.active || kind === 'instant' || kind === 'passive') return plain;
  const mods = withExtra(skillMods(defOf(c, op).bb, defOf(c, op).extra?.hitScale), defOf(c, op)), beh = behaviorOf(c, st.id);
  return pushed(w, c, op, beh.attack ? beh.attack(contextOf(w, c, op), mods) : mods);
}

/**
 * An attack's push with its trait's boost (职业-23: 推击手 PUS-Y): `level` 力度 more while the operator blocks `cnt` or
 * more enemies as the attack starts.
 * @param {World} w @param {Content} c @param {Unit} op @param {AttackMods} mods @returns {AttackMods}
 */
function pushed(w, c, op, mods) {
  const d = mods.displace, b = traitOf(c, op).pushBoost;
  if (!d || d.pull || !b || w.units.filter((e) => e.blockedBy === op.id && e.hp > 0).length < b.cnt) return mods;
  return { ...mods, displace: { ...d, force: d.force + b.level } };
}

/**
 * A skill's attack mods with what its description adds (技能-9): every blocked enemy as targets, more targets, hits
 * (unless the blackboard gives them), the damage type, a status each hit gives.
 * @param {AttackMods} mods @param {SkillDef} def @returns {AttackMods}
 */
function withExtra(mods, def) {
  const a = def.extra?.attack;
  if (!a) return mods;
  const times = a.times && !('times' in def.bb) && !('attack@times' in def.bb) ? a.times : mods.times;
  return hitExtra({ ...mods, times, ...(a.blocked ? { blocked: true } : {}), ...(a.more ? { more: a.more } : {}), ...(a.type ? { type: a.type } : {}) }, def);
}

/**
 * An attack's mods with what a skill's description says its hits do (技能-9): a status, timed modifiers on the target,
 * the operator's HP back, 元素损伤 — for every attack of a passive skill's operator too.
 * @param {AttackMods} mods @param {SkillDef} def @returns {AttackMods}
 */
function hitExtra(mods, def) {
  const a = def.extra?.attack;
  if (!a) return mods;
  return { ...mods, ...(a.hitStatus ? { hitStatus: a.hitStatus } : {}), ...(a.hitDebuff ? { hitDebuff: a.hitDebuff } : {}), ...(a.selfHeal ? { selfHeal: a.selfHeal } : {}),
    ...(a.element && a.epScale ? { element: a.element, epScale: a.epScale } : {}), ...(a.displace ? { displace: a.displace } : {}) };
}

/**
 * The attack keys of a blackboard as mods (技能-5). A plain `atk_scale` that 技能-14 claims (`hitScale` `'attack'`) is the
 * counter's or a burst's, not this attack's; `attack@atk_scale` still is. One argument keeps the old reading.
 * @param {Readonly<Record<string, number>>} bb @param {'attack'} [hitScale] @returns {AttackMods}
 */
export function skillMods(bb, hitScale) {
  const plain = hitScale === 'attack' ? undefined : bb.atk_scale;
  return {
    scale: plain ?? bb['attack@atk_scale'] ?? 1, times: Math.max(1, bb.times ?? bb['attack@times'] ?? 1),
    targets: Math.max(1, bb.max_target ?? bb['attack@max_target'] ?? 1), skill: true,
  };
}

/** A heal the description hangs on this attack (技能-14), before a next-attack skill ends. A passive one, every attack. @param {World} w @param {Content} c @param {Unit} op @param {AttackMods} mods */
function healAfterHit(w, c, op, mods) {
  if (op.hp > 0 && (mods.skill || defOf(c, op).type === 'PASSIVE')) healSkillAllies(w, c, op);
}

/**
 * After an operator attacked (技能-2, 技能-4, 技能-9): the HP the attack gives it back; a next-attack skill ends; an ammo
 * skill spends a shot — unless an `attack` handler made it free (钩子-3); an attack the skill did not make gives one SP to a
 * skill that recovers by attacking.
 * @param {World} w @param {Content} c @param {Unit} op @param {AttackMods} mods @param {boolean} [noAmmo]
 */
export function afterAttack(w, c, op, mods, noAmmo = false) {
  const st = op.skill;
  if (!st) return;
  if (mods.selfHeal && op.hp > 0) heal(w, op, op, statsOf(op).maxHp * mods.selfHeal);
  healAfterHit(w, c, op, mods);
  if (mods.skill && st.armed) endSkill(w, c, op, 'instant');
  else if (mods.skill && st.ammo > 0 && !noAmmo) st.ammo--;
  else if (!mods.skill && st.spType === 'attack' && !statsOf(op).flags.noSp) gainSp(st, 1);
}

/** A newly deployed operator's passive skill starts (技能-3). @param {World} w @param {Content} c @param {Unit} op */
export function onDeploy(w, c, op) {
  if (op.skill && defOf(c, op).type === 'PASSIVE') activate(w, c, op, 'deploy');
}

/**
 * The skill command (技能-3, 技能-7): the seat's own operator on the field closes its running skill if it may, or else
 * starts its MANUAL skill if it may; otherwise nothing happens.
 * @param {World} w @param {Content} c @param {number} seat @param {number} unit
 */
export function commandSkill(w, c, seat, unit) {
  const op = w.units.find((u) => u.id === unit && u.kind === KIND.OPERATOR && u.owner === seat && u.hp > 0);
  if (op && canClose(c, op)) endSkill(w, c, op, 'stopped');
  else if (op && canStart(c, op, 'MANUAL') && affords(w, c, op)) activate(w, c, op, 'manual');
}
