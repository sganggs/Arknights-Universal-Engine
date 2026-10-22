// Stronghold's units over the engine's (docs/spec/compat.md 兼容-4): a kit sees a unit with Stronghold's fields and
// getters. An operator is its deck piece — one per deck entry for the whole battle, as Stronghold's board pieces: bound
// to the engine's unit while it is deployed, unbound in between — so the hooks its kit installs once see every
// deployment. An enemy is the engine's unit itself. Fields Stronghold's kits keep their own state in (`mem`, `trait`)
// live here, outside the engine's state (ADR 0057).
import { KIND, attrs, body, traits, buffs, status, damage, blocking, dir, elements, routes, reachKeys, setRange, setAtkCd } from '@aue/sim';
import { ShSkill } from './skill.js';
import { STATUS_NAME, buffKeyOf, buffNameOf, shFlagsOf } from './mods.js';
import { STAND_INS } from './standins.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').Buff} Buff @typedef {import('./battle.js').ShBattle} ShBattle */

/** Frames a second (时间-1). */
const FPS = 30;


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
  }
  /** Its key as Stronghold names it (a burst's is `<element>Burst`). */
  get key() { return buffNameOf(this.buff.key); }
  /** The status it is, or null. @returns {string | null} */
  get status() { const k = this.buff.key; return Object.hasOwn(status.STATUS, k) ? STATUS_NAME[k] ?? k : Object.hasOwn(STAND_INS, k) ? k : null; }
  get flags() { return this.buff.flags; }
  get shield() { return this.buff.shield; }
  set shield(v) { damage.setShield(this.holder, this.buff, v); }
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
    /** @type {Record<string, any>} */ this.trait = {};
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
  }

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
  get removed() { return !this.deployed; }
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
  /** The unit's attributes now (属性-1…属性-3). */
  /** Its attributes now, its flags as a kit reads them (兼容-4). */
  get s() {
    const u = this.u;
    if (!u) return null;
    const s = attrs.statsOf(u);
    return { ...s, flags: shFlagsOf(s.flags, elements.bursting(u)) };
  }
  get maxHp() { return this.u ? attrs.statsOf(this.u).maxHp ?? 0 : 0; }
  get atk() { return this.u ? attrs.statsOf(this.u).atk ?? 0 : 0; }
  get hpRatio() { const m = this.maxHp; return m > 0 ? this.hp / m : 0; }
  /** The enemies it blocks. */
  get blocking() {
    const id = this.u?.id ?? -1;
    return id < 0 ? [] : this.b.w.units.filter((e) => e.kind === KIND.ENEMY && e.blockedBy === id).map((e) => this.b.unitOf(e));
  }
  /** Its attribute flags now (stun, sleep, …). */
  get flags() { return this.u ? shFlagsOf(attrs.statsOf(this.u).flags, elements.bursting(this.u)) : {}; }
  /** @param {string} k */
  hasFlag(k) { return !!this.flags[k]; }
  /** An air unit (飞行, 浮空…, 属性-2). */
  get isFlying() { return !!this.u && attrs.statsOf(this.u).flying; }
  /** On the field and not stunned, frozen, asleep or otherwise kept from acting. */
  get canAct() { return this.alive && !this.hidden && !attrs.statsOf(/** @type {Unit} */ (this.u)).disabled; }
  /** Its 重量等级. */
  get weight() { return this.u ? attrs.statsOf(this.u).massLevel ?? 0 : 0; }
  /** Its base attributes (属性-1). @returns {Record<string, any> | null} */
  get base() { return this.u?.base ?? null; }
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
  /** Its own range grid: the one a kit gave it on the field, else its record's. A kit may set it (攻击-1); null takes it back. */
  get rangeGrid() { return this.u?.range ? this.u.range.map((x) => [x.row, x.col]) : this.def?.raw?.rangeGrid ?? this.def?.rangeGrid ?? null; }
  set rangeGrid(g) { if (this.u) setRange(this.u, Array.isArray(g) ? g.map(([row, col]) => ({ row, col })) : null); }
  /** Stronghold's stat cache: the engine's are computed when read. */
  markDirty() {}
  /**
   * What its attacks may select, as Stronghold's profile names it: an operator's trait (职业-1) — flying units when it can
   * hit them, its funnel's 倍率 (职业-12); an enemy's none.
   * @returns {Record<string, any>}
   */
  get profile() {
    if (!this.u || this.u.kind !== KIND.OPERATOR) return {};
    const t = traits.traitOf(this.b.c, this.u);
    const tiles = t.rangeTiles === true || this.kit?.trait?.rangeTiles === true;
    return { canHitFly: t.antiAir, heal: t.heal, dmgType: this.u.base.dmgType, ...(t.funnel ? { funnel: { ...t.funnel } } : {}), ...(tiles ? { rangeTiles: true } : {}) };
  }
  get sp() { return this.skill?.sp ?? 0; }
  get spMax() { return this.skill?.spCost ?? 0; }
  isOp() { return this.kind === 'op'; }
  isEnemy() { return this.side === 'enemy'; }
  isAlly() { return this.side === 'ally'; }
  /** The buff of a key it has — the one in effect (状态-2) —, or null; Stronghold's burst names find the engine's bursts. @param {string} key */
  findBuff(key) {
    const k = buffKeyOf(key), u = this.u, buff = u ? attrs.activeBuffs(u.buffs).find((x) => x.key === k) ?? u.buffs.find((x) => x.key === k) : undefined;
    return buff && u ? new ShBuff(this.b, u, buff) : null;
  }
  /** @param {string} key */
  hasBuff(key) { const k = buffKeyOf(key); return !!this.u?.buffs.some((x) => x.key === k); }
  /** Its buffs, in acquisition order. */
  get buffs() { const u = this.u; return u ? u.buffs.map((x) => new ShBuff(this.b, u, x)) : []; }
}
