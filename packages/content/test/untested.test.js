// What a level being tested loads with (docs/spec/level.md 关卡-8, devices.md 装置-3): a device without a profile stays
// off the field and is named; other levels still refuse it. And an enemy record may carry a cooldown far longer than
// any battle (foes.md 敌能-1), as the extraction keeps it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '@aue/sim';
import { levelAt, matchContent, recordProblems, OFFICIAL_SOURCE, LEVELS } from '../src/index.js';
import hard02 from '../data/levels/act1multi_hard-02.json' with { type: 'json' };

/** 子代 as the extraction records it (character_table trap_039_dstnta at level 1, its hidden talent). */
const BROOD = { name: '子代', maxHp: 3000, atk: 150, def: 0, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0,
  talentBb: { grow_duration: 12, duration: 35 }, talents: [{ grow_duration: 12, duration: 35 }], cost: 5 };

/** hard-02's map with no enemies and one wave that activates a hidden 子代. @param {boolean} testing */
function brooding(testing) {
  const raw = /** @type {any} */ (hard02);
  const activate = { type: 'ACTIVATE', key: 'trap_039_dstnta#1', count: 1, interval: 0, preDelay: 1, route: -1 };
  return { ...raw, ...(testing ? { testing } : {}), enemies: {}, devices: { ...raw.devices, trap_039_dstnta: BROOD },
    level: { ...raw.level, predefines: [...raw.level.predefines, { alias: 'trap_039_dstnta#1', key: 'trap_039_dstnta', hidden: true, row: 0, col: 0, dir: 'UP' }],
      waves: [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions: [activate] }] }] } };
}

test('[关卡-8] [装置-3] a level being tested places a device with no profile: it stays off the field and is named in uncovered; other levels refuse it', async () => {
  assert.throws(() => levelAt('x', 'NORMAL', undefined, { x: brooding(false) }), /level x: devices not supported yet: trap_039_dstnta/);
  const lv = levelAt('x', 'NORMAL', undefined, { x: brooding(true) });
  assert.deepEqual([lv.level.uncovered, Object.keys(lv.devices)], [['trap_039_dstnta'], ['trap_097_hstone', 'trap_096_gflag']]);
  const c = await matchContent({ level: 'x', difficulty: 'NORMAL', seed: 1, decks: [[]] }, { source: { ...OFFICIAL_SOURCE, levels: { ...OFFICIAL_SOURCE.levels, x: brooding(true) } } });
  const w = createWorld(c, { seed: 1, players: 1 });
  for (let f = 0; f < 60; f++) step(w, c, []);
  assert.ok(w.predefined.includes('trap_039_dstnta#1'), 'the wave activated it');
  assert.equal(w.units.some((u) => u.alias === 'trap_039_dstnta#1'), false, 'no unit for it');
  const named = levelAt('act1multi_fortress_rm01', 'NORMAL').level.uncovered ?? [];
  assert.ok(!named.some((k) => k.startsWith('trap_')), 'a level whose devices all have profiles names none');
});

test('[敌能-1] an enemy record may carry a skill cooldown far longer than any battle, up to 1e9 s', () => {
  const base = /** @type {any} */ (LEVELS.act1multi_01).enemies.enemy_1067_snslime;
  const withSkill = (/** @type {number} */ cooldown) => ({ ...base, skills: [{ key: '3', sp: 0, cooldown, initCooldown: 0, bb: { value: 100, interval: 1 } }] });
  assert.deepEqual(recordProblems('enemies', withSkill(1e7), 'x'), []);
  assert.deepEqual(recordProblems('enemies', withSkill(2e9), 'x'), ['x/skills/0/cooldown: not a number in [-1, 1000000000]']);
});
