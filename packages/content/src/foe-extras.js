// Per enemy, what PRTS adds to the blackboards of its talents and skills that the data tables do not carry (关卡-2,
// foes.md), with the revision that gives it. foes.js merges these into the enemies (withFoeExtras).

const PRTS = 'https://prts.wiki/index.php?title=';
/**
 * Per enemy, what to add to a talent's or skill's blackboard, with the PRTS revision that gives it.
 * A value may be text: `enemy_key` is a name, as the data's own blackboards already store it (敌能-64). `FoeSkill.bb` is
 * typed as numbers; the string survives the merge in foes.js and BornBugs reads it with String.
 * @type {Readonly<Record<string, { talents?: Record<string, Record<string, number | string>>, skills?: Record<string, Record<string, number | string>>, source: string }>>}
 */
export const FOE_EXTRAS = Object.freeze({
  // 活性态萨卡兹术师结晶: 不会攻击飞行单位
  enemy_10079_mpmage_2: { talents: { noFly: {} }, source: `${PRTS}%E6%B4%BB%E6%80%A7%E6%80%81%E8%90%A8%E5%8D%A1%E5%85%B9%E6%9C%AF%E5%B8%88%E7%BB%93%E6%99%B6&oldid=435961` },
  // 神勇的帕拉杜利斯: 冲锋 — 仅未被阻挡、且移动方向同一行/列的前方存在非飞行我方单位时可触发
  enemy_10163_mnctur_2: { skills: { rush: { charge: 1 } }, source: `${PRTS}%E7%A5%9E%E5%8B%87%E7%9A%84%E5%B8%95%E6%8B%89%E6%9D%9C%E5%88%A9%E6%96%AF&oldid=443405` },
  // “与我无关”: 燃烧弹 — 在自身所在位置释放一个碰撞半径1.5的燃烧区域弹道
  enemy_1285_sgwlf: { skills: { FireBottle: { radius: 1.5 } }, source: `${PRTS}%E2%80%9C%E4%B8%8E%E6%88%91%E6%97%A0%E5%85%B3%E2%80%9D&oldid=440870` },
  // 伊斯贝塔: 被雪崩唤醒（出场）
  enemy_10145_xdrock: { skills: { start: { rock: 1 } }, source: `${PRTS}%E4%BC%8A%E6%96%AF%E8%B4%9D%E5%A1%94&oldid=436931` },
  // 暴走食人花: 普通攻击……攻击不造成伤害但会强制击倒目标……进入消化模式并强制触发技能【消化】
  enemy_10003_trwlpl_2: { skills: { Devour: { plant: 1 } }, source: `${PRTS}%E6%9A%B4%E8%B5%B0%E9%A3%9F%E4%BA%BA%E8%8A%B1&oldid=435572` },
  // 沉眠伴随兽: 尽可能将目标按原部署方向部署在自身所在格内并使其晕眩3秒
  enemy_10107_mjcdog_2: { skills: { GetChar: { stun: 3 } }, source: `${PRTS}%E6%B2%89%E7%9C%A0%E4%BC%B4%E9%9A%8F%E5%85%BD&oldid=435658` },
  // 冰原卫法者/冰原御法者: 死亡爆炸（爆炸半径1.65，延迟1.2秒，……法术溅射伤害并施加持续5秒寒冷，不可对空）
  enemy_1191_krgrg: { talents: { boom: { radius: 1.65, delay: 1.2, arts: 1, air: 0, sourced: 1 } }, source: `${PRTS}%E5%86%B0%E5%8E%9F%E5%8D%AB%E6%B3%95%E8%80%85&oldid=435604` },
  enemy_1191_krgrg_2: { talents: { boom: { radius: 1.65, delay: 1.2, arts: 1, air: 0, sourced: 1 } }, source: `${PRTS}%E5%86%B0%E5%8E%9F%E5%BE%A1%E6%B3%95%E8%80%85&oldid=435605` },
  // 投矛的士兵/投矛的勇士: 初始模式……不会攻击飞行单位
  enemy_10155_mntjsd: { talents: { noFly: {} }, skills: { change: { spear: 1 } }, source: `${PRTS}%E6%8A%95%E7%9F%9B%E7%9A%84%E5%A3%AB%E5%85%B5&oldid=436689` },
  enemy_10155_mntjsd_2: { talents: { noFly: {} }, skills: { change: { spear: 1 } }, source: `${PRTS}%E6%8A%95%E7%9F%9B%E7%9A%84%E5%8B%87%E5%A3%AB&oldid=436690` },
  // 注亡拟嗣: 攻击附加攻击力60%的侵蚀损伤
  enemy_2024_synut: { talents: { EpDamage: { el: 2 } }, source: `${PRTS}%E6%B3%A8%E4%BA%A1%E6%8B%9F%E5%97%A3&oldid=437089` },
  // 酸液源石虫: 普通攻击不会攻击飞行单位；普通攻击附加1层持续时间无限的【源石虫酸液】：防御力-10（可无限叠加）
  enemy_1004_mslime: { talents: { defdown: { acid: 1 }, noFly: {} }, source: `${PRTS}%E9%85%B8%E6%B6%B2%E6%BA%90%E7%9F%B3%E8%99%AB&oldid=442831` },
  // “庞贝”: 可同时攻击4个目标，不会攻击飞行单位；被阻挡时每10秒对半径1.4范围内的所有我方单位造成1000预计算的无途径法术溅射伤害
  enemy_1050_lslime: { talents: { Targets: { n: 4 }, noFly: {}, rangedamage: { radius: 1.4 } }, source: `${PRTS}%E2%80%9C%E5%BA%9E%E8%B4%9D%E2%80%9D&oldid=440874` },
  // “美食速递”: 占用3个阻挡数；对进入自身半径0.5范围内的位于低地的我方单位/“狂欢之主”造成攻击力100%的物理伤害（不可对空）
  enemy_10038_cnvpiz_2: { talents: { act38side_scale: { block: 3, ram: 1 } }, source: `${PRTS}%E2%80%9C%E7%BE%8E%E9%A3%9F%E9%80%9F%E9%80%92%E2%80%9D&oldid=435407` },
  // “醉后狂欢”: 占用3个阻挡数；仅进行阻挡攻击
  enemy_10039_cnvber_2: { talents: { act38side_scale: { block: 3, ram: 0 } }, source: `${PRTS}%E2%80%9C%E9%86%89%E5%90%8E%E7%8B%82%E6%AC%A2%E2%80%9D&oldid=435527` },
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
  // 萨卡兹枯朽战士/组长: 污染秽蚀可对空，无视无法选择、迷彩 (敌能-46)
  enemy_1267_nhpbr: { talents: { PollutedDie: { air: 1, open: 1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E6%9E%AF%E6%9C%BD%E6%88%98%E5%A3%AB&oldid=375553` },
  enemy_1267_nhpbr_2: { talents: { PollutedDie: { air: 1, open: 1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E6%9E%AF%E6%9C%BD%E6%88%98%E5%A3%AB%E7%BB%84%E9%95%BF&oldid=375554` },
  // 萨卡兹枯朽战车: 只打低地、不打飞行；区域可对空，范围内是我方单位（含装置），不无视无法选择
  enemy_1272_nhtank: { talents: { Empty: { low: 1 } }, skills: { PollutedRangedAtk: { air: 1, wide: 1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E6%9E%AF%E6%9C%BD%E6%88%98%E8%BD%A6&oldid=367663` },
  // 尖端萨卡兹枯朽战车: 低地过滤，区域可对空且无视无法选择、迷彩；有低地非飞行单位才触发，丢失目标返还技力
  enemy_1272_nhtank_2: { talents: { Empty: { low: 1 } }, skills: { PollutedRangedAtk: { air: 1, open: 1, gate: 1, refund: 1 } }, source: `${PRTS}%E5%B0%96%E7%AB%AF%E8%90%A8%E5%8D%A1%E5%85%B9%E6%9E%AF%E6%9C%BD%E6%88%98%E8%BD%A6&oldid=380616` },
  // 暴鸰/暴鸰·G: 静态刚体 (the data has no talent for it; 敌能-37). 不进行普通攻击 is boomb, not this talent (敌能-56).
  enemy_1040_bombd: { talents: { Static: {} }, source: `${PRTS}%E6%9A%B4%E9%B8%9E&oldid=381146` },
  enemy_1040_bombd_2: { talents: { Static: {} }, source: `${PRTS}%E6%9A%B4%E9%B8%9E%C2%B7G&oldid=381145` },
  // 深池方阵战士/深池方阵指挥官: 自身1.5半径内除自身外其它深池方阵战士/深池方阵指挥官防御力增加200（可无限叠加，不可被沉默）
  enemy_1169_duphlx: { talents: { auraDefup: { radius: 1.5 } }, source: `${PRTS}%E6%B7%B1%E6%B1%A0%E6%96%B9%E9%98%B5%E6%88%98%E5%A3%AB&oldid=353488` },
  enemy_1169_duphlx_2: { talents: { auraDefup: { radius: 1.5 } }, source: `${PRTS}%E6%B7%B1%E6%B1%A0%E6%96%B9%E9%98%B5%E6%8C%87%E6%8C%A5%E5%AE%98&oldid=353489` },
  // 深池暗影术师/深池暗影术师队长: 不会攻击飞行单位 — its own talent, not part of 折射
  enemy_1168_dumage: { talents: { noFly: {} }, source: `${PRTS}%E6%B7%B1%E6%B1%A0%E6%9A%97%E5%BD%B1%E6%9C%AF%E5%B8%88&oldid=367785` },
  enemy_1168_dumage_2: { talents: { noFly: {} }, source: `${PRTS}%E6%B7%B1%E6%B1%A0%E6%9A%97%E5%BD%B1%E6%9C%AF%E5%B8%88%E9%98%9F%E9%95%BF&oldid=367786` },
  // 呼啸骑士团 / 沸血骑士团 (敌能-71): `page` marks the six pages read — 保鲜膜骑士 and 劈柴骑士 have the same blackboards and
  // stay uncovered (关卡-2). 呼啸 also 不会攻击飞行单位.
  enemy_1101_plkght: { talents: { buff: { page: 1 }, noFly: {} }, source: `${PRTS}%E5%91%BC%E5%95%B8%E9%AA%91%E5%A3%AB%E5%9B%A2%E5%AD%A6%E5%BE%92&oldid=367224` },
  enemy_1101_plkght_2: { talents: { buff: { page: 1 }, noFly: {} }, source: `${PRTS}%E5%91%BC%E5%95%B8%E9%AA%91%E5%A3%AB%E5%9B%A2%E7%B2%BE%E9%94%90&oldid=367225` },
  enemy_1101_plkght_3: { talents: { buff: { page: 1 }, noFly: {} }, source: `${PRTS}%E2%80%9C%E5%A1%91%E6%96%99%E2%80%9D%E7%91%9F%E5%A5%87%E4%BA%9A%E5%85%8B&oldid=367227` },
  enemy_1103_wdkght: { talents: { enhance: { page: 1 } }, source: `${PRTS}%E6%B2%B8%E8%A1%80%E9%AA%91%E5%A3%AB%E5%9B%A2%E5%AD%A6%E5%BE%92&oldid=359963` },
  enemy_1103_wdkght_2: { talents: { enhance: { page: 1 } }, source: `${PRTS}%E6%B2%B8%E8%A1%80%E9%AA%91%E5%A3%AB%E5%9B%A2%E7%B2%BE%E9%94%90&oldid=391189` },
  enemy_1103_wdkght_3: { talents: { enhance: { page: 1 } }, source: `${PRTS}%E2%80%9C%E9%94%88%E9%93%9C%E2%80%9D%E5%A5%A5%E5%B0%94%E9%BB%98%C2%B7%E8%8B%B1%E6%A0%BC%E6%8B%89&oldid=353356` },
  // 斗志昂扬无人机 (敌能-85): `zeal` marks this page's buff. `page` stays the howling armour, so the two shapes do not
  // cover each other (关卡-2). `Static` is 敌能-37; the buff behaviour sets noAttack for this shape.
  enemy_1106_byokai: { talents: { buff: { zeal: 1 }, Static: {} }, source: `${PRTS}%E6%96%97%E5%BF%97%E6%98%82%E6%89%AC%E6%97%A0%E4%BA%BA%E6%9C%BA&oldid=379223` },
  // 寒霜: 使2.5半径范围内的所有我方单位攻击速度-50%. The data keeps 2.5 on defup; the aura reads atkSpeedDown (敌能-35).
  enemy_1042_frostd: { talents: { atkSpeedDown: { range_radius: 2.5 }, Static: {} }, source: `${PRTS}%E5%AF%92%E9%9C%9C&oldid=371399` },
  // 澪: 普通攻击为2连击, and 寒晖 is those same two hits at 150% (talents [], PowerAttack has only atk_scale)
  enemy_10118_ymgprc: { skills: { PowerAttack: { times: 2 } }, source: `${PRTS}%E6%BE%AA&oldid=358826` },
  // 静态刚体, as each page's ability cell says (the data has no talent for it; 敌能-37). Not their other talents — those are other behaviours.
  enemy_1017_defdrn: { talents: { Static: {} }, source: `${PRTS}%E5%BE%A14&oldid=380622` },
  // 半血恐惧's half and 「最终」 are not in the data (敌能-49). Static stays the 敌能-37 row.
  enemy_10083_hlbird: { talents: { Static: {}, SelfFear: { hp_ratio: 0.5, speed_final: 1 } }, source: `${PRTS}%E2%80%9C%E8%90%A8%E7%A7%91%E5%A1%94%E4%B9%8B%E7%BF%BC%E2%80%9D&oldid=375648` },
  // 夺弹's page mark is `steal` (the hit hook is `cancelHit`; the data's own key is `attack@minus_bullet`).
  enemy_10084_hlegle: { talents: { Static: {}, SelfFear: { hp_ratio: 0.5, speed_final: 1 }, DamageOrBullet: { steal: 1 } }, source: `${PRTS}%E2%80%9C%E8%90%A8%E7%A7%91%E5%A1%94%E4%B9%8B%E7%9C%BC%E2%80%9D&oldid=388054` },
  // 昂首's 半血恐惧 has no 「最终」 (`speed_final` 0). 祈祷邀约's 不可对空 / 无视迷彩 are `air` 0 and `camou` 1.
  enemy_10085_hllevi_2: { talents: { Static: {}, SelfFear: { hp_ratio: 0.5, speed_final: 0 } }, skills: { Roar: { air: 0, camou: 1 } }, source: `${PRTS}%E2%80%9C%E8%90%A8%E7%A7%91%E5%A1%94%E6%98%82%E9%A6%96%E2%80%9D&oldid=376212` },
  enemy_1430_lrrook: { talents: { Static: {} }, source: `${PRTS}%E6%84%A7%E6%82%94%E9%AD%82%E7%81%B5%E5%9C%A3%E6%9D%AF&oldid=386513` },
  // 元素损伤 on the normal attack (敌能-38). `el` is the 元素-1 id (1 神经, 2 侵蚀, 3 灼燃, 4 凋亡); the data has only the ratio.
  // 底海滑动者/富营养的滑动者: 普通攻击额外造成攻击力15%的神经损伤
  enemy_1148_dssbr: { talents: { epdamage: { el: 1 } }, source: `${PRTS}%E5%BA%95%E6%B5%B7%E6%BB%91%E5%8A%A8%E8%80%85&oldid=353445` },
  enemy_1148_dssbr_2: { talents: { epdamage: { el: 1 } }, source: `${PRTS}%E5%AF%8C%E8%90%A5%E5%85%BB%E7%9A%84%E6%BB%91%E5%8A%A8%E8%80%85&oldid=353446` },
  // 骇笑看客: 普通攻击附带自身攻击力20%的神经损伤
  enemy_2009_csaudc: { talents: { combat: { el: 1 } }, source: `${PRTS}%E9%AA%87%E7%AC%91%E7%9C%8B%E5%AE%A2&oldid=354182` },
  // 绯红歌伶: 普通攻击附带自身攻击力20%的神经损伤 (AttackSpeedUp is entirely in the data)
  enemy_2010_csdcr: { talents: { attack: { el: 1 } }, source: `${PRTS}%E7%BB%AF%E7%BA%A2%E6%AD%8C%E4%BC%B6&oldid=354183` },
  // 灼热源石虫/炽焰源石虫: 攻击造成法术伤害，并附加自身攻击力100%的灼燃损伤
  enemy_1305_mhslim: { talents: { EpDamage: { el: 3 } }, source: `${PRTS}%E7%81%BC%E7%83%AD%E6%BA%90%E7%9F%B3%E8%99%AB&oldid=367189` },
  enemy_1305_mhslim_2: { talents: { EpDamage: { el: 3 } }, source: `${PRTS}%E7%82%BD%E7%84%B0%E6%BA%90%E7%9F%B3%E8%99%AB&oldid=367187` },
  // 控潮术师/领潮员/术师快艇: 目标及其周围四格, 攻击力80%的侵蚀损伤. `cross` 1 is that splash (敌能-26).
  enemy_1161_tidmag: { talents: { EpDamage: { el: 2, cross: 1 } }, source: `${PRTS}%E6%8E%A7%E6%BD%AE%E6%9C%AF%E5%B8%88&oldid=365951` },
  enemy_1161_tidmag_2: { talents: { EpDamage: { el: 2, cross: 1 } }, source: `${PRTS}%E9%A2%86%E6%BD%AE%E5%91%98&oldid=353468` },
  enemy_1162_magmot: { talents: { EpDamage: { el: 2, cross: 1 } }, source: `${PRTS}%E6%9C%AF%E5%B8%88%E5%BF%AB%E8%89%87&oldid=353469` },
  // 骨海漂流体: 攻击附加相当于攻击力20%的侵蚀损伤
  enemy_2021_syfish: { talents: { EpDamage: { el: 2 } }, source: `${PRTS}%E9%AA%A8%E6%B5%B7%E6%BC%82%E6%B5%81%E4%BD%93&oldid=354187` },
  // 掠海漂移体: 侵蚀 is 敌能-38; Float's 近地悬浮 is 敌能-48; noFly is 不会攻击飞行单位 (敌能-33).
  enemy_2025_syufo: { talents: { EpDamage: { el: 2 }, Float: {}, noFly: {} }, source: `${PRTS}%E6%8E%A0%E6%B5%B7%E6%BC%82%E7%A7%BB%E4%BD%93&oldid=379242` },
  // 无胄盟清扫小队: 普通攻击时额外造成攻击力35%的侵蚀损伤 (PowerAttack is another family)
  enemy_1183_mlasrt: { talents: { EpDamage: { el: 2 }, noFly: {} }, source: `${PRTS}%E6%97%A0%E8%83%84%E7%9B%9F%E6%B8%85%E6%89%AB%E5%B0%8F%E9%98%9F&oldid=367257` },
  // 萨卡兹王庭军战士/术师 and their elites: 凋亡, the same pages (no separate elite page). `el` 4.
  enemy_1229_darmy: { talents: { epdamage: { el: 4 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E7%8E%8B%E5%BA%AD%E5%86%9B%E6%88%98%E5%A3%AB&oldid=436441` },
  enemy_1229_darmy_2: { talents: { epdamage: { el: 4 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E7%8E%8B%E5%BA%AD%E5%86%9B%E6%88%98%E5%A3%AB&oldid=436441` },
  enemy_1275_dwlock: { talents: { empty: { el: 4 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E7%8E%8B%E5%BA%AD%E5%86%9B%E6%9C%AF%E5%B8%88&oldid=436440` },
  enemy_1275_dwlock_2: { talents: { empty: { el: 4 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E7%8E%8B%E5%BA%AD%E5%86%9B%E6%9C%AF%E5%B8%88&oldid=436440` },
  // 岁兽残响 bodies: 无法被阻挡，不进行普通攻击，具有特殊生命值机制 (the data has no talent for it)
  enemy_1196_msfyin: { talents: { hitCount: {} }, source: `${PRTS}%E6%9C%A8%E5%88%B6%E7%91%9E%E5%8D%B0&oldid=365791` },
  enemy_1196_msfyin_2: { talents: { hitCount: {} }, source: `${PRTS}%E7%BA%A2%E6%9C%A8%E7%91%9E%E5%8D%B0&oldid=365790` },
  enemy_1198_msfshu: { talents: { hitCount: {} }, source: `${PRTS}%E5%B0%8F%E8%AF%B4%E5%8D%B7%E8%BD%B4&oldid=353547` },
  enemy_1198_msfshu_2: { talents: { hitCount: {} }, source: `${PRTS}%E8%AF%97%E7%94%BB%E5%8D%B7%E8%BD%B4&oldid=365788` },
  enemy_1200_msfjin: { talents: { hitCount: {} }, source: `${PRTS}%E9%9D%92%E9%93%9C%E9%95%9C&oldid=365787` },
  enemy_1200_msfjin_2: { talents: { hitCount: {} }, source: `${PRTS}%E9%BB%84%E9%93%9C%E9%95%9C&oldid=365786` },
  enemy_1202_msfzhi: { talents: { hitCount: {} }, source: `${PRTS}%E6%9C%A8%E5%88%B6%E9%95%87%E7%BA%B8&oldid=365785` },
  enemy_1202_msfzhi_2: { talents: { hitCount: {} }, source: `${PRTS}%E7%BA%A2%E6%9C%A8%E9%95%87%E7%BA%B8&oldid=353556` },
  // 磨砻 / 雅气: 因坠落以外的原因死亡后才召唤 (the data's DeadSpawn has no fall)
  enemy_1195_sfyin: { talents: { DeadSpawn: { fall: 0 } }, source: `${PRTS}%E7%A3%A8%E7%A0%BB&oldid=381889` },
  enemy_1197_sfshu_2: { talents: { DeadSpawn: { fall: 0 } }, source: `${PRTS}%E9%9B%85%E6%B0%94&oldid=381892` },
  // 烹泉: 半径 1.0 的法术溅射；因坠落以外的原因才召唤；死亡爆炸半径 1.25、延迟 0、不可对空、攻击力 100%
  enemy_1203_sfhu: { talents: { Splash: { radius: 1 }, DeadSpawn: { fall: 0 }, DeadBoom: { radius: 1.25, delay: 0, air: 0, atk_scale: 1 } }, source: `${PRTS}%E7%83%B9%E6%B3%89&oldid=381901` },
  // 沏虹: 半径 1；页面没有「因坠落以外」，坠落也召唤；死亡爆炸同烹泉（不可对空为推断 INF-0343）
  enemy_1203_sfhu_2: { talents: { Splash: { radius: 1 }, DeadBoom: { radius: 1.25, delay: 0, air: 0, atk_scale: 1 } }, source: `${PRTS}%E6%B3%8C%E8%99%B9&oldid=353558` },
  // 青瓷茶器 / 彩瓷茶器: 只接受法术和真实伤害（数据里没有这项天赋）
  enemy_1204_msfhu: { talents: { hitCount: { arts: 1, true: 1 } }, source: `${PRTS}%E9%9D%92%E7%93%B7%E8%8C%B6%E5%99%A8&oldid=397896` },
  enemy_1204_msfhu_2: { talents: { hitCount: { arts: 1, true: 1 } }, source: `${PRTS}%E5%BD%A9%E7%93%B7%E8%8C%B6%E5%99%A8&oldid=365782` },
  // 新硎: 因坠落以外的原因. 沉沙's page says 死亡后, so a fall still spawns (敌能-44).
  enemy_1207_sfji_2: { talents: { DeadSpawn: { fall: 0 } }, source: `${PRTS}%E6%96%B0%E7%A1%8E&oldid=381907` },
  // 矛头 / 灯盘: 无法被阻挡，不进行普通攻击，具有特殊生命值机制 (the data has no talent for it)
  enemy_1208_msfji: { talents: { hitCount: {} }, source: `${PRTS}%E9%93%9C%E7%9F%9B%E5%A4%B4&oldid=365776` },
  enemy_1208_msfji_2: { talents: { hitCount: {} }, source: `${PRTS}%E9%93%81%E7%9F%9B%E5%A4%B4&oldid=365775` },
  enemy_1210_msfden: { talents: { hitCount: {} }, source: `${PRTS}%E9%93%9C%E7%81%AF%E7%9B%98&oldid=414298` },
  enemy_1210_msfden_2: { talents: { hitCount: {} }, source: `${PRTS}%E9%93%81%E7%81%AF%E7%9B%98&oldid=365778` },
  // 清明 / 堂皇: a fall does not spawn, and only the skill (not the talent of the same name) runs 范围隐匿.
  enemy_1209_sfden: { talents: { DeadSpawn: { fall: 0 } }, skills: { InvisibleShield: { cast: 1 } }, source: `${PRTS}%E6%B8%85%E6%98%8E&oldid=376397` },
  enemy_1209_sfden_2: { talents: { DeadSpawn: { fall: 0 } }, skills: { InvisibleShield: { cast: 1 } }, source: `${PRTS}%E5%A0%82%E7%9A%87&oldid=389600` },
  // 深溟巢涌者 (敌能-47): 脉冲对每个目标都带神经损伤，持有抵抗状态（form 1）。黑板与富营养的相同，form 才分开两页。
  enemy_1234_dsubrl: { talents: { EpDamage: { pulse: 1, form: 1 }, Buff: { form: 1 } }, source: `${PRTS}%E6%B7%B1%E6%BA%9F%E5%B7%A2%E6%B6%8C%E8%80%85&oldid=353623` },
  // 富营养的巢涌者: 消失时不脉冲，神经损伤只在扣到生命时，倍率不是抵抗状态（form 2）。
  enemy_1234_dsubrl_2: { talents: { EpDamage: { pulse: 1, form: 2 }, Buff: { form: 2 } }, source: `${PRTS}%E5%AF%8C%E8%90%A5%E5%85%BB%E7%9A%84%E5%B7%A2%E6%B6%8C%E8%80%85&oldid=376164` },
  // 狂暴宿主 / 冬灵血巫: 自身每秒受到 N 无来源真实伤害. `self` marks the six pages that were read (敌能-50); the same
  // `{ damage }` shape on unread enemies stays uncovered. The two throwers also refuse flyers (noFly, 敌能-33).
  enemy_1062_rager: { talents: { periodic_damage: { self: 1 } }, source: `${PRTS}%E7%8B%82%E6%9A%B4%E5%AE%BF%E4%B8%BB%E5%A3%AB%E5%85%B5&oldid=375739` },
  enemy_1062_rager_2: { talents: { periodic_damage: { self: 1 } }, source: `${PRTS}%E7%8B%82%E6%9A%B4%E5%AE%BF%E4%B8%BB%E7%BB%84%E9%95%BF&oldid=375736` },
  enemy_1063_rageth: { talents: { periodic_damage: { self: 1 }, noFly: {} }, source: `${PRTS}%E7%8B%82%E6%9A%B4%E5%AE%BF%E4%B8%BB%E6%8A%95%E6%8E%B7%E6%89%8B&oldid=375737` },
  enemy_1063_rageth_2: { talents: { periodic_damage: { self: 1 }, noFly: {} }, source: `${PRTS}%E7%8B%82%E6%9A%B4%E5%AE%BF%E4%B8%BB%E6%8E%B7%E9%AA%A8%E6%89%8B&oldid=375738` },
  enemy_1089_ltlntc: { talents: { periodic_damage: { self: 1 } }, source: `${PRTS}%E5%86%AC%E7%81%B5%E8%A1%80%E5%B7%AB&oldid=386577` },
  enemy_1089_ltlntc_2: { talents: { periodic_damage: { self: 1 } }, source: `${PRTS}%E5%86%AC%E7%81%B5%E8%A1%80%E5%B7%AB%E5%A4%A7%E5%B8%88&oldid=375740` },
  // 弧光镜卫: 仅在层数≥2层时生效. 15/45 are the page's visual marks, not a rule (敌能-52).
  enemy_1329_cbshld: { talents: { def_reduce: { gate: 2 } }, source: `${PRTS}%E5%BC%A7%E5%85%89%E9%95%9C%E5%8D%AB&oldid=382112` },
  // 弧光镜卫长: the same talent and keys; its older page predates the ≥2 wording (敌能-52, INF-0403). 15/60 are visual only.
  enemy_1329_cbshld_2: { talents: { def_reduce: { gate: 2 } }, source: `${PRTS}%E5%BC%A7%E5%85%89%E9%95%9C%E5%8D%AB%E9%95%BF&oldid=353797` },
  // 萨卡兹穿刺手/组长 (敌能-53): `paged` is only on the two pages that were read, so the same keys on unread enemies stay uncovered
  enemy_1072_dlancer: { talents: { rush: { paged: 1 }, firstattack: { paged: 1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E7%A9%BF%E5%88%BA%E6%89%8B&oldid=369390` },
  enemy_1072_dlancer_2: { talents: { rush: { paged: 1 }, firstattack: { paged: 1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E7%A9%BF%E5%88%BA%E6%89%8B%E7%BB%84%E9%95%BF&oldid=369391` },
  // 萨卡兹悖谬暴虐兵/兵长: 占用3个阻挡数；首次攻击对目标和周围4格造成攻击力150%（只能一次）。`once` 把同名的另外三种技能留在未覆盖。
  enemy_1320_wdrrl: { talents: { AOEAttack: { block: 3, once: 1 } }, skills: { AOEAttack: { once: 1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E6%82%96%E8%B0%AC%E6%9A%B4%E8%99%90%E5%85%B5&oldid=363187` },
  enemy_1320_wdrrl_2: { talents: { AOEAttack: { block: 3, once: 1 } }, skills: { AOEAttack: { once: 1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E6%82%96%E8%B0%AC%E6%9A%B4%E8%99%90%E5%85%B5%E9%95%BF&oldid=389613` },
  // 抱蛋羽兽/拥霜羽兽: 不会攻击飞行单位；失衡移动结束后每 0.1 秒尝试强制触发【失去蛋】。`egg` marks the pages read.
  enemy_10141_xdpeng: { talents: { speed: { every: 0.1 }, noFly: {} }, skills: { switch: { egg: 1 } }, source: `${PRTS}%E6%8A%B1%E8%9B%8B%E7%BE%BD%E5%85%BD&oldid=374461` },
  enemy_10141_xdpeng_2: { talents: { speed: { every: 0.1 }, noFly: {} }, skills: { switch: { egg: 1 } }, source: `${PRTS}%E6%8B%A5%E9%9C%9C%E7%BE%BD%E5%85%BD&oldid=374462` },
  // 新手祭司学徒: 倒下后为附近的一个喷泉水池补充水量，并治疗周围敌人. `page` is only the coverage marker (敌能-58): the
  // unread twin 见习祭司学徒 has the same blackboard and stays uncovered until its own page is read (关卡-2).
  enemy_10156_mncrer: { talents: { Boom: { page: 1 } }, source: `${PRTS}%E6%96%B0%E6%89%8B%E7%A5%AD%E5%8F%B8%E5%AD%A6%E5%BE%92&oldid=379778` },
  // 伦蒂尼姆城防自行炮/高准度伦蒂尼姆城防自行炮: 轰炸持续 6 秒、每 0.5 秒、最多 10 次（页面；数据只有 atk_scale）
  enemy_1273_stmgun: { skills: { Cannon: { duration: 6, interval: 0.5, times: 10 } }, source: `${PRTS}%E4%BC%A6%E8%92%82%E5%B0%BC%E5%A7%86%E5%9F%8E%E9%98%B2%E8%87%AA%E8%A1%8C%E7%82%AE&oldid=353692` },
  enemy_1273_stmgun_2: { skills: { Cannon: { duration: 6, interval: 0.5, times: 10 } }, source: `${PRTS}%E9%AB%98%E5%87%86%E5%BA%A6%E4%BC%A6%E8%92%82%E5%B0%BC%E5%A7%86%E5%9F%8E%E9%98%B2%E8%87%AA%E8%A1%8C%E7%82%AE&oldid=353693` },
  // 集团军轻型/重型火炮: 燃烧区域半径 1.5 只在页面上。数据的 projectile_range 1 是溅射半径 (敌能-60)
  enemy_10122_uacann: { talents: { ProjectileBoomRange: { zone: 1.5 } }, source: `${PRTS}%E9%9B%86%E5%9B%A2%E5%86%9B%E8%BD%BB%E5%9E%8B%E7%81%AB%E7%82%AE&oldid=369386` },
  enemy_10122_uacann_2: { talents: { ProjectileBoomRange: { zone: 1.5 } }, source: `${PRTS}%E9%9B%86%E5%9B%A2%E5%86%9B%E9%87%8D%E5%9E%8B%E7%81%AB%E7%82%AE&oldid=377750` },
  // 圣堂剑士 / 精锐圣堂剑士: 技力槽 5/5 and 7/7 are the ammo (弹药上限：5 / 7). The level data carries no spData, so the
  // page's number goes on the skill (敌能-61); the database's maxSp and initSp are the same.
  enemy_10087_hlchgr: { skills: { ForeverEnhance: { ammo: 5 } }, source: `${PRTS}%E5%9C%A3%E5%A0%82%E5%89%91%E5%A3%AB&oldid=375658` },
  enemy_10087_hlchgr_2: { skills: { ForeverEnhance: { ammo: 7 } }, source: `${PRTS}%E7%B2%BE%E9%94%90%E5%9C%A3%E5%A0%82%E5%89%91%E5%A3%AB&oldid=375659` },
  // 咸鳞汁推荐者 / 朗姆酒推荐者: carry is the page's 酒桶; radius 2 is only on the page (敌能-62). 假酒海盗 is not here.
  enemy_10044_wintun: { talents: { 1: { carry: 1 } }, skills: { BlockedBoom: { radius: 2 } }, source: `${PRTS}%E5%92%B8%E9%B3%9E%E6%B1%81%E6%8E%A8%E8%8D%90%E8%80%85&oldid=362308` },
  enemy_10044_wintun_2: { talents: { 1: { carry: 1 } }, skills: { BlockedBoom: { radius: 2 } }, source: `${PRTS}%E6%9C%97%E5%A7%86%E9%85%92%E6%8E%A8%E8%8D%90%E8%80%85&oldid=362309` },
  // 枯朽萃聚使徒 / 腐败萃聚使徒 (敌能-64): 0.7s later, one seed on itself and one a tile to either side; it does not attack.
  enemy_1321_wdarft: { talents: { NoAttack: {} }, skills: { BornBugs: { delay: 0.7, left: 1, right: 1, enemy_key: 'enemy_1269_nhfly' } }, source: `${PRTS}%E6%9E%AF%E6%9C%BD%E8%90%83%E8%81%9A%E4%BD%BF%E5%BE%92&oldid=353783` },
  enemy_1321_wdarft_2: { talents: { NoAttack: {} }, skills: { BornBugs: { delay: 0.7, left: 1, right: 1, enemy_key: 'enemy_1269_nhfly_2' } }, source: `${PRTS}%E8%85%90%E8%B4%A5%E8%90%83%E8%81%9A%E4%BD%BF%E5%BE%92&oldid=353784` },
  // 枯朽之种 / 腐败之种: 静态刚体 is 敌能-37's Static. SelfDown is the knock-down after the hit. The data has neither.
  enemy_1269_nhfly: { talents: { Static: {}, SelfDown: {} }, source: `${PRTS}%E6%9E%AF%E6%9C%BD%E4%B9%8B%E7%A7%8D&oldid=373372` },
  enemy_1269_nhfly_2: { talents: { Static: {}, SelfDown: {} }, source: `${PRTS}%E8%85%90%E8%B4%A5%E4%B9%8B%E7%A7%8D&oldid=373373` },
  // 泥岩小队践行者 / 组长: 出场后获得可吸收法术伤害的屏障；该屏障存在时最大生命值+50%、攻击速度+50.
  // `page` marks the two pages that were read (敌能-66). The same blackboard without it stays uncovered (关卡-2).
  enemy_1091_mdhmmr: { talents: { shield: { page: 1 } }, source: `${PRTS}%E6%B3%A5%E5%B2%A9%E5%B0%8F%E9%98%9F%E8%B7%B5%E8%A1%8C%E8%80%85&oldid=361721` },
  enemy_1091_mdhmmr_2: { talents: { shield: { page: 1 } }, source: `${PRTS}%E6%B3%A5%E5%B2%A9%E5%B0%8F%E9%98%9F%E8%B7%B5%E8%A1%8C%E8%80%85%E7%BB%84%E9%95%BF&oldid=361722` },
  // R-31 / R-31a: 半径 0.8 is on the page, not in the blackboard (敌能-67). 神拳机甲 shares the shape and gets no marker.
  enemy_1255_lybgpa: { skills: { Punch: { radius: 0.8 } }, source: `${PRTS}R-31%E9%87%8D%E5%9E%8B%E5%8A%A8%E5%8A%9B%E8%A3%85%E7%94%B2&oldid=380911` },
  enemy_1255_lybgpa_2: { skills: { Punch: { radius: 0.8 } }, source: `${PRTS}R-31a%E9%87%8D%E5%9E%8B%E5%8A%A8%E5%8A%9B%E8%A3%85%E7%94%B2&oldid=391946` },
  // R-11 / R-11a: 未被阻挡时远程攻击最多同时攻击4个目标. The 4 is not in the data (敌能-68). R-11a also 不会攻击飞行单位.
  enemy_1256_lyacpa: { talents: { Passive: { targets: 4 } }, source: `${PRTS}R-11%E7%AA%81%E5%87%BB%E5%8A%A8%E5%8A%9B%E8%A3%85%E7%94%B2&oldid=325101` },
  enemy_1256_lyacpa_2: { talents: { Passive: { targets: 4 }, noFly: {} }, source: `${PRTS}R-11a%E7%AA%81%E5%87%BB%E5%8A%A8%E5%8A%9B%E8%A3%85%E7%94%B2&oldid=365927` },
  // 热情丰碑: 攻击具有1.8的溅射半径. `air` 1 separates it from 烹泉's Splash (敌能-69, 敌能-43).
  enemy_4038_mufbsd: { talents: { Splash: { radius: 1.8, air: 1 } }, source: `${PRTS}%E7%83%AD%E6%83%85%E4%B8%B0%E7%A2%91&oldid=364868` },
  // 狂奔丰碑: 无法被阻挡. The data has no talent for it; not noAttack (敌能-69).
  enemy_4039_mufbse: { talents: { unblockable: {} }, source: `${PRTS}%E7%8B%82%E5%A5%94%E4%B8%B0%E7%A2%91&oldid=364869` },
  // 碎骨: 不会攻击飞行单位; 未被阻挡时榴弹（攻击力 26%，目标及周围八格，防御力下降 50% 持续 5 秒）. The flat `defdown` users get none of these.
  enemy_1500_skulsr: { talents: { defdown: { scale: 0.26, duration: 5, square: 1 }, noFly: {} }, source: `${PRTS}%E7%A2%8E%E9%AA%A8&oldid=367689` },
  // 萨卡兹术师 / 萨卡兹术师组长: 不会攻击飞行单位 (the data has no talent). `page` marks 枷锁 as read (敌能-72); the same
  // blackboard on 萨卡兹业余术师 has no snapshot, so it stays uncovered (关卡-2).
  enemy_1022_dmage: { talents: { noFly: {} }, skills: { lasso: { page: 1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E6%9C%AF%E5%B8%88&oldid=380593` },
  enemy_1022_dmage_2: { talents: { noFly: {} }, skills: { lasso: { page: 1 } }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E6%9C%AF%E5%B8%88%E7%BB%84%E9%95%BF&oldid=413933` },
  // “灰礼帽” / “见习灰礼帽”: 失衡免疫 (the data has no talent for it; 敌能-73). The skill's numbers are already in the data.
  enemy_1322_wdgyht: { talents: { ShiftImmune: {} }, source: `${PRTS}%E2%80%9C%E7%81%B0%E7%A4%BC%E5%B8%BD%E2%80%9D&oldid=355349` },
  enemy_1322_wdgyht_2: { talents: { ShiftImmune: {} }, source: `${PRTS}%E2%80%9C%E8%A7%81%E4%B9%A0%E7%81%B0%E7%A4%BC%E5%B8%BD%E2%80%9D&oldid=355350` },
  // 梅菲斯特: 在场时令所有敌方单位的生命回复速度+100%. `field` marks this page; the other `healaura` blackboards are not it (敌能-74).
  enemy_1507_mephi: { talents: { healaura: { field: 1 } }, source: `${PRTS}%E6%A2%85%E8%8F%B2%E6%96%AF%E7%89%B9&oldid=371401` },
  // 至纯源石球: 「进球时获得3倍得分」 (足球-7)
  enemy_4019_mugold: { talents: { physic: { score: 3 } }, source: `${PRTS}%E8%87%B3%E7%BA%AF%E6%BA%90%E7%9F%B3%E7%90%83&oldid=437059` },
  // 净浊之焰: 「…攻击力100%灼燃损伤」 (敌能-38, el 3; its blast is 敌能-93)
  enemy_1177_dufrbl_2: { talents: { epdamage: { el: 3 } }, source: `${PRTS}%E5%87%80%E6%B5%8A%E4%B9%8B%E7%84%B0&oldid=436069` },
  // 箭棘兽: 「弱点部位位于正面，背面所受伤害降低」 — its `Weakness` is of the damage from behind (敌能-91)
  enemy_1310_mhprpn_2: { talents: { Weakness: { back: 1 } }, source: `${PRTS}%E7%AE%AD%E6%A3%98%E5%85%BD&oldid=439219` },
  // 狙击步兵组长: 天赋「不会攻击飞行单位」 (敌能-33); its 眩晕打击 is 敌能-36
  enemy_1047_sagent_2: { talents: { noFly: {} }, source: `${PRTS}%E7%8B%99%E5%87%BB%E6%AD%A5%E5%85%B5%E7%BB%84%E9%95%BF&oldid=436077` },
  // 无胄盟第三小队组长: 「普通攻击时额外造成攻击力35%的侵蚀损伤」 (敌能-38, el 2)，「普通攻击与技能不会攻击飞行单位」 (敌能-33)
  enemy_1182_flasrt_2: { talents: { EpDamage: { el: 2 }, noFly: {} }, source: `${PRTS}%E6%97%A0%E8%83%84%E7%9B%9F%E7%AC%AC%E4%B8%89%E5%B0%8F%E9%98%9F%E7%BB%84%E9%95%BF&oldid=436771` },
  // 北境意志球 / 底海滑动球: 「进入未覆盖冰面的球场地块时，将该地块切换为冰面状态：摩擦力-0.3」 / 粘液 +0.3 (足球-16)
  enemy_4033_muftic: { talents: { physic: { cover: -0.3 } }, source: `${PRTS}%E5%8C%97%E5%A2%83%E6%84%8F%E5%BF%97%E7%90%83&oldid=435576` },
  enemy_4034_muftgl: { talents: { physic: { cover: 0.3 } }, source: `${PRTS}%E5%BA%95%E6%B5%B7%E6%BB%91%E5%8A%A8%E7%90%83&oldid=435718` },
  // 战术队击球手 / 战术队精英击球手: 射门、传球「必定瞄准前方没有阵地屏障的/守门位没有干员的球门」 (足球-15)
  enemy_4022_mushtm: { talents: { football: { aim: 1 } }, source: `${PRTS}%E6%88%98%E6%9C%AF%E9%98%9F%E5%87%BB%E7%90%83%E6%89%8B&oldid=437027` },
  enemy_4022_mushtm_2: { talents: { football: { aim: 1 } }, source: `${PRTS}%E6%88%98%E6%9C%AF%E9%98%9F%E7%B2%BE%E8%8B%B1%E5%87%BB%E7%90%83%E6%89%8B&oldid=437029` },
  // 战术队守门员 / 战术队精英守门员: 发球「总是瞄准自身与球门之间无我方单位/阵地屏障遮挡的球门」 (足球-15)
  enemy_4023_mushtb: { talents: { football: { aim: 1 } }, source: `${PRTS}%E6%88%98%E6%9C%AF%E9%98%9F%E5%AE%88%E9%97%A8%E5%91%98&oldid=437032` },
  enemy_4023_mushtb_2: { talents: { football: { aim: 1 } }, source: `${PRTS}%E6%88%98%E6%9C%AF%E9%98%9F%E7%B2%BE%E8%8B%B1%E5%AE%88%E9%97%A8%E5%91%98&oldid=437031` },
  // 爱球会守门员 / 爱球会荣誉守门员: 发球「优先瞄准击球手」 (足球-15)
  enemy_4026_muhryb: { talents: { football: { toForward: 1 } }, source: `${PRTS}%E7%88%B1%E7%90%83%E4%BC%9A%E5%AE%88%E9%97%A8%E5%91%98&oldid=435541` },
  enemy_4026_muhryb_2: { talents: { football: { toForward: 1 } }, source: `${PRTS}%E7%88%B1%E7%90%83%E4%BC%9A%E8%8D%A3%E8%AA%89%E5%AE%88%E9%97%A8%E5%91%98&oldid=435540` },
  // 直球队击球手 / 直球队坚定击球手: 「射门力度更大，只会按照水平方向射门」；直球队守门员 / 直球队坚定守门员: 「开球力度更大，只会按照水平方向开球」 (锦标-3)
  enemy_4060_mulinm: { talents: { football: { flat: 1 } }, source: `${PRTS}%E7%9B%B4%E7%90%83%E9%98%9F%E5%87%BB%E7%90%83%E6%89%8B&oldid=437064` },
  enemy_4060_mulinm_2: { talents: { football: { flat: 1 } }, source: `${PRTS}%E7%9B%B4%E7%90%83%E9%98%9F%E5%9D%9A%E5%AE%9A%E5%87%BB%E7%90%83%E6%89%8B&oldid=437066` },
  enemy_4061_mulinb: { talents: { football: { flat: 1 } }, source: `${PRTS}%E7%9B%B4%E7%90%83%E9%98%9F%E5%AE%88%E9%97%A8%E5%91%98&oldid=437069` },
  enemy_4061_mulinb_2: { talents: { football: { flat: 1 } }, source: `${PRTS}%E7%9B%B4%E7%90%83%E9%98%9F%E5%9D%9A%E5%AE%9A%E5%AE%88%E9%97%A8%E5%91%98&oldid=437068` },
  // 门神会击球手 / 门神会忠诚击球手: 「触球后会把足球回传给守门员」；门神会守门员 / 门神会全能守门员: 「会瞄准没有被<阵地屏障>阻挡的球门方向」 (锦标-3)
  enemy_4057_mugoam: { talents: { football: { toKeeper: 1 } }, source: `${PRTS}%E9%97%A8%E7%A5%9E%E4%BC%9A%E5%87%BB%E7%90%83%E6%89%8B&oldid=436223` },
  enemy_4057_mugoam_2: { talents: { football: { toKeeper: 1 } }, source: `${PRTS}%E9%97%A8%E7%A5%9E%E4%BC%9A%E5%BF%A0%E8%AF%9A%E5%87%BB%E7%90%83%E6%89%8B&oldid=436227` },
  enemy_4058_mugoab: { talents: { football: { aim: 1 } }, source: `${PRTS}%E9%97%A8%E7%A5%9E%E4%BC%9A%E5%AE%88%E9%97%A8%E5%91%98&oldid=436226` },
  enemy_4058_mugoab_2: { talents: { football: { aim: 1 } }, source: `${PRTS}%E9%97%A8%E7%A5%9E%E4%BC%9A%E5%85%A8%E8%83%BD%E5%AE%88%E9%97%A8%E5%91%98&oldid=436225` },
  // 魔球帮击人手 / 魔球帮诡秘击人手: 「优先寻找足球附近的我方目标」 (锦标-3)
  enemy_4056_musupg: { talents: { searchtarget: { nearBall: 1 } }, source: `${PRTS}%E9%AD%94%E7%90%83%E5%B8%AE%E5%87%BB%E4%BA%BA%E6%89%8B&oldid=436252` },
  enemy_4056_musupg_2: { talents: { searchtarget: { nearBall: 1 } }, source: `${PRTS}%E9%AD%94%E7%90%83%E5%B8%AE%E8%AF%A1%E7%A7%98%E5%87%BB%E4%BA%BA%E6%89%8B&oldid=436249` },
  // “锤锤到肉”阵地击人手: its periodic_damage of 330 has no text on its page (oldid=435315 keeps the blackboard in a
  // comment); every page that writes the talent out says 「自身每秒受到N…真实伤害」 (敌能-50), so it is that (足球-11)
  enemy_4014_mugnfu_2: { talents: { periodic_damage: { self: 1 } }, source: `${PRTS}%E2%80%9C%E9%94%A4%E9%94%A4%E5%88%B0%E8%82%89%E2%80%9D%E9%98%B5%E5%9C%B0%E5%87%BB%E4%BA%BA%E6%89%8B&oldid=435315` },
  // 吸血 (敌能-75). `page` marks a page that was read; 虹吸巨刃 has the same numbers and stays uncovered (关卡-2).
  // 萨卡兹宿主百夫长 / 卫巢百夫长: 最多同时攻击3个目标，不会攻击飞行单位；成功造成伤害后治疗伤害量的 150%。
  enemy_1114_rgrdmn: { talents: { vampire: { page: 1 }, noFly: {} }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E5%AE%BF%E4%B8%BB%E7%99%BE%E5%A4%AB%E9%95%BF&oldid=365976` },
  enemy_1114_rgrdmn_2: { talents: { vampire: { page: 1 }, noFly: {} }, source: `${PRTS}%E8%90%A8%E5%8D%A1%E5%85%B9%E5%AE%BF%E4%B8%BB%E5%8D%AB%E5%B7%A2%E7%99%BE%E5%A4%AB%E9%95%BF&oldid=365977` },
  // 新生血裔 / 渴血的子裔 / 饱腹的子裔: 成功造成伤害后治疗伤害量的 220%。页面没有「不会攻击飞行单位」。
  enemy_1360_dfello: { talents: { vampire: { page: 1 } }, source: `${PRTS}%E6%96%B0%E7%94%9F%E8%A1%80%E8%A3%94&oldid=365296` },
  enemy_1228_dslime: { talents: { vampire: { page: 1 } }, source: `${PRTS}%E6%B8%B4%E8%A1%80%E7%9A%84%E5%AD%90%E8%A3%94&oldid=353607` },
  enemy_1228_dslime_2: { talents: { vampire: { page: 1 } }, source: `${PRTS}%E9%A5%B1%E8%85%B9%E7%9A%84%E5%AD%90%E8%A3%94&oldid=353608` },
  // W: the cast is 3.2 s (the page; the data has no duration). noFly is the page's normal attack. The half-HP reset is the skill, not a talent (敌能-76).
  enemy_1504_cqbw: { talents: { noFly: {} }, skills: { C4: { cast: 3.2 } }, source: `${PRTS}W(%E6%95%8C%E6%96%B9)&oldid=378514` },
  // 微光之触. `page` marks the three pages that were read (关卡-2). `ground` is the pages that refuse a flying lock.
  // noFly is 「普通攻击不会攻击飞行单位」 (敌能-33); 精锐's page does not say it.
  enemy_1184_cadkgt: { talents: { noFly: {} }, skills: { ChargeAttack: { page: 1, ground: 1 } }, source: `${PRTS}%E6%95%A3%E5%8D%8E%E9%AA%91%E5%A3%AB%E5%9B%A2%E5%AD%A6%E5%BE%92&oldid=367691` },
  enemy_1184_cadkgt_2: { skills: { ChargeAttack: { page: 1 } }, source: `${PRTS}%E6%95%A3%E5%8D%8E%E9%AA%91%E5%A3%AB%E5%9B%A2%E7%B2%BE%E9%94%90&oldid=287514` },
  enemy_1184_cadkgt_3: { talents: { noFly: {} }, skills: { ChargeAttack: { page: 1, ground: 1 } }, source: `${PRTS}%E7%83%9B%E9%AA%91%E5%A3%AB%E8%96%87%E8%96%87%E5%AE%89%E5%A8%9C&oldid=367693` },
  // 锋盔骑士团: 不会攻击飞行单位, and the duration-only 重生 the three read pages share. `page` keeps every other
  // `reborn` of that shape uncovered (敌能-78, 关卡-2). The skill's numbers are already in the data.
  enemy_1104_lfkght: { talents: { reborn: { page: 1 }, noFly: {} }, source: `${PRTS}%E9%94%8B%E7%9B%94%E9%AA%91%E5%A3%AB%E5%9B%A2%E5%AD%A6%E5%BE%92&oldid=378942` },
  enemy_1104_lfkght_2: { talents: { reborn: { page: 1 }, noFly: {} }, source: `${PRTS}%E9%94%8B%E7%9B%94%E9%AA%91%E5%A3%AB%E5%9B%A2%E7%B2%BE%E9%94%90&oldid=367229` },
  enemy_1104_lfkght_3: { talents: { reborn: { page: 1 }, noFly: {} }, source: `${PRTS}%E2%80%9C%E5%B7%A6%E6%89%8B%E2%80%9D%E6%B3%B0%E7%89%B9%E6%96%AF%C2%B7%E7%99%BD%E6%9D%A8&oldid=378941` },
  // 浮士德: 出场无敌、致命一击是物理、普通攻击不打飞行单位。召唤弩炮的 branch_id 在数据里。
  enemy_1508_faust: { talents: { invincible: { page: 1 }, noFly: {} }, skills: { CriticalHit: { arts: 0 } }, source: `${PRTS}%E6%B5%AE%E5%A3%AB%E5%BE%B7&oldid=381104` },
  // 锈锤战士: 同上，致命一击是法术。没有召唤弩炮。
  enemy_2006_flsnip: { talents: { invincible: { page: 1 }, noFly: {} }, skills: { CriticalHit: { arts: 1 } }, source: `${PRTS}%E9%94%88%E9%94%A4%E6%88%98%E5%A3%AB&oldid=381103` },
  // 寻路者弹药射击 (敌能-81). The level records carry no ammunition; `page` marks the pages that were read.
  enemy_1216_cansld: { talents: { shotbuff: { page: 1, ammo: 2 } }, source: `${PRTS}%E5%AF%BB%E8%B7%AF%E8%80%85%E9%98%B5%E5%9C%B0%E7%A0%B4%E5%9D%8F%E8%80%85&oldid=365946` },
  enemy_1216_cansld_2: { talents: { shotbuff: { page: 1, ammo: 2, see: 1 } }, source: `${PRTS}%E5%AF%BB%E8%B7%AF%E8%80%85%E9%98%B5%E5%9C%B0%E6%92%95%E8%A3%82%E8%80%85&oldid=381108` },
  enemy_1219_mtrbty: { talents: { shotbuff: { page: 1, ammo: 1 } }, source: `${PRTS}%E5%AF%BB%E8%B7%AF%E8%80%85%E4%BF%A1%E4%BD%BF&oldid=355327` },
  enemy_1219_mtrbty_2: { talents: { shotbuff: { page: 1, ammo: 1 } }, source: `${PRTS}%E4%B8%87%E5%9B%BD%E4%BF%A1%E4%BD%BF%EF%BC%8C%E5%A5%A5%E4%BC%A6&oldid=287583` },
  // 赞助无人机: 静态刚体，不进行普通攻击. Static is 敌能-37; NoAttack is 敌能-64's marker for 不进行普通攻击.
  enemy_1105_tyokai: { talents: { Static: {}, NoAttack: {} }, source: `${PRTS}%E8%B5%9E%E5%8A%A9%E6%97%A0%E4%BA%BA%E6%9C%BA&oldid=379221` },
  // 寻路者甜品商 / 知名甜品商 also call a candy cart: BornCar's ammunition cap 3 (技力槽 3/3) and 甜品商's 0.1s (敌能-82).
  enemy_1217_rescar: { talents: { shotbuff: { page: 1 } }, skills: { BornCar: { max: 3, delay: 0.1 } }, source: `${PRTS}%E5%AF%BB%E8%B7%AF%E8%80%85%E7%94%9C%E5%93%81%E5%95%86&oldid=366372` },
  enemy_1217_rescar_2: { talents: { shotbuff: { page: 1, melee: 1 } }, skills: { BornCar: { max: 3 } }, source: `${PRTS}%E5%AF%BB%E8%B7%AF%E8%80%85%E7%9F%A5%E5%90%8D%E7%94%9C%E5%93%81%E5%95%86&oldid=381093` },
  // 迷路的巨像: 眩晕击 throws a stone (敌能-83). `page` marks this page; 配重投石机 has the same data and no page.
  enemy_2003_rockman: { skills: { StunAttack: { page: 1 } }, source: `${PRTS}%E8%BF%B7%E8%B7%AF%E7%9A%84%E5%B7%A8%E5%83%8F&oldid=354366` },
  // 弑君者: the 0.5s is on the page, not in the blackboard (敌能-84). 卢西恩 shares { dist } and gets no marker.
  enemy_1502_crowns: { skills: { blink: { glide: 0.5 } }, source: `${PRTS}%E5%BC%91%E5%90%9B%E8%80%85(%E6%95%8C%E6%96%B9)&oldid=361341` },
  // 赛场补给车 / “天车散花”赛场补给车: 爆炸汽水布设 (敌能-86). `soda` marks the two pages that describe the bottle.
  // The same three keys on the other 补给员 are not this skill, and stay uncovered (关卡-2).
  enemy_4004_muvltr: { skills: { boomb: { soda: 1 } }, source: `${PRTS}%E8%B5%9B%E5%9C%BA%E8%A1%A5%E7%BB%99%E8%BD%A6&oldid=361382` },
  enemy_4004_muvltr_2: { skills: { boomb: { soda: 1 } }, source: `${PRTS}%E2%80%9C%E5%A4%A9%E8%BD%A6%E6%95%A3%E8%8A%B1%E2%80%9D%E8%B5%9B%E5%9C%BA%E8%A1%A5%E7%BB%99%E8%BD%A6&oldid=361313` },
  // 量产巨像 / 改进型量产巨像: 占用2个阻挡数. The number is not in the enemy data (敌能-120). Weak is the beam and gets no behaviour.
  enemy_1240_ltgint: { talents: { blockSlots: { block: 2 } }, source: `${PRTS}%E9%87%8F%E4%BA%A7%E5%B7%A8%E5%83%8F&oldid=353633` },
  enemy_1240_ltgint_2: { talents: { blockSlots: { block: 2 } }, source: `${PRTS}%E6%94%B9%E8%BF%9B%E5%9E%8B%E9%87%8F%E4%BA%A7%E5%B7%A8%E5%83%8F&oldid=371221` },
});
