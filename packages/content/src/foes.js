// Enemy abilities of the official content (docs/spec/foes.md 敌能-5…敌能-37): behaviours by talent and skill name. The
// game data holds only the multipliers; FOE_EXTRAS adds, per enemy, the parameters PRTS gives (radii, delays, bolts …)
// to the blackboards the behaviours read, or a talent the data does not have. They act only through the context (ADR 0055).

import { moreFoeBehaviors, addEnergy } from './abilities.js';
import { prisonerBehaviors } from './prisoners.js';
import { avengerBehaviors } from './avenger.js';
import { hoverBehaviors } from './hover.js';
import { summonerBehaviors } from './summoners.js';
import { partisanBehaviors } from './partisans.js';
import { sarkazBehaviors } from './sarkaz.js';
import { devourerBehaviors } from './devourers.js';
import { refractBehaviors } from './refract.js';
import { statueBehaviors } from './statue.js';
import { auraBehaviors } from './auras.js';
import { chargedBehaviors } from './charged.js';
import { staticBehaviors } from './static.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const PRTS = 'https://prts.wiki/index.php?title=';
/**
 * Per enemy, what to add to a talent's or skill's blackboard, with the PRTS revision that gives it.
 * @type {Readonly<Record<string, { talents?: Record<string, Record<string, number>>, skills?: Record<string, Record<string, number>>, source: string }>>}
 */
export const FOE_EXTRAS = Object.freeze({
  // 高能源石虫: 死亡爆炸（爆炸半径1.25，延迟1秒，爆炸时来源无效，造成攻击力400%的无途径物理溅射伤害，无视迷彩，不可对空）
  enemy_1021_bslime: { talents: { boom: { radius: 1.25, delay: 1, arts: 0, air: 0, sourced: 0 } }, source: `${PRTS}%E9%AB%98%E8%83%BD%E6%BA%90%E7%9F%B3%E8%99%AB&oldid=413890` },
  // 高能源石虫·α: 死亡爆炸（爆炸半径1.25，延迟1秒，爆炸时来源无效，造成攻击力400%物理溅射伤害，无视迷彩，不可对空）
  enemy_1021_bslime_2: { talents: { boom: { radius: 1.25, delay: 1, arts: 0, air: 0, sourced: 0 } }, source: `${PRTS}%E9%AB%98%E8%83%BD%E6%BA%90%E7%9F%B3%E8%99%AB%C2%B7%CE%B1&oldid=375693` },
  // 冰爆源石虫: 死亡爆炸（爆炸半径1.65，延迟1秒，爆炸时来源无效 …… 物理溅射伤害 …… 不可对空）
  enemy_1067_snslime: { talents: { boom: { radius: 1.65, delay: 1, arts: 0, air: 0, sourced: 0 } }, source: `${PRTS}%E5%86%B0%E7%88%86%E6%BA%90%E7%9F%B3%E8%99%AB&oldid=435593` },
  // 冰爆源石虫·α: the same 死亡爆炸 (爆炸半径1.65，延迟1秒，爆炸时来源无效 …… 不可对空)
  enemy_1067_snslime_2: { talents: { boom: { radius: 1.65, delay: 1, arts: 0, air: 0, sourced: 0 } }, source: `${PRTS}%E5%86%B0%E7%88%86%E6%BA%90%E7%9F%B3%E8%99%AB%C2%B7%CE%B1&oldid=435594` },
  // 辐能源石虫/辐能源石虫·α: 死亡爆炸（爆炸半径1.25，延迟0.5秒，造成攻击力400%的法术溅射伤害，不可对空；给予全场敌人1点能量）
  enemy_1352_eslime: { talents: { Boom: { radius: 1.25, delay: 0.5, arts: 1, air: 0, sourced: 1 } }, source: `${PRTS}%E8%BE%90%E8%83%BD%E6%BA%90%E7%9F%B3%E8%99%AB&oldid=435841` },
  enemy_1352_eslime_2: { talents: { Boom: { radius: 1.25, delay: 0.5, arts: 1, air: 0, sourced: 1 } }, source: `${PRTS}%E8%BE%90%E8%83%BD%E6%BA%90%E7%9F%B3%E8%99%AB%C2%B7%CE%B1&oldid=435842` },
  // "喷射罐"/"喷爆罐": 对半径1.55范围内的我方单位造成攻击力100%的法术溅射伤害与10s寒冷（可被沉默）
  enemy_1385_winbom: { talents: { Boom: { radius: 1.55, delay: 0, arts: 1, air: 1, sourced: 1 } }, source: `${PRTS}%E2%80%9C%E5%96%B7%E5%B0%84%E7%BD%90%E2%80%9D&oldid=435426` },
  enemy_1385_winbom_2: { talents: { Boom: { radius: 1.55, delay: 0, arts: 1, air: 1, sourced: 1 } }, source: `${PRTS}%E2%80%9C%E5%96%B7%E7%88%86%E7%BD%90%E2%80%9D&oldid=435425` },
  // 帝国前锋精锐: 未被阻挡时可进行远程攻击，远程攻击造成攻击力50%的物理伤害，不会攻击飞行单位
  enemy_1113_empace: { talents: { ranged: { scale: 0.5 } }, source: `${PRTS}%E5%B8%9D%E5%9B%BD%E5%89%8D%E9%94%8B%E7%B2%BE%E9%94%90&oldid=435717` },
  // 匪帮轰击者/匪帮轰击者头目: 未被阻挡时可进行远程攻击，对目标及周围8格内的我方单位造成攻击力50%的物理伤害
  enemy_1359_ekulsr: { talents: { ranged: { scale: 0.5, square: 1 } }, source: `${PRTS}%E5%8C%AA%E5%B8%AE%E8%BD%B0%E5%87%BB%E8%80%85&oldid=435794` },
  enemy_1359_ekulsr_2: { talents: { ranged: { scale: 0.5, square: 1 } }, source: `${PRTS}%E5%8C%AA%E5%B8%AE%E8%BD%B0%E5%87%BB%E8%80%85%E5%A4%B4%E7%9B%AE&oldid=435795` },
  // 速射轻弩手/速射劲弩手: 向目标方向发射3支弩箭，每支弩箭对击中的首个目标造成攻击力100%的物理伤害
  enemy_1403_gunsho: { skills: { CrossAttack: { bolts: 3, arts: 0, charge: 0, hold: 0, hide: 0 } }, source: `${PRTS}%E9%80%9F%E5%B0%84%E8%BD%BB%E5%BC%A9%E6%89%8B&oldid=436612` },
  enemy_1403_gunsho_2: { skills: { CrossAttack: { bolts: 3, arts: 0, charge: 0, hold: 0, hide: 0 } }, source: `${PRTS}%E9%80%9F%E5%B0%84%E5%8A%B2%E5%BC%A9%E6%89%8B&oldid=436611` },
  // 重弩突袭者/重弩猎杀者: 蓄力1.4s后向目标方向发射1支弩箭 …… 法术伤害 …… 技能持续2.5s；隐匿（被阻挡，主动攻击期间均可解除）
  enemy_1404_msnip: { skills: { CrossAttack: { bolts: 1, arts: 1, charge: 1.4, hold: 2.5, hide: 1 } }, source: `${PRTS}%E9%87%8D%E5%BC%A9%E7%AA%81%E8%A2%AD%E8%80%85&oldid=437074` },
  enemy_1404_msnip_2: { skills: { CrossAttack: { bolts: 1, arts: 1, charge: 1.4, hold: 2.5, hide: 1 } }, source: `${PRTS}%E9%87%8D%E5%BC%A9%E7%8C%8E%E6%9D%80%E8%80%85&oldid=437073` },
  // 神射手囚犯: 解放状态：攻击力+50%，普通攻击改为造成法术伤害
  enemy_1117_liiprr_2: { talents: { liberty: { arts: 1 } }, source: `${PRTS}%E7%A5%9E%E5%B0%84%E6%89%8B%E5%9B%9A%E7%8A%AF&oldid=436533` },
  // 传奇重犯: 自身首次切换至解放状态时，使场上所有【囚犯】敌人切换至解放状态
  enemy_1121_lifbos_2: { talents: { liberty: { all: 1 } }, source: `${PRTS}%E4%BC%A0%E5%A5%87%E9%87%8D%E7%8A%AF&oldid=435683` },
  // 山海众掌令使: 未被阻挡时，在经过的首个可部署的“玉门天灾工事”上部署30级的山海密语仪 (the data has no talent for it)
  enemy_1297_ymflag_2: { talents: { PlaceFlag: {} }, source: `${PRTS}%E5%B1%B1%E6%B5%B7%E4%BC%97%E6%8E%8C%E4%BB%A4%E4%BD%BF&oldid=436476` },
  // 变异沙地兽α/变异巨岩蛛/变异巨岩蛛α: 因坠落以外的原因死亡时 …… 召唤 ……（可被沉默）
  enemy_1131_sbeast_2: { talents: { deathrattle: { silence: 1, fall: 0 } }, source: `${PRTS}%E5%8F%98%E5%BC%82%E6%B2%99%E5%9C%B0%E5%85%BD%CE%B1&oldid=435587` },
  enemy_1133_harchn: { talents: { deathrattle: { silence: 1, fall: 0 } }, source: `${PRTS}%E5%8F%98%E5%BC%82%E5%B7%A8%E5%B2%A9%E8%9B%9B&oldid=435584` },
  enemy_1133_harchn_2: { talents: { deathrattle: { silence: 1, fall: 0 } }, source: `${PRTS}%E5%8F%98%E5%BC%82%E5%B7%A8%E5%B2%A9%E8%9B%9B%CE%B1&oldid=435585` },
  // 萨卡兹子裔集恨者/集怒者: 死亡1秒后在距离自身最近的可通行地块中心0.2边长正方形范围内随机位置以自身路径召唤1只……
  enemy_1226_dklord: { talents: { deathrattle: { offset_bound: 0.1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E5%AD%90%E8%A3%94%E9%9B%86%E6%81%A8%E8%80%85&oldid=436451` },
  enemy_1226_dklord_2: { talents: { deathrattle: { offset_bound: 0.1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E5%AD%90%E8%A3%94%E9%9B%86%E6%80%92%E8%80%85&oldid=436452` },
  // 全息幻影/全息幻影MK2: {{异常效果|自缚}} (the data has no talent for it)
  enemy_1139_hologc: { talents: { Bind: {} }, source: `${PRTS}%E5%85%A8%E6%81%AF%E5%B9%BB%E5%BD%B1&oldid=436360` },
  enemy_1139_hologc_2: { talents: { Bind: {} }, source: `${PRTS}%E5%85%A8%E6%81%AF%E5%B9%BB%E5%BD%B1MK2&oldid=436361` },
  // 游击队迫击炮兵/组长: 炮弹能对目标及其周围八格的我方单位造成伤害
  enemy_1082_soticn: { talents: { Shell: {} }, source: `${PRTS}%E6%B8%B8%E5%87%BB%E9%98%9F%E8%BF%AB%E5%87%BB%E7%82%AE%E5%85%B5&oldid=436975` },
  enemy_1082_soticn_2: { talents: { Shell: {} }, source: `${PRTS}%E6%B8%B8%E5%87%BB%E9%98%9F%E8%BF%AB%E5%87%BB%E7%82%AE%E5%85%B5%E7%BB%84%E9%95%BF&oldid=436976` },
  // 萨卡兹积怨者/恶咒者: 可同时攻击2个目标，造成近战途径伤害
  enemy_1074_dbskar: { talents: { Targets: { n: 2, direct: 1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E7%A7%AF%E6%80%A8%E8%80%85&oldid=436411` },
  enemy_1074_dbskar_2: { talents: { Targets: { n: 2, direct: 1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E6%81%B6%E5%92%92%E8%80%85&oldid=436402` },
  // 冰原术师/队长: 拥有抵抗，可同时攻击2个目标
  enemy_1192_krgscr: { talents: { Targets: { n: 2 }, Resist: {} }, source: `${PRTS}%E5%86%B0%E5%8E%9F%E6%9C%AF%E5%B8%88&oldid=435602` },
  enemy_1192_krgscr_2: { talents: { Targets: { n: 2 }, Resist: {} }, source: `${PRTS}%E5%86%B0%E5%8E%9F%E6%9C%AF%E5%B8%88%E9%98%9F%E9%95%BF&oldid=435603` },
  // 冰原狂战士队长: 拥有抵抗
  enemy_1193_krgbsk_2: { talents: { Resist: {} }, source: `${PRTS}%E5%86%B0%E5%8E%9F%E7%8B%82%E6%88%98%E5%A3%AB%E9%98%9F%E9%95%BF&oldid=435599` },
  // 冰原猎人队长: ①被阻挡时进行近战途径攻击 ②未被阻挡时进行远程途径攻击，优先攻击防御力最低的我方单位
  enemy_1190_krgbow_2: { talents: { LowDef: {} }, source: `${PRTS}%E5%86%B0%E5%8E%9F%E7%8C%8E%E4%BA%BA%E9%98%9F%E9%95%BF&oldid=435601` },
  // 大君之赐/慷慨之赐 are 重生造物, which the supply carts feed: 场上所有'''重生造物'''（大君之触，仁慈之触，大君之赐，慷慨之赐）
  enemy_1221_dzomg: { talents: { Creation: {} }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E5%AD%90%E8%A3%94%E8%A1%A5%E7%BB%99%E8%BD%A6&oldid=436444` },
  enemy_1221_dzomg_2: { talents: { Creation: {} }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E5%AD%90%E8%A3%94%E8%A1%A5%E7%BB%99%E8%BD%A6&oldid=436444` },
  // 萨卡兹悖谬谍报官/谍报长: 初始技力=3, 技力上限=3 (rounds of ammunition)
  enemy_1317_wdexg: { talents: { 1: { ammo: 3 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E6%82%96%E8%B0%AC%E8%B0%8D%E6%8A%A5%E5%AE%98&oldid=436389` },
  enemy_1317_wdexg_2: { talents: { 1: { ammo: 3 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E6%82%96%E8%B0%AC%E8%B0%8D%E6%8A%A5%E9%95%BF&oldid=436390` },
  // 深池方阵战士/深池方阵指挥官: 自身1.5半径内除自身外其它深池方阵战士/深池方阵指挥官防御力增加200（可无限叠加，不可被沉默）
  enemy_1169_duphlx: { talents: { auraDefup: { radius: 1.5 } }, source: `${PRTS}%E6%B7%B1%E6%B1%A0%E6%96%B9%E9%98%B5%E6%88%98%E5%A3%AB&oldid=353488` },
  enemy_1169_duphlx_2: { talents: { auraDefup: { radius: 1.5 } }, source: `${PRTS}%E6%B7%B1%E6%B1%A0%E6%96%B9%E9%98%B5%E6%8C%87%E6%8C%A5%E5%AE%98&oldid=353489` },
  // 深池暗影术师/深池暗影术师队长: 不会攻击飞行单位 — its own talent, not part of 折射
  enemy_1168_dumage: { talents: { noFly: {} }, source: `${PRTS}%E6%B7%B1%E6%B1%A0%E6%9A%97%E5%BD%B1%E6%9C%AF%E5%B8%88&oldid=367785` },
  enemy_1168_dumage_2: { talents: { noFly: {} }, source: `${PRTS}%E6%B7%B1%E6%B1%A0%E6%9A%97%E5%BD%B1%E6%9C%AF%E5%B8%88%E9%98%9F%E9%95%BF&oldid=367786` },
  // 寒霜: 使2.5半径范围内的所有我方单位攻击速度-50%. The data keeps 2.5 on defup; the aura reads atkSpeedDown (敌能-35).
  enemy_1042_frostd: { talents: { atkSpeedDown: { range_radius: 2.5 }, Static: {} }, source: `${PRTS}%E5%AF%92%E9%9C%9C&oldid=371399` },
  // 澪: 普通攻击为2连击, and 寒晖 is those same two hits at 150% (talents [], PowerAttack has only atk_scale)
  enemy_10118_ymgprc: { skills: { PowerAttack: { times: 2 } }, source: `${PRTS}%E6%BE%AA&oldid=358826` },
  // 静态刚体, as each page's ability cell says (the data has no talent for it; 敌能-37). Not their other talents — those are other behaviours.
  enemy_1017_defdrn: { talents: { Static: {} }, source: `${PRTS}%E5%BE%A14&oldid=380622` },
  enemy_10083_hlbird: { talents: { Static: {} }, source: `${PRTS}%E2%80%9C%E8%90%A8%E7%A7%91%E5%A1%94%E4%B9%8B%E7%BF%BC%E2%80%9D&oldid=375648` },
  enemy_10084_hlegle: { talents: { Static: {} }, source: `${PRTS}%E2%80%9C%E8%90%A8%E7%A7%91%E5%A1%94%E4%B9%8B%E7%9C%BC%E2%80%9D&oldid=388054` },
  enemy_10085_hllevi_2: { talents: { Static: {} }, source: `${PRTS}%E2%80%9C%E8%90%A8%E7%A7%91%E5%A1%94%E6%98%82%E9%A6%96%E2%80%9D&oldid=376212` },
  enemy_1430_lrrook: { talents: { Static: {} }, source: `${PRTS}%E6%84%A7%E6%82%94%E9%AD%82%E7%81%B5%E5%9C%A3%E6%9D%AF&oldid=386513` },
});

/**
 * An enemy with its extras (FOE_EXTRAS) merged into its talents' and skills' blackboards.
 * @param {string} key @param {EnemyDef} def @returns {EnemyDef}
 */
export function withFoeExtras(key, def) {
  const x = FOE_EXTRAS[key];
  if (!x) return def;
  const talents = { ...def.talents };
  for (const [t, bb] of Object.entries(x.talents ?? {})) talents[t] = { ...talents[t], ...bb };
  const skills = (def.skills ?? []).map((s) => ({ ...s, bb: { ...s.bb, ...x.skills?.[s.key] } }));
  return { ...def, talents, ...(def.skills ? { skills } : {}) };
}

/**
 * 死亡爆炸 (敌能-5): knocked down and not silenced, it explodes where it fell — with `freeze` s of cold when it has
 * them —; with `add_count`, every other enemy on the field with 能量 gains that many (敌能-13).
 * @type {FoeBehavior['death']}
 */
const deathBlast = (ctx) => {
  const s = ctx.stats(ctx.self), bb = ctx.bb;
  if (s.flags.silence) return;
  ctx.blast({
    x: ctx.self.x, y: ctx.self.y, radius: bb.radius, delay: bb.delay, air: bb.air === 1, sourced: bb.sourced === 1,
    type: bb.arts === 1 ? 'arts' : 'phys', amount: s.atk * bb.atk_scale, status: typeof bb.freeze === 'number' ? { key: 'cold', seconds: bb.freeze } : undefined,
  });
  if (typeof bb.add_count === 'number') for (const u of ctx.allies(Infinity)) if (u !== ctx.self) addEnergy(ctx, u, bb.add_count);
};

/** 冰爆源石虫 (敌能-5). @type {FoeBehavior} */
const boom = Object.freeze({ death: deathBlast });

/**
 * "喷射罐", 辐能源石虫 (敌能-5, 敌能-6): the explosion; with `attack@times` (喷射罐's), its attack a channel of hits over
 * seconds, then a cooldown — without, its ordinary attack.
 * @type {FoeBehavior}
 */
const Boom = Object.freeze({
  death: deathBlast,
  attack: (ctx, mods) => (typeof ctx.bb['attack@times'] !== 'number' ? mods
    : { ...mods, type: 'arts', scale: ctx.bb.atk_scale, channel: { hits: ctx.bb['attack@times'], duration: ctx.bb['attack@cooldown'], after: ctx.bb['attack@attack_cd'] } }),
});

/** "投石机" (敌能-7): the first attack reaches its attack radius, as arts with a cross splash; then melee only. @type {FoeBehavior} */
const FirstAttack = Object.freeze({
  targets: (ctx, cands) => (ctx.state.get('thrown') ? cands : [...new Set([...cands, ...ctx.foes(ctx.self.base.rangeRadius + 0.25)])]),
  attack: (ctx, mods) => {
    if (ctx.state.get('thrown')) return mods;
    ctx.state.set('thrown', 1);
    return { ...mods, type: 'arts', scale: ctx.bb['attack@first_atk_scale'], cross: true };
  },
});

/** The 倍率 on a frozen target an `atkup` blackboard gives (敌能-27), or undefined. @param {Record<string, number>} bb */
const frozenScale = (bb) => Object.entries(bb).find(([k]) => k === 'atk_scale' || k.endsWith('[frozen].atk_scale'))?.[1];

/**
 * 低血强化 (敌能-8): ATK up — by its `atk`, else by `AtkUp`'s — while its HP is below half its maximum, or with
 * `hp_ratio` at most that share of it. With an `atk_scale` instead (敌能-27): its attack's 倍率 × that on a target
 * 冻结 as the hit is worked out.
 * @type {FoeBehavior}
 */
const atkup = Object.freeze({
  attack: (ctx, mods) => {
    const k = frozenScale(ctx.bb);
    return k === undefined ? mods : { ...mods, frozen: k };
  },
  tick: (ctx) => {
    if (frozenScale(ctx.bb) !== undefined) return;
    const max = ctx.stats(ctx.self).maxHp, hp = ctx.self.hp, ratio = ctx.bb.hp_ratio;
    const low = ratio === undefined ? hp < max * 0.5 : hp <= max * ratio, has = ctx.self.buffs.some((b) => b.key === 'atkup');
    if (low && !has) ctx.addBuff(ctx.self, { key: 'atkup', mods: { atkPct: ctx.bb.atk ?? ctx.talent('AtkUp')?.atk ?? 0 } });
    else if (!low && has) ctx.removeBuff(ctx.self, 'atkup');
  },
});

/**
 * 帝国前锋精锐's attack while unblocked (敌能-8): ground units within its attack radius at `scale` of its attack; among
 * the most taunting, neutral units first.
 * @type {FoeBehavior}
 */
const ranged = Object.freeze({
  targets: (ctx, cands) => {
    if (ctx.blocked) return cands;
    const near = ctx.foes(ctx.self.base.rangeRadius + 0.25).filter((u) => !ctx.stats(u).flying);
    const top = Math.max(...near.map((u) => ctx.stats(u).taunt)), tied = near.filter((u) => ctx.stats(u).taunt === top);
    return tied.some((u) => u.base.neutral) ? tied.filter((u) => u.base.neutral) : near;
  },
  attack: (ctx, mods) => (ctx.blocked ? mods : { ...mods, scale: mods.scale * ctx.bb.scale, ...(ctx.bb.square ? { square: true } : {}) }),
});

/** A direction along a row or column from the enemy to a unit in line. @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
const toward = (a, b) => (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { dx: Math.sign(b.x - a.x), dy: 0 } : { dx: 0, dy: Math.sign(b.y - a.y) });

/**
 * 直击 (敌能-9): unblocked, able to act, not silenced, cooldown over and someone in line — the bolts at once, or after a
 * charge while it stands for the skill's duration; 隐匿 while unblocked and not in the skill when it has the talent.
 * @type {FoeBehavior}
 */
const CrossAttack = Object.freeze({
  tick: (ctx) => {
    const st = ctx.state;
    if (st.get('busy') > 0) st.set('busy', st.get('busy') - 1);
    if (st.get('charge') > 0) {
      st.set('charge', st.get('charge') - 1);
      if (st.get('charge') === 0) crossFire(ctx);
    } else crossStart(ctx);
    if (ctx.bb.hide === 1) crossHide(ctx);
  },
});

/** 直击's bolts (敌能-9): `bolts` of them in the chosen direction. @param {import('@aue/sim').FoeContext} ctx */
function crossFire(ctx) {
  const bb = ctx.bb, st = ctx.state, atk = ctx.stats(ctx.self).atk;
  for (let i = 0; i < bb.bolts; i++) {
    ctx.bolt({ dx: st.get('dx'), dy: st.get('dy'), type: bb.arts === 1 ? 'arts' : 'phys', amount: atk * (bb.atk_scale ?? 1), ...(bb.stun ? { status: { key: 'stun', seconds: bb.stun } } : {}) });
  }
}

/** 直击 starting (敌能-9): ready, unblocked, able to act, not silenced, someone in line. @param {import('@aue/sim').FoeContext} ctx */
function crossStart(ctx) {
  const bb = ctx.bb, s = ctx.stats(ctx.self), [t] = ctx.inLine();
  if (!ctx.ready || ctx.blocked || s.disabled || s.flags.silence || !t) return;
  const d = toward(ctx.self, t);
  ctx.state.set('dx', d.dx); ctx.state.set('dy', d.dy);
  ctx.use();
  ctx.state.set('busy', ctx.frames(bb.hold));
  if (bb.hold > 0) ctx.applyStatus(ctx.self, 'root', { seconds: bb.hold });
  if (bb.charge > 0) ctx.state.set('charge', ctx.frames(bb.charge));
  else crossFire(ctx);
}

/** 隐匿 (敌能-9): hidden while unblocked and not in the skill. @param {import('@aue/sim').FoeContext} ctx */
function crossHide(ctx) {
  const hidden = ctx.self.buffs.some((b) => b.key === 'hide'), hide = !ctx.blocked && ctx.state.get('busy') === 0;
  if (hide && !hidden) ctx.addBuff(ctx.self, { key: 'hide', flags: { stealth: true } });
  else if (!hide && hidden) ctx.removeBuff(ctx.self, 'hide');
}

/** 掷弹 (敌能-10): once, hurt while unblocked and not silenced — four bomb bolts, then faster and lighter. @type {FoeBehavior} */
const Bomb = Object.freeze({
  tick: (ctx) => {
    const s = ctx.stats(ctx.self);
    if (ctx.state.get('done') || !ctx.hurt || ctx.blocked || s.flags.silence) return;
    ctx.state.set('done', 1);
    for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) ctx.bolt({ dx, dy, type: 'phys', amount: s.atk * ctx.bb.atk_scale, blast: ctx.bb.projectile_range });
    const light = ctx.talent('Light') ?? {};
    ctx.addBuff(ctx.self, { key: 'light', mods: { moveFlat: light.move_speed ?? 0, massFlat: light.mass_level ?? 0 } });
  },
});

/** 强击 (敌能-11): a mark when it appears and whenever its block ends; the next attack with the mark is stronger. @type {FoeBehavior} */
const PowerHit = Object.freeze({
  spawn: (ctx) => { ctx.state.set('mark', 1); },
  tick: (ctx) => { if (ctx.unblocked) ctx.state.set('mark', 1); },
  attack: (ctx, mods) => {
    if (!ctx.state.get('mark')) return mods;
    ctx.state.set('mark', 0);
    return { ...mods, atkPct: (mods.atkPct ?? 0) + ctx.bb.atk };
  },
});

/** Behaviours by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const foeBehaviors = Object.freeze({
  boom, Boom, FirstAttack, atkup, ranged, CrossAttack, Bomb, PowerHit, ...moreFoeBehaviors, ...prisonerBehaviors, ...avengerBehaviors, ...hoverBehaviors,
  ...summonerBehaviors, ...partisanBehaviors, ...sarkazBehaviors, ...devourerBehaviors, ...refractBehaviors, ...statueBehaviors, ...auraBehaviors, ...chargedBehaviors, ...staticBehaviors,
});

/**
 * Talents with no behaviour of their own that are still covered (关卡-2): `dead` is the data's 生命 loss of a neutral
 * unit (合作-9), `Light` is read by `Bomb`, `DmgUp` acts only on devices the engine does not have (敌能-11), `Stronger` is
 * read by `Devour` (敌能-30), `storm` acts only in a 沙尘暴 the engine's levels do not have (敌能-24).
 */
export const FOE_COVERED = Object.freeze(['dead', 'Light', 'DmgUp', 'Stronger', 'storm']);

/**
 * The blackboard keys an ability's behaviour needs that the data tables do not carry (FOE_EXTRAS gives them, from PRTS,
 * enemy by enemy): an enemy whose ability lacks one has no behaviour for it yet (关卡-2).
 */
export const FOE_NEEDS = Object.freeze({
  boom: Object.freeze(['radius', 'delay']), Boom: Object.freeze(['radius', 'delay']), ranged: Object.freeze(['scale']),
  CrossAttack: Object.freeze(['bolts', 'hold', 'charge']), Targets: Object.freeze(['n']), 1: Object.freeze(['ammo']),
  // 远眺's death aura needs a radius; the scouts' on-hit Expose has none. 御4 and 寒霜's defup has one; a def-only defup does not (敌能-35).
  Expose: Object.freeze(['range_radius']), defup: Object.freeze(['range_radius']),
});

/**
 * An enemy's abilities by name with their blackboards (its talents', its skills').
 * @param {EnemyDef} e @returns {[string, Record<string, number | string>][]}
 */
const abilitiesOf = (e) => [...Object.entries(e.talents ?? {}), ...(e.skills ?? []).map((s) => /** @type {[string, Record<string, number | string>]} */ ([s.key, s.bb ?? {}]))];

/** @param {string} k @param {Record<string, unknown>} bb @returns {boolean} whether an ability has what its behaviour needs */
const complete = (k, bb) => (FOE_NEEDS[/** @type {keyof typeof FOE_NEEDS} */ (k)] ?? []).every((n) => typeof bb[n] === 'number');

/**
 * The abilities (talents and skills) of the given enemies — their extras merged — that have no behaviour and are not
 * covered otherwise, or whose behaviour lacks values it needs (FOE_NEEDS) (关卡-2), in order of first appearance.
 * @param {Iterable<EnemyDef>} enemies @returns {string[]}
 */
export function uncoveredAbilities(enemies) {
  const out = new Set();
  for (const e of enemies) {
    for (const [k, bb] of abilitiesOf(e)) if ((!Object.hasOwn(foeBehaviors, k) && !FOE_COVERED.includes(k)) || !complete(k, bb)) out.add(k);
  }
  return [...out];
}

/**
 * An enemy without the abilities whose behaviour lacks values it needs (FOE_NEEDS): in a level being tested they do not
 * act (关卡-8). @param {EnemyDef} e @returns {EnemyDef}
 */
export function withoutIncomplete(e) {
  const talents = Object.entries(e.talents ?? {}).filter(([k, bb]) => complete(k, bb)), skills = (e.skills ?? []).filter((s) => complete(s.key, s.bb ?? {}));
  if (talents.length === Object.keys(e.talents ?? {}).length && skills.length === (e.skills ?? []).length) return e;
  return { ...e, ...(e.talents ? { talents: Object.fromEntries(talents) } : {}), ...(e.skills ? { skills } : {}) };
}
