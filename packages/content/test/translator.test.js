// 转译基底·α and 转译基底·β (docs/spec/foes.md 敌能-158): the page rows (`Passive.change`, `Mode_Shushi_Passive.targets`), the
// read shapes, 原始形态 — no attack, 失衡免疫, the immunities, every hit cancelled and counted by type —, the one change
// (a block, else a full count, at its turn; 2 s standing still), and the three forms' numbers and attacks. Neither is in a
// shipped level, so the records are enemy_database's level 0 (ArknightsGameData 17759cc8), built here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, damage, elements, buffs, bus } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, LEVELS } from '../src/index.js';
import { FOE_EXTRAS, foeBehaviors, withFoeExtras, uncoveredAbilities, withoutIncomplete } from '../src/foes.js';
import { translatorShape } from '../src/translator.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */
/** @typedef {{ c: any, w: World, e: Unit }} Box */

const ALPHA = 'enemy_10081_mpplai';
const BETA = 'enemy_10081_mpplai_2';
const PHYS = 'translatorPhys';
const ARTS = 'translatorArts';
/** Both records' Mode numbers (enemy_database 17759cc8, level 0). */
const FUCHOU = Object.freeze({ max_hp: 4000, atk: 500, def: 250, magic_resistance: 20, move_speed: -0.55, base_attack_time: 1.3, mass_level: 1 });
const SHUSHI = Object.freeze({ max_hp: 2000, atk: 300, def: 200, magic_resistance: 30, move_speed: -0.4, base_attack_time: 3, mass_level: 1 });
const YOULING = Object.freeze({ max_hp: 0, atk: 0, def: 0, magic_resistance: 0, move_speed: 0, base_attack_time: 0, mass_level: 0 });
const SKILLS = ['ChangeToB', 'ChangeToC', 'ChangeToD'];
const NAMES = ['Mode_Fuchou_Anger', 'Mode_Fuchou_Passive', 'Mode_Shushi_Passive', 'Mode_Youling_Passive', ...SKILLS];

/**
 * The enemy_database record (level 0) before the page row.
 * @param {string} key @returns {EnemyDef}
 */
function raw(key) {
  const beta = key === BETA;
  return /** @type {EnemyDef} */ ({
    name: beta ? '转译基底·β' : '转译基底·α', maxHp: beta ? 4000 : 2500, atk: beta ? 200 : 100, def: beta ? 600 : 450, res: beta ? 45 : 40, moveSpeed: 1,
    baseAttackTime: 1, rangeRadius: 2.4, applyWay: 'NONE', motion: 'WALK', massLevel: 1, levelType: 'ELITE', lifePointReduce: 1, epResistance: 10, epDamageResistance: 0, tags: ['origen'],
    talents: {
      Passive: { phy_max_count: 4, magic_max_count: 4 }, Mode_Fuchou_Anger: { atk: beta ? 1.8 : 1 },
      Mode_Fuchou_Passive: { ...FUCHOU }, Mode_Youling_Passive: { ...YOULING }, Mode_Shushi_Passive: { ...SHUSHI },
    },
    skills: SKILLS.map((k) => ({ key: k, cooldown: 0, initCooldown: 0, sp: 0, bb: {} })),
  });
}

/**
 * As a level assembles it — the page row merged (FOE_EXTRAS) —, then `over` per talent over its blackboard.
 * @param {string} [key] @param {Record<string, Record<string, unknown>>} [over] @returns {EnemyDef}
 */
function rec(key = ALPHA, over = {}) {
  const d = withFoeExtras(key, raw(key)), t = { ...d.talents };
  for (const [name, bb] of Object.entries(over)) t[name] = /** @type {Record<string, number>} */ ({ ...t[name], ...bb });
  return { ...d, talents: t };
}

/** The assembled record with one key of a talent gone. @param {string} name @param {string} drop @returns {EnemyDef} */
function less(name, drop) {
  const d = rec(), bb = { ...d.talents?.[name] };
  delete bb[drop];
  return { ...d, talents: { ...d.talents, [name]: bb } };
}

/**
 * The tiny map, the enemy rooted (the 束缚 status) on the road at (row 1, col 2); ours cost nothing, have no attack or
 * defence and a million HP; `sniper2` and `sniper3` are two more snipers.
 * @param {EnemyDef} def @param {string} [key] @returns {Box}
 */
function open(def, key = ALPHA) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators.sniper2 = { ...c.operators.sniper, name: 'sniper2' };
  c.operators.sniper3 = { ...c.operators.sniper, name: 'sniper3' };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, atk: 0, def: 0, res: 0, maxHp: 1e6 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === key));
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  return { c, w, e };
}

/** Steps n frames, the events collected. @param {Box} box @param {number} n */
function run(box, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) out.push(...step(box.w, box.c));
  return out;
}

/** Deploys one of ours; the frame's events into `ev`. @param {Box} box @param {string} op @param {number} row @param {number} col @param {any[]} [ev] */
function put(box, op, row, col, ev = []) {
  ev.push(...step(box.w, box.c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]));
  return /** @type {Unit} */ (box.w.units.find((u) => u.key === op));
}

/** A hit on it through the damage module with the content (伤害-7). @param {Box} box @param {string} type @param {number} [amount] @param {Unit | null} [src] */
const hit = (box, type, amount = 1000, src = null) => damage.dealDamage(box.w, src, box.e, { type: /** @type {any} */ (type), amount }, box.c);

/** @param {Unit} e @param {string} key */
const buffOf = (e, key) => e.buffs.find((b) => b.key === key);
/** The two counts' `n`, null once gone. @param {Unit} e */
const counts = (e) => [PHYS, ARTS].map((k) => buffOf(e, k)?.n ?? null);
/** Its form: 1 寻仇者, 2 特战术师, 3 幽灵; 0 before the change ends. @param {Unit} e */
const formOf = (e) => buffOf(e, 'translatorForm')?.value ?? 0;
/** @param {any[]} ev @param {Unit} e */
const hitsBy = (ev, e) => ev.filter((x) => x.type === 'hit' && x.id === e.id);
/** The stats a form changes. @param {Unit} e */
function numbers(e) {
  const s = attrs.statsOf(e);
  return { maxHp: s.maxHp, hp: e.hp, atk: s.atk, def: s.def, res: s.res, moveSpeed: s.moveSpeed, bat: s.bat, massLevel: s.massLevel };
}

/**
 * `n` hits of `type`, then the turn that starts the change and its `frames`: the form has just begun.
 * @param {Box} box @param {string} type @param {number} n @param {number} [frames]
 */
function changeBy(box, type, n, frames = 60) {
  for (let i = 0; i < n; i++) hit(box, type);
  run(box, 1 + frames);
}

test('[敌能-158] [关卡-2] the page rows add Passive.change and Mode_Shushi_Passive.targets; only the read shapes are covered', () => {
  for (const [key, oldid] of /** @type {const} */ ([[ALPHA, 368157], [BETA, 368158]])) {
    assert.deepEqual(FOE_EXTRAS[key]?.talents, { Passive: { change: 2 }, Mode_Shushi_Passive: { targets: 2 } });
    assert.ok(FOE_EXTRAS[key]?.source.endsWith(`&oldid=${oldid}`));
    assert.deepEqual(rec(key).talents?.Passive, { phy_max_count: 4, magic_max_count: 4, change: 2 });
    assert.deepEqual(uncoveredAbilities([rec(key)]), []);
    assert.deepEqual(uncoveredAbilities([raw(key)]), ['Passive', 'Mode_Shushi_Passive'], 'not without the page');
    assert.deepEqual(Object.keys(withoutIncomplete(raw(key)).talents ?? {}), ['Mode_Fuchou_Anger', 'Mode_Fuchou_Passive', 'Mode_Youling_Passive']);
  }
  for (const k of ['phy_max_count', 'magic_max_count', 'change']) {
    assert.deepEqual(uncoveredAbilities([less('Passive', k)]), ['Passive'], `without ${k}`);
    assert.deepEqual(uncoveredAbilities([rec(ALPHA, { Passive: { [k]: '4' } })]), ['Passive'], `a text ${k}`);
  }
  assert.deepEqual(uncoveredAbilities([rec(ALPHA, { Passive: { extra: 1 } })]), ['Passive'], 'a key more');
  // neither is in a shipped level (both pages name chapter 15 levels the engine has not extracted)
  for (const lv of Object.values(LEVELS)) assert.equal([ALPHA, BETA].some((k) => Object.hasOwn(lv.enemies ?? {}, k)), false, lv.level?.id);
});

test('[敌能-158] [关卡-2] the Mode talents and the ChangeTo skills: covered only in their exact shapes, no hook of their own', () => {
  for (const name of ['Mode_Fuchou_Passive', 'Mode_Shushi_Passive', 'Mode_Youling_Passive']) {
    assert.deepEqual(uncoveredAbilities([less(name, 'mass_level')]), [name], `${name} without mass_level`);
    assert.deepEqual(uncoveredAbilities([rec(ALPHA, { [name]: { atk: '1' } })]), [name], `${name} a text atk`);
    assert.deepEqual(uncoveredAbilities([rec(ALPHA, { [name]: { taunt_level: 1 } })]), [name], `${name} a key more`);
  }
  assert.deepEqual(uncoveredAbilities([rec(ALPHA, { Mode_Fuchou_Passive: { targets: 2 } })]), ['Mode_Fuchou_Passive'], 'targets is Shushi only');
  assert.deepEqual(uncoveredAbilities([less('Mode_Fuchou_Anger', 'atk')]), ['Mode_Fuchou_Anger']);
  assert.deepEqual(uncoveredAbilities([rec(ALPHA, { Mode_Fuchou_Anger: { hp_ratio: 0.5 } })]), ['Mode_Fuchou_Anger']);
  const d = rec(), skills = (d.skills ?? []).map((s) => (s.key === 'ChangeToC' ? { ...s, bb: { duration: 2 } } : s));
  assert.deepEqual(uncoveredAbilities([{ ...d, skills }]), ['ChangeToC'], 'a skill blackboard is not empty');
  for (const name of NAMES) assert.deepEqual(Object.keys(foeBehaviors[name] ?? { missing: 1 }), [], `${name} has no hook of its own`);
});

/** The name's other 49 users and their Passive (enemy_database 17759cc8, level 0; agd.txt). */
const OTHERS = /** @type {Readonly<Record<string, Record<string, number | string>>>} */ (Object.freeze({
  enemy_10146_nscola: { 'enemy_nscola[speed].move_speed': 0.3, fixed_value_damage: 120, 'enemy_nscola[speed].max_time': 25, 'enemy_nscola[speed].interval': 0.5 },
  enemy_10146_nscola_2: { 'enemy_nscola[speed].move_speed': 0.3, fixed_value_damage: 120, 'enemy_nscola[speed].max_time': 25, 'enemy_nscola[speed].interval': 0.5 },
  enemy_10147_nsbomb: { interval: 2.5, range_radius: 1, atk_scale: 2 }, enemy_10147_nsbomb_2: { interval: 2.5, range_radius: 1, atk_scale: 2 },
  enemy_10148_nsmos: { range_radius: 1.5 }, enemy_10148_nsmos_2: { range_radius: 1.5 },
  enemy_10149_nscan: { 'enemy_nscan[speed].move_speed': 0.5, fixed_value_damage: 250, 'enemy_nscan[speed].max_time': 25, 'enemy_nscan[speed].interval': 0.5, 'attack@atk_scale_speed': 500 },
  enemy_10149_nscan_2: { 'enemy_nscan[speed].move_speed': 0.5, fixed_value_damage: 250, 'enemy_nscan[speed].max_time': 25, 'enemy_nscan[speed].interval': 0.5, 'attack@atk_scale_speed': 700 },
  enemy_10150_nsheat: { force: 1 }, enemy_10150_nsheat_2: { force: 1 }, enemy_10153_nsblon: { force: 1 }, enemy_10153_nsblon_2: { force: 1 },
  enemy_10154_mnmblx: { taunt_level: 1 }, enemy_1256_lyacpa: { 'attack@ranged.atk_scale': 0.5 }, enemy_1256_lyacpa_2: { 'attack@ranged.atk_scale': 0.5 },
  enemy_1283_sgkill: { attack_speed: 50, atk: 0.15, def: 0.15, max_stack_cnt: 5 }, enemy_1283_sgkill_2: { attack_speed: 50, atk: 0.15, def: 0.15, max_stack_cnt: 5 },
  enemy_1284_sgprst: { sp: 2, 'attack@def': -300 }, enemy_1367_dseed: { damage_resistance: 0, hp_ratio: 0.1 }, enemy_1369_bmbcar1: { multiplier: 0.1 },
  enemy_1390_dhsbr: { extra_value: 5, range_radius: 1 }, enemy_1390_dhsbr_2: { extra_value: 5, range_radius: 1 },
  enemy_1392_dhshld: { extra_value: 15, range_radius: 1 }, enemy_1392_dhshld_2: { extra_value: 15, range_radius: 1 },
  enemy_1400_dhtbgj: { damage_value: 200 }, enemy_1400_dhtbgj_2: { damage_value: 300 },
  enemy_15023_dqwlfm: { sp: 1, damage_resistance: 0.3 }, enemy_15090_dqacpa: { 'attack@ranged.atk_scale': 0.5 }, enemy_1524_bldkgt: { damage_scale: 0.75 },
  enemy_1535_wlfmster: { sp: 1, damage_resistance: 0.3 },
  enemy_1553_lrdead_2: { 'enemy_lrking[suicide_p1].lrdead_suicide_p1': 500, 'enemy_lrking[suicide_p1].value': -99 },
  enemy_1579_nstmom: { 'attack@spash_atk_scale': 0.5 }, enemy_17001_wmshp: { range_radius: 3, stay_unmove_time: 6, atk_scale_vase: 1 },
  enemy_18008_lhbbos: { delay: 0 }, enemy_2080_skzlwy: { hp_recovery_per_sec_by_max_hp_ratio: 0.02, hp_ratio: 0.2 },
  enemy_2143_shwksc: { sp: 0 }, enemy_2144_shwks2: { sp: 1 }, enemy_2148_shorbb: { mark: 1 }, enemy_2154_shdfb: { duration: 10 }, enemy_2156_shsmok: { duration: 300 },
  enemy_3004_speople: { 'speople_dead_vg.sp': 40, 'speople_modify_vg.sp': -1 }, enemy_4067_mucycl: { radius: 1.2 },
  enemy_6002_trswlf: { resist_duration: 4, damage_resistance: 0.3, passive_stack_cnt: 3, range_num: 3, can_select_num: 1 },
  enemy_6006_fystone: { hp_ratio: 0.04 }, enemy_6009_nlkgtbs: { damage_resistance: 0.35, damage: 15 },
  enemy_6010_boxing: { attack_speed: 150, hp_ratio: 0.65, branch_id: 'branch' }, enemy_6013_smith: { inv_duration: 200 },
  enemy_6014_crzgas: { hp_ratio: 0.2, inv_duration: 2, boss_add: 1 }, enemy_8003_flmchn2: { magic_damage: 0 },
}));

test('[敌能-158] the name\'s other 49 users of Passive are not this shape, with their rows or with the page\'s change', () => {
  assert.equal(Object.keys(OTHERS).length, 49);
  for (const [key, bb] of Object.entries(OTHERS)) {
    const merged = /** @type {Record<string, unknown>} */ ({ ...bb, ...FOE_EXTRAS[key]?.talents?.Passive });
    assert.equal(translatorShape(merged), false, key);
    assert.equal(translatorShape({ ...merged, change: 2 }), false, `${key} with change`);
  }
  assert.equal(translatorShape(/** @type {Record<string, unknown>} */ (rec().talents?.Passive)), true, 'the read shape itself');
  assert.equal(translatorShape({ phy_max_count: 4, magic_max_count: 4 }), false, 'the data alone');
});

test('[敌能-158] [状态-7] [位移-1] 原始形态 from spawn: no attack, 失衡免疫, six immunities, the two counts at the data\'s numbers', () => {
  const box = open(rec(ALPHA, { Passive: { phy_max_count: 3, magic_max_count: 5 } })), e = box.e;
  const origin = /** @type {import('@aue/sim').Buff} */ (buffOf(e, 'translator'));
  assert.equal(origin.act, 'translator');
  assert.deepEqual(Object.keys(origin.flags), ['noAttack', 'noDisplace', 'immune:stun', 'immune:sleep', 'immune:cold', 'immune:freeze', 'immune:levitate', 'immune:fear']);
  assert.deepEqual([PHYS, ARTS].map((k) => [buffOf(e, k)?.value, buffOf(e, k)?.n]), [[3, 0], [5, 0]], 'the counts follow the blackboard');
  for (const k of /** @type {const} */ (['stun', 'sleep', 'freeze', 'levitate', 'fear'])) status.applyStatus(e, k, { seconds: 5 });
  const s = attrs.statsOf(e);
  assert.equal(s.flags.noAttack, true);
  assert.equal(s.flags.noDisplace, true);
  assert.deepEqual([s.flags.stun, s.flags.sleep, s.flags.freeze, s.flags.levitate, s.flags.fear, s.disabled, s.invincible], [undefined, undefined, undefined, undefined, undefined, false, false]);
  /** @type {any[]} */
  const ev = [];
  put(box, 'sniper', 0, 2, ev);
  ev.push(...run(box, 60));
  assert.deepEqual(hitsBy(ev, e), [], 'a sniper 1 tile away, inside its 2.4: no attack');
  assert.equal(formOf(e), 0);
});

test('[敌能-158] [伤害-8] [伤害-10] every hit that reaches its 伤判 is cancelled and counted by type, from any source; 生命流失 is not', () => {
  const box = open(rec()), e = box.e, g = put(box, 'guard', 0, 0);
  box.w.events = [];
  assert.deepEqual([hit(box, 'phys'), hit(box, 'arts', 1000, g), hit(box, 'true'), hit(box, 'elemental')], [0, 0, 0, 0]);
  assert.deepEqual([e.hp, counts(e)], [2500, [1, 1]], 'true and elemental are not counted');
  hit(box, 'phys', 1000, e);
  assert.deepEqual(counts(e), [2, 1], 'an enemy\'s hit counts too');
  assert.deepEqual(box.w.events.filter((x) => x.type === 'hit'), [], 'no hit event, no number');
  assert.equal(damage.dealDamage(box.w, null, e, { type: 'arts', amount: 80, hpLoss: true }, box.c), 80);
  assert.deepEqual([e.hp, counts(e)], [2420, [2, 1]], '生命流失 skips 伤判: not cancelled, not counted');
  status.applyStatus(e, 'invincible', { seconds: 1 });
  hit(box, 'phys');
  assert.deepEqual(counts(e), [2, 1], 'stopped by 无敌 before 伤判: not received');
  buffs.removeBuff(e, 'invincible');
  buffs.addBuff(e, buffs.makeBuff({ key: 'testDodge', prio: 1, mods: { dodgePhys: 1 } }));
  hit(box, 'phys');
  assert.deepEqual(counts(e), [2, 1], 'dodged by a buff before it: not received');
  buffs.removeBuff(e, 'testDodge');
  hit(box, 'phys');
  hit(box, 'phys');
  assert.deepEqual(counts(e), [4, 1]);
  hit(box, 'arts');
  hit(box, 'phys');
  assert.deepEqual([e.hp, counts(e)], [2420, [4, 1]], 'one count full: neither counts more');
});

test('[敌能-158] [元素-2] [元素-4] 元素损伤 still builds up; a damage call that passes no content is not cancelled (the engine\'s own damage carries it, 伤害-8)', () => {
  const box = open(rec()), e = box.e;
  assert.equal(elements.dealEp(box.w, e, 'FIRE', 100, null), 90, '损伤抵抗 10');
  assert.equal(e.ep.FIRE, 910);
  assert.equal(damage.dealDamage(box.w, null, e, { type: 'elemental', amount: 500, sourceless: true }), 500);
  assert.deepEqual([e.hp, counts(e)], [2000, [0, 0]]);
});

test('[敌能-158] [敌能-2] [时间-2] [帧-1] the 4th physical hit: at its next turn 2 s standing still in 原始形态, then 寻仇者形态\'s numbers for good', () => {
  const box = open(rec()), e = box.e;
  for (let i = 0; i < 4; i++) hit(box, 'phys');
  assert.equal(buffOf(e, 'translatorChange'), undefined, 'the change waits for its turn');
  run(box, 1);
  const start = box.w.frame - 1, change = /** @type {import('@aue/sim').Buff} */ (buffOf(e, 'translatorChange'));
  assert.deepEqual([change.left, change.flags], [60, { root: true }]);
  assert.deepEqual(counts(e), [null, null], 'counting is over');
  buffs.removeBuff(e, 'root');
  assert.equal(attrs.statsOf(e).immobile, true, 'standing still without the 束缚 status');
  assert.deepEqual([hit(box, 'arts'), hit(box, 'phys'), e.hp], [0, 0, 2500], 'still 原始形态: cancelled');
  status.applyStatus(e, 'stun', { seconds: 0.5 });
  assert.equal(attrs.statsOf(e).flags.stun, undefined, 'still immune');
  run(box, 59);
  assert.deepEqual([formOf(e), box.w.frame - 1 - start], [0, 59]);
  run(box, 1);
  assert.deepEqual([formOf(e), box.w.frame - 1 - start], [1, 60], 'the turn 60 frames after the one it started at');
  assert.deepEqual(['translator', 'translatorChange'].map((k) => buffOf(e, k)), [undefined, undefined]);
  assert.deepEqual(numbers(e), { maxHp: 6500, hp: 6500, atk: 600, def: 700, res: 60, moveSpeed: 1 + -0.55, bat: 2.3, massLevel: 2 });
  const s = attrs.statsOf(e);
  assert.deepEqual([s.flags.noAttack, s.flags.noDisplace, s.immobile], [undefined, undefined, false]);
  status.applyStatus(e, 'stun', { seconds: 1 });
  assert.equal(attrs.statsOf(e).flags.stun, true, 'the immunities went with 原始形态');
  assert.equal(hit(box, 'phys'), 300, 'damage lands now: 1000 − 700');
  put(box, 'guard', 1, 2);
  for (let i = 0; i < 4; i++) hit(box, 'arts');
  run(box, 120);
  assert.deepEqual([formOf(e), buffOf(e, 'translatorChange')], [1, undefined], 'only once');
  assert.equal(e.buffs.filter((b) => b.key === 'translatorForm').length, 1, 'one form buff, not one per turn');
});

test('[敌能-158] the numbers follow the blackboard: the counts, the change\'s seconds, each form\'s seven numbers', () => {
  const fu = open(rec(ALPHA, {
    Passive: { phy_max_count: 2, change: 1.5 },
    Mode_Fuchou_Passive: { max_hp: 1000, atk: 40, def: 10, magic_resistance: 5, move_speed: -0.25, base_attack_time: 0.5, mass_level: 2 },
  }));
  hit(fu, 'phys');
  run(fu, 1);
  assert.equal(buffOf(fu.e, 'translatorChange'), undefined, 'one hit of two');
  hit(fu, 'phys');
  run(fu, 45);
  assert.equal(formOf(fu.e), 0, '1.5 s is 45 frames');
  run(fu, 1);
  assert.deepEqual(numbers(fu.e), { maxHp: 3500, hp: 3500, atk: 140, def: 460, res: 45, moveSpeed: 0.75, bat: 1.5, massLevel: 3 });
  const sh = open(rec(ALPHA, { Passive: { magic_max_count: 1 }, Mode_Shushi_Passive: { max_hp: 500, atk: 50, def: 5, magic_resistance: 2, move_speed: -0.5, base_attack_time: 2, mass_level: 3 } }));
  changeBy(sh, 'arts', 1);
  assert.deepEqual([formOf(sh.e), numbers(sh.e)], [2, { maxHp: 3000, hp: 3000, atk: 150, def: 455, res: 42, moveSpeed: 0.5, bat: 3, massLevel: 4 }]);
  const yo = open(rec(ALPHA, { Mode_Youling_Passive: { ...YOULING, max_hp: 100, def: 50 } }));
  put(yo, 'guard', 1, 2);
  run(yo, 61);
  assert.deepEqual([formOf(yo.e), numbers(yo.e).maxHp, numbers(yo.e).def], [3, 2600, 500], 'the 幽灵 numbers are read too');
});

test('[敌能-158] [敌人攻击-1] 寻仇者形态 attacks only its blocker, physical, with its current attack; below half its HP 攻击力 + Mode_Fuchou_Anger.atk', () => {
  const box = open(rec()), e = box.e;
  changeBy(box, 'phys', 4);
  /** @type {{ attack: boolean, skill: boolean, type: string }[]} */
  const flags = [];
  bus.on(box.w, 'hit', (k) => { if (k.credit === e) flags.push({ attack: k.dmg.isAttack === true, skill: k.dmg.isSkill === true, type: k.dmg.type }); });
  /** @type {any[]} */
  const ev = [];
  put(box, 'sniper', 0, 2, ev);
  ev.push(...run(box, 80));
  assert.deepEqual(hitsBy(ev, e), [], 'unblocked: melee only, no attack');
  const g = put(box, 'guard', 1, 2, ev);
  ev.push(...run(box, 68));
  assert.deepEqual(hitsBy(ev, e).map((x) => [x.target, x.damage]), [[g.id, 600]], 'its blocker, 攻击力 600, at once and then every 2.3 s');
  assert.deepEqual(flags, [{ attack: true, skill: false, type: 'phys' }]);
  buffs.addBuff(e, buffs.makeBuff({ key: 'testAtk', mods: { atkFlat: 100 } }));
  assert.deepEqual(hitsBy(run(box, 69), e).map((x) => x.damage), [700], 'the current attack');
  damage.dealDamage(box.w, null, e, { type: 'true', amount: 3250 }, box.c);
  run(box, 3);
  assert.deepEqual([e.hp, buffOf(e, 'translatorAnger')], [3250, undefined], 'half is not below half');
  damage.dealDamage(box.w, null, e, { type: 'true', amount: 1 }, box.c);
  run(box, 5);
  assert.deepEqual(e.buffs.filter((b) => b.key === 'translatorAnger').map((b) => b.mods), [{ atkPct: 1 }], 'one buff, not one per frame');
  assert.equal(attrs.statsOf(e).atk, 1400, '(100 + 500 + 100) × (1 + 1)');
  damage.heal(box.w, null, e, 1);
  run(box, 1);
  assert.deepEqual([e.hp, buffOf(e, 'translatorAnger'), attrs.statsOf(e).atk], [3250, undefined, 700], 'back at half: gone');
  damage.dealDamage(box.w, null, e, { type: 'true', amount: 1 }, box.c);
  run(box, 1);
  assert.deepEqual([e.buffs.filter((b) => b.key === 'translatorAnger').length, attrs.statsOf(e).atk], [1, 1400], 'below half again: back');
  const beta = open(rec(BETA, { Mode_Fuchou_Anger: { atk: 0.6 } }), BETA);
  changeBy(beta, 'phys', 4);
  damage.dealDamage(beta.w, null, beta.e, { type: 'true', amount: 5000 }, beta.c);
  run(beta, 1);
  assert.ok(Math.abs(attrs.statsOf(beta.e).atk - 700 * 1.6) < 1e-9, 'the anger follows the blackboard');
});

test('[敌能-158] [索敌-5] [攻击-3] 特战术师形态: arts at Mode_Shushi_Passive.targets of its ranged candidates, no projectile', () => {
  for (const n of [2, 3]) {
    const box = open(rec(ALPHA, { Mode_Shushi_Passive: { targets: n } })), e = box.e;
    changeBy(box, 'arts', 4);
    /** @type {string[]} */
    const types = [];
    bus.on(box.w, 'hit', (k) => { if (k.credit === e) types.push(k.dmg.type); });
    // three snipers 1 and 1.41 tiles away, inside its 2.4 + 0.25, deployed on the same frame: its first attack is then
    const ops = [['sniper', 0, 2], ['sniper2', 0, 3], ['sniper3', 2, 2]];
    const first = step(box.w, box.c, ops.map(([op, row, col]) => /** @type {[number, any]} */ ([0, { type: 'deploy', op, row, col, dir: 0 }])));
    const ids = ops.map(([op]) => /** @type {Unit} */ (box.w.units.find((u) => u.key === op)).id);
    assert.equal(new Set(hitsBy(first, e).map((x) => x.target)).size, n, `${n} targets at once`);
    const ev = [...first, ...run(box, 121)];
    assert.ok(hitsBy(ev, e).every((x) => ids.includes(x.target) && x.damage === 400), 'arts at 攻击力 400 against 法术抗性 0');
    assert.equal(hitsBy(ev, e).length, 2 * n, 'every 4 s');
    assert.ok(types.length === 2 * n && types.every((t) => t === 'arts'));
    assert.deepEqual(ev.filter((x) => x.type === 'shot' && x.id === e.id), [], 'no projectile');
  }
});

test('[敌能-158] [阻挡-3] blocked in 原始形态: at its next turn the change, then 幽灵形态 — no attack, unblockable, let go that turn', () => {
  const box = open(rec()), e = box.e;
  /** @type {any[]} */
  const ev = [];
  const g = put(box, 'guard', 1, 2, ev);
  assert.deepEqual([e.blockedBy, buffOf(e, 'translatorChange')], [g.id, undefined], 'blocked after its turn');
  ev.push(...run(box, 1));
  assert.equal(buffOf(e, 'translatorChange')?.left, 60);
  ev.push(...run(box, 59));
  assert.deepEqual([formOf(e), e.blockedBy], [0, g.id]);
  ev.push(...run(box, 1));
  assert.deepEqual([formOf(e), e.blockedBy], [3, -1], 'let go the turn the form begins');
  const s = attrs.statsOf(e);
  assert.deepEqual([s.flags.unblockable, s.flags.noAttack], [true, true]);
  assert.deepEqual(numbers(e), { maxHp: 2500, hp: 2500, atk: 100, def: 450, res: 40, moveSpeed: 1, bat: 1, massLevel: 1 }, '无属性变化');
  ev.push(...run(box, 90));
  assert.deepEqual([hitsBy(ev, e), e.blockedBy], [[], -1], 'never attacks, never blocked again');
  assert.equal(hit(box, 'phys'), 550, 'damage lands: 1000 − 450');
});

test('[敌能-158] [阻挡-1] a block and a full count seen at the same turn: blocked first, so 幽灵; counted first, 寻仇者; silence stops none of it', () => {
  const box = open(rec()), e = box.e;
  put(box, 'guard', 1, 2);
  for (let i = 0; i < 4; i++) hit(box, 'phys');
  assert.deepEqual([e.blockedBy >= 0, counts(e)], [true, [4, 0]], 'blocked in its last turn, after that tick; the 4th hit after the block');
  run(box, 61);
  assert.equal(formOf(e), 3, '幽灵: the block came first');
  const late = open(rec());
  for (let i = 0; i < 4; i++) hit(late, 'phys');
  put(late, 'guard', 1, 2);
  assert.deepEqual([late.e.blockedBy >= 0, buffOf(late.e, 'translatorChange')?.left], [true, 60], 'the full count seen at the tick, the block after it');
  run(late, 60);
  assert.equal(formOf(late.e), 1, '寻仇者: the count came first');
  const quiet = open(rec());
  status.applyStatus(quiet.e, 'silence', { seconds: 60 });
  assert.equal(attrs.statsOf(quiet.e).flags.silence, true);
  assert.deepEqual([hit(quiet, 'arts'), counts(quiet.e)], [0, [0, 1]], 'silenced: cancelled and counted');
  changeBy(quiet, 'arts', 3);
  assert.equal(formOf(quiet.e), 2, 'silenced: the change still comes');
});

test('[敌能-158] [状态-7] [状态-5] [状态-6] a stun and a cold held off in 原始形态 take hold once the form begins; two colds stay colds while it is immune to freezing', () => {
  const box = open(rec()), e = box.e;
  status.applyStatus(e, 'stun', { seconds: 10 });
  status.applyStatus(e, 'cold', { seconds: 10 });
  const s = attrs.statsOf(e);
  assert.deepEqual([s.flags.stun, s.disabled, s.aspd], [undefined, false, 100], 'the stun and the cold\'s −30 wait');
  changeBy(box, 'phys', 4);
  assert.equal(formOf(e), 1);
  assert.deepEqual([attrs.statsOf(e).flags.stun, attrs.statsOf(e).disabled, attrs.statsOf(e).aspd], [true, true, 70], 'the immunities went with 原始形态');
  // 状态-6 with the buff's 冻结免疫 (INF-1151): two colds stay colds; they do not pair by themselves after the change
  const two = open(rec()), t = two.e;
  status.applyStatus(t, 'cold', { seconds: 10 });
  status.applyStatus(t, 'cold', { seconds: 10 });
  assert.deepEqual([t.buffs.filter((b) => b.key === 'cold').length, t.buffs.some((b) => b.key === 'freeze')], [2, false], 'two colds, no freeze');
  changeBy(two, 'arts', 4);
  assert.deepEqual([formOf(t), t.buffs.some((b) => b.key === 'freeze'), attrs.statsOf(t).disabled], [2, false, false], 'still no freeze once the form begins');
  status.applyStatus(t, 'cold', { seconds: 10 });
  assert.deepEqual([attrs.statsOf(t).flags.freeze, attrs.statsOf(t).disabled], [true, true], 'the next cold pairs: frozen');
});

test('[敌能-158] [属性-4] 寻仇者形态 is physical whatever the record\'s type; its anger waits for the form', () => {
  const box = open(/** @type {EnemyDef} */ ({ ...rec(), dmgType: 'arts' })), e = box.e;
  for (let i = 0; i < 4; i++) hit(box, 'phys');
  run(box, 1);
  assert.equal(damage.dealDamage(box.w, null, e, { type: 'true', amount: 2000, hpLoss: true }, box.c), 2000, '生命流失 in the change');
  run(box, 59);
  assert.deepEqual([formOf(e), e.hp, buffOf(e, 'translatorAnger')], [0, 500, undefined], 'below half, but no anger in 原始形态');
  run(box, 1);
  assert.deepEqual([formOf(e), e.hp, e.maxHp], [1, 1300, 6500], 'the ratio kept: 500 / 2500 = 1300 / 6500');
  assert.equal(attrs.statsOf(e).atk, 1200, 'the anger at the form\'s first turn: (100 + 500) × 2');
  /** @type {string[]} */
  const types = [];
  bus.on(box.w, 'hit', (k) => { if (k.credit === e) types.push(k.dmg.type); });
  put(box, 'guard', 1, 2);
  assert.deepEqual(types, ['phys'], 'the page\'s 物理伤害, not the record\'s arts');
});
