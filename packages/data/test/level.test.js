// A whole level as content (docs/spec/level.md): enemies at the level's database level with its overrides, what each
// difficulty's runes change; and, with AUE_GAMEDATA, the committed act1multi_01 equals a fresh extraction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractLevel, difficultyOf, mergeEnemyData } from '../src/index.js';
import { sharedEnemies } from '../src/enemies.js';
import { extractLevelFromCheckout } from '../src/cli/level.js';

const wrap = (/** @type {unknown} */ m_value) => ({ m_defined: true, m_value });
const undef = (/** @type {unknown} */ m_value) => ({ m_defined: false, m_value });
const tile = (/** @type {string} */ tileKey) => ({ tileKey, heightType: 'LOWLAND', buildableType: 'NONE', passableMask: 'ALL', playerSideMask: 'ALL' });
const pos = (/** @type {number} */ row, /** @type {number} */ col) => ({ row, col });

/** An enemy_database entry; `levels` adds higher levels' enemyData. @param {string} key @param {Record<string, unknown>[]} [levels] */
const entry = (key, levels = []) => ({
  Key: key,
  Value: [{ level: 0, enemyData: {
    name: wrap(key), levelType: wrap('NORMAL'), rangeRadius: wrap(0), applyWay: wrap('MELEE'), motion: wrap('WALK'), lifePointReduce: wrap(1),
    talentBlackboard: null,
    attributes: { maxHp: wrap(1000), atk: wrap(100), def: wrap(50), magicResistance: wrap(0), moveSpeed: wrap(1), baseAttackTime: wrap(2), massLevel: wrap(1),
      blockCnt: undef(1), epDamageResistance: undef(0), epResistance: undef(0) },
  } }, ...levels.map((enemyData, i) => ({ level: i + 1, enemyData }))],
});
const rune = (/** @type {string} */ key, /** @type {unknown} */ mask, /** @type {Record<string, number | string>} */ bb) => ({
  key, difficultyMask: mask, blackboard: Object.entries(bb).map(([k, v]) => (typeof v === 'string' ? { key: k, value: 0, valueStr: v } : { key: k, value: v, valueStr: null })),
});
const spawn = (/** @type {string} */ key, /** @type {number} */ routeIndex) => ({ actionType: 'SPAWN', key, count: 1, preDelay: 0, interval: 0, routeIndex });

function makeLevel() {
  return {
    options: { maxLifePoint: 8, initialCost: 10, maxCost: 99, costIncreaseTime: 1, characterLimit: 6, moveMultiplier: 0.5 },
    mapData: { tiles: [tile('tile_start'), tile('tile_road'), tile('tile_end')], map: [[0, 1, 2], [1, 1, 1]] },
    routes: [
      { motionMode: 'WALK', startPosition: pos(1, 0), endPosition: pos(1, 2), checkpoints: null },
      { motionMode: 'WALK', startPosition: pos(1, 0), endPosition: pos(0, 2), checkpoints: null },
    ],
    waves: [{ preDelay: 0, postDelay: 0, maxTimeWaitingForNextWave: -1, fragments: [{ preDelay: 0, actions: [spawn('e_b', 1), spawn('e_a', 1), spawn('e_c', 0)] }] }],
    enemyDbRefs: [
      { id: 'e_a', level: 1, useDb: true, overwrittenData: { name: undef(null), attributes: { maxHp: wrap(5000), atk: undef(0) } } },
      { id: 'e_c', level: 0, useDb: false, overwrittenData: entry('e_c').Value[0].enemyData },
    ],
    runes: [
      rune('level_hidden_group_enable', 'NORMAL', { key: 'normal' }), rune('level_hidden_group_enable', 'FOUR_STAR', { key: 'raid' }),
      rune('level_hidden_group_enable', 'ALL', { key: 'both' }), rune('level_hidden_group_disable', 'FOUR_STAR', { key: 'both' }),
      rune('global_lifepoint', 'FOUR_STAR', { value: 5 }), rune('enemy_attribute_mul', 'FOUR_STAR', { atk: 1.4, def: 1.2, max_hp: 1.2 }),
      rune('enemy_attribute_mul', 'FOUR_STAR', { move_speed: 1.5, enemy: 'e_a|e_b' }), rune('enemy_attribute_mul', 'NORMAL', { atk: 2, enemy_exclude: 'e_a' }),
      rune('level_enemy_replace', 'FOUR_STAR', { key: 'e_b', value: 'e_d' }),
      rune('env_gbuff_new_with_verify', 'ALL', { enemy: 'e_b', key: 'cooperate_enemy_side_shared' }), rune('env_system_new', 'FOUR_STAR', { value: 1 }),
    ],
    predefines: { characterInsts: [], tokenInsts: [] },
  };
}
const db = () => ({ enemies: [entry('e_a', [{ attributes: { atk: wrap(300) }, levelType: wrap('ELITE'), talentBlackboard: [{ key: 'x', value: 1, valueStr: null }] }]), entry('e_b'), entry('e_d')] });

test('[关卡-1] enemies: level 0, then the level the level asks for, then its overwrittenData; useDb false: overwrittenData alone', () => {
  const s = /** @type {any} */ (extractLevel({ id: 'lv', level: makeLevel(), enemyDb: db(), commit: 'abc' }));
  assert.deepEqual(Object.keys(s.enemies), ['e_a', 'e_b', 'e_c', 'e_d'], 'spawned and replacement enemies, sorted');
  assert.deepEqual([s.enemies.e_a.maxHp, s.enemies.e_a.atk, s.enemies.e_a.def, s.enemies.e_a.levelType, s.enemies.e_a.name], [5000, 300, 50, 'ELITE', 'e_a'],
    'the level\'s 5000 HP, level 1\'s 300 ATK and ELITE, level 0\'s DEF; an undefined override changes nothing');
  assert.deepEqual([s.enemies.e_b.atk, s.enemies.e_b.shared, s.enemies.e_c.maxHp, s.enemies.e_b.lifePointReduce], [100, true, 1000, 1]);
  assert.deepEqual(s.level.routes.map((/** @type {any} */ r) => r.end), [pos(0, 2), pos(1, 2)], 'first-use order');
  assert.deepEqual(s.level.waves[0].fragments[0].actions.map((/** @type {any} */ a) => [a.key, a.route]), [['e_b', 0], ['e_a', 0], ['e_c', 1]]);
  assert.deepEqual([s.level.stages, s.level.predefines, s.source.commit], [[], [], 'abc']);
  const missing = makeLevel();
  missing.enemyDbRefs[0].level = 3;
  assert.throws(() => extractLevel({ id: 'lv', level: missing, enemyDb: db(), commit: '' }), /no level 3/);
  assert.deepEqual(mergeEnemyData({ a: wrap(1), attributes: { x: wrap(1) } }, { a: undef(9), b: wrap(2), attributes: null }, 'p'), { a: wrap(1), b: wrap(2), attributes: { x: wrap(1) } });
});

test('[关卡-2] a difficulty\'s runes: hidden groups enabled and disabled, the life point, enemy multipliers with their filters, replacements', () => {
  const runes = makeLevel().runes;
  assert.deepEqual(difficultyOf(runes, 'NORMAL'), { hiddenGroups: ['normal', 'both'], enemyMul: [{ mods: { atk: 2 }, exclude: ['e_a'] }], replace: {}, unsupported: [] });
  assert.deepEqual(difficultyOf(runes, 'FOUR_STAR'), {
    hiddenGroups: ['raid'], lifePoint: 5, replace: { e_b: 'e_d' }, unsupported: ['env_system_new'],
    enemyMul: [{ mods: { atk: 1.4, def: 1.2, max_hp: 1.2 } }, { mods: { move_speed: 1.5 }, enemy: ['e_a', 'e_b'] }],
  });
  assert.deepEqual(difficultyOf(null, 'NORMAL'), { hiddenGroups: [], enemyMul: [], replace: {}, unsupported: [] });
});

test('[关卡-1] [关卡-2] [关卡-3] [关卡-4] [关卡-5] the committed act1multi_01 is a fresh extraction of the pinned data (AUE_GAMEDATA, AUE_LEVEL_MAP)', {
  skip: process.env.AUE_GAMEDATA && process.env.AUE_LEVEL_MAP ? false : 'AUE_GAMEDATA or AUE_LEVEL_MAP is not set',
}, () => {
  const committed = readFileSync(new URL('../../content/data/levels/act1multi_01.json', import.meta.url), 'utf8');
  const map = { file: /** @type {string} */ (process.env.AUE_LEVEL_MAP), source: JSON.parse(committed).source.view };
  const fresh = `${JSON.stringify(extractLevelFromCheckout(/** @type {string} */ (process.env.AUE_GAMEDATA), 'act1multi_01', map), null, 2)}\n`;
  assert.equal(fresh, committed);
});

test('[关卡-3] a camera view vector: three finite numbers, kept with its source; anything else refused', () => {
  const out = /** @type {any} */ (extractLevel({ id: 'x', level: makeLevel(), enemyDb: db(), commit: 'c', view: { vector: [0, -6.1, -9.76], source: 'repo@sha:map.json' } }));
  assert.deepEqual([out.level.view, out.source.view], [[0, -6.1, -9.76], 'repo@sha:map.json']);
  assert.throws(() => extractLevel({ id: 'x', level: makeLevel(), enemyDb: db(), commit: 'c', view: { vector: [0, 1], source: 's' } }), /three finite numbers/);
  assert.equal(/** @type {any} */ (extractLevel({ id: 'x', level: makeLevel(), enemyDb: db(), commit: 'c' })).level.view, undefined);
});

test('[关卡-4] a stage\'s code and name from its stage table entry; none without one; a malformed entry refused', () => {
  const out = /** @type {any} */ (extractLevel({ id: 'x', level: makeLevel(), enemyDb: db(), commit: 'c', stage: { code: 'IG-1', name: '逃离火线', stageType: 'ACTIVITY' } }));
  assert.deepEqual([out.level.code, out.level.name], ['IG-1', '逃离火线']);
  const none = /** @type {any} */ (extractLevel({ id: 'x', level: makeLevel(), enemyDb: db(), commit: 'c' }));
  assert.deepEqual(['code' in none.level, 'name' in none.level], [false, false]);
  assert.throws(() => extractLevel({ id: 'x', level: makeLevel(), enemyDb: db(), commit: 'c', stage: { code: 1 } }));
});

test('[关卡-5] stage task texts: the missions in order, basic then advanced per stage; none when they do not match the goals', () => {
  const stage = (/** @type {number} */ i, /** @type {Record<string, number | string>} */ bb) => ({ alias: `trap_179_muctrl#${i}`, hidden: true, inst: { characterKey: 'trap_179_muctrl' },
    overrideSkillBlackboard: Object.entries(bb).map(([key, v]) => (typeof v === 'string' ? { key, value: 0, valueStr: v } : { key, value: v, valueStr: null })) });
  const level = { ...makeLevel(), predefines: { characterInsts: [], tokenInsts: [stage(1, { ability_name: 'protect', protect_y1: 4, protect_y2: 9, basic: 1, time_x: 150 }),
    stage(2, { ability_name: 'protect', protect_y1: 3, protect_y2: 5, time_x: 210, rest_time: 10 })] } };
  const m = (/** @type {number} */ n) => ({ id: `m${n}`, sortId: n, title: '营救', battleDesc: 'x', description: `保护${n}位平民` });
  const out = /** @type {any} */ (extractLevel({ id: 'x', level, enemyDb: db(), commit: 'c', missions: [m(1), m(2), m(3)] }));
  assert.deepEqual(out.level.stages.map((/** @type {any} */ s) => s.task), [{ title: '营救', basic: '保护1位平民' }, { title: '营救', basic: '保护2位平民', advanced: '保护3位平民' }]);
  const short = /** @type {any} */ (extractLevel({ id: 'x', level, enemyDb: db(), commit: 'c', missions: [m(1), m(2)] }));
  assert.deepEqual(short.level.stages.map((/** @type {any} */ s) => 'task' in s), [false, false], 'two missions for three goals: no texts');
});

test('[关卡-2] runes: the max cost, the operators\' block count, shared enemies written as their own rune', () => {
  const rune = (/** @type {string} */ key, /** @type {Record<string, number | string>} */ bb, mask = 'ALL') => ({ key, difficultyMask: mask, blackboard: Object.entries(bb).map(([k, v]) => (typeof v === 'string' ? { key: k, value: 0, valueStr: v } : { key: k, value: v, valueStr: null })) });
  const runes = [rune('cbuff_max_cost', { max_cost: 30, max_cost_ceil: 99 }), rune('char_blockcnt_add', { value: -1 }, 'FOUR_STAR'), rune('cooperate_enemy_side_shared', { enemy: 'e_a|e_b' }, 'NORMAL')];
  assert.deepEqual(difficultyOf(runes, 'NORMAL'), { hiddenGroups: [], maxCost: 30, enemyMul: [], replace: {}, unsupported: [] });
  assert.deepEqual(difficultyOf(runes, 'FOUR_STAR'), { hiddenGroups: [], maxCost: 30, blockAdd: -1, enemyMul: [], replace: {}, unsupported: [] });
  assert.deepEqual([...sharedEnemies(runes)], ['e_a', 'e_b']);
});

test('[地图-2] closed edges: a tile, its side and the mask, in data order; none without blockEdges; unknown sides and masks refused', () => {
  const lv = /** @type {any} */ (makeLevel()), out = (/** @type {any} */ l) => /** @type {any} */ (extractLevel({ id: 'lv', level: l, enemyDb: db(), commit: 'c' })).level;
  assert.equal(out(lv).blockEdges, undefined);
  lv.mapData.blockEdges = [{ pos: pos(0, 1), direction: 'UP', blockMask: 'WALK_ONLY' }, { pos: pos(1, 2), direction: 'LEFT', blockMask: 'FLY_ONLY' }];
  assert.deepEqual(out(lv).blockEdges, [{ row: 0, col: 1, dir: 'UP', mask: 'WALK_ONLY' }, { row: 1, col: 2, dir: 'LEFT', mask: 'FLY_ONLY' }]);
  lv.mapData.blockEdges = [{ pos: pos(0, 1), direction: 'NORTH', blockMask: 'WALK_ONLY' }];
  assert.throws(() => out(lv), /direction: unknown NORTH/);
  lv.mapData.blockEdges = [{ pos: pos(0, 1), direction: 'UP', blockMask: 'SOME' }];
  assert.throws(() => out(lv), /blockMask: unknown SOME/);
});

test('[守御-1] [守御-6] 堡垒守御: its global buff\'s times and life as `fortress`; its branches as fragments, their enemies among the level\'s', () => {
  const lv = /** @type {any} */ (makeLevel());
  const bb = { rest_time: 65, wave_time: 120, wave_time_last: 300, life_point: 3, rest_add: 5 };
  lv.globalBuffs = [{ prefabKey: 'cooperate_fortress_global_buff', blackboard: Object.entries(bb).map(([key, value]) => ({ key, value, valueStr: null })) }];
  lv.branches = { guards: { phases: [{ preDelay: 2, actions: [spawn('e_d', 1)] }] } };
  lv.extraRoutes = [lv.routes[0], { motionMode: 'WALK', startPosition: pos(0, 2), endPosition: pos(0, 1), checkpoints: [{ type: 'DISAPPEAR', time: 0, position: pos(-1, 1) }] }];
  const s = /** @type {any} */ (extractLevel({ id: 'lv', level: lv, enemyDb: db(), commit: 'c' }));
  assert.deepEqual(s.level.fortress, { rest: 65, wave: 120, waveLast: 300, life: 3, restAdd: 5 });
  assert.deepEqual(s.level.branches.guards.map((/** @type {any} */ f) => [f.preDelay, f.actions.map((/** @type {any} */ a) => [a.key, a.route])]), [[2, [['e_d', 2]]]], 'its extra route, after the two of the waves');
  assert.deepEqual([s.level.routes[2].start, s.level.routes[2].checkpoints[0].row], [pos(0, 2), -1], 'a disappearing checkpoint may lie off the map');
  assert.ok(Object.hasOwn(s.enemies, 'e_d'));
  const plain = /** @type {any} */ (extractLevel({ id: 'lv', level: makeLevel(), enemyDb: db(), commit: 'c' }));
  assert.deepEqual([plain.level.fortress, plain.level.branches], [undefined, undefined]);
});
