// 守墓石像 (docs/spec/foes.md 敌能-34) on the tiny map, with the record built here: the enemy is not in a level yet
// (mod-4). Its ground mode, the statue form after the first knock-out, and the flight after it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, damage, status, buffs, displacement } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';

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
/** @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col */
const deploy = (w, c, op, row, col) => step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
/** @param {World} w @param {string} key @returns {Unit} */
const opOf = (w, key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));

/** The statue's record: ALL so a flyer can hit in range; the data's first damage type is physical; `stone` as the data has it. */
const statueDef = () => ({
  name: 'statue', maxHp: 10000, atk: 200, def: 100, res: 0, moveSpeed: 0.5, applyWay: 'ALL', rangeRadius: 1.6, baseAttackTime: 4,
  talents: { stone: { magic_resistance: 30, def: 800, duration: 10 } },
  skills: [{ key: 'Hold', cooldown: 8, initCooldown: 5, bb: {} }],
});

/** Knocks the statue out; the fatal hook refills it. @param {World} w @param {any} c @param {Unit} e */
function knockOut(w, c, e) {
  damage.dealDamage(w, null, e, { type: 'true', amount: 1e9 });
  step(w, c);
}

test('[敌能-34] 守墓石像: on the ground it attacks only the unit blocking it', () => {
  const key = 'statue';
  const { c, w } = open({ [key]: statueDef() }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  pin(e, 2, 1);
  e.atkCd = 0;
  const missed = deploy(w, c, 'sniper', 2, 2);
  assert.equal(e.blockedBy, -1);
  assert.equal(hitsOf(missed, e.id).length, 0);
  const hit = deploy(w, c, 'guard', 1, 2);
  const guard = opOf(w, 'guard');
  assert.equal(e.blockedBy, guard.id);
  assert.equal(hitsOf(hit, e.id).length, 1);
  assert.equal(guard.maxHp - guard.hp, 10);
  assert.equal(opOf(w, 'sniper').hp, opOf(w, 'sniper').maxHp);
});

test('[敌能-34] 守墓石像: the first knock-out refills HP at once, clears its buffs and skills, and the statue form refuses levitate', () => {
  const key = 'statue';
  const { c, w } = open({ [key]: statueDef() }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  pin(e, 2, 1);
  buffs.addBuff(e, buffs.makeBuff({ key: 'mark', mods: { atkFlat: 1 } }));
  e.ab['Hold.cd'] = 999;
  const max = attrs.statsOf(e).maxHp;
  knockOut(w, c, e);
  assert.equal(w.units.includes(e), true);
  assert.equal(e.hp, max);
  const s = attrs.statsOf(e);
  assert.equal(s.flags.unblockable, true);
  assert.equal(s.immobile, true);
  assert.equal(s.flags.noAttack, true);
  assert.equal(displacement.displaceable(e), false);
  assert.equal(e.buffs.find((b) => b.key === 'stone')?.left, 300);
  assert.equal(s.def, 900);
  assert.equal(s.res, 30);
  assert.equal(e.buffs.some((b) => b.key === 'mark'), false);
  assert.equal(e.ab['Hold.cd'], 150);
  assert.ok(status.applyStatus(e, 'levitate', { frames: 30 }));
  const during = attrs.statsOf(e);
  assert.equal(during.flying, false);
  assert.equal(during.disabled, false);
  const stood = deploy(w, c, 'guard', 1, 2);
  assert.equal(e.blockedBy, -1);
  assert.equal(hitsOf(stood, e.id).length, 0);
});

test('[敌能-34] 守墓石像: the form lasts 10 s, damage during it sticks, then it flies', () => {
  const key = 'statue';
  const { c, w } = open({ [key]: statueDef() }, [spawnAt(0, key)]);
  const e = ofKey(w, key)[0];
  pin(e, 2, 1);
  const max = e.maxHp;
  knockOut(w, c, e);
  damage.dealDamage(w, null, e, { type: 'true', amount: 40 });
  run(w, c, 299);
  assert.equal(e.buffs.find((b) => b.key === 'stone')?.left, 1);
  assert.equal(e.base.motion, 'WALK');
  assert.equal(e.hp, max - 40);
  step(w, c);
  assert.equal(e.base.motion, 'FLY');
  assert.equal(e.buffs.some((b) => b.key === 'stone'), false);
  assert.equal(e.buffs.find((b) => b.key === 'flight')?.flags.noDisplace, true);
  assert.equal(displacement.displaceable(e), false);
  assert.equal(e.hp, max - 40);
});

test('[敌能-34] 守墓石像: in the air it deals arts, skips a flying blocker, and the next knock-out removes it', () => {
  const key = 'statue';
  const { c, w } = open({ [key]: statueDef() }, [spawnAt(0, key)], (cc) => { cc.operators.guard.motion = 'FLY'; });
  const e = ofKey(w, key)[0];
  pin(e, 2, 1);
  knockOut(w, c, e);
  run(w, c, 300);
  e.x = 2; e.y = 1; e.atkCd = 0;
  deploy(w, c, 'guard', 1, 2);
  const guard = opOf(w, 'guard');
  buffs.addBuff(guard, buffs.makeBuff({ key: 'bf', flags: { blockFly: true } }));
  const blocked = step(w, c);
  assert.equal(e.blockedBy, guard.id);
  assert.equal(hitsOf(blocked, e.id).length, 0);
  const shot = deploy(w, c, 'sniper', 2, 2);
  const sniper = opOf(w, 'sniper');
  assert.equal(hitsOf(shot, e.id).length, 1);
  assert.equal(sniper.maxHp - sniper.hp, 200);
  assert.equal(guard.hp, guard.maxHp);
  knockOut(w, c, e);
  assert.equal(w.units.includes(e), false);
});
