// 失衡 abilities (docs/spec/foes.md 敌能-42, 敌能-2): bleed only while sliding, stun on the frame the slide ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, displacement, bus, buffs, status } from '@aue/sim';
import { secondsToFrames } from '@aue/math';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { foeBehaviors } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const STUN = secondsToFrames(3);

/** @param {Record<string, unknown>} [over] */
function foe(over = {}) {
  return {
    name: 'foe', maxHp: 10000, atk: 700, def: 550, res: 50, moveSpeed: 0.75, baseAttackTime: 3, massLevel: 1,
    applyWay: 'MELEE', motion: 'WALK', talents: { unbalanced_bleed: { damage: 400, interval: 0.066 } }, ...over,
  };
}

/** Spawns `def` on the tiny map, puts it at (x, y) and roots it so it does not walk. @param {Record<string, unknown>} def @param {number} x @param {number} y */
function place(def, x, y) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { ...c.enemies, foe: def };
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave([spawnAt(0, 'foe')])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === 'foe'));
  e.x = x; e.y = y;
  status.applyStatus(e, 'root', {});
  return { w, c, e };
}

/** HP lost on each frame that starts in 失衡, and how many of those frames had no speed. @param {World} w @param {any} c @param {Unit} e */
function through(w, c, e) {
  /** @type {number[]} */
  const lost = [];
  let zero = 0;
  while (e.slide && lost.length < 200) {
    if (e.slide.vx === 0 && e.slide.vy === 0) zero++;
    const hp = e.hp;
    step(w, c);
    lost.push(hp - e.hp);
  }
  return { lost, zero };
}

/** `n` intervals of no hit, then `amount`. @param {number} n @param {number} [amount] */
const beats = (n, amount = 400) => Array.from({ length: n }, () => [0, amount]).flat();

/** @param {Unit} e */
const stunOf = (e) => e.buffs.find((b) => b.key === 'stun');

test('[敌能-42] [敌能-2] a pushed 锋卫 bleeds 400 every 2 frames only while 失衡, not on entry, and its DEF does not reduce it', () => {
  const { w, c, e } = place(foe(), 1, 1);
  const quiet = e.hp;
  for (let i = 0; i < 30; i++) step(w, c);
  assert.equal(e.hp, quiet, 'none without 失衡');
  assert.equal(displacement.push(w, c, e, -1, { from: { x: 0, y: 1 } }), true);
  assert.equal(e.hp, quiet, 'the push itself is not a tick');
  const seen = through(w, c, e);
  assert.deepEqual(seen.lost, beats(3), '6 frames, first tick after one interval');
  const after = e.hp;
  for (let i = 0; i < 10; i++) step(w, c);
  assert.equal(e.hp, after, 'none once 失衡 has ended');
});

test('[敌能-42] a pulled 锋卫 bleeds for the pull and the coast after it, then stops', () => {
  const { w, c, e } = place(foe(), 4, 1);
  assert.equal(displacement.pull(w, c, e, -1, { to: { x: 0.5, y: 1 }, by: { x: 0, y: 1 } }), true);
  assert.deepEqual(through(w, c, e).lost, beats(8), '16 frames');
  const after = e.hp;
  step(w, c);
  assert.equal(e.hp, after);
});

test('[敌能-42] 锋卫长 takes the same ticks', () => {
  const { w, c, e } = place(foe({ maxHp: 14000, atk: 800, def: 650 }), 1, 1);
  displacement.push(w, c, e, -1, { from: { x: 0, y: 1 } });
  assert.deepEqual(through(w, c, e).lost, beats(3));
  assert.equal(e.hp, 14000 - 1200);
});

test('[敌能-42] the bleed is sourceless true damage: no dealt multiplier, source null, credit kept, not 生命流失', () => {
  const { w, c, e } = place(foe(), 1, 1);
  e.buffs.push(buffs.makeBuff({ key: 'out', mods: { dmgDealtMul: 2 } }));
  /** @type {{ source: unknown, credit: unknown, amount: number, type: string, dmg: { tags?: string[], hpLoss?: boolean } }[]} */
  const hits = [];
  bus.on(w, 'damaged', (ev) => { if (ev.target === e) hits.push(ev); });
  displacement.push(w, c, e, -1, { from: { x: 0, y: 1 } });
  through(w, c, e);
  assert.equal(hits.length, 3);
  assert.ok(hits.every((h) => h.source === null && h.credit === e && h.amount === 400 && h.type === 'true'));
  assert.ok(hits.every((h) => h.dmg.tags?.includes('dot') && h.dmg.tags?.includes('periodic') && h.dmg.hpLoss !== true));
});

test('[敌能-42] 无敌 blocks the bleed, so it is not 生命流失', () => {
  const { w, c, e } = place(foe(), 1, 1);
  status.applyStatus(e, 'invincible', {});
  const hp = e.hp;
  displacement.push(w, c, e, -1, { from: { x: 0, y: 1 } });
  const seen = through(w, c, e);
  assert.equal(seen.lost.length, 6);
  assert.equal(e.hp, hp);
});

test('[敌能-42] a wall holds it at speed 0 and the bleed still ticks; the next 失衡 starts its count over', () => {
  const { w, c, e } = place(foe(), 1.49, 1);
  c.level.tiles[1][2] = { ...c.level.tiles[1][2], passable: 'FLY_ONLY' };
  assert.equal(displacement.push(w, c, e, -1, { from: { x: 0, y: 1 } }), true);
  assert.equal(e.slide?.vx, 0);
  const wall = through(w, c, e);
  assert.deepEqual([wall.lost, wall.zero, e.x], [[0, 400, 0], 3, 1.49]);
  e.x = 1;
  displacement.push(w, c, e, -1, { from: { x: 0, y: 1 } });
  assert.deepEqual(through(w, c, e).lost, beats(3), 'the leftover frame was dropped');
});

test('[敌能-42] 急停 keeps 失衡 at speed 0 for the pull window, and the bleed keeps ticking', () => {
  const { w, c, e } = place(foe(), 1.2, 1);
  assert.equal(displacement.pull(w, c, e, -1, { to: { x: 0.5, y: 1 }, by: { x: 1, y: 1 } }), true);
  const seen = through(w, c, e);
  assert.deepEqual([seen.lost, seen.zero], [beats(8), 16]);
});

test('[敌能-42] no positive interval means no bleed and no 0.066 fallback', () => {
  const { w, c, e } = place(foe({ talents: { unbalanced_bleed: { damage: 400 } } }), 1, 1);
  const hp = e.hp;
  displacement.push(w, c, e, -1, { from: { x: 0, y: 1 } });
  const seen = through(w, c, e);
  assert.equal(seen.lost.length, 6);
  assert.equal(e.hp, hp);
});

test('[敌能-42] [敌能-2] 小弟 is stunned 3 s on the frame 失衡 ends, not while it lasts and not without 失衡', () => {
  const quiet = place(foe({ maxHp: 5000, atk: 500, def: 80, res: 0, moveSpeed: 0.7, baseAttackTime: 5, massLevel: 3, talents: { StunAfterUnbalance: { stun: 3 } } }), 1, 1);
  for (let i = 0; i < 40; i++) step(quiet.w, quiet.c);
  assert.equal(stunOf(quiet.e), undefined);
  const { w, c, e } = place(foe({ maxHp: 5000, atk: 500, def: 80, res: 0, moveSpeed: 0.7, baseAttackTime: 5, massLevel: 3, talents: { StunAfterUnbalance: { stun: 3 } } }), 1, 1);
  assert.equal(displacement.push(w, c, e, 1, { from: { x: 0, y: 1 } }), true);
  let frames = 0;
  while (e.slide) {
    assert.equal(stunOf(e), undefined, 'not while it lasts');
    step(w, c);
    frames++;
    if (e.slide) assert.equal(stunOf(e), undefined);
  }
  assert.equal(frames, 6);
  const b = stunOf(e);
  assert.ok(b);
  assert.equal(b.left, STUN);
  assert.equal(b.resist, true);
  assert.equal(b.src, e.id);
});

test('[敌能-42] a zero-speed pull does not stun 小弟 until that 失衡 ends', () => {
  const { w, c, e } = place(foe({ maxHp: 5000, atk: 500, def: 80, res: 0, moveSpeed: 0.7, baseAttackTime: 5, massLevel: 3, talents: { StunAfterUnbalance: { stun: 3 } } }), 1.2, 1);
  assert.equal(displacement.pull(w, c, e, 1, { to: { x: 0.5, y: 1 }, by: { x: 1, y: 1 } }), true);
  let frames = 0;
  while (e.slide) {
    assert.equal(e.slide.vx, 0);
    assert.equal(stunOf(e), undefined);
    step(w, c);
    frames++;
  }
  assert.equal(frames, 16);
  assert.equal(stunOf(e)?.left, STUN);
});

test('[敌能-42] [敌能-2] 浮空 ending 失衡 stuns on that frame', () => {
  const { w, c, e } = place(foe({ maxHp: 5000, atk: 500, def: 80, res: 0, moveSpeed: 0.7, baseAttackTime: 5, massLevel: 3, talents: { StunAfterUnbalance: { stun: 3 } } }), 1, 1);
  displacement.push(w, c, e, 1, { from: { x: 0, y: 1 } });
  step(w, c);
  assert.ok(e.slide);
  assert.equal(stunOf(e), undefined);
  status.applyStatus(e, 'levitate', { seconds: 1 });
  step(w, c);
  assert.equal(e.slide, undefined);
  assert.equal(stunOf(e)?.left, STUN);
});

test('[敌能-42] a killing tick on the frame 失衡 ends does not stun', () => {
  const { w, c, e } = place(foe({
    maxHp: 1200, def: 0, massLevel: 1,
    talents: { unbalanced_bleed: { damage: 400, interval: 0.066 }, StunAfterUnbalance: { stun: 3 } },
  }), 1, 1);
  displacement.push(w, c, e, -1, { from: { x: 0, y: 1 } });
  const seen = through(w, c, e);
  assert.deepEqual(seen.lost, beats(3));
  assert.equal(e.hp, 0);
  assert.equal(stunOf(e), undefined);
});
