// 阵地足球锦标's battle UI (docs/spec/ui.md 界面-42): the pack's own top bar in place of the co-op top bar's football
// panel — the two sides' names and goals, the match's time, the kickoff and penalty count-downs, the penalty marks —, its
// start banner (the match, the shootout), its score banner and its finish panel. The banners play one after another,
// each with the event's sound as it begins.
import { refNode, setText } from '../node.js';
import { clockText } from './coop.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/** @typedef {import('../screen.js').Screen} Screen */
/**
 * 阵地足球锦标's part of the score (界面-42): the two sides' names and team icons (the event's icon names, none to keep
 * the pack's own); the seconds left of the players' wait after the last kickoff (≤ 0: none); in the penalty shootout
 * the round (0…5), whether it is under way, the seconds left of our kick's countdown (< 0: none) and the results of the
 * rounds over (1 in, 0 out), null before it; whether the match is over.
 * @typedef {{ ours: string, theirs: string, icons?: { ours: string, theirs: string }, wait: number, pk: { round: number, on: boolean, left: number, shots: number[] } | null,
 *   over: boolean }} CupTask
 */
/** @typedef {import('./coop.js').FootballTask & { cup: CupTask }} CupScore */

/** The rounds of a penalty shootout (锦标-4: 双方各罚3次). */
const ROUNDS = 6;

/**
 * Each banner's sound bank (界面-42): the match's start, the shootout's start, the draw, a goal or a save for us, a goal
 * against us, our kick and theirs.
 */
export const CUP_SOUNDS = Object.freeze({
  match: 'battle.ON_ACT1FOOTBALL_MATCHSTART', penalty: 'battle.ON_ACT1FOOTBALL_PENALTYKICK_BANNER', draw: 'battle.ON_ACT1FOOTBALL_DRAW',
  ally: 'battle.ON_ACT1FOOTBALL_WINSCORE', success: 'battle.ON_ACT1FOOTBALL_WINSCORE', enemy: 'battle.ON_ACT1FOOTBALL_LOSESCORE',
  ourKick: 'battle.ON_ACT1FOOTBALL_PENALTYKICK', theirKick: 'battle.ON_ACT1FOOTBALL_PENALTYKICK_OTHER',
});

/**
 * The score banner's group for a penalty round over (界面-42): ours in 进球！, ours out 失球！, theirs out 成功！, theirs
 * in 失球！. @param {number} round @param {number} goal @returns {'ally' | 'enemy' | 'success'}
 */
export const shotBanner = (round, goal) => (round % 2 === 0 ? (goal ? 'ally' : 'enemy') : (goal ? 'enemy' : 'success'));

/**
 * 阵地足球锦标's battle UI on a UI; null without the pack's. Its screens open with the first score given.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui
 */
export function createCupHud(ui) {
  const pack = /** @type {Record<string, any>} */ (ui.ctx.pack), hud = pack.hud?.cup;
  if (!hud || !['cup.topbar', 'cup.stage', 'cup.score', 'cup.done'].every((k) => pack.screens[k])) return null;
  /** @type {ReturnType<typeof cupScreens> | null} */
  let s = null;
  /** @type {CupScore | null} */
  let was = null;
  return {
    /** The screens once open. */
    screens: () => s,
    /** @param {CupScore} f */
    update(f) {
      s ??= cupScreens(ui, hud);
      showTop(s, f, was);
      countdowns(s, f, was);
      marks(s, f, was);
      banners(s, f, was);
      was = { ...f, cup: { ...f.cup, pk: f.cup.pk ? { ...f.cup.pk, shots: [...f.cup.pk.shots] } : null } };
    },
  };
}

/**
 * The four screens and the nodes the UI shows, the banners hidden; the banners' queue.
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui @param {Record<string, any>} hud
 */
function cupScreens(ui, hud) {
  const top = ui.open('cup.topbar'), stage = ui.open('cup.stage'), score = ui.open('cup.score'), done = ui.open('cup.done');
  const at = (/** @type {Screen} */ scr, /** @type {string | undefined} */ ref) => refNode(scr.root, ref);
  const groups = Object.fromEntries(['ally', 'enemy', 'draw', 'ourKick', 'theirKick', 'success'].map((k) => [k, at(score, hud.score[k])]));
  const kick = at(top, hud.top.kickoff.show?.node), pen = at(top, hud.top.penalty.show?.node);
  for (const n of [kick, pen, ...Object.values(groups)]) if (n) n.active = false;
  stage.root.active = false;
  score.root.active = false;
  done.root.active = false;
  return { hud, top, stage, score, done, at, groups, kick, pen, queue: banners0(), seq: /** @type {Map<UiNode, number>} */ (new Map()), sound: ui.ctx.sound };
}

/** A queue that plays one banner at a time. */
function banners0() {
  /** @type {(() => Promise<unknown>)[]} */
  const q = [];
  let busy = false;
  const next = () => {
    const f = q.shift();
    busy = !!f;
    if (f) void f().then(next, next);
  };
  return {
    /** @param {() => Promise<unknown>} f */
    add(f) { q.push(f); if (!busy) next(); },
  };
}

/**
 * The top bar (界面-42): each side's name, team icon and goals — a goal plays its score's clip —, the match's time.
 * @param {ReturnType<typeof cupScreens>} s @param {CupScore} f @param {CupScore | null} was
 */
function showTop(s, f, was) {
  const t = s.hud.top, icons = f.cup.icons;
  for (const [side, name, icon, goals, before] of /** @type {const} */ ([[t.ally, f.cup.ours, icons?.ours, f.home, was?.home], [t.enemy, f.cup.theirs, icons?.theirs, f.away, was?.away]])) {
    const n = s.at(s.top, side.name), sc = s.at(s.top, side.score);
    if (n) setText(n, name);
    teamIcon(s, side.icon, icon);
    if (sc) setText(sc, String(goals));
    if (before !== undefined && goals > before && side.scored) void s.top.anim.play(s.at(s.top, side.scored.node), side.scored.clip);
  }
  const timer = s.at(s.top, t.timer);
  if (timer) setText(timer, clockText(f.left));
}

/**
 * A side's team icon (界面-42): the event's icon of that name when the pack has it, else the pack's own.
 * @param {ReturnType<typeof cupScreens>} s @param {string | undefined} ref @param {string | undefined} icon
 */
function teamIcon(s, ref, icon) {
  const n = s.at(s.top, ref), key = icon ? s.hud.icons?.[icon] : undefined;
  if (!n || !key || n.sprite === key) return;
  n.sprite = key;
  n.paintKey = '';
}

/**
 * The count-downs under the top bar (界面-42): 准备开球 with the seconds of the players' wait after a kickoff; in a
 * penalty round under way ours (选择4名点球手 and our countdown's seconds) or theirs; each with its show and hide clips.
 * @param {ReturnType<typeof cupScreens>} s @param {CupScore} f @param {CupScore | null} was
 */
function countdowns(s, f, was) {
  const pk = f.cup.pk;
  overlay(s, s.kick, s.hud.top.kickoff, { on: !pk && f.cup.wait > 0, was: !!was && !was.cup.pk && was.cup.wait > 0, count: f.cup.wait });
  penaltyCount(s, pk, was?.cup.pk ?? null);
}

/**
 * The penalty count-down (界面-42): in a round under way, ours with our countdown's seconds or theirs; a new round
 * brings it in again.
 * @param {ReturnType<typeof cupScreens>} s @param {CupTask['pk']} pk @param {CupTask['pk']} pkWas
 */
function penaltyCount(s, pk, pkWas) {
  const t = s.hud.top.penalty, now = pk?.on ? pk.round : -1, roundWas = pkWas?.on ? pkWas.round : -1, ours = now % 2 === 0;
  if (now >= 0) {
    const a = s.at(s.top, t.ours), b = s.at(s.top, t.theirs);
    if (a) a.active = ours;
    if (b) b.active = !ours;
  }
  // shown before, unless for another round: that one comes in afresh
  overlay(s, s.pen, t, { on: now >= 0, was: roundWas >= 0 && (now < 0 || roundWas === now), count: ours && pk ? pk.left : -1 });
}

/**
 * One count-down's frame: shown with its clip as it comes, its seconds while on, hidden after its hide clip as it goes
 * (unless it came again meanwhile).
 * @param {ReturnType<typeof cupScreens>} s @param {UiNode | null} n @param {Record<string, any>} c
 * @param {{ on: boolean, was: boolean, count: number }} o
 */
function overlay(s, n, c, o) {
  if (!n) return;
  const count = s.at(s.top, c.count), unit = count ? s.top.one('text_unit', count) : null;
  // minutes and seconds with the unit after them, 「00:10s」
  if (o.on && count && o.count >= 0) setText(count, clockText(o.count));
  if (unit) setText(unit, 's');
  if (o.on === o.was) return;
  const id = (s.seq.get(n) ?? 0) + 1;
  s.seq.set(n, id);
  if (o.on) {
    n.active = true;
    if (c.show) void s.top.anim.play(n, c.show.clip);
    return;
  }
  const off = () => { if (s.seq.get(n) === id) n.active = false; };
  if (c.hide) void s.top.anim.play(n, c.hide.clip).then(off);
  else off();
}

/**
 * The penalty marks (界面-42): the shootout opens them with the top bar's clip; each round over plays the kicking side's
 * next mark's clip, in or out.
 * @param {ReturnType<typeof cupScreens>} s @param {CupScore} f @param {CupScore | null} was
 */
function marks(s, f, was) {
  const t = s.hud.top, pk = f.cup.pk;
  if (!pk) return;
  if (!was?.cup.pk) {
    // the marks' groups are off in the pack; the clip only brings their marks in
    for (const side of [t.ally, t.enemy]) { const g = s.at(s.top, side.marks); if (g) g.active = true; }
    if (t.penaltyOn) void s.top.anim.play(s.at(s.top, t.penaltyOn.node), t.penaltyOn.clip);
  }
  const before = was?.cup.pk?.shots.length ?? 0;
  for (let i = before; i < pk.shots.length; i++) {
    const side = i % 2 === 0 ? t.ally : t.enemy, n = s.at(s.top, side.shots?.[Math.floor(i / 2)]);
    if (n) void s.top.anim.play(n, pk.shots[i] ? side.win : side.lose);
  }
}

/**
 * The banners (界面-42), in turn: the match's start banner first; a goal in the match time; the draw and the shootout's
 * banner as it begins; each round's kick and its result; the finish panel as the match is over.
 * @param {ReturnType<typeof cupScreens>} s @param {CupScore} f @param {CupScore | null} was
 */
function banners(s, f, was) {
  const pk = f.cup.pk;
  if (!was) s.queue.add(() => stageBanner(s, 'match'));
  if (was && !pk && (f.home > was.home || f.away > was.away)) s.queue.add(() => scoreBanner(s, f.home > was.home ? 'ally' : 'enemy'));
  if (pk) penaltyBanners(s, f, pk, was?.cup.pk ?? null);
  if (f.cup.over && was && !was.cup.over) s.queue.add(() => finish(s));
}

/**
 * The shootout's banners (界面-42): as it begins the draw and its start banner; each round over its result; then whose
 * kick the next round is — the round begins once they are over (锦标-4).
 * @param {ReturnType<typeof cupScreens>} s @param {CupScore} f @param {NonNullable<CupTask['pk']>} pk @param {CupTask['pk']} pkWas
 */
function penaltyBanners(s, f, pk, pkWas) {
  // a shootout first seen midway (a reconnect): what is past is not shown again
  const begins = !pkWas && pk.shots.length === 0, from = pkWas ? pkWas.shots.length : pk.shots.length;
  if (begins) {
    s.queue.add(() => scoreBanner(s, 'draw'));
    s.queue.add(() => stageBanner(s, 'penalty'));
  }
  for (let i = from; i < pk.shots.length; i++) { const k = shotBanner(i, pk.shots[i]); s.queue.add(() => scoreBanner(s, k)); }
  const next = pk.shots.length;
  if (next < ROUNDS && (begins || next > from)) s.queue.add(() => scoreBanner(s, next % 2 === 0 ? 'ourKick' : 'theirKick'));
}

/**
 * The start banner's match or shootout group (界面-42), its stage numbered — the match 1, the shootout 2 (「STAGE.1」
 * 「STAGE.2」); its clip once, then hidden.
 * @param {ReturnType<typeof cupScreens>} s @param {'match' | 'penalty'} k
 */
function stageBanner(s, k) {
  const c = s.hud.stage[k], n = c ? s.at(s.stage, c.node) : null;
  if (!c || !n) return Promise.resolve();
  for (const other of ['match', 'penalty']) { const m = s.at(s.stage, s.hud.stage[other]?.node); if (m) m.active = m === n; }
  const text = s.stage.one('text_stage', n);
  if (text) setText(text, k === 'match' ? '1' : '2');
  s.stage.root.active = true;
  s.sound?.(CUP_SOUNDS[k]);
  return s.stage.anim.play(n, c.clip).then(() => { n.active = false; s.stage.root.active = false; });
}

/**
 * One group of the score banner (界面-42) with the banner's clip once, then hidden.
 * @param {ReturnType<typeof cupScreens>} s @param {string} k
 */
function scoreBanner(s, k) {
  const g = s.groups[k], c = s.hud.score.clip;
  if (!g || !c) return Promise.resolve();
  for (const n of Object.values(s.groups)) if (n) n.active = n === g;
  s.score.root.active = true;
  const bank = /** @type {Record<string, string>} */ (CUP_SOUNDS)[k];
  if (bank) s.sound?.(bank);
  return s.score.anim.play(s.at(s.score, c.node), c.clip).then(() => { g.active = false; s.score.root.active = false; });
}

/** The finish panel (界面-42): its clip once; it stays. @param {ReturnType<typeof cupScreens>} s */
function finish(s) {
  const c = s.hud.done.clip;
  s.done.root.active = true;
  return c ? s.done.anim.play(s.at(s.done, c.node), c.clip) : Promise.resolve();
}
