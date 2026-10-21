// Branch traits of the official content (docs/spec/traits.md 职业-7): the covered branches are real ones
// (test/fixtures/branches.json, from character_table), operator records take their branch's damage type and trait, an
// uncovered branch takes the defaults; covered traits play out in the simulation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createWorld, step, traits, attrs } from '@aue/sim';
import { tinyContent } from '@aue/testkit';
import rangeTable from '../data/ranges.json' with { type: 'json' };
import { BRANCHES, coveredBranch, withTrait, withOwnTrait, OPERATOR_TRAITS, skeletonContent, loadTraining, operatorAt, matchContent, ROSTER } from '../src/index.js';

/** @type {Record<string, { name: string, profession: string, position: string[] }>} */
const ALL = JSON.parse(readFileSync(new URL('fixtures/branches.json', import.meta.url), 'utf8')).branches;

test('[职业-7] the branch table covers all 72 official branches', () => {
  assert.equal(Object.keys(ALL).length, 72);
  for (const b of Object.keys(BRANCHES)) assert.ok(Object.hasOwn(ALL, b), b);
  assert.equal(Object.keys(BRANCHES).length, 72);
  assert.ok(coveredBranch('fastshot') && coveredBranch('funnel') && coveredBranch('traper') && coveredBranch('tactician') && coveredBranch('dollkeeper') && !coveredBranch('toString'));
});

test('[职业-7] an operator record takes its branch\'s damage type and trait; the blackboard moves into the trait', () => {
  const base = { name: 'x', position: 'MELEE', cost: 9, blockCnt: 1, baseAttackTime: 1, maxHp: 1, atk: 1, def: 0, res: 0, range: [] };
  const charger = withTrait({ ...base, branch: 'charger', traitBb: { cost: 1 } });
  assert.deepEqual(charger.trait, { killCost: 1, refund: 1, bb: { cost: 1 } });
  assert.equal('traitBb' in charger, false);
  assert.deepEqual(withTrait({ ...base, position: 'RANGED', branch: 'corecaster' }).dmgType, 'arts');
  assert.deepEqual(withTrait({ ...base, position: 'RANGED', branch: 'slower', traitBb: { sluggish: 0.8 } }).trait?.hitStatus, { key: 'sluggish', seconds: 0.8 });
  assert.deepEqual(withTrait({ ...base, position: 'RANGED', branch: 'ringhealer' }).trait, { heal: true, targets: 3, bb: {} });
  const funnel = withTrait({ ...base, position: 'RANGED', branch: 'funnel', traitBb: { init_atk_scale: 0.35, delta_atk_scale: 0.15, max_atk_scale: 1.2 } });
  assert.deepEqual([funnel.dmgType, funnel.trait?.antiAir, funnel.trait?.funnel], ['arts', true, { init: 0.35, delta: 0.15, max: 1.2 }]);
  const loop = withTrait({ ...base, position: 'RANGED', branch: 'unknownbranch', traitBb: { max_stack_cnt: 6 } });
  assert.equal(loop.trait, undefined, 'not covered: the position\'s defaults');
  assert.deepEqual(traits.traitOfDef(loop).antiAir, true);
});

test('[职业-7] the skeleton\'s operators carry their branches: 铁卫, 尖兵, 速射手', () => {
  const ops = skeletonContent.operators;
  assert.deepEqual(['char_500_noirc', 'char_502_nblade', 'char_503_rang'].map((k) => [ops[k].branch, ops[k].respawnTime]), [['protector', 70], ['pioneer', 70], ['fastshot', 70]]);
  assert.equal(traits.traitOfDef(ops.char_503_rang).secondary, 'FLY_FIRST');
});

test('[职业-2] [职业-7] a 医师 from the table heals the wounded guard in the simulation', () => {
  const c = tinyContent();
  c.level.waves = [];
  c.operators.medic = withTrait({ ...c.operators.sniper, branch: 'physician', atk: 200, range: [{ row: 0, col: 0 }, { row: -1, col: 0 }] });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'medic', row: 2, col: 2, dir: 0 }], [0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  const guard = w.units[1];
  guard.hp = 500;
  const ev = step(w, c);
  assert.deepEqual(ev.filter((e) => e.type === 'heal').map((e) => [e.target, e.amount]), [[guard.id, 200]]);
  assert.equal(guard.hp, 700);
  assert.equal(attrs.statsOf(guard).maxHp, 1000);
});

/** A real operator of the branch at elite 0, level 1. @param {string} id */
const real = async (id) => operatorAt(await loadTraining(id), { elite: 0, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 });

test('[职业-7] 情报官 and 伏击客 from the real data: 可对空 / all enemies in range, no priority for the blocked, half dodged', async () => {
  const agent = traits.traitOfDef(await real('char_4017_puzzle'));
  assert.deepEqual([agent.antiAir, agent.blockedFirst, agent.targets], [true, false, 1]);
  const stalker = await real('char_215_mantic'), t = traits.traitOfDef(stalker);
  assert.deepEqual([t.filter, t.targets, t.blockedFirst, t.mods], ['ALL', 'all', false, { dodgePhys: 0.5, dodgeArts: 0.5 }]);
  assert.equal(stalker.tauntLevel, -1, '嘲讽等级 -1 is in the operator data, not added by the trait');
});

test('[职业-7] 本源术师 and 巫役 from the real data deal arts damage; the 本源 melee and 执旗手 take the defaults', async () => {
  for (const id of ['char_1040_blaze2', 'char_1042_phatm2']) assert.equal((await real(id)).dmgType, 'arts', id);
  for (const id of ['char_4187_graceb', 'char_2026_yu', 'char_151_myrtle']) {
    const op = await real(id);
    assert.equal(op.dmgType, undefined, id);
    assert.deepEqual(traits.traitOfDef(op), { ...traits.defaultTrait('MELEE'), bb: op.trait?.bb ?? {} }, id);
  }
});

test('[职业-7] [职业-8] 炮手, 扩散术师, 撼地者, 投掷手, 教官 and 领主 from the real data', async () => {
  const t = async (/** @type {string} */ id) => traits.traitOfDef(await real(id));
  assert.deepEqual((await t('char_113_cqbw')).splash, { radius: 1, scale: 1, ground: false });
  const f12 = await real('char_1011_lava2');
  assert.deepEqual([f12.dmgType, traits.traitOfDef(f12).splash], ['arts', { radius: 1.1, scale: 1, ground: false }]);
  assert.deepEqual((await t('char_1051_headb2')).splash, { radius: 1, scale: 0.5, ground: false });
  const greyy = await t('char_1027_greyy2');
  assert.deepEqual([greyy.antiAir, greyy.splash, greyy.aftershock], [false, { radius: 0.9, scale: 1, ground: true }, 0.5]);
  assert.equal((await t('char_130_doberm')).unblockedScale, 1.2);
  const lap = await t('char_140_whitew');
  assert.deepEqual([lap.antiAir, lap.blockedFirst, lap.unblockedScale], [true, true, 0.8]);
});

test('[职业-7] [职业-9] 武者, 收割者 and 不屈者 from the real data: no ally heals them; the first two heal themselves', async () => {
  const t = async (/** @type {string} */ id) => traits.traitOfDef(await real(id));
  const helage = await t('char_188_helage');
  assert.deepEqual([helage.flags, helage.selfHeal, helage.selfHealMax, helage.selfHealOn], [{ noAllyHeal: true }, 30, Infinity, 'damage'], '武者: for every hit');
  const excu2 = await t('char_1032_excu2');
  assert.deepEqual([excu2.flags, excu2.selfHeal, excu2.selfHealMax, excu2.targets, excu2.selfHealOn], [{ noAllyHeal: true }, 50, 'blockCnt', 'all', 'attack'], '收割者: for the enemies an attack reaches');
  assert.deepEqual((await t('char_163_hpsts')).flags, { noAllyHeal: true });
});

test('[职业-7] [职业-10] the upkeep branches from the real data: 行商, 怪杰, 决战者, 推击手, 钩索师, 驭法铁卫', async () => {
  const [merchant, geek, duelist, pusher, hook, arts] = await Promise.all(['char_1033_swire2', 'char_1041_angel2', 'char_416_zumama', 'char_241_panda', 'char_173_slchan', 'char_1044_hsgma2']
    .map(async (id) => traits.traitOfDef(await real(id))));
  assert.deepEqual([merchant.refund, merchant.costDrain], [0, { every: 3, cost: 3 }]);
  assert.equal(geek.hpDrain, 0.01);
  assert.deepEqual([duelist.flags, duelist.immuneBlocking], [{ noSp: true }, ['noSp']]);
  assert.deepEqual([pusher.targets, pusher.rangedTiles, hook.antiAir, hook.rangedTiles, arts.skillArts], ['blockCnt', true, true, true, true]);
});

test('[职业-7] [职业-11] zones and chains from the real data: 散射手, 疗养师, 链术师 (elite 0 and 2), 链愈师, 咒愈师', async () => {
  const at = async (/** @type {string} */ id, elite = 0) => /** @type {any} */ (traits.traitOfDef(operatorAt(await loadTraining(id), { elite, level: 1, potential: 1, trust: 0, skill: -1, skillLevel: 1 })));
  const [reaper, healer, chain0, chain2, chainHeal, incant] = await Promise.all([at('char_1013_chen2'), at('char_348_ceylon'), at('char_306_leizi'), at('char_306_leizi', 2), at('char_4071_peper'), at('char_1020_reed2')]);
  /** A zone or chain with its cells counted. @param {any} z */
  const counted = (z) => ({ ...z, cells: z.cells && z.cells.length });
  assert.deepEqual([counted(reaper.zone), reaper.targets], [{ cells: 4, scale: 1.5, outside: false }, 'all']);
  assert.deepEqual([healer.heal, counted(healer.zone)], [true, { cells: 7, scale: 0.8, outside: true }]);
  assert.deepEqual([chain0.chain, chain2.chain.max, chain0.hitStatus], [{ max: 3, scale: 0.85, radius: 1.7, cells: null }, 4, { key: 'sluggish', seconds: 0.5 }]);
  const moduled = async (/** @type {string} */ id) => {
    const t = await loadTraining(id);
    return /** @type {any} */ (traits.traitOfDef(operatorAt(t, { elite: 2, level: t.phases[2].maxLevel, potential: 1, trust: 0, skill: -1, skillLevel: 1, module: 0, moduleLevel: 1 })));
  };
  const [chainX, chainY] = await Promise.all([moduled('char_306_leizi'), moduled('char_4004_pudd')]);
  assert.deepEqual([chainX.chain.scale, chainX.hitStatus.seconds, chainY.chain.scale], [0.9, 0.8, 1], 'CHA-X: 90 % a jump and a longer 停顿; CHA-Y: no less a jump');
  assert.deepEqual([chainHeal.heal, counted(chainHeal.chain)], [true, { max: 3, scale: 0.75, radius: 0, cells: 9 }]);
  assert.equal(incant.healOnHit, 0.5);
});

test('[职业-7] [职业-12] attack modes from the real data: 解放者, 阵法术师, 护佑者, 猎手, 秘术师, 行医, 佣兵', async () => {
  const [lib, phalanx, bless, hunter, mystic, wander, merc] = await Promise.all(['char_1043_leizi2', 'char_4080_lin', 'char_1022_flwr2', 'char_4104_coldst', 'char_297_hamoni', 'char_1016_agoat2', 'char_1049_catap2']
    .map(async (id) => /** @type {any} */ (traits.traitOfDef(await real(id)))));
  assert.deepEqual([lib.attackInSkill, lib.idleMods, lib.charge], [true, { blockCntMul: 0 }, { atk: 2, steps: 40, init: 0 }]);
  const t = await loadTraining('char_1043_leizi2'), libX = /** @type {any} */ (traits.traitOfDef(operatorAt(t, { elite: 2, level: 60, potential: 1, trust: 0, skill: 0, skillLevel: 7, module: t.modules.length - 1, moduleLevel: 1 })));
  assert.equal(libX.charge.init, 1, 'LIB-X 部署后获得+100%加成: from its hidden talent (init_atk)');
  assert.deepEqual([phalanx.attackInSkill, phalanx.idleMods, phalanx.targets, phalanx.antiAir], [true, { defPct: 2, resFlat: 20 }, 'all', true], '林: every enemy in range, only in her skill');
  assert.deepEqual([bless.skillHeal, hunter.bullets, mystic.store, wander.heal, wander.epHeal], [0.75, { max: 4, scale: 1.2 }, 3, true, 0.5], '冰酿 at elite 0: 4 bullets');
  assert.deepEqual([merc.blockedFirst, merc.antiAir], [true, false], '佣兵: the melee defaults');
});

test('[职业-7] [职业-13] 吟游者 from the real data: no attacks, outside the deploy limit, a regen aura of 10 % of its attack', async () => {
  const [sora, heidi] = await Promise.all(['char_101_sora', 'char_4045_heidi'].map(async (id) => /** @type {any} */ (traits.traitOfDef(await real(id)))));
  assert.deepEqual([sora.noAttack, sora.free, sora.regenAura, heidi.regenAura], [true, true, 0.1, 0.1]);
});

test('[职业-7] [职业-14] 塑灵术师, 陷阱师 and 战术家 from the real data; 策士, 工匠, 游击手 and 炼金师 take the defaults', async () => {
  const necras = await real('char_450_necras'), t = /** @type {any} */ (traits.traitOfDef(necras));
  assert.deepEqual([necras.dmgType, t.summonBlocked, t.summonBlockedScale, t.antiAir], ['arts', true, 1, true]);
  const n = await loadTraining('char_450_necras'), x = /** @type {any} */ (traits.traitOfDef(operatorAt(n, { elite: 2, level: 60, potential: 1, trust: 0, skill: 0, skillLevel: 7, module: 0, moduleLevel: 1 })));
  assert.equal(x.summonBlockedScale, 1.15, 'SOC-X 攻击力提升至115%');
  assert.equal(/** @type {any} */ (traits.traitOfDef(await real('char_451_robin'))).trapTiles, true);
  assert.equal(traits.traitOfDef(await real('char_452_bstalk')).summonBlockedScale, 1.5, '战术家 攻击力提升至150%');
  for (const id of ['char_4199_makiri', 'char_484_robrta', 'char_4234_pedro', 'char_4151_tinman']) {
    const op = await real(id);
    assert.deepEqual(traits.traitOfDef(op), { ...traits.defaultTrait(op.position), bb: {} }, id);
  }
});

test('[职业-7] [职业-15] 傀儡师 from the real data: a 20 s 替身, 1 s switches; PUM-Y raises its HP', async () => {
  // 贝娜's 替身 has her talent's range, its attacks arts and the damage it takes less (职业-16)
  const doll = { range: /** @type {any} */ (rangeTable.ranges)['x-4'], antiAir: true, attack: true, aura: null, arts: true };
  const plain = /** @type {any} */ (traits.traitOfDef(await real('char_369_bena')).doll);
  assert.deepEqual(plain, { duration: 20, switch: 1, atk: 0, maxHp: 0, ...doll }, 'elite 0: no reduction yet');
  const t = await loadTraining('char_369_bena'), y = /** @type {any} */ (traits.traitOfDef(operatorAt(t, { elite: 2, level: 60, potential: 1, trust: 0, skill: 0, skillLevel: 7, module: 0, moduleLevel: 1 }))).doll;
  assert.deepEqual({ ...y, taken: 0 }, { duration: 20, switch: 1, atk: 0, maxHp: 0.2, ...doll, taken: 0 });
  assert.ok(y.taken > 0.5 && y.taken < 1, 'elite 2: less damage taken');
});

/**
 * The trait of an operator (by name) at elite 2, max level, with its module of a type at level 1 (职业-7, 干员-7) — without
 * what its talents add (职业-24). @param {string} name @param {string} type
 */
async function withModule(name, type) {
  const id = /** @type {string} */ (Object.entries(ROSTER).find(([, r]) => r.name === name)?.[0]), t = await loadTraining(id);
  const module = t.modules.findIndex((m) => m.type === type);
  assert.ok(module >= 0, `${name} ${type}`);
  const { talentTrait: _, ...rec } = operatorAt(t, { elite: 2, level: t.phases[2].maxLevel, potential: 1, trust: 0, skill: -1, skillLevel: 1, module, moduleLevel: 1 });
  return /** @type {any} */ (traits.traitOfDef(rec));
}

test('[职业-7] [职业-17] the modules\' 倍率 by the target from the real data: the trait\'s blackboard, or the module\'s own data', async () => {
  const vs = async (/** @type {string} */ name, /** @type {string} */ type) => (await withModule(name, type)).vs;
  assert.deepEqual(await Promise.all([vs('W', 'ART-X'), vs('斯卡蒂', 'DRE-X'), vs('煌', 'CEN-X'), vs('号角', 'FOR-X'), vs('赫德雷', 'CRU-Y')]), [
    [{ when: 'blocked', atk: 1.1 }], [{ when: 'blocked', atk: 1.15 }], [{ when: 'blocked', atk: 1.1 }], [{ when: 'blocked', atk: 1.1 }], [{ when: 'blocked', dmg: 1.1 }],
  ]);
  assert.deepEqual(await Promise.all([vs('流星', 'MAR-X'), vs('苇草', 'CHG-Y'), vs('早露', 'SIE-X'), vs('鸿雪', 'ARC-Y'), vs('黑', 'ARC-Y'), vs('娜仁图亚', 'LPS-X')]), [
    [{ when: 'flying', atk: 1.1 }], [{ when: 'hpBelow', atk: 1.15, value: 0.4 }], [{ when: 'heavy', atk: 1.15, value: 3 }],
    [{ when: 'front', atk: 1.05, noDodge: true }], [{ when: 'front', atk: 1.05, noDodge: true }], [{ when: 'near', atk: 1.1 }],
  ]);
  assert.deepEqual(await Promise.all([vs('妮芙', 'PRI-X'), vs('埃癸斯', 'BRK-X'), vs('闪灵', 'PHY-X'), vs('闪灵', 'PHY-Y'), vs('塞雷娅', 'GUA-X')]), [
    [{ when: 'burst', dmg: 1.1 }], [{ when: 'skillGround', atk: 1.1 }], [{ when: 'hpBelow', heal: 1.15, value: 0.5 }], [{ when: 'onGround', heal: 1.15 }],
    [{ when: 'hpBelow', heal: 1.15, value: 0.5 }],
  ]);
  const [dea, sie, bla, plx, ham] = await Promise.all([withModule('远牙', 'DEA-X'), withModule('早露', 'SIE-Y'), withModule('伊芙利特', 'BLA-X'), withModule('卡涅利安', 'PLX-Y'), withModule('佩佩', 'HAM-X')]);
  assert.deepEqual([dea.far, sie.far, bla.far, plx.crowd, ham.packed], [
    { min: 1, max: 4.5, dmg: 0.15 }, { min: 1, max: 4.5, dmg: 0.12 }, { min: 0, max: 4, dmg: 0.1 }, { step: 0.03, cap: 5 }, { cnt: 3, atk: 1.15 },
  ]);
  const plain = /** @type {any} */ (traits.traitOfDef(operatorAt(await loadTraining('char_263_skadi'), { elite: 2, level: 90, potential: 1, trust: 0, skill: -1, skillLevel: 1 })));
  assert.deepEqual([plain.vs, (await withModule('斯卡蒂', 'DRE-Y')).vs], [[], []], 'none without the module, nor with another');
});

test('[职业-7] [职业-18] the modules\' modifiers while a condition on the operator holds, from the real data', async () => {
  const wh = async (/** @type {string} */ name, /** @type {string} */ type) => (await withModule(name, type)).whiles;
  const one = (/** @type {string} */ when, /** @type {Record<string, number>} */ mods, /** @type {number | undefined} */ value = undefined) => [{ when, mods, ...(value !== undefined ? { value } : {}) }];
  assert.deepEqual(await Promise.all([wh('推进之王', 'SOL-X'), wh('蛇屠箱', 'PRO-X'), wh('森蚺', 'HES-Y').then((l) => l.filter((/** @type {any} */ v) => v.when === 'blocking')), wh('史尔特尔', 'AFT-X'), wh('号角', 'FOR-Y')]), [
    one('blocking', { atkPct: 0.08, defPct: 0.08 }), one('blocking', { defPct: 0.2 }), one('blocking', { atkPct: 0.15, defPct: 0.15 }),
    one('notBlocking', { aspd: 8 }), one('notBlocking', { aspd: 10 }),
  ]);
  assert.deepEqual(await Promise.all([wh('山', 'FGT-Y'), wh('艾丝黛尔', 'CEN-Y'), wh('赫拉格', 'SBL-X'), wh('阿', 'GEE-X'), wh('新约能天使', 'GEE-X')]), [
    one('hpAbove', { aspd: 10 }, 0.5), one('hpAbove', { physTakenMul: 0.8 }, 0.5), one('hpBelow', { physTakenMul: 0.75, artsTakenMul: 0.75 }, 0.5),
    one('hpAbove', { spRecoveryFlat: 0.25 }, 0.8), one('hpAbove', { spRecoveryFlat: 0.25 }, 0.8),
  ]);
  assert.deepEqual(await Promise.all([wh('烈夏', 'LOR-Y'), wh('隐德来希', 'REA-Y'), wh('圣约送葬人', 'REA-Y'), wh('铃兰', 'DEC-X'), wh('杰西卡', 'MAR-Y'), wh('能天使', 'MAR-Y')]), [
    one('enemies', { aspd: 12 }, 2), one('enemies', { aspd: 12 }, 2), one('enemies', { aspd: 12 }, 2), one('enemies', { spRecoveryFlat: 0.2 }, 1),
    one('groundEnemies', { aspd: 8 }, 1), one('groundEnemies', { aspd: 8 }, 1),
  ]);
  assert.deepEqual(await Promise.all([wh('灵知', 'UMD-Y'), wh('妮芙', 'PRI-Y'), wh('卡夫卡', 'EXE-Y'), wh('泥岩', 'UNY-Y'), wh('海蒂', 'BAR-X')]), [
    one('eliteEnemies', { spRecoveryFlat: 0.25 }), one('burstEnemies', { spRecoveryFlat: 0.2 }), one('alone4', { atkPct: 0.1 }),
    one('alone8', { atkPct: 0.08, defPct: 0.08 }), one('allies', { atkPct: 0.08 }, 2),
  ]);
  assert.deepEqual(await Promise.all([wh('焰影苇草', 'INC-Y'), wh('纯烬艾雅法拉', 'WDM-Y'), wh('岳羽由加莉', 'RAN-X'), wh('黑键', 'MSC-Y')]), [
    one('injuredAllies', { dmgDealtMul: 1.1 }), one('epAllies', { aspd: 8 }), one('skillAllies', { atkPct: 0.08 }), one('energy', { aspd: 30 }),
  ]);
  assert.deepEqual([(await withModule('推进之王', 'SOL-Y')).whiles, (await withModule('傀影', 'EXE-X')).whiles], [[], []], 'none for another module');
});

test('[职业-7] [职业-17] [职业-18] the modules\' lasting modifiers, a skill\'s damage and 决战者\'s SP, from the real data', async () => {
  const wh = async (/** @type {string} */ name, /** @type {string} */ type) => (await withModule(name, type)).whiles;
  const always = (/** @type {Record<string, number>} */ mods) => [{ when: 'always', mods }];
  assert.deepEqual(await Promise.all([wh('寻澜', 'AGE-X'), wh('杰克', 'FGT-X'), wh('瑕光', 'GUA-Y'), wh('石英', 'CRU-X'), wh('锡兰', 'WAH-X')]), [
    always({ taunt: -1 }), always({ dodgePhys: 0.15 }), always({ dmgTakenMul: 0.85 }), always({ healingTakenMul: 1.2 }), always({ taunt: -1, statusResMul: 0.5 }),
  ]);
  assert.deepEqual(await Promise.all([wh('W', 'ART-Y'), wh('刻刀', 'SWO-Y'), wh('艾雅法拉', 'CCR-X'), wh('泥岩', 'UNY-X')]), [
    always({ defIgnoreFlat: 100 }), always({ defIgnoreFlat: 70 }), always({ resIgnoreFlat: 10 }), always({ blockedTakenMul: 0.85 }),
  ]);
  assert.deepEqual((await withModule('陈', 'SWO-X')).vs, [{ when: 'skill', dmg: 1.1 }]);
  const [x, y] = await Promise.all([withModule('森蚺', 'HES-X'), withModule('森蚺', 'HES-Y')]);
  assert.deepEqual([x.flags, x.immuneBlocking, x.whiles], [{}, [], [{ when: 'notBlocking', mods: { spRecoveryMul: 1 + -0.8 } }]], 'HES-X: no 阻回, SP slower while it blocks none');
  assert.deepEqual(y.whiles.map((/** @type {any} */ v) => v.when), ['notBlocking', 'blocking']);
});

test('[职业-7] [职业-19] [干员-7] the modules\' ranges, targets and tiles, from the real data', async () => {
  const at = async (/** @type {string} */ name, /** @type {string} */ type, lv = 1) => {
    const id = /** @type {string} */ (Object.entries(ROSTER).find(([, r]) => r.name === name)?.[0]), t = await loadTraining(id);
    const b = { elite: 2, level: t.phases[2].maxLevel, potential: 1, trust: 0, skill: -1, skillLevel: 1 };
    return { plain: operatorAt(t, b), mod: operatorAt(t, { ...b, module: t.modules.findIndex((m) => m.type === type), moduleLevel: lv }) };
  };
  const cells = (/** @type {string} */ id) => /** @type {any} */ (rangeTable.ranges)[id];
  const [nightingale, tecno, mostima, siege] = await Promise.all([at('夜莺', 'RIN-X'), at('特克诺', 'SOC-Y'), at('莫斯提马', 'SPC-X'), at('推进之王', 'SOL-Y', 3)]);
  assert.deepEqual([nightingale.mod.range, tecno.mod.range, mostima.mod.range], [cells('y-3'), cells('3-18'), cells('3-1')], '「攻击范围扩大」');
  assert.deepEqual(siege.mod.range, siege.plain.range, '推进之王 SOL-Y\'s x-5 is 粉碎\'s area, not its attack range');
  const tr = async (/** @type {string} */ name, /** @type {string} */ type) => /** @type {any} */ (traits.traitOfDef((await at(name, type)).mod));
  const [rin, bls, spt, ins, trp] = await Promise.all([tr('夜莺', 'RIN-Y'), tr('淬羽赫默', 'BLS-Y'), tr('信仰搅拌机', 'SPT-Y'), tr('杜宾', 'INS-Y'), tr('艾拉', 'TRP-D')]);
  assert.deepEqual([rin.targets, bls.targets, spt.whiles, ins.rangedTiles, trp.meleeTiles], [4, 2, [{ when: 'always', mods: { rangeExtend: 1 } }], true, true]);
});

test('[职业-7] [职业-20] the modules\' riders, SP, auras and 元素损伤, from the real data', async () => {
  const [silver, sharp, thorns, cuirass, gnosis] = await Promise.all([withModule('银灰', 'LOR-X'), withModule('领主·Sharp', 'LOR-X'), withModule('棘刺', 'LOR-D'), withModule('坚雷', 'AST-X'), withModule('灵知', 'UMD-X')]);
  assert.deepEqual([silver.extraArts, sharp.extraArts, thorns.epRider, cuirass.extraArts, cuirass.counterArts, gnosis.hitStatus], [
    0.1, 0.1, { el: 'SANITY', ratio: 0.1, arts: false }, 0.1, 0.1, { key: 'weaken', seconds: 2, value: 0.1 },
  ]);
  const [ifrit, logos, ebenholz, viviana, cast] = await Promise.all([withModule('伊芙利特', 'BLA-D'), withModule('逻各斯', 'CCR-D'), withModule('黑键', 'MSC-D'), withModule('薇薇安娜', 'AFT-D'), withModule('铸铁', 'AFT-Y')]);
  assert.deepEqual([ifrit.epRider, logos.epRider, ebenholz.epRider, viviana.burstHit, cast.auras], [
    { el: 'FIRE', ratio: 0.08, arts: true }, { el: 'DARK', ratio: 0.08, arts: true }, { el: 'DARK', ratio: 0.08, arts: true }, { el: 'FIRE', scale: 0.15 },
    [{ to: 'blocked', mods: { artsTakenMul: 1.1 } }],
  ]);
  const [snow, keeper, narant] = await Promise.all([withModule('雪绒', 'CCR-Y'), withModule('守林人', 'DEA-Y'), withModule('娜仁图亚', 'LPS-Y')]);
  assert.deepEqual([snow.spOn, keeper.spOn, narant.spOn], [{ on: 'elite', sp: 1 }, { on: 'survives', sp: 1 }, { on: 'catch', sp: 1, every: 5 }]);
  const [heart, valarqvin, mizuki, jessica, muelsyse, yu, lee] = await Promise.all([withModule('塑心', 'RIT-Y'), withModule('凛视', 'RIT-X'), withModule('水月', 'AMB-X'),
    withModule('涤火杰西卡', 'SPT-X'), withModule('缪尔赛思', 'TAC-Y'), withModule('余', 'PRP-X'), withModule('老鲤', 'MER-Y')]);
  assert.deepEqual([heart.auras, valarqvin.vs, mizuki.auras, jessica.auras, muelsyse.auras], [
    [{ to: 'range', mods: { elementalTakenMul: 1.1 } }], [{ when: 'elite', ep: 1.18 }], [{ to: 'range', mods: { movePct: -0.2 } }],
    [{ to: 'range', flags: { 'immune:stealth': true } }], [{ to: 'summonBlocked', mods: { taunt: 1 } }],
  ]);
  assert.deepEqual([yu.whiles, lee.payStack], [[{ when: 'blocking', mods: { epDealtMul: 1.15 } }], { atk: 0.04, max: 5 }]);
});

test('[职业-7] [职业-21] the modules\' card, refund, summons and skill-time effects, from the real data', async () => {
  const [saga, ines, phantom, bagpipe, magallan, dorothy, saileach, saria, muelsyse] = await Promise.all([withModule('嵯峨', 'SOL-Y'), withModule('伊内丝', 'AGE-Y'),
    withModule('傀影', 'EXE-X'), withModule('风笛', 'CHG-X'), withModule('麦哲伦', 'SUM-X'), withModule('多萝西', 'TRP-Y'), withModule('琴柳', 'BEA-X'), withModule('琴柳', 'BEA-Y'),
    withModule('缪尔赛思', 'TAC-X')]);
  assert.deepEqual([saga.firstCost, ines.firstRetreatRespawn, phantom.refund, phantom.refundUncapped, bagpipe.refund, bagpipe.refundUncapped, magallan.freeSummons, dorothy.summonBoost], [
    -4, 1 - 0.35, 0.8, true, 1, true, 1, { prob: 0.2, scale: 2 },
  ]);
  assert.deepEqual([saileach.auras, saria.whiles, muelsyse.auras], [
    [{ to: 'frontAlly', skill: true, mods: { blockCnt: 1 } }], [{ when: 'inSkill', mods: {}, flags: { camou: true } }], [{ to: 'summons', mods: { blockedTakenMul: 0.85 } }],
  ]);
});

test('[职业-7] [职业-22] the modules\' second lives, aftershocks, bullets and 阵法术师\'s skill-time guard, from the real data', async () => {
  const [skadi, hellagur, rosmontis, hunter, lin] = await Promise.all([withModule('斯卡蒂', 'DRE-Y'), withModule('赫拉格', 'SBL-Y'), withModule('迷迭香', 'BOM-X'),
    withModule('冰酿', 'HUN-X'), withModule('林', 'PLX-X')]);
  assert.deepEqual([skadi.secondLife, hellagur.secondLife, rosmontis.aftershocks, hunter.bullets.extra, lin.whiles], [
    { hp: 1, mods: { hpMul: 1 - 0.6, aspd: 30 } }, { hp: 0.3, mods: {} }, 2, 1, [{ when: 'inSkill', mods: { defPct: 1, resFlat: 10 } }],
  ]);
});

test('[职业-16] [职业-20] [职业-21] 贝娜\'s 替身, BAR-Y\'s 伤害减免, 维娜\'s AFT-Y, 艾拉\'s traps, from the real data', async () => {
  const bena = await loadTraining('char_369_bena'), doll = /** @type {any} */ (traits.traitOfDef(operatorAt(bena, { elite: 2, level: 90, potential: 1, trust: 0, skill: 0, skillLevel: 1 }))).doll;
  assert.deepEqual([doll.arts, doll.attack, Math.round(doll.taken * 100) / 100], [true, true, 0.6], '「<替身>攻击造成法术伤害且受到的物理与法术伤害减少40%」');
  const [skadi, vina, cast, ela] = await Promise.all([withModule('浊心斯卡蒂', 'BAR-Y'), withModule('维娜·维多利亚', 'AFT-Y'), withModule('铸铁', 'AFT-Y'), withModule('艾拉', 'TRP-D')]);
  assert.deepEqual([skadi.auras, vina.auras, cast.auras, ela.summonRangedTiles], [
    [{ to: 'rangeAllies', skill: true, mods: { dmgReduceFlat: 30 } }],
    [{ to: 'blocked', mods: { dmgTakenMul: 1.1 } }, { to: 'summonBlocked', mods: { dmgTakenMul: 1.1 } }], [{ to: 'blocked', mods: { artsTakenMul: 1.1 } }], true,
  ]);
});

test('[职业-13] [职业-20] 鼓舞 does not reach a 吟游者; 佣兵 MCN-X: attack for each cost a skill pays, from the real data', async () => {
  const [catap, sora] = await Promise.all([withModule('雷狼龙S空爆', 'MCN-X'), real('char_101_sora')]);
  assert.deepEqual([catap.spendAtk, traits.traitOfDef(sora).noInspire], [{ atk: 0.02, max: 10 }, true]);
});

test('[职业-18] [技能-13] 炼金师 ALC-X: SP recovery while a 炼金单元 it threw is on the field, from the real data', async () => {
  const tin = await withModule('锡人', 'ALC-X');
  assert.deepEqual(tin.whiles, [{ when: 'alchemy', mods: { spRecoveryFlat: 0.1 } }]);
});

test('[职业-23] [干员-7] the push and pull modules, XAH-X\'s jumps and 白面鸮 RIN-X\'s range, from the real data', async () => {
  const [shaw, forcer, cliff, glady, peper] = await Promise.all([withModule('阿消', 'PUS-Y'), withModule('见行者', 'PUS-X'), withModule('崖心', 'HOK-X'),
    withModule('歌蕾蒂娅', 'HOK-Y'), withModule('明椒', 'XAH-X')]);
  assert.deepEqual([shaw.pushBoost, forcer.rangedRefund, cliff.pullTrauma, glady.pullBoost, peper.chain.scale],
    [{ cnt: 2, level: 1 }, 0.5, { perTile: 800, every: 0.066 }, { range: 2.5, level: 1 }, 0.85]);
  const id = /** @type {string} */ (Object.entries(ROSTER).find(([, r]) => r.name === '白面鸮')?.[0]), t = await loadTraining(id);
  const b = { elite: 2, level: t.phases[2].maxLevel, potential: 1, trust: 0, skill: -1, skillLevel: 1 }, module = t.modules.findIndex((m) => m.type === 'RIN-X');
  assert.ok(operatorAt(t, { ...b, module, moduleLevel: 3 }).range.length > operatorAt(t, b).range.length, '攻击范围扩大 beside the module\'s SP aura numbers');
});

test('[职业-7] [体积-5] 谬因 searches by tile: her own trait data over her 轰击术师 trait, in a match\'s records too; others keep theirs', async () => {
  assert.deepEqual(Object.keys(OPERATOR_TRAITS), ['char_4229_aphris', 'char_253_greyy', 'char_509_acast']);
  const aphris = await real('char_4229_aphris'), t = traits.traitOfDef(withOwnTrait('char_4229_aphris', aphris));
  assert.deepEqual([t.rangeTiles, t.filter, t.targets, traits.traitOfDef(aphris).rangeTiles], [true, 'ALL', 'all', false]);
  const sniper = await real('char_1021_kroos2');
  assert.equal(withOwnTrait('char_1021_kroos2', sniper), sniper);
  const build = { elite: 2, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 };
  const ops = /** @type {Record<string, any>} */ ((await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1,
    decks: [[{ id: 'char_4229_aphris', build }, { id: 'char_1021_kroos2', build }]] })).operators);
  assert.deepEqual([traits.traitOfDef(ops['char_4229_aphris#0']).rangeTiles, traits.traitOfDef(ops['char_1021_kroos2#0']).rangeTiles], [true, false]);
});

test('[职业-8] [职业-7] 格雷伊 splashes at 1.0 and Pith (char_509_acast) at 0.9; other 扩散术师 keep the branch\'s 1.1', async () => {
  const radius = async (/** @type {string} */ id) => traits.traitOfDef(withOwnTrait(id, await real(id))).splash?.radius;
  assert.deepEqual([await radius('char_253_greyy'), await radius('char_509_acast'), await radius('char_612_accast')], [1, 0.9, 1.1]);
  assert.equal(traits.traitOfDef(await real('char_253_greyy')).splash?.radius, 1.1, 'the branch alone is 1.1');
});
