// Bodies (docs/spec/body.md): equal to the pinned Stronghold oracle on its 19 × 21 board for random point and huge
// units. v0.3.1 rounds a point exactly halfway between tiles half to even, the same as 体积-1 (DIF-0003 已消除).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { loadOracle } from '@aue/testkit';
import { body } from '../src/index.js';

const SEED = 20261011, G = { rows: 19, cols: 21 };
/** @type {any} */
let sh;
before(async () => { sh = await loadOracle('server/sim/body.js'); });

/** Not exactly halfway between two tiles. @param {number} v */
const notHalf = (v) => v - Math.floor(v) !== 0.5;
const coord = (/** @type {number} */ max) => fc.double({ min: -3, max, noNaN: true }).filter(notHalf);
const area = fc.option(fc.record({ w: fc.double({ min: 0.3, max: 6, noNaN: true }), h: fc.double({ min: 0.3, max: 4, noNaN: true }),
  dx: fc.double({ min: -2, max: 2, noNaN: true }), dy: fc.double({ min: -2, max: 2, noNaN: true }) }), { nil: null });
const unit = fc.record({ x: coord(G.cols + 2), y: coord(G.rows + 2), hitArea: area });

test('[体积-1] [体积-2] occupied tiles: the oracle\'s on its board, for point and huge units', () => {
  fc.assert(fc.property(unit, fc.integer({ min: -1, max: G.rows }), fc.integer({ min: -1, max: G.cols }), (u, r, c) => {
    // keys are integers: the oracle can give −0 for (−0, −0), which means tile 0 (=== and Set treat them alike)
    assert.deepStrictEqual(body.bodyKeys(u, G), sh.bodyKeys(u).map((/** @type {number} */ k) => k + 0));
    assert.equal(body.bodyOnTile(u, r, c), sh.bodyOnTile(u, r, c));
    const keys = new Set([r * G.cols + c, (r + 1) * G.cols + c]);
    assert.equal(body.bodyInKeys(u, keys, G), sh.bodyInKeys(u, keys));
    assert.equal(body.bodyInKeys(u, [...keys], G), sh.bodyInKeys(u, [...keys]));
    assert.deepStrictEqual(body.hitRect(u), sh.hitRect(u));
    return true;
  }), { seed: SEED, numRuns: 4000 });
});

test('[体积-1] a point exactly halfway rounds half to even (the v0.3.1 oracle does too: DIF-0003 已消除)', () => {
  const u = { x: 2.5, y: 3.5 };
  assert.deepEqual(body.tileOf(u), [4, 2]);
  assert.deepEqual(body.bodyKeys(u, G), [4 * G.cols + 2]);
  assert.deepEqual(sh.bodyKeys(u), [4 * G.cols + 2], 'the oracle uses roundHalfEven');
  assert.deepEqual(body.tileOf({ x: -0.5, y: 0.5 }), [0, 0]);
  assert.equal(Object.is(body.tileOf({ x: -0.4, y: 0 })[1], -0), false, 'no −0');
  assert.equal(body.bodyOnTile({ x: 1.5, y: 0 }, 0, 2), true);
  assert.deepEqual(body.bodyKeys({ x: 30, y: 2 }, G), []);
});

test('[体积-3] distance to the body (0 inside a rectangle) and the radius test: the oracle\'s', () => {
  const pt = fc.double({ min: -5, max: 25, noNaN: true });
  fc.assert(fc.property(unit, pt, pt, fc.double({ min: 0, max: 6, noNaN: true }), (u, x, y, r) =>
    Object.is(body.bodyDist(u, x, y), sh.bodyDist(u, x, y)) && body.bodyInRadius(u, x, y, r) === sh.bodyInRadius(u, x, y, r)), { seed: SEED, numRuns: 4000 });
});

test('[体积-4] Chebyshev reach from a tile: the oracle\'s', () => {
  fc.assert(fc.property(unit, fc.integer({ min: 0, max: G.rows - 1 }), fc.integer({ min: 0, max: G.cols - 1 }), (u, r, c) =>
    body.bodyTileReach(u, r, c, G) === sh.bodyTileReach(u, r, c)), { seed: SEED, numRuns: 4000 });
});

test('[体积-2] hit areas: valid ones are kept and frozen, anything else is a point unit (the oracle\'s rule)', () => {
  const samples = [null, undefined, 3, 'x', {}, { w: 4.95, h: 2.95, dy: 1 }, { w: 0, h: 1 }, { w: 1, h: -1 }, { w: '2', h: '3', dx: '1' },
    { w: Infinity, h: 1 }, { w: 1, h: 1, dx: NaN }, { w: 1e-9, h: 1e-9 }];
  for (const a of samples) assert.deepStrictEqual(body.normHitArea(a), sh.normHitArea(a), JSON.stringify(a));
  assert.ok(Object.isFrozen(body.normHitArea({ w: 1, h: 1 })));
});

test('[体积-1] [体积-2] another grid: keys stay on a 12 × 9 level', () => {
  const g = { rows: 9, cols: 12 };
  fc.assert(fc.property(unit, (u) => body.bodyKeys(u, g).every((k) => k >= 0 && k < 9 * 12)), { seed: SEED, numRuns: 2000 });
});
