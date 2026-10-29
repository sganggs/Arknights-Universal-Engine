// Snapshot recovery after displacement (同步-2, 位移-3): a finished slide must not leave a key whose
// insertion order JSON loses before the next displacement, after fear or attract has added drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot, displacement, status, KIND } from '../src/index.js';

/** @typedef {import('../src/index.js').World} World @typedef {import('../src/index.js').Content} Content */

/** @param {World} w */
const restored = (w) => restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));

/** @param {World} a @param {World} b @param {Content} c @param {number} frames */
function sameFrames(a, b, c, frames) {
  assert.equal(stateHash(b), stateHash(a), 'before continuing');
  for (let i = 0; i < frames; i++) {
    assert.deepEqual(step(b, c), step(a, c), `events at frame ${a.frame}`);
    assert.equal(stateHash(b), stateHash(a), `hash at frame ${a.frame}`);
  }
}

/** @param {World} w @param {Content} c @param {import('../src/index.js').Unit} e */
function finishSlide(w, c, e) {
  for (let i = 0; i < 90 && e.slide; i++) step(w, c);
  assert.equal(e.slide, undefined, 'the displacement finished');
}

/** @param {string} id @param {object} attack @returns {any} */
const passive = (id, attack) => ({ id, type: 'PASSIVE', sp: 'time', cost: 0, init: 0, charges: 1, duration: 0, ammo: false, bb: {}, extra: { attack } });

test('[同步-2] [位移-3] [状态-10] deployment commands resume identically when fear follows a finished push', () => {
  const c = tinyContent();
  c.enemies.slime = { ...c.enemies.slime, maxHp: 100000, moveSpeed: 0.2 };
  c.level.waves[0].fragments[0].actions = c.level.waves[0].fragments[0].actions.slice(0, 1);
  const range = Array.from({ length: 18 }, (_, k) => ({ row: Math.floor(k / 6) - 1, col: k % 6 - 1 }));
  c.operators.guard = { ...c.operators.guard, atk: 1, range, baseAttackTime: 3, skill: passive('push', { displace: { pull: false, force: 0 } }) };
  c.operators.fear = { ...c.operators.guard, cost: 1, skill: passive('fear', { hitStatus: { key: 'fear', seconds: 0.1 } }) };
  const w = createWorld(c, { seed: 7, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  for (let i = 0; i < 90 && !w.units.some((u) => u.slide); i++) step(w, c);
  const e = w.units.find((u) => u.kind === KIND.ENEMY);
  assert.ok(e?.slide, 'the first ordinary attack pushed the enemy');
  finishSlide(w, c, e);
  step(w, c, [[0, { type: 'deploy', op: 'fear', row: 1, col: 0, dir: 0 }]]);
  assert.ok(e.drift, 'the second ordinary attack applied fear');
  sameFrames(w, restored(w), c, 180);
});

for (const kind of ['push', 'pull']) {
  test(`[同步-2] [位移-3] [状态-11] a second ${kind} after attract keeps snapshot hashes and events`, () => {
    const c = tinyContent(), w = createWorld(c, { seed: 7, players: 1 });
    for (let i = 0; i < 16; i++) step(w, c);
    const e = w.units[0];
    /** @param {World} world @param {import('../src/index.js').Unit} u */
    const force = (world, u) => kind === 'push'
      ? displacement.push(world, c, u, 0, { from: { x: u.x - 1, y: u.y } })
      : displacement.pull(world, c, u, 0, { to: { x: u.x + 1, y: u.y }, by: { x: u.x - 1, y: u.y } });
    assert.ok(force(w, e));
    finishSlide(w, c, e);
    status.applyStatus(e, 'attract', { frames: 30, point: { x: 1, y: 1 } });
    const copy = restored(w), target = copy.units.find((u) => u.id === e.id);
    assert.ok(target);
    assert.equal(stateHash(copy), stateHash(w));
    assert.ok(force(w, e));
    assert.ok(force(copy, target));
    sameFrames(w, copy, c, 90);
  });
}

test('[同步-2] [位移-3] an active push survives a snapshot and finishes identically', () => {
  const c = tinyContent(), w = createWorld(c, { seed: 7, players: 1 });
  for (let i = 0; i < 16; i++) step(w, c);
  const e = w.units[0];
  assert.ok(displacement.push(w, c, e, 0, { from: { x: e.x - 1, y: e.y } }));
  sameFrames(w, restored(w), c, 90);
});

