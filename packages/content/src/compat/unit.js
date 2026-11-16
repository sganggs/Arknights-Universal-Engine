// Stronghold's units over the engine's (docs/spec/compat.md 兼容-4): a kit sees a unit with Stronghold's fields and
// getters. An operator is its deck piece — one per deck entry for the whole battle, as Stronghold's board pieces: bound
// to the engine's unit while it is deployed, unbound in between — so the hooks its kit installs once see every
// deployment. An enemy is the engine's unit itself. Fields Stronghold's kits keep their own state in (`mem`, `trait`)
// live here, outside the engine's state (ADR 0057).
import { KIND, attrs, body, traits, buffs, status, damage, blocking, dir, elements, routes, reachKeys, setRange, setAtkCd, deck, targeting } from '@aue/sim';
import { ShSkill } from './skill.js';
import { STATUS_NAME, ELEMENT, buffKeyOf, buffNameOf, shFlagsOf } from './mods.js';
import { STAND_INS } from './standins.js';
import { setRespawn } from './players.js';
import { traitOfPiece, funnelNext } from './traitview.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').Buff} Buff @typedef {import('./battle.js').ShBattle} ShBattle */

/** Frames a second (时间-1). */
const FPS = 30;

/** When each engine unit last lost HP, in battle seconds (kits.js keeps it from the engine's `damaged`): a deployment's unit is its own. @type {WeakMap<object, number>} */
export const hurtAt = new WeakMap();

/** Whether a unit is 寒冷 (状态-5: its cold status in effect), which Stronghold keeps as the flag `cold`. @param {Unit} u */
const chilled = (u) => attrs.activeBuffs(u.buffs).some((x) => x.key === 'cold' || x.key === 'enemyCold');


/**
 * A buff as a kit sees it: its key, the status it is (Stronghold's name), who gave it, its data, the seconds left, its
 * modifiers (which a kit may replace: the holder's HP keeps its ratio, 属性-4), flags and shield.
 */
export class ShBuff {
  /** @param {ShBattle} b @param {Unit} holder @param {Buff} buff */
  constructor(b, holder, buff) {
    this.b = b;
    /** @type {Unit} */
    this.holder = holder;
    /** @type {Buff} */
    this.buff = buff;
    /** when the kit first saw it: buffs it sees are ordered by it, as Stronghold's acquisition sequence (兼容-4) */
    this.seq = ++b.buffSeq;
  }
  /** Its key as Stronghold names it (a burst's is `<element>Burst`). */
  get key() { return buffNameOf(this.buff.key); }
  /** The status it is, or null. @returns {string | null} */
  get status() { const k = this.buff.key; return Object.hasOwn(status.STATUS, k) ? STATUS_NAME[k] ?? k : Object.hasOwn(STAND_INS, k) ? k : null; }
  get flags() { return this.buff.flags; }
  get shield() { return this.buff.shield; }
  set shield(v) { damage.setShield(this.holder, this.buff, v); }
  /** Its 护盾 layers (伤害-8); a kit may set them (whole layers, a buff that is only used-up layers goes). */
  get shieldHits() { return this.buff.shieldHits; }
  set shieldHits(n) { damage.setShieldHits(this.holder, this.buff, n); }
  get value() { return this.buff.value; }
  /** The unit that gave it, or null. */
  get source() { return this.b.unitById(this.buff.src); }
  /** The data its giver stored with it. */
  get data() { return this.b.buffData.get(this.buff) ?? null; }
  set data(v) { this.b.buffData.set(this.buff, v); }
  /** Seconds left, Infinity for none; a kit may set them (whole frames). */
  get timeLeft() { return this.buff.left < 0 ? Infinity : this.buff.left / FPS; }
  set timeLeft(s) { buffs.setLeft(this.buff, s === Infinity ? -1 : Number(s) * FPS); }
  get stacks() { return this.buff.stacks; }
  set stacks(n) { buffs.setStacks(this.holder, this.buff, Number(n)); }
  get mods() { return this.buff.mods; }
  set mods(m) { buffs.retune(this.holder, this.buff, this.buff.value, m ?? {}); }
}

/**
 * The fields of a unit's attack profile that something in the layer reads when a kit writes them: the selection of targets
 * and of what may be selected (`maxTargets`, `priority`, `allInRange`, `hitAllBlocked`, `canHitFly`, `groundOnly`, `hitSleep`,
 * `skipEnemy`, `rangeTiles`, `attackRangeRadius`; 索敌-2), which the layer's target helpers take from the profile a kit passes
 * them. The engine's own attack reads no other field of the unit's profile, but for a unit that has a funnel (职业-12) its `funnel`
 * and `funnelMul` (off when it is null), through the trait behaviour (ShUnit.funnelOverride): a write to any other is kept and
 * has no effect, and is recorded as a gap (ShUnit.noteGap).
 */
const PROFILE_READ = Object.freeze(new Set(['maxTargets', 'priority', 'allInRange', 'hitAllBlocked', 'canHitFly', 'groundOnly', 'hitSleep', 'skipEnemy', 'rangeTiles', 'attackRangeRadius']));
/** The profile fields the engine reads of a unit with a funnel. */
const FUNNEL_FIELDS = Object.freeze(new Set(['funnel', 'funnelMul']));

/**
 * The fields of a kit's own `trait` the layer honours (兼容-5): the callbacks it runs (specs.js KIT_TRAIT_BEHAVIOR, onAttackHit,
 * onSpecHit, onBoomerangHit), its own `install`, and the fields that reach the engine's trait data (kits.js attackFrom, modeFrom;
 * `rampInit`: the engine's charge takes a 解放者's starting bonus from the module's blackboard, 职业-12). Any other field has no
 * effect and is recorded as a gap (ShUnit.noteTraitGaps).
 */
const TRAIT_USED = Object.freeze(new Set(['canAttack', 'skipEnemy', 'storeEnergy', 'healThrough', 'dmgMul', 'hitsFn', 'afterHit', 'afterAttack', 'onEachHit', 'boomerangOnward', 'install',
  'splashRadius', 'onHitStatus', 'hits', 'hitDmgMul', 'noAttackUnlessSkill', 'hitSleep', 'rangeTiles', 'maxTargets', 'blockFly', 'dollNoAttack', 'rampInit']));

/** Whether a kit's write changes a profile field: the same value (also a copy of an object) is not a change. @param {unknown} a @param {unknown} b */
function sameField(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/** The base attributes a piece's content record keeps under other names than the engine's unit does. @type {Readonly<Record<string, string>>} */
const RECORD_NAME = Object.freeze({ bat: 'baseAttackTime' });

/**
 * A piece's `base` (see ShUnit.base): a record that reads what a kit set, else the deploy cost and 再部署时间 of the
 * operator's content record, else the engine's unit while it is deployed, else its content record; writes are kept with
 * the piece (`baseSet`) and, but for the cost and the 再部署时间, put on the engine's unit while deployed.
 * @param {ShUnit} p @returns {Record<string, any>}
 */
function pieceBase(p) {
  const record = () => /** @type {Record<string, any>} */ (p.b.c.operators[p.defId] ?? {});
  const known = (/** @type {string | symbol} */ k) => typeof k === 'string';
  return new Proxy({}, {
    get: (_t, k) => {
      if (!known(k)) return undefined;
      const key = /** @type {string} */ (k);
      if (Object.hasOwn(p.baseSet, key)) return p.baseSet[key];
      if (key === 'cost') return record().cost ?? 0;
      if (key === 'respawnTime') return record().respawnTime ?? deck.DEFAULT_RESPAWN;
      if (p.u && Object.hasOwn(p.u.base, key)) return /** @type {Record<string, any>} */ (p.u.base)[key];
      return record()[RECORD_NAME[key] ?? key];
    },
    set: (_t, k, v) => {
      if (!known(k)) return true;
      const key = /** @type {string} */ (k);
      p.baseSet[key] = v;
      // the deck's rules stay the engine's (兼容-4): the cost and the 再部署时间 a kit writes are kept and not used
      if (key === 'cost' || key === 'respawnTime') p.noteGap(`base.${key}`);
      else if (p.u) /** @type {Record<string, any>} */ (p.u.base)[key] = v;
      return true;
    },
    has: (_t, k) => known(k) && (Object.hasOwn(p.baseSet, /** @type {string} */ (k)) || k === 'cost' || k === 'respawnTime' || !!(p.u && Object.hasOwn(p.u.base, /** @type {string} */ (k))) || Object.hasOwn(record(), /** @type {string} */ (RECORD_NAME[/** @type {string} */ (k)] ?? k))),
  });
}

export class ShUnit {
  /** @type {'op' | 'enemy' | 'token' | 'device'} */
  #kind;
  /** @type {ShSkill | null} */
  #skill;

  /**
   * @param {ShBattle} b
   * @param {{ kind: 'op' | 'enemy' | 'token' | 'device', key: string, ownerId: number, def: Record<string, any> | null, unit?: Unit, ownerUnit?: ShUnit | null, pieceId?: number }} o
   */
  constructor(b, o) {
    this.b = b; this.#kind = o.kind; this.defId = o.key; this.def = o.def; this.ownerId = o.ownerId;
    /** @type {ShUnit | null} a token's owner (召唤-6) */
    this.ownerUnit = o.ownerUnit ?? null;
    /** @type {Record<string, any>} an operator's summons' defs, by summon id (兼容-3) */
    this.tokenDefs = {};
    /** @type {Unit | null} the engine's unit while deployed */
    this.u = o.unit ?? null;
    /** a piece's own id for the whole battle, reserved from the engine's (钩子-4); −1 for any other unit */
    this.pieceId = o.pieceId ?? -1;
    this.side = o.kind === 'enemy' ? 'enemy' : 'ally';
    /** @type {Record<string, any>} */ this.mem = {};
    /** @type {Record<string, any>} what a profession keeps of a unit: a plain object, but for the fields the engine keeps too (traitview.js) */
    this.trait = traitOfPiece(this);
    /** @type {Record<string, any>[]} buffs that outlive a deployment (`persist`), given again at each */
    this.persist = [];
    this.deploySeq = 0;
    this.#skill = o.kind === 'op' || o.kind === 'token' ? new ShSkill(this, null) : null;
    /** @type {any} the kit installed for it */
    this.kit = null;
    this.stats = { dmg: 0, kills: 0, heal: 0, taken: 0, attacks: 0 };
    /** @type {Map<number, { afterHit: Function }>} what a kit gave single attacks of it, by the attack's mark (兼容-4) */
    this.attackOverrides = new Map();
    this.attackMarks = 0;
    // What Stronghold's battle content beyond the kits reads of a unit (兼容-7):
    /** @type {string[]} the equipment a piece carries (its seat's facts) */
    this.items = [];
    /** @type {string | null} why a piece last left the field (the engine's `death` reason) */
    this.removeReason = null;
    /** when a piece last left the field, in battle seconds */
    this.deathAt = -Infinity;
    /** when it last attacked in this deployment, in battle seconds */
    this.lastAttackAt = -Infinity;
    /** @type {Record<string, any> | null} what a 联防 field carried in: none in these modes */
    this.carry = null;
    /** a free redeployment was given for its next deployment, and without cost (players.js redeploy) */
    this.freeNext = false;
    this.freeCost = false;
    /** when a piece that left may come back, in battle seconds (Stronghold's respawnAt): set at each exit, kept after */
    this.backAt = Infinity;
    /** in its exit's own `death` event before the engine set its card, and what content set for it then (players.js) */
    this.leaving = false;
    /** @type {number | null} */
    this.backWanted = null;
  }

  /** Its player as Stronghold's battle content reads it (兼容-7), or null. */
  get player() { return this.b.getPlayer(this.ownerId); }
  /**
   * When a piece that left the field may be deployed again, in battle seconds, as Stronghold keeps it: set as it leaves
   * (Infinity in a knock-out's own `death` event, before the engine sets it), kept until it leaves again; content may
   * set it (players.js setRespawn).
   */
  get respawnAt() { return this.backAt; }
  set respawnAt(t) { setRespawn(this.b, this, Number(t)); }

  /**
   * Keeps what a kit gave one attack of it under the attack's mark — the mark given, or a new one — and returns the mark.
   * @param {{ afterHit: Function }} over @param {number} [mark]
   */
  markAttack(over, mark = 0) {
    const t = mark > 0 ? mark : ++this.attackMarks;
    this.attackOverrides.set(t, over);
    return t;
  }

  get kind() { return this.#kind; }
  /** An operator's skill runtime (skill.js); null for an enemy. */
  get skill() { return this.#skill; }
  /** On the field (its engine unit is). */
  get deployed() { return !!this.u && this.b.w.units.includes(this.u); }
  /** On the field with HP left. */
  get alive() { return this.deployed && /** @type {Unit} */ (this.u).hp > 0; }
  /** Gone for good, as Stronghold's: an operator's piece never is (it may be deployed again); another unit off the field is. */
  get removed() { return this.pieceId < 0 && !this.deployed; }
  /** A kit writes `removed = false` to leave a piece where it is; a piece is never removed (see the getter), so a write has nothing to do. @param {boolean} _v */
  set removed(_v) {}
  /** A piece's id for the whole battle (as Stronghold's board pieces); another unit's engine id, −1 off the field. */
  get id() { return this.pieceId >= 0 ? this.pieceId : this.u ? this.u.id : -1; }
  get name() { return this.def?.name ?? this.defId; }
  get x() { return this.u ? this.u.x : NaN; }
  /** A kit may move the unit (路线-5). */
  set x(v) { if (this.u) routes.displace(this.u, Number(v), this.u.y); }
  get y() { return this.u ? this.u.y : NaN; }
  set y(v) { if (this.u) routes.displace(this.u, this.u.x, Number(v)); }
  get tileR() { return this.u ? body.tileOf(this.u)[0] : -1; }
  get tileC() { return this.u ? body.tileOf(this.u)[1] : -1; }
  /** @returns {import('@aue/sim').Dir} */
  get dir() { return this.u ? this.u.dir : 'RIGHT'; }
  get hp() { return this.u ? this.u.hp : 0; }
  /** A kit may set it outright (伤害-9). */
  set hp(v) { if (this.u) damage.setHp(this.u, Number(v)); }
  get hitArea() { return /** @type {any} */ (this.u?.base)?.hitArea ?? null; }
  get hidden() { return !!this.u?.hidden; }
  /** The extra tiles content gave its attack (攻击-1), or null. */
  get extraRangeKeys() { return this.u?.reachExtra ? [...this.u.reachExtra] : null; }
  /** Its facing as a [row, col] step (方向-1: UP is row + 1). */
  get fwd() { return dir.dirVec(this.dir); }
  /** When it was deployed, in battle seconds (−Infinity before). */
  get deployedAt() { return this.u ? this.u.born / FPS : -Infinity; }
  /** On the ground: an ally on a ground tile, an enemy not in the air. */
  get ground() { return !!this.u && (this.u.kind === KIND.OPERATOR ? this.u.z === 0 : !attrs.statsOf(this.u).flying); }
  /** A leader (levelType BOSS). */
  get isBoss() { return this.u?.base.levelType === 'BOSS'; }
  /** Seconds until its next attack may start; a kit may set them (whole frames). */
  get atkCd() { return this.u ? this.u.atkCd / FPS : 0; }
  set atkCd(s) { if (this.u) setAtkCd(this.u, Number(s) * FPS); }
  /** When it last lost HP, in battle seconds: −Infinity until it does, for each deployment (Stronghold's `lastHitAt`). */
  get lastHitAt() { return (this.u ? hurtAt.get(this.u) : undefined) ?? -Infinity; }
  set lastHitAt(t) { if (this.u) hurtAt.set(this.u, Number(t)); }
  /** The unit's attributes now (属性-1…属性-3). */
  /** Its attributes now, its flags as a kit reads them (兼容-4). */
  get s() {
    const u = this.u;
    if (!u) return null;
    const s = attrs.statsOf(u);
    return { ...s, flags: shFlagsOf(s.flags, elements.bursting(u), chilled(u)) };
  }
  get maxHp() { return this.u ? attrs.statsOf(this.u).maxHp ?? 0 : 0; }
  /** The most 元素损伤 it can take before a burst (元素-2: its element value's maximum). */
  get gaugeMax() { return this.u ? attrs.statsOf(this.u).maxEp ?? 0 : 0; }
  get atk() { return this.u ? attrs.statsOf(this.u).atk ?? 0 : 0; }
  get hpRatio() { const m = this.maxHp; return m > 0 ? this.hp / m : 0; }
  /** The enemies it blocks. */
  get blocking() {
    const id = this.u?.id ?? -1;
    return id < 0 ? [] : this.b.w.units.filter((e) => e.kind === KIND.ENEMY && e.blockedBy === id).map((e) => this.b.unitOf(e));
  }
  /** Its attribute flags now (stun, sleep, …). */
  get flags() { return this.u ? shFlagsOf(attrs.statsOf(this.u).flags, elements.bursting(this.u), chilled(this.u)) : {}; }
  /** @param {string} k */
  hasFlag(k) { return !!this.flags[k]; }
  /** An air unit (飞行, 浮空…, 属性-2). */
  get isFlying() { return !!this.u && attrs.statsOf(this.u).flying; }
  /** On the field and not stunned, frozen, asleep or otherwise kept from acting. */
  get canAct() { return this.alive && !this.hidden && !attrs.statsOf(/** @type {Unit} */ (this.u)).disabled; }
  /** Its 重量等级. */
  get weight() { return this.u ? attrs.statsOf(this.u).massLevel ?? 0 : 0; }
  /**
   * Its base attributes (属性-1), as Stronghold's unit record holds them: for an operator's piece always a record, also
   * between deployments — its attributes from the engine's unit while deployed, from its content record before —, with its
   * deploy `cost` and `respawnTime` too (兼容-4). What a kit writes stays with the piece: attributes are put on each
   * deployment's unit; the cost and the 再部署时间 are kept only (the deck's rules stay the engine's, 兼容-4). Another
   * unit's is the engine unit's own, null off the field.
   * @returns {Record<string, any> | null}
   */
  get base() {
    if (this.pieceId < 0) return this.u?.base ?? null;
    return this.#baseView ??= pieceBase(this);
  }
  /** @type {Set<string> | null} the unsupported parts of buff specs and the written fields that do nothing, already recorded (battle.js noteUnsupported, noteGap) */
  gaps = null;
  /**
   * Records that a kit wrote something the engine does not use (`profile.<field>`, `base.cost`): `compat: <name> is not
   * provided yet`, once for each unit and name, so that a kit whose write does nothing shows in the errors.
   * @param {string} name
   */
  noteGap(name) {
    const mark = `gap|${name}`;
    if ((this.gaps ??= new Set()).has(mark)) return;
    this.gaps.add(mark);
    this.b.errors.push({ label: name, who: this.defId, message: `compat: ${name} is not provided yet` });
  }
  /**
   * Records each field of a kit's own `trait` that the layer does not honour (TRAIT_USED), once for the unit and name:
   * `compat: trait.<name> is not provided yet`.
   * @param {unknown} trait
   */
  noteTraitGaps(trait) {
    if (trait && typeof trait === 'object') for (const name of Object.keys(trait)) if (!TRAIT_USED.has(name)) this.noteGap(`trait.${name}`);
  }
  /** What a kit set in the piece's `base`, by name (a piece's; see base). @type {Record<string, any>} */
  baseSet = {};
  /** @type {Record<string, any> | null} */
  #baseView = null;
  /** The profile a kit set (see profile): null until it sets one or writes a field. @type {Record<string, any> | null} */
  #profileSet = null;
  /**
   * Its element gauges as Stronghold keeps them (元素-1…元素-3): how much of each gauge is filled — the maximum less the
   * engine's value of the element —, by Stronghold's name; `necrosis` has no element of the engine's: always 0.
   */
  get elem() {
    const u = this.u, out = { burn: 0, neural: 0, necrosis: 0, apoptosis: 0, erosion: 0 };
    if (!u) return out;
    const max = attrs.statsOf(u).maxEp ?? 0;
    for (const [name, el] of Object.entries(ELEMENT)) out[/** @type {keyof typeof out} */ (name)] = Math.max(0, max - elements.epOf(u, el));
    return out;
  }
  /** When it came on the field, as an order (a later one is larger): the order enemies pick their targets by (兼容-5 aggroCmp). */
  get aggroSeq() { return this.u ? this.u.born * 1000 + this.u.bornN : 0; }
  /** The unit that blocks it, or null. @returns {ShUnit | null} */
  get blockedBy() {
    const id = this.u?.blockedBy ?? -1;
    return id >= 0 ? this.b.unitById(id) : null;
  }
  /** A kit may have a unit block it at once (阻挡-1), or release it with none (阻挡-3). @param {ShUnit | null} v */
  set blockedBy(v) {
    const u = this.u;
    if (u && v?.u) blocking.blockBy(this.b.w, u, v.u);
    else if (u) blocking.release(u);
  }
  /** An operator's attack range now (索敌-1, 技能-8): its tile keys. */
  get rangeKeySet() { return this.u && this.u.kind === KIND.OPERATOR ? new Set(reachKeys(this.b.c, this.u)) : new Set(); }
  get rangeKeys() { return [...this.rangeKeySet]; }
  /**
   * The tiles of its own range where it stands, as it faces, without a skill's range, extra tiles or any extension — the
   * range of its default trigger (Stronghold's `baseRangeKeys`, in the order of its grid); none off the field and for a
   * unit that is not an operator or summon (INF-1100).
   * @returns {number[] | undefined}
   */
  get baseRangeKeys() {
    const u = this.u, grid = this.rangeGrid;
    if (!u || u.kind !== KIND.OPERATOR || !this.deployed) return undefined;
    const cells = (grid ?? [[0, 0]]).map((/** @type {number[]} */ [row, col]) => ({ row, col }));
    return [...targeting.rangeKeys({ rows: this.b.c.level.height, cols: this.b.c.level.width }, u, cells, 0)];
  }
  /** Its own range grid: the one a kit gave it on the field, else its record's. A kit may set it (攻击-1); null takes it back. */
  get rangeGrid() { return this.u?.range ? this.u.range.map((x) => [x.row, x.col]) : this.def?.raw?.rangeGrid ?? this.def?.rangeGrid ?? null; }
  set rangeGrid(g) { if (this.u) setRange(this.u, Array.isArray(g) ? g.map(([row, col]) => ({ row, col })) : null); }
  /** Stronghold's stat cache: the engine's are computed when read. */
  markDirty() {}
  /** The trait data its profile is made of: its engine unit's while deployed, else its content record's (a piece's); null for another unit. @returns {import('@aue/sim').TraitDef | null} */
  #traitData() {
    if (this.u?.kind === KIND.OPERATOR && this.deployed) return traits.traitOf(this.b.c, this.u);
    const d = this.pieceId >= 0 ? this.b.c.operators[this.defId] : undefined;
    return d ? traits.traitOfDef(d) : null;
  }
  /**
   * What its attacks may select, as Stronghold's profile names it: an operator's trait (职业-1) — flying units when it can
   * hit them, its hits, the status each gives, its funnel (职业-12), as a piece has them before it is deployed too —, its kit's
   * own trait (Stronghold lays it over the profession's), then what a kit wrote; another unit's has only what a kit wrote.
   * @returns {Record<string, any>}
   */
  get profile() {
    const t = this.#traitData();
    /** @type {Record<string, any>} */
    const own = { ...(t ? this.#traitProfile(t) : {}), ...(t && this.kit?.trait && typeof this.kit.trait === 'object' ? this.kit.trait : {}), ...this.#profileSet };
    // a kit that writes a field of it (`unit.profile.funnel = …`) keeps it
    return new Proxy(own, { set: (target, k, v) => {
      const key = /** @type {string} */ (k);
      if (typeof k === 'string' && this.#unread(k) && !sameField(target[key], v)) this.noteGap(`profile.${k}`);
      target[key] = v;
      (this.#profileSet ??= {})[key] = v;
      return true;
    } });
  }
  /** Whether a write to a profile field has no effect: nothing reads it (PROFILE_READ), the funnel's fields of a unit without a funnel. @param {string} k */
  #unread(k) { return !PROFILE_READ.has(k) && !(FUNNEL_FIELDS.has(k) && !!this.#traitData()?.funnel); }
  /** The part of its profile the trait data gives (profile). @param {import('@aue/sim').TraitDef} t @returns {Record<string, any>} */
  #traitProfile(t) {
    const st = t.hitStatus, d = this.b.c.operators[this.defId];
    return { canHitFly: t.antiAir, heal: t.heal, dmgType: this.u?.base.dmgType ?? d?.dmgType, hits: t.hits, ...(t.rangeTiles ? { rangeTiles: true } : {}),
      ...(t.funnel ? { funnel: { ...t.funnel }, funnelMul: this.#funnelMul } : {}),
      ...(st ? { onHitStatus: { key: STATUS_NAME[st.key] ?? st.key, duration: st.seconds, ...(st.value !== undefined ? { value: st.value } : {}) } } : {}) };
  }
  /**
   * The funnel the profile gives the engine's attack (职业-6, 职业-12): none when a kit wrote `funnelMul` as null or false (a
   * drone it has taken over); the `funnel` a kit wrote — its numbers — over the trait's; undefined: the trait's.
   * @returns {{ init: number, delta: number, max: number } | null | undefined}
   */
  get funnelOverride() {
    const set = this.#profileSet, f = set?.funnel;
    if (!set) return undefined;
    if (Object.hasOwn(set, 'funnelMul') && !set.funnelMul) return null;
    const ok = f && typeof f === 'object' && [f.init, f.delta, f.max].every((x) => typeof x === 'number' && Number.isFinite(x));
    return ok ? { init: f.init, delta: f.delta, max: f.max } : undefined;
  }
  /** The `funnelMul` of its profile (PROFILE_READ): a function, as Stronghold's, that gives the 倍率 the engine's funnel would take for the next attack on a target. @type {(b: unknown, u: unknown, target: { u?: Unit | null }) => number} */
  #funnelMul = (_b, _u, target) => funnelNext(this, target?.u ?? null);
  /**
   * A kit may give the unit another profile (`unit.profile = { ...unit.profile, … }`); it stands for every deployment, null
   * takes it back. What the layer reads of it is the selection of targets (PROFILE_READ). The engine's own attack reads no
   * other field of it, so a field that is changed and not read — `hits`, `splashRadius`, `atkScale` — is kept,
   * has no effect and is recorded once for the unit and field (noteGap).
   * @param {Record<string, any> | null} v
   */
  set profile(v) {
    if (v && typeof v === 'object') {
      const now = this.profile;
      for (const k of Object.keys(v)) if (this.#unread(k) && !sameField(now[k], v[k])) this.noteGap(`profile.${k}`);
    }
    this.#profileSet = v && typeof v === 'object' ? { ...v } : null;
  }
  get sp() { return this.skill?.sp ?? 0; }
  get spMax() { return this.skill?.spCost ?? 0; }
  isOp() { return this.kind === 'op'; }
  isEnemy() { return this.side === 'enemy'; }
  isAlly() { return this.side === 'ally'; }
  /** The buff of a key it has — the one in effect (状态-2) —, or null; Stronghold's burst names find the engine's bursts. @param {string} key */
  findBuff(key) {
    const k = buffKeyOf(key), u = this.u, buff = u ? attrs.activeBuffs(u.buffs).find((x) => x.key === k) ?? u.buffs.find((x) => x.key === k) : undefined;
    return buff && u ? this.b.buffOf(u, buff) : null;
  }
  /** @param {string} key */
  hasBuff(key) { const k = buffKeyOf(key); return !!this.u?.buffs.some((x) => x.key === k); }
  /** Its buffs, in acquisition order. */
  get buffs() { const u = this.u; return u ? u.buffs.map((x) => this.b.buffOf(u, x)) : []; }
}
