// Shared names by their shapes (docs/spec/foes.md 敌能-153, 关卡-2): per name, the shape its behaviour implements stays
// covered — through a shipped level's record where one has it —, the other shapes and the unmarked holders of a
// marked shape are not, text where a number belongs does not pass, and the shapes that used to throw are left out of
// a level being tested instead (关卡-8). Records not in a shipped level are built from enemy_database (ArknightsGameData
// 17759cc8, level 0). 术师囚犯's liberated attack takes `attack@max_target` targets. No shipped level's enemy has a
// shape these checks leave out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, status, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { foeBehaviors, withFoeExtras, withoutIncomplete, uncoveredAbilities } from '../src/foes.js';
import { levelAt, LEVELS } from '../src/levels.js';
import { sharedShapeOwns } from '../src/shapes.js';
import { broodShape } from '../src/catapult.js';
import { evadeOwns } from '../src/evade.js';
import { whipOwns } from '../src/whip.js';
import act07 from '../data/levels/act1multi_07.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

/** A record with these talents and skills. @param {Record<string, any>} [talents] @param {any[]} [skills] @returns {EnemyDef} */
const foe = (talents = {}, skills = []) => ({ name: 'e', maxHp: 1000, atk: 100, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 1, talents, skills });
/** A skill of this name and blackboard. @param {string} key @param {Record<string, any>} bb */
const skill = (key, bb) => ({ key, cooldown: 0, initCooldown: 0, sp: 0, bb });
/** @param {EnemyDef} def */
const gaps = (def) => uncoveredAbilities([def]);
/** One enemy of a shipped level at NORMAL, with its extras as levelAt checks it. @param {string} id @param {string} key */
const shipped = (id, key) => withFoeExtras(key, levelAt(id, 'NORMAL').enemies[key]);
/** The blackboard of a talent or skill of a record. @param {EnemyDef} e @param {string} name */
const bbOf = (e, name) => e.talents?.[name] ?? e.skills?.find((s) => s.key === name)?.bb;

/**
 * The tiny map with the given enemies (keys of `enemies`) spawned at once and rooted at (1, 1), and quiet snipers
 * (防御力 0, 法术抗性 50) deployed on the high ground at `seats`; `first` is the deploy frame's events.
 * @param {Record<string, any>} enemies @param {string[]} keys @param {[number, number][]} [seats]
 */
function arena(enemies, keys, seats = []) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = enemies;
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(keys.map((k) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  seats.forEach((_, i) => { c.operators[`s${i}`] = { ...c.operators.sniper, name: `s${i}`, cost: 0, atk: 0, maxHp: 1e7, def: 0, res: 50 }; });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  for (const e of w.units.filter((u) => u.kind === KIND.ENEMY)) { e.x = 1; e.y = 1; status.applyStatus(e, 'root', {}); }
  const first = seats.length ? step(w, c, seats.map(([row, col], i) => [0, { type: 'deploy', op: `s${i}`, row, col, dir: 0 }])) : [];
  return { c, w, first };
}

/** @param {World} w @param {string} key */
const unitsOf = (w, key) => w.units.filter((u) => u.key === key);

test('[敌能-153] Reborn: with hp_ratio it needs a duration; “死志的凝结” is refused, and a level being tested drops it instead of throwing', () => {
  const avenger = shipped('act1multi_hard-02', 'enemy_1539_reid');
  assert.deepEqual([gaps(avenger), Object.keys(bbOf(avenger, 'Reborn') ?? {}).sort()], [[], ['duration', 'hp_ratio', 'invincible']]);
  assert.deepEqual(gaps(shipped('act1multi_tr02', 'enemy_4025_muhrym')), [], 'a player\'s duration-only Reborn is 足球-9\'s');
  const will = { reborn_duration: 10, hp_ratio: 0.01, max_hp_ratio: 1, 'attack@attack_trigger_cnt': 6, 'attack@atk_scale': 0.5 };
  assert.deepEqual(gaps(foe({ Reborn: will })), ['Reborn']);
  assert.deepEqual(gaps(foe({ Reborn: { hp_ratio: 0.5, duration: '0.5' } })), ['Reborn'], 'text is no duration');
  assert.deepEqual(gaps(foe({ Reborn: { hp_ratio: 0.5, duration: 0.5 } })), [], '血骑士\'s once-revival');
  const { c, w } = arena({ will: withoutIncomplete(foe({ Reborn: will })) }, ['will']);
  const [e] = unitsOf(w, 'will');
  e.hp = 0;
  assert.doesNotThrow(() => { step(w, c); step(w, c); });
  assert.equal(unitsOf(w, 'will').length, 0, 'knocked down for good');
});

test('[敌能-153] StartRun: only block_free_time with move_speed; the other skills and the talent are refused, and do not throw below half', () => {
  const run = (/** @type {Record<string, any>} */ bb) => foe({}, [skill('StartRun', bb)]);
  assert.deepEqual(gaps(run({ move_speed: 1.5, block_free_time: 3 })), [], '简饲源石虫, 精饲源石虫');
  for (const bb of [{ move_speed: 1.5, unmove_duration: 2 }, { move_speed: 1.5, unmove_duration: 2, enemy_key: 'enemy_10002_trtrsl_2' }, {}, { move_speed: 1.5, block_free_time: '3' },
    { move_speed: 1.5, block_free_time: 3, unmove_duration: 2 }]) {
    assert.deepEqual(gaps(run(bb)), ['StartRun'], JSON.stringify(bb));
  }
  assert.deepEqual(gaps(foe({ StartRun: { move_speed: 1, duration: 2 } })), ['StartRun'], '晶玲兽\'s talent');
  const golem = withoutIncomplete(run({ move_speed: 1.5, unmove_duration: 2 }));
  const { c, w } = arena({ golem, slug: run({ move_speed: 1.5, block_free_time: 2 }) }, ['golem', 'slug']);
  for (const u of w.units.filter((x) => x.kind === KIND.ENEMY)) u.hp = 400;
  assert.doesNotThrow(() => { step(w, c); step(w, c); });
  const [slug] = unitsOf(w, 'slug');
  const buff = slug.buffs.find((b) => b.key === 'run');
  assert.deepEqual([buff?.mods?.movePct, buff?.flags?.unblockable, unitsOf(w, 'golem')[0].buffs.some((b) => b.key === 'run')], [1.5, true, false]);
  assert.equal(buff?.left, 59, '2 s = 60 frames, placed on the frame before');
});

test('[敌能-153] Devour: the plant and the marked blocker devour stay; unmarked empty skills and the other shapes are refused', () => {
  for (const key of ['enemy_1271_nhkodo', 'enemy_1271_nhkodo_2']) {
    const e = shipped('act1multi_rm07', key);
    assert.deepEqual([gaps(e), bbOf(e, 'Devour')], [[], { page: 1 }], key);
  }
  assert.deepEqual(gaps(shipped('act1football_sub-1-2', 'enemy_1271_nhkodo_2')), []);
  const plant = shipped('act1football_03', 'enemy_10003_trwlpl_2');
  assert.deepEqual([gaps(plant), bbOf(plant, 'Devour')], [[], { plant: 1 }]);
  assert.deepEqual(gaps(levelAt('act1multi_rm07', 'NORMAL').enemies.enemy_1271_nhkodo), ['Devour'], 'no marker without the extras');
  const others = [foe({}, [skill('Devour', {})]), foe({ Devour: { hp_ratio: 0.1 } }), foe({ Devour: { counter_stack: 5, buff_stack: 4, atk: 0.4, hp_ratio: 0.15 } }),
    foe({}, [skill('Devour', { max_stack_cnt: 3, level_capacity: 1, max_hp: 0.3, def: 0.3, range_radius: 1.2 })]),
    foe({}, [skill('Devour', { duration: 30, range_radius: 1.5, direction: 1, hp_ratio: 0.3 })]),
    foe({}, [skill('Devour', { page: '1' })]), foe({}, [skill('Devour', { page: 2 })]), foe({}, [skill('Devour', { page: 1, hp_ratio: 0.1 })])];
  for (const e of others) assert.deepEqual(gaps(e), ['Devour'], JSON.stringify(e.talents) + JSON.stringify(e.skills));
});

test('[敌能-153] Summon: only the three read death summons; the skills of the same keys are refused; the marked one still summons on death', () => {
  const dseed = { cnt: 2, enemy_key: 'enemy_1367_dseed' };
  for (const key of ['enemy_1364_spnaxe', 'enemy_1364_spnaxe_2', 'enemy_1360_dfello']) {
    const e = withFoeExtras(key, foe({ Summon: { ...dseed } }));
    assert.deepEqual([gaps(e).includes('Summon'), bbOf(e, 'Summon')], [false, { ...dseed, page: 1 }], key);
  }
  assert.deepEqual(gaps(foe({ Summon: { ...dseed } })), ['Summon'], 'no marker');
  for (const bb of [{ cnt: 2, enemy_key: 'enemy_18002_lhbetl' }, { cnt: 1, enemy_key: 'enemy_18004_lhbmom' }, { enemy_key: 'enemy_2069_skzbox', cnt: 3 }]) {
    assert.deepEqual(gaps(foe({}, [skill('Summon', bb)])), ['Summon'], `the skill ${bb.enemy_key}`);
  }
  for (const bb of [{ cnt: '2', enemy_key: 'x', page: 1 }, { cnt: 2, enemy_key: 7, page: 1 }, { cnt: 2, enemy_key: '', page: 1 }, { cnt: 2, enemy_key: 'x', page: '1' }]) {
    assert.deepEqual(gaps(foe({ Summon: bb })), ['Summon'], JSON.stringify(bb));
  }
  assert.equal(whipOwns('Summon', { cnt: 2, enemy_key: 'x', page: 1 }), true, 'whip.js lets the marker ride along');
  const own = [{ cnt: 2, enemy_key: 7, page: 1 }, { cnt: 2, enemy_key: '', page: 1 }, { cnt: 2, enemy_key: 'x', page: 1, duration: 5 }].map((bb) => sharedShapeOwns('Summon', bb));
  assert.deepEqual(own, [false, false, false], 'a name, as text, and no other key (whip.js checks the same)');
  for (const cnt of [2, 3]) {
    const seed = { name: 'seed', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 0 };
    const { c, w } = arena({ whip: foe({ Summon: { cnt, enemy_key: 'seed', page: 1 } }), skill: withoutIncomplete(foe({}, [skill('Summon', { cnt, enemy_key: 'seed' })])), seed }, ['whip', 'skill']);
    for (const u of w.units.filter((x) => x.kind === KIND.ENEMY)) u.hp = 0;
    step(w, c);
    assert.equal(unitsOf(w, 'seed').length, cnt, 'the marked talent\'s count; the unmarked skill is left out');
  }
});

test('[敌能-153] Evade: 裹骸死士\'s marked prob stays and still dodges both; the unread holders of the same prob are refused', () => {
  const skull = shipped('act1football_04', 'enemy_1419_mmcike');
  assert.deepEqual([gaps(skull), bbOf(skull, 'Evade')], [[], { prob: 0.4, page: 1 }]);
  for (const prob of [0.4, 0.8]) assert.deepEqual(gaps(foe({ Evade: { prob } })), ['Evade'], '不法分子, 深溟猎食者, 震风虫');
  for (const bb of [{ prob: '0.4', page: 1 }, { prob: 0.4, page: '1' }, { prob: 0.4, page: 1, duration: 3 }]) assert.deepEqual(gaps(foe({ Evade: bb })), ['Evade'], JSON.stringify(bb));
  assert.deepEqual(gaps(foe({ PhysicalEvade: { prob: 0.4 } })), [], '飞鞋党 is not this name');
  assert.deepEqual(gaps(foe({ PhysicalEvade: { prob: 0.4, duration: 3 } })), ['PhysicalEvade'], 'evade.js lets only the marker ride along');
  assert.deepEqual([evadeOwns('Evade', { prob: 0.4, page: 1 }), sharedShapeOwns('Evade', { prob: 0.4, page: 1, duration: 3 })], [true, false]);
  const { w } = arena({ a: foe({ Evade: { prob: 0.25, page: 1 } }), b: foe({ Evade: { prob: 0.6, page: 1 } }) }, ['a', 'b']);
  const mods = (/** @type {string} */ k) => unitsOf(w, k)[0].buffs.find((b) => b.key === 'evade')?.mods;
  assert.deepEqual([mods('a'), mods('b')], [{ dodgePhys: 0.25, dodgeArts: 0.25 }, { dodgePhys: 0.6, dodgeArts: 0.6 }]);
});

test('[敌能-153] Attack: 投嗣育母\'s marked brood stays; 责罚者 and 惩戒者 of the same key are refused; the other shapes are as before', () => {
  const mother = shipped('act1football_03', 'enemy_2023_sypult');
  assert.deepEqual([gaps(mother), bbOf(mother, 'Attack')], [[], { enemy_key: 'enemy_2024_synut', page: 1 }]);
  assert.deepEqual(gaps(shipped('act1football_03', 'enemy_10162_mnctpt')), [], '自制投石机');
  for (const k of ['enemy_1221_dzomg', 'enemy_5050_dqomg']) assert.deepEqual(gaps(foe({ Attack: { enemy_key: k } })), ['Attack'], k);
  for (const bb of [{ enemy_key: 'x', page: '1' }, { enemy_key: 7, page: 1 }, { enemy_key: 'x', page: 1, cnt: 1 }]) assert.deepEqual(gaps(foe({ Attack: bb })), ['Attack'], JSON.stringify(bb));
  assert.deepEqual(gaps(foe({ Attack: { def: 200, duration: 10 } })), [], '固海凿石者 (敌能-87)');
  assert.deepEqual([broodShape({ enemy_key: 'x', page: 1 }), broodShape({ enemy_key: 'x' }), broodShape({ enemy_key: 'x', page: 1, cnt: 1 })], [true, true, false]);
  assert.equal(sharedShapeOwns('Attack', { enemy_key: 7, page: 1 }), false, 'a name, as text');
});

test('[敌能-153] atkup: 凿冰人\'s marked atk_scale stays with its frozen 倍率; the unread holders of a bare atk_scale are refused; the other shapes stay', () => {
  const breaker = shipped('act1multi_rm07', 'enemy_1069_icebrk');
  assert.deepEqual([gaps(breaker), bbOf(breaker, 'atkup')], [[], { atk_scale: 2.5, page: 1 }]);
  assert.deepEqual(gaps(shipped('act1multi_rm07', 'enemy_1193_krgbsk_2')), [], 'the [frozen] key');
  for (const k of [1.5, 1.8]) assert.deepEqual(gaps(foe({ atkup: { atk_scale: k } })), ['atkup'], '狂徒, “盛怒”, 雪怪小队 …');
  for (const bb of [{ atk_scale: '2.5', page: 1 }, { atk_scale: 2.5, page: 1, hp_ratio: 0.5 }]) assert.deepEqual(gaps(foe({ atkup: bb })), ['atkup'], JSON.stringify(bb));
  for (const bb of [{ atk: 0.5 }, { atk: 0.5, hp_ratio: 0.5 }]) assert.deepEqual(gaps(foe({ atkup: bb })), [], JSON.stringify(bb));
  const ctx = /** @type {any} */ ({ bb: { atk_scale: 1.7, page: 1 } });
  assert.equal(foeBehaviors.atkup.attack?.(ctx, /** @type {any} */ ({ scale: 1 })).frozen, 1.7, 'the marker is not read');
});

/** Exact shapes (敌能-153): a kept record of a shipped level (or the data), the refused shapes, a text value, a key besides. */
const EXACT = [
  { name: 'strength', kept: [['act1multi_rm07', 'enemy_1080_sotidp'], ['act1multi_rm07', 'enemy_1078_sotisc'], ['act1multi_rm07', 'enemy_1082_soticn']], dropped: [{ atk: 0.5 }, { atk: 0.1, def: '100' }, { atk: 0.1, def: 100, move_speed: 0.3 }] },
  { name: 'Resist', kept: [['act1multi_rm07', 'enemy_1192_krgscr']], dropped: [{ damage_resistance: 0.5 }, { damage_resistance: 0.05, max_stack_cnt: 3 }, { max_stack_cnt: 3 }] },
  { name: 'taunt', kept: [['act1multi_rm07', 'enemy_1081_sotisd']], dropped: [{ value: 300 }, { taunt_level: '1' }, { taunt_level: 1, value: 300 }] },
  { name: 'deathrattle', kept: [['act1multi_rm07', 'enemy_1131_sbeast_2'], ['act1multi_rm07', 'enemy_1226_dklord']], dropped: [{ cnt: 5 }, { cnt: 1, enemy_key: 7 }, { enemy_key: '' }] },
  { name: 'Bomb', skill: true, kept: [['act1multi_01', 'enemy_1405_boomer_2']], dropped: [{}, { atk_scale: 2, projectile_range: '1.1' }, { atk_scale: 2, projectile_range: 1.1, duration: 1 }] },
  { name: 'Awake', skill: true, kept: [['act1multi_rm07', 'enemy_1073_dscout']], dropped: [{}, { atk: '0.3', def: 0.3 }, { atk: 0.3 }, { atk: 0.3, def: 0.3, hp_ratio: 0.5 }] },
  { name: 'Bus', kept: [['act1multi_06', 'enemy_1302_ymtro'], ['act1multi_06', 'enemy_1302_ymtro_2']], dropped: [{ enemy_key: 'enemy_1344_ddlamb', max_cnt: 1, mode: 0 }, { max_cnt: '4' }] },
  { name: 'run', data: { 'attack@move_speed': 4 }, dropped: [{ 'attack@move_speed': 4, run_duration: 5 }, { 'attack@move_speed': '4' }] },
  { name: 'revive', kept: [['act1multi_rm07', 'enemy_1074_dbskar'], ['act1multi_rm07', 'enemy_1075_dmgswd']],
    dropped: [{ move_speed: 5, hp_ratio: 0.04 }, { hp_ratio: 0.999, unmove_duration: '150', move_speed: 2 }, { hp_ratio: 0.999, unmove_duration: 150, move_speed: 2, duration: 1 }] },
];

test('[敌能-153] strength, Resist, taunt, deathrattle, Bomb, Awake, Bus, run, revive: the implemented shape stays, the others and text are refused', () => {
  for (const { name, skill: isSkill, kept = [], data, dropped } of EXACT) {
    const as = (/** @type {Record<string, any>} */ bb) => (isSkill ? foe({}, [skill(name, bb)]) : foe({ [name]: bb }));
    for (const [id, key] of kept) assert.deepEqual(gaps(shipped(id, key)), [], `${name}: ${id} ${key}`);
    if (data) assert.deepEqual(gaps(as(data)), [], `${name}: the data's shape`);
    for (const bb of dropped) assert.deepEqual(gaps(as(bb)), [name], `${name}: ${JSON.stringify(bb)}`);
  }
  assert.equal(sharedShapeOwns('boom', { anything: 'x' }), true, 'another name is not this check\'s');
});

/**
 * 术师囚犯 (act1multi_07's record, `attack@max_target` as given) rooted on the road with three quiet snipers in reach:
 * the number of targets of each of its swings, in order (`swung`), and the damage of each of its hits (`dealt`).
 * @param {number | string | undefined} most @param {number} frames
 */
function swings(most, frames) {
  const base = /** @type {any} */ (act07).enemies.enemy_1120_vofwiz, liberty = { ...base.talents.liberty, 'attack@max_target': most };
  if (most === undefined) delete liberty['attack@max_target'];
  const mage = withFoeExtras('enemy_1120_vofwiz', { ...base, talents: { ...base.talents, liberty } });
  const { c, w, first } = arena({ enemy_1120_vofwiz: mage }, ['enemy_1120_vofwiz'], [[0, 2], [2, 2], [0, 3]]);
  const [e] = unitsOf(w, 'enemy_1120_vofwiz'), swung = [], dealt = [];
  for (let i = 0, evs = first; i <= frames; i++, evs = step(w, c)) {
    const n = evs.filter((ev) => ev.type === 'attack' && ev.id === e.id).length;
    if (n > 0) swung.push(n);
    for (const ev of evs) if (ev.type === 'hit' && ev.id === e.id) dealt.push(ev.damage);
  }
  return { swung, dealt };
}

test('[敌能-153] liberty: 术师囚犯 liberated attacks attack@max_target targets at once, from the attack that frees it; confined, one', () => {
  assert.deepEqual(gaps(withFoeExtras('enemy_1120_vofwiz', /** @type {any} */ (act07).enemies.enemy_1120_vofwiz)), []);
  const two = swings(2, 1500);
  assert.deepEqual(two.swung.slice(0, 6), [1, 1, 1, 2, 2, 2], 'the data\'s 2, from the 4th attack');
  // still physical (敌能-1: the handbook's NO_DAMAGE; the page's 法术伤害 is not done): 攻击力 300, +50 % once liberated
  assert.deepEqual(two.dealt.slice(0, 7), [300, 300, 300, 450, 450, 450, 450], 'the snipers\' 防御力 0, 法术抗性 50');
  assert.deepEqual(swings(3, 1500).swung.slice(0, 6), [1, 1, 1, 3, 3, 3], 'the blackboard\'s number');
  assert.deepEqual(swings(undefined, 1500).swung.slice(0, 6), [1, 1, 1, 1, 1, 1], 'without it, one as before');
  assert.deepEqual(gaps(foe({ liberty: { atk: 0.5, 'attack@max_target': '2' } })), ['liberty']);
  assert.deepEqual(gaps(shipped('act1multi_hard-02', 'enemy_1121_lifbos_2')), [], '传奇重犯 as before');
});

/**
 * Every enemy a shipped level spawns at a difficulty — the records levelAt checks (关卡-2), with their extras — passes
 * these checks: so this clause takes no talent or skill out of a shipped level, and no level assembles, refuses or lists
 * otherwise because of it, whatever else covers or uncovers their abilities. A level its runes refuse is refused before
 * its enemies are read; a row only in a level's reference table is not spawned.
 */
test('[敌能-153] every talent and skill of the enemies each shipped level spawns passes these checks: no shipped level loses one', () => {
  let read = 0;
  for (const id of Object.keys(LEVELS)) {
    for (const d of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
      /** @type {string[]} */
      let keys;
      try { keys = Object.keys(levelAt(id, d).enemies); } catch (err) { assert.match(String(err), /runes not supported yet/, `${id} ${d}`); continue; }
      for (const key of keys) {
        const e = withFoeExtras(key, /** @type {EnemyDef} */ (LEVELS[/** @type {keyof typeof LEVELS} */ (id)].enemies[key]));
        const abilities = [...Object.entries(e.talents ?? {}), ...(e.skills ?? []).map((s) => /** @type {[string, Record<string, unknown>]} */ ([s.key, s.bb]))];
        for (const [name, bb] of abilities) {
          read++;
          assert.ok(sharedShapeOwns(name, bb ?? {}), `${id} ${d}: ${key}'s ${name} ${JSON.stringify(bb)}`);
        }
      }
    }
  }
  assert.equal(Object.keys(LEVELS).length, 26);
  assert.ok(read > 400, `${read} abilities read`);
});
