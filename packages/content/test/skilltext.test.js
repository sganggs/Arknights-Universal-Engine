// Sentences 技能-9 does not read (docs/spec/skills.md 技能-14): real skill_table levels at skill level 7.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skills } from '@aue/sim';

/** An operator's skill at elite 2, skill level 7. @param {string} id @param {number} skill */
async function skillAt(id, skill) {
  const { loadTraining, operatorAt } = await import('../src/index.js');
  return /** @type {any} */ (operatorAt(await loadTraining(id), { elite: 2, level: 1, potential: 1, trust: 0, skill, skillLevel: 7 }).skill);
}

/** @param {string} id @param {number} index */
const at = (id, index) => skillAt(id, index);

test('[技能-14] a counter while the skill runs: the attacker, or the ground around, with the sentence\'s silence and 元素损伤', async () => {
  const [xing, hoshiguma, nian, bubble, philae, noir, mixer] = await Promise.all([
    at('char_1044_hsgma2', 0), at('char_136_hsguma', 1), at('char_2014_nian', 1), at('char_381_bubble', 1), at('char_4148_philae', 1),
    at('char_1030_noirc2', 0), at('char_4194_rmixer', 2),
  ]);
  assert.deepEqual(xing.extra.counter, { scale: 1.3, stat: 'atk', type: 'arts' }, '斩业星熊 S1');
  assert.equal(xing.extra.hitScale, 'attack', 'plain atk_scale is the counter, not the hit');
  assert.equal(xing.forever, true);
  assert.deepEqual(hoshiguma.extra.counter, { scale: 0.8, stat: 'atk', type: 'phys' }, '星熊 S2');
  assert.deepEqual(nian.extra.counter, { scale: 0.7, stat: 'atk', type: 'arts', silence: 3 }, '年 S2');
  assert.deepEqual(bubble.extra.counter, { scale: 0.4, stat: 'def', type: 'phys' }, '泡泡 S2');
  assert.deepEqual(philae.extra.counter, { scale: 1.4, stat: 'atk', type: 'arts', around: true, ground: true, cooldown: 2, element: 'DARK', epScale: 0.25 }, '菲莱 S2');
  assert.equal(noir.extra?.counter, undefined, '火龙S黑角: 抵挡, not this damage');
  assert.equal(mixer.extra?.counter, undefined, '信仰搅拌机: 进行1次反击, no {atk_scale} of this shape');
});

test('[技能-14] a barrier gained as the skill starts: decay, a physical one, a cap, tied to the skill', async () => {
  const [gravel, judge, phantom, morgan, exusiai, arc, cairn] = await Promise.all([
    at('char_237_gravel', 1), at('char_4065_judge', 2), at('char_250_phatom', 0), at('char_154_morgan', 1),
    at('char_1041_angel2', 1), at('char_4195_radian', 0), at('char_4214_cairn', 1),
  ]);
  assert.deepEqual(gravel.extra.barrier, { ratio: 1.8, seconds: 10, decay: true }, '砾 S2');
  assert.equal(gravel.extra.barrier.tied, undefined);
  assert.deepEqual(judge.extra.barrier, { ratio: 1, seconds: 30, tied: true }, '斥罪 S3: the skill\'s own seconds');
  assert.deepEqual(phantom.extra.barrier, { ratio: 0.5, seconds: 10, type: 'phys' }, '傀影 S1: the next clause\'s seconds, physical, no decay');
  assert.deepEqual(morgan.extra.barrier, { ratio: 1.3, seconds: 6, decay: true }, '摩根 S2: shield_duration, not the skill\'s 18s');
  assert.deepEqual(exusiai.extra.barrier, { ratio: 2, seconds: 30, decay: true }, '新约能天使 S2: shield_max_duration');
  assert.equal(exusiai.extra.hitScale, undefined, 'her attack@ scale is not claimed');
  assert.deepEqual(arc.extra.barrier, { ratio: 0.7, seconds: 25, tied: true }, '电弧 S1: 持续至技能结束');
  assert.deepEqual(cairn.extra.barrier, { ratio: 0.9, seconds: 10, cap: 0.9 }, '响石 S2: the parenthesis stays one clause');
  assert.equal(cairn.extra.hitScale, undefined, 'atk_scale 0.6 stays the hit scale');
  assert.equal(cairn.bb.atk_scale, 0.6);
});

test('[技能-14] [技能-5] a burst at the start or the end; plain atk_scale is not the attack\'s scale', async () => {
  const [yu, texas, red, waai, phantom, misery, mint, czerny] = await Promise.all([
    at('char_2026_yu', 1), at('char_1028_texas2', 1), at('char_144_red', 1), at('char_243_waaifu', 1),
    at('char_250_phatom', 2), at('char_615_acspec', 2), at('char_388_mint', 1), at('char_4047_pianst', 1),
  ]);
  assert.deepEqual([yu.extra.bursts[0].at, yu.extra.bursts[0].type, yu.extra.bursts[0].scale, yu.extra.bursts[0].where, yu.extra.bursts[0].range.length], ['start', 'arts', 1, 'cells', 13], '余 S2 x-1');
  assert.equal(yu.extra.attack.type, 'arts', '普通攻击造成法术伤害 stays 技能-9');
  assert.deepEqual([texas.extra.bursts[0].scale, texas.extra.bursts[0].range.length, texas.extra.hitScale], [1.8, 9, 'attack'], '缄默德克萨斯 S2');
  assert.equal(red.extra.attack.hitStatus.key, 'stun', '并使命中 stays a hit status');
  assert.equal(red.extra.bursts[0].scale, 2, '红 S2');
  assert.equal(waai.extra.attack.hitStatus.key, 'silence');
  assert.equal(waai.extra.bursts[0].scale, 2.4, '槐琥 S2');
  assert.equal(phantom.extra.counter, undefined, '傀影 S3 root is not a counter');
  assert.equal(phantom.extra.bursts[0].scale, 2.4);
  assert.equal(misery.extra.bursts[0].type, 'phys', 'Misery S3');
  assert.deepEqual(mint.extra.bursts[0], { at: 'end', scale: 2.4, type: 'arts', where: 'attack' }, '薄绿 S2');
  assert.deepEqual([mint.extra.hitScale, mint.bb['attack@atk_scale'], mint.bb.atk_scale], ['attack', 1.15, 2.4]);
  assert.equal(mint.extra.attack.displace.force, 0, 'attack@force 0 still reads as 技能-9');
  assert.deepEqual(czerny.extra.bursts[0], { at: 'end', scale: 1.9, type: 'arts', where: 'attack' }, '车尔尼 S2: 周围, no rangeId, so the attack range');
});

test('[技能-14] self-stun when the skill ends, from plain stun', async () => {
  const [amiya, liskarm, shark, broca, bryo, eunectes, aegis, aurora, iris] = await Promise.all([
    at('char_002_amiya', 1), at('char_107_liskam', 1), at('char_143_ghost', 1), at('char_356_broca', 1),
    at('char_4106_bryota', 1), at('char_416_zumama', 2), at('char_4218_aigis', 0), at('char_422_aurora', 0), at('char_489_serum', 0),
  ]);
  assert.deepEqual([amiya, liskarm, shark, broca, bryo, eunectes, aegis, aurora, iris].map((s) => s.extra.selfStun.seconds), [10, 5, 10, 6, 6, 5, 10, 5, 10]);
  assert.equal(liskarm.bb['attack@stun'], 1, '雷蛇: the hit stun is attack@stun; plain stun is her own');
  assert.equal(liskarm.bb.stun, 5);
});

test('[技能-14] [技能-1] a non-medic healing an ally; the range is not the attack range; 治疗量 and bind keys are not this', async () => {
  const [gummy, blem1, blem3, saria1, saria2, nearl, shu, bassline, purestream, thorns, swire, touch, winter, ling, carnelian, mizuki] = await Promise.all([
    at('char_196_sunbr', 0), at('char_423_blemsh', 0), at('char_423_blemsh', 2), at('char_202_demkni', 0), at('char_202_demkni', 1),
    at('char_148_nearl', 0), at('char_2025_shu', 0), at('char_4109_baslin', 0), at('char_385_finlpp', 0),
    at('char_1039_thorn2', 1), at('char_1033_swire2', 0), at('char_613_acmedc', 2),
    at('char_1051_headb2', 2), at('char_2023_ling', 1), at('char_426_billro', 1), at('char_437_mizuki', 1),
  ]);
  assert.equal(gummy.extra.allyHeal.all, undefined, '古米 S1: one ally');
  assert.deepEqual([gummy.extra.allyHeal.scale, gummy.extra.allyHeal.on, gummy.extra.allyHeal.range.length, gummy.range, skills.kindOf(gummy)], [1.3, 'attack', 9, undefined, 'next']);
  assert.equal(blem1.extra.hitScale, undefined, '瑕光 S1: atk_scale stays the hit');
  assert.deepEqual([blem1.extra.allyHeal.scale, blem1.bb.atk_scale, skills.kindOf(blem1)], [1.2, 2.2, 'next']);
  assert.deepEqual([blem3.extra.allyHeal.others, blem3.extra.allyHeal.on, blem3.extra.allyHeal.range.length, skills.kindOf(blem3)], [true, 'attack', 13, 'duration'], '瑕光 S3');
  assert.deepEqual([saria1.extra.allyHeal.below, saria1.extra.allyHeal.on, skills.kindOf(saria1)], [0.5, 'attack', 'next'], '塞雷娅 S1');
  assert.deepEqual([saria2.extra.allyHeal.all, saria2.extra.allyHeal.on, saria2.extra.allyHeal.range.length, saria2.range, skills.kindOf(saria2)], [true, 'start', 21, undefined, 'instant'], '塞雷娅 S2');
  assert.equal(nearl.extra.allyHeal.below, 0.5, '临光 S1');
  assert.equal(shu.extra.allyHeal.below, 0.5, '黍 S1, the same sentence');
  assert.equal(bassline.extra.allyHeal.below, 0.5, '深律 S1');
  assert.deepEqual([purestream.extra.allyHeal.on, purestream.extra.allyHeal.all, skills.kindOf(purestream)], ['start', true, 'instant'], '清流: 攻击范围 is not an attack, so she stays instant');
  assert.equal(thorns.extra?.allyHeal, undefined, '引星棘刺: 每秒, not this heal');
  assert.equal(swire.extra?.allyHeal, undefined, '诗怀雅: 八格');
  assert.equal(touch.extra?.allyHeal, undefined, 'Touch: 治疗量');
  for (const s of [winter, ling, carnelian, mizuki]) assert.equal(s.extra?.counter, undefined, s.id);
});
