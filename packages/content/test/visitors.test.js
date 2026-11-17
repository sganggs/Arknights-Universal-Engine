// 访问团持盾者 and 访问团持盾长 (docs/spec/foes.md 敌能-164). Neither is in a shipped level: the records are the level-0
// enemy_database figures (ArknightsGameData 17759cc8). Their talents work in 封冻 areas and near a lit 紧急供暖器, neither of
// which a level has: they are covered and do nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, stateHash, attrs, status, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const SHD = 'enemy_1387_winshd';
const LEAD = 'enemy_1387_winshd_2';
const COLD = { max_stack_cnt: 10, def: 0.1, interval: 3, magic_resistance: 5 };
const MELT = { interval: 3 };
const SHIELD = { max_stack_cnt: 5, min_stack_cnt: 2 };

/** A record as the data has it (`talents` replaced when given). @param {string} key @param {Record<string, unknown>} [talents] @returns {EnemyDef} */
function visitor(key, talents) {
  const lead = key === LEAD;
  return /** @type {any} */ ({
    name: lead ? '访问团持盾长' : '访问团持盾者', maxHp: lead ? 14000 : 12000, atk: lead ? 700 : 500, def: lead ? 1500 : 1200, res: 20,
    moveSpeed: 0.5, baseAttackTime: 3, rangeRadius: -1, applyWay: 'MELEE', motion: 'WALK', levelType: 'ELITE', massLevel: 4,
    talents: talents ?? { ColdShield: COLD, MeltShield: MELT, Shield: SHIELD },
  });
}

/** @param {Record<string, unknown>} talents @returns {string[]} */
const gaps = (talents) => uncoveredAbilities([withFoeExtras(SHD, visitor(SHD, talents))]);

test('[敌能-164] [敌能-51] [关卡-2] both records are covered as the data has them; a missing key, an extra key or a non-number stays uncovered; other Shield shapes as they were', () => {
  assert.deepEqual([SHD, LEAD].map((k) => uncoveredAbilities([withFoeExtras(k, visitor(k))])), [[], []]);
  const { max_stack_cnt: _, ...coldShort } = COLD;
  assert.deepEqual(gaps({ ColdShield: coldShort, MeltShield: MELT, Shield: SHIELD }), ['ColdShield']);
  assert.deepEqual(gaps({ ColdShield: COLD, MeltShield: { interval: 3, range: 1 }, Shield: SHIELD }), ['MeltShield']);
  assert.deepEqual(gaps({ ColdShield: COLD, MeltShield: MELT, Shield: { max_stack_cnt: 5, min_stack_cnt: '2' } }), ['Shield']);
  assert.deepEqual(gaps({ ColdShield: COLD, MeltShield: MELT, Shield: { max_stack_cnt: 5 } }), ['Shield']);
  assert.deepEqual([gaps({ Shield: { max_block_damage_cnt: 1, block_damage_cnt: 0 } }), gaps({ Shield: { shield_hp_ratio: 0.25 } })], [[], ['Shield']]);
});

/** The tiny map with one 访问团持盾者 rooted on the road, with its talents or without any. @param {boolean} talents */
function field(talents) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [SHD]: withFoeExtras(SHD, visitor(SHD, talents ? undefined : {})) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, SHD)])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  status.applyStatus(/** @type {import('@aue/sim').Unit} */ (w.units.find((u) => u.kind === KIND.ENEMY)), 'root', {});
  return { c, w };
}

test('[敌能-164] they do nothing: after 40 s its 防御力 and 法术抗性 are its own, and every frame is the one without the talents', () => {
  const a = field(true), b = field(false);
  for (let i = 0; i < 30 * 40; i++) {
    const ea = step(a.w, a.c), eb = step(b.w, b.c);
    assert.deepEqual(ea, eb, `frame ${a.w.frame}`);
    assert.equal(stateHash(a.w), stateHash(b.w), `frame ${a.w.frame}`);
  }
  const e = a.w.units.find((u) => u.kind === KIND.ENEMY);
  assert.ok(e, 'still on the field');
  assert.deepEqual([attrs.statsOf(e).def, attrs.statsOf(e).res], [1200, 20]);
});
