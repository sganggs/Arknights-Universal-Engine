// 深池逐火 (docs/spec/foes.md 敌能-45): a warrior knocked down spends 1 s reborn, then an ember of hit-count HP that
// hides and does not attack, and a warrior again at full HP if that lasts. An ember that falls leaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, damage, buffs, attrs, blocking, targeting, displacement, status, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const REVIVE = 'Revive[Trigger]';

/**
 * One 深池逐火 on the tiny map. `hits` is `prop_max_hp`, `interval` its seconds. The guard does not attack, so a long
 * ember is not chipped by the blocker's 5 % minimum.
 * @param {number} maxHp @param {number} hits @param {number} [interval]
 */
function dusk(maxHp, hits, interval = 10) {
  return {
    maxHp, atk: 400, def: 0, res: 0, moveSpeed: 0.7, baseAttackTime: 2, applyWay: 'MELEE',
    talents: { [REVIVE]: { prop_max_hp: hits, interval }, aura: { ep_damage_ratio: 1, range_radius: 1.5 } },
    skills: [{ key: 'BornAnim', cooldown: 0, initCooldown: 0, sp: 0, bb: {} }],
  };
}

/**
 * Spawns `key` rooted at (2, 1).
 * @param {string} key @param {Record<string, unknown>} def
 */
function place(key, def) {
  const c = /** @type {any} */ (tinyContent());
  const row = 1, col = 2;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  c.operators.guard.atk = 0;
  c.behaviors = skeletonContent.behaviors;
  c.enemies[key] = withFoeExtras(key, /** @type {EnemyDef} */ ({ name: key, ...def }));
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.kind === KIND.ENEMY);
  if (!e) throw new Error(`no enemy ${key}`);
  Object.assign(e, { x: col, y: row, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  return { c, w, e, row, col };
}

/** @param {ReturnType<typeof place>} box @param {number} n */
function run(box, n) {
  for (let i = 0; i < n; i++) step(box.w, box.c);
}

/** A lethal hit, then the frame that keeps a warrior (敌能-2: fatal runs at the frame's end). @param {ReturnType<typeof place>} box */
function knock(box) {
  damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 1e9 });
  step(box.w, box.c);
}

/** Back on its tile. The ember-start frame can already have walked: 重生 cleared the root. @param {ReturnType<typeof place>} box */
function hold(box) {
  Object.assign(box.e, { x: box.col, y: box.row, path: [], pt: 0 });
  if (!box.e.buffs.some((b) => b.key === 'root')) status.applyStatus(box.e, 'root', {});
}

/** Through the 1 s and into the ember, then held. @param {ReturnType<typeof place>} box */
function toEmber(box) {
  knock(box);
  run(box, 30);
  hold(box);
}

/** Deploys a guard on the enemy and returns it. @param {ReturnType<typeof place>} box */
function guardOf(box) {
  step(box.w, box.c, [[0, { type: 'deploy', op: 'guard', row: box.e.y, col: box.e.x, dir: 0 }]]);
  const g = box.w.units.find((u) => u.key === 'guard');
  if (!g) throw new Error('no guard');
  return g;
}

/** @param {Unit} e @param {string} key */
const buffOf = (e, key) => e.buffs.find((b) => b.key === key);

/** @param {Unit} e */
const phase = (e) => e.ab[`${REVIVE}.phase`] ?? 0;

/** @param {ReturnType<typeof place>} box @param {number} n */
function chip(box, n) {
  let back = 0;
  for (let i = 0; i < n; i++) back = damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 1000 });
  return back;
}

/** The 1 s flags, in order. @param {Unit} e */
function reviveState(e) {
  const s = attrs.statsOf(e);
  return [
    s.invincible, !!s.flags.untargetable, !!s.flags.unblockable, !!s.flags.sidelined, !!s.flags.noDisplace, !!s.flags.noAttack,
    s.disabled, s.immobile, !!s.flags.stealth, targeting.selectable(e), displacement.displaceable(e), blocking.blockable(s), e.swing,
  ];
}

/** @param {Record<string, number>} [extra] */
function covered(extra = {}) {
  return {
    talents: { [REVIVE]: { prop_max_hp: 5, interval: 10 }, aura: { ep_damage_ratio: 1, range_radius: 1.5, ...extra } },
    skills: [{ key: 'BornAnim', bb: {} }],
  };
}

test('[敌能-45] aura stays uncovered for these blackboards; a stack cap still covers 敌能-28', () => {
  const guard = covered({ damage_resistance: 0.5 });
  assert.deepEqual(uncoveredAbilities([covered(), covered(), guard].map((e) => /** @type {any} */ (e))), ['aura']);
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ ({ talents: { aura: { atk: 0.15, max_valid_stack_cnt: 6 } } })]), []);
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ ({ talents: { aura: {
    'enemy_dsuply_t[attr_buff].atk': 0.1, 'enemy_dsuply_t[attr_buff].max_valid_stack_cnt': 5, ep_damage_ratio: 0.1,
  } } })]), []);
});

test('[敌能-45] the 1 s: 无敌, unselectable, unblockable, idle, 失衡免疫, no attack, not hidden; 30 frames, then the ember', () => {
  const box = place('enemy_1288_duskls', dusk(5000, 5));
  box.e.buffs.push(buffs.makeBuff({ key: 'mark' }));
  knock(box);
  const rev = buffOf(box.e, 'revive');
  assert.ok(rev);
  assert.equal(rev.left, 30);
  assert.deepEqual(reviveState(box.e), [true, true, true, true, true, true, true, true, false, false, false, false, null]);
  assert.deepEqual([box.e.hp, box.e.base.maxHp, phase(box.e), buffOf(box.e, 'mark'), buffOf(box.e, 'root')], [5000, 5000, 1, undefined, undefined]);
  run(box, 29);
  assert.equal(buffOf(box.e, 'revive')?.left, 1);
  assert.equal(phase(box.e), 1);
  run(box, 1);
  const ember = buffOf(box.e, 'ember');
  assert.ok(ember);
  assert.equal(ember.left, 300);
  assert.equal(buffOf(box.e, 'revive'), undefined);
  assert.equal(phase(box.e), 2);
});

test('[敌能-45] a block held at the knock-down stays that frame and drops on the next; 生命流失 during the 1 s does not remove it', () => {
  const box = place('enemy_1288_duskls', dusk(5000, 5));
  const g = guardOf(box);
  assert.equal(box.e.blockedBy, g.id);
  const hp = g.hp;
  knock(box);
  assert.equal(box.e.blockedBy, g.id);
  assert.equal(g.hp, hp);
  run(box, 1);
  assert.equal(box.e.blockedBy, -1);
  assert.equal(box.e.swing, null);
  assert.equal(g.hp, hp);
  damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 100 });
  assert.equal(box.e.hp, 5000);
  damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 1e9, hpLoss: true });
  assert.equal(box.e.hp, 0);
  run(box, 1);
  assert.equal(box.w.units.includes(box.e), true);
  assert.equal(box.e.hp, 5000);
  assert.equal(phase(box.e), 1);
  assert.ok(buffOf(box.e, 'revive'));
});

test('[敌能-45] the ember\'s skills go back to their first cooldown, and it does not attack until the warrior returns at full HP', () => {
  const def = dusk(5000, 5);
  def.skills = [{ key: 'BornAnim', cooldown: 8, initCooldown: 4, sp: 0, bb: {} }];
  const box = place('enemy_1288_duskls', def);
  box.e.ab['BornAnim.cd'] = 50;
  knock(box);
  assert.equal(box.e.ab['BornAnim.cd'], 50);
  run(box, 29);
  assert.equal(box.e.ab['BornAnim.cd'], 21);
  run(box, 1);
  assert.equal(box.e.ab['BornAnim.cd'], secondsToFrames(4) - 1);
  hold(box);
  const g = guardOf(box);
  const before = g.hp;
  run(box, 298);
  assert.equal(g.hp, before);
  assert.equal(box.e.swing, null);
  assert.equal(buffOf(box.e, 'ember')?.left, 1);
  run(box, 1);
  assert.ok(g.hp < before);
  assert.equal(box.e.hp, 5000);
  assert.equal(box.e.base.maxHp, 5000);
  assert.equal(phase(box.e), 0);
  assert.equal(buffOf(box.e, 'hitCount'), undefined);
});

test('[敌能-45] [敌能-39] [索敌-2] an ember\'s HP is its hit count, hidden unless blocked, with the default restore window, and no 缴械 flag', () => {
  const box = place('enemy_1292_duskld', dusk(10000, 10));
  toEmber(box);
  const ember = buffOf(box.e, 'ember');
  assert.ok(ember);
  assert.equal(Object.hasOwn(ember, 'restore'), false);
  assert.equal(box.e.hp, 10);
  const s = attrs.statsOf(box.e);
  assert.deepEqual(
    [!!s.flags.hitCount, !!s.flags.stealth, !!s.flags.noAttack, !!s.flags.unblockable, !!s.flags.noDisplace, !!s.flags.sidelined, !!s.flags.disarmedCombat],
    [true, true, true, false, false, false, false],
  );
  assert.equal(targeting.selectable(box.e), false);
  assert.equal(blocking.blockable(s), true);
  assert.equal(displacement.displaceable(box.e), true);
  const g = guardOf(box);
  assert.equal(box.e.blockedBy, g.id);
  assert.equal(targeting.selectable(box.e), true);
  assert.equal(targeting.stealthed(box.e), false);
  Object.assign(box.e, { x: 0, y: 1, path: [], pt: 0 });
  blocking.release(box.e);
  assert.equal(buffOf(box.e, 'stealthOff:ember')?.left, 90);
  assert.equal(targeting.stealthed(box.e), false);
  run(box, 89);
  assert.equal(targeting.stealthed(box.e), false);
  assert.equal(buffOf(box.e, 'stealthOff:ember')?.left, 1);
  run(box, 1);
  assert.equal(targeting.stealthed(box.e), true);
  assert.equal(buffOf(box.e, 'stealthOff:ember'), undefined);
});

test('[敌能-45] [敌能-39] five hits fell an ember of 5; the event stays the calculated damage; 生命流失 is the whole amount; a fallen ember leaves', () => {
  const box = place('enemy_1288_duskls', dusk(5000, 5));
  toEmber(box);
  const back = chip(box, 1);
  assert.deepEqual([back, box.e.hp], [1000, 4]);
  chip(box, 4);
  assert.equal(box.e.hp, 0);
  assert.equal(box.w.units.includes(box.e), true);
  run(box, 1);
  assert.equal(box.w.units.includes(box.e), false);
  const loss = place('loss', dusk(5000, 5));
  toEmber(loss);
  damage.dealDamage(loss.w, null, loss.e, { type: 'true', amount: 3, hpLoss: true });
  assert.equal(loss.e.hp, 2);
});

test('[敌能-45] a partial ember returns at the warrior\'s full HP; a baked max_hp rune is not applied to prop_max_hp', () => {
  const box = place('enemy_1288_duskls', dusk(5000, 5));
  toEmber(box);
  chip(box, 2);
  assert.equal(box.e.hp, 3);
  run(box, 300);
  assert.deepEqual([box.e.hp, box.e.base.maxHp, phase(box.e)], [5000, 5000, 0]);
  const runed = place('runed', dusk(6000, 5));
  toEmber(runed);
  assert.deepEqual([runed.e.hp, runed.e.base.maxHp], [5, 5]);
  run(runed, 300);
  assert.deepEqual([runed.e.hp, runed.e.base.maxHp], [6000, 6000]);
});

test('[敌能-45] the warrior revives again after it returns; a non-positive prop_max_hp is knocked down', () => {
  const box = place('enemy_1288_duskls', dusk(5000, 5));
  toEmber(box);
  run(box, 300);
  assert.equal(phase(box.e), 0);
  knock(box);
  assert.equal(box.w.units.includes(box.e), true);
  assert.deepEqual([phase(box.e), box.e.hp], [1, 5000]);
  const none = place('none', dusk(100, 0));
  knock(none);
  assert.equal(none.w.units.includes(none.e), false);
});

test('[敌能-45] each id: 5, 5 and 10 hits, a 10 s ember; a 15/15 blackboard is the same behaviour', () => {
  /** @type {[string, number, number][]} */
  const ids = [['enemy_1288_duskls', 5000, 5], ['enemy_1288_duskls_2', 6000, 5], ['enemy_1292_duskld', 10000, 10]];
  for (const [key, max, hits] of ids) {
    const box = place(key, dusk(max, hits));
    toEmber(box);
    assert.deepEqual([box.e.hp, box.e.base.maxHp, buffOf(box.e, 'ember')?.left], [hits, hits, 300]);
  }
  const board = place('blackboard', dusk(1000, 15, 15));
  toEmber(board);
  assert.deepEqual([board.e.hp, buffOf(board.e, 'ember')?.left], [15, secondsToFrames(15)]);
});
