// 量产巨像 / 改进型量产巨像 (docs/spec/foes.md 敌能-120). Records come from IG-DF-1, not a hand-built stat block.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, damage, blocking } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelContent, levelAt } from '../src/index.js';
import { uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const MASS = 'enemy_1240_ltgint';
const NEXT = 'enemy_1240_ltgint_2';
const KEYS = [MASS, NEXT];

const normal = levelContent('act1multi_fortress_rm01', 'NORMAL');
const four = levelContent('act1multi_fortress_rm01', 'FOUR_STAR');

/**
 * The level's enemy after extras, not mutated.
 * @param {string} key @param {'NORMAL' | 'FOUR_STAR'} [difficulty] @returns {EnemyDef}
 */
function record(key, difficulty = 'NORMAL') {
  const e = (difficulty === 'FOUR_STAR' ? four : normal).enemies[key];
  if (!e) throw new Error(`missing ${key}`);
  return e;
}

/**
 * One real colossus on the tiny map. A weight-1 slime, when asked, spawns ahead of it.
 * @param {string} key @param {number} blockCnt @param {boolean} withSlime @param {'NORMAL' | 'FOUR_STAR'} [difficulty]
 */
function field(key, blockCnt, withSlime, difficulty = 'NORMAL') {
  const c = /** @type {any} */ (tinyContent());
  const spawns = [spawnAt(0, key)];
  c.enemies = { [key]: { ...record(key, difficulty) } };
  if (withSlime) {
    c.enemies.slime = { name: 'slime', maxHp: 1e7, atk: 0, def: 0, res: 0, moveSpeed: 1 };
    spawns.unshift(spawnAt(0, 'slime'));
  }
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(spawns)];
  c.level.options = { ...c.level.options, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators.guard = { ...c.operators.guard, atk: 0, def: 0, blockCnt, maxHp: 1e7, cost: 0 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 0, dir: 0 }]]);
  const e = w.units.find((u) => u.key === key);
  const g = w.units.find((u) => u.key === 'guard');
  const slime = withSlime ? w.units.find((u) => u.key === 'slime') : null;
  if (!e || !g || (withSlime && !slime)) throw new Error(`missing units for ${key}`);
  return { c, w, e, g, slime: /** @type {Unit} */ (slime) };
}

/**
 * Walks until the route's wait is over. Notes a visit inside the block radius while not blocked.
 * @param {string} key @param {number} blockCnt @param {boolean} withSlime
 */
function walked(key, blockCnt, withSlime) {
  const box = field(key, blockCnt, withSlime);
  let blocked = false, inside = false;
  for (let i = 0; i < 400; i++) {
    step(box.w, box.c);
    if (box.e.blockedBy >= 0) blocked = true;
    const dx = box.e.x - box.g.x, dy = box.e.y - box.g.y;
    if (box.e.blockedBy < 0 && dx * dx + dy * dy < 0.49) inside = true;
  }
  return { ...box, blocked, inside };
}

/** Holds a unit on a point so the next block check sees it there. @param {Unit} u @param {number} x @param {number} y */
const pin = (u, x, y) => { u.x = x; u.y = y; status.applyStatus(u, 'root', {}); };

/** The file enemy has only Weak and no block count; the loaded one adds block 2. @param {EnemyDef | undefined} file @param {string} key */
function fileShape(file, key) {
  if (!file || !file.talents) throw new Error(key);
  assert.equal(file.blockCnt, undefined, key);
  assert.deepEqual(Object.keys(file.talents), ['Weak']);
  const live = record(key);
  const talents = live.talents;
  const immune = live.immune;
  if (!talents || !immune) throw new Error(key);
  assert.equal(live.blockCnt, undefined, key);
  assert.deepEqual(talents.blockSlots, { block: 2 });
  assert.equal(immune.includes('sleep'), true, key);
}

/** Whether a level's gap list names an ability. @param {readonly string[] | undefined} list @param {string} name */
const listed = (list, name) => (list ?? []).includes(name);

test('[敌能-120] the level record has no blockCnt; block 2 is a separate talent; Weak stays uncovered', () => {
  const raw = levelAt('act1multi_fortress_rm01', 'NORMAL');
  for (const key of KEYS) fileShape(raw.enemies[key], key);
  const mass = record(MASS).talents;
  const next = record(NEXT).talents;
  if (!mass || !next) throw new Error('talents');
  assert.deepEqual(mass.Weak, { def: -1000, magic_resistance: -50 });
  assert.deepEqual(next.Weak, { def: -1200, magic_resistance: -50 });
  assert.equal(record(MASS).def, 1200);
  assert.equal(record(MASS).res, 50);
  assert.equal(record(NEXT).def, 1400);
  assert.equal(record(NEXT).res, 50);
  assert.equal(listed(normal.level.uncovered, 'Weak'), true);
  assert.equal(listed(normal.level.uncovered, 'blockSlots'), false);
  assert.equal(listed(four.level.uncovered, 'Weak'), true);
  assert.equal(listed(four.level.uncovered, 'blockSlots'), false);
  assert.equal(record(MASS, 'FOUR_STAR').def, 1440);
  assert.equal(record(NEXT, 'FOUR_STAR').def, 1680);
  const hard = levelAt('act1multi_fortress_hard-01', 'NORMAL');
  assert.equal(Object.hasOwn(hard.enemies, MASS), false);
  assert.equal(Object.hasOwn(hard.enemies, NEXT), false);
});

test('[敌能-120] block 1 lets both walk through; block 2 and 3 hold them at a cost of 2', () => {
  for (const key of KEYS) {
    const past = walked(key, 1, false);
    assert.equal(past.blocked, false, key);
    assert.equal(past.inside, true, key);
    assert.ok(past.e.x > 2, `${key} x ${past.e.x}`);
    assert.equal(attrs.statsOf(past.e).blockCnt, 2, key);
    assert.equal(attrs.statsOf(past.e).def, record(key).def, key);
    assert.equal(attrs.statsOf(past.e).res, 50, key);
    for (const n of [2, 3]) {
      const held = walked(key, n, false);
      assert.equal(held.blocked, true, `${key} block ${n}`);
      assert.equal(attrs.statsOf(held.e).blockCnt, 2, key);
      assert.equal(blocking.blockLoad(held.w, held.g), 2, key);
      assert.ok(held.e.x < 0.5, `${key} block ${n} x ${held.e.x}`);
      assert.equal(attrs.statsOf(held.e).def, record(key).def, key);
    }
  }
});

test('[敌能-120] [阻挡-2] a block-2 guard already holding one slot cannot take either', () => {
  for (const key of KEYS) {
    const box = field(key, 2, true);
    pin(box.e, box.g.x, box.g.y);
    pin(box.slime, box.g.x, box.g.y);
    step(box.w, box.c);
    assert.equal(box.slime.blockedBy, box.g.id, key);
    assert.equal(box.e.blockedBy, -1, key);
    assert.equal(blocking.blockLoad(box.w, box.g), 1, key);
    damage.dealDamage(box.w, null, box.slime, { type: 'true', amount: 1e9 });
    step(box.w, box.c);
    step(box.w, box.c);
    assert.equal(box.e.blockedBy, box.g.id, key);
    assert.equal(blocking.blockLoad(box.w, box.g), 2, key);
  }
});

test('[敌能-120] [阻挡-1] freeing the slot does not pull back one that already walked out', () => {
  const past = walked(MASS, 2, true);
  assert.equal(past.blocked, false);
  assert.equal(past.inside, true);
  assert.ok(past.e.x > 2, `x ${past.e.x}`);
  assert.equal(past.slime.blockedBy, past.g.id);
  damage.dealDamage(past.w, null, past.slime, { type: 'true', amount: 1e9 });
  step(past.w, past.c);
  step(past.w, past.c);
  assert.equal(past.e.blockedBy, -1);
});

test('[敌能-120] silence stays and does not remove the block buff; sleep does not take effect', () => {
  const box = field(NEXT, 1, false);
  assert.ok(status.applyStatus(box.e, 'silence', {}));
  assert.equal(attrs.statsOf(box.e).flags.silence, true);
  assert.equal(attrs.statsOf(box.e).blockCnt, 2);
  const b = box.e.buffs.find((x) => x.key === 'colossusBlock');
  if (!b) throw new Error('missing colossusBlock');
  assert.equal(b.mods.blockCnt, 1);
  assert.equal(b.left, -1);
  status.applyStatus(box.e, 'sleep', {});
  assert.notEqual(attrs.statsOf(box.e).flags.sleep, true);
  assert.equal(attrs.statsOf(box.e).blockCnt, 2);
});

test('[敌能-120] four-star still costs 2 and keeps the multiplied defence', () => {
  for (const [key, def] of /** @type {[string, number][]} */ ([[MASS, 1440], [NEXT, 1680]])) {
    const box = field(key, 2, false, 'FOUR_STAR');
    assert.equal(attrs.statsOf(box.e).blockCnt, 2, key);
    assert.equal(attrs.statsOf(box.e).def, def, key);
    assert.equal(attrs.statsOf(box.e).res, 50, key);
    let held = false;
    for (let i = 0; i < 80 && !held; i++) {
      step(box.w, box.c);
      held = box.e.blockedBy === box.g.id;
    }
    assert.equal(held, true, key);
    assert.equal(blocking.blockLoad(box.w, box.g), 2, key);
    assert.equal(attrs.statsOf(box.e).def, def, key);
  }
});

test('[敌能-120] Weak without this talent stays uncovered, and another Weak shape still costs 1', () => {
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ ({ talents: { blockSlots: {} } })]), ['blockSlots']);
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ ({ talents: { blockSlots: { block: 2 } } })]), []);
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ ({ talents: { Weak: { value: 500 } } })]), ['Weak']);
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { holo: { name: 'holo', maxHp: 100, atk: 0, def: 10, res: 0, moveSpeed: 1, talents: { Weak: { value: 500 } } } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, 'holo')])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.key === 'holo');
  if (!e) throw new Error('missing holo');
  assert.equal(attrs.statsOf(e).blockCnt, 1);
  assert.equal(e.buffs.some((b) => b.key === 'colossusBlock'), false);
  assert.equal(attrs.statsOf(e).def, 10);
});
