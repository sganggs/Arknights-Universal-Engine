// 阵地足球's banners (docs/spec/ui.md 界面-41) on a small pack, in a minimal document: the start banner once the match
// begins, the goal banner each time a side scores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, createBanner, createGoalBanner, GOAL_SOUNDS } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {string} name @param {PackNode[]} [children] @param {Record<string, any>} [comps] @param {boolean} [active] @returns {PackNode} */
const N = (name, children = [], comps = {}, active = true) => ({ name, active, comps, children });

const STAGE = N('banner', [N('info', [N('container_conventional_mode', [N('content')], {}, false), N('container_soccer_mode', [N('content')], {}, false)])]);
const SCORE = N('cooperate_battle_ui_score_panel', [N('panel_root', [N('group_enemy'), N('group_ally')])], { group: { alpha: 1 } }, false);
const fade = (/** @type {number} */ length) => ({ wrap: 0, length, curves: [{ kind: 'float', path: 'content', attr: 'm_Alpha', keys: [[0, 0, 0, 0], [length, 1, 0, 0]] }] });
const goal = { wrap: 0, length: 1.5, curves: [{ kind: 'float', path: 'panel_root/group_ally', attr: 'm_Alpha', keys: [[0, 0, 0, 0], [1.5, 0, 0, 0]] }] };
const HUD = {
  coopStage: { panel: '@info/container_conventional_mode', clip: 'show', football: { panel: '@info/container_soccer_mode', clip: 'soccer', trainingClip: 'soccerTr' } },
  coopScore: { ally: '@panel_root/group_ally', enemy: '@panel_root/group_enemy', clip: 'goal' },
};
const setup = (withScore = true, /** @type {((bank: string) => void) | undefined} */ sound = undefined) => {
  const pack = { version: 1, ref: [1920, 1080], sprites: {}, clips: { show: fade(4), soccer: fade(4), soccerTr: fade(5), goal },
    screens: { 'coop.stage': STAGE, ...(withScore ? { 'coop.score': SCORE } : {}) }, hud: withScore ? HUD : { coopStage: HUD.coopStage } };
  const ui = createUi({ pack: /** @type {any} */ (pack), host: fakeHost(fakeDocument()), sound });
  ui.resize(1920, 1080);
  return ui;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

test('[界面-41] 阵地足球: its own start banner once the match begins — once —, then it goes', async () => {
  const ui = setup(), b = /** @type {NonNullable<ReturnType<typeof createBanner>>} */ (createBanner(ui));
  const soccer = /** @type {any} */ (b.screen.one('container_soccer_mode'));
  assert.equal(soccer.active, false, 'hidden until the match begins');
  b.football();
  assert.deepEqual([soccer.active, b.panel.active], [true, false]);
  ui.tick(4.1);
  await flush();
  assert.equal(soccer.active, false, 'its clip played: gone');
  b.football();
  assert.equal(soccer.active, false, 'once a match');
});

test('[界面-41] 阵地足球: 进球！ for our goal, 失球！ for theirs, each time a side scores; not for the score first given', async () => {
  const ui = setup(), g = /** @type {NonNullable<ReturnType<typeof createGoalBanner>>} */ (createGoalBanner(ui));
  const root = g.screen.root, side = (/** @type {string} */ n) => /** @type {any} */ (g.screen.one(n)).active;
  g.update({ home: 2, away: 1, left: 120 });
  assert.equal(root.active, false, 'the first score seen: no banner');
  g.update({ home: 3, away: 1, left: 100 });
  assert.deepEqual([root.active, side('group_ally'), side('group_enemy')], [true, true, false], 'our goal');
  ui.tick(1.6);
  await flush();
  assert.equal(root.active, false, 'its clip played: gone');
  g.update({ home: 3, away: 2, left: 80 });
  assert.deepEqual([root.active, side('group_ally'), side('group_enemy')], [true, false, true], 'their goal');
  g.update({ home: 3, away: 2, left: 79 });
  assert.equal(root.active, true, 'still on: the same score');
  g.update(null);
  assert.equal(createGoalBanner(setup(false)), null, 'no banner without the pack’s');
});

test('[界面-41] 阵地足球: the goal banner plays the activity’s goal sound as it shows — ours, then theirs —, none for the first score', () => {
  /** @type {string[]} */
  const heard = [];
  const g = /** @type {NonNullable<ReturnType<typeof createGoalBanner>>} */ (createGoalBanner(setup(true, (b) => heard.push(b))));
  g.update({ home: 0, away: 0, left: 300 });
  g.update({ home: 1, away: 0, left: 290 });
  g.update({ home: 1, away: 1, left: 280 });
  assert.deepEqual(heard, [GOAL_SOUNDS.ours, GOAL_SOUNDS.theirs]);
  assert.deepEqual(GOAL_SOUNDS, { ours: 'battle.ON_COOPERATE_ALLY_SCORED', theirs: 'battle.ON_COOPERATE_ENEMY_SCORED' });
});
