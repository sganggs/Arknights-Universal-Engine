// Attributes (docs/spec/attributes.md): a unit's base values, the modifiers of its active buffs, the official formula
// and bounds. statsOf is a pure function of the unit's base and buffs (ADR 0054); nothing it computes is kept in the
// state. It is asked for the same unit many times a frame (targeting, blocking, damage), so it keeps its last answer for
// each unit outside the state and gives it again while nothing it was computed from has changed — checked field by
// field each time, so content that changes a buff's modifiers or a unit's base in place is seen too.
import { powi, secondsAtSpeedToFrames } from '@aue/math';

/** @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Buff} Buff @typedef {import('./types.js').Base} Base */

/**
 * One attribute: the base field it starts from, the mod keys of the four modifier kinds (直接加算, 直接乘算, 最终加算,
 * 最终乘算), the value when the base has none, and its bounds (属性-1, 属性-3).
 * @typedef {{ base: string, keys: readonly [string, string, string, string], def: number, lo: number, hi: number }} Attr
 */

/** @param {string} base @param {[string, string, string, string]} keys @param {number} def @param {number} lo @param {number} [hi] @returns {Attr} */
const attr = (base, keys, def, lo, hi = Infinity) => Object.freeze({ base, keys: Object.freeze(keys), def, lo, hi });
/** The four keys <p>Flat, <p>Pct, <p>Final, <p>Mul. @param {string} p @returns {[string, string, string, string]} */
const kinds = (p) => [`${p}Flat`, `${p}Pct`, `${p}Final`, `${p}Mul`];
/** The same where the 直接加算 key is the bare name, as in the Stronghold interface (aspd, blockCnt …). @param {string} p @returns {[string, string, string, string]} */
const bare = (p) => [p, `${p}Pct`, `${p}Final`, `${p}Mul`];

/** Every attribute, by its name in the stats (属性-1, 属性-3; names and keys follow the Stronghold content interface). */
export const ATTRS = Object.freeze({
  maxHp: attr('maxHp', ['hpFlat', 'hpPct', 'hpFinal', 'hpMul'], 1, 1),
  atk: attr('atk', kinds('atk'), 0, 0),
  def: attr('def', kinds('def'), 0, 0),
  res: attr('res', kinds('res'), 0, 0, 100),
  aspd: attr('aspd', bare('aspd'), 100, 20),
  bat: attr('bat', kinds('bat'), 1, 0),
  blockCnt: attr('blockCnt', bare('blockCnt'), 0, 0),
  moveSpeed: attr('moveSpeed', kinds('move'), 1, 0.1),
  taunt: attr('tauntLevel', bare('taunt'), 0, -2, 2),
  massLevel: attr('massLevel', kinds('mass'), 0, -Infinity),
  spRecovery: attr('spRecovery', kinds('spRecovery'), 1, 0),
  hpRecoveryPerSec: attr('hpRecoveryPerSec', bare('hpRegen'), 0, 0),
  rangeExtend: attr('rangeExtend', bare('rangeExtend'), 0, -Infinity),
  defIgnorePct: attr('defIgnorePct', bare('defIgnorePct'), 0, 0, 1),
  defIgnoreFlat: attr('defIgnoreFlat', bare('defIgnoreFlat'), 0, 0),
  resIgnorePct: attr('resIgnorePct', bare('resIgnorePct'), 0, 0, 1),
  resIgnoreFlat: attr('resIgnoreFlat', bare('resIgnoreFlat'), 0, 0),
  statusRes: attr('statusRes', kinds('statusRes'), 1, 0.001, 1000),
  epDamageResistance: attr('epDamageResistance', kinds('epDmgRes'), 0, 0, 100),
  epResistance: attr('epResistance', kinds('epRes'), 0, 0, 100),
  maxEp: attr('maxEp', kinds('maxEp'), 1000, 0),
});

/**
 * Mod keys the damage step reads from each buff in turn (伤害-8, 伤害-12), so they are not summed into the stats: the
 * taken multipliers of 脆弱 and the like, dodging, 抵挡, and the taken multipliers by the source; those by the source's tag
 * begin `from:` or `fromPA:` (JUDGE_PREFIXES).
 */
export const JUDGE_KEYS = Object.freeze(['dmgTakenMul', 'physTakenMul', 'artsTakenMul', 'trueTakenMul', 'elementalTakenMul', 'dodgePhys', 'dodgeArts',
  'dodgeMelee', 'blockAll', 'blockPA', 'blockPhys', 'blockRangedPhys', 'airTakenMul']);
/** The beginnings of the damage step's own keys by the source's tag (伤害-12). */
export const JUDGE_PREFIXES = Object.freeze(['from:', 'fromPA:']);

/**
 * Multipliers kept as products besides the attributes' own (属性-2): the source's and the healer's (伤害-7, 伤害-11), and
 * the attacker's 攻击力倍率 (伤害-6).
 */
const CHANNELS = Object.freeze(['dmgDealtMul', 'physDealtMul', 'artsDealtMul', 'healingDealtMul', 'healingTakenMul', 'epTakenMul', 'epDealtMul', 'atkScaleMul']);

/** Each attribute key's kind: 0 直接加算, 1 直接乘算, 2 最终加算, 3 最终乘算. */
const KIND_OF = new Map(Object.values(ATTRS).flatMap((a) => a.keys.map((k, i) => /** @type {[string, number]} */ ([k, i]))));
const JUDGE = new Set(JUDGE_KEYS);

/** A product key: an attribute's 最终乘算, or any other key ending in "Mul" (属性-2). @param {string} k */
const isProduct = (k) => (KIND_OF.has(k) ? KIND_OF.get(k) === 3 : k.endsWith('Mul'));

/** Each mod key's part, once worked out: 0 the damage step's own (伤害-8), 1 a product, 2 a sum (属性-2). @type {Map<string, number>} */
const ROLES = new Map();

/** A mod key's part in the stats (属性-2). @param {string} k */
function roleOf(k) {
  let r = ROLES.get(k);
  if (r === undefined) {
    r = JUDGE.has(k) || JUDGE_PREFIXES.some((p) => k.startsWith(p)) ? 0 : isProduct(k) ? 1 : 2;
    if (ROLES.size < 4096) ROLES.set(k, r);
  }
  return r;
}

/** The strength of a buff under 效果取最高 (状态-2). @param {Buff} b */
const strength = (b) => Math.abs(b.value);

/** Whether no two buffs that are not "independent" share a key: then every buff takes effect (状态-2). @param {readonly Buff[]} buffs */
function distinctKeys(buffs) {
  for (let i = 1; i < buffs.length; i++) {
    const b = buffs[i];
    if (b.rule === 'independent') continue;
    for (let j = 0; j < i; j++) if (buffs[j].key === b.key && buffs[j].rule !== 'independent') return false;
  }
  return true;
}

/**
 * The buffs that take effect (状态-2), as activeBuffs — the list itself when that is every buff of it.
 * @param {readonly Buff[]} buffs @returns {readonly Buff[]}
 */
function effectiveBuffs(buffs) {
  if (buffs.length <= 16 && distinctKeys(buffs)) return buffs;
  /** @type {Map<string, Buff>} */
  const pick = new Map();
  for (const b of buffs) {
    if (b.rule === 'independent') continue;
    const cur = pick.get(b.key);
    if (!cur || (b.rule === 'max' && strength(b) > strength(cur))) pick.set(b.key, b);
  }
  return buffs.filter((b) => b.rule === 'independent' || pick.get(b.key) === b);
}

/**
 * The buffs that take effect (状态-2): of the buffs sharing a key, the earliest (rule "queue") or the strongest, the
 * earliest of equals (rule "max"); every "independent" one.
 * @param {readonly Buff[]} buffs in acquisition order @returns {Buff[]} in acquisition order
 */
export function activeBuffs(buffs) {
  const act = effectiveBuffs(buffs);
  return act === buffs ? [...buffs] : /** @type {Buff[]} */ (act);
}

/**
 * The sums, products and flags of the given buffs' modifiers (属性-2): buffs in order, each buff's mods in the order they
 * were written; n stacks add n × v and multiply by vⁿ. The damage step's own keys are left out.
 * @param {readonly Buff[]} buffs
 * @returns {{ sum: Record<string, number>, prod: Record<string, number>, flags: Record<string, boolean> }}
 */
export function aggregate(buffs) {
  /** @type {Record<string, number>} */
  const sum = {};
  /** @type {Record<string, number>} */
  const prod = {};
  /** @type {Record<string, boolean>} */
  const flags = {};
  for (const b of buffs) {
    const st = b.stacks, mods = b.mods, fl = b.flags;
    for (const k in mods) {
      const v = mods[k], r = Object.hasOwn(mods, k) ? roleOf(k) : 0;
      if (r === 0 || !Number.isFinite(v)) continue;
      if (r === 1) prod[k] = (prod[k] ?? 1) * (st === 1 ? v : powi(v, st));
      else sum[k] = (sum[k] ?? 0) + v * st;
    }
    for (const k in fl) if (Object.hasOwn(fl, k) && fl[k]) flags[k] = true;
  }
  return { sum, prod, flags };
}

/**
 * One attribute's value: clamp(F_t × [(A + D_p) × max(0, 1 + D_t) + F_p], lo, hi) (属性-1, 属性-3).
 * @param {Attr} a @param {Partial<Base>} base @param {Record<string, number>} sum @param {Record<string, number>} prod
 */
export function attrValue(a, base, sum, prod) {
  const k = a.keys, b = /** @type {Record<string, unknown>} */ (base)[a.base];
  const A = typeof b === 'number' ? b : a.def;
  const inner = (A + (sum[k[0]] ?? 0)) * Math.max(0, 1 + (sum[k[1]] ?? 0)) + (sum[k[2]] ?? 0);
  return Math.min(a.hi, Math.max(a.lo, inner * (prod[k[3]] ?? 1)));
}

/**
 * The attack interval in seconds, T₀ / (clamp(S, 10, 600) / 100) (属性-5), written as T₀ × 100 / clamp(S, 10, 600).
 * @param {number} bat @param {number} aspd
 */
export const intervalSeconds = (bat, aspd) => (bat * 100) / Math.min(600, Math.max(10, aspd));

/** The attack interval in whole frames, exact on the decimals of T₀ and S (属性-5). @param {number} bat @param {number} aspd */
export const intervalFrames = (bat, aspd) => secondsAtSpeedToFrames(bat, Math.min(600, Math.max(10, aspd)));

/**
 * @typedef {Record<keyof typeof ATTRS, number> & {
 *   interval: number,
 *   dmgDealtMul: number, physDealtMul: number, artsDealtMul: number, healingDealtMul: number, healingTakenMul: number, epTakenMul: number, epDealtMul: number, atkScaleMul: number,
 *   flags: Record<string, boolean>, flying: boolean, invincible: boolean, disabled: boolean, immobile: boolean,
 *   sum: Record<string, number>, prod: Record<string, number>
 * }} Stats
 */

/** Whether any of the flags is an immunity a buff gives (`immune:<flag>`, 状态-7). @param {Record<string, boolean>} raw */
function grantsImmunity(raw) {
  for (const k in raw) if (k.startsWith('immune:')) return true;
  return false;
}

/**
 * The flags a unit is not immune to — by its data, or by a buff's flag `immune:<flag>` (状态-7). `raw` is aggregate's
 * own object: with no immunity at all it is the answer as it is.
 * @param {Partial<Base>} base @param {Record<string, boolean>} raw @returns {Record<string, boolean>}
 */
function withoutImmune(base, raw) {
  const own = base.immune ?? [];
  if (own.length === 0 && !grantsImmunity(raw)) return raw;
  const immune = new Set([...own, ...Object.keys(raw).filter((k) => k.startsWith('immune:')).map((k) => k.slice(7))]);
  /** @type {Record<string, boolean>} */
  const flags = {};
  for (const k of Object.keys(raw)) if (!immune.has(k)) flags[k] = true;
  return flags;
}

/**
 * The flags of the active buffs a unit is not immune to and what they add up to (状态-5, 状态-7): flying (浮空 lifts,
 * 缚地 grounds, 近地悬浮 `hover` lifts), invincible (无敌, 沉睡), disabled (cannot attack or use skills) and immobile.
 * @param {Partial<Base>} base @param {Record<string, boolean>} raw
 */
function flagsOf(base, raw) {
  const flags = withoutImmune(base, raw);
  const flying = flags.levitate ? true : flags.groundbind ? false : flags.hover ? true : base.motion === 'FLY';
  const disabled = !!(flags.stun || flags.freeze || flags.sleep || flags.levitate || flags.palsyShake || flags.sidelined);
  return { flags, flying, invincible: !!(flags.invincible || flags.sleep), disabled, immobile: disabled || !!(flags.root || flags.groundbind) };
}

/** Every attribute with its name, in the order of ATTRS. */
const ATTR_LIST = Object.freeze(Object.entries(ATTRS));

/**
 * A unit's stats computed afresh: every attribute, the attack interval, the damage and healing multipliers, the flags
 * (ADR 0054). For a unit made up for one question (an attack bonus, a unit being created); statsOf for the others.
 * @param {Pick<Unit, 'base' | 'buffs'>} u @returns {Stats}
 */
export function computeStats(u) {
  const { sum, prod, flags } = aggregate(effectiveBuffs(u.buffs));
  /** @type {Record<string, number>} */
  const v = {};
  for (const [name, a] of ATTR_LIST) v[name] = attrValue(a, u.base, sum, prod);
  for (const k of CHANNELS) v[k] = prod[k] ?? 1;
  const f = flagsOf(u.base, flags);
  return /** @type {Stats} */ ({ ...v, flags: f.flags, flying: f.flying, invincible: f.invincible, disabled: f.disabled, immobile: f.immobile, sum, prod,
    interval: intervalSeconds(v.bat, v.aspd) });
}

// ---- the memo ---------------------------------------------------------------------------------------------------------

/**
 * The base fields the stats read (属性-1, 状态-5), as a signature holds them: each attribute's in the order of ATTRS,
 * then the motion; the immunities come after. sameBaseValues compares them by name — it must follow this list.
 */
const BASE_KEYS = Object.freeze([...new Set(ATTR_LIST.map(([, a]) => a.base)), 'motion']);
if (BASE_KEYS.join() !== 'maxHp,atk,def,res,aspd,bat,blockCnt,moveSpeed,tauntLevel,massLevel,spRecovery,hpRecoveryPerSec,rangeExtend,defIgnorePct,'
  + 'defIgnoreFlat,resIgnorePct,resIgnoreFlat,statusRes,epDamageResistance,epResistance,maxEp,motion') throw new Error('attrs: update sameBaseValues with ATTRS');

const is = Object.is;
/** The first eleven base values of a signature (from index 1) are the base's. @param {unknown[]} s @param {Record<string, any>} b */
const sameFirst = (s, b) => is(s[1], b.maxHp) && is(s[2], b.atk) && is(s[3], b.def) && is(s[4], b.res) && is(s[5], b.aspd) && is(s[6], b.bat)
  && is(s[7], b.blockCnt) && is(s[8], b.moveSpeed) && is(s[9], b.tauntLevel) && is(s[10], b.massLevel) && is(s[11], b.spRecovery);
/** The other eleven. @param {unknown[]} s @param {Record<string, any>} b */
const sameRest = (s, b) => is(s[12], b.hpRecoveryPerSec) && is(s[13], b.rangeExtend) && is(s[14], b.defIgnorePct) && is(s[15], b.defIgnoreFlat)
  && is(s[16], b.resIgnorePct) && is(s[17], b.resIgnoreFlat) && is(s[18], b.statusRes) && is(s[19], b.epDamageResistance) && is(s[20], b.epResistance)
  && is(s[21], b.maxEp) && is(s[22], b.motion);
/** Whether the base values a signature holds are the base's — by name, which is many times faster than by a key list. @param {unknown[]} s @param {Record<string, any>} b */
const sameBaseValues = (s, b) => sameFirst(s, b) && sameRest(s, b);

/**
 * Adds an object's own entries in order to a signature, after the object and their count.
 * @param {unknown[]} sig @param {Record<string, unknown>} o
 */
function pushEntries(sig, o) {
  const at = sig.length;
  sig.push(o, 0);
  let n = 0;
  for (const k in o) if (Object.hasOwn(o, k)) { sig.push(k, o[k]); n++; }
  sig[at + 1] = n;
}

/**
 * Everything a unit's stats are computed from, as a flat list: its base and the base values read, its immunities, and
 * each buff with its key, rule, value, stacks and own mods and flags in order.
 * @param {Pick<Unit, 'base' | 'buffs'>} u @returns {unknown[]}
 */
function signature(u) {
  const base = /** @type {Record<string, any>} */ (u.base);
  /** @type {unknown[]} */
  const sig = [base];
  for (const k of BASE_KEYS) sig.push(base[k]);
  const imm = base.immune ?? null, n = imm ? imm.length : 0;
  sig.push(imm, n);
  for (let i = 0; i < n; i++) sig.push(imm[i]);
  sig.push(u.buffs.length);
  for (const b of u.buffs) {
    sig.push(b, b.key, b.rule, b.value, b.stacks);
    pushEntries(sig, b.mods);
    pushEntries(sig, b.flags);
  }
  return sig;
}

/**
 * Whether an object's own entries are those written at `i` of a signature; the index after them, or −1.
 * @param {unknown[]} sig @param {number} i @param {Record<string, unknown>} o
 */
function sameEntries(sig, i, o) {
  if (i < 0 || sig[i] !== o) return -1;
  const n = /** @type {number} */ (sig[i + 1]);
  let j = i + 2, seen = 0;
  for (const k in o) {
    if (!Object.hasOwn(o, k)) continue;
    if (seen === n || sig[j] !== k || !Object.is(sig[j + 1], o[k])) return -1;
    j += 2;
    seen++;
  }
  return seen === n ? j : -1;
}

/** Whether a buff is the one written at `i` of a signature; the index after it, or −1. @param {unknown[]} sig @param {number} i @param {Buff} b */
function sameBuff(sig, i, b) {
  if (sig[i] !== b || sig[i + 1] !== b.key || sig[i + 2] !== b.rule || !Object.is(sig[i + 3], b.value) || !Object.is(sig[i + 4], b.stacks)) return -1;
  return sameEntries(sig, sameEntries(sig, i + 5, b.mods), b.flags);
}

/** Whether the base values and immunities are those written at the start of a signature; the index after them, or −1. @param {unknown[]} sig @param {Record<string, any>} base */
function sameBase(sig, base) {
  if (sig[0] !== base || !sameBaseValues(sig, base)) return -1;
  let i = 1 + BASE_KEYS.length;
  const imm = base.immune ?? null, n = imm ? imm.length : 0;
  if (sig[i] !== imm || sig[i + 1] !== n) return -1;
  i += 2;
  for (let j = 0; j < n; j++) if (sig[i++] !== imm[j]) return -1;
  return i;
}

/** Whether a unit's stats would be computed from what its signature holds. @param {unknown[]} sig @param {Pick<Unit, 'base' | 'buffs'>} u */
function unchanged(sig, u) {
  let i = sameBase(sig, u.base);
  if (i < 0 || sig[i] !== u.buffs.length) return false;
  i++;
  for (const b of u.buffs) {
    i = sameBuff(sig, i, b);
    if (i < 0) return false;
  }
  return true;
}

/**
 * A unit's maximum HP (属性-1, 属性-4) — statsOf(u).maxHp, to the bit — without the rest of the stats: the last stats'
 * while they hold, else only the four HP keys summed (each key's sum is its own, in the same order; a key only as
 * aggregate reads one, own and enumerable). For refreshHp, which runs after every change to a unit's buffs, often
 * several in a row before anything asks for the stats.
 * @param {Pick<Unit, 'base' | 'buffs'>} u
 */
export function maxHpOf(u) {
  const m = memo.get(u);
  if (m !== undefined && unchanged(m.sig, u)) return m.stats.maxHp;
  /** @type {Record<string, number>} */
  const sum = {};
  /** @type {Record<string, number>} */
  const prod = {};
  for (const b of effectiveBuffs(u.buffs)) {
    const st = b.stacks, mods = b.mods;
    for (const k of HP_KEYS) {
      const v = enumerableOwn.call(mods, k) ? mods[k] : undefined;
      if (v === undefined || !Number.isFinite(v)) continue;
      if (k === 'hpMul') prod[k] = (prod[k] ?? 1) * (st === 1 ? v : powi(v, st));
      else sum[k] = (sum[k] ?? 0) + v * st;
    }
  }
  return attrValue(ATTRS.maxHp, u.base, sum, prod);
}

/** Whether an object has a key of its own that for…in visits: the mods aggregate reads. */
const enumerableOwn = Object.prototype.propertyIsEnumerable;

/** The maximum HP's mod keys: 直接加算, 直接乘算, 最终加算, 最终乘算 (only the last a product). */
const HP_KEYS = ATTRS.maxHp.keys;
if (HP_KEYS.join() !== 'hpFlat,hpPct,hpFinal,hpMul') throw new Error('attrs: update maxHpOf with ATTRS.maxHp');

/** @type {WeakMap<object, { stats: Stats, sig: unknown[] }>} each unit's last stats and what they were computed from */
const memo = new WeakMap();

/**
 * A unit's stats: every attribute, the attack interval, the damage and healing multipliers, the flags (ADR 0054). The
 * same object as the last time while nothing they are computed from has changed; never change it.
 * @param {Pick<Unit, 'base' | 'buffs'>} u @returns {Stats}
 */
export function statsOf(u) {
  const m = memo.get(u);
  if (m !== undefined && unchanged(m.sig, u)) return m.stats;
  const stats = computeStats(u);
  memo.set(u, { stats, sig: signature(u) });
  return stats;
}
