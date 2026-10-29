// The training level IG-TR-2 规则教学-阵地足球 (act1multi_tr02) as extracted and played headless (docs/spec/level.md
// 关卡-1, 关卡-7; waves.md 波次-7…波次-9; football.md 足球-4, 足球-6, 足球-14): the ball's kick threshold the level's
// 900 with its own friction and force; the fixed lineup's six cards held back until the third wave; the second 玫兰莎
// and 红云 by their aliases; no team drawn, the waves in order; the goal of the first wave ours, the second wave's shot
// caught by a goalkeeper of the level's, its card the player's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, deployProblem, deck as decks } from '@aue/sim';
import { LEVELS, matchContent } from '../src/index.js';

const lv = LEVELS['act1multi_tr02'];

test('[关卡-1] IG-TR-2\'s ball: the level sets only its kick threshold, 900; its friction, restitution, force and block stay', () => {
  assert.deepEqual(lv.enemies.enemy_4015_musucr.talents, { aura: { block_cnt: 3 }, physic: { friction_factor: 0.7, restitution_factor: 0.75, value: 900, force: 450 } });
});

test('[关卡-7] [波次-7] IG-TR-2\'s fixed lineup of six held back by their aliases; the second 玫兰莎 and 红云 predefined by theirs', () => {
  assert.deepEqual(lv.level.cards.operators.map((/** @type {any} */ x) => [x.key, x.alias, x.hidden]), [
    ['char_208_melan', 'char_208_melan#3', true], ['char_122_beagle', 'char_122_beagle#3', true], ['char_106_franka', 'char_106_franka#3', true],
    ['char_190_clour', 'char_190_clour#3', true], ['char_150_snakek', 'char_150_snakek#3', true], ['char_237_gravel', 'char_237_gravel#3', true]]);
  const pre = lv.level.predefines.filter((/** @type {any} */ p) => p.build).map((/** @type {any} */ p) => [p.alias, p.key, p.row, p.col]);
  assert.deepEqual(pre.filter((/** @type {[string]} */ [alias]) => alias.includes('#')), [['char_208_melan#2', 'char_208_melan', 5, 5], ['char_190_clour#2', 'char_190_clour', 5, 8], ['char_144_red#3', 'char_144_red', 4, 1]]);
  assert.equal(Object.hasOwn(lv.devices, 'char_208_melan'), false, 'no device');
  // IG-TR-1: only 蛇屠箱's card has a wave that shows it; the others are in the deck from the start
  assert.deepEqual(LEVELS['act1multi_tr01'].level.cards.operators.map((/** @type {any} */ x) => [x.key, x.hidden ?? false]),
    [['char_124_kroos', false], ['char_150_snakek', true], ['char_117_myrrh', false], ['char_126_shotst', false]]);
});

const PUT = /** @type {any} */ ({ type: 'deploy', op: 'trap_165_muftbl#0', row: 5, col: 6, dir: 1 }), CARD = 'char_208_melan#0';

/** @typedef {{ stories: string[], waves: number[], goals: [number, number][], caught: number, put: number, heldBack: boolean[] }} Seen */

/** The player's one task (the drag of story b): the caught ball's card, once held and deployable, put down at (5, 6). @param {any} w @param {any} c @param {Seen} seen */
function task(w, c, seen) {
  const held = (w.players[0].balls?.length ?? 0) > 0;
  if (seen.caught < 0 && held) seen.caught = w.frame;
  if (seen.put >= 0 || !held || deployProblem(w, c, 0, PUT) !== null) return [];
  seen.put = w.frame;
  return [[0, PUT]];
}

/** What a frame's events tell. @param {any} w @param {any} c @param {Seen} seen */
function note(w, c, seen) {
  for (const e of w.events) {
    if (e.type === 'story') seen.stories.push(String(e.key).split('_').pop() ?? '');
    if (e.type === 'wave') { seen.waves.push(Number(e.index)); seen.heldBack.push(decks.cardHidden(w, c, CARD)); }
    if (e.type === 'score') seen.goals.push([Number(e.goal), seen.waves.length - 1]);
  }
}

/** IG-TR-2 headless with the player's one task; what happened. */
async function play() {
  const deck = lv.level.cards.operators.map((/** @type {any} */ x) => ({ id: x.key, build: x.build }));
  const c = await matchContent({ level: 'act1multi_tr02', difficulty: 'NORMAL', seed: 7, decks: [deck, []] });
  const w = createWorld(c, { seed: 7, players: 2 });
  /** @type {Seen} */
  const seen = { stories: [], waves: [], goals: [], caught: -1, put: -1, heldBack: [] };
  for (let f = 0; f < 30 * 80 && w.result < 0; f++) {
    step(w, c, /** @type {any} */ (task(w, c, seen)));
    note(w, c, seen);
  }
  return { w, c, seen };
}

test('[足球-6] [足球-14] [波次-8] [波次-9] IG-TR-2 headless: the waves in order, our goal first, a goalkeeper\'s catch for the player, the lineup shown last', async () => {
  const { w, c, seen } = await play();
  assert.deepEqual(seen.stories, ['a', 'b', 'c']);
  assert.deepEqual(seen.waves, [0, 1, 2], 'in order, each after a goal');
  assert.equal(w.football?.team, 0, 'the standard team, none drawn');
  assert.deepEqual(seen.goals[0], [1, 0], 'the first wave ends with our goal');
  assert.ok(seen.caught > 0 && seen.put >= seen.caught, 'the second wave\'s shot caught by one of the level\'s goalkeepers, its card the player\'s, put down');
  assert.deepEqual(seen.heldBack, [true, true, true], 'held back as each wave begins');
  assert.equal(decks.cardHidden(w, c, CARD), false, 'the third wave shows it');
  assert.equal(w.result, 1, 'the match ends');
});
