// Waves (docs/spec/waves.md 波次-1…波次-6, 结束-1): the level's waves one after another, a wave's fragments one after
// another, a fragment's actions side by side; hidden groups act only when enabled, random alternatives are drawn when
// their wave begins, predefined units come into effect and leave. The battle is won when the last wave is over and
// lost when every player is down. In 堡垒守御 each wave is a defence with a time limit and the next begins after a rest
// (守御-1).
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { isDown } from './coop.js';
import { weightedPick } from './rng.js';
import { stageOf, startStage, resting } from './stage.js';
import { spawnEnemy } from './spawn.js';
import { defendStart, defendEnd, cutDefence, mayBegin } from './fortress.js';
import { placeDevice, withdrawDevice } from './devices.js';
import { placePredefined, isPredefinedOperator, withdrawPredefined } from './predefined.js';
import { kickoffWave } from './football.js';
import { actingGroups } from './cup.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').Wave} Wave @typedef {import('./types.js').WaveAction} WaveAction @typedef {import('./types.js').Schedule} Schedule */

/** The scheduler before the battle starts: the first wave begins in the first frame. @returns {Schedule} */
export const newSchedule = () => ({ wave: -1, step: 'post', at: 0, frag: 0, fragAt: -1, fired: [], chosen: [] });

/** The predefined units in effect from the start (波次-6): those not hidden. @param {Content} c @returns {string[]} */
export const visiblePredefines = (c) => (c.level.predefines ?? []).filter((p) => !p.hidden).map((p) => p.alias);

/**
 * What each wave of the content gives the scheduler, worked out once (the content does not change): its actions in
 * order, where each fragment's start among them, and the last acting mask with what it was worked out from.
 * @type {WeakMap<Wave, { actions: WaveAction[], starts: number[], mask: { groups: string[], chosen: number[], on: boolean[] } | null }>}
 */
const waveTables = new WeakMap();

/** @param {Wave} wave */
function tableOf(wave) {
  let t = waveTables.get(wave);
  if (!t) {
    const starts = [];
    let n = 0;
    for (const f of wave.fragments) { starts.push(n); n += f.actions.length; }
    t = { actions: wave.fragments.flatMap((f) => f.actions), starts, mask: null };
    waveTables.set(wave, t);
  }
  return t;
}

/** A wave's actions in order, fragment by fragment; the same list each time — never change it. @param {Wave} wave @returns {WaveAction[]} */
const actionsOf = (wave) => tableOf(wave).actions;

/** Whether an action's hidden group lets it act (波次-4). @param {readonly string[]} groups the groups enabled @param {WaveAction} a */
const groupEnabled = (groups, a) => !a.hidden || groups.includes(a.hidden);

/**
 * The random alternatives of a wave (波次-5): for each group in order of first appearance, the indices (into the wave's
 * actions) of its candidates — all of them, whatever their hidden groups.
 * @param {Wave} wave @returns {number[][]}
 */
function groupsOf(wave) {
  /** @type {Map<string, number[]>} */
  const groups = new Map();
  actionsOf(wave).forEach((a, i) => {
    if (a.group) groups.set(a.group, [...(groups.get(a.group) ?? []), i]);
  });
  return [...groups.values()];
}

/**
 * Which of the current wave's actions act (波次-4, 波次-5): those whose own hidden group is enabled and that are not
 * left out by the draw — a candidate must be chosen, and a member of a candidate's pack acts only with that candidate.
 * The groups enabled are the level's and a drawn 锦标 stadium's (锦标-2).
 * @param {World} w @param {Content} c @param {Wave} wave @param {Schedule} s @returns {boolean[]} by index into the wave's actions
 */
function acting(w, c, wave, s) {
  const t = tableOf(wave), m = t.mask, groups = actingGroups(w, c);
  if (m && sameList(m.groups, groups) && sameList(m.chosen, s.chosen)) return m.on;
  const on = actingNow(groups, wave, s);
  t.mask = { groups: [...groups], chosen: [...s.chosen], on };
  return on;
}

/** Whether two lists hold the same items in order. @param {readonly unknown[]} a @param {readonly unknown[]} b */
function sameList(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** acting, worked out. @param {readonly string[]} groups @param {Wave} wave @param {Schedule} s @returns {boolean[]} */
function actingNow(groups, wave, s) {
  const all = actionsOf(wave);
  const packs = new Set(all.filter((x) => x.group && x.pack).map((x) => x.pack));
  const chosen = new Set(s.chosen.map((j) => all[j].pack));
  return all.map((a, i) => {
    if (!groupEnabled(groups, a)) return false;
    if (a.group) return s.chosen.includes(i);
    return !a.pack || !packs.has(a.pack) || chosen.has(a.pack);
  });
}

/** Frames of a time in seconds (时间-2), for any of the wave fields. @param {number} seconds */
const frames = (seconds) => secondsToFrames(Math.max(0, seconds));

/**
 * A wave begins (波次-2, 波次-5): its random alternatives are drawn and its preDelay starts. After the last wave: done. In
 * 阵地足球 the next is the kickoff's layout (足球-6): with kickoff tags there is always one, without them they go in order.
 * @param {World} w @param {Content} c @param {number} at the frame it begins
 */
function beginWave(w, c, at) {
  const s = w.sched, next = w.football ? kickoffWave(w, c, at) : s.wave + 1, wave = c.level.waves[next];
  if (!wave) { w.sched = { ...s, wave: next, step: 'done', at }; return; }
  const all = actionsOf(wave);
  const chosen = groupsOf(wave).map((ids) => ids[weightedPick(w, ids.map((i) => all[i].weight ?? 1))]);
  w.sched = { wave: next, step: 'pre', at, frag: 0, fragAt: -1, fired: [], chosen };
  w.events.push({ type: 'wave', index: next });
  if (w.fortress) defendStart(w, c, next, spawnTotal(w, c, wave, w.sched));
}

/** The enemies a wave spawns that it waits for (波次-3): the counts of its acting SPAWN actions. @param {World} w @param {Content} c @param {Wave} wave @param {Schedule} s */
function spawnTotal(w, c, wave, s) {
  const on = acting(w, c, wave, s);
  return actionsOf(wave).reduce((n, a, i) => n + (on[i] && a.type === 'SPAWN' && !a.dontBlockWave ? a.count : 0), 0);
}

/**
 * One action acting once (波次-1, 波次-6, 波次-7, 波次-8): an enemy spawns, a predefined unit comes into effect or leaves,
 * a story is told.
 * @param {World} w @param {Content} c @param {WaveAction} a @param {number} fragAt @param {number} wave
 */
function act(w, c, a, fragAt, wave) {
  if (a.type === 'SPAWN') {
    spawnEnemy(w, c, a, fragAt, a.dontBlockWave ? -1 : wave);
  } else if (a.type === 'ACTIVATE' && isPredefinedOperator(c, a.key)) {
    // an operator comes back each time it is activated off the field, after the intermission too (波次-7)
    if (!w.predefined.includes(a.key)) { w.predefined.push(a.key); w.events.push({ type: 'predefine', key: a.key, on: 1 }); }
    placePredefined(w, c, a.key);
  } else if (a.type === 'ACTIVATE' && !w.predefined.includes(a.key)) {
    w.predefined.push(a.key);
    w.events.push({ type: 'predefine', key: a.key, on: 1 });
    placeDevice(w, c, a.key);
    if (stageOf(c, a.key) >= 0) startStage(w, c, stageOf(c, a.key));
  } else if (a.type === 'STORY') {
    w.events.push({ type: 'story', key: a.key });
  } else if (a.type === 'WITHDRAW' && w.predefined.includes(a.key)) {
    w.predefined = w.predefined.filter((k) => k !== a.key);
    w.events.push({ type: 'predefine', key: a.key, on: 0 });
    if (isPredefinedOperator(c, a.key)) withdrawPredefined(w, c, a.key); else withdrawDevice(w, a.key);
  }
}

/**
 * The current fragment (波次-2): it starts when its preDelay is over; every action acting this frame acts, in order;
 * when all of them have acted their count, it ends and the next fragment's preDelay starts. Returns whether the
 * schedule moved on (and may move again this frame).
 * @param {World} w @param {Content} c @param {Wave} wave
 */
function runFragment(w, c, wave) {
  const s = w.sched, frag = wave.fragments[s.frag];
  if (!frag) { s.step = 'hold'; return true; }
  if (s.fragAt < 0) {
    if (w.frame < s.at + frames(frag.preDelay)) return false;
    s.fragAt = s.at + frames(frag.preDelay);
    s.fired = frag.actions.map(() => 0);
  }
  const base = tableOf(wave).starts[s.frag], on = acting(w, c, wave, s);
  let end = s.fragAt, open = false;
  frag.actions.forEach((a, i) => {
    if (!on[base + i]) return;
    const due = (/** @type {number} */ k) => s.fragAt + frames(a.preDelay + k * a.interval);
    while (s.fired[i] < a.count && w.frame >= due(s.fired[i])) { act(w, c, a, s.fragAt, s.wave); s.fired[i]++; }
    if (s.fired[i] < a.count) open = true;
    else if (a.count > 0) end = Math.max(end, due(a.count - 1));
  });
  if (open) return false;
  w.sched = { ...s, frag: s.frag + 1, fragAt: -1, at: end };
  return true;
}

/** Whether an enemy of the current wave is still to be handled (波次-3). @param {World} w */
const waiting = (w) => w.units.some((u) => u.kind === KIND.ENEMY && u.hp > 0 && u.wave === w.sched.wave);

/**
 * One step of the schedule at this frame; returns whether it moved on (and may move again this frame). In 堡垒守御 a
 * defence's time limit cuts its wave, and the next wave waits for the rest (守御-1).
 * @param {World} w @param {Content} c
 */
function advance(w, c) {
  const s = w.sched, wave = c.level.waves[s.wave];
  if (s.step === 'done') return false;
  if (cutDefence(w, c)) return true;
  if (s.step === 'post') return endPost(w, c, wave);
  if (s.step === 'pre') {
    if (w.frame < s.at + frames(wave.preDelay)) return false;
    w.sched = { ...s, step: 'frags', at: s.at + frames(wave.preDelay) };
    return true;
  }
  if (s.step === 'frags') return runFragment(w, c, wave);
  if (resting(w)) return false;
  const timeUp = wave.maxWait >= 0 && w.frame >= s.at + frames(wave.maxWait);
  if (waiting(w) && !timeUp) return false;
  w.sched = { ...s, step: 'post', at: timeUp && waiting(w) ? s.at + frames(wave.maxWait) : w.frame };
  defendEnd(w, c);
  return true;
}

/**
 * A wave's postDelay (波次-2): when it is over — in 堡垒守御 also the rest after it (守御-1) — the next wave begins.
 * Whether it did. @param {World} w @param {Content} c @param {Wave | undefined} wave the wave before, none before the first
 */
function endPost(w, c, wave) {
  const s = w.sched, due = s.wave < 0 || !wave ? 0 : s.at + frames(wave.postDelay);
  if (w.frame < due || !mayBegin(w, s.wave + 1)) return false;
  beginWave(w, c, w.fortress ? w.frame : due);
  return true;
}

/** This frame of the waves (帧-1 step 4): every step due now, in order. @param {World} w @param {Content} c */
export function tickWaves(w, c) {
  while (advance(w, c));
}

/**
 * Whether the battle has ended (结束-1), checked at the end of a frame: lost when every player is down; won when the
 * last co-op stage has passed, in 堡垒守御 when the last defence is over (守御-1) or, in another level without stages,
 * when the level's waves are all over. The first result stands.
 * @param {World} w @param {Content} c
 */
export function checkEnd(w, c) {
  if (w.result >= 0) return;
  const stages = c.level.stages ?? [];
  const lost = w.players.length > 0 && w.players.every(isDown);
  const won = stages.length > 0 ? w.stage.passed === stages.length : w.fortress ? w.fortress.phase === 'over' : c.level.waves.length > 0 && w.sched.step === 'done';
  if (!lost && !won) return;
  w.result = lost ? 0 : 1;
  w.events.push({ type: 'end', result: w.result });
}
