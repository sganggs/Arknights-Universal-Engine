// 阵地足球锦标 (docs/spec/cup.md 锦标-1, 锦标-4): the event's levels as extracted — the manager, no co-op teams, the
// penalty shootout's waves —; the match rules on a small field of IG-FT-1's shape with the event's manager (one player,
// every player waits, the 再部署惩罚 grows, five net goals end it, a draw is no win); and PF-6's penalty shootout headless.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, damage, deployProblem, displacement, attrs, cup } from '@aue/sim';
import { LEVELS, matchContent } from '../src/index.js';
import { ballBehaviors, ALOFT } from '../src/ball.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').World} World */

const CUPS = Object.keys(LEVELS).filter((k) => k.startsWith('act1football_'));

test('[锦标-1] [锦标-4] [锦标-6] the 14 levels: the manager with its move speed, eight to deploy, the config mercy lead, kicker change and team type; the penalty shootout from the wave written penaltystart', () => {
  assert.equal(CUPS.length, 14);
  const training = new Set(['act1football_sub-1-1', 'act1football_sub-1-2']), noPenalty = new Set(['act1football_01', 'act1football_02', 'act1football_03', 'act1football_04', ...training]);
  for (const id of CUPS) {
    const lv = LEVELS[id].level, { moveSpeed, mercy, kickerDelta, teamType } = lv.football.cup;
    assert.deepEqual([moveSpeed, lv.options.characterLimit], [1.2, 8], id);
    assert.equal(mercy, training.has(id) || id === 'act1football_tr01' ? -1 : 5, id);
    assert.equal(kickerDelta, noPenalty.has(id) ? undefined : -4, id);
    assert.deepEqual([teamType, lv.football.teams.length], training.has(id) ? [id.endsWith('1') ? 1 : 2, id.endsWith('1') ? 3 : 4] : [-1, 0], id);
  }
  const at = (/** @type {string} */ id) => LEVELS[id].level.waves.flatMap((/** @type {any} */ x, /** @type {number} */ i) => (x.penalty ? [i] : []));
  assert.deepEqual([at('act1football_01'), at('act1football_05'), at('act1football_06'), at('act1football_ex04')], [[], [11], [11], [10]]);
  assert.equal(LEVELS['act1football_05'].level.waves.length, 17, 'the round that starts it and five more');
  assert.equal(LEVELS.act1multi_football.level.football.cup, undefined, 'IG-FT-1 is no 锦标 level');
  assert.equal(LEVELS.act1multi_football.level.football.teams.length, 4);
});

/** A tile of IG-FT-1's shape: rows 0 and 8 forbidden, our goal the column 0, theirs the column 12. @param {number} r @param {number} col */
function tileOf(r, col) {
  const edge = r === 0 || r === 8, key = edge ? 'tile_forbidden' : col === 0 ? 'tile_allygoal' : col === 12 ? 'tile_enemygoal' : 'tile_football';
  return { key, height: 'LOWLAND', buildable: key === 'tile_football' ? 'ALL' : 'NONE', passable: edge ? 'FLY_ONLY' : 'ALL', side: 'ALL' };
}
const TILES = Array.from({ length: 9 }, (_, r) => Array.from({ length: 13 }, (__, col) => tileOf(r, col)));

/** A 锦标 match on that field: a ball (RMA70's numbers) and a player of no team each kickoff; one operator. @param {number} [time] */
function content(time = 120) {
  const f = LEVELS.act1football_01.level.football;
  const routes = [{ start: { row: 4, col: 6 }, end: { row: 4, col: 6 }, motion: 'WALK', checkpoints: [] }, { start: { row: 2, col: 9 }, end: { row: 2, col: 9 }, motion: 'WALK', checkpoints: [] }];
  const wave = { preDelay: 0, postDelay: 0, maxWait: -1, tag: 0, fragments: [{ preDelay: 0, actions: [
    { type: 'SPAWN', key: 'ball', route: 0, count: 1, preDelay: 0.1, interval: 1 }, { type: 'SPAWN', key: 'player', route: 1, count: 1, preDelay: 0.2, interval: 1 }] }] };
  /** @type {import('@aue/sim').FoeBehavior} */
  const physic = { spawn: (ctx) => { ctx.ball({ friction: 0.7, restitution: 0.75, force: 450, need: 2300, block: 3, points: 1 }); } };
  const ball = { name: 'ball', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 1, massLevel: 1, baseAttackTime: 1, applyWay: 'NONE', talents: { physic: {} } };
  return /** @type {any} */ ({
    level: { id: 'cup', width: 13, height: 9, tiles: TILES, routes, waves: [wave], options: { maxLifePoint: 99, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 0.5 },
      football: { ...f, time } },
    enemies: { ball, player: { name: 'player', maxHp: 1e5, atk: 0, def: 0, res: 0, moveSpeed: 1, baseAttackTime: 3, applyWay: 'MELEE', talents: { football: {} } } },
    operators: { op: { name: 'op', position: 'MELEE', maxHp: 1e6, atk: 3000, def: 0, res: 0, cost: 10, blockCnt: 1, baseAttackTime: 1, respawnTime: 1, range: [{ row: 0, col: 1 }] } },
    behaviors: { foes: { physic } },
  });
}

/** Steps `n` frames, the events collected. @param {World} w @param {any} c @param {number} n @param {any[]} [cmds] */
function run(w, c, n, cmds = []) {
  const events = [];
  for (let i = 0; i < n; i++) events.push(...step(w, c, i === 0 ? cmds : []));
  return events;
}

/** Rolls the ball into a goal (足球-5): from in front of it, at 6 tiles a second. @param {World} w @param {'ours' | 'theirs'} which */
function shoot(w, which) {
  const b = /** @type {Unit} */ (w.units.find((u) => u.ball && !u.hidden));
  b.x = which === 'theirs' ? 10 : 2;
  b.y = 4;
  displacement.kickSlide(b, which === 'theirs' ? 1 : -1, 0, 6);
}

test('[锦标-1] every player waits at a kickoff; the 再部署惩罚 grows; five net goals end the match at once for the side ahead', () => {
  const c = content(), w = createWorld(c, { seed: 2, players: 1 });
  run(w, c, 10);
  const player = /** @type {Unit} */ (w.units.find((u) => u.key === 'player'));
  assert.equal(player.buffs.some((b) => b.key === 'kickoff'), true, 'no team, still a player that waits');
  run(w, c, 1, [[0, { type: 'deploy', op: 'op', row: 5, col: 3, dir: 0 }]]);
  run(w, c, 1, [[0, { type: 'retreat', unit: /** @type {Unit} */ (w.units.find((u) => u.kind === 0)).id }]]);
  assert.equal(w.players[0].cards.op.penalty, 1, 'no field bonus: one more layer (部署-3)');
  const st = /** @type {any} */ (w.football);
  st.home = 4;
  shoot(w, 'theirs');
  const events = run(w, c, 60);
  assert.deepEqual(events.filter((e) => e.type === 'end').map((e) => e.result), [1], 'the fifth goal ahead wins at once');
  assert.equal(w.result, 1);
  assert.ok(w.frame < st.until);
  const lost = createWorld(c, { seed: 2, players: 1 });
  run(lost, c, 10);
  /** @type {any} */ (lost.football).away = 4;
  shoot(lost, 'ours');
  run(lost, c, 60);
  assert.equal(lost.result, 0, 'five behind: lost at once');
});

test('[锦标-1] at the match time the side ahead wins; a draw with no penalty shootout is no win', () => {
  for (const [home, away, want] of [[1, 0, 1], [0, 0, 0], [1, 2, 0]]) {
    const c = content(2), w = createWorld(c, { seed: 4, players: 1 });
    run(w, c, 5);
    Object.assign(/** @type {any} */ (w.football), { home, away });
    const events = run(w, c, secondsToFrames(2));
    assert.deepEqual(events.filter((e) => e.type === 'end').map((e) => e.result), [want], `${home}:${away}`);
  }
});

const BUILD = { elite: 2, level: 90, potential: 1, trust: 100, skill: 0, skillLevel: 10 };
const DECK = ['char_010_chen', 'char_017_huang', 'char_1013_chen2', 'char_293_thorns', 'char_102_texas', 'char_148_nearl', 'char_103_angel', 'char_002_amiya'];

/** PF-6 for one player with eight operators, stepped to its penalty shootout's first round, with cost to deploy them. */
async function pf6() {
  const c = await matchContent({ level: 'act1football_06', difficulty: 'NORMAL', seed: 3, decks: [DECK.map((id) => ({ id, build: BUILD }))] });
  const w = createWorld(c, { seed: 3, players: 1 });
  const events = run(w, c, secondsToFrames(3) + 2);
  // the first round's ball comes after the banners' gap (锦标-4)
  events.push(...run(w, c, cup.FIRST_GAP));
  w.players[0].cost = 99;
  return { c, w, events };
}

/** The penalty ball on the field. @param {World} w */
const penaltyBall = (w) => /** @type {Unit} */ (w.units.find((u) => u.ball && u.key === 'enemy_4064_mupenb' && !u.hidden));

test('[锦标-4] a draw at PF-6\'s three seconds: the shootout begins with our round, at most four kickers', async () => {
  const { c, w, events } = await pf6();
  assert.deepEqual(events.filter((e) => e.type === 'penalty'), [{ type: 'penalty', round: 0, goal: -1 }]);
  assert.equal(w.sched.wave, 11, 'the wave written penaltystart');
  assert.equal(w.football?.pk?.begun, secondsToFrames(3) + cup.FIRST_GAP, 'the first round begins the banners\' gap after the match time');
  const b = penaltyBall(w);
  assert.ok(b && b.ball?.countdown === (w.football?.pk?.begun ?? 0) + secondsToFrames(10), 'our ball counts down ten seconds');
  assert.equal(cup.countdownEnd(w), b.ball?.countdown, 'the frame it is over, for the battle UI');
  const free = [[2, 4], [2, 6], [3, 4], [6, 4], [6, 6]];
  free.slice(0, 4).forEach(([row, col], i) => run(w, c, 1, [[0, { type: 'deploy', op: `${DECK[i]}#0`, row, col, dir: 0 }]]));
  assert.equal(w.units.filter((u) => u.kind === 0).length, 4);
  assert.equal(deployProblem(w, c, 0, { type: 'deploy', op: `${DECK[4]}#0`, row: free[4][0], col: free[4][1], dir: 0 }), 'deploy limit reached');
});

test('[锦标-4] our round: hits are summed and kick nothing until the countdown ends; then the ball goes along their sum at its force', async () => {
  const { c, w } = await pf6();
  const b = penaltyBall(w), end = /** @type {number} */ (b.ball?.countdown);
  run(w, c, 1, [[0, { type: 'deploy', op: `${DECK[0]}#0`, row: Math.round(b.y), col: Math.round(b.x) - 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.kind === 0));
  damage.dealDamage(w, op, b, { type: 'phys', amount: 600 }, c);
  run(w, c, end - w.frame);
  assert.ok(!b.slide && (b.ball?.sum ?? 0) >= 500, 'past its threshold, still at rest');
  run(w, c, 1);
  const slide = /** @type {{ vx: number, vy: number } | undefined} */ (/** @type {any} */ (b).slide);
  assert.ok(slide && slide.vx > 0 && Math.abs(slide.vy) < 1e-9, 'kicked away from the kicker, toward their goal');
  assert.ok(Math.abs(Math.hypot(slide.vx, slide.vy) - 6) < 1e-6, 'at its force 600');
});

test('[锦标-4] a round with no kick ends at the countdown; their round: our hits count for nothing, their shot comes at the touch, a goalkeeper\'s catch is no card', async () => {
  const { c, w } = await pf6();
  const end = /** @type {number} */ (penaltyBall(w).ball?.countdown);
  const events = run(w, c, end - w.frame + 2);
  assert.deepEqual(events.filter((e) => e.type === 'penalty').map((e) => [e.round, e.goal]), [[0, 0], [1, -1]], 'missed: their round next');
  assert.equal(penaltyBall(w), undefined, 'their round waits for the banners');
  run(w, c, cup.NEXT_GAP);
  const b = penaltyBall(w), spots = w.units.filter((u) => u.spot);
  assert.ok(b, `their ball ${cup.NEXT_GAP} frames on`);
  spots.forEach((s, i) => {
    w.players[0].cost = 99;
    run(w, c, 1, [[0, { type: 'deploy', op: `${DECK[i]}#0`, row: Math.round(s.y), col: Math.round(s.x), dir: 0 }]]);
  });
  assert.equal(w.units.filter((u) => u.kind === 0).length, spots.length, 'goalkeepers on every 守门位');
  damage.dealDamage(w, /** @type {Unit} */ (w.units.find((u) => u.kind === 0)), b, { type: 'phys', amount: 5000 }, c);
  assert.equal(b.ball?.sum, 0, 'their round: nothing summed');
  let touched = -1;
  for (let i = 0; i < 30 * 30 && !b.slide; i++) {
    run(w, c, 1);
    const shooter = w.units.find((u) => u.key.includes('mushtm'));
    if (touched < 0 && shooter && Math.hypot(shooter.x - b.x, shooter.y - b.y) <= 0.2) touched = w.frame;
  }
  assert.ok(touched > 0 && b.slide && w.frame - touched <= 1, 'shot at the touch');
  const rest = run(w, c, 30 * 6);
  assert.deepEqual(rest.filter((e) => e.type === 'penalty').map((e) => [e.round, e.goal]).slice(0, 2), [[1, 0], [2, -1]], 'their shot stopped');
  assert.equal(w.players[0].balls, undefined, 'no ball card in a shootout');
});

test('[锦标-4] six rounds, then the side with more goals in all wins; with none of ours it is their win', async () => {
  const { c, w } = await pf6();
  const events = run(w, c, 30 * 120);
  assert.deepEqual(events.filter((e) => e.type === 'penalty' && Number(e.goal) >= 0).map((e) => e.round), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(events.filter((e) => e.type === 'penalty' && e.goal === -1).map((e) => e.round), [1, 2, 3, 4, 5], 'the first began before; no seventh begins');
  assert.equal(w.football?.pk?.begun, -1);
  assert.deepEqual(events.filter((e) => e.type === 'end').map((e) => e.result), [0]);
  const st = /** @type {any} */ (w.football);
  assert.ok(st.away > st.home, `their goals ${st.away}, ours ${st.home}`);
  assert.deepEqual(st.pk.shots, events.filter((e) => e.type === 'penalty' && Number(e.goal) >= 0).map((e) => e.goal), 'each round\'s result noted in order');
});

test('[锦标-5] 充能飘浮球 is aloft — 近地悬浮, an air unit — while it rolls faster than its min_speed, and lands as it slows', () => {
  const c = content();
  c.enemies.ball.talents = { physic: { friction_factor: 0.4, restitution_factor: 1, value: 5000, force: 400 }, flyBySpeed: { min_speed: 0.8, max_speed: 5, max_height: 2 } };
  c.behaviors = { foes: { physic: ballBehaviors.physic, flyBySpeed: ballBehaviors.flyBySpeed } };
  const w = createWorld(c, { seed: 2, players: 1 });
  run(w, c, 10);
  const b = /** @type {Unit} */ (w.units.find((u) => u.ball));
  assert.equal(attrs.statsOf(b).flying, false, 'at rest on the ground');
  displacement.kickSlide(b, 0, 1, 4);
  run(w, c, 2);
  assert.ok(b.buffs.some((x) => x.key === ALOFT) && attrs.statsOf(b).flying, 'rolling at 4 tiles a second: aloft');
  let landed = -1;
  for (let i = 0; i < 90 && landed < 0; i++) {
    run(w, c, 1);
    if (!attrs.statsOf(b).flying) landed = w.frame;
  }
  const s = /** @type {any} */ (b).slide;
  assert.ok(landed > 0 && (!s || Math.hypot(s.vx, s.vy) <= 0.8 + 0.2), 'down again about when it slows to 0.8');
});

test('[锦标-7] the 14 levels carry the two relics; as a seat\'s runes they cut its 再部署时间 by 30% and give 10 initial SP', async () => {
  const relics = LEVELS.act1football_05.level.football.cup.relics;
  assert.deepEqual(relics.map((/** @type {any} */ r) => [r.id, r.name, r.unlockedBy]), [['act1football_relic_01', '体能充沛', 'act1football_s01'], ['act1football_relic_02', '技艺精湛', 'act1football_s02']]);
  const build = { elite: 2, level: 90, potential: 1, trust: 0, skill: 1, skillLevel: 7 }, decks = [[{ id: 'char_010_chen', build }]];
  const plain = await matchContent({ level: 'act1football_05', difficulty: 'NORMAL', seed: 1, decks });
  const fit = await matchContent({ level: 'act1football_05', difficulty: 'NORMAL', seed: 1, decks, runes: [relics.flatMap((/** @type {any} */ r) => r.runes)] });
  const a = plain.operators['char_010_chen#0'], b = fit.operators['char_010_chen#0'];
  assert.ok(Math.abs(/** @type {number} */ (b.respawnTime) - /** @type {number} */ (a.respawnTime) * 0.7) < 1e-9, 'respawn × 0.7');
  assert.equal(/** @type {any} */ (b).skill.init - /** @type {any} */ (a).skill.init, 10, 'initial SP + 10');
});
