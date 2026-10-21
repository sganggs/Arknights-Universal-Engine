// Operators at a training (docs/spec/operators.md) on the real training data: the skeleton's operator again, levels in
// between, trust, potentials, skill levels and unlocks, trait candidates.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTraining, operatorAt, skeletonContent, ROSTER } from '../src/index.js';
import { traitAt, teamTalentsAt, upgradedTalentsAt, moduleOwnAt } from '../src/operators.js';
import { talentsAt, alwaysOn, alwaysMods, teamPart, rangePart, critPart, timedPart, deployPart, forSkill } from '../src/talents.js';
import { whileParts, targetPart, hitPart, attackPart, stackPart, spParts, gritPart, auraParts, perParts, specialParts } from '../src/talentparts.js';
import rangeTable from '../data/ranges.json' with { type: 'json' };

/** The range table (干员-8). */
const RANGES = /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges);
import { matchContent } from '../src/index.js';

/** @typedef {import('../src/operators.js').Build} Build */
const build = (/** @type {Partial<Build>} */ b = {}) => ({ elite: 0, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1, ...b });

test('[干员-1] [干员-2] 米格鲁 at elite 0, max level, skill level 4 is the skeleton\'s operator', async () => {
  const t = await loadTraining('char_122_beagle');
  const op = /** @type {Record<string, unknown>} */ (operatorAt(t, build({ level: 40, skillLevel: 4 }))), sk = /** @type {Record<string, unknown>} */ (skeletonContent.operators.char_122_beagle);
  for (const k of ['name', 'position', 'maxHp', 'atk', 'def', 'res', 'cost', 'blockCnt', 'baseAttackTime', 'respawnTime', 'range', 'skill', 'trait', 'branch', 'profession']) assert.deepEqual(op[k], sk[k], k);
  assert.deepEqual([op.aspd, op.tauntLevel, op.massLevel], [100, 0, 0]);
  assert.equal(ROSTER.char_122_beagle.name, '米格鲁');
});

test('[干员-1] levels in between are linear and not rounded; trust adds up to 100 %; potentials add their modifiers', async () => {
  const t = await loadTraining('char_122_beagle');
  const [lo, hi] = t.phases[0].frames;
  const mid = operatorAt(t, build({ level: 20 }));
  assert.equal(mid.maxHp, lo.stats.maxHp + (hi.stats.maxHp - lo.stats.maxHp) * (19 / 39));
  const fav = /** @type {NonNullable<typeof t.favor>} */ (t.favor);
  assert.equal(operatorAt(t, build({ trust: 50 })).def - operatorAt(t, build()).def, fav.stats.def * 0.5);
  assert.equal(operatorAt(t, build({ trust: 200 })).def, operatorAt(t, build({ trust: 100 })).def, 'capped at 100 %');
  assert.equal(operatorAt(t, build({ level: 99 })).maxHp, hi.stats.maxHp, 'the level is capped at the phase\'s maximum');
  const p6 = operatorAt(t, build({ potential: 6 })), p1 = operatorAt(t, build());
  const sum = (/** @type {string} */ k) => t.potentials.reduce((n, p) => n + (p[k] ?? 0), 0);
  assert.deepEqual([p6.cost - p1.cost, p6.atk - p1.atk, (p6.respawnTime ?? 0) - (p1.respawnTime ?? 0)], [sum('cost'), sum('atk'), sum('respawnTime')]);
});

test('[干员-2] a skill at its level, 专精 as 8–10, capped at its last; locked skills and missing phases refused; no skill', async () => {
  const t = await loadTraining('char_002_amiya');
  const s3 = operatorAt(t, build({ elite: 2, level: 1, skill: 2, skillLevel: 10 })).skill, s7 = operatorAt(t, build({ elite: 2, level: 1, skill: 2, skillLevel: 7 })).skill;
  assert.ok(s3 && s7 && s3.id === s7.id && s3.cost <= s7.cost, 'mastery 3 costs no more than level 7');
  assert.deepEqual(operatorAt(t, build({ elite: 2, skill: 2, skillLevel: 99 })).skill, s3);
  assert.throws(() => operatorAt(t, build({ skill: 2 })), /not unlocked at elite 0/);
  assert.throws(() => operatorAt(t, build({ elite: 3 })), /no elite phase 3/);
  assert.equal(operatorAt(t, build({ skill: -1 })).skill, undefined);
  await assert.rejects(loadTraining('char_nope'), /no operator char_nope/);
});

test('[干员-3] the trait blackboard of the last candidate unlocked by elite, level and potential', async () => {
  const t = await loadTraining('char_1030_noirc2');
  assert.deepEqual([0, 1, 2].map((elite) => traitAt(t, build({ elite })).value), [30, 50, 70]);
  const made = { ...t, traits: [{ phase: 0, level: 1, potential: 0, bb: { v: 1 } }, { phase: 0, level: 30, potential: 0, bb: { v: 2 } }, { phase: 0, level: 1, potential: 3, bb: { v: 3 } }] };
  assert.deepEqual([traitAt(made, build({ level: 29 })).v, traitAt(made, build({ level: 30 })).v, traitAt(made, build({ level: 30, potential: 4 })).v], [1, 2, 3]);
  assert.deepEqual(traitAt({ ...t, traits: [] }, build({})), {});
  assert.deepEqual(traitAt(made, build({ elite: 1, level: 1 })).v, 2, 'a lower phase is unlocked whatever its level');
});

test('[干员-6] each talent\'s last candidate unlocked; the always-on part reads as the operator\'s own attributes only', async () => {
  const angel = await loadTraining('char_103_angel');
  assert.deepEqual(talentsAt(angel, build()), [null, null], 'none unlocked at elite 0');
  assert.deepEqual(talentsAt(angel, build({ elite: 2, potential: 3 })).map((c) => c?.bb.attack_speed ?? c?.bb.atk), [15, 0.06]);
  assert.deepEqual(operatorAt(angel, build({ elite: 2, potential: 6 })).talentBb, { attack_speed: 15, atk: 0.08, max_hp: 0.13 }, '天使的祝福: its first sentence is hers');
  const winter = await loadTraining('char_115_headbr'), e0 = operatorAt(winter, build());
  assert.deepEqual([operatorAt(winter, build({ elite: 1 })).cost, e0.cost, e0.talentBb], [winter.phases[1].frames[0].stats.cost - 1, winter.phases[0].frames[0].stats.cost, undefined],
    '自身部署费用-1 (elite 1) folds into the cost');
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb, hidden = false) => alwaysOn({ description, bb, hidden });
  assert.deepEqual([
    c('生命上限和防御力各+12%', { max_hp: 0.12, def: 0.12 }), c('攻击力+8%<@ba.talpu>（+2%）</>，攻击速度+8', { atk: 0.08, attack_speed: 8 }),
    c('自身再部署时间-15秒', { respawn_time: -15, cost: 0 }), c('自身的技力自然回复速度+0.3/秒。', { sp_recovery_per_sec: 0.3 }), c('防御力-10%，但攻击速度+20', { def: -0.1, attack_speed: 20 }),
  ], [{ max_hp: 0.12, def: 0.12 }, { atk: 0.08, attack_speed: 8 }, { respawn_time: -15 }, { sp_recovery_per_sec: 0.3 }, { def: -0.1, attack_speed: 20 }]);
  assert.deepEqual([
    c('攻击力+8%，攻击变为弱点伤害', { atk: 0.08 }), c('攻击速度+15，装备技能2时获得+25%攻击力', { attack_speed: 15, atk: 0.25 }),
    c('攻击速度+12；连续造成伤害时逐渐无视敌人防御力', { attack_speed: 12, def_penetrate_fixed: 6 }),
  ], [{ atk: 0.08 }, { attack_speed: 15 }, { attack_speed: 12 }], 'the leading clauses; what follows is not always on');
  assert.deepEqual([
    c('攻击力+8%', { atk: 0.08, prob: 0.1 }), c('攻击速度+6', { atk: 0.06 }), c('攻击力+8%', { atk: 0.08 }, true),
    c('在场时，所有友方【医疗】职业干员攻速+6', { attack_speed: 6 }), c('攻击速度+10，自身受到伤害后失去该效果', { attack_speed: 10 }),
    c('部署后随机永久获得下列一项增益：攻击力+7%；攻击速度+7', { atk: 0.07, attack_speed: 7 }),
  ], [null, null, null, null, null, null]);
});

test('[干员-7] a module adds its level\'s attributes and upgrades talents; only once unlocked', async () => {
  const angel = await loadTraining('char_103_angel'), e2 = build({ elite: 2, level: 90, potential: 6, skill: -1 });
  const none = operatorAt(angel, e2), x3 = operatorAt(angel, { ...e2, module: 0, moduleLevel: 3 }), x1 = operatorAt(angel, { ...e2, module: 0, moduleLevel: 1 });
  const stats = angel.modules[0].levels.map((l) => l.stats);
  assert.deepEqual([x3.atk - none.atk, x3.maxHp - none.maxHp, x1.atk - none.atk], [stats[2].atk, stats[2].maxHp, stats[0].atk]);
  assert.deepEqual([x1.talentBb, x3.talentBb], [none.talentBb, { attack_speed: 15, atk: 0.1, max_hp: 0.17 }], 'level 1 has no talent part; level 3 upgrades 天使的祝福');
  assert.deepEqual(operatorAt(angel, { ...e2, module: 0, moduleLevel: 9 }), x3, 'capped at its last level');
  assert.deepEqual(operatorAt(angel, { ...e2, module: -1 }), none);
  assert.throws(() => operatorAt(angel, { ...e2, level: 59, module: 0 }), /module 0 is not unlocked at elite 2 level 59/);
  assert.throws(() => operatorAt(angel, { ...e2, module: 2 }), /module 2 is not unlocked/);
  const y2 = operatorAt(angel, { ...e2, module: 1, moduleLevel: 2 });
  assert.equal(y2.talentBb?.attack_speed, 15, '快速弹匣\'s upgrade keeps its leading clause');
});

/** A training at elite 2, max level, potential 6, with a module at a level: its talents and its module's own data. */
const moduled = async (/** @type {string} */ id, /** @type {number} */ module, /** @type {number} */ moduleLevel) => {
  const t = await loadTraining(id), b = build({ elite: 2, level: t.phases[2].maxLevel, potential: 6, skill: -1 }), m = { ...b, module, moduleLevel };
  return { base: upgradedTalentsAt(t, b), mod: upgradedTalentsAt(t, m), own: moduleOwnAt(t, m) };
};

test('[干员-7] a module\'s talent candidate upgrades the talent it is (prefabKey); a hidden one of none is the module\'s own data', async () => {
  const [poca1, helage1, helage2, aigis] = await Promise.all([moduled('char_197_poca', 0, 1), moduled('char_188_helage', 0, 1), moduled('char_188_helage', 0, 2), moduled('char_4218_aigis', 0, 1)]);
  assert.deepEqual([poca1.mod, poca1.own], [poca1.base, { atk_scale: 1.15, value: 3 }], '早露 SIE-X 1: 深入骨髓 stays; the 115 % against heavy enemies is the module\'s');
  assert.deepEqual([helage1.mod, helage1.own], [helage1.base, { hp_ratio: 0.5, damage_resistance: 0.25 }], '赫拉格 SBL-X 1: 月盈星亏 stays; the 庇护 is the module\'s');
  assert.deepEqual([helage2.mod[0].bb, helage2.mod[0].description?.includes('+120')], [{ min_hp_ratio: 0.4, min_attack_speed: 120 }, true], 'SBL-X 2 upgrades 月盈星亏 itself');
  assert.deepEqual([aigis.mod[0].hidden, aigis.mod[0].bb, aigis.own], [true, { atk_scale: 1.1 }, { atk_scale: 1.1 }], '埃癸斯 BRK-X: her hidden talent, and the module\'s data');
});

test('[干员-7] a shown candidate of none of the talents adds to the one at its index: its text, its new keys, the talent\'s own values kept', async () => {
  const [poca, siege, necras, shan] = await Promise.all([moduled('char_197_poca', 0, 2), moduled('char_112_siege', 0, 2), moduled('char_450_necras', 0, 2), moduled('char_264_f12yin', 1, 2)]);
  assert.deepEqual([poca.mod[0].bb, poca.mod[0].description?.endsWith('并额外造成40%攻击力的物理伤害')], [{ extra_atk_scale: 0.4, value: 3, def_penetrate: 0.6 }, true], '早露 SIE-X 2');
  assert.deepEqual(siege.mod[0].bb, { atk: 0.1, def: 0.1 }, '推进之王 SOL-X: the 先锋\'s +10 % kept, not the +6 % of its own');
  assert.equal(necras.mod[0].bb.max_token_cnt, 3, '死芒 SOC-X 2: a part that only changes the text keeps 复燃\'s data');
  assert.deepEqual([shan.mod[1].bb, shan.mod[1].description?.includes('战栗')], [{ prob: 0.2, def: 0.14 }, true], '山 FGT-X 2: 强壮肉体\'s data by its prefabKey (index 2), its text by index 1');
});

test('[干员-7] a module\'s trait parts put their values over the trait\'s blackboard; a part that only shows text changes none', async () => {
  const ascln = await loadTraining('char_4132_ascln'), e2 = build({ elite: 2, level: 60, potential: 6, skill: -1 });
  const prob = (/** @type {Partial<Build>} */ b) => [traitAt(ascln, { ...e2, ...b }).prob, /** @type {any} */ (operatorAt(ascln, { ...e2, ...b }).trait).mods.dodgePhys];
  assert.deepEqual([prob({}), prob({ module: 0, moduleLevel: 3 }), prob({ module: 1, moduleLevel: 1 }), prob({ module: 1, moduleLevel: 3 })],
    [[0.5, 0.5], [0.5, 0.5], [0.65, 0.65], [0.65, 0.65]], '伏击客\'s 65 % dodge with her second module');
  assert.deepEqual(traitAt(ascln, { ...e2, module: 1 }, null), { prob: 0.5 }, 'no module level given: the trait\'s own');
});

test('[干员-9] team parts: 编入队伍时 for the deck, 在场时 on the field, by profession; deck ones apply within one seat\'s deck', async () => {
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb) => teamPart({ description, bb, hidden: false });
  assert.deepEqual([
    c('编入队伍时，所有【重装】职业干员的生命上限+20%', { max_hp: 0.2 }), c('在场时所有友方【重装】职业干员的防御力提升8%，自身防御力额外提升4%', { def: 0.08 }),
    c('在场时，所有【先锋】干员每秒回复28点生命', { hp_recovery_per_sec: 28 }), c('编入队伍时所有【先锋】干员的初始技力+8', { sp: 8 }),
  ], [
    { when: 'deck', profession: 'TANK', bb: { max_hp: 0.2 } }, { when: 'field', profession: 'TANK', bb: { def: 0.08 } },
    { when: 'field', profession: 'PIONEER', bb: { hp_recovery_per_sec: 28 } }, { when: 'deck', profession: 'PIONEER', bb: { sp: 8 } },
  ]);
  assert.deepEqual([c('在场时，所有【狙击】干员的部署费用-2', { value: -2, cost: -2 }), c('在场时，所有【支援机械】干员的攻击速度+14', { attack_speed: 14 }),
    c('攻击力+8%', { atk: 0.08 })], [null, null, null], 'cost on the field, a tag that is no faction, not a team talent');
  assert.deepEqual(operatorAt(await loadTraining('char_180_amgoat'), E2).fieldTalents, [{ profession: 'CASTER', bb: { atk: 0.14 } }], '艾雅法拉 at elite 2, potential 1');
});

const E2 = { elite: 2, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 };

test('[干员-9] deck team parts apply to the operators of their profession in the same seat\'s deck, the holder too', async () => {
  const deck = (/** @type {string[]} */ ids) => ids.map((id) => ({ id, build: E2 }));
  const ops = /** @type {Record<string, any>} */ ((await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1,
    decks: [deck(['char_2014_nian', 'char_202_demkni', 'char_222_bpipe']), deck(['char_202_demkni', 'char_222_bpipe'])] })).operators);
  const hp = (/** @type {string} */ k) => (ops[k].talentBb ? ops[k].talentBb.max_hp : 0);
  const [nian, bpipe] = await Promise.all(['char_2014_nian', 'char_222_bpipe'].map(async (id) => teamTalentsAt(await loadTraining(id), E2).deck[0].bb));
  assert.ok(Math.abs(hp('char_202_demkni#0') - hp('char_202_demkni#1') - nian.max_hp) < 1e-12, '年 raises the 重装 of her own deck only');
  const plain = /** @type {any} */ (operatorAt(await loadTraining('char_222_bpipe'), E2));
  assert.deepEqual([ops['char_222_bpipe#0'].skill.init, ops['char_222_bpipe#1'].skill.init], [plain.skill.init + bpipe.sp, plain.skill.init + bpipe.sp], '风笛 raises herself in each deck');
});

test('[干员-9] [干员-10] a faction deck talent: 斯卡蒂 raises every 【深海猎人】 of her deck, herself too', async () => {
  const skadi = await loadTraining('char_263_skadi');
  assert.deepEqual([skadi.powers, teamTalentsAt(skadi, E2).deck.map((p) => /** @type {any} */ (p).power)], [['egir', 'abyssal'], ['abyssal']]);
  const deck = (/** @type {string[]} */ ids) => ids.map((id) => ({ id, build: E2 }));
  const ops = /** @type {Record<string, any>} */ ((await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks: [deck(['char_263_skadi', 'char_202_demkni'])] })).operators);
  const plain = /** @type {any} */ (operatorAt(skadi, E2));
  assert.equal(ops['char_263_skadi#0'].talentBb.atk - (plain.talentBb ? plain.talentBb.atk ?? 0 : 0), teamTalentsAt(skadi, E2).deck[0].bb.atk);
  assert.equal(ops['char_202_demkni#0'].talentBb && ops['char_202_demkni#0'].talentBb.atk, undefined, 'not a 深海猎人');
});

test('[干员-11] in-range parts: whom, and the modifier by the % of the text; 伊芙利特 from the real data', async () => {
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb) => rangePart({ description, bb, hidden: false });
  assert.deepEqual([
    c('攻击范围内的敌军法术抗性-44%', { magic_resistance: -0.44 }), c('攻击范围内的友方单位防御力+65', { def: 65 }),
    c('攻击范围内的远程干员最大生命值+12%（+2%）', { max_hp: 0.12 }), c('攻击范围内的敌人移动速度-25%，攻击范围外的敌人移动速度-10%', { move_speed: -0.25 }),
  ], [
    { side: 'enemy', ranged: false, mods: { resPct: -0.44 } }, { side: 'ally', ranged: false, mods: { defFlat: 65 } },
    { side: 'ally', ranged: true, mods: { hpPct: 0.12 } }, { side: 'enemy', ranged: false, mods: { movePct: -0.25 } },
  ]);
  assert.deepEqual([c('攻击范围内的友方单位攻击速度+8%', { attack_speed: 8 }), c('攻击范围内存在生命值低于一半的敌人时，攻击力+12%', { atk: 0.12 }),
    c('攻击范围内的敌人生命少于40%时，令其获得33%的脆弱效果', { hp_ratio: 0.4 })], [null, null, null]);
  assert.deepEqual(operatorAt(await loadTraining('char_134_ifrit'), E2).rangeTalents, [{ side: 'enemy', ranged: false, mods: { resPct: -0.4 } }]);
  assert.equal(alwaysOn({ description: '防御力+70', bb: { def: 70 }, hidden: false }), null, 'a share written without %: not read as one');
});

test('[干员-12] chance parts: 攻击时 N% 几率 攻击力提升至 M%, with a stun or one more target after it', async () => {
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb) => critPart({ description, bb, hidden: false });
  assert.deepEqual([
    c('攻击时，20%几率当次攻击的攻击力提升至160%', { prob: 0.2, atk_scale: 1.6 }),
    c('攻击时，18%<@ba.talpu>（+3%）</>几率当次攻击的攻击力提升至200%，并晕眩敌人1秒', { prob: 0.18, atk_scale: 2, stun: 1 }),
    c('攻击速度+8，攻击时有20%的概率攻击力提升至150%', { attack_speed: 8, prob: 0.2, atk_scale: 1.5 }),
    c('每次攻击有25%的概率攻击力提升至130%，且额外攻击一个目标', { prob: 0.25, atk_scale: 1.3 }),
  ], [{ prob: 0.2, scale: 1.6 }, { prob: 0.18, scale: 2, stun: 1 }, { prob: 0.2, scale: 1.5 }, { prob: 0.25, scale: 1.3, more: 1 }]);
  assert.deepEqual([c('攻击时，20%几率当次攻击的攻击力提升至160%', { atk_scale: 1.6 }), c('攻击力+8%', { prob: 0.1, atk_scale: 1 })], [null, null]);
  const bpipe = operatorAt(await loadTraining('char_222_bpipe'), E2);
  assert.deepEqual(bpipe.critTalents?.map((k) => k.more), [1], '风笛 精密填弹');
});

test('[干员-13] timed parts: 每在场上停留 … 最多叠加, 在战场停留 … 后 (抵抗 too), 部署后 … 秒内', async () => {
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb) => timedPart({ description, bb, hidden: false });
  assert.deepEqual([
    c('每在场上停留20秒，攻击力+5%，防御力+4%，最多叠加5层', { max_stack_cnt: 5, interval: 20, atk: 0.05, def: 0.04 }),
    c('在战场停留15秒后，攻击力+18%且获得抵抗', { atk: 0.18, interval: 15, one_minus_status_resistance: -0.5 }),
    c('部署后60秒内技力自然回复速度+0.5/秒', { sp_recovery_per_sec: 0.5, duration: 60 }),
  ], [
    { kind: 'stack', seconds: 20, max: 5, mods: { atkPct: 0.05, defPct: 0.04 } }, { kind: 'after', seconds: 15, max: 1, mods: { atkPct: 0.18, statusResFlat: -0.5 } },
    { kind: 'during', seconds: 60, max: 1, mods: { spRecoveryFlat: 0.5 } },
  ]);
  assert.deepEqual([c('每在场上停留20秒，攻击力+5%', { interval: 20, atk: 0.05 }), c('在战场停留15秒后，仅一次使场上所有重装干员攻击力+8%', { interval: 15, atk: 0.08 })], [null, null]);
  assert.equal(operatorAt(await loadTraining('char_202_demkni'), E2).timedTalents?.[0]?.kind, 'stack', '塞雷娅');
});

test('[干员-14] deployment parts: SP, random SP, heals of everyone, shield layers', async () => {
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb) => deployPart({ description, bb, hidden: false });
  assert.deepEqual([
    c('部署后立即获得35点技力', { sp: 35 }), c('部署后立即随机获得7~15点技力', { sp_min: 7, sp_max: 16 }),
    c('部署后立即恢复全场友方单位500点生命', { value: 500 }), c('部署后立刻恢复全体友方单位的生命值，恢复量为末药攻击力的160%', { heal_scale: 1.6 }),
    c('部署后立即获得3层护盾', { times: 3 }), c('部署后立即获得一层护盾，护盾破裂后获得9点技力', { sp: 9 }),
  ], [{ sp: [35, 36] }, { sp: [7, 16] }, { heal: { value: 500 } }, { heal: { scale: 1.6 } }, { shield: 3 }, { shield: 1, break: { sp: 9 } }]);
  assert.deepEqual([c('部署后立即对攻击范围内一个敌人投掷闪光弹', { stun: 4 }), c('首次部署后立即获得35点技力', { sp: 35 })], [null, null]);
  assert.deepEqual(operatorAt(await loadTraining('char_180_amgoat'), E2).deployTalents, [{ sp: [7, 16] }], '艾雅法拉');
});

test('[部署-5] 引星棘刺\'s 视界 from the real data: the attack speed for every unit while she is on the field, from elite 2', async () => {
  const { loadTraining: load, operatorAt: at } = await import('../src/index.js');
  const t = await load('char_1039_thorn2'), b = (/** @type {number} */ elite) => ({ elite, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 });
  assert.deepEqual([at(t, b(1)).fieldAspd, at(t, b(2)).fieldAspd], [undefined, { ally: 5, enemy: -5, cnt: 6, allyExtra: 5, enemyExtra: -5 }]);
});

/** A talent of a description and blackboard, not hidden. @param {string} description @param {Record<string, number>} bb */
const talent = (description, bb) => ({ description, bb, hidden: false });
/** An operator's record at elite 2, level 1, potential 1, its first skill (or the slot given). @param {string} id @param {number} [skill] */
const atE2 = async (id, skill = 0) => /** @type {any} */ (operatorAt(await loadTraining(id), { ...E2, skill }));

test('[干员-16] always-on effects that are not attributes: 无视防御 and 法术抗性, 闪避, 攻击距离, 物理伤害 dealt and taken, 减伤, regen by maximum HP', async () => {
  const m = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => alwaysMods(talent(d, bb));
  assert.deepEqual([
    m('攻击时无视目标175（+15）的防御力', { def_penetrate_fixed: 175 }), m('攻击无视敌人23%的防御力', { def_penetrate: 0.23 }), m('无视攻击目标22法术抗性', { magic_resist_penetrate_fixed: 22 }),
    m('获得50%的物理闪避', { prob: 0.5 }), m('获得50%的法术闪避', { prob: 0.5 }), m('获得45%的物理和法术闪避', { prob: 0.45 }),
    m('造成的物理伤害+12%，受到的物理伤害-12%', { damage_scale: 1.12, damage_resistance: 0.12 }), m('自身获得15%的物理减伤', { damage_resistance: 0.15 }),
    m('受到的元素损伤-12%，受到凋亡损伤时回复2点技力', { damage_resistance: 0.12, sp: 2 }), m('每秒回复4%生命值', { hp_recovery_per_sec_by_max_hp_ratio: 0.04 }),
  ], [
    { defIgnoreFlat: 175 }, { defIgnorePct: 0.23 }, { resIgnoreFlat: 22 }, { dodgePhys: 0.5 }, { dodgeArts: 0.5 }, { dodgePhys: 0.45, dodgeArts: 0.45 },
    { physDealtMul: 1.12, physTakenMul: 0.88 }, { physTakenMul: 0.85 }, { epTakenMul: 0.88 }, { hpRegenRatio: 0.04 },
  ]);
  assert.deepEqual([m('获得50%的物理闪避', { atk: 0.1 }), m('自身获得15%的物理减伤；技能开启时效果翻倍', { damage_resistance: 0.15 }),
    m('获得33%的物理闪避，闪避后此效果失效', { prob: 0.33 })], [null, null, null], 'a key missing, an effect doubled later, one that changes it');
  const tachak = await atE2('char_459_tachak');
  assert.deepEqual([tachak.talentMods, tachak.talentBb], [{ rangeExtend: 2 }, { def: 0.1 }], '战车: 攻击距离+2，防御力+10%，再部署时间+20秒');
  assert.equal(tachak.respawnTime - (await loadTraining('char_459_tachak')).phases[2].frames[0].stats.respawnTime, 20, 'its 再部署时间 folds in as before');
  assert.deepEqual([(await atE2('char_279_excu')).talentMods, (await atE2('char_4218_aigis')).talentMods], [{ defIgnoreFlat: 160 }, { physDealtMul: 1.1, physTakenMul: 0.9 }], '送葬人, 埃癸斯');
});

test('[干员-6] [干员-16] a talent in parts by the skill brought: 夜魔 dodges with her first skill, has the attack with her second; 海蒂 in range', async () => {
  const yoru = talent('装备技能1时获得45%（+5%）的物理和法术闪避，装备技能2时获得+18%（+3%）攻击力', { prob: 0.45, atk: 0.18 });
  assert.deepEqual([forSkill(yoru, 0), forSkill(yoru, 1), forSkill(yoru, 2)].map((c) => [c.description, c.bb]), [
    ['获得45%的物理和法术闪避', { prob: 0.45 }], ['获得+18%攻击力', { atk: 0.18 }], [yoru.description, yoru.bb],
  ]);
  const [s1, s2] = await Promise.all([atE2('char_164_nightm', 0), atE2('char_164_nightm', 1)]);
  assert.deepEqual([s1.talentMods, s1.talentBb, s2.talentMods, s2.talentBb], [{ dodgePhys: 0.4, dodgeArts: 0.4 }, undefined, undefined, { atk: 0.15 }]);
  const [h1, h2] = await Promise.all([atE2('char_4045_heidi', 0), atE2('char_4045_heidi', 1)]);
  assert.deepEqual([h1.rangeTalents, h2.rangeTalents], [[{ side: 'ally', ranged: false, mods: { atkPct: 0.05 } }], [{ side: 'ally', ranged: false, mods: { defPct: 0.05 } }]]);
});

test('[干员-17] conditional parts: the conditions on the operator, each clause after one its own modifiers; 「改为」 adds what it is more', async () => {
  const w = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => whileParts(talent(d, bb));
  assert.deepEqual([
    w('未阻挡敌人时，攻击力和防御力各+14%', { atk: 0.14, def: 0.14 }), w('未阻挡敌人时攻击速度+14，阻挡敌人时攻击力+14%', { attack_speed: 14, atk: 0.14 }),
    w('阻挡两个以上的敌人时，攻击力和防御力+14%', { atk: 0.14, def: 0.14, cnt: 2 }), w('攻击范围内存在2名及以上敌人时，攻击速度+12', { cnt: 2, attack_speed: 12 }),
    w('攻击范围内至少有1名其他友方干员时，攻击力+17%', { atk: 0.17 }), w('攻击范围内存在生命值低于一半的敌人时，攻击力+12%', { hp_ratio: 0.5, atk: 0.12 }),
    w('攻击范围内存在处于凋亡损伤爆发期间的敌方单位时，攻击力+21%', { atk: 0.21 }), w('当周围4格没有敌人时，攻击力+10%', { atk: 0.1 }),
    w('周围四格内仅存在一名敌人时，攻击力+10%', { atk: 0.1, cnt: 1 }), w('当周围四格内没有其他友方单位时，攻击力和防御力各+13%', { atk: 0.13, def: 0.13 }),
    w('技能未开启时，每秒恢复4%的最大生命', { hp_recovery_per_sec_by_max_hp_ratio: 0.04 }),
  ], [
    [{ when: 'notBlocking', mods: { atkPct: 0.14, defPct: 0.14 } }], [{ when: 'notBlocking', mods: { aspd: 14 } }, { when: 'blocking', mods: { atkPct: 0.14 } }],
    [{ when: 'blockingAtLeast', value: 2, mods: { atkPct: 0.14, defPct: 0.14 } }], [{ when: 'enemies', value: 2, mods: { aspd: 12 } }],
    [{ when: 'allies', value: 1, mods: { atkPct: 0.17 } }], [{ when: 'lowHpEnemies', value: 0.5, mods: { atkPct: 0.12 } }],
    [{ when: 'burstEnemies', el: 'DARK', mods: { atkPct: 0.21 } }], [{ when: 'noEnemies4', mods: { atkPct: 0.1 } }],
    [{ when: 'soleEnemy4', mods: { atkPct: 0.1 } }], [{ when: 'aloneUnits4', mods: { atkPct: 0.13, defPct: 0.13 } }],
    [{ when: 'notInSkill', mods: { hpRegenRatio: 0.04 } }],
  ]);
  const kirara = talent('每秒回复2%生命值，周围8格没有友方干员时，改为每秒回复4%（+0.5%）生命值', { hp_recovery_per_sec_by_max_hp_ratio: 0.02, 'kirara_t_2.hp_recovery_per_sec_by_max_hp_ratio': 0.04 });
  assert.deepEqual([alwaysMods(kirara), whileParts(kirara)], [{ hpRegenRatio: 0.02 }, [{ when: 'alone8', mods: { hpRegenRatio: 0.02 } }]], '绮良: 2% always, 2% more alone');
  assert.deepEqual([w('攻击力+8%', { atk: 0.08 }), w('未阻挡敌人时，攻击敌人造成伤害', { atk: 0.1 }), w('阻挡敌人时攻击力+10%。此效果在技能期间翻倍', { atk: 0.1 }),
    w('攻击范围内存在2格以上的地面地形时，攻击力+19%', { atk: 0.19 })], [[], [], [], []], 'no condition, a clause it cannot read, a later 效果, a condition it does not know');
  const [fire, broca] = await Promise.all([atE2('char_493_firwhl'), atE2('char_356_broca')]);
  assert.deepEqual([fire.talentTrait.whiles, broca.talentTrait.whiles], [
    [{ when: 'notBlocking', mods: { atkPct: 0.12 } }, { when: 'blocking', mods: { defPct: 0.12 } }], [{ when: 'blockingAtLeast', value: 2, mods: { atkPct: 0.12, defPct: 0.12 } }],
  ], '火哨, 布洛卡 at elite 2');
});

test('[干员-18] target parts: the target the talent names and what it gets against it', async () => {
  const v = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => targetPart(talent(d, bb));
  assert.deepEqual([
    v('攻击使用远程武器的敌人时，攻击力提升至145%', { atk_scale: 1.45 }), v('攻击被阻挡的敌人造成伤害提升20%', { atk_scale: 1.2 }),
    v('攻击未被阻挡的敌人时攻击力提升至123%', { atk_scale: 1.23 }), v('攻击【萨卡兹】敌人时，攻击力提升至150%', { atk_scale: 1.5 }),
    v('攻击【感染生物】时，攻击力提升至150%', { atk_scale: 1.5 }), v('攻击空中目标时，攻击力提升至140%', { atk_scale: 1.4 }),
    v('攻击飞行目标时，攻击力+50%', { atk_scale: 1.5 }), v('攻击生命值低于40%的敌人伤害提高30%', { hp_ratio: 0.4, damage_scale: 1.3 }),
    v('攻击生命值高于80%的敌人时造成的伤害提高20%', { hp_ratio: 0.8, damage_scale: 1.2 }), v('攻击未被自身阻挡的敌人时，自身造成的伤害+25%', { damage_scale: 1.25 }),
    v('对未被自身阻挡的敌人造成的伤害提升45%', { damage_scale: 1.45 }), v('攻击重量小于等于3的敌人时攻击力提升至136%', { value: 3, atk_scale: 1.36 }),
    v('攻击重量大于等于3的敌人时无视目标200的防御力', { value: 3, def_penetrate_fixed: 200 }), v('攻击被战栗的目标时，无视目标30%的防御力', { def_penetrate: 0.3 }),
  ], [
    { when: 'rangedFoe', atk: 1.45 }, { when: 'blocked', atk: 1.2 }, { when: 'unblocked', atk: 1.23 }, { when: 'tag', tag: 'sarkaz', atk: 1.5 },
    { when: 'tag', tag: 'infection', atk: 1.5 }, { when: 'flying', atk: 1.4 }, { when: 'flying', atk: 1.5 }, { when: 'hpBelow', value: 0.4, dmg: 1.3 },
    { when: 'hpAbove', value: 0.8, dmg: 1.2 }, { when: 'notOwnBlocked', dmg: 1.25 }, { when: 'notOwnBlocked', dmg: 1.45 },
    { when: 'light', value: 3, atk: 1.36 }, { when: 'heavy', value: 3, defFlat: 200 }, { when: 'status', status: 'disarmedCombat', defPct: 0.3 },
  ]);
  assert.deepEqual([v('优先攻击【无人机】单位，且攻击【无人机】时攻击力提升至155%', { atk_scale: 1.55 }), v('攻击【海嗣】敌人时，攻击力提升至150%', { atk_scale: 1.5 }),
    v('攻击被阻挡的敌人时攻击力提升至115%，并回复1点技力', { atk_scale: 1.15, sp: 1 })], [null, null, null], 'a priority, a tag it does not know, more after it');
  assert.deepEqual((await atE2('char_363_toddi')).talentTrait.vs, [{ when: 'tag', tag: 'sarkaz', atk: 1.45 }], '熔泉');
});

test('[干员-19] hit parts: a status at a chance or on every hit, the first hit on each enemy, 法术脆弱, lower 法术抗性, 灼痕; arts damage on each hit, two targets', async () => {
  const h = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => hitPart(talent(d, bb));
  assert.deepEqual([
    h('攻击时有23%的几率使目标束缚1.5秒', { prob: 0.23, duration: 1.5 }), h('攻击时有40%的几率对攻击目标造成2秒的停顿', { 'attack@prob': 0.4, 'attack@sluggish': 2 }),
    h('攻击时对攻击目标造成0.6秒的停顿', { sluggish: 0.6 }), h('攻击使目标的特殊能力失效，持续6秒', { duration: 6 }),
    h('对每个敌人首次造成伤害时，使其战栗5秒', { not_combat: 5 }), h('对每个敌人首次造成伤害后，使目标的特殊能力失效，持续7秒', { silence: 7 }),
    h('攻击敌人时对目标施加14%的【法术脆弱】，持续5秒', { 'weak[magic][limit]': 5, damage_scale: 1.14 }), h('攻击使目标法术抗性-23%，持续1秒', { duration: 1, magic_resistance: -0.23 }),
    h('攻击时有25%的几率使目标法术抗性-25%，持续3秒', { prob: 0.25, magic_resistance: -0.25, duration: 3 }),
    h('造成伤害时有30%概率对敌人施加灼痕效果：攻击力-22%、32%的【法术脆弱】，不可叠加持续6秒', { prob: 0.3, atk: -0.22, damage_scale: 1.32, duration: 6 }),
  ], [
    { status: { key: 'root', seconds: 1.5 }, prob: 0.23 }, { status: { key: 'sluggish', seconds: 2 }, prob: 0.4 }, { status: { key: 'sluggish', seconds: 0.6 } },
    { status: { key: 'silence', seconds: 6 } }, { status: { key: 'disarmedCombat', seconds: 5 }, first: true }, { status: { key: 'silence', seconds: 7 }, first: true },
    { status: { key: 'artsFragile', seconds: 5, value: 0.14 } }, { debuff: { seconds: 1, mods: { resPct: -0.23 } } },
    { debuff: { seconds: 3, mods: { resPct: -0.25 } }, prob: 0.25 }, { prob: 0.3, debuff: { seconds: 6, mods: { atkPct: -0.22, artsTakenMul: 1.32 } } },
  ]);
  assert.deepEqual([h('攻击时有20%的几率使目标束缚4秒，不以束缚状态的敌人为攻击目标', { prob: 0.2, duration: 4 }), h('攻击时有20%的几率使目标束缚4秒', { duration: 4 })], [null, null]);
  assert.deepEqual([attackPart(talent('攻击额外造成攻击力20%的法术伤害', { 'attack@atk_scale_1': 0.2 })), attackPart(talent('攻击时同时攻击两个目标', { 'attack@max_target': 2 }))],
    [{ extraArts: 0.2 }, { targets: 2 }]);
  const [siege, yato, bell] = await Promise.all([atE2('char_1019_siege2'), atE2('char_1029_yato2'), atE2('char_174_slbell')]);
  assert.deepEqual([siege.talentTrait.onHit, yato.talentTrait.extraArts, bell.talentTrait.targets], [[{ status: { key: 'disarmedCombat', seconds: 4 }, first: true }], 0.2, 2],
    '维娜·维多利亚, 麒麟R夜刀, 初雪');
});

test('[干员-12] more chance parts: more attack for that attack, 防御 ignored, two hits, a hit at a 倍率', async () => {
  const c = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => critPart(talent(d, bb));
  assert.deepEqual([
    c('普通攻击和技能释放时，30%几率当次攻击的攻击力+60%', { prob: 0.3, atk: 0.6 }), c('攻击时有20%的几率无视目标的防御', { prob: 0.2 }),
    c('攻击时有23%的几率连续攻击两次', { prob: 0.23 }), c('攻击时有10%概率造成二连击', { 'attack@prob': 0.1, 'attack@normal_prob': 0.9 }),
    c('攻击有30%几率造成相当于攻击力160%的物理伤害，对受到雷鸣地雷效果影响的目标必定触发', { prob: 0.3, atk_scale: 1.6 }),
  ], [{ prob: 0.3, scale: 1, atk: 0.6 }, { prob: 0.2, scale: 1, ignoreDef: 1 }, { prob: 0.23, scale: 1, times: 2 }, { prob: 0.1, scale: 1, times: 2 }, { prob: 0.3, scale: 1.6 }]);
  assert.deepEqual((await atE2('char_106_franka')).critTalents, [{ prob: 0.2, scale: 1, ignoreDef: 1 }], '芙兰卡');
});

test('[干员-9] team parts for every friendly unit, with effects, and 同类效果取最高', async () => {
  const c = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => teamPart(talent(d, bb));
  assert.deepEqual([
    c('全场友方单位攻速+8（+1）', { attack_speed: 8 }), c('在场时所有友方单位的技力自然回复速度+0.3/秒（同类效果取最高）', { sp_recovery_per_sec: 0.3 }),
    c('在场时，全地图的友方单位医疗效果提高12%', { heal_scale: 1.12 }), c('在场时，所有【先锋】职业干员获得25%的物理闪避', { prob: 0.25 }),
  ], [
    { when: 'field', all: true, bb: { attack_speed: 8 } }, { when: 'field', all: true, bb: { sp_recovery_per_sec: 0.3 }, max: true },
    { when: 'field', all: true, bb: {}, mods: { healingDealtMul: 1.12 } }, { when: 'field', profession: 'PIONEER', bb: {}, mods: { dodgePhys: 0.25 } },
  ]);
  assert.deepEqual([c('编入队伍时，所有【先锋】职业干员获得25%的物理闪避', { prob: 0.25 }), c('阻挡敌人时，全场友方单位每秒回复25点生命', { hp_recovery_per_sec: 25 })], [null, null],
    'no effect for the deck; a condition first');
  const [mostma, plosis] = await Promise.all([atE2('char_213_mostma'), atE2('char_128_plosis')]);
  assert.deepEqual([mostma.fieldTalents, plosis.fieldTalents], [[{ profession: 'CASTER', bb: { sp_recovery_per_sec: 0.4 }, max: true }], [{ all: true, bb: { sp_recovery_per_sec: 0.3 }, max: true }]]);
});

test('[干员-16] [干员-17] [干员-19] a kitted operator leaves its talents to its kit: no talent effects or trait additions in the match', async () => {
  const kitted = 'char_1013_chen2';
  const ops = /** @type {Record<string, any>} */ ((await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks: [[{ id: 'char_279_excu', build: E2 }, { id: kitted, build: E2 }]] },
    { kits: { [kitted]: /** @type {any} */ (() => ({})) } })).operators);
  assert.deepEqual([ops['char_279_excu#0'].talentMods, ops[`${kitted}#0`].talentMods, ops[`${kitted}#0`].talentTrait], [{ defIgnoreFlat: 160 }, undefined, undefined]);
});

test('[干员-20] stacking parts: steps for kills (a summon\'s too), after so many kills or hits, steps for damage that last some seconds', async () => {
  const s = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => stackPart(talent(d, bb));
  assert.deepEqual([
    s('每击杀一名敌人后自身的生命上限提高50（+10），最多可以叠加30次', { max_hp: 50, max_stack_cnt: 30 }), s('每击杀一名敌人后获得+6攻击速度（最多叠加6次（+1））', { attack_speed: 6, max_stack_cnt: 6 }),
    s('每击杀一个敌人+3攻速，最多叠加12次', { attack_speed: 3, max_stack_cnt: 12 }), s('夕与"小自在"击杀一名敌人时，夕获得2%攻击力，最多可叠加18层', { atk: 0.02, max_stack_cnt: 18 }),
    s('击杀5个敌人后获得攻击速度+15和抵抗', { times: 5, attack_speed: 15, one_minus_status_resistance: -0.5 }), s('累计造成30次物理伤害后，攻击力+18%', { count: 30, atk: 0.18 }),
    s('造成20次伤害后，获得38%物理闪避', { prob: 0.38, trigger_damage_count: 20 }), s('每次造成伤害使自身10秒内防御力+30，攻击速度+3，最多可叠加3层', { def: 30, attack_speed: 3, max_stack_cnt: 3, duration: 10 }),
  ], [
    { on: 'kill', mods: { hpFlat: 50 }, max: 30 }, { on: 'kill', mods: { aspd: 6 }, max: 6 }, { on: 'kill', mods: { aspd: 3 }, max: 12 },
    { on: 'kill', summons: true, mods: { atkPct: 0.02 }, max: 18 }, { on: 'kill', every: 5, max: 1, mods: { aspd: 15, statusResFlat: -0.5 } },
    { on: 'dealt', phys: true, every: 30, max: 1, mods: { atkPct: 0.18 } }, { on: 'dealt', every: 20, max: 1, mods: { dodgePhys: 0.38 } },
    { on: 'dealt', seconds: 10, max: 3, mods: { defFlat: 30, aspd: 3 } },
  ]);
  assert.deepEqual([s('每击杀一名敌人后获得+6攻击速度', { attack_speed: 6 }), s('攻击相同目标时每次攻击可提高自身攻击力6%，最多可叠加5层', { atk: 0.06, max_stack_cnt: 5 })], [null, null]);
  assert.deepEqual((await atE2('char_279_excu')).talentTrait?.stacks, undefined, 'none without such a talent');
});

test('[干员-21] SP parts: on attacks and kills, on heals for the one healed, for a fall in range, for a hit taken, at the skill\'s end', () => {
  const p = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => spParts(talent(d, bb));
  assert.deepEqual([
    p('攻击敌人时额外回复3（+1）点技力，消灭敌人后额外获得10（+2）点技力', { 'amiya_t_1[atk].sp': 3, 'amiya_t_1[kill].sp': 10 }),
    p('每次回复友方单位生命值时额外回复该单位1点技力', { sp: 1 }), p('治疗目标时使其获得+3技力', { sp: 3 }),
    p('攻击范围内有敌人倒下时，为自身和范围内随机一名友方单位回复2点技力', { 'bldsk_t_1[self].sp': 2, 'bldsk_t_1[rand].sp': 2 }),
    p('攻击范围内的友方干员被击倒时获得5点技力', { sp: 5 }), p('受到攻击时，回复自己和周围一格内随机一名友方角色1点技力', { sp: 1 }),
    p('技能结束后，50%几率立即回复50%的最大技力', { prob: 0.5, sp: 0.5 }), p('技能期间每击倒1名敌人，技能结束时获得1点技力，至多回复17点', { sp: 1, max_sp: 17 }),
  ], [
    [{ on: 'attack', sp: 3 }, { on: 'kill', sp: 10 }], [{ on: 'heal', sp: 1 }], [{ on: 'heal', sp: 3 }], [{ on: 'enemyDown', sp: 2, other: 2 }], [{ on: 'allyDown', sp: 5 }],
    [{ on: 'attacked', sp: 1, other: 1 }], [{ on: 'skillEnd', prob: 0.5, share: 0.5 }], [{ on: 'skillKills', sp: 1, max: 17 }],
  ]);
  assert.deepEqual([p('治疗目标时使其获得3点技力', { sp: 4 }), p('每秒回复1点技力', { sp: 1 })], [[], []], 'a number the blackboard does not have; another sentence');
});

test('[干员-22] aura parts: in range with a condition on the unit, around the operator, on blocked enemies; 「但」 after its own clauses', async () => {
  const a = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb, /** @type {string | null} */ rangeId = null) => auraParts({ ...talent(d, bb), rangeId }, RANGES);
  assert.deepEqual([
    a('攻击范围内的敌人生命少于40%时，令其获得33%的脆弱效果', { hp_ratio: 0.4, damage_scale: 1.33 }).range,
    a('攻击范围内的友军生命大于70%时，使其获得16%的庇护', { hp_ratio: 0.7, damage_resistance: 0.16 }).range,
    a('攻击范围内被阻挡的敌人获得18%的脆弱效果', { damage_scale: 1.18 }).range, a('攻击范围内的非精英和领袖敌人获得18%的脆弱效果', { damage_scale: 1.18 }).range,
    a('攻击范围内的所有空中单位获得22%的【法术脆弱】效果', { damage_scale: 1.22 }).range,
    a('攻击范围内敌人的物理和法术命中率降低10%', { damage_hitrate_physical: -0.1, damage_hitrate_magical: -0.1 }).range,
    a('自身攻击力-5%，但攻击范围内的友方干员受到的治疗效果提升17%', { atk: -0.05, heal_scale: 1.17 }).range,
  ], [
    [{ side: 'enemy', ranged: false, mods: { dmgTakenMul: 1.33 }, when: { when: 'hpBelow', value: 0.4 } }],
    [{ side: 'ally', ranged: false, mods: { physTakenMul: 0.84, artsTakenMul: 0.84 }, when: { when: 'hpAbove', value: 0.7 } }],
    [{ side: 'enemy', ranged: false, mods: { dmgTakenMul: 1.18 }, when: { when: 'blocked' } }], [{ side: 'enemy', ranged: false, mods: { dmgTakenMul: 1.18 }, when: { when: 'normal' } }],
    [{ side: 'enemy', ranged: false, mods: { artsTakenMul: 1.22 }, when: { when: 'flying' } }], [{ side: 'enemy', ranged: false, mods: { hitRateMul: 0.9 } }],
    [{ side: 'ally', ranged: false, mods: { healingTakenMul: 1.17 } }],
  ]);
  const cross = RANGES['x-5'], square = RANGES['x-4'];
  assert.deepEqual([
    a('自身与周围8格友方干员攻速+10', { attack_speed: 10 }, 'x-4').range, a('在场时周围8格内的近战友方单位攻击力+12%', { atk: 0.12 }).range,
    a('自身和周围8格内的高台干员获得23%的物理闪避', { prob: 0.23 }).range, a('自身及相邻四格的【术师】干员攻击力+10%', { atk: 0.1 }, 'x-5').range,
  ].map((r) => r.map((x) => ({ ...x, area: x.area?.length }))), [
    [{ side: 'ally', ranged: false, mods: { aspd: 10 }, area: square.length }], [{ side: 'ally', ranged: false, mods: { atkPct: 0.12 }, area: 9, melee: true }],
    [{ side: 'ally', ranged: true, mods: { dodgePhys: 0.23 }, area: 9 }], [{ side: 'ally', ranged: false, mods: { atkPct: 0.1 }, area: cross.length, profession: 'CASTER' }],
  ]);
  assert.deepEqual([a('自身阻挡的敌人攻击速度-7', { attack_speed: -7 }).auras, a('在场时，所有被阻挡的敌人受到法术伤害时伤害提升18%', { damage_scale: 1.18 }).auras,
    a('在场时所有被阻挡的敌方单位受到的物理伤害提高16%', { damage_scale: 1.16 }).auras], [
    [{ to: 'blocked', mods: { aspd: -7 } }], [{ to: 'blockedAll', mods: { artsTakenMul: 1.18 } }], [{ to: 'blockedAll', mods: { physTakenMul: 1.16 } }],
  ]);
  assert.deepEqual(a('攻击范围内的敌人生命少于40%时，令其获得33%的脆弱效果', { damage_scale: 1.33 }), { range: [], auras: [] }, 'a key missing');
  assert.equal(alwaysOn(talent('自身攻击力-5%，但攻击范围内的友方干员受到的治疗效果提升17%', { atk: -0.05, heal_scale: 1.17 }))?.atk, -0.05, '治疗效果 is no 效果 of its own');
  assert.deepEqual((await atE2('char_279_excu')).rangeTalents ?? null, null, 'none without such a talent');
});

test('[干员-23] 坚忍: the most of each attribute and the share of HP lost at which it is reached; [干员-19] damage over time', () => {
  const g = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => gritPart(talent(d, bb));
  assert.deepEqual([
    g('在场时，自身获得最高+52%攻击力的坚忍（损失70%生命值时达最大加成）', { min_atk: 0.52, min_hp_ratio: 0.3 }),
    g('在场时，自身获得最高+50攻击速度和最高+50%防御力的坚忍（损失70%生命值时达到最大加成）', { min_attack_speed: 50, min_hp_ratio: 0.3, min_def: 0.5 }),
    g('在场时，自身获得最高+52%攻击力的坚忍', { min_atk: 0.52 }),
  ], [{ mods: { atkPct: 0.52 }, full: 0.7 }, { mods: { aspd: 50, defPct: 0.5 }, full: 0.7 }, null]);
  const h = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => hitPart(talent(d, bb));
  assert.deepEqual([
    h('攻击使目标中毒，在3秒内每秒受到85（+10）点法术伤害', { duration: 3.1, poison_damage: 85 }), h('攻击使目标在3秒内每秒受到90点法术伤害（对【海怪】敌人伤害加倍）', { duration: 3, damage: 90 }),
    h('攻击使未被阻挡的敌人流血，每秒受到相当于奥斯塔攻击力20%的法术伤害（不受特性影响），持续3秒', { atk_scale: 0.2, duration: 3 }),
  ], [{ dot: { amount: 85, seconds: 3.1 } }, { dot: { amount: 90, seconds: 3 } }, { dot: { scale: 0.2, seconds: 3 }, when: 'unblocked' }]);
  assert.deepEqual(whileParts(talent('每次部署后击倒一名敌人之前，攻击速度+10，受到的所有伤害降低30%', { attack_speed: 10, damage_resistance: 0.3 })),
    [{ when: 'noKills', mods: { aspd: 10, dmgTakenMul: 0.7 } }], '缄默德克萨斯');
});

test('[干员-17] conditions on its skill: running, not running, before its second start, a later one; flags and whole changes; steps by the enemies in range', () => {
  const w = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => whileParts(talent(d, bb));
  assert.deepEqual([
    w('被动技能触发期间攻击力+18%（+3%），阻挡数降至0且获得迷彩', { atk: 0.18 }), w('未开启技能时，获得迷彩，开启技能后攻击间隔略微缩短', { base_attack_time: -0.15 }),
    w('被动技能持续时间内攻击力+20%；首次击倒敌人时回复所有生命并重新释放被动技能', { atk: 0.2, hp_ratio: 1 }),
    w('部署后第2次开启技能之前，技力自然回复速度+1/秒', { sp_recovery_per_sec: 1, cnt: 2 }), w('首次释放技能后，后续技能期间造成的伤害提升16%', { damage_scale: 1.16 }),
    w('技能开启时不容易成为敌人的目标', { taunt_level: -1 }),
  ], [
    [{ when: 'inSkill', mods: { atkPct: 0.18, blockCntMul: 0 }, flags: { camou: true } }],
    [{ when: 'notInSkill', mods: {}, flags: { camou: true } }, { when: 'inSkill', mods: { batFlat: -0.15 } }], [{ when: 'inSkill', mods: { atkPct: 0.2 } }],
    [{ when: 'fewStarts', value: 2, mods: { spRecoveryFlat: 1 } }], [{ when: 'laterSkill', mods: { dmgDealtMul: 1.16 } }], [{ when: 'inSkill', mods: { taunt: -1 } }],
  ]);
  assert.deepEqual(w('技能开启时，每秒恢复最大生命值5%的生命，同时获得30%的远程物理闪避', { hp_recovery_per_sec_by_max_hp_ratio: 0.05, prob: 0.3 }), [], 'a clause it cannot read');
  assert.deepEqual([perParts(talent('攻击范围内每有一个敌人，自身攻击力+4%（最多可叠加6层（+1））', { atk: 0.04, max_valid_stack_cnt: 6 })), perParts(talent('攻击范围内每有一个敌人，自身攻击力+4%', { atk: 0.04 }))],
    [[{ when: 'enemies', value: 1, per: 6, mods: { atkPct: 0.04 } }], []]);
});

test('[干员-9] [干员-19] [干员-21] team talents of the holder\'s skill; the splash\'s 倍率; a heal at the skill\'s end', () => {
  const t = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => teamPart(talent(d, bb));
  assert.deepEqual([
    t('技能未开启时，全场友方单位每秒回复25（+5）点生命', { hp_recovery_per_sec: 25 }), t('开启技能时，【乌萨斯学生自治团】干员攻击速度+24（+3），持续至技能结束', { attack_speed: 24 }),
    t('技能开启时，所有【医疗】和【辅助】干员获得抵抗', { one_minus_status_resistance: -0.5, max_hp: 0 }),
  ], [
    { when: 'field', all: true, bb: { hp_recovery_per_sec: 25 }, skill: false }, { when: 'field', power: 'student', bb: { attack_speed: 24 }, skill: true },
    { when: 'field', professions: ['MEDIC', 'SUPPORT'], bb: {}, mods: { statusResFlat: -0.5 }, skill: true },
  ]);
  assert.equal(t('技能开启时，所有【医疗】和【萨卡兹】干员获得抵抗', { one_minus_status_resistance: -0.5 }), null, 'a profession and a faction together');
  assert.deepEqual(attackPart(talent('攻击溅射范围内有大于或等于3个敌人时，使当次攻击造成的伤害提升至125%（+5%）', { damage_scale: 1.25, min_target_cnt: 3 })), { packed: { cnt: 3, atk: 1.25 } });
  assert.deepEqual(spParts(talent('技能结束时恢复自身60%（+10%）最大生命值', { hp_ratio: 0.6 })), [{ on: 'skillEnd', heal: 0.6 }]);
});

test('[干员-24] talents in time: idle, unhurt and calm conditions, next attacks, the 倍率 by the time since the last attack, a 屏障 after a while', () => {
  const w = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => whileParts(talent(d, bb));
  const s = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => specialParts(talent(d, bb)).trait;
  assert.deepEqual([
    w('4秒内没有主动攻击过，技力自然回复速度+0.5（+0.05）/秒', { delay: 4, sp_recovery_per_sec: 0.5 }), w('自身未进行攻击时，技力回复速度+0.2/秒', { delay: 2, sp_recovery_per_sec: 0.2 }),
    w('最近10秒内未受伤害时，攻击力+18%（+3%）', { atk: 0.18, delay: 10 }), w('技能开启时不容易成为敌人的目标，且攻击无视目标的物理闪避', { taunt_level: -1 }),
    w('技能未开启时每次受到攻击时对目标造成相当于龙舌兰攻击力23%（+3%）的法术伤害', { atk_scale: 0.23 }),
    w('技能开启时，每秒恢复最大生命值5%（+1%）的生命，同时获得30%（+5%）的近战物理闪避', { hp_recovery_per_sec_by_max_hp_ratio: 0.05, prob: 0.3 }),
  ], [
    [{ when: 'idle', value: 4, mods: { spRecoveryFlat: 0.5 } }], [{ when: 'idle', value: 2, mods: { spRecoveryFlat: 0.2 } }], [{ when: 'unhurt', value: 10, fresh: true, mods: { atkPct: 0.18 } }],
    [{ when: 'inSkill', mods: { taunt: -1 }, flags: { ignoreDodgePhys: true } }], [{ when: 'notInSkill', mods: { counterArts: 0.23 } }],
    [{ when: 'inSkill', mods: { hpRegenRatio: 0.05, dodgeMelee: 0.3 } }],
  ]);
  assert.deepEqual([
    s('如果2秒内没有主动攻击过，下次攻击造成相当于攻击力133%（+3%）的物理伤害', { atk_scale: 1.33, 'attack@delay': 2 }),
    s('如果4秒内没有主动攻击过，下一次攻击的攻击力提升至155%（+5%）并晕眩目标4秒', { delay: 4, atk_scale: 1.55, stun: 4 }),
    s('4秒内未进行治疗后，下次治疗时的治疗量提升至攻击力的155%（+5%）', { delay: 4, heal_scale_2: 1.55 }),
    s('平时处于隐匿状态，攻击时会解除隐匿状态，且当次攻击的攻击力+54%（+4%）。停止攻击5秒后，重新进入隐匿状态', { delay: 5, atk: 0.54 }),
    s('若最近8（-1）秒内未受攻击，闪避下一次物理或法术攻击', { stack_time: 8, prob: 1 }),
    s('距离上次攻击的间隔越长，下次攻击的攻击力就越高（最长2.5秒，攻击力190%（+10%））', { 'attack@min_delta': 1, 'attack@max_delta': 2.5, 'attack@min_atk_scale': 1, 'attack@max_atk_scale': 1.9 }),
    s('若8秒内未主动攻击，获得相当于生命上限18%（+3%）的屏障，失去屏障后重新计时', { interval: 8, shield: 0.18 }),
    s('有33%（+3%）的概率闪避敌人的近战物理攻击，成功闪避后自己的下一次攻击攻击力+100%', { 'tiger_t_1[evade].prob': 0.33, 'charge_on_evade.atk': 1 }),
    s('触发闪避时，下次攻击变为二连击并攻击所有阻挡的敌人', {}),
  ], [
    { nextAttack: [{ when: 'idle', value: 2, scale: 1.33 }] }, { nextAttack: [{ when: 'idle', value: 4, scale: 1.55, stun: 4 }] }, { nextAttack: [{ when: 'idle', value: 4, scale: 1.55 }] },
    { whiles: [{ when: 'idle', value: 5, fresh: true, mods: {}, flags: { stealth: true } }], nextAttack: [{ when: 'idle', value: 5, fresh: true, atk: 0.54 }] },
    { whiles: [{ when: 'calm', value: 8, mods: { dodgePhys: 1, dodgeArts: 1 } }] }, { rhythm: { min: 1, max: 2.5, top: 1.9 } }, { idleShield: { value: 8, share: 0.18 } },
    { whiles: [{ when: 'always', mods: { dodgeMelee: 0.33 } }], nextAttack: [{ when: 'dodged', atk: 1 }] }, { nextAttack: [{ when: 'dodged', times: 2, blocked: true }] },
  ]);
  assert.deepEqual([s('如果2秒内没有主动攻击过，下次攻击造成相当于攻击力133%的物理伤害', { atk_scale: 1.33 }), w('身侧或身后存在高台时获得25%的物理抵挡', { cnt: 1, prob: 0.25 })],
    [null, [{ when: 'highSide', value: 1, mods: { blockPhys: 0.25 } }]], 'a key missing; 高台 behind or at its sides');
});

test('[干员-25] talents on life: a second life, a heal once low, a last stand, a heal bought with cost, a frozen life, heals on hits, 护盾 layers, true damage returned', async () => {
  const s = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => specialParts(talent(d, bb)).trait;
  assert.deepEqual([
    s('被击倒时不撤退，恢复所有生命且生命上限-50%，攻击速度+21（+3）、防御力+21%（+3%）（单次部署只触发一次）', { max_hp: 0.5, hp_ratio: 1, attack_speed: 21, def: 0.21 }),
    s('生命值低于25%时，仅一次立刻回复55%（+5%）最大生命值，且自身之后受到的物理伤害降低15%（+5%）', { hp_ratio: 0.25, damage_resistance: 0.15, 'etlchi_t_2[heal].hp_ratio': 0.55 }),
    s('受到致命伤害时持续使生命值不低于1，9（+1）秒后强制退出战场', { 'surtr_t_2[withdraw].interval': 9 }),
    s('受到致命伤害时，若费用足够则消耗5点部署费用使生命恢复到80%（+10%），每次触发该天赋时消耗的费用翻倍', { cost: -5, hp_ratio: 0.8, cost_multi: 2 }),
    s('受到伤害时使敌人寒冷2（+0.5）秒，若受到致命伤害，仅一次立刻回复所有生命值并使自身冻结4秒，使攻击范围内所有敌方单位冻结8秒', { hp_ratio: 1, cold: 2, freeze: 4, c2e_freeze: 8 }),
    s('每次受到伤害时，治疗自身100点生命值；生命值低于50%时，治疗效果提升至160点生命值', { hp_ratio: 0.5, value1: 100, value2: 160 }),
    s('每9秒获得1层护盾（最多3层，部署后立即获得1层），每层护盾破裂时恢复自身22%（+2%）最大生命', { interval: 9, times: 1, max_times: 3, hp_ratio: 0.22 }),
    s('在场时，自身更容易受到攻击，所有卡西米尔干员被攻击时反弹相当于玛恩纳攻击力18%（+3%）的真实伤害', { taunt_level: 1, atk_scale: 0.18 }),
  ], [
    { secondLife: { hp: 1, mods: { hpMul: 0.5, aspd: 21, defPct: 0.21 } } }, { lowHp: { below: 0.25, heal: 0.55, mods: { physTakenMul: 0.85 } } }, { lastStand: { seconds: 9 } },
    { costLife: { cost: 5, hp: 0.8, mul: 2 } }, { hurt: { status: { key: 'cold', seconds: 2 } }, frostLife: { hp: 1, self: 4, foes: 8 } },
    { hurt: { heal: { low: 100, high: 160, below: 0.5 } } }, { layers: { every: 9, max: 3, init: 1, heal: 0.22 } },
    { whiles: [{ when: 'always', mods: { taunt: 1 } }], reflect: { power: 'kazimierz', scale: 0.18 } },
  ]);
  assert.equal(s('在场时，自身更容易受到攻击，所有维多利亚干员被攻击时反弹相当于玛恩纳攻击力18%的真实伤害', { taunt_level: 1, atk_scale: 0.18 })?.reflect?.power, 'victoria');
  assert.equal(s('在场时，自身更容易受到攻击，所有无名之国干员被攻击时反弹相当于玛恩纳攻击力18%的真实伤害', { taunt_level: 1, atk_scale: 0.18 }), null, 'a faction it does not know');
  const [horn, mlynar, surtr] = [await atE2('char_4039_horn'), await atE2('char_4064_mlynar'), await atE2('char_350_surtr')];
  assert.deepEqual([horn.talentTrait.secondLife, mlynar.talentTrait.reflect, surtr.talentTrait.lastStand], [{ hp: 1, mods: { hpMul: 0.5, aspd: 18, defPct: 0.18 } }, { power: 'kazimierz', scale: 0.15 }, { seconds: 8 }], '号角, 玛恩纳, 史尔特尔');
});

test('[干员-26] the damage by its source and 抵挡: 伤害抵挡, 远程物理抵挡, damage from a tag, 对空庇护, 可颂\'s 抵挡 shared; an effect doubled after a while; more ammo', async () => {
  const m = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => alwaysMods(talent(d, bb));
  const t = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => teamPart(talent(d, bb));
  assert.deepEqual([m('获得28%（+3%）的伤害抵挡', { prob: 0.28 }), m('获得30%（+3%）的远程物理抵挡', { prob: 0.3 }), m('受到来自【萨卡兹】敌人的伤害降低30%', { damage_resistance: 0.3 }),
    m('受到来自【乌萨斯】敌人的伤害降低30%', { damage_resistance: 0.3 })], [{ blockAll: 0.28 }, { blockRangedPhys: 0.3 }, { 'from:sarkaz': 0.7 }, null]);
  assert.deepEqual([
    t('上阵时，所有友方单位受到【萨卡兹】敌人的伤害降低15%（+5%）', { damage_resistance: 0.15 }),
    t('在场时，所有【深海猎人】干员每秒回复2.5%最大生命值且受到【海怪】敌人的物理与法术伤害降低25%', { hp_recovery_per_sec_by_max_hp_ratio: 0.025, damage_resistance: 0.25 }),
    t('灵知在场且部署后经过10秒时，使所有【谢拉格】干员获得抵抗', { interval: 10, one_minus_status_resistance: -0.5 }),
    t('在场时，所有【深海猎人】干员攻击力+10%且获得某种效果', { atk: 0.1 }),
  ], [
    { when: 'field', all: true, bb: {}, mods: { 'from:sarkaz': 0.85 } }, { when: 'field', power: 'abyssal', bb: {}, mods: { hpRegenRatio: 0.025, 'fromPA:seamonster': 0.75 } },
    { when: 'field', power: 'kjerag', bb: {}, mods: { statusResFlat: -0.5 }, after: 10 }, null,
  ]);
  assert.deepEqual(auraParts(talent('部署后，嘉辛塔自身与周围八格的友方单位获得15%（+2%）的对空庇护', { damage_resistance: 0.15 }), RANGES).range.map((r) => [r.mods, r.area?.length]), [[{ airTakenMul: 0.85 }, 9]]);
  assert.deepEqual(specialParts(talent('有23%（+3%）的几率抵挡物理和法术伤害。周围四格内的友方单位获得一半该效果', { 'moeshd_t_1[self].prob': 0.23, 'moeshd_t_1[aura].prob': 0.115 })),
    { trait: { whiles: [{ when: 'always', mods: { blockPA: 0.23 } }] }, range: [{ side: 'ally', ranged: false, mods: { blockPA: 0.115 }, area: [{ row: 1, col: 0 }, { row: -1, col: 0 }, { row: 0, col: 1 }, { row: 0, col: -1 }] }] });
  const cement = talent('自身获得15%（+3%）的物理减伤；在战场停留35秒后效果翻倍', { damage_resistance: 0.15, interval: 35, damage_resistance_addtion: 0.15 });
  const after = /** @type {any} */ (timedPart(cement));
  assert.deepEqual([alwaysMods(cement), after.kind, after.seconds], [{ physTakenMul: 0.85 }, 'after', 35]);
  assert.ok(Math.abs(0.85 * after.mods.physTakenMul - 0.7) < 1e-12, '30% after 35 s');
  assert.deepEqual(timedPart(talent('在场20秒后，攻击力+10%，自身弹药类技能弹药上限+1', { interval: 20, atk: 0.1, add_count: 1, ex_add_count: 0 })), { kind: 'after', seconds: 20, max: 1, mods: { atkPct: 0.1, ammoFlat: 1 } });
  const [glady, moeshd] = [await atE2('char_474_glady'), await atE2('char_201_moeshd')];
  assert.deepEqual([glady.fieldTalents, moeshd.talentTrait.whiles, moeshd.rangeTalents[0].mods], [[{ power: 'abyssal', bb: {}, mods: { hpRegenRatio: 0.025, 'fromPA:seamonster': 0.75 } }], [{ when: 'always', mods: { blockPA: 0.2 } }], { blockPA: 0.1 }], '歌蕾蒂娅, 可颂');
});

test('[干员-27] talents on the enemies: targets preferred and their 倍率, sleeping enemies, 停顿/束缚 checked later, the first hit on each enemy, marks, 偷取, the weakest targets', async () => {
  const s = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => specialParts(talent(d, bb)).trait;
  assert.deepEqual([
    s('优先攻击晕眩的敌人且攻击晕眩敌人时攻击力提升至165%（+5%）', { atk_scale: 1.65 }),
    s('自身可以攻击并优先攻击沉睡的目标且攻击力提升至144%（+4%）', { atk_scale: 1.44 }),
    s('自身可以攻击沉睡的敌人', {}),
    s('自身可以攻击沉睡的敌人，并且攻击沉睡敌人时无视其防御力的50%', { def_penetrate: 0.5 }),
    s('优先攻击【无人机】单位，且攻击【无人机】时攻击力提升至155%（+5%）', { atk_scale: 1.55 }),
    s('攻击处于停顿、束缚的敌人时，额外造成相当于攻击力43%（+3%）的法术伤害', { atk_scale: 0.43 }),
    s('自身可以攻击沉睡的敌人，且攻击非移动敌人时对其额外造成相当于攻击力16%（+1%）的法术伤害，在场时沉睡中的敌人每秒受到缇缇攻击力32%（+2%）的法术伤害', { damage_atk_scale: 0.32, extra_atk_scale: 0.16 }),
    s('治疗处于异常状态中的友方干员时治疗量提升至123%（+3%）', { heal_scale_up: 1.23 }),
  ], [
    { prefer: [{ status: 'stun' }], vs: [{ when: 'status', status: 'stun', atk: 1.65 }] },
    { hurtSleeping: true, prefer: [{ status: 'sleep' }], vs: [{ when: 'status', status: 'sleep', atk: 1.44 }] },
    { hurtSleeping: true },
    { hurtSleeping: true, vs: [{ when: 'status', status: 'sleep', defPct: 0.5 }] },
    { prefer: [{ tag: 'drone' }], vs: [{ when: 'tag', tag: 'drone', atk: 1.55 }] },
    { vs: [{ when: 'statusAny', statuses: ['sluggish', 'root'], on: 'damage', arts: 0.43, later: true }] },
    { hurtSleeping: true, vs: [{ when: 'still', on: 'damage', arts: 0.16 }], sleepDot: 0.32 },
    { vs: [{ when: 'abnormal', heal: 1.23 }] },
  ]);
  assert.deepEqual([
    s('攻击命中生命值为满的敌人时攻击力提升至125%（+5%），并额外回复2点技力', { hp_ratio: 1, atk_scale: 1.25, sp: 2 }),
    s('攻击命中生命值在80%以上的敌人时，3秒内异客对其造成的伤害提升25%（+5%）', { hp_ratio: 0.8, 'pasngr_t_1[enhance].damage_scale': 1.25, 'pasngr_t_1[enhance].duration': 3 }),
    s('对每个敌人造成首次伤害后，10秒内忍冬对该敌人造成伤害时额外造成攻击力30%的法术伤害', { atk_scale: 0.3, interval: 10 }),
    s('对每个敌人首次进行攻击时攻击力提升至115%（+5%），并使目标浮空2.5秒', { levitate_duration: 2.5, damage_scale: 1.15 }),
    s('对每个敌人首次造成伤害后，使目标束缚5秒并偷取其100（+10）点攻击力（持续至目标被击倒或伊内丝离场）', { steal_atk: 100, duration: 5 }),
    s('攻击时对攻击目标中生命值最少的敌人额外造成相当于攻击力50%的法术伤害', { 'attack@mizuki_t_1.atk_scale': 0.5, 'attack@max_target': 1 }),
    s('攻击时对攻击目标中生命值最少的2名敌人额外造成相当于攻击力55%的法术伤害', { 'attack@mizuki_t_1.atk_scale': 0.55 }),
  ], [
    { vs: [{ when: 'hpFull', on: 'attack', atk: 1.25, sp: 2 }] },
    { vs: [{ when: 'hpAbove', value: 0.8, on: 'attack', mark: { seconds: 3, dmg: 1.25 } }] },
    { vs: [{ when: 'first', seen: 'damage', on: 'damage', mark: { seconds: 10, arts: 0.3 } }] },
    { vs: [{ when: 'first', seen: 'attack', on: 'attack', dmg: 1.15, inflict: { key: 'levitate', seconds: 2.5 } }] },
    { vs: [{ when: 'first', seen: 'damage', on: 'damage', inflict: { key: 'root', seconds: 5 }, steal: { atk: 100, max: 20000 } }] },
    { lowestArts: { scale: 0.5, n: 1 } }, { lowestArts: { scale: 0.55, n: 2 } },
  ], '偷取 at most 200 times the amount when the blackboard has no cap');
  assert.deepEqual([s('优先攻击【乌萨斯】单位，且攻击【乌萨斯】时攻击力提升至155%', { atk_scale: 1.55 }), s('攻击命中生命值为满的敌人时攻击力提升至125%', { atk_scale: 1.25 }),
    s('攻击处于停顿、束缚的敌人时，额外造成相当于攻击力45%的法术伤害，目标同时处于停顿和束缚时该伤害提升至原本的1.1倍', { atk_scale: 0.45 })], [null, null, null], 'a tag it does not know, a sentence more or less');
  assert.equal(targetPart(talent('攻击处于停顿、束缚的敌人时，额外造成相当于攻击力43%的法术伤害', { atk_scale: 0.43 })), null, 'not a target part too');
  const [blitz, ines, mizuki, titi] = [await atE2('char_457_blitz'), await atE2('char_4087_ines'), await atE2('char_437_mizuki'), await atE2('char_4056_titi')];
  assert.deepEqual([blitz.talentTrait.prefer, ines.talentTrait.vs.find((/** @type {any} */ v) => v.steal)?.inflict, mizuki.talentTrait.lowestArts?.n, titi.talentTrait.hurtSleeping],
    [[{ status: 'stun' }], { key: 'root', seconds: 5 }, 1, true], '闪击, 伊内丝, 水月, 缇缇 from the real data');
});

test('[干员-28] talents on elements: answers to bursts, steps for them, damage while one lasts, 元素损伤 over time, pulses, 麻痹, element values back, heals over time', async () => {
  const s = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => specialParts(talent(d, bb));
  const tr = (/** @type {string} */ d, /** @type {Record<string, number>} */ bb) => s(d, bb).trait;
  assert.deepEqual([
    tr('攻击范围内的敌人灼燃损伤爆发开始时立即受到相当于攻击力320%（+20%）的元素伤害', { ep_damage_scale: 3.2 }),
    tr('全场有敌人灼燃损伤爆发开始时，立即对其造成相当于攻击力380%（+30%）的元素伤害并回复15%（+3%）最大生命', { ep_damage_scale: 3.8, hp_ratio: 0.15 }),
    tr('攻击处于凋亡损伤爆发期间的敌人时使其每秒受到相当于攻击力40%的元素伤害，持续至凋亡损伤爆发结束', { element_atk_scale: 0.4 }),
    tr('每当自身攻击范围内敌人凋亡损伤爆发，攻击力+2%，最多可叠加12（+2）层', { atk: 0.02, max_stack_cnt: 12 }),
    tr('攻击范围内有敌人侵蚀损伤爆发时攻击速度+7（+1），最多可叠加3层', { attack_speed: 7, max_stack_cnt: 3 }),
    tr('攻击范围内的敌人触发麻痹时立即受到相当于攻击力130%（+10%）的元素伤害', { atk_scale: 1.3 }),
    tr('对每个敌人首次攻击时，使其在接下来的5秒内每秒受到相当于攻击力18%（+2%）的灼燃损伤', { 'attack@ep_damage_ratio_talent': 0.18, 'attack@dmg_duration': 5 }),
  ], [
    { burstOn: [{ el: 'FIRE', where: 'range', dmg: 3.2 }] }, { burstOn: [{ el: 'FIRE', where: 'field', dmg: 3.8, heal: 0.15 }] },
    { vs: [{ when: 'burstOf', el: 'DARK', on: 'attack', post: true, burstDot: 0.4 }] },
    { stacks: [{ on: 'burst', el: 'DARK', max: 12, mods: { atkPct: 0.02 } }] }, { stacks: [{ on: 'burst', el: 'WATER', max: 3, mods: { aspd: 7 } }] },
    { palsyHit: 1.3 }, { vs: [{ when: 'first', seen: 'attack', on: 'attack', epDot: { el: 'FIRE', scale: 0.18, seconds: 5 } }] },
  ]);
  assert.deepEqual([
    tr('使攻击范围内敌人每秒受到相当于攻击力10%的凋亡损伤并停顿0.2秒', { ep_damage_ratio: 0.1, sluggish: 0.2 }),
    tr('阻挡敌人时自身获得30%（+5%）的庇护，并使阻挡的目标每秒受到相当于攻击力40%的法术伤害和相当于攻击力12%的灼燃损伤',
      { damage_resistance: 0.3, 'yu_t_1[enemy].atk_scale': 0.4, 'yu_t_1[enemy].ep_damage_ratio': 0.12, 'yu_t_1[enemy].interval': 1 }),
    tr('场上干员数量不低于4时，自身每秒回复相当于生命上限2%（+0.5%）的生命与元素损伤', { cnt: 4, ep_heal_ratio: 0.02, hp_recovery_per_sec_by_max_hp_ratio: 0.02, interval: 1 }),
    tr('对自身阻挡的敌人每秒造成相当于攻击力10%（+1%）的神经损伤', { ep_damage_ratio: 0.1 }),
    tr('自身受到的元素损伤-12%（+2%），受到的侵蚀损伤额外-12%（+2%）', { 'ep_damage_resistance[other]': 0.12, 'ep_damage_resistance[water]': 0.12 }),
    tr('每攻击到一个敌人回复自身35（+5）元素损伤，最大生效数等于阻挡数', { value: 35 }),
    tr('普通治疗使目标每秒额外受到一次治疗量和元素损伤回复量为10%的增益治疗，持续6秒（最多叠加3层）', { heal_scale: 0.1, duration: 6, max_stack_cnt: 3 }),
  ], [
    { pulses: [{ who: 'range', every: 1, ep: { el: 'DARK', scale: 0.1 }, status: { key: 'sluggish', seconds: 0.2 } }] },
    { whiles: [{ when: 'blocking', mods: { physTakenMul: 0.7, artsTakenMul: 0.7 } }], pulses: [{ who: 'blocked', every: 1, ep: { el: 'FIRE', scale: 0.12 }, arts: 0.4 }] },
    { whiles: [{ when: 'fieldOps', value: 4, mods: { hpRegenRatio: 0.02, epRegenRatio: 0.02 } }] },
    { pulses: [{ who: 'blocked', every: 1, ep: { el: 'SANITY', scale: 0.1 } }] },
    { whiles: [{ when: 'always', mods: { epTakenMul: 0.88, WATERTakenMul: 0.88 } }] },
    { epOnHit: 35 }, { healDot: { share: 0.1, seconds: 6, max: 3 } },
  ]);
  assert.deepEqual([s('使攻击范围内敌人受到的凋亡损伤提高22%（+2%）', { ep_damage_scale: 1.22 }), s('攻击范围内元素损伤累计超过一半的目标受到的元素损伤降低18%（+3%）', { ep_damage_resistance: 0.18 })], [
    { trait: null, range: [{ side: 'enemy', ranged: false, mods: { DARKTakenMul: 1.22 } }] },
    { trait: null, range: [{ side: 'ally', ranged: false, when: { when: 'epHalf' }, mods: { epTakenMul: 0.82 } }] },
  ], 'in-range parts');
  assert.deepEqual([tr('攻击范围内的敌人灼燃损伤爆发开始时立即受到相当于攻击力320%的元素伤害', {}), tr('攻击处于凋亡损伤爆发期间的敌人时使其每秒受到相当于攻击力40%的元素伤害，持续至灼燃损伤爆发结束', { element_atk_scale: 0.4 })],
    [null, null], 'without its key; a burst that is not the same');
  const [warmy, cello, yu] = [await atE2('char_4081_warmy'), await atE2('char_245_cello'), await atE2('char_2026_yu')];
  assert.deepEqual([warmy.talentTrait.burstOn[0].el, cello.rangeTalents.some((/** @type {any} */ r) => r.mods.DARKTakenMul > 1), yu.talentTrait.pulses[0].who],
    ['FIRE', true, 'blocked'], '温米, 塑心, 余 from the real data');
});
