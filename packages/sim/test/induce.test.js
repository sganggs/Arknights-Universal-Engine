// 恐惧 and 诱导 movement (docs/spec/status.md 状态-10, 状态-11). Seed 1 throughout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot } from '../src/index.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { applyStatus, STATUS } from '../src/status.js';
import { displace } from '../src/routes.js';
import { keyAt } from '../src/paths.js';
import { statsOf } from '../src/attrs.js';

/** @typedef {import('../src/types.js').World} World @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').Drift} Drift */

const ROAD = { key: 'tile_road', height: 'LOWLAND', buildable: 'MELEE', passable: 'ALL', side: 'ALL' };
const WALL = { key: 'tile_wall', height: 'HIGHLAND', buildable: 'RANGED', passable: 'FLY_ONLY', side: 'ALL' };
const HOLE = { key: 'tile_hole', height: 'LOWLAND', buildable: 'NONE', passable: 'ALL', side: 'ALL' };
const OPEN = ['......', '......', '......'];

/** @param {string} ch @returns {any} */
function tileOf(ch) {
  if (ch === '#') return { ...WALL };
  if (ch === 'H') return { ...HOLE };
  if (ch === 'O') return { ...ROAD, obstacle: true };
  return { ...ROAD };
}

/** @param {string[]} rows @param {any[]} routes @param {Record<string, any>} [enemies] @returns {any} */
function content(rows, routes, enemies = {}) {
  return {
    level: { id: 't', width: rows[0].length, height: rows.length, tiles: rows.map((s) => [...s].map(tileOf)), waves: [],
      options: { maxLifePoint: 3, initialCost: 10, maxCost: 99, costIncreaseTime: 1, characterLimit: 9, moveMultiplier: 1 }, routes },
    enemies: { e: { name: 'e', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 3 }, ...enemies },
    operators: { g: { name: 'g', position: 'MELEE', cost: 1, blockCnt: 1, baseAttackTime: 1, maxHp: 1000, atk: 0, def: 0, res: 0, range: [] } },
  };
}

/** @param {number} row @param {number} col */
const at = (row, col) => ({ row, col });
/** @param {number} sr @param {number} sc @param {number} er @param {number} ec @param {{ motion?: string, checkpoints?: any[] }} [extra] */
const leg = (sr, sc, er, ec, extra = {}) => ({
  start: at(sr, sc), end: at(er, ec), motion: extra.motion ?? 'WALK', checkpoints: extra.checkpoints ?? [],
});

/** @param {any} c @param {{ key?: string, place?: { leg: number, x: number, y: number } }} [o] @returns {[World, Unit]} */
function boot(c, o = {}) {
  const w = createWorld(c, { seed: 1, players: 1 });
  const e = makeEnemy(w, c, { key: 'e', route: 0, ...o });
  w.units.push(e);
  return [w, e];
}

/** @param {World} w @param {any} c @param {number} row @param {number} col @returns {Unit} */
function opAt(w, c, row, col) {
  const op = makeOperator(w, c, { key: 'g', owner: 0, row, col, dir: 0 });
  w.units.push(op);
  return op;
}

/** @param {Unit} e @returns {Drift} */
function drift(e) {
  if (!e.drift) throw new Error('no drift');
  return e.drift;
}

/** Steps until `done` is true. Returns how many steps that took, or −1. @param {World} w @param {any} c @param {() => boolean} done @param {number} max */
function until(w, c, done, max) {
  for (let i = 0; i < max; i++) {
    if (done()) return i;
    step(w, c);
  }
  return -1;
}

/** One fear from the operator west of the route start, not yet stepped. @param {number} [frames] */
function scare(frames = 80) {
  const c = content(OPEN, [leg(1, 1, 1, 5)]);
  const [w, e] = boot(c);
  const src = opAt(w, c, 1, 0);
  applyStatus(e, 'fear', { src, frames });
  return { w, e, c, src };
}

/**
 * Tile centre (cx, cy) is inside the radius-10 ±45° fan about the hit, away from the source (状态-10).
 * @param {number} cx @param {number} cy @param {{ hx: number, hy: number, sx: number, sy: number }} away
 */
function fanTile(cx, cy, away) {
  const vx = cx - away.hx, vy = cy - away.hy, dx = away.hx - away.sx, dy = away.hy - away.sy, vv = vx * vx + vy * vy;
  if (vv > 100) return false;
  if (vv === 0) return true;
  const dot = vx * dx + vy * dy;
  if (!(dot > 0)) return false;
  return 2 * dot * dot >= vv * (dx * dx + dy * dy);
}

/** @param {World} w @param {any} c @param {Unit} e @param {number} n */
function sample(w, c, e, n) {
  /** @type {{ x: number, fear: boolean, attract: number }[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    step(w, c);
    out.push({ x: e.x, fear: e.buffs.some((b) => b.key === 'fear'), attract: e.buffs.filter((b) => b.key === 'attract').length });
  }
  return out;
}

test('[状态-10] a feared enemy flees inside the fan and, once the fear ends, finishes its route', () => {
  const { w, e, c } = scare(30);
  const gone = until(w, c, () => !e.buffs.some((b) => b.key === 'fear'), 40);
  const d = drift(e);
  assert.ok(gone > 0 && e.hp === 1000 && e.x > 2);
  assert.ok(d.tiles.length > 0 && d.tiles.every((k) => fanTile(k % 6, Math.floor(k / 6), { hx: 1, hy: 1, sx: 0, sy: 1 })));
  assert.equal(d.tiles.includes(11), false);
  assert.equal(until(w, c, () => e.hp === 0, 40) > 0, true);
  assert.deepEqual([e.x, e.y], [5, 1]);
});

/**
 * Eight frames of a sourceless fear: still on tile `key`, within the 0.25 offset of that tile's centre, and not frozen.
 * @param {(w: World, c: any, e: Unit) => void} apply @param {number} key
 */
function trembled(apply, key) {
  const c = content(OPEN, [leg(1, 1, 1, 5)]);
  const [w, e] = boot(c);
  apply(w, c, e);
  const cx = key % 6, cy = Math.floor(key / 6);
  let moved = false;
  for (let i = 0; i < 8; i++) {
    step(w, c);
    if (keyAt(c.level, e.x, e.y) !== key) return false;
    if (Math.abs(e.x - cx) > 0.25 || Math.abs(e.y - cy) > 0.25) return false;
    if (e.x !== cx || e.y !== cy) moved = true;
  }
  return moved && drift(e).tiles.length === 0;
}

test('[状态-10] [数值-6] with no source, itself, or a source on the same point, it trembles on its own tile', () => {
  assert.equal(trembled((w, c, e) => applyStatus(e, 'fear', { frames: 20 }), 7), true);
  assert.equal(trembled((w, c, e) => applyStatus(e, 'fear', { src: e, frames: 20 }), 7), true);
  assert.equal(trembled((w, c, e) => applyStatus(e, 'fear', { src: opAt(w, c, 1, 1), frames: 20 }), 7), true);
  const c = content(['......'], [leg(0, 0, 0, 5)]);
  const [w, e] = boot(c, { place: { leg: 0, x: 2.5, y: 0 } });
  applyStatus(e, 'fear', { frames: 20 });
  step(w, c);
  assert.equal(drift(e).aim, 2, '2.5 is tile 2, half to even, not tile 3');
  assert.equal(keyAt(c.level, e.x, e.y), 2);
});

test('[状态-7] a fear or an attract of 0 frames is not applied and records nothing', () => {
  const [, e] = boot(content(OPEN, [leg(1, 1, 1, 5)]));
  assert.equal(applyStatus(e, 'fear', { frames: 0 }), null);
  assert.equal(applyStatus(e, 'attract', { frames: 0, point: { x: 1, y: 1 } }), null);
  assert.equal(e.drift, undefined);
});

test('[状态-10] the reachable list is the fan: obstacles in, ends holes and goals out, radius 10 and 45° included', () => {
  const row = '.'.repeat(14);
  const c = content([row, row, row, row, row, row], [leg(2, 1, 2, 13)]);
  c.level.tiles[3][4] = { ...HOLE };
  c.level.tiles[2][4] = { ...ROAD, obstacle: true };
  c.level.tiles[2][6] = { ...ROAD, key: 'tile_end' };
  c.level.tiles[2][7] = { ...ROAD, goal: true };
  const [w, e] = boot(c);
  applyStatus(e, 'fear', { src: opAt(w, c, 2, 0), frames: 10 });
  step(w, c);
  const tiles = drift(e).tiles;
  /** @param {number} r @param {number} col */
  const k = (r, col) => r * 14 + col;
  assert.ok(tiles.every((key) => fanTile(key % 14, Math.floor(key / 14), { hx: 1, hy: 2, sx: 0, sy: 2 })));
  assert.equal(tiles.includes(k(3, 2)), true, 'exactly 45°');
  assert.equal(tiles.includes(k(4, 2)), false, 'past 45°');
  assert.equal(tiles.includes(k(2, 11)), true, 'exactly 10');
  assert.equal(tiles.includes(k(2, 12)), false, 'past 10');
  assert.equal(tiles.includes(k(2, 13)), false, 'the route end');
  assert.equal(tiles.includes(k(3, 4)), false, 'a hole');
  assert.equal(tiles.includes(k(2, 6)), false, 'tile_end');
  assert.equal(tiles.includes(k(2, 7)), false, 'a goal tile');
  assert.equal(tiles.includes(k(2, 4)), true, 'an obstacle still counts');
});

test('[状态-10] a checkpoint farther than 5 steps is dropped and the enemy stays on its tile', () => {
  const rows = ['........', '.#######', '.#######', '.#######', '.#######'];
  const c = content(rows, [leg(0, 0, 4, 0)]);
  const [w, e] = boot(c, { place: { leg: 0, x: 0, y: 4 } });
  const src = makeOperator(w, c, { key: 'g', owner: 0, row: 4, col: 0, dir: 0 });
  src.x = -1;
  applyStatus(e, 'fear', { src, frames: 10 });
  step(w, c);
  const here = keyAt(c.level, 0, 4);
  assert.ok(drift(e).tiles.length > 0);
  assert.equal(drift(e).tiles.includes(here), false);
  assert.equal(drift(e).aim, here);
  assert.equal(keyAt(c.level, e.x, e.y), here);
  assert.equal(e.hp, 1000);
});

test('[状态-10] a flyer goes straight to the checkpoint; a ground enemy follows the field', () => {
  /** @param {string} motion @returns {number[]} */
  const way = (motion) => {
    const c = content(OPEN, [leg(1, 1, 1, 5, { motion })]);
    const [w, e] = boot(c);
    applyStatus(e, 'fear', { src: opAt(w, c, 1, 0), frames: 40 });
    step(w, c);
    return drift(e).way;
  };
  const fly = way('FLY'), ground = way('WALK');
  assert.equal(fly.length, 2);
  assert.ok(ground.length > 2);
});

test('[状态-10] [位移-3] 失衡 does not take the fear step a twin takes', () => {
  const a = scare(), b = scare();
  a.e.slide = { vx: 0, vy: 0, hard: 5 };
  step(a.w, a.c);
  step(b.w, b.c);
  assert.deepEqual([a.e.x, a.e.y], [1, 1]);
  assert.ok(b.e.x > 1);
});

test('[状态-10] a push or a changed grid replans the same checkpoint and does not draw', () => {
  const pushed = scare();
  step(pushed.w, pushed.c);
  const rng = pushed.w.rng, aim = drift(pushed.e).aim, way = drift(pushed.e).way;
  displace(pushed.e, pushed.e.x + 0.2, pushed.e.y);
  step(pushed.w, pushed.c);
  assert.equal(pushed.w.rng, rng);
  assert.equal(drift(pushed.e).aim, aim);
  assert.notEqual(drift(pushed.e).way, way);
  const grid = scare();
  step(grid.w, grid.c);
  const rng2 = grid.w.rng, aim2 = drift(grid.e).aim, way2 = drift(grid.e).way;
  const tiles = grid.c.level.tiles.map((/** @type {any[]} */ row) => row.map((/** @type {any} */ t) => ({ ...t })));
  tiles[0][0] = { ...tiles[0][0], obstacle: true };
  grid.c.level = { ...grid.c.level, tiles };
  step(grid.w, grid.c);
  assert.equal(grid.w.rng, rng2);
  assert.equal(drift(grid.e).aim, aim2);
  assert.notEqual(drift(grid.e).way, way2);
});

test('[状态-10] applying fear again rebuilds the list; one of two ending only repicks the checkpoint', () => {
  const { w, e, c, src } = scare(80);
  applyStatus(e, 'fear', { src, frames: 5 });
  step(w, c);
  const tiles = drift(e).tiles;
  applyStatus(e, 'fear', { src, frames: 80 });
  step(w, c);
  assert.notEqual(drift(e).tiles, tiles);
  const again = scare(80);
  applyStatus(again.e, 'fear', { src: again.src, frames: 5 });
  step(again.w, again.c);
  const kept = drift(again.e).tiles, before = again.w.rng;
  assert.equal(until(again.w, again.c, () => again.e.buffs.filter((b) => b.key === 'fear').length === 1, 10) > 0, true);
  assert.equal(drift(again.e).tiles, kept);
  assert.notEqual(again.w.rng, before);
});

test('[状态-10] fear does not start an attack and cancels the swing already under way', () => {
  const c = content(OPEN, [leg(1, 2, 1, 5)], {
    r: { name: 'r', maxHp: 1000, atk: 100, def: 0, res: 0, moveSpeed: 3, rangeRadius: 2, applyWay: 'RANGED', attack: { duration: 1, hit: 0.5 } },
  });
  const w = createWorld(c, { seed: 1, players: 1 });
  const e = makeEnemy(w, c, { key: 'r', route: 0 }), op = opAt(w, c, 1, 2);
  w.units.push(e);
  step(w, c);
  assert.ok(e.swing);
  assert.equal(op.hp, 1000);
  assert.equal(e.x, 2);
  applyStatus(e, 'fear', { src: op, frames: 30 });
  step(w, c);
  assert.equal(e.swing, null);
  assert.equal(op.hp, 1000);
  assert.ok(e.x !== 2);
  assert.equal(e.blockedBy, -1);
  const w2 = createWorld(c, { seed: 1, players: 1 });
  const e2 = makeEnemy(w2, c, { key: 'r', route: 0 }), op2 = opAt(w2, c, 1, 2);
  w2.units.push(e2);
  applyStatus(e2, 'fear', { src: op2, frames: 30 });
  step(w2, c);
  assert.equal(e2.swing, null);
  assert.equal(op2.hp, 1000);
  assert.ok(e2.x !== 2);
});

test('[状态-10] a route wait keeps counting during fear, so the enemy leaves its tile on the same frame', () => {
  /** @param {boolean} fear @returns {number} */
  const leave = (fear) => {
    const checkpoints = [{ type: 'WAIT_FOR_SECONDS', row: 0, col: 0, time: 1, dx: 0, dy: 0 }];
    const c = content(OPEN, [leg(1, 1, 1, 5, { checkpoints })]);
    const [w, e] = boot(c);
    if (fear) applyStatus(e, 'fear', { frames: 10 });
    for (let i = 0; i < 50; i++) {
      step(w, c);
      if (keyAt(c.level, e.x, e.y) !== 7) return i + 1;
    }
    return -1;
  };
  assert.equal(leave(true), 35);
  assert.equal(leave(false), 35);
});

test('[状态-11] [数值-6] 诱导 walks to the tile centre — half to even — and stays there', () => {
  /** @param {number} x @returns {[number, number]} */
  const aim = (x) => {
    const c = content(['........'], [leg(0, 0, 0, 7)]);
    const [w, e] = boot(c);
    applyStatus(e, 'attract', { point: { x, y: 0 }, frames: 90 });
    step(w, c);
    return [drift(e).ax, drift(e).ay];
  };
  assert.deepEqual(aim(2.5), [2, 0]);
  assert.deepEqual(aim(3.5), [4, 0]);
  const c = content(['........'], [leg(0, 1, 0, 2)]);
  const [w, e] = boot(c);
  applyStatus(e, 'attract', { point: { x: 6, y: 0 }, frames: 200 });
  assert.equal(until(w, c, () => e.x === 6 && e.y === 0, 80), 51);
  assert.equal(until(w, c, () => e.x !== 6 || e.y !== 0 || !e.buffs.some((b) => b.key === 'attract'), 10), -1);
});

/** Where an attract to (6, 2) has gone after 45 frames, and the path it took. @param {string} motion */
function cross(motion) {
  const rows = ['........', '.######.', '........'];
  const c = content(rows, [leg(0, 0, 2, 7, { motion })]);
  const [w, e] = boot(c);
  applyStatus(e, 'attract', { point: { x: 6, y: 2 }, frames: 80 });
  step(w, c);
  const way = drift(e).way.slice();
  for (let i = 0; i < 44; i++) step(w, c);
  const k = keyAt(c.level, e.x, e.y);
  return { way, passable: c.level.tiles[Math.floor(k / c.level.width)][k % c.level.width].passable };
}

test('[状态-11] a flyer crosses a wall in a straight line; a ground enemy goes around it', () => {
  const fly = cross('FLY'), ground = cross('WALK');
  assert.deepEqual(fly.way, [6, 2]);
  assert.equal(fly.passable, 'FLY_ONLY');
  assert.ok(ground.way.length > 2);
  assert.equal(ground.passable, 'ALL');
});

test('[状态-11] attracts are all kept; the newest is the target until it ends, then the older one', () => {
  const c = content(['........'], [leg(0, 3, 0, 7)]);
  const [w, e] = boot(c);
  applyStatus(e, 'attract', { point: { x: 7, y: 0 }, frames: 90 });
  applyStatus(e, 'attract', { point: { x: 0, y: 0 }, frames: 12 });
  const t = sample(w, c, e, 24);
  assert.ok(t[10].x < 3 && t[10].attract === 2);
  assert.equal(t[11].attract, 1);
  assert.ok(t[23].x > t[11].x);
});

test('[状态-10] [状态-11] fear outranks 诱导; when the fear ends the 诱导 continues', () => {
  const c = content(OPEN, [leg(1, 3, 1, 5)]);
  const [w, e] = boot(c);
  applyStatus(e, 'attract', { point: { x: 0, y: 1 }, frames: 90 });
  applyStatus(e, 'fear', { src: opAt(w, c, 1, 1), frames: 20 });
  const t = sample(w, c, e, 30);
  assert.equal(t[17].fear, true);
  assert.ok(t[17].x > 3);
  assert.equal(t[20].fear, false);
  assert.equal(t[20].attract, 1);
  assert.ok(t[28].x < t[20].x);
});

test('[状态-3] [状态-11] [时间-2] resistance shortens 诱导 by decaying it; the walk itself is not slower', () => {
  /** @param {boolean} resist */
  const run = (resist) => {
    const c = content(['..........'], [leg(0, 4, 0, 8)]);
    const [w, e] = boot(c);
    if (resist) applyStatus(e, 'buffres', {});
    const b = applyStatus(e, 'attract', { point: { x: 0, y: 0 }, seconds: 1 });
    const left = b ? b.left : -1;
    /** @type {[number, boolean][]} */
    const xs = [];
    for (let i = 0; i < 30; i++) { step(w, c); xs.push([e.x, e.buffs.some((x) => x.key === 'attract')]); }
    return { left, xs };
  };
  const plain = run(false), hard = run(true);
  assert.equal(plain.left, 30);
  assert.equal(hard.left, 30);
  assert.equal(plain.xs[13][0], hard.xs[13][0]);
  assert.equal(plain.xs[13][1], true);
  assert.equal(hard.xs[14][1], false);
  assert.equal(plain.xs[14][1], true);
  assert.ok(hard.xs[14][0] > plain.xs[14][0]);
  assert.equal(plain.xs[28][1], true);
  assert.ok(plain.xs[28][0] < hard.xs[28][0]);
});

test('[状态-11] a ground path through an obstacle does not walk; standing on the obstacle, it is pulled off', () => {
  /** @param {number} col @returns {[number, number, boolean]} */
  const moved = (col) => {
    const c = content(['..O....'], [leg(0, col, 0, 6)]);
    const [w, e] = boot(c, col === 0 ? {} : { place: { leg: 0, x: col, y: 0 } });
    const x0 = e.x;
    applyStatus(e, 'attract', { point: { x: 6, y: 0 }, frames: 20 });
    step(w, c);
    return [e.x, x0, e.buffs.some((b) => b.key === 'attract')];
  };
  const [blocked, from, buff] = moved(0);
  assert.equal(blocked, from);
  assert.equal(buff, true);
  const [out, was] = moved(2);
  assert.ok(out > was);
});

test('[状态-11] [阻挡-1] 诱导 is not blocked; an enemy immune to it keeps the buff and can be blocked', () => {
  /** @param {boolean} immune */
  const held = (immune) => {
    const enemies = immune ? { e: { name: 'e', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 3, immune: ['attract'] } } : {};
    const c = content(OPEN, [leg(1, 1, 1, 5)], enemies);
    const [w, e] = boot(c);
    opAt(w, c, 1, 1);
    applyStatus(e, 'attract', { point: { x: 5, y: 1 }, frames: 30 });
    step(w, c);
    return { blocked: e.blockedBy >= 0, x: e.x, flag: statsOf(e).flags.attract === true, buff: e.buffs.some((b) => b.key === 'attract') };
  };
  const a = held(false), immune = held(true);
  assert.equal(a.blocked, false);
  assert.ok(a.x > 1);
  assert.equal(a.flag, true);
  assert.equal(immune.blocked, true);
  assert.equal(immune.x, 1);
  assert.equal(immune.flag, false);
  assert.equal(immune.buff, true);
});

test('[状态-11] no point and no source does not walk; a live source is tracked; a given point wins; a dead source stays', () => {
  const quiet = content(['......'], [leg(0, 1, 0, 5)]);
  const [wq, eq] = boot(quiet);
  applyStatus(eq, 'attract', { frames: 10 });
  step(wq, quiet);
  assert.deepEqual([eq.x, eq.y], [1, 0]);
  assert.equal(eq.buffs.some((b) => b.key === 'attract'), true);
  const c = content(['..........'], [leg(0, 0, 0, 8)]);
  const [w, e] = boot(c);
  const src = opAt(w, c, 0, 5);
  applyStatus(e, 'attract', { src, frames: 90 });
  step(w, c);
  assert.equal(drift(e).ax, 5);
  src.x = 7;
  step(w, c);
  assert.equal(drift(e).ax, 7);
  src.hp = 0;
  step(w, c);
  assert.equal(drift(e).ax, 7);
  const [w2, e2] = boot(c);
  const src2 = opAt(w2, c, 0, 6);
  applyStatus(e2, 'attract', { src: src2, point: { x: 1, y: 0 }, frames: 40 });
  step(w2, c);
  assert.equal(drift(e2).ax, 1);
  src2.x = 8;
  step(w2, c);
  assert.equal(drift(e2).ax, 1);
});

test('[状态-11] being moved off the path makes 诱导 replan, and it still arrives', () => {
  const c = content(['........'], [leg(0, 0, 0, 7)]);
  const [w, e] = boot(c);
  applyStatus(e, 'attract', { point: { x: 6, y: 0 }, frames: 120 });
  step(w, c);
  const way = drift(e).way;
  displace(e, 0, 0);
  step(w, c);
  assert.notEqual(drift(e).way, way);
  assert.equal(until(w, c, () => e.x === 6 && e.y === 0, 80) > 0, true);
});

test('[状态-5] [状态-11] 诱导 is its own resistible status, kept independently, and is not given the unblockable flag', () => {
  assert.equal(STATUS.attract.rule, 'independent');
  assert.equal(STATUS.attract.maxStacks, 1000000);
  assert.equal(STATUS.attract.resist, true);
  assert.equal(STATUS.fear.resist, true);
  assert.deepEqual(STATUS.attract.flags, { attract: true });
  assert.equal(STATUS.fear.rule, 'queue');
});

test('[同步-2] [状态-10] a snapshot mid-flight restores the same frames', () => {
  const { w, e, c } = scare(80);
  until(w, c, () => drift(e).placed === 1, 4);
  for (let i = 0; i < 7; i++) step(w, c);
  const snap = JSON.parse(JSON.stringify(takeSnapshot(w)));
  /** @param {World} world @returns {number[]} */
  const hashes = (world) => {
    /** @type {number[]} */
    const out = [];
    for (let i = 0; i < 12; i++) { step(world, c); out.push(stateHash(world)); }
    return out;
  };
  assert.deepEqual(hashes(w), hashes(restoreSnapshot(snap)));
});
