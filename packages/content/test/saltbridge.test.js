// 架桥船工 and 扶桥老手's 施工, 寻险水手 and 历险水手's `MoveSpeedUp` (docs/spec/foes.md 敌能-165). None is in a shipped level:
// the records are the level-0 enemy_database figures (ArknightsGameData 17759cc8). Both need 悬索桥 terrain or the
// 盐坨子炮, which no level of the engine has: they are covered and do nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const BUILDER = 'enemy_10042_prtrop';
const SAILOR = 'enemy_10043_sailor';
const BRIDGE = { bridge_duration: 150, loop_duration: 5, time_each_tile: 2, interval: 2, extra_skill_time: 1 };
const SPEED = { move_speed: 2, speed_up_duration: 1 };

/** 架桥船工 / 扶桥老手 as the data has them, `bb` replacing 施工's blackboard, null dropping it. @param {boolean} elder @param {Record<string, unknown> | null} [bb] @returns {EnemyDef} */
function builder(elder, bb) {
  const skills = bb === null ? [] : [{ key: 'BuildBridge', initCooldown: 0, cooldown: 0, sp: 0, bb: bb ?? BRIDGE }];
  return /** @type {any} */ ({ name: elder ? '扶桥老手' : '架桥船工', maxHp: elder ? 8000 : 6000, atk: elder ? 720 : 600, def: elder ? 300 : 150, res: 30,
    moveSpeed: 0.65, baseAttackTime: 2, rangeRadius: -1, applyWay: 'MELEE', motion: 'WALK', levelType: 'NORMAL', massLevel: 4, talents: {}, skills });
}

/** 寻险水手 / 历险水手 as the data has them; `speed` replaces `MoveSpeedUp`, null drops it. @param {boolean} elder @param {Record<string, unknown> | null} [speed] @returns {EnemyDef} */
function sailor(elder, speed) {
  /** @type {Record<string, unknown>} */
  const talents = { 1: { 'attack@ep_damage_ratio': 0.3 } };
  if (speed !== null) talents.MoveSpeedUp = speed ?? SPEED;
  return /** @type {any} */ ({ name: elder ? '历险水手' : '寻险水手', maxHp: elder ? 6500 : 5500, atk: elder ? 420 : 350, def: elder ? 60 : 50, res: 10,
    moveSpeed: 0.9, baseAttackTime: 2, rangeRadius: -1, applyWay: 'MELEE', motion: 'WALK', levelType: 'NORMAL', massLevel: 1, talents });
}

/** @param {string} key @param {EnemyDef} def @returns {string[]} */
const gaps = (key, def) => uncoveredAbilities([withFoeExtras(key, def)]);

test('[敌能-165] [关卡-2] 施工 and the sailors\' MoveSpeedUp are covered as the data has them; other shapes stay uncovered; the sailors\' talent 1 too', () => {
  assert.deepEqual([gaps(BUILDER, builder(false)), gaps(`${BUILDER}_2`, builder(true))], [[], []]);
  assert.deepEqual([gaps(SAILOR, sailor(false)), gaps(`${SAILOR}_2`, sailor(true))], [['1'], ['1']]);
  assert.deepEqual(gaps(BUILDER, builder(false, { ...BRIDGE, range: 1 })), ['BuildBridge']);
  const { interval: _, ...short } = BRIDGE;
  assert.deepEqual(gaps(BUILDER, builder(false, short)), ['BuildBridge']);
  assert.deepEqual(gaps(SAILOR, sailor(false, { move_speed: 2, speed_up_duration: '1' })), ['1', 'MoveSpeedUp']);
  assert.deepEqual(gaps(SAILOR, sailor(false, { move_speed: 2 })), ['1', 'MoveSpeedUp'], '反装甲步兵\'s shape');
});

/** The tiny map with `def` under `key` and, when `guard`, a guard on its road at (1, 2) that blocks it. @param {string} key @param {EnemyDef} def @param {boolean} guard */
function lane(key, def, guard) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: withFoeExtras(key, def) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators.guard = { ...c.operators.guard, cost: 0, atk: 0, maxHp: 1e6, blockCnt: 1 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, guard ? [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]] : []);
  return { c, w };
}

/** Each frame's units and events for n frames. @param {ReturnType<typeof lane>} l @param {number} n */
function frames(l, n) {
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    const ev = step(l.w, l.c);
    out.push(JSON.stringify([l.w.units.map((u) => [u.kind, u.x, u.y, u.hp, u.blockedBy ?? null]), ev.map((e) => e.type)]));
  }
  return out;
}

test('[敌能-165] they do nothing: a blocked 架桥船工 attacks as one without 施工; a 寻险水手 walks to the goal as one without MoveSpeedUp', () => {
  const a = lane(BUILDER, builder(false), true), b = lane(BUILDER, builder(false, null), true), seen = frames(a, 30 * 15);
  assert.deepEqual(seen, frames(b, 30 * 15), 'positions, HP, blocks and events (the skill\'s own cooldown is state of its own)');
  assert.ok(seen.some((f) => JSON.parse(f)[1].includes('attack')), 'it attacked its blocker');
  const s = lane(SAILOR, sailor(false), false), t = lane(SAILOR, sailor(false, null), false), walk = frames(s, 30 * 30);
  assert.deepEqual(walk, frames(t, 30 * 30));
  assert.ok(walk.some((f) => JSON.parse(f)[1].includes('goal')), 'it reached the goal');
  assert.equal(s.w.units.some((u) => u.kind === KIND.ENEMY), false);
});
