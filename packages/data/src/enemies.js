// Enemies (docs/spec/level.md 关卡-1, coop.md 合作-2, 合作-9): an enemy_database entry at the level a level asks for, with the
// level's overrides, as the engine's enemy; the 共同敌手 and neutral enemies of a level.
import { asArray, asInt, asNumber, asObject, asString, field, wrapped, wrappedNumber } from './validate.js';
import { NEUTRAL_ENEMIES } from './neutral.js';

/**
 * { [key]: m_value } when the wrapper is defined (m_defined), else nothing: the attribute takes its default.
 * @param {Record<string, unknown>} o @param {string} key @param {string} path path of o
 * @returns {Record<string, number>}
 */
function definedNumber(o, key, path) {
  const w = asObject(field(o, key, path), `${path}.${key}`);
  return w.m_defined === true ? { [key]: wrappedNumber(o, key, path) } : {};
}

/** The enemy_database immunities and the status flags they stand for (状态-7). */
const IMMUNE_FLAGS = Object.freeze({
  stunImmune: 'stun', silenceImmune: 'silence', sleepImmune: 'sleep', frozenImmune: 'freeze', levitateImmune: 'levitate',
  disarmedCombatImmune: 'disarmedCombat', fearedImmune: 'fear', palsyImmune: 'palsy', attractImmune: 'attract',
  teleportImmune: 'teleport', groundBoundImmune: 'groundbind',
});

/**
 * { immune: [flags] } for each immunity defined as true, else nothing.
 * @param {Record<string, unknown>} at attributes @param {string} path path of at
 * @returns {{ immune?: string[] }}
 */
function immunities(at, path) {
  const out = Object.entries(IMMUNE_FLAGS).filter(([k]) => {
    if (!Object.hasOwn(at, k)) return false;
    const w = asObject(at[k], `${path}.${k}`);
    return w.m_defined === true && w.m_value === true;
  }).map(([, flag]) => flag);
  return out.length > 0 ? { immune: out } : {};
}

/**
 * An enemy's tags (关卡-1): enemyTags when defined and not empty.
 * @param {Record<string, unknown>} data @param {string} dp @returns {{ tags?: string[] }}
 */
function tagsOf(data, dp) {
  if (!Object.hasOwn(data, 'enemyTags')) return {};
  const w = asObject(data.enemyTags, `${dp}.enemyTags`);
  if (w.m_defined !== true || !Array.isArray(w.m_value) || w.m_value.length === 0) return {};
  return { tags: w.m_value.map((t, i) => asString(t, `${dp}.enemyTags.m_value[${i}]`)) };
}

/**
 * One enemy from its (merged) enemyData (关卡-1).
 * @param {Record<string, unknown>} data
 * @param {string} key
 * @param {string} dp path of data
 * @returns {Record<string, unknown>}
 */
function readEnemy(data, key, dp) {
  const ap = `${dp}.attributes`;
  const at = asObject(field(data, 'attributes', dp), ap);
  return {
    name: asString(wrapped(data, 'name', dp), `${dp}.name.m_value`),
    maxHp: wrappedNumber(at, 'maxHp', ap),
    atk: wrappedNumber(at, 'atk', ap),
    def: wrappedNumber(at, 'def', ap),
    res: wrappedNumber(at, 'magicResistance', ap),
    moveSpeed: wrappedNumber(at, 'moveSpeed', ap),
    baseAttackTime: wrappedNumber(at, 'baseAttackTime', ap),
    rangeRadius: wrappedNumber(data, 'rangeRadius', dp),
    applyWay: asString(wrapped(data, 'applyWay', dp), `${dp}.applyWay.m_value`),
    motion: asString(wrapped(data, 'motion', dp), `${dp}.motion.m_value`),
    ...definedNumber(at, 'blockCnt', ap),
    massLevel: wrappedNumber(at, 'massLevel', ap),
    levelType: asString(wrapped(data, 'levelType', dp), `${dp}.levelType.m_value`),
    lifePointReduce: wrappedNumber(data, 'lifePointReduce', dp),
    ...definedNumber(at, 'epDamageResistance', ap),
    ...definedNumber(at, 'epResistance', ap),
    ...immunities(at, ap),
    ...tagsOf(data, dp),
    ...neutralOf(key, data, dp),
    ...abilitiesOf(data, dp),
  };
}

/**
 * A blackboard entry's value (敌能-1): its text when it has one (an enemy key, a buff name), else its number.
 * @param {Record<string, unknown>} o @param {string} p @returns {number | string}
 */
const bbValue = (o, p) => (typeof o.valueStr === 'string' && o.valueStr !== '' ? o.valueStr : asNumber(o.value, `${p}.value`, -1e9, 1e9));

/**
 * An enemy's talents and skills (敌能-1): the talent blackboard grouped by the part of each key before its first `.`;
 * the skills with their cooldowns, SP cost (up to 99999: 9999 is a skill never charged) and blackboards; an entry with a
 * text keeps the text.
 * @param {Record<string, unknown>} data @param {string} dp
 * @returns {{ talents?: Record<string, Record<string, number | string>>, skills?: { key: string, cooldown: number, initCooldown: number, sp: number, bb: Record<string, number | string> }[] }}
 */
function abilitiesOf(data, dp) {
  /** @type {Record<string, Record<string, number | string>>} */
  const talents = {};
  (Array.isArray(data.talentBlackboard) ? data.talentBlackboard : []).forEach((t, i) => {
    const o = asObject(t, `${dp}.talentBlackboard[${i}]`), k = asString(o.key, `${dp}.talentBlackboard[${i}].key`);
    const dot = k.indexOf('.'), name = dot < 0 ? k : k.slice(0, dot), field_ = dot < 0 ? '' : k.slice(dot + 1);
    (talents[name] ??= {})[field_] = bbValue(o, `${dp}.talentBlackboard[${i}]`);
  });
  const skills = (Array.isArray(data.skills) ? data.skills : []).map((s, i) => {
    const sp = `${dp}.skills[${i}]`, o = asObject(s, sp);
    const bb = Object.fromEntries((Array.isArray(o.blackboard) ? o.blackboard : []).map((b, j) => {
      const e = asObject(b, `${sp}.blackboard[${j}]`);
      return [asString(e.key, `${sp}.blackboard[${j}].key`), bbValue(e, `${sp}.blackboard[${j}]`)];
    }));
    return {
      key: asString(field(o, 'prefabKey', sp), `${sp}.prefabKey`), cooldown: asNumber(field(o, 'cooldown', sp), `${sp}.cooldown`, -1, 1e6),
      initCooldown: asNumber(field(o, 'initCooldown', sp), `${sp}.initCooldown`, -1, 1e6), sp: asInt(o.spCost ?? 0, `${sp}.spCost`, 0, 99999), bb,
    };
  });
  return { ...(Object.keys(talents).length > 0 ? { talents } : {}), ...(skills.length > 0 ? { skills } : {}) };
}

/** enemy_handbook_table's damageType → the engine's damage type (敌能-1). */
const DAMAGE_TYPES = Object.freeze({ PHYSIC: 'phys', MAGIC: 'arts' });

/**
 * An enemy's normal attack damage type (敌能-1): the first of its handbook damageType, physical when that is neither
 * PHYSIC nor MAGIC or the enemy has no handbook entry.
 * @param {unknown} handbook enemy_handbook_table.json @param {string} key @returns {{ dmgType?: 'arts' }}
 */
export function damageTypeOf(handbook, key) {
  const data = handbook ? asObject(asObject(handbook, 'handbook').enemyData ?? {}, 'handbook.enemyData') : {};
  const e = Object.hasOwn(data, key) ? asObject(data[key], `handbook.enemyData[${key}]`) : null;
  const first = e && Array.isArray(e.damageType) ? e.damageType[0] : undefined;
  return /** @type {Record<string, string>} */ (DAMAGE_TYPES)[String(first)] === 'arts' ? { dmgType: 'arts' } : {};
}

/**
 * Whether an enemy is neutral, and the lives it costs when knocked down (合作-9): from the neutral enemies table and its
 * talent `dead.value`.
 * @param {string} key @param {Record<string, unknown>} data @param {string} dp @returns {{ neutral?: true, deathLife?: number }}
 */
function neutralOf(key, data, dp) {
  if (!Object.hasOwn(NEUTRAL_ENEMIES, key)) return {};
  const talents = Array.isArray(data.talentBlackboard) ? data.talentBlackboard : [];
  const dead = talents.map((t, i) => asObject(t, `${dp}.talentBlackboard[${i}]`)).find((t) => t.key === 'dead.value');
  const value = dead ? asNumber(dead.value, `${dp}.talentBlackboard.dead.value`, -1e6, 1e6) : 0;
  return { neutral: true, ...(value < 0 ? { deathLife: -value } : {}) };
}

/**
 * The 共同敌手 of a level (合作-2): the enemy keys its rune `cooperate_enemy_side_shared`, or `env_gbuff_new_with_verify`
 * with key `cooperate_enemy_side_shared`, lists (`|`-separated in its `enemy` entry).
 * @param {unknown} runesRaw level.runes @returns {Set<string>}
 */
export function sharedEnemies(runesRaw) {
  /** @type {Set<string>} */
  const out = new Set();
  if (!Array.isArray(runesRaw)) return out;
  runesRaw.forEach((r, i) => {
    const rp = `level.runes[${i}]`, rune = asObject(r, rp);
    if ((rune.key !== 'env_gbuff_new_with_verify' && rune.key !== 'cooperate_enemy_side_shared') || !Array.isArray(rune.blackboard)) return;
    const bb = Object.fromEntries(rune.blackboard.map((b, k) => { const o = asObject(b, `${rp}.blackboard[${k}]`); return [String(o.key), o.valueStr]; }));
    if (rune.key === 'cooperate_enemy_side_shared' || bb.key === 'cooperate_enemy_side_shared') for (const k of String(bb.enemy ?? '').split('|')) if (k) out.add(k);
  });
  return out;
}

/**
 * enemyData `over` laid on `base` (关卡-1): each field `over` defines (m_defined) replaces base's; `attributes` field by
 * field; a list given (talents, skills) replaces base's.
 * @param {Record<string, unknown>} base @param {Record<string, unknown>} over @param {string} p path of over
 * @returns {Record<string, unknown>}
 */
export function mergeEnemyData(base, over, p) {
  /** @type {Record<string, unknown>} */
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (k === 'attributes' && v !== null && v !== undefined) out[k] = mergeEnemyData(asObject(base[k] ?? {}, `${p}.${k}`), asObject(v, `${p}.${k}`), `${p}.${k}`);
    else if (Array.isArray(v)) out[k] = v;
    else if (v !== null && typeof v === 'object' && /** @type {Record<string, unknown>} */ (v).m_defined === true) out[k] = v;
  }
  return out;
}

/**
 * A level's overwrittenData laid on an enemy (关卡-1): as mergeEnemyData, but a talentBlackboard given sets only the keys
 * it lists — each replaces the entry of the same key, a key the enemy lacks is added after its own, the others stay.
 * @param {Record<string, unknown>} base @param {Record<string, unknown>} over @param {string} p path of over
 * @returns {Record<string, unknown>}
 */
export function overwriteEnemyData(base, over, p) {
  if (!Array.isArray(over.talentBlackboard)) return mergeEnemyData(base, over, p);
  const keyOf = (/** @type {unknown} */ t, /** @type {string} */ tp) => asString(asObject(t, tp).key, `${tp}.key`);
  const mine = new Map(over.talentBlackboard.map((t, i) => [keyOf(t, `${p}.talentBlackboard[${i}]`), t]));
  const own = Array.isArray(base.talentBlackboard) ? base.talentBlackboard : [];
  const ownKeys = new Set(own.map((t, i) => keyOf(t, `talentBlackboard[${i}]`)));
  const talents = [...own.map((t) => mine.get(keyOf(t, 'talentBlackboard[]')) ?? t), ...[...mine].filter(([k]) => !ownKeys.has(k)).map(([, t]) => t)];
  return mergeEnemyData(base, { ...over, talentBlackboard: talents }, p);
}

/**
 * One enemy of the database (关卡-1): level 0, overlaid with the level `ref` asks for and its overwrittenData (talents
 * key by key); with useDb false, its overwrittenData alone.
 * @param {unknown} dbRaw enemy_database.json @param {string} key
 * @param {{ level?: number, useDb?: boolean, overwrittenData?: unknown }} [ref] the level's enemyDbRefs entry
 */
export function enemyOf(dbRaw, key, ref) {
  const p = `enemyDb[${key}]`, over = ref?.overwrittenData ? asObject(ref.overwrittenData, `${p}.overwrittenData`) : null;
  if (ref && ref.useDb === false) return readEnemy(/** @type {Record<string, unknown>} */ (over), key, `${p}.overwrittenData`);
  const list = asArray(field(asObject(dbRaw, 'enemyDb'), 'enemies', 'enemyDb'), 'enemyDb.enemies');
  const entry = list.find((e) => asObject(e, 'enemyDb.enemies[]').Key === key);
  if (entry === undefined) throw new Error(`enemyDb: no enemy ${key}`);
  const values = asArray(field(asObject(entry, p), 'Value', p), `${p}.Value`).map((v, i) => asObject(v, `${p}.Value[${i}]`));
  const dataOf = (/** @type {Record<string, unknown>} */ v, /** @type {number} */ i) => asObject(field(v, 'enemyData', `${p}.Value[${i}]`), `${p}.Value[${i}].enemyData`);
  let data = dataOf(values[0], 0);
  const lv = ref?.level ?? 0;
  if (lv > 0) {
    const i = values.findIndex((v) => v.level === lv);
    if (i < 0) throw new Error(`${p}: no level ${lv}`);
    data = mergeEnemyData(data, dataOf(values[i], i), `${p}.Value[${i}].enemyData`);
  }
  if (over) data = overwriteEnemyData(data, over, `${p}.overwrittenData`);
  return readEnemy(data, key, `${p}.Value[0].enemyData`);
}
