// Skills of the official content (docs/spec/skills.md 技能-1, 技能-6): one skill_table level as the engine's skill, and
// the behaviours of common skills the generic one does not cover, written against the native interface (ADR 0055) —
// they act only through the context, never on the units directly.
import { FPS, secondsToFrames } from '@aue/math';
import { skills } from '@aue/sim';
import rangeTable from '../data/ranges.json' with { type: 'json' };

/** @typedef {import('@aue/sim').SkillDef} SkillDef @typedef {import('@aue/sim').SkillBehavior} SkillBehavior */

/** skill_table's spType → how the skill recovers SP (技能-2). */
const SP_TYPES = Object.freeze({ INCREASE_WITH_TIME: 'time', INCREASE_WHEN_ATTACK: 'attack', INCREASE_WHEN_TAKEN_DAMAGE: 'hurt' });

/**
 * @typedef {object} SkillLevel one entry of skill_table[id].levels
 * @property {string} skillType AUTO, MANUAL or PASSIVE
 * @property {string} durationType NONE or AMMO
 * @property {number} duration
 * @property {{ spType: string | number, spCost: number, initSp: number, maxChargeTime: number }} spData
 * @property {{ key: string, value: number }[]} blackboard
 * @property {string} [description]
 * @property {string | null} [rangeId] the range of the skill's level (技能-8)
 * @property {boolean} [stoppable] whether the player may close it, when the data says so already (技能-7)
 */

/** The description of a skill the player may close (技能-7): 「可随时停止技能」「可随时主动关闭」「手动停止」…. */
const CLOSABLE = /(随时|主动|手动)[^，。；\n<]*(停止|关闭)/u;

/**
 * A skill_table level as the engine's skill (技能-1).
 * @param {string} id @param {SkillLevel} level @returns {SkillDef}
 */
export function skillDefOf(id, level) {
  const type = level.skillType;
  if (type !== 'AUTO' && type !== 'MANUAL' && type !== 'PASSIVE') throw new RangeError(`skill ${id}: unknown skillType ${type}`);
  const sp = /** @type {Record<string, 'time' | 'attack' | 'hurt'>} */ (SP_TYPES)[String(level.spData.spType)] ?? 'none';
  const bb = Object.fromEntries(level.blackboard.map((b) => [b.key, b.value])), allies = alliesOf(level, bb);
  return {
    id, type, sp, cost: level.spData.spCost, init: level.spData.initSp, charges: Math.max(1, level.spData.maxChargeTime),
    duration: level.duration, ammo: level.durationType === 'AMMO', bb,
    stoppable: level.stoppable ?? CLOSABLE.test(level.description ?? ''), ...rangeOf(level), ...extraOf(level, ownMods(level, bb, allies.keys)),
    ...foreverOf(level), ...spendOf(level, bb), ...(allies.def ? { allies: allies.def } : {}), ...alchemyOf(level, bb),
    ...dollSwitchOf(level),
  };
}

/** A description that keeps the `<替身>` token and drops every other tag (职业-15). The data may write line breaks as \n. @param {SkillLevel} level */
const dollText = (level) => (level.description ?? '').replace(/<(?!\/?替身>)[^>]*>/g, '').replace(/\\n/g, '\n');

/** A sentence that switches to the 替身 as the skill starts (职业-15). 「切换为<替身>作战时」 is an effect of a switch, not this. */
const DOLL_START = /(?:立即|并)切换为<替身>/u;
/** A sentence that switches as the skill ends (职业-15): knocked out as it ends, or the text already says it switches then. */
const DOLL_END = /技能结束后视为被击倒|技能结束后(?:立刻|立即)切换为<替身>/u;

/**
 * When a skill switches a 傀儡师 to its 替身 (职业-15): at its start for 「立即切换为<替身>」 or 「并切换为<替身>」, at its
 * end for 「技能结束后视为被击倒」 or 「技能结束后立刻切换为<替身>」. A sentence about what happens once the switch has
 * started (「切换为<替身>作战时」), or about summoning a 替身, is not this.
 * @param {SkillLevel} level @returns {{ doll?: 'start' | 'end' }}
 */
function dollSwitchOf(level) {
  const parts = dollText(level).split(/[，。；\n]/u);
  // End first: 「技能结束后立即切换为<替身>」 also contains 「立即切换为<替身>」, and 结束后 is the moment.
  if (parts.some((s) => DOLL_END.test(s))) return { doll: 'end' };
  if (parts.some((s) => DOLL_START.test(s))) return { doll: 'start' };
  return {};
}

/**
 * The 炼金单元 a skill throws (技能-13), when its description says 「投掷一个炼金单元，在{projectile_delay_time}秒内使落点…」:
 * at a friendly unit for 「向友方单位投掷」; `projectile_range` its radius (0 with 「落点和周围8格」: those tiles); the ground
 * enemies' arts damage a second (`atk_scale`), 虚弱 (`atk`), slow (`move_speed`) and less healing (`heal_scale`); the
 * heavy ones' (「重量大于等于{value}的敌人」) slow and more damage (`heavy_atk_scale`); the friendly units' regeneration
 * (`hp_recovery_per_sec_ratio`, or `…_chr`) and defence (「防御力+{def}」, 直接加算); a drift (「缓慢沿投掷方向移动且影响范围持续扩大」:
 * `projectile_move_speed`, `remaining_time`, the radius × `value` a second). A skill that throws several (「向…名干员投掷炼金单元」) is
 * not read.
 * @param {SkillLevel} level @param {Record<string, number>} bb @returns {{ alchemy?: NonNullable<SkillDef['alchemy']> }}
 */
function alchemyOf(level, bb) {
  const text = plainOf(level);
  if (!/投掷一个炼金单元/u.test(text) || !Number.isFinite(bb.projectile_delay_time)) return {};
  const radius = bb.projectile_range ?? 1;
  return { alchemy: {
    at: /向友方单位投掷/u.test(text) ? 'ally' : 'enemy', seconds: bb.projectile_delay_time, radius, ...(radius === 0 && /周围8格/u.test(text) ? { square: true } : {}),
    ...(bb.interval > 0 ? { interval: bb.interval } : {}), ...alchemyFoes(text, bb), ...alchemyAllies(text, bb),
    ...(/缓慢沿投掷方向移动/u.test(text) && bb.projectile_move_speed > 0
      ? { drift: { speed: bb.projectile_move_speed, seconds: bb.remaining_time ?? bb.projectile_delay_time, grow: radius * (bb.value ?? 0) } } : {}),
  } };
}

/**
 * What a 炼金单元 does to the ground enemies in it (技能-13): arts damage a second (`atk_scale`), 虚弱 (`atk`, 最终乘算),
 * slow (`move_speed`, the heavy ones' only when it is written after 「重量大于等于{value}（或 3）的敌人」), less healing taken
 * (`heal_scale`); the heavy ones' more damage (`heavy_atk_scale`).
 * @param {string} text @param {Record<string, number>} bb @returns {Partial<NonNullable<SkillDef['alchemy']>>}
 */
function alchemyFoes(text, bb) {
  const heavyAt = /重量大于等于(?:\{value\}|\d+)的敌人/u.test(text) ? text.indexOf('重量大于等于') : -1;
  const slow = Number.isFinite(bb.move_speed) ? { movePct: bb.move_speed } : null, slowHeavy = !!slow && heavyAt >= 0 && text.indexOf('{move_speed}') > heavyAt;
  const foeMods = { ...(bb.atk < 0 ? { atkMul: 1 + bb.atk } : {}), ...(slowHeavy ? {} : slow), ...(bb.heal_scale > 0 ? { healingTakenMul: 1 - bb.heal_scale } : {}) };
  const heavy = heavyAt < 0 ? null : { weight: bb.value, ...(bb.heavy_atk_scale > 0 ? { scale: bb.heavy_atk_scale } : {}), ...(slowHeavy ? { mods: slow } : {}) };
  return { ...(bb.atk_scale > 0 ? { scale: bb.atk_scale } : {}), ...(Object.keys(foeMods).length ? { foeMods } : {}), ...(heavy ? { heavy } : {}) };
}

/**
 * What a 炼金单元 does for the friendly units in it (技能-13): regeneration (`hp_recovery_per_sec_ratio`, or `…_chr`) and
 * 「防御力+{def}」 (直接加算).
 * @param {string} text @param {Record<string, number>} bb @returns {Partial<NonNullable<SkillDef['alchemy']>>}
 */
function alchemyAllies(text, bb) {
  const regen = bb.hp_recovery_per_sec_ratio ?? bb.hp_recovery_per_sec_ratio_chr;
  return { ...(regen > 0 ? { regen } : {}), ...(/防御力\+\{def\}/u.test(text) && bb.def > 0 ? { allyMods: { defFlat: bb.def } } : {}) };
}

/** A description without its rich-text tags, its line breaks as such (the data may write them as \n). @param {SkillLevel} level */
const textOf = (level) => (level.description ?? '').replace(/<[^>]*>/g, '').replace(/\\n/g, '\n');
/** A description without its rich-text tags, its placeholders as {key}. @param {SkillLevel} level */
const plainOf = (level) => textOf(level).replace(/\{([^}:]*)(?::[^}]*)?\}/g, '{$1}');

/** A description that says the skill has no end of its own (技能-4). */
const FOREVER = /持续时间无限/u;

/**
 * Whether a skill runs until it is closed or its operator leaves the field (技能-4): an active one without a duration or
 * ammo whose description says 「持续时间无限」.
 * @param {SkillLevel} level @returns {{ forever?: true }}
 */
function foreverOf(level) {
  const timeless = level.skillType !== 'PASSIVE' && !(level.duration > 0) && level.durationType !== 'AMMO';
  return timeless && FOREVER.test(level.description ?? '') ? { forever: true } : {};
}

/** The first sentence of a skill that costs its owner deployment cost to start (技能-10): 「消耗{cost}点部署费用…」. */
const SPEND = /^消耗(?:\{cost\}|(\d+))点部署费用/u;

/**
 * The cost a skill's owner pays to start it (技能-10), when the first sentence of its description says so: the
 * blackboard's `cost`, else the number written.
 * @param {SkillLevel} level @param {Record<string, number>} bb @returns {{ spend?: number }}
 */
function spendOf(level, bb) {
  const m = SPEND.exec(plainOf(level).split(/[，。；\n]/)[0].trim());
  const n = m ? (Number.isFinite(bb.cost) ? bb.cost : Number(m[1])) : 0;
  return n > 0 ? { spend: n } : {};
}

/** The attribute of a 鼓舞, by the words after its ratio (技能-11). @type {[RegExp, 'atk' | 'def' | 'maxHp'][]} */
const INSPIRED = [[/攻击力/u, 'atk'], [/防御力/u, 'def'], [/生命值上限|最大生命值/u, 'maxHp']];
/** The blackboard key of each attribute a 鼓舞 raises (技能-11). @type {Record<string, string>} */
const BB_KEY = { atk: 'atk', def: 'def', maxHp: 'max_hp' };
/** The units a skill's ally effects are for (技能-11): every (other) friendly unit in its range. */
const ALLIES = /范围内所有(其他|其它)?友方单位/u;

/**
 * The 鼓舞 a description gives (技能-11): in 「…范围内所有（其他）友方单位…获得相当于<name>{key}攻击力（与防御力）的鼓舞效果」,
 * each placeholder's value for the attributes written after it, up to the next one.
 * @param {string} text @param {Record<string, number>} bb
 * @returns {{ inspire: Partial<Record<'atk' | 'def' | 'maxHp', number>>, others: boolean, keys: string[] } | null}
 */
function inspireOf(text, bb) {
  const at = text.indexOf('鼓舞'), from = at < 0 ? -1 : text.lastIndexOf('相当于', at);
  if (from < 0) return null;
  const who = ALLIES.exec(text.slice(Math.max(text.lastIndexOf('。', from), text.lastIndexOf('；', from)) + 1, from));
  if (!who) return null;
  /** @type {Partial<Record<'atk' | 'def' | 'maxHp', number>>} */
  const inspire = {}, keys = [];
  for (const [, key, words] of text.slice(from, at).matchAll(/\{([^}]+)\}([^{]*)/g)) {
    if (!Number.isFinite(bb[key])) continue;
    for (const [re, attr] of INSPIRED) if (re.test(words)) inspire[attr] = bb[key];
    keys.push(key);
  }
  // the blackboard key of an attribute it raises is the ratio too, written or not (浊心斯卡蒂 S2's def under {atk}攻击力与防御力)
  for (const attr of Object.keys(inspire)) if (Number.isFinite(bb[BB_KEY[attr]])) keys.push(BB_KEY[attr]);
  return Object.keys(inspire).length ? { inspire, others: !!who[1], keys: [...new Set(keys)] } : null;
}

/**
 * What a skill gives the friendly units in its attack range while it runs (技能-11): its 鼓舞, and the block count of
 * 「…范围内所有友方单位阻挡数-3」 (the blackboard's `block_cnt`); the blackboard keys they use, which are not the
 * operator's own.
 * @param {SkillLevel} level @param {Record<string, number>} bb
 * @returns {{ def: NonNullable<SkillDef['allies']> | null, keys: string[] }}
 */
function alliesOf(level, bb) {
  const text = plainOf(level), insp = inspireOf(text, bb), block = /范围内所有(?:其他|其它)?友方单位阻挡数[+-]\d+/u.test(text) && Number.isFinite(bb.block_cnt);
  if (!insp && !block) return { def: null, keys: [] };
  return {
    def: { others: insp?.others ?? false, ...(insp ? { inspire: insp.inspire } : {}), ...(block ? { mods: { blockCnt: bb.block_cnt } } : {}) },
    keys: [...(insp?.keys ?? []), ...(block ? ['block_cnt'] : [])],
  };
}

/** The operator's own modifier of a blackboard key (技能-5) and, for the multiplied ones, its added one. */
const OWN = Object.freeze(/** @type {Record<string, [string, string?]>} */ ({ atk: ['atkPct', 'atkFlat'], def: ['defPct', 'defFlat'], max_hp: ['hpPct', 'hpFlat'], block_cnt: ['blockCnt'] }));

/**
 * The modifiers a description changes of the generic effect's (技能-5): a key it gives other units (技能-11) is none of
 * the operator's — its modifier 0 —; `atk`, `def` or `max_hp` shown without a percent (「生命上限+{max_hp}」) is 直接加算.
 * @param {SkillLevel} level @param {Record<string, number>} bb @param {string[]} others @returns {Record<string, number>}
 */
function ownMods(level, bb, others) {
  /** @type {Record<string, number>} */
  const mods = {}, raw = level.description ?? '';
  for (const k of others) if (OWN[k]) mods[OWN[k][0]] = 0;
  for (const [k, [pct, flat]] of Object.entries(OWN)) {
    if (!flat || others.includes(k) || !Number.isFinite(bb[k])) continue;
    const shown = [...raw.matchAll(new RegExp(`\\{-?${k}(?::([^}]*))?\\}`, 'g'))];
    if (shown.length && shown.every((m) => !(m[1] ?? '').includes('%'))) Object.assign(mods, { [pct]: 0, [flat]: bb[k] });
  }
  return mods;
}

/** Chinese numerals of extra targets and hits (技能-9). */
const COUNT = Object.freeze(/** @type {Record<string, number>} */ ({ 一: 1, 两: 2, 二: 2, 三: 3, 1: 1, 2: 2, 3: 3 }));

/**
 * One sentence of a description as what it adds (技能-9), or null for a sentence it does not read.
 * @param {string} s the sentence, its placeholders as {key} @param {Record<string, number>} bb
 * @returns {{ mods?: Record<string, number>, attack?: NonNullable<SkillDef['extra']>['attack'] } | null}
 */
function phraseOf(s, bb) {
  let m;
  if (s === '同时攻击阻挡的所有敌人') return { attack: { blocked: true } };
  if ((m = /^(?:每次攻击)?额外攻击(一|两|1|2)(?:个|名)(?:目标|敌人)$/.exec(s))) return { attack: { more: COUNT[m[1]] } };
  if ((m = /^攻击变为(二|三|2|3)(?:连击|连射)$/.exec(s))) return { attack: { times: COUNT[m[1]] } };
  if (/^(?:普通攻击造成法术伤害|伤害类型变为法术|(?:每次)?攻击造成相当于攻击力\{(?:attack@)?atk_scale\}的法术伤害)$/.test(s)) return { attack: { type: 'arts' } };
  if ((m = /^(?:且|并)?(?:攻击(?:会)?使|(?:并)?(?:使|令)(?:命中|击中))目标(晕眩|停顿)\{((?:attack@)?(?:stun|sluggish))\}秒$/.exec(s)) && Number.isFinite(bb[m[2]])) {
    return { attack: { hitStatus: { key: m[1] === '晕眩' ? 'stun' : 'sluggish', seconds: bb[m[2]] } } };
  }
  if ((m = /^(?:并)?获得\{prob\}的?物理(和法术)?闪避$/.exec(s)) && Number.isFinite(bb.prob)) return { mods: { dodgePhys: bb.prob, ...(m[1] ? { dodgeArts: bb.prob } : {}) } };
  if (s === '阻挡数变为0') return { mods: { blockCntMul: 0 } };
  if (s === '防御力降至0') return { mods: { defMul: 0 } };
  return hitPhraseOf(s, bb);
}

/** A status's word in a description (技能-9). @type {Record<string, NonNullable<import('@aue/sim').skills.AttackMods['hitStatus']>['key']>} */
const STATUS_WORD = { 晕眩: 'stun', 停顿: 'sluggish', 沉睡: 'sleep', 寒冷: 'cold', 恐惧: 'fear' };
/** An element's 损伤 in a description (技能-9, 元素-1). @type {Record<string, NonNullable<import('@aue/sim').skills.AttackMods['element']>>} */
const ELEMENT_WORD = { 神经: 'SANITY', 侵蚀: 'WATER', 灼燃: 'FIRE', 凋亡: 'DARK', 狂躁: 'ANGER' };

/**
 * One sentence about what the skill's attacks do to their targets or to the operator (技能-9), or null: 失去特殊能力
 * (沉默), 寒冷, 沉睡 on each hit; a chance of a status; the operator's own HP back for each attack; the 元素损伤 each hit
 * carries (a share of its attack).
 * @param {string} s @param {Record<string, number>} bb
 * @returns {{ attack: NonNullable<NonNullable<SkillDef['extra']>['attack']> } | null}
 */
function hitPhraseOf(s, bb) {
  let m;
  const has = (/** @type {string} */ k) => Number.isFinite(bb[k]);
  if ((m = /^(?:攻击后?|并)?使?(?:命中)?目标失去特殊能力\{((?:attack@)?silence)\}秒$/.exec(s)) && has(m[1])) return { attack: { hitStatus: { key: 'silence', seconds: bb[m[1]] } } };
  if ((m = /^攻击对目标造成\{((?:attack@)?cold)\}秒寒冷$/.exec(s)) && has(m[1])) return { attack: { hitStatus: { key: 'cold', seconds: bb[m[1]] } } };
  if ((m = /^(?:下一?次攻击|攻击)使(?:敌人|目标)陷入沉睡\{((?:attack@)?sleep)\}秒$/.exec(s)) && has(m[1])) return { attack: { hitStatus: { key: 'sleep', seconds: bb[m[1]] } } };
  if ((m = /^(?:另外还|每次攻击)?有\{((?:attack@)?prob)\}的?(?:概率|几率)使(?:目标|其)(晕眩|停顿|沉睡|寒冷|恐惧)\{((?:attack@)?(?:stun|sluggish|sleep|cold|fear))\}秒$/.exec(s))
    && has(m[1]) && has(m[3])) return { attack: { hitStatus: { key: STATUS_WORD[m[2]], seconds: bb[m[3]], prob: bb[m[1]] } } };
  return effectPhraseOf(s, bb);
}

/**
 * One sentence about what else the skill's attacks do (技能-9), or null: the operator's own HP back for each attack; a
 * push or pull of the blackboard's `force` (`attack@force`) on each target; the 元素损伤 each
 * hit carries.
 * @param {string} s @param {Record<string, number>} bb
 * @returns {{ attack: NonNullable<NonNullable<SkillDef['extra']>['attack']> } | null}
 */
function effectPhraseOf(s, bb) {
  let m;
  const has = (/** @type {string} */ k) => Number.isFinite(bb[k]), force = bb.force ?? bb['attack@force'];
  if ((m = /^(?:每次攻击恢复自身最大生命值的|下次攻击时回复自身|并回复自身)\{((?:attack@)?hp_ratio)\}(?:的最大生命|的生命)?$/.exec(s)) && has(m[1])) return { attack: { selfHeal: bb[m[1]] } };
  if ((m = DISPLACE.exec(s)) && Number.isFinite(force)) {
    const pull = /拖拽|牵引|拉至/.test(m[4]), along = !pull && !!(m[1] || m[3]);
    return { attack: { displace: { pull, force, ...(along ? { along: true } : {}) } } };
  }
  if ((m = /造成相当于攻击力\{(?:attack@)?atk_scale\}的(法术|物理)伤害并附带\{((?:attack@)?ep_damage_ratio)\}攻击力的(神经|侵蚀|灼燃|凋亡|狂躁)损伤$/.exec(s)) && has(m[2])) {
    return { attack: { element: ELEMENT_WORD[m[3]], epScale: bb[m[2]], ...(m[1] === '法术' ? { type: /** @type {const} */ ('arts') } : {}) } };
  }
  return null;
}

/**
 * A push or pull a sentence says the skill's hits make (技能-9): an optional way along the operator's facing (「往攻击方向」
 * 「朝部署方向」「向前」), a 力度 word, and 推开、推动、弹开、击退 (a push) or 拖拽、牵引、拉至面前 (a pull).
 */
const DISPLACE = /(往攻击方向|朝部署方向|向前)?(微小力|小力|中等力度|中力|较大力|大力|特大力)地?(往攻击方向|朝部署方向|向前)?(推开|推动|弹开|击退|拖拽至面前|牵引至面前|拉至面前)/u;

/** An attribute a hit lowers for some seconds (技能-9): its word, its key, its modifier as a share and as a number. */
const DEBUFF_ATTR = Object.freeze([['防御力', 'def', 'defPct', 'defFlat'], ['移动速度', 'move_speed', 'movePct', 'movePct'], ['攻击速度', 'attack_speed', 'aspd', 'aspd'], ['攻击力', 'atk', 'atkPct', 'atkFlat']]);

/**
 * What the skill's hits lower for some seconds (技能-9): a sentence with 「{duration}秒内」 (or `attack@duration`) about the
 * target and 「<attribute>-{-key}」 — the target's 防御力 or 攻击力 (a share when shown with a percent, else a number),
 * 移动速度 or 攻击速度 that much for that long; the keys it uses, which are not the operator's own.
 * @param {SkillLevel} level @param {Record<string, number>} bb @returns {{ debuff: { seconds: number, mods: Record<string, number> } | null, keys: string[] }}
 */
function hitDebuffOf(level, bb) {
  for (const s of textOf(level).split(/[，。；\n]/)) {
    const d = /\{((?:attack@)?duration)(?::[^}]*)?\}秒内/.exec(s);
    if (!d || !/目标/.test(s) || !Number.isFinite(bb[d[1]])) continue;
    /** @type {Record<string, number>} */
    const mods = {}, keys = [];
    for (const [word, key, pct, flat] of DEBUFF_ATTR) {
      const m = new RegExp(`${word}-\\{-((?:attack@)?${key})(?::([^}]*))?\\}`).exec(s);
      if (!m || !Number.isFinite(bb[m[1]])) continue;
      mods[(m[2] ?? '').includes('%') ? pct : flat] = bb[m[1]];
      keys.push(m[1]);
    }
    if (keys.length) return { debuff: { seconds: bb[d[1]], mods }, keys };
  }
  return { debuff: null, keys: [] };
}

/**
 * What a skill level's description adds to its blackboard's effects (技能-9): each sentence (split at ，。；, rich-text
 * tags removed, placeholders as {key}) read by phraseOf, after the modifiers it changes of the generic effect's
 * (`own`, 技能-5); none when it reads none.
 * @param {SkillLevel} level @param {Record<string, number>} own @returns {{ extra?: NonNullable<SkillDef['extra']> }}
 */
function extraOf(level, own) {
  const bb = Object.fromEntries(level.blackboard.map((b) => [b.key, b.value])), hit = hitDebuffOf(level, bb);
  // what closing the skill does (「主动关闭技能时……」) is not what its attacks do
  const said = plainOf(level).split(/[。；\n]/).filter((seg) => !/关闭技能时/.test(seg)).join('。');
  const parts = said.split(/[，。；\n]/).map((s) => phraseOf(s.trim(), bb)).filter((p) => p !== null);
  const mods = Object.assign({ ...own, ...selfZeros(hit.keys) }, ...parts.map((p) => p.mods ?? {}));
  const attack = Object.assign({}, ...parts.map((p) => p.attack ?? {}), hit.debuff ? { hitDebuff: hit.debuff } : {});
  const has = (/** @type {object} */ o) => Object.keys(o).length > 0;
  return has(mods) || has(attack) ? { extra: { ...(has(mods) ? { mods } : {}), ...(has(attack) ? { attack } : {}) } } : {};
}

/** The operator's own modifier of each attribute key a hit can lower (技能-5). @type {Record<string, string>} */
const SELF_MOD = { def: 'defPct', move_speed: 'movePct', attack_speed: 'aspd', atk: 'atkPct' };
/** The operator's own modifiers of keys a description gives its targets: 0 (技能-5, 技能-9). @param {string[]} keys */
const selfZeros = (keys) => Object.fromEntries(keys.filter((k) => k in SELF_MOD).map((k) => [SELF_MOD[k], 0]));

/** A description that says the attack range changes (技能-8). */
const NEW_RANGE = /攻击范围(?:扩大|改变|缩小)/u;
/** A description that says the attack range reaches the whole map (技能-8). */
const WHOLE_MAP = /攻击范围扩大至整个战场/u;

/**
 * A skill level's attack range while it runs (技能-8): the whole map when its description says so; the level's range
 * (range_table, 干员-8) when the description says the attack range grows, changes or shrinks; else none.
 * @param {SkillLevel} level @returns {{ rangeAll?: true, range?: { row: number, col: number }[] }}
 */
function rangeOf(level) {
  const text = (level.description ?? '').replace(/<[^>]*>/g, '');
  if (WHOLE_MAP.test(text)) return { rangeAll: true };
  if (!NEW_RANGE.test(text) || !level.rangeId) return {};
  const cells = /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)[level.rangeId];
  if (!cells) throw new RangeError(`no range ${level.rangeId}`);
  return { range: cells };
}

/** 生命回复 (skcom_heal_self): heals the operator for heal_scale of its maximum HP at once. @type {SkillBehavior} */
const healSelf = Object.freeze({
  start(ctx) { ctx.heal(ctx.self, ctx.stats(ctx.self).maxHp * ctx.bb.heal_scale); },
});

/**
 * 史尔特尔's 黄昏 (skchr_surtr_3, 技能-12): the generic effect (技能-5; its 生命上限 + max_hp is 直接加算); as it starts she
 * heals her whole maximum HP; then every `interval` seconds she loses HP (生命流失) at a rate rising evenly from 0 to
 * `hp_ratio` of her maximum HP a second over `duration` seconds.
 * @type {SkillBehavior}
 */
const dusk = Object.freeze({
  start(ctx) {
    skills.GENERIC.start(ctx);
    ctx.heal(ctx.self, ctx.stats(ctx.self).maxHp);
  },
  tick(ctx) {
    const every = Math.max(1, secondsToFrames(ctx.bb.interval)), t = ctx.frame - (ctx.self.skill?.at ?? ctx.frame);
    if (t <= 0 || t % every !== 0) return;
    const rate = ctx.bb.hp_ratio * Math.min(1, t / FPS / ctx.bb.duration);
    if (rate > 0) ctx.dealDamage(ctx.self, { type: 'true', amount: ctx.stats(ctx.self).maxHp * rate * ctx.bb.interval, hpLoss: true });
  },
  end(ctx, reason) { skills.GENERIC.end(ctx, reason); },
});

/** Behaviours by skill id. @type {Readonly<Record<string, SkillBehavior>>} */
export const skillBehaviors = Object.freeze({
  'skcom_heal_self[1]': healSelf, 'skcom_heal_self[2]': healSelf, 'skcom_heal_self[3]': healSelf,
  skchr_surtr_3: dusk,
});
