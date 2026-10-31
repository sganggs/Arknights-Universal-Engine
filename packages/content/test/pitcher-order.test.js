// 长臂投手's 攻击优先度 (docs/spec/foes.md 敌能-123): a unit of ours on a facility first, then the facilities — the raw
// box too, though it cannot be selected —, then the rest. Records come from the fortress levels; the battle itself is
// not a fortress match, so the platform's tile and the gym's buff stay off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, devices, facilities } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelAt, levelContent } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const PITCH = 'enemy_4010_mubsbl';
const PITCH2 = 'enemy_4010_mubsbl_2';
const IRON = 'enemy_4009_murgby';
const IRON2 = 'enemy_4009_murgby_2';
const WORK = 'trap_205_mufrfm';
const PLATFORM = 'trap_207_mufrwl';

const rm = levelContent('act1multi_fortress_rm01', 'NORMAL').enemies;
const rm4 = levelContent('act1multi_fortress_rm01', 'FOUR_STAR').enemies;
const hard = levelContent('act1multi_fortress_hard-01', 'NORMAL').enemies;
/** Profiled device records (守御-3): `.facility` is set. */
const prof = levelAt('act1multi_fortress_rm01', 'NORMAL').devices;

/**
 * The 投手 held at (2, 1) on the tiny map with its attack ready; operators deal no damage.
 * @param {any} def @param {(c: any) => void} [tweak]
 */
function bring(def, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [PITCH]: structuredClone(def) };
  c.behaviors = skeletonContent.behaviors;
  c.devices = prof;
  c.level.waves = [oneWave([spawnAt(0, PITCH)])];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  for (const op of Object.values(c.operators)) {
    const row = /** @type {any} */ (op);
    row.atk = 0;
    row.maxHp = 1e7;
    row.cost = 0;
  }
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === PITCH));
  e.x = 2;
  e.y = 1;
  status.applyStatus(e, 'root', {});
  return { c, w, e };
}

/** A facility of `key` on a tile: `level` 0 is the raw box. @param {World} w @param {any} c @param {string} key @param {[number, number]} at row, col @param {number} level */
function facility(w, c, key, [row, col], level) {
  assert.equal(devices.spawnDevice(w, c, key, row, col), true, key);
  const dev = /** @type {Unit} */ (w.units.findLast((u) => u.key === key));
  facilities.setUpFacilities(w, c);
  const f = facilities.facilityOf(c, dev);
  if (!f) throw new Error(`no facility record for ${key}`);
  if (level > 0) facilities.setLevel(w, c, dev, f, level);
  return dev;
}

/** @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col @returns {Unit} */
function deploy(w, c, op, row, col) {
  step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
  const u = w.units.findLast((x) => x.key === op);
  if (!u) throw new Error(op);
  return u;
}

/** The target of the attack it starts now. @param {World} w @param {any} c @param {Unit} e */
function firstTarget(w, c, e) {
  e.atkCd = 0;
  e.swing = null;
  const got = step(w, c).filter((x) => x.type === 'attack' && x.id === e.id).map((x) => /** @type {number} */ (/** @type {any} */ (x).target));
  assert.equal(got.length, 1);
  return got[0];
}

test('[敌能-123] the raw box in reach comes before an operator, though it cannot be selected; the box takes nothing', () => {
  const { c, w, e } = bring(rm[PITCH]);
  const box = facility(w, c, WORK, [1, 4], 0);
  const sniper = deploy(w, c, 'sniper', 0, 2);
  assert.equal(box.fac?.level, 0);
  assert.equal(firstTarget(w, c, e), box.id);
  for (let i = 0; i < 120; i++) step(w, c);
  assert.equal(box.hp, box.maxHp);
  assert.equal(box.fac?.level, 0);
  assert.equal(sniper.hp, sniper.maxHp, 'the box keeps the attack');
});

test('[敌能-123] without the marker the raw box is not a candidate: the operator is attacked', () => {
  const plain = /** @type {any} */ (structuredClone(rm[PITCH]));
  delete plain.talents.moduleFirst;
  const { c, w, e } = bring(plain);
  const sniper = deploy(w, c, 'sniper', 0, 2);
  facility(w, c, WORK, [1, 4], 0);
  assert.equal(firstTarget(w, c, e), sniper.id);
});

test('[敌能-123] a unit on a facility comes first, then the facilities, then the rest, whatever was deployed last', () => {
  const { c, w, e } = bring(rm[PITCH]);
  const platform = facility(w, c, PLATFORM, [0, 2], 1);
  const on = deploy(w, c, 'sniper', 0, 2);
  assert.deepEqual([Math.round(on.x), Math.round(on.y)], [platform.x, platform.y]);
  const built = facility(w, c, WORK, [1, 4], 1);
  const last = deploy(w, c, 'sniper', 2, 3);
  assert.equal(firstTarget(w, c, e), on.id, 'on the platform');
  on.hp = 0;
  const next = firstTarget(w, c, e);
  assert.ok([platform.id, built.id].includes(next), 'a facility before the operator deployed last');
  assert.notEqual(next, last.id);
});

test('[敌能-123] a facility out of reach is not a candidate; a built one in reach still comes first', () => {
  const { c, w, e } = bring(rm[PITCH]);
  e.x = 0;
  const sniper = deploy(w, c, 'sniper', 0, 2);
  facility(w, c, WORK, [1, 5], 0);
  assert.equal(firstTarget(w, c, e), sniper.id, 'the box 5 tiles away');
  const near = facility(w, c, PLATFORM, [2, 2], 1);
  assert.equal(firstTarget(w, c, e), near.id);
});

test('[敌能-123] silence does not stop it', () => {
  const { c, w, e } = bring(rm[PITCH]);
  deploy(w, c, 'sniper', 0, 2);
  const box = facility(w, c, WORK, [1, 4], 0);
  status.applyStatus(e, 'silence', {});
  assert.equal(attrs.statsOf(e).flags.silence, true);
  assert.equal(firstTarget(w, c, e), box.id);
});

test('[敌能-123] both 投手 levels carry it in both fortress levels; 铁头前锋 does not', () => {
  for (const [enemies, key] of /** @type {[Record<string, any>, string][]} */ ([[rm, PITCH], [rm4, PITCH2], [hard, PITCH2]])) {
    assert.deepEqual(enemies[key].talents.moduleFirst, {}, key);
  }
  for (const [enemies, key] of /** @type {[Record<string, any>, string][]} */ ([[rm, IRON], [rm4, IRON2], [hard, IRON2]])) {
    assert.equal(enemies[key].talents.moduleFirst, undefined, key);
  }
});
