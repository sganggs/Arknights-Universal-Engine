// Sentences 技能-9 does not read (docs/spec/skills.md 技能-14): a counter while the skill runs, a barrier gained as it
// starts, a burst at the start or the end, a self-stun when it ends, a non-medic healing a friendly unit. Bind-on-hit
// is not one of them: no skill's own hits are described that way through `root` / `unmovable`.
import rangeTable from '../data/ranges.json' with { type: 'json' };

/** @typedef {import('./skills.js').SkillLevel} SkillLevel */
/** @typedef {import('@aue/sim').SkillDef} SkillDef */

/** @typedef {NonNullable<SkillDef['extra']>} Extra */

const DMG = Object.freeze(/** @type {Record<string, 'phys' | 'arts' | 'true'>} */ ({ 物理: 'phys', 法术: 'arts', 真实: 'true' }));
const ELEMENT = Object.freeze(/** @type {Record<string, 'SANITY' | 'WATER' | 'FIRE' | 'DARK' | 'ANGER'>} */ ({
  神经: 'SANITY', 侵蚀: 'WATER', 灼燃: 'FIRE', 凋亡: 'DARK', 狂躁: 'ANGER',
}));

/** A counter sentence (技能-14): it starts at the clause, so 「该角色受到攻击时」 does not match. */
const COUNTER = /^(?:每次)?受到(?:敌人的)?攻击时对(周围的地面敌人|周围的敌人|目标)造成(?:相当于)?[\s\S]*?(攻击力|防御力)\{atk_scale\}的(物理|法术|真实)伤害/u;
/** A barrier the description gives someone else, or one that is not a shield gained at the start (技能-14): the whole text is left unread. */
const BARRIER_SKIP = /损伤屏障|转化为屏障|逐渐流失|屏障被摧毁|再次获得屏障|装置|待部署区|使(?:所有)?目标获得|天赋附加|屏障获取效果/u;
const START_BURST = /(?:部署后)?立即对周围所有敌人造成相当于攻击力\{atk_scale\}的(物理|法术|真实)伤害/u;
const END_BURST = /技能结束时对(攻击范围内所有敌人|周围所有敌人)造成相当于攻击力\{atk_scale\}的(物理|法术|真实)伤害/u;

/**
 * Clauses of a description (技能-14): split at ，。； and newlines, but a comma inside （） stays in the clause — 响石's
 * barrier names its seconds and its cap in one parenthesis.
 * @param {string} text @returns {string[]}
 */
function clauses(text) {
  /** @type {string[]} */
  const out = [];
  let cur = '';
  for (const s of text.split(/[，。；\n]/u).map((x) => x.trim()).filter(Boolean)) {
    cur = cur ? `${cur}，${s}` : s;
    if (cur.split('（').length <= cur.split('）').length) { out.push(cur); cur = ''; }
  }
  if (cur) out.push(cur);
  return out;
}

/** The cells of a range id (技能-8's table), or none when the level has no such range. @param {string} id @returns {import('@aue/sim').SkillDef['range']} */
function cellsOf(id) {
  if (!id) return undefined;
  const cells = /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)[id];
  return cells?.map((c) => ({ row: c.row, col: c.col }));
}

/**
 * One counter clause (技能-14). The silence and the 元素损伤 are the same sentence's, not the skill's own attacks.
 * @param {string} s @param {RegExpExecArray} m @param {Record<string, number>} bb
 * @returns {NonNullable<Extra['counter']>}
 */
function counterFields(s, m, bb) {
  const el = /并附带\{ep_damage_ratio\}攻击力的(神经|侵蚀|灼燃|凋亡|狂躁)损伤/u.exec(s);
  const silence = /并使其失去特殊能力\{silence\}秒/u.test(s) && bb.silence > 0 ? bb.silence : 0;
  const cd = /每\{aoe_cd\}秒最多触发一次/u.test(s) && bb.aoe_cd > 0 ? bb.aoe_cd : 0;
  return {
    scale: bb.atk_scale, stat: m[2] === '防御力' ? 'def' : 'atk', type: DMG[m[3]],
    ...(m[1].startsWith('周围') ? { around: true } : {}),
    ...(m[1].includes('地面') ? { ground: true } : {}),
    ...(cd > 0 ? { cooldown: cd } : {}),
    ...(el && bb.ep_damage_ratio > 0 ? { element: ELEMENT[el[1]], epScale: bb.ep_damage_ratio } : {}),
    ...(silence > 0 ? { silence } : {}),
  };
}

/** The counter a description gives the skill while it runs (技能-14), or null. @param {string} text @param {Record<string, number>} bb */
function counterOf(text, bb) {
  if (!(bb.atk_scale > 0)) return null;
  for (const s of clauses(text)) {
    const m = COUNTER.exec(s);
    if (m) return counterFields(s, m, bb);
  }
  return null;
}

/** The barrier clause plus the next one when it only carries the barrier's time (技能-14: 「该屏障……」「持续……」). @param {string} text */
function barrierBlob(text) {
  const list = clauses(text);
  for (let i = 0; i < list.length; i++) {
    if (!list[i].includes('获得') || !list[i].includes('屏障')) continue;
    const next = list[i + 1] ?? '';
    return /^(?:该屏障|持续)/u.test(next) ? `${list[i]}，${next}` : list[i];
  }
  return '';
}

/** The ratio and, when the sentence caps it, that cap (技能-14). @param {string} sentence @param {Record<string, number>} bb */
function ratios(sentence, bb) {
  const capM = /最多不超过[^，。]*\{([^}]+)\}/u.exec(sentence);
  const capKey = capM && Number.isFinite(bb[capM[1]]) ? capM[1] : '';
  const keys = ['shield_hp_ratio', 'hp_ratio', 'shield_max_hp_ratio'].filter((k) => k !== capKey && sentence.includes(`{${k}}`) && bb[k] > 0);
  if (!keys.length) return null;
  return { ratio: bb[keys[0]], ...(capKey ? { cap: bb[capKey] } : {}) };
}

/**
 * How long the barrier lasts (技能-14): a `{key}秒` in the clause, else `shield_max_duration`, else the skill's own
 * seconds. `tied` is removed when the skill ends.
 * @param {string} blob @param {Record<string, number>} bb @param {number} skillDur
 */
function secondsOf(blob, bb, skillDur) {
  const named = [...blob.matchAll(/\{([^}]+)\}秒/gu)].map((m) => m[1]).find((k) => bb[k] > 0);
  if (named) return { seconds: bb[named], tied: false };
  if (/持续至技能结束/u.test(blob)) return { seconds: skillDur > 0 ? skillDur : 0, tied: true };
  if (bb.shield_max_duration > 0) return { seconds: bb.shield_max_duration, tied: false };
  if (skillDur > 0) return { seconds: skillDur, tied: true };
  return { seconds: 0, tied: false };
}

/** The barrier gained as the skill starts (技能-14), or null. @param {string} text @param {Record<string, number>} bb @param {number} skillDur */
function barrierOf(text, bb, skillDur) {
  if (BARRIER_SKIP.test(text)) return null;
  const blob = barrierBlob(text);
  const ratio = blob ? ratios(blob, bb) : null;
  if (!blob || !ratio) return null;
  const time = secondsOf(blob, bb, skillDur);
  return {
    ratio: ratio.ratio, seconds: time.seconds,
    ...(ratio.cap !== undefined ? { cap: ratio.cap } : {}),
    ...(/物理伤害的屏障/u.test(blob) ? { type: /** @type {const} */ ('phys') } : {}),
    ...(/衰减/u.test(blob) ? { decay: true } : {}),
    ...(time.tied ? { tied: true } : {}),
  };
}

/** Where a burst lands (技能-14): the level's range when the words are 周围 and the level has one, else the attack range. @param {string} words @param {string} rangeId */
function whereOf(words, rangeId) {
  if (words.startsWith('攻击范围')) return { where: /** @type {const} */ ('attack') };
  const range = cellsOf(rangeId);
  return range ? { where: /** @type {const} */ ('cells'), range } : { where: /** @type {const} */ ('attack') };
}

/** Start and end bursts (技能-14). The plain `atk_scale` is their scale. @param {string} text @param {Record<string, number>} bb @param {string} rangeId */
function burstsOf(text, bb, rangeId) {
  if (!(bb.atk_scale > 0)) return [];
  /** @type {NonNullable<Extra['bursts']>} */
  const out = [];
  const start = START_BURST.exec(text), end = END_BURST.exec(text);
  if (start) out.push({ at: 'start', scale: bb.atk_scale, type: DMG[start[1]], ...whereOf('周围所有敌人', rangeId) });
  if (end) out.push({ at: 'end', scale: bb.atk_scale, type: DMG[end[2]], ...whereOf(end[1], rangeId) });
  return out;
}

/** Self-stun when the skill ends (技能-14), or null. The stunned one is the operator, and the seconds are plain `stun`. @param {string} text @param {Record<string, number>} bb */
function stunOf(text, bb) {
  if (!(bb.stun > 0)) return null;
  for (const s of clauses(text)) {
    if (/^(?:持续时间|技能)结束后/u.test(s) && /晕眩\{stun\}秒/u.test(s) && !/敌人|摄影车|召唤物|装置/u.test(s)) return { seconds: bb.stun };
  }
  return null;
}

/**
 * 「攻击」 as an action (技能-14). 「攻击力」 is the stat, 「攻击范围」「攻击距离」 name a range: 塞雷娅 heals as the skill
 * starts, and 清流's 「立即恢复攻击范围内」 stays a start heal so the skill stays instant (技能-1).
 * @param {string} s
 */
const mentionsAttack = (s) => /攻击/u.test(s.replaceAll('攻击力', '').replaceAll('攻击范围', '').replaceAll('攻击距离', ''));

/** Whether the heal rides on an attack (技能-14): this clause, or the text back to the previous full stop. @param {string} text @param {string} sentence */
function healOn(text, sentence) {
  if (mentionsAttack(sentence)) return /** @type {const} */ ('attack');
  const at = text.indexOf(sentence);
  const prev = Math.max(text.lastIndexOf('。', at), text.lastIndexOf('；', at), text.lastIndexOf('\n', at));
  return mentionsAttack(text.slice(prev + 1, at)) ? /** @type {const} */ ('attack') : /** @type {const} */ ('start');
}

/** A HP gate the sentence writes (技能-14): 不足一半, or 不足 N%. 0 when it writes none. @param {string} s */
function belowOf(s) {
  if (/血量不足一半/u.test(s)) return 0.5;
  const m = /血量不足(\d+)%/u.exec(s);
  return m ? Number(m[1]) / 100 : 0;
}

/** One heal clause (技能-14), or null when this clause is not one. @param {string} text @param {string} s @param {Record<string, number>} bb @param {string} rangeId */
function healClause(text, s, bb, rangeId) {
  if (!/(?:恢复|治疗)/u.test(s) || !/(?:友方|友军)/u.test(s) || !/生命/u.test(s)) return null;
  if (/每秒|每\{|烹饪|伤害量|治疗量|改为|八格|子弹|金币|激素/u.test(s)) return null;
  const key = s.includes('{heal_scale}') && bb.heal_scale > 0 ? 'heal_scale' : s.includes('{attack@heal_scale}') && bb['attack@heal_scale'] > 0 ? 'attack@heal_scale' : '';
  if (!key) return null;
  const below = belowOf(s), range = /附近|周围|范围内/u.test(s) ? cellsOf(rangeId) : undefined;
  return {
    scale: bb[key], on: healOn(text, s),
    ...(/所有友(?:方|军)/u.test(s) ? { all: true } : {}),
    ...(/其他友(?:方|军)/u.test(s) ? { others: true } : {}),
    ...(below > 0 ? { below } : {}),
    ...(range ? { range } : {}),
  };
}

/** The ally heal (技能-14), or null. @param {string} text @param {Record<string, number>} bb @param {string} rangeId */
function healOf(text, bb, rangeId) {
  for (const s of clauses(text)) {
    const h = healClause(text, s, bb, rangeId);
    if (h) return h;
  }
  return null;
}

/**
 * What 技能-14 adds. Empty when the description has none of it. `hitScale` marks a plain `atk_scale` that is the
 * counter's or a burst's, so it is not the attack's scale (技能-5).
 * @param {SkillLevel} level @param {Record<string, number>} bb @param {string} said the description, tags and closing-skill segments already gone
 * @returns {Partial<Extra>}
 */
export function textExtra(level, bb, said) {
  const rangeId = level.rangeId || '';
  const counter = counterOf(said, bb);
  const barrier = barrierOf(said, bb, level.duration);
  const bursts = burstsOf(said, bb, rangeId);
  const selfStun = stunOf(said, bb);
  const allyHeal = healOf(said, bb, rangeId);
  const hitScale = (counter || bursts.length > 0) && Number.isFinite(bb.atk_scale);
  return {
    ...(counter ? { counter } : {}), ...(barrier ? { barrier } : {}), ...(bursts.length > 0 ? { bursts } : {}),
    ...(selfStun ? { selfStun } : {}), ...(allyHeal ? { allyHeal } : {}),
    ...(hitScale ? { hitScale: /** @type {const} */ ('attack') } : {}),
  };
}
