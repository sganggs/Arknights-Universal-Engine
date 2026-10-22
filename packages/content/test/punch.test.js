// 超负载 (docs/spec/foes.md 敌能-67). R-31 is the enemy_database row (it is not in an extracted level). R-31a is
// act1multi_rm05. The guard has 0 DEF so a physical punch's HP loss is the raw atk_scale × ATK.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, blocking, status, damage, buffs, devices, KIND } from '@aue/sim';
import { secondsToFrames } from '@aue/math';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { foeBehaviors, withFoeExtras, uncoveredAbilities, withoutIncomplete } from '../src/foes.js';
import rm05 from '../data/levels/act1multi_rm05.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const KEY = 'enemy_1255_lybgpa';
const KEY_A = 'enemy_1255_lybgpa_2';
const ATK = 1600;
const HP = 200000;
/** R-31's punch. A normal attack is the full ATK: wind-up is 0, so a forced block hits on that frame. */
const AMOUNT = ATK * 0.75;

/** R-31, level 0, before the page radius is merged. */
const R31 = {
  name: 'R-31重型动力装甲', maxHp: 25000, atk: ATK, def: 1200, res: 20, moveSpeed: 0.3, baseAttackTime: 4,
  massLevel: 5, motion: 'WALK', applyWay: 'MELEE', immune: ['stun', 'sleep', 'levitate'],
  skills: [{ key: 'Punch', cooldown: 20, initCooldown: 0, sp: 0, bb: { stun: 2, atk_scale: 0.75, duration: 10, unmovable_duration: 1 } }],
};

/**
 * Tiny map: `key` spawns at the start, a 0-DEF guard deploys on the road it walks onto.
 * `also` is in the wave before the world exists, so it actually stands on the field.
 * @param {object} def @param {string} key @param {{ key: string, def: object }[]} [also]
 */
function meet(def, key, also = []) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: withFoeExtras(key, /** @type {any} */ (def)) };
  for (const a of also) c.enemies[a.key] = a.def;
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave([spawnAt(0, key), ...also.map((a) => spawnAt(0, a.key))])];
  c.level.options = { ...c.level.options, initialCost: 50, maxCost: 99, characterLimit: 8 };
  Object.assign(c.operators.guard, { cost: 0, def: 0, atk: 0, maxHp: HP, blockCnt: 2 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 0, dir: 0 }]]);
  const e = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.ENEMY && u.key === key));
  const op = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.OPERATOR));
  return { c, w, e, op };
}

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}

/** @param {any[]} events @param {number} id */
const punches = (events, id) => events.filter((h) => h.type === 'hit' && h.id === id);

/** Hits for `amount`: a punch, not the armour's normal attack. @param {any[]} events @param {number} id @param {number} [amount] */
const scaled = (events, id, amount = AMOUNT) => punches(events, id).filter((h) => h.damage === amount);

/** @param {Unit} a @param {Unit} b */
const gap2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** The first punch, or the test stops. @param {World} w @param {any} c @param {Unit} e */
function firstPunch(w, c, e) {
  for (let i = 0; i < 500; i++) {
    const hit = punches(run(w, c, 1), e.id)[0];
    if (hit) return hit;
  }
  assert.fail('no punch');
}

/** @param {Unit} op */
const stunLeft = (op) => op.buffs.filter((b) => b.key === 'stun').reduce((m, b) => Math.max(m, b.left), 0);

/** @param {Unit} e @param {Unit} op @param {number} dx */
function apart(e, op, dx) {
  e.x = 1;
  e.y = 1;
  op.x = 1 + dx;
  op.y = 1;
  blocking.release(e);
}

/** Ten punches, the walk, the 1 s hold, then the cooldown. @param {object} def @param {string} key @param {number} amount @param {number} stun */
function ten(def, key, amount, stun) {
  const { c, w, e, op } = meet(def, key);
  const first = firstPunch(w, c, e);
  assert.equal(first.damage, amount);
  assert.equal(op.hp, HP - amount);
  assert.equal(e.blockedBy, -1);
  assert.equal(stunLeft(op), secondsToFrames(stun));
  assert.equal(e.ab['Punch.cd'] ?? 0, 0);
  const at = { x: e.x, y: e.y };
  const mid = run(w, c, 299);
  assert.ok(e.x !== at.x || e.y !== at.y);
  assert.equal(attrs.statsOf(e).immobile, false);
  const held = { x: e.x, y: e.y };
  const tail = run(w, c, 30);
  assert.equal(e.x, held.x);
  assert.equal(e.y, held.y);
  assert.equal(attrs.statsOf(e).immobile, true);
  assert.equal(e.buffs.some((b) => b.key === 'root'), false);
  run(w, c, 1);
  assert.equal(e.ab['Punch.cd'], secondsToFrames(20) - 1);
  assert.equal(e.buffs.some((b) => b.key === 'punch' || b.key === 'punch:hold'), false);
  const hits = [first, ...punches(mid, e.id), ...punches(tail, e.id)];
  assert.deepEqual(hits.map((h) => h.f - first.f), [0, 30, 60, 90, 120, 150, 180, 210, 240, 270]);
  assert.ok(hits.every((h) => h.damage === amount && h.target === op.id));
}

test('[敌能-67] R-31: a block and a ground operator within 0.8, ten punches of 75% ATK and 2 s stun, the block let go, then 1 s unmovable', () => {
  ten(R31, KEY, AMOUNT, 2);
});

test('[敌能-67] R-31a from IG-6: 50% ATK and 1 s stun, and the page radius makes Punch complete', () => {
  const raw = /** @type {any} */ (rm05).enemies[KEY_A];
  assert.equal(raw.skills[0].bb.radius, undefined);
  const def = withFoeExtras(KEY_A, raw);
  assert.equal(def.skills?.[0].bb.radius, 0.8);
  assert.deepEqual(uncoveredAbilities([def]), []);
  ten(raw, KEY_A, 2000 * 0.5, 1);
});

test('[敌能-67] no block, or a block with nobody of ours within 0.8, and the rim of 0.8 counts', () => {
  const far = meet(R31, KEY);
  apart(far.e, far.op, 1);
  blocking.blockBy(far.w, far.e, far.op);
  assert.equal(scaled(run(far.w, far.c, 5), far.e.id).length, 0, 'blocked, centre 1 tile away');
  assert.equal(far.e.blockedBy, far.op.id, 'the block stays when the skill does not start');
  const loose = meet(R31, KEY);
  apart(loose.e, loose.op, 0.75);
  loose.e.base.moveSpeed = 0;
  assert.equal(loose.e.blockedBy, -1);
  assert.equal(scaled(run(loose.w, loose.c, 5), loose.e.id).length, 0, 'in reach, not blocked');
  assert.equal(loose.e.blockedBy, -1);
  const rim = meet(R31, KEY);
  apart(rim.e, rim.op, 0.8);
  blocking.blockBy(rim.w, rim.e, rim.op);
  const hit = scaled(run(rim.w, rim.c, 1), rim.e.id);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].damage, AMOUNT);
  assert.equal(rim.e.blockedBy, -1);
});

test('[敌能-67] a flying operator does not satisfy 非飞行, and silence blocks the trigger only', () => {
  const fly = meet(R31, KEY);
  fly.op.base.motion = 'FLY';
  assert.equal(scaled(run(fly.w, fly.c, 400), fly.e.id).length, 0);
  fly.op.base.motion = 'WALK';
  assert.equal(firstPunch(fly.w, fly.c, fly.e).damage, AMOUNT);
  const quiet = meet(R31, KEY);
  status.applyStatus(quiet.e, 'silence', {});
  assert.equal(scaled(run(quiet.w, quiet.c, 400), quiet.e.id).length, 0);
  buffs.removeBuff(quiet.e, 'silence');
  const hit = firstPunch(quiet.w, quiet.c, quiet.e);
  assert.equal(hit.damage, AMOUNT);
  status.applyStatus(quiet.e, 'silence', {});
  const later = punches(run(quiet.w, quiet.c, 30), quiet.e.id);
  assert.equal(later.length, 1, 'silence does not cancel a punch already started');
});

test('[敌能-67] our device counts, a neutral enemy does not; a later block does not change the target', () => {
  const box = meet(R31, KEY);
  box.c.devices = { box: { name: 'box', maxHp: 5000, atk: 0, def: 0, res: 0, blockCnt: 0 } };
  apart(box.e, box.op, 2);
  assert.equal(devices.spawnDevice(box.w, box.c, 'box', 1, 1), true);
  blocking.blockBy(box.w, box.e, box.op);
  const hit = scaled(run(box.w, box.c, 1), box.e.id);
  const dev = /** @type {Unit} */ (box.w.units.find((u) => u.kind === KIND.DEVICE));
  assert.equal(hit.length, 1);
  assert.equal(hit[0].target, box.op.id);
  assert.ok(gap2(box.e, box.op) > 0.64, 'the blocker itself is outside 0.8');
  assert.ok(gap2(dev, box.e) <= 0.64);
  const neut = meet(R31, KEY, [{ key: 'neut', def: { name: 'n', maxHp: 500, atk: 0, def: 0, res: 0, neutral: true, moveSpeed: 0 } }]);
  const n = /** @type {Unit} */ (neut.w.units.find((u) => u.key === 'neut'));
  apart(neut.e, neut.op, 2);
  n.x = neut.e.x;
  n.y = neut.e.y;
  blocking.blockBy(neut.w, neut.e, neut.op);
  assert.equal(scaled(run(neut.w, neut.c, 5), neut.e.id).length, 0);
  assert.equal(neut.e.blockedBy, neut.op.id);
  assert.ok(gap2(n, neut.e) <= 0.64);
  const { c, w, e, op } = meet(R31, KEY);
  const first = firstPunch(w, c, e);
  c.operators.g2 = { name: 'g2', position: 'MELEE', cost: 0, blockCnt: 1, baseAttackTime: 1, maxHp: HP, atk: 0, def: 0, res: 0, range: [{ row: 0, col: 0 }] };
  run(w, c, 5);
  step(w, c, [[0, { type: 'deploy', op: 'g2', row: 1, col: 4, dir: 0 }]]);
  const g2 = /** @type {Unit} */ (w.units.find((u) => u.key === 'g2'));
  g2.x = e.x;
  g2.y = e.y;
  blocking.blockBy(w, e, g2);
  const next = punches(run(w, c, 24), e.id);
  assert.equal(e.blockedBy, g2.id);
  assert.equal(next[0].target, op.id);
  assert.equal(next[0].f - first.f, 30);
  assert.equal(g2.hp, HP);
});

test('[敌能-67] the target leaving or dying ends it at once; a hidden target does not; the punch uses ATK now', () => {
  const left = meet(R31, KEY);
  const gone = firstPunch(left.w, left.c, left.e);
  run(left.w, left.c, 10);
  const stopped = runStep(left.w, left.c, [[0, { type: 'retreat', unit: left.op.id }]]);
  assert.equal(punches(stopped, left.e.id).length, 0);
  assert.equal(left.e.ab['Punch.cd'], secondsToFrames(20) - 1);
  assert.equal(left.e.buffs.some((b) => b.key === 'punch' || b.key === 'punch:hold'), false);
  assert.equal(punches(run(left.w, left.c, 40), left.e.id).length, 0);
  assert.equal(gone.damage, AMOUNT);
  const dead = meet(R31, KEY);
  firstPunch(dead.w, dead.c, dead.e);
  damage.setHp(dead.op, 1000);
  const kill = punches(run(dead.w, dead.c, 30), dead.e.id);
  assert.equal(kill.length, 1);
  assert.equal(kill[0].damage, AMOUNT);
  assert.equal(dead.op.hp, 0);
  assert.equal(dead.e.ab['Punch.cd'], secondsToFrames(20) - 1);
  assert.equal(dead.e.buffs.some((b) => b.key === 'punch:hold'), false);
  const hide = meet(R31, KEY);
  firstPunch(hide.w, hide.c, hide.e);
  run(hide.w, hide.c, 29);
  hide.op.hidden = true;
  assert.equal(punches(run(hide.w, hide.c, 1), hide.e.id).length, 0);
  assert.equal(hide.e.ab['Punch.cd'] ?? 0, 0);
  hide.op.hidden = false;
  assert.equal(punches(run(hide.w, hide.c, 30), hide.e.id).length, 1);
  const scaled = meet(R31, KEY);
  firstPunch(scaled.w, scaled.c, scaled.e);
  scaled.e.base.atk = 800;
  const next = punches(run(scaled.w, scaled.c, 30), scaled.e.id);
  assert.equal(next[0].damage, 600);
});

/** One frame, its events. @param {World} w @param {any} c @param {[number, any][]} [cmds] */
function runStep(w, c, cmds = []) {
  return step(w, c, cmds).map((ev) => ({ ...ev, f: w.frame - 1 }));
}

test('[敌能-67] freeze skips that punch and does not abort; stun does not, the armour is immune', () => {
  const iced = meet(R31, KEY);
  const first = firstPunch(iced.w, iced.c, iced.e);
  run(iced.w, iced.c, 29);
  status.applyStatus(iced.e, 'freeze', { frames: 2 });
  assert.equal(punches(run(iced.w, iced.c, 1), iced.e.id).length, 0);
  assert.equal(attrs.statsOf(iced.e).disabled, true);
  assert.equal(iced.e.ab['Punch.cd'] ?? 0, 0);
  const later = punches(run(iced.w, iced.c, 30), iced.e.id);
  assert.equal(later.length, 1);
  assert.equal(later[0].f - first.f, 60);
  const stunned = meet(R31, KEY);
  firstPunch(stunned.w, stunned.c, stunned.e);
  status.applyStatus(stunned.e, 'stun', { seconds: 5 });
  assert.equal(attrs.statsOf(stunned.e).disabled, false);
  const again = punches(run(stunned.w, stunned.c, 30), stunned.e.id);
  assert.equal(again.length, 1);
  assert.equal(again[0].damage, AMOUNT);
});

test('[敌能-67] 神拳机甲 stays uncovered without the page radius; 朔壳\'s Punch is another shape and does not punch', () => {
  const fist = {
    skills: [{ key: 'Punch', cooldown: 20, initCooldown: 0, sp: 0, bb: { stun: 2, atk_scale: 0.75, duration: 10, unmovable_duration: 1 } }],
  };
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ (fist)]), ['Punch']);
  assert.equal(withoutIncomplete(/** @type {any} */ (fist)).skills?.length, 0);
  const bare = meet(fist, 'enemy_15089_dqbgpa');
  apart(bare.e, bare.op, 0);
  blocking.blockBy(bare.w, bare.e, bare.op);
  assert.equal(scaled(run(bare.w, bare.c, 5), bare.e.id).length, 0);
  assert.equal(bare.e.blockedBy, bare.op.id);
  const shell = {
    ...R31,
    skills: [{ key: 'Punch', cooldown: 30, initCooldown: 0, sp: 0, bb: { range_radius: 13, radius: 0.8, stun: 2, atk_scale: 0.75, duration: 10, unmovable_duration: 1 } }],
  };
  assert.ok(uncoveredAbilities([/** @type {any} */ (shell)]).includes('Punch'));
  const quiet = meet(shell, 'enemy_2126_dycyue');
  const seen = punches(run(quiet.w, quiet.c, 400), quiet.e.id);
  assert.equal(scaled(seen, quiet.e.id).length, 0);
  assert.ok(seen.some((h) => h.damage === ATK), 'blocked in reach, so this shape would have punched');
  assert.deepEqual(uncoveredAbilities([withFoeExtras(KEY, /** @type {any} */ (R31))]), []);
});
