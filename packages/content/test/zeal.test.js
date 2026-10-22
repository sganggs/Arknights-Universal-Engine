// 斗志昂扬无人机 (docs/spec/foes.md 敌能-85). The howling armour stays 敌能-71; this file checks the other `buff` shape.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, damage, summons, devices, KIND } from '@aue/sim';
import { secondsToFrames } from '@aue/math';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import fort from '../data/levels/act1multi_fortress_rm01.json' with { type: 'json' };
import { skeletonContent } from '../src/index.js';
import { levelAt } from '../src/levels.js';
import { uncoveredAbilities, withFoeExtras, withoutIncomplete } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const ID = 'enemy_1106_byokai';
const BB = { duration: 20, attack_speed: 100, def: 0.5 };
const ARMOUR = { duration: 30, def: 3000, magic_resistance: 95 };
const HOLD = secondsToFrames(20);

/** @param {Record<string, unknown>} [over] */
function drone(over = {}) {
  return withFoeExtras(ID, {
    name: ID, maxHp: 5000, atk: 0, def: 150, res: 20, moveSpeed: 1, baseAttackTime: 1,
    rangeRadius: 0, applyWay: 'NONE', motion: 'FLY', lifePointReduce: 0, immune: ['silence'],
    ...over, talents: { buff: { ...BB } },
  });
}

/** @param {string} key @param {string} position @param {number} def @param {string} [motion] */
function operator(key, position, def, motion = '') {
  return {
    name: key, position, cost: 0, blockCnt: 1, baseAttackTime: 1, maxHp: 800, atk: 0, def, res: 0,
    ...(motion ? { motion } : {}),
    range: position === 'RANGED' ? [{ row: -1, col: 0 }] : [{ row: 0, col: 0 }],
  };
}

/** The crew, a summon record and a device. @param {any} c */
function prepare(c) {
  const add = (/** @type {string} */ key, /** @type {string} */ position, /** @type {number} */ def, /** @type {string} */ motion = '') => {
    c.operators[key] = operator(key, position, def, motion);
  };
  add('guard', 'MELEE', 100);
  add('nap', 'MELEE', 60);
  add('shade', 'MELEE', 90);
  add('edge', 'MELEE', 50);
  add('out', 'MELEE', 40);
  add('flyer', 'RANGED', 80, 'FLY');
  add('mate', 'RANGED', 20);
  add('ghost', 'RANGED', 70);
  add('puppet', 'MELEE', 40);
  add('sniper', 'RANGED', 20);
  c.devices = {
    box: { name: 'box', maxHp: 100, atk: 0, def: 200, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} },
  };
}

/** @param {Record<string, any>} enemies @param {any[]} spawns @param {(c: any) => void} [tweak] */
function open(enemies, spawns, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = enemies;
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(spawns)];
  c.level.options = { ...c.level.options, characterLimit: 20, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c);
  return { c, w };
}

/** @param {World} w @param {string} key @returns {Unit[]} */
const ofKey = (w, key) => w.units.filter((u) => u.key === key);
/** Root holds the tile: a static flyer still walks its route (位移-5). @param {Unit} u @param {number} x @param {number} y */
const pin = (u, x, y) => { u.x = x; u.y = y; status.applyStatus(u, 'root', {}); };
/** @param {Unit} u @param {string} key */
const mark = (u, key) => buffs.addBuff(u, buffs.makeBuff({ key, flags: { [key]: true } }));
/** @param {Unit} u */
const zealOf = (u) => u.buffs.filter((b) => b.key === 'zeal');

/**
 * @param {World} w @param {any} c @param {number} seat @param {string} op @param {{ row: number, col: number }} at
 * @returns {Unit}
 */
function put(w, c, seat, op, at) {
  step(w, c, [[seat, { type: 'deploy', op, row: at.row, col: at.col, dir: 0 }]]);
  const u = w.units.find((x) => x.key === op && x.owner === seat);
  assert.ok(u, op);
  return /** @type {Unit} */ (u);
}

/** Operators and summons inside the blast, and the units the page leaves out. @param {World} w @param {any} c */
function stand(w, c) {
  const guard = put(w, c, 0, 'guard', { row: 1, col: 1 });
  const nap = put(w, c, 0, 'nap', { row: 1, col: 0 });
  const shade = put(w, c, 0, 'shade', { row: 1, col: 2 });
  const edge = put(w, c, 0, 'edge', { row: 1, col: 3 });
  const out = put(w, c, 0, 'out', { row: 1, col: 4 });
  const flyer = put(w, c, 0, 'flyer', { row: 0, col: 2 });
  const mate = put(w, c, 1, 'mate', { row: 0, col: 3 });
  const ghost = put(w, c, 0, 'ghost', { row: 2, col: 2 });
  mark(nap, 'sleep');
  mark(shade, 'stealth');
  mark(flyer, 'untargetable');
  mark(flyer, 'camou');
  edge.x = 32;
  out.x = 33;
  ghost.hidden = true;
  const puppet = summons.spawnSummon(w, c, guard, 'puppet', { row: 1, col: 3 });
  assert.ok(puppet);
  assert.equal(devices.spawnDevice(w, c, 'box', 1, 4), true);
  const box = w.units.find((u) => u.kind === KIND.DEVICE);
  assert.ok(box);
  return { guard, nap, shade, edge, out, flyer, mate, ghost, puppet: /** @type {Unit} */ (puppet), box: /** @type {Unit} */ (box) };
}

/** @param {Unit} u @param {number} def */
function oneZeal(u, def) {
  const got = zealOf(u);
  assert.equal(got.length, 1);
  assert.equal(got[0].left, HOLD);
  assert.equal(got[0].stacks, 1);
  assert.deepEqual(got[0].mods, { aspd: 100, defPct: 0.5 });
  assert.equal(u.buffs.some((b) => b.key === 'howl'), false);
  assert.equal(attrs.statsOf(u).aspd, 200);
  assert.equal(attrs.statsOf(u).def, def);
}

/** @param {ReturnType<typeof stand>} crowd */
function checkGranted(crowd) {
  const rows = [[crowd.guard, 150], [crowd.nap, 90], [crowd.edge, 75], [crowd.flyer, 120], [crowd.mate, 30], [crowd.puppet, 60]];
  for (const [u, def] of rows) oneZeal(/** @type {Unit} */ (u), /** @type {number} */ (def));
  const fly = attrs.statsOf(crowd.flyer);
  assert.equal(fly.flying, true);
  assert.equal(fly.flags.untargetable, true);
  assert.equal(fly.flags.camou, true);
  assert.equal(attrs.statsOf(crowd.nap).flags.sleep, true);
  assert.equal(crowd.puppet.summoner, crowd.guard.id);
  assert.equal(crowd.mate.owner, 1);
}

/** @param {ReturnType<typeof stand>} crowd @param {Unit} neutral */
function checkDenied(crowd, neutral) {
  for (const u of [crowd.shade, crowd.ghost, crowd.out, crowd.box, neutral]) assert.equal(zealOf(u).length, 0);
  assert.equal(attrs.statsOf(crowd.shade).def, 90);
  assert.equal(attrs.statsOf(crowd.shade).flags.stealth, true);
  assert.equal(attrs.statsOf(crowd.out).def, 40);
  assert.equal(attrs.statsOf(crowd.box).def, 200);
  assert.equal(attrs.statsOf(neutral).def, 10);
  assert.equal(crowd.ghost.hidden, true);
}

/** Two drones and one operator, both drones held on the blast's centre. */
function pair() {
  const { c, w } = open({ [ID]: drone() }, [spawnAt(0, ID), spawnAt(0, ID)], prepare);
  const [a, b] = ofKey(w, ID);
  pin(a, 2, 1);
  pin(b, 2, 1);
  const guard = put(w, c, 0, 'guard', { row: 1, col: 1 });
  return { c, w, a, b, guard };
}

/** @param {boolean} keepImmune */
function silenced(keepImmune) {
  const { c, w } = open({ [ID]: drone(keepImmune ? {} : { immune: [] }) }, [spawnAt(0, ID)], prepare);
  const e = ofKey(w, ID)[0];
  pin(e, 2, 1);
  const guard = put(w, c, 0, 'guard', { row: 1, col: 1 });
  buffs.addBuff(e, buffs.makeBuff({ key: 'silence', flags: { silence: true }, left: 90 }));
  return { c, w, e, guard };
}

/** Goal events of `id`, or 400 frames. @param {World} w @param {any} c @param {number} id */
function untilGoal(w, c, id) {
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < 400 && !ev.some((e) => e.type === 'goal' && e.id === id); i++) ev.push(...step(w, c));
  return ev;
}

test('[敌能-85] a knockdown gives our operators and summons +100 attack speed and +50% DEF for 20s', () => {
  const civ = { name: 'civ', maxHp: 200, atk: 0, def: 10, res: 0, moveSpeed: 0, neutral: true };
  const { c, w } = open({ [ID]: drone(), civ }, [spawnAt(0, ID), spawnAt(0, 'civ')], prepare);
  const e = ofKey(w, ID)[0];
  const neutral = ofKey(w, 'civ')[0];
  pin(e, 2, 1);
  pin(neutral, 3, 1);
  assert.equal(attrs.statsOf(e).flags.noAttack, true);
  assert.equal(attrs.statsOf(e).flags.staticBody, true);
  assert.equal(attrs.statsOf(e).flying, true);
  assert.equal(e.buffs.some((b) => b.key === 'howl'), false);
  const crowd = stand(w, c);
  assert.equal(e.x, 2);
  assert.equal(e.y, 1);
  assert.equal(crowd.edge.x, 32);
  assert.equal(crowd.out.x, 33);
  const id = e.id;
  damage.setHp(e, 0);
  const ev = step(w, c);
  assert.equal(w.units.some((u) => u.id === id), false);
  assert.equal(ev.some((x) => x.type === 'death' && x.id === id), true);
  assert.equal(ev.some((x) => x.type === 'goal'), false);
  checkGranted(crowd);
  checkDenied(crowd, neutral);
  assert.equal(w.players[0].life, 3);
});

test('[敌能-85] reaching the goal gives nothing', () => {
  const { c, w } = open({ [ID]: drone() }, [spawnAt(0, ID)], prepare);
  const e = ofKey(w, ID)[0];
  const id = e.id;
  assert.equal(attrs.statsOf(e).flying, true);
  assert.equal(attrs.statsOf(e).flags.staticBody, true);
  assert.equal(attrs.statsOf(e).flags.noAttack, true);
  const sniper = put(w, c, 0, 'sniper', { row: 0, col: 2 });
  const ev = untilGoal(w, c, id);
  assert.equal(ev.some((x) => x.type === 'goal' && x.id === id), true);
  assert.equal(ev.some((x) => x.type === 'death' && x.id === id), false);
  assert.equal(w.units.some((u) => u.id === id), false);
  assert.equal(zealOf(sniper).length, 0);
  assert.equal(w.players[0].life, 3);
  assert.equal(w.players[1].life, 3);
});

test('[敌能-85] a second blast adds 20s to what is left', () => {
  const { c, w, a, b, guard } = pair();
  damage.setHp(a, 0);
  step(w, c);
  for (let i = 0; i < 10; i++) step(w, c);
  const before = zealOf(guard)[0].left;
  damage.setHp(b, 0);
  step(w, c);
  const got = zealOf(guard);
  assert.equal(got.length, 1);
  assert.equal(got[0].left, before - 1 + HOLD);
  assert.equal(got[0].stacks, 1);
  assert.deepEqual(got[0].mods, { aspd: 100, defPct: 0.5 });
  assert.equal(attrs.statsOf(guard).def, 150);
  assert.equal(attrs.statsOf(guard).aspd, 200);
});

test('[敌能-85] two blasts in one frame add 40s and still one buff', () => {
  const { c, w, a, b, guard } = pair();
  damage.setHp(a, 0);
  damage.setHp(b, 0);
  step(w, c);
  const got = zealOf(guard);
  assert.equal(got.length, 1);
  assert.equal(got[0].left, HOLD * 2);
  assert.equal(got[0].stacks, 1);
  assert.deepEqual(got[0].mods, { aspd: 100, defPct: 0.5 });
  assert.equal(attrs.statsOf(guard).def, 150);
});

test('[敌能-85] silence does not stop the blast, and the drone still does not attack', () => {
  const immune = silenced(true);
  assert.notEqual(attrs.statsOf(immune.e).flags.silence, true);
  assert.equal(attrs.statsOf(immune.e).flags.noAttack, true);
  damage.setHp(immune.e, 0);
  step(immune.w, immune.c);
  oneZeal(immune.guard, 150);
  const plain = silenced(false);
  assert.equal(attrs.statsOf(plain.e).flags.silence, true);
  damage.setHp(plain.e, 0);
  step(plain.w, plain.c);
  oneZeal(plain.guard, 150);
});

test('[敌能-71] [敌能-85] howling armour is still howl, and does not refuse to attack', () => {
  const kid = 'enemy_1101_plkght';
  const knight = withFoeExtras(kid, {
    name: kid, maxHp: 2800, atk: 300, def: 100, res: 0, moveSpeed: 0, talents: { buff: { ...ARMOUR } },
  });
  const { w } = open({ [kid]: knight }, [spawnAt(0, kid)]);
  const e = ofKey(w, kid)[0];
  assert.equal(attrs.statsOf(e).def, 3100);
  assert.equal(attrs.statsOf(e).res, 95);
  assert.notEqual(attrs.statsOf(e).flags.noAttack, true);
  assert.equal(e.buffs.some((b) => b.key === 'howl'), true);
  assert.equal(zealOf(e).length, 0);
});

test('[敌能-85] [关卡-2] other buff shapes stay uncovered, and the drone\'s gap in IG-DF-1 closes', () => {
  const row = (/** @type {Record<string, Record<string, unknown>>} */ talents) => uncoveredAbilities([/** @type {any} */ ({ talents })]);
  const zeal = { ...BB, zeal: 1 };
  assert.deepEqual(row({ buff: zeal }), []);
  assert.deepEqual(row({ buff: { ...BB } }), ['buff']);
  assert.deepEqual(row({ buff: { ...BB, page: 1 } }), ['buff']);
  assert.deepEqual(row({ buff: { ...zeal, page: 1 } }), ['buff']);
  assert.deepEqual(row({ buff: { ...ARMOUR } }), ['buff']);
  assert.deepEqual(row({ buff: { ...ARMOUR, page: 1 } }), []);
  assert.deepEqual(row({ buff: { ...ARMOUR, zeal: 1 } }), ['buff']);
  assert.deepEqual(row({ buff: { sp_ratio: 1, type: 'enthusiastic' } }), ['buff']);
  for (const d of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
    const lv = levelAt('act1multi_fortress_rm01', d);
    assert.equal((lv.level.uncovered ?? []).includes('buff'), false, d);
    assert.ok((lv.level.uncovered ?? []).length > 0, d);
    assert.equal(/** @type {any} */ (lv.enemies[ID]).talents.buff.zeal, undefined, d);
  }
  const raw = /** @type {any} */ (fort.enemies[ID]);
  const battle = /** @type {any} */ (withoutIncomplete(withFoeExtras(ID, raw)));
  assert.deepEqual(battle.talents.buff, { ...BB, zeal: 1 });
  assert.deepEqual(battle.talents.Static, {});
  const knight = withoutIncomplete(withFoeExtras('enemy_1101_plkght_2', /** @type {any} */ (fort.enemies.enemy_1101_plkght_2)));
  assert.equal(knight.talents?.buff?.page, 1);
  assert.equal(knight.talents?.buff?.zeal, undefined);
});

test('[敌能-85] [关卡-2] the shape without the zeal marker does not blast and does not refuse to attack', () => {
  const raw = { name: 'x', maxHp: 100, atk: 0, def: 50, res: 0, moveSpeed: 0, motion: 'FLY', talents: { buff: { ...BB } } };
  const { c, w } = open({ x: raw }, [spawnAt(0, 'x')], prepare);
  const e = ofKey(w, 'x')[0];
  pin(e, 2, 1);
  assert.notEqual(attrs.statsOf(e).flags.noAttack, true);
  assert.notEqual(attrs.statsOf(e).flags.staticBody, true);
  const guard = put(w, c, 0, 'guard', { row: 1, col: 1 });
  damage.setHp(e, 0);
  step(w, c);
  assert.equal(zealOf(guard).length, 0);
  assert.equal(attrs.statsOf(guard).def, 100);
  assert.equal(attrs.statsOf(guard).aspd, 100);
});
