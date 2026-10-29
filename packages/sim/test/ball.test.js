// 足球 (docs/spec/football.md 足球-2…足球-5): a ball takes no damage and sums what our units deal it into a kick at its
// force × 0.01 tiles/s; it slides with its own friction, bounces off walls by its restitution, hurts the units it runs
// into once per contact, stops by an operator with three blocks left, and a goal is scored when it enters a goal tile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FPS } from '@aue/math';
import { createWorld, step } from '../src/index.js';
import { makeEnemy, makeOperator, makeDevice } from '../src/units.js';
import { dealDamage } from '../src/damage.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { makeBall, hitDirection, FAR_SHARE } from '../src/ball.js';
import { ballHooks } from '../src/football.js';
import { FRICTION } from '../src/constants.js';
import { fieldContent } from '../src/facilities.js';

/** @typedef {import('../src/types.js').Unit} Unit */

/** @param {string} key @param {string} passable */
const tile = (key, passable) => ({ key, height: 'LOWLAND', buildable: 'ALL', passable, side: 'ALL' });
const TILES = { '.': tile('tile_football', 'ALL'), '#': tile('tile_forbidden', 'FLY_ONLY'), A: tile('tile_allygoal', 'ALL'), E: tile('tile_enemygoal', 'ALL') };

/** RMA70刺球's physics (PRTS oldid=436366): friction 0.7, restitution 0.75, threshold 2300, force 450, block 3. */
const RMA70 = Object.freeze({ friction: 0.7, restitution: 0.75, force: 450, need: 2300, block: 3, points: 1 });

/**
 * A field of rows (row 0 first: '.' 球场, '#' a wall, 'A' our goal, 'E' theirs) with a ball of `p` at (x, y).
 * @param {string[]} rows @param {number} x @param {number} y @param {typeof RMA70} [p]
 */
function field(rows, x, y, p = RMA70) {
  const c = /** @type {any} */ ({
    level: { id: 't', width: rows[0].length, height: rows.length, tiles: rows.map((r) => [...r].map((ch) => TILES[/** @type {keyof typeof TILES} */ (ch)])),
      options: { maxLifePoint: 3, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 0.5 },
      routes: [{ start: { row: y, col: x }, end: { row: y, col: x }, motion: 'WALK', checkpoints: [] }], waves: [] },
    enemies: { ball: { name: 'ball', maxHp: 1000, atk: 10000, def: 0, res: 0, moveSpeed: 1, massLevel: 1, baseAttackTime: 1, applyWay: 'NONE' },
      foe: { name: 'foe', maxHp: 1e6, atk: 100, def: 0, res: 0, moveSpeed: 1, baseAttackTime: 1, applyWay: 'MELEE' } },
    operators: { op: { name: 'op', position: 'MELEE', maxHp: 1e6, atk: 100, def: 0, res: 0, cost: 1, blockCnt: 1, baseAttackTime: 1, respawnTime: 1, range: [{ row: 0, col: 0 }] },
      wall: { name: 'wall', position: 'MELEE', maxHp: 1e6, atk: 100, def: 0, res: 0, cost: 1, blockCnt: 3, baseAttackTime: 1, respawnTime: 1, range: [{ row: 0, col: 0 }] } },
  });
  const w = createWorld(c, { seed: 1, players: 1 }), b = makeEnemy(w, c, { key: 'ball', route: 0 });
  b.x = x; b.y = y;
  w.units.push(b);
  makeBall(b, p);
  ballHooks(w, c);
  return { w, c, b };
}

/** An operator of a key at a tile. @param {any} w @param {any} c @param {string} key @param {number} row @param {number} col */
function operator(w, c, key, row, col) {
  const op = makeOperator(w, c, { key, owner: 0, row, col, dir: 1 });
  w.units.push(op);
  return op;
}

/** Physical damage `amount` from `src` to the ball. @param {any} w @param {any} c @param {Unit} src @param {Unit} b @param {number} amount */
const hit = (w, c, src, b, amount) => dealDamage(w, src, b, { type: 'phys', amount }, c);

/** Frames until the ball is at rest (or has left the field), at most `max`. @param {any} w @param {any} c @param {Unit} b */
function roll(w, c, b, max = 300) {
  let n = 0;
  while (b.slide && w.units.includes(b) && n < max) { step(w, c); n++; }
  return n;
}

const OPEN = ['.........', '.........', '.........', '.........', '.........'];

test('[足球-2] [足球-3] a hit on a ball deals it nothing; our hits add up and kick it at 450 × 0.01 tiles/s once they reach 2300', () => {
  const { w, c, b } = field(OPEN, 4, 2);
  const op = operator(w, c, 'op', 2, 3);
  hit(w, c, op, b, 2000);
  assert.equal(b.hp, b.maxHp, 'no HP lost');
  assert.equal(b.slide, undefined, 'below the threshold: not kicked');
  assert.equal(b.ball?.sum, 2000);
  hit(w, c, op, b, 300);
  assert.equal(b.hp, b.maxHp);
  const s = /** @type {Unit['slide']} */ (/** @type {unknown} */ (b.slide));
  assert.deepEqual([s?.vx, s?.vy], [4.5, 0], 'away from the operator, at 4.5 tiles/s');
  assert.deepEqual([b.ball?.sum, b.ball?.ax, b.ball?.ay], [0, 0, 0], 'both sums start again');
});

test('[足球-3] each hit adds its direction: a unit off the ball\'s tile and the four beside it a fifth; one on its tile (1, 0)', () => {
  const { w, c, b } = field(OPEN, 4, 2);
  const below = operator(w, c, 'op', 3, 4), far = operator(w, c, 'op', 0, 2), same = operator(w, c, 'op', 2, 4);
  assert.deepEqual(hitDirection(b, below), [0, -1]);
  const [fx, fy] = hitDirection(b, far), d = Math.sqrt(8);
  assert.ok(Math.abs(fx - (2 / d) * FAR_SHARE) < 1e-12 && Math.abs(fy - (2 / d) * FAR_SHARE) < 1e-12, '(2, 2)/√8 × 0.2');
  assert.deepEqual(hitDirection(b, same), [1, 0]);
  hit(w, c, below, b, 1200);
  hit(w, c, far, b, 1100);
  const sx = (2 / d) * FAR_SHARE, sy = -1 + (2 / d) * FAR_SHARE, n = Math.sqrt(sx * sx + sy * sy);
  assert.ok(Math.abs(/** @type {number} */ (b.slide?.vx) - (sx / n) * 4.5) < 1e-9 && Math.abs(/** @type {number} */ (b.slide?.vy) - (sy / n) * 4.5) < 1e-9, 'along the sum');
});

test('[足球-3] a sliding ball sums nothing, and an enemy\'s hits never count; both still deal it nothing', () => {
  const { w, c, b } = field(OPEN, 4, 2);
  const op = operator(w, c, 'op', 2, 3);
  hit(w, c, op, b, 2300);
  hit(w, c, op, b, 2000);
  assert.equal(b.ball?.sum, 0, 'in 失衡');
  assert.equal(b.hp, b.maxHp);
  const other = field(OPEN, 4, 2), foe = makeEnemy(other.w, other.c, { key: 'foe', route: 0 });
  other.w.units.push(foe);
  hit(other.w, other.c, foe, other.b, 5000);
  assert.equal(other.b.ball?.sum, 0);
  assert.equal(other.b.hp, other.b.maxHp);
});

test('[足球-2] a ball at rest stays put; 晕眩 and 冻结 do not take; it does not attack and cannot be blocked', () => {
  const { w, c, b } = field(OPEN, 4, 2);
  for (let i = 0; i < 30; i++) step(w, c);
  assert.deepEqual([b.x, b.y], [4, 2]);
  applyStatus(b, 'stun', { seconds: 5 });
  applyStatus(b, 'freeze', { seconds: 5 });
  const s = statsOf(b);
  assert.deepEqual([s.flags.stun, s.flags.freeze, s.flags.noAttack, s.flags.unblockable], [undefined, undefined, true, true]);
});

test('[足球-4] it slides the exact way of μg × its friction factor: from 4.5 tiles/s the distance of v²/2a, short only by the 0.1 it stops at', () => {
  const { w, c, b } = field(['.................', '.................', '.................'], 1, 1);
  const op = operator(w, c, 'op', 1, 0);
  hit(w, c, op, b, 2300);
  const frames = roll(w, c, b), a = FRICTION * 0.7;
  assert.ok(Math.abs(b.x - 1 - (4.5 * 4.5 - 0.1 * 0.1) / (2 * a)) < 0.04 * 4.5 / FPS, `${b.x - 1} vs ${(4.5 * 4.5) / (2 * a)}`);
  assert.equal(b.y, 1);
  assert.ok(Math.abs(frames - ((4.5 - 0.1) / a) * FPS) <= 1, `${frames} frames`);
});

test('[足球-4] a wall turns the speed across it back × the restitution; along it, the speed keeps', () => {
  const { w, c, b } = field(['#########', '.........', '.........', '.........', '#########'], 4, 2);
  const op = operator(w, c, 'op', 3, 3);
  hit(w, c, op, b, 2300);
  const v0 = { vx: /** @type {number} */ (b.slide?.vx), vy: /** @type {number} */ (b.slide?.vy) };
  assert.ok(v0.vy < 0 && v0.vx > 0, 'up and to the right');
  let before = { ...v0 };
  for (let i = 0; i < 20 && b.slide; i++) {
    before = { vx: b.slide.vx, vy: b.slide.vy };
    step(w, c);
    if (b.slide && b.slide.vy > 0) break;
  }
  const s = /** @type {NonNullable<Unit['slide']>} */ (b.slide), a = FRICTION * 0.7 / FPS, v = Math.sqrt(before.vx ** 2 + before.vy ** 2), k = (v - a) / v;
  assert.ok(Math.abs(s.vy - -before.vy * k * 0.75) < 1e-9, `vy ${s.vy} vs ${-before.vy * k * 0.75}`);
  assert.ok(Math.abs(s.vx - before.vx * k) < 1e-9, 'vx only loses friction');
  assert.ok(b.y - 0.5 >= 0.3, 'its circle stays out of the wall row');
});

test('[足球-4] it rolls through our units untouched: an operator in its way that cannot stop it takes nothing', () => {
  const { w, c, b } = field(['.................', '.................', '.................'], 1, 1);
  const kicker = operator(w, c, 'op', 1, 0), inWay = operator(w, c, 'op', 1, 3);
  hit(w, c, kicker, b, 2300);
  const hp = inWay.hp;
  roll(w, c, b);
  assert.equal(inWay.hp, hp);
  assert.ok(b.x > 3.5, 'it rolled through');
});

test('[足球-4] an operator with three blocks left stops it within 0.35; one with fewer does not', () => {
  const stopper = field(['.................', '.................', '.................'], 1, 1);
  operator(stopper.w, stopper.c, 'op', 1, 0);
  // Unhindered, it would roll from x 1 to about 3.95 (v²/2a): the operators stand at x 3.
  const wall = operator(stopper.w, stopper.c, 'wall', 1, 3);
  hit(stopper.w, stopper.c, /** @type {Unit} */ (stopper.w.units.find((u) => u.key === 'op')), stopper.b, 2300);
  const frames = roll(stopper.w, stopper.c, stopper.b);
  assert.equal(stopper.b.slide, undefined);
  assert.ok(wall.x - stopper.b.x <= 0.35 && wall.x - stopper.b.x > 0.35 - 4.5 / FPS, `stopped at ${stopper.b.x}`);
  assert.ok(frames < 20, 'at once, not by friction');
  const passer = field(['.................', '.................', '.................'], 1, 1);
  const kick = operator(passer.w, passer.c, 'op', 1, 0);
  operator(passer.w, passer.c, 'op', 1, 3);
  hit(passer.w, passer.c, kick, passer.b, 2300);
  roll(passer.w, passer.c, passer.b);
  assert.ok(passer.b.x > 3.35, `one block is not three: at ${passer.b.x}`);
});

test('[足球-5] a ball whose centre enters their goal is our goal, in ours theirs: the event score, and it leaves quietly', () => {
  const ours = field(['.......', 'A.....E', '.......'], 4, 1);
  const op = operator(ours.w, ours.c, 'op', 1, 3);
  hit(ours.w, ours.c, op, ours.b, 2300);
  const events = [];
  for (let i = 0; i < 30 && ours.w.units.includes(ours.b); i++) { step(ours.w, ours.c); events.push(...ours.w.events); }
  assert.equal(ours.w.units.includes(ours.b), false);
  assert.deepEqual(events.filter((e) => e.type === 'score'), [{ type: 'score', id: ours.b.id, goal: 1 }]);
  assert.equal(events.some((e) => e.type === 'death' && e.id === ours.b.id), false, 'not a knockdown');
  const theirs = field(['.......', 'A.....E', '.......'], 2, 1);
  const op2 = operator(theirs.w, theirs.c, 'op', 1, 3);
  hit(theirs.w, theirs.c, op2, theirs.b, 2300);
  const ev2 = [];
  for (let i = 0; i < 30 && theirs.w.units.includes(theirs.b); i++) { step(theirs.w, theirs.c); ev2.push(...theirs.w.events); }
  assert.deepEqual(ev2.filter((e) => e.type === 'score').map((e) => e.goal), [0]);
});

/** 阵地屏障 as profiled (PRTS oldid=417821), with HP enough to count the damage. */
const BARRIER = Object.freeze({ name: 'bar', maxHp: 1e9, atk: 0, def: 0, res: 0, blockCnt: 1, baseAttackTime: 1, aspd: 100, tauntLevel: -1, massLevel: 0,
  talentBb: { damage_scale: 5 }, side: /** @type {'ENEMY'} */ ('ENEMY'), routeBlock: true, square: 0.9, ballDamage: 5, envDamage: 0 });

/** A barrier on a tile of the field. @param {any} w @param {any} c @param {number} row @param {number} col */
function barrier(w, c, row, col) {
  c.devices = { bar: BARRIER };
  const u = makeDevice(w, c, { alias: `bar#${col}`, key: 'bar', hidden: false, row, col, dir: 'UP' });
  w.units.push(u);
  ballHooks(w, c);
  return u;
}

test('[足球-12] a ball bounces off a barrier\'s 0.9 square × its restitution, and the barrier takes its speed × its attack × 5', () => {
  const { w, c, b } = field(['.........', '.........', '.........'], 1, 1);
  const kicker = operator(w, c, 'op', 1, 0), bar = barrier(w, c, 1, 4);
  hit(w, c, kicker, b, 2300);
  let after = 0, mean = 0;
  for (let i = 0; i < 60 && b.slide && b.slide.vx > 0; i++) {
    // its speed after this frame's friction, and the frame's mean speed it moved — and hit — at
    after = b.slide.vx - (FRICTION * 0.7) / FPS;
    mean = b.slide.vx - (FRICTION * 0.7) / (2 * FPS);
    step(w, c);
  }
  const s = /** @type {NonNullable<Unit['slide']>} */ (b.slide);
  assert.ok(Math.abs(s.vx - -after * 0.75) < 1e-9, `vx ${s.vx} vs ${-after * 0.75}`);
  assert.ok(b.x + 0.3 <= 4 - 0.45 + 1e-9, 'its circle stays out of the square');
  assert.ok(Math.abs(bar.maxHp - bar.hp - mean * 10000 * 5) < 1e-3, `${bar.maxHp - bar.hp} vs ${mean * 10000 * 5}`);
});

test('[足球-12] a barrier takes nothing of damage with no source; its tile is a 类障碍物地块 while it stands', () => {
  const { w, c } = field(['.....', '.....', '.....'], 0, 0);
  const bar = barrier(w, c, 1, 2), op = operator(w, c, 'op', 1, 1);
  dealDamage(w, null, bar, { type: 'true', amount: 1000 }, c);
  assert.equal(bar.hp, bar.maxHp);
  dealDamage(w, op, bar, { type: 'true', amount: 1000 }, c);
  assert.equal(bar.hp, bar.maxHp - 1000);
  assert.equal(fieldContent(w, c).level.tiles[1][2].obstacle, true);
  assert.equal(fieldContent(w, c).level.tiles[1][1].obstacle, undefined);
  w.units.splice(w.units.indexOf(bar), 1);
  assert.equal(fieldContent(w, c), c, 'gone: the map as it is');
});
