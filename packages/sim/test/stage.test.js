// Co-op stages and neutral units (docs/spec/coop.md 合作-6…合作-9, enemies.md 目标-1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, spawnAt } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step, stateHash, takeSnapshot, restoreSnapshot } from '../src/index.js';
import { stampsOf, stageCount } from '../src/stage.js';
import { makeEnemy } from '../src/units.js';
import { targetsOf, enemyTargets } from '../src/combat.js';
import { tryBlock } from '../src/blocking.js';
import { dealEp } from '../src/elements.js';

/** @typedef {import('../src/types.js').World} World */

const activate = (/** @type {string} */ alias) => ({ type: 'ACTIVATE', key: alias, route: -1, count: 1, preDelay: 0, interval: 0 });
const wave = (/** @type {any[]} */ actions) => ({ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions }] });

/**
 * A two-stage level on the tiny map: W0 starts stage 1, W1 its enemies, W2 starts stage 2, W3 its enemies. `civ` is a
 * neutral walker that reaches the goal in about 5 s; slimes stand still.
 * @param {any[]} stages @param {any[]} w1 @param {any[]} w3
 */
function level(stages, w1, w3) {
  const c = tinyContent();
  c.level.stages = stages;
  c.level.predefines = stages.map((s) => ({ alias: s.alias, key: 'trap_179_muctrl', hidden: true }));
  c.level.waves = [wave([activate(stages[0].alias)]), wave(w1), wave(stages[1] ? [activate(stages[1].alias)] : []), wave(w3)];
  c.enemies.slime.moveSpeed = 0;
  c.enemies.civ = { name: 'civ', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 4, applyWay: 'NONE', neutral: true, deathLife: 1 };
  c.enemies.boss = { ...c.enemies.slime, maxHp: 1000, levelType: 'BOSS' };
  return c;
}
const stage = (/** @type {string} */ alias, /** @type {Record<string, unknown>} */ o) => ({ alias, objective: 'protect', goal: 1, time: 10, rest: 0, ...o });

/** Runs `n` frames; the events with their frame. @param {World} w @param {any} c @param {number} n @param {(w: World) => void} [each] */
function run(w, c, n, each) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) { each?.(w); for (const e of step(w, c)) out.push({ ...e, f: w.frame - 1 }); }
  return out;
}
const of = (/** @type {any[]} */ ev, /** @type {string} */ type) => ev.filter((e) => e.type === type);

test('[合作-6] a stage starts with its controller, rests, runs its clock, and is settled at its time limit; the last one passing wins', () => {
  const c = level(
    [stage('c#1', {}), stage('c#2', { objective: 'survive', goal: 5, advanced: 8, time: 8, rest: 2 })],
    [spawnAt(0, 'civ', { unharmful: true }), spawnAt(11, 'slime')],
    [spawnAt(0, 'slime'), spawnAt(30, 'slime')],
  );
  const w = createWorld(c, { seed: 1, players: 2 });
  const ev = run(w, c, 700);
  assert.deepEqual(of(ev, 'stage').map((e) => [e.f, e.index, e.on, e.stamps]), [[0, 0, 1, 0], [300, 0, 0, 1], [300, 1, 1, 0], [600, 1, 0, 2]]);
  assert.deepEqual(of(ev, 'wave').map((e) => [e.f, e.index]), [[0, 0], [0, 1], [300, 2], [360, 3]], 'the rest holds the stage\'s wave: the next comes 2 s later');
  assert.deepEqual(of(ev, 'spawn').map((e) => [e.f, e.key]), [[0, 'civ'], [360, 'slime']], 'stage 1\'s wave was cut before its 11 s slime');
  assert.deepEqual(of(ev, 'end').map((e) => [e.f, e.result]), [[600, 1]]);
  assert.equal(of(ev, 'goal').length, 1);
  assert.deepEqual(w.players.map((p) => p.life), [3, 3], 'the civilian cost nothing at the goal (目标-1)');
  assert.deepEqual([w.stage.stamps, w.stage.passed, stampsOf(w, 0)], [3, 2, 3]);
  w.players[1].downs = 2;
  assert.equal(stampsOf(w, 1), 2, 'down twice: one fewer');
});

test('[合作-6] missing the minimum costs every player all their life: the battle is lost, the stamps so far kept', () => {
  const c = level([stage('c#1', { goal: 2 }), stage('c#2', {})], [spawnAt(0, 'civ', { unharmful: true }), spawnAt(11, 'slime')], []);
  const w = createWorld(c, { seed: 1, players: 2 });
  const ev = run(w, c, 320);
  assert.deepEqual(of(ev, 'stage').map((e) => [e.f, e.on, e.stamps]), [[0, 1, 0], [300, 0, 0]]);
  assert.deepEqual(of(ev, 'down').map((e) => [e.f, e.owner]), [[300, 0], [300, 1]]);
  assert.deepEqual(of(ev, 'end').map((e) => [e.f, e.result]), [[300, 0]]);
  assert.equal(w.stage.stamps, 0);
});

test('[合作-7] progress: rescued neutral units, knocked-down targets, kills without the neutral, the clock, the leaders\' HP', () => {
  const c = level([stage('c#1', {})], [], []);
  const w = createWorld(c, { seed: 1, players: 1 });
  run(w, c, 1);
  const st = /** @type {any[]} */ (c.level.stages)[0];
  const civ = makeEnemy(w, c, { key: 'civ', route: 0 }), slime = makeEnemy(w, c, { key: 'slime', route: 0 }), boss = makeEnemy(w, c, { key: 'boss', route: 0 });
  /** @param {string} objective @param {[any, boolean][]} gone @param {Record<string, unknown>} [more] @param {number} [start] */
  const count = (objective, gone, more = {}, start = 0) => {
    Object.assign(st, { objective, ...more });
    w.stage = { ...w.stage, running: true, start, count: 0, died: false };
    for (const [u, arrived] of gone) stageCount(w, c, u, arrived);
    return w.stage.count;
  };
  assert.equal(count('protect', [[civ, true], [civ, false], [slime, true]]), 1, 'neutral units that reached the goal');
  assert.equal(count('target', [[slime, false], [slime, true], [civ, false]], { enemy: 'slime' }), 1, 'the enemy_key ones knocked down');
  assert.equal(count('kill', [[slime, false], [civ, false], [slime, true], [boss, false]]), 2, 'knocked down, not neutral');
  assert.equal(count('tower', [[slime, false]]), 0, 'not implemented: nothing counts');
  assert.equal(count('kill', [[slime, false]], {}, w.frame + 5), 0, 'before the clock starts');
});

test('[合作-7] 突击: the leaders\' HP lost against the fraction of hp_max; a leader leaving the field reaches it all', () => {
  const settle = (/** @type {(w: World, c: any) => void} */ setup, /** @type {Record<string, unknown>} */ st) => {
    const c = level([stage('c#1', { objective: 'boss', time: 1, hpMax: 2000, ...st })], [], []);
    const w = createWorld(c, { seed: 1, players: 1 });
    run(w, c, 1);
    setup(w, c);
    return of(run(w, c, 40), 'stage').map((e) => e.stamps);
  };
  const leaders = (/** @type {number[]} */ hps) => (/** @type {World} */ w, /** @type {any} */ c) => {
    for (const hp of hps) { const b = makeEnemy(w, c, { key: 'boss', route: 0 }); b.hp = hp; w.units.push(b); }
  };
  assert.deepEqual(settle(leaders([500, 500]), { goal: 0.5, advanced: 1 }), [1], '1000 of 2000 lost: half');
  assert.deepEqual(settle(leaders([600, 500]), { goal: 0.5, advanced: 1 }), [0], 'not quite');
  assert.deepEqual(settle(leaders([1, 1]), { goal: 1 }), [0], 'nearly all HP lost but none left the field: the whole needs a leader down');
  assert.deepEqual(settle(leaders([0, 1000]), { goal: 1 }), [1], 'one knocked down');
  assert.deepEqual(settle((w, c) => { leaders([1000])(w, c); w.stage.died = true; }, { goal: 0.5, advanced: 1 }), [2], 'a leader down: all of it');
});

test('[合作-8] [敌能-22] [敌能-62] the intermission: enemies, those to be brought in, projectiles and 【免费品尝】 areas gone, operators retreat ready at once, lives full, the fallen back, the wave cut', () => {
  const c = level([stage('c#1', { objective: 'survive', goal: 10 }), stage('c#2', { rest: 3 })], [spawnAt(0, 'slime'), spawnAt(20, 'slime')], []);
  const w = createWorld(c, { seed: 1, players: 2 });
  run(w, c, 1, (x) => { step(x, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }], [1, { type: 'deploy', op: 'sniper', row: 0, col: 2, dir: 0 }]]); });
  run(w, c, 100);
  w.players[1].life = 1; w.players[1].revive = 50; w.players[0].life = 2;
  w.shots.push({ src: 1, target: 3, sx: 0, sy: 0, speed: 1, type: 'phys', amount: 1, times: 1, element: '', ep: 0 });
  w.broods = [{ key: 'slime', x: 1, y: 1, route: 0, leg: 0, frag: 0, left: 1000 }];
  w.tastings = [{ x: 1, y: 1, radius: 2, remain: 1000, aspd: 100, dodge: 0.8 }];
  const cost = w.players.map((p) => p.cost);
  const ev = run(w, c, 220);
  const at = of(ev, 'stage').find((e) => e.on === 0)?.f;
  assert.equal(at, 300);
  assert.deepEqual(w.units.filter((u) => u.kind !== KIND.OPERATOR).length, 0, 'no enemies');
  assert.deepEqual([w.units.length, w.shots.length, w.broods.length, w.tastings.length], [0, 0, 0, 0]);
  assert.equal(of(ev, 'retreat').length, 2);
  assert.deepEqual(w.players.map((p) => p.cards[p === w.players[0] ? 'guard' : 'sniper'].ready), [300, 300], 'redeploy time cleared');
  assert.ok(w.players.every((p, i) => p.cost > cost[i]), 'refunds as a retreat');
  assert.deepEqual(w.players.map((p) => [p.life, p.revive]), [[3, -1], [3, -1]]);
  assert.deepEqual(of(ev, 'revive').map((e) => e.owner), [1]);
  assert.equal(of(ev, 'spawn').length, 0, 'the 20 s slime never came');
});

test('[合作-6] [同步-2] the stages\' progress is state: a snapshot during the rest runs on the same', () => {
  const c = level([stage('c#1', { objective: 'survive', goal: 2, time: 2 }), stage('c#2', { objective: 'survive', goal: 3, time: 3, rest: 2 })], [spawnAt(0, 'slime')], [spawnAt(0, 'slime')]);
  const w = createWorld(c, { seed: 1, players: 1 });
  run(w, c, 80);
  const copy = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));
  run(w, c, 200);
  run(copy, c, 200);
  assert.equal(stateHash(copy), stateHash(w));
  assert.equal(w.result, 1);
});

test('[合作-9] neutral units: operators neither target nor block them, ranged enemies do target them, no 元素损伤, knocked down they cost lives', () => {
  const c = level([stage('c#1', {})], [], []);
  c.enemies.archer = { ...c.enemies.slime, atk: 50, applyWay: 'RANGED', rangeRadius: 3 };
  c.level.tiles[1][5] = { ...c.level.tiles[1][5], goal: 'B' };
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const civ = makeEnemy(w, c, { key: 'civ', route: 0 }), archer = makeEnemy(w, c, { key: 'archer', route: 0 });
  civ.x = 2; civ.y = 1; archer.x = 2; archer.y = 1;
  w.units.push(civ, archer);
  const guard = w.units[0];
  assert.deepEqual(targetsOf(w, c, guard).map((u) => u.key), ['archer']);
  assert.equal(tryBlock(w, c, civ), false);
  assert.deepEqual(enemyTargets(w, archer).map((u) => u.key).toSorted(), ['civ', 'guard']);
  assert.deepEqual(enemyTargets(w, civ), [], 'it does not attack');
  assert.equal(dealEp(w, civ, 'FIRE', 500), 0);
  civ.hp = 0;
  const ev = run(w, c, 1);
  assert.deepEqual(w.players.map((p) => p.life), [3, 2], 'side B\'s goal: seat 1 loses its 1 life');
  assert.deepEqual(of(ev, 'death').length, 1);
});
