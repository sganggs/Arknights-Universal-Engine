// The howling and boiling knight orders (docs/spec/foes.md 敌能-71) on the tiny map. Records are built here; the level
// files' blackboards are checked against the same numbers. 沸血学徒 is not in a loaded level.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, damage, bus } from '@aue/sim';
import { secondsToFrames } from '@aue/math';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import act07 from '../data/levels/act1multi_07.json' with { type: 'json' };
import fort from '../data/levels/act1multi_fortress_rm01.json' with { type: 'json' };
import { skeletonContent, matchContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const ARMOUR = { duration: 30, def: 3000, magic_resistance: 95 };
const STACK = { atk: 0.1, attack_speed: 5, max_stack_cnt: 10 };
const BUILD = { elite: 2, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 };

/** @param {Record<string, any>} enemies @param {any[]} spawns @param {(c: any) => void} [tweak] */
function open(enemies, spawns, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = enemies;
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(spawns)];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w };
}

/** @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** @param {World} w @param {string} key @returns {Unit[]} */
const ofKey = (w, key) => w.units.filter((u) => u.key === key);
/** @param {Unit} u @param {number} x @param {number} y */
const pin = (u, x, y) => { u.x = x; u.y = y; status.applyStatus(u, 'root', {}); };
/** @param {any[]} events @param {number} id */
const hitsOf = (events, id) => events.filter((ev) => ev.type === 'hit' && ev.id === id);
/** @param {Unit} u @param {number} left */
const silence = (u, left) => buffs.addBuff(u, buffs.makeBuff({ key: 'silence', flags: { silence: true }, left }));
/** @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col */
const deploy = (w, c, op, row, col) => step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
/** @param {World} w @param {string} key @returns {Unit} */
const opOf = (w, key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));
/** @param {Unit} u */
const howl = (u) => u.buffs.find((b) => b.key === 'howl');
/** @param {Unit} u */
const layer = (u) => u.buffs.find((b) => b.key === 'blood');

/** @param {string} id @param {number} duration @param {number} [res] */
function howling(id, duration, res = 0) {
  return withFoeExtras(id, {
    name: id, maxHp: 2800, atk: 300, def: 100, res, moveSpeed: 0.9, baseAttackTime: 2.4,
    applyWay: 'RANGED', rangeRadius: 2, motion: 'WALK', talents: { buff: { ...ARMOUR, duration } },
  });
}

/** @param {string} key @param {number} atk */
const boiling = (key, atk) => withFoeExtras(key, {
  name: key, maxHp: 9000, atk, def: 800, res: 0, moveSpeed: 0.7, baseAttackTime: 2.3, applyWay: 'MELEE', rangeRadius: 0,
  talents: { enhance: { ...STACK } },
});

/** @param {string} key @param {Record<string, unknown>} [more] */
const fodder = (key, more = {}) => ({ name: key, maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 1, ...more });

/** Hit events of `id` within 12 frames. @param {World} w @param {any} c @param {number} id */
function untilHit(w, c, id) {
  /** @type {any[]} */
  const got = [];
  for (let i = 0; i < 12 && got.length === 0; i++) got.push(...hitsOf(step(w, c), id));
  return got;
}

/** A flying blocker and a ground sniper: the shot goes to the sniper. @param {string} id @param {number} duration */
function refusesFlyers(id, duration) {
  const { c, w } = open({ [id]: howling(id, duration) }, [spawnAt(0, id)], (cc) => { cc.operators.guard.motion = 'FLY'; });
  const e = ofKey(w, id)[0];
  pin(e, 2, 1);
  e.atkCd = 0;
  const blocked = deploy(w, c, 'guard', 1, 2);
  const guard = opOf(w, 'guard');
  assert.equal(e.blockedBy, guard.id);
  assert.equal(hitsOf(blocked, e.id).length, 0);
  deploy(w, c, 'sniper', 2, 2);
  const got = untilHit(w, c, e.id);
  assert.equal(got.length, 1);
  assert.equal(got[0].target, opOf(w, 'sniper').id);
  assert.equal(guard.hp, guard.maxHp);
}

test('[敌能-71] armour of 30s is on from appearance and gone after', () => {
  const id = 'enemy_1101_plkght';
  const { c, w } = open({ [id]: howling(id, 30) }, [spawnAt(0, id)]);
  const e = ofKey(w, id)[0];
  pin(e, 2, 1);
  const d = secondsToFrames(30);
  assert.equal(howl(e)?.left, d - 1);
  assert.equal(e.buffs.filter((b) => b.key === 'howl').length, 1);
  assert.equal(attrs.statsOf(e).def, 3100);
  assert.equal(attrs.statsOf(e).res, 95);
  run(w, c, d - 2);
  assert.equal(howl(e)?.left, 1);
  assert.equal(attrs.statsOf(e).def, 3100);
  step(w, c);
  assert.equal(howl(e), undefined);
  assert.equal(attrs.statsOf(e).def, 100);
  assert.equal(attrs.statsOf(e).res, 0);
});

test('[敌能-71] 瑟奇亚克\'s armour lasts 60s and is then gone', () => {
  const id = 'enemy_1101_plkght_3';
  const { c, w } = open({ [id]: howling(id, 60) }, [spawnAt(0, id)]);
  const e = ofKey(w, id)[0];
  pin(e, 2, 1);
  const d = secondsToFrames(60);
  assert.equal(howl(e)?.left, d - 1);
  assert.equal(attrs.statsOf(e).def, 3100);
  assert.equal(attrs.statsOf(e).res, 95);
  run(w, c, d - 2);
  assert.equal(howl(e)?.left, 1);
  step(w, c);
  assert.equal(howl(e), undefined);
  assert.equal(attrs.statsOf(e).def, 100);
  assert.equal(attrs.statsOf(e).res, 0);
});

test('[敌能-71] RES above 100 is capped at 100', () => {
  const id = 'enemy_1101_plkght_2';
  const { w } = open({ [id]: howling(id, 30, 20) }, [spawnAt(0, id)]);
  assert.equal(attrs.statsOf(ofKey(w, id)[0]).res, 100);
});

test('[敌能-71] silence does not remove the armour', () => {
  const id = 'enemy_1101_plkght';
  const { c, w } = open({ [id]: howling(id, 30) }, [spawnAt(0, id)]);
  const e = ofKey(w, id)[0];
  silence(e, 5);
  step(w, c);
  assert.equal(attrs.statsOf(e).flags.silence, true);
  assert.equal(attrs.statsOf(e).def, 3100);
  assert.equal(attrs.statsOf(e).res, 95);
});

test('[敌能-71] 呼啸骑士团 does not attack a flying unit', () => {
  refusesFlyers('enemy_1101_plkght', 30);
});

test('[敌能-71] 瑟奇亚克 does not attack a flying unit', () => {
  refusesFlyers('enemy_1101_plkght_3', 60);
});

test('[敌能-71] 不会攻击飞行单位 is the noFly extra on the three howling knights', () => {
  for (const id of ['enemy_1101_plkght', 'enemy_1101_plkght_2', 'enemy_1101_plkght_3']) {
    const d = howling(id, 30);
    assert.deepEqual(d.talents?.noFly, {});
    assert.deepEqual(uncoveredAbilities([d]), []);
  }
});

test('[敌能-71] one enemy death adds 10% ATK and 5 attack speed on each of the three pages', () => {
  for (const [id, atk] of /** @type {const} */ ([['enemy_1103_wdkght', 500], ['enemy_1103_wdkght_2', 650], ['enemy_1103_wdkght_3', 900]])) {
    const { c, w } = open({ [id]: boiling(id, atk), food: fodder('food') }, [spawnAt(0, id), spawnAt(0, 'food')]);
    const k = ofKey(w, id)[0];
    damage.setHp(ofKey(w, 'food')[0], 0);
    step(w, c);
    assert.equal(layer(k)?.stacks, 1);
    assert.equal(layer(k)?.left, -1);
    assert.equal(attrs.statsOf(k).atk, atk * 1.1);
    assert.equal(attrs.statsOf(k).aspd, 105);
  }
});

test('[敌能-71] two deaths in one frame add two layers', () => {
  const id = 'enemy_1103_wdkght';
  const { c, w } = open({ [id]: boiling(id, 500), a: fodder('a'), b: fodder('b') }, [spawnAt(0, id), spawnAt(0, 'a'), spawnAt(0, 'b')]);
  const k = ofKey(w, id)[0];
  damage.setHp(ofKey(w, 'a')[0], 0);
  damage.setHp(ofKey(w, 'b')[0], 0);
  step(w, c);
  assert.equal(layer(k)?.stacks, 2);
  assert.equal(attrs.statsOf(k).aspd, 110);
  assert.equal(attrs.statsOf(k).atk, 600);
});

test('[敌能-71] layers stop at 10', () => {
  const id = 'enemy_1103_wdkght_2';
  const ids = Array.from({ length: 12 }, (_, i) => `f${i}`);
  /** @type {Record<string, any>} */
  const enemies = { [id]: boiling(id, 650) };
  for (const f of ids) enemies[f] = fodder(f);
  const { c, w } = open(enemies, [spawnAt(0, id), ...ids.map((f) => spawnAt(0, f))]);
  const k = ofKey(w, id)[0];
  for (const f of ids.slice(0, 11)) damage.setHp(ofKey(w, f)[0], 0);
  step(w, c);
  assert.equal(layer(k)?.stacks, 10);
  assert.equal(attrs.statsOf(k).atk, 1300);
  assert.equal(attrs.statsOf(k).aspd, 150);
  damage.setHp(ofKey(w, 'f11')[0], 0);
  step(w, c);
  assert.equal(layer(k)?.stacks, 10);
  assert.equal(attrs.statsOf(k).atk, 1300);
});

test('[敌能-71] reaching the goal does not add a layer', () => {
  const id = 'enemy_1103_wdkght';
  const { c, w } = open({ [id]: boiling(id, 500), leak: fodder('leak') }, [spawnAt(0, id), spawnAt(0, 'leak')]);
  const k = ofKey(w, id)[0];
  pin(k, 2, 1);
  const e = ofKey(w, 'leak')[0];
  e.x = 1; e.y = 1; e.leg = 2; e.path = []; e.pt = 0;
  const life = w.players[0].life;
  for (let i = 0; i < 400 && w.players[0].life === life; i++) step(w, c);
  assert.ok(w.players[0].life < life);
  assert.equal(w.units.includes(e), false);
  assert.equal(layer(k), undefined);
});

test('[敌能-71] a neutral death does not add a layer', () => {
  const id = 'enemy_1103_wdkght_3';
  const { c, w } = open({
    [id]: boiling(id, 900), n: fodder('n', { neutral: true }), f: fodder('f'),
  }, [spawnAt(0, id), spawnAt(0, 'n'), spawnAt(0, 'f')]);
  const k = ofKey(w, id)[0];
  damage.setHp(ofKey(w, 'n')[0], 0);
  step(w, c);
  assert.equal(layer(k), undefined);
  damage.setHp(ofKey(w, 'f')[0], 0);
  step(w, c);
  assert.equal(layer(k)?.stacks, 1);
  assert.equal(attrs.statsOf(k).atk, 900 * 1.1);
});

test('[敌能-71] its own death does not add a layer', () => {
  const id = 'enemy_1103_wdkght';
  const { c, w } = open({ [id]: boiling(id, 500) }, [spawnAt(0, id, { count: 2 })]);
  const [dead, live] = ofKey(w, id);
  let own = -1;
  bus.on(w, 'death', (ev) => { if (ev.unit === dead) own = layer(dead)?.stacks ?? 0; }, { priority: -1 });
  damage.setHp(dead, 0);
  step(w, c);
  assert.equal(own, 0);
  assert.equal(w.units.includes(dead), false);
  assert.equal(layer(live)?.stacks, 1);
});

test('[敌能-71] deaths before the knight is on the field do not count', () => {
  const id = 'enemy_1103_wdkght_2';
  const { c, w } = open({ [id]: boiling(id, 650), f: fodder('f') }, [spawnAt(0, 'f'), spawnAt(2, id)]);
  assert.equal(ofKey(w, id).length, 0);
  damage.setHp(ofKey(w, 'f')[0], 0);
  step(w, c);
  for (let i = 0; i < 120 && ofKey(w, id).length === 0; i++) step(w, c);
  const k = ofKey(w, id)[0];
  assert.ok(k);
  assert.equal(layer(k), undefined);
});

test('[敌能-71] silence does not stop a layer', () => {
  const id = 'enemy_1103_wdkght';
  const { c, w } = open({ [id]: boiling(id, 500), f: fodder('f') }, [spawnAt(0, id), spawnAt(0, 'f')]);
  const k = ofKey(w, id)[0];
  silence(k, 30);
  damage.setHp(ofKey(w, 'f')[0], 0);
  step(w, c);
  assert.equal(attrs.statsOf(k).flags.silence, true);
  assert.equal(layer(k)?.stacks, 1);
  assert.equal(attrs.statsOf(k).aspd, 105);
});

test('[敌能-71] [关卡-2] other buff and enhance shapes, and these without the page marker (保鲜膜骑士, 劈柴骑士), stay uncovered', () => {
  const row = (/** @type {Record<string, Record<string, number>>} */ talents) => uncoveredAbilities([/** @type {any} */ ({ talents })]);
  assert.deepEqual(row({ buff: { duration: 20, attack_speed: 100, def: 0.5 } }), ['buff']);
  // `{ atk_scale }` is 敌能-122, covered there. This list is the shapes that stay 敌能-71's gap.
  assert.deepEqual(row({ enhance: { magic_resistance: 50, atk: 700, def: 1000, base_attack_time: -1.5, move_speed: 0.3 } }), ['enhance']);
  assert.deepEqual(row({ buff: { ...ARMOUR }, enhance: { ...STACK } }), ['buff', 'enhance']);
  assert.deepEqual(row({ buff: { ...ARMOUR, page: 1 }, enhance: { ...STACK, page: 1 } }), []);
  const id = 'drone';
  const { w } = open({ [id]: { name: id, maxHp: 100, atk: 0, def: 50, res: 0, moveSpeed: 1, talents: { buff: { duration: 20, attack_speed: 100, def: 0.5 } } } }, [spawnAt(0, id)]);
  const e = ofKey(w, id)[0];
  assert.equal(attrs.statsOf(e).def, 50);
  assert.equal(e.buffs.some((b) => b.key === 'howl'), false);
});

test('[敌能-71] the level blackboards are the page numbers', () => {
  const long = { ...ARMOUR, duration: 60 };
  assert.deepEqual(act07.enemies.enemy_1101_plkght.talents.buff, ARMOUR);
  assert.deepEqual(act07.enemies.enemy_1101_plkght_2.talents.buff, ARMOUR);
  assert.deepEqual(fort.enemies.enemy_1101_plkght_2.talents.buff, ARMOUR);
  assert.deepEqual(fort.enemies.enemy_1101_plkght_3.talents.buff, long);
  assert.deepEqual(fort.enemies.enemy_1103_wdkght_2.talents.enhance, STACK);
  assert.deepEqual(fort.enemies.enemy_1103_wdkght_3.talents.enhance, STACK);
  assert.deepEqual(uncoveredAbilities([boiling('enemy_1103_wdkght', 500)]), []);
});

test('[敌能-71] a match that loads a kit still grants a layer', async () => {
  const id = 'enemy_1103_wdkght';
  const c = /** @type {any} */ (await matchContent(
    { level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks: [[{ id: 'char_279_excu', build: BUILD }]] },
    { kits: { char_279_excu: () => ({}) } },
  ));
  c.enemies = { ...c.enemies, [id]: boiling(id, 500), f: fodder('f') };
  c.level = { ...c.level, waves: [oneWave([spawnAt(0, id), spawnAt(0, 'f')])] };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const k = ofKey(w, id)[0];
  damage.setHp(ofKey(w, 'f')[0], 0);
  step(w, c);
  assert.equal(layer(k)?.stacks, 1);
});
