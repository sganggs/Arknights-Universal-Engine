// 孽罪奇美拉 / 渎罪奇美拉 (docs/spec/foes.md 敌能-162). Neither is in a shipped level: the records are the level-0
// enemy_database figures (ArknightsGameData 17759cc8). Their 污染模式 needs 源石污染区 or 活性源石风暴, which the engine
// does not have: the talents and the skill are covered and do nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, elements, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const SIN = 'enemy_1425_lrcmra';
const DU = 'enemy_1425_lrcmra_2';
const HP = 5000;

/** The enemy_database record, level 0. `aura` and `boost` replace the two talents' blackboards. @param {string} key @param {{ aura?: Record<string, unknown>, boost?: Record<string, unknown> }} [o] @returns {EnemyDef} */
function chimera(key, o = {}) {
  const elite = key === DU;
  return {
    name: elite ? '渎罪奇美拉' : '孽罪奇美拉', maxHp: elite ? 25000 : 20000, atk: elite ? 1200 : 800,
    def: elite ? 1200 : 1000, res: 50, moveSpeed: 0.6, baseAttackTime: 5, rangeRadius: -1,
    applyWay: 'MELEE', motion: 'WALK', levelType: 'ELITE', massLevel: 4,
    talents: /** @type {any} */ ({ OrigAura: o.aura ?? { sp_recover_ratio: -0.8, damage: 50 }, AtkBoost: o.boost ?? { atk: 0 } }),
    skills: [{ key: 'triggerAnim', initCooldown: 9999, cooldown: 9999, sp: 0, bb: {} }],
  };
}

/** @param {string} key @param {EnemyDef} def @returns {string[]} */
const gaps = (key, def) => uncoveredAbilities([withFoeExtras(key, def)]);

/**
 * The tiny map: the chimera rooted on the road at x 2 after the spawn step, the guard (blocking, ATK 0) on its tile and
 * the sniper (not blocking) within 1.2 of it; each operator with a time-SP skill. @param {string} key
 */
function open(key) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: withFoeExtras(key, chimera(key)) };
  c.behaviors = skeletonContent.behaviors;
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  const quiet = { cost: 0, maxHp: HP, atk: 0, def: 0, res: 0 };
  const skill = { id: 's', type: 'MANUAL', sp: 'time', cost: 30, init: 0, charges: 1, duration: 0, ammo: false, bb: {} };
  c.operators.guard = { ...c.operators.guard, ...quiet, blockCnt: 1, skill };
  c.operators.sniper = { ...c.operators.sniper, ...quiet, blockCnt: 0, skill };
  c.level.waves = [oneWave([spawnAt(0, key)])];
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.ENEMY));
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }], [0, { type: 'deploy', op: 'sniper', row: 2, col: 2, dir: 0 }]]);
  const guard = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard')), sniper = /** @type {Unit} */ (w.units.find((u) => u.key === 'sniper'));
  return { c, w, e, guard, sniper };
}

test('[敌能-162] [关卡-2] both records are covered as the data has them; a missing key, an extra key or a non-number stays uncovered', () => {
  assert.deepEqual([gaps(SIN, chimera(SIN)), gaps(DU, chimera(DU))], [[], []]);
  assert.deepEqual(gaps(SIN, chimera(SIN, { aura: { damage: 50 } })), ['OrigAura']);
  assert.deepEqual(gaps(SIN, chimera(SIN, { aura: { sp_recover_ratio: -0.8, damage: 50, radius: 1.2 } })), ['OrigAura']);
  assert.deepEqual(gaps(SIN, chimera(SIN, { aura: { sp_recover_ratio: -0.8, damage: '50' } })), ['OrigAura']);
  assert.deepEqual(gaps(SIN, chimera(SIN, { boost: { atk: 0, scale: 1 } })), ['AtkBoost']);
  const odd = chimera(SIN);
  odd.skills = [{ key: 'triggerAnim', initCooldown: 9999, cooldown: 9999, sp: 0, bb: { cnt: 1 } }];
  assert.deepEqual(gaps(SIN, odd), ['triggerAnim']);
});

test('[敌能-162] no 污染模式: units within 1.2 keep their natural SP recovery and take no damage from it; the attack stays physical', () => {
  for (const key of [SIN, DU]) {
    const { c, w, e, guard, sniper } = open(key);
    /** @type {any[]} */
    const hits = [];
    for (let i = 0; i < 30 * 6; i++) for (const ev of step(w, c)) if (ev.type === 'hit' && ev.id === e.id) hits.push(ev);
    assert.deepEqual([guard, sniper].map((u) => attrs.statsOf(u).spRecovery), [guard, sniper].map((u) => /** @type {any} */ (u.base).spRecovery ?? 1), 'no ×0.2: their own rate');
    assert.ok(Math.hypot(sniper.x - e.x, sniper.y - e.y) <= 1.2, 'the sniper is within the page\'s radius');
    assert.equal(sniper.hp, HP, 'no 50 every 0.5 s');
    assert.ok(hits.length > 0 && hits.every((x) => x.target === guard.id), 'only its normal attack, on its blocker');
    assert.equal(attrs.statsOf(e).atk, chimera(key).atk, 'atk +0 changes nothing');
    assert.ok(guard.hp < HP && elements.epOf(guard, 'FIRE') === attrs.statsOf(guard).maxEp, 'the guard took the physical hit');
  }
});

test('[敌能-162] triggerAnim does nothing: its cooldown counts down and nothing else happens', () => {
  const { c, w, e } = open(SIN);
  const before = e.ab['triggerAnim.cd'];
  for (let i = 0; i < 30; i++) step(w, c);
  assert.equal(e.ab['triggerAnim.cd'], before - 30);
  assert.equal(e.hp, chimera(SIN).maxHp);
});
