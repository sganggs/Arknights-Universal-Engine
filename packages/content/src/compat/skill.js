// Stronghold's skill runtime over the engine's skill state (docs/spec/compat.md 兼容-4): what a kit reads and changes of
// an operator's skill — whether it has one, runs, runs for a time, its charges, time and ammo left; its SP, gained by
// Stronghold's rules (none while a timed skill runs or under 阻回, except SP that ignores 阻回: Stronghold's 'init' and the
// exceptions a kit names, 技能-2) or set outright; starting it (free or not) and ending it with Stronghold's reasons. The
// automatic start rules stay the engine's (技能-3): a kit's rule changes are accepted and unused; its extra trigger ranges
// are kept, with whether one holds an enemy now (triggerSatisfied: for whoever starts the skill as Stronghold's automatic
// operations — the kit differential —; the engine's rules do not read them).
import { attrs, skills, sp } from '@aue/sim';

/** @typedef {import('./unit.js').ShUnit} ShUnit @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').SkillState} SkillState @typedef {import('@aue/sim').SkillDef} SkillDef */

/** Kinds that run for a time and hold SP back while they do (Stronghold's `isTimed`). */
const TIMED = new Set(['duration', 'ammo', 'toggle']);
/** Frames a second (时间-1). */
const FPS = 30;

/** Enemies a trigger range takes by default: any it can select, air units too (Stronghold's TRIGGER_PROFILE). */
const TRIGGER_PROFILE = Object.freeze({ canHitFly: true });

/**
 * An entry of a trigger range as tile keys and the profile that selects in them: tile keys; an ally unit (its range);
 * `{ keys, profile }`. Null for anything else. @param {any} x @returns {{ keys: number[], profile: Record<string, any> } | null}
 */
function triggerEntry(x) {
  if (Array.isArray(x)) return { keys: x, profile: TRIGGER_PROFILE };
  if (x?.side === 'ally' && x.alive && x.deployed && !x.hidden) return { keys: x.rangeKeys ?? [], profile: TRIGGER_PROFILE };
  return Array.isArray(x?.keys) ? { keys: x.keys, profile: x.profile ?? TRIGGER_PROFILE } : null;
}

export class ShSkill {
  /** @param {ShUnit} unit @param {Record<string, any> | null} spec the kit's spec of the selected skill */
  constructor(unit, spec) {
    this.unit = unit; this.spec = spec;
    /** how many times it started this battle, over every deployment */
    this.activations = 0;
    /** the activation already counted by the spec's start (specs.js), before skillStart */
    this.counted = false;
    /** @type {Function[]} the extra ranges a kit gave the automatic start (addTriggerRange) */
    this.triggerRanges = [];
    /** @type {Set<Function>} those of them for an attack only (Stronghold's `attackOnly`) */
    this.attackTriggerRanges = new Set();
    /** the multiplier content set on its SP cost (Stronghold's spCostMul: 绝技 ×0.7), for every deployment */
    this.costMul = 1;
  }

  /** How it gains SP: time, attack, hurt or none (技能-2). */
  get spType() { return this.st?.spType ?? this.def?.sp ?? 'time'; }
  /** The multiplier on its SP cost (兼容-7). */
  get spCostMul() { return this.costMul; }
  /** Content sets it (anything but a finite number ≥ 0 is 1): the cost is ⌊the skill's × it⌋ from now on. @param {number} v */
  set spCostMul(v) {
    this.costMul = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 1;
    this.applyCost();
  }

  /**
   * Its SP cost by the multiplier (Stronghold's spCost: ⌊base × spCostMul⌋), on the engine's state of this deployment:
   * the cost and the cap (cost × charges, 技能-2), its SP no more than the cap.
   */
  applyCost() {
    const st = this.st, d = this.def;
    if (!st || !d || !(d.cost > 0)) return;
    const cost = Math.max(0, Math.floor(d.cost * this.costMul));
    if (st.cost === cost) return;
    st.cost = cost;
    st.cap = cost * Math.max(1, d.charges);
    sp.setSp(st, st.sp);
  }

  /** The engine's state of the skill, null without one or off the field. @returns {SkillState | null} */
  get st() { return this.unit.u?.skill ?? null; }
  /** The skill the engine runs for the operator (the content's). @returns {SkillDef | null} */
  get def() { return this.unit.b.c.operators[this.unit.defId]?.skill ?? null; }
  get noSkill() { return !this.def; }
  /** The kit's kind of the skill, else the engine's (技能-1). */
  get kind() { return this.spec?.kind ?? (this.def ? skills.kindOf(this.def) : null); }
  get isTimed() { return TIMED.has(this.kind); }
  get active() { return !!this.st?.active; }
  get id() { return this.st?.id ?? this.def?.id ?? null; }
  get skillId() { return this.id; }
  /** A next-attack skill started and waiting for its attack. */
  get pending() { return !!this.st?.armed; }
  get sp() { return this.st?.sp ?? 0; }
  set sp(n) { if (this.st) sp.setSp(this.st, n); }
  get spCost() { return this.st?.cost ?? 0; }
  get maxCharges() { const st = this.st; return st && st.cost > 0 ? Math.round(st.cap / st.cost) : 1; }
  get charges() { const st = this.st; return st && st.cost > 0 ? Math.floor(st.sp / st.cost) : 0; }
  /** Whole charges, the SP toward the next kept. */
  set charges(n) { const st = this.st; if (st && st.cost > 0) sp.setSp(st, Math.max(0, Math.floor(Number(n) || 0)) * st.cost + (st.sp % st.cost)); }
  get ready() { const st = this.st; return !!st && !this.noSkill && st.sp >= st.cost; }
  /** Seconds left of a running timed skill, 0 otherwise. */
  get timeLeft() { const st = this.st; return st?.active && st.dur > 0 ? st.dur / FPS : 0; }
  set timeLeft(s) { if (this.st) skills.setTimeLeft(this.st, Number(s) * FPS); }
  /** Its duration in seconds, as the content gives it. */
  get duration() { return this.def?.duration ?? 0; }
  get ammoLeft() { const st = this.st; return st?.active ? st.ammo : 0; }
  set ammoLeft(n) { const st = this.st; if (st) skills.setAmmo(st, Number(n)); }
  /** Seconds from the battle's start to its last start, −Infinity before any. */
  get lastStart() { const st = this.st; return st && st.at >= 0 ? st.at / FPS : -Infinity; }
  get rangeGrid() { return this.unit.def?.skill?.rangeGrid ?? null; }
  get bb() { return this.unit.def?.skill?.bb ?? {}; }
  /** The automatic start's own cooldown: none here (技能-3). */
  get opCooling() { return false; }

  /**
   * Starts the skill (技能-3): a free start takes no SP; otherwise it needs its cost. Whether it started.
   * @param {string} [reason] @param {{ free?: boolean }} [o]
   */
  activate(reason = 'manual', o = {}) {
    const st = this.st, u = this.unit.u, b = this.unit.b;
    if (!st || !u || st.active || this.noSkill || (!o.free && st.sp < st.cost)) return false;
    skills.activate(b.w, b.c, u, reason, !!o.free);
    return true;
  }

  /** Ends the running skill (技能-4). @param {string} [reason] */
  end(reason = 'end') {
    const st = this.st, u = this.unit.u, b = this.unit.b;
    if (st?.active && u) skills.endSkill(b.w, b.c, u, reason);
  }
  stop() { this.end('stopped'); }

  /**
   * An extra range for the automatic start (`(fn, { attackOnly })`, Stronghold's): kept (triggerSatisfied); returns its
   * removal. @param {Function} fn @param {{ attackOnly?: boolean }} [o]
   */
  addTriggerRange(fn, o = {}) {
    if (typeof fn !== 'function') return () => {};
    this.triggerRanges.push(fn);
    if (o.attackOnly) this.attackTriggerRanges.add(fn);
    return () => { this.attackTriggerRanges.delete(fn); const i = this.triggerRanges.indexOf(fn); if (i >= 0) this.triggerRanges.splice(i, 1); };
  }

  /**
   * Whether an enemy is in one of the extra ranges now (Stronghold's _extraTriggerSatisfied(false): those for an attack
   * only aside; an entry is tile keys, an ally unit — its range —, or `{ keys, profile }`). Our modes have no ally
   * targets on the enemy side (兼容-4), so only enemies count.
   */
  triggerSatisfied() {
    const b = this.unit.b, u = this.unit;
    const holds = (/** @type {any} */ x) => { const e = triggerEntry(x); return !!e && e.keys.length > 0 && b.enemiesInKeys(e.keys, u, e.profile).length > 0; };
    for (const fn of this.triggerRanges) {
      if (this.attackTriggerRanges.has(fn)) continue;
      const list = b.safe(() => fn(b, u), 'skill.triggerRange', u);
      if (list && typeof list[Symbol.iterator] === 'function' && [...list].some(holds)) return true;
    }
    return false;
  }
  /** A change of the automatic start's rule (`(rule, grid)`): accepted, unused (技能-3). */
  setTrigger() {}

  /**
   * Adds SP up to the bar's cap; returns what was gained. `reason` 'init' or `o.ignoreLock`: SP that ignores 阻回.
   * @param {number} amount @param {string} [reason] @param {boolean} [_silent] @param {{ ignoreLock?: boolean }} [o]
   */
  gainSp(amount, reason = 'time', _silent, o = {}) {
    const st = this.st;
    if (!st || this.noSkill || !(st.cost > 0)) return 0;
    if (reason === 'init' || o.ignoreLock) return sp.forceSp(st, amount);
    if ((st.active && this.isTimed) || attrs.statsOf(/** @type {Unit} */ (this.unit.u)).flags.noSp) return 0;
    return sp.forceSp(st, amount);
  }
}
