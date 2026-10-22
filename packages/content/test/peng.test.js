// 抱蛋羽兽 / 拥霜羽兽 lose the egg after 失衡 (docs/spec/foes.md 敌能-57). Records are built here: these enemies are not
// in a loaded level yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, displacement, attrs, status, buffs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, withoutIncomplete } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const EGG = 'enemy_10141_xdpeng';
const FROST = 'enemy_10141_xdpeng_2';

/** @param {World} w @param {string} key @returns {Unit} */
function unit(w, key) {
  const u = w.units.find((x) => x.key === key);
  if (!u) throw new Error(`missing ${key}`);
  return u;
}

/** @param {Unit} e */
const egg = (e) => e.buffs.find((b) => b.key === 'lostEgg');

/** @param {any[]} events @param {number} id */
const hits = (events, id) => events.filter((ev) => ev.type === 'hit' && ev.id === id);

/**
 * @param {string} key @param {number} atk @param {number} maxHp @param {number} def @param {number} res
 */
function record(key, atk, maxHp, def, res) {
  return withFoeExtras(key, /** @type {any} */ ({
    name: key, maxHp, atk, def, res, moveSpeed: 0.7, baseAttackTime: 3.5, massLevel: 3,
    applyWay: 'RANGED', motion: 'WALK', rangeRadius: 1.5,
    talents: { speed: { move_speed: 2 } },
    skills: [{ key: 'switch', cooldown: 0, initCooldown: 0, sp: 0, bb: {} }],
  }));
}

/**
 * @param {string} key @param {any} def @param {(c: any) => void} [tweak]
 */
function open(key, def, tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  for (const op of Object.values(c.operators)) Object.assign(/** @type {object} */ (op), { cost: 0, maxHp: 1e7, atk: 0, def: 0 });
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = unit(w, key);
  e.x = 1;
  e.y = 1;
  status.applyStatus(e, 'root', {});
  return { c, w, e };
}

/** @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col */
const deploy = (w, c, op, row, col) => step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);

/** @param {World} w @param {any} c @param {Unit} e */
function hold(w, c, e) {
  deploy(w, c, 'guard', 1, 1);
  const g = unit(w, 'guard');
  assert.equal(e.blockedBy, g.id);
  return g;
}

/** @param {World} w @param {any} c @param {Unit} e */
function pushFrom(w, c, e) {
  assert.equal(displacement.push(w, c, e, 1, { from: { x: 0, y: 1 } }), true);
  assert.ok(e.slide);
}

/** Re-holds `by` through the slide. The mode has not started on any frame that still slides. @param {World} w @param {any} c @param {Unit} e @param {number} by */
function ride(w, c, e, by) {
  let frames = 0;
  while (e.slide && frames < 40) {
    assert.equal(egg(e), undefined);
    e.blockedBy = by;
    step(w, c);
    frames++;
  }
  return frames;
}

/** Steps until the egg drops, checking the block holds on every frame before that. @param {World} w @param {any} c @param {Unit} e @param {number} by */
function switchAfter(w, c, e, by) {
  let waited = 0;
  while (!egg(e) && waited < 4) {
    assert.equal(e.blockedBy, by);
    step(w, c);
    waited++;
  }
  return waited;
}

/** @param {World} w @param {any} c @param {Unit} e */
function framesUntil(w, c, e) {
  let waited = 0;
  while (!egg(e) && waited < 4) { step(w, c); waited++; }
  return waited;
}

/** @param {Unit} e @param {number} before */
function mode(e, before) {
  assert.ok(egg(e));
  assert.equal(e.buffs.filter((b) => b.key === 'lostEgg').length, 1);
  const s = attrs.statsOf(e);
  assert.equal(s.flags.noAttack, true);
  assert.equal(s.flags.unblockable, true);
  assert.equal(s.prod.moveMul, 2);
  assert.equal(s.moveSpeed, before * 2);
}

/** Back on the guard: no block, no swing, no hit. @param {World} w @param {any} c @param {Unit} e @param {Unit} guard */
function quiet(w, c, e, guard) {
  e.x = 1;
  e.y = 1;
  e.atkCd = 0;
  const hp = guard.hp;
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < 8; i++) ev.push(...step(w, c).filter((x) => x.id === e.id && (x.type === 'attack' || x.type === 'shot' || x.type === 'hit')));
  assert.equal(ev.length, 0);
  assert.equal(e.blockedBy, -1);
  assert.equal(guard.hp, hp);
  assert.equal(e.swing, null);
}

/** @param {World} w @param {any} c @param {number} id */
function untilHit(w, c, id) {
  /** @type {any[]} */
  const got = [];
  for (let i = 0; i < 12 && got.length === 0; i++) got.push(...hits(step(w, c), id));
  return got;
}

test('[敌能-57] [敌能-2] no switch before 失衡; after the slide ends it is unblocked, not attacking, at ×2 speed', () => {
  for (const [key, atk, hp, def, res] of /** @type {const} */ ([
    [EGG, 300, 7500, 150, 15],
    [FROST, 400, 10000, 200, 20],
  ])) {
    const { w, c, e } = open(key, record(key, atk, hp, def, res));
    const before = attrs.statsOf(e).moveSpeed;
    for (let i = 0; i < 20; i++) step(w, c);
    assert.equal(egg(e), undefined);
    assert.equal(attrs.statsOf(e).moveSpeed, before);
    assert.equal(attrs.statsOf(e).flags.unblockable, undefined);
    const guard = hold(w, c, e);
    pushFrom(w, c, e);
    assert.ok(ride(w, c, e, guard.id) >= 1);
    assert.equal(e.blockedBy, -1);
    mode(e, before);
    quiet(w, c, e, guard);
  }
});

test('[敌能-57] [敌能-33] it does not attack a flying unit, and it does attack a ground unit before any 失衡', () => {
  const { w, c, e } = open(EGG, record(EGG, 300, 7500, 150, 15), (cc) => { cc.operators.guard.motion = 'FLY'; });
  assert.equal(egg(e), undefined);
  e.atkCd = 0;
  const blocked = deploy(w, c, 'guard', 1, 1);
  const guard = unit(w, 'guard');
  assert.equal(e.blockedBy, guard.id);
  assert.equal(hits(blocked, e.id).length, 0);
  deploy(w, c, 'sniper', 2, 2);
  const sniper = unit(w, 'sniper');
  const got = untilHit(w, c, e.id);
  assert.equal(got.length, 1);
  assert.equal(got[0].target, sniper.id);
  assert.equal(guard.hp, guard.maxHp);
  assert.ok(sniper.hp < sniper.maxHp);
  assert.equal(egg(e), undefined);
});

test('[敌能-57] silence and a noAttack flag do not stop the forced trigger', () => {
  const { w, c, e } = open(EGG, record(EGG, 300, 7500, 150, 15));
  buffs.addBuff(e, buffs.makeBuff({ key: 'silence', flags: { silence: true }, left: 90 }));
  buffs.addBuff(e, buffs.makeBuff({ key: 'disarm', flags: { noAttack: true }, left: 90 }));
  pushFrom(w, c, e);
  ride(w, c, e, -1);
  assert.ok(egg(e));
  assert.ok(e.buffs.some((b) => b.key === 'silence'));
  assert.ok(e.buffs.some((b) => b.key === 'disarm'));
});

test('[敌能-57] [敌能-2] stun holds the try; once it can act, the switch lands within 0.1 s and lets the block go', () => {
  const { w, c, e } = open(EGG, record(EGG, 300, 7500, 150, 15));
  const guard = hold(w, c, e);
  const stun = status.applyStatus(e, 'stun', { seconds: 30 });
  assert.ok(stun);
  pushFrom(w, c, e);
  ride(w, c, e, guard.id);
  assert.equal(egg(e), undefined);
  assert.equal(e.blockedBy, guard.id);
  stun.left = 1;
  assert.equal(switchAfter(w, c, e, guard.id), 3);
  assert.equal(e.blockedBy, -1);
  mode(e, 0.7);
});

test('[敌能-57] freeze delays the switch; sleep does not', () => {
  const frozen = open(EGG, record(EGG, 300, 7500, 150, 15));
  assert.ok(status.applyStatus(frozen.e, 'freeze', { seconds: 30 }));
  pushFrom(frozen.w, frozen.c, frozen.e);
  ride(frozen.w, frozen.c, frozen.e, -1);
  assert.equal(egg(frozen.e), undefined);
  const asleep = open(FROST, record(FROST, 400, 10000, 200, 20));
  assert.ok(status.applyStatus(asleep.e, 'sleep', { seconds: 30 }));
  pushFrom(asleep.w, asleep.c, asleep.e);
  ride(asleep.w, asleep.c, asleep.e, -1);
  assert.ok(egg(asleep.e));
  assert.ok(asleep.e.buffs.some((b) => b.key === 'sleep'));
});

test('[敌能-57] [敌能-2] 浮空 ending the slide does not switch until 浮空 ends, then within 0.1 s', () => {
  const { w, c, e } = open(EGG, record(EGG, 300, 7500, 150, 15));
  pushFrom(w, c, e);
  step(w, c);
  assert.ok(e.slide);
  assert.equal(egg(e), undefined);
  assert.ok(status.applyStatus(e, 'levitate', { seconds: 1 }));
  step(w, c);
  assert.equal(e.slide, undefined);
  assert.equal(egg(e), undefined);
  let frames = 0;
  while (e.buffs.some((b) => b.key === 'levitate') && frames < 80) {
    assert.equal(egg(e), undefined);
    step(w, c);
    frames++;
  }
  assert.equal(e.buffs.some((b) => b.key === 'levitate'), false);
  const waited = egg(e) ? 0 : framesUntil(w, c, e);
  assert.ok(waited <= 3);
  assert.ok(egg(e));
});

test('[敌能-57] a later 失衡 before the switch tries on that end and recounts 0.1 s', () => {
  const { w, c, e } = open(EGG, record(EGG, 300, 7500, 150, 15));
  const first = status.applyStatus(e, 'stun', { seconds: 30 });
  assert.ok(first);
  pushFrom(w, c, e);
  ride(w, c, e, -1);
  assert.equal(egg(e), undefined);
  first.left = 1;
  step(w, c);
  assert.equal(egg(e), undefined);
  const again = status.applyStatus(e, 'stun', { seconds: 30 });
  assert.ok(again);
  pushFrom(w, c, e);
  ride(w, c, e, -1);
  assert.equal(egg(e), undefined);
  again.left = 1;
  assert.equal(framesUntil(w, c, e), 3);
  mode(e, 0.7);
});

test('[敌能-57] a second 失衡 does not switch again or stack the speed', () => {
  const { w, c, e } = open(EGG, record(EGG, 300, 7500, 150, 15));
  pushFrom(w, c, e);
  ride(w, c, e, -1);
  mode(e, 0.7);
  const speed = attrs.statsOf(e).moveSpeed;
  pushFrom(w, c, e);
  while (e.slide) step(w, c);
  assert.equal(e.buffs.filter((b) => b.key === 'lostEgg').length, 1);
  assert.equal(attrs.statsOf(e).moveSpeed, speed);
  assert.equal(attrs.statsOf(e).prod.moveMul, 2);
});

test('[敌能-57] a missing every still tries on the end frame and does not invent 0.1', () => {
  const def = {
    name: 'bare', maxHp: 7500, atk: 300, def: 150, res: 15, moveSpeed: 0.7, baseAttackTime: 3.5, massLevel: 3,
    applyWay: 'RANGED', motion: 'WALK', rangeRadius: 1.5,
    talents: { speed: { move_speed: 2 } },
    skills: [{ key: 'switch', cooldown: 0, initCooldown: 0, sp: 0, bb: { egg: 1 } }],
  };
  const once = open('bare', def);
  pushFrom(once.w, once.c, once.e);
  ride(once.w, once.c, once.e, -1);
  assert.ok(egg(once.e));
  const held = open('bare', def);
  const stun = status.applyStatus(held.e, 'stun', { seconds: 30 });
  assert.ok(stun);
  pushFrom(held.w, held.c, held.e);
  ride(held.w, held.c, held.e, -1);
  assert.equal(egg(held.e), undefined);
  stun.left = 1;
  for (let i = 0; i < 6; i++) step(held.w, held.c);
  assert.equal(egg(held.e), undefined);
});

/** The two read pages' markers. Optional chains live here so the test stays under the complexity limit. @param {import('@aue/sim').EnemyDef} rec */
function pageMarkers(rec) {
  const talents = rec.talents;
  const skill = rec.skills && rec.skills[0];
  if (!talents || !skill) throw new Error(`missing markers on ${rec.name}`);
  assert.equal(talents.speed.every, 0.1);
  assert.equal(talents.speed.move_speed, 2);
  assert.deepEqual(talents.noFly, {});
  assert.equal(skill.bb.egg, 1);
}

/** Stripping an incomplete ability must leave the read enemy's mode in place. @param {import('@aue/sim').EnemyDef} rec */
function keptSwitch(rec) {
  const kept = withoutIncomplete(rec);
  const talents = kept.talents;
  const skill = kept.skills && kept.skills[0];
  if (!talents || !skill) throw new Error(`stripped ${rec.name}`);
  assert.equal(skill.key, 'switch');
  assert.equal(talents.speed.move_speed, 2);
  assert.deepEqual(talents.noFly, {});
}

test('[敌能-57] [关卡-2] other switch and speed users stay uncovered', () => {
  const turtle = /** @type {import('@aue/sim').EnemyDef} */ ({
    name: 't', maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1,
    skills: [{ key: 'switch', cooldown: 0, initCooldown: 0, bb: {} }],
  });
  const pheid = /** @type {import('@aue/sim').EnemyDef} */ ({
    name: 'p', maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1,
    talents: { speed: { interval: 1, 'enemy_mnzeno_speed_up.move_speed': 0.1, 'enemy_mnzeno_speed_down.move_speed': -0.2, value: 1.5 } },
  });
  assert.deepEqual(uncoveredAbilities([turtle, pheid]), ['switch', 'speed']);
  assert.deepEqual(withoutIncomplete(turtle).skills, []);
  assert.deepEqual(withoutIncomplete(pheid).talents, {});
  const eggRec = record(EGG, 300, 7500, 150, 15);
  const frost = record(FROST, 400, 10000, 200, 20);
  assert.deepEqual(uncoveredAbilities([eggRec, frost]), []);
  pageMarkers(eggRec);
  pageMarkers(frost);
  keptSwitch(eggRec);
});
