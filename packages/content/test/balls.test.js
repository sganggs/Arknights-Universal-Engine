// 阵地足球's special balls (docs/spec/football.md 足球-16) with IG-FT-1's records as extracted: 高能源石球's counter and
// its blast, the beetle balls' kick thresholds, and the ice and slime the 北境意志球 and the 底海滑动球 leave.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, displacement, ball as ballSim, KIND } from '@aue/sim';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';
import football from '../data/levels/act1multi_football.json' with { type: 'json' };

/** @typedef {import('@aue/sim').Unit} Unit */

const E = /** @type {Record<string, any>} */ (football.enemies), F = /** @type {any} */ (football);

/** IG-FT-1's field with one ball of `key` at (x, y), not waiting for anything. @param {string} key @param {number} x @param {number} y */
function field(key, x, y) {
  const c = /** @type {any} */ ({
    level: { id: 'ft', width: 13, height: 9, tiles: F.level.tiles, football: F.level.football,
      routes: [{ start: { row: y, col: x }, end: { row: y, col: 0 }, motion: 'WALK', checkpoints: [{ type: 'WAIT_FOR_SECONDS', row: y, col: x, time: 999, dx: 0, dy: 0 }] }],
      waves: [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions: [{ type: 'SPAWN', key, route: 0, count: 1, preDelay: 0, interval: 1 }] }] }],
      options: { maxLifePoint: 99, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 0.5 } },
    enemies: { [key]: withFoeExtras(key, E[key]) },
    operators: { a: { name: 'a', position: 'MELEE', maxHp: 1e6, atk: 1, def: 0, res: 0, cost: 1, blockCnt: 1, baseAttackTime: 1, respawnTime: 1, range: [] } },
    behaviors: skeletonContent.behaviors,
  });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const b = /** @type {Unit} */ (w.units.find((u) => u.ball));
  b.x = x; b.y = y;
  return { w, c, b };
}

/** Rolls the ball a little to the right and waits until it rests. @param {any} w @param {any} c @param {Unit} b */
function nudge(w, c, b) {
  displacement.kickSlide(b, 1, 0, 0.6);
  for (let i = 0; i < 60 && b.slide; i++) step(w, c);
  step(w, c);
}

test('[足球-16] 高能源石球: kicks count down from 10 by 2 to 6 each; at 0, 1.5 s on, a blast of 1500 true damage and 3 s of 晕眩 within 1.5', () => {
  const { w, c, b } = field('enemy_4018_muboom', 3, 4);
  step(w, c, [[0, { type: 'deploy', op: 'a', row: 4, col: 2, dir: 0 }]]);
  const a = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.OPERATOR)), hp = a.hp;
  let kicks = 0;
  while (a.hp === hp && kicks < 6) {
    nudge(w, c, b);
    kicks++;
    for (let i = 0; i < 46 && a.hp === hp; i++) step(w, c);
  }
  assert.ok(kicks >= 2 && kicks <= 5, `${kicks} kicks`);
  assert.equal(hp - a.hp, 1500);
  assert.ok(attrs.statsOf(a).flags.stun, 'stunned');
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_4018_muboom', E.enemy_4018_muboom)]), []);
});

test('[足球-16] the beetle balls: each roll −2200 to the kick threshold three times at most; +150 twenty-five times at most', () => {
  const leak = field('enemy_4031_muftsn', 3, 4);
  const needs = [];
  for (let i = 0; i < 4; i++) { nudge(leak.w, leak.c, leak.b); needs.push(/** @type {any} */ (leak.b.ball).need); }
  assert.deepEqual(needs, [7100 - 2200, 7100 - 4400, 7100 - 6600, 7100 - 6600]);
  const grow = field('enemy_4032_muftmg', 3, 4);
  for (let i = 0; i < 26; i++) { displacement.kickSlide(grow.b, 1, 0, 0.6); for (let j = 0; j < 60 && grow.b.slide; j++) step(grow.w, grow.c); step(grow.w, grow.c); grow.b.x = 3; }
  assert.equal(/** @type {any} */ (grow.b.ball).need, 10 + 150 * 25);
  assert.deepEqual(uncoveredAbilities(['enemy_4031_muftsn', 'enemy_4032_muftmg'].map((k) => withFoeExtras(k, E[k]))), []);
});

test('[足球-16] 北境意志球 leaves ice (friction −0.3) on the 球场 tiles it rolls into, 底海滑动球 slime (+0.3); a ball on them slows by its factor with it', () => {
  const ice = field('enemy_4033_muftic', 3, 4);
  displacement.kickSlide(ice.b, 1, 0, 2.75);
  for (let i = 0; i < 90 && ice.b.slide; i++) step(ice.w, ice.c);
  const cover = /** @type {any} */ (ice.w.football).cover;
  // every tile of row 4 from where it started to where it rests — the further on its own ice
  const last = Math.round(ice.b.x);
  assert.ok(last >= 6, `rolled to ${ice.b.x}`);
  assert.deepEqual(Object.keys(cover).map(Number).sort((a, b) => a - b), Array.from({ length: last - 2 }, (_, i) => 4 * 13 + 3 + i));
  assert.ok(Object.values(cover).every((v) => v === -0.3));
  assert.ok(Math.abs(ballSim.ballFriction(ice.c, ice.b, ice.w) - 0.5 * 9.81 * (0.5 - 0.3)) < 1e-9);
  const slime = field('enemy_4034_muftgl', 3, 4);
  displacement.kickSlide(slime.b, 1, 0, 2.6);
  for (let i = 0; i < 90 && slime.b.slide; i++) step(slime.w, slime.c);
  assert.ok(Object.values(/** @type {any} */ (slime.w.football).cover).every((v) => v === 0.3));
  assert.ok(Math.abs(ballSim.ballFriction(slime.c, slime.b, slime.w) - 0.5 * 9.81 * (0.3 + 0.3)) < 1e-9);
});
