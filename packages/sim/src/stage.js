// Co-op stages (docs/spec/coop.md 合作-6…合作-8): a hidden stage controller comes into effect, a rest, then the stage's
// clock; at its time limit the stage is settled by its objective — stamps and the intermission before the next stage,
// the win after the last, or the loss.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { isDown, loseAll, comeBack } from './coop.js';
import { releaseAll } from './blocking.js';
import { leaveField } from './deck.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Stage} Stage @typedef {import('./types.js').StageState} StageState */

/** The stages before any has begun. @returns {StageState} */
export const newStageState = () => ({ index: -1, start: 0, running: false, count: 0, died: false, stamps: 0, passed: 0 });

/** The index of the stage whose controller has this alias, or −1. @param {Content} c @param {string} alias */
export const stageOf = (c, alias) => (c.level.stages ?? []).findIndex((s) => s.alias === alias);

/** Whether a stage is resting before its clock starts (合作-6): the waves wait. @param {World} w */
export const resting = (w) => w.stage.running && w.frame < w.stage.start;

/**
 * A stage controller comes into effect (合作-6): the stage rests, then its clock starts.
 * @param {World} w @param {Content} c @param {number} index
 */
export function startStage(w, c, index) {
  const st = /** @type {Stage[]} */ (c.level.stages)[index];
  w.stage = { ...w.stage, index, start: w.frame + secondsToFrames(st.rest), running: true, count: 0, died: false };
  w.events.push({ type: 'stage', index, on: 1, stamps: 0 });
}

/**
 * Whether the running stage has reached `target` (合作-7): survival in seconds of its clock, 突击 the leaders' HP lost
 * (all of it once a leader has left the field), the others its count.
 * @param {World} w @param {Stage} st @param {number} target
 */
function reached(w, st, target) {
  const s = w.stage;
  if (st.objective === 'survive') return w.frame - s.start >= secondsToFrames(target);
  if (st.objective === 'boss') {
    const hpMax = st.hpMax ?? 0;
    if (s.died) return true;
    const lost = w.units.filter((u) => u.kind === KIND.ENEMY && u.base.levelType === 'BOSS').reduce((n, u) => n + Math.max(0, u.maxHp - u.hp), 0);
    return target < 1 && lost >= target * hpMax;
  }
  return s.count >= target;
}

/**
 * An enemy leaving the field during the running stage's clock (合作-7): reaching its goal (`reached`) or knocked down.
 * @param {World} w @param {Content} c @param {Unit} u @param {boolean} arrived
 */
export function stageCount(w, c, u, arrived) {
  const s = w.stage;
  if (!s.running || w.frame < s.start || u.kind !== KIND.ENEMY) return;
  const st = /** @type {Stage[]} */ (c.level.stages)[s.index];
  if (st.objective === 'boss' && u.base.levelType === 'BOSS') s.died = true;
  const counts = st.objective === 'protect' ? arrived && u.base.neutral === true
    : st.objective === 'target' ? !arrived && u.key === st.enemy
      : st.objective === 'kill' && !arrived && u.base.neutral !== true;
  if (counts) s.count++;
}

/**
 * The intermission after a stage passed (合作-8): enemies, those to be brought in (敌能-22), projectiles, 炼金单元 (技能-13) and 【免费品尝】 areas (敌能-62) are gone, every operator retreats with its
 * redeployment time cleared, lives are full and the fallen come back, and the current wave stops acting.
 * @param {World} w @param {Content} c
 */
function intermission(w, c) {
  w.units = w.units.filter((u) => u.kind !== KIND.ENEMY);
  w.shots = [];
  if (w.broods) w.broods = [];
  if (w.alchemy) w.alchemy = [];
  if (w.tastings) w.tastings = [];
  for (const u of w.units.filter((x) => x.kind === KIND.OPERATOR)) {
    w.units = w.units.filter((x) => x !== u);
    releaseAll(w, u.id);
    leaveField(w, c, u, true);
    if (!c.operators[u.key].summon) w.players[u.owner].cards[u.key].ready = w.frame;
    w.events.push({ type: 'retreat', id: u.id });
  }
  w.players.forEach((p, seat) => {
    p.life = c.level.options.maxLifePoint;
    if (isDown(p)) comeBack(w, c, seat);
  });
  if (w.sched.step !== 'done') w.sched = { ...w.sched, step: 'post', at: w.frame };
}

/**
 * The running stage's clock (合作-6): at its time limit the stage is settled — the minimum objective gives a stamp and
 * the advanced one another; then the intermission, or the win after the last stage. Missing the minimum costs every
 * player all their life.
 * @param {World} w @param {Content} c
 */
export function tickStage(w, c) {
  const s = w.stage, stages = c.level.stages ?? [];
  if (!s.running || w.frame < s.start + secondsToFrames(stages[s.index].time)) return;
  const st = stages[s.index];
  s.running = false;
  if (!reached(w, st, st.goal)) {
    w.players.forEach((_, seat) => loseAll(w, seat));
    w.events.push({ type: 'stage', index: s.index, on: 0, stamps: 0 });
    return;
  }
  const got = st.advanced !== undefined && reached(w, st, st.advanced) ? 2 : 1;
  s.stamps += got;
  s.passed++;
  w.events.push({ type: 'stage', index: s.index, on: 0, stamps: got });
  if (s.passed < stages.length) intermission(w, c);
}

/** A player's stamps (合作-6): the team's, one fewer for a player who went down twice or more. @param {World} w @param {number} seat */
export const stampsOf = (w, seat) => Math.max(0, w.stage.stamps - (w.players[seat].downs >= 2 ? 1 : 0));
