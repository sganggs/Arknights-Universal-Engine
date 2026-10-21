// Official skills (docs/spec/skills.md 技能-1, 技能-6): five real skill_table levels (test/fixtures/skill-levels.json,
// from ArknightsGameData) as the engine's skills, and a content behaviour acting through the skill context.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, step, skills, attrs } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import { skillDefOf, skillBehaviors } from '../src/index.js';

/** @type {Record<string, any>} */
const LEVELS = JSON.parse(readFileSync(new URL('fixtures/skill-levels.json', import.meta.url), 'utf8'));
/** @param {string} id */
const def = (id) => skillDefOf(id, LEVELS[id]);

test('[技能-1] skill_table levels as skills: trigger, SP type, cost, initial SP, charges, duration, ammo, blackboard', () => {
  assert.deepEqual(def('skcom_atk_up[3]'), { id: 'skcom_atk_up[3]', type: 'MANUAL', sp: 'time', cost: 30, init: 15, charges: 1, duration: 30, ammo: false, bb: { atk: 1 }, stoppable: false });
  assert.deepEqual([def('skchr_kroos_1').sp, skills.kindOf(def('skchr_kroos_1'))], ['attack', 'next']);
  assert.deepEqual([def('skchr_fuze_1').ammo, skills.kindOf(def('skchr_fuze_1')), def('skchr_fuze_1').bb['attack@trigger_time']], [true, 'ammo', 100]);
  assert.deepEqual([def('skcom_born_up[1]').sp, def('skcom_born_up[1]').charges, skills.kindOf(def('skcom_born_up[1]'))], ['none', 1, 'passive'], 'spType 8 recovers nothing');
  assert.equal(skills.kindOf(def('skcom_heal_self[2]')), 'instant');
  assert.throws(() => skillDefOf('x', { ...LEVELS['skcom_atk_up[3]'], skillType: 'TOGGLE' }), /unknown skillType TOGGLE/);
});

test('[技能-6] a content behaviour acts through the context: 生命回复 heals half the maximum HP at once', () => {
  const c = /** @type {any} */ (tinyContent());
  c.operators.guard.skill = { ...def('skcom_heal_self[2]'), init: 20 };
  c.behaviors = { skills: skillBehaviors };
  c.level.waves = [];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = w.units[0];
  g.hp = 100;
  const ev = step(w, c, [[0, { type: 'skill', unit: g.id }]]);
  assert.equal(g.hp, 100 + attrs.statsOf(g).maxHp * 0.5);
  assert.deepEqual(ev.filter((e) => e.type === 'skill').map((e) => e.active), [1, 0], 'instant: on and off');
  assert.equal(g.skill?.sp, 0);
});

test('[技能-7] a skill whose description says it can be stopped or closed at will is closable', () => {
  assert.deepEqual(Object.keys(LEVELS).filter((id) => def(id).stoppable), ['skchr_fuze_1'], '「可随时停止技能」');
  const level = LEVELS['skcom_atk_up[3]'];
  for (const d of ['技能持续时间无限，可主动关闭技能', '该技能可随时主动关闭', '手动停止或棋子耗尽后技能结束', '第一次使用可随时停止']) {
    assert.equal(skillDefOf('x', { ...level, description: d }).stoppable, true, d);
  }
  for (const d of ['停止攻击，攻击力+50%', '可随时<@ba.vup>+10%</>关闭', '']) assert.equal(skillDefOf('x', { ...level, description: d }).stoppable, false, d);
  const { description: _, ...bare } = level;
  assert.equal(skillDefOf('x', bare).stoppable, false, 'no description');
});

test('[技能-8] the attack range while a skill runs: its level range when the description changes the range; the whole map', async () => {
  const { loadTraining, operatorAt } = await import('../src/index.js');
  const e2 = (/** @type {number} */ skill) => ({ elite: 2, level: 1, potential: 1, trust: 0, skill, skillLevel: 7 });
  const sntlla = operatorAt(await loadTraining('char_341_sntlla'), e2(1)).skill, glaze = operatorAt(await loadTraining('char_302_glaze'), e2(1)).skill;
  assert.ok(sntlla && sntlla.range && sntlla.range.length > 0, '寒芒克洛丝 S2: 攻击范围扩大');
  assert.deepEqual([glaze && glaze.rangeAll, glaze && glaze.range], [true, undefined], '安比尔 S2: 攻击范围扩大至整个战场');
  assert.deepEqual([def('skcom_atk_up[3]').range, def('skcom_atk_up[3]').rangeAll], [undefined, undefined]);
  assert.deepEqual(skillDefOf('x', { ...LEVELS['skcom_atk_up[3]'], description: '攻击范围缩小', rangeId: '0-1' }).range, [{ row: 0, col: 0 }]);
  assert.deepEqual(skillDefOf('x', { ...LEVELS['skcom_atk_up[3]'], description: '治疗周围的友方', rangeId: 'x-4' }).range, undefined, 'a range that is not the attack range');
  assert.throws(() => skillDefOf('x', { ...LEVELS['skcom_atk_up[3]'], description: '攻击范围扩大', rangeId: 'nope' }), /no range nope/);
});

test('[技能-9] what descriptions add, on real skills: blocked targets, 二连击 with 阻挡数 0, dodge, 防御力 0, a stun on hit, more targets, arts', async () => {
  const { loadTraining, operatorAt } = await import('../src/index.js');
  const at = async (/** @type {string} */ id, /** @type {number} */ skill) => /** @type {any} */ (operatorAt(await loadTraining(id), { elite: 2, level: 1, potential: 1, trust: 0, skill, skillLevel: 7 }).skill).extra;
  const [sophia, spikes, chilc, acguad, red, f12yin, nian] = await Promise.all([at('char_265_sophia', 1), at('char_271_spikes', 0), at('char_4144_chilc', 1),
    at('char_609_acguad', 1), at('char_144_red', 1), at('char_264_f12yin', 0), at('char_2014_nian', 0)]);
  assert.deepEqual([sophia.attack.blocked, spikes.attack.times, spikes.mods.blockCntMul, acguad.mods.defMul, f12yin.attack.more, nian.attack.type], [true, 2, 0, 0, 1, 'arts']);
  assert.ok(chilc.mods.dodgePhys > 0, '获得{prob}的物理闪避');
  assert.deepEqual(red.attack.hitStatus.key, 'stun');
  assert.equal(def('skcom_atk_up[3]').extra, undefined, 'nothing it does not read');
});

/** An operator's skill at elite 2, skill level 7, from its training record. @param {string} id @param {number} skill */
async function skillAt(id, skill) {
  const { loadTraining, operatorAt } = await import('../src/index.js');
  return /** @type {any} */ (operatorAt(await loadTraining(id), { elite: 2, level: 1, potential: 1, trust: 0, skill, skillLevel: 7 }).skill);
}

test('[技能-9] 「技能持续期间内干员的生命值（始终）不会低于1」 on real skills: 不死 while the skill runs', async () => {
  const [ghost2, ghost, acguad, ghost2s1] = await Promise.all([skillAt('char_1023_ghost2', 1), skillAt('char_143_ghost', 1), skillAt('char_609_acguad', 2), skillAt('char_1023_ghost2', 0)]);
  for (const s of [ghost2, ghost, acguad]) assert.deepEqual(s.extra?.flags, { undying: true }, s.id);
  assert.equal(ghost2s1.extra?.flags, undefined, '归溟幽灵鲨一技能 says nothing of it');
  assert.equal(ghost2.extra.mods, undefined, 'its 攻击力 and 攻击速度 stay the generic blackboard mods');
});

test('[技能-4] [技能-5] real skills that say 持续时间无限 run until closed; an attribute shown without a percent is 直接加算', async () => {
  const [whitew, lisa, surtr, quercu] = await Promise.all([skillAt('char_140_whitew', 0), skillAt('char_358_lisa', 1), skillAt('char_350_surtr', 2), skillAt('char_492_quercu', 0)]);
  assert.deepEqual([whitew, lisa, surtr].map((s) => [s.forever, skills.kindOf(s)]), [[true, 'duration'], [true, 'duration'], [true, 'duration']], '拉普兰德 S1, 铃兰 S2, 史尔特尔 S3');
  assert.deepEqual([quercu.forever, quercu.stoppable], [true, true], '夏栎 S1: 技能持续时间无限，可主动关闭技能');
  assert.deepEqual(surtr.extra.mods, { hpPct: 0, hpFlat: 5000 }, '生命上限+{max_hp}');
  assert.equal(def('skcom_atk_up[3]').forever, undefined);
});

test('[技能-10] real skills that cost deployment cost to start: the first sentence\'s 「消耗…点部署费用」, not an 装备应变\'s', async () => {
  const [catap1, catap2, hadiya1, hadiya2] = await Promise.all([skillAt('char_1049_catap2', 0), skillAt('char_1049_catap2', 1), skillAt('char_394_hadiya', 0), skillAt('char_394_hadiya', 1)]);
  assert.deepEqual([catap1.spend, catap2.spend, hadiya1.spend, hadiya2.spend], [20, 5, undefined, 10]);
});

test('[技能-11] real 鼓舞: the attributes after each ratio, 其他 or not, a block count for the allies; those keys none of the 吟游者\'s own', async () => {
  const [sora, heidi1, heidi2, dolris1, skadi2, cetsyr3] = await Promise.all([skillAt('char_101_sora', 1), skillAt('char_4045_heidi', 0), skillAt('char_4045_heidi', 1),
    skillAt('char_4184_dolris', 0), skillAt('char_1012_skadi2', 1), skillAt('char_4134_cetsyr', 2)]);
  assert.deepEqual([sora.allies, sora.extra.mods], [{ others: true, inspire: { atk: 0.9 } }, { atkPct: 0 }], '空 S2 战斗之歌 (skill level 7)');
  assert.deepEqual([heidi1.allies, heidi1.extra.mods], [{ others: false, inspire: { atk: 0.9 }, mods: { blockCnt: -3 } }, { atkPct: 0, blockCnt: 0 }], '海蒂 S1');
  assert.deepEqual([heidi2.allies, heidi2.extra.mods], [{ others: false, inspire: { def: 0.5, maxHp: 0.2 }, mods: { blockCnt: 1 } }, { defPct: 0, hpPct: 0, blockCnt: 0 }], '海蒂 S2: {def}防御力和{max_hp}生命值上限');
  assert.deepEqual([dolris1.allies, dolris1.extra], [{ others: false, inspire: { atk: 0.4, def: 0.4 } }, undefined], '三角初华 S1: {attack@atk}攻击力与防御力');
  assert.deepEqual([skadi2.allies, skadi2.extra.mods, skadi2.forever], [{ others: true, inspire: { atk: 0.45, def: 0.45 } }, { atkPct: 0, defPct: 0 }, true], '浊心斯卡蒂 S2: def a ratio too');
  assert.deepEqual([cetsyr3.allies, cetsyr3.extra.mods], [{ others: true, inspire: { maxHp: 0.8 } }, { hpPct: 0 }], '魔王 S3: {max_hp}的最大生命值');
  assert.equal(def('skcom_atk_up[3]').allies, undefined);
});

test('[技能-12] 史尔特尔 S3 黄昏: her whole maximum HP healed at its start, then 生命流失 every 0.2 s rising evenly to 20 % a second over 60 s', async () => {
  const c = /** @type {any} */ (tinyContent());
  c.operators.guard.skill = { ...(await skillAt('char_350_surtr', 2)), init: 99 };
  c.behaviors = { skills: skillBehaviors };
  c.level.waves = [];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = w.units[0];
  g.hp = 10;
  step(w, c, [[0, { type: 'skill', unit: g.id }]]);
  const max = attrs.statsOf(g).maxHp;
  assert.deepEqual([max, g.hp], [1000 + 5000, 6000], 'healed in full after +5000');
  for (let i = 0; i < 6; i++) step(w, c, []);
  const first = 6000 - g.hp;
  assert.ok(Math.abs(first - max * 0.2 * (0.2 / 60) * 0.2) < 1e-6, `the first loss at 0.2 s: ${first}`);
  for (let i = 0; i < 30 * 70; i++) { step(w, c, []); g.hp = max; }
  const before = g.hp;
  for (let i = 0; i < 6; i++) step(w, c, []);
  assert.ok(Math.abs(before - g.hp - max * 0.2 * 0.2) < 1e-6, 'past 60 s: 20 % a second, a fifth of it every 0.2 s');
});

test('[技能-13] the 炼金师\' skills from the real data: where each 炼金单元 goes, how long and wide, what it does; the talents\' additions', async () => {
  const [tin1, tin2, hb1, hb2, th1, th2, th3] = await Promise.all([skillAt('char_4151_tinman', 0), skillAt('char_4151_tinman', 1), skillAt('char_4232_hbound', 0),
    skillAt('char_4232_hbound', 1), skillAt('char_1039_thorn2', 0), skillAt('char_1039_thorn2', 1), skillAt('char_1039_thorn2', 2)]);
  assert.deepEqual(tin1.alchemy, { at: 'enemy', seconds: 8, radius: 1, scale: 0.6, foeMods: { atkMul: 0.75 }, dmgMul: 1.2 }, '锡人 S1 “老科利”: 虚弱, 凋敝魂灵');
  assert.deepEqual(tin2.alchemy, { at: 'enemy', seconds: 12, radius: 2, scale: 0.8, regen: 0.2, dmgMul: 1.2 }, '锡人 S2 “大拉里”');
  const hitRate = { mul: 0.91, heavyMul: 0.87, weight: 3 };
  assert.deepEqual(hb1.alchemy, { at: 'enemy', seconds: 9, radius: 1.5, interval: 1, scale: 0.6, foeMods: { movePct: -0.4 }, hitRate }, '旅骨 S1 触礁, 潜水作业');
  assert.deepEqual(hb2.alchemy, { at: 'enemy', seconds: 32, radius: 2, interval: 1, scale: 0.17, heavy: { weight: 3, scale: 1.5, mods: { movePct: -0.7 } }, hitRate }, '旅骨 S2 座浅: 重量大于等于3');
  assert.deepEqual(th1.alchemy, { at: 'ally', seconds: 7, radius: 0, square: true, regen: 0.14, allyMods: { defFlat: 75 }, extend: 3 }, '引星棘刺 S1: 落点和周围8格, 心相');
  assert.deepEqual([th2.alchemy.drift.speed, th2.alchemy.drift.seconds, Math.round(th2.alchemy.drift.grow * 1000) / 1000, th2.alchemy.foeMods], [0.1, 15, 0.143, { healingTakenMul: 0.5 }], '引星棘刺 S2');
  assert.deepEqual([th3.alchemy, skills.kindOf(tin1)], [undefined, 'instant'], 'S3 throws several: not read');
});

test('[技能-9] hit effects from the real data: 沉默, 寒冷, 沉睡, a status at a chance, timed modifiers, HP back, 元素损伤; line breaks written as \n', async () => {
  const { ROSTER: roster } = await import('../src/index.js');
  const id = (/** @type {string} */ name) => /** @type {string} */ (Object.entries(roster).find(([, r]) => r.name === name)?.[0]);
  const at = async (/** @type {string} */ name, /** @type {number} */ s) => {
    const { loadTraining, operatorAt } = await import('../src/index.js'), t = await loadTraining(id(name));
    return /** @type {any} */ (operatorAt(t, { elite: t.phases.length - 1, level: 1, potential: 1, trust: 0, skill: s, skillLevel: 7 }).skill).extra;
  };
  const [jie, aurora, erato, tippi, may, vulcan, linshi, meteor, frost] = await Promise.all([at('孑', 0), at('极光', 1), at('埃拉托', 0), at('缇缇', 0), at('梅', 1), at('火神', 1),
    at('凛视', 0), at('陨星', 1), at('霜叶', 0)]);
  assert.deepEqual(jie.attack.hitStatus, { key: 'silence', seconds: 1 }, '孑 S1: 攻击目标失去特殊能力{attack@silence}秒\n持续时间无限');
  assert.deepEqual([aurora.attack.hitStatus.key, erato.attack.hitStatus.key], ['cold', 'sleep']);
  assert.deepEqual([tippi.attack.hitStatus, may.attack.hitStatus], [{ key: 'sleep', seconds: 2.4, prob: 0.4 }, { key: 'stun', seconds: 1, prob: 0.3 }]);
  assert.equal(vulcan.attack.selfHeal, 0.07, '火神 S2: 每次攻击恢复自身最大生命值的{hp_ratio}');
  assert.deepEqual([linshi.attack.element, linshi.attack.epScale, linshi.attack.type], ['DARK', 0.5, 'arts'], '凛视 S1: 附带{ep_damage_ratio}攻击力的凋亡损伤');
  assert.deepEqual([meteor.attack.hitDebuff, meteor.mods.defPct], [{ seconds: 10, mods: { defFlat: -210 } }, 0], '陨星 S2: 防御力-{-def} (a number), none of hers');
  assert.deepEqual(frost.attack.hitDebuff, { seconds: 2.5, mods: { movePct: -0.35 } }, '霜叶 S1');
});

test('[技能-9] pushes and pulls from the real data: 拖拽至面前 a pull, 往攻击方向…推开 along the facing, 弹开 away; none for closing a skill', async () => {
  const { ROSTER: roster, loadTraining, operatorAt } = await import('../src/index.js');
  const at = async (/** @type {string} */ name, /** @type {number} */ s) => {
    const t = await loadTraining(/** @type {string} */ (Object.entries(roster).find(([, r]) => r.name === name)?.[0]));
    return /** @type {any} */ (operatorAt(t, { elite: t.phases.length - 1, level: 1, potential: 1, trust: 0, skill: s, skillLevel: 7 }).skill).extra;
  };
  const [cliff, shaw, croissant, swire] = await Promise.all([at('崖心', 0), at('阿消', 0), at('可颂', 1), at('琳琅诗怀雅', 2)]);
  assert.deepEqual([cliff.attack.displace.pull, shaw.attack.displace.along, croissant.attack.displace.pull, croissant.attack.displace.along], [true, true, false, undefined]);
  assert.equal(swire?.attack?.displace, undefined, '琳琅诗怀雅 S3: 主动关闭技能时……推开');
});
