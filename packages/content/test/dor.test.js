// The Dor series' `Driver` (docs/spec/foes.md 敌能-163). None of them is in a shipped level: the records are the level-0
// enemy_database figures (ArknightsGameData 17759cc8). `Driver` acts on an inactive R-series power armour, a device no
// level of the engine has: the talent is covered and does nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, stateHash, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const DOR1 = 'enemy_1251_lysyta';

/** The six records, level 0: [key, name, maxHp, atk, def, moveSpeed, baseAttackTime, sp, elite]. */
const SIX = /** @type {const} */ ([
  [DOR1, 'Dor-1号失败品', 2750, 310, 0, 1.5, 1.8, 50, false],
  ['enemy_1251_lysyta_2', 'Dor-α号失败品', 3200, 360, 50, 1.5, 1.8, 50, false],
  ['enemy_1252_lysytb', 'Dor-2号复制体', 8000, 390, 0, 0.9, 3.2, 50, false],
  ['enemy_1252_lysytb_2', 'Dor-β号复制体', 9000, 420, 50, 0.9, 3.2, 50, false],
  ['enemy_1253_lysytc', 'Dor-3号改造体', 5000, 500, 1000, 0.8, 3, 100, true],
  ['enemy_1253_lysytc_2', 'Dor-γ号改造体', 7500, 600, 1200, 0.8, 3, 100, true],
]);

/** A record as the data has it; `driver` replaces the talent's blackboard, null drops it. @param {typeof SIX[number]} row @param {Record<string, unknown> | null} [driver] @returns {EnemyDef} */
function dor(row, driver) {
  const [, name, maxHp, atk, def, moveSpeed, baseAttackTime, sp, elite] = row;
  /** @type {Record<string, unknown>} */
  const talents = {};
  if (driver !== null) talents.Driver = driver ?? { sp };
  if (elite) talents.DamageReduce = { damage_resistance: 0.5 };
  return /** @type {any} */ ({ name, maxHp, atk, def, res: 50, moveSpeed, baseAttackTime, rangeRadius: -1, applyWay: 'MELEE', motion: 'WALK', talents });
}

/** @param {string} key @param {EnemyDef} def @returns {string[]} */
const gaps = (key, def) => uncoveredAbilities([withFoeExtras(key, def)]);

test('[敌能-163] [关卡-2] the six records are covered as the data has them; a missing key, an extra key or a non-number stays uncovered', () => {
  assert.deepEqual(SIX.map((row) => gaps(row[0], dor(row))), [[], [], [], [], ['DamageReduce'], ['DamageReduce']]);
  assert.deepEqual(gaps(DOR1, dor(SIX[0], {})), ['Driver']);
  assert.deepEqual(gaps(DOR1, dor(SIX[0], { sp: 50, range: 1 })), ['Driver']);
  assert.deepEqual(gaps(DOR1, dor(SIX[0], { sp: '50' })), ['Driver']);
});

/**
 * The tiny map with one Dor-1号失败品 (with `Driver` as the data has it, or without the talent) and, when `guard`, a guard
 * on its road at (1, 2) that knocks it down. @param {boolean} driver @param {boolean} guard
 */
function lane(driver, guard) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [DOR1]: withFoeExtras(DOR1, dor(SIX[0], driver ? undefined : null)) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, DOR1)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators.guard = { ...c.operators.guard, cost: 0, atk: 900, maxHp: 1e6, blockCnt: 1 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, guard ? [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]] : []);
  return { c, w };
}

/** Each frame's units (kind, position, HP, blocker) and events for n frames. @param {{ c: any, w: World }} l @param {number} n */
function frames(l, n) {
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const ev = step(l.w, l.c);
    out.push(JSON.stringify([l.w.units.map((u) => [u.kind, u.x, u.y, u.hp, u.blockedBy ?? null]), ev.map((e) => e.type)]));
  }
  return out;
}

test('[敌能-163] Driver does nothing: a blocked Dor-1号失败品 fights and falls as one without the talent; an unblocked one walks on to the goal', () => {
  const a = lane(true, true), b = lane(false, true), seen = frames(a, 30 * 12);
  assert.deepEqual(seen, frames(b, 30 * 12));
  assert.ok(seen.some((f) => JSON.parse(f)[0].some((/** @type {any[]} */ u) => u[0] === KIND.ENEMY && u[4] !== null && u[4] >= 0)), 'it was blocked');
  assert.equal(stateHash(a.w), stateHash(b.w));
  assert.equal(a.w.units.some((u) => u.kind === KIND.ENEMY), false, 'the guard knocked it down');
  const free = lane(true, false);
  let goal = false;
  for (let i = 0; i < 30 * 30 && !goal; i++) {
    goal = step(free.w, free.c).some((e) => e.type === 'goal');
    if (!goal) assert.equal(free.w.units.filter((u) => u.kind === KIND.ENEMY).length, 1, 'still on the field until the goal');
  }
  assert.equal(goal, true);
});
