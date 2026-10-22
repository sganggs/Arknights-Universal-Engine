// Ammo shots and the dessert merchant's blocked attack (docs/spec/foes.md 敌能-81).
// The enemy records are act1multi_07's. Ammunition and the page marker come from FOE_EXTRAS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, KIND } from '@aue/sim';
import { secondsToFrames } from '@aue/math';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelAt } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, foeBehaviors } from '../src/foes.js';
import act from '../data/levels/act1multi_07.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */
/** @typedef {{ c: any, w: World, e: Unit, ops: Unit[] }} Box */

const AMMO = 'shotbuff.ammo';
/** Blocker, the road beside it, two tiles to walk onto the floor, then the four highland tiles. */
const RING = /** @type {[number, number, boolean][]} */ ([
  [1, 2, false], [1, 1, false], [1, 3, false], [1, 0, false], [1, 4, false],
  [0, 2, true], [0, 3, true], [2, 2, true], [2, 3, true],
]);
/** The eight tiles around the enemy at (row 1, col 2), after those two walks. */
const EIGHT = [[0, 1], [0, 2], [0, 3], [1, 1], [1, 3], [2, 1], [2, 2], [2, 3]];
const READ = ['enemy_1216_cansld', 'enemy_1216_cansld_2', 'enemy_1219_mtrbty', 'enemy_1219_mtrbty_2', 'enemy_1217_rescar', 'enemy_1217_rescar_2'];

/** @param {string} key @returns {EnemyDef} */
const foe = (key) => /** @type {EnemyDef} */ (/** @type {any} */ (act).enemies[key]);

/** 万国信使，奥伦 is not in this level. The page's numbers, and the same shotbuff shape as 寻路者信使. @returns {EnemyDef} */
function oren() {
  return {
    name: '万国信使，奥伦', maxHp: 23000, atk: 700, def: 550, res: 60, moveSpeed: 0.8, baseAttackTime: 2.7,
    rangeRadius: 2.5, applyWay: 'ALL', motion: 'WALK', dmgType: 'arts',
    talents: { shotbuff: { 'attack@headshot_atk_scale': 1.5, 'attack@headshot_disarmed_duration': 10, 'attack@headshot_sp': -1, 'attack@headshot_trapdamage': 5000 } },
  };
}

/** @param {string} key @param {EnemyDef} def */
const gap = (key, def) => uncoveredAbilities([withFoeExtras(key, def)]);

/** The merged shotbuff blackboard. @param {string} key @param {EnemyDef} [def] */
function extra(key, def) {
  const bb = withFoeExtras(key, def ?? foe(key)).talents?.shotbuff;
  assert.ok(bb, key);
  return bb;
}

/** @param {string} key */
const cartBb = (key) => withFoeExtras(key, foe(key)).skills?.[0]?.bb ?? {};

/** @param {Record<string, Record<string, number>>} talents @returns {EnemyDef} */
const body = (talents) => ({ name: 'x', maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents });

/**
 * Spawn the enemy on the road tile, hold its attack through the deploy, then let the next step be the first swing.
 * `seats` are [row, col, highland]. The cooldown is gated so the deploy step does not spend a round.
 * @param {string} key @param {EnemyDef} def @param {[number, number, boolean][]} seats @returns {Box}
 */
function open(key, def, seats) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: withFoeExtras(key, def) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 12 };
  const blank = { cost: 0, maxHp: 1e6, atk: 0, def: 0, res: 0 };
  Object.assign(c.operators.guard, blank);
  Object.assign(c.operators.sniper, blank);
  seats.forEach((seat, i) => {
    const src = seat[2] ? c.operators.sniper : c.operators.guard;
    c.operators[`p${i}`] = { ...src, name: `p${i}` };
  });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const found = w.units.find((u) => u.kind === KIND.ENEMY);
  assert.ok(found);
  const e = found;
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0, atkCd: 1e9 });
  status.applyStatus(e, 'root', {});
  if (seats.length > 0) step(w, c, seats.map((seat, i) => [0, { type: 'deploy', op: `p${i}`, row: seat[0], col: seat[1], dir: 0 }]));
  e.atkCd = 0;
  return { c, w, e, ops: w.units.filter((u) => u.kind === KIND.OPERATOR) };
}

/** @param {Box} box @param {number} n */
function play(box, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(box.w, box.c)) out.push(ev);
  return out;
}

/** The swing one attack interval after the one that just started. @param {Box} box */
function again(box) {
  const s = attrs.statsOf(box.e);
  play(box, attrs.intervalFrames(s.bat, s.aspd) - 1);
  return play(box, 1);
}

/** @param {Unit[]} ops @param {number} row @param {number} col */
function at(ops, row, col) {
  const u = ops.find((x) => x.y === row && x.x === col);
  assert.ok(u, `${row},${col}`);
  return u;
}

/** @param {Unit} u @param {number} row @param {number} col */
function shift(u, row, col) {
  u.y = row;
  u.x = col;
}

/** @param {Unit} u */
const fly = (u) => { u.base.motion = 'FLY'; };
/** @param {Unit} u */
const hide = (u) => { buffs.addBuff(u, buffs.makeBuff({ key: 'camou', flags: { camou: true } })); };
/** @param {Unit} u @param {'silence' | 'noAttack'} kind */
function quiet(u, kind) {
  if (kind === 'silence') status.applyStatus(u, 'silence', { seconds: 30 });
  else buffs.addBuff(u, buffs.makeBuff({ key: 'held', left: 900, flags: { noAttack: true } }));
}

/** @param {any[]} ev @param {number} id @param {number} [target] */
const hitList = (ev, id, target) => ev.filter((x) => x.type === 'hit' && x.id === id && (target === undefined || x.target === target)).map((x) => x.damage);
/** @param {any[]} ev @param {number} id */
const locked = (ev, id) => ev.find((x) => x.type === 'attack' && x.id === id)?.target ?? -1;
/** @param {any[]} ev @param {number} id */
const shotCount = (ev, id) => ev.filter((x) => x.type === 'shot' && x.id === id).length;
/** @param {Unit} e */
const rounds = (e) => e.ab[AMMO] ?? 0;
/** @param {Unit} u @param {string} key */
const copies = (u, key) => u.buffs.filter((b) => b.key === key);

/** The nine operators: the blocker and every tile of the square. @param {string} key */
function ring(key) {
  const box = open(key, foe(key), RING);
  shift(at(box.ops, 1, 0), 0, 1);
  shift(at(box.ops, 1, 4), 2, 1);
  return box;
}

/** @param {any[]} ev @param {number} id @param {Unit[]} units @param {number} dmg */
function sameDamage(ev, id, units, dmg) {
  for (const u of units) assert.deepEqual(hitList(ev, id, u.id), [dmg], `${u.y},${u.x}`);
}

test('[敌能-81] 阵地破坏者: two blocked shots splash the eight tiles, then only the blocker', () => {
  const box = ring('enemy_1216_cansld');
  const blocker = at(box.ops, 1, 2);
  const flyer = at(box.ops, 0, 3);
  fly(flyer);
  hide(at(box.ops, 1, 3));
  status.applyStatus(box.e, 'silence', { seconds: 99 });
  const eight = EIGHT.map(([row, col]) => at(box.ops, row, col));
  assert.equal(rounds(box.e), 2);
  const first = play(box, 1);
  sameDamage(first, box.e.id, [blocker, ...eight], 800);
  assert.equal(locked(first, box.e.id), blocker.id);
  assert.equal(first.some((x) => x.type === 'attack' && x.id === box.e.id && x.target === flyer.id), false);
  assert.equal(shotCount(first, box.e.id), 0);
  assert.equal(rounds(box.e), 1);
  const second = again(box);
  sameDamage(second, box.e.id, [blocker, ...eight], 800);
  assert.equal(rounds(box.e), 0);
  const melee = again(box);
  assert.deepEqual(hitList(melee, box.e.id), [800]);
  assert.equal(rounds(box.e), 0);
});

test('[敌能-81] 阵地破坏者: the main target is never a flyer; two tiles out take nothing; melee can hit a flying blocker', () => {
  const far = open('enemy_1216_cansld', foe('enemy_1216_cansld'), [[1, 2, false], [1, 4, false]]);
  const near = play(far, 1);
  assert.deepEqual(hitList(near, far.e.id, at(far.ops, 1, 2).id), [800]);
  assert.deepEqual(hitList(near, far.e.id, at(far.ops, 1, 4).id), []);
  const box = open('enemy_1216_cansld', foe('enemy_1216_cansld'), [[1, 2, false], [1, 4, false]]);
  const flyer = at(box.ops, 1, 2);
  const ground = at(box.ops, 1, 4);
  fly(flyer);
  const shot = play(box, 1);
  assert.equal(locked(shot, box.e.id), ground.id);
  assert.deepEqual(hitList(shot, box.e.id, ground.id), [800]);
  assert.deepEqual(hitList(shot, box.e.id, flyer.id), []);
  assert.equal(rounds(box.e), 1);
  box.e.ab[AMMO] = 0;
  const melee = again(box);
  assert.deepEqual(hitList(melee, box.e.id, flyer.id), [800]);
  assert.deepEqual(hitList(melee, box.e.id, ground.id), []);
});

test('[敌能-81] 阵地破坏者: a lone flying blocker spends nothing, and camouflage is not selected', () => {
  const lone = open('enemy_1216_cansld', foe('enemy_1216_cansld'), [[1, 2, false]]);
  fly(at(lone.ops, 1, 2));
  const none = play(lone, 1);
  assert.equal(hitList(none, lone.e.id).length, 0);
  assert.equal(locked(none, lone.e.id), -1);
  assert.equal(rounds(lone.e), 2);
  const hidden = open('enemy_1216_cansld', foe('enemy_1216_cansld'), [[1, 4, false]]);
  hide(at(hidden.ops, 1, 4));
  const missed = play(hidden, 1);
  assert.equal(hitList(missed, hidden.e.id).length, 0);
  assert.equal(rounds(hidden.e), 2);
});

test('[敌能-81] 阵地撕裂者: two 125% shots splash the square, then a 100% block hit', () => {
  const box = ring('enemy_1216_cansld_2');
  const blocker = at(box.ops, 1, 2);
  const eight = EIGHT.map(([row, col]) => at(box.ops, row, col));
  assert.equal(rounds(box.e), 2);
  const first = play(box, 1);
  sameDamage(first, box.e.id, [blocker, ...eight], 1250);
  assert.equal(locked(first, box.e.id), blocker.id);
  assert.equal(rounds(box.e), 1);
  sameDamage(again(box), box.e.id, [blocker, ...eight], 1250);
  assert.equal(rounds(box.e), 0);
  const melee = again(box);
  assert.deepEqual(hitList(melee, box.e.id), [1000]);
  assert.equal(rounds(box.e), 0);
});

test('[敌能-81] 阵地撕裂者: selects through camouflage, and neither shot nor melee hits a flyer', () => {
  const seen = open('enemy_1216_cansld_2', foe('enemy_1216_cansld_2'), [[1, 4, false]]);
  hide(at(seen.ops, 1, 4));
  const got = play(seen, 1);
  assert.deepEqual(hitList(got, seen.e.id, at(seen.ops, 1, 4).id), [1250]);
  assert.equal(rounds(seen.e), 1);
  const box = open('enemy_1216_cansld_2', foe('enemy_1216_cansld_2'), [[1, 2, false], [1, 4, false]]);
  const flyer = at(box.ops, 1, 2);
  const ground = at(box.ops, 1, 4);
  fly(flyer);
  const shot = play(box, 1);
  assert.equal(locked(shot, box.e.id), ground.id);
  assert.deepEqual(hitList(shot, box.e.id, flyer.id), []);
  box.e.ab[AMMO] = 0;
  const melee = again(box);
  assert.equal(hitList(melee, box.e.id).length, 0);
  assert.equal(rounds(box.e), 0);
});

/** @param {Box} box @param {Unit} u @param {number} full */
function heldFor(box, u, full) {
  assert.equal(copies(u, 'silence').length, 1);
  assert.equal(copies(u, 'shotbuffDisarm').length, 1);
  assert.equal(copies(u, 'silence')[0]?.left, full);
  assert.equal(copies(u, 'shotbuffDisarm')[0]?.left, full);
  assert.equal(attrs.statsOf(u).flags.silence, true);
  assert.equal(attrs.statsOf(u).flags.noAttack, true);
  const spent = attrs.intervalFrames(attrs.statsOf(box.e).bat, attrs.statsOf(box.e).aspd);
  const melee = again(box);
  assert.equal(copies(u, 'silence').length, 1);
  assert.equal(copies(u, 'shotbuffDisarm').length, 1);
  assert.equal(copies(u, 'silence')[0]?.left, full - spent);
  assert.equal(copies(u, 'shotbuffDisarm')[0]?.left, full - spent);
  assert.equal(rounds(box.e), 0);
  return melee;
}

test('[敌能-81] 寻路者信使: one 150% arts shot, 15s disarm and silence, then melee does not refresh them', () => {
  const box = open('enemy_1219_mtrbty', foe('enemy_1219_mtrbty'), [[1, 2, false], [1, 3, false]]);
  const blocker = at(box.ops, 1, 2);
  const beside = at(box.ops, 1, 3);
  const ev = play(box, 1);
  assert.deepEqual(hitList(ev, box.e.id, blocker.id), [900]);
  assert.deepEqual(hitList(ev, box.e.id, beside.id), []);
  assert.equal(shotCount(ev, box.e.id), 0);
  assert.equal(rounds(box.e), 0);
  const melee = heldFor(box, blocker, secondsToFrames(15));
  assert.deepEqual(hitList(melee, box.e.id), [600]);
});

test('[敌能-81] 寻路者信使: a clean operator comes before one already silenced or disarmed', () => {
  for (const kind of /** @type {const} */ (['silence', 'noAttack'])) {
    const box = open('enemy_1219_mtrbty', foe('enemy_1219_mtrbty'), [[1, 2, false], [1, 4, false]]);
    const blocker = at(box.ops, 1, 2);
    const other = at(box.ops, 1, 4);
    quiet(blocker, kind);
    const ev = play(box, 1);
    assert.equal(locked(ev, box.e.id), other.id, kind);
    assert.deepEqual(hitList(ev, box.e.id, other.id), [900]);
    assert.deepEqual(hitList(ev, box.e.id, blocker.id), []);
  }
  const box = open('enemy_1219_mtrbty', foe('enemy_1219_mtrbty'), [[1, 2, false], [1, 4, false]]);
  quiet(at(box.ops, 1, 2), 'silence');
  quiet(at(box.ops, 1, 4), 'silence');
  const ev = play(box, 1);
  assert.equal(locked(ev, box.e.id), at(box.ops, 1, 2).id);
});

test('[敌能-81] 万国信使，奥伦: one round, 10s, and the round does not come back', () => {
  const box = open('enemy_1219_mtrbty_2', oren(), [[1, 2, false]]);
  const blocker = at(box.ops, 1, 2);
  assert.equal(rounds(box.e), 1);
  const ev = play(box, 1);
  assert.deepEqual(hitList(ev, box.e.id, blocker.id), [1050]);
  assert.equal(shotCount(ev, box.e.id), 0);
  const melee = heldFor(box, blocker, secondsToFrames(10));
  assert.deepEqual(hitList(melee, box.e.id), [700]);
});

test('[敌能-81] 甜品商: 250% only while blocked, and the shot stays ranged, flyer included', () => {
  const far = open('enemy_1217_rescar', foe('enemy_1217_rescar'), [[1, 4, false]]);
  assert.equal(far.e.blockedBy, -1);
  const out = play(far, 12);
  assert.deepEqual(hitList(out, far.e.id), [500]);
  assert.equal(shotCount(out, far.e.id), 1);
  const box = open('enemy_1217_rescar', foe('enemy_1217_rescar'), [[1, 2, false]]);
  const blocker = at(box.ops, 1, 2);
  assert.equal(box.e.blockedBy, blocker.id);
  const ev = play(box, 1);
  assert.deepEqual(hitList(ev, box.e.id, blocker.id), [1250]);
  assert.equal(shotCount(ev, box.e.id), 1);
  const air = open('enemy_1217_rescar', foe('enemy_1217_rescar'), [[1, 2, false]]);
  const flyer = at(air.ops, 1, 2);
  fly(flyer);
  const hit = play(air, 1);
  assert.equal(air.e.blockedBy, flyer.id);
  assert.deepEqual(hitList(hit, air.e.id, flyer.id), [1250]);
  assert.equal(shotCount(hit, air.e.id), 1);
});

test('[敌能-81] 知名甜品商: blocked melee at 250%; unblocked ranged at 100%; neither hits a flyer', () => {
  const box = open('enemy_1217_rescar_2', foe('enemy_1217_rescar_2'), [[1, 2, false], [1, 3, false]]);
  const blocker = at(box.ops, 1, 2);
  const beside = at(box.ops, 1, 3);
  fly(beside);
  const ev = play(box, 1);
  assert.equal(box.e.blockedBy, blocker.id);
  assert.deepEqual(hitList(ev, box.e.id, blocker.id), [1500]);
  assert.deepEqual(hitList(ev, box.e.id, beside.id), []);
  assert.equal(shotCount(ev, box.e.id), 0);
  const far = open('enemy_1217_rescar_2', foe('enemy_1217_rescar_2'), [[1, 4, false], [1, 3, false]]);
  const ground = at(far.ops, 1, 4);
  const wing = at(far.ops, 1, 3);
  fly(wing);
  const out = play(far, 12);
  assert.equal(far.e.blockedBy, -1);
  assert.deepEqual(hitList(out, far.e.id, ground.id), [600]);
  assert.deepEqual(hitList(out, far.e.id, wing.id), []);
  assert.equal(shotCount(out, far.e.id), 1);
  const held = open('enemy_1217_rescar_2', foe('enemy_1217_rescar_2'), [[1, 2, false], [1, 4, false]]);
  fly(at(held.ops, 1, 2));
  const none = play(held, 12);
  assert.equal(hitList(none, held.e.id).length, 0);
  assert.equal(shotCount(none, held.e.id), 0);
});

test('[敌能-81] [敌能-82] unread shotbuff users stay uncovered; act1multi_07 loses shotbuff and BornCar', () => {
  const sniper = { 'attack@headshot_atk_scale': 2, 'attack@headshot_sp': -1 };
  const caster = { 'attack@headshot_ep_damage_ratio': 1.5, 'attack@headshot_sp': -1 };
  const duel = { 'attack@headshot_atk_scale': 1.5, 'attack@headshot_disarmed_duration': 15, 'attack@headshot_sp': -1, 'attack@headshot_trapdamage': 5000 };
  assert.ok(gap('enemy_1213_mtrsnp', body({ shotbuff: sniper })).includes('shotbuff'));
  assert.ok(gap('enemy_1213_mtrsnp_2', body({ shotbuff: { ...sniper, page: 1 } })).includes('shotbuff'));
  assert.ok(gap('enemy_1214_mtrmgc', body({ shotbuff: caster })).includes('shotbuff'));
  assert.ok(gap('enemy_1214_mtrmgc_2', body({ shotbuff: caster })).includes('shotbuff'));
  assert.ok(gap('enemy_15045_dqrbty', body({ shotbuff: duel })).includes('shotbuff'));
  for (const key of READ) {
    const def = key === 'enemy_1219_mtrbty_2' ? oren() : foe(key);
    assert.equal(extra(key, def).page, 1, key);
    assert.equal(gap(key, def).includes('shotbuff'), false, key);
  }
  assert.equal(extra('enemy_1216_cansld').ammo, 2);
  assert.equal(extra('enemy_1216_cansld_2').see, 1);
  assert.equal(extra('enemy_1219_mtrbty').ammo, 1);
  assert.equal(extra('enemy_1219_mtrbty_2', oren()).ammo, 1);
  assert.equal(extra('enemy_1217_rescar').ammo, undefined);
  assert.equal(extra('enemy_1217_rescar_2').melee, 1);
  // 敌能-82 covers the dealers' BornCar.
  assert.deepEqual(cartBb('enemy_1217_rescar'), { max: 3, delay: 0.1 });
  assert.equal(Object.hasOwn(foeBehaviors, 'BornCar'), true);
  assert.equal(gap('enemy_1217_rescar', foe('enemy_1217_rescar')).includes('BornCar'), false);
  assert.throws(() => levelAt('act1multi_07', 'NORMAL', () => ({}), { act1multi_07: act }), (err) => {
    assert.ok(err instanceof RangeError);
    assert.doesNotMatch(err.message, /BornCar/);
    assert.doesNotMatch(err.message, /shotbuff/);
    return true;
  });
});
