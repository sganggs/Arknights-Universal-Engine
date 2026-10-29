// Whole levels at a difficulty (docs/spec/level.md 关卡-2), and the real act1multi_01 played headless: deterministic,
// its waves, stage and civilians at work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, stateHash, paths } from '@aue/sim';
import { levelContent, levelAt, LEVELS, matchContent, OFFICIAL_SOURCE } from '../src/index.js';
import { uncoveredAbilities } from '../src/foes.js';
import { profiledDevices } from '../src/devices.js';
import hard02 from '../data/levels/act1multi_hard-02.json' with { type: 'json' };
import football from '../data/levels/act1multi_football.json' with { type: 'json' };

const raw = LEVELS.act1multi_01;

test('[关卡-2] at a difficulty: its hidden groups and life point; enemy multipliers on the base values; replacements', () => {
  const normal = levelAt('act1multi_01', 'NORMAL'), hard = levelAt('act1multi_01', 'FOUR_STAR');
  assert.deepEqual([normal.level.hiddenGroups, normal.level.options.maxLifePoint], [['normal'], 8]);
  assert.deepEqual([hard.level.hiddenGroups, hard.level.options.maxLifePoint], [['raid'], 5]);
  const k = 'enemy_1404_msnip', e = raw.enemies[k];
  assert.deepEqual([hard.enemies[k].atk, hard.enemies[k].def, hard.enemies[k].maxHp], [e.atk * 1.4, e.def * 1.2, e.maxHp * 1.2]);
  assert.deepEqual([normal.enemies[k].atk, normal.enemies[k].maxHp], [e.atk, e.maxHp]);
  assert.equal(normal.level.stages?.length, 2);
});

test('[关卡-2] replacements, filters and fields an enemy lacks; unsupported runes and unknown levels refused', () => {
  const save = structuredClone(raw.difficulties.FOUR_STAR);
  try {
    raw.difficulties.FOUR_STAR.replace = { enemy_1404_msnip: 'enemy_1404_msnip_2' };
    raw.difficulties.FOUR_STAR.enemyMul = [{ mods: { attack_speed: 2, move_speed: 2 }, enemy: ['enemy_1404_msnip_2'] }, { mods: { mass_level: 2 }, exclude: ['enemy_1404_msnip_2'] }];
    const hard = levelAt('act1multi_01', 'FOUR_STAR', (key) => ({ attack: { duration: 1, hit: 0.5, key } }));
    const spawned = hard.level.waves.flatMap((w) => w.fragments.flatMap((f) => f.actions)).filter((a) => a.type === 'SPAWN').map((a) => a.key);
    assert.ok(!spawned.includes('enemy_1404_msnip') && spawned.includes('enemy_1404_msnip_2'));
    assert.equal(hard.enemies.enemy_1404_msnip, undefined, 'only the enemies that still spawn');
    const two = /** @type {any} */ (hard.enemies.enemy_1404_msnip_2);
    assert.deepEqual([two.aspd, two.moveSpeed, two.massLevel, two.attack.key], [200, raw.enemies.enemy_1404_msnip_2.moveSpeed * 2, raw.enemies.enemy_1404_msnip_2.massLevel, 'enemy_1404_msnip_2']);
    assert.equal(/** @type {any} */ (hard.enemies.enemy_3001_upeopl).massLevel, raw.enemies.enemy_3001_upeopl.massLevel * 2);
    raw.difficulties.FOUR_STAR.unsupported = ['char_blockcnt_add'];
    assert.throws(() => levelAt('act1multi_01', 'FOUR_STAR'), /runes not supported yet: char_blockcnt_add/);
  } finally {
    raw.difficulties.FOUR_STAR = save;
  }
  assert.throws(() => levelAt('nope', 'NORMAL'), /no level nope/);
  assert.throws(() => levelAt('act1multi_01', /** @type {any} */ ('EASY')), /no difficulty EASY/);
});

test('[波次-2] [合作-6] [合作-9] the real act1multi_01 plays out headless the same way twice: its waves, its stage, civilians walking in', () => {
  const c = levelContent('act1multi_01', 'NORMAL');
  /** @returns {[number, Record<string, number>, number]} */
  const play = () => {
    const w = createWorld(c, { seed: 1209492319, players: 2 });
    /** @type {Record<string, number>} */
    const seen = {};
    for (let f = 0; f < 30 * 200 && w.result < 0; f++) for (const e of step(w, c)) seen[e.type] = (seen[e.type] ?? 0) + 1;
    return [stateHash(w), seen, w.frame];
  };
  const [h1, seen, frames] = play(), [h2] = play();
  assert.equal(h1, h2);
  assert.ok(seen.spawn > 10 && seen.goal > 0 && seen.stage === 1 && seen.predefine === 1, JSON.stringify(seen));
  assert.ok(frames < 30 * 150, 'nobody defends: lost before the first stage is settled');
  assert.equal(seen.end, 1);
});

test('[波次-6] [装置-1] [地图-2] [地图-3] the real IG-S-2 plays out headless the same way twice: barricades from the start, 山海密语仪 brought in, enemies over the 工事', () => {
  const c = levelContent('act1multi_hard-02', 'NORMAL');
  assert.deepEqual([c.level.works, c.level.blockEdges?.length], [{ dealt: 1.3, taken: 0.7 }, 55]);
  /** @returns {[number, Record<string, number>, number, number]} */
  const play = () => {
    const w = createWorld(c, { seed: 77, players: 2 });
    const barricades = w.units.filter((u) => u.key === 'trap_097_hstone').length;
    /** @type {Record<string, number>} */
    const seen = {};
    for (let f = 0; f < 30 * 300 && w.result < 0; f++) for (const e of step(w, c)) seen[e.type] = (seen[e.type] ?? 0) + 1;
    return [stateHash(w), seen, w.frame, barricades];
  };
  const [h1, seen, frames, barricades] = play(), [h2] = play();
  assert.equal(h1, h2);
  assert.equal(barricades, 3);
  assert.ok(seen.spawn > 10 && seen.goal > 0 && seen.predefine >= 1, JSON.stringify(seen));
  assert.ok(frames < 30 * 300 && seen.end === 1, 'nobody defends: lost');
});

test('[同步-9] [部署-2] a match\'s content: its level, each seat\'s deck at its trainings, keyed id#seat; only one\'s own deck deploys', async () => {
  const { matchContent } = await import('../src/index.js');
  const { createWorld: make, step: run, deployProblem } = await import('@aue/sim');
  const low = { elite: 0, level: 1, potential: 1, trust: 0, skill: -1, skillLevel: 1 }, high = { elite: 1, level: 55, potential: 6, trust: 100, skill: 0, skillLevel: 7 };
  const c = await matchContent({ level: 'act1multi_01', difficulty: 'FOUR_STAR', seed: 1, decks: [[{ id: 'char_122_beagle', build: low }], [{ id: 'char_122_beagle', build: high }, { id: 'char_500_noirc', build: low }]] });
  assert.deepEqual(c.decks, [['char_122_beagle#0'], ['char_122_beagle#1', 'char_500_noirc#1']]);
  const [a, b] = [c.operators['char_122_beagle#0'], c.operators['char_122_beagle#1']];
  assert.ok(a && b && b.atk > a.atk && a.char === 'char_122_beagle' && a.skill === undefined && b.skill !== undefined);
  assert.equal(c.level.options.maxLifePoint, 5, 'the difficulty applies');
  const w = make(c, { seed: 1, players: 2 });
  w.players.forEach((p) => { p.cost = 99; });
  const deploy = (/** @type {string} */ op) => /** @type {const} */ ({ type: 'deploy', op, row: 2, col: 5, dir: 0 });
  const tile = c.level.tiles.flatMap((row, r) => row.map((t, col) => ({ t, r, col }))).find((x) => x.t.buildable === 'MELEE' || x.t.buildable === 'ALL');
  const at = (/** @type {string} */ op) => ({ ...deploy(op), row: tile?.r ?? 0, col: tile?.col ?? 0 });
  assert.equal(deployProblem(w, c, 0, at('char_122_beagle#1')), 'not in the deck');
  assert.equal(deployProblem(w, c, 0, at('char_122_beagle#0')), null);
  run(w, c, [[0, at('char_122_beagle#0')]]);
  assert.equal(w.units.filter((u) => u.owner === 0).length, 1);
});

test('[敌能-22] [敌能-23] the real IG-14 plays out headless the same way twice, with the enemies others bring in', () => {
  const c = levelContent('act1multi_rm07', 'NORMAL');
  /** @returns {[number, Record<string, number>]} */
  const play = () => {
    const w = createWorld(c, { seed: 5, players: 2 });
    /** @type {Record<string, number>} */
    const seen = {};
    for (let f = 0; f < 30 * 200 && w.result < 0; f++) for (const e of step(w, c)) seen[e.type] = (seen[e.type] ?? 0) + 1;
    return [stateHash(w), seen];
  };
  const [h1, seen] = play(), [h2] = play();
  assert.equal(h1, h2);
  assert.ok(seen.spawn > 10 && seen.end === 1, JSON.stringify(seen));
  assert.ok(['enemy_1137_plasm', 'enemy_1138_tumor', 'enemy_1139_hologc', 'enemy_1221_dzomg'].every((k) => k in c.enemies), 'the enemies others bring in');
});

test('[关卡-2] more co-op levels: act2multi_rm01, act1multi_06, act1multi_hard-02 and act1multi_rm07 load; act1multi_02 waits for its sight system', () => {
  assert.deepEqual(['act1multi_01', 'act1multi_02', 'act1multi_06', 'act1multi_hard-02', 'act1multi_rm07', 'act2multi_rm01'].every((id) => id in LEVELS), true);
  assert.deepEqual(['NORMAL', 'FOUR_STAR'].map((d) => levelAt('act1multi_hard-02', /** @type {any} */ (d)).level.code), ['IG-S-2', 'IG-S-2']);
  assert.deepEqual(['NORMAL', 'FOUR_STAR'].map((d) => levelAt('act2multi_rm01', /** @type {any} */ (d)).level.stages?.map((s) => s.objective)), [['protect', 'protect'], ['protect', 'protect']]);
  assert.deepEqual(['NORMAL', 'FOUR_STAR'].map((d) => levelAt('act1multi_06', /** @type {any} */ (d)).level.stages?.length), [2, 2], 'act1multi_06 now loads');
  assert.equal(levelAt('act1multi_rm07', 'NORMAL').level.code, 'IG-14');
  assert.throws(() => levelAt('act1multi_rm07', 'FOUR_STAR'), /runes not supported yet: env_gbuff_new_with_verify, env_system_new/);
  assert.throws(() => levelAt('act1multi_02', 'NORMAL'), /runes not supported yet: env_system_new/);
  assert.throws(() => levelAt('nope', 'NORMAL'), /no level nope/);
  assert.deepEqual(uncoveredAbilities([{ talents: { dead: {}, Light: {}, DmgUp: {}, boom: { radius: 1, delay: 0 }, x: {} }, skills: [{ key: 'PowerHit' }, { key: 'y' }] }].map((e) => /** @type {any} */ (e))), ['x', 'y']);
  assert.deepEqual(uncoveredAbilities([{ talents: { boom: { radius: 1 }, ranged: {} }, skills: [{ key: 'CrossAttack', bb: { bolts: 3, hold: 0, charge: 0 } }] }].map((e) => /** @type {any} */ (e))), ['boom', 'ranged'],
    'a behaviour lacking values it needs (FOE_NEEDS) is none yet');
});

test('[关卡-2] char_blockcnt_add: act1multi_06 at 突袭 takes one off every operator\'s block count', async () => {
  const blocks = { ...LEVELS, x: { ...LEVELS.act1multi_01, difficulties: { NORMAL: LEVELS.act1multi_01.difficulties.NORMAL, FOUR_STAR: { ...LEVELS.act1multi_01.difficulties.FOUR_STAR, blockAdd: LEVELS.act1multi_06.difficulties.FOUR_STAR.blockAdd } } } };
  assert.deepEqual([LEVELS.act1multi_06.difficulties.NORMAL.blockAdd, LEVELS.act1multi_06.difficulties.FOUR_STAR.blockAdd], [undefined, -1]);
  const deck = [{ id: 'char_122_beagle', build: { elite: 0, level: 30, potential: 1, trust: 0, skill: 0, skillLevel: 4 } }];
  const source = { ...OFFICIAL_SOURCE, levels: blocks };
  const easy = await matchContent({ level: 'x', difficulty: 'NORMAL', seed: 1, decks: [deck] }, { source }), hard = await matchContent({ level: 'x', difficulty: 'FOUR_STAR', seed: 1, decks: [deck] }, { source });
  assert.equal(hard.operators['char_122_beagle#0'].blockCnt, easy.operators['char_122_beagle#0'].blockCnt - 1);
});

/** The pairs of walkable tiles side by side, one a 玉门天灾工事 and the other neither one nor a 云梯 (地图-2). @param {any} m @returns {[number, number][]} */
function worksBorders(m) {
  const WORKS = ['tile_passable_wall', 'tile_passable_wall_forbidden'], out = /** @type {[number, number][]} */ ([]);
  const keyOf = (/** @type {number} */ t) => m.tiles[Math.floor(t / m.width)][t % m.width].key;
  const border = (/** @type {number} */ a, /** @type {number} */ b) => WORKS.includes(keyOf(a)) !== WORKS.includes(keyOf(b)) && keyOf(a) !== 'tile_stairs' && keyOf(b) !== 'tile_stairs';
  const walk = (/** @type {number} */ r, /** @type {number} */ c) => r < m.height && c < m.width && m.tiles[r][c].passable === 'ALL';
  for (let t = 0; t < m.width * m.height; t++) {
    const r = Math.floor(t / m.width), c = t % m.width;
    if (walk(r + 1, c) && walk(r, c) && border(t, t + m.width)) out.push([t, t + m.width]);
    if (walk(r, c + 1) && walk(r, c) && border(t, t + 1)) out.push([t, t + 1]);
  }
  return out;
}

test('[地图-2] the 工事 levels: every edge between a 工事 and a walkable tile neither 工事 nor 云梯 is closed to ground units, and every ground route still connects', () => {
  for (const [id, lv] of /** @type {[string, any][]} */ ([['act1multi_06', LEVELS.act1multi_06], ['act1multi_hard-02', hard02]])) {
    const m = lv.level, k = (/** @type {{ row: number, col: number }} */ p) => p.row * m.width + p.col, borders = worksBorders(m);
    assert.ok(borders.length > 25, `${id}: ${borders.length} edges between 工事 and the ground`);
    for (const [a, b] of borders) assert.ok(!paths.crossable(m, a, b, false), `${id}: tiles ${a} | ${b}`);
    for (const route of m.routes.filter((/** @type {any} */ r) => r.motion === 'WALK')) {
      const pts = [route.start, ...route.checkpoints.filter((/** @type {any} */ p) => p.type === 'MOVE'), route.end];
      for (let j = 1; j < pts.length; j++) assert.ok(paths.routeTiles(m, k(pts[j - 1]), k(pts[j])), `${id}: ${JSON.stringify(pts[j - 1])} → ${JSON.stringify(pts[j])}`);
    }
  }
});

test('[装置-3] [装置-4] [地图-3] the official devices: 城防路障 immune to its statuses, 山海密语仪 the enemies\' with its blackboard\'s modifiers, 地形增伤控制 the 工事 rule; a device without a profile refused', () => {
  const { devices, missing, works } = profiledDevices(/** @type {any} */ (hard02).devices);
  assert.deepEqual([missing, works, Object.keys(devices)], [[], { dealt: 1.3, taken: 0.7 }, ['trap_097_hstone', 'trap_096_gflag']], '地形增伤控制 is the 工事 rule of the level, no unit');
  assert.deepEqual(devices.trap_097_hstone.immune, ['stun', 'freeze', 'cold', 'silence', 'sleep']);
  const flag = devices.trap_096_gflag;
  assert.deepEqual([flag.side, flag.enemyMods, flag.tauntLevel, flag.maxHp], ['ENEMY', { aspd: 25, moveMul: 1.15 }, -1, 6000]);
  const only = { ...hard02, devices: { trap_103_ymdgct: /** @type {any} */ (hard02).devices.trap_103_ymdgct, trap_x: {} }, enemies: {}, level: { ...hard02.level, waves: [] } };
  assert.throws(() => levelAt('x', 'NORMAL', undefined, { x: only }), /devices not supported yet: trap_x/);
  const ok = levelAt('x', 'NORMAL', undefined, { x: { ...only, devices: { trap_103_ymdgct: only.devices.trap_103_ymdgct } } });
  assert.deepEqual([ok.level.works, ok.devices], [{ dealt: 1.3, taken: 0.7 }, {}]);
  // a device the level never places — hidden, never activated, no card — needs none
  const unplaced = { ...only, level: { ...only.level, predefines: [...only.level.predefines, { alias: 'trap_x#1', key: 'trap_x', hidden: true, row: 0, col: 0, dir: 'UP' }] } };
  assert.deepEqual(levelAt('x', 'NORMAL', undefined, { x: unplaced }).devices, {});
  const activated = { ...unplaced, level: { ...unplaced.level, waves: [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions: [{ type: 'ACTIVATE', key: 'trap_x#1', count: 1, interval: 0, preDelay: 0, route: -1 }] }] }] } };
  assert.throws(() => levelAt('x', 'NORMAL', undefined, { x: activated }), /devices not supported yet: trap_x/);
});

test('[足球-12] 阵地屏障: a device of the enemies, immune to its statuses, blocking routes, a 0.9 square, ball damage × its damage_scale, none with no source', () => {
  const { devices, missing } = profiledDevices({ trap_154_mugtps: /** @type {any} */ (football).devices.trap_154_mugtps });
  assert.deepEqual(missing, []);
  const d = devices.trap_154_mugtps;
  assert.deepEqual([d.side, d.immune, d.routeBlock, d.square, d.ballDamage, d.envDamage, d.tauntLevel, d.maxHp],
    ['ENEMY', ['stun', 'silence', 'cold', 'freeze', 'sleep'], true, 0.9, 5, 0, -1, 50000]);
});
