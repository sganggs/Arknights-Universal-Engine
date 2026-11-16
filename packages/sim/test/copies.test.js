// Copies of one operator in one deck (docs/spec/lockstep.md 同步-9, docs/spec/field.md 部署-2, 部署-3, 部署-10): each
// copy is its own card and unit; the deck's talents of one operator count once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, deployProblem } from '../src/index.js';
import { deployCost, withdraw, cardOf } from '../src/deck.js';

/**
 * The tiny level without waves for two seats, its records changed — each key's fields over the record `from` names —,
 * with these decks. @param {Record<string, Record<string, any>>} ops @param {string[][]} decks
 */
function arena(ops, decks) {
  const base = tinyContent();
  const c = /** @type {any} */ ({ ...base, level: { ...base.level, waves: [], options: { ...base.level.options, maxCost: 99, characterLimit: 9 } }, operators: { ...base.operators }, decks });
  for (const [k, { from, ...o }] of Object.entries(ops)) c.operators[k] = { ...c.operators[from], ...o };
  return { w: createWorld(c, { seed: 1, players: 2 }), c };
}

/** @param {string} op @param {number} col @returns {import('@aue/schema').DeployCommand} */
const at = (op, col) => ({ type: 'deploy', op, row: 1, col, dir: 0 });

test('[同步-9] [部署-2] [部署-3] two copies of one operator: both on the field at once, each its own card and penalty', () => {
  const { w, c } = arena({ 'guard#0': { from: 'guard', char: 'guard' }, 'guard#0#2': { from: 'guard', char: 'guard' } }, [['guard#0', 'guard#0#2'], []]);
  const p = w.players[0];
  p.cost = 99;
  step(w, c, [[0, at('guard#0', 1)]]);
  assert.equal(deployProblem(w, c, 0, at('guard#0', 2)), 'already deployed');
  assert.equal(deployProblem(w, c, 0, at('guard#0#2', 2)), null, 'the other copy is another card');
  step(w, c, [[0, at('guard#0#2', 2)]]);
  assert.deepEqual(w.units.filter((u) => u.owner === 0).map((u) => u.key), ['guard#0', 'guard#0#2']);
  withdraw(w, c, /** @type {any} */ (w.units.find((u) => u.key === 'guard#0')));
  assert.deepEqual([cardOf(p, 'guard#0').penalty, cardOf(p, 'guard#0#2').penalty], [1, 0]);
  assert.deepEqual([deployCost(c, p, 'guard#0'), deployCost(c, p, 'guard#0#2')], [7, 5]);
});

test('[部署-10] [费用-1] copies of one operator: the deck\'s start cost and cuts once, the largest; two operators still both', () => {
  const copy = (/** @type {number} */ n) => ({ from: 'guard', char: 'guard', talentTrait: { startCost: n, costCuts: [{ profession: 'SNIPER', value: -n }] } });
  const ops = { 'guard#0': copy(1), 'guard#0#2': copy(2), 'sniper#0': { from: 'sniper', profession: 'SNIPER', char: 'sniper' } };
  const copies = arena(ops, [['guard#0', 'guard#0#2', 'sniper#0'], []]);
  assert.equal(copies.w.players[0].cost, 12, '10 + 2, not + 3');
  assert.equal(deployCost(copies.c, copies.w.players[0], 'sniper#0'), 1, '3 − 2, not − 3');
  const two = arena({ ...ops, 'guard#0#2': { ...copy(2), char: 'other' } }, [['guard#0', 'guard#0#2', 'sniper#0'], []]);
  assert.equal(two.w.players[0].cost, 13);
  assert.equal(deployCost(two.c, two.w.players[0], 'sniper#0'), 0);
});
