// Sentences 技能-9 and 技能-14 leave (docs/spec/skills.md 技能-15): real skill_table levels, at skill level 7 unless a test
// walks the whole roster; one test reads made-up levels for limits no real skill shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, skills, sp } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import { ROSTER, KIT_FILES, loadTraining, operatorAt, skillDefOf, skeletonContent } from '../src/index.js';

/** An operator's skill at elite 2, skill level 7. @param {string} id @param {number} skill */
async function at(id, skill) {
  return /** @type {any} */ (operatorAt(await loadTraining(id), { elite: 2, level: 1, potential: 1, trust: 0, skill, skillLevel: 7 }).skill);
}

/** Every operator's every skill level as the engine's skill, with its operator id. */
async function everyLevel() {
  /** @type {{ char: string, level: import('../src/skills.js').SkillLevel, def: any }[]} */
  const out = [];
  for (const char of Object.keys(ROSTER)) {
    for (const s of (await loadTraining(char)).skills) {
      if (s) for (const level of s.levels) out.push({ char, level, def: skillDefOf(s.id, level) });
    }
  }
  return out;
}

/** The kitless skills A46 of the gap inventory lists: a whole clause 停止攻击 in a skill with a duration. */
const STOPS = [
  'skchr_lava2_2', 'skchr_snakek_2', 'skcom_assist_cost[2]', 'skcom_assist_cost[3]', 'skchr_myrtle_2', 'skchr_skgoat_2', 'skchr_cello_3',
  'skchr_zebra_2', 'skchr_bison_2', 'skchr_utage_1', 'skchr_tknogi_2', 'skchr_jaksel_2', 'skchr_lisa_3', 'skchr_bubble_2', 'skchr_etlchi_2',
  'skchr_elysm_2', 'skchr_titi_2', 'skchr_bdhkgt_2', 'skchr_chimes_2', 'skchr_wanqin_2', 'skchr_luton_2', 'skchr_laios_2', 'skchr_chilc_1',
  'skchr_philae_2', 'skchr_talr_2', 'skchr_cathy_2', 'skchr_christ_2', 'skchr_jcinta_2', 'skchr_robrta_2', 'skchr_bobb_2',
];

test('[技能-15] a whole clause 停止攻击 in a skill with a duration: exactly the 32 kitless operator skills A46 lists', async () => {
  const held = (await everyLevel()).filter((x) => !Object.hasOwn(KIT_FILES, x.char) && x.def.extra?.stopAttack && x.def.extra.stopAttack.seconds === undefined);
  const pairs = new Set(held.map((x) => `${x.char} ${x.def.id}`));
  assert.equal(pairs.size, 32, '支援号令 counts once for each of 桃金娘, 极境, 万顷 and 嘉辛塔');
  assert.deepEqual(new Set(held.map((x) => x.def.id)), new Set(STOPS));
  for (const x of held) assert.ok(x.level.duration > 0 && x.level.durationType !== 'AMMO' && x.level.skillType !== 'PASSIVE', x.def.id);
});

test('[技能-15] 小满\'s stop lasts its sleep, 远山\'s comes after the skill; 停止攻击 sentences that are not this', async () => {
  const [xiaoman, fmout, nearl, gummy, senshi, kafka, lemuen, tmslot, nothin, mitm, chilc, philae] = await Promise.all([
    at('char_4122_grabds', 1), at('char_109_fmout', 1), at('char_148_nearl', 1), at('char_196_sunbr', 1), at('char_4143_sensi', 0),
    at('char_214_kafka', 0), at('char_4193_lemuen', 2), at('char_4236_tmslot', 1), at('char_455_nothin', 0), at('char_4147_mitm', 1),
    at('char_4144_chilc', 0), at('char_4148_philae', 1),
  ]);
  assert.deepEqual(xiaoman.extra.stopAttack, { seconds: 4 }, '小满 S2: the sleep\'s 4 s of a 14 s skill');
  assert.deepEqual([fmout.extra.stopAfter, fmout.extra.stopAttack], [{ seconds: 13 }, undefined], '远山 S2: {time} once the skill ends');
  for (const s of [nearl, gummy, senshi, kafka, lemuen, tmslot, nothin, mitm]) assert.equal(s.extra?.stopAttack, undefined, s.id);
  assert.deepEqual([chilc.extra.stopAttack, chilc.type], [{}, 'AUTO'], '齐尔查克 S1');
  assert.deepEqual([philae.extra.stopAttack, philae.extra.counter.around], [{}, true], '菲莱 S2 keeps its counter (技能-14)');
});

test('[技能-15] [技能-5] cost bit by bit: the total over interval and cost, or the one [cost] group; with keys missing it is not read', async () => {
  const [beta, gamma, wanqin, mitm, headbr, flamtl, blackd, vigil] = await Promise.all([
    at('char_151_myrtle', 0), at('char_401_elysm', 0), at('char_4119_wanqin', 1), at('char_4147_mitm', 1), at('char_115_headbr', 1),
    at('char_420_flamtl', 2), at('char_198_blackd', 1), at('char_427_vigil', 2),
  ]);
  assert.deepEqual(beta.extra.costGain, { every: 0.57, cost: 1, steps: 14, plain: true }, '支援号令·β型');
  assert.deepEqual([gamma.extra.costGain, gamma.bb.cost, skills.kindOf(gamma)], [{ every: 0.44, cost: 1, steps: 18, plain: true }, 1, 'duration'], '支援号令·γ型');
  assert.deepEqual(wanqin.extra.costGain, { every: 0.75, cost: 1, steps: 20 }, '万顷 S2: wanqin_s_2[cost], so no plain cost to hold back');
  assert.deepEqual(mitm.extra.costGain, { every: 1.25, cost: 1, steps: 12 }, '渡桥 S2: the total is {mitm_s_2[cost].display}');
  assert.deepEqual(headbr.extra.costGain, { every: 0.905, cost: 1, steps: 11, plain: true }, '凛冬 S2: 技能持续时间内逐渐获得');
  assert.deepEqual(vigil.extra.costGain, { every: 1.364, cost: 1, steps: 11, plain: true }, '伺夜 S3');
  assert.equal(flamtl.extra?.costGain, undefined, '焰尾 S3: no interval');
  assert.equal(blackd.extra?.costGain, undefined, '讯使 S2: the total\'s key is not in the blackboard');
});

test('[技能-15] at every level of every operator, the last cost of a gradual gain falls inside the skill\'s frames', async () => {
  const gains = (await everyLevel()).filter((x) => x.def.extra?.costGain);
  assert.deepEqual(new Set(gains.map((x) => x.def.id)), new Set([
    'skcom_assist_cost[2]', 'skcom_assist_cost[3]', 'skchr_myrtle_2', 'skchr_elysm_2', 'skchr_jcinta_2', 'skchr_wanqin_2', 'skchr_headbr_2', 'skchr_rfalcn_2',
    'skchr_mitm_2', 'skchr_vigil_3', 'skchr_acpion_2', 'skchr_makiri_2', 'skchr_bstalk_2', 'skchr_saga_3', 'skchr_sleach_2',
  ]), 'the three phrasings across the roster (嵯峨 S3 and 琴柳 S2 have kits)');
  for (const { def, level } of gains) {
    const g = def.extra.costGain;
    assert.ok(secondsToFrames(Number((g.steps * g.every).toFixed(9))) <= secondsToFrames(level.duration), `${def.id} ${level.duration}`);
  }
});

test('[技能-15] HP lost as the skill starts: a share of the HP it has, or of its maximum', async () => {
  const [utage, kazema, akafyu, morgan, zuole, turdus] = await Promise.all([
    at('char_337_utage', 1), at('char_4016_kazema', 1), at('char_475_akafyu', 1), at('char_154_morgan', 1), at('char_4121_zuole', 1), at('char_4224_turdus', 1),
  ]);
  assert.deepEqual([utage.extra.selfLoss, utage.type], [{ ratio: 0.5 }, 'PASSIVE'], '宴 S2: 部署后立即流失');
  assert.deepEqual([kazema.extra.selfLoss, akafyu.extra.selfLoss, zuole.extra.selfLoss], [{ ratio: 0.5 }, { ratio: 0.5 }, { ratio: 0.5 }]);
  assert.deepEqual(morgan.extra.selfLoss, { ratio: 0.7, ofMax: true }, '摩根 S2: morgan_s_2.hp_ratio of the maximum');
  assert.deepEqual(morgan.extra.barrier, { ratio: 1.3, seconds: 6, decay: true }, 'her barrier stays 技能-14\'s');
  assert.equal(turdus.extra?.selfLoss, undefined, '乌啾 S2: 流失 without 立即, before a heal');
});

test('[技能-15] [技能-5] what the skill does to enemies as it starts; the plain atk_scale is the opening hit\'s', async () => {
  const [xiaoman, tmoris, provs, blitz, iris, blemish, nymph, kafka, pith] = await Promise.all([
    at('char_4122_grabds', 1), at('char_4186_tmoris', 1), at('char_4032_provs', 1), at('char_457_blitz', 1), at('char_338_iris', 1),
    at('char_423_blemsh', 1), at('char_4146_nymph', 1), at('char_214_kafka', 0), at('char_612_accast', 2),
  ]);
  assert.deepEqual(xiaoman.extra.opening, [{ where: 'attack', most: 3, status: [{ key: 'sleep', seconds: 4 }] }], '小满 S2');
  assert.equal(xiaoman.extra.hitScale, undefined);
  assert.deepEqual(tmoris.extra.opening, [{ where: 'attack', status: [{ key: 'fear', seconds: 1.5 }] }], '八幡海铃 S2: 1.5 as written');
  assert.deepEqual(provs.extra.opening, [{ where: 'attack', hit: { scale: 2.8, type: 'arts' }, status: [{ key: 'sluggish', seconds: 7 }, { key: 'silence', seconds: 7 }] }], '但书 S2');
  assert.deepEqual([provs.extra.hitScale, skills.skillMods(provs.bb, provs.extra.hitScale).scale], ['attack', 1], 'not ×2.8 on every attack');
  assert.deepEqual(blitz.extra.opening, [{ where: 'blocked', hit: { scale: 1.7, type: 'phys' }, status: [{ key: 'stun', seconds: 6 }] }], '闪击 S2');
  assert.equal(blitz.extra.hitScale, 'attack');
  assert.deepEqual([iris.extra?.opening, skills.kindOf(iris)], [undefined, 'next'], '爱丽丝 S2 stays a next attack');
  for (const s of [blemish, nymph, kafka, pith]) assert.equal(s.extra?.opening, undefined, s.id);
});

/**
 * A made-up skill level (no real skill shows these limits): a manual 10 s skill unless `o` says otherwise.
 * @param {string} description @param {Record<string, number>} bb @param {Partial<import('../src/skills.js').SkillLevel>} [o]
 * @returns {import('../src/skills.js').SkillLevel}
 */
const made = (description, bb, o = {}) => ({
  skillType: 'MANUAL', durationType: 'NONE', duration: 10, spData: { spType: 'INCREASE_WITH_TIME', spCost: 10, initSp: 0, maxChargeTime: 1 },
  blackboard: Object.entries(bb).map(([key, value]) => ({ key, value })), description, rangeId: null, ...o,
});

test('[技能-15] the readers\' limits, on made-up levels: 之后 after 小满\'s sentence, a loss that starts its clause and is at most all, cost bit by bit only in a skill that runs', () => {
  const extra = (/** @type {import('../src/skills.js').SkillLevel} */ l) => /** @type {any} */ (skillDefOf('made', l)).extra ?? {};
  const few = '停止攻击敌人并使攻击范围内{max_target}个敌方单位沉睡{sleep}秒', fewBb = { max_target: 3, sleep: 4, attack_speed: 90 };
  assert.deepEqual(extra(made(`${few}，之后攻击速度+{attack_speed}`, fewBb)).stopAttack, { seconds: 4 });
  assert.deepEqual([extra(made(few, fewBb)).stopAttack, extra(made(few, fewBb)).opening], [undefined, undefined], 'without 「之后」');
  assert.deepEqual(extra(made('立即流失{hp_ratio:0%}当前生命', { hp_ratio: 0.5 })).selfLoss, { ratio: 0.5 });
  assert.equal(extra(made('立即流失{hp_ratio:0%}当前生命', { hp_ratio: 1.5 })).selfLoss, undefined, 'more than all of it');
  assert.equal(extra(made('攻击力+{atk:0%}，每次攻击后立即流失{hp_ratio:0%}当前生命', { atk: 0.5, hp_ratio: 0.1 })).selfLoss, undefined, 'not at the start of its clause');
  const gain = '停止攻击，持续时间内回复总共{value}点部署费用', gainBb = { value: 14, interval: 0.57, cost: 1 };
  assert.deepEqual(extra(made(gain, gainBb)).costGain, { every: 0.57, cost: 1, steps: 14, plain: true });
  for (const o of [{ skillType: 'PASSIVE' }, { durationType: 'AMMO' }, { duration: 0 }]) {
    const x = extra(made(gain, gainBb, o));
    assert.deepEqual([x.costGain, x.stopAttack], [undefined, undefined], JSON.stringify(o));
  }
});

test('[技能-15] [技能-5] 桃金娘\'s 支援号令·β型 from the data, run: 14 cost over its 8 s, none at the start, its attacks held while it runs', async () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.level.options = { ...c.level.options, initialCost: 50, maxCost: 99, costIncreaseTime: 1e6 };
  c.operators = { myrtle: operatorAt(await loadTraining('char_151_myrtle'), { elite: 2, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 7 }) };
  c.behaviors = skeletonContent.behaviors;
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'myrtle', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {any} */ (w.units.find((u) => u.key === 'myrtle')), p = w.players[0], before = p.cost;
  sp.forceSp(op.skill, 99);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  assert.deepEqual([op.skill.active, p.cost, op.buffs.some((/** @type {any} */ b) => b.key === 'skillStop' && b.flags.noAttack)], [true, before, true]);
  for (let i = 0; i < secondsToFrames(8); i++) step(w, c, []);
  assert.deepEqual([op.skill.active, p.cost, op.buffs.some((/** @type {any} */ b) => b.key === 'skillStop')], [false, before + 14, false]);
});
