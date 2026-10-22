// 御4 and 寒霜 (docs/spec/foes.md 敌能-37): the level data has no 静态刚体 field. Content adds a talent the pages name
// only as an ability, and spawning them sets the flag. Their auras are not this behaviour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, displacement } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras } from '../src/foes.js';
import rm05 from '../data/levels/act1multi_rm05.json' with { type: 'json' };

/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const KEYS = ['enemy_1017_defdrn', 'enemy_1042_frostd'];

test('[敌能-37] [位移-5] 御4 and 寒霜 get 静态刚体 from a content talent the data does not have', () => {
  const enemies = /** @type {Record<string, EnemyDef>} */ (rm05.enemies);
  for (const key of KEYS) {
    const raw = enemies[key];
    assert.equal(raw.talents?.Static, undefined);
    const def = withFoeExtras(key, raw);
    assert.deepEqual(def.talents?.Static, {});
    assert.deepEqual(def.talents?.defup, raw.talents?.defup);
    const c = /** @type {any} */ (tinyContent());
    c.enemies = { [key]: def };
    c.behaviors = skeletonContent.behaviors;
    c.level.waves = [oneWave([spawnAt(0, key)])];
    const w = createWorld(c, { seed: 1, players: 1 });
    step(w, c);
    const e = w.units.find((u) => u.key === key);
    assert.ok(e);
    assert.equal(attrs.statsOf(e).flying, true);
    assert.equal(attrs.statsOf(e).flags.staticBody, true);
    const x = e.x, y = e.y;
    assert.equal(displacement.displaceable(e), false);
    assert.equal(displacement.push(w, c, e, 5, { from: { x: x - 1, y }, effect: true }), true);
    assert.equal(e.x, x);
    assert.equal(e.y, y);
    assert.equal(e.slide?.vx, 0);
    assert.equal(displacement.slideStep(c, e, w), false);
    assert.equal(e.slide, undefined);
    assert.equal(e.x, x);
  }
});

test('[敌能-37] the other enemies whose page names 静态刚体 get the same content talent', () => {
  for (const key of ['enemy_10083_hlbird', 'enemy_10084_hlegle', 'enemy_10085_hllevi_2', 'enemy_1430_lrrook', 'enemy_1040_bombd', 'enemy_1040_bombd_2']) {
    const def = withFoeExtras(key, { name: key, maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1 });
    assert.deepEqual(def.talents?.Static, {}, key);
  }
  assert.equal(withFoeExtras('enemy_10083_hlbird_2', { name: 'x', maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1 }).talents?.Static, undefined, 'no page read for 萨科塔展翅');
});
