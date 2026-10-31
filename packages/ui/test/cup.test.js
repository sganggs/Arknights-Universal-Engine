// 阵地足球锦标's battle UI (docs/spec/ui.md 界面-42) on a small pack, in a minimal document: the top bar, the kickoff and
// penalty count-downs, the penalty marks, the start and score banners one after another, the finish panel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, createCupHud, shotBanner, CUP_SOUNDS } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {string} name @param {PackNode[]} [children] @param {Record<string, any>} [comps] @param {boolean} [active] @returns {PackNode} */
const N = (name, children = [], comps = {}, active = true) => ({ name, active, comps, children });
const TEXT = { text: { text: '', size: 20, style: 0, align: 4, line: 1, best: 0, min: 2, max: 40, rich: 0, hwrap: 0, color: [1, 1, 1, 1], font: '' } };
const T = (/** @type {string} */ name, /** @type {PackNode[]} */ children = []) => N(name, children, TEXT);
/** A count-down: its time and its unit after it. */
const count = () => T('text_countdown', [T('text_unit')]);
const marks = () => N('part_penalty', [N('item_01'), N('item_02'), N('item_03')], {}, false);
const side = (/** @type {string} */ name) => N(name, [T('text_team_name'), T('text_score'), N('team_icon'), marks()]);
const TOP = N('football_cup_battle_ui_topbar', [N('football_battle_ui_topbar', [N('pane_football_status', [
  N('penalty_count_down', [N('penalty_my', [count()]), N('penalty_enemy')], {}, false),
  N('game_start_count_down', [count()], {}, false),
  N('container_info', [side('group_my'), side('group_enemy'), N('count_down', [N('bg', [T('text_count_down')])])]),
])])]);
const group = (/** @type {string} */ name) => N(name, [N('bg'), N('text')], {}, false);
const container = (/** @type {string} */ name) => N(name, [N('group_middle', [N('part_maininfo', [N('stage', [T('text_stage')])])])], {}, false);
const STAGE = N('football_cup_battle_ui_stage_start_panel', [N('football_battle_ui_stage_wave_start_panel', [container('container_game_start'), container('container_penalty_start')])], {}, false);
const SCORE = N('football_cup_battle_ui_score_panel', [N('panel_root', ['group_enemy', 'group_ally', 'group_draw', 'group_penalty', 'group_penalty_enemy', 'group_penalty_success'].map(group))]);
const DONE = N('football_cup_battle_ui_accomplished_panel', [N('image_back_slide')]);

const P = '@football_battle_ui_topbar/pane_football_status';
const sideHud = (/** @type {string} */ g, /** @type {string[]} */ order) => ({
  name: `${P}/container_info/${g}/text_team_name`, score: `${P}/container_info/${g}/text_score`, icon: `${P}/container_info/${g}/team_icon`,
  marks: `${P}/container_info/${g}/part_penalty`, scored: { node: `${P}/container_info/${g}/text_score`, clip: 'score_add' },
  shots: order.map((i) => `${P}/container_info/${g}/part_penalty/item_0${i}`), win: 'penalty_win', lose: 'penalty_lose',
});
const HUD = {
  cup: {
    top: { ally: sideHud('group_my', ['3', '2', '1']), enemy: sideHud('group_enemy', ['1', '2', '3']), timer: `${P}/container_info/count_down/bg/text_count_down`,
      penaltyOn: { node: P, clip: 'penalty_mode_on' },
      kickoff: { count: `${P}/game_start_count_down/text_countdown`, show: { node: `${P}/game_start_count_down`, clip: 'kick_show' }, hide: { node: `${P}/game_start_count_down`, clip: 'kick_off' } },
      penalty: { count: `${P}/penalty_count_down/penalty_my/text_countdown`, ours: `${P}/penalty_count_down/penalty_my`, theirs: `${P}/penalty_count_down/penalty_enemy`,
        show: { node: `${P}/penalty_count_down`, clip: 'pen_show' }, hide: { node: `${P}/penalty_count_down`, clip: 'pen_off' } } },
    stage: { match: { node: '@football_battle_ui_stage_wave_start_panel/container_game_start', clip: 'stage' },
      penalty: { node: '@football_battle_ui_stage_wave_start_panel/container_penalty_start', clip: 'stage' } },
    score: { ally: '@panel_root/group_ally', enemy: '@panel_root/group_enemy', draw: '@panel_root/group_draw', ourKick: '@panel_root/group_penalty',
      theirKick: '@panel_root/group_penalty_enemy', success: '@panel_root/group_penalty_success', clip: { node: '@', clip: 'score' } },
    done: { clip: { node: '@', clip: 'done' } },
    icons: { cup_teamicon_1: 'sprite/cup_teamicon_1', cup_teamicon_3: 'sprite/cup_teamicon_3' },
  },
};
const clip = (/** @type {number} */ length) => ({ wrap: 0, length, curves: [] });
const CLIPS = Object.fromEntries([['score_add', 0.3], ['penalty_win', 0.3], ['penalty_lose', 0.3], ['penalty_mode_on', 0.5], ['kick_show', 0.3], ['kick_off', 0.3],
  ['pen_show', 0.3], ['pen_off', 0.3], ['stage', 2], ['score', 1.5], ['done', 2]].map(([k, l]) => [k, clip(/** @type {number} */ (l))]));

const setup = (/** @type {((bank: string) => void) | undefined} */ sound = undefined) => {
  const pack = { version: 1, ref: [1920, 1080], sprites: {}, clips: CLIPS, screens: { 'cup.topbar': TOP, 'cup.stage': STAGE, 'cup.score': SCORE, 'cup.done': DONE }, hud: HUD };
  const ui = createUi({ pack: /** @type {any} */ (pack), host: fakeHost(fakeDocument()), sound });
  ui.resize(1920, 1080);
  return ui;
};
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Plays `t` seconds of the UI in steps, the clips' ends handled. @param {ReturnType<typeof setup>} ui @param {number} t */
const play = async (ui, t) => { for (let i = 0; i < Math.round(t / 0.1); i++) { ui.tick(0.1); await flush(); } };
const cupOf = (/** @type {Partial<import('../src/index.js').CupTask>} */ o = {}) => ({ ours: '罗德岛队', theirs: '业余组', wait: 0, pk: null, over: false, ...o });
/** @param {ReturnType<typeof createCupHud>} h */
const screens = (h) => /** @type {any} */ (/** @type {any} */ (h).screens());
/** @param {any} s @param {string} path */
const at = (s, path) => /** @type {any} */ (s.one(path));
/** The score banner's group shown, '' for none. @param {any} s */
const shown = (s) => (s.score.root.active ? Object.keys(s.groups).find((k) => s.groups[k].active) ?? '' : '');

test('[界面-42] a penalty round\'s banner by whose kick and whether it went in', () => {
  assert.deepEqual([shotBanner(0, 1), shotBanner(0, 0), shotBanner(1, 0), shotBanner(1, 1)], ['ally', 'enemy', 'success', 'enemy']);
});

test('[界面-42] the top bar: the sides\' names and goals, the time; the match\'s start banner first, the kickoff count-down; a goal\'s banner after it', async () => {
  const ui = setup(), h = /** @type {NonNullable<ReturnType<typeof createCupHud>>} */ (createCupHud(ui));
  assert.equal(h.screens(), null, 'nothing open before a score');
  h.update({ home: 0, away: 0, left: 299.2, cup: cupOf({ wait: 2.5, icons: { ours: 'cup_teamicon_1', theirs: 'cup_teamicon_3' } }) });
  const s = screens(h), top = s.top;
  assert.deepEqual([at(top, 'group_my/team_icon').sprite, at(top, 'group_enemy/team_icon').sprite], ['sprite/cup_teamicon_1', 'sprite/cup_teamicon_3'], 'the sides\' team icons');
  const text = (/** @type {string} */ path) => at(top, path).txt;
  assert.deepEqual([text('group_my/text_team_name'), text('group_enemy/text_team_name'), text('group_my/text_score'), text('count_down/bg/text_count_down')],
    ['罗德岛队', '业余组', '0', '05:00']);
  const kick = at(top, 'game_start_count_down');
  assert.deepEqual([kick.active, text('game_start_count_down/text_countdown'), text('game_start_count_down/text_countdown/text_unit')], [true, '00:03', 's'], '准备开球 00:03s');
  const match = at(s.stage, 'container_game_start');
  assert.deepEqual([s.stage.root.active, match.active, at(s.stage, 'container_game_start/group_middle/part_maininfo/stage/text_stage').txt], [true, true, '1'], 'STAGE.1');
  h.update({ home: 1, away: 0, left: 290, cup: cupOf({ wait: 0 }) });
  await play(ui, 0.5);
  assert.equal(kick.active, false, 'the wait over: its hide clip played, then gone');
  assert.equal(s.score.root.active, false, 'the goal waits for the start banner');
  await play(ui, 1.6);
  assert.deepEqual([s.stage.root.active, shown(s)], [false, 'ally'], '进球！ after it');
  await play(ui, 1.6);
  assert.equal(shown(s), '');
  h.update({ home: 1, away: 1, left: 280, cup: cupOf() });
  assert.equal(shown(s), 'enemy', '失球！');
});

test('[界面-42] the shootout: 平局！, its start banner, 本方点球, then the round with our count-down; each round\'s mark and result, then whose kick is next', async () => {
  const ui = setup(), h = /** @type {NonNullable<ReturnType<typeof createCupHud>>} */ (createCupHud(ui));
  h.update({ home: 1, away: 1, left: 1, cup: cupOf() });
  const s = screens(h), pen = at(s.top, 'penalty_count_down');
  await play(ui, 2.1);
  h.update({ home: 1, away: 1, left: 0, cup: cupOf({ pk: { round: 0, on: false, left: -1, shots: [] } }) });
  assert.equal(shown(s), 'draw', '平局！ first');
  assert.deepEqual([at(s.top, 'group_my/part_penalty').active, at(s.top, 'group_enemy/part_penalty').active, pen.active], [true, true, false], 'the marks shown; no round yet');
  await play(ui, 1.6);
  assert.deepEqual([shown(s), s.stage.root.active, at(s.stage, 'container_penalty_start').active, at(s.stage, 'container_penalty_start/group_middle/part_maininfo/stage/text_stage').txt],
    ['', true, true, '2'], 'then 点球 决胜！, STAGE.2');
  await play(ui, 2.1);
  assert.equal(shown(s), 'ourKick', 'then 本方点球, before the round');
  await play(ui, 1.6);
  h.update({ home: 1, away: 1, left: 0, cup: cupOf({ pk: { round: 0, on: true, left: 9.5, shots: [] } }) });
  assert.deepEqual([pen.active, at(s.top, 'penalty_my').active, at(s.top, 'penalty_enemy').active, at(s.top, 'penalty_my/text_countdown').txt], [true, true, false, '00:10'], 'the round: 00:10s');
  assert.equal(shown(s), '', 'no banner as it begins');
  h.update({ home: 2, away: 1, left: 0, cup: cupOf({ pk: { round: 1, on: false, left: -1, shots: [1] } }) });
  assert.ok(s.top.anim.playing.some((/** @type {any} */ p) => p.s === at(s.top, 'group_my/part_penalty/item_03')), 'our mark nearest the middle plays');
  assert.equal(shown(s), 'ally', 'ours in: 进球！');
  await play(ui, 0.5);
  assert.equal(pen.active, false, 'between rounds the count-down goes');
  await play(ui, 1.1);
  assert.equal(shown(s), 'theirKick', '对方点球 after 进球！');
  await play(ui, 1.6);
  h.update({ home: 2, away: 1, left: 0, cup: cupOf({ pk: { round: 1, on: true, left: -1, shots: [1] } }) });
  assert.deepEqual([pen.active, at(s.top, 'penalty_my').active, at(s.top, 'penalty_enemy').active], [true, false, true], '部署守门员以阻止对方进球');
  h.update({ home: 2, away: 1, left: 0, cup: cupOf({ pk: { round: 2, on: false, left: -1, shots: [1, 0] } }) });
  assert.equal(shown(s), 'success', 'theirs kept out: 成功！');
  await play(ui, 1.6);
  assert.equal(shown(s), 'ourKick');
});

test('[界面-42] a shootout first seen midway: its marks, none of its past banners; the sixth round over: its result, no kick banner; 比赛结束 at the end', async () => {
  const ui = setup(), h = /** @type {NonNullable<ReturnType<typeof createCupHud>>} */ (createCupHud(ui));
  h.update({ home: 3, away: 2, left: 0, cup: cupOf({ pk: { round: 5, on: true, left: -1, shots: [1, 1, 0, 0, 1] } }) });
  const s = screens(h);
  assert.equal(at(s.top, 'group_enemy/part_penalty').active, true);
  await play(ui, 2.1);
  assert.equal(shown(s), '', 'no 平局！ nor past results');
  h.update({ home: 3, away: 3, left: 0, cup: cupOf({ pk: { round: 6, on: false, left: -1, shots: [1, 1, 0, 0, 1, 1] }, over: true }) });
  assert.equal(shown(s), 'enemy', 'theirs in: 失球！');
  assert.equal(s.done.root.active, false, 'the finish panel waits its turn');
  await play(ui, 1.6);
  assert.deepEqual([shown(s), s.done.root.active], ['', true], '比赛结束, no kick banner before it');
});

test('[界面-42] each banner plays its sound as it begins, in the banners’ order: the start, a goal, the draw, the shootout, the kicks and their results', async () => {
  /** @type {string[]} */
  const heard = [];
  const ui = setup((b) => heard.push(b)), h = /** @type {NonNullable<ReturnType<typeof createCupHud>>} */ (createCupHud(ui));
  h.update({ home: 0, away: 0, left: 299, cup: cupOf() });
  assert.deepEqual(heard, [CUP_SOUNDS.match], 'the start banner at once');
  h.update({ home: 1, away: 0, left: 290, cup: cupOf() });
  assert.equal(heard.length, 1, 'the goal waits for the start banner');
  await play(ui, 2.1);
  h.update({ home: 1, away: 1, left: 1, cup: cupOf() });
  await play(ui, 3.2);
  h.update({ home: 1, away: 1, left: 0, cup: cupOf({ pk: { round: 0, on: false, left: -1, shots: [] } }) });
  await play(ui, 5.3);
  h.update({ home: 1, away: 1, left: 0, cup: cupOf({ pk: { round: 1, on: false, left: -1, shots: [0] } }) });
  await play(ui, 3.2);
  h.update({ home: 1, away: 1, left: 0, cup: cupOf({ pk: { round: 2, on: false, left: -1, shots: [0, 0] } }) });
  await play(ui, 1.6);
  assert.deepEqual(heard, ['battle.ON_ACT1FOOTBALL_MATCHSTART', 'battle.ON_ACT1FOOTBALL_WINSCORE', 'battle.ON_ACT1FOOTBALL_LOSESCORE', 'battle.ON_ACT1FOOTBALL_DRAW',
    'battle.ON_ACT1FOOTBALL_PENALTYKICK_BANNER', 'battle.ON_ACT1FOOTBALL_PENALTYKICK', 'battle.ON_ACT1FOOTBALL_LOSESCORE', 'battle.ON_ACT1FOOTBALL_PENALTYKICK_OTHER',
    'battle.ON_ACT1FOOTBALL_WINSCORE', 'battle.ON_ACT1FOOTBALL_PENALTYKICK'], 'ours out: 失球！; theirs out: 成功！ (for us)');
});
