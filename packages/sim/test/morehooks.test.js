// More of the engine's events (docs/spec/hooks.md 钩子-5): statusApplied after a status took hold, enemyAttackStart as an
// enemy's attack lands before 麻痹 is checked — its handlers may cancel the attack —, palsyTrigger as 麻痹 interrupts an
// attack, whose `keep` leaves the layer; and none of them changes the state while their handlers do nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step, stateHash } from '../src/index.js';
import { on, after } from '../src/bus.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus, inflict, PALSY_SHAKE_FRAMES } from '../src/status.js';
import { dealDamage } from '../src/damage.js';
import { dealEp } from '../src/elements.js';
import { addBuff, makeBuff } from '../src/buffs.js';
import { statsOf } from '../src/attrs.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/**
 * The tiny level without waves: the guard (a million HP) at (1, 1) facing right, and a rooted ranged slime (ATK 300, an
 * attack every 2 s, a million HP) at (1, 4) that shoots it; its clip (1 s, OnAttack at 0.5 s) lands its attack 15 frames
 * after it starts.
 * @param {(c: any) => void} [tweak]
 */
function field(tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.operators.guard.maxHp = 1e6;
  Object.assign(c.enemies.slime, { atk: 300, baseAttackTime: 2, maxHp: 1e6, applyWay: 'RANGED', rangeRadius: 3.5, attack: { duration: 1, hit: 0.5 } });
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const guard = w.units[0], slime = makeEnemy(w, c, { key: 'slime', route: 0 });
  Object.assign(slime, { x: 4, y: 1 });
  applyStatus(slime, 'root', {});
  w.units.push(slime);
  return { w, c, guard, slime };
}

/** A unit's layers of 麻痹. @param {Unit} u */
const layersOf = (u) => u.buffs.find((b) => b.key === 'palsy')?.stacks ?? 0;

/**
 * Runs `n` frames; the frames each presentation event of the slime's came in: its swings (`attack`) and shots.
 * @param {World} w @param {any} c @param {Unit} slime @param {number} n
 */
function run(w, c, slime, n) {
  const out = { swings: /** @type {number[]} */ ([]), shots: /** @type {number[]} */ ([]) };
  for (let i = 0; i < n; i++) {
    const f = w.frame;
    for (const e of step(w, c)) {
      if (e.id === slime.id && e.type === 'attack') out.swings.push(f);
      if (e.id === slime.id && e.type === 'shot') out.shots.push(f);
    }
  }
  return out;
}

test('[钩子-5] enemyAttackStart as an enemy\'s attack lands — not as it starts —, before 麻痹: the targets still there; a 麻痹 a handler gives interrupts this attack', () => {
  const { w, c, guard, slime } = field(), seen = /** @type {any[]} */ ([]);
  let mode = 'look';
  on(w, 'enemyAttackStart', (k) => {
    seen.push([w.frame, k.enemy.id, k.targets.map((/** @type {Unit} */ t) => t.id), layersOf(k.enemy)]);
    if (mode === 'palsy') inflict(w, k.enemy, 'palsy', { src: guard });
    k.targets.length = 0;
  });
  const first = run(w, c, slime, 60);
  assert.equal(first.swings.length, 1);
  const f = first.swings[0];
  assert.deepEqual([seen, first.shots], [[[f + 15, slime.id, [guard.id], 0]], [f + 15]], 'at the end of the 15-frame wind-up, with its target; emptying the list changes nothing');
  mode = 'palsy';
  const second = run(w, c, slime, 76 - (w.frame - f));
  assert.deepEqual([second.swings, seen[1], second.shots], [[f + 60], [f + 75, slime.id, [guard.id], 0], []], 'the 麻痹 given at the landing interrupts it: no shot');
  assert.deepEqual([layersOf(slime), slime.buffs.find((b) => b.key === 'palsyShake')?.left], [0, PALSY_SHAKE_FRAMES], 'its layer went at once, 麻痹震颤 from this frame');
});

test('[钩子-5] a 神经损伤 burst a handler causes at the landing interrupts this attack (元素-4: 3 麻痹); a neutral unit\'s attack sends it too, an operator\'s does not', () => {
  const { w, c, guard, slime } = field((cc) => { cc.enemies.dummy = { name: 'dummy', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 1 }; });
  const dummy = makeEnemy(w, c, { key: 'dummy', route: 0 });
  Object.assign(dummy, { x: 2, y: 1 });
  applyStatus(dummy, 'root', {});
  w.units.push(dummy);
  const seen = /** @type {number[]} */ ([]), guardHits = /** @type {number[]} */ ([]);
  on(w, 'enemyAttackStart', (k) => { seen.push(k.enemy.id); if (seen.length === 1) dealEp(w, k.enemy, 'SANITY', 1000, guard); });
  on(w, 'attack', (k) => { if (k.attacker === guard) guardHits.push(w.frame); });
  const hp = slime.hp, out = run(w, c, slime, 60);
  assert.deepEqual([out.swings.length, out.shots, layersOf(slime), hp - slime.hp], [1, [], 2, 6000], 'the burst\'s 3 layers: one went on this attack; its 6000 元素伤害');
  slime.base = { ...slime.base, neutral: true };
  run(w, c, slime, 90);
  assert.ok(guardHits.length > 0, 'the guard attacked the dummy');
  assert.ok(seen.length === 2 && seen.every((id) => id === slime.id), 'the neutral slime\'s next attack; never the guard\'s');
});

test('[钩子-5] after enemyAttackStart, a handler\'s 晕眩 or a kill cancels the attack: 麻痹 is not looked at, no shot, no attack event; the cooldown runs on', () => {
  const { w, c, slime } = field(), attacks = /** @type {number[]} */ ([]);
  applyStatus(slime, 'palsy');
  let mode = 'stun';
  on(w, 'enemyAttackStart', (k) => {
    if (mode === 'stun') inflict(w, k.enemy, 'stun', { frames: 1 });
    if (mode === 'kill') dealDamage(w, null, k.enemy, { type: 'true', amount: 1e9 });
  });
  on(w, 'attack', (k) => { if (k.attacker === slime) attacks.push(w.frame); });
  const out = run(w, c, slime, 61);
  assert.deepEqual([out.swings.length, out.shots, attacks, layersOf(slime)], [2, [], [], 1], 'the first cancelled; the layer still there');
  assert.equal(out.swings[1] - out.swings[0], 60, 'the next one an interval after the first started');
  mode = 'kill';
  const killed = run(w, c, slime, 30);
  assert.deepEqual([killed.shots, attacks, w.units.includes(slime), layersOf(slime)], [[], [], false, 1], 'killed there: cancelled before 麻痹 too');
});

test('[钩子-5] after enemyAttackStart, whatever ends an enemy\'s attack under way cancels this one — 沉睡, no ATK, 消失, noAttack, 恐惧, off the field —; with none of them it lands', () => {
  /** @type {Record<string, (w: World, e: Unit, guard: Unit) => void>} */
  const ways = {
    none: () => {},
    sleep: (w, e) => { inflict(w, e, 'sleep', { frames: 1 }); },
    atk0: (_w, e) => { addBuff(e, makeBuff({ key: 'test:atk0', mods: { atkMul: 0 } })); },
    hidden: (_w, e) => { e.hidden = true; },
    noAttack: (_w, e) => { addBuff(e, makeBuff({ key: 'test:noAttack', flags: { noAttack: true } })); },
    fear: (w, e, guard) => { inflict(w, e, 'fear', { frames: 30, src: guard }); },
    removed: (w, e) => { w.units.splice(w.units.indexOf(e), 1); },
  };
  const out = Object.fromEntries(Object.entries(ways).map(([name, way]) => {
    const { w, c, guard, slime } = field(), attacks = /** @type {number[]} */ ([]);
    let seen = 0;
    on(w, 'enemyAttackStart', (k) => { if (seen++ === 0) way(w, k.enemy, guard); });
    on(w, 'attack', (k) => { if (k.attacker === slime) attacks.push(w.frame); });
    const shots = run(w, c, slime, 30).shots.length;
    return [name, [seen, shots, attacks.length]];
  }));
  const cancelled = [1, 0, 0];
  assert.deepEqual(out, { none: [1, 1, 1], sleep: cancelled, atk0: cancelled, hidden: cancelled, noAttack: cancelled, fear: cancelled, removed: cancelled },
    '[landings, shots, attack events] in the first second');
});

test('[钩子-5] enemyAttackStart\'s targets are the locked ones still on the field with HP: one that fell at the start of the landing frame is not among them', () => {
  const { w, c, guard, slime } = field(), seen = /** @type {number[][]} */ ([]);
  on(w, 'beforeAttack', (k) => { if (k.attacker === slime) after(w, 15, () => { dealDamage(w, null, guard, { type: 'true', amount: 1e9 }); }); });
  on(w, 'enemyAttackStart', (k) => { seen.push(k.targets.map((/** @type {Unit} */ t) => t.id)); });
  const out = run(w, c, slime, 30);
  assert.deepEqual([seen, out.swings.length, out.shots, w.units.includes(guard)], [[[]], 1, [], false], 'the guard at 0 HP, still listed until the frame ends: no target, no shot');
});

test('[钩子-5] each landing of a channelled attack (敌能-6) sends enemyAttackStart; one cancelled there ends the rest of that attack', () => {
  /** @param {any} cc */
  const channel = (cc) => {
    cc.enemies.slime.talents = { chan: {} };
    cc.behaviors = { foes: { chan: { attack: (/** @type {any} */ _ctx, /** @type {any} */ m) => ({ ...m, channel: { hits: 3, duration: 3, after: 2 } }) } } };
  };
  /** @param {boolean} stun */
  const play = (stun) => {
    const { w, c, slime } = field(channel), seen = /** @type {number[]} */ ([]);
    on(w, 'enemyAttackStart', (k) => { seen.push(w.frame); if (stun && seen.length === 2) inflict(w, k.enemy, 'stun', { frames: 1 }); });
    const out = run(w, c, slime, 120), f = out.swings[0];
    return { seen: seen.map((x) => x - f), shots: out.shots.map((x) => x - f) };
  };
  assert.deepEqual(play(false), { seen: [30, 60, 90], shots: [30, 60, 90] }, 'a hit each second of the 3 s channel');
  assert.deepEqual(play(true), { seen: [30, 60], shots: [30] }, 'the second cancelled by a 晕眩 there: no third');
});

test('[钩子-5] palsyTrigger as 麻痹 interrupts, before its layer goes: keep leaves the layer and the attack is interrupted all the same', () => {
  const { w, c, slime } = field(), seen = /** @type {any[]} */ ([]);
  for (let i = 0; i < 2; i++) applyStatus(slime, 'palsy');
  let keep = true;
  on(w, 'palsyTrigger', (k) => { seen.push([w.frame, k.enemy.id, k.buff.key, k.buff.stacks, k.keep]); k.keep = keep; });
  const out = run(w, c, slime, 30);
  const f = out.swings[0] + 15;
  assert.deepEqual([seen, out.shots, layersOf(slime)], [[[f, slime.id, 'palsy', 2, false]], [], 2], 'kept: still 2');
  assert.equal(slime.buffs.find((b) => b.key === 'palsyShake')?.left, PALSY_SHAKE_FRAMES - (w.frame - f - 1), '麻痹震颤 all the same');
  keep = false;
  run(w, c, slime, 90);
  assert.deepEqual([seen.length, seen[1][3], layersOf(slime)], [2, 2, 1], 'not kept: a layer went');
});

test('[钩子-5] 麻痹 cutting an attack 2 s in: palsyTrigger, no enemyAttackStart (it never landed); 麻痹免疫: neither', () => {
  const { w, c, slime } = field((cc) => { Object.assign(cc.enemies.slime, { baseAttackTime: 4, attack: { duration: 3, hit: 2.5 } }); });
  applyStatus(slime, 'palsy');
  const seen = /** @type {string[]} */ ([]);
  on(w, 'palsyTrigger', () => { seen.push(`palsy@${w.frame}`); });
  on(w, 'enemyAttackStart', () => { seen.push(`strike@${w.frame}`); });
  const out = run(w, c, slime, 90);
  assert.deepEqual([seen, out.shots, layersOf(slime)], [[`palsy@${out.swings[0] + 60}`], [], 0], 'the 75-frame wind-up cut at 60');
  const im = field((cc) => { cc.enemies.slime.immune = ['palsy']; }), log = /** @type {string[]} */ ([]);
  applyStatus(im.slime, 'palsy');
  on(im.w, 'palsyTrigger', () => { log.push('palsy'); });
  on(im.w, 'enemyAttackStart', () => { log.push('strike'); });
  const shot = run(im.w, im.c, im.slime, 30);
  assert.deepEqual([log, shot.shots.length, layersOf(im.slime)], [['strike'], 1, 1], 'it lands; the layer stays, without effect');
});

test('[钩子-5] statusApplied after a status took hold: what took hold, its frames after beforeStatus, its value, whether it is new', () => {
  const { w, guard, slime } = field(), seen = /** @type {any[]} */ ([]);
  on(w, 'beforeStatus', (k) => { if (k.status === 'stun') k.frames += 9; if (k.status === 'sleep') k.cancel = true; });
  on(w, 'statusApplied', (k) => seen.push([k.status, k.frames, k.strength, k.entered, k.source?.key ?? null, k.target.key]));
  inflict(w, slime, 'stun', { seconds: 1.7, src: guard });
  inflict(w, slime, 'stun', { seconds: 1, src: guard });
  inflict(w, slime, 'sleep', { seconds: 1 });
  inflict(w, slime, 'groundbind', { seconds: 1 });
  inflict(w, slime, 'fragile', { seconds: 2, value: 0.25 });
  inflict(w, slime, 'palsy', {});
  inflict(w, slime, 'palsy', {});
  inflict(w, slime, 'cold', { seconds: 3, src: guard });
  inflict(w, slime, 'cold', { seconds: 4, src: guard });
  inflict(w, guard, 'cold', { seconds: 2, src: slime });
  assert.deepEqual(seen, [
    ['stun', 60, 0, true, 'guard', 'slime'], ['stun', 39, 0, false, 'guard', 'slime'], ['fragile', 60, 0.25, true, null, 'slime'],
    ['palsy', -1, 0, true, null, 'slime'], ['palsy', -1, 0, false, null, 'slime'], ['cold', 90, 0, true, 'guard', 'slime'],
    ['freeze', 120, 0, true, 'guard', 'slime'], ['enemyCold', 60, 0, true, 'slime', 'guard'],
  ], '1.7 s + 9 frames; a second stun is no entry; cancelled, refused (缚地 on the ground): none; the cold pair is a freeze; an enemy\'s cold');
  assert.deepEqual([layersOf(slime), slime.buffs.some((b) => b.key === 'cold')], [2, false]);
});

test('[钩子-5] statusApplied on a unit immune to the status: its buff is added all the same (状态-7), so the event comes; one a beforeStatus handler gave just before makes it no entry', () => {
  const { w, slime } = field((cc) => { cc.enemies.slime.immune = ['stun']; }), seen = /** @type {any[]} */ ([]);
  on(w, 'beforeStatus', (k) => { if (k.status === 'silence') applyStatus(k.target, 'silence', { seconds: 1 }); });
  on(w, 'statusApplied', (k) => seen.push([k.status, k.frames, k.entered]));
  inflict(w, slime, 'stun', { seconds: 1 });
  inflict(w, slime, 'silence', { seconds: 2 });
  assert.deepEqual(seen, [['stun', 30, true], ['silence', 60, false]]);
  assert.deepEqual([!!statsOf(slime).flags.stun, slime.buffs.filter((b) => b.key === 'silence').length], [false, 2], 'the stun without effect; two silences');
});

test('[钩子-5] with handlers that do nothing, every frame hashes as without them', () => {
  /** @param {boolean} hooked */
  const play = (hooked) => {
    const { w, c, guard, slime } = field();
    for (const name of ['statusApplied', 'enemyAttackStart', 'palsyTrigger']) if (hooked) on(w, name, () => {});
    for (let i = 0; i < 2; i++) inflict(w, slime, 'palsy', { src: guard });
    const hashes = [];
    for (let i = 0; i < 400; i++) {
      if (i === 200) inflict(w, slime, 'stun', { seconds: 1.5, src: guard });
      step(w, c);
      hashes.push(stateHash(w));
    }
    return { hashes, slime, w };
  };
  const plain = play(false), hooked = play(true);
  assert.deepEqual(hooked.hashes, plain.hashes);
  assert.equal(layersOf(plain.slime), 0, 'both layers spent on the way');
  assert.ok(plain.w.units.some((u) => u.kind === KIND.OPERATOR && u.hp < u.maxHp), 'and attacks landed');
});
