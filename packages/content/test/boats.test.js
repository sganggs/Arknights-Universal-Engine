// The boats' death summon (docs/spec/foes.md 敌能-133): 术师快艇 and 领潮员快艇 bring in their 控潮术师 / 领潮员 0.8 s
// after they go down, within 0.1 of where they fell along x and y, on their route. None of these is in a shipped level.
// The records: talents from enemy_database (ArknightsGameData 17759cc8, level 0, .port/agd.txt), 术师快艇's numbers
// from it too; 领潮员快艇's and the two mages' numbers from their pages' 级别0 tables (oldid 395668, 365951, 353468).
// 水手重艇 and 码头水手 are enemy_database level 0 too; the sedan (敌能-116) is the shipped football level's record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot, status, attrs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, FOE_EXTRAS } from '../src/foes.js';
import sub12 from '../data/levels/act1football_sub-1-2.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const RATIO = 'attack@ep_damage_ratio';
const BOAT = 'enemy_1162_magmot', BOAT2 = 'enemy_1162_magmot_2', MAGE = 'enemy_1161_tidmag', LEADER = 'enemy_1161_tidmag_2';
const HEAVY = 'enemy_1163_hvymot', SAILOR = 'enemy_1160_hvyslr', SEDAN = 'enemy_1281_sgcar';
const SILENCE = Object.freeze(['silence']);

/** 术师快艇: enemy_database level 0 (maxHp 12000, atk 300, def 200, moveSpeed 1.1, baseAttackTime 3.5, rangeRadius 3, massLevel 4, silenceImmune). @returns {any} */
const magmot = () => ({
  name: '术师快艇', maxHp: 12000, atk: 300, def: 200, res: 0, moveSpeed: 1.1, baseAttackTime: 3.5, rangeRadius: 3, applyWay: 'RANGED', motion: 'WALK',
  massLevel: 4, levelType: 'ELITE', immune: [...SILENCE], dmgType: 'arts', talents: { EpDamage: { [RATIO]: 0.8 }, DeathRattle: { enemy_key: MAGE } },
});
/** 领潮员快艇: the page's 16000 / 380 / 220 / 0 / 3.0 / 4, 1.1, 3.5, 异常抗性 沉默; the data's talents. @returns {any} */
const leaderBoat = () => ({ ...magmot(), name: '领潮员快艇', maxHp: 16000, atk: 380, def: 220, talents: { EpDamage: { [RATIO]: 0.8 }, DeathRattle: { enemy_key: LEADER } } });
/** 控潮术师 / 领潮员: the pages' 6000 / 200 / 200 and 8000 / 260 / 220, res 60, 2.2, 2, 0.7, 2.5. @param {string} name @param {number} hp @param {number} atk @param {number} def @returns {any} */
const mage = (name, hp, atk, def) => ({
  name, maxHp: hp, atk, def, res: 60, moveSpeed: 0.7, baseAttackTime: 2.5, rangeRadius: 2.2, applyWay: 'RANGED', motion: 'WALK', massLevel: 2,
  immune: [...SILENCE], dmgType: 'arts', talents: { EpDamage: { [RATIO]: 0.8 } },
});
/** 水手重艇 (15000 / 1000 / 1000, 1.2, 5, massLevel 4, silenceImmune), its DeathRattle as the data has it (`Crash` left out). @returns {any} */
const heavy = () => ({
  name: '水手重艇', maxHp: 15000, atk: 1000, def: 1000, res: 0, moveSpeed: 1.2, baseAttackTime: 5, rangeRadius: 0, applyWay: 'MELEE', motion: 'WALK',
  massLevel: 4, levelType: 'ELITE', immune: [...SILENCE], talents: { DeathRattle: { enemy_key: SAILOR } },
});
/** 码头水手 (10000 / 800 / 800, res 20, 0.7, 3.5, massLevel 4), without its `Drown` and its skill. @returns {any} */
const sailor = () => ({ name: '码头水手', maxHp: 10000, atk: 800, def: 800, res: 20, moveSpeed: 0.7, baseAttackTime: 3.5, rangeRadius: 0, applyWay: 'MELEE', motion: 'WALK', massLevel: 4 });

/** An enemy of just these talents. @param {Record<string, unknown>} talents @returns {any} */
const named = (talents) => ({ name: 'e', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, talents });
/** @param {string} key @param {Record<string, unknown>} talents */
const gaps = (key, talents) => uncoveredAbilities([withFoeExtras(key, named(talents))]);

/**
 * The tiny map with a straight route along row 1 to the goal at column 5, the enemy of `key` spawning in frame 0 and
 * both mages in the content. With `at`, it is put at (`at`, 1) and rooted there.
 * @param {string} key @param {any} def @param {{ at?: number, tweak?: (c: any) => void }} [o]
 */
function water(key, def, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.level.routes = [{ start: { row: 1, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [] }];
  c.enemies = { [key]: withFoeExtras(key, def), [MAGE]: withFoeExtras(MAGE, mage('控潮术师', 6000, 200, 200)), [LEADER]: withFoeExtras(LEADER, mage('领潮员', 8000, 260, 220)) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  o.tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === key));
  if (o.at !== undefined) {
    Object.assign(e, { x: o.at, y: 1, path: [], pt: 0 });
    status.applyStatus(e, 'root', {});
  }
  return { c, w, e };
}

/** Runs n frames, returning the events with their frame. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}
const spawned = (/** @type {any[]} */ ev, /** @type {string} */ key) => ev.filter((x) => x.type === 'spawn' && x.key === key);
const near = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) <= 0.1 + 1e-9;

test('[敌能-133] [敌能-116] DeathRattle: the boats\' enemy_key with the pages\' two numbers is covered; 水手重艇\'s same data, other shapes and mixes are not; the sedan\'s still is', () => {
  for (const [key, def, crew] of /** @type {[string, any, string][]} */ ([[BOAT, magmot(), MAGE], [BOAT2, leaderBoat(), LEADER]])) {
    const merged = withFoeExtras(key, def);
    assert.deepEqual(merged.talents?.DeathRattle, { enemy_key: crew, delay: 0.8, offset_bound: 0.1 }, key);
    assert.deepEqual(uncoveredAbilities([merged]), [], key);
  }
  for (const [key, crew] of [['enemy_1163_hvymot', 'enemy_1160_hvyslr'], ['enemy_1163_hvymot_2', 'enemy_1160_hvyslr_2']]) {
    assert.equal(FOE_EXTRAS[key], undefined, key);
    assert.deepEqual(gaps(key, { DeathRattle: { enemy_key: crew } }), ['DeathRattle'], `${key}: the data alone`);
  }
  const others = [{ sp: 20 }, { sp: 80, taunt_level: 1 }, { range_num: 3, can_select_num: 1 }, { enemy_key: MAGE, delay: 0.8 },
    { enemy_key: MAGE, delay: 0.8, offset_bound: 0.1, cnt: 2 }, { enemy_key: '', delay: 0.8, offset_bound: 0.1 }, { enemy_key: 1, delay: 0.8, offset_bound: 0.1 },
    { enemy_key: MAGE, delay: '0.8', offset_bound: 0.1 }, { 'attack@cnt': 3, delay: 0.8, offset_bound: 0.1 }, { 'attack@cnt': 3, enemy_key: MAGE }];
  for (const bb of others) assert.deepEqual(gaps('enemy_x', { DeathRattle: bb }), ['DeathRattle'], JSON.stringify(bb));
  assert.deepEqual(gaps('enemy_1281_sgcar', { DeathRattle: { 'attack@cnt': 3 } }), [], 'the sedan (敌能-116)');
  assert.deepEqual(gaps('enemy_x', { ranged: { 'attack@cnt': 3 } }), ['ranged'], 'the sedan\'s shape is whole under DeathRattle only');
});

test('[敌能-133] [敌能-38] [敌能-33] 领潮员快艇\'s row: 术师快艇\'s 侵蚀 cross and the page marker for 不会攻击飞行单位; 术师快艇\'s page says neither', () => {
  assert.deepEqual(withFoeExtras(BOAT2, leaderBoat()).talents, {
    EpDamage: { [RATIO]: 0.8, el: 2, cross: 1 }, DeathRattle: { enemy_key: LEADER, delay: 0.8, offset_bound: 0.1 }, noFly: {},
  });
  assert.deepEqual(withFoeExtras(BOAT, magmot()).talents, { EpDamage: { [RATIO]: 0.8, el: 2, cross: 1 }, DeathRattle: { enemy_key: MAGE, delay: 0.8, offset_bound: 0.1 } });
  assert.equal(FOE_EXTRAS[BOAT2]?.source.endsWith('oldid=395668'), true);
});

test('[敌能-133] [敌能-22] knocked down: one of its crew on the 24th frame after, within 0.1 of where it fell, on its route from its leg; kept as state until then', () => {
  for (const [key, def, crew] of /** @type {[string, any, string][]} */ ([[BOAT, magmot(), MAGE], [BOAT2, leaderBoat(), LEADER]])) {
    const { c, w, e } = water(key, def, { at: 2.3 });
    run(w, c, 3);
    const fell = { x: e.x, y: e.y, leg: e.leg };
    e.hp = 0;
    const died = w.frame, first = run(w, c, 1);
    assert.ok(first.some((x) => x.type === 'death' && x.id === e.id), `${key} is knocked down`);
    assert.deepEqual(w.broods?.map((b) => [b.key, b.left]), [[crew, 24]], `${key}: waiting in the world`);
    const again = restoreSnapshot(takeSnapshot(w));
    assert.equal(stateHash(again), stateHash(w), 'the wait is in the snapshot and the hash');
    const ev = run(w, c, 24), ev2 = run(again, c, 24);
    assert.deepEqual(spawned(ev, crew).map((x) => x.f), [died + 24], `${key}: one, 0.8 s (24 frames) after`);
    assert.equal(stateHash(again), stateHash(w), 'the snapshot runs on the same');
    assert.equal(spawned(ev2, crew).length, 1);
    const [u] = w.units.filter((x) => x.key === crew);
    assert.ok(near(u.x, fell.x) && near(u.y, fell.y) && (u.x !== fell.x || u.y !== fell.y), `${key}: (${u.x}, ${u.y}) around (${fell.x}, ${fell.y})`);
    assert.deepEqual([u.route, u.leg, u.wave, w.broods?.length], [0, fell.leg, -1, 0]);
    assert.deepEqual(c.enemies[crew].talents?.EpDamage, { [RATIO]: 0.8, el: 2, cross: 1 }, 'the crew\'s 侵蚀 is 敌能-38\'s');
  }
});

test('[敌能-133] none at the goal; silence does not stop it (the record without its immunity); a fall counts, the crew landing on the 地穴', () => {
  const walk = water(BOAT, magmot());
  const ev = run(walk.w, walk.c, 300);
  assert.ok(ev.some((x) => x.type === 'goal' && x.id === walk.e.id), 'it reaches the goal');
  assert.deepEqual([spawned(ev, MAGE).length, walk.w.broods?.length ?? 0], [0, 0], 'no crew at the goal');
  const quiet = water(BOAT, { ...magmot(), immune: [] }, { at: 2 });
  status.applyStatus(quiet.e, 'silence', {});
  assert.equal(attrs.statsOf(quiet.e).flags.silence, true);
  quiet.e.hp = 0;
  assert.equal(spawned(run(quiet.w, quiet.c, 25), MAGE).length, 1, 'silenced, still one');
  const hole = water(BOAT, magmot(), { at: 3, tweak: (c) => { c.level.tiles[1][3] = { ...c.level.tiles[1][3], key: 'tile_hole' }; } });
  const fall = run(hole.w, hole.c, 30);
  const down = fall.find((x) => x.type === 'death' && x.id === hole.e.id)?.f;
  assert.equal(typeof down, 'number', 'the boat falls');
  const [crew] = spawned(fall, MAGE);
  assert.equal(crew?.f, /** @type {number} */ (down) + 24, 'its crew 24 frames later');
  assert.ok(fall.some((x) => x.type === 'death' && x.id === crew.id && x.f > crew.f), 'on the 地穴 where the boat fell, it falls too');
});

test('[敌能-133] [敌能-116] [关卡-2] knocked down without both page numbers, it brings no one: 水手重艇 as the data has it, a boat with the delay alone; the sedan neither', () => {
  const cases = /** @type {[string, any][]} */ ([[HEAVY, heavy()], ['enemy_x', { ...magmot(), talents: { DeathRattle: { enemy_key: MAGE, delay: 0.8 } } }],
    [SEDAN, /** @type {any} */ (sub12).enemies[SEDAN]]]);
  for (const [key, def] of cases) {
    const { c, w, e } = water(key, def, { tweak: (x) => { x.enemies[SAILOR] = sailor(); } });
    e.hp = 0;
    const ev = run(w, c, 40);
    assert.ok(ev.some((x) => x.type === 'death' && x.id === e.id), `${key} is knocked down`);
    assert.deepEqual([ev.filter((x) => x.type === 'spawn').length, w.broods?.length ?? 0], [0, 0], `${key} brings no one`);
  }
});

const activate = (/** @type {string} */ alias) => ({ type: 'ACTIVATE', key: alias, route: -1, count: 1, preDelay: 0, interval: 0 });
const wave = (/** @type {any[]} */ actions) => ({ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions }] });
const stage = (/** @type {string} */ alias, /** @type {Record<string, unknown>} */ o) => ({ alias, objective: 'protect', goal: 1, time: 10, rest: 0, ...o });

test('[敌能-133] [合作-8] the intermission: a boat still on the field leaves without its crew, and a crew still on its way never comes', () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.stages = [stage('c#1', { objective: 'survive', goal: 10 }), stage('c#2', { rest: 3 })];
  c.level.predefines = c.level.stages.map((/** @type {any} */ s) => ({ alias: s.alias, key: 'trap_179_muctrl', hidden: true }));
  c.level.waves = [wave([activate('c#1')]), wave([spawnAt(0, BOAT), spawnAt(0, BOAT)]), wave([activate('c#2')]), wave([])];
  c.level.options = { ...c.level.options, moveMultiplier: 0.001 };
  c.enemies = { [BOAT]: withFoeExtras(BOAT, magmot()), [MAGE]: withFoeExtras(MAGE, mage('控潮术师', 6000, 200, 200)) };
  c.behaviors = skeletonContent.behaviors;
  const w = createWorld(c, { seed: 1, players: 1 });
  const early = run(w, c, 290);
  const [a, b] = w.units.filter((u) => u.key === BOAT);
  assert.ok(a && b && spawned(early, BOAT).length === 2, 'two boats on the field');
  a.hp = 0;
  const ev = run(w, c, 60), settled = ev.find((x) => x.type === 'stage' && x.on === 0)?.f;
  assert.equal(settled, 300, 'the first stage passes at 10 s: the intermission');
  assert.ok(ev.some((x) => x.type === 'death' && x.id === a.id) && !ev.some((x) => x.type === 'death' && x.id === b.id), 'only the boat knocked down dies');
  assert.deepEqual([spawned(ev, MAGE).length, w.broods?.length ?? 0, w.units.filter((u) => u.key === BOAT).length], [0, 0, 0], 'no crew; the wait cleared');
});
