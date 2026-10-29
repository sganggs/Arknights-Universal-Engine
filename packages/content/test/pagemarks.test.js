// The pages' 不进行普通攻击 and 无法被阻挡 on enemies whose 攻击方式 is NONE (docs/spec/foes.md 敌能-117), and 敌人攻击-1's
// rule that NONE alone does not stop a normal attack. Each enemy walks the tiny map's road past a guard of no attack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelContent, LEVELS, withFoeExtras, FOE_EXTRAS } from '../src/index.js';
import { uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit */

const CIVILIAN = 'enemy_1313_wdfmr';
const THIEF = 'enemy_1354_eghost';
const BOSS = 'enemy_1354_eghost_2';
const GHOST = 'enemy_1026_aghost';
const PILE = 'enemy_1398_dhdcr';
const WILD_PILE = 'enemy_1398_dhdcr_2';

/** act1multi_02 does not load at NORMAL yet (its runes), so its def is the level's own with the extras merged. */
const civilian = () => withFoeExtras(CIVILIAN, LEVELS.act1multi_02.enemies[CIVILIAN]);
const thieves = levelContent('act1multi_06', 'NORMAL').enemies;
const ghost = () => levelContent('act1multi_hard-02', 'NORMAL').enemies[GHOST];

/**
 * One enemy spawned on the road, a guard of no attack and ten million HP deployed on it in the next frame; `frames`
 * frames later: whether the guard ever blocked it, its hits, and the guard's HP lost.
 * @param {string} key @param {any} def @param {number} frames
 */
function walk(key, def, frames) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators.guard = { ...c.operators.guard, atk: 0, maxHp: 1e7 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.key === key);
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 0, dir: 0 }]]);
  const g = w.units.find((u) => u.key === 'guard');
  if (!e || !g) throw new Error(`missing ${key} or the guard`);
  const flags = { ...attrs.statsOf(e).flags };
  let blocked = false, hits = 0;
  for (let i = 0; i < frames; i++) {
    for (const ev of step(w, c)) if (ev.type === 'hit' && ev.id === e.id) hits++;
    if (e.blockedBy === g.id) blocked = true;
  }
  return { flags, blocked, hits, lost: 1e7 - g.hp };
}

/** A def without one talent. @param {any} def @param {string} name */
function without(def, name) {
  const talents = { ...def.talents };
  delete talents[name];
  return { ...def, talents };
}

test('[敌能-117] the pages\' markers: 诺伯特平民 NoAttack, the two 匪帮窃贼 unblockable, 幽灵组长 and both 天桩 both', () => {
  assert.deepEqual(FOE_EXTRAS[CIVILIAN].talents, { NoAttack: {} });
  assert.deepEqual(FOE_EXTRAS[THIEF].talents, { unblockable: {} });
  assert.deepEqual(FOE_EXTRAS[BOSS].talents, { unblockable: {} });
  for (const key of [GHOST, PILE, WILD_PILE]) assert.deepEqual(FOE_EXTRAS[key].talents, { NoAttack: {}, unblockable: {} }, key);
  assert.deepEqual(Object.keys(thieves[BOSS].talents ?? {}).sort(), ['blacksteel_energy', 'over_energy', 'unblockable']);
});

test('[敌能-117] [敌人攻击-1] 匪帮窃贼头目 walks past the guard and never hits it; without its marker NONE does not stop it', () => {
  const marked = walk(BOSS, thieves[BOSS], 300);
  assert.equal(marked.flags.unblockable, true);
  assert.equal(marked.blocked, false);
  assert.equal(marked.hits, 0);
  assert.equal(marked.lost, 0);
  const bare = walk(BOSS, without(thieves[BOSS], 'unblockable'), 300);
  assert.equal(bare.blocked, true);
  assert.ok(bare.hits > 0, 'applyWay NONE and ATK 100: it hits the guard that blocks it');
  assert.ok(bare.lost > 0);
});

test('[敌能-117] 匪帮窃贼 is unblockable too', () => {
  const thief = walk(THIEF, thieves[THIEF], 300);
  assert.equal(thief.flags.unblockable, true);
  assert.equal(thief.blocked, false);
  assert.equal(thief.hits, 0);
});

test('[敌能-117] 幽灵组长 is neither blocked nor attacks; 诺伯特平民 is blocked and does not attack', () => {
  const g = walk(GHOST, ghost(), 300);
  assert.equal(g.flags.noAttack, true);
  assert.equal(g.flags.unblockable, true);
  assert.equal(g.blocked, false);
  assert.equal(g.hits, 0);
  const c = walk(CIVILIAN, civilian(), 300);
  assert.equal(c.flags.noAttack, true);
  assert.notEqual(c.flags.unblockable, true);
  assert.equal(c.blocked, true);
  assert.equal(c.hits, 0);
  assert.equal(c.lost, 0);
  const loud = walk(CIVILIAN, without(civilian(), 'NoAttack'), 300);
  assert.ok(loud.hits > 0, 'without the marker it hits its blocker');
});

test('[敌能-117] the markers count as covered; 诺伯特平民 still lacks its 鉴定', () => {
  const defs = [civilian(), thieves[THIEF], thieves[BOSS], ghost()];
  assert.deepEqual(uncoveredAbilities(defs), ['civilianTalent']);
});

test('[敌能-117] the NONE enemies whose pages attack, or that have their own marker, get none here', () => {
  for (const key of ['enemy_1120_vofwiz', 'enemy_1120_vofwiz_2', 'enemy_1507_mephi', 'enemy_1042_frostd', 'enemy_4039_mufbse']) {
    assert.equal(FOE_EXTRAS[key]?.talents?.NoAttack, undefined, key);
  }
  for (const key of ['enemy_1120_vofwiz', 'enemy_1120_vofwiz_2', 'enemy_1507_mephi', 'enemy_1042_frostd']) {
    assert.equal(FOE_EXTRAS[key]?.talents?.unblockable, undefined, key);
  }
});
