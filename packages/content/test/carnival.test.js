// 狂欢游行 (docs/spec/foes.md 敌能-97…敌能-100) on the tiny map, with the data's blackboards and the pages' extras: the
// two players' 隐匿 and modes, 狂欢式演奏, 领舞者's two beats, the damage cut, blocks and ram, the beer, the balloon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { foeBehaviors, withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const SAX = { atk_scale: 0.2, 'enemy_cnvsax[cd].duration': 10.6, 'enemy_cnvsax[cd].cooldown': 10, ep_damage_ratio: 0.1, hit_interval: 0.5, 'enemy_cnvsax[cd].interval': 6 };
const DANCE = { aura: { range_radius: 1.5, atk_scale: 1, ep_damage_ratio: 0.5 }, aura2: { range_radius: 2, atk_scale: 1, ep_damage_ratio: 0.5 } };
const BEER = { block_cnt: -1, duration: 10, sp: -3, cd: 15 };

/** An enemy record. @param {Record<string, any>} p */
const def = (p) => ({ name: 'parade', maxHp: 1e6, atk: 750, def: 350, res: 10, moveSpeed: 0.7, applyWay: 'ALL', motion: 'WALK', massLevel: 2, baseAttackTime: 1, rangeRadius: 2.5, ...p });

/**
 * The tiny map with one enemy on a straight way along row 1, our units sturdy, a second sniper.
 * @param {string} key @param {any} d @param {number} [move] the level's move multiplier
 */
function open(key, d, move = 0.02) {
  const c = /** @type {any} */ (tinyContent());
  c.level.routes = [{ start: { row: 1, col: 0 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [] }];
  c.enemies = { [key]: withFoeExtras(key, d) };
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, moveMultiplier: move, characterLimit: 8, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  c.operators = { guard: { ...c.operators.guard, maxHp: 1e5, def: 100, res: 0 }, sniper: { ...c.operators.sniper, maxHp: 1e5, def: 0, res: 0, atk: 0 }, sniper2: { ...c.operators.sniper, maxHp: 1e5, def: 0, res: 0, atk: 0 } };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  return { c, w, e: /** @type {Unit} */ (w.units.find((u) => u.key === key)) };
}

/** Steps n frames, the events collected. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(...step(w, c));
  return out;
}
/** Deploys one of ours. @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col */
function put(w, c, op, row, col) {
  step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
  return /** @type {Unit} */ (w.units.find((u) => u.key === op));
}
/** @param {any[]} ev @param {Unit} e */
const hitsBy = (ev, e) => ev.filter((x) => x.type === 'hit' && x.id === e.id);

test('[敌能-97] 巡游爵士乐手: 隐匿 with 孤立 and no attack while not blocked; blocked, 狂欢式演奏 on the first target, a note each 0.5 s', () => {
  const { c, w, e } = open('enemy_10034_cnvsax_2', def({ skills: [{ key: 'fire', cooldown: 10, initCooldown: 3, sp: 0, bb: SAX }] }));
  assert.deepEqual(uncoveredAbilities([def({ skills: [{ key: 'fire', cooldown: 10, initCooldown: 3, sp: 0, bb: SAX }] })]), []);
  assert.ok(e.buffs.some((b) => b.key === 'carnivalHide' && b.flags.stealth), '隐匿');
  const s = put(w, c, 'sniper', 0, 2);
  e.x = 1.6;
  assert.equal(hitsBy(run(w, c, 150), e).length, 0, 'no attack and no 演奏 while hidden');
  assert.equal(attrs.statsOf(e).flags.noAllyHeal, true, '孤立 while hidden');
  const g = put(w, c, 'guard', 1, 2);
  e.x = g.x; e.y = g.y;
  const ev = run(w, c, 30 * 4);
  assert.equal(e.blockedBy, g.id);
  assert.notEqual(attrs.statsOf(e).flags.noAllyHeal, true, 'no 孤立 in 反击模式');
  const notes = hitsBy(ev, e).filter((h) => h.damage === 150);
  assert.ok(notes.length >= 4, `notes: ${notes.length}`);
  assert.ok(notes.every((h) => h.damage === 150 && (h.target === g.id || h.target === s.id)), 'arts at 20% on res 0');
});

test('[敌能-98] 领舞者: each second, while hidden those within 1.5 take its 攻击力 as arts; blocked, those within 2.0', () => {
  const { c, w, e } = open('enemy_10035_cnvdnc_2', def({ atk: 120, applyWay: 'RANGED', rangeRadius: -1, talents: DANCE }));
  assert.deepEqual(uncoveredAbilities([def({ talents: DANCE })]), []);
  const near = put(w, c, 'sniper', 0, 2), far = put(w, c, 'sniper2', 0, 3);
  e.x = 1.6;
  run(w, c, 31);
  assert.deepEqual([1e5 - near.hp, 1e5 - far.hp], [120, 0], 'one beat: 1.5 around it');
  const g = put(w, c, 'guard', 1, 2);
  e.x = g.x - 0.4;
  run(w, c, 45);
  assert.equal(e.blockedBy, g.id);
  assert.ok(far.hp < 1e5 && g.hp < 1e5, 'blocked: 2.0 around it');
});

test('[敌能-99] “美食速递”: a tenth of physical and arts damage, three blocks, and its ram on ours it passes, once each', () => {
  const { c, w, e } = open('enemy_10038_cnvpiz_2', def({ talents: { act38side_scale: { damage_resistance: 0.9 } }, applyWay: 'MELEE', rangeRadius: 0, moveSpeed: 1.5 }), 1);
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_10038_cnvpiz_2', def({ talents: { act38side_scale: { damage_resistance: 0.9 } } }))]), []);
  assert.deepEqual(uncoveredAbilities([def({ talents: { act38side_scale: { damage_resistance: 0.9 } } })]), ['act38side_scale'], 'not without the page');
  assert.equal(attrs.statsOf(e).blockCnt, 3);
  const guard = e.buffs.find((b) => b.key === 'carnivalGuard');
  assert.deepEqual([guard?.mods.physTakenMul, guard?.mods.artsTakenMul].map((x) => Math.round((x ?? 0) * 1e9) / 1e9), [0.1, 0.1]);
  const g = put(w, c, 'guard', 1, 2);
  run(w, c, 90);
  assert.notEqual(e.blockedBy, g.id, 'two blocks do not hold it');
  assert.ok(e.x > g.x + 0.5, 'past the guard');
  assert.equal(1e5 - g.hp, 750 - 100, 'one ram of its 攻击力');
});

test('[敌能-99] “醉后狂欢”: ready, it aims at one of ours in range, 1 s later the beer — its 攻击力 to the target and the ground within 1.5, a block fewer for 10 s', () => {
  const skills = [{ key: 'bigAttack', cooldown: 15, initCooldown: 5, sp: 0, bb: BEER }];
  const { c, w, e } = open('enemy_10039_cnvber_2', def({ atk: 1100, rangeRadius: 2.2, talents: { act38side_scale: { damage_resistance: 0.9 } }, skills }));
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_10039_cnvber_2', def({ talents: { act38side_scale: { damage_resistance: 0.9 } }, skills }))]), []);
  const g = put(w, c, 'guard', 1, 3), s = put(w, c, 'sniper', 0, 3);
  e.x = 1.2;
  run(w, c, 30 * 5);
  assert.deepEqual([g.hp, s.hp], [1e5, 1e5], 'not yet: the charge');
  run(w, c, 31);
  assert.deepEqual([1e5 - g.hp, 1e5 - s.hp].toSorted((a, b) => a - b), [1000, 1100], 'its 攻击力, physical');
  assert.equal(attrs.statsOf(g).blockCnt, 1, 'a block fewer');
  const left = /** @type {number} */ (g.buffs.find((b) => b.key === 'beerBlock')?.left);
  assert.ok(left > 30 * 10 - 31 && left < 30 * 10, `for 10 s: ${left}`);
});

test('[敌能-100] 巡游气球: its heal has nothing to heal in the engine\'s levels, and is covered', () => {
  assert.deepEqual(uncoveredAbilities([def({ talents: { heal: { hp_ratio: 0.06 } } })]), []);
  assert.deepEqual(uncoveredAbilities([def({ talents: { heal: { hp_ratio: 0.06, value: 1 } } })]), ['heal']);
});
