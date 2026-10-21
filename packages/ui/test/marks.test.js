// The co-op marks and battle emotes (docs/spec/ui.md 界面-37, 界面-38) on a small pack, in a minimal document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, createMarks, createBattleEmotes, MARK_KIND, copyRect, DEF_RT } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {Partial<import('../src/rect.js').Rect>} r */
const R = (r) => ({ ...copyRect(DEF_RT), ...r });
/** @param {string} name @param {Record<string, any>} [comps] @param {PackNode[]} [children] @param {Partial<import('../src/rect.js').Rect>} [rt] @returns {PackNode} */
const N = (name, comps = {}, children = [], rt = {}) => ({ name, active: true, comps, children, rt: R(rt) });
const img = { img: { kind: 'image', ref: 'sprite/a', color: [1, 1, 1, 1], type: 0 } };
const text = { text: { text: '', size: 30, style: 0, align: 4, color: [1, 1, 1, 1], best: 0, hwrap: 1 } };
const hot = { nodraw: 'raycast' };
const FULL = { amin: [0, 0], amax: [1, 1] };

const markCard = N('cooperate_battle_ui_pin_mark_card', {}, [
  N('edgeMarkList'), { ...N('dummy'), active: false },
  N('btn_display_mark', { anim: { clips: ['drag'] } }, [N('mark_state', {}, [N('description', {}, [N('text_bg', text)])]), N('collider', hot, [], FULL),
    { ...N('cool_down', {}, [N('time', text)]), active: false }], { size: [161, 186] }),
  N('pinMark_edge'),
], FULL);
const side = (/** @type {string} */ name) => ({ ...N(name, img, [N('button_A', img, [N('collider', hot, [], { size: [100, 50] })]), N('button_B', img, [N('collider', hot, [], { size: [100, 50] })])],
  { size: [298, 189], scale: [1.85, 1.85] }), active: false });
const markMenu = N('cooperate_battle_ui_mark_menu', {}, [side('button_right'), side('button_left')], FULL);
const markEdge = N('cooperate_battle_ui_pin_mark_edge', {}, [N('act_multi_v3_battle_mark_other', {}, [N('container', {}, [N('arrow_container', img),
  { ...N('container_icon_attention', img), active: false }, { ...N('container_icon_exit', img), active: false }])], { size: [200, 200] })], FULL);
const plugin = N('cooperate_battle_ui_plugin', {}, [N('states', {}, [], FULL), N('cooperate_battle_emoticon_panel', {}, [
  N('btn_normal', img, [N('hotspot', hot, [], FULL)], { amin: [0.5, 1], amax: [0.5, 1], size: [152, 87] }), N('panel_anchor', {}, [], FULL), N('pop_emoticon_item_self', {}, [], { amin: [0.5, 1], amax: [0.5, 1] }),
], FULL)], FULL);
const emotePanel = N('multiv3_emoticon_panel_battle', {}, [N('non_draw_close_area', hot, [], FULL), N('panel_rect', {}, [N('pos_handler', {}, [N('scroll_pager', img, [
  N('viewport', {}, [N('content', {}, [], { size: [400, 130] })], FULL), N('dot_content', {}, [], { size: [170, 25] })], { size: [445, 145] })])], { size: [443, 180] })], FULL);
const pop = N('multiV3_pop_emoji_item_battle', {}, [{ ...N('emoji_send_mate', img, [N('img_emoji', img)]), active: false }, { ...N('emoji_send_me', img, [N('img_emoji', img)]), active: false }]);
const hud = {
  coopMarks: { drag: { animationWrapper: '@btn_display_mark', animationName: 'drag' }, cooldown: '@btn_display_mark/cool_down', cooldownText: '@btn_display_mark/cool_down/time', collider: '@btn_display_mark/collider' },
  coopEmotes: { panel: '@cooperate_battle_emoticon_panel/panel_anchor', pop: '@cooperate_battle_emoticon_panel/pop_emoticon_item_self', button: '@cooperate_battle_emoticon_panel/btn_normal',
    hotspot: '@cooperate_battle_emoticon_panel/btn_normal/hotspot', cd: 5, selfOffset: [-365, 0], mateOffset: [380, 0], inactive: 0.4, active: 1 },
};
const screens = { 'coop.markCard': markCard, 'coop.markMenu': markMenu, 'coop.markEdge': markEdge, 'coop.plugin': plugin, 'coop.emotePanel': emotePanel,
  'coop.emoteTheme': N('multiv3_emoticon_theme_item_battle'), 'coop.emoteItem': N('multiv3_emoji_item_battle', {}, [N('emoji_icon', img), N('hotspot', hot, [], FULL)]),
  'coop.emoteDot': N('pager_progress_dot_battle', img, [], { size: [16, 15] }), 'coop.emotePop': pop };
const clip = { wrap: 0, length: 0.5, curves: [{ kind: 'float', path: 'mark_state', attr: 'm_Alpha', keys: [[0, 1, 0, 0], [0.5, 0, 0, 0]] }] };
const setup = () => {
  const ui = createUi({ pack: /** @type {any} */ ({ version: 1, ref: [1920, 1080], sprites: {}, clips: { drag: clip }, screens, hud }), host: fakeHost(fakeDocument()) });
  ui.resize(1920, 1080);
  return ui;
};
/** @param {any} n */
const fire = (n, type = 'click', more = {}) => n.el.fire(type, more);

test('[界面-37] the mark card: a press reported at its point; its drag clip; the cool-down with its seconds', async () => {
  const ui = setup(), pressed = /** @type {number[][]} */ ([]);
  const m = createMarks(ui, { press: (x, y) => pressed.push([x, y]) });
  ui.tick(0);
  fire(m.screen.one('collider'), 'pointerdown', { clientX: 30, clientY: 1000 });
  assert.deepEqual(pressed, [[30, 1000]]);
  assert.equal(m.screen.one('dummy')?.active, false);
  m.update({ dragging: true, cooldown: 0 });
  for (let i = 0; i < 7; i++) ui.tick(0.1);
  assert.equal(m.screen.one('mark_state')?.alpha, 0, 'the drag clip played');
  m.update({ dragging: false, cooldown: 2.25 });
  assert.equal(m.screen.one('cool_down')?.active, true);
  assert.equal(m.screen.one('cool_down/time')?.txt, '2.3s');
  m.update({ dragging: false, cooldown: 0 });
  assert.equal(m.screen.one('cool_down')?.active, false);
});

test('[界面-37] the menu by a tile: its right side in the screen\'s left half, else its left; a pick closes it', () => {
  const ui = setup(), picked = /** @type {number[]} */ ([]);
  const m = createMarks(ui, { press: () => {} });
  m.menu([400, 500], (k) => picked.push(k));
  ui.tick(0);
  const menu = /** @type {any} */ (m.screen.one('button_right'))?.parent;
  assert.deepEqual([m.screen.one('button_right')?.active, m.screen.one('button_left')?.active], [true, false]);
  assert.deepEqual(menu.rt.pos, [400 - 960, 540 - 500], 'at the tile');
  assert.deepEqual(m.screen.one('button_right')?.rt.scale, [1, 1], 'flat at its own size');
  fire(m.screen.one('button_right/button_B/collider'));
  assert.deepEqual([...picked], [MARK_KIND.withdraw]);
  assert.equal(m.menuOpen, false);
  m.menu([1500, 500], (k) => picked.push(k));
  ui.tick(0);
  assert.deepEqual([m.screen.one('button_right')?.active, m.screen.one('button_left')?.active], [false, true]);
  fire(m.screen.one('button_left/button_A/collider'));
  assert.deepEqual(picked, [MARK_KIND.withdraw, MARK_KIND.attention]);
});

test('[界面-37] the mate\'s marks of a kind: their icon by their tile, without the arrow; gone with them; a plain one none', () => {
  const ui = setup(), m = createMarks(ui, { press: () => {} });
  m.icons([{ id: 'a', at: [100, 200], kind: MARK_KIND.attention }, { id: 'b', at: [300, 200], kind: MARK_KIND.plain }, { id: 'c', at: [500, 200], kind: MARK_KIND.withdraw }]);
  const edges = m.screen.q('act_multi_v3_battle_mark_other').map((x) => x.parent);
  assert.equal(edges.length, 2);
  assert.deepEqual(edges.map((e) => [e?.rt.pos, m.screen.one('container_icon_attention', e ?? undefined)?.active, m.screen.one('container_icon_exit', e ?? undefined)?.active,
    m.screen.one('arrow_container', e ?? undefined)?.active]), [[[100 - 960, 340], true, false, false], [[500 - 960, 340], false, true, false]]);
  m.icons([{ id: 'c', at: [500, 210], kind: MARK_KIND.withdraw }]);
  assert.equal(m.screen.q('act_multi_v3_battle_mark_other').length, 1);
});

test('[界面-38] the battle emotes: the button opens the panel, a page a theme, a dot a page; a tap sends and closes; resting fades the button', () => {
  const ui = setup(), sent = /** @type {string[][]} */ ([]);
  const e = createBattleEmotes(ui, { themes: ['t1', 't2'], emotes: ['e1', 'e2', 'e3'], picture: (t, id) => `/${t}/${id}.webp`, send: (t, id) => sent.push([t, id]) });
  ui.tick(0);
  assert.equal(e.screen.one('states')?.active, false);
  fire(e.screen.one('btn_normal/hotspot'));
  ui.tick(0);
  assert.equal(e.open, true);
  const pages = e.screen.q('emoji_icon');
  assert.equal(pages.length, 6, 'three emotes in each of two themes');
  assert.equal(e.screen.q('hotspot').filter((h) => h.parent?.n.name === 'multiv3_emoji_item_battle' && h.parent.parent?.active).length, 3, 'one page shown');
  const dots = e.screen.all.filter((x) => x.n.name === 'pager_progress_dot_battle');
  assert.equal(dots.length, 2);
  fire(dots[1]);
  ui.tick(0);
  const shown = e.screen.all.filter((x) => x.n.name === 'multiv3_emoticon_theme_item_battle').map((p) => p.active);
  assert.deepEqual(shown, [false, true]);
  const item = e.screen.all.filter((x) => x.n.name === 'hotspot' && x.parent?.n.name === 'multiv3_emoji_item_battle' && x.parent.parent?.active)[1];
  fire(item);
  assert.deepEqual(sent, [['t2', 'e2']]);
  assert.equal(e.open, false, 'sending closes the panel');
  e.rest(true);
  assert.equal(e.screen.one('btn_normal')?.alpha, 0.4);
  ui.tick(0);
  fire(e.screen.one('btn_normal/hotspot'));
  assert.equal(e.open, false, 'resting: no panel');
  e.rest(false);
  assert.equal(e.screen.one('btn_normal')?.alpha, 1);
  assert.equal(e.cooldown, 5);
});

test('[界面-38] an emote pops by its seat\'s side: this seat\'s offset and look, the mate\'s', () => {
  const ui = setup();
  const e = createBattleEmotes(ui, { themes: ['t1'], emotes: ['e1'], picture: (t, id) => `/${t}/${id}.webp`, send: () => {} });
  e.show(true, 't1', 'e1');
  e.show(false, 't1', 'e1');
  const pops = e.screen.all.filter((x) => x.n.name === 'multiV3_pop_emoji_item_battle');
  assert.deepEqual(pops.map((p) => [p.rt.pos, e.screen.one('emoji_send_me', p)?.active, e.screen.one('emoji_send_mate', p)?.active]),
    [[[-365, 0], true, false], [[380, 0], false, true]]);
});

test('[界面-8] [界面-38] overlapping emotes expire independently after an earlier pop is removed', async () => {
  const ui = setup();
  // A synthetic six-second clip permits the same seat to send again after its five-second cool-down.
  ui.ctx.pack.clips.actv3multi_battle_emoji_send = { wrap: 0, length: 6, curves: [] };
  const e = createBattleEmotes(ui, { themes: [], emotes: [], picture: () => null, send() {} });
  e.show(true, 't', 'A');
  ui.tick(1);
  e.show(false, 't', 'B');
  ui.tick(5.01);
  await Promise.resolve();
  e.show(true, 't', 'C');
  const pops = /** @type {import('../src/node.js').UiNode} */ (e.screen.one('pop_emoticon_item_self'));
  const c = /** @type {import('../src/node.js').UiNode} */ (pops.kids.at(-1));
  ui.tick(1);
  await Promise.resolve();
  assert.equal(c.gone, false, 'B finishing must not end C');
  assert.ok(e.screen.all.includes(c));
  assert.equal(ui.anim.playing.length, 1, 'C continues its own clip');
  ui.tick(5.01);
  await Promise.resolve();
  assert.equal(pops.kids.length, 0);
});
