// 家族灭迹人 and 家族暗影灭迹人 (docs/spec/foes.md 敌能-154): their page rows — 敌能-131's Stealth with the page's 1 s,
// 敌能-33's noFly and the marker on Passive —, the read shape of `Passive`, the 隐匿 from spawn that comes back 1 s after a
// block, 反隐 and silence, noFly, and the 清算时刻 numbers that change nothing. Neither is in a shipped level, so the records
// are enemy_database's level 0 (ArknightsGameData 17759cc8), built here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, attrs, status, buffs, targeting } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, LEVELS } from '../src/index.js';
import { FOE_EXTRAS, withFoeExtras, uncoveredAbilities, withoutIncomplete } from '../src/foes.js';
import { eraserShape } from '../src/eraser.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const KEY = 'enemy_1283_sgkill';
const SHADOW = 'enemy_1283_sgkill_2';
/** Both records' Passive (enemy_database 17759cc8, level 0). */
const DATA = Object.freeze({ attack_speed: 50, atk: 0.15, def: 0.15, max_stack_cnt: 5 });
/** What the page rows add (敌能-154). */
const ROW = Object.freeze({ Passive: { page: 1 }, Stealth: { restore: 1 }, noFly: {} });

/**
 * The enemy_database record (level 0) before the page row, `passive` over the data's Passive.
 * @param {string} key @param {Record<string, unknown>} [passive] @returns {EnemyDef}
 */
function raw(key, passive = {}) {
  const shadow = key === SHADOW;
  return /** @type {EnemyDef} */ ({
    name: shadow ? '家族暗影灭迹人' : '家族灭迹人', maxHp: shadow ? 18000 : 12000, atk: shadow ? 1050 : 800, def: 800, res: 45, moveSpeed: 0.9,
    baseAttackTime: 3, rangeRadius: 1.8, applyWay: 'RANGED', motion: 'WALK', massLevel: 3, levelType: 'ELITE', lifePointReduce: 1,
    talents: { Passive: { ...DATA, ...passive } },
  });
}

/**
 * As a level assembles it — the page row merged (FOE_EXTRAS) —, then `passive` over its Passive and `stealth` over its
 * Stealth.
 * @param {string} [key] @param {Record<string, unknown>} [passive] @param {Record<string, unknown>} [stealth] @returns {EnemyDef}
 */
function eraser(key = KEY, passive = {}, stealth = {}) {
  const d = withFoeExtras(key, raw(key)), t = d.talents ?? {};
  return { ...d, talents: { ...t, Passive: /** @type {Record<string, number>} */ ({ ...t.Passive, ...passive }), Stealth: /** @type {Record<string, number>} */ ({ ...t.Stealth, ...stealth }) } };
}

/** The read record without one key of its Passive. @param {string} drop @returns {EnemyDef} */
function less(drop) {
  const d = eraser(), p = { ...d.talents?.Passive };
  delete p[drop];
  return { ...d, talents: { ...d.talents, Passive: p } };
}

/**
 * The tiny map, the enemy standing rooted on the road at (row 1, col 2); ours cost nothing, have no attack or defence and
 * a million HP, `g2` a second guard. `tweak` runs before the world exists.
 * @param {string} key @param {EnemyDef} def @param {(c: any) => void} [tweak] @param {number} [players]
 */
function open(key, def, tweak, players = 1) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators.g2 = { ...c.operators.guard, name: 'g2' };
  c.operators.sniper2 = { ...c.operators.sniper, name: 'sniper2' };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, atk: 0, def: 0, maxHp: 1e6 });
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === key));
  const spawned = e.buffs.map((b) => b.key);
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  return { c, w, e, spawned };
}

/** Steps n frames, the events collected. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) out.push(...step(w, c));
  return out;
}
/** Deploys one of ours. @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col */
function put(w, c, op, row, col) {
  step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
  return /** @type {Unit} */ (w.units.find((u) => u.key === op));
}
/** Its restore window (索敌-2) for Stealth's source (敌能-131), if one runs. @param {Unit} e */
const windowOf = (e) => e.buffs.find((b) => b.key === 'stealthOff:lurk');
/** Its 隐匿 sources, key and delay. @param {Unit} e */
const sources = (e) => e.buffs.filter((b) => b.flags.stealth).map((b) => [b.key, b.restore]);
/** @param {any[]} ev @param {Unit} e */
const hitsBy = (ev, e) => ev.filter((x) => x.type === 'hit' && x.id === e.id);

/**
 * The enemy with `restore` seconds blocked by the guard deployed on its tile: the 隐匿 off, the buff still there.
 * @param {string} key @param {number} seconds
 */
function held(key, seconds) {
  const box = open(key, eraser(key, {}, { restore: seconds }));
  const g = put(box.w, box.c, 'guard', 1, 2);
  assert.equal(box.e.blockedBy, g.id);
  assert.equal(targeting.stealthed(box.e), false, 'blocked: no 隐匿');
  assert.equal(attrs.statsOf(box.e).flags.stealth, true, 'the buff stays');
  return { ...box, g };
}

test('[敌能-154] the page rows add Stealth with restore 1, noFly and the Passive marker; only the read shape is covered', () => {
  for (const [key, oldid] of /** @type {const} */ ([[KEY, 365973], [SHADOW, 365974]])) {
    assert.deepEqual(FOE_EXTRAS[key]?.talents, ROW);
    assert.ok(FOE_EXTRAS[key]?.source.endsWith(`&oldid=${oldid}`));
    assert.deepEqual(withFoeExtras(key, raw(key)).talents, { Passive: { ...DATA, page: 1 }, Stealth: { restore: 1 }, noFly: {} }, 'one row: three talents');
    assert.deepEqual(uncoveredAbilities([eraser(key)]), []);
    assert.deepEqual(uncoveredAbilities([raw(key)]), ['Passive'], 'not without the page');
    assert.deepEqual(withoutIncomplete(raw(key)).talents, {}, 'left out of a tested record');
  }
  for (const k of ['attack_speed', 'atk', 'def', 'max_stack_cnt', 'page']) {
    assert.deepEqual(uncoveredAbilities([less(k)]), ['Passive'], `without ${k}`);
    assert.deepEqual(uncoveredAbilities([eraser(KEY, { [k]: String(eraser().talents?.Passive?.[k]) })]), ['Passive'], `a text ${k}`);
  }
  assert.deepEqual(uncoveredAbilities([eraser(KEY, { extra: 1 })]), ['Passive'], 'a key more');
  // neither is in a shipped level (both pages name only levels the engine has not extracted)
  for (const lv of Object.values(LEVELS)) assert.equal([KEY, SHADOW].some((k) => Object.hasOwn(lv.enemies ?? {}, k)), false, lv.level?.id);
});

/** The name's other 49 users and their Passive (enemy_database 17759cc8, level 0). */
const OTHERS = /** @type {Readonly<Record<string, Record<string, number | string>>>} */ (Object.freeze({
  enemy_10081_mpplai: { phy_max_count: 4, magic_max_count: 4 }, enemy_10081_mpplai_2: { phy_max_count: 4, magic_max_count: 4 },
  enemy_10146_nscola: { 'enemy_nscola[speed].move_speed': 0.3, fixed_value_damage: 120, 'enemy_nscola[speed].max_time': 25, 'enemy_nscola[speed].interval': 0.5 },
  enemy_10146_nscola_2: { 'enemy_nscola[speed].move_speed': 0.3, fixed_value_damage: 120, 'enemy_nscola[speed].max_time': 25, 'enemy_nscola[speed].interval': 0.5 },
  enemy_10147_nsbomb: { interval: 2.5, range_radius: 1, atk_scale: 2 }, enemy_10147_nsbomb_2: { interval: 2.5, range_radius: 1, atk_scale: 2 },
  enemy_10148_nsmos: { range_radius: 1.5 }, enemy_10148_nsmos_2: { range_radius: 1.5 },
  enemy_10149_nscan: { 'enemy_nscan[speed].move_speed': 0.5, fixed_value_damage: 250, 'enemy_nscan[speed].max_time': 25, 'enemy_nscan[speed].interval': 0.5, 'attack@atk_scale_speed': 500 },
  enemy_10149_nscan_2: { 'enemy_nscan[speed].move_speed': 0.5, fixed_value_damage: 250, 'enemy_nscan[speed].max_time': 25, 'enemy_nscan[speed].interval': 0.5, 'attack@atk_scale_speed': 700 },
  enemy_10150_nsheat: { force: 1 }, enemy_10150_nsheat_2: { force: 1 }, enemy_10153_nsblon: { force: 1 }, enemy_10153_nsblon_2: { force: 1 },
  enemy_10154_mnmblx: { taunt_level: 1 },
  enemy_1256_lyacpa: { 'attack@ranged.atk_scale': 0.5 }, enemy_1256_lyacpa_2: { 'attack@ranged.atk_scale': 0.5 },
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
/** The ones this branch's base covers: R-11 and R-11a with their page cap (敌能-68), 血珀 (敌能-63), 龙卷风 (锦标-2). */
const BASE_COVERED = ['enemy_1256_lyacpa', 'enemy_1256_lyacpa_2', 'enemy_1367_dseed', 'enemy_4067_mucycl'];

test('[敌能-154] the name\'s 49 other users: none is this shape, with its own row or with the marker, so their coverage stays', () => {
  assert.equal(Object.keys(OTHERS).length, 49);
  /** @param {string} key @param {Record<string, number | string>} bb */
  const passive = (key, bb) => /** @type {Record<string, unknown>} */ (withFoeExtras(key, /** @type {any} */ ({ name: key, maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { Passive: bb } })).talents?.Passive);
  for (const [key, bb] of Object.entries(OTHERS)) {
    assert.equal(eraserShape(passive(key, bb)), false, key);
    assert.equal(eraserShape({ ...passive(key, bb), page: 1 }), false, `${key} with the marker`);
  }
  const covered = (/** @type {string} */ key) => !uncoveredAbilities([withFoeExtras(key, /** @type {any} */ ({ name: key, maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { Passive: OTHERS[key] } }))]).includes('Passive');
  for (const key of BASE_COVERED) assert.equal(covered(key), true, key);
  assert.equal(covered('enemy_15090_dqacpa'), false, '神射机甲: R-11\'s scale without the page cap (敌能-68)');
  // with no Passive row of their own, only the shapes whole in the data are covered: 血珀 (敌能-63) and 龙卷风 (锦标-2)
  const unread = Object.keys(OTHERS).filter((key) => FOE_EXTRAS[key]?.talents?.Passive === undefined);
  assert.deepEqual(unread.filter(covered), ['enemy_1367_dseed', 'enemy_4067_mucycl']);
  assert.equal(eraserShape({ ...DATA, page: 1 }), true, 'the read shape itself');
});

test('[敌能-154] 隐匿 from spawn, Stealth\'s one buff for good with the row\'s 1 s: not selectable, and silence leaves it', () => {
  for (const key of [KEY, SHADOW]) {
    const { c, w, e, spawned } = open(key, eraser(key));
    assert.deepEqual(spawned, ['lurk'], 'Stealth\'s buff, and nothing from Passive');
    assert.deepEqual(sources(e), [['lurk', 30]], '1 s is 30 frames (时间-2)');
    assert.equal(e.buffs.find((b) => b.key === 'lurk')?.left, -1, 'no end (状态-1): it holds until it leaves');
    assert.equal(targeting.stealthed(e), true);
    assert.equal(targeting.selectable(e), false);
    assert.equal(targeting.selectable(e, { canHitStealth: true }), true, 'what sees 隐匿 still selects it (职业-31)');
    status.applyStatus(e, 'silence', { seconds: 10 });
    run(w, c, 60);
    assert.equal(attrs.statsOf(e).flags.silence, true);
    assert.equal(targeting.stealthed(e), true, 'silenced, still hidden');
    assert.deepEqual(sources(e), [['lurk', 30]], 'still one, not one a frame');
  }
});

test('[敌能-154] no seat\'s sniper shoots it while the 隐匿 holds; blocked by any seat\'s guard, they do', () => {
  for (const [players, shooter, blocker] of [[1, 0, 0], [2, 1, 1], [2, 1, 0]]) {
    const { c, w, e } = open(KEY, eraser(), (cc) => { cc.operators.sniper.atk = 100; }, players);
    /** @param {number} seat @param {string} op @param {number} row @param {number} col */
    const deploy = (seat, op, row, col) => {
      step(w, c, [[seat, { type: 'deploy', op, row, col, dir: 0 }]]);
      return /** @type {Unit} */ (w.units.find((u) => u.key === op && u.owner === seat));
    };
    const s = deploy(shooter, 'sniper', 2, 2);
    const shotAt = (/** @type {any[]} */ ev) => ev.filter((x) => (x.type === 'shot' || x.type === 'hit') && x.id === s.id && x.target === e.id).length;
    assert.equal(shotAt(run(w, c, 90)), 0, `hidden, not a target (${players} seats)`);
    const g = deploy(blocker, 'guard', 1, 2);
    assert.equal(e.blockedBy, g.id);
    assert.ok(shotAt(run(w, c, 90)) > 0, `blocked by seat ${blocker}'s guard, a target of seat ${shooter}'s sniper`);
  }
});

test('[敌能-154] released, the 隐匿 comes back `restore` s later — 1 s is 30 frames, not 索敌-2\'s 90 — on both release paths', () => {
  for (const [key, seconds] of /** @type {const} */ ([[KEY, 1], [KEY, 2.5], [SHADOW, 1]])) {
    const n = secondsToFrames(seconds);
    // a retreat lets go before 状态结算: that frame is one of them (索敌-2)
    const a = held(key, seconds);
    step(a.w, a.c, [[0, { type: 'retreat', unit: a.g.id }]]);
    assert.equal(a.e.blockedBy, -1);
    assert.equal(windowOf(a.e)?.left, n - 1, `${key} ${seconds} s`);
    run(a.w, a.c, n - 2);
    assert.deepEqual([windowOf(a.e)?.left, targeting.stealthed(a.e)], [1, false]);
    step(a.w, a.c);
    assert.deepEqual([windowOf(a.e), targeting.stealthed(a.e)], [undefined, true]);
    // a blocker falling lets go after 状态结算: that frame is not one of them
    const b = held(key, seconds);
    b.g.hp = 0;
    step(b.w, b.c);
    assert.equal(b.e.blockedBy, -1);
    assert.equal(windowOf(b.e)?.left, n);
    run(b.w, b.c, n - 1);
    assert.deepEqual([windowOf(b.e)?.left, targeting.stealthed(b.e)], [1, false]);
    step(b.w, b.c);
    assert.equal(targeting.stealthed(b.e), true);
    assert.deepEqual(sources(b.e), [['lurk', n]]);
  }
});

test('[敌能-154] blocked again inside the window, the 隐匿 stays off; the next release starts the second again', () => {
  const { c, w, e, g } = held(KEY, 1);
  step(w, c, [[0, { type: 'retreat', unit: g.id }]]);
  run(w, c, 10);
  assert.equal(windowOf(e)?.left, 19);
  const g2 = put(w, c, 'g2', 1, 2);
  assert.equal(e.blockedBy, g2.id);
  run(w, c, 40);
  assert.equal(targeting.stealthed(e), false, 'blocked past the window');
  step(w, c, [[0, { type: 'retreat', unit: g2.id }]]);
  assert.equal(windowOf(e)?.left, 29);
  run(w, c, 29);
  assert.equal(targeting.stealthed(e), true);
});

test('[敌能-154] 反隐: `unstealth` or 隐匿免疫 takes the 隐匿 off; when it goes, the 隐匿 holds again at once', () => {
  for (const flag of ['unstealth', 'immune:stealth']) {
    const { c, w, e } = open(KEY, eraser());
    buffs.addBuff(e, buffs.makeBuff({ key: 'test:reveal', flags: { [flag]: true } }));
    assert.deepEqual([targeting.stealthed(e), targeting.selectable(e)], [false, true], flag);
    run(w, c, 45);
    assert.deepEqual([targeting.stealthed(e), targeting.selectable(e)], [false, true], `${flag} for as long as it lasts`);
    buffs.removeBuff(e, 'test:reveal');
    assert.deepEqual([targeting.stealthed(e), windowOf(e)], [true, undefined], 'no window after 反隐');
  }
});

test('[敌能-154] noFly: blocked by a flyer it shoots someone else in range, never the flyer, silenced too; without the row\'s noFly it shoots the flyer', () => {
  const plain = eraser(), { noFly: _, ...rest } = plain.talents ?? {}, bare = { ...plain, talents: rest };
  for (const [def, flyerHit] of /** @type {const} */ ([[plain, false], [bare, true]])) {
    const { c, w, e } = open(KEY, def, (cc) => { cc.operators.guard.motion = 'FLY'; });
    status.applyStatus(e, 'silence', { seconds: 99 });
    const g = put(w, c, 'guard', 1, 2), s = put(w, c, 'sniper', 2, 2);
    assert.equal(e.blockedBy, g.id, 'a flyer blocks it');
    assert.equal(attrs.statsOf(e).flags.silence, true);
    const hits = hitsBy(run(w, c, 120), e);
    assert.ok(hits.length > 0);
    assert.deepEqual([...new Set(hits.map((h) => h.target))], [flyerHit ? g.id : s.id]);
  }
});

test('[敌能-154] 清算时刻 never holds: the four data numbers, whatever they are, change no stat and no attack, blocked or not', () => {
  for (const data of [DATA, { attack_speed: 999, atk: 0.9, def: 0.9, max_stack_cnt: 50 }]) {
    const { c, w, e } = open(KEY, eraser(KEY, data));
    const s = attrs.statsOf(e);
    assert.deepEqual([s.atk, s.def, s.aspd, s.bat], [800, 800, 100, 3]);
    assert.ok(e.buffs.every((b) => Object.keys(b.mods).length === 0 && b.stacks === 1), 'no modifier, no stacks');
    buffs.addBuff(e, buffs.makeBuff({ key: 'test:atk', mods: { atkFlat: 100 } }));
    /** @type {any[]} */
    const ev = [];
    /** @type {[number, import('@aue/sim').Command][]} */
    const ours = [[0, { type: 'deploy', op: 'sniper', row: 2, col: 2, dir: 0 }], [0, { type: 'deploy', op: 'sniper2', row: 0, col: 2, dir: 0 }]];
    for (let i = 0; i < 200; i++) for (const x of step(w, c, i === 0 ? ours : [])) ev.push({ ...x, f: w.frame });
    const shots = ev.filter((x) => x.type === 'shot' && x.id === e.id), snipers = w.units.filter((u) => u.key.startsWith('sniper')).map((u) => u.id);
    assert.deepEqual(shots.map((x) => x.f - shots[0].f), [0, 90, 180], 'one target a swing, a swing each 3 s');
    assert.ok(shots.every((x) => snipers.includes(x.target)));
    assert.ok(hitsBy(ev, e).length >= 2);
    assert.ok(hitsBy(ev, e).every((h) => h.damage === 900), 'its current 攻击力 × 1');
    // blocked, the same: the blocker takes its current 攻击力 × 1, and no modifier comes but the test's
    const g = put(w, c, 'guard', 1, 2);
    assert.equal(e.blockedBy, g.id);
    const onGuard = hitsBy(run(w, c, 200), e), t = attrs.statsOf(e);
    assert.ok(onGuard.length >= 2 && onGuard.every((h) => h.target === g.id && h.damage === 900), 'blocked: the blocker, at × 1');
    assert.deepEqual([t.atk, t.def, t.aspd, t.bat], [900, 800, 100, 3]);
    assert.ok(e.buffs.every((b) => b.key === 'test:atk' || (Object.keys(b.mods).length === 0 && b.stacks === 1)), 'blocked: no modifier, no stacks');
  }
});
