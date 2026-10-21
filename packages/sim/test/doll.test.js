// 替身 (docs/spec/traits.md 职业-15, 职业-16) on the tiny level: the switch at 0 HP, the 替身 for its time, the switch
// back; a 替身's own range and flying units, one that does not attack, one with an aura. Test names cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, takeSnapshot, restoreSnapshot, stateHash } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { statsOf } from '../src/attrs.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { dealDamage, setHp } from '../src/damage.js';
import { dollPhase, DOLL_PHASE } from '../src/doll.js';
import { applyStatus } from '../src/status.js';
import { targetsOf } from '../src/combat.js';
import { toView } from '../src/view.js';
import { readView } from '@aue/schema';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/**
 * The tiny level without spawns, the guard (on (1, 1) facing right) a 傀儡师: 1 s switches, a 2 s 替身 with attack +15 %
 * and HP +20 %, and `more` (职业-16). `skill`, when given, is her MANUAL skill, SP full, so a skill command starts it.
 * @param {Record<string, unknown>} [more] @param {Record<string, unknown> | null} [skill]
 */
function arena(more = {}, skill = null) {
  const c = tinyContent();
  c.level.waves = [];
  c.operators.guard.trait = { doll: { duration: 2, switch: 1, atk: 0.15, maxHp: 0.2, ...more } };
  if (skill) c.operators.guard.skill = { id: 'sk-doll', type: 'MANUAL', sp: 'time', cost: 5, init: 5, charges: 1, duration: 0, ammo: false, bb: {}, stoppable: false, ...skill };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const guard = /** @type {Unit} */ (w.units[0]);
  return { w, c, guard };
}
/** Starts the guard's skill. @param {World} w @param {any} c @param {Unit} u */
const cast = (w, c, u) => step(w, c, [[0, { type: 'skill', unit: u.id }]]);
/** Frames left of the phase buff, −1 when she has none. @param {Unit} u */
const dollLeft = (u) => u.buffs.find((b) => b.key === 'doll')?.left ?? -1;
/**
 * From the frame a switch to the 替身 has begun: still switching for the rest of its second, the 替身 for its 2 s, the
 * switch back, then her own form (职业-15). The phase buff is not counted on the frame it appears.
 * @param {World} w @param {any} c @param {Unit} guard
 */
function phases(w, c, guard) {
  assert.equal(dollLeft(guard), 30);
  run(w, c, 29);
  assert.equal(dollPhase(guard), DOLL_PHASE.IN);
  step(w, c);
  assert.deepEqual([dollPhase(guard), dollLeft(guard)], [DOLL_PHASE.DOLL, 60]);
  run(w, c, 59);
  assert.equal(dollPhase(guard), DOLL_PHASE.DOLL);
  step(w, c);
  assert.deepEqual([dollPhase(guard), dollLeft(guard)], [DOLL_PHASE.OUT, 30]);
  run(w, c, 29);
  assert.equal(dollPhase(guard), DOLL_PHASE.OUT);
  step(w, c);
  assert.equal(dollPhase(guard), 0);
}
/** @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/**
 * A rooted enemy without resistance and with HP to spare at (row, col).
 * @param {World} w @param {any} c @param {number} row @param {number} col @param {Record<string, unknown>} [over] @returns {Unit}
 */
function foe(w, c, row, col, over = {}) {
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = col; e.y = row;
  e.base = { ...e.base, maxHp: 1e5, ...over };
  e.hp = statsOf(e).maxHp;
  applyStatus(e, 'root', {});
  w.units.push(e);
  return e;
}
/** The 3 × 3 around the operator (range x-4). */
const AROUND = [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col })));
/** Brings the guard to its 替身: 0 HP, then the 1 s switch. @param {World} w @param {any} c @param {Unit} guard */
const toDoll = (w, c, guard) => { setHp(guard, 0); run(w, c, 31); assert.equal(dollPhase(guard), DOLL_PHASE.DOLL); };
/** The ids of a list, in order. @param {Unit[]} list */
const ids = (list) => list.map((u) => u.id);

test('[职业-15] at 0 HP in its own form: a switch with its buffs cleared and HP full, then its 替身 for its time, then a switch back to its own form', () => {
  const { w, c, guard } = arena();
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = 1; e.y = 1; e.hp = statsOf(e).maxHp;
  w.units.push(e);
  e.blockedBy = guard.id;
  addBuff(guard, makeBuff({ key: 'mine', src: guard.id, mods: { defFlat: 5 } }));
  addBuff(guard, makeBuff({ key: 'theirs', src: e.id, left: 900, mods: { atkPct: 0.5 } }));
  setHp(guard, 0);
  step(w, c);
  let s = statsOf(guard);
  assert.deepEqual([w.units.includes(guard), dollPhase(guard), guard.hp, s.blockCnt, e.blockedBy], [true, DOLL_PHASE.IN, 1000, 0, -1]);
  assert.deepEqual([s.invincible, s.flags.undying, s.flags.noSp, s.flags.healFree, s.flags.noAllyHeal, s.flags.noAttack], [true, true, true, true, true, true]);
  assert.deepEqual(guard.buffs.map((b) => b.key).filter((k) => k !== 'doll'), ['mine'], 'others\' and timed buffs cleared, its own lasting one kept');
  assert.equal(dealDamage(w, e, guard, { type: 'true', amount: 5000 }, c), 0, 'invincible while it switches');
  run(w, c, 29);
  assert.equal(dollPhase(guard), DOLL_PHASE.IN);
  step(w, c);
  s = statsOf(guard);
  assert.deepEqual([dollPhase(guard), Math.round(s.atk * 1000) / 1000, s.maxHp, guard.hp, s.blockCnt, s.flags.noSp, s.invincible], [DOLL_PHASE.DOLL, 57.5, 1200, 1200, 0, true, false], 'its 替身: attack and HP up, 阻回, no block');
  run(w, c, 60);
  s = statsOf(guard);
  assert.deepEqual([dollPhase(guard), s.blockCnt, s.invincible, s.maxHp, guard.hp], [DOLL_PHASE.OUT, 2, true, 1000, 1000], '2 s later the switch back: blocking again');
  run(w, c, 30);
  assert.deepEqual([dollPhase(guard), guard.hp, statsOf(guard).invincible], [0, 1000, false], 'its own form');
});

test('[职业-15] its 替身 at 0 HP falls; with 不死 it never switches; the phase is state', () => {
  const { w, c, guard } = arena();
  setHp(guard, 0);
  run(w, c, 31);
  assert.equal(dollPhase(guard), DOLL_PHASE.DOLL);
  const again = restoreSnapshot(takeSnapshot(w));
  run(w, c, 20);
  run(again, c, 20);
  assert.equal(stateHash(again), stateHash(w), 'a snapshot runs on the same');
  setHp(guard, 0);
  step(w, c);
  assert.equal(w.units.includes(guard), false, 'the 替身 falls');
  const b = arena();
  addBuff(b.guard, makeBuff({ key: 'held', flags: { undying: true } }));
  dealDamage(b.w, null, b.guard, { type: 'true', amount: 1e6 }, b.c);
  step(b.w, b.c);
  assert.deepEqual([b.guard.hp, dollPhase(b.guard)], [1, 0]);
});

test('[职业-16] a 替身 with its own range fights in it and selects flying units; its own form, before and after, does not', () => {
  const { w, c, guard } = arena({ range: AROUND, antiAir: true });
  const walker = foe(w, c, 0, 0), flyer = foe(w, c, 2, 2, { motion: 'FLY' });
  assert.deepEqual(targetsOf(w, c, guard), [], 'its own form: (1, 1) and (1, 2)');
  toDoll(w, c, guard);
  assert.deepEqual(ids(targetsOf(w, c, guard)).sort((a, b) => a - b), [walker.id, flyer.id], 'its 替身: the 3 × 3 around it, the flying one too');
  run(w, c, 60);
  assert.deepEqual([dollPhase(guard), targetsOf(w, c, guard)], [DOLL_PHASE.OUT, []], 'switching back: its own range');
  const plain = arena({ range: AROUND });
  const f2 = foe(plain.w, plain.c, 2, 2, { motion: 'FLY' }), w2 = foe(plain.w, plain.c, 0, 0);
  toDoll(plain.w, plain.c, plain.guard);
  assert.deepEqual(ids(targetsOf(plain.w, plain.c, plain.guard)), [w2.id], 'without antiAir: ground units only');
  assert.ok(!targetsOf(plain.w, plain.c, plain.guard).includes(f2));
});

test('[职业-16] a 替身 that does not attack holds noAttack and makes no attack while it fights', () => {
  for (const attack of [false, true]) {
    const { w, c, guard } = arena({ attack });
    foe(w, c, 1, 2);
    toDoll(w, c, guard);
    /** @type {any[]} */
    const ev = [];
    for (let i = 0; i < 59; i++) ev.push(...step(w, c));
    assert.equal(dollPhase(guard), DOLL_PHASE.DOLL);
    assert.equal(!!statsOf(guard).flags.noAttack, !attack);
    assert.equal(ev.some((x) => x.type === 'hit' && x.id === guard.id), attack, attack ? 'one that attacks hits (1, 2)' : 'none');
  }
});

test('[职业-16] a 替身\'s aura: the ground enemies in its range slowed (最终乘算) and hit each second for scale × its attack; not flying ones, not those out of range; gone with the 替身', () => {
  const { w, c, guard } = arena({ range: AROUND, antiAir: true, attack: false, aura: { moveMul: 0.6, scale: 0.4 } });
  const near = foe(w, c, 2, 2), flyer = foe(w, c, 2, 0, { motion: 'FLY' }), far = foe(w, c, 1, 4);
  toDoll(w, c, guard);
  const hp = () => [near.hp, flyer.hp, far.hp];
  assert.deepEqual([statsOf(near).moveSpeed, statsOf(flyer).moveSpeed, statsOf(far).moveSpeed], [0.6, 1, 1], 'slowed in its range, on the ground');
  const before = hp();
  run(w, c, 29);
  assert.deepEqual(hp(), before, 'no hit within the first second');
  const snap = restoreSnapshot(takeSnapshot(w));
  step(w, c);
  assert.deepEqual(hp(), [before[0] - 57.5 * 0.4, before[1], before[2]], 'a second in: 0.4 × its attack (50 × 1.15) as arts damage');
  run(w, c, 30);
  assert.equal(near.hp, before[0] - 2 * 23, 'each second');
  run(snap, c, 31);
  assert.equal(stateHash(snap), stateHash(w), 'a snapshot keeps the aura\'s second');
  run(w, c, 1);
  assert.deepEqual([dollPhase(guard), statsOf(near).moveSpeed, near.buffs.some((b) => b.key.startsWith('doll:'))], [DOLL_PHASE.OUT, 1, false], 'the 替身 gone, the slow too');
});

test('[职业-16] a 替身 whose attacks deal arts damage and that takes less physical and arts damage', () => {
  const { w, c, guard } = arena({ arts: true, taken: 0.6 });
  setHp(guard, 0);
  run(w, c, 31);
  assert.equal(dollPhase(guard), DOLL_PHASE.DOLL);
  const e = foe(w, c, 1, 1, { def: 1000, res: 0 });
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < 40 && !ev.some((x) => x.type === 'hit'); i++) ev.push(...step(w, c, []));
  assert.equal(ev.find((x) => x.type === 'hit' && x.target === e.id)?.damage, statsOf(guard).atk, 'arts: no defence');
  const hp = guard.hp;
  dealDamage(w, e, guard, { type: 'phys', amount: 100 + statsOf(guard).def }, c);
  assert.equal(hp - guard.hp, 60);
});

test('[职业-15] a skill that switches as it starts begins that frame: other buffs go, its own skill stays, then the phases run', () => {
  const { w, c, guard } = arena({}, { doll: 'start', duration: 5, bb: { attack_speed: 30 } });
  addBuff(guard, makeBuff({ key: 'mine', src: guard.id, mods: { defFlat: 5 } }));
  addBuff(guard, makeBuff({ key: 'theirs', src: 99, left: 900, mods: { atkPct: 0.5 } }));
  setHp(guard, 400);
  cast(w, c, guard);
  assert.deepEqual([dollPhase(guard), guard.hp, guard.skill?.active, guard.skill?.dollPending], [DOLL_PHASE.IN, 1000, true, undefined]);
  assert.deepEqual(guard.buffs.map((b) => b.key).filter((k) => k !== 'doll').sort(), ['mine', 'skill']);
  phases(w, c, guard);
  assert.deepEqual([guard.skill?.active, statsOf(guard).aspd, guard.buffs.some((b) => b.key === 'theirs')], [true, 130, false], '5 s outlasts the 4 s of switches and 替身');
});

test('[职业-15] [技能-1] a start-switch skill with no duration is instant, even with attack keys, and the phases still run', () => {
  const { w, c, guard } = arena({}, { doll: 'start', bb: { 'attack@atk_scale': 2.8 } });
  setHp(guard, 400);
  cast(w, c, guard);
  assert.deepEqual([dollPhase(guard), guard.hp, guard.skill?.active, guard.buffs.some((b) => b.key === 'skill')], [DOLL_PHASE.IN, 1000, false, false]);
  phases(w, c, guard);
});

test('[职业-15] a skill that switches as it ends stays in its own form until it ends, then the phases run; 不死 does not stop it', () => {
  const { w, c, guard } = arena({}, { doll: 'end', duration: 1, bb: { atk: 0.5 } });
  setHp(guard, 400);
  cast(w, c, guard);
  assert.deepEqual([dollPhase(guard), guard.hp, guard.skill?.active], [0, 400, true]);
  run(w, c, 29);
  assert.equal(dollPhase(guard), 0);
  step(w, c);
  assert.deepEqual([dollPhase(guard), guard.hp, guard.skill?.active, guard.buffs.some((b) => b.key === 'skill')], [DOLL_PHASE.IN, 1000, false, false]);
  phases(w, c, guard);
  const held = arena({}, { doll: 'end', duration: 1 });
  addBuff(held.guard, makeBuff({ key: 'held', flags: { undying: true } }));
  cast(held.w, held.c, held.guard);
  run(held.w, held.c, 30);
  assert.deepEqual([dollPhase(held.guard), held.guard.hp], [DOLL_PHASE.IN, 1000], 'not a hit: 不死 never sees it');
});

test('[职业-15] a skill-forced switch while switching or already the 替身 changes nothing', () => {
  const into = arena({}, { doll: 'start', duration: 8 });
  setHp(into.guard, 0);
  step(into.w, into.c);
  setHp(into.guard, 100);
  const leftIn = dollLeft(into.guard);
  cast(into.w, into.c, into.guard);
  assert.deepEqual([dollPhase(into.guard), into.guard.hp, dollLeft(into.guard), into.guard.skill?.active], [DOLL_PHASE.IN, 100, leftIn - 1, true]);
  const { w, c, guard } = arena({}, { doll: 'start', duration: 8 });
  toDoll(w, c, guard);
  setHp(guard, 500);
  const left = dollLeft(guard);
  cast(w, c, guard);
  assert.deepEqual([dollPhase(guard), guard.hp, dollLeft(guard)], [DOLL_PHASE.DOLL, 500, left - 1]);
  const end = arena({}, { doll: 'end', duration: 1 });
  toDoll(end.w, end.c, end.guard);
  const stay = dollLeft(end.guard);
  cast(end.w, end.c, end.guard);
  run(end.w, end.c, 30);
  assert.deepEqual([dollPhase(end.guard), end.guard.skill?.active, dollLeft(end.guard)], [DOLL_PHASE.DOLL, false, stay - 31]);
});

test('[职业-15] a snapshot during a skill-forced switch restores the phase and the skill that is still running', () => {
  const { w, c, guard } = arena({}, { doll: 'start', duration: 8, bb: { attack_speed: 40 } });
  cast(w, c, guard);
  run(w, c, 10);
  assert.deepEqual([dollPhase(guard), guard.skill?.active, guard.skill?.dollPending], [DOLL_PHASE.IN, true, undefined]);
  const again = restoreSnapshot(takeSnapshot(w));
  run(w, c, 20);
  run(again, c, 20);
  assert.equal(stateHash(again), stateHash(w));
  const back = /** @type {Unit} */ (again.units[0]);
  assert.deepEqual([dollPhase(guard), dollPhase(back), back.skill?.active, statsOf(back).aspd], [DOLL_PHASE.DOLL, DOLL_PHASE.DOLL, true, 140]);
});

test('[职业-15] a fatal switch still ends a running skill; one that would switch at its end does not ask again', () => {
  const plain = arena({}, { duration: 10, bb: { attack_speed: 30 } });
  cast(plain.w, plain.c, plain.guard);
  setHp(plain.guard, 0);
  step(plain.w, plain.c);
  assert.deepEqual([dollPhase(plain.guard), plain.guard.skill?.active, plain.guard.buffs.some((b) => b.key === 'skill')], [DOLL_PHASE.IN, false, false]);
  const { w, c, guard } = arena({}, { doll: 'end', duration: 5 });
  cast(w, c, guard);
  setHp(guard, 0);
  step(w, c);
  assert.deepEqual([dollPhase(guard), guard.skill?.active, guard.skill?.dollPending, dollLeft(guard)], [DOLL_PHASE.IN, false, undefined, 30]);
  run(w, c, 30);
  assert.equal(dollPhase(guard), DOLL_PHASE.DOLL);
});

test('[职业-15] [渲染-24] the render state shows a 傀儡师\'s form: its own, switching in, the 替身, switching back', () => {
  const { w, c, guard } = arena();
  const form = () => readView(toView(w)).units.find((u) => u.id === guard.id)?.form;
  const seen = [form()];
  setHp(guard, 0);
  for (let i = 0; i < 160; i++) { step(w, c, []); if (seen.at(-1) !== form()) seen.push(form()); }
  assert.deepEqual(seen, [0, 1, 2, 3, 0]);
});
