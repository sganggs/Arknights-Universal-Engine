// 阵地足球锦标's stadiums and teams (docs/spec/cup.md 锦标-2, 锦标-3): each level's stadium and what it enables;
// 冻人冬日's ice and speed and 旋旋风暴's wind in their levels headless; 超强对流's lightning, 智能裁判官, 直球队, 门神会
// and 魔球帮 on a small field of IG-FT-1's shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, attrs, displacement, cup, THUNDER_PHASE } from '@aue/sim';
import { LEVELS, levelAt, matchContent } from '../src/index.js';
import { ballBehaviors } from '../src/ball.js';
import { footballerBehaviors, AWAIT } from '../src/footballers.js';
import { blinkBehaviors } from '../src/blink.js';
import { THUNDER } from '../src/cup.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').World} World */

/** Steps `n` frames, the events collected. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  const events = [];
  for (let i = 0; i < n; i++) events.push(...step(w, c));
  return events;
}

test('[锦标-2] each level\'s stadium by its config\'s stadium type, the waves\' group it enables; PF-S-1 and PF-S-2 draw one of five by weight', () => {
  const name = (/** @type {string} */ id) => levelAt(id, 'NORMAL').level.football?.cup?.stadium?.name;
  assert.deepEqual(['01', '02', '03', '04', '06', '07', 'ex02', 'ex03'].map((x) => name(`act1football_${x}`)), ['plain', 'whirlwind', 'thunder', 'winter', 'winter', 'smart', 'thunder', 'whirlwind']);
  assert.deepEqual([levelAt('act1football_02', 'NORMAL').level.hiddenGroups, levelAt('act1football_07', 'NORMAL').level.hiddenGroups], [['whirlwind'], ['catchball']]);
  assert.deepEqual(levelAt('act1football_04', 'NORMAL').level.football?.cup?.stadium, { name: 'winter', ice: -0.3, moveMul: 1.2 });
  const s1 = /** @type {any} */ (levelAt('act1football_sub-1-1', 'NORMAL'));
  assert.deepEqual(s1.level.football.cup.stadiums.map((/** @type {any} */ x) => x.name), ['plain', 'winter', 'thunder', 'smart', 'whirlwind']);
  const drawn = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const w = createWorld(/** @type {any} */ ({ ...s1, operators: {}, behaviors: {} }), { seed, players: 1 });
    const i = /** @type {number} */ (w.football?.stadium);
    drawn.add(i);
    const group = s1.level.football.cup.stadiums[i].group;
    assert.equal(cup.actingGroups(w, s1).includes(group), group !== undefined, `seed ${seed}`);
  }
  assert.equal(drawn.size, 5, 'all five come up');
  const level = (/** @type {string} */ id) => THUNDER.indexOf(/** @type {any} */ (levelAt(id, 'NORMAL').level.football?.cup)?.stadium?.thunder);
  assert.deepEqual([level('act1football_03'), level('act1football_ex02')], [0, 1], '超强对流 Lv1 in PF-3, Lv2 in PF-EX-2');
  assert.equal(s1.level.football.cup.stadiums[2].thunder, THUNDER[2], 'and Lv3 drawn in 特训赛');
});

test('[锦标-2] 冻人冬日: every field tile iced at the kickoff, the enemies a fifth faster', async () => {
  const c = await matchContent({ level: 'act1football_04', difficulty: 'NORMAL', seed: 3, decks: [[]] }), w = createWorld(c, { seed: 3, players: 1 });
  run(w, c, 60);
  const field = c.level.tiles.flat().filter((t) => t?.key === 'tile_football').length;
  assert.deepEqual([Object.keys(w.football?.cover ?? {}).length, new Set(Object.values(w.football?.cover ?? {})).size], [field, 1]);
  assert.equal(Object.values(w.football?.cover ?? {})[0], -0.3);
  for (const e of w.units.filter((u) => u.kind === 1 && !u.ball && !u.spot)) {
    assert.ok(Math.abs(attrs.statsOf(e).moveSpeed - c.enemies[e.key].moveSpeed * 1.2) < 1e-9, e.key);
  }
});

test('[锦标-2] 旋旋风暴: the tornado lifts the enemies within its radius while they are there, not the ball', async () => {
  const c = await matchContent({ level: 'act1football_02', difficulty: 'NORMAL', seed: 3, decks: [[]] }), w = createWorld(c, { seed: 3, players: 1 });
  let lifted = 0, ballLifted = false, lingered = 0;
  /** @type {Map<number, number>} the frame each enemy was last within a tornado's radius */
  const near = new Map();
  for (let i = 0; i < 30 * 30; i++) {
    run(w, c, 1);
    const winds = w.units.filter((u) => u.key === 'enemy_4067_mucycl');
    for (const u of w.units.filter((x) => x.kind === 1 && x.key !== 'enemy_4067_mucycl')) {
      if (winds.some((t) => (t.x - u.x) * (t.x - u.x) + (t.y - u.y) * (t.y - u.y) <= 1.2 * 1.2)) near.set(u.id, w.frame);
      if (!u.buffs.some((b) => b.key === 'wind')) continue;
      if (u.ball) ballLifted = true;
      if (near.get(u.id) === w.frame) lifted += 1; else lingered = Math.max(lingered, w.frame - (near.get(u.id) ?? -99));
    }
  }
  assert.ok(lifted > 0, 'some enemy lifted in the wind');
  assert.equal(ballLifted, false);
  assert.ok(lingered <= 2, `lifted at most two frames after it left: ${lingered}`);
});

/** A tile of IG-FT-1's shape. @param {number} r @param {number} col */
function tileOf(r, col) {
  const edge = r === 0 || r === 8, key = edge ? 'tile_forbidden' : col === 0 ? 'tile_allygoal' : col === 12 ? 'tile_enemygoal' : 'tile_football';
  return { key, height: 'LOWLAND', buildable: key === 'tile_football' ? 'ALL' : 'NONE', passable: edge ? 'FLY_ONLY' : 'ALL', side: 'ALL' };
}

/**
 * A 锦标 field with a ball at (6, 4) and the given players, each waiting where it spawned, and an optional device.
 * @param {Record<string, any>} players by key: { at: [row, col], talents, skills } @param {any} [device]
 */
function field(players, device) {
  const keys = Object.keys(players);
  // each player waits where it spawned, its end our goal (a route ending where it starts would leave at once)
  const routes = [{ start: { row: 4, col: 6 }, end: { row: 4, col: 6 }, motion: 'WALK', checkpoints: [] }, ...keys.map((k) => {
    const [row, col] = players[k].at;
    return { start: { row, col }, end: { row, col: 0 }, motion: 'WALK', checkpoints: [{ type: 'WAIT_FOR_SECONDS', row, col, time: 999, dx: 0, dy: 0 }] };
  })];
  const actions = [{ type: 'SPAWN', key: 'ball', route: 0, count: 1, preDelay: 0, interval: 1 }, ...keys.map((k, i) => ({ type: 'SPAWN', key: k, route: i + 1, count: 1, preDelay: 0, interval: 1 }))];
  const f = { ...LEVELS.act1football_01.level.football, wait: 0, time: 600 };
  const enemy = (/** @type {any} */ p) => ({ name: 'p', maxHp: 1e5, atk: 0, def: 0, res: 0, moveSpeed: 1, baseAttackTime: 3, applyWay: 'MELEE', ...p });
  return /** @type {any} */ ({
    level: { id: 'cup', width: 13, height: 9, tiles: Array.from({ length: 9 }, (_, r) => Array.from({ length: 13 }, (__, col) => tileOf(r, col))), routes,
      waves: [{ preDelay: 0, postDelay: 0, maxWait: -1, tag: 0, fragments: [{ preDelay: 0, actions }] }],
      options: { maxLifePoint: 99, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 0.5 }, football: f,
      predefines: device ? [{ alias: 'ref#0', key: 'ref', hidden: false, row: 4, col: 6, dir: 'RIGHT' }] : [] },
    enemies: { ball: { name: 'ball', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 1, massLevel: 1, baseAttackTime: 1, applyWay: 'NONE', talents: { physic: { friction_factor: 0.7, restitution_factor: 0.75, value: 2300, force: 450 } } },
      ...Object.fromEntries(keys.map((k) => [k, enemy({ talents: players[k].talents, skills: players[k].skills })])) },
    operators: {}, devices: device ? { ref: device } : {},
    behaviors: { foes: { physic: ballBehaviors.physic, ...footballerBehaviors, blink: blinkBehaviors.blink } },
  });
}

/** The ball. @param {World} w */
const ballOf = (w) => /** @type {Unit} */ (w.units.find((u) => u.ball));

/** A ball's slide and its speed, 0 when it lies still. @param {Unit} b */
function slideOf(b) {
  const s = /** @type {any} */ (b).slide;
  return { s, v: s ? Math.hypot(s.vx, s.vy) : 0 };
}

test('[锦标-2] 智能裁判官 takes a ball near it: dragged in and gone, then shot out from its tile into its right half at the ball\'s force × 1.35', () => {
  const ref = { name: 'ref', maxHp: 1000, atk: 0, def: 0, res: 0, blockCnt: 0, baseAttackTime: 3, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {}, referee: { radius: 1.5, every: 3, force: 1.35 } };
  const c = field({}, ref);
  c.level.routes[0].start = c.level.routes[0].end = { row: 4, col: 5 };
  const w = createWorld(c, { seed: 4, players: 1 });
  const casts = run(w, c, 2).filter((e) => e.type === 'cast');
  const b = ballOf(w), d = /** @type {Unit} */ (w.units.find((u) => u.key === 'ref'));
  assert.ok(b.ball?.ref, 'taken at once: 1 tile away');
  assert.deepEqual([...casts], [{ type: 'cast', id: d.id, n: 1 }], 'taking it is its first ability');
  run(w, c, secondsToFrames(0.3));
  assert.ok(b.hidden && Math.abs(b.x - d.x) < 1e-9, 'dragged to its centre, gone');
  for (let i = 0; i < 60 && b.hidden; i++) casts.push(...run(w, c, 1).filter((e) => e.type === 'cast'));
  assert.deepEqual(casts.map((e) => e.n), [1, 2], 'shooting it out its second');
  const { s, v } = slideOf(b), v0 = 450 * 1.35 * 0.01;
  assert.ok(!b.hidden && s && s.vx >= 0, 'back and shot into its right half');
  assert.ok(v <= v0 + 1e-9 && v > v0 - 0.5, `at the ball's force × 1.35: ${v}`);
  assert.equal(b.ball?.ref, undefined);
});

const FWD = (/** @type {Record<string, number>} */ extra) => ({ football: { passing_force: 1.2, slapshot_force: 1.5, ...extra }, searchBall: { range_radius: 3 } });
const SKILLS = [{ key: 'slapshot', cooldown: 2, initCooldown: 0, sp: 0, bb: {} }, { key: 'passtheball', cooldown: 2, initCooldown: 0, sp: 0, bb: {} }];

test('[锦标-3] 直球队: the shot goes straight along the row toward our side', () => {
  const c = field({ fwd: { at: [5, 7], talents: FWD({ flat: 1 }), skills: SKILLS } }), w = createWorld(c, { seed: 2, players: 1 });
  run(w, c, 1);
  for (let i = 0; i < 30 * 10 && !ballOf(w).slide; i++) run(w, c, 1);
  const s = /** @type {any} */ (ballOf(w)).slide;
  assert.ok(s && s.vx < 0 && s.vy === 0, 'flat, toward column 0');
});

test('[锦标-3] 门神会: the forward passes to the goalkeeper, which stays where it is until the ball is within its reach', () => {
  const keeper = { football: { clearance_force: 2, tile_col_end: 9, defence: 0.5, aim: 1 }, searchBall: { range_radius: 3 } };
  const c = field({ fwd: { at: [4, 7], talents: FWD({ toKeeper: 1 }), skills: SKILLS }, gk: { at: [6, 10], talents: keeper, skills: [{ key: 'clearance', cooldown: 0, initCooldown: 0, sp: 0, bb: {} }] } });
  const w = createWorld(c, { seed: 2, players: 1 });
  run(w, c, 1);
  for (let i = 0; i < 30 * 10 && !ballOf(w).slide; i++) run(w, c, 1);
  const gk = /** @type {Unit} */ (w.units.find((u) => u.key === 'gk')), s = /** @type {any} */ (ballOf(w)).slide, x0 = gk.x;
  assert.ok(s && s.vx > 0, 'passed back toward the goalkeeper');
  assert.ok(gk.buffs.some((b) => b.key === AWAIT), 'the goalkeeper waits');
  run(w, c, 10);
  assert.equal(gk.x, x0, 'not moving while it waits');
});

test('[锦标-3] 魔球帮: off its cooldown, moving on its own, it jumps onto a ball within max_dist, then waits blink_cd', () => {
  const c = field({ fwd: { at: [4, 8], talents: { ...FWD({}), blink: { min_dist: 0.7, max_dist: 2.5, blink_cd: 15 } }, skills: SKILLS } });
  const w = createWorld(c, { seed: 2, players: 1 });
  run(w, c, 1);
  const fwd = /** @type {Unit} */ (w.units.find((u) => u.key === 'fwd')), b = ballOf(w);
  assert.ok(Math.abs(fwd.x - 6) < 1e-9 && Math.abs(fwd.y - 4) < 1e-9, `jumped the two tiles onto the ball: ${fwd.x}, ${fwd.y}`);
  displacement.kickSlide(b, 0, 1, 6);
  run(w, c, 30);
  const y = fwd.y;
  run(w, c, 30);
  assert.ok(Math.abs(fwd.y - y) < 0.5 * 1 + 0.05, 'no second jump within 15 s: it walks');
});

test('[锦标-2] 超强对流: 20 s after the ball came on, a warning; 2 s on, the bolt — damage and a stun within 1.0 —; then 10 s of burning within 1.5', () => {
  const c = field({ near: { at: [4, 7] }, mid: { at: [5, 7] }, far: { at: [4, 8] } });
  c.level.football = { ...c.level.football, cup: { moveSpeed: 1.2, stadium: { name: 'thunder', thunder: THUNDER[0] } } };
  const w = createWorld(c, { seed: 1, players: 1 }), by = (/** @type {string} */ k) => /** @type {Unit} */ (w.units.find((u) => u.key === k));
  const at = (/** @type {number} */ phase) => (/** @type {any[]} */ ev) => ev.some((e) => e.type === 'thunder' && e.phase === phase);
  const born = w.frame + 1, warned = run(w, c, secondsToFrames(20));
  assert.ok(!at(THUNDER_PHASE.warn)(warned) && at(THUNDER_PHASE.warn)(run(w, c, 1)), `the warning at ${w.frame - born} frames`);
  run(w, c, secondsToFrames(2) - 1);
  assert.ok(at(THUNDER_PHASE.strike)(run(w, c, 1)), 'the bolt 2 s on');
  assert.deepEqual(['near', 'mid', 'far'].map((k) => 1e5 - by(k).hp), [5000, 0, 0], 'the enemies within 1.0: 5000');
  assert.ok(by('near').buffs.some((b) => b.key === 'stun' && b.left === secondsToFrames(5)), 'stunned 5 s');
  const burned = run(w, c, secondsToFrames(10));
  assert.deepEqual(['near', 'mid', 'far'].map((k) => 1e5 - by(k).hp), [10000, 5000, 0], 'then 500 a second within 1.5, ten times');
  assert.ok(at(THUNDER_PHASE.over)(burned));
});

test('[锦标-6] 特训赛: a team of the level\'s type drawn by weight; the standard team\'s players the waves name become its, their `_2` its elite', async () => {
  const c = await matchContent({ level: 'act1football_sub-1-2', difficulty: 'NORMAL', seed: 1, decks: [[]] }), teams = c.level.football?.teams ?? [];
  assert.deepEqual(teams.map((t) => t.name), ['hurrier', 'kungfuer', 'superer', 'bigbroer']);
  const drawn = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const w = createWorld(c, { seed, players: 1 }), team = teams[/** @type {number} */ (w.football?.team)];
    drawn.add(team.name);
    run(w, c, 30);
    const players = w.units.filter((u) => u.kind === 1 && /_(mumssi|mubufn|mugnfu|mu[a-z]{3}[mbg])(_2)?$/.test(u.key) && !u.ball);
    const ours = new Set([...Object.values(team.players), ...Object.values(team.elite ?? {})]);
    assert.ok(players.length > 0 && players.every((u) => ours.has(u.key)), `seed ${seed}: ${players.map((u) => u.key)}`);
  }
  assert.ok(drawn.size >= 3, `more than one team comes up: ${[...drawn]}`);
});
