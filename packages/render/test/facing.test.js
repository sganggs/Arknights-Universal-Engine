/**
 * The facing state machine (render/facing.js, 渲染-4): a re-acquired target decides the side from the 45° rule, the same
 * target only mirrors when it changes column, and a target in the model's own tile judges nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DIR } from '@aue/schema';
import { operatorFacing } from '../src/roles.js';
import { facingStep, sideOf, flipOf } from '../src/facing.js';
import { FACE_OVERRIDES } from '../src/faceModes.js';

const front = { side: /** @type {const} */ ('front'), flip: false };
const back = { side: /** @type {const} */ ('back'), flip: false };

test('there are no hand-tuned thresholds: only tiles decide (渲染-4)', async () => {
  const mod = /** @type {Record<string, unknown>} */ (await import('../src/facing.js'));
  assert.equal(mod.FACING_DEAD_ZONE, undefined);
  assert.equal(mod.FACING_CLOSE, undefined);
});

test('a new target above 45° is the back model, anything else the front (渲染-4)', () => {
  assert.deepEqual(facingStep(front, 1, 3, true), { side: 'back', flip: false }, '1 aside 3 up is steeper than 45°');
  assert.deepEqual(facingStep(front, 3, 1, true), { side: 'front', flip: false }, '1 up 3 aside is shallower');
  assert.deepEqual(facingStep(back, 3, -1, true), { side: 'front', flip: false }, 'below is the front model');
});

test('a new target mirrors by the side it is on, however small (渲染-4)', () => {
  assert.deepEqual(facingStep(front, -1, 5, true), { side: 'back', flip: true });
  assert.deepEqual(facingStep(back, 1, 5, true), { side: 'back', flip: false });
});

test('a back-deployed operator keeps its back model unless the target is steeply below (渲染-4)', () => {
  assert.deepEqual(facingStep(back, 1, -3, true, true), { side: 'front', flip: false }, 'below and steeper than 45°');
  assert.deepEqual(facingStep(back, 3, -1, true, true), { side: 'back', flip: false }, 'below but shallower keeps the back');
  assert.deepEqual(facingStep(back, 1, 3, true, true), { side: 'back', flip: false }, 'above keeps the back');
  assert.deepEqual(facingStep(back, -1, -5, true, true), { side: 'front', flip: true }, 'steeply below and to the left mirrors');
});

test('the same target keeps its side outside its column and only mirrors (渲染-4)', () => {
  assert.deepEqual(facingStep(back, 2, 1, false), { side: 'back', flip: false }, 'shallow above keeps the back');
  assert.deepEqual(facingStep(front, 1, 3, false), { side: 'front', flip: false }, 'steep above keeps the front');
  assert.deepEqual(facingStep(front, -2, 1, false), { side: 'front', flip: true });
});

test('the same target in its own column keeps the mirror, above or below switches the side (渲染-4)', () => {
  assert.deepEqual(facingStep(front, 0.2, 1, false), { side: 'back', flip: false }, 'straight above: to the back');
  assert.deepEqual(facingStep(back, 0.2, 1, false), { side: 'back', flip: false }, 'already back: stays back');
  assert.deepEqual(facingStep(back, 0.2, -1, false), { side: 'front', flip: false }, 'straight below: back to front');
  assert.deepEqual(facingStep(front, -0.2, 1, false), { side: 'back', flip: false }, 'and the mirror is left alone');
});

test('a target in the model own tile judges nothing (渲染-4)', () => {
  assert.deepEqual(facingStep(back, 0, 0, true), back);
  assert.deepEqual(facingStep(front, 0.3, 0.3, true), front);
  assert.deepEqual(facingStep(back, -0.4, 0.4, false), back);
});

test('operatorFacing: the back only when the model has one (渲染-4)', () => {
  const m = { back: true, backDies: true, dying: false };
  assert.deepEqual(operatorFacing({ side: 'back', flip: false }, m), { side: 'back', flip: false });
  assert.deepEqual(operatorFacing({ side: 'back', flip: true }, m), { side: 'back', flip: true });
  assert.deepEqual(operatorFacing({ side: 'back', flip: false }, { back: false, backDies: false, dying: false }), { side: 'front', flip: false });
  assert.deepEqual(operatorFacing({ side: 'front', flip: true }, m), { side: 'front', flip: true });
});

test('sideOf and flipOf are the deploy direction alone (渲染-4)', () => {
  assert.equal(sideOf(DIR.UP), 'back');
  for (const d of [DIR.RIGHT, DIR.LEFT, DIR.DOWN]) assert.equal(sideOf(d), 'front');
  assert.equal(flipOf(DIR.LEFT), true);
});

test('the per-operator table holds 野鬃 out only while its skill runs (渲染-4)', () => {
  assert.equal(typeof FACE_OVERRIDES, 'object');
  assert.equal(FACE_OVERRIDES.char_496_wildmn.when, 'skill');
});
