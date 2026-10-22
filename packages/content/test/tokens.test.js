// Summons at their owner's training (docs/spec/summons.md 召唤-1…召唤-4). Test names cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROSTER, loadTraining } from '../src/operators.js';
import { TOKENS, SUMMON_PAGES, loadToken, tokenAt, tokenBuild, limitsAt, supplyAt, effectsOf, grantAt } from '../src/tokens.js';

/** @param {Partial<import('../src/operators.js').Build>} o @returns {import('../src/operators.js').Build} */
const build = (o) => ({ elite: 2, level: 90, potential: 1, trust: 0, skill: 0, skillLevel: 7, ...o });

test('[召唤-1] summons are TOKEN entries with their deploy and stack bases, empty skill slots kept; an owner lists its summons', async () => {
  assert.equal(Object.keys(TOKENS).length, 74);
  const mon3tr = await loadToken('token_10002_kalts_mon3tr'), tentacle = await loadToken('token_10001_deepcl_tentac');
  assert.equal(mon3tr.profession, 'TOKEN');
  assert.deepEqual([mon3tr.phases[2].frames[0].stats.maxDeployCount, mon3tr.phases[2].frames[0].stats.maxDeckStackCnt], [1, 0]);
  assert.deepEqual(tentacle.skills, [null, null]);
  assert.deepEqual((await loadTraining('char_003_kalts')).tokens, ['token_10002_kalts_mon3tr']);
  const ling = await loadTraining('char_2023_ling');
  assert.deepEqual(ling.skills.map((s) => s?.token), ['token_10020_ling_soul1', 'token_10020_ling_soul2', 'token_10020_ling_soul3']);
  assert.ok(ling.tokens?.includes('token_10020_ling_soul3'));
  await assert.rejects(loadToken('token_nobody'), RangeError);
});

test('[召唤-2] a summon takes its owner\'s elite and level, no potential or trust; the module adds; the skill slot follows', async () => {
  const ling = await loadTraining('char_2023_ling'), soul = await loadToken('token_10020_ling_soul1');
  const top = soul.phases[2].frames.at(-1)?.stats ?? {};
  const plain = tokenAt(soul, 'token_10020_ling_soul1', ling, build({}));
  assert.deepEqual([plain.maxHp, plain.atk, plain.def], [top.maxHp, top.atk, top.def]);
  const trained = tokenAt(soul, 'token_10020_ling_soul1', ling, build({ potential: 6, trust: 200 }));
  assert.deepEqual([trained.maxHp, trained.atk], [top.maxHp, top.atk]);
  const moduled = tokenAt(soul, 'token_10020_ling_soul1', ling, build({ module: 0, moduleLevel: 3 }));
  assert.deepEqual([moduled.maxHp - top.maxHp, moduled.atk - top.atk, moduled.cost - top.cost], [150, 45, -3]);
  assert.equal(plain.skill?.id, 'sktok_ling_soul1');
  assert.equal(tokenAt(soul, 'token_10020_ling_soul1', ling, build({ skill: 1, skillLevel: 10 })).skill?.id, 'sktok_ling_soul1');
  const tentacle = await loadToken('token_10001_deepcl_tentac');
  assert.equal(tokenAt(tentacle, 'token_10001_deepcl_tentac', await loadTraining('char_110_deepcl'), build({ elite: 2, level: 70, skill: 1 })).skill, undefined);
  const dog = await loadToken('token_10063_buddy_bddg');
  assert.deepEqual(tokenBuild(dog, build({ elite: 2, level: 90 })), { elite: 0, level: 30, potential: 1, trust: 0, skill: -1, skillLevel: 7 });
});

test('[召唤-2] [召唤-3] a summon\'s talents unlock at its owner\'s potential: 望\'s 棋子 hold and deploy one more from potential 3', async () => {
  const stone = await loadToken('token_10064_wang_stone1');
  assert.deepEqual(limitsAt(stone, tokenBuild(stone, build({ potential: 2 })), null), { deployLimit: 6, holdLimit: 7 });
  assert.deepEqual(limitsAt(stone, tokenBuild(stone, build({ potential: 3 })), null), { deployLimit: 7, holdLimit: 8 });
});

/** The rich text and bracketed potential differences of a description removed. @param {string | null} d */
const plainText = (d) => (d ?? '').replace(/<[^>]*>/g, '').replace(/（\+\d+）|\(\+\d+\)/g, '');
const COUNT = /** @type {Record<string, number>} */ ({ 一: 1, 两: 2, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 });
/** @param {string} s */
const countOf = (s) => (/^\d+$/.test(s) ? Number(s) : COUNT[s]);

/**
 * Checks one owner talent candidate's counts against its summons' limits (召唤-3); how many summons it checked.
 * @param {import('../src/operators.js').Training} owner @param {import('../src/operators.js').TalentCandidate} c @param {boolean} bySkill
 */
async function checkCounts(owner, c, bySkill) {
  const text = plainText(c.description), use = /(?:使用|携带)(\d+|[一两二三四五六])(?:个|枚)/.exec(text);
  if (!use) return 0;
  const own = /最多拥有(\d+)/.exec(text), dep = /最多(?:同时)?(?:可)?部署(\d+)/.exec(text);
  const ids = c.token && Object.hasOwn(TOKENS, c.token) ? [c.token] : bySkill ? owner.skills.map((s) => /** @type {string} */ (s?.token)) : [];
  for (const t of ids) {
    const token = await loadToken(t), lim = limitsAt(token, tokenBuild(token, build({ elite: c.phase, level: Math.max(1, c.level), potential: c.potential + 1 })), null);
    const at = `${owner.name} ${TOKENS[t].name} elite ${c.phase} potential ${c.potential + 1}`;
    if (own) assert.equal(lim.holdLimit, Number(own[1]), at);
    if (dep) assert.equal(lim.deployLimit, Number(dep[1]), at);
    assert.ok(countOf(use[1]) <= lim.holdLimit, at);
  }
  return ids.length;
}

test('[召唤-3] every owner talent that says how many summons it may use, own and deploy agrees with the limits', async () => {
  let checked = 0;
  for (const id of Object.keys(ROSTER)) {
    const owner = await loadTraining(id), bySkill = owner.skills.length > 0 && owner.skills.every((s) => s?.token);
    for (const c of owner.talents.flat()) checked += await checkCounts(owner, c, bySkill);
  }
  assert.ok(checked >= 140, `${checked} talents checked`);
});

test('[召唤-4] the card: the talent cnt that names the summon, or talent 0\'s for the summon of the skill; the PRTS fields', async () => {
  const deepcl = await loadTraining('char_110_deepcl'), ling = await loadTraining('char_2023_ling'), ironmn = await loadTraining('char_4072_ironmn');
  assert.equal(supplyAt(deepcl, build({ level: 70 }), 'token_10001_deepcl_tentac'), 4);
  assert.equal(supplyAt(ling, build({ skill: 0 }), 'token_10020_ling_soul1'), 5);
  assert.equal(supplyAt(ling, build({ skill: 0 }), 'token_10020_ling_soul2'), 0);
  assert.equal(supplyAt(ironmn, build({ elite: 1, level: 1, skill: 1 }), 'token_10027_ironmn_pile2'), 3);
  assert.equal(supplyAt(await loadTraining('char_4215_buddy'), build({}), 'token_10063_buddy_bddg'), 0);
  const pile = tokenAt(await loadToken('token_10027_ironmn_pile2'), 'token_10027_ironmn_pile2', ironmn, build({ elite: 1, level: 1, skill: 1 }));
  assert.deepEqual(pile.summon, { deployLimit: 2, holdLimit: 2, supply: 3, occupy: 0, respawn: 'default', grant: { n: 1, at: 'end' } });
  const mon3tr = tokenAt(await loadToken('token_10002_kalts_mon3tr'), 'token_10002_kalts_mon3tr', await loadTraining('char_003_kalts'), build({}));
  assert.deepEqual(mon3tr.summon, { deployLimit: 1, holdLimit: 1, supply: 1, occupy: 1, respawn: 'unique' });
  assert.equal(SUMMON_PAGES.token_10070_aphris_pc.respawn, 'queue');
  assert.equal(tokenAt(await loadToken('token_10064_wang_stone1'), 'token_10064_wang_stone1', await loadTraining('char_2027_wang'), build({})).position, 'ALL');
  assert.equal(Object.keys(SUMMON_PAGES).length, 74);
  for (const [id, p] of Object.entries(SUMMON_PAGES)) assert.ok(Object.hasOwn(TOKENS, id) && p.oldid > 0 && [0, 1].includes(p.occupy), id);
});

test('[召唤-7] a summon holds what its page says: not attacked, 禁疗, 无敌, 孤立, the immunities; devices are not selected by enemies', async () => {
  const relay = tokenAt(await loadToken('token_10070_aphris_pc'), 'token_10070_aphris_pc', await loadTraining('char_4229_aphris'), build({}));
  assert.deepEqual(relay.trait?.flags, { untargetable: true, invincible: true, healFree: true, isolated: true, noAllyHeal: true });
  assert.deepEqual(effectsOf(SUMMON_PAGES.token_10056_angel2_target).immune, ['stun', 'freeze', 'levitate', 'silence', 'fear', 'palsy', 'palsyShake']);
  assert.deepEqual(effectsOf(SUMMON_PAGES.token_10002_kalts_mon3tr), { flags: { healFree: true }, immune: [] });
  assert.deepEqual(effectsOf(SUMMON_PAGES.token_10064_wang_stone1).flags, { untargetable: true }, 'a device');
  assert.deepEqual(effectsOf(null), { flags: {}, immune: [] });
});

test('[召唤-8] what the owner\'s skill gives and when, read from its description at its level', async () => {
  const silent = await loadTraining('char_108_silent'), ling = await loadTraining('char_2023_ling'), wang = await loadTraining('char_2027_wang');
  assert.deepEqual(grantAt(silent, build({ elite: 2, level: 80, skill: 1 }), 'token_10000_silent_healrb', '医疗探机'), { n: 1, at: 'start' });
  assert.equal(grantAt(silent, build({ elite: 2, level: 80, skill: 0 }), 'token_10000_silent_healrb', '医疗探机'), null, 'its other skill gives none');
  assert.deepEqual(grantAt(ling, build({ skill: 2 }), 'token_10020_ling_soul3', '“弦惊”'), { n: 1, at: 'end' });
  assert.equal(grantAt(ling, build({ skill: 1 }), 'token_10020_ling_soul2', '“逍遥”'), null);
  const cnt = wang.skills[2]?.levels[6].blackboard.find((e) => e.key === 'cnt')?.value;
  assert.deepEqual(grantAt(wang, build({ skill: 2 }), 'token_10064_wang_stone1', '棋子'), { n: cnt, at: 'start' });
  assert.deepEqual(grantAt(await loadTraining('char_1052_kalts2'), build({ skill: 2 }), 'token_10068_kalts2_mtship', '战术锚点'), { n: 1, at: 'start' });
  assert.equal(grantAt(await loadTraining('char_1045_svash2'), build({ skill: 0 }), 'token_10057_svash2_eagle1', '风雪之眼'), null, '立刻获得{cost}点部署费用 gives no copy');
  const angel = await loadTraining('char_1041_angel2'), target = await loadToken('token_10056_angel2_target');
  assert.deepEqual(grantAt(angel, build({ skill: 2 }), 'token_10056_angel2_target', target.name), { n: 1, at: 'deploy' });
  const s = tokenAt(target, 'token_10056_angel2_target', angel, build({ skill: 2 }));
  assert.deepEqual([s.summon?.supply, s.summon?.grant], [1, undefined], 'given at the deployment: part of the supply');
  const robin = await loadTraining('char_451_robin'), ela = await loadTraining('char_4123_ela');
  assert.deepEqual(grantAt(robin, build({ elite: 2, level: 80 }), 'token_10013_robin_mine', '“夹子”'), { n: 1, at: 'start' }, 'a skill of the talent\'s only summon');
  assert.deepEqual(grantAt(ela, build({ skill: 2 }), 'token_10033_ela_grzmot', '雷鸣地雷'), { n: 2, at: 'end' });
  assert.equal(grantAt(await loadTraining('char_211_adnach'), build({ elite: 1, level: 1 }), 'token_10003_cgbird_bird', '幻影'), null);
  assert.equal(grantAt(await loadTraining('char_179_cgbird'), build({ skill: 1 }), 'token_10003_cgbird_bird', '幻影'), null, '获得一个持续…的屏障 is no summon');
  const drone = tokenAt(await loadToken('token_10000_silent_healrb'), 'token_10000_silent_healrb', silent, build({ elite: 2, level: 80, skill: 1 }));
  assert.deepEqual([drone.summon?.supply, drone.summon?.grant], [0, { n: 1, at: 'start' }]);
});

/** A summon at an owner's elite-2 training with skill `skill` (0-based). @param {string} owner @param {string} id @param {number} skill */
async function summonOf(owner, id, skill, more = {}) {
  const o = await loadTraining(owner), t = await loadToken(id);
  const top = o.phases.length - 1;
  return /** @type {import('@aue/sim').SummonDef} */ (tokenAt(t, id, o, build({ elite: top, level: o.phases[top].maxLevel, skill, ...more })).summon);
}

test('[召唤-8] 技能结束后 gives at the skill\'s end too', async () => {
  assert.deepEqual((await summonOf('char_433_windft', 'token_10023_windft_wrench', 1)).grant, { n: 1, at: 'end' });
  assert.equal((await summonOf('char_4178_alanna', 'token_10045_alanna_crane', 1)).grant?.at, 'end');
});

test('[召唤-9] how long a summon stays: the 7 PRTS states, the owner\'s texts, its own talent; none for a tactical point', async () => {
  const prts = [['char_2015_dusk', 'token_10015_dusk_drgn', 2, 25], ['char_113_cqbw', 'token_10008_cqbw_box', 1, 120], ['char_400_weedy', 'token_10009_weedy_cannon', 2, 20],
    ['char_4046_ebnhlz', 'token_10024_ebnhlz_rcube', 1, 30], ['char_344_beewax', 'token_10011_beewax_oblisk', 1, 20], ['char_108_silent', 'token_10000_silent_healrb', 1, 10],
    ['char_254_vodfox', 'token_10006_vodfox_doll', 1, 15]];
  for (const [owner, id, skill, s] of prts) assert.equal((await summonOf(/** @type {string} */ (owner), /** @type {string} */ (id), /** @type {number} */ (skill))).life, s, /** @type {string} */ (id));
  assert.equal((await summonOf('char_1012_skadi2', 'token_10017_skadi2_dedant', 0)).life, 25);
  assert.equal((await summonOf('char_1012_skadi2', 'token_10017_skadi2_dedant', 0, { elite: 1, level: 1 })).life, 15, 'its talent at the owner\'s elite');
  assert.equal((await summonOf('char_4229_aphris', 'token_10070_aphris_pc', 0)).life, 25, 'the owner\'s 持续时间25秒的“中继器”');
  assert.equal((await summonOf('char_4215_buddy', 'token_10063_buddy_bddg', 0, { level: 30 })).life, undefined, 'a tactical point');
  assert.equal((await summonOf('char_484_robrta', 'token_10018_robrta_mach', 0)).life, undefined, 'a named talent\'s 持续 is its effect\'s');
  assert.equal((await summonOf('char_110_deepcl', 'token_10001_deepcl_tentac', 0, { level: 70 })).life, undefined);
});

test('[召唤-10] what the end of the owner\'s skill does: recovered, destroyed, those under half; not others\' end clauses', async () => {
  assert.deepEqual((await summonOf('char_248_mgllan', 'token_10005_mgllan_drone1', 0)).skillEnd, { recover: true });
  assert.deepEqual((await summonOf('char_2023_ling', 'token_10020_ling_soul2', 1)).skillEnd, { recover: true, below: 0.5 });
  assert.deepEqual((await summonOf('char_4072_ironmn', 'token_10027_ironmn_pile1', 0)).skillEnd, { recover: false });
  assert.deepEqual((await summonOf('char_1031_slent2', 'token_10029_slent2_protrb', 1)).skillEnd, { recover: false });
  assert.deepEqual((await summonOf('char_4147_mitm', 'token_10037_mitm_trshrb', 1)).skillEnd, { recover: false });
  assert.deepEqual((await summonOf('char_4229_aphris', 'token_10070_aphris_pc', 2)).skillEnd, { recover: false });
  assert.equal((await summonOf('char_336_folivo', 'token_10010_folivo_car', 1)).skillEnd, undefined, '摄影车晕眩');
  assert.equal((await summonOf('char_4072_ironmn', 'token_10027_ironmn_pile2', 1)).skillEnd, undefined);
});

test('[召唤-7] [召唤-11] the tacticians\' 援军: their point\'s seconds and summon form\'s block bonus from their talents; 牙猎犬 undying, 保护目标 not retreated', async () => {
  const crab = await summonOf('char_452_bstalk', 'token_10014_bstalk_crab', 0), base = await summonOf('char_4228_closur', 'token_10066_closur_ourbase', 0);
  assert.deepEqual([crab.tactical, base.tactical], [{ every: 15, block: 1 }, { every: 15, block: 0 }], '指挥中心 blocks 2 by its data, no +1');
  assert.deepEqual((await summonOf('char_452_bstalk', 'token_10014_bstalk_crab', 0, { elite: 0, level: 1 })).tactical, { every: 20, block: 1 }, '20 s at elite 0');
  const dog = await summonOf('char_4215_buddy', 'token_10063_buddy_bddg', 0, { level: 30 });
  assert.deepEqual(dog.tactical, { every: 60, block: 1 }, 'no block_cnt, 阻挡数 0: +1');
  assert.equal(effectsOf(SUMMON_PAGES.token_10063_buddy_bddg).flags.undying, true);
  assert.equal(effectsOf(SUMMON_PAGES.token_10058_sbell2_icetgt).flags.noRetreat, true);
  assert.equal((await summonOf('char_4048_doroth', 'token_10025_doroth_recttp', 0)).tactical, undefined, 'not a tactical point');
});
