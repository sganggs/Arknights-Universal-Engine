// Enemy skill cooldowns far longer than any battle (docs/spec/foes.md 敌能-1): the data writes them for a skill that does
// not come back within a battle; extraction keeps them as they are. The fixture is 假想敌：铳 (enemy_9017_achunt_2) of
// enemy_database.json, ArknightsGameData 17759cc8, as it is there.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enemyOf } from '../src/index.js';
import { MAX_COOLDOWN } from '../src/enemies.js';
import achunt from './fixtures/enemy_9017_achunt_2.json' with { type: 'json' };

const KEY = 'enemy_9017_achunt_2';

test('[敌能-1] 假想敌：铳: its skill 3 with a cooldown of 10000000 s is read as it is; past 1e9 s a cooldown is refused', () => {
  const e = /** @type {any} */ (enemyOf({ enemies: [achunt] }, KEY));
  assert.deepEqual(e.skills.map((/** @type {any} */ s) => [s.key, s.cooldown, s.initCooldown, s.sp]), [['1', 30, 10, 0], ['2', 45, 20, 0], ['3', 1e7, 0, 0]]);
  assert.deepEqual(e.skills[2].bb, { value: 100, interval: 1 });
  assert.equal(MAX_COOLDOWN, 1e9);
  for (const f of ['cooldown', 'initCooldown']) {
    const over = structuredClone(achunt);
    /** @type {any} */ (over.Value[0].enemyData.skills[2])[f] = 2e9;
    assert.throws(() => enemyOf({ enemies: [over] }, KEY), new RegExp(`skills\\[2\\]\\.${f}: 2000000000 outside \\[-1, 1000000000\\]`));
  }
});
