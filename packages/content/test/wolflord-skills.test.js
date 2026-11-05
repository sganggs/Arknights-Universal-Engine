// 扎罗，“狼之主” (docs/spec/foes.md 敌能-148): 溶血骇惧 in the first form — its SP, whom it takes, the slow, 无法撤退 and
// the 生命流失 that grows, its 静默 and its cure — and 狂暴怒嗥's channel in the second form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { step, attrs, damage, status, buffs, bus } from '@aue/sim';
import { oneWave, spawnAt } from '@aue/testkit';
import { KEY, wolf, arena, run, hitsOn, fell, unitOf, deploy, pin } from './wolflord-arena.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').World} World @typedef {import('./wolflord-arena.js').WolfChange} WolfChange */

/** @param {Unit} u */
const stats = (u) => attrs.statsOf(u);
/** @param {Unit} e */
const cageKey = (e) => `fearCage:${e.id}`;
/** Whether a unit carries 扎罗's 溶血骇惧. @param {Unit} e @param {Unit} u */
const caged = (e, u) => u.buffs.some((b) => b.key === cageKey(e));
/** 扎罗's 溶血骇惧 SP. @param {Unit} e */
const spOf = (e) => e.ab['FearCage.sp'];
/** The 静默 溶血骇惧 gave 扎罗. @param {Unit} e */
const cageMute = (e) => e.buffs.find((b) => b.key === 'mute' && b.tag === 'fearCage');
/** Steps through the step that starts at `frame`. @param {World} w @param {any} c @param {number} frame */
function until(w, c, frame) {
  while (w.frame <= frame) step(w, c);
}
/** 扎罗 with its SP full from the start, so 溶血骇惧 goes as soon as someone is on the field. @param {WolfChange} [o] */
const ready = (o = {}) => wolf({ ...o, bb: { ...o.bb, FearCage: { init_sp: 55, ...o.bb?.FearCage } } });

test('[敌能-148] 溶血骇惧 waits for init_sp + sp_recovery_per_sec a second up to its SP cost; the cast takes the attack interval', () => {
  for (const [init, rate] of [[0, 1], [50, 2]]) {
    const { c, w, e } = arena(wolf({ bb: { FearCage: { init_sp: init, sp_recovery_per_sec: rate } } }), [['archer', 0, 3]]);
    const archer = unitOf(w, 'archer'), at = (55 - init) * (30 / rate) - 1;
    until(w, c, at - 1);
    assert.equal(caged(e, archer), false);
    assert.equal(spOf(e), 54);
    step(w, c);
    assert.equal(caged(e, archer), true, `cast on frame ${at}`);
    assert.equal(spOf(e), 0);
    assert.equal(e.atkCd, attrs.intervalFrames(4, 100) - 1);
    assert.equal(stats(e).flags.mute, true);
  }
});

/** Five of ours deployed in this order on one step, so the later hold more 仇恨 (索敌-5); a neutral with 嘲讽 2. */
const FIVE = /** @type {[string, number, number][]} */ ([['sniper', 0, 2], ['archer', 0, 3], ['bird', 2, 2], ['guard', 1, 4], ['wall', 1, 0]]);

/**
 * Who carries 溶血骇惧 once it is cast with `n` targets, in FIVE's order and then the neutral; `hide` lifts the wall and
 * hides the guard first; `camo` is the index in FIVE of one more unit given 迷彩 (−1: none).
 * @param {number} n @param {boolean} hide @param {number} [camo]
 */
function takenBy(n, hide, camo = -1) {
  const { c, w, e } = arena(ready({ bb: { FearCage: { init_sp: 54, max_target: n } } }), FIVE, (k) => {
    k.enemies.npc = { name: 'npc', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 0.1, neutral: true, tauntLevel: 2 };
    k.level.waves = [oneWave([spawnAt(0, KEY), spawnAt(0, 'npc')])];
  });
  const ours = FIVE.map(([op]) => unitOf(w, op));
  if (hide) {
    buffs.addBuff(ours[4], buffs.makeBuff({ key: 'lift', flags: { liftoff: true } }));
    buffs.addBuff(ours[3], buffs.makeBuff({ key: 'hide', flags: { stealth: true } }));
  }
  if (camo >= 0) buffs.addBuff(ours[camo], buffs.makeBuff({ key: 'cam', flags: { camou: true } }));
  run(w, c, 30);
  assert.equal(stats(e).flags.mute, true);
  return [...ours, unitOf(w, 'npc')].map((u) => caged(e, u));
}

test('[敌能-148] 溶血骇惧 takes max_target of ours on the whole field in attack order: flyers yes; neutral, lifted, stealthed and camouflaged no', () => {
  assert.deepEqual(takenBy(3, false), [false, false, true, true, true, false]);
  assert.deepEqual(takenBy(3, true), [true, true, true, false, false, false]);
  assert.deepEqual(takenBy(2, true), [false, true, true, false, false, false]);
  assert.deepEqual(takenBy(3, true, 2), [true, true, false, false, false, false]);
});

test('[敌能-148] 溶血骇惧: 攻击速度 + attack_speed, 无法撤退, and true 生命流失 of the current max HP × hp_ratio × min(1, k ÷ duration_bleed) on the k-th second', () => {
  for (const [aspd, ratio, ramp] of [[-70, 0.3, 40], [-40, 0.2, 4]]) {
    const { c, w, e } = arena(ready({ bb: { FearCage: { attack_speed: aspd, hp_ratio: ratio, duration_bleed: ramp } } }), [['archer', 0, 3]]);
    const archer = unitOf(w, 'archer'), cast = w.frame - 1;
    assert.equal(caged(e, archer), true);
    assert.equal(stats(archer).aspd, 100 + aspd);
    assert.equal(stats(archer).flags.noRetreat, true);
    step(w, c, [[0, { type: 'retreat', unit: archer.id }]]);
    assert.ok(w.units.includes(archer), 'cannot retreat');
    status.applyStatus(archer, 'invincible', {});
    // its maximum raised after the cast: each second takes its share of the maximum it has then
    buffs.addBuff(archer, buffs.makeBuff({ key: 'test:hp', mods: { hpFlat: 10000 } }));
    /** @type {[unknown, unknown, unknown][]} */
    const kinds = [];
    bus.on(w, 'damaged', (x) => { if (x.target === archer) kinds.push([x.type, x.dmg.hpLoss, x.dmg.isAttack === true]); });
    const hits = hitsOn(w, c, archer.id, 30 * 6);
    assert.deepEqual(hits.map((h) => h.frame - cast), [30, 60, 90, 120, 150, 180]);
    assert.ok(hits.every((h) => h.src === e.id));
    assert.deepEqual(kinds, hits.map(() => ['true', true, false]), '生命流失, true damage, not an attack');
    const want = [1, 2, 3, 4, 5, 6].map((k) => 50000 * ratio * Math.min(1, k / ramp));
    hits.forEach((h, i) => assert.ok(Math.abs(h.damage - want[i]) < 1e-6, `second ${i + 1}: ${h.damage}`));
  }
});

test('[敌能-148] while its effects last 扎罗 has 静默; a loss of hp_ratio_offset of its current max HP from its HP at the cast cures all, sp SP back each up to the cost, then duration_wait s of 静默', () => {
  for (const [offset, refund, wait] of [[-0.2, 5, 7], [-0.1, 7, 3], [-0.1, 30, 3]]) {
    const { c, w, e } = arena(ready({ bb: { FearCage: { hp_ratio_offset: offset, sp: refund, duration_wait: wait } } }));
    // its maximum raised to 40000 and its HP at 36000 when it casts: the cure is at 36000 − |offset| × 40000
    buffs.addBuff(e, buffs.makeBuff({ key: 'test:hp', mods: { hpFlat: 5000 } }));
    damage.dealDamage(w, null, e, { type: 'true', amount: 4000 });
    deploy(w, c, [['sniper', 0, 2], ['archer', 0, 3], ['bird', 2, 2]]);
    const ours = ['sniper', 'archer', 'bird'].map((op) => unitOf(w, op));
    assert.equal(cageMute(e)?.left, -1);
    run(w, c, 10);
    const cut = -offset * 40000;
    damage.dealDamage(w, null, e, { type: 'true', amount: cut - 1 });
    step(w, c);
    assert.deepEqual(ours.map((u) => caged(e, u)), [true, true, true], 'one HP short of the cure');
    damage.dealDamage(w, null, e, { type: 'true', amount: 1 });
    const sp = spOf(e);
    step(w, c);
    assert.deepEqual(ours.map((u) => caged(e, u)), [false, false, false]);
    assert.equal(spOf(e), Math.min(55, sp + 3 * refund));
    assert.equal(cageMute(e)?.left, secondsToFrames(wait));
    assert.equal(stats(ours[1]).aspd, 100);
    assert.equal(stats(ours[1]).flags.noRetreat, undefined);
    run(w, c, secondsToFrames(wait));
    // the SP the cure gave back is full only in the last row: then it casts again on the frame the 静默 is over
    const again = refund === 30;
    assert.deepEqual([stats(e).flags.mute, caged(e, ours[0]), cageMute(e)?.left], again ? [true, true, -1] : [undefined, false, undefined]);
  }
});

test('[敌能-148] under 阻回 a cure gives no SP back and the SP does not come back', () => {
  const { c, w, e } = arena(ready(), [['sniper', 0, 2], ['archer', 0, 3]]);
  status.applyStatus(e, 'noSp', { seconds: 5 });
  run(w, c, 40);
  assert.equal(spOf(e), 0);
  damage.dealDamage(w, null, e, { type: 'true', amount: 7000 });
  step(w, c);
  assert.equal(caged(e, unitOf(w, 'archer')), false);
  assert.equal(spOf(e), 0);
});

test('[敌能-148] an effect ends when its unit leaves the field, with its SP back; the last to end gives the 静默', () => {
  const { c, w, e } = arena(ready(), [['sniper', 0, 2], ['archer', 0, 3], ['bird', 2, 2]]);
  const [sniper, archer, bird] = ['sniper', 'archer', 'bird'].map((op) => unitOf(w, op));
  sniper.hp = 100;
  run(w, c, 31);
  assert.equal(w.units.includes(sniper), false, 'the drain knocked it down');
  assert.equal(caged(e, archer), true);
  assert.equal(cageMute(e)?.left, -1);
  assert.equal(spOf(e), 1 + 5);
  // knocked down by something else this frame: its effect ends on this frame, not the next
  damage.setHp(bird, 0);
  step(w, c);
  assert.deepEqual([caged(e, bird), spOf(e)], [false, 1 + 5 + 5]);
  archer.hp = 100;
  run(w, c, 30);
  assert.equal(w.units.includes(archer), false);
  assert.equal(cageMute(e)?.left, secondsToFrames(7) - 1);
});

test('[敌能-148] no one to take: no cast, the SP stays full; the first one on the field is taken', () => {
  const { c, w, e } = arena(ready());
  run(w, c, 90);
  assert.equal(spOf(e), 55);
  assert.equal(stats(e).flags.mute, undefined);
  deploy(w, c, [['archer', 0, 3]]);
  assert.equal(caged(e, unitOf(w, 'archer')), true);
});

test('[敌能-148] while its effects last 溶血骇惧 is not cast again, even with its SP full and its 静默 taken off', () => {
  const { c, w, e } = arena(ready({ bb: { FearCage: { max_target: 1 } } }), [['archer', 0, 3]]);
  assert.equal(caged(e, unitOf(w, 'archer')), true);
  buffs.removeBuff(e, 'mute');
  e.ab['FearCage.sp'] = 55;
  deploy(w, c, [['sniper', 0, 2]]);
  run(w, c, 5);
  assert.deepEqual([caged(e, unitOf(w, 'sniper')), caged(e, unitOf(w, 'archer')), spOf(e)], [false, true, 55]);
});

test('[敌能-148] 溶血骇惧 waits out 恐惧, 静默 and 战栗 while blocked, not 战栗 alone; under 阻回 its SP does not come back', () => {
  for (const key of /** @type {const} */ (['fear', 'mute'])) {
    const { c, w, e } = arena(ready());
    status.applyStatus(e, key, { seconds: 1 });
    deploy(w, c, [['archer', 0, 3]]);
    const archer = unitOf(w, 'archer');
    assert.equal(caged(e, archer), false, key);
    run(w, c, secondsToFrames(1));
    assert.equal(caged(e, archer), true, `${key} over`);
  }
  for (const blocked of [true, false]) {
    const { c, w, e } = arena(wolf({ bb: { FearCage: { init_sp: 54 } } }), [[blocked ? 'wall' : 'archer', blocked ? 1 : 0, blocked ? 2 : 3]]);
    const ours = unitOf(w, blocked ? 'wall' : 'archer');
    assert.equal(e.blockedBy === ours.id, blocked);
    status.applyStatus(e, 'disarmedCombat', { seconds: 2 });
    run(w, c, 30);
    assert.equal(caged(e, ours), !blocked, blocked ? '战栗 while blocked holds it' : '战栗 alone does not');
    run(w, c, secondsToFrames(2));
    assert.equal(caged(e, ours), true);
  }
  const { c, w, e } = arena(wolf({ bb: { FearCage: { init_sp: 54 } } }), [['archer', 0, 3]]);
  status.applyStatus(e, 'noSp', { seconds: 2 });
  run(w, c, secondsToFrames(2) - 1);
  assert.equal(spOf(e), 54);
  run(w, c, 31);
  assert.equal(caged(e, unitOf(w, 'archer')), true);
});

test('[敌能-148] the first fall ends every 溶血骇惧 at once, with no SP back and no 静默; the second form never casts it', () => {
  const { c, w, e } = arena(ready({ bb: { Reborn: { duration: 1 } } }), [['archer', 0, 3]]);
  const archer = unitOf(w, 'archer');
  run(w, c, 5);
  const sp = spOf(e);
  fell(w, c, e);
  assert.equal(caged(e, archer), false);
  assert.equal(stats(archer).aspd, 100);
  step(w, c);
  assert.equal(stats(archer).aspd, 50, '【远古威慑】 alone');
  assert.equal(spOf(e), sp);
  assert.equal(cageMute(e), undefined);
  e.ab['FearCage.sp'] = 55;
  run(w, c, 60);
  assert.equal(caged(e, archer), false);
});

test('[敌能-148] 扎罗 gone from the field without a fall: its 溶血骇惧 ends two frames later, and no rebirth', () => {
  const { c, w, e } = arena(ready(), [['archer', 0, 3]]);
  const archer = unitOf(w, 'archer');
  buffs.removeBuff(e, 'root');
  e.base.moveSpeed = 8;
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < 600 && !ev.some((x) => x.type === 'goal' && x.id === e.id); i++) ev.push(...step(w, c));
  assert.equal(w.units.includes(e), false);
  assert.equal(ev.some((x) => x.type === 'death' && x.id === e.id), false, 'the goal is no fall');
  assert.equal(caged(e, archer), true);
  step(w, c);
  assert.equal(caged(e, archer), true);
  step(w, c);
  assert.equal(caged(e, archer), false);
  assert.equal(stats(archer).aspd, 100);
});

/** 扎罗 past a 1 s rebirth, pinned again, with `o`'s changes; an archer within reach. @param {WolfChange} o */
function howling(o) {
  const a = arena(wolf({ ...o, bb: { ...o.bb, Reborn: { duration: 1 } } }), [['archer', 0, 3]]);
  fell(a.w, a.c, a.e);
  run(a.w, a.c, secondsToFrames(1) - 1);
  const start = a.w.frame;
  step(a.w, a.c);
  pin(a.e);
  return { ...a, start, archer: unitOf(a.w, 'archer') };
}

/** The frames of 狂暴怒嗥's root on 扎罗 over the next `n` steps. @param {World} w @param {any} c @param {Unit} e @param {number} n */
function rooted(w, c, e, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const frame = w.frame;
    step(w, c);
    if (e.buffs.some((b) => b.key === 'root' && b.tag === 'wildCalling')) out.push(frame);
  }
  return out;
}

test('[敌能-148] 狂暴怒嗥 in the second form: its first cooldown after the rebirth, then duration s rooted, the cooldown from its end', () => {
  for (const [init, seconds, period] of [[5, 5.5, 40], [1, 2, 10]]) {
    const { c, w, e, start } = howling({ bb: { WildCalling: { duration: seconds } }, skill: { WildCalling: { initCooldown: init, cooldown: period } } });
    const n = secondsToFrames(seconds), from = start + secondsToFrames(init);
    const frames = rooted(w, c, e, secondsToFrames(init) + n + secondsToFrames(period) + n);
    const first = Array.from({ length: n }, (_, i) => from + i), again = first.map((f) => f + n + secondsToFrames(period));
    assert.deepEqual(frames, [...first, ...again]);
  }
});

test('[敌能-148] 狂暴怒嗥 waits out a stun or 静默 that holds it on its ready frame, then channels in full', () => {
  for (const key of /** @type {const} */ (['stun', 'mute'])) {
    const { c, w, e, start } = howling({});
    until(w, c, start + secondsToFrames(5) - 11);
    status.applyStatus(e, key, { seconds: 1 });
    const frames = rooted(w, c, e, secondsToFrames(1) + secondsToFrames(5.5) + 10);
    assert.equal(frames.length, secondsToFrames(5.5), key);
    assert.ok(frames[0] > start + secondsToFrames(5), `${key}: not while it is held`);
    assert.equal(e.buffs.some((b) => b.key === key), false);
  }
});

test('[敌能-148] no attack while it howls; stunned, the howl stops and the cooldown counts from then; never in the first form', () => {
  const { c, w, e, start, archer } = howling({});
  until(w, c, start + secondsToFrames(5) - 1);
  e.atkCd = 0;
  assert.deepEqual(hitsOn(w, c, archer.id, 1), []);
  assert.equal(e.atkCd, attrs.intervalFrames(2.5, 100) - 1, 'the cast takes the attack interval');
  assert.deepEqual(hitsOn(w, c, archer.id, secondsToFrames(5.5) - 1), []);
  assert.ok(hitsOn(w, c, archer.id, 3).length > 0);
  const stunned = howling({});
  until(stunned.w, stunned.c, stunned.start + secondsToFrames(5) + 10);
  status.applyStatus(stunned.e, 'stun', { seconds: 1 });
  const cut = stunned.w.frame;
  step(stunned.w, stunned.c);
  assert.equal(stunned.e.buffs.some((b) => b.key === 'root' && b.tag === 'wildCalling'), false);
  assert.equal(stunned.e.ab['WildCalling.cd'], secondsToFrames(40) - 1, `cooldown from frame ${cut}`);
  const first = arena(wolf({ skill: { WildCalling: { initCooldown: 0 } } }));
  assert.deepEqual(rooted(first.w, first.c, first.e, 60), []);
});
