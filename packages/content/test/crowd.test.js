// 圆仔 and the two 驮兽补给员 (docs/spec/foes.md 敌能-119): they face the side with more of our operators — 圆仔 always,
// the 驮兽补给员 while not blocked — and take less from the front (敌能-118). None of them is in a shipped level: the
// records are built from the database's level-0 talents, the pages' extras merged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage } from '@aue/sim';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit */

const TILE = Object.freeze({ key: 'tile_road', height: 'LOWLAND', buildable: 'ALL', passable: 'ALL', side: 'ALL' });
const ROUND = 'enemy_2085_skzjxd', PACK = 'enemy_4007_murino', SHY = 'enemy_4007_murino_2';

/** The database's level-0 talents (圆仔 also has ShowTrigger and the skill Show, not this clause's). @param {string} key */
function foe(key) {
  const resist = key === ROUND ? 0.8 : key === PACK ? 0.85 : 0.95;
  return {
    name: key, maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 1, baseAttackTime: 3, massLevel: 1, motion: 'WALK',
    applyWay: 'MELEE', rangeRadius: 0,
    talents: { Weakness: { damage_resistance: resist }, ...(key === ROUND ? { ShowTrigger: { interval: 30 } } : {}) },
  };
}

/** @param {string} name @param {'RANGED' | 'MELEE'} position */
const operator = (name, position = 'RANGED') => ({
  name, position, cost: 0, blockCnt: 1, baseAttackTime: 1, maxHp: 1e6, atk: 0, def: 0, res: 0, range: [{ row: 0, col: 0 }],
});

/** @param {any} w @param {string} key */
function byKey(w, key) {
  const u = w.units.find((/** @type {Unit} */ x) => x.key === key);
  assert.ok(u, key);
  return /** @type {Unit} */ (u);
}

/**
 * The enemy held on row 1, column `col`, or walking row 1 from column 0 to 7 (`walk`). Operators o0…o7 go on row 0,
 * a row away, so they do not block it; `guard` is a melee one that does.
 * @param {string} key @param {{ col?: number, walk?: boolean }} [o]
 */
function open(key, o = {}) {
  const col = o.col ?? 4;
  const route = o.walk ? { start: { row: 1, col: 0 }, end: { row: 1, col: 7 }, motion: 'WALK', checkpoints: [] }
    : { start: { row: 1, col }, end: { row: 1, col: 0 }, motion: 'WALK', checkpoints: [{ type: 'WAIT_FOR_SECONDS', row: 1, col, time: 999, dx: 0, dy: 0 }] };
  const ops = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`o${i}`, operator(`o${i}`)]));
  const c = /** @type {any} */ ({
    level: {
      id: 'c', width: 8, height: 3, tiles: Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => TILE)), routes: [route],
      waves: [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions: [{ type: 'SPAWN', key, route: 0, count: 1, preDelay: 0, interval: 1 }] }] }],
      options: { maxLifePoint: 99, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 9, moveMultiplier: 1 },
    },
    enemies: { [key]: withFoeExtras(key, foe(key)) },
    operators: { ...ops, guard: operator('guard', 'MELEE') },
    behaviors: skeletonContent.behaviors,
  });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { w, c, e: byKey(w, key) };
}

/** Deploys operators at (row, col) in one frame. @param {{ w: any, c: any }} box @param {[string, number, number][]} at */
function place(box, at) {
  step(box.w, box.c, at.map(([op, row, col]) => /** @type {[number, any]} */ ([0, { type: 'deploy', op, row, col, dir: 0 }])));
}

/** @param {{ w: any, c: any }} box @param {string} op */
function retreat(box, op) {
  step(box.w, box.c, [[0, { type: 'retreat', unit: byKey(box.w, op).id }]]);
}

test('[敌能-119] 圆仔 faces the side with more operators, keeps its facing on a tie, and does not count its own column', () => {
  const box = open(ROUND);
  assert.equal(box.e.lr, undefined, 'right, as it appeared');
  place(box, [['o1', 0, 1], ['o2', 0, 2], ['o6', 0, 6], ['o4', 0, 4]]);
  assert.equal(box.e.lr, -1, 'two on its left, one on its right; the one in its column does not count');
  place(box, [['o5', 0, 5], ['o7', 0, 7]]);
  assert.equal(box.e.lr, undefined, 'three on its right');
  retreat(box, 'o7');
  assert.equal(box.e.lr, undefined, 'two and two: it keeps facing right');
});

test('[敌能-119] the crowd outweighs the walk: walking right, 圆仔 faces left while more of ours are on its left', () => {
  const box = open(ROUND, { walk: true });
  place(box, [['o0', 0, 0], ['o1', 0, 1]]);
  for (let i = 0; i < 90; i++) step(box.w, box.c);
  assert.ok(box.e.x > 2.5, `it walked right, to ${box.e.x}`);
  assert.equal(box.e.lr, -1);
});

test('[敌能-119] a summon is not an operator: it does not count', () => {
  const box = open(ROUND);
  place(box, [['o1', 0, 1], ['o6', 0, 6], ['o7', 0, 7]]);
  assert.equal(box.e.lr, undefined, 'two on its right');
  byKey(box.w, 'o6').summoner = byKey(box.w, 'o1').id;
  byKey(box.w, 'o7').summoner = byKey(box.w, 'o1').id;
  step(box.w, box.c);
  assert.equal(box.e.lr, -1, 'only the operator on its left counts');
});

test('[敌能-119] 驮兽补给员 turns by the crowd only while not blocked; blocked, it faces its blocker', () => {
  const box = open(PACK, { walk: true });
  place(box, [['o0', 0, 0], ['o1', 0, 1], ['o2', 0, 2], ['guard', 1, 5]]);
  for (let i = 0; i < 150 && box.e.x < 3.2; i++) step(box.w, box.c);
  assert.ok(box.e.x >= 3.2, `walked to ${box.e.x}`);
  assert.equal(box.e.lr, -1, 'walking right, not blocked: it faces the three on its left');
  for (let i = 0; i < 150 && box.e.blockedBy < 0; i++) step(box.w, box.c);
  assert.equal(box.e.blockedBy, byKey(box.w, 'guard').id);
  step(box.w, box.c);
  assert.equal(box.e.lr, undefined, 'blocked from its right: it faces the guard, not the three on its left');
});

test('[敌能-119] [敌能-118] from the front 圆仔 takes 20%, 驮兽补给员 15%, 「胆小如鼷」 5%; from behind all of it', () => {
  for (const [key, keep] of [[ROUND, 0.2], [PACK, 0.15], [SHY, 0.05]]) {
    const box = open(/** @type {string} */ (key));
    place(box, [['o1', 0, 1], ['o6', 0, 6], ['o7', 0, 7]]);
    assert.equal(box.e.lr, undefined, `${key} faces right`);
    const hp = box.e.hp;
    damage.dealDamage(box.w, byKey(box.w, 'o6'), box.e, { type: 'phys', amount: 1000 }, box.c);
    const front = hp - box.e.hp;
    damage.dealDamage(box.w, byKey(box.w, 'o1'), box.e, { type: 'arts', amount: 1000 }, box.c);
    const back = hp - front - box.e.hp;
    assert.ok(Math.abs(front - 1000 * /** @type {number} */ (keep)) < 1e-6, `${key} front ${front}`);
    assert.ok(Math.abs(back - 1000) < 1e-6, `${key} back ${back}`);
  }
});

test('[敌能-119] the three are covered but for 圆仔\'s ShowTrigger; 圆仔 cannot be blocked', () => {
  assert.deepEqual(uncoveredAbilities([withFoeExtras(ROUND, foe(ROUND))]), ['ShowTrigger']);
  assert.deepEqual(uncoveredAbilities([withFoeExtras(PACK, foe(PACK)), withFoeExtras(SHY, foe(SHY))]), []);
  assert.deepEqual(withFoeExtras(ROUND, foe(ROUND)).talents?.unblockable, {});
});
