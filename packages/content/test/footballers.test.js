// 阵地足球's players (docs/spec/football.md 足球-9…足球-11), with IG-FT-1's standard team as extracted: the forward goes
// for a free ball within its radius and kicks one within 0.2 at its skill's hit, the goalkeeper clears to the middle
// column from its own area, the muscleman goes for the nearest of our units that can block, and each is revived at
// full HP every time it is knocked down.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage } from '@aue/sim';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities } from '../src/foes.js';
import { KICK_TIMES } from '../src/footballers.js';
import football from '../data/levels/act1multi_football.json' with { type: 'json' };

/** @typedef {import('@aue/sim').Unit} Unit */

const E = /** @type {Record<string, any>} */ (football.enemies);
const FORWARD = 'enemy_4012_mumssi', KEEPER = 'enemy_4013_mubufn', MUSCLE = 'enemy_4014_mugnfu', BALL = 'enemy_4015_musucr';

/** @param {string} key @param {string} passable @param {string} [buildable] */
const tile = (key, passable, buildable = 'ALL') => ({ key, height: 'LOWLAND', buildable, passable, side: 'ALL' });
const TILES = Array.from({ length: 9 }, (_, r) => Array.from({ length: 13 }, (__, col) => (r === 0 || r === 8 ? tile('tile_forbidden', 'FLY_ONLY', 'NONE')
  : col === 0 ? tile('tile_allygoal', 'ALL', 'NONE') : col === 12 ? tile('tile_enemygoal', 'ALL', 'NONE') : tile('tile_football', 'ALL'))));

/**
 * A field of IG-FT-1's shape with the given enemies at points, each waiting on its own route — or, `walking`, each on its
 * way to their goal's column.
 * @param {[string, number, number][]} units [key, x, y] @param {boolean} [walking]
 */
function field(units, walking = false) {
  // each stands where it spawned: a long wait there, its end our goal (a route ending where it starts would leave at once)
  const routes = units.map(([, x, y]) => (walking ? { start: { row: y, col: x }, end: { row: y, col: 12 }, motion: 'WALK', checkpoints: [] }
    : { start: { row: y, col: x }, end: { row: y, col: 0 }, motion: 'WALK', checkpoints: [{ type: 'WAIT_FOR_SECONDS', row: y, col: x, time: 999, dx: 0, dy: 0 }] }));
  const c = /** @type {any} */ ({
    level: { id: 'ft', width: 13, height: 9, tiles: TILES, routes, waves: [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0,
      actions: units.map(([key], i) => ({ type: 'SPAWN', key, route: i, count: 1, preDelay: 0, interval: 1 })) }] }],
      options: { maxLifePoint: 99, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 0.5 } },
    enemies: Object.fromEntries(units.map(([k]) => [k, E[k]])),
    operators: { op: { name: 'op', position: 'MELEE', maxHp: 1e6, atk: 1, def: 0, res: 0, cost: 1, blockCnt: 1, baseAttackTime: 1, respawnTime: 1, range: [{ row: 0, col: 1 }] } },
    behaviors: skeletonContent.behaviors,
  });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  for (const [i, u] of w.units.entries()) { u.x = units[i][1]; u.y = units[i][2]; }
  return { w, c };
}

const by = (/** @type {any} */ w, /** @type {string} */ key) => /** @type {Unit} */ (w.units.find((/** @type {Unit} */ u) => u.key === key));
const run = (/** @type {any} */ w, /** @type {any} */ c, /** @type {number} */ n, /** @type {any[]} */ cmds = []) => { for (let i = 0; i < n; i++) step(w, c, i === 0 ? cmds : []); };

test('[足球-9] the forward goes for a free ball within its searchBall radius 2.0, at its speed; one farther it leaves', () => {
  const near = field([[FORWARD, 6, 4], [BALL, 7.8, 4]]);
  const f = by(near.w, FORWARD), x0 = f.x;
  run(near.w, near.c, 30);
  assert.ok(Math.abs(f.x - x0 - 0.5) < 1e-9 && f.y === 4, `moved ${f.x - x0} in 1 s at 1.0 × 0.5`);
  const far = field([[FORWARD, 6, 4], [BALL, 8.2, 4]]);
  const g = by(far.w, FORWARD);
  run(far.w, far.c, 30);
  assert.ok(Math.abs(g.x - 6) < 0.05, 'beyond 2.0 it does not chase');
});

test('[足球-10] the only forward with a ball within 0.2 holds it and shoots at our goal at its hit: 450 × 1.5 × 0.01', () => {
  const { w, c } = field([[FORWARD, 6, 4], [BALL, 6.15, 4]]);
  const b = by(w, BALL), hit = Math.round(KICK_TIMES[FORWARD].slapshot[0] * 30);
  // it took the ball on the field's first frame (0): the kick comes on the frame `hit`
  assert.equal(b.ball?.sel, by(w, FORWARD).id, 'held');
  run(w, c, hit - 1);
  assert.equal(b.slide, undefined, 'not yet');
  run(w, c, 1);
  const s = /** @type {NonNullable<Unit['slide']>} */ (/** @type {unknown} */ (b.slide)), v = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  // the ball's own turn comes after the forward's: a frame of its friction already taken
  assert.ok(v <= 450 * 1.5 * 0.01 && v > 450 * 1.5 * 0.01 - 0.25, `speed ${v}`);
  assert.ok(s.vx < 0, 'toward our goal, the column 0');
  assert.equal(b.ball?.sel, undefined, 'freed by the kick');
});

test('[足球-10] from the touch to the end of its skill the player stays: its route does not walk it out of reach, and the kick comes', () => {
  // its route goes right, away from the ball on its left
  const { w, c } = field([[FORWARD, 6, 4], [BALL, 5.85, 4]], true);
  const f = by(w, FORWARD), b = by(w, BALL), [hit, end] = KICK_TIMES[FORWARD].slapshot.map((t) => Math.round(t * 30));
  run(w, c, 1);
  assert.equal(b.ball?.sel, f.id, 'held at the touch');
  const x = f.x;
  run(w, c, hit);
  assert.ok(b.slide, 'kicked at its hit');
  assert.equal(f.x, x, 'it stood through the touch and the hit');
  run(w, c, end - hit - 2);
  assert.equal(f.x, x, 'and to the end of the skill');
});

test('[足球-10] the goalkeeper clears a ball within 0.5 toward the middle column at 1.5 ×; it does not go left of its column 9', () => {
  const { w, c } = field([[KEEPER, 10, 4], [BALL, 10.4, 4]]);
  const b = by(w, BALL);
  run(w, c, 1 + Math.round(KICK_TIMES[KEEPER].clearance[0] * 30));
  const s = /** @type {NonNullable<Unit['slide']>} */ (b.slide);
  assert.ok(s && s.vx < 0, 'toward the column 6');
  // a frame or two of its friction (0.5 × 9.81 × 0.7 ÷ 30 a frame) already taken
  const v = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  assert.ok(v <= 450 * 1.5 * 0.01 && v > 450 * 1.5 * 0.01 - 0.25, `speed ${v}`);
  const out = field([[KEEPER, 9, 4], [BALL, 7.6, 4]]);
  run(out.w, out.c, 30);
  assert.ok(Math.abs(by(out.w, KEEPER).x - 9) < 0.05, 'a ball in the column 8 is not its');
});

test('[足球-11] the muscleman goes for the nearest of our units within 2.0', () => {
  const { w, c } = field([[MUSCLE, 6, 4]]);
  run(w, c, 1, [[0, { type: 'deploy', op: 'op', row: 4, col: 8, dir: 1 }]]);
  const m = by(w, MUSCLE), x0 = m.x;
  run(w, c, 30);
  assert.ok(m.x > x0 + 0.4, `toward the operator: ${m.x - x0}`);
});

test('[足球-9] a player knocked down revives at full HP for 20 s, every time', () => {
  const { w, c } = field([[FORWARD, 6, 4]]);
  const f = by(w, FORWARD);
  for (const round of [1, 2]) {
    damage.dealDamage(w, null, f, { type: 'true', amount: f.hp }, c);
    run(w, c, 1);
    assert.ok(w.units.includes(f), `still on the field, round ${round}`);
    assert.equal(f.hp, f.maxHp);
    assert.ok(f.buffs.some((x) => x.key === 'reborn'), 'reviving');
    run(w, c, 20 * 30 + 1);
    assert.equal(f.buffs.some((x) => x.key === 'reborn'), false);
  }
});

test('[足球-9] [足球-11] the standard team\'s abilities are all covered', () => {
  for (const k of [FORWARD, KEEPER, MUSCLE]) assert.deepEqual(uncoveredAbilities([E[k]]), [], k);
});
