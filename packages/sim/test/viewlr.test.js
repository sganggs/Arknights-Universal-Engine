// The render state's `lr` (docs/spec/render.md 渲染-4): an enemy's left or right as the simulation has it (敌能-90),
// −1 left, 1 right; 0 for a unit that is not an enemy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { readView, KIND } from '@aue/schema';
import { createWorld, step } from '../src/index.js';
import { toView } from '../src/view.js';

test('[渲染-4] [敌能-90] the render state gives an enemy its left or right, and an operator 0', () => {
  const c = /** @type {any} */ (tinyContent());
  const key = Object.keys(c.enemies)[0];
  if (!key) throw new Error('the tiny content has no enemy');
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 0 }]]);
  const e = w.units.find((u) => u.kind === KIND.ENEMY);
  if (!e) throw new Error('missing the enemy');
  /** @param {number} id */
  const lrOf = (id) => readView(toView(w)).units.find((u) => u.id === id)?.lr;
  e.lr = undefined;
  assert.equal(lrOf(e.id), 1, 'right: the field is absent in the simulation');
  e.lr = -1;
  assert.equal(lrOf(e.id), -1);
  const op = w.units.find((u) => u.kind === KIND.OPERATOR);
  if (!op) throw new Error('missing the operator');
  assert.equal(lrOf(op.id), 0);
});
