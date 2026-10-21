// Colliders (docs/spec/body.md 体积-5): an enemy is in a range when its collider, a circle of 0.1 tiles around its
// position, overlaps a tile of it — exact at binary fractions, equal to an independent brute force at random positions —
// while huge units keep their rectangles and our units their tiles; then on the tiny level: an enemy just past a range's
// last tile, one blocked head-on short of its blocker's tile, a search by tile (谬因, `rangeTiles`) and a 要塞's own tile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, body, targeting as T, constants as K, KIND } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { targetsOf } from '../src/combat.js';
import { fortressSplash } from '../src/modes.js';

/** @typedef {import('../src/types.js').Unit} Unit */

const SEED = 20261016, G = { rows: 5, cols: 5 }, R = K.ENEMY_COLLIDER_RADIUS;
/** A regular enemy at (x, y), with only what the judgment reads. @param {number} x @param {number} y @returns {any} */
const enemy = (x, y) => ({ kind: KIND.ENEMY, x, y });
/** The key of tile (r, c) on G. @param {number} r @param {number} c */
const key = (r, c) => r * G.cols + c;

/**
 * The tiles of G a circle of radius `rho` around (x, y) overlaps, by brute force: those whose square is nearer to the
 * centre than `rho` (a circle touching a square does not overlap it).
 * @param {number} x @param {number} y @param {number} rho
 */
function bruteKeys(x, y, rho) {
  const out = [];
  for (let r = 0; r < G.rows; r++) {
    for (let c = 0; c < G.cols; c++) {
      const dx = Math.max(0, Math.abs(x - c) - 0.5), dy = Math.max(0, Math.abs(y - r) - 0.5);
      if (dx * dx + dy * dy < rho * rho) out.push(key(r, c));
    }
  }
  return out;
}

test('[常量-6] [体积-5] the collider of a regular enemy reaches the next tile 0.4 tiles from its tile\'s centre, the diagonal one past the corner', () => {
  assert.deepEqual(body.colliderKeys(enemy(2.375, 2), G, R), [key(2, 2)], '0.375: inside its tile');
  assert.deepEqual(body.colliderKeys(enemy(2.4375, 2), G, R), [key(2, 2), key(2, 3)], '0.4375: over the edge');
  assert.deepEqual(body.colliderKeys(enemy(1.5625, 2), G, R), [key(2, 2), key(2, 1)], 'the other side');
  assert.deepEqual(body.colliderKeys(enemy(2, 2.4375), G, R), [key(2, 2), key(3, 2)], 'the next row');
  assert.deepEqual(body.colliderKeys(enemy(2.4375, 2.4375), G, R), [key(2, 2), key(3, 2), key(2, 3), key(3, 3)], 'past the corner: the diagonal tile too');
  assert.deepEqual(body.colliderKeys(enemy(2.421875, 2.421875), G, R), [key(2, 2), key(3, 2), key(2, 3)], 'over both edges, short of the corner');
  assert.deepEqual(body.colliderKeys(enemy(4.4375, 4), G, R), [key(4, 4)], 'a tile off the grid is left out');
  assert.deepEqual(body.colliderKeys(enemy(-0.5625, 1), G, R), [key(1, 0)], 'off the grid itself, its collider on the first column');
});

test('[体积-5] touching is not overlapping: at the edge and at the corner, exact in binary', () => {
  assert.deepEqual(body.colliderKeys(enemy(2.375, 2), G, 0.125), [key(2, 2)], 'a circle of 0.125 touching the edge');
  assert.deepEqual(body.colliderKeys(enemy(2.375 + 2 ** -20, 2), G, 0.125), [key(2, 2), key(2, 3)], 'just over it');
  // a circle of 5/32 whose centre is 3/32 and 4/32 from the corner: 3² + 4² = 5²
  assert.equal(body.cornerIn(13 / 32, 12 / 32, 5 / 32), false, 'touching the corner');
  assert.equal(body.cornerIn(13 / 32 + 2 ** -20, 12 / 32, 5 / 32), true, 'just past it');
  assert.deepEqual(body.colliderKeys(enemy(2 + 13 / 32, 2 + 12 / 32), G, 5 / 32), [key(2, 2), key(3, 2), key(2, 3)]);
});

/** A coordinate on and around G that is not within 10⁻⁹ of an edge of the collider (where float rounding decides). */
const coord = fc.double({ min: -1.5, max: 5.5, noNaN: true }).filter((v) => Math.abs(Math.abs(v - Math.round(v)) - (0.5 - R)) > 1e-9);

test('[体积-5] the overlapped tiles are the brute force\'s at random positions; inKeys asks the same of a regular enemy', () => {
  fc.assert(fc.property(coord, coord, fc.uniqueArray(fc.integer({ min: 0, max: G.rows * G.cols - 1 }), { maxLength: 8 }), (x, y, ks) => {
    const ax = 0.5 - Math.abs(x - Math.round(x)), ay = 0.5 - Math.abs(y - Math.round(y));
    fc.pre(Math.abs(ax * ax + ay * ay - R * R) > 1e-9);
    const u = enemy(x, y), keys = new Set(ks), got = body.colliderKeys(u, G, R);
    assert.deepEqual(got.toSorted((a, b) => a - b), bruteKeys(x, y, R));
    assert.equal(T.inKeys(u, keys, G), got.some((k) => keys.has(k)));
    return true;
  }), { seed: SEED, numRuns: 4000 });
});

test('[体积-5] [体积-1] [体积-2] a huge enemy is in range by its rectangle, any other unit by its tile, and a search by tile asks the tile', () => {
  const next = new Set([key(2, 3)]);
  assert.equal(T.inKeys(enemy(2.4375, 2), next, G), true, 'a regular enemy: its collider');
  assert.equal(T.inKeys(enemy(2.4375, 2), next, G, true), false, 'searched by tile (谬因)');
  assert.equal(T.inKeys({ ...enemy(2.4375, 2), hitArea: { w: 0.125, h: 0.125, dx: 0, dy: 0 } }, next, G), false, 'a huge one: its rectangle, short of the tile');
  assert.equal(T.inKeys({ ...enemy(2.4375, 2), hitArea: { w: 0.25, h: 0.25, dx: 0, dy: 0 } }, next, G), true, 'a huge one: its rectangle, on the tile');
  for (const kind of [KIND.OPERATOR, KIND.DEVICE]) assert.equal(T.inKeys(/** @type {any} */ ({ kind, x: 2.4375, y: 2 }), next, G), false, `kind ${kind}: its tile`);
});

/**
 * The tiny level without spawns, `tweak` applied; `foe` adds a rooted enemy without defence at (row, x), `put` deploys
 * an operator facing right.
 * @param {(c: any) => void} [tweak]
 */
function arena(tweak = () => {}) {
  const c = tinyContent();
  c.level.waves = [];
  c.level.options = { ...c.level.options, characterLimit: 9, initialCost: 99, maxCost: 99 };
  tweak(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @param {number} row @param {number} x */
  const foe = (row, x) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = x; e.y = row;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  /** @param {string} op @param {number} row @param {number} col */
  const put = (op, row, col) => { step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]); return /** @type {Unit} */ (w.units.at(-1)); };
  return { w, c, foe, put };
}

// the sniper on (2, 2) facing right: its range is (1, 1), (1, 2), (1, 3) and (2, 3)
test('[索敌-1] [体积-5] an enemy that left the last tile of a range is in it while its collider is over the edge; by tile it is not', () => {
  const { w, c, foe, put } = arena();
  const sniper = put('sniper', 2, 2), over = foe(1, 3.5625), off = foe(1, 3.625);
  assert.deepEqual(targetsOf(w, c, sniper), [over], '0.4375 from the centre of (1, 4): over the edge of (1, 3)');
  c.operators.sniper = { ...c.operators.sniper, trait: { rangeTiles: true } };
  assert.deepEqual(targetsOf(w, c, sniper), [], 'searched by tile: (1, 4) is not in range');
  assert.ok(!targetsOf(w, c, sniper).includes(off));
});

test('[索敌-1] [体积-5] [阻挡-1] a ground enemy blocked head-on stops short of its blocker\'s tile: not in a range that ends there', () => {
  const { w, c, put } = arena((x) => {
    x.level.waves = tinyContent().level.waves;
    x.enemies.slime = { ...x.enemies.slime, maxHp: 1e6 };
  });
  const guard = put('guard', 1, 1), sniper = put('sniper', 2, 2);
  for (let i = 0; i < 300 && !w.units.some((u) => u.kind === KIND.ENEMY && u.blockedBy === guard.id); i++) step(w, c, []);
  const held = w.units.filter((u) => u.kind === KIND.ENEMY && u.blockedBy === guard.id);
  assert.ok(held.length > 0, 'blocked');
  for (let i = 0; i < 30; i++) step(w, c, []);
  for (const e of held) {
    assert.ok(e.x < 0.5 - R && e.y === 1, `stopped ${e.x} on (1, 0), its collider short of (1, 1)`);
    assert.ok(!targetsOf(w, c, sniper).includes(e));
  }
});

test('[职业-12] [体积-5] 要塞: an enemy whose collider overlaps its tile is one for its melee attack, a candidate though out of its range', () => {
  const { w, c, foe, put } = arena((x) => { x.operators.guard = { ...x.operators.guard, blockCnt: 0, range: [{ row: 0, col: 1 }, { row: 0, col: 2 }], trait: { fortress: 1 } }; });
  const op = put('guard', 1, 1), close = foe(1, 1.5625), far = foe(1, 1.625), behind = foe(1, 0.4375);
  assert.equal(fortressSplash(c, op, close), null, 'over its tile: melee, no splash');
  assert.deepEqual(fortressSplash(c, op, far), { radius: 1, scale: 1, ground: false }, 'short of it: ranged, with its splash');
  assert.ok(targetsOf(w, c, op).includes(behind), 'behind it, out of its range: over its tile');
  assert.equal(statsOf(behind).flying, false);
});
