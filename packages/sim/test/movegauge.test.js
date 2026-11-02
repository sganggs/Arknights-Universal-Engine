// A 移动 that keeps the rest (docs/spec/field.md 部署-9) still starts the element values afresh: every value back at its
// maximum and a burst under way ended — its buff and what it carries — before the deploy event, while the buffs the
// burst gave at its start, the other buffs, the HP and the skill stay. The general move, a fresh unit, has none of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, moveOperator, bus } from '../src/index.js';
import { dealEp, epOf, bursting, ELEMENTS } from '../src/elements.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { statsOf } from '../src/attrs.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/**
 * The tiny level without waves: the guard (a million HP — bursts hit hard —, DEF 100, RES 50, ASPD 100, a MANUAL skill
 * `s` of 5 s) deployed on (1, 1) two seconds before.
 */
function field() {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  Object.assign(c.operators.guard, { maxHp: 1e6, res: 50 });
  c.operators.guard.skill = { id: 's', type: 'MANUAL', sp: 'time', cost: 30, init: 0, charges: 1, duration: 5, ammo: false, bb: {} };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  for (let f = 0; f < 60; f++) step(w, c);
  return { w, c, guard: /** @type {any} */ (w.units.find((u) => u.key === 'guard')) };
}

/** Each buff of a unit as key, layers and frames left. @param {Unit} u */
const buffsOf = (u) => u.buffs.map((b) => `${b.key}×${b.stacks}:${b.left}`);
/** The guard's kept 移动 onto (1, 3). @param {World} w @param {any} c @param {Unit} u */
const keepMove = (w, c, u) => moveOperator(w, c, u, { row: 1, col: 3 }, { keep: true });
/** Whether a unit is in the burst of an element (元素-3). @param {Unit} u @param {string} el */
const burstOf = (u, el) => u.buffs.some((b) => b.key === `burst:${el}`);
/** The attributes a burst on a character changes (元素-4). @param {Unit} u */
const touched = (u) => ({ def: statsOf(u).def, res: statsOf(u).res, aspd: statsOf(u).aspd });

test('[部署-9] keep: every element value back at its maximum — the one its buffs give now — before the deploy event; HP, buffs, skill and SP stay', () => {
  const { w, c, guard } = field();
  addBuff(guard, makeBuff({ key: 'mine', mods: { maxEpFlat: 500, atkFlat: 10 } }));
  dealEp(w, guard, 'FIRE', 300);
  dealEp(w, guard, 'DARK', 450);
  assert.deepEqual(guard.ep, { FIRE: 1200, DARK: 1050 }, 'two values, out of 1500');
  guard.skill.sp = 30;
  step(w, c, [[0, { type: 'skill', unit: guard.id }]]);
  assert.equal(guard.skill.active, true);
  const kept = { hp: guard.hp, skill: { ...guard.skill }, buffs: buffsOf(guard) }, seen = /** @type {any[]} */ ([]);
  bus.on(w, 'deploy', (k) => { seen.push([k.move, { ...k.unit.ep }]); });
  assert.equal(keepMove(w, c, guard), guard);
  assert.deepEqual(seen, [[true, {}]], 'its deploy handlers see the values afresh');
  assert.deepEqual(ELEMENTS.map((el) => epOf(guard, el)), [1500, 1500, 1500, 1500, 1500], 'at the maximum its buff gives, not 1000');
  assert.deepEqual({ hp: guard.hp, skill: { ...guard.skill }, buffs: buffsOf(guard) }, kept, 'HP, the running skill and its SP, the buff');
  dealEp(w, guard, 'FIRE', 250);
  assert.deepEqual(guard.ep, { FIRE: 1250 }, 'its next 元素损伤 counts from the maximum');
});

/** What a burst on a character gives at its start besides its own buff (元素-4), by element. */
const GIVEN = Object.freeze({ SANITY: ['stun'], WATER: ['erosion'], FIRE: [], DARK: ['noSp', 'mute'], ANGER: [] });
/** The attributes during each burst on the guard (DEF 100, RES 50, ASPD 100): 侵蚀 −100 DEF, 灼燃 −20 RES, 狂躁 +50 ASPD. */
const DURING = Object.freeze({
  SANITY: { def: 100, res: 50, aspd: 100 }, WATER: { def: 0, res: 50, aspd: 100 }, FIRE: { def: 100, res: 30, aspd: 100 },
  DARK: { def: 100, res: 50, aspd: 100 }, ANGER: { def: 100, res: 50, aspd: 150 },
});

test('[部署-9] keep: a burst of any element ends — its buff with the RES or ASPD it carries — and what it gave at its start stays; a new burst can follow', () => {
  for (const el of ELEMENTS) {
    const { w, c, guard } = field();
    dealEp(w, guard, el, 1000);
    assert.ok(bursting(guard) && burstOf(guard, el), el);
    assert.deepEqual(touched(guard), DURING[el], `${el}: during the burst`);
    const others = buffsOf(guard).filter((s) => !s.startsWith('burst:')), hp = guard.hp;
    assert.deepEqual(others.map((s) => s.split('×')[0]), GIVEN[el], `${el}: what its start gave`);
    keepMove(w, c, guard);
    assert.deepEqual([bursting(guard), guard.ep, guard.hp], [false, {}, hp], `${el}: no burst, the values full, the HP kept`);
    assert.deepEqual(buffsOf(guard), others, `${el}: the buffs its start gave, as they were`);
    assert.deepEqual(touched(guard), { ...DURING[el], res: 50, aspd: 100 }, `${el}: RES and ASPD back; 侵蚀's DEF cut stays`);
    dealEp(w, guard, el, 1000);
    assert.ok(burstOf(guard, el), `${el}: no lock left — 1000 bursts it again`);
  }
});

test('[部署-9] keep: a 凋亡 burst\'s SP loss and damage each second end with it; its 阻回 and 静默 run out at their own time', () => {
  const runs = [false, true].map((move) => {
    const { w, c, guard } = field();
    guard.skill.sp = 20;
    dealEp(w, guard, 'DARK', 1000);
    if (move) keepMove(w, c, guard);
    const hp = guard.hp, hits = /** @type {number[]} */ ([]);
    bus.on(w, 'damaged', (k) => { if (k.target === guard) hits.push(k.amount); });
    for (let f = 0; f < 95; f++) step(w, c);
    /** @param {string} key */
    const left = (key) => guard.buffs.find((/** @type {any} */ b) => b.key === key)?.left ?? 0;
    return { sp: guard.skill.sp, lost: hp - guard.hp, hits, noSp: left('noSp'), mute: left('mute') };
  });
  assert.deepEqual(runs[0], { sp: 17, lost: 150, hits: [50, 50, 50], noSp: 355, mute: 355 }, 'not moved: −1 SP and 100 arts damage (RES 50) at 30, 60, 90 frames');
  assert.deepEqual(runs[1], { sp: 20, lost: 0, hits: [], noSp: 355, mute: 355 }, 'moved: none of it; 阻回 and 静默 still run their 15 s');
});

test('[部署-9] the general move of a unit in a burst: a fresh unit — no element value, no burst, nothing the burst gave either', () => {
  const { w, c, guard } = field();
  dealEp(w, guard, 'FIRE', 300);
  dealEp(w, guard, 'SANITY', 1000);
  assert.deepEqual([guard.ep, bursting(guard), guard.buffs.some((/** @type {any} */ b) => b.key === 'stun')], [{ FIRE: 700, SANITY: 0 }, true, true]);
  const u = /** @type {any} */ (moveOperator(w, c, guard, { row: 1, col: 3 }));
  assert.ok(u && u !== guard && w.units.includes(u));
  assert.deepEqual([u.ep, bursting(u), u.buffs.some((/** @type {any} */ b) => b.key === 'stun')], [{}, false, false]);
});
