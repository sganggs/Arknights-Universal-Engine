// The engine's healHit event (docs/spec/hooks.md 钩子-3; traits.md 职业-2, 职业-11): after a healer's heal attack on one
// target and its chain's jumps, once per target, with the attack's amount for it; none for a damage attack; nothing more
// happens without a handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, stateHash, bus } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';

/** @typedef {import('../src/types.js').World} World @typedef {import('../src/types.js').Unit} Unit */

/** A 3 × 3 range around the operator. */
const AROUND = [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col })));

/**
 * The tiny level without spawns and two more guards; the sniper heals (ATK 200, one target, `chain` when given) from (2, 2).
 * `hook(w)` runs before anything is deployed. @param {{ chain?: boolean, hook?: (w: World) => void }} [o]
 */
function ward(o = {}) {
  const c = tinyContent();
  c.level.waves = [];
  c.level.options = { ...c.level.options, characterLimit: 9, initialCost: 99, maxCost: 99 };
  c.operators.g2 = { ...c.operators.guard };
  c.operators.g3 = { ...c.operators.guard };
  const chain = o.chain ? { chain: { max: 3, scale: 0.5, radius: 0, cells: AROUND } } : {};
  c.operators.sniper = { ...c.operators.sniper, atk: 200, range: AROUND, trait: { heal: true, targets: 1, ...chain } };
  const w = createWorld(c, { seed: 1, players: 1 });
  o.hook?.(w);
  /** @param {string} op @param {number} row @param {number} col */
  const put = (op, row, col) => { step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]); return /** @type {Unit} */ (w.units.at(-1)); };
  return { w, c, put };
}

/**
 * Runs n frames: the healHit events seen and the heal events as [frame, healer, target, amount] — the frame a step ran
 * (the world's counter moves on as it returns). @param {ReturnType<typeof ward>} x @param {any[]} seen @param {number} n
 */
function run(x, seen, n) {
  /** @type {any[]} */
  const heals = [];
  for (let i = 0; i < n; i++) for (const e of step(x.w, x.c)) if (e.type === 'heal') heals.push([x.w.frame - 1, e.id, e.target, e.amount]);
  return { hits: seen, heals };
}

test('[钩子-3] [职业-2] a heal attack sends healHit for its target after the heal, with the attack\'s amount before the heal multipliers', () => {
  /** @type {any[]} */
  const seen = [];
  const x = ward({ hook: (w) => bus.on(w, 'healHit', (k) => { seen.push([w.frame, k.healer.key, k.target.key, k.amount, k.target.hp, k.isSkill]); }) });
  const g1 = x.put('guard', 1, 2);
  x.put('sniper', 2, 2);
  g1.hp = 300;
  const { hits, heals } = run(x, seen, 120);
  assert.ok(hits.length >= 2, 'one per attack');
  assert.deepEqual(hits.map((h) => h.slice(1, 4)), hits.map(() => ['sniper', 'guard', 200]));
  assert.equal(hits[0][4], 500, 'the target is already healed when it is sent');
  assert.deepEqual(hits.map((h) => h[0]), heals.filter((e) => e[2] === g1.id).map((e) => e[0]), 'the same frame as each heal');
  assert.ok(hits.every((h) => h[5] === false), 'not a skill attack');
});

test('[钩子-3] [职业-11] a heal chain sends one healHit, for its first target, after every jump', () => {
  /** @type {any[]} */
  const seen = [];
  const x = ward({ chain: true, hook: (w) => bus.on(w, 'healHit', (k) => { seen.push([k.target.key, k.amount, w.units.filter((u) => u.key === 'g2')[0]?.hp]); }) });
  const g1 = x.put('guard', 1, 2), g2 = x.put('g2', 1, 1);
  x.put('sniper', 2, 2);
  g1.hp = 500; g2.hp = 900;
  const { hits } = run(x, seen, 2);
  assert.deepEqual(hits, [['guard', 200, 1000]], 'g1 the target; g2, the jump, already healed');
});

test('[钩子-3] a damage attack sends no healHit; without a handler every frame\'s state hash is the one with a handler that does nothing', () => {
  /** @type {any[]} */
  const seen = [];
  const dmg = ward({ hook: (w) => bus.on(w, 'healHit', (k) => { seen.push(k); }) });
  dmg.put('guard', 1, 1);
  const e = makeEnemy(dmg.w, dmg.c, { key: 'slime', route: 0 });
  Object.assign(e, { x: 2, y: 1 });
  e.hp = statsOf(e).maxHp;
  applyStatus(e, 'root', {});
  dmg.w.units.push(e);
  for (let i = 0; i < 60; i++) step(dmg.w, dmg.c);
  assert.ok(e.hp < statsOf(e).maxHp, 'the guard hit it');
  assert.deepEqual(seen, []);
  const plain = ward(), hooked = ward({ hook: (w) => bus.on(w, 'healHit', () => {}) });
  for (const x of [plain, hooked]) { const g = x.put('guard', 1, 2); x.put('sniper', 2, 2); g.hp = 300; }
  for (let i = 0; i < 60; i++) {
    step(plain.w, plain.c);
    step(hooked.w, hooked.c);
    assert.equal(stateHash(hooked.w), stateHash(plain.w), `frame ${plain.w.frame}`);
  }
});
