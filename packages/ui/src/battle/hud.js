// The battle HUD (docs/spec/ui.md 界面-10–界面-12): the battle screen of the pack with the deploy cards, the cost panel
// and the top bar — the co-op top bar over it in a match of two —, shown from what the page gives each frame; taps go
// back to the page. What the engine does not have is not shown (ADR 0021): the system menu, the range toggle, the
// auto-deploy panels, the practice hint.
import { refNode } from '../node.js';
import { ease } from '../tween.js';
import { createCards, cardViews } from './cards.js';
import { createCoopTop } from './coop.js';
import { createFieldMenus } from './menus.js';
import { createCostAsk } from './coopcost.js';
import { createStates } from './states.js';
import { createUnitBars } from './unitbars.js';
import { createStart } from './start.js';
import { createBanner } from './banner.js';
import { createGoalBanner } from './goal.js';
import { createCupHud } from './cup.js';
import { createResting } from './resting.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** @typedef {import('../screen.js').Screen} Screen */
/** @typedef {import('./cards.js').DeckCard} DeckCard */
/**
 * What the HUD shows, each frame: the deck's state (cards.js), the cost's next point (frames left of a period), the
 * level's cost cap, the selected card, the lives, the speed the battle runs at (1 or 2) and whether it is paused; in a
 * match of two the co-op top bar's state.
 * @typedef {import('./cards.js').DeckState & { costTimer: number, costPeriod: number, maxCost: number, selected: string | null,
 *   life: number, speed: number, paused: boolean, coop?: import('./coop.js').CoopState & { cost?: import('./coopcost.js').CostAsk },
 *   states?: import('./states.js').BattleStates, units?: import('./unitbars.js').UnitBar[], stageStart?: import('./banner.js').StageStart | null }} HudState
 */

/**
 * The cost panel (界面-11): the cost in whole points; the bar below it fills from the left as the next point comes; at
 * the cap the bar shows MAX.
 * @param {{ cost: number, costTimer: number, costPeriod: number, maxCost: number }} s
 */
export function costView(s) {
  const max = s.cost >= s.maxCost;
  return { text: String(Math.floor(s.cost)), progress: max ? 1 : s.costPeriod > 0 ? Math.max(0, Math.min(1, 1 - s.costTimer / s.costPeriod)) : 0, max };
}

/**
 * The cost panel's flash (界面-11): a whole point gained turns the panel's colour to the pack's flash colour, the point
 * that reaches the cap to its grey; none when the cost has not grown (a point spent, the first frame).
 * @param {number} was the whole points shown before (−1: none yet) @param {number} now @param {number} maxCost
 * @param {{ flash?: number[], maxFlash?: number[] }} c @returns {number[] | null}
 */
export function costFlash(was, now, maxCost, c) {
  if (was < 0 || now <= was) return null;
  return (now >= maxCost ? c.maxFlash : c.flash) ?? null;
}

/**
 * The panel's colour `t` seconds into a flash: from the flash colour back to its own over the flash's time, easing out
 * (INF-0188). @param {number[]} flash @param {number[]} own @param {number} t @param {number} time
 */
export const flashColor = (flash, own, t, time) => {
  const u = ease(0, time > 0 ? t / time : 1);
  return u >= 1 ? [...own] : own.map((v, i) => flash[i] + (v - flash[i]) * u);
};

/** The speed button's sprite for a speed (1×, 2×…), from the pack's list (0× first). @param {string[]} sprites @param {number} speed */
export const speedSprite = (sprites, speed) => sprites[Math.max(0, Math.min(sprites.length - 1, Math.round(speed)))] ?? null;

/** Hides the nodes at references (those that are there). @param {UiNode} root @param {(string | undefined)[]} refs */
function hide(root, refs) { for (const r of refs) { const n = refNode(root, r); if (n) n.active = false; } }

/**
 * The HUD on a UI: opens the battle screen, fills the cards, readies the menus on the field (menus.js); `update` shows a
 * frame's state; `on` takes the taps: 'card' (id), 'speed', 'pause', 'cancel', 'withdraw', 'skill'; in a match of two
 * also 'ask' (the cost request), 'answer' and 'confirm' ('yes' or 'no': the mate's cost and pause requests), and in
 * 堡垒守御 'rest' (「跳过休整」, 界面-39). With a
 * stage in a match of two the start panel shows until the first frame's update (界面-21); a page that opened the start
 * panel before (as its loading screen) gives it as `start`.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui
 * @param {{ deck: DeckCard[], coop?: boolean, stage?: import('./start.js').StageInfo | null, start?: ReturnType<typeof createStart> }} o
 */
export function createBattleHud(ui, o) {
  const hud = /** @type {Record<string, any>} */ (ui.ctx.pack).hud;
  if (!hud?.card || !hud.list || !hud.cost || !hud.top) throw new Error('the battle UI pack has no HUD section');
  const scr = ui.open('battle'), t = hud.top, root = scr.root;
  hideUnused(scr, hud);
  const cards = createCards(scr, hud, o.deck);
  /** @type {Record<string, ((arg?: string) => void)[]>} */
  const handlers = {};
  /** @param {string} name @param {string} [arg] */
  const emit = (name, arg) => { for (const f of handlers[name] ?? []) f(arg); };
  for (const [id, k] of cards.cards) {
    const toggle = k.node('toggle');
    if (toggle) scr.on('', 'pointerdown', () => emit('card', id), toggle);
  }
  const yesNo = (/** @type {boolean} */ v) => (v ? 'yes' : 'no');
  const coop = o.coop && hud.coopTop ? createCoopTop(ui, hud.coopTop, { speed: () => emit('speed'), pause: () => emit('pause'), confirm: (v) => emit('confirm', yesNo(v)) }) : null;
  const { cost, resting } = coopPanels(ui, !!coop, emit);
  if (coop) hide(root, [t.speed, t.pauseButton, t.status?.panel]);
  else {
    tapRef(scr, root, t.speed, () => emit('speed'));
    tapRef(scr, root, t.pause, () => emit('pause'));
  }
  const menus = createFieldMenus(ui, hud, { cancel: () => emit('cancel'), withdraw: () => emit('withdraw'), skill: () => emit('skill') });
  const { states, bars, start, banner, goal, cup } = overlays(ui, scr, hud, !!coop, o);
  const flash = costFlasher(scr, hud.cost);
  return {
    screen: scr, cards, coop, cost, resting, states, bars, start, banner, goal, cup, direction: menus.direction, menu: menus.menu,
    /** @param {string} name @param {(arg?: string) => void} fn */
    on(name, fn) { (handlers[name] ??= []).push(fn); },
    /** @param {HudState} s */
    update(s) {
      cards.update(cardViews(o.deck, s), s.selected, ui.canvas.w);
      showCost(scr, hud.cost, s);
      flash(s);
      showCoop({ coop, resting, cost, banner, goal, cup }, s);
      if (s.states) states.update(s.states);
      if (bars && s.units) bars.update(s.units, [ui.canvas.w, ui.canvas.h]);
      start?.begin();
      if (s.stageStart !== undefined) banner?.update(s.stageStart);
      showTop(scr, t, s);
    },
  };
}

/**
 * A frame of a match of two (界面-15, 界面-39, 界面-41, 界面-42): the co-op top bar, the rest panel, the cost request; in
 * 阵地足球 its start banner once and its goal banner as the score goes up; in 阵地足球锦标 its own battle UI instead.
 * @param {{ coop: { update(s: import('./coop.js').CoopState): void } | null, resting: { update(r: any): void } | null,
 *   cost: { update(c: import('./coopcost.js').CostAsk): void } | null, banner: { football(): void } | null,
 *   goal: { update(f: import('./coop.js').FootballTask): void } | null, cup: ReturnType<typeof createCupHud> }} p @param {HudState} s
 */
function showCoop(p, s) {
  if (p.coop && s.coop) p.coop.update(s.coop);
  p.resting?.update(s.coop?.resting ?? null);
  if (p.cost && s.coop?.cost) p.cost.update(s.coop.cost);
  const f = s.coop?.football;
  if (f) showFootballParts(p, f);
}

/**
 * 阵地足球's banners (界面-41), or 阵地足球锦标's battle UI in their place (界面-42).
 * @param {Parameters<typeof showCoop>[0]} p @param {import('./coop.js').FootballTask} f
 */
function showFootballParts(p, f) {
  if (f.cup) { p.cup?.update({ ...f, cup: f.cup }); return; }
  p.banner?.football();
  p.goal?.update(f);
}

/**
 * The panels of a match of two besides its top bar, when the pack has them: the cost request (界面-15) and 堡垒守御's
 * rest panel (界面-39). @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {boolean} coop
 * @param {(name: string, arg?: string) => void} emit
 */
function coopPanels(ui, coop, emit) {
  const has = (/** @type {string} */ name) => coop && !!ui.ctx.pack.screens[name];
  return {
    cost: has('coop.cost') ? createCostAsk(ui, { ask: () => emit('ask'), answer: (v) => emit('answer', v ? 'yes' : 'no') }) : null,
    resting: has('coop.resting') ? createResting(ui, { skip: () => emit('rest') }) : null,
  };
}

/**
 * The panels over the battle: the state panels (界面-18), the units' bars when the pack has them (界面-19); in a match
 * of two the start panel given its stage (界面-21), the stage start banner (界面-22), 阵地足球's goal banner (界面-41) and
 * 阵地足球锦标's battle UI (界面-42, its screens opened with its first score).
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {Screen} scr @param {Record<string, any>} hud @param {boolean} coop
 * @param {{ stage?: import('./start.js').StageInfo | null, start?: ReturnType<typeof createStart> }} o the stage, or a start panel already open
 */
function overlays(ui, scr, hud, coop, o) {
  const start = o.start !== undefined ? o.start : coop && o.stage ? createStart(ui, o.stage) : null;
  return { states: createStates(ui, scr, coop), bars: hud.units ? createUnitBars(scr, hud.units) : null, start, banner: coop ? createBanner(ui) : null,
    goal: coop ? createGoalBanner(ui) : null, cup: coop ? createCupHud(ui) : null };
}

/** A tap on the node at a reference (its hit area when it has one). @param {Screen} scr @param {UiNode} root @param {string} ref @param {() => void} fn */
function tapRef(scr, root, ref, fn) {
  const n = refNode(root, ref);
  if (!n) return;
  const hit = n.kids.find((k) => k.n.name === 'collider' || k.n.name === 'hotspot') ?? n;
  scr.tap('', fn, hit);
}

/** The parts the engine does not have. @param {Screen} scr @param {Record<string, any>} hud */
function hideUnused(scr, hud) {
  const t = hud.top, root = scr.root;
  hide(root, [t.menu, t.range, t.status?.practice, t.status?.lifeLost, t.status?.countdown, t.status?.countdownRed, hud.list.highlighter]);
  for (const name of ['mask_bottom', 'character_info_panel', 'panel_auto_battle', 'panel_remaining_available_character', 'perspective_root']) scr.show(name, false);
  if (t.status3) hide(root, [t.status3.panel]);
}

/** @param {Screen} scr @param {Record<string, any>} c @param {HudState} s */
function showCost(scr, c, s) {
  const v = costView(s), root = scr.root, text = refNode(root, c.text), slider = refNode(root, c.slider), bar = refNode(root, c.maxBar), icon = refNode(root, c.maxIcon);
  if (text) scr.text('', v.text, text);
  if (slider) scr.slider('', v.progress, slider);
  if (bar) bar.active = v.max;
  if (icon?.color) icon.color[3] = v.max ? 1 : 0;
}

/**
 * The cost panel's flashes (界面-11): each frame's cost against the last shown; a flash runs on the UI's clock and a
 * later one replaces it. @param {Screen} scr @param {Record<string, any>} c
 */
function costFlasher(scr, c) {
  const panel = refNode(scr.root, c.panel), own = panel?.color ? [...panel.color] : null;
  let was = -1, seq = 0;
  return (/** @type {HudState} */ s) => {
    const now = Math.floor(s.cost), color = panel && own ? costFlash(was, now, s.maxCost, c) : null;
    was = now;
    if (!color || !panel || !own) return;
    const id = ++seq, time = c.flashTime ?? 0.5;
    let t = 0;
    const paint = () => { panel.color = flashColor(color, own, t, time); panel.paintKey = ''; };
    paint();
    scr.ctx.tickers?.add({ scr, step: (dt) => {
      if (id !== seq) return false;
      t += dt;
      paint();
      return t < time;
    } });
  };
}

/** @param {Screen} scr @param {Record<string, any>} t @param {HudState} s */
function showTop(scr, t, s) {
  const root = scr.root, speed = refNode(root, t.speed), life = refNode(root, t.status?.life), mask = refNode(root, t.pauseMask);
  if (speed) { speed.sprite = speedSprite(t.speedSprites, s.speed); speed.paintKey = ''; }
  if (life) scr.text('', String(s.life), life);
  if (mask) mask.active = s.paused;
  const pause = refNode(root, t.pause);
  if (pause) { scr.show('image_pause', !s.paused, pause); scr.show('image_resume', s.paused, pause); }
  const enemies = refNode(root, t.status?.enemies);
  if (enemies) { enemies.active = false; const icon = enemies.parent?.kids.find((k) => k.n.name === 'icon_monster'); if (icon) icon.active = false; }
}
