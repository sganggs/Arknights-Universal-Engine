// 折射 and the 深池 phalanx (docs/spec/foes.md 敌能-33) on the tiny map, with enemy records built here: these enemies
// are not in a level yet (mod-4). 折射's RES, the phalanx DEF aura and the shadow mage's refusal of flyers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/** @param {Record<string, any>} enemies @param {any[]} spawns @param {(c: any) => void} [tweak] */
function open(enemies, spawns, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = enemies;
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(spawns)];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e7, atk: 0, def: 500 });
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

/** @param {string} key */
const hound = (key) => ({ name: key, maxHp: 2800, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { refracting: { magic_resistance: 70 } } });

/** @param {string} key @param {number} def */
const phalanx = (key, def) => withFoeExtras(key, {
  name: key, maxHp: 4000, atk: 0, def, res: 0, moveSpeed: 1, rangeRadius: 0,
  talents: { refracting: { magic_resistance: 70 }, auraDefup: { def: 200 } },
});

/** @param {string} id */
const mageDef = (id) => withFoeExtras(id, {
  name: 'mage', maxHp: 4500, atk: 100, def: 150, res: 20, moveSpeed: 1.1, applyWay: 'RANGED', rangeRadius: 2.5, dmgType: 'arts', baseAttackTime: 3,
  talents: { refracting: { magic_resistance: 70 } },
});

/** Hit events of `id` within 12 frames (an enemy shot crosses one tile in three). @param {World} w @param {any} c @param {number} id */
function untilHit(w, c, id) {
  /** @type {any[]} */
  const got = [];
  for (let i = 0; i < 12 && got.length === 0; i++) got.push(...hitsOf(step(w, c), id));
  return got;
}

test('[敌能-33] 折射: RES is up while not silenced and gone while silenced', () => {
  const key = 'enemy_1165_duhond';
  const { c, w } = open({ [key]: hound(key) }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  assert.equal(attrs.statsOf(e).res, 70);
  assert.equal(e.buffs.filter((b) => b.key === 'refracting').length, 1);
  const sil = silence(e, 2);
  assert.equal(attrs.statsOf(e).res, 70);
  step(w, c);
  assert.equal(attrs.statsOf(e).res, 0);
  assert.equal(e.buffs.some((b) => b.key === 'refracting'), false);
  sil.left = 1;
  step(w, c);
  assert.equal(attrs.statsOf(e).res, 70);
  assert.equal(e.buffs.filter((b) => b.key === 'refracting').length, 1);
});

test('[敌能-33] 方阵: each nearby copy of either rank adds its own DEF; the 1.5 radius counts; silence does not remove it', () => {
  const soldier = 'enemy_1169_duphlx', commander = 'enemy_1169_duphlx_2', by = 'bystander';
  const { c, w } = open({
    [soldier]: phalanx(soldier, 300),
    [commander]: phalanx(commander, 400),
    [by]: { name: 'by', maxHp: 1000, atk: 0, def: 100, res: 0, moveSpeed: 1 },
  }, [spawnAt(0, soldier), spawnAt(0, commander), spawnAt(0, by)]);
  const s = ofKey(w, soldier)[0], cmd = ofKey(w, commander)[0], b = ofKey(w, by)[0];
  pin(s, 2, 1); pin(cmd, 2, 1); pin(b, 2, 1);
  step(w, c);
  assert.equal(attrs.statsOf(s).def, 500);
  assert.equal(attrs.statsOf(cmd).def, 600);
  assert.equal(attrs.statsOf(b).def, 100);
  cmd.x = 3.5;
  step(w, c);
  assert.equal(attrs.statsOf(s).def, 500);
  cmd.x = 3.6;
  step(w, c);
  assert.equal(attrs.statsOf(s).def, 500, 'the lent bonus outlasts the count by one frame');
  step(w, c);
  assert.equal(attrs.statsOf(s).def, 300);
  cmd.x = 2;
  step(w, c);
  silence(s, 5);
  step(w, c);
  assert.equal(attrs.statsOf(s).def, 500);
  assert.equal(attrs.statsOf(s).res, 0);
});

test('[敌能-33] 方阵: the DEF bonus scales with the number of nearby copies', () => {
  const key = 'enemy_1169_duphlx';
  const { c, w } = open({ [key]: phalanx(key, 300) }, [spawnAt(0, key, { count: 3 })]);
  const [a, b, far] = ofKey(w, key);
  pin(a, 2, 1); pin(b, 2, 1); pin(far, 2, 1);
  step(w, c);
  assert.equal(attrs.statsOf(a).def, 700);
  assert.equal(attrs.statsOf(b).def, 700);
  assert.equal(attrs.statsOf(far).def, 700);
  far.x = 4;
  run(w, c, 2);
  assert.equal(attrs.statsOf(a).def, 500);
  assert.equal(attrs.statsOf(b).def, 500);
  assert.equal(attrs.statsOf(far).def, 300);
  b.x = 8;
  run(w, c, 2);
  assert.equal(attrs.statsOf(a).def, 300);
  assert.equal(attrs.statsOf(b).def, 300);
  assert.equal(attrs.statsOf(far).def, 300);
});

test('[敌能-33] 暗影术师: 折射 adds RES, and it does not attack a flying unit', () => {
  const key = 'enemy_1168_dumage';
  const { c, w } = open({ [key]: mageDef(key) }, [spawnAt(0, key)], (cc) => { cc.operators.guard.motion = 'FLY'; });
  const e = ofKey(w, key)[0];
  assert.equal(attrs.statsOf(e).res, 90);
  pin(e, 2, 1);
  e.atkCd = 0;
  const blocked = deploy(w, c, 'guard', 1, 2);
  const guard = opOf(w, 'guard');
  assert.equal(e.blockedBy, guard.id);
  assert.equal(hitsOf(blocked, e.id).length, 0);
  deploy(w, c, 'sniper', 2, 2);
  const sniper = opOf(w, 'sniper');
  const got = untilHit(w, c, e.id);
  assert.equal(got.length, 1);
  assert.equal(got[0].target, sniper.id);
  assert.equal(sniper.maxHp - sniper.hp, 100);
  assert.equal(guard.hp, guard.maxHp);
});

/**
 * One talent blackboard after the PRTS extras are merged.
 * @param {string} id @param {Record<string, Record<string, number>>} talents @param {string} name
 * @returns {Record<string, number>}
 */
function merged(id, talents, name) {
  const d = withFoeExtras(id, { name: id, maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents });
  const bb = d.talents?.[name];
  if (!bb) throw new Error(`missing talent ${name}`);
  return bb;
}

test('[敌能-33] the phalanx radius and the mages\' noFly are PRTS extras', () => {
  assert.equal(merged('enemy_1169_duphlx', { auraDefup: { def: 200 } }, 'auraDefup').radius, 1.5);
  assert.equal(merged('enemy_1169_duphlx_2', { auraDefup: { def: 200 } }, 'auraDefup').radius, 1.5);
  assert.deepEqual(merged('enemy_1168_dumage', { refracting: { magic_resistance: 70 } }, 'noFly'), {});
  assert.deepEqual(merged('enemy_1168_dumage_2', { refracting: { magic_resistance: 70 } }, 'noFly'), {});
});
