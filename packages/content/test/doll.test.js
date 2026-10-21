// 傀儡师 替身 from the real data (docs/spec/traits.md 职业-16, docs/spec/operators.md 干员-3, 干员-15): the 替身's own range
// from the trait or talent candidate with talent_override_rangeid_flag, flying units with it, a module's trait parts;
// the talents that stop its attack or give it an aura, a module's two talent parts merged in order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, doll, skills, traits } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import rangeTable from '../data/ranges.json' with { type: 'json' };
import { loadTraining, operatorAt, skillDefOf } from '../src/index.js';
import { dollPart } from '../src/talents.js';
import { mergedTalentsAt } from '../src/doll.js';
import { moduleAt } from '../src/operators.js';

const OPS = new URL('../data/operators/', import.meta.url);

const RANGES = /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges);
/** A training: elite, level, and a module at a level when given. @param {number} elite @param {number} level @param {number} [module] @param {number} [moduleLevel] */
const build = (elite, level, module, moduleLevel) => ({ elite, level, potential: 1, trust: 0, skill: 0, skillLevel: 1, ...(module === undefined ? {} : { module, moduleLevel }) });
/** The trait's `doll` of an operator at a training. @param {string} id @param {ReturnType<typeof build>} b */
const dollAt = async (id, b) => /** @type {import('@aue/sim').Doll} */ (traits.traitOfDef(operatorAt(await loadTraining(id), b)).doll);

test('[职业-16] [干员-3] a 替身\'s own range: the flagged trait candidate\'s (风丸, 维荻, 双月, 若叶睦) or talent\'s (贝娜, 归溟); 结城理 has none; flying units with it', async () => {
  const cases = [['char_4016_kazema', 'x-4'], ['char_4107_vrdant', 'x-4'], ['char_4124_iana', 'x-1'], ['char_4183_mortis', '1-1'], ['char_369_bena', 'x-4'], ['char_1023_ghost2', 'x-4']];
  for (const [id, range] of cases) {
    const d = await dollAt(id, build(0, 1));
    assert.deepEqual([d.range, d.antiAir], [RANGES[range], true], id);
  }
  const makoto = await dollAt('char_4217_makoto', build(0, 1));
  assert.deepEqual([makoto.range, makoto.antiAir, makoto.attack, makoto.aura], [null, false, true, null], '结城理: a trait range id without the flag');
});

test('[职业-16] [干员-7] module trait parts: 风丸\'s PUM-X keeps x-4; 归溟\'s PUM-Y flags its trait without a range id of its own, so the trait candidate\'s', async () => {
  const kazema = await loadTraining('char_4016_kazema'), ghost = await loadTraining('char_1023_ghost2');
  const pumX = kazema.modules.findIndex((m) => m.type === 'PUM-X'), pumY = ghost.modules.findIndex((m) => m.type === 'PUM-Y');
  assert.deepEqual((await dollAt('char_4016_kazema', build(2, 60, pumX, 3))).range, RANGES['x-4']);
  const part = moduleAt(ghost, build(2, 60, pumY, 1))?.parts.find((p) => p.target.startsWith('TRAIT'))?.trait[0];
  assert.deepEqual([part?.rangeId, part?.bb.talent_override_rangeid_flag], [null, 1], 'the data: the flag, no range id');
  assert.deepEqual((await dollAt('char_1023_ghost2', build(2, 60, pumY, 1))).range, RANGES['x-4']);
});

test('[干员-15] 归溟\'s 拥抱自我: no attack, and the aura at each training — PUM-X\'s two talent parts merged in order', async () => {
  const ghost = await loadTraining('char_1023_ghost2'), pumX = ghost.modules.findIndex((m) => m.type === 'PUM-X');
  const builds = [build(0, 1), build(1, 1), build(2, 1), build(2, 60, pumX, 2), build(2, 60, pumX, 3)];
  const got = await Promise.all(builds.map(async (b) => (await dollAt('char_1023_ghost2', b))));
  assert.deepEqual(got.map((d) => [d.attack, d.aura]), [[false, { moveMul: 0.8, scale: 0.2 }], [false, { moveMul: 0.7, scale: 0.3 }], [false, { moveMul: 0.6, scale: 0.4 }],
    [false, { moveMul: 0.5, scale: 0.6 }], [false, { moveMul: 0.4, scale: 0.8 }]]);
  const merged = mergedTalentsAt(ghost, build(2, 60, pumX, 2), moduleAt(ghost, build(2, 60, pumX, 2)))[0];
  assert.deepEqual([merged?.rangeId, merged?.bb], ['x-4', { move_speed: -0.5, atk_scale: 0.6, talent_override_rangeid_flag: 1, sp: 8 }], 'the data-only part, then the one with the text');
});

test('[干员-15] 「<替身>不攻击」: 若叶睦\'s 替身 makes no attack; 风丸\'s and 贝娜\'s talents are no 替身 part; hidden ones have none', async () => {
  assert.deepEqual([(await dollAt('char_4183_mortis', build(0, 1))).attack, (await dollAt('char_4183_mortis', build(0, 1))).aura], [false, null]);
  for (const id of ['char_4016_kazema', 'char_369_bena']) assert.equal((await dollAt(id, build(2, 1))).attack, true, id);
  const aura = { description: '<替身>使周围敌人移动速度-20%<@ba.talpu>（+5%）</>且每秒造成相当于20%攻击力的法术伤害', bb: { move_speed: -0.2, atk_scale: 0.2 }, hidden: false };
  assert.deepEqual(dollPart(aura), { attack: false, aura: { moveMul: 0.8, scale: 0.2 } }, 'potential differences in tags and brackets left out');
  assert.equal(dollPart({ ...aura, hidden: true }), null);
  assert.deepEqual(dollPart({ ...aura, bb: {} }), null, 'without its blackboard');
});

/** A skill_table level with this description. @param {string} description @param {number} [duration] @param {{ key: string, value: number }[]} [bb] */
const levelOf = (description, duration = 0, bb = []) => ({ skillType: 'MANUAL', durationType: 'NONE', duration, spData: { spType: 'INCREASE_WITH_TIME', spCost: 1, initSp: 1, maxChargeTime: 1 }, blackboard: bb, description });

test('[职业-15] a description switches at its start or its end; mentioning the 替身 does not', () => {
  const mark = (/** @type {string} */ description) => skillDefOf('x', levelOf(description)).doll;
  assert.equal(mark('主动：立即切换为<替身>状态作战'), 'start');
  assert.equal(mark('立即使周围的敌人在<@ba.vup>{anti_invisible_duration}</>秒内<$ba.invisible>隐匿</>效果失效并切换为<替身>作战\\n持续时间内攻击速度+{attack_speed}'), 'start');
  assert.equal(mark('攻击力+{atk}\\n<@ba.rem>技能结束后视为被击倒</>'), 'end');
  assert.equal(mark('技能结束后立刻切换为<替身>'), 'end');
  assert.equal(mark('技能结束后立即切换为<替身>'), 'end');
  assert.equal(mark('切换为<替身>作战时，立即对攻击全息幻影的敌人造成伤害'), undefined);
  assert.equal(mark('召唤<替身>'), undefined);
  assert.equal(mark('技能期间被击倒后，<替身>也能阻挡'), undefined);
  assert.equal(skills.kindOf(skillDefOf('x', levelOf('主动：立即切换为<替身>状态作战', 0, [{ key: 'attack@atk_scale', value: 2 }]))), 'instant');
  assert.equal(skills.kindOf(skillDefOf('x', levelOf('并切换为<替身>作战', 10))), 'duration');
  /** @type {string[][]} */
  const hits = [];
  for (const file of readdirSync(OPS).filter((f) => f.endsWith('.json'))) {
    const op = JSON.parse(readFileSync(new URL(file, OPS), 'utf8'));
    for (const s of op.skills ?? []) {
      if (!s?.levels?.length) continue;
      const d = skillDefOf(s.id, s.levels.at(-1));
      if (d.doll) hits.push([s.id, d.doll, skills.kindOf(d)]);
    }
  }
  hits.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  assert.deepEqual(hits, [
    ['skchr_ghost2_2', 'end', 'duration'], ['skchr_iana_2', 'start', 'duration'],
    ['skchr_makoto_1', 'start', 'instant'], ['skchr_makoto_2', 'start', 'instant'], ['skchr_makoto_3', 'start', 'instant'],
  ]);
});

/**
 * Deploys the operator (elite 2, skill rank 10) on the tiny level and casts the skill. SP is filled so the cast takes.
 * @param {string} id @param {number} skill
 */
async function castReal(id, skill) {
  const op = operatorAt(await loadTraining(id), { elite: 2, level: 1, potential: 1, trust: 0, skill, skillLevel: 10 });
  const def = op.skill;
  if (!def) throw new Error(`${id}: skill ${skill} is not on the record`);
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.level.options.initialCost = 99;
  c.level.options.maxCost = 99;
  c.operators.guard = { ...op, skill: { ...def, init: def.cost } };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const u = w.units[0];
  if (!u?.skill) throw new Error(`${id}: did not deploy`);
  step(w, c, [[0, { type: 'skill', unit: u.id }]]);
  return { w, c, u, st: u.skill };
}
/** From the frame the switch has begun, through the rest of its second, into the 替身 (职业-15). @param {any} w @param {any} c @param {any} u */
function intoDoll(w, c, u) {
  assert.equal(u.buffs.find((/** @type {{ key: string, left: number }} */ b) => b.key === 'doll')?.left, secondsToFrames(1));
  for (let i = 0; i < secondsToFrames(1) - 1; i++) step(w, c);
  assert.equal(doll.dollPhase(u), doll.DOLL_PHASE.IN);
  step(w, c);
  assert.equal(doll.dollPhase(u), doll.DOLL_PHASE.DOLL);
}

test('[职业-15] 双月 S2 and 结城理\'s three skills switch as they start, then the phases run', async () => {
  const cases = [['char_4124_iana', 1, true], ['char_4217_makoto', 0, false], ['char_4217_makoto', 1, false], ['char_4217_makoto', 2, false]];
  for (const [id, skill, stays] of cases) {
    const { w, c, u, st } = await castReal(/** @type {string} */ (id), /** @type {number} */ (skill));
    assert.equal(doll.dollPhase(u), doll.DOLL_PHASE.IN, String(id));
    assert.equal(st.active, stays, String(id));
    intoDoll(w, c, u);
    assert.equal(st.active, stays, String(id));
    assert.equal(u.buffs.some((/** @type {{ key: string }} */ b) => b.key === 'skill'), stays, String(id));
  }
});

test('[职业-15] 归溟幽灵鲨 S2 switches when the skill ends, then the phases run; S1 and S3 do not', async () => {
  const [s1, s3] = await Promise.all([castReal('char_1023_ghost2', 0), castReal('char_1023_ghost2', 2)]);
  assert.deepEqual([doll.dollPhase(s1.u), doll.dollPhase(s3.u)], [0, 0]);
  const { w, c, u, st } = await castReal('char_1023_ghost2', 1);
  assert.equal(doll.dollPhase(u), 0);
  const dur = st.dur;
  for (let i = 0; i < dur - 1; i++) step(w, c);
  assert.deepEqual([doll.dollPhase(u), st.active], [0, true]);
  step(w, c);
  assert.deepEqual([doll.dollPhase(u), st.active], [doll.DOLL_PHASE.IN, false]);
  intoDoll(w, c, u);
  assert.equal(u.buffs.find((/** @type {{ key: string, left: number }} */ b) => b.key === 'doll')?.left, secondsToFrames(c.operators.guard.trait.doll.duration));
});
