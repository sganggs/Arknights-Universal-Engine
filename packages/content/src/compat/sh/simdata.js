// Stands in for Stronghold's server/sim/simdata.js (兼容-2): its record normalisers, ported from it (GPL-3.0-or-later,
// Stronghold Protocol v0.2.4) — a chess record (records.js makes one from the engine's training data, 兼容-3) as the
// "def" its kits receive. The fields keep Stronghold's alternative spellings.

import { gap } from './gap.js';

/** @typedef {Record<string, any>} Rec */

// Stronghold's data views and route records, which its battle content beyond the kits imports: gaps (兼容-7).
export const isShopItem = gap('simdata.isShopItem');
export const normalizeRoute = gap('simdata.normalizeRoute');
export const withUnitLoadouts = gap('simdata.withUnitLoadouts');

/** A number from a number or a numeric string, else the default. @param {unknown} v @param {number} [d] */
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : d));

/** The first of an object's fields that is set (not null or undefined), else the default. @param {Rec | null | undefined} o @param {string[]} keys @param {unknown} [d] */
const first = (o, keys, d = undefined) => {
  for (const k of keys) if (o?.[k] != null) return o[k];
  return d;
};

/** A blackboard list ({ key, value, valueStr }) as an object; an object as a copy. @param {unknown} bb @returns {Rec} */
export function flattenBlackboard(bb) {
  if (!bb) return {};
  if (!Array.isArray(bb)) return { ...bb };
  /** @type {Rec} */
  const out = {};
  for (const e of bb) {
    if (!e || e.key == null) continue;
    out[e.key] = e.valueStr != null && e.valueStr !== '' && (e.value === 0 || e.value == null) ? e.valueStr : e.value;
  }
  return out;
}

/** A grid as [row, col] pairs ([r, c] arrays or { row, col } objects), or null. @param {unknown} grid @returns {number[][] | null} */
function toArrayOfPairs(grid) {
  if (!Array.isArray(grid)) return null;
  return grid.flatMap((p) => {
    if (Array.isArray(p) && p.length >= 2) return [[num(p[0]), num(p[1])]];
    if (p && typeof p === 'object' && ('row' in p || 'r' in p)) return [[num(first(p, ['row', 'r'])), num(first(p, ['col', 'c']))]];
    return [];
  });
}

/** Damage type names by their start or whole name. */
const DMG_NAMES = Object.freeze(/** @type {[RegExp, string][]} */ ([[/^PHYS/, 'phys'], [/^(MAG|ARTS$)/, 'arts'], [/^HEAL(ING)?$/, 'heal'],
  [/^(TRUE|REAL|PURE)$|^ELEM/, 'true'], [/^(NO_DAMAGE|NONE|NO)$/, 'none']]));

/** A damage type name as Stronghold's. @param {unknown} v @param {string} [fallback] */
export function normDmgType(v, fallback = 'phys') {
  if (v == null) return fallback;
  const s = String(Array.isArray(v) ? v[0] : v).toUpperCase();
  return DMG_NAMES.find(([re]) => re.test(s))?.[1] ?? fallback;
}

/** skill_table's numeric SP types. @type {Record<number, string>} */
const SP_NUMBERS = { 1: 'time', 2: 'attack', 4: 'hurt', 8: 'none' };

/** An SP type as Stronghold's. @param {unknown} v */
function normSpType(v) {
  if (typeof v === 'number') return SP_NUMBERS[v] ?? 'time';
  const s = String(v ?? '').toUpperCase();
  if (s.includes('TIME')) return 'time';
  if (s.includes('ATTACK')) return 'attack';
  return s.includes('DAMAGE') || s.includes('HURT') ? 'hurt' : 'none';
}

/** A trigger rule name as Stronghold's. @param {unknown} v */
function normTriggerRule(v) {
  const s = String(v ?? 'DEFAULT').toUpperCase();
  if (s === 'ALWAYS' || s === 'SP_FULL') return 'SP_FULL';
  return s.startsWith('CUSTOM_RANGE') ? 'CUSTOM_RANGE' : s;
}

/** A skill's trigger: its rule, grid and ally condition. @param {Rec} s @param {Rec} rec */
function triggerOf(s, rec) {
  const trig = first(s, ['trigger'], first(rec, ['skillTrigger'], {})), obj = typeof trig === 'object';
  const rule = normTriggerRule(obj ? trig.rule : trig), grid = toArrayOfPairs((obj && first(trig, ['customRangeGrid', 'rangeGrid', 'grid'])) || rec.skillTriggerCustomRangeGrid);
  return obj && trig.allies === true ? { rule, grid, allies: true } : { rule, grid };
}

/** The skill part of a record, normalised; null without one (or for a withdraw skill). @param {Rec | null} rec @returns {Rec | null} */
export function normalizeSkill(rec) {
  const s = rec?.skill;
  if (!s || typeof s !== 'object') return null;
  const id = first(s, ['skillId', 'id'], 'skill');
  if (/^skcom_withdraw/.test(String(id))) return null;
  const bb = s.bb ? { ...s.bb } : flattenBlackboard(s.blackboard);
  return {
    id, name: s.name ?? '', index: first(s, ['skillIndex', 'index'], null), skillType: String(first(s, ['skillType', 'type'], 'MANUAL')).toUpperCase(),
    durationType: String(s.durationType ?? 'NONE').toUpperCase(), duration: num(first(s, ['duration'], bb.duration ?? 0), 0), spType: normSpType(s.spType),
    spCost: Math.max(0, num(s.spCost, 0)), initSp: Math.max(0, num(s.initSp, 0)), maxCharges: Math.max(1, num(first(s, ['maxChargeTime', 'maxCharges', 'charges']), 1)),
    rangeGrid: toArrayOfPairs(s.rangeGrid), trigger: triggerOf(s, /** @type {Rec} */ (rec)), kind: s.kind ?? null, bb, description: first(s, ['description', 'desc'], ''),
  };
}

/** @param {Rec | undefined} st */
function normStats(st = {}) {
  const n = (/** @type {string[]} */ keys, /** @type {number} */ d) => num(first(st, keys), d);
  return {
    maxHp: Math.max(1, n(['maxHp', 'hp'], 1000)), atk: Math.max(0, n(['atk'], 0)), def: Math.max(0, n(['def'], 0)),
    res: Math.max(0, n(['magicResistance', 'res', 'resistance'], 0)), aspd: n(['attackSpeed', 'aspd'], 100) || 100,
    bat: Math.max(0.05, n(['baseAttackTime', 'bat'], 1)), blockCnt: Math.max(0, n(['blockCnt', 'block'], 1)), cost: Math.max(0, n(['cost'], 10)),
    respawnTime: Math.max(0, n(['respawnTime', 'redeploy'], 70)), spRecovery: n(['spRecoveryPerSec', 'spRecovery'], 1),
    tauntLevel: n(['tauntLevel', 'taunt'], 0), massLevel: n(['massLevel', 'mass'], 0), hpRecoveryPerSec: n(['hpRecoveryPerSec'], 0), moveSpeed: n(['moveSpeed'], 1),
  };
}

/** The statuses a record is immune to. @param {unknown} v @returns {Set<string>} */
function immuneSet(v) {
  const out = new Set(), add = (/** @type {unknown} */ k) => out.add(String(k).replace(/Immune$/, '').toLowerCase());
  if (Array.isArray(v)) v.forEach(add);
  else if (v && typeof v === 'object') for (const [k, on] of Object.entries(v)) if (on) add(k);
  return out;
}

/** @param {Rec} t */
const talentOf = (t) => ({
  name: t.name ?? '', description: first(t, ['description', 'desc'], ''), bb: t.bb ? { ...t.bb } : flattenBlackboard(t.blackboard),
  bbStr: t.bbStr ? { ...t.bbStr } : {}, rangeGrid: toArrayOfPairs(t.rangeGrid), tokenKey: t.tokenKey ?? null,
});

/** A record's trait text and blackboard. @param {Rec} rec */
function traitOf(rec) {
  const trait = rec.trait, obj = trait && typeof trait === 'object';
  return {
    trait: typeof trait === 'string' ? trait : first(obj ? trait : rec, [obj ? 'desc' : 'traitText'], ''),
    traitBb: rec.traitBb ?? (obj ? { ...(trait.bb || {}) } : flattenBlackboard(rec.traitBlackboard)),
  };
}

/** A record's ids and the kind of chess it is. @param {Rec} rec */
function idsOf(rec) {
  const id = first(rec, ['chessId', 'id']);
  return { type: 'chess', id, baseId: first(rec, ['baseChessId', 'baseId'], String(id).replace(/_b$/, '_a')), golden: !!first(rec, ['isGolden', 'golden'], /_b$/.test(String(id))) };
}

/** A chess record, normalised: the "def" a kit receives. @param {Rec} rec @returns {Rec} */
export function normalizeChess(rec) {
  const ids = idsOf(rec);
  return {
    ...ids, name: rec.name ?? ids.id, charId: rec.charId ?? null, tier: num(rec.tier, 1), rarity: num(rec.rarity, 4),
    profession: String(rec.profession ?? 'WARRIOR').toUpperCase(), subProf: first(rec, ['subProfessionId', 'subProfession', 'subProf'], null),
    position: String(rec.position ?? 'MELEE').toUpperCase(), bonds: [...first(rec, ['bondIds', 'bonds'], [])], stats: normStats(rec.stats),
    rangeGrid: toArrayOfPairs(rec.rangeGrid ?? rec.range?.grid) ?? [[0, 0], [0, 1]], dmgType: rec.dmgType ? normDmgType(rec.dmgType) : null,
    ...Object.fromEntries(['attackKind', 'projectile', 'canHitFly', 'targetPriority', 'splashRadius'].map((k) => [k, rec[k] ?? null])),
    ...traitOf(rec), immune: immuneSet(first(rec, ['immunities', 'immune'])), skill: normalizeSkill(rec), talents: (rec.talents ?? []).map(talentOf),
    tokens: rec.tokens ?? [], spine: first(rec.assets, ['spine'], first(rec, ['spine', 'charId'], null)), avatar: first(rec.assets, ['avatar'], first(rec, ['avatar', 'charId'], null)),
    ...(rec.diyFor ? { diyFor: rec.diyFor } : null), raw: rec,
  };
}

/** A token's damage type: its record's, else by the words of its description (法术, 真实, 恢复/治疗). @param {Rec} t @param {string} desc */
const tokenDmgType = (t, desc) => (t.dmgType ? normDmgType(t.dmgType) : /法术/.test(desc) ? 'arts' : /真实/.test(desc) ? 'true' : /恢复|治疗/.test(desc) ? 'heal' : 'phys');

/**
 * What a token's description and record say of it: untargetable when it is not attacked, its abnormal effects, its
 * trait text and blackboard.
 * @param {Rec} t @param {string} desc
 */
const tokenTraits = (t, desc) => ({
  untargetable: t.untargetable ?? /不会受到攻击|不会成为/.test(desc), abnormal: Array.isArray(t.abnormal) ? t.abnormal.filter((x) => typeof x === 'string') : [],
  trait: desc, traitBb: t.trait && typeof t.trait === 'object' ? { ...(t.trait.bb || {}) } : {},
});

/**
 * A token record, normalised (Stronghold's normalizeToken): the "def" a kit receives for a summon, from the record of its
 * owner's loadout (records.js tokenRecordOf).
 * @param {string} id @param {Rec} t @returns {Rec}
 */
export function normalizeToken(id, t) {
  const desc = String(first(t, ['description', 'desc'], typeof t.trait === 'string' ? t.trait : t.trait?.desc ?? ''));
  return {
    type: 'token', id, baseId: id, golden: false, name: t.name ?? id, charId: id, tier: num(t.tier, 1), rarity: 1,
    profession: String(t.profession ?? 'TOKEN').toUpperCase(), subProf: first(t, ['subProfessionId', 'subProf'], null),
    position: String(t.position ?? 'MELEE').toUpperCase(), bonds: [], stats: normStats(t.stats), rangeGrid: toArrayOfPairs(t.rangeGrid) ?? [[0, 0], [0, 1]],
    dmgType: tokenDmgType(t, desc), attackKind: t.attackKind ? String(t.attackKind).toLowerCase() : null,
    ...Object.fromEntries(['projectile', 'canHitFly', 'targetPriority'].map((k) => [k, t[k] ?? null])),
    ...tokenTraits(t, desc), immune: immuneSet(t.immunities), skill: normalizeSkill(t), talents: (t.talents ?? []).map(talentOf), tokens: [], count: num(t.count, 1),
    sources: Array.isArray(t.sources) ? [...t.sources] : null, spine: t.spine ?? id, avatar: t.avatar ?? id, raw: t,
  };
}
