// W's C4 (docs/spec/foes.md 敌能-76): a 3.2 s cast plants one charge on a ground unit of ours; below half HP the
// cooldown clears once and the next cast plants up to three, flyers included. The charge blows on that unit alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, attrs, damage, status, deck, buffs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelAt, levelContent, FOE_EXTRAS } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const KEY = 'enemy_1504_cqbw';
/** 3.2 s at 30 fps (时间-2). The charge is planted on the cast's first frame and expires this many frames later. */
const FUSE = secondsToFrames(3.2);

/** @param {number} range @returns {EnemyDef} */
function wOf(range) {
  return {
    name: 'W', maxHp: 100000, atk: 1200, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 4,
    rangeRadius: 5, applyWay: 'RANGED', motion: 'WALK', massLevel: 5,
    skills: [{ key: 'C4', cooldown: 20, initCooldown: 0, sp: 0, bb: { atk_scale: 2.5, range_radius: range, cast: 3.2 } }],
  };
}

/** Operators that do not hit back or block. The sniper flies; `ground` stands on highland. @param {any} c */
function tuneOps(c) {
  c.level.options = { ...c.level.options, initialCost: 50, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  const base = { atk: 0, def: 0, blockCnt: 0, cost: 0, maxHp: 1e7, baseAttackTime: 4 };
  Object.assign(c.operators.guard, base);
  Object.assign(c.operators.sniper, base, { motion: 'FLY' });
  c.operators.ground = { ...c.operators.guard, name: 'ground', position: 'RANGED' };
}

/**
 * W spawns at (0, 2) and stays — `count` of them, the same frame. `ops` deploy on the next frame as [op, row, col].
 * @param {EnemyDef} def @param {[string, number, number][]} ops
 * @param {{ count?: number, tune?: (c: any) => void }} [more] how many W, and changes to the content before the battle
 */
function arena(def, ops, more = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [KEY]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(Array.from({ length: more.count ?? 1 }, () => spawnAt(0, KEY)))];
  tuneOps(c);
  more.tune?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  const e = w.units.find((u) => u.key === KEY);
  if (!e) throw new Error('missing W');
  return { c, w, e };
}

/** @param {World} w */
const plants = (w) => w.units.flatMap((u) => u.buffs.filter((b) => b.key === 'c4'));
/** @param {World} w @param {string} key */
const op = (w, key) => w.units.find((u) => u.key === key);

/** Hit events on `id` over the next `n` frames. @param {World} w @param {any} c @param {number} id @param {number} n */
function hits(w, c, id, n) {
  /** @type {{ id: number, damage: number }[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    step(w, c);
    for (const ev of w.events) {
      if (ev.type === 'hit' && ev.target === id) out.push({ id: Number(ev.id), damage: Number(ev.damage) });
    }
  }
  return out;
}

test('[敌能-76] the level record keeps its numbers; rm01 no longer lists C4 as uncovered', () => {
  const lv = levelAt('act1multi_fortress_rm01', 'NORMAL');
  assert.equal((lv.level.uncovered ?? []).includes('C4'), false);
  assert.ok((lv.level.uncovered ?? []).length > 0);
  const extra = FOE_EXTRAS[KEY];
  assert.equal(extra?.skills?.C4.cast, 3.2);
  assert.equal(extra?.source.endsWith('oldid=378514'), true);
  const skill = levelContent('act1multi_fortress_rm01', 'NORMAL').enemies[KEY].skills?.find((s) => s.key === 'C4');
  assert.deepEqual(skill && { scale: skill.bb.atk_scale, range: skill.bb.range_radius, cast: skill.bb.cast, cd: skill.cooldown }, {
    scale: 2.5, range: 5, cast: 3.2, cd: 20,
  });
  assert.deepEqual(levelContent('act1multi_fortress_rm01', 'NORMAL').enemies[KEY].talents?.noFly, {});
});

test('[敌能-76] no cast when the only unit of ours in range is a flyer, or the ground unit is out of range', () => {
  const { c, w, e } = arena(wOf(2.5), [['sniper', 2, 2], ['guard', 1, 4]]);
  assert.equal(plants(w).length, 0);
  assert.equal(attrs.statsOf(e).immobile, false);
  hits(w, c, e.id, 10);
  assert.equal(plants(w).length, 0);
  assert.equal(attrs.statsOf(e).flags.root, undefined);
});

test('[敌能-76] one charge blows 3.2 s after the cast starts, for 250% ATK physical, and the other unit takes nothing', () => {
  const { c, w, e } = arena(wOf(5), [['guard', 1, 0], ['ground', 2, 2]]);
  const carrier = op(w, 'ground'), other = op(w, 'guard');
  if (!carrier || !other) throw new Error('missing operators');
  assert.equal(FUSE, 96);
  assert.equal(plants(w).length, 1);
  assert.equal(carrier.buffs.some((b) => b.key === 'c4'), true);
  assert.equal(other.buffs.some((b) => b.key === 'c4'), false);
  assert.equal(attrs.statsOf(e).immobile, true);
  assert.deepEqual(hits(w, c, carrier.id, FUSE - 1), []);
  assert.equal(other.hp, other.maxHp);
  assert.deepEqual(hits(w, c, carrier.id, 1), [{ id: e.id, damage: 3000 }]);
  assert.equal(other.hp, other.maxHp);
  assert.equal(carrier.buffs.some((b) => b.key === 'c4'), false);
  assert.equal(attrs.statsOf(e).immobile, false);
});

test('[敌能-76] a stun during the cast blows the charge at once, and it does not blow again', () => {
  const { c, w, e } = arena(wOf(5), [['guard', 1, 0]]);
  const carrier = op(w, 'guard');
  if (!carrier) throw new Error('missing operator');
  status.applyStatus(e, 'stun', { seconds: 5 });
  assert.deepEqual(hits(w, c, carrier.id, 1), [{ id: e.id, damage: 3000 }]);
  assert.equal(carrier.buffs.some((b) => b.key === 'c4'), false);
  assert.equal(e.buffs.some((b) => b.key === 'root'), false);
  assert.deepEqual(hits(w, c, carrier.id, FUSE), []);
});

test('[敌能-76] a stunned W blows only its own charge: another W\'s charge on the same unit stays and blows on time', () => {
  const { c, w } = arena(wOf(5), [['guard', 1, 0]], { count: 2 });
  const carrier = op(w, 'guard'), [first, second] = w.units.filter((u) => u.key === KEY);
  if (!carrier || !first || !second) throw new Error('missing units');
  assert.deepEqual(plants(w).map((b) => b.src), [first.id, second.id]);
  status.applyStatus(first, 'stun', { seconds: 5 });
  assert.deepEqual(hits(w, c, carrier.id, 1), [{ id: first.id, damage: 3000 }]);
  assert.deepEqual(plants(w).map((b) => b.src), [second.id]);
  assert.deepEqual(hits(w, c, carrier.id, FUSE - 2), []);
  assert.deepEqual(hits(w, c, carrier.id, 1), [{ id: second.id, damage: 3000 }]);
});

test('[敌能-76] the cast ends only its own 自缚: a 束缚 put on W from elsewhere stays', () => {
  const { c, w, e } = arena(wOf(5), [['guard', 1, 0]]);
  status.applyStatus(e, 'root', { seconds: 10 });
  assert.equal(e.buffs.filter((b) => b.key === 'root').length, 2);
  for (let i = 0; i < FUSE; i++) step(w, c);
  assert.equal(e.ab['C4.ch'] ?? 0, 0, 'the cast is over');
  assert.equal(e.buffs.filter((b) => b.key === 'root').length, 1);
  assert.equal(attrs.statsOf(e).immobile, true);
});

test('[敌能-76] the blast on time takes the same path as the early one: a buff behaviour of the content halves both', () => {
  /** @type {import('@aue/sim').buffs.Behavior} */
  const halve = { take: (_w, _u, _b, amount) => amount / 2 };
  /** @param {any} c */
  const halving = (c) => { c.behaviors = { ...c.behaviors, buffs: { ...c.behaviors.buffs, halve } }; };
  const late = arena(wOf(5), [['guard', 1, 0]], { tune: halving }), early = arena(wOf(5), [['guard', 1, 0]], { tune: halving });
  const lateCarrier = op(late.w, 'guard'), earlyCarrier = op(early.w, 'guard');
  if (!lateCarrier || !earlyCarrier) throw new Error('missing operators');
  for (const u of [lateCarrier, earlyCarrier]) buffs.addBuff(u, buffs.makeBuff({ key: 'halve' }));
  status.applyStatus(early.e, 'stun', { seconds: 5 });
  assert.deepEqual(hits(early.w, early.c, earlyCarrier.id, 1), [{ id: early.e.id, damage: 1500 }]);
  assert.deepEqual(hits(late.w, late.c, lateCarrier.id, FUSE), [{ id: late.e.id, damage: 1500 }]);
});

test('[敌能-76] the first drop below half clears the cooldown once; the next cast plants three, a flyer among them', () => {
  const { c, w, e } = arena(wOf(5), [['guard', 1, 0], ['ground', 2, 2], ['sniper', 2, 3]]);
  const carrier = op(w, 'ground'), flyer = op(w, 'sniper'), guard = op(w, 'guard');
  if (!carrier || !flyer || !guard) throw new Error('missing operators');
  assert.equal(plants(w).length, 1);
  assert.equal(carrier.buffs.some((b) => b.key === 'c4'), true);
  assert.equal(flyer.buffs.some((b) => b.key === 'c4'), false);
  damage.setHp(e, e.maxHp / 2 - 1);
  step(w, c);
  assert.equal(e.ab['C4.cd'], 0);
  assert.equal(plants(w).length, 1);
  assert.deepEqual(hits(w, c, carrier.id, FUSE - 2), []);
  assert.deepEqual(hits(w, c, carrier.id, 1), [{ id: e.id, damage: 3000 }]);
  assert.equal(plants(w).length, 0);
  step(w, c);
  assert.equal(plants(w).length, 3);
  assert.equal(flyer.buffs.some((b) => b.key === 'c4' && b.src === e.id), true);
  assert.equal(guard.buffs.some((b) => b.key === 'c4'), true);
  const cd = e.ab['C4.cd'];
  assert.ok(cd > 1);
  damage.setHp(e, 1);
  step(w, c);
  assert.equal(e.ab['C4.cd'], cd - 1);
});

test('[敌能-76] a unit that leaves before the blast takes nothing', () => {
  const { c, w } = arena(wOf(5), [['guard', 1, 0]]);
  const carrier = op(w, 'guard');
  if (!carrier) throw new Error('missing operator');
  const id = carrier.id;
  assert.equal(carrier.buffs.some((b) => b.key === 'c4'), true);
  deck.withdraw(w, c, carrier);
  assert.equal(w.units.some((u) => u.id === id), false);
  assert.deepEqual(hits(w, c, id, FUSE), []);
});

test('[敌能-76] W dying during the cast blows the charge at once, sourced from W', () => {
  const { c, w, e } = arena(wOf(5), [['guard', 1, 0]]);
  const carrier = op(w, 'guard');
  if (!carrier) throw new Error('missing operator');
  damage.dealDamage(w, null, e, { type: 'true', amount: e.hp });
  assert.equal(e.hp, 0);
  assert.deepEqual(hits(w, c, carrier.id, 1), [{ id: e.id, damage: 3000 }]);
  assert.equal(w.units.some((u) => u.id === e.id), false);
  assert.deepEqual(hits(w, c, carrier.id, FUSE), []);
});
