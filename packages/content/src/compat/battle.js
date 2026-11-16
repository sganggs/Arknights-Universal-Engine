// Stronghold's battle over the engine's world (docs/spec/compat.md 兼容-4): the object its kits receive — the hook bus
// and timers on the engine's (钩子-1…钩子-3) with contexts in Stronghold's shape, its units (unit.js), random numbers,
// cost, buffs and statuses on the engine's own. Kit code runs with the level's grid size (兼容-1); a kit's handler that
// throws is skipped and recorded (Stronghold isolates content errors the same way). Times are seconds to the kits and
// whole frames to the engine (时间-2).
import { FPS, hypot, secondsToFrames } from '@aue/math';
import { KIND, bus, buffs, status, traits, blocking, displacement, draw, weightedPick, setExtraRange, attackNow } from '@aue/sim';
import { withGrid } from './grid.js';
import { ShUnit, ShBuff } from './unit.js';
import { STATUS_NAME, ELEMENT_NAME, statusKeyOf, modsOf, flagsOf, buffKeyOf } from './mods.js';
import { KIT_BUFF, hooksOf, runHook } from './buffhooks.js';
import { STAND_INS, giveStandIn } from './standins.js';
import { ShProjectiles } from './projectiles.js';
import * as field from './field.js';
import * as summoning from './summons.js';
import { ShGrid } from './tiles.js';
import { CompatGap, gap } from './sh/gap.js';
import { effectiveProfile } from './sh/ai.js';
import { shData } from './sh/data.js';
import * as players from './players.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Content} Content @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {(ctx: any, b: ShBattle) => void} Handler */

/** Seconds a frame (时间-1). */
export const TICK = 1 / 30;



/** Stronghold's buff refresh rules → the engine's same-key rules (状态-2). @type {Record<string, string>} */
const RULES = { extend: 'extend', stack: 'stack', independent: 'independent' };

/** A unit as a kit sees it, or null; a unit a kit already sees (its own emit's) stays. @param {ShBattle} b @param {Unit | ShUnit | null | undefined} u */
const sh = (b, u) => (u ? (u instanceof ShUnit ? u : b.unitOf(u)) : null);

/** A hit's context for `hit` and `damageCalculate` (兼容-4): the engine's damage info as it is. @param {ShBattle} b @param {Record<string, any>} k */
const hitShape = (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), dmg: k.dmg, credit: sh(b, k.credit) });

/**
 * An element hit's damage info as Stronghold's (兼容-4): its element by Stronghold's name; the amount, multiplier and
 * cancel read and write the engine's.
 * @param {Record<string, any>} d
 */
const elementDmg = (d) => ({
  type: 'element', element: ELEMENT_NAME[d.element] ?? d.element, isAttack: false, isSkill: false, tags: [],
  get amount() { return d.amount; }, set amount(v) { d.amount = v; }, get mul() { return d.mul; }, set mul(v) { d.mul = v; },
  get cancel() { return d.cancel; }, set cancel(v) { d.cancel = v; },
});

/**
 * An engine event's context as Stronghold's (兼容-4), by event: units as ShUnits, `frames` as `dt` seconds; the damage
 * info is the engine's own (the same names, ADR 0012); what a handler may change reads and writes the engine's context.
 * @type {Record<string, (b: ShBattle, k: Record<string, any>) => Record<string, any>>}
 */
const SHAPES = {
  deploy: (b, k) => ({ unit: sh(b, k.unit), initial: !!k.initial || !b.started, ...(k.move ? { move: true } : {}) }),
  death: (b, k) => ({ unit: sh(b, k.unit), reason: k.reason, killer: sh(b, k.killer), dying: false }),
  kill: (b, k) => ({ killer: sh(b, k.killer), victim: sh(b, k.victim) }),
  enemySpawn: (b, k) => ({ enemy: sh(b, k.enemy) }),
  tick: (_b, k) => ({ dt: k.frames * TICK }),
  hit: hitShape,
  damageCalculate: hitShape,
  damageApplying: (b, k) => ({ ...hitShape(b, k), get amount() { return k.amount; }, set amount(v) { k.amount = v; } }),
  damageApplied: (b, k) => ({ ...hitShape(b, k), kind: k.kind, amount: k.amount, hpRemoved: k.hpRemoved }),
  statusApplied: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), status: STATUS_NAME[k.status] ?? k.status,
    duration: k.frames < 0 ? Infinity : k.frames * TICK, value: k.strength, entered: k.entered }),
  ammoUsed: (b, k) => ({ unit: sh(b, k.unit), left: k.left, skill: sh(b, k.unit)?.skill ?? null }),
  dodge: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), dmg: k.dmg }),
  damaged: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), amount: k.amount, type: k.type, dmg: k.dmg, credit: sh(b, k.credit) }),
  hpDamage: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), dmg: k.dmg, credit: sh(b, k.credit),
    get amount() { return k.amount; }, set amount(v) { k.amount = v; } }),
  fatal: (b, k) => ({ unit: sh(b, k.unit), source: sh(b, k.source), credit: sh(b, k.credit), dmg: k.dmg, amount: k.amount,
    get prevented() { return k.prevented; }, set prevented(v) { k.prevented = v; } }),
  heal: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), opts: healOpts(b, k), get amount() { return k.amount; }, set amount(v) { k.amount = v; } }),
  beforeAttack: (b, k) => {
    const p = sh(b, k.attacker), profile = p ? { ...effectiveProfile(p) } : undefined;
    return { attacker: p, targets: k.targets.map((/** @type {Unit} */ t) => b.unitOf(t)), isSkill: k.isSkill, profile, baseScale: Number(profile?.atkScale ?? 1), baseAfterHit: profile?.afterHit };
  },
  attack: (b, k) => ({ attacker: sh(b, k.attacker), targets: k.targets.map((/** @type {Unit} */ t) => b.unitOf(t)), isSkill: k.isSkill }),
  skillStart: (b, k) => ({ unit: sh(b, k.unit), skill: sh(b, k.unit)?.skill ?? null, reason: k.reason }),
  skillEnd: (b, k) => ({ unit: sh(b, k.unit), skill: sh(b, k.unit)?.skill ?? null, reason: k.reason }),
  elementHit: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), dmg: elementDmg(k.dmg) }),
  elementBurst: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), element: ELEMENT_NAME[k.element] ?? k.element }),
  boomerangCaught: (b, k) => ({ unit: sh(b, k.unit), attackId: 0, isSkill: !!k.isSkill, x: k.x, y: k.y }),
  merchantPay: (b, k) => ({ unit: sh(b, k.unit), get cost() { return k.cost; }, set cost(v) { k.cost = v; }, get cancel() { return k.cancel; }, set cancel(v) { k.cancel = v; } }),
  beforeStatus: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), status: STATUS_NAME[k.status] ?? k.status,
    get duration() { return k.frames < 0 ? Infinity : k.frames * TICK; }, set duration(v) { k.frames = v === Infinity ? -1 : secondsToFrames(Math.max(0, Number(v) || 0)); },
    get value() { return k.strength; }, set value(v) { k.strength = v; }, get cancel() { return k.cancel; }, set cancel(v) { k.cancel = v; } }),
};

/**
 * A heal's options as Stronghold's `heal` event gives them (兼容-4): those the kit passed to its heal; for the engine's
 * own heals, a trait's self-heal (职业-9) as Stronghold's profession heals itself (`self`, `ignoreHealFree`), else none.
 * @param {ShBattle} b @param {Record<string, any>} k
 */
const healOpts = (b, k) => b.healOpts ?? (k.trait ? { self: true, ignoreHealFree: true } : {});

/**
 * What a handler changed in place, written back to the engine's context after each handler (兼容-4): the targets an
 * attack locks; and what it wrote to the attack's own profile — a copy for this attack, as Stronghold's per-attack
 * profile —: its `atkScale` as this attack's 倍率 (the engine's `scale`, against the profile's own), its `afterHit` kept
 * with the piece under the attack's mark (`mark`) for its hits.
 * @type {Record<string, (ctx: Record<string, any>, k: Record<string, any>) => void>}
 */
const BACK = {
  beforeAttack: (ctx, k) => {
    k.targets = (Array.isArray(ctx.targets) ? ctx.targets : []).map((/** @type {any} */ t) => t?.u).filter(Boolean);
    const pr = ctx.profile, p = ctx.attacker, s = Number(pr?.atkScale ?? 1);
    if (!pr || !p) return;
    if (Number.isFinite(s) && s >= 0 && ctx.baseScale > 0 && s !== ctx.baseScale) k.scale = s / ctx.baseScale;
    if (typeof pr.afterHit === 'function' && pr.afterHit !== ctx.baseAfterHit) k.mark = p.markAttack({ afterHit: pr.afterHit }, k.mark);
  },
};

/**
 * The events Stronghold sends that the engine does not (兼容-4): a kit that listens to one never hears the engine —
 * recorded when it listens (ShBattle.noteEvent) —, though the kit's own `emit` of it still reaches its handlers.
 * @type {ReadonlySet<string>}
 */
const NOT_EMITTED = new Set(['damageOutput', 'damageBeforeApply', 'damageCalculateTarget', 'block', 'blocked', 'projectileStep', 'spGain', 'palsyTrigger',
  'enemyAttackStart', 'hpChanged', 'modifierApplied', 'elementApplied', 'enemyLeak', 'battleEnd']);

/** Whether a context is one a kit emitted itself, its units already as kits see them. @param {Record<string, any>} k */
const fromKit = (k) => Object.values(k).some((v) => v instanceof ShUnit);

/**
 * An engine event's context as Stronghold's (兼容-4); a custom event's, and one a kit emitted itself, as it is.
 * @param {ShBattle} b @param {string} name @param {Record<string, any>} k @returns {Record<string, any>}
 */
const shapeOf = (b, name, k) => (Object.hasOwn(SHAPES, name) && !fromKit(k) ? SHAPES[name](b, k) : k);

export class ShBattle {
  /** @param {World} w @param {Content} c @param {{ players?: (players.PlayerInput | null | undefined)[] }} [o] Stronghold's players' inputs, by seat (兼容-7) */
  constructor(w, c, o = {}) {
    /** @type {World} */
    this.w = w;
    /** @type {Content} */
    this.c = c;
    this.dt = TICK; this.started = false;
    /** the level's tiles as Stronghold's grid */
    this.grid = new ShGrid(c.level);
    /** @type {{ label: string, who: string, message: string }[]} handler errors, recorded and skipped */
    this.errors = [];
    /** @type {Set<string>} the events no unit listens to for, already recorded (noteEvent) */
    this.eventGaps = new Set();
    /** @type {WeakMap<object, any>} the data a kit stored with a buff */
    this.buffData = new WeakMap();
    /** @type {WeakMap<object, ShBuff>} the buff a kit sees for each of the engine's buffs: one object for the buff's whole life */
    this.shBuffs = new WeakMap();
    /** how many buffs a kit has seen: Stronghold's acquisition order of them */
    this.buffSeq = 0;
    /** @type {ShUnit | null} whose kit code runs now: handlers a kit registers without an owner are the running one's (errors name it) */
    this.who = null;
    /** @type {WeakMap<object, import('./buffhooks.js').Hooks>} the callbacks of a kit's buff (buffhooks.js) */
    this.buffHooks = new WeakMap();
    /** @type {Map<string, ShUnit>} the deck pieces, by `seat|key` */
    this.pieces = new Map();
    /** @type {WeakMap<Unit, ShUnit>} */
    this.others = new WeakMap();
    /** @type {WeakMap<object, Record<string, any>>} each engine context's Stronghold shape, shared by its handlers */
    this.shapes = new WeakMap();
    /** @type {Record<string, any> | null} the kit of the token spawnToken is placing (summons.js) */
    this.pendingKit = null;
    /** @type {Readonly<Record<string, Function>> | null} the kits Stronghold's tokens module defines, by summon id (kits.js); none without the module */
    this.tokenKits = null;
    /** @type {Record<string, any> | null} the options of the kit's heal under way (field.js heal) */
    this.healOpts = null;
    this.rng = makeRng(w);
    /** the kits' own shots (projectiles.js) */
    this.projectiles = new ShProjectiles(this);
    /**
     * Stronghold's data source as content reads it: raw summon records (summons.js rawToken) — a raw enemy record, a gap —
     * and its game data (`raw`, sh/data.js; empty without it).
     */
    this.data = Object.freeze({ rawToken: (/** @type {string} */ id) => summoning.rawToken(this, id), rawEnemy: gap('data.rawEnemy'), get raw() { return shData() ?? {}; } });
    /** whether the handler that sends the hpDamage transfers is on (transfer) */
    this.transfersOn = false;
    /** Stronghold's players (兼容-7), by seat; none without their inputs. */
    this.players = (o.players ?? []).map((x, seat) => players.makePlayer(this, seat, x ?? {}));
    /** Stronghold's battle flags (`flags`): in-battle layer gains are on, as in its normal battles. */
    this.battleFlags = { layerGainsEnabled: true };
    /** @type {string | null} Stronghold's mode: none */
    this.modeId = null;
  }

  /** Stronghold's battle flags. */
  get flags() { return this.battleFlags; }
  /** Stronghold's battle kind: a normal battle. */
  get kind() { return 'normal'; }

  /** The field's rectangle as Stronghold's: the whole level. */
  get rect() { return { r0: 0, r1: this.c.level.height - 1, c0: 0, c1: this.c.level.width - 1 }; }

  /** Battle seconds: the frame's start (Stronghold's tickCount × dt, the same in every handler of a frame). */
  get time() { return this.w.frame * TICK; }
  /** The battle is over (结束-1). */
  get finished() { return this.w.result >= 0; }

  // ---- units -------------------------------------------------------------------------------------------------------

  /** The ShUnit of an engine unit: an operator's deck piece, a summon's token, else one made for it. @param {Unit} u @returns {ShUnit} */
  unitOf(u) {
    if (u.kind === KIND.OPERATOR && u.summoner === undefined) {
      const p = this.pieces.get(`${u.owner}|${u.key}`);
      if (p) return p;
    }
    let s = this.others.get(u);
    if (!s && u.summoner !== undefined) return summoning.tokenUnit(this, u);
    if (!s) {
      const op = u.kind === KIND.OPERATOR, d = op ? this.c.operators[u.key] : this.c.enemies[u.key];
      s = new ShUnit(this, { kind: op ? 'op' : 'enemy', key: u.key, ownerId: u.owner, def: d ? { name: d.name, profession: /** @type {any} */ (d).profession ?? null } : null, unit: u });
      this.others.set(u, s);
    }
    return s;
  }

  /** The buff of a unit as a kit sees it: the same object each time for one buff. @param {Unit} u @param {import('@aue/sim').Buff} buff @returns {ShBuff} */
  buffOf(u, buff) {
    let s = this.shBuffs.get(buff);
    if (!s) { s = new ShBuff(this, u, buff); this.shBuffs.set(buff, s); }
    return s;
  }

  /** The piece of a piece's id (on the field or not), else the unit of an engine id on the field, or null. @param {number} id @returns {ShUnit | null} */
  unitById(id) {
    for (const p of this.pieces.values()) if (p.pieceId === id) return p;
    const u = this.w.units.find((x) => x.id === id);
    return u ? this.unitOf(u) : null;
  }

  /** Every ally: the pieces, on the field or not, and the other operators on the field. */
  get allyUnits() {
    const others = this.w.units.filter((u) => u.kind === KIND.OPERATOR && !this.pieces.has(`${u.owner}|${u.key}`)).map((u) => this.unitOf(u));
    return [...this.pieces.values(), ...others];
  }
  /** The enemies on the field. */
  get enemies() { return this.w.units.filter((u) => u.kind === KIND.ENEMY).map((u) => this.unitOf(u)); }
  /** The allies on the field (no devices), of one player or of all. @param {number | null} [ownerId] */
  allies(ownerId = null) { return this.allyUnits.filter((a) => a.alive && a.kind !== 'device' && (ownerId == null || a.ownerId === ownerId)); }
  /** Whether an ability of ally `by` may select ally `a`: never a 孤立 one (flag `isolated`) but itself. @param {ShUnit} a @param {ShUnit | null} [by] */
  allySelectable(a, by = null) { return !!a && (a === by || !a.s?.flags.isolated); }
  /** The allies on the field an ability of `by` may select. @param {ShUnit} by @param {number | null} [ownerId] */
  alliesFor(by, ownerId = null) { return this.allies(ownerId).filter((a) => this.allySelectable(a, by)); }

  // ---- hooks and timers --------------------------------------------------------------------------------------------

  /** Runs kit code: with the level's grid, an error recorded and skipped. @template T @param {() => T} fn @param {string} label @param {unknown} owner @returns {T | undefined} */
  safe(fn, label, owner) {
    const before = this.who, who = owner instanceof ShUnit ? owner : before;
    this.who = who;
    try {
      return withGrid(this.c.level, fn);
    } catch (e) {
      this.errors.push({ label, who: who?.defId ?? '', message: String(e instanceof Error ? e.message : e) });
      return undefined;
    } finally {
      this.who = before;
    }
  }

  /** Stronghold's map of the events that have handlers, read by name (`_hooks.dodge`). @returns {Record<string, true | undefined>} */
  get _hooks() {
    const w = this.w;
    return new Proxy({}, { get: (_t, name) => (typeof name === 'string' && bus.hasHook(w, name) ? true : undefined) });
  }

  /** @param {string} name @param {Handler} fn @param {{ priority?: number, owner?: unknown, once?: boolean }} [o] */
  on(name, fn, o = {}) {
    const who = o.owner ?? this.who;
    if (NOT_EMITTED.has(name)) this.noteEvent(name, who);
    if (name === 'hpDamage' && !this.transfersOn) this.transfersOn = !!bus.on(this.w, 'hpDamage', (k) => this.transfer(k), { priority: -Infinity });
    return bus.on(this.w, name, (k) => {
      let ctx = this.shapes.get(k);
      if (!ctx) { ctx = shapeOf(this, name, k); this.shapes.set(k, ctx); }
      this.safe(() => fn(ctx, this), `hook:${name}`, who);
      if (ctx.stopPropagation) k.stopPropagation = true;
      if (Object.hasOwn(BACK, name)) BACK[name](ctx, k);
    }, o);
  }

  /**
   * Records that a kit listens to an event the engine never sends (NOT_EMITTED): `compat: event.<name> is not emitted yet`, once
   * for each unit and event — one registered with no unit running is once for the battle —, so that a kit that waits for
   * what does not come shows in the errors.
   * @param {string} name @param {unknown} who the unit the handler is registered for
   */
  noteEvent(name, who) {
    const holder = who instanceof ShUnit ? who : null, seen = holder ? (holder.gaps ??= new Set()) : this.eventGaps, mark = `event|${name}`;
    if (seen.has(mark)) return;
    seen.add(mark);
    this.errors.push({ label: `event.${name}`, who: holder?.defId ?? '', message: `compat: event.${name} is not emitted yet` });
  }

  /**
   * After every `hpDamage` handler: the shares they set aside (sh/attack.js reserveTransfer) go where they were meant,
   * each with the hit's tags and the transfers' (Stronghold's applyTransfers).
   * @param {Record<string, any>} k
   */
  transfer(k) {
    const entries = this.shapes.get(k)?.transfers?.entries;
    if (!entries?.length) return;
    const tags = [...new Set([...(k.dmg?.tags ?? []), ...entries.map((/** @type {{ tag: string }} */ e) => e.tag)])];
    for (const e of entries) this.safe(() => e.apply(e.amount, tags), 'transfer', null);
  }

  /** @param {any} h a handle from `on` */
  off(h) { bus.off(this.w, h); }
  /** @param {unknown} owner */
  offOwner(owner) { bus.offOwner(this.w, owner); }
  /** @param {string} name */
  hasHook(name) { return bus.hasHook(this.w, name); }
  /** A custom event. @param {string} name @param {Record<string, any>} ctx */
  emit(name, ctx) { return bus.emit(this.w, name, ctx); }

  /** @param {number} seconds @param {(b: ShBattle, s: any) => void} fn @param {{ owner?: unknown }} [o] */
  after(seconds, fn, o = {}) {
    const who = o.owner ?? this.who, t = bus.after(this.w, secondsToFrames(Math.max(0, Number(seconds) || 0)), () => this.safe(() => fn(this, t), 'after', who), o);
    return t;
  }

  /** @param {number} seconds @param {(b: ShBattle, s: any) => void} fn @param {{ owner?: unknown, immediate?: boolean }} [o] */
  every(seconds, fn, o = {}) {
    const who = o.owner ?? this.who, t = /** @type {any} */ (bus.every(this.w, secondsToFrames(Math.max(TICK, Number(seconds) || TICK)), () => { t.count++; this.safe(() => fn(this, t), 'every', who); }, o));
    t.count = 0;
    return t;
  }

  // ---- the field (field.js) ----------------------------------------------------------------------------------------

  /** @param {Iterable<number> | null | undefined} keys @param {ShUnit | null} attacker @param {Record<string, any>} [profile] */
  enemiesInKeys(keys, attacker, profile) { return field.enemiesInKeys(this, keys, attacker, profile); }
  /** Enemies on the occupied tiles (格子判定), not the collider. @param {Iterable<number> | null | undefined} keys @param {ShUnit | null} [attacker] @param {Record<string, any>} [profile] */
  enemiesOnTiles(keys, attacker = null, profile) { return field.enemiesOnTiles(this, keys, attacker, profile); }
  /** @param {number} x @param {number} y @param {number} r @param {boolean} [centre] */
  enemiesInRadius(x, y, r, centre = false) { return field.enemiesInRadius(this, x, y, r, centre); }
  /** @param {number} x @param {number} y @param {number} r @param {boolean} [centre] */
  foesInRadius(x, y, r, centre = false) { return field.foesInRadius(this, x, y, r, centre); }
  /** Centre distance `r` plus the collider radius; a huge enemy by its rectangle (体积-5). @param {number} x @param {number} y @param {number} r */
  foesInColliderRadius(x, y, r) { return field.foesInColliderRadius(this, x, y, r); }
  /** @param {number} r @param {number} c */
  unitAt(r, c) { return field.unitAt(this, r, c); }
  /** @param {number} x @param {number} y @param {number} r @param {number | null} [ownerId] @param {{ includeDevices?: boolean }} [o] */
  alliesInRadius(x, y, r, ownerId = null, o = {}) { return field.alliesInRadius(this, x, y, r, { ownerId, includeDevices: !!o.includeDevices }); }
  /** @param {ShUnit} unit */
  alliesInGrid(unit) { return field.alliesInGrid(this, unit); }
  /** @param {Iterable<number> | null | undefined} keys @param {ShUnit | null} healer @param {boolean} [element] */
  injuredAlliesInKeys(keys, healer, element = false) { return field.injuredAlliesInKeys(this, keys, healer, element); }
  /** @param {number} r @param {number} c */
  isReservedTile(r, c) { return field.isReservedTile(this, r, c); }
  /** In bounds and standable, melee or ranged (INF-0352). Not occupancy. @param {number} r @param {number} c */
  onFieldBoard(r, c) { return field.onFieldBoard(this, r, c); }
  /**
   * Units inside a facing-right offset grid from `unit` (体积-1, 体积-5). `rangeTiles` uses the occupied tile.
   * @param {ShUnit} unit @param {readonly number[][] | null | undefined} grid @param {{ side?: string | null, extend?: number }} [o]
   */
  unitsInGrid(unit, grid, o = {}) { return field.unitsInGrid(this, unit, grid, o); }
  /** @param {ShUnit} e */
  remainingDistance(e) { return field.remainingDistance(this, e); }
  /** @param {ShUnit} u */
  releaseBlocked(u) { field.releaseBlocked(this, u); }
  /**
   * Stronghold's forceAttack: an attack now (攻击-5) on the targets given or those it would take; `noAmmo`: it spends
   * no ammo. Whether it attacked.
   * @param {ShUnit} unit @param {ShUnit[] | null} [targets] @param {{ noAmmo?: boolean }} [o]
   */
  forceAttack(unit, targets = null, o = {}) {
    if (!unit?.u || !unit.alive) return false;
    const given = targets ? targets.map((t) => t?.u).filter((u) => !!u) : null;
    return attackNow(this.w, this.c, unit.u, /** @type {Unit[] | null} */ (given), { noAmmo: !!o.noAmmo });
  }

  /**
   * Stronghold's push (位移-2): 力度 `force` on an enemy from `from`'s centre — along `dir` ({x, y}) when given, `fixed`
   * / `fixedAngle` waiving the corrections, `inward` towards `from`, `effect` an effect's push. The tiles it moves the
   * enemy, as Stronghold's push says them — so a kit can tell that a wall stopped it short —: the step a ballistic push takes
   * now and the slide that follows (位移-3) to where it ends, a wall stopping it; 0 when the force does not take hold or
   * moves nothing, a 静态刚体 (位移-5) included (DIF-0050).
   * @param {ShUnit} e @param {number} force @param {{ from?: { x: number, y: number } | null, dir?: { x: number, y: number } | null, fixed?: boolean, fixedAngle?: boolean, inward?: boolean, effect?: boolean }} [o]
   */
  push(e, force, o = {}) {
    const u = e?.u;
    if (!u || !e.alive) return 0;
    const from = o.from ? { x: Number(o.from.x), y: Number(o.from.y) } : { x: e.x, y: e.y }, x0 = u.x, y0 = u.y;
    if (!displacement.push(this.w, this.c, u, Number(force), { from, dir: o.dir ?? null, fixed: !!o.fixed, anyAngle: !!o.fixedAngle, toward: !!o.inward, effect: !!o.effect })) return 0;
    return hypot(u.x - x0, u.y - y0) + displacement.slideTravel(this.c, u);
  }

  /**
   * Stronghold's pull (位移-4): 力度 `force` on an enemy toward the point `to`; `center` is whose centre the enemy stops
   * short of (the puller, default `to`). The engine's pull is its own (位移-4): a second of dragging with a force that falls
   * off, and the stop distance is its own; the `stop` and `keepFacing` options have no counterpart. The distance it
   * returns is how far the enemy has to go — to `to`, or to the stop point before `center` —, 0 when nothing is pulled
   * (an enemy the puller blocks is not, a force the enemy's weight takes away, one that cannot be displaced) (推断 INF-1091).
   * @param {ShUnit} e @param {number} force @param {{ to?: { x: number, y: number } | null, center?: { x: number, y: number, side?: string } | null }} [o]
   */
  pull(e, force, o = {}) {
    const t = e?.u, to = o.to;
    if (!t || !e.alive || !to) return 0;
    if (o.center && o.center.side === 'ally' && e.blockedBy === o.center) return 0;
    const dest = { x: Number(to.x), y: Number(to.y) }, by = o.center ? { x: Number(o.center.x), y: Number(o.center.y) } : dest;
    const goes = Math.min(hypot(t.x - dest.x, t.y - dest.y), hypot(t.x - by.x, t.y - by.y) - displacement.PULL_STOP);
    return displacement.pull(this.w, this.c, t, Number(force), { to: dest, by }) ? Math.max(0, goes) : 0;
  }

  /**
   * A pull to the front of an ally (位移-4): toward the point half a tile ahead of it, stopping short of its centre.
   * @param {ShUnit} e @param {ShUnit} unit @param {number} force
   */
  pullToFront(e, unit, force) {
    if (!unit) return 0;
    const f = unit.fwd;
    return this.pull(e, force, { to: { x: unit.x + f[1] * displacement.PULL_POINT, y: unit.y + f[0] * displacement.PULL_POINT }, center: unit });
  }

  /**
   * How far a push of 力度 `force` would take an enemy on open ground (位移-2, 位移-3), in tiles: its speed by the 受力等级
   * and the slide's friction, frame by frame as the engine runs it — a ballistic push moves at once, an `effect` one from
   * the next frame —; 0 for an enemy that cannot be displaced or a force the weight takes away.
   * @param {ShUnit} e @param {number} force @param {{ effect?: boolean }} [o]
   */
  pushDistance(e, force, o = {}) {
    const t = e?.u;
    if (!t || !e.alive || !displacement.displaceable(t)) return 0;
    const level = displacement.forceLevel(t, Number(force));
    if (level <= -3) return 0;
    /** @type {number} */
    let v = displacement.PUSH_SPEED[/** @type {keyof typeof displacement.PUSH_SPEED} */ (String(Math.min(3, level)))], hard = displacement.HARD_FRAMES, d = o.effect ? 0 : v / FPS;
    do {
      v = Math.max(0, v - displacement.FRICTION / FPS);
      d += v / FPS;
      hard = Math.max(0, hard - 1);
    } while (v > displacement.STOP_SPEED || hard > 0);
    return d;
  }

  /**
   * Whether a tile is on a player's own board: where the player may deploy (INF-0352). The levels' boards are the player's
   * whole field, so this is `onFieldBoard` for a player that is there.
   * @param {unknown} player @param {number} r @param {number} c
   */
  onOwnBoard(player, r, c) { return !!player && field.onFieldBoard(this, r, c); }

  /** An enemy spawned by a kit: a gap (兼容-4). Its enemies are the content's; a kit's own enemy record has no place in it. */
  spawnEnemy() { throw new CompatGap('battle.spawnEnemy'); }

  /** A kit's shot (projectiles.js). @param {Record<string, any>} p */
  addProjectile(p) { return this.projectiles.add(p); }

  /** Stronghold's _unblock: one enemy no longer blocked (阻挡-3). @param {ShUnit} e */
  _unblock(e) { if (e?.u) blocking.release(e.u); }
  /** A knocked-out operator lying on a tile (`(r, c, except)`): none in these modes — the fallen leave the field. */
  downOn() { return null; }
  /** Allies the enemies' side may select, on tiles (`(keys, attacker)`): none in these modes. @returns {ShUnit[]} */
  allyTargetsInKeys() { return []; }
  /** … within a radius (`(x, y, r, attacker)`): none in these modes. @returns {ShUnit[]} */
  allyTargetsInRadius() { return []; }
  /** @param {ShUnit} u @param {Record<string, any>} [profile] */
  blockedTargets(u, profile) { return field.blockedTargets(u, profile); }
  /**
   * Damage (field.js): `(source, target, dmg, opts?)`, or v0.3.2's request `({ source, credit, target, amount, type, … })`.
   * @param {...any} args
   */
  dealDamage(...args) { return field.damageCall(this, args); }
  /**
   * A heal (field.js): `(source, target, amount, opts?)`, or v0.3.2's request `({ source, target, amount, mode, … })`.
   * @param {...any} args
   */
  heal(...args) {
    if (args.length !== 1) return field.heal(this, args[0], args[1], args[2], args[3]);
    const { source = null, target, amount, ...opts } = args[0] ?? {};
    return field.heal(this, source, target, amount, opts);
  }
  /**
   * 生命流失 (field.js): `(target, amount, opts?)`, or v0.3.2's request `({ source, credit, target, amount, type, … })`.
   * @param {...any} args
   */
  dealHPLose(...args) { return field.hpLossCall(this, args); }
  /** The name before v0.3.2. @param {ShUnit} target @param {number} amount @param {Record<string, any>} [o] */
  loseHp(target, amount, o) { return field.loseHp(this, target, amount, o ?? {}); }
  /** 元素损伤 (v0.3.2's request, field.js). @param {Record<string, any>} req */
  dealElementDamage(req) { return field.elementDamage(this, req); }
  /**
   * Element recovery (field.js): `(target, amount, element?)`, or v0.3.2's request `({ target, amount, element })`.
   * @param {...any} args
   */
  healElement(...args) {
    const r = args.length === 1 ? args[0] ?? {} : { target: args[0], amount: args[1], element: args[2] ?? null };
    return field.healElement(r.target, r.amount, r.element ?? null);
  }
  /** The name before v0.3.2. @param {ShUnit} target @param {number} amount @param {string | null} [element] */
  reduceElement(target, amount, element = null) { return field.healElement(target, amount, element); }
  /**
   * A retreat (撤退-1). 突袭's (`reason` 'raid'), which Stronghold follows at once with a redeployment on another tile that
   * keeps the SP, is a gap: the unit stays (兼容-7).
   * @param {ShUnit} unit @param {{ reason?: string }} [o]
   */
  retreat(unit, o = {}) {
    if (o?.reason === 'raid') throw new CompatGap('battle.retreat.raid');
    field.retreat(this, unit);
  }
  /** @param {ShUnit} unit @param {number} r @param {number} c @param {{ clearSp?: boolean }} [o] */
  moveRedeploy(unit, r, c, o) { return field.moveRedeploy(this, unit, r, c, o); }

  // ---- summons (summons.js) ----------------------------------------------------------------------------------------

  /** The def of a summon as an operator's loadout makes it (兼容-3), or null. @param {string} tokenId @param {ShUnit | null} [owner] */
  tokenDef(tokenId, owner = null) { return owner?.tokenDefs[tokenId] ?? null; }
  /** Whether an operator's loadout makes a summon: the engine's records hold the loadout's summons. */
  producesToken() { return true; }
  /**
   * @param {ShUnit | number | null} owner @param {string} tokenId @param {number} row @param {number} col @param {Record<string, any>} [opts]
   */
  spawnToken(owner, tokenId, row, col, opts) { return summoning.spawnToken(this, owner, tokenId, { row, col }, opts); }

  /** A unit's attack profile now, with its running skill's overrides (sh/ai.js). @param {ShUnit} unit */
  effectiveProfile(unit) { return effectiveProfile(unit); }

  /** Extra tiles an ally's attack reaches (攻击-1), absolute keys; none clears them. @param {ShUnit} unit @param {number[] | null} keys */
  setExtraRange(unit, keys) {
    if (!unit?.u || unit.side !== 'ally') return false;
    setExtraRange(this.c, unit.u, keys);
    return true;
  }

  /** The ground tiles the field's enemies walk on (field.js). */
  groundPathTiles() { return field.groundPathTiles(this); }

  /** Stronghold's tactical point for a unit's reinforcements (field.js). @param {ShUnit} unit */
  findTacticalPoint(unit) { return field.findTacticalPoint(this, unit); }

  /** Stronghold's range cache (`(unit)`): the engine's range is computed when read. */
  refreshRange() {}

  /** Presentation effects (`(kind, params)`; none drawn yet). */
  fx() {}

  /** Cost for a player (费用-1: up to the level's cap). @param {number} playerId @param {number} n */
  addDp(playerId, n) { traits.gainCost(this.w, this.c, playerId, n); }
  /**
   * A player as Stronghold's kits read it: its cost (`dp`) and its units on the field (the unmirrored side); null for no
   * such seat.
   * @param {number} id
   */
  getPlayer(id) {
    if (this.players[id]) return this.players[id];
    const p = this.w.players[id], b = this;
    return p ? { id, mirror: false, get dp() { return p.cost; }, get units() { return b.allyUnits.filter((u) => u.ownerId === id); } } : null;
  }

  // ---- Stronghold's players (players.js, 兼容-7) -----------------------------------------------------------------

  /**
   * An in-battle layer gain (the `layerGain` event first; at most 999 a bond). The layers added.
   * @param {number} pid @param {string} bondId @param {number} n @param {string} [reason] @param {{ source?: any, tile?: [number, number] }} [o]
   */
  addLayers(pid, bondId, n, reason = '', o = {}) { return players.addLayers(this, pid, bondId, n, { ...o, reason }); }
  /** 规程's temporary layers. @param {number} pid @param {string} bondId @param {number} n */
  addTempLayers(pid, bondId, n) { return players.addTempLayers(this, pid, bondId, n); }
  /** 「立刻重新部署」: the next deployment without 再部署时间 (and cost, `free`). @param {ShUnit} unit @param {{ free?: boolean, tile?: unknown, keepSp?: boolean }} [o] */
  redeploy(unit, o) { return players.redeploy(this, unit, o); }
  /** A knocked-out operator lying on its tile (`(unit)`): none in these modes — the fallen leave the field. */
  isDown() { return false; }
  /** Where a fallen operator would come back: the tile it left. @param {ShUnit} u @returns {[number, number]} */
  restTile(u) { return [u.tileR, u.tileC]; }
  /** A damage info as Stronghold makes one: physical, no amount, ×1, no tags, then what is given. @param {Record<string, any>} [o] */
  makeDamage(o = {}) { return { type: 'phys', amount: 0, mul: 1, tags: [], ...o }; }

  /**
   * A buff (兼容-4): Stronghold's refresh rule as the engine's (状态-2); seconds as frames; one that `persist`s is given
   * again at every deployment of the unit; on a unit off the field only such a one is kept, for its next deployment. The
   * buff given as the kit sees it (the one in effect, for a buff that took the place of or joined another), or null.
   * @param {ShUnit} unit @param {Record<string, any>} spec @returns {ShBuff | null}
   */
  addBuff(unit, spec) {
    this.noteUnsupported(unit, spec);
    if (spec.persist) unit.persist = [...unit.persist.filter((x) => x.key !== spec.key), spec];
    const given = unit.deployed ? this.giveBuff(unit, spec) : null;
    return given && unit.u ? this.buffOf(unit.u, given) : null;
  }

  /**
   * What a kit's buff spec asks that the engine's buffs do not carry yet (兼容-4): an empty shield that stays
   * (`keepEmptyShield`; the engine drops a buff that is only a used-up shield, 伤害-8). The buff is given without it, and
   * the gap is recorded once for each unit and key, so that a kit whose buff does less than it says shows in the errors.
   * @param {ShUnit} unit @param {Record<string, any>} spec
   */
  noteUnsupported(unit, spec) {
    for (const name of UNSUPPORTED_BUFF) {
      if (spec[name] === undefined || spec[name] === null) continue;
      const mark = `${spec.key}|${name}`;
      if ((unit.gaps ??= new Set()).has(mark)) continue;
      unit.gaps.add(mark);
      this.errors.push({ label: `buff.${name}`, who: unit.defId, message: `compat: buff.${name} is not provided yet (buff ${spec.key})` });
    }
  }

  /** The buff in effect for a spec, or null when none was given. @param {ShUnit} unit @param {Record<string, any>} spec @returns {import('@aue/sim').Buff | null} */
  giveBuff(unit, spec) {
    const u = /** @type {Unit} */ (unit.u), key = buffKeyOf(spec.key), there = u.buffs.find((x) => x.key === key);
    if (there && spec.refresh === 'keep') return there;
    if (there && !RULES[spec.refresh ?? 'replace']) buffs.removeBuff(u, there);
    const h = hooksOf(spec);
    const b = buffs.makeBuff({ key, src: spec.source?.u?.id ?? -1, rule: /** @type {any} */ (RULES[spec.refresh] ?? 'queue'), mods: modsOf(spec.mods),
      flags: flagsOf(spec.flags), stacks: spec.stacks ?? 1, maxStacks: spec.maxStacks ?? 1, left: framesLeft(spec.duration), ...judgedOf(spec),
      ...(h ? { act: KIT_BUFF, every: h.every, fixed: true } : {}) });
    if (spec.data !== undefined) this.buffData.set(b, spec.data);
    if (h) this.buffHooks.set(b, h.hooks);
    buffs.addBuff(u, b);
    return inEffect(u, b);
  }

  /**
   * 效果取最高 (状态-2, the engine's rule `max`): of the buffs of the key the strongest value takes effect, the weaker
   * wait with their own time; each carries its value as its data (`{ value }`, as Stronghold's).
   * @param {ShUnit} target @param {string} key @param {{ duration?: number, value?: number, mods?: (v: number) => Record<string, number>, source?: ShUnit | null }} [o]
   */
  applyStrongest(target, key, o = {}) {
    const v = Number(o.value);
    if (!target?.alive || !(Number(o.duration) > 0) || !Number.isFinite(v) || typeof o.mods !== 'function') return false;
    const b = buffs.makeBuff({ key: buffKeyOf(key), src: o.source?.u?.id ?? -1, rule: 'max', value: v, mods: modsOf(o.mods(v)), left: framesLeft(o.duration) });
    this.buffData.set(b, { value: v });
    buffs.addBuff(/** @type {Unit} */ (target.u), b);
    return true;
  }

  /**
   * A buff off a unit: all of a key's, or the one buff a kit holds (an `addBuff`'s result; `null` and `undefined` remove
   * nothing). A held buff is removed alone, whatever others of its key the unit has.
   * @param {ShUnit} unit @param {string | { key: string, buff?: import('@aue/sim').Buff } | null | undefined} which
   */
  removeBuff(unit, which) {
    if (which === null || which === undefined) return;
    const name = typeof which === 'string' ? which : which.key, key = buffKeyOf(name), u = unit.u, held = typeof which === 'string' ? undefined : which.buff;
    if (!held) unit.persist = unit.persist.filter((x) => x.key !== name);
    if (!u) return;
    for (const b of u.buffs.filter((x) => (held ? x === held : x.key === key))) {
      buffs.removeBuff(u, b);
      runHook(this, u, b, 'onRemove');
    }
  }

  /**
   * A status (状态-5): the engine's catalogue, seconds as frames — or a stand-in for one it has no counterpart for
   * (standins.js); whether it took hold.
   * @param {ShUnit} target @param {string} key @param {{ duration?: number, source?: ShUnit | null, value?: number }} [o]
   */
  applyStatus(target, key, o = {}) {
    if (!target.alive) return false;
    const k = statusKeyOf(key), frames = o.duration === undefined ? undefined : secondsToFrames(Math.max(0, o.duration));
    if (Object.hasOwn(STAND_INS, k)) return giveStandIn(this, target, k, o);
    if (!Object.hasOwn(status.STATUS, k)) throw new CompatGap(`status.${key}`);
    return status.inflict(this.w, /** @type {Unit} */ (target.u), /** @type {any} */ (k), { frames, src: o.source?.u ?? null, value: o.value }) !== null;
  }
}

/** The buff in effect for one just added: itself, or the buff of its key it joined or took the place of. @param {Unit} u @param {import('@aue/sim').Buff} b */
const inEffect = (u, b) => (u.buffs.includes(b) ? b : u.buffs.find((x) => x.key === b.key) ?? null);

/** The parts of a kit's buff spec the engine's buffs do not carry (noteUnsupported). */
const UNSUPPORTED_BUFF = Object.freeze(['keepEmptyShield']);

/**
 * What a kit buff brings to the engine's 伤判 (伤害-8): its 护盾 layers (`shieldHits`), its 屏障 (`shield`) and the types
 * they take (Stronghold's list as the engine's `a+b`; none named, every type); its `injuryPriority` as the event priority.
 * @param {Record<string, any>} spec
 */
function judgedOf(spec) {
  const prio = Number.isFinite(spec.injuryPriority) ? { prio: Number(spec.injuryPriority) } : {};
  const hits = Math.max(0, Math.round(Number(spec.shieldHits) || 0)), amount = Math.max(0, Number(spec.shield) || 0);
  if (!hits && !amount) return prio;
  const t = spec.shieldType, type = Array.isArray(t) ? t.join('+') : typeof t === 'string' ? t : '';
  return { ...prio, shieldHits: hits, shield: amount, shieldType: type };
}

/** A buff's seconds as frames left, −1 for none. @param {number | undefined} seconds */
const framesLeft = (seconds) => (seconds === undefined || seconds === Infinity ? -1 : secondsToFrames(Math.max(0, seconds)));

/**
 * A weighted pick as Stronghold's rng gives it: an item with its weight's share (negative weights as 0), undefined when
 * none weighs.
 * @template T @param {World} w @param {T[]} list @param {(x: T) => number} weightOf @returns {T | undefined}
 */
function weighted(w, list, weightOf) {
  const weights = list.map((x) => Math.max(0, Number(weightOf(x)) || 0));
  return weights.some((x) => x > 0) ? list[weightedPick(w, weights)] : undefined;
}

/**
 * Stronghold's random numbers over the battle's own stream (随机-1), with its methods' signatures: `rng()` in [0, 1),
 * chance(p), pick(list), int(n) in [0, n), range(a, b) in [a, b), shuffle(list) and weighted(list, weightOf).
 * @param {World} w
 */
function makeRng(w) {
  return Object.setPrototypeOf(() => draw(w), {
    /** @param {number} p */ chance: (p) => draw(w) < p,
    /** @template T @param {T[]} list @returns {T | undefined} */ pick: (list) => (list.length ? list[Math.floor(draw(w) * list.length)] : undefined),
    /** @param {number} n */ int: (n) => Math.floor(draw(w) * Math.max(0, n)),
    /** @param {number} a @param {number} b */ range: (a, b) => a + draw(w) * (b - a),
    /** @template T @param {T[]} list */ shuffle: (list) => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(draw(w) * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; },
    /** @template T @param {T[]} list @param {(x: T) => number} weightOf */ weighted: (list, weightOf) => weighted(w, list, weightOf),
  });
}
