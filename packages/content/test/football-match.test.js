// 阵地足球's match (docs/spec/football.md 足球-6…足球-8): the team drawn by weight and its players in place of the
// standard team's, each kickoff's layout by the lead, the players' wait, a goal — its points, the field cleared, our
// operators back to the deck with no more 再部署惩罚 — the next kickoff, and the match's end with its stamps. The settings
// are IG-FT-1's as extracted; the field is a small one of the same shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, damage, displacement, football as fb } from '@aue/sim';
import football from '../data/levels/act1multi_football.json' with { type: 'json' };

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').World} World */
/** @typedef {NonNullable<import('@aue/sim').Content['level']['football']>} FootballRules */

const { kickoffLevel, kickoffWave, footballStamps } = fb, { dealDamage } = damage;

const RULES = /** @type {FootballRules} */ (/** @type {unknown} */ (football.level.football));

/** @param {string} key @param {string} passable @param {string} [buildable] */
const tile = (key, passable, buildable = 'ALL') => ({ key, height: 'LOWLAND', buildable, passable, side: 'ALL' });

/** IG-FT-1's shape: rows 0 and 8 forbidden, our goal the column 0, theirs the column 12. */
const TILES = Array.from({ length: 9 }, (_, r) => Array.from({ length: 13 }, (__, col) => (r === 0 || r === 8 ? tile('tile_forbidden', 'FLY_ONLY', 'NONE')
  : col === 0 ? tile('tile_allygoal', 'ALL', 'NONE') : col === 12 ? tile('tile_enemygoal', 'ALL', 'NONE') : tile('tile_football', 'ALL'))));

const BALL = { name: 'ball', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 1, massLevel: 1, baseAttackTime: 1, applyWay: 'NONE', talents: { physic: {} } };
const PLAYER = { name: 'player', maxHp: 1e5, atk: 0, def: 0, res: 0, moveSpeed: 1, baseAttackTime: 3, applyWay: 'MELEE' };

/**
 * A 阵地足球 content: a wave of each tag 0…9 with a ball on route `tag` (row 4, column 6 + tag − 4 … kept on the field)
 * and the standard forward; a gold ball's wave of tag 0 when `gold`. The ball behaviour gives the RMA70's numbers.
 * @param {{ gold?: boolean }} [o]
 */
function content(o = {}) {
  const routes = Array.from({ length: 10 }, (_, t) => ({ start: { row: 4, col: 2 + t }, end: { row: 4, col: 2 + t }, motion: 'WALK', checkpoints: [] }));
  const wave = (/** @type {number} */ tag) => ({ preDelay: 0, postDelay: 0, maxWait: -1, tag, fragments: [{ preDelay: 0, actions: [
    { type: 'SPAWN', key: o.gold && tag === 0 ? 'gold' : 'ball', route: tag, count: 1, preDelay: 0.1, interval: 1 },
    { type: 'SPAWN', key: 'enemy_4012_mumssi', route: tag, count: 1, preDelay: 0.2, interval: 1 }] }] });
  const players = Object.fromEntries(RULES.teams.flatMap((t) => Object.values(t.players)).map((k) => [k, { ...PLAYER, name: k }]));
  /** @type {import('@aue/sim').FoeBehavior} */
  const physic = { spawn: (ctx) => { ctx.ball({ friction: 0.7, restitution: 0.75, force: 450, need: 2300, block: 3, points: ctx.self.key === 'gold' ? 3 : 1 }); } };
  return /** @type {any} */ ({
    level: { id: 'ft', width: 13, height: 9, tiles: TILES, routes, waves: Array.from({ length: 10 }, (_, t) => wave(t)),
      options: { maxLifePoint: 99, initialCost: 30, maxCost: 99, costIncreaseTime: 0.85, characterLimit: 4, moveMultiplier: 0.5 }, football: RULES },
    enemies: { ball: BALL, gold: { ...BALL, name: 'gold' }, ...players },
    operators: { op: { name: 'op', position: 'MELEE', maxHp: 1e6, atk: 3000, def: 0, res: 0, cost: 10, blockCnt: 1, baseAttackTime: 1, respawnTime: 10, range: [{ row: 0, col: 1 }] } },
    behaviors: { foes: { physic } },
  });
}

/** Steps `n` frames, the events collected. @param {any} w @param {any} c @param {number} n @param {any[]} [cmds] */
function run(w, c, n, cmds = []) {
  const events = [];
  for (let i = 0; i < n; i++) events.push(...step(w, c, i === 0 ? cmds : []));
  return events;
}

const ballOf = (/** @type {any} */ w) => /** @type {Unit | undefined} */ (w.units.find((/** @type {Unit} */ u) => u.ball));

test('[足球-6] the kickoff level by the lead: the last entry the lead reaches; below 0 as 0', () => {
  assert.deepEqual([-3, 0, 1, 5, 6, 7, 8, 9, 10, 99].map((lead) => kickoffLevel(RULES, lead)), [0, 0, 1, 5, 6, 6, 7, 7, 8, 8]);
});

test('[足球-6] the team is drawn by weight once; the standard team\'s player spawns as the drawn team\'s player of its role', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const c = content(), w = createWorld(c, { seed, players: 1 });
    const team = RULES.teams[/** @type {any} */ (w.football).team];
    run(w, c, 10);
    const forward = w.units.find((u) => !u.ball && u.kind === 1);
    assert.equal(forward?.key, team.players.forward, `seed ${seed}`);
    seen.add(team.name);
  }
  assert.deepEqual([...seen].toSorted(), ['hurrier', 'kungfuer', 'normal', 'shooter'], 'each of the four teams, by equal weights');
});

test('[足球-6] a kickoff\'s layout: a tag by the weights of the lead\'s level, never one of weight 0', () => {
  const c = content(), w = createWorld(c, { seed: 7, players: 1 }), st = /** @type {any} */ (w.football);
  for (const [home, away] of [[0, 0], [0, 3], [2, 0], [9, 0]]) {
    st.home = home; st.away = away;
    const weights = RULES.weights[String(kickoffLevel(RULES, home - away))], tags = new Set();
    for (let i = 0; i < 400; i++) tags.add(c.level.waves[kickoffWave(w, c, w.frame)].tag);
    for (const t of tags) assert.ok(weights[t] > 0, `lead ${home - away}: tag ${t}`);
    assert.equal(tags.size, weights.filter((x) => x > 0).length, `lead ${home - away}: every tag of weight above 0 comes`);
  }
});

test('[足球-6] the players wait 3 s after the kickoff: they neither walk nor attack; the ball is free at once', () => {
  const c = content(), w = createWorld(c, { seed: 3, players: 1 });
  run(w, c, 10);
  const p = /** @type {Unit} */ (w.units.find((u) => !u.ball && u.kind === 1)), until = secondsToFrames(RULES.wait);
  assert.equal(p.buffs.find((b) => b.key === 'kickoff')?.flags.root, true, 'spawned at 0.2 s, held');
  assert.equal(ballOf(w)?.buffs.some((b) => b.key === 'kickoff'), false);
  run(w, c, until - w.frame);
  assert.equal(w.frame, until);
  assert.equal(p.buffs.some((b) => b.key === 'kickoff'), true, 'still held before the frame kickoff + 3 s');
  run(w, c, 1);
  assert.equal(p.buffs.some((b) => b.key === 'kickoff'), false, 'free on the frame kickoff + 3 s');
});

test('[足球-7] [足球-8] a goal: its side scores, the field is cleared, our operators retreat with no more 再部署惩罚, and the next kickoff comes', () => {
  const c = content(), w = createWorld(c, { seed: 5, players: 1 });
  run(w, c, 10);
  // the ball put two tiles before their goal: one kick rolls it about three
  const ball = /** @type {Unit} */ (ballOf(w));
  ball.x = 10;
  const br = Math.round(ball.y);
  const events = run(w, c, 1, [[0, { type: 'deploy', op: 'op', row: br, col: 9, dir: 1 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.kind === 0));
  assert.ok(op && events.some((e) => e.type === 'deploy'));
  const penalty = w.players[0].cards.op?.penalty ?? 0;
  dealDamage(w, op, ball, { type: 'phys', amount: 2300 }, c);
  const after = run(w, c, 120);
  assert.deepEqual(after.filter((e) => e.type === 'score').map((e) => e.goal), [1], 'into their goal');
  assert.deepEqual([w.football?.home, w.football?.away], [1, 0]);
  assert.equal(w.units.some((u) => u.id === op.id), false, 'our operator retreated');
  assert.equal(w.players[0].cards.op.penalty, penalty, 'no more 再部署惩罚 (足球-8)');
  assert.ok(after.filter((e) => e.type === 'wave').length >= 1, 'the next kickoff');
  assert.ok(ballOf(w), 'a ball again');
});

test('[足球-7] 至纯源石球 scores three; a ball in our goal scores for them', () => {
  const c = content({ gold: true });
  let done = false;
  for (let seed = 1; seed < 60 && !done; seed++) {
    const w = createWorld(c, { seed, players: 1 });
    run(w, c, 10);
    const ball = /** @type {Unit} */ (ballOf(w));
    if (ball.key !== 'gold') continue;
    run(w, c, 1, [[0, { type: 'deploy', op: 'op', row: Math.round(ball.y), col: Math.round(ball.x) + 1, dir: 3 }]]);
    const op = /** @type {Unit} */ (w.units.find((u) => u.kind === 0));
    dealDamage(w, op, ball, { type: 'phys', amount: 2300 }, c);
    run(w, c, 150);
    assert.deepEqual([w.football?.home, w.football?.away], [0, 3]);
    done = true;
  }
  assert.ok(done, 'a seed whose first kickoff is the gold ball\'s');
});

test('[足球-7] the match ends at its time: the battle is won and the stamps are the net goals reached (1, 2, 4)', () => {
  const c = content(), w = createWorld(c, { seed: 2, players: 1 }), st = /** @type {any} */ (w.football);
  assert.equal(st.until, secondsToFrames(300));
  st.home = 3; st.away = 1;
  const events = run(w, c, st.until + 1);
  assert.equal(w.result, 1);
  assert.equal(events.filter((e) => e.type === 'end').length, 1);
  assert.equal(footballStamps(RULES, st), 2);
  assert.deepEqual([0, 1, 2, 3, 4, 7].map((net) => footballStamps(RULES, { ...st, home: net, away: 0 })), [0, 1, 2, 2, 3, 3]);
});

test('[关卡-8] [足球-6] IG-FT-1 loads as a level being tested, with every team\'s players; a match with a goal clears the field for the next kickoff', async () => {
  const { levelAt, TESTING, matchContent: mc } = await import('../src/index.js');
  assert.ok(TESTING.includes('act1multi_football'));
  const lv = levelAt('act1multi_football', 'NORMAL');
  for (const t of RULES.teams) for (const k of Object.values(t.players)) assert.ok(Object.hasOwn(lv.enemies, k), k);
  assert.deepEqual(lv.level.uncovered ?? [], [], 'IG-FT-1: every ability read');
  assert.deepEqual(levelAt('act1multi_football', 'FOUR_STAR').level.uncovered ?? [], [], 'IG-FT-2: every ability read, the 330 of “锤锤到肉” too');
  const BUILD = { elite: 2, level: 90, potential: 1, trust: 100, skill: 0, skillLevel: 10 };
  const c = await mc({ level: 'act1multi_football', difficulty: 'NORMAL', seed: 1, decks: [[{ id: 'char_010_chen', build: BUILD }]] });
  assert.ok(c.operators['trap_165_muftbl#0']?.ballCard && c.decks?.[0].includes('trap_165_muftbl#0'), 'the ball card in the deck');
  const w = createWorld(c, { seed: 1, players: 1 });
  for (let i = 0; i < 10 && !ballOf(w); i++) step(w, c);
  const b = /** @type {Unit} */ (ballOf(w));
  // their goal from right in front of it, on a row the first kickoff leaves open (its barriers on rows 1, 2, 6 and 7)
  b.x = 10;
  b.y = 4;
  displacement.kickSlide(b, 1, 0, 4.5);
  run(w, c, 30);
  assert.equal(/** @type {any} */ (w.football).home, 1);
  assert.equal(w.units.some((u) => u.ball && u.id === b.id), false, 'the ball scored left');
});
