// A 静态刚体 (docs/spec/displacement.md 位移-5): a push or a pull puts it into 失衡 and does not move it; the state lasts
// only while the force does. 失衡免疫 and an ordinary enemy stay on the rules they already have.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/index.js';
import { push, pull, slideStep, displaceable } from '../src/displacement.js';
import { makeEnemy } from '../src/units.js';
import { makeBuff } from '../src/buffs.js';

/** @typedef {import('../src/types.js').Unit} Unit */

const ROAD = { key: 'tile_road', height: 'LOWLAND', buildable: 'MELEE', passable: 'ALL', side: 'ALL' };

/** A level of rows with one walking enemy of weight `mass`. @param {string[]} rows @param {number} [mass] */
function field(rows, mass = 0) {
  const c = /** @type {any} */ ({
    level: { id: 't', width: rows[0].length, height: rows.length, tiles: rows.map((r) => [...r].map(() => ROAD)),
      options: { maxLifePoint: 3, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 0.5 },
      routes: [{ start: { row: 1, col: 0 }, end: { row: 1, col: rows[0].length - 1 }, motion: 'WALK', checkpoints: [] }], waves: [] },
    enemies: { e: { name: 'e', maxHp: 1e6, atk: 100, def: 0, res: 0, moveSpeed: 1, massLevel: mass, baseAttackTime: 1, applyWay: 'MELEE' } },
    operators: {},
  });
  const w = createWorld(c, { seed: 1, players: 1 }), e = makeEnemy(w, c, { key: 'e', route: 0 });
  e.x = 1; e.y = 1;
  w.units.push(e);
  return { w, c, e };
}

/** The lasting 静态刚体 flag (敌能-37). @param {Unit} e */
function mark(e) {
  e.buffs.push(makeBuff({ key: 'static', flags: { staticBody: true } }));
}

/**
 * `e` is in 失衡 at the start of each of `frames` integrations, unmoved, and out of it after the last.
 * @param {any} c @param {Unit} e @param {number} frames
 */
function held(c, e, frames) {
  const x = e.x, y = e.y;
  for (let i = 0; i < frames; i++) {
    assert.ok(e.slide, `in 失衡 at frame ${i}`);
    assert.equal(e.slide.vx, 0);
    assert.equal(e.slide.vy, 0);
    assert.equal(slideStep(c, e), i < frames - 1);
    assert.equal(e.x, x);
    assert.equal(e.y, y);
  }
  assert.equal(e.slide, undefined);
}

test('[位移-5] [位移-1] a pushed 静态刚体 stays put, is released, and is in 失衡 only until its next slide', () => {
  const { w, c, e } = field(['.......', '.......', '.......']);
  mark(e);
  e.blockedBy = 3;
  e.blockedAt = 0;
  e.swing = { wind: 4, since: 1, targets: [], mods: { scale: 1, times: 1, targets: 1, skill: false } };
  assert.equal(displaceable(e), false);
  assert.equal(push(w, c, e, 1, { from: { x: 0, y: 1 } }), true);
  assert.equal(e.x, 1);
  assert.equal(e.y, 1);
  assert.equal(e.blockedBy, -1);
  assert.equal(e.swing, null);
  assert.equal(e.slide?.pull, undefined);
  held(c, e, 1);
  assert.equal(push(w, c, e, 1, { from: { x: 0, y: 1 }, effect: true }), true);
  assert.equal(e.x, 1);
  held(c, e, 1);
  assert.equal(pull(w, c, e, 1, { to: { x: 0.5, y: 1 }, by: { x: 0, y: 1 } }), true);
  assert.ok(e.slide?.pull);
  assert.equal(push(w, c, e, 1, { from: { x: 0, y: 1 }, effect: true }), true);
  assert.equal(e.slide?.pull, undefined);
  assert.equal(e.x, 1);
  held(c, e, 1);
  assert.equal(push(w, c, e, 1, { from: { x: 0, y: 1 } }), true);
  step(w, c);
  assert.equal(e.slide, undefined);
  assert.equal(e.x, 1);
  step(w, c);
  assert.ok(e.x > 1, 'walks again once the force is gone');
});

test('[位移-5] [位移-4] a pulled 静态刚体 stays put for the pull\'s 1 s or 0.5 s, and does not walk during it', () => {
  const full = field(['.......', '.......', '.......']);
  mark(full.e);
  assert.equal(pull(full.w, full.c, full.e, 1, { to: { x: 0.5, y: 1 }, by: { x: 0, y: 1 } }), true);
  held(full.c, full.e, 30);
  const weak = field(['.......', '.......', '.......'], 2);
  mark(weak.e);
  assert.equal(pull(weak.w, weak.c, weak.e, 0, { to: { x: 0.5, y: 1 }, by: { x: 0, y: 1 } }), true);
  held(weak.c, weak.e, 15);
  const { w, c, e } = field(['.......', '.......', '.......']);
  mark(e);
  assert.equal(pull(w, c, e, 1, { to: { x: 0.5, y: 1 }, by: { x: 0, y: 1 } }), true);
  for (let i = 0; i < 30; i++) {
    assert.ok(e.slide);
    step(w, c);
    assert.equal(e.x, 1);
    assert.equal(e.y, 1);
  }
  assert.equal(e.slide, undefined);
  step(w, c);
  assert.ok(e.x > 1, 'walks on the frame after the pull');
});

test('[位移-5] [位移-1] no force, 失衡免疫 and a flyer without the mark do not enter 失衡', () => {
  const none = field(['.......', '.......', '.......'], 4);
  mark(none.e);
  assert.equal(push(none.w, none.c, none.e, 1, { from: { x: 0, y: 1 } }), false);
  assert.equal(none.e.slide, undefined);
  const immune = field(['.......', '.......', '.......']);
  immune.e.buffs.push(makeBuff({ key: 'im', flags: { noDisplace: true, staticBody: true } }));
  assert.equal(push(immune.w, immune.c, immune.e, 5, { from: { x: 0, y: 1 } }), false);
  assert.equal(pull(immune.w, immune.c, immune.e, 5, { to: { x: 0.5, y: 1 }, by: { x: 0, y: 1 } }), false);
  assert.equal(immune.e.slide, undefined);
  const same = field(['.......', '.......', '.......']);
  mark(same.e);
  assert.equal(push(same.w, same.c, same.e, 1, { from: { x: 1, y: 1 } }), false);
  assert.equal(same.e.slide, undefined);
  const off = field(['.......', '.......', '.......'], 2);
  mark(off.e);
  assert.equal(push(off.w, off.c, off.e, 0, { from: { x: 1, y: 0 }, dir: { x: 1, y: 0 } }), false);
  assert.equal(off.e.slide, undefined);
  const on = field(['.......', '.......', '.......']);
  mark(on.e);
  assert.equal(pull(on.w, on.c, on.e, 1, { to: { x: 1, y: 1 }, by: { x: 1, y: 1 } }), false);
  assert.equal(on.e.slide, undefined);
  const fly = field(['.......', '.......', '.......']);
  fly.e.base.motion = 'FLY';
  assert.equal(push(fly.w, fly.c, fly.e, 5, { from: { x: 0, y: 1 } }), false);
  assert.equal(fly.e.slide, undefined);
});

test('[位移-5] a flying 静态刚体 enters 失衡 and does not move, for a push and for a full pull', () => {
  const { w, c, e } = field(['.......', '.......', '.......']);
  e.base.motion = 'FLY';
  mark(e);
  assert.equal(displaceable(e), false);
  assert.equal(push(w, c, e, 5, { from: { x: 0, y: 1 } }), true);
  assert.equal(e.x, 1);
  held(c, e, 1);
  assert.equal(pull(w, c, e, 1, { to: { x: 0.5, y: 1 }, by: { x: 0, y: 1 } }), true);
  held(c, e, 30);
});

test('[位移-2] [位移-5] an enemy without the mark is still pushed', () => {
  const { w, c, e } = field(['.......', '.......', '.......']);
  assert.equal(push(w, c, e, 1, { from: { x: 0, y: 1 } }), true);
  assert.ok(e.x > 1);
  assert.ok(e.slide);
  assert.ok(e.slide.vx !== 0);
});

test('[位移-5] [位移-3] 浮空 ends a 静态刚体\'s 失衡 at once', () => {
  const { c, e } = field(['.......', '.......', '.......']);
  mark(e);
  assert.equal(pull(/** @type {any} */ ({}), c, e, 1, { to: { x: 0.5, y: 1 }, by: { x: 0, y: 1 } }), true);
  e.buffs.push(makeBuff({ key: 'up', flags: { levitate: true } }));
  assert.equal(slideStep(c, e), false);
  assert.equal(e.slide, undefined);
  assert.equal(e.x, 1);
  assert.equal(e.y, 1);
});
