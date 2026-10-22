// Stronghold's battle over the engine's world (docs/spec/compat.md 兼容-4): the object its kits receive — the hook bus
// and timers on the engine's (钩子-1…钩子-3) with contexts in Stronghold's shape, its units (unit.js), random numbers,
// cost, buffs and statuses on the engine's own. Kit code runs with the level's grid size (兼容-1); a kit's handler that
// throws is skipped and recorded (Stronghold isolates content errors the same way). Times are seconds to the kits and
// whole frames to the engine (时间-2).
import { secondsToFrames } from '@aue/math';
import { KIND, bus, buffs, status, traits, blocking, displacement, draw, weightedPick, setExtraRange, attackNow } from '@aue/sim';
import { withGrid } from './grid.js';
import { ShUnit } from './unit.js';
import { STATUS_NAME, ELEMENT_NAME, statusKeyOf, modsOf, flagsOf, buffKeyOf } from './mods.js';
import { KIT_BUFF, hooksOf, runHook } from './buffhooks.js';
import { STAND_INS, giveStandIn } from './standins.js';
import { ShProjectiles } from './projectiles.js';
import * as field from './field.js';
import * as summoning from './summons.js';
import { ShGrid } from './tiles.js';
import { CompatGap } from './sh/gap.js';
import { effectiveProfile } from './sh/ai.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Content} Content @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {(ctx: any, b: ShBattle) => void} Handler */

/** Seconds a frame (时间-1). */
export const TICK = 1 / 30;



/** Stronghold's buff refresh rules → the engine's same-key rules (状态-2). @type {Record<string, string>} */
const RULES = { extend: 'extend', stack: 'stack', independent: 'independent' };

/** A unit as a kit sees it, or null. @param {ShBattle} b @param {Unit | null | undefined} u */
const sh = (b, u) => (u ? b.unitOf(u) : null);

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
  deploy: (b, k) => ({ unit: sh(b, k.unit), initial: k.initial, ...(k.move ? { move: true } : {}) }),
  death: (b, k) => ({ unit: sh(b, k.unit), reason: k.reason, killer: sh(b, k.killer), dying: false }),
  kill: (b, k) => ({ killer: sh(b, k.killer), victim: sh(b, k.victim) }),
  enemySpawn: (b, k) => ({ enemy: sh(b, k.enemy) }),
  tick: (_b, k) => ({ dt: k.frames * TICK }),
  hit: (b, k) => ({ source: sh(b, k.source), target: sh(b, k.target), dmg: k.dmg, credit: sh(b, k.credit) }),
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
 * An engine event's context as Stronghold's (兼容-4); a custom event's as it is.
 * @param {ShBattle} b @param {string} name @param {Record<string, any>} k @returns {Record<string, any>}
 */
const shapeOf = (b, name, k) => (Object.hasOwn(SHAPES, name) ? SHAPES[name](b, k) : k);

export class ShBattle {
  /** @param {World} w @param {Content} c */
  constructor(w, c) {
    /** @type {World} */
    this.w = w;
    /** @type {Content} */
    this.c = c;
    this.dt = TICK; this.started = false;
    /** the level's tiles as Stronghold's grid */
    this.grid = new ShGrid(c.level);
    /** @type {{ label: string, who: string, message: string }[]} handler errors, recorded and skipped */
    this.errors = [];
    /** @type {WeakMap<object, any>} the data a kit stored with a buff */
    this.buffData = new WeakMap();
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
    /** @type {Record<string, any> | null} the options of the kit's heal under way (field.js heal) */
    this.healOpts = null;
    this.rng = makeRng(w);
    /** the kits' own shots (projectiles.js) */
    this.projectiles = new ShProjectiles(this);
    /** Stronghold's data source as kits read it: raw summon records (summons.js rawToken). */
    this.data = Object.freeze({ rawToken: (/** @type {string} */ id) => summoning.rawToken(this, id) });
  }

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
    try {
      return withGrid(this.c.level, fn);
    } catch (e) {
      this.errors.push({ label, who: owner instanceof ShUnit ? owner.defId : '', message: String(e instanceof Error ? e.message : e) });
      return undefined;
    }
  }

  /** @param {string} name @param {Handler} fn @param {{ priority?: number, owner?: unknown, once?: boolean }} [o] */
  on(name, fn, o = {}) {
    return bus.on(this.w, name, (k) => {
      let ctx = this.shapes.get(k);
      if (!ctx) { ctx = shapeOf(this, name, k); this.shapes.set(k, ctx); }
      this.safe(() => fn(ctx, this), `hook:${name}`, o.owner);
      if (ctx.stopPropagation) k.stopPropagation = true;
      if (Object.hasOwn(BACK, name)) BACK[name](ctx, k);
    }, o);
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
    const t = bus.after(this.w, secondsToFrames(Math.max(0, Number(seconds) || 0)), () => this.safe(() => fn(this, t), 'after', o.owner), o);
    return t;
  }

  /** @param {number} seconds @param {(b: ShBattle, s: any) => void} fn @param {{ owner?: unknown, immediate?: boolean }} [o] */
  every(seconds, fn, o = {}) {
    const t = /** @type {any} */ (bus.every(this.w, secondsToFrames(Math.max(TICK, Number(seconds) || TICK)), () => { t.count++; this.safe(() => fn(this, t), 'every', o.owner); }, o));
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
   * / `fixedAngle` waiving the corrections, `inward` towards `from`, `effect` an effect's push. 1 when the force takes
   * hold — a speed, or a 静态刚体 entering 失衡 (位移-5) — else 0 (the slide that follows takes its frames, 位移-3).
   * @param {ShUnit} e @param {number} force @param {{ from?: { x: number, y: number } | null, dir?: { x: number, y: number } | null, fixed?: boolean, fixedAngle?: boolean, inward?: boolean, effect?: boolean }} [o]
   */
  push(e, force, o = {}) {
    if (!e?.u || !e.alive) return 0;
    const from = o.from ? { x: Number(o.from.x), y: Number(o.from.y) } : { x: e.x, y: e.y };
    return displacement.push(this.w, this.c, e.u, Number(force), { from, dir: o.dir ?? null, fixed: !!o.fixed, anyAngle: !!o.fixedAngle, toward: !!o.inward, effect: !!o.effect }) ? 1 : 0;
  }

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
  /** @param {ShUnit | null} source @param {ShUnit} target @param {Record<string, any>} dmg */
  dealDamage(source, target, dmg) { return field.dealDamage(this, source, target, dmg); }
  /** @param {ShUnit | null} source @param {ShUnit} target @param {number} amount @param {Record<string, any>} [opts] */
  heal(source, target, amount, opts) { return field.heal(this, source, target, amount, opts); }
  /** @param {ShUnit} target @param {number} amount @param {{ source?: ShUnit | null, tags?: string[] }} [o] */
  loseHp(target, amount, o) { return field.loseHp(this, target, amount, o); }
  /** @param {ShUnit} unit */
  retreat(unit) { field.retreat(this, unit); }
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
    const p = this.w.players[id], b = this;
    return p ? { id, mirror: false, get dp() { return p.cost; }, get units() { return b.allyUnits.filter((u) => u.ownerId === id); } } : null;
  }

  /**
   * A buff (兼容-4): Stronghold's refresh rule as the engine's (状态-2); seconds as frames; one that `persist`s is given
   * again at every deployment of the unit; on a unit off the field only such a one is kept, for its next deployment.
   * @param {ShUnit} unit @param {Record<string, any>} spec
   */
  addBuff(unit, spec) {
    if (spec.persist) unit.persist = [...unit.persist.filter((x) => x.key !== spec.key), spec];
    if (unit.deployed) this.giveBuff(unit, spec);
  }

  /** @param {ShUnit} unit @param {Record<string, any>} spec */
  giveBuff(unit, spec) {
    const u = /** @type {Unit} */ (unit.u), there = u.buffs.find((x) => x.key === spec.key);
    if (there && spec.refresh === 'keep') return;
    if (there && !RULES[spec.refresh ?? 'replace']) buffs.removeBuff(u, there);
    const h = hooksOf(spec);
    const b = buffs.makeBuff({ key: spec.key, src: spec.source?.u?.id ?? -1, rule: /** @type {any} */ (RULES[spec.refresh] ?? 'queue'), mods: modsOf(spec.mods),
      flags: flagsOf(spec.flags), stacks: spec.stacks ?? 1, maxStacks: spec.maxStacks ?? 1, left: framesLeft(spec.duration),
      ...(h ? { act: KIT_BUFF, every: h.every, fixed: true } : {}) });
    if (spec.data !== undefined) this.buffData.set(b, spec.data);
    if (h) this.buffHooks.set(b, h.hooks);
    buffs.addBuff(u, b);
  }

  /**
   * 效果取最高 (状态-2, the engine's rule `max`): of the buffs of the key the strongest value takes effect, the weaker
   * wait with their own time; each carries its value as its data (`{ value }`, as Stronghold's).
   * @param {ShUnit} target @param {string} key @param {{ duration?: number, value?: number, mods?: (v: number) => Record<string, number>, source?: ShUnit | null }} [o]
   */
  applyStrongest(target, key, o = {}) {
    const v = Number(o.value);
    if (!target?.alive || !(Number(o.duration) > 0) || !Number.isFinite(v) || typeof o.mods !== 'function') return false;
    const b = buffs.makeBuff({ key, src: o.source?.u?.id ?? -1, rule: 'max', value: v, mods: modsOf(o.mods(v)), left: framesLeft(o.duration) });
    this.buffData.set(b, { value: v });
    buffs.addBuff(/** @type {Unit} */ (target.u), b);
    return true;
  }

  /** @param {ShUnit} unit @param {string | { key: string }} which */
  removeBuff(unit, which) {
    const name = typeof which === 'string' ? which : which.key, key = buffKeyOf(name), u = unit.u;
    unit.persist = unit.persist.filter((x) => x.key !== name);
    if (!u) return;
    for (const b of u.buffs.filter((x) => x.key === key)) {
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
