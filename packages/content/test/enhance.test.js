// 铁头前锋 and 长臂投手 attacking a facility (docs/spec/foes.md 敌能-122). The records are
// act1multi_fortress_rm01's, including the uncovered `boomb` skill, so that skill's no-op runs too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, damage, devices, facilities } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import fort from '../data/levels/act1multi_fortress_rm01.json' with { type: 'json' };
import { skeletonContent, levelAt, levelContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const HEAD = 'enemy_4009_murgby';
const HEAD2 = 'enemy_4009_murgby_2';
const PITCH = 'enemy_4010_mubsbl';
const PITCH2 = 'enemy_4010_mubsbl_2';
const BLOOD = 'enemy_1103_wdkght_2';
const FOUR = [HEAD, HEAD2, PITCH, PITCH2];
const KINDS = ['trap_205_mufrfm', 'trap_206_mufrbk', 'trap_207_mufrwl', 'trap_208_mufrst', 'trap_209_mufrbs'];
const WORK = 'trap_205_mufrfm';

/** Profiled device records (守御-3): `.facility` is set. The battle itself is not a fortress match. */
const prof = levelAt('act1multi_fortress_rm01', 'NORMAL').devices;

/** A copy of the level's record, extras merged. The file's object stays shared. @param {string} key @returns {EnemyDef} */
function live(key) {
  const raw = /** @type {EnemyDef} */ (/** @type {any} */ (fort).enemies[key]);
  const merged = withFoeExtras(key, raw);
  return { ...merged, talents: structuredClone(merged.talents ?? {}), ...(merged.skills ? { skills: structuredClone(merged.skills) } : {}) };
}

/**
 * The enemy has spawned, and the road is still empty, so a ranged one does not shoot on the way in.
 * @param {string} key @param {(c: any) => void} [tweak]
 */
function bring(key, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: live(key) };
  c.behaviors = skeletonContent.behaviors;
  c.devices = prof;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === key));
  return { c, w, e };
}

/**
 * `key` on the road tile. `level` null leaves the record as a device; a number is a facility at that level.
 * `w.fortress` stays unset, so the gym's buff and the platform's tile do not turn on.
 * @param {World} w @param {any} c @param {string} key @param {number | null} level
 */
function place(w, c, key, level) {
  assert.equal(devices.spawnDevice(w, c, key, 1, 2), true, key);
  const dev = /** @type {Unit} */ (w.units.find((u) => u.key === key));
  if (level === null) return dev;
  facilities.setUpFacilities(w, c);
  if (level > 0) {
    const f = facilities.facilityOf(c, dev);
    if (!f) throw new Error(`no facility record for ${key}`);
    facilities.setLevel(w, c, dev, f, level);
  }
  return dev;
}

/**
 * Pins the enemy on the device and takes one attack step. The attack lands this frame (no clip; a shot at distance 0 arrives).
 * @param {string} enemyKey @param {string} deviceKey @param {number | null} level
 * @param {(e: Unit, dev: Unit) => void} [prep]
 */
function strike(enemyKey, deviceKey, level, prep) {
  const { c, w, e } = bring(enemyKey);
  assert.equal(w.fortress, undefined);
  const dev = place(w, c, deviceKey, level);
  prep?.(e, dev);
  e.x = dev.x;
  e.y = dev.y;
  status.applyStatus(e, 'root', {});
  e.atkCd = 0;
  const ev = step(w, c);
  return {
    e, dev, ev,
    hits: ev.filter((x) => x.type === 'hit' && x.id === e.id),
    attacks: ev.filter((x) => x.type === 'attack' && x.id === e.id),
  };
}

test('[敌能-122] 铁头前锋 hits each facility kind for 2400 and keeps its attack', () => {
  for (const key of KINDS) {
    const got = strike(HEAD, key, 1);
    assert.equal(got.dev.fac?.level, 1, key);
    assert.equal(got.hits.length, 1, key);
    assert.equal(got.hits[0].target, got.dev.id, key);
    assert.equal(got.hits[0].damage, 2400, key);
    assert.equal(attrs.statsOf(got.e).atk, 1600, key);
    assert.equal(got.e.buffs.some((b) => b.key === 'blood'), false, key);
  }
});

test('[敌能-122] 长臂投手 hits a facility for 1400', () => {
  const got = strike(PITCH, WORK, 1);
  assert.equal(got.hits.length, 1);
  assert.equal(got.hits[0].target, got.dev.id);
  assert.equal(got.hits[0].damage, 1400);
  assert.equal(attrs.statsOf(got.e).atk, 700);
});

test('[敌能-122] the elite pair uses 150% and 200% of its own attack', () => {
  const head = strike(HEAD2, 'trap_206_mufrbk', 1);
  const pitch = strike(PITCH2, 'trap_208_mufrst', 1);
  assert.equal(head.hits.length, 1);
  assert.equal(head.hits[0].damage, 2625);
  assert.equal(attrs.statsOf(head.e).atk, 1750);
  assert.equal(pitch.hits.length, 1);
  assert.equal(pitch.hits[0].damage, 1600);
  assert.equal(attrs.statsOf(pitch.e).atk, 800);
});

test('[敌能-122] an operator takes the normal multiplier', () => {
  for (const [key, dmg] of /** @type {const} */ ([[HEAD, 1600], [PITCH, 700], [HEAD2, 1750], [PITCH2, 800]])) {
    const { c, w, e } = bring(key, (cc) => {
      cc.operators.guard.def = 0;
      cc.operators.guard.atk = 0;
      cc.operators.guard.maxHp = 100000;
    });
    e.x = 2;
    e.y = 1;
    status.applyStatus(e, 'root', {});
    e.atkCd = 0;
    const ev = step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
    const guard = w.units.find((u) => u.key === 'guard');
    assert.ok(guard, key);
    assert.equal(e.blockedBy, guard.id, key);
    const hits = ev.filter((x) => x.type === 'hit' && x.id === e.id);
    assert.equal(hits.length, 1, key);
    assert.equal(hits[0].target, guard.id, key);
    assert.equal(hits[0].damage, dmg, key);
  }
});

test('[敌能-122] a builder and a rubble pile stay at the normal multiplier', () => {
  for (const key of ['trap_166_muwork', 'trap_203_mufrprn']) {
    const got = strike(PITCH, key, null);
    assert.equal(got.dev.fac, undefined, key);
    assert.equal(got.hits.length, 1, key);
    assert.equal(got.hits[0].damage, 700, key);
  }
});

test('[敌能-122] a level-0 facility is not hit', () => {
  for (const key of [HEAD, PITCH]) {
    const got = strike(key, WORK, 0);
    assert.equal(got.dev.fac?.level, 0, key);
    assert.equal(got.attacks.length, 0, key);
    assert.equal(got.hits.length, 0, key);
    assert.equal(got.dev.hp, got.dev.maxHp, key);
  }
});

test('[敌能-122] silence does not stop the facility multiplier', () => {
  const got = strike(HEAD, WORK, 1, (e) => { status.applyStatus(e, 'silence', {}); });
  assert.equal(attrs.statsOf(got.e).flags.silence, true);
  assert.equal(got.hits.length, 1);
  assert.equal(got.hits[0].damage, 2400);
});

test('[敌能-122] an invincible facility is attacked and takes 0', () => {
  const got = strike(HEAD, WORK, 1, (_e, dev) => { status.applyStatus(dev, 'invincible', {}); });
  assert.equal(attrs.statsOf(got.dev).flags.invincible, true);
  assert.equal(got.attacks.length, 1);
  assert.equal(got.hits.length, 0);
  assert.equal(got.dev.hp, got.dev.maxHp);
});

test('[敌能-122] a dodged hit deals 0', () => {
  const got = strike(HEAD, WORK, 1, (_e, dev) => { buffs.addBuff(dev, buffs.makeBuff({ key: 'testDodge', mods: { dodgePhys: 1 } })); });
  assert.equal(got.attacks.length, 1);
  assert.equal(got.hits.length, 0);
  assert.equal(got.dev.hp, got.dev.maxHp);
});

test('[敌能-122] [敌能-71] 沸血 hits a facility at its attack and gains no layer from the hit', () => {
  assert.equal(/** @type {any} */ (fort).enemies[BLOOD].atk, 650);
  const got = strike(BLOOD, WORK, 1);
  assert.equal(got.hits.length, 1);
  assert.equal(got.hits[0].damage, 650);
  assert.equal(got.e.buffs.some((b) => b.key === 'blood'), false);
  assert.equal(attrs.statsOf(got.e).atk, 650);
});

test('[敌能-122] [敌能-71] 沸血 still gains a layer when another enemy is knocked down', () => {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [BLOOD]: live(BLOOD), food: { name: 'food', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 1 } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, BLOOD), spawnAt(0, 'food')])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const k = /** @type {Unit} */ (w.units.find((u) => u.key === BLOOD));
  damage.setHp(/** @type {Unit} */ (w.units.find((u) => u.key === 'food')), 0);
  step(w, c);
  assert.equal(k.buffs.find((b) => b.key === 'blood')?.stacks, 1);
  assert.equal(attrs.statsOf(k).atk, 650 * 1.1);
  assert.equal(attrs.statsOf(k).aspd, 105);
});

test('[敌能-122] a knockdown does not give 铁头 a boiling layer', () => {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [HEAD]: live(HEAD), food: { name: 'food', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 1 } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, HEAD), spawnAt(0, 'food')])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === HEAD));
  damage.setHp(/** @type {Unit} */ (w.units.find((u) => u.key === 'food')), 0);
  step(w, c);
  assert.equal(e.buffs.some((b) => b.key === 'blood'), false);
  assert.equal(attrs.statsOf(e).atk, 1600);
});

test('[敌能-122] [关卡-2] [关卡-8] the four are covered; 沸血 stays its own shape; boomb stays uncovered', () => {
  for (const key of FOUR) {
    const gaps = uncoveredAbilities([withFoeExtras(key, /** @type {EnemyDef} */ (/** @type {any} */ (fort).enemies[key]))]);
    assert.equal(gaps.includes('enhance'), false, key);
    assert.equal(gaps.includes('boomb'), true, key);
  }
  const row = (/** @type {Record<string, Record<string, number>>} */ talents) => uncoveredAbilities([/** @type {any} */ ({ talents })]);
  assert.deepEqual(row({ enhance: { atk_scale: 1.5 } }), []);
  assert.deepEqual(row({ enhance: { atk: 0.1, attack_speed: 5, max_stack_cnt: 10, page: 1 } }), []);
  assert.deepEqual(row({ enhance: { atk: 0.1, attack_speed: 5, max_stack_cnt: 10 } }), ['enhance']);
  assert.deepEqual(row({ enhance: { magic_resistance: 50, atk: 700, def: 1000, base_attack_time: -1.5, move_speed: 0.3 } }), ['enhance']);
  assert.deepEqual(row({ enhance: { atk_scale: 1.5, page: 1 } }), ['enhance']);
  assert.deepEqual(/** @type {any} */ (fort).enemies[HEAD].talents.enhance, { atk_scale: 1.5 });
  assert.deepEqual(/** @type {any} */ (fort).enemies[HEAD2].talents.enhance, { atk_scale: 1.5 });
  assert.deepEqual(/** @type {any} */ (fort).enemies[PITCH].talents.enhance, { atk_scale: 2 });
  assert.deepEqual(/** @type {any} */ (fort).enemies[PITCH2].talents.enhance, { atk_scale: 2 });
  for (const id of ['act1multi_fortress_rm01', 'act1multi_fortress_hard-01']) {
    for (const diff of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
      const at = levelAt(id, diff), played = levelContent(id, diff);
      assert.equal(at.level.uncovered?.includes('enhance'), false, `${id} ${diff}`);
      assert.equal(played.level.uncovered?.includes('boomb'), true, `${id} ${diff}`);
      const mine = FOUR.filter((k) => played.enemies[k]);
      assert.ok(mine.length > 0, `${id} ${diff}`);
      for (const k of mine) {
        const e = /** @type {any} */ (played.enemies[k]);
        assert.equal(e.talents.enhance.atk_scale, k.includes('murgby') ? 1.5 : 2, k);
        assert.equal((e.skills ?? []).some((/** @type {{ key: string }} */ s) => s.key === 'boomb'), false, k);
      }
    }
  }
});
