// Stronghold's skill specs on the engine's skill runtime (docs/spec/compat.md 兼容-5): a skill a kit describes gets the
// engine's skill behaviour (技能-6, ADR 0055) that runs the kit's spec for the operator that has it — its modifiers and
// flags while it runs, its start, tick and end, its attack (倍率, hits, targets, damage type, a status each hit gives),
// its hit and attack callbacks — in place of the engine's generic effects from the blackboard. An operator with the same
// skill but no kit keeps the generic ones. When it starts stays the engine's rule (技能-3): a MANUAL skill by the player.
// A kit's own `trait` callbacks run the same way at every attack — Stronghold lays them over the profession's profile
// and the running skill's attack over both (its resolveProfile, effectiveProfile): whether it may attack now and what a
// turn without a target does (the trait behaviour, 职业-6), its main target's hits and 倍率, after each victim, after
// each target, after an attack.
import { skills, constants, traitScale, swing, boomerangStrike } from '@aue/sim';
import { modsOf, flagsOf, statusKeyOf } from './mods.js';
import { kitHits } from './field.js';

/** @typedef {import('./battle.js').ShBattle} ShBattle @typedef {import('./unit.js').ShUnit} ShUnit @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').SkillBehavior} SkillBehavior */

/** The battle of each deployed operator that has a kit (kits.js binds it at every deployment). @type {WeakMap<Unit, ShBattle>} */
export const battles = new WeakMap();

/** The kit's spec of an engine unit's running skill with its battle and piece, or null. @param {Unit} u */
function specOf(u) {
  const b = battles.get(u), p = b?.unitOf(u), spec = p?.skill?.spec;
  return b && p && spec ? { b, p, spec } : null;
}

/** An engine unit's battle and piece when it has a kit, or null. @param {Unit} u */
function pieceOf(u) {
  const b = battles.get(u), p = b?.unitOf(u);
  return b && p?.kit ? { b, p } : null;
}

/**
 * A callback of a piece's attack profile now (Stronghold's effectiveProfile): its skill's attack's while `skillOn`, else
 * its kit trait's; null without one.
 * @param {ShUnit} p @param {string} name @param {boolean} skillOn
 * @returns {((...args: any[]) => any) | null}
 */
function profileFn(p, name, skillOn) {
  const a = skillOn ? p.skill?.spec?.attack?.[name] : undefined, t = p.kit?.trait?.[name];
  return typeof a === 'function' ? a : typeof t === 'function' ? t : null;
}

/**
 * The trait behaviour of a branch that has kits (职业-6): a kit's say, through its profile, on whether its operator may
 * attack now (`canAttack`) and what a turn without a target does (`storeEnergy`: an energy stored); a kit trait with its
 * own `install` owns the branch's deployment effects — its trait buff and upkeep (Stronghold's profession install gives
 * way to it). An operator
 * without a kit, or a kit without them, leaves these to the engine.
 * @type {Readonly<import('@aue/sim').TraitBehavior>}
 */
export const KIT_TRAIT_BEHAVIOR = Object.freeze({
  /** @param {any} ctx */
  canAttack(ctx) {
    const r = pieceOf(ctx.self), fn = r ? profileFn(r.p, 'canAttack', !!r.p.skill?.active) : null;
    if (!r || !fn) return undefined;
    const v = r.b.safe(() => fn(r.b, r.p), 'profile.canAttack', r.p);
    return v === undefined ? undefined : !!v;
  },
  /**
   * An enemy the kit's attack profile never selects now (Stronghold's `skipEnemy`, targeting.js canTargetEnemy: 黑键 S3
   * only elite or leader enemies, 嵯峨 not the 重伤): its skill's while the skill runs, else its kit trait's.
   * @param {any} ctx @param {Unit} target
   */
  skip(ctx, target) {
    const r = pieceOf(ctx.self), fn = r ? profileFn(r.p, 'skipEnemy', !!r.p.skill?.active) : null, e = r?.b.unitOf(target);
    if (!r || !fn || !e) return undefined;
    return !!r.b.safe(() => fn(e), 'profile.skipEnemy', r.p);
  },
  /** A kit trait with an `install` of its own takes the place of the branch's (Stronghold's profession install). @param {any} ctx */
  own(ctx) {
    const r = pieceOf(ctx.self);
    return r && typeof r.p.kit?.trait?.install === 'function' ? true : undefined;
  },
  /** @param {any} ctx */
  store(ctx) {
    const r = pieceOf(ctx.self), fn = r ? profileFn(r.p, 'storeEnergy', !!r.p.skill?.active) : null;
    if (!r || !fn) return undefined;
    r.p.trait.hadTarget = false;
    return !!r.b.safe(() => fn(r.b, r.p), 'profile.storeEnergy', r.p);
  },
});

/** Each piece's count of attacks landing and the main target of the latest (Stronghold's attackId and `main`). @type {WeakMap<ShUnit, { id: number, main: ShUnit | null }>} */
const landing = new WeakMap();

/**
 * One victim's hit as Stronghold's profile callbacks see it: what it dealt, its kind (an aftershock is a splash), the
 * attack's main target and id, whether a skill's. A main target's starts the count of another attack.
 * @param {ShUnit} p @param {Record<string, any>} k the engine's `attackHit` @param {ShUnit} target
 */
function hitOf(p, k, target) {
  const kind = k.kind === 'aftershock' ? 'splash' : k.kind;
  if (kind === 'main') landing.set(p, { id: (landing.get(p)?.id ?? 0) + 1, main: target });
  const now = landing.get(p) ?? { id: 0, main: null };
  return { dealt: k.dealt, kind, isSplash: kind === 'splash', isChain: kind === 'chain', main: now.main, attackId: now.id, isSkill: k.isSkill };
}

/** A spec callback's context, as Stronghold's. @param {ShBattle} b @param {ShUnit} p @param {Record<string, unknown>} [more] */
const ctxOf = (b, p, more = {}) => ({ battle: b, unit: p, skill: p.skill, bb: p.skill?.bb ?? {}, ...more });

/**
 * Runs a spec callback for the kit (recorded and skipped when it throws).
 * @param {ShBattle} b @param {ShUnit} p @param {((ctx: any) => void) | undefined} fn @param {string} label @param {Record<string, unknown>} [more]
 * @returns {Record<string, any> | null} the context it ran with
 */
function call(b, p, fn, label, more) {
  if (typeof fn !== 'function') return null;
  const ctx = ctxOf(b, p, more);
  b.safe(() => fn(ctx), label, p);
  return ctx;
}

/**
 * Stronghold's spec kinds that give a skill a time, and the engine's kind (技能-1): a toggle runs until it is closed or its
 * duration ends. Its `instant` and `charges` (instant with charges) are a next-attack skill when the spec has an attack
 * of its own; without one they keep the record's kind.
 * @type {Readonly<Record<string, import('@aue/sim').skills.SkillKind>>}
 */
const TIMED = Object.freeze({ duration: 'duration', toggle: 'duration', ammo: 'ammo', passive: 'passive' });

/** The engine's kind of a spec (技能-1), or undefined for the record's. @param {Record<string, any>} spec */
function kindOf(spec) {
  if (Object.hasOwn(TIMED, spec.kind)) return TIMED[spec.kind];
  const instant = spec.kind === 'instant' || spec.kind === 'charges';
  return instant && spec.attack && !spec.attack.noAttack ? /** @type {const} */ ('next') : undefined;
}

/**
 * Whether a spec's attack turns a healer's on enemies (职业-2): it deals damage of a type and does not heal (Stronghold's
 * effectiveProfile drops the profile's heal then).
 * @param {Record<string, any> | undefined} a
 */
const foes = (a) => !!a && ['phys', 'arts', 'true'].includes(a.dmgType) && !a.heal;

/** A spec attack's 倍率 over `scale`: its atkScale, × a numeric dmgMul. @param {Record<string, any>} a @param {number} scale */
const scaleOf = (a, scale) => (Number.isFinite(a.atkScale) ? a.atkScale : scale) * (typeof a.dmgMul === 'number' && Number.isFinite(a.dmgMul) ? a.dmgMul : 1);

/**
 * A spec's attack override as the engine's attack mods (技能-5): 倍率 (× a numeric `dmgMul`, which Stronghold applies to
 * every hit of the attack), hits, targets (every one in range for `allInRange`), damage type or a heal, a status each
 * hit gives.
 * @param {Record<string, any>} spec @param {import('@aue/sim').skills.AttackMods} mods
 */
function attackOf(spec, mods) {
  const a = spec.attack ?? {}, t = spec.targeting ?? {}, out = { ...mods }, n = t.maxTargets ?? a.maxTargets;
  out.scale = scaleOf(a, out.scale);
  if (Number.isFinite(a.hits)) out.times = Math.max(1, Math.floor(a.hits));
  if (Number.isFinite(n)) out.targets = Math.max(1, Math.floor(n));
  if (t.allInRange) out.targets = Infinity;
  if (a.dmgType === 'heal') out.heal = true;
  else if (a.dmgType === 'phys' || a.dmgType === 'arts' || a.dmgType === 'true') out.type = a.dmgType;
  const st = a.onHitStatus;
  if (st && Number(st.duration) > 0) out.hitStatus = { key: /** @type {any} */ (statusKeyOf(st.key)), seconds: Number(st.duration) };
  return out;
}

/**
 * The skill behaviour of every skill a kit describes (兼容-5): its spec for an operator that has one, the engine's
 * generic one otherwise.
 * @type {Readonly<SkillBehavior>}
 */
export const SPEC_BEHAVIOR = Object.freeze({
  /**
   * The running skill's range: the spec's `targeting.rangeGrid` (facing-right [row, col] offsets) as it is now — a kit
   * may rebuild it in place at the start (司霆惊蛰 S2) —; none: the record's (技能-8).
   * @param {Unit} u
   */
  range(u) {
    const g = specOf(u)?.spec?.targeting?.rangeGrid;
    return Array.isArray(g) && g.length ? g.map(([row, col]) => ({ row, col })) : null;
  },
  /** The spec's kind and time over the record's (技能-6): a duration or a toggle runs its `duration`, else its kind. @param {any} ctx */
  timing(ctx) {
    const spec = specOf(ctx.self)?.spec;
    const kind = spec ? kindOf(spec) : undefined, seconds = Number(spec?.duration);
    return kind ? { kind, ...(Number.isFinite(seconds) && seconds > 0 ? { seconds } : {}) } : null;
  },
  /** @param {any} ctx */
  start(ctx) {
    const r = specOf(ctx.self);
    if (!r) { skills.GENERIC.start?.(ctx); return; }
    const { b, p, spec } = r;
    // Stronghold counts the activation before onStart (a kit compares it later); kits.js counts the others at skillStart
    if (p.skill) { p.skill.activations++; p.skill.counted = true; }
    const flags = { ...spec.flags, ...(spec.attack?.noAttack ? { noAttack: true } : {}), ...(foes(spec.attack) ? { attackFoes: true } : {}) };
    if (spec.mods || Object.keys(flags).length) b.giveBuff(p, { key: 'skill', mods: modsOf(spec.mods), flags: flagsOf(flags) });
    call(b, p, spec.onStart, 'skill.onStart');
  },
  /** @param {any} ctx */
  tick(ctx) {
    const r = specOf(ctx.self);
    if (r) call(r.b, r.p, r.spec.onTick, 'skill.onTick', { dt: constants.TICK });
  },
  /** The spec's onEnd with why the skill ends (Stronghold's reason, the engine's: 技能-6), then its buff goes. @param {any} ctx @param {string} reason */
  end(ctx, reason) {
    const r = specOf(ctx.self);
    if (!r) { skills.GENERIC.end?.(ctx, reason); return; }
    call(r.b, r.p, r.spec.onEnd, 'skill.onEnd', { reason });
    r.b.removeBuff(r.p, 'skill');
  },
  /** @param {any} ctx @param {any} mods */
  /**
   * A spec's attacks (兼容-5): the operator's own attack with the spec's overrides only — the blackboard's attack keys are
   * the spec's to read (令's S3 atk_scale is its pulses', not her attacks'), and so are the timed modifiers, HP back,
   * 元素损伤 and push or pull its description gives the engine's skill (技能-9).
   * @param {any} ctx @param {any} mods
   */
  attack(ctx, mods) {
    const r = specOf(ctx.self);
    if (!r) return mods;
    const { hitDebuff: _d, selfHeal: _h, epScale: _e, displace: _p, ...own } = mods;
    return attackOf(r.spec, { ...own, scale: 1, times: 1, targets: 1 });
  },
});

/**
 * The profile's callbacks after an attack's hits on one target (the engine's `attackHit`, 兼容-5): the kit trait's
 * `onEachHit(battle, unit, victim, hit)` for every victim — the main target, a splashed or a jumped-to one — and the
 * profile's `afterHit` after the main target's; while the skill runs or for its own attack landing later (a next-attack
 * skill's projectile), the spec's `attack.onEachHit` for every victim and `attack.onHit`, `onHit` for the main target.
 * @param {Record<string, any>} k the engine's context
 */
export function onAttackHit(k) {
  const r = pieceOf(k.attacker);
  if (!r) return;
  const { b, p } = r, target = b.unitOf(k.target), hc = hitOf(p, k, target), kind = hc.kind, skillOn = !!(p.skill?.active || k.isSkill);
  const each = p.kit?.trait?.onEachHit, spec = skillOn ? p.skill?.spec : null;
  if (typeof each === 'function') b.safe(() => each(b, p, target, hc), 'profile.onEachHit', p);
  if (spec) call(b, p, spec.attack?.onEachHit, 'skill.attack.onEachHit', { target, ...hc });
  if (kind !== 'main') return;
  const after = afterHitOf(p, k.mark, skillOn);
  if (after) b.safe(() => after(b, p, target, { dealt: k.dealt, x: target.x, y: target.y, isSkill: k.isSkill }), 'profile.afterHit', p);
  if (!spec) return;
  call(b, p, spec.attack?.onHit, 'skill.attack.onHit', { target, dealt: k.dealt, x: target.x, y: target.y });
  call(b, p, spec.onHit, 'skill.onHit', { target, dealt: k.dealt, x: target.x, y: target.y });
}

/**
 * A boomerang of a kitted piece at its target (the engine's `boomerangHit`, 职业-12): a profile with `boomerangOnward`
 * (the skill attack's when a skill's attack threw it, else the kit trait's — the profile it was thrown with, as
 * Stronghold's) takes its flight over — the engine holds it there and the
 * callback gets { battle, unit, profile, target, x, y, attackId, isSkill, home(), hit(target), comeBack(x, y) }:
 * `comeBack` sends it back from (x, y) once and returns its way back ({ x, y } where it is, { tx, ty } its thrower), `hit`
 * strikes another enemy with this attack. A callback that throws sends it back from where it hit.
 * @param {Record<string, any>} k the engine's context
 */
export function onBoomerangHit(k) {
  const r = pieceOf(k.unit), fn = r ? profileFn(r.p, 'boomerangOnward', !!k.isSkill) : null;
  if (!r || !fn) return;
  const { b, p } = r, u = k.unit, shot = k.shot;
  const home = () => u.hp > 0 && b.w.units.includes(u);
  const comeBack = (/** @type {number} */ x, /** @type {number} */ y) => {
    const s = home() ? swing.sendBack(b.w, shot, x, y) : null;
    return s ? { get x() { return s.sx; }, get y() { return s.sy; }, get tx() { return u.x; }, get ty() { return u.y; } } : null;
  };
  const hit = (/** @type {any} */ t) => { if (t?.u) boomerangStrike(b.w, b.c, shot, t.u); };
  k.hold = true;
  const ctx = { battle: b, unit: p, profile: p.profile, target: b.unitOf(k.target), x: k.x, y: k.y, attackId: 0, isSkill: k.isSkill, home, hit, comeBack };
  if (b.safe(() => { fn(ctx); return true; }, 'boomerang.onward', p) !== true) comeBack(k.x, k.y);
}

/**
 * The `afterHit` of an attack's main hit: the one a kit gave that attack (its mark, 兼容-4), else its profile's.
 * @param {ShUnit} p @param {number} mark @param {boolean} skillOn
 */
const afterHitOf = (p, mark, skillOn) => (mark ? p.attackOverrides.get(mark)?.afterHit : null) ?? profileFn(p, 'afterHit', skillOn);

/** Whether a hit is the engine's attack's on its main target: not a kit's own, no splash, chain or aftershock. @param {Record<string, any>} d */
const mainHit = (d) => !!d.isAttack && !kitHits.has(d) && !d.isSplash && !(d.tags ?? []).some((/** @type {string} */ t) => t === 'chain' || t === 'aftershock');

/**
 * The profile's own say on its main target's hit (the engine's `hit`, before the defences and any other handler) — the
 * spec attack's while the skill runs (or its attack lands later), else the kit trait's: `hitsFn` giving 0 — the attack
 * deals nothing itself — cancels it and ends the dispatch (its hit callbacks still run, with nothing dealt, as
 * Stronghold's); a `dmgMul` — per target `(battle, unit, target)`, or a kit trait's number — takes the place of the
 * trait's 倍率 for that target (职业-8, 职业-11), as Stronghold's profile replaces its profession's: the hit's amount × it
 * ÷ the trait's.
 * @param {Record<string, any>} k the engine's context
 */
export function onSpecHit(k) {
  const r = k.source ? pieceOf(k.source) : null;
  if (!r || !mainHit(k.dmg)) return;
  const { b, p } = r, skillOn = !!(p.skill?.active || k.dmg.isSkill), hits = profileFn(p, 'hitsFn', skillOn);
  if (hits && Number(b.safe(() => hits(b, p, {}), 'profile.hitsFn', p)) === 0) {
    k.dmg.cancel = true;
    k.stopPropagation = true;
    return;
  }
  const fn = profileFn(p, 'dmgMul', skillOn), n = p.kit?.trait?.dmgMul;
  const m = fn ? b.safe(() => fn(b, p, b.unitOf(k.target)), 'profile.dmgMul', p) : typeof n === 'number' ? n : undefined;
  if (!Number.isFinite(m)) return;
  const own = traitScale(b.w, b.c, k.source, k.target);
  k.dmg.amount *= /** @type {number} */ (m) / (own > 0 ? own : 1);
}

/**
 * The spec's `onAttack` after an attack landed (the engine's `attack`), while the skill runs: it may make the attack
 * spend no ammo.
 * @param {Record<string, any>} k the engine's context
 */
export function onAttackDone(k) {
  const r = pieceOf(k.attacker);
  if (!r) return;
  const { b, p } = r, targets = k.targets.map((/** @type {Unit} */ t) => b.unitOf(t)), after = profileFn(p, 'afterAttack', !!p.skill?.active);
  if (after) b.safe(() => after(b, p, targets), 'profile.afterAttack', p);
  if (!p.skill?.active || !p.skill.spec) return;
  const ctx = call(b, p, p.skill.spec.onAttack, 'skill.onAttack', { targets, noAmmo: false });
  if (ctx?.noAmmo) k.noAmmo = true;
}
