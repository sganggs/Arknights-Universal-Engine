// 暴走食人花 and 安眠伴随兽 (docs/spec/foes.md 敌能-108, 敌能-109) on the tiny map, with the data's blackboards and the
// pages' extras: what the plant eats, its digesting and the card it lets go; what the companion carries off and puts back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { foeBehaviors, withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/** An enemy record. @param {Record<string, any>} p */
const def = (p) => ({ name: 'foe', maxHp: 1e6, atk: 150, def: 0, res: 0, moveSpeed: 0.6, applyWay: 'MELEE', motion: 'WALK', massLevel: 2, baseAttackTime: 3.3, rangeRadius: 0, ...p });

/** The tiny map with one enemy of the key on a straight way along row 1, our guard sturdy and harmless. @param {string} key @param {any} d */
function open(key, d) {
  const c = /** @type {any} */ (tinyContent());
  c.level.routes = [{ start: { row: 1, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [] }];
  c.enemies = { [key]: withFoeExtras(key, d) };
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, moveMultiplier: 0.001, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators = { guard: { ...c.operators.guard, maxHp: 1e5, def: 100, res: 0, atk: 0, respawnTime: 20 } };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w, e: /** @type {Unit} */ (w.units.find((u) => u.key === key)) };
}

/** Steps n frames. @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** Deploys the guard at (1, 2). @param {World} w @param {any} c */
function guard(w, c) {
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  return /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
}

const PLANT = { atk: 0, applyWay: 'NONE', rangeRadius: -1, baseAttackTime: 0, talents: { InitEat: { token_key: 'trap_173_slfrut', cnt: 2 } },
  skills: [{ key: 'Devour', cooldown: 0, initCooldown: 0, sp: 0, bb: {} }, { key: 'Eat', cooldown: 0, initCooldown: 0, sp: 0, bb: { duration: 20 } }, { key: 'InitEat', cooldown: 0, initCooldown: 0, sp: 0, bb: { duration: 40 } }] };

test('[敌能-108] 暴走食人花: 40 s of 登场消化; then it eats ours within 1.0, digests 20 s, and the card then waits its 再部署时间', () => {
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_10003_trwlpl_2', def(PLANT))]), []);
  const { c, w, e } = open('enemy_10003_trwlpl_2', def(PLANT));
  assert.equal(attrs.statsOf(e).flags.root, true, 'digesting from its spawn');
  const g = guard(w, c);
  e.x = g.x - 0.8;
  run(w, c, 30 * 40 - 3);
  assert.ok(g.hp > 0 && w.units.includes(g), 'not while it digests');
  run(w, c, 4);
  const card = w.players[0].cards.guard;
  assert.ok(!w.units.includes(g), 'eaten');
  assert.ok(card?.lock === e.id && card.ready <= w.frame, 'locked, no wait yet');
  assert.equal(attrs.statsOf(e).flags.root, true, 'digesting');
  run(w, c, 30 * 20);
  assert.equal(card.lock, undefined, 'let go');
  assert.ok(card.ready > w.frame + 30 * 19, `its 再部署时间 from now: ${card.ready - w.frame}`);
  assert.notEqual(attrs.statsOf(e).flags.root, true);
});

const DOG = { atk: 150, moveSpeed: 2, talents: { GetEnmey: { max_cnt: 1, range_radius: 0.25, move_speed: 1, duration: 4, cooldown: 10, 'attack@ep_damage_ratio': 1.5, value: -1 } },
  skills: [{ key: 'GetChar', cooldown: 1, initCooldown: 0, sp: 0, bb: { cooldown: 10, move_speed: 1, range_radius: 0.25, first_trigger_interval: 3, value: -1, stun: 3 } }] };

test('[敌能-109] 安眠伴随兽: a stunned operator within 0.25 is carried off; 3 s later it is back on the tile, stunned 3 s, and none for 10 s', () => {
  assert.deepEqual(uncoveredAbilities([def(DOG)]), []);
  const dog2 = { ...DOG, skills: [{ ...DOG.skills[0], bb: { ...DOG.skills[0].bb, stun: undefined } }] };
  delete dog2.skills[0].bb.stun;
  assert.deepEqual([uncoveredAbilities([withFoeExtras('enemy_10107_mjcdog_2', def(dog2))]), uncoveredAbilities([def(dog2)])], [[], ['GetChar']], 'its stun from the page');
  const { c, w, e } = open('enemy_10107_mjcdog', def(DOG));
  const g = guard(w, c);
  e.x = g.x - 0.2;
  e.atkCd = 999;
  status.applyStatus(g, 'stun', { seconds: 1 });
  run(w, c, 2);
  const card = w.players[0].cards.guard;
  assert.ok(!w.units.includes(g) && card?.lock === e.id, 'carried off');
  assert.equal(attrs.statsOf(e).blockCnt, 1 + 2, 'the guard\'s two blocks more');
  run(w, c, 30 * 3);
  const back = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  assert.ok(back && back.x === Math.round(e.x) && back.y === 1, 'back on its tile');
  assert.equal(attrs.statsOf(back).flags.stun, true, 'stunned');
  assert.equal(card.lock, undefined);
  status.applyStatus(back, 'stun', { seconds: 20 });
  e.x = back.x;
  run(w, c, 30 * 5);
  assert.ok(w.units.includes(back), 'resting: not again within 10 s');
});
