// 缴械 and 强制缴械 (docs/spec/status.md 状态-12) on the tiny level without spawns: no normal attack, the swing under way
// cut and the cooldown held as for a unit that cannot act, on an operator and on an enemy; 无敌 suspends 缴械 but not
// 强制缴械; no reload, no stored energy; skills, SP, walking and blocking go on; the catalogue's rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { ANIM } from '@aue/schema';
import { createWorld, step, bus } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { STATUS, applyStatus, inflict } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { makeBuff, addBuff, tickUnitBuffs } from '../src/buffs.js';
import { disarmed } from '../src/disarm.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/** The tiny level without spawns, the guard's swing 15 frames (interval 30); `foe` adds a rooted enemy. @param {(c: any) => void} [tweak] */
function arena(tweak) {
  const c = tinyContent();
  c.level.waves = [];
  c.level.options = { ...c.level.options, characterLimit: 9, initialCost: 99, maxCost: 99 };
  c.operators.guard.attack = { duration: 1, hit: 0.5 };
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @param {number} row @param {number} col @param {Record<string, any>} [over] */
  const foe = (row, col, over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, maxHp: 1e6, def: 0, ...over };
    e.hp = e.maxHp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  return { w, c, foe };
}
/** Runs n frames; the events with their frame. Bare commands are seat 0's. @param {World} w @param {any} c @param {number} n @param {any[]} [cmds] */
function run(w, c, n, cmds = []) {
  const first = /** @type {[number, any][]} */ (cmds.map((x) => (Array.isArray(x) ? x : [0, x])));
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const e of step(w, c, i === 0 ? first : [])) out.push({ ...e, f: w.frame - 1 });
  return out;
}
/** The frames of the events of a type, by one unit. @param {any[]} ev @param {string} type @param {number} id */
const of = (ev, type, id) => ev.filter((e) => e.type === type && e.id === id).map((e) => e.f);
const guardAt = (/** @type {number} */ col) => ({ type: 'deploy', op: 'guard', row: 1, col, dir: 0 });
/** @param {Unit} u @param {string} key */
const buffOf = (u, key) => u.buffs.find((b) => b.key === key);

test('[状态-12] the catalogue: each flags its own key, queues, is not resistible and needs no value; seconds as frames', () => {
  for (const k of /** @type {const} */ (['disarm', 'forceDisarm'])) {
    const t = STATUS[k];
    assert.deepEqual([t.rule, t.resist, t.flags, t.value, t.heavy, t.every], ['queue', false, { [k]: true }, 0, false, 0], k);
  }
  const { w, foe } = arena();
  const e = foe(1, 2);
  applyStatus(e, 'buffres', {});
  const d = applyStatus(e, 'disarm', { seconds: 2.5 }), f = applyStatus(e, 'forceDisarm', { seconds: 0.05 }), s = applyStatus(e, 'stun', { seconds: 2.5 });
  assert.deepEqual([d?.left, f?.left, s?.left], [75, 2, 75], '2.5 s is 75 frames, 0.05 s 2 (时间-2)');
  for (let i = 0; i < 30; i++) tickUnitBuffs(w, e, {});
  assert.deepEqual([d?.left, s?.left], [45, 15], '抵抗 halves the stun, not 缴械');
  const again = applyStatus(e, 'disarm', { seconds: 1 });
  assert.deepEqual(e.buffs.filter((b) => b.key === 'disarm').map((b) => b.left), [45, 30], 'queued: both kept, the earliest in effect');
  assert.equal(applyStatus(e, 'disarm', { frames: 0 }), null, '0 frames: none (状态-7)');
  assert.ok(again && disarmed(e));
});

test('[状态-12] an operator: the swing under way is cut on its next turn, no attack starts and the cooldown waits; it stands idle', () => {
  for (const [key, frames] of /** @type {const} */ ([['disarm', 3], ['forceDisarm', 12], ['disarm', 21]])) {
    const { w, c, foe } = arena();
    run(w, c, 1, [guardAt(1)]);
    foe(1, 2);
    const first = run(w, c, 5), g = w.units[0];
    assert.deepEqual([of(first, 'attack', g.id), !!g.swing], [[1], true], 'its first attack started at frame 1 and is in its wind-up');
    applyStatus(g, key, { frames });
    run(w, c, 1);
    assert.deepEqual([g.swing, g.anim], [null, ANIM.IDLE], `${key}: cut at frame 6, before its hit at 16`);
    const ev = run(w, c, 59), held = frames - 1;
    assert.deepEqual(of(ev, 'attack', g.id), [31 + held, 61 + held].filter((f) => f <= 65), `${key} ${frames}: the cooldown from frame 1 waited ${held} turns`);
    assert.deepEqual(of(ev, 'hit', g.id), [46 + held].filter((f) => f <= 65), 'the cut swing never lands; the next lands 15 frames after it starts');
  }
});

test('[状态-12] 无敌 holds 缴械 off while its time runs, then it takes effect; 强制缴械 holds through 无敌', () => {
  const a = arena();
  run(a.w, a.c, 1, [guardAt(1)]);
  a.foe(1, 2);
  const g = a.w.units[0];
  applyStatus(g, 'invincible', { frames: 40 });
  const d = /** @type {any} */ (applyStatus(g, 'disarm', { frames: 100 }));
  const ev = run(a.w, a.c, 39);
  assert.deepEqual([of(ev, 'attack', g.id), of(ev, 'hit', g.id), d.left, disarmed(g)], [[1, 31], [16], 61, false], '无敌 frames 1–39: it attacks; 缴械 runs down');
  const later = run(a.w, a.c, 100);
  assert.deepEqual([of(later, 'attack', g.id), of(later, 'hit', g.id)], [[121], [136]], '无敌 gone at 40: the swing from 31 is cut, the cooldown waits to 100');
  const b = arena();
  run(b.w, b.c, 1, [guardAt(1)]);
  b.foe(1, 2);
  const h = b.w.units[0];
  applyStatus(h, 'invincible', {});
  applyStatus(h, 'forceDisarm', { frames: 20 });
  const forced = run(b.w, b.c, 60);
  assert.deepEqual([of(forced, 'attack', h.id), of(forced, 'hit', h.id)], [[20, 50], [35]], '强制缴械: none until it ends at 20, 无敌 or not');
});

test('[状态-12] 无敌 is 无敌 or 沉睡; immune to 无敌 is not 无敌; an immunity to the flag stops that one only', () => {
  const { foe } = arena();
  const e = foe(1, 2);
  applyStatus(e, 'disarm', {});
  assert.equal(disarmed(e), true);
  addBuff(e, makeBuff({ key: 'sleepy', flags: { sleep: true } }));
  assert.deepEqual([disarmed(e), statsOf(e).disabled], [false, true], '沉睡 is 无敌 (状态-5): 缴械 does nothing, the unit cannot act anyway');
  e.buffs = e.buffs.filter((b) => b.key !== 'sleepy');
  applyStatus(e, 'invincible', {});
  assert.equal(disarmed(e), false);
  e.base = { ...e.base, immune: ['invincible'] };
  assert.equal(disarmed(e), true, '无敌 does not take effect, so 缴械 does');
  e.base = { ...e.base, immune: ['disarm'] };
  assert.equal(disarmed(e), false, '缴械免疫: the buff stays without effect');
  applyStatus(e, 'forceDisarm', {});
  assert.equal(disarmed(e), true, 'immune to 缴械 is not immune to 强制缴械');
  addBuff(e, makeBuff({ key: 'ward', flags: { 'immune:forceDisarm': true } }));
  assert.deepEqual([disarmed(e), e.buffs.filter((b) => b.key === 'disarm' || b.key === 'forceDisarm').length], [false, 2], 'a buff\'s immunity (状态-7)');
});

/** The tiny level with a slime of ATK 300 that swings 15 frames (interval 30), walking in; `blocked` deploys the guard against it. @param {boolean} blocked */
function slimeArena(blocked) {
  const c = tinyContent();
  Object.assign(c.enemies.slime, { atk: 300, baseAttackTime: 1, maxHp: 1e6, attack: { duration: 1, hit: 0.5 } });
  c.level.waves = [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions: [{ type: 'SPAWN', key: 'slime', route: 0, count: 1, preDelay: 0.5, interval: 0 }] }] }];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, blocked ? [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 2 }]] : []);
  while (!w.units.some((u) => u.key === 'slime')) step(w, c);
  return { w, c, slime: /** @type {Unit} */ (w.units.find((u) => u.key === 'slime')) };
}

test('[状态-12] an enemy: 缴械 cuts the swing under way and holds its cooldown; once it ends the enemy attacks again', () => {
  for (const frames of [9, 25]) {
    const { w, c, slime } = slimeArena(true);
    while (!slime.swing) step(w, c);
    const start = w.frame - 1;
    applyStatus(slime, 'disarm', { frames });
    const ev = run(w, c, 80), held = frames - 1;
    assert.equal(slime.blockedBy, 1, 'still blocked (INF-1082)');
    assert.deepEqual(of(ev, 'attack', slime.id).map((f) => f - start), [30 + held, 60 + held].filter((f) => f <= 80), `${frames} frames: the next attack ${held} turns late`);
    assert.deepEqual(of(ev, 'hit', slime.id).map((f) => f - start), [45 + held, 75 + held].filter((f) => f <= 80), 'the cut swing never hits');
  }
});

test('[状态-12] the cut takes the hit due on that very turn: an operator and an enemy given 缴械 when one wind-up frame is left', () => {
  for (const frames of [5, 9]) {
    const { w, c, foe } = arena();
    run(w, c, 1, [guardAt(1)]);
    foe(1, 2);
    const g = w.units[0];
    run(w, c, 15);
    assert.equal(g.swing?.wind, 1, 'the swing from frame 1 would land at 16');
    applyStatus(g, 'disarm', { frames });
    const ev = run(w, c, 60), held = frames - 1;
    assert.deepEqual([of(ev, 'hit', g.id), of(ev, 'attack', g.id)], [[46 + held], [31 + held, 61 + held].filter((f) => f <= 75)], `operator, ${frames} frames: no hit at 16`);
    const { w: v, c: d, slime } = slimeArena(true);
    while (!slime.swing) step(v, d);
    const start = v.frame - 1;
    while (/** @type {any} */ (slime.swing).wind > 1) step(v, d);
    applyStatus(slime, 'disarm', { frames });
    const late = run(v, d, 60);
    assert.deepEqual([of(late, 'hit', slime.id).map((f) => f - start), of(late, 'attack', slime.id).map((f) => f - start)],
      [[45 + held, 75 + held], [30 + held, 60 + held]].map((l) => l.filter((f) => f <= 74)), `enemy, ${frames} frames: no hit 15 frames after its start`);
  }
});

test('[状态-12] a ranged enemy that is not blocked holds its fire under 缴械 — not only while blocked, as under 战栗 — and fires once it ends', () => {
  for (const [key, frames, first] of /** @type {const} */ ([['disarm', 20, 20], ['disarm', 40, 40], ['forceDisarm', 33, 33], ['disarmedCombat', 20, 1]])) {
    const { w, c, foe } = arena();
    run(w, c, 1, [guardAt(1)]);
    const e = foe(1, 3, { applyWay: 'RANGED', rangeRadius: 2, atk: 10 });
    applyStatus(e, key, { frames });
    const ev = run(w, c, 70);
    assert.deepEqual([e.blockedBy, of(ev, 'attack', e.id)], [-1, [first, first + 30, first + 60].filter((f) => f <= 70)], `${key} ${frames}: the guard 2 tiles off is shot from frame ${first}`);
  }
});

test('[状态-12] an enemy under 缴械 that is not blocked walks on; under 晕眩 it would not', () => {
  const walk = slimeArena(false), stun = slimeArena(false);
  applyStatus(walk.slime, 'disarm', { seconds: 3 });
  applyStatus(stun.slime, 'stun', { seconds: 3 });
  const x0 = walk.slime.x, y0 = walk.slime.y, sx = stun.slime.x, sy = stun.slime.y;
  run(walk.w, walk.c, 30);
  run(stun.w, stun.c, 30);
  assert.notDeepEqual([walk.slime.x, walk.slime.y], [x0, y0], 'it moved (阻止移动 does not hold 缴械)');
  assert.deepEqual([stun.slime.x, stun.slime.y], [sx, sy]);
});

test('[状态-12] no reload for a 猎手 and no energy stored for a 秘术师 while 缴械 holds; what is stored stays', () => {
  const hunt = arena((c) => { c.operators.sniper = { ...c.operators.sniper, trait: { bullets: { max: 2, scale: 1.5 } } }; });
  run(hunt.w, hunt.c, 1, [{ type: 'deploy', op: 'sniper', row: 2, col: 2, dir: 0 }]);
  const hunter = hunt.w.units[0], bullets = /** @type {any} */ (buffOf(hunter, 'bullets'));
  bullets.value = 0;
  applyStatus(hunter, 'disarm', { frames: 61 });
  run(hunt.w, hunt.c, 60);
  assert.equal(bullets.value, 0, 'no reload in 60 turns');
  run(hunt.w, hunt.c, 1);
  assert.equal(bullets.value, 1, 'the first turn after: a bullet');
  const mys = arena((c) => { c.operators.sniper = { ...c.operators.sniper, trait: { store: 2 } }; });
  run(mys.w, mys.c, 1, [{ type: 'deploy', op: 'sniper', row: 2, col: 2, dir: 0 }]);
  const mystic = mys.w.units[0], energy = /** @type {any} */ (buffOf(mystic, 'energy'));
  run(mys.w, mys.c, 100);
  assert.equal(energy.value, 2);
  energy.value = 1;
  applyStatus(mystic, 'forceDisarm', { frames: 91 });
  mys.foe(1, 2);
  const ev = run(mys.w, mys.c, 90);
  assert.deepEqual([energy.value, of(ev, 'shot', mystic.id)], [1, []], 'none stored, none shot; the one stored stays');
  const after = run(mys.w, mys.c, 20);
  assert.equal(of(after, 'shot', mystic.id).length, 2, 'its attack and the stored one, once it ends');
});

test('[状态-12] skills, SP and blocking go on: a manual skill starts, an AUTO one that waits for an attack does not', () => {
  const skill = (/** @type {'MANUAL' | 'AUTO'} */ type) => ({ id: 's', type, sp: 'time', cost: 2, init: 0, charges: 1, duration: 5, ammo: false, bb: { atk_scale: 2 } });
  const man = arena((c) => { c.operators.guard.skill = skill('MANUAL'); });
  run(man.w, man.c, 1, [guardAt(1)]);
  const g = man.w.units[0], e = man.foe(1, 2);
  applyStatus(g, 'disarm', { seconds: 10 });
  run(man.w, man.c, 61);
  assert.ok((g.skill?.sp ?? 0) >= 2, 'SP recovers');
  const ev = run(man.w, man.c, 1, [{ type: 'skill', unit: g.id }]);
  assert.deepEqual([g.skill?.active, of(ev, 'hit', g.id)], [true, []], 'the skill command starts it; still no attack');
  e.x = 1.2;
  run(man.w, man.c, 2);
  assert.equal(e.blockedBy, g.id, 'it blocks (INF-1082)');
  const auto = arena((c) => { c.operators.guard.skill = skill('AUTO'); });
  run(auto.w, auto.c, 1, [guardAt(1)]);
  const h = auto.w.units[0];
  auto.foe(1, 2);
  applyStatus(h, 'disarm', { seconds: 10 });
  run(auto.w, auto.c, 120);
  assert.deepEqual([h.skill?.active, (h.skill?.sp ?? 0) >= 2], [false, true], 'ready, but no attack comes to start it on (技能-3)');
});

test('[状态-12] given as any status: beforeStatus may change it; a ground enemy cannot give it to an operator that took off', () => {
  const { w, c, foe } = arena();
  run(w, c, 1, [guardAt(1)]);
  const g = w.units[0], e = foe(1, 2);
  /** @type {any[]} */
  const seen = [];
  bus.on(w, 'beforeStatus', (k) => { seen.push([k.status, k.frames]); if (k.status === 'forceDisarm') k.frames = 45; });
  assert.equal(inflict(w, g, 'forceDisarm', { seconds: 4, src: e })?.left, 45);
  assert.equal(inflict(w, e, 'disarm', { seconds: 1.5, src: g })?.left, 45);
  assert.deepEqual(seen, [['forceDisarm', 120], ['disarm', 45]]);
  addBuff(g, makeBuff({ key: 'up', flags: { liftoff: true } }));
  assert.equal(inflict(w, g, 'disarm', { seconds: 1, src: e }), null, '起飞 (阻挡-2), before the event');
  assert.equal(seen.length, 2);
});
