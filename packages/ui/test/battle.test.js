// The battle HUD (docs/spec/ui.md 界面-10–界面-14) on a small pack shaped like the battle UI's, in a minimal document.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, createBattleHud, cardViews, cardWidth, waitText, placeSummons, costView, costFlash, flashColor, speedSprite, coopSpeedSprite, reviveText, dragFacing, groundOffset, ARROW_DIRS,
  homography, mapPoint, matrix3d, groundTransform, copyRect, DEF_RT } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {Partial<import('../src/rect.js').Rect>} r */
const R = (r) => ({ ...copyRect(DEF_RT), ...r });
/** @param {string} name @param {Record<string, any>} [comps] @param {PackNode[]} [children] @param {any} [rt] @returns {PackNode} */
const N = (name, comps = {}, children = [], rt = undefined) => ({ name, active: true, comps, children, ...(rt ? { rt } : {}) });
/** @param {string | null} [ref] @param {Record<string, any>} [more] */
const img = (ref = 'sprite/a', more = {}) => ({ img: { kind: 'image', ref, color: [1, 1, 1, 1], type: 0, ...more } });
const text = { text: { text: '', size: 30, style: 0, align: 4, color: [1, 1, 1, 1], best: 0, hwrap: 1 } };
/** @param {string} fill */
const slider = (fill) => ({ slider: { fill, dir: 0, min: 0, max: 1, value: 0, whole: 0 } });
const row = { dir: 'h', pad: [0, 0, 0, 0], spacing: 0, align: 8, cw: 0, ch: 0, fw: 0, fh: 0, rev: 0 };
const PRESS = { transition: 1, colors: { normal: [1, 1, 1, 1], pressed: [0.5, 0.5, 0.5, 1], disabled: [1, 1, 1, 1] }, target: '@' };

const battle = N('UI', {}, [
  N('orthogonal_root', { canvas: {} }, [
    N('list', { lg: row }, [], R({ amin: [0, 0], amax: [1, 0], size: [0, 184], pivot: [1, 0] })),
    N('cost', img('sprite/white', { color: [0.2, 0.2, 0.2, 0.7] }), [N('text', text), N('slider', slider('@orthogonal_root/cost/slider/fill'), [N('fill', img())]), N('max', img(), [N('icon', img('sprite/a', { color: [1, 1, 1, 0] }))])]),
    N('top', {}, [N('speed', img('sprite/x1'), [N('collider', { nodraw: 'raycast' })]), N('pause', {}, [N('image_pause', img()), N('image_resume', img()), N('collider', { nodraw: 'raycast' })]),
      N('mask', img()), N('menu', img()), N('range', img()), N('status', {}, [N('life', text), N('enemies', text), N('icon_monster', img())])]),
    N('mask_bottom', img()),
  ]),
  N('perspective_root', { canvas: {} }, [
    N('dir', {}, [N('arrows', {}, ['up', 'right', 'down', 'left'].map((d) => N(d, img(), [N('fill', img())]))),
      N('cancel', {}, [N('btn_cancel', img()), N('btn_drag_back', img())]), N('joystick', img(), [N('Thumb', img())], R({ size: [426, 426] }))], R({ amin: [0, 0], amax: [1, 1], size: [0, 0], scale: [2.5, 2.5] })),
    N('menu', {}, [N('withdraw', { button: { ...PRESS, target: '@perspective_root/menu/withdraw' }, ...img() }), N('skill', {}, [N('icon', { button: { ...PRESS, colors: { ...PRESS.colors, disabled: [0.5, 0.5, 0.5, 1] }, target: '@perspective_root/menu/skill/icon' }, ...img(null) }),
      N('toNext', slider('@perspective_root/menu/skill/toNext/fill'), [N('fill', img('sprite/a', { type: 3, fillMethod: 1 }))]),
      N('casting', slider('@perspective_root/menu/skill/casting/fill'), [N('fill', img('sprite/a', { type: 3, fillMethod: 1 }))]),
      ...['ready', 'notReady', 'stop', 'auto', 'bullet'].map((k) => N(k, img()))])], R({ size: [560, 560], pos: [0, 551], scale: [2, 2] })),
  ], R({ amin: [0, 0], amax: [0, 0], size: [1920, 1080], scale: [0.00337, 0.00337] })),
]);
const card = N('card', {}, [N('content', {}, [N('avatar', img(null)), N('prof', img()), N('mark', img()), N('rarity', img()), N('elite', img()), N('cost', text),
  N('respawn', slider('@content/respawn/fill'), [N('fill', img('sprite/a', { type: 3, fillMethod: 4 }))]), N('respawnText', text), N('toggle', img()), N('combo', img()), N('assist', img()),
  N('remainBack', img()), N('remainCount', text)], R({ amin: [0, 0], amax: [1, 1], size: [0, 0], pivot: [0.5, 0] }))],
R({ amin: [0, 0], amax: [0, 0], size: [178, 184], pivot: [0.5, 0] }));
const coopTop = N('coop', {}, [
  N('btn_speed_level', img(), [N('btn_speed_level_icon', img('sprite/s1'), [N('hotspot', { nodraw: 'raycast' })]), N('pause_on_me', img('sprite/a', { color: [0, 0.6, 0.9, 0] })), N('pause_on_mate', img('sprite/a', { color: [0, 0.6, 0.5, 0] }))]),
  N('btn_multiplayer_pause', {}, [N('image_pause', img()), N('image_resume', img()), N('slider_pause_waiting', slider('@btn_multiplayer_pause/slider_pause_waiting/Fill'), [N('Fill', img('sprite/a', { type: 3 }))]), N('collider', { nodraw: 'raycast' })]),
  N('status', img(), [N('[my]icon_life_point', img(), [N('text_life_point', text)]), N('[you]icon_life_point', img(), [N('text_life_point', text)]),
    N('[my]revive_timer', {}, [N('timer', text)]), N('[you]revive_timer', {}, [N('timer', text)]), N('[my]life_lost_group', img()), N('[you]life_lost_group', img()), N('task', img())]),
  N('btn_menu', img()),
], R({ amin: [0, 1], amax: [1, 1], size: [0, 1], pivot: [0, 1] }));
coopTop.children[2].active = false;

const hud = {
  card: { nodes: { avatar: '@content/avatar', profession: '@content/prof', mark: '@content/mark', rarity: '@content/rarity', elite: '@content/elite', assist: '@content/assist',
    cost: '@content/cost', respawn: '@content/respawn', respawnText: '@content/respawnText', toggle: '@content/toggle', content: '@content',
    remainBack: '@content/remainBack', remainCount: '@content/remainCount' },
  extras: ['@content/combo'], professions: { SNIPER: { sprite: 'sprite/sniper', color: [0.7, 0.1, 0.1, 1] } }, rarity: ['sprite/r1', 'sprite/r2', 'sprite/r3', 'sprite/r4', 'sprite/r5', 'sprite/r6'],
  elite: [null, 'sprite/e1', 'sprite/e2'], tint: ['@content/avatar', '@content/cost'], normal: [1, 1, 1, 1], disabled: [0.5, 0.5, 0.5, 1], raise: 20 },
  list: { container: '@orthogonal_root/list', widths: [109, 178] },
  cost: { text: '@orthogonal_root/cost/text', slider: '@orthogonal_root/cost/slider', maxBar: '@orthogonal_root/cost/max', maxIcon: '@orthogonal_root/cost/max/icon',
    panel: '@orthogonal_root/cost', flash: [0, 0.5, 1, 0.7], maxFlash: [0.6, 0.6, 0.6, 0.7], flashTime: 0.5 },
  top: { speed: '@orthogonal_root/top/speed', pause: '@orthogonal_root/top/pause', pauseButton: '@orthogonal_root/top/pause', pauseMask: '@orthogonal_root/top/mask', menu: '@orthogonal_root/top/menu',
    range: '@orthogonal_root/top/range', status: { panel: '@orthogonal_root/top/status', life: '@orthogonal_root/top/status/life', enemies: '@orthogonal_root/top/status/enemies' },
    speedSprites: ['sprite/x0', 'sprite/x1', 'sprite/x2', 'sprite/x3'] },
  direction: { root: '@perspective_root/dir', arrows: ['up', 'right', 'down', 'left'].map((d) => `@perspective_root/dir/arrows/${d}`), cancel: '@perspective_root/dir/cancel',
    colors: { normal: [1, 1, 1, 1], highlight: [1, 0.9, 0.7, 1] }, joystick: { area: '@perspective_root/dir/joystick', thumb: '@perspective_root/dir/joystick/Thumb', returns: 1, relative: 1 } },
  menu: { root: '@perspective_root/menu', skill: '@perspective_root/menu/skill/icon', icon: '@perspective_root/menu/skill/icon', withdraw: '@perspective_root/menu/withdraw',
    toNext: '@perspective_root/menu/skill/toNext', casting: '@perspective_root/menu/skill/casting', panel: '@perspective_root/menu/skill', bullet: '@perspective_root/menu/skill/bullet',
    ...Object.fromEntries(['ready', 'notReady', 'stop', 'auto'].map((k) => [k, `@perspective_root/menu/skill/${k}`])) },
  coopTop: { pause: '@btn_multiplayer_pause', pauseImage: '@btn_multiplayer_pause/image_pause', resumeImage: '@btn_multiplayer_pause/image_resume',
    status: { panel: '@status', life: '@status/[my]icon_life_point/text_life_point', lifeLost: '@status/[my]life_lost_group' },
    speed: { me: '@btn_speed_level/pause_on_me', mate: '@btn_speed_level/pause_on_mate', image: '@btn_speed_level/btn_speed_level_icon', x1: 'sprite/s1', x2: 'sprite/s2' } },
};
/** @returns {import('../src/node.js').UiPack} */
const pack = () => /** @type {any} */ ({ version: 1, ref: [1920, 1080], sprites: {}, clips: {}, screens: { battle, card, 'coop.topbar': coopTop }, hud });

/** @type {import('../src/battle/cards.js').DeckCard[]} */
const DECK = [
  { id: 'a', avatar: '/a.png', profession: 'SNIPER', rarity: 6, phase: 2, respawn: 70 },
  { id: 'b', avatar: null, profession: 'UNKNOWN', rarity: 3, phase: 0, respawn: 0 },
  { id: 'c', avatar: '/c.png', profession: 'SNIPER', rarity: 9, phase: 1, respawn: 20 },
];
/** @param {Record<string, any>} [more] */
const state = (more = {}) => ({ frame: 300, fps: 30, cost: 10, cards: { a: { cost: 9, ready: 0 }, b: { cost: 12, ready: 0 }, c: { cost: 5, ready: 600 } }, deployed: [], slots: 8,
  costTimer: 12, costPeriod: 30, maxCost: 99, selected: 'a', life: 3, speed: 1, paused: false, ...more });
const setup = (/** @type {boolean} */ coop = false) => {
  const doc = fakeDocument(), ui = createUi({ pack: pack(), host: fakeHost(doc), base: '/u/' });
  ui.resize(1920, 1080);
  return { ui, hud: createBattleHud(ui, { deck: DECK, coop }) };
};
/** @param {any} n */
const node = (n) => /** @type {import('../src/node.js').UiNode} */ (n);

test('[界面-10] the cards: those not on the field in the deck\'s order; waiting, usable, the width, the countdown', () => {
  const v = cardViews(DECK, state());
  assert.deepEqual(v.map((x) => [x.id, x.cost, x.waiting, x.usable]), [['a', 9, false, true], ['b', 12, false, false], ['c', 5, true, false]]);
  assert.equal(v[2].wait, 10);
  assert.equal(v[2].ratio, 0.5);
  assert.deepEqual(cardViews(DECK, state({ deployed: ['a'], slots: 0 })).map((x) => [x.id, x.usable]), [['b', false], ['c', false]], 'no slot left: none usable');
  assert.equal(cardViews([{ ...DECK[0], respawn: 0 }], state({ cards: { a: { cost: 1, ready: 400 } } }))[0].ratio, 0);
  assert.equal(cardViews([DECK[0]], state({ cards: {} }))[0].cost, 0);
  assert.deepEqual(cardViews(DECK, state({ hidden: ['b'] })).map((x) => x.id), ['a', 'c'], 'a card held back is not shown (波次-9)');
  assert.equal(cardViews([DECK[0]], state({ cards: { a: { cost: 1, ready: 0, locked: true } } }))[0].usable, false, 'locked by its devourer (the engine\'s 敌能-30)');
  assert.equal(cardWidth(10, 1920, [109, 178]), 178);
  assert.equal(cardWidth(12, 1920, [109, 178]), 160);
  assert.equal(cardWidth(30, 1920, [109, 178]), 109);
  assert.equal(cardWidth(0, 1920, [109, 178]), 178);
  assert.equal(waitText(9.04), '9.0');
});

test('[界面-10] the cards on the screen: faces, greyed, the countdown, raised when selected', () => {
  const { ui, hud } = setup();
  hud.update(state());
  ui.tick(0);
  const [a, b, c] = DECK.map((d) => /** @type {any} */ (hud.cards.cards.get(d.id)));
  assert.equal(a.node('avatar').picture, '/a.png');
  assert.equal(b.node('avatar').active, false, 'no avatar: none shown');
  assert.equal(a.node('profession').sprite, 'sprite/sniper');
  assert.deepEqual(a.node('mark').color, [0.7, 0.1, 0.1, 1]);
  assert.equal(b.node('profession').sprite, null);
  assert.deepEqual([a.node('rarity').sprite, b.node('rarity').sprite, c.node('rarity').sprite], ['sprite/r6', 'sprite/r3', 'sprite/r6']);
  assert.deepEqual([a.node('elite').active, a.node('elite').sprite, b.node('elite').active], [true, 'sprite/e2', false]);
  assert.equal(a.root.kids[0].kids.find((/** @type {any} */ k) => k.n.name === 'combo').active, false, 'other systems\' marks hidden');
  assert.equal(a.node('cost').txt, '9');
  assert.deepEqual(a.node('cost').color, [1, 1, 1, 1]);
  assert.deepEqual(b.node('cost').color, [0.5, 0.5, 0.5, 1], 'greyed: too dear');
  assert.deepEqual([c.node('respawn').active, c.node('respawnText').txt, c.node('respawn').kids[0].fill], [true, '10.0', 0.5]);
  assert.equal(a.node('respawn').active, false);
  assert.equal(a.node('content').rt.pos[1], 20, 'selected: raised');
  assert.equal(b.node('content').rt.pos[1], 0);
  hud.update(state({ deployed: ['a'], selected: null }));
  ui.tick(0);
  assert.equal(a.root.active, false, 'on the field: no card');
  assert.equal(a.node('content').rt.pos[1], 20, 'a hidden card keeps its last state');
  assert.equal(b.root.rt.size[0], 178);
});

test('[界面-10] the support unit\'s card shows the pack\'s assist mark; the others do not', () => {
  const ui = createUi({ pack: pack(), host: fakeHost(fakeDocument()), base: '/u/' });
  ui.resize(1920, 1080);
  const hud = createBattleHud(ui, { deck: [DECK[0], { ...DECK[2], assist: true }], coop: false });
  hud.update(state());
  const [a, c] = ['a', 'c'].map((id) => /** @type {any} */ (hud.cards.cards.get(id)));
  assert.deepEqual([a.node('assist').active, c.node('assist').active], [false, true]);
});

/** A summon card of the deck and its state (界面-23). @param {Record<string, any>} [more] */
const summonState = (more = {}) => state({ summons: { s: { cost: 3, ready: 0, held: 2, shown: true, full: false, occupy: true, ...more } } });
const WITH_SUMMON = [...DECK, { id: 's', avatar: null, profession: 'TOKEN', rarity: 1, phase: 0, respawn: 10, summon: true }];

test('[界面-23] a summon card: shown when its state says so, the copies held, usable by its own rules', () => {
  const view = (/** @type {Record<string, any>} */ more = {}, /** @type {Record<string, any>} */ top = {}) => cardViews(WITH_SUMMON, { ...summonState(more), ...top }).find((v) => v.id === 's');
  assert.deepEqual(view(), { id: 's', cost: 3, waiting: false, wait: 0, ratio: 0, count: 2, usable: true });
  assert.equal(cardViews(DECK, state())[0].count, -1, 'an operator\'s card shows no count');
  assert.equal(view({ shown: false }), undefined);
  assert.equal(cardViews(WITH_SUMMON, state()).some((v) => v.id === 's'), false, 'no summon state: not shown');
  assert.deepEqual([view({ held: 0 })?.usable, view({ full: true })?.usable, view({ cost: 11 })?.usable], [false, false, false]);
  assert.deepEqual([view({}, { slots: 0 })?.usable, view({ occupy: false }, { slots: 0 })?.usable], [false, true], 'a place only for 部署占用数 1');
  assert.deepEqual([view({ ready: 450 })?.waiting, view({ ready: 450 })?.wait, view({ ready: 450 })?.ratio], [true, 5, 0.5]);
});

test('[界面-23] summon cards go in by cost, then by id, before the first card that costs more; the operators keep their order', () => {
  const card = (/** @type {string} */ id) => ({ id, avatar: null, profession: 'TOKEN', rarity: 1, phase: 0, respawn: 0, summon: true });
  const costs = /** @type {Record<string, number>} */ ({ a: 9, b: 12, c: 5, s1: 10, s2: 3, s3: 9, s0: 9 });
  const ids = placeSummons(DECK, ['s1', 's2', 's3', 's0'].map(card), (id) => costs[id]).map((d) => d.id);
  assert.deepEqual(ids, ['s2', 'a', 's0', 's3', 's1', 'b', 'c']);
  assert.deepEqual(placeSummons(DECK, [], (id) => costs[id]).map((d) => d.id), ['a', 'b', 'c']);
  assert.deepEqual(placeSummons([], [card('s1')], (id) => costs[id]).map((d) => d.id), ['s1']);
});

test('[界面-23] a summon card on the screen shows its copies; an operator\'s card hides the count', () => {
  const doc = fakeDocument(), ui = createUi({ pack: pack(), host: fakeHost(doc), base: '/u/' });
  ui.resize(1920, 1080);
  const hud = createBattleHud(ui, { deck: WITH_SUMMON, coop: false });
  hud.update(summonState());
  ui.tick(0);
  const s = /** @type {any} */ (hud.cards.cards.get('s')), a = /** @type {any} */ (hud.cards.cards.get('a'));
  assert.deepEqual([s.root.active, s.node('remainBack').active, s.node('remainCount').active, s.node('remainCount').txt], [true, true, true, '2']);
  assert.deepEqual([a.node('remainBack').active, a.node('remainCount').active], [false, false]);
});

test('[界面-10] a press on a card\'s frame is the page\'s', () => {
  const { hud } = setup();
  /** @type {(string | undefined)[]} */
  const got = [];
  hud.on('card', (id) => got.push(id));
  /** @type {any} */ (hud.cards.cards.get('b')).node('toggle').el.fire('pointerdown');
  assert.deepEqual(got, ['b']);
});

test('[界面-11] the cost: whole points, the bar filling to the next point, MAX at the cap', () => {
  assert.deepEqual(costView({ cost: 10.9, costTimer: 12, costPeriod: 30, maxCost: 99 }), { text: '10', progress: 0.6, max: false });
  assert.deepEqual(costView({ cost: 99, costTimer: 12, costPeriod: 30, maxCost: 99 }), { text: '99', progress: 1, max: true });
  assert.equal(costView({ cost: 1, costTimer: 40, costPeriod: 30, maxCost: 99 }).progress, 0);
  assert.equal(costView({ cost: 1, costTimer: 0, costPeriod: 0, maxCost: 99 }).progress, 0);
  const { ui, hud } = setup();
  hud.update(state());
  ui.tick(0);
  const s = hud.screen;
  assert.equal(node(s.one('cost/text')).txt, '10');
  assert.deepEqual(node(s.one('cost/slider/fill')).rt.amax, [0.6, 1]);
  assert.equal(node(s.one('cost/max')).active, false);
  hud.update(state({ cost: 99 }));
  assert.equal(node(s.one('cost/max')).active, true);
  assert.equal(node(s.one('cost/max/icon')).color?.[3], 1);
});

test('[界面-11] a point gained flashes the panel blue, the one reaching the cap grey; it fades back to its colour in 0.5 s', () => {
  const c = { flash: [0, 0.5, 1, 0.7], maxFlash: [0.6, 0.6, 0.6, 0.7] };
  assert.deepEqual([costFlash(-1, 10, 99, c), costFlash(10, 10, 99, c), costFlash(10, 9, 99, c)], [null, null, null], 'the first frame, no change, a point spent');
  assert.deepEqual(costFlash(10, 11, 99, c), c.flash);
  assert.deepEqual(costFlash(98, 99, 99, c), c.maxFlash);
  const own = [0.2, 0.2, 0.2, 0.7];
  assert.deepEqual(flashColor(c.flash, own, 0, 0.5), c.flash);
  assert.deepEqual(flashColor(c.flash, own, 0.5, 0.5), own);
  assert.ok(flashColor(c.flash, own, 0.25, 0.5)[2] < 0.6 && flashColor(c.flash, own, 0.25, 0.5)[2] > 0.2, 'easing out: past half way at half time');
  const { ui, hud } = setup();
  const panel = node(hud.screen.one('cost'));
  hud.update(state());
  ui.tick(0);
  assert.deepEqual(panel.color, own, 'no flash on the first frame');
  hud.update(state({ cost: 11 }));
  assert.deepEqual(panel.color, c.flash);
  ui.tick(0.6);
  assert.deepEqual(panel.color, own);
});

test('[界面-12] the top bar alone: lives, the speed\'s sprite, pause and resume, the mask; what the engine lacks hidden', () => {
  assert.equal(speedSprite(['x0', 'x1', 'x2', 'x3'], 2), 'x2');
  assert.equal(speedSprite(['x0', 'x1'], 5), 'x1');
  assert.equal(speedSprite([], 1), null);
  const { ui, hud } = setup();
  /** @type {string[]} */
  const taps = [];
  hud.on('speed', () => taps.push('speed'));
  hud.on('pause', () => taps.push('pause'));
  hud.update(state({ speed: 2, paused: true, life: 7 }));
  ui.tick(0);
  const s = hud.screen;
  assert.equal(node(s.one('top/speed')).sprite, 'sprite/x2');
  assert.equal(node(s.one('status/life')).txt, '7');
  assert.deepEqual([node(s.one('image_pause')).active, node(s.one('image_resume')).active, node(s.one('top/mask')).active], [false, true, true]);
  assert.deepEqual(['top/menu', 'top/range', 'status/enemies', 'icon_monster', 'mask_bottom'].map((t) => node(s.one(t)).active), [false, false, false, false, false]);
  /** @type {any} */ (s.one('speed/collider')).el.fire('click');
  /** @type {any} */ (s.one('pause/collider')).el.fire('click');
  assert.deepEqual(taps, ['speed', 'pause']);
  assert.equal(hud.coop, null);
});

test('[界面-12] the co-op top bar: both lives, a down side\'s countdown, each side\'s 2× light, the speed icon', () => {
  assert.equal(coopSpeedSprite({ x1: 'a', x2: 'b' }, 2), 'b');
  assert.equal(coopSpeedSprite({ x1: 'a', x2: 'b' }, 1), 'a');
  assert.equal(reviveText(7.2), '8');
  assert.equal(reviveText(-1), '0');
  const { ui, hud } = setup(true);
  const co = /** @type {NonNullable<typeof hud.coop>} */ (hud.coop), s = co.screen;
  /** @type {string[]} */
  const taps = [];
  hud.on('speed', () => taps.push('speed'));
  hud.on('pause', () => taps.push('pause'));
  hud.update(state({ coop: { me: { life: 5, fast: true, revive: -1 }, mate: { life: 2, fast: false, revive: 7.2 }, speed: 1, paused: false, asking: 0.5 } }));
  ui.tick(0);
  assert.equal(node(s.one('status')).active, true);
  assert.equal(node(s.one('[my]icon_life_point/text_life_point')).txt, '5');
  assert.deepEqual([node(s.one('[you]icon_life_point')).active, node(s.one('[you]revive_timer')).active, node(s.one('[you]revive_timer/timer')).txt], [false, true, '8']);
  assert.equal(node(s.one('[my]revive_timer')).active, false);
  assert.deepEqual([node(s.one('pause_on_me')).color?.[3], node(s.one('pause_on_mate')).color?.[3]], [1, 0]);
  assert.equal(node(s.one('btn_speed_level_icon')).sprite, 'sprite/s1');
  assert.deepEqual([node(s.one('btn_menu')).active, node(s.one('[my]life_lost_group')).active, node(s.one('[you]life_lost_group')).active, node(s.one('task')).active], [false, false, false, false]);
  assert.equal(node(s.one('slider_pause_waiting/Fill')).fill, 0.5);
  assert.equal(node(hud.screen.one('top/speed')).active, false, 'the battle screen\'s own speed button gives way');
  /** @type {any} */ (s.one('hotspot')).el.fire('click');
  /** @type {any} */ (s.one('btn_multiplayer_pause/collider')).el.fire('click');
  assert.deepEqual(taps, ['speed', 'pause']);
});

test('[界面-13] the perspective canvas: a projective map through four points, on the ground', () => {
  const src = [[0, 0], [100, 0], [100, 50], [0, 50]], dst = [[10, 20], [210, 25], [190, 140], [30, 130]];
  const H = homography(src, dst);
  src.forEach((p, i) => { const q = mapPoint(H, p); assert.ok(Math.abs(q[0] - dst[i][0]) < 1e-6 && Math.abs(q[1] - dst[i][1]) < 1e-6); });
  assert.equal(matrix3d([2, 0, 5, 0, 3, 7, 0, 0, 1]), 'matrix3d(2,0,0,0,0,3,0,0,0,0,1,0,5,7,0,1)');
  /** @type {number[][]} */
  const seen = [];
  const m = groundTransform([1920, 1080], 0.01, (e, n) => { seen.push([e, n]); return [500 + e * 100, 300 - n * 100]; });
  assert.deepEqual(seen.map(([e, n]) => [+e.toFixed(6), +n.toFixed(6)]), [[-9.6, 5.4], [9.6, 5.4], [9.6, -5.4], [-9.6, -5.4]], 'the corners: x east, y north from the centre');
  assert.ok(m.startsWith('matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,-460,-240,0,1'), m);
});

test('[界面-13] the direction selector: shown on a point, the pointed arrow lit, the facing of a drag, the cancel tap', () => {
  const east = [100, 0], north = [0, -60];
  assert.equal(dragFacing([5, -5], east, north, 40), -1);
  assert.equal(dragFacing([80, -10], east, north, 40), 0);
  assert.equal(dragFacing([10, -90], east, north, 40), 1);
  assert.equal(dragFacing([-80, 30], east, north, 40), 2);
  assert.equal(dragFacing([0, 80], east, north, 40), 3);
  assert.deepEqual([...ARROW_DIRS], [1, 0, 3, 2]);
  assert.deepEqual(groundOffset([150, -30], east, north), [1.5, 0.5], 'a drag split along the ground');
  assert.deepEqual(groundOffset([5, 5], [1, 1], [2, 2]), [0, 0]);
  const { ui, hud } = setup();
  const d = hud.direction, s = d.screen;
  assert.equal(s.root.active, false);
  d.show((e, n) => [500 + e * 100, 300 - n * 100]);
  d.point(1);
  ui.tick(0);
  assert.equal(s.root.active, true);
  assert.ok(String(/** @type {any} */ (s.wrap.style).transform).startsWith('matrix3d('));
  assert.deepEqual(node(s.one('arrows/up')).color, [1, 0.9, 0.7, 1]);
  assert.deepEqual(node(s.one('arrows/up/fill')).color, [1, 0.9, 0.7, 1]);
  assert.deepEqual(node(s.one('arrows/left')).color, [1, 1, 1, 1]);
  assert.deepEqual(s.root.rt.scale, [2.5, 2.5], 'its own rect kept');
  assert.deepEqual([node(s.one('btn_drag_back')).active, node(s.one('joystick')).active], [false, true], 'the drag handle shown');
  const thumb = node(s.one('joystick/Thumb'));
  assert.deepEqual(thumb.rt.pos, [0, 0], 'at the centre');
  d.drag([0.337, -0.1685]);
  assert.ok(Math.abs(thumb.rt.pos[0] - 40) < 1e-9 && Math.abs(thumb.rt.pos[1] + 20) < 1e-9, 'moved by the drag on the ground (0.00337 tiles a canvas pixel, the selector at 2.5×)');
  d.drag([5.055, 6.74]);
  assert.ok(Math.abs(Math.hypot(...thumb.rt.pos) - 213) < 1e-9 && Math.abs(thumb.rt.pos[0] / thumb.rt.pos[1] - 0.75) < 1e-9, 'held within half its area');
  d.drag(null);
  assert.deepEqual(thumb.rt.pos, [0, 0], 'back at the centre');
  /** @type {string[]} */
  const got = [];
  hud.on('cancel', () => got.push('cancel'));
  /** @type {any} */ (s.one('btn_cancel')).el.fire('click');
  assert.deepEqual(got, ['cancel']);
  d.hide();
  assert.equal(s.root.active, false);
});

test('[界面-14] the operator menu: retreat and the skill button by the skill\'s state', () => {
  const { ui, hud } = setup();
  const m = hud.menu, s = m.screen, at = (/** @type {string} */ t) => node(s.one(t));
  /** @type {string[]} */
  const got = [];
  hud.on('withdraw', () => got.push('withdraw'));
  hud.on('skill', () => got.push('skill'));
  m.show((e, n) => [e, n], { icon: '/s.webp', manual: true, state: 'charging', share: 0.4 });
  ui.tick(0);
  assert.deepEqual(s.root.rt.pos, [0, 0], 'centred on the operator');
  assert.equal(at('skill/icon').picture, '/s.webp');
  assert.deepEqual(['toNext', 'notReady', 'ready', 'casting', 'stop', 'auto', 'bullet'].map((k) => at(`skill/${k}`).active), [true, true, false, false, false, false, false]);
  assert.equal(at('toNext/fill').fill, 0.4);
  m.show((e, n) => [e, n], { icon: '/s.webp', manual: true, state: 'ready', share: 1 });
  assert.deepEqual(['toNext', 'ready'].map((k) => at(`skill/${k}`).active), [false, true]);
  m.show((e, n) => [e, n], { icon: '/s.webp', manual: false, state: 'running', share: 0.25, stoppable: true });
  assert.deepEqual(['casting', 'stop', 'auto', 'ready'].map((k) => at(`skill/${k}`).active), [true, true, true, false]);
  assert.equal(at('casting/fill').fill, 0.25);
  m.show((e, n) => [e, n], { icon: '/s.webp', manual: true, state: 'ready', share: 1, blocked: true });
  assert.equal(at('skill/ready').active, false, 'kept from starting it: no ready mark');
  assert.deepEqual(at('skill/icon').tint, [0.5, 0.5, 0.5, 1], 'the disabled colour');
  ui.tick(0);
  /** @type {any} */ (s.one('skill/icon')).el.fire('click');
  assert.deepEqual(got, [], 'and no answer');
  m.show((e, n) => [e, n], { icon: '/s.webp', manual: true, state: 'ready', share: 1 });
  assert.equal(at('skill/icon').tint, null, 'free again: as it is');
  m.show((e, n) => [e, n], null);
  assert.equal(at('skill').active, false, 'no skill: no button');
  m.show((e, n) => [e, n], { icon: null, manual: true, state: 'ready', share: 1 });
  assert.equal(at('skill').active, false, 'no icon: no button');
  ui.tick(0);
  /** @type {any} */ (s.one('withdraw')).el.fire('click');
  /** @type {any} */ (s.one('skill/icon')).el.fire('click');
  m.hide();
  assert.equal(s.root.active, false);
  assert.deepEqual(got, ['withdraw'], 'a hidden skill button does not answer');
});

test('[界面-10] a pack without the battle HUD is refused', () => {
  const doc = fakeDocument(), ui = createUi({ pack: /** @type {any} */ ({ ...pack(), hud: {} }), host: fakeHost(doc) });
  assert.throws(() => createBattleHud(ui, { deck: DECK }));
});
