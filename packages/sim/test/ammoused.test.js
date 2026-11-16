// The engine's ammoUsed event (docs/spec/hooks.md 钩子-3, skills.md 技能-4): after each shot a running ammo skill's attack
// spends, with the shots left; none for a shot an `attack` handler made free, none for other attacks; nothing more
// happens without a handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, stateHash, bus } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';

/** @typedef {import('../src/types.js').World} World @typedef {import('../src/types.js').Unit} Unit */

/**
 * The tiny level without waves: the guard (ATK 50, 1 s) at (1, 1) with an ammo skill of `shots` shots it may start at once,
 * a rooted dummy of a billion HP in its range. `hook(w)` runs before the deploy.
 * @param {number} shots @param {(w: World) => void} [hook]
 */
function arena(shots, hook = () => {}) {
  const c = tinyContent();
  c.operators.guard.skill = { id: 'test', type: 'MANUAL', sp: 'time', cost: 1, init: 1, charges: 1, duration: 0, ammo: true, bb: { 'attack@trigger_time': shots, 'attack@atk_scale': 3 } };
  c.level.waves = [];
  const w = createWorld(c, { seed: 1, players: 2 });
  hook(w);
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const guard = /** @type {Unit} */ (w.units[0]);
  const foe = makeEnemy(w, c, { key: 'slime', route: 0 });
  foe.x = 2; foe.y = 1;
  foe.base = { ...foe.base, maxHp: 1e9, def: 0 };
  foe.hp = 1e9; foe.maxHp = 1e9;
  applyStatus(foe, 'root', {});
  w.units.push(foe);
  return { w, c, guard };
}

/** Runs n frames, the first with the skill command; the hits' damage in order. @param {any} a @param {number} n */
function run(a, n) {
  /** @type {number[]} */
  const hits = [];
  for (let i = 0; i < n; i++) for (const e of step(a.w, a.c, i === 0 ? [[0, { type: 'skill', unit: a.guard.id }]] : [])) if (e.type === 'hit') hits.push(Number(e.damage));
  return hits;
}

test('[钩子-3] [技能-4] each shot an ammo skill\'s attack spends is followed by ammoUsed with the shots left; the normal attack after them sends none', () => {
  for (const shots of [3, 2]) {
    /** @type {any[]} */
    const seen = [];
    const a = arena(shots, (w) => { bus.on(w, 'ammoUsed', (k) => { seen.push([k.left, k.unit.key, w.frame, k.unit.skill?.ammo]); }); });
    const hits = run(a, 30 * (shots + 2));
    assert.deepEqual(hits.slice(0, shots + 1), [...Array(shots).fill(150), 50], 'skill attacks, then a normal one');
    assert.deepEqual(seen.map((x) => x[0]), Array.from({ length: shots }, (_, i) => shots - 1 - i));
    assert.ok(seen.every((x) => x[1] === 'guard' && x[3] === x[0]), 'the unit, and the event after the shot was taken');
    assert.ok(seen.every((x, i) => i === 0 || x[2] > seen[i - 1][2]), 'one per attack');
  }
});

test('[钩子-3] [技能-4] a shot an `attack` handler made free is not spent and sends no ammoUsed', () => {
  /** @type {number[]} */
  const seen = [];
  let free = 1;
  const a = arena(2, (w) => {
    bus.on(w, 'attack', (k) => { if (free > 0 && k.isSkill) { free--; k.noAmmo = true; } });
    bus.on(w, 'ammoUsed', (k) => { seen.push(k.left); });
  });
  const hits = run(a, 30 * 5);
  assert.deepEqual(hits.slice(0, 4), [150, 150, 150, 50], 'the free shot leaves two to spend');
  assert.deepEqual(seen, [1, 0]);
});

test('[钩子-3] without a handler nothing more happens: every frame\'s state hash is the one with a handler that does nothing', () => {
  const plain = arena(3), hooked = arena(3, (w) => { bus.on(w, 'ammoUsed', () => {}); });
  for (let i = 0; i < 30 * 5; i++) {
    step(plain.w, plain.c, i === 0 ? [[0, { type: 'skill', unit: plain.guard.id }]] : []);
    step(hooked.w, hooked.c, i === 0 ? [[0, { type: 'skill', unit: hooked.guard.id }]] : []);
    assert.equal(stateHash(hooked.w), stateHash(plain.w), `frame ${plain.w.frame}`);
  }
});
