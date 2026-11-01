// Sentences neither 技能-9 nor 技能-14 reads (docs/spec/skills.md 技能-15): the operator stops attacking while the skill
// runs — or for the seconds a sentence followed by 「之后」 gives, or for some seconds after it ends —, cost it gains bit by
// bit, HP it loses as it starts, and statuses, after a hit for some, on enemies as it starts. Each is one sentence shape;
// the blackboard only gives its numbers.
import { clauses } from './skilltext.js';

/** @typedef {import('./skills.js').SkillLevel} SkillLevel */
/** @typedef {NonNullable<import('@aue/sim').SkillDef['extra']>} Extra */
/** @typedef {NonNullable<Extra['opening']>[number]} Opening */
/** @typedef {Opening['status'][number]['key']} StatusKey */

const DMG = Object.freeze(/** @type {Record<string, 'phys' | 'arts' | 'true'>} */ ({ 物理: 'phys', 法术: 'arts', 真实: 'true' }));
/** The status words these sentences use (状态-5). */
const STATUS = Object.freeze(/** @type {Record<string, StatusKey>} */ ({ 晕眩: 'stun', 停顿: 'sluggish', 沉睡: 'sleep', 恐惧: 'fear' }));

/** 「停止攻击」 as a whole clause: 「停止攻击并专心对周围友方角色进行治疗」 or 「3秒内停止攻击」 is not it. */
const STOP = /^停止攻击(?:敌人)?$/u;
/** 小满's: the stop and a status on n enemies for some seconds; the next clause says what comes 「之后」. */
const STOP_FEW = /^停止攻击敌人并使攻击范围内\{([^}]+)\}个敌方单位(晕眩|停顿|沉睡|恐惧)\{([^}]+)\}秒$/u;
/** 远山's: no attacks for some seconds once the skill has ended; the operator's name may stand before 停止. */
const STOP_AFTER = /^技能(?:时间)?结束后[^{}]{0,6}停止攻击\{([^}]+)\}秒$/u;
/** Cost gained bit by bit while the skill runs; the placeholder is the total. */
const GAIN = /^(?:(?:技能)?持续时间内(?:逐渐获得|(?:逐渐)?回复总共)|逐渐回复总共)\{([^}]+)\}点部署费用$/u;
/** HP lost as the skill starts: a share of the HP it has, or of its maximum. */
const LOSS = /^(?:部署后)?立即流失\{([^}]+)\}(当前生命|最大生命)/u;
/** 八幡海铃's: a status on every enemy in the attack range, for the seconds written (a number or a placeholder). */
const IN_RANGE = /^立即使攻击范围内的敌人(晕眩|停顿|沉睡|恐惧)(\d+(?:\.\d+)?|\{[^}]+\})秒$/u;
/** 但书's: a hit on every unit in the attack range, then statuses for the seconds of the next clause 「持续{键}秒」. */
const HIT_IN_RANGE = /^对攻击范围内所有单位造成一次相当于攻击力\{atk_scale\}的(物理|法术|真实)伤害使其(晕眩|停顿|沉睡|恐惧)(并失去特殊能力)?$/u;
/** 闪击's: a hit on every unit the operator blocks, then a status for some seconds. */
const HIT_BLOCKED = /^对所有阻挡单位造成一次相当于攻击力\{atk_scale\}的(物理|法术|真实)伤害并(晕眩|停顿|沉睡|恐惧)\{([^}]+)\}秒$/u;

/** A blackboard value above 0, else 0. @param {Record<string, number>} bb @param {string} k */
const pos = (bb, k) => (bb[k] > 0 ? bb[k] : 0);

/**
 * 小满's sentence (技能-15): the stop and the status last the same seconds, then 「之后……」 — without that next clause it
 * is not read.
 * @param {string[]} list the clauses @param {Record<string, number>} bb @returns {{ seconds: number, opening: Opening } | null}
 */
function fewOf(list, bb) {
  for (let i = 0; i < list.length; i++) {
    const m = STOP_FEW.exec(list[i]);
    if (!m || !/^之后/u.test(list[i + 1] ?? '')) continue;
    const most = pos(bb, m[1]), seconds = pos(bb, m[3]);
    if (most && seconds) return { seconds, opening: { where: 'attack', most, status: [{ key: STATUS[m[2]], seconds }] } };
  }
  return null;
}

/** The seconds without attacks once the skill ends (技能-15), or null. @param {string[]} list @param {Record<string, number>} bb */
function afterOf(list, bb) {
  for (const s of list) {
    const m = STOP_AFTER.exec(s), seconds = m ? pos(bb, m[1]) : 0;
    if (seconds) return { seconds };
  }
  return null;
}

/**
 * The step of a cost gained bit by bit (技能-15): the blackboard's `interval` and `cost`, else those of its one group
 * `<名>[cost]` (万顷 S2's `wanqin_s_2[cost]`); null with neither.
 * @param {Record<string, number>} bb @returns {{ every: number, cost: number, plain: boolean } | null}
 */
function stepOf(bb) {
  if (pos(bb, 'interval') && pos(bb, 'cost')) return { every: bb.interval, cost: bb.cost, plain: true };
  const groups = Object.keys(bb).filter((k) => k.endsWith('[cost].interval')).map((k) => k.slice(0, -'.interval'.length));
  const every = groups.length === 1 ? pos(bb, `${groups[0]}.interval`) : 0, cost = every ? pos(bb, `${groups[0]}.cost`) : 0;
  return every && cost ? { every, cost, plain: false } : null;
}

/** The cost a running skill gains bit by bit (技能-15), or null when its keys are not all there. @param {string[]} list @param {Record<string, number>} bb */
function gainOf(list, bb) {
  for (const s of list) {
    const m = GAIN.exec(s);
    if (!m) continue;
    const total = pos(bb, m[1]), step = total ? stepOf(bb) : null;
    return step ? { every: step.every, cost: step.cost, steps: Math.floor(total / step.cost), ...(step.plain ? { plain: true } : {}) } : null;
  }
  return null;
}

/** The HP lost as the skill starts (技能-15), or null; a share above 1 is not read. @param {string[]} list @param {Record<string, number>} bb */
function lossOf(list, bb) {
  for (const s of list) {
    const m = LOSS.exec(s), ratio = m ? pos(bb, m[1]) : 0;
    if (m && ratio && ratio <= 1) return { ratio, ...(m[2] === '最大生命' ? { ofMax: true } : {}) };
  }
  return null;
}

/** Seconds a sentence writes: a number, or a placeholder of the blackboard (0 without it). @param {string} s @param {Record<string, number>} bb */
const secondsIn = (s, bb) => (s.startsWith('{') ? pos(bb, s.slice(1, -1)) : Number(s));

/**
 * One clause as an effect on enemies as the skill starts (技能-15): 八幡海铃's, 但书's (its seconds in the next clause) or
 * 闪击's; null for any other.
 * @param {string} s @param {string} next @param {Record<string, number>} bb @returns {Opening | null}
 */
function openingOf(s, next, bb) {
  let m;
  if ((m = IN_RANGE.exec(s))) {
    const seconds = secondsIn(m[2], bb);
    return seconds > 0 ? { where: 'attack', status: [{ key: STATUS[m[1]], seconds }] } : null;
  }
  const scale = pos(bb, 'atk_scale');
  if ((m = HIT_IN_RANGE.exec(s))) {
    const t = /^持续\{([^}]+)\}秒$/u.exec(next), seconds = t ? pos(bb, t[1]) : 0;
    if (!scale || !seconds) return null;
    return { where: 'attack', hit: { scale, type: DMG[m[1]] }, status: [{ key: STATUS[m[2]], seconds }, ...(m[3] ? [{ key: /** @type {StatusKey} */ ('silence'), seconds }] : [])] };
  }
  if ((m = HIT_BLOCKED.exec(s))) {
    const seconds = pos(bb, m[3]);
    return scale && seconds ? { where: 'blocked', hit: { scale, type: DMG[m[1]] }, status: [{ key: STATUS[m[2]], seconds }] } : null;
  }
  return null;
}

/**
 * The hold on attacks (技能-15): the whole run for a whole clause 「停止攻击」 in a skill that runs, else 小满's seconds.
 * @param {string[]} list @param {boolean} runs @param {{ seconds: number } | null} few @returns {{ seconds?: number } | null}
 */
function stopOf(list, runs, few) {
  if (runs && list.some((s) => STOP.test(s))) return {};
  return few ? { seconds: few.seconds } : null;
}

/** Every effect on enemies as the skill starts (技能-15), in the order of the text. @param {string[]} list @param {Record<string, number>} bb @param {Opening | null} first */
function openingsOf(list, bb, first) {
  /** @type {Opening[]} */
  const out = first ? [first] : [];
  list.forEach((s, i) => {
    const o = openingOf(s, list[i + 1] ?? '', bb);
    if (o) out.push(o);
  });
  return out;
}

/**
 * What 技能-15 adds; empty when the description has none of it. `hitScale` marks a plain `atk_scale` that an opening
 * hit uses, so it is not the attack's (技能-5).
 * @param {SkillLevel} level @param {Record<string, number>} bb @param {string} said the description, tags and closing-skill segments already gone
 * @returns {Partial<Extra>}
 */
export function textExtra2(level, bb, said) {
  const list = clauses(said), runs = level.skillType !== 'PASSIVE' && level.durationType !== 'AMMO' && level.duration > 0;
  const few = fewOf(list, bb), costGain = runs ? gainOf(list, bb) : null, stopAfter = afterOf(list, bb), selfLoss = lossOf(list, bb);
  const stopAttack = stopOf(list, runs, few), opening = openingsOf(list, bb, few?.opening ?? null);
  return {
    ...(stopAttack ? { stopAttack } : {}), ...(stopAfter ? { stopAfter } : {}), ...(costGain ? { costGain } : {}), ...(selfLoss ? { selfLoss } : {}),
    ...(opening.length > 0 ? { opening } : {}), ...(opening.some((o) => o.hit) ? { hitScale: /** @type {const} */ ('attack') } : {}),
  };
}
