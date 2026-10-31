// The co-op parts of the battle HUD (docs/spec/ui.md 界面-15–界面-17) on a small pack, in a minimal document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, createCoopTop, createCostAsk, costAsk, clockText, ANSWER_SHOWN, OBJECTIVES, copyRect, DEF_RT } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {Partial<import('../src/rect.js').Rect>} r */
const R = (r) => ({ ...copyRect(DEF_RT), ...r });
/** @param {string} name @param {Record<string, any>} [comps] @param {PackNode[]} [children] @returns {PackNode} */
const N = (name, comps = {}, children = []) => ({ name, active: true, comps, children });
const img = { img: { kind: 'image', ref: 'sprite/a', color: [1, 1, 1, 1], type: 0 } };
const text = { text: { text: '', size: 30, style: 0, align: 4, color: [1, 1, 1, 1], best: 0, hwrap: 1 } };
/** @param {string} fill @param {number} [min] */
const slider = (fill, min = 0) => ({ slider: { fill, dir: 0, min, max: 1, value: 0, whole: 0 } });
const fillImg = { img: { kind: 'image', ref: 'sprite/a', color: [1, 1, 1, 1], type: 3, fill: 0 } };
/** A state of the cost panel. @param {string} name @param {PackNode[]} kids */
const st = (name, kids) => ({ ...N(name, img, kids), active: false });

const T = '@status/task';
const task = N('task', {}, [
  N('fortress', img), N('fortress_lastWave', img),
  N('normal', slider(`${T}/normal/fill`, -0.1), [N('fill', fillImg), N('text_stage_info_01', text), N('split_line', {}, [N('group_text', {}, [N('text_monster', text)])]),
    N('group_text_02', {}, [N('text_monster', text)]), N('slider_progress_outer', img)]),
  N('taskInfo', {}, OBJECTIVES.map((o) => ({ ...N(o, img, [N('info', text)]), active: false }))),
  N('group_timer', {}, [N('group_timeout', img), N('text_timer', text), N('text_timer_normal', text)]),
]);
const top = { ...N('coop', {}, [
  N('btn_speed_level', img, [N('btn_speed_level_icon', img, [N('hotspot', { nodraw: 'raycast' })]), N('pause_on_me', img), N('pause_on_mate', img)]),
  N('btn_multiplayer_pause', {}, [N('image_pause', img), N('image_resume', img), N('slider_pause_waiting', slider('@btn_multiplayer_pause/slider_pause_waiting/Fill'), [N('Fill', fillImg)]),
    N('collider', { nodraw: 'raycast' })]),
  { ...N('status', img, [N('[my]icon_life_point', img, [N('text_life_point', text)]), N('[you]icon_life_point', img, [N('text_life_point', text)]),
    N('[my]revive_timer', {}, [N('timer', text)]), N('[you]revive_timer', {}, [N('timer', text)]), task]), active: false },
  { ...N('panel_pause_confirm', {}, [N('image_bg', {}, [N('image_rect', {}, [N('text_description', text), N('slider_progress', slider('@panel_pause_confirm/image_bg/image_rect/slider_progress/fill'), [N('fill', fillImg)]),
    N('btn_confirm', { nodraw: 'raycast' }), N('btn_cancel', img, [N('text', text), N('hotspot', { nodraw: 'raycast' })])])])]), active: false },
  N('btn_menu', img),
  { ...N('panel_cooperate_football_status', {}, [N('img_bg', img), { ...N('panel_lead', {}, [N('text_lead', text)]), active: false },
    N('text_score_ally', text), N('text_score_enemy', text), N('text_footbal_timer', text)]), active: false },
]), rt: R({ amin: [0, 1], amax: [1, 1], size: [0, 1], pivot: [0, 1] }) };
const cost = { ...N('cost', {}, [
  st('state_none_button', [N('cost_text', text), N('collider', { nodraw: 'raycast' })]),
  st('state_request', [N('slider_timer', slider('@state_request/slider_timer/fill'), [N('fill', fillImg)])]),
  st('state_accept', [N('mask', {}, [N('cost_text_const', text, [N('cost_text', text)])])]),
  st('state_reject', []), st('state_ignore', []), st('state_wait', [N('cost_info', text)]), st('state_forbid', []),
  st('state_response', [N('state_response_top', img, [N('sprite_cost', img, [N('cost_text', text)])]), N('state_response_accept', img, [N('hotspot', { nodraw: 'raycast' })]),
    N('state_response_reject', img, [N('slider_timer', slider('@state_response/state_response_reject/slider_timer/fill'), [N('fill', fillImg)]), N('hotspot', { nodraw: 'raycast' })])]),
  { ...N('pasue_mask', img), active: false }, N('pause_mask_fail', img), N('response_mask', img),
]), rt: R({ amin: [1, 0], amax: [1, 0], size: [181, 112] }) };
const coopTop = { pause: '@btn_multiplayer_pause', pauseImage: '@btn_multiplayer_pause/image_pause', resumeImage: '@btn_multiplayer_pause/image_resume', pauseConfirm: '@panel_pause_confirm',
  status: { panel: '@status', life: '@status/[my]icon_life_point/text_life_point' }, timerWarn: 10,
  speed: { me: '@btn_speed_level/pause_on_me', mate: '@btn_speed_level/pause_on_mate', image: '@btn_speed_level/btn_speed_level_icon', x1: 'sprite/s1', x2: 'sprite/s2' } };
const setup = () => {
  const ui = createUi({ pack: /** @type {any} */ ({ version: 1, ref: [1920, 1080], sprites: {}, clips: {}, screens: { 'coop.topbar': top, 'coop.cost': cost }, hud: { coopTop } }), host: fakeHost(fakeDocument()) });
  ui.resize(1920, 1080);
  return ui;
};
/** @param {any} n */
const node = (n) => /** @type {import('../src/node.js').UiNode} */ (n);
const side = { life: 3, fast: false, revive: -1 };

/** @param {Partial<import('../src/battle/coopcost.js').CostAskInput>} v @returns {import('../src/battle/coopcost.js').CostAskInput} */
const input = (v) => ({ mine: -1, mates: -1, cooldown: 0, canAsk: true, answer: null, cap: 15, give: 9, fps: 30, open: 450, ...v });

test('[界面-15] the cost request\'s state: the mate\'s request, this seat\'s, the answer, the wait, whether it may ask', () => {
  assert.deepEqual(costAsk(input({ mates: 225, mine: 100 })), { state: 'response', amount: 9, share: 0.5, wait: 0 });
  assert.deepEqual(costAsk(input({ mine: 45 })), { state: 'request', amount: 15, share: 0.1, wait: 0 });
  assert.deepEqual(costAsk(input({ answer: { accept: 1, amount: 7, ago: 0.5 }, cooldown: 300 })), { state: 'accept', amount: 7, share: 0, wait: 0 });
  assert.equal(costAsk(input({ answer: { accept: 0, amount: 0, ago: 1 } })).state, 'reject');
  assert.equal(costAsk(input({ answer: { accept: -1, amount: 0, ago: 1 } })).state, 'ignore');
  assert.deepEqual(costAsk(input({ answer: { accept: 1, amount: 7, ago: ANSWER_SHOWN }, cooldown: 301 })), { state: 'wait', amount: 15, share: 0, wait: 11 });
  assert.equal(costAsk(input({})).state, 'none');
  assert.equal(costAsk(input({ canAsk: false })).state, 'forbid');
});

test('[界面-15] the cost request panel: one state at a time, its figures, the taps', () => {
  const ui = setup();
  /** @type {string[]} */
  const got = [];
  const panel = createCostAsk(ui, { ask: () => got.push('ask'), answer: (v) => got.push(v ? 'yes' : 'no') }), s = panel.screen;
  const on = () => ['state_none_button', 'state_request', 'state_accept', 'state_wait', 'state_response'].filter((n) => node(s.one(n)).active);
  panel.update({ state: 'none', amount: 15, share: 0, wait: 0 });
  ui.tick(0);
  assert.deepEqual(on(), ['state_none_button']);
  assert.equal(node(s.one('state_none_button/cost_text')).txt, '15');
  assert.deepEqual(['pasue_mask', 'pause_mask_fail', 'response_mask'].map((n) => node(s.one(n)).active), [false, false, false]);
  /** @type {any} */ (s.one('state_none_button/collider')).el.fire('click');
  panel.update({ state: 'request', amount: 15, share: 0.25, wait: 0 });
  assert.deepEqual(on(), ['state_request']);
  assert.equal(node(s.one('state_request/slider_timer/fill')).fill, 0.25);
  panel.update({ state: 'accept', amount: 7, share: 0, wait: 0 });
  assert.equal(node(s.one('state_accept/mask/cost_text_const/cost_text')).txt, '7');
  panel.update({ state: 'wait', amount: 15, share: 0, wait: 9 });
  assert.equal(node(s.one('state_wait/cost_info')).txt, '09');
  panel.update({ state: 'response', amount: 9, share: 0.5, wait: 0 });
  ui.tick(0);
  assert.deepEqual(on(), ['state_response']);
  assert.equal(node(s.one('state_response_top/sprite_cost/cost_text')).txt, '9');
  /** @type {any} */ (s.one('state_response_accept/hotspot')).el.fire('click');
  /** @type {any} */ (s.one('state_response_reject/hotspot')).el.fire('click');
  assert.deepEqual(got, ['ask', 'yes', 'no']);
});

test('[界面-16] the stage\'s task: stage, objective line, count on the bar and in figures, the advanced goal, the time and its warning', () => {
  assert.equal(clockText(147.2), '02:28');
  assert.equal(clockText(-3), '00:00');
  const ui = setup(), co = createCoopTop(ui, coopTop, { speed() {}, pause() {} }), s = co.screen;
  co.update({ me: side, mate: side, speed: 1, paused: false, asking: -1, task: null });
  ui.tick(0);
  assert.equal(node(s.one('task')).active, false, 'none before the first stage');
  co.update({ me: side, mate: side, speed: 1, paused: false, asking: -1, task: { stage: 2, objective: 'protect', count: 3, goal: 4, left: 61 } });
  ui.tick(0);
  assert.equal(node(s.one('text_stage_info_01')).txt, 'STAGE.2');
  assert.deepEqual([node(s.one('split_line')).active, node(s.one('group_text_02')).active, node(s.one('group_text_02/text_monster')).txt], [false, true, '3/4'],
    'no advanced goal: the count at the right end, no line');
  assert.ok(Math.abs(/** @type {number} */ (node(s.one('normal/fill')).fill) - 0.85 / 1.1) < 1e-12, 'the bar runs from −0.1');
  assert.deepEqual(OBJECTIVES.map((o) => node(s.one(`taskInfo/${o}`)).active), OBJECTIVES.map((o) => o === 'protect'));
  assert.deepEqual([node(s.one('text_timer_normal')).txt, node(s.one('text_timer_normal')).active, node(s.one('group_timeout')).active], ['01:01', true, false]);
  assert.deepEqual(['fortress', 'fortress_lastWave', 'slider_progress_outer', 'btn_menu'].map((n) => node(s.one(n)).active), [false, false, false, false]);
  co.update({ me: side, mate: side, speed: 1, paused: false, asking: -1, task: { stage: 2, objective: 'kill', count: 3, goal: 4, advanced: 6, left: 9.5 } });
  ui.tick(0);
  assert.deepEqual([node(s.one('split_line')).active, node(s.one('split_line/group_text/text_monster')).txt, node(s.one('group_text_02/text_monster')).txt], [true, '3/4', '3/6'],
    'an advanced goal: the goal left of the line, the advanced goal at the right end');
  assert.deepEqual([node(s.one('text_timer')).txt, node(s.one('text_timer')).active, node(s.one('group_timeout')).active, node(s.one('text_timer_normal')).active], ['00:10', true, true, false]);
  co.update({ me: side, mate: side, speed: 1, paused: false, asking: -1, task: { stage: 1, objective: 'kill', count: 0, goal: 0, left: 5 } });
  assert.equal(node(s.one('normal/fill')).fill, 0, 'no goal: the bar empty');
  co.update({ me: side, mate: side, speed: 1, paused: false, asking: -1, task: { stage: 1, objective: 'kill', count: 0, goal: 46, left: 5 } });
  assert.equal(node(s.one('normal/fill')).fill, 0, 'nothing counted: the bar empty, not at the count 0 of its range');
  co.update({ me: side, mate: side, speed: 1, paused: false, asking: -1, task: { stage: 1, objective: 'kill', count: 7, goal: 46, left: 5 } });
  assert.ok(Math.abs(/** @type {number} */ (node(s.one('normal/fill')).fill) - (7 / 46 + 0.1) / 1.1) < 1e-12, 'about a quarter at 7/46, as the original');
});

test('[界面-17] the mate\'s pause request: the popup with its time left, the answers; this seat\'s request on the button', () => {
  const ui = setup();
  /** @type {boolean[]} */
  const got = [];
  const co = createCoopTop(ui, coopTop, { speed() {}, pause() {}, confirm: (v) => got.push(v) }), s = co.screen;
  co.update({ me: side, mate: side, speed: 1, paused: false, asking: 0.4, confirm: -1 });
  ui.tick(0);
  assert.equal(node(s.one('panel_pause_confirm')).active, false);
  assert.equal(node(s.one('slider_pause_waiting/Fill')).fill, 0.4);
  co.update({ me: side, mate: side, speed: 1, paused: false, asking: -1, confirm: 0.6 });
  ui.tick(0);
  assert.equal(node(s.one('panel_pause_confirm')).active, true);
  assert.equal(node(s.one('panel_pause_confirm/image_bg/image_rect/slider_progress/fill')).fill, 0.6);
  assert.equal(node(s.one('slider_pause_waiting')).active, false);
  /** @type {any} */ (s.one('btn_confirm')).el.fire('click');
  /** @type {any} */ (s.one('btn_cancel/hotspot')).el.fire('click');
  assert.deepEqual(got, [true, false]);
  const quiet = createCoopTop(setup(), coopTop, { speed() {}, pause() {} });
  quiet.update({ me: side, mate: side, speed: 1, paused: false, asking: -1, confirm: 0.5 });
  /** @type {any} */ (quiet.screen.one('btn_confirm')).el.fire('click');
});

test('[界面-41] 阵地足球: the football panel in place of the status panel — the goals, the time left; the lead tag while we lead', () => {
  const ui = setup(), co = createCoopTop(ui, coopTop, { speed() {}, pause() {} }), s = co.screen;
  const base = { me: side, mate: side, speed: 1, paused: false, asking: -1 };
  assert.equal(node(s.one('panel_cooperate_football_status')).active, false, 'hidden until a football state');
  co.update({ ...base, football: { home: 0, away: 1, left: 299.2 } });
  const panel = node(s.one('panel_cooperate_football_status'));
  assert.deepEqual([panel.active, node(s.one('status')).active], [true, false]);
  const texts = (/** @type {string} */ n) => /** @type {any} */ (node(s.one(n, panel))).txt;
  assert.deepEqual([texts('text_score_ally'), texts('text_score_enemy'), texts('text_footbal_timer')], ['0', '1', '05:00']);
  assert.equal(node(s.one('panel_lead', panel)).active, false);
  co.update({ ...base, football: { home: 2, away: 1, left: 61 } });
  assert.deepEqual([texts('text_score_ally'), texts('text_footbal_timer'), node(s.one('panel_lead', panel)).active], ['2', '01:01', true]);
  co.update({ ...base, football: { home: 2, away: 2, left: 30 } });
  assert.equal(node(s.one('panel_lead', panel)).active, false, 'level again: the tag goes');
});

test('[界面-42] 阵地足球锦标: neither the football panel nor the status panel — the event\'s own top bar is shown instead', () => {
  const ui = setup(), co = createCoopTop(ui, coopTop, { speed() {}, pause() {} }), s = co.screen;
  const cup = { ours: '罗德岛队', theirs: '业余组', wait: 0, pk: null, over: false };
  co.update({ me: side, mate: side, speed: 1, paused: false, asking: -1, football: { home: 0, away: 1, left: 299.2, cup } });
  assert.deepEqual([node(s.one('panel_cooperate_football_status')).active, node(s.one('status')).active], [false, false]);
});

