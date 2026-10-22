// 污染秽蚀 and 逐腐 bleed (docs/spec/foes.md 敌能-46). The zone is a world list the effect pass ticks; bleed is a buff
// the engine owns. Content decides who places them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, stateHash, takeSnapshot } from '../src/index.js';
import { placeZone, giveBleed, BLEED } from '../src/blight.js';
import { heal } from '../src/damage.js';
import { applyStatus } from '../src/status.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { makeEnemy, makeOperator } from '../src/units.js';
import { spawnDevice } from '../src/devices.js';

/** @typedef {import('../src/types.js').World} World @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').Content} Content */

const ZONE = { radius: 2, life: 8, low: 50, high: 25 };

/** A tiny field. Lowland operators at (2, 1) and (4, 1); a highland one at (2, 2). The frame is 1. */
function field() {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 8 };
  c.operators.b = { ...c.operators.guard, name: 'b' };
  for (const o of Object.values(c.operators)) Object.assign(o, { cost: 0, atk: 0, def: 0, res: 0, maxHp: 1000 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [
    [0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }],
    [0, { type: 'deploy', op: 'b', row: 1, col: 4, dir: 0 }],
    [0, { type: 'deploy', op: 'sniper', row: 2, col: 2, dir: 0 }],
  ]);
  const by = Object.fromEntries(w.units.map((u) => [u.key, u]));
  return { c, w, low: /** @type {Unit} */ (by.guard), edge: /** @type {Unit} */ (by.b), high: /** @type {Unit} */ (by.sniper) };
}

/** Steps until `id` is hit. @param {World} w @param {Content} c @param {number} id @param {number} [limit] */
function untilHit(w, c, id, limit = 40) {
  for (let i = 0; i < limit; i++) {
    const f = w.frame;
    const ev = step(w, c).filter((e) => e.type === 'hit' && e.target === id);
    if (ev.length) return { f, damage: /** @type {number} */ (ev[0].damage), n: ev.length };
  }
  return null;
}

/**
 * One zone on the lowland operator, flagged when `flag` is set, and its first tick.
 * @param {Record<string, unknown>} opts @param {string} [flag]
 */
function opened(opts, flag = '') {
  const { c, w, low, high, edge } = field();
  if (flag) addBuff(low, makeBuff({ key: 'mark', flags: { [flag]: true } }));
  const born = w.frame;
  placeZone(w, -1, { x: low.x, y: low.y, ...ZONE, life: 8, radius: 2, low: 50, high: 25, ...opts });
  const quiet = step(w, c).filter((e) => e.type === 'hit');
  return { c, w, low, high, edge, born, quiet, hit: untilHit(w, c, low.id) };
}

test('[敌能-46] a zone skips its birth frame, then ticks lowland and highland damage inside the radius', () => {
  const { low, high, edge, born, quiet, hit } = opened({ air: true, open: true });
  assert.equal(quiet.length, 0, 'the frame it was placed does not tick');
  assert.ok(hit);
  assert.equal(hit.f, born + 30);
  assert.equal(hit.damage, 50);
  assert.equal(1000 - high.hp, 25);
  assert.equal(1000 - edge.hp, 50, 'distance 2 is inside');
  assert.equal(low.hp, 950);
});

test('[敌能-46] past the radius, or on a tile with no height, a zone deals nothing', () => {
  const { c, w, low, edge } = field();
  edge.x = 4.5;
  low.x = 20;
  placeZone(w, -1, { x: 2, y: 1, ...ZONE, air: true, open: true });
  assert.equal(untilHit(w, c, edge.id, 35), null);
  assert.equal(low.hp, 1000);
  assert.equal(untilHit(w, c, low.id, 5), null);
});

test('[敌能-46] flying, 无法选择, 迷彩, 隐匿 and 起飞 are in an open zone and out of a closed one', () => {
  const fly = field();
  applyStatus(fly.low, 'levitate', {});
  placeZone(fly.w, -1, { x: 2, y: 1, ...ZONE, air: true, open: false });
  assert.equal(untilHit(fly.w, fly.c, fly.low.id)?.damage, 50, '可对空 reaches a flying unit');
  const grounded = field();
  applyStatus(grounded.low, 'levitate', {});
  placeZone(grounded.w, -1, { x: 2, y: 1, ...ZONE, air: false, open: true });
  assert.equal(untilHit(grounded.w, grounded.c, grounded.low.id, 35), null, 'without 可对空 a flying unit is out');
  assert.equal(opened({ air: true, open: true }, 'untargetable').hit?.damage, 50);
  assert.equal(opened({ air: true, open: true }, 'camou').hit?.damage, 50);
  assert.equal(opened({ air: true, open: true }, 'stealth').hit?.damage, 50);
  assert.equal(opened({ air: true, open: true }, 'liftoff').hit?.damage, 50);
  assert.equal(opened({ air: true, open: false }, 'untargetable').hit, null);
  assert.equal(opened({ air: true, open: false }, 'camou').hit, null);
  assert.equal(opened({ air: true, open: false }, 'stealth').hit, null);
  assert.equal(opened({ air: true, open: false }, 'liftoff').hit, null);
});

test('[敌能-46] our devices are in a wide zone; a hostile device, a neutral enemy and a summon follow the page', () => {
  const { c, w, low } = field();
  c.devices = { box: { name: 'box', maxHp: 400, atk: 0, def: 0, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} } };
  c.devices.foe = { ...c.devices.box, name: 'foe', side: 'ENEMY' };
  c.enemies.man = { name: 'man', maxHp: 80, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true };
  spawnDevice(w, c, 'box', 1, 3);
  spawnDevice(w, c, 'foe', 1, 0);
  const man = makeEnemy(w, c, { key: 'man', route: 0 });
  const summon = makeOperator(w, c, { key: 'guard', owner: 0, row: 1, col: 1, dir: 0, summoner: low.id });
  man.x = 2; man.y = 1;
  summon.x = 2; summon.y = 1;
  w.units.push(man, summon);
  const box = /** @type {Unit} */ (w.units.find((u) => u.key === 'box'));
  const foe = /** @type {Unit} */ (w.units.find((u) => u.key === 'foe'));
  box.x = 2; box.y = 1;
  foe.x = 2; foe.y = 1;
  placeZone(w, -1, { x: 2, y: 1, ...ZONE, air: false, open: false, wide: true });
  assert.equal(untilHit(w, c, box.id)?.damage, 50);
  assert.equal(foe.hp, 400, 'an enemy device is not ours');
  assert.equal(man.hp, 80);
  assert.equal(1000 - summon.hp, 50, 'a summon is an operator');
  const shut = field();
  shut.c.devices = c.devices;
  spawnDevice(shut.w, shut.c, 'box', 1, 3);
  const other = /** @type {Unit} */ (shut.w.units.find((u) => u.key === 'box'));
  other.x = 2; other.y = 1;
  placeZone(shut.w, -1, { x: 2, y: 1, ...ZONE, air: false, open: false, wide: false });
  assert.equal(untilHit(shut.w, shut.c, other.id, 35), null, '干员和召唤物 does not include a device');
});

test('[敌能-46] two zones due the same second deal the earlier one once, and 无敌 still blocks that tick', () => {
  const { c, w, low } = field();
  placeZone(w, -1, { x: 2, y: 1, radius: 2, life: 8, low: 50, high: 25, air: true, open: true });
  placeZone(w, -1, { x: 2, y: 1, radius: 2, life: 8, low: 80, high: 80, air: true, open: true });
  const hit = untilHit(w, c, low.id);
  assert.equal(hit?.damage, 50);
  assert.equal(hit?.n, 1);
  assert.equal(1000 - low.hp, 50);
  const blocked = field();
  applyStatus(blocked.low, 'invincible', {});
  const born = blocked.w.frame;
  placeZone(blocked.w, -1, { x: 2, y: 1, radius: 2, life: 8, low: 50, high: 25, air: true, open: true });
  placeZone(blocked.w, -1, { x: 2, y: 1, radius: 2, life: 8, low: 80, high: 80, air: true, open: true });
  for (let i = 0; i < 31; i++) step(blocked.w, blocked.c);
  assert.equal(blocked.low.hp, 1000);
  assert.equal(blocked.low.ab['@polluted'], born + 30, 'the blocked tick still uses up the second');
});

test('[敌能-46] a zone ticks once a second for its duration and is then gone', () => {
  const { c, w, low } = field();
  placeZone(w, -1, { x: 2, y: 1, radius: 2, life: 1, low: 50, high: 25, air: true, open: true });
  const hit = untilHit(w, c, low.id);
  assert.equal(hit?.damage, 50);
  assert.equal(w.zones, undefined, 'life of 1 second ends on its only tick');
  assert.equal(untilHit(w, c, low.id, 40), null);
});

test('[敌能-46] zones are in the state hash and the snapshot only while the list exists', () => {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  const w = createWorld(c, { seed: 1, players: 1 });
  const before = stateHash(w);
  assert.equal(Object.hasOwn(takeSnapshot(w).data, 'zones'), false);
  placeZone(w, 1, { x: 1, y: 1, radius: 1, life: 1, low: 50, high: 25 });
  assert.notEqual(stateHash(w), before);
  assert.equal(/** @type {unknown[]} */ (takeSnapshot(w).data.zones).length, 1);
  delete w.zones;
  assert.equal(stateHash(w), before);
});

/** A lowland operator and a bleed of `damage`. @param {number} damage @param {number} hp */
function bled(damage, hp) {
  const { c, w, low } = field();
  low.hp = hp;
  giveBleed(low, damage, 10);
  return { c, w, low };
}

test('[敌能-46] bleed is sourceless arts one second later, stops at 1 HP, and a second application refreshes in phase', () => {
  const { c, w, low } = bled(100, 1000);
  const at = w.frame;
  const hit = untilHit(w, c, low.id);
  assert.ok(hit);
  assert.equal(hit.f, at + 29, 'applied between frames: the 30th buff tick is the first damage');
  assert.equal(hit.damage, 100);
  assert.equal(low.buffs.filter((b) => b.key === BLEED).length, 1);
  const tiny = bled(100, 30);
  assert.equal(untilHit(tiny.w, tiny.c, tiny.low.id)?.damage, 29);
  assert.equal(tiny.low.hp, 1);
  assert.equal(untilHit(tiny.w, tiny.c, tiny.low.id, 40), null, 'already at 1, the tick takes nothing');
  assert.equal(tiny.low.hp, 1);
  const resist = field();
  resist.low.base.res = 50;
  giveBleed(resist.low, 100, 10);
  assert.equal(untilHit(resist.w, resist.c, resist.low.id)?.damage, 50, 'RES still applies; there is no source');
  const { c: c2, w: w2, low: u } = bled(100, 1000);
  const start = w2.frame;
  for (let i = 0; i < 10; i++) step(w2, c2);
  const buff = /** @type {import('../src/types.js').Buff} */ (u.buffs.find((b) => b.key === BLEED));
  const acc = buff.acc;
  giveBleed(u, 150, 10);
  assert.equal(u.buffs.filter((b) => b.key === BLEED).length, 1);
  assert.equal(buff.acc, acc, 'the one-second phase is not restarted');
  assert.equal(buff.value, 150);
  assert.equal(buff.left, 300);
  const next = untilHit(w2, c2, u.id);
  assert.equal(next?.damage, 150);
  assert.equal(next?.f, start + 29, 'the original phase');
});

test('[敌能-46] a heal that restores HP ends bleed; a heal of 0, 禁疗 and a bare HP change do not', () => {
  const { w, low } = bled(100, 500);
  assert.equal(heal(w, null, low, 10), 10);
  assert.equal(low.buffs.some((b) => b.key === BLEED), false);
  const none = bled(100, 500);
  assert.equal(heal(none.w, null, none.low, 0), 0);
  assert.equal(none.low.buffs.some((b) => b.key === BLEED), true);
  applyStatus(none.low, 'healFree', {});
  assert.equal(heal(none.w, null, none.low, 10), 0);
  assert.equal(none.low.buffs.some((b) => b.key === BLEED), true);
  none.low.hp += 5;
  assert.equal(none.low.buffs.some((b) => b.key === BLEED), true);
});

test('[敌能-60] a burn adds the collider and stacks with another burn and with 污染秽蚀', () => {
  const { c, w, low, edge, high } = field();
  edge.x = 3.75;
  edge.y = 1;
  high.x = 3.875;
  high.y = 1;
  const born = w.frame;
  placeZone(w, -1, { x: 2, y: 1, radius: 2, life: 8, low: 50, high: 25 });
  placeZone(w, -1, { x: 2, y: 1, radius: 1.5, life: 3, low: 0, high: 0, arts: 100, pad: 0.25 });
  placeZone(w, -1, { x: 2, y: 1, radius: 1.5, life: 3, low: 0, high: 0, arts: 40, pad: 0.25 });
  const snap = /** @type {{ zones: Record<string, unknown>[] }} */ (takeSnapshot(w).data);
  assert.equal(Object.hasOwn(snap.zones[0], 'arts'), false, 'a 污染秽蚀 zone gains no burn fields');
  assert.equal(Object.hasOwn(snap.zones[0], 'pad'), false);
  assert.equal(snap.zones[1].arts, 100);
  /** @type {{ f: number, ev: { target?: number, damage?: number }[] } | null} */
  let got = null;
  for (let i = 0; i < 40 && !got; i++) {
    const f = w.frame;
    const ev = step(w, c).filter((e) => e.type === 'hit');
    if (ev.length) got = { f, ev };
  }
  assert.ok(got);
  assert.equal(got.f, born + 30);
  /** @param {number} id */
  const of = (id) => got.ev.filter((e) => e.target === id).map((e) => e.damage);
  assert.deepEqual(of(low.id), [50, 100, 40]);
  assert.deepEqual(of(edge.id), [50, 100, 40], '1.75 is the radius plus the collider');
  assert.deepEqual(of(high.id), [50], '1.875 is inside the blight and outside the burn');
});
