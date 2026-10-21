// Talents at a training (docs/spec/operators.md 干员-6): each talent's last candidate unlocked, and their always-on
// parts — the leading clauses that only raise the operator's own attributes — as one blackboard. A module may upgrade a
// talent (干员-7, operators.js).

import powerTable from '../data/powers.json' with { type: 'json' };

/** @typedef {import('./operators.js').Build} Build @typedef {import('./operators.js').TalentCandidate} TalentCandidate */
/** A talent candidate as far as 干员-6 reads it; its range id (干员-8) when it has one. @typedef {{ description: string | null, bb: Record<string, number>, hidden: boolean, rangeId?: string | null }} Talent */

/**
 * Whether a candidate (of a trait, a talent or a module part) is unlocked at a training (干员-3): its elite phase and
 * level reached, its potential (0–5) at most the build's potential − 1.
 * @param {{ phase: number, level: number, potential: number }} c @param {Build} b
 */
export const unlockedAt = (c, b) => (c.phase < b.elite || (c.phase === b.elite && c.level <= b.level)) && c.potential <= b.potential - 1;

/**
 * Each talent's last candidate unlocked at a training (干员-6), by the talent's index; null for a talent with none.
 * @param {{ talents?: TalentCandidate[][] }} t @param {Build} b @returns {(TalentCandidate | null)[]}
 */
export const talentsAt = (t, b) => (t.talents ?? []).map((cands) => cands.filter((c) => unlockedAt(c, b)).at(-1) ?? null);

/** The attribute words of a description and the blackboard key each names (干员-6). */
const WORDS = Object.freeze(/** @type {Record<string, string>} */ ({
  攻击力: 'atk', 防御力: 'def', 生命上限: 'max_hp', 最大生命值: 'max_hp', 生命值: 'max_hp', 攻击速度: 'attack_speed', 攻速: 'attack_speed',
  法术抗性: 'magic_resistance', 技力自然回复速度: 'sp_recovery_per_sec', 技力回复速度: 'sp_recovery_per_sec', 再部署时间: 'respawn_time', 部署费用: 'cost',
}));
const ATTR = Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|');
/** One clause: (但, 自身) attributes joined by 和 or 、, then (各) a signed number, maybe with %, 秒 or /秒. */
const CLAUSE = new RegExp(`^但?(?:自身的?)?((?:${ATTR})(?:[和、](?:${ATTR}))*)各?[+＋\\-－]\\d+(?:\\.\\d+)?(%|秒|/秒)?$`);
const ATTR_G = new RegExp(ATTR, 'g');
/** The keys whose blackboard value is a share, written with % (技能-5: 直接乘算); the others are written without. */
const SHARES = Object.freeze(['atk', 'def', 'max_hp']);

/**
 * The keys a clause's attribute words name, when its % agrees with them (干员-6): % for a share, none for the others.
 * Null when it does not.
 * @param {string} words @param {string | undefined} unit @param {Record<string, string>} table @param {RegExp} g
 * @returns {string[] | null}
 */
function clauseKeys(words, unit, table, g) {
  const keys = (words.match(g) ?? []).map((w) => table[w]);
  return keys.every((k) => SHARES.includes(k) === (unit === '%')) ? keys : null;
}

/** An attribute clause written the other way round (干员-6): 获得 and a signed number before the attributes (「获得+18%攻击力」). */
const CLAUSE_AFTER = new RegExp(`^获得[+＋\\-－]\\d+(?:\\.\\d+)?(%)?((?:${ATTR})(?:[和、](?:${ATTR}))*)$`);

/** @param {Record<string, number>} bb @param {string} k */
const has = (bb, k) => Number.isFinite(bb[k]);
/** A number of the blackboard as 1 − it: the share left by a reduction (庇护, 减伤). @param {number} v */
const left = (v) => 1 - v;

/** The enemies' tags by the names a description gives them in 【】 (关卡-1). */
export const TAGS = Object.freeze(/** @type {Record<string, string>} */ ({ 萨卡兹: 'sarkaz', 无人机: 'drone', 感染生物: 'infection', 海怪: 'seamonster' }));
/** The taken multiplier's key for damage from enemies of a tag (伤害-12): all of it (`from:`), or physical and arts (`fromPA:`); null for another name. @param {string} name @param {boolean} pa */
const fromKey = (name, pa) => (Object.hasOwn(TAGS, name) ? `${pa ? 'fromPA' : 'from'}:${TAGS[name]}` : null);

/**
 * The effects on the operator itself that are not attributes (干员-16, 干员-26): a clause, the blackboard key it takes its
 * number from, and the modifiers (属性-2, 伤害-8, 伤害-12) that number gives — with the clause's match, for one that names
 * a tag; none for a name it does not know.
 * @type {readonly [RegExp, string, (v: number, m: RegExpExecArray) => Record<string, number>][]}
 */
const EFFECTS = Object.freeze([
  [/^(?:攻击时?)?无视(?:攻击)?(?:目标|敌人)的?\d+点?的?防御力$/u, 'def_penetrate_fixed', (v) => ({ defIgnoreFlat: v })],
  [/^攻击时?无视(?:目标|敌人)\d+(?:\.\d+)?%的防御力$/u, 'def_penetrate', (v) => ({ defIgnorePct: v })],
  [/^(?:攻击时?)?无视(?:攻击)?目标\d+点?法术抗性$/u, 'magic_resist_penetrate_fixed', (v) => ({ resIgnoreFlat: v })],
  [/^(?:自身)?(?:获得|拥有)\d+(?:\.\d+)?%的?物理闪避$/u, 'prob', (v) => ({ dodgePhys: v })],
  [/^(?:自身)?(?:获得|拥有)\d+(?:\.\d+)?%的?法术闪避$/u, 'prob', (v) => ({ dodgeArts: v })],
  [/^(?:自身)?(?:获得|拥有)\d+(?:\.\d+)?%的?物理和法术闪避$/u, 'prob', (v) => ({ dodgePhys: v, dodgeArts: v })],
  [/^攻击距离[+＋]\d+$/u, 'ability_range_forward_extend', (v) => ({ rangeExtend: v })],
  [/^(?:自身)?造成的物理伤害[+＋]\d+(?:\.\d+)?%$/u, 'damage_scale', (v) => ({ physDealtMul: v })],
  [/^(?:自身)?受到的物理伤害[-－]\d+(?:\.\d+)?%$/u, 'damage_resistance', (v) => ({ physTakenMul: left(v) })],
  [/^(?:自身)?获得\d+(?:\.\d+)?%的物理减伤$/u, 'damage_resistance', (v) => ({ physTakenMul: left(v) })],
  [/^(?:自身)?受到的元素损伤[-－]\d+(?:\.\d+)?%$/u, 'damage_resistance', (v) => ({ epTakenMul: left(v) })],
  [/^每秒(?:回复|恢复)\d+(?:\.\d+)?%的?(?:最大)?生命值?$/u, 'hp_recovery_per_sec_by_max_hp_ratio', (v) => ({ hpRegenRatio: v })],
  [/^每秒恢复最大生命值\d+(?:\.\d+)?%的生命$/u, 'hp_recovery_per_sec_by_max_hp_ratio', (v) => ({ hpRegenRatio: v })],
  [/^(?:自身)?受到的(?:所有)?伤害降低\d+(?:\.\d+)?%$/u, 'damage_resistance', (v) => ({ dmgTakenMul: left(v) })],
  [/^(?:自身)?造成的伤害(?:提升|提高|[+＋])\d+(?:\.\d+)?%$/u, 'damage_scale', (v) => ({ dmgDealtMul: v })],
  [/^(?:自身)?获得\d+(?:\.\d+)?%的?伤害抵挡$/u, 'prob', (v) => ({ blockAll: v })],
  [/^(?:自身)?获得\d+(?:\.\d+)?%的?物理抵挡$/u, 'prob', (v) => ({ blockPhys: v })],
  [/^(?:自身)?获得\d+(?:\.\d+)?%的?远程物理抵挡$/u, 'prob', (v) => ({ blockRangedPhys: v })],
  [/^(?:同时)?(?:获得|拥有)\d+(?:\.\d+)?%的?近战物理闪避$/u, 'prob', (v) => ({ dodgeMelee: v })],
  [/^(?:自身)?受到来自【([^】]+)】敌人的伤害降低\d+(?:\.\d+)?%$/u, 'damage_resistance', (v, m) => { const k = fromKey(m[1], false); return k ? { [k]: left(v) } : {}; }],
]);

/**
 * One clause about the operator itself (干员-6, 干员-16), or null: its own attributes (the keys they name, with the %
 * agreeing — the other way round too, 「获得+18%攻击力」), or an effect that is not an attribute (EFFECTS, its key in the
 * blackboard) as modifiers; with the blackboard keys it uses.
 * @param {string} clause @param {Record<string, number>} bb
 * @returns {{ keys: string[], mods: Record<string, number> } | null}
 */
export function selfClause(clause, bb) {
  const s = clause.trim(), m = CLAUSE.exec(s), r = m ? null : CLAUSE_AFTER.exec(s);
  const named = m ? clauseKeys(m[1], m[2], WORDS, ATTR_G) : r ? clauseKeys(r[2], r[1], WORDS, ATTR_G) : null;
  if (named) return { keys: named, mods: {} };
  for (const [re, key, make] of EFFECTS) {
    const hit = re.exec(s), mods = hit && has(bb, key) ? make(bb[key], hit) : null;
    if (hit) return mods && Object.keys(mods).length ? { keys: [key], mods } : null;
  }
  return null;
}

/**
 * The leading clauses of a sentence about the operator itself (干员-6, 干员-16): from the first clause between ，on, each
 * selfClause reads — the attribute keys they name, the effects' modifiers, every key they use, how many clauses.
 * @param {string} sentence @param {Record<string, number>} bb
 * @returns {{ attrs: Set<string>, keys: Set<string>, mods: Record<string, number>, n: number }}
 */
function leadingParts(sentence, bb) {
  const attrs = new Set(), keys = new Set(), mods = /** @type {Record<string, number>} */ ({}), clauses = sentence.split('，');
  let n = 0;
  for (; n < clauses.length; n++) {
    const p = selfClause(clauses[n], bb);
    if (!p) break;
    for (const k of p.keys) keys.add(k);
    if (Object.keys(p.mods).length) Object.assign(mods, p.mods);
    else for (const k of p.keys) attrs.add(k);
  }
  return { attrs, keys, mods, n };
}

/** A later sentence that changes the always-on part (干员-6): 「……后效果翻倍」. */
const DOUBLES = /效果翻倍/u;
/** The one such sentence read (干员-13): 「在战场停留N秒后效果翻倍」, the whole of what follows. */
const DOUBLED_AFTER = /^在战场停留\d+(?:\.\d+)?秒后效果翻倍$/u;

/**
 * The always-on clauses of a talent (干员-6, 干员-16): its description's rich-text tags and bracketed potential
 * differences removed, the leading clauses of the first sentence (up to 。 or ；) about the operator itself — at least
 * one, every key they use in the blackboard. When nothing follows them, every other key must be 0; the rest of their
 * sentence must not speak of an 效果 (it may change theirs; 治疗效果 and 医疗效果 are attributes), nor a later sentence of
 * 「效果翻倍」 — but for 「在战场停留N秒后效果翻倍」 after effects alone, the whole sentence they are: its seconds, the
 * blackboard's `interval`, are `doubledAfter` (a timed talent of its own, 干员-13). Null otherwise; hidden talents have none.
 * @param {Talent} c @returns {{ attrs: Set<string>, mods: Record<string, number>, doubledAfter?: number } | null}
 */
function alwaysParts(c) {
  if (c.hidden || !c.description) return null;
  const text = c.description.replace(/<[^>]*>/g, '').replace(/（[^）]*）/g, '').replace(/[。；]+$/, '');
  const first = text.split(/[。；]/)[0], { attrs, keys, mods, n } = leadingParts(first, c.bb);
  if (!n || ![...keys].every((k) => has(c.bb, k))) return null;
  const lead = first.split('，').slice(0, n).join('，');
  const rest = first.slice(lead.length).replace(/治疗效果|医疗效果/gu, ''), later = text.slice(first.length).replace(/^[。；]/u, '');
  const doubled = !rest && !attrs.size && DOUBLED_AFTER.test(later) && has(c.bb, 'interval');
  if (text.length > lead.length ? !doubled && (rest.includes('效果') || DOUBLES.test(later)) : !Object.entries(c.bb).every(([k, v]) => keys.has(k) || v === 0)) return null;
  return { attrs, mods, ...(doubled ? { doubledAfter: c.bb.interval } : {}) };
}

/**
 * The always-on part of a talent (干员-6): the attribute keys of its always-on clauses (alwaysParts) and their values;
 * null when it has none.
 * @param {Talent} c @returns {Record<string, number> | null}
 */
export function alwaysOn(c) {
  const p = alwaysParts(c);
  return p && p.attrs.size ? Object.fromEntries([...p.attrs].map((k) => [k, c.bb[k]])) : null;
}

/**
 * The always-on effects of a talent that are not attributes (干员-16): the modifiers of its always-on clauses' effects
 * (alwaysParts); null when it has none.
 * @param {Talent} c @returns {Record<string, number> | null}
 */
export function alwaysMods(c) {
  const p = alwaysParts(c);
  return p && Object.keys(p.mods).length ? p.mods : null;
}

/**
 * The always-on blackboard of a training's talents (干员-6): their always-on parts' keys summed, the zeros left out.
 * @param {(Talent | null)[]} talents @returns {Record<string, number>}
 */
export function alwaysOnBb(talents) {
  /** @type {Record<string, number>} */
  const bb = {};
  for (const c of talents) for (const [k, v] of Object.entries((c && alwaysOn(c)) ?? {})) if (v !== 0) bb[k] = (bb[k] ?? 0) + v;
  return bb;
}

/**
 * The always-on effects of a training's talents (干员-16): their modifiers, a product's (…Mul) multiplied and the others
 * summed.
 * @param {(Talent | null)[]} talents @returns {Record<string, number>}
 */
export function alwaysModsOf(talents) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const c of talents) {
    for (const [k, v] of Object.entries((c && alwaysMods(c)) ?? {})) out[k] = k.endsWith('Mul') ? (out[k] ?? 1) * v : (out[k] ?? 0) + v;
  }
  return out;
}

/** A description in parts by the skill brought (干员-6): 「装备技能1时……，装备技能2时……」. */
const BY_SKILL = /^装备技能(\d)时[，,]?/u;

/**
 * The blackboard keys a part of a description uses (干员-6): those its attribute words name, and those of its clauses
 * about the operator itself (selfClause). @param {string} s @param {Record<string, number>} bb
 */
function partKeys(s, bb) {
  const keys = new Set((s.match(ATTR_G) ?? []).map((w) => WORDS[w]));
  for (const clause of s.split(/[，,]/u)) for (const k of selfClause(clause, bb)?.keys ?? []) keys.add(k);
  return keys;
}

/**
 * A talent as it reads for the skill brought (干员-6): when its description is parts each beginning 「装备技能N时」 (split
 * before each, at ，or ；), the part of the skill slot (N − 1) without those words, and the blackboard without the keys
 * the other parts use (partKeys; the part's own kept); as it is otherwise, or when no part is the slot's.
 * @param {Talent} c @param {number} slot the skill's slot, 0-based
 * @returns {Talent}
 */
export function forSkill(c, slot) {
  if (c.hidden || !c.description) return c;
  const parts = c.description.replace(/<[^>]*>/g, '').replace(/（[^）]*）|\([^)]*\)/g, '').replace(/[。；]+$/u, '').split(/[，；](?=装备技能\d时)/u).map((s) => s.trim());
  if (parts.length < 2 || !parts.every((s) => BY_SKILL.test(s))) return c;
  const own = parts.find((s) => Number(BY_SKILL.exec(s)?.[1]) === slot + 1);
  if (!own) return c;
  const text = (/** @type {string} */ s) => s.replace(BY_SKILL, ''), mine = partKeys(text(own), c.bb);
  const others = new Set(parts.filter((s) => s !== own).flatMap((s) => [...partKeys(text(s), c.bb)]));
  return { ...c, description: text(own), bb: Object.fromEntries(Object.entries(c.bb).filter(([k]) => mine.has(k) || !others.has(k))) };
}

/** The professions a team talent names (干员-9), by their Chinese names. */
const PROFESSIONS = Object.freeze(/** @type {Record<string, string>} */ ({
  先锋: 'PIONEER', 近卫: 'WARRIOR', 重装: 'TANK', 狙击: 'SNIPER', 术师: 'CASTER', 医疗: 'MEDIC', 辅助: 'SUPPORT', 特种: 'SPECIAL',
}));
const TEAM_WORDS = Object.freeze(/** @type {Record<string, string>} */ ({ ...WORDS, 初始技力: 'sp' }));
const TEAM_ATTR = Object.keys(TEAM_WORDS).sort((a, b) => b.length - a.length).join('|');
const PROF = Object.keys(PROFESSIONS).join('|');
/** The factions by name (干员-10). */
const POWERS = Object.freeze(Object.fromEntries(Object.entries(/** @type {Record<string, string>} */ (powerTable.powers)).map(([id, name]) => [name, id])));
/** A faction's id by its name (干员-10), null for another name. @param {string} name */
export const powerOf = (name) => (Object.hasOwn(POWERS, name) ? POWERS[name] : null);
/** 编入队伍时 or 在场时, then 所有（友方）【profession or faction】（职业 / 势力的）干员（的）. */
const TEAM_HEAD = new RegExp(`^(编入队伍时|在场时)，?所有(?:友方)?(?:【([^】]+)】|(${PROF}))(?:职业|势力的?)?干员的?`);
/** One team clause: attributes joined by 和 or 、, then (各) a signed number — or 提升 and a number — maybe with %, 秒 or /秒. */
const TEAM_CLAUSE = new RegExp(`^((?:${TEAM_ATTR})(?:[和、](?:${TEAM_ATTR}))*)各?(?:提升[+＋]?|[+＋\\-－])\\d+(?:\\.\\d+)?(%|秒|/秒)?$`);
const TEAM_ATTR_G = new RegExp(TEAM_ATTR, 'g');
/** A team clause of 生命回复: 每秒回复 N 点生命. */
const REGEN = /^每秒回复\d+(?:\.\d+)?点生命$/;
/** The keys an on-field team talent may carry: attributes a buff can hold (技能-5). */
const FIELD_KEYS = Object.freeze(['atk', 'def', 'max_hp', 'attack_speed', 'magic_resistance', 'sp_recovery_per_sec', 'hp_recovery_per_sec']);
/**
 * Every friendly unit on the field (干员-9): 「全场友方单位」, 「在场时 / 上阵时（，）所有友方单位（的）」, 「在场时（，）全地图的友方单位」
 * (上阵时 as 在场时).
 */
const ALL_HEAD = /^(?:全场友方单位|(?:在场|上阵)时[，,]?(?:所有友方单位的?|全地图的友方单位))/u;
/**
 * The team clauses of an on-field effect that is not an attribute (干员-9, 干员-26): the clause, its key, its modifiers —
 * with the clause's match, for one that names a tag; none for a name it does not know.
 * @type {readonly [RegExp, string, (v: number, m: RegExpExecArray) => Record<string, number>][]}
 */
const TEAM_EFFECTS = Object.freeze([
  [/^获得\d+(?:\.\d+)?%的物理闪避$/u, 'prob', (v) => ({ dodgePhys: v })],
  [/^医疗效果提高\d+(?:\.\d+)?%$/u, 'heal_scale', (v) => ({ healingDealtMul: v })],
  [/^获得抵抗$/u, 'one_minus_status_resistance', (v) => ({ statusResFlat: v })],
  [/^每秒回复\d+(?:\.\d+)?%最大生命值$/u, 'hp_recovery_per_sec_by_max_hp_ratio', (v) => ({ hpRegenRatio: v })],
  [/^受到【([^】]+)】敌人的(物理与法术)?伤害降低\d+(?:\.\d+)?%$/u, 'damage_resistance', (v, m) => { const k = fromKey(m[1], !!m[2]); return k ? { [k]: left(v) } : {}; }],
]);

/**
 * The keys the leading team clauses name, the modifiers of those that are effects, and how many clauses those are
 * (干员-9).
 * @param {string[]} clauses @param {Record<string, number>} bb @returns {{ keys: Set<string>, mods: Record<string, number>, n: number }}
 */
function teamKeys(clauses, bb) {
  const keys = new Set(), mods = /** @type {Record<string, number>} */ ({});
  let n = 0;
  for (; n < clauses.length; n++) {
    const cl = clauses[n].trim(), m = TEAM_CLAUSE.exec(cl), named = m ? clauseKeys(m[1], m[2], TEAM_WORDS, TEAM_ATTR_G) : null;
    const e = named ? null : TEAM_EFFECTS.map(([re, key, make]) => { const hit = re.exec(cl); return hit && has(bb, key) ? make(bb[key], hit) : null; }).find((x) => x && Object.keys(x).length);
    if (REGEN.test(cl)) keys.add('hp_recovery_per_sec');
    else if (named) for (const k of named) keys.add(k);
    else if (e) Object.assign(mods, e);
    else break;
  }
  return { keys, mods, n };
}

/**
 * Whom a team talent names (干员-9): a profession, or a faction (干员-10); null for another name.
 * @param {string} name @returns {{ profession: string } | { power: string } | null}
 */
export function whomOf(name) {
  if (Object.hasOwn(PROFESSIONS, name)) return { profession: PROFESSIONS[name] };
  return Object.hasOwn(POWERS, name) ? { power: POWERS[name] } : null;
}

/** A team talent that holds only while its holder's skill runs, or does not (干员-9). */
const SKILL_HEAD = /^(技能未开启时|技能开启时|开启技能时)[，,]?/u;
/** Whom such a talent names: 全场友方单位, or 【names】 joined by 和, then (职业 / 势力的) 干员 (的). */
const SKILL_WHOM = /^(?:全场友方单位|(?:所有)?((?:【[^】]+】和?)+)(?:职业|势力的?)?干员的?)/u;

/**
 * Whom a team talent of its holder's skill names (干员-9): 「技能开启时 / 开启技能时 / 技能未开启时」, then 全场友方单位 or
 * 【profession or faction】s joined by 和; null for another, or a name that is neither.
 * @param {string} first
 * @returns {{ when: 'field', skill: boolean, whom: { profession: string } | { power: string } | { all: true } | { professions: string[] }, rest: string } | null}
 */
function skillHead(first) {
  const s = SKILL_HEAD.exec(first), m = s ? SKILL_WHOM.exec(first.slice(s[0].length)) : null;
  if (!s || !m) return null;
  const rest = first.slice(s[0].length + m[0].length), skill = s[1] !== '技能未开启时';
  if (!m[1]) return { when: 'field', skill, whom: { all: true }, rest };
  const names = [...m[1].matchAll(/【([^】]+)】/gu)].map((x) => x[1]), whoms = names.map(whomOf);
  if (whoms.some((x) => x === null)) return null;
  const profs = /** @type {{ profession: string }[]} */ (whoms.filter((x) => x && 'profession' in x));
  if (whoms.length > 1) return profs.length === whoms.length ? { when: 'field', skill, whom: { professions: profs.map((x) => x.profession) }, rest } : null;
  return { when: 'field', skill, whom: /** @type {{ profession: string } | { power: string }} */ (whoms[0]), rest };
}

/** A team talent once its holder has been on the field a while (干员-9): 「<name>在场且部署后经过N秒时 / 后，使所有【name】干员（的）」. */
const AFTER_HEAD = /^[^，,]{1,8}?在场且部署后经过\d+(?:\.\d+)?秒(?:时|后)[，,]使所有【([^】]+)】干员的?/u;

/**
 * Whom a team talent's first sentence names and the rest of it (干员-9): 「编入队伍时」 (the deck) or 「在场时」 (on the
 * field), then 「所有（友方）【profession or faction】（职业 / 势力的）干员（的）」; or every friendly unit on the field
 * (ALL_HEAD); or one of its holder's skill (skillHead); or one once its holder has been on the field a while (AFTER_HEAD,
 * `after`). Null for another beginning.
 * @param {string} first
 * @returns {{ when: 'deck' | 'field', skill?: boolean, after?: true, whom: { profession: string } | { power: string } | { all: true } | { professions: string[] }, rest: string } | null}
 */
function teamHead(first) {
  const byskill = skillHead(first);
  if (byskill) return byskill;
  const later = AFTER_HEAD.exec(first), whom = later ? whomOf(later[1]) : null;
  if (later && whom) return { when: 'field', after: true, whom, rest: first.slice(later[0].length) };
  const all = ALL_HEAD.exec(first);
  if (all) return { when: 'field', whom: { all: true }, rest: first.slice(all[0].length) };
  const head = TEAM_HEAD.exec(first), named = head ? whomOf(head[2] ?? head[3]) : null;
  return head && named ? { when: head[1] === '在场时' ? 'field' : 'deck', whom: named, rest: first.slice(head[0].length) } : null;
}

/**
 * The leading team clauses of the rest of a team talent's first sentence (干员-9): split at ，— a trailing 「持续至技能结束」
 * left out for one of its holder's skill — and then at 且, one joined by 且 read whole or not at all; null when none is
 * read, a key they use is not in the blackboard, or the rest speaks of an 效果.
 * @param {string} rest @param {boolean} skill @param {Record<string, number>} bb
 */
function teamClauses(rest, skill, bb) {
  const parts = rest.split('，').filter((x) => !(skill && x === '持续至技能结束')).flatMap((x) => x.split('且').map((y, j) => ({ y, joined: j > 0 })));
  const clauses = parts.map((x) => x.y), got = teamKeys(clauses, bb);
  if (!got.n || parts[got.n]?.joined || ![...got.keys].every((k) => Number.isFinite(bb[k])) || clauses.slice(got.n).join('，').includes('效果')) return null;
  return got;
}

/**
 * The team part of a talent (干员-9): its first sentence begins with whom it is for (teamHead), then leading clauses as
 * in 干员-6 (split at ，; one joined by 且 read whole or not at all) — attributes with a signed number (or 提升 and a
 * number), 「每秒回复N点生命」, or an effect (TEAM_EFFECTS: 物理闪避, 医疗效果, 抵抗, 生命回复（百分比）, the damage from enemies
 * of a tag) — every key they use in the blackboard, the rest of the sentence not speaking of an 效果. An on-field one
 * carries only attributes a buff can hold, a deck one no effect; 「同类效果取最高」 in the description makes it `max`; one
 * of its holder's skill holds only while the skill runs (`skill` true) or does not (false), a trailing 「持续至技能结束」
 * aside; one once its holder has been on the field a while holds after the blackboard's `interval` seconds (`after`).
 * Null otherwise; hidden talents have none.
 * @param {Talent} c
 * @returns {({ when: 'deck' | 'field', bb: Record<string, number>, mods?: Record<string, number>, max?: true, skill?: boolean, after?: number }
 *   & ({ profession: string } | { power: string } | { all: true } | { professions: string[] })) | null}
 */
export function teamPart(c) {
  if (c.hidden || !c.description) return null;
  const plain = c.description.replace(/<[^>]*>/g, ''), head = teamHead(plain.replace(/（[^）]*）/g, '').split(/[。；]/)[0]);
  if (!head || (head.after && !has(c.bb, 'interval'))) return null;
  const read = teamClauses(head.rest, head.skill === true, c.bb);
  if (!read) return null;
  const { keys, mods } = read, when = head.when, effects = Object.keys(mods).length > 0;
  if (when === 'field' ? ![...keys].every((k) => FIELD_KEYS.includes(k)) : effects || 'all' in head.whom) return null;
  return {
    when, ...head.whom, bb: Object.fromEntries([...keys].map((k) => [k, c.bb[k]])), ...(effects ? { mods } : {}), ...(/同类效果取最高/u.test(plain) ? { max: /** @type {const} */ (true) } : {}),
    ...(head.skill !== undefined ? { skill: head.skill } : {}), ...(head.after ? { after: c.bb.interval } : {}),
  };
}

/** The attribute words of an in-range talent (干员-11) and the blackboard key each names. */
const RANGE_WORDS = Object.freeze(/** @type {Record<string, string>} */ ({
  攻击力: 'atk', 防御力: 'def', 生命上限: 'max_hp', 最大生命值: 'max_hp', 攻击速度: 'attack_speed', 攻速: 'attack_speed', 法术抗性: 'magic_resistance',
  移动速度: 'move_speed', 技力自然回复速度: 'sp_recovery_per_sec',
}));
const RANGE_ATTR = Object.keys(RANGE_WORDS).sort((a, b) => b.length - a.length).join('|');
const RANGE_ATTR_G = new RegExp(RANGE_ATTR, 'g');
/** 攻击范围内的 enemies, every friendly unit, the friendly operators, or the ranged ones. */
const RANGE_HEAD = /^攻击范围内的?(敌军|敌人|友方单位|友方干员|远程干员)/;
/** The modifier each key becomes (属性-2), written without % and with %; null where that way is not read. */
const RANGE_MODS = Object.freeze(/** @type {Record<string, [string | null, string | null]>} */ ({
  atk: ['atkFlat', 'atkPct'], def: ['defFlat', 'defPct'], max_hp: ['hpFlat', 'hpPct'], magic_resistance: ['resFlat', 'resPct'],
  attack_speed: ['aspd', null], move_speed: [null, 'movePct'], sp_recovery_per_sec: ['spRecoveryFlat', null],
}));

/**
 * The modifiers of the leading in-range clauses (干员-11) — attributes (和/、), then (各) a signed number, or 提升/降低
 * and a number, maybe with % (/秒) — and how many clauses those are.
 * @param {string[]} clauses @param {Record<string, number>} bb @returns {{ mods: Record<string, number>, n: number } | null}
 */
function rangeMods(clauses, bb) {
  const clause = new RegExp(`^((?:${RANGE_ATTR})(?:[和、](?:${RANGE_ATTR}))*)各?(?:提升|降低)?[+＋\\-－]?\\d+(?:\\.\\d+)?(%|/秒)?$`);
  /** @type {Record<string, number>} */
  const mods = {};
  let n = 0;
  for (; n < clauses.length; n++) {
    const m = clause.exec(clauses[n].trim());
    const named = m ? (m[1].match(RANGE_ATTR_G) ?? []).map((w) => RANGE_WORDS[w]).map((k) => [k, RANGE_MODS[k][m[2] === '%' ? 1 : 0]]) : [];
    if (!m || named.some(([k, mod]) => !mod || !Number.isFinite(bb[/** @type {string} */ (k)]))) break;
    for (const [k, mod] of named) mods[/** @type {string} */ (mod)] = bb[/** @type {string} */ (k)];
  }
  return n ? { mods, n } : null;
}

/**
 * The in-range part of a talent (干员-11): its first sentence begins 「攻击范围内（的）」 and whom — 敌军/敌人 (the enemies),
 * 友方单位 or 友方干员 (the operators), 远程干员 (the ranged operators) — then leading clauses whose modifiers it gives
 * them; the rest of the sentence not speaking of an 效果. Null otherwise; hidden talents have none.
 * @param {Talent} c @returns {{ side: 'enemy' | 'ally', ranged: boolean, mods: Record<string, number> } | null}
 */
export function rangePart(c) {
  if (c.hidden || !c.description) return null;
  const first = c.description.replace(/<[^>]*>/g, '').replace(/（[^）]*）/g, '').split(/[。；]/)[0], head = RANGE_HEAD.exec(first);
  if (!head) return null;
  const clauses = first.slice(head[0].length).split('，'), got = rangeMods(clauses, c.bb);
  if (!got || clauses.slice(got.n).join('，').includes('效果')) return null;
  return { side: head[1] === '敌军' || head[1] === '敌人' ? 'enemy' : 'ally', ranged: head[1] === '远程干员', mods: got.mods };
}

/** The chance and what it does to the attack (干员-12): the clause, and what it gives from the blackboard — null without the keys it needs. */
/** @typedef {{ prob: number, scale: number, stun?: number, more?: number, atk?: number, ignoreDef?: number, times?: number, skillProb?: number, front?: { tiles: number, prob: number } }} Crit */
/** @type {readonly [RegExp, (bb: Record<string, number>) => Crit | null][]} */
const CRITS = Object.freeze([
  [/^(?:攻击时|每次攻击|造成(?:物理)?伤害时)[，,]?有?\d+(?:\.\d+)?[%％]的?(?:几率|概率)(?:使)?(?:当次攻击的?)?攻击力提升至\d+(?:\.\d+)?[%％]$/u,
    (bb) => (has(bb, 'prob') && has(bb, 'atk_scale') ? { prob: bb.prob, scale: bb.atk_scale } : null)],
  [/^(?:攻击时|普通攻击和技能释放时)[，,]?有?\d+(?:\.\d+)?%的?(?:几率|概率)当次攻击的?攻击力[+＋]\d+(?:\.\d+)?%$/u, (bb) => {
    const prob = bb.prob ?? bb.prob1;
    return Number.isFinite(prob) && has(bb, 'atk') ? { prob, scale: 1, atk: bb.atk } : null;
  }],
  [/^攻击时有?\d+(?:\.\d+)?%的?(?:几率|概率)无视目标的防御$/u, (bb) => (has(bb, 'prob') ? { prob: bb.prob, scale: 1, ignoreDef: 1 } : null)],
  [/^攻击时有?\d+(?:\.\d+)?%的?(?:几率|概率)(?:造成二连击|连续攻击两次)$/u, (bb) => {
    const prob = bb.prob ?? bb['attack@prob'];
    return Number.isFinite(prob) ? { prob, scale: 1, times: 2 } : null;
  }],
  [/^攻击有\d+(?:\.\d+)?%的?(?:几率|概率)造成相当于攻击力\d+(?:\.\d+)?%的物理伤害$/u, (bb) => (has(bb, 'prob') && has(bb, 'atk_scale') ? { prob: bb.prob, scale: bb.atk_scale } : null)],
]);
/** What may follow it in the same sentence (干员-12). */
const CRIT_STUN = /^并(?:使敌人)?晕眩(?:敌人)?\d+(?:\.\d+)?秒$/u;
const CRIT_MORE = /^且额外攻击一个目标$/u;
/** A later sentence that raises the chance while the skill runs (干员-12): 「技能中这个几率提高到N%」 (`prob2`). */
const CRIT_SKILL = /。技能中这个几率提高到\d+(?:\.\d+)?%/u;
/** Counts a front-tile sentence names (干员-12). 两 and 二 are both two. */
const TILE_N = Object.freeze(/** @type {Record<string, number>} */ ({
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
}));
/** A later sentence that raises the chance on the tiles ahead (干员-12): 「当敌人在正前方N格时，该几率提升到M%」 (`prob2`). */
const FRONT = /。当敌人在正前方([一二两三四五六七八九十]|\d+)格时，该几率提升到\d+(?:\.\d+)?%/u;

/** The chance while the skill runs (干员-12): `prob2` when a later sentence says so. @param {Talent} c */
const skillChance = (c) => (CRIT_SKILL.test((c.description ?? '').replace(/<[^>]*>/g, '').replace(/（[^）]*）/g, '')) && has(c.bb, 'prob2') ? { skillProb: c.bb.prob2 } : {});

/**
 * The chance on the tiles ahead (干员-12). Empty when that sentence or `prob2` is absent, or N is not a count.
 * @param {Talent} c @returns {{ front?: { tiles: number, prob: number } }}
 */
function frontChance(c) {
  const bare = (c.description ?? '').replace(/<[^>]*>/g, '').replace(/（[^）]*）/g, '');
  const m = FRONT.exec(bare);
  const n = m ? (TILE_N[m[1]] ?? Number(m[1])) : 0;
  return m && has(c.bb, 'prob2') && Number.isInteger(n) && n > 0 ? { front: { tiles: n, prob: c.bb.prob2 } } : {};
}

/**
 * The chance part of a talent (干员-12): in its first sentence a clause of CRITS — 「攻击时（，）（有）N%（的）几率/概率（当次
 * 攻击的）攻击力提升至M%」 (or 每次攻击 / 造成伤害时: `prob`, 倍率 `atk_scale`), 「……当次攻击的攻击力+M%」 (`atk` more
 * attack for that attack), 「……无视目标的防御」, 「……造成二连击 / 连续攻击两次」, 「攻击有N%几率造成相当于攻击力M%的物理伤害」 —
 * with the blackboard keys it needs (`prob1` for `prob` too); for the first, the clause after it may add a stun of `stun`
 * seconds (「并使敌人晕眩N秒」) or one more target (「且额外攻击一个目标」); a later 「技能中这个几率提高到N%」 gives the chance
 * while the skill runs (`skillProb`, `prob2`); a later 「当敌人在正前方N格时，该几率提升到M%」 gives that chance on those
 * tiles (`front`, `prob2`). Null otherwise; hidden talents have none.
 * @param {Talent} c @returns {Crit | null}
 */
export function critPart(c) {
  if (c.hidden || !c.description) return null;
  const clauses = c.description.replace(/<[^>]*>/g, '').replace(/（[^）]*）/g, '').split(/[。；]/)[0].split('，').map((x) => x.trim());
  // 「攻击时」 may stand as a clause of its own before the chance
  const joined = clauses.map((x, k) => (/^(?:攻击时|造成(?:物理)?伤害时|普通攻击和技能释放时)$/u.test(x) ? `${x}，${clauses[k + 1] ?? ''}` : x));
  for (const [i, x] of joined.entries()) {
    const form = CRITS.find(([re]) => re.test(x)), got = form ? form[1](c.bb) : null;
    if (!got) continue;
    const next = clauses[x === clauses[i] ? i + 1 : i + 2] ?? '';
    const extra = { ...skillChance(c), ...frontChance(c) };
    return got.atk === undefined && got.ignoreDef === undefined && got.times === undefined
      ? { ...got, ...(CRIT_STUN.test(next) && has(c.bb, 'stun') ? { stun: c.bb.stun } : {}), ...(CRIT_MORE.test(next) ? { more: 1 } : {}), ...extra } : { ...got, ...extra };
  }
  return null;
}

/** The heads of timed talents (干员-13): stacking every N s, once after N s, for N s after deployment. */
const TIMED = Object.freeze(/** @type {[RegExp, 'stack' | 'after' | 'during', string][]} */ ([
  [/^每在场上停留\d+(?:\.\d+)?秒[，,]?/u, 'stack', 'interval'], [/^(?:在战场停留|在场)\d+(?:\.\d+)?秒后[，,]?/u, 'after', 'interval'],
  [/^部署后\d+(?:\.\d+)?秒内/u, 'during', 'duration'],
]));
/** The last clause of a stacking one: 最多（可以）叠加N层/次. */
const STACK_MAX = /^最多(?:可以)?叠加\d+(?:层|次)$/u;

/**
 * The modifiers of one timed clause (干员-13): an in-range clause (干员-11) with 自身 allowed before it, 获得抵抗
 * (`one_minus_status_resistance` as 一减状态抵抗率, 属性-1), or 「（自身）弹药类技能弹药上限+N」 (`add_count` more ammo for an
 * ammo skill as it starts: `ammoFlat`, 技能-4); null for another.
 * @param {string} clause @param {Record<string, number>} bb @returns {Record<string, number> | null}
 */
function timedMods(clause, bb) {
  if (clause === '获得抵抗') return Number.isFinite(bb.one_minus_status_resistance) ? { statusResFlat: bb.one_minus_status_resistance } : null;
  if (/^(?:自身的?)?弹药类技能弹药上限[+＋]\d+$/u.test(clause)) return has(bb, 'add_count') ? { ammoFlat: bb.add_count } : null;
  return rangeMods([clause.replace(/^自身的?/u, '')], bb)?.mods ?? null;
}

/**
 * The timed part of a talent (干员-13): its always-on part doubled after a while (doubledPart); or its first sentence
 * begins 「每在场上停留N秒」 (a step every `interval` s, up to `max_stack_cnt` steps, the sentence ending 「最多叠加N层」),
 * 「在战场停留N秒后」 or 「在场N秒后」 (once, after `interval` s) or 「部署后N秒内」 (for `duration` s from deployment); then
 * clauses (split at ，and 且) that each give modifiers. Null when a clause gives none, or for a hidden talent.
 * @param {Talent} c @returns {{ kind: 'stack' | 'after' | 'during', seconds: number, max: number, mods: Record<string, number> } | null}
 */
export function timedPart(c) {
  if (c.hidden || !c.description) return null;
  const twice = doubledPart(c);
  if (twice) return twice;
  const first = c.description.replace(/<[^>]*>/g, '').replace(/（[^）]*）/g, '').split(/[。；]/)[0];
  const hit = TIMED.find(([re]) => re.test(first));
  if (!hit || !Number.isFinite(c.bb[hit[2]])) return null;
  const clauses = first.replace(hit[0], '').split(/[，,]|且/u).map((x) => x.trim()).filter((x) => x);
  const max = hit[1] === 'stack' && STACK_MAX.test(clauses.at(-1) ?? '') && Number.isFinite(c.bb.max_stack_cnt) ? c.bb.max_stack_cnt : 1;
  if (hit[1] === 'stack' && max === 1) return null;
  const parts = (hit[1] === 'stack' ? clauses.slice(0, -1) : clauses).map((x) => timedMods(x, c.bb));
  if (parts.length === 0 || parts.some((x) => x === null)) return null;
  return { kind: hit[1], seconds: c.bb[hit[2]], max, mods: Object.assign({}, ...parts) };
}

/**
 * An always-on part doubled after a while (干员-13): of a talent whose always-on effects are followed by
 * 「在战场停留N秒后效果翻倍」 (alwaysParts' `doubledAfter`), an 'after' talent of those seconds with what doubles them — for
 * a product (…Mul) m, (2m − 1) / m (a reduction twice as large), for another the same again. Null otherwise.
 * @param {Talent} c @returns {{ kind: 'after', seconds: number, max: number, mods: Record<string, number> } | null}
 */
function doubledPart(c) {
  const p = alwaysParts(c);
  if (!p || p.doubledAfter === undefined) return null;
  return { kind: 'after', seconds: p.doubledAfter, max: 1, mods: Object.fromEntries(Object.entries(p.mods).map(([k, v]) => [k, k.endsWith('Mul') ? (2 * v - 1) / v : v])) };
}

/** The head of a deployment talent (干员-14): 部署后立即 / 立刻. */
const ON_DEPLOY = /^部署后(?:立即|立刻)/u;

/**
 * The effect of a deployment clause (干员-14), or null for another: SP (a fixed `sp`, or between `sp_min` and below
 * `sp_max`), a heal of every operator (`value` HP, or `heal_scale` × its attack), shield layers (`times`, or one).
 * @param {string} clause @param {Record<string, number>} bb
 * @returns {{ sp?: [number, number], heal?: { value: number } | { scale: number }, shield?: number } | null}
 */
function deployEffect(clause, bb) {
  if (/^获得\d+点技力$/u.test(clause) && Number.isFinite(bb.sp)) return { sp: [bb.sp, bb.sp + 1] };
  if (/^随机获得\d+~\d+点技力$/u.test(clause) && Number.isFinite(bb.sp_min) && Number.isFinite(bb.sp_max)) return { sp: [bb.sp_min, bb.sp_max] };
  if (/^恢复全场友方单位\d+点生命$/u.test(clause) && Number.isFinite(bb.value)) return { heal: { value: bb.value } };
  if (/^恢复全体友方单位的生命值$/u.test(clause) && Number.isFinite(bb.heal_scale)) return { heal: { scale: bb.heal_scale } };
  if (/^获得(?:\d+|一)层护盾$/u.test(clause)) return { shield: Number.isFinite(bb.times) ? bb.times : 1 };
  return null;
}

/** What one broken shield layer does (干员-14). @typedef {{ mods?: { atkPct?: number, defPct?: number }, max?: number, sp?: number }} ShieldBreak */
/** 「获得N点技力与(一|M)层护盾」: deploy SP is not the bare `sp` the break spends. */
const SHIELD_AND_SP = /^获得\d+点技力与(\d+|一)层护盾$/u;

/**
 * Deploy SP and a shield in one clause (干员-14). The SP is the single blackboard key ending in `.sp` other than the
 * bare `sp` (空弦 writes deploy SP as `archet_e_t_2.sp` and the break as `sp`). The bare key is the deploy SP only when
 * the break does not spend it; both wanting it drops the clause.
 * @param {string} clause @param {Record<string, number>} bb @param {boolean} breakUsesSp
 * @returns {{ sp: [number, number], shield: number } | null}
 */
function shieldAndSp(clause, bb, breakUsesSp) {
  const m = SHIELD_AND_SP.exec(clause);
  if (!m) return null;
  const keys = Object.keys(bb).filter((k) => k.endsWith('.sp') && k !== 'sp' && Number.isFinite(bb[k]));
  const key = keys[0];
  if (keys.length > 1) return null;
  const sp = keys.length === 1 && key ? bb[key] : (breakUsesSp ? undefined : bb.sp);
  if (!Number.isFinite(sp)) return null;
  const named = m[1] === '一' ? 1 : Number(m[1]);
  return { sp: [/** @type {number} */ (sp), /** @type {number} */ (sp) + 1], shield: Number.isFinite(bb.times) ? bb.times : named };
}

/**
 * The ATK, DEF and SP a 「每层护盾破裂时」 lists (干员-14). Null when a subclause does not match, so a half-read break
 * is not kept. The cap is `max_stack_cnt` when that key is present (推断 INF-0314).
 * @param {string[]} parts @param {Record<string, number>} bb @returns {ShieldBreak | null}
 */
function layerBonus(parts, bb) {
  /** @type {{ atkPct?: number, defPct?: number }} */
  const mods = {};
  let sp;
  for (const p of parts) {
    const m = /^(攻击力|防御力)[+＋]\d+(?:\.\d+)?%$/u.exec(p);
    if (m) {
      const key = m[1] === '攻击力' ? 'atk' : 'def', mod = m[1] === '攻击力' ? 'atkPct' : 'defPct';
      if (!has(bb, key)) return null;
      mods[mod] = bb[key];
      continue;
    }
    if (/^获得\d+点技力$/u.test(p)) {
      if (!Number.isFinite(bb.sp)) return null;
      sp = bb.sp;
      continue;
    }
    return null;
  }
  if (Object.keys(mods).length === 0 && sp === undefined) return null;
  const capped = Object.keys(mods).length > 0 ? { mods, ...(Number.isFinite(bb.max_stack_cnt) ? { max: bb.max_stack_cnt } : {}) } : {};
  return { ...capped, ...(sp === undefined ? {} : { sp }) };
}

/**
 * What a broken layer of this shield does (干员-14), or null when the follow-on is absent or does not match.
 * 「护盾破裂后获得N点技力」 keeps its SP even if a later clause is not read. A subclause under 「每层护盾破裂时」 that
 * does not match drops the whole break.
 * @param {string[]} clauses clauses after 「部署后立即」 @param {Record<string, number>} bb @returns {ShieldBreak | null}
 */
function shieldBreak(clauses, bb) {
  const rest = clauses.slice(1), head = rest[0] ?? '';
  if (/^护盾破裂后获得\d+点技力$/u.test(head)) return Number.isFinite(bb.sp) ? { sp: bb.sp } : null;
  if (head !== '每层护盾破裂时') return null;
  return layerBonus(rest.slice(1).flatMap((x) => x.split('且')).map((x) => x.trim()).filter((x) => x), bb);
}

/**
 * The deployment part of a talent (干员-14): its first sentence begins 「部署后立即」 or 「部署后立刻」 and its first clause
 * is one deployEffect reads, or deploy SP together with a shield. A shield may say what a broken layer does. Null
 * otherwise; hidden talents have none.
 * @param {Talent} c
 * @returns {{ sp?: [number, number], heal?: { value: number } | { scale: number }, shield?: number, break?: ShieldBreak } | null}
 */
export function deployPart(c) {
  if (c.hidden || !c.description) return null;
  const text = c.description.replace(/<[^>]*>/g, '').replace(/（[^）]*）/g, '').split(/[。；]/)[0];
  if (!ON_DEPLOY.test(text)) return null;
  const clauses = text.replace(ON_DEPLOY, '').split('，').map((x) => x.trim()).filter((x) => x);
  const br = shieldBreak(clauses, c.bb);
  const head = deployEffect(clauses[0] ?? '', c.bb) ?? shieldAndSp(clauses[0] ?? '', c.bb, br?.sp !== undefined);
  if (!head) return null;
  return br ? { ...head, break: br } : head;
}


/** A 替身 talent's aura (干员-15): 「<替身>使周围敌人移动速度-N%且每秒造成相当于M%攻击力的法术伤害」. */
const DOLL_AURA = /^<替身>使周围敌人移动速度-\d+(?:\.\d+)?%且每秒造成相当于\d+(?:\.\d+)?%攻击力的法术伤害/u;
/** A 替身 that does not attack (干员-15): 「<替身>不攻击」. */
const DOLL_IDLE = /<替身>不攻击/u;
/** A 替身 whose attacks deal arts damage (干员-15): 「<替身>攻击造成法术伤害」. */
const DOLL_ARTS = /^<替身>攻击造成法术伤害/u;
/** A 替身 that takes less physical and arts damage (干员-15): 「受到的物理与法术伤害减少N%」. */
const DOLL_GUARD = /受到的物理与法术伤害减少\d+(?:\.\d+)?%/u;

/**
 * The 替身 part of a talent (干员-15), read with 「<替身>」 kept and the other rich-text tags and bracketed potential
 * differences removed: an aura (its description begins as DOLL_AURA, the blackboard having `move_speed` and
 * `atk_scale`) — the enemies around it at move speed × (1 + `move_speed`), `atk_scale` × its attack as arts damage each
 * second, and no attack of its own —, or no attack (「<替身>不攻击」 anywhere); or its attacks dealing arts damage
 * (「<替身>攻击造成法术伤害」), with the physical and arts damage it takes × (1 − `damage_resistance`) when it says so
 * (贝娜). Null otherwise; hidden talents have none.
 * @param {Talent} c @returns {{ attack?: false, aura?: { moveMul: number, scale: number } | null, arts?: true, taken?: number } | null}
 */
export function dollPart(c) {
  if (c.hidden || !c.description) return null;
  const text = c.description.replace(/<(?!替身>)[^>]*>/gu, '').replace(/（[^）]*）/gu, '');
  if (DOLL_AURA.test(text) && Number.isFinite(c.bb.move_speed) && Number.isFinite(c.bb.atk_scale)) return { attack: false, aura: { moveMul: 1 + c.bb.move_speed, scale: c.bb.atk_scale } };
  if (DOLL_ARTS.test(text)) return { arts: true, ...(DOLL_GUARD.test(text) && Number.isFinite(c.bb.damage_resistance) ? { taken: 1 - c.bb.damage_resistance } : {}) };
  return DOLL_IDLE.test(text) ? { attack: false, aura: null } : null;
}
