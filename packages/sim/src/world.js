// The world and one frame of it (spec 帧-1): commands, timers, cost, revivals and requests, the waves, buffs, enemy
// movement, operator attacks, projectiles, the tick hook, removal of the dead, the end of the battle — in that order,
// every frame, on every peer.
import { secondsToFrames } from '@aue/math';
import { ANIM, KIND } from '@aue/schema';
import { seedState } from './rng.js';
import { hashValue, HASH_START } from './hash.js';
import { enemiesAct } from './enemies.js';
import { newSchedule, visiblePredefines, tickWaves, checkEnd } from './waves.js';
import { placeDevice } from './devices.js';
import { placePredefined } from './predefined.js';
import { newStageState, tickStage, stageCount } from './stage.js';
import { releaseAll } from './blocking.js';
import { operatorsAttack, shotsFly } from './combat.js';
import { tickAlchemy } from './alchemy.js';
import { foeEffects, foeDeath, foeFatal, releasePassengers } from './foes.js';
import { applyCommand } from './commands.js';
import { leaveField, startCost, costRate } from './deck.js';
import { coolSummons, dismissSummons, expireSummons } from './summons.js';
import { tickRevival, tickRequests, neutralDown } from './coop.js';
import { tickBuffs } from './buffs.js';
import { STATUS_BEHAVIORS } from './status.js';
import { BURST_BEHAVIORS, epRegenAll } from './elements.js';
import { upkeepBehaviors, timedBehaviors } from './upkeep.js';
import { chargeBehavior } from './modes.js';
import { auras } from './aura.js';
import { runeRangeSp } from './runes.js';
import { carriedBehaviors } from './carried.js';
import { regenAll } from './damage.js';
import { emit, hasHook, runTimers } from './bus.js';
import { fallIntoHoles } from './holes.js';
import { tacticalFatal, tacticalBehaviors } from './tactical.js';
import { dollFatal, dollBehaviors, flushSkillDolls } from './doll.js';
import { secondLifeFatal } from './riders.js';
import { talentDeaths, TALENT_BEHAVIORS } from './talentfx.js';
import { healHooks, HEAL_BEHAVIORS } from './talentheal.js';
import { SKILL_TEXT_BEHAVIORS } from './skilltext.js';
import { FIGHT_BEHAVIORS, timedBlasts } from './talentfight.js';
import { foeBehaviors } from './talentfoe.js';
import { elementHooks, elementBehaviors } from './talentelem.js';
import { holds } from './vs.js';
import { lifeFatal, lifeBehaviors } from './talentlife.js';
import { newFortress, setUpFortress, fortressHooks, tickFortress } from './fortress.js';
import { fieldContent } from './facilities.js';
import { bleedTick } from './blight.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('@aue/schema').Command} Command */

/**
 * A new world at frame 0 (spec 费用-1: each player starts with the level's initial cost — more by its deck's talents,
 * 部署-10 — and life), its hooks and timers set up by the content (钩子-4); in 堡垒守御 its progress and facilities
 * (守御-1, 守御-3).
 * @param {Content} c @param {{ seed: number, players: number }} o @returns {World}
 */
export function createWorld(c, o) {
  const { maxLifePoint, costIncreaseTime } = c.level.options;
  /** @type {World} */
  const w = {
    frame: 0, rng: seedState(o.seed), nextId: 1, sched: newSchedule(), predefined: visiblePredefines(c), result: -1, stage: newStageState(), bornThisFrame: 0, units: [], shots: [], blasts: [], bolts: [],
    events: [],
    players: Array.from({ length: o.players }, (_, seat) => ({ life: maxLifePoint, cost: startCost(c, seat), costTimer: secondsToFrames(costIncreaseTime), deployed: [], cards: {}, revive: -1, downs: 0, ask: -1, askCd: 0 })),
    ...(c.level.fortress ? { fortress: newFortress(c, o.players) } : {}),
  };
  for (const alias of w.predefined) { placeDevice(w, c, alias); placePredefined(w, c, alias); }
  setUpFortress(w, c);
  c.behaviors?.world?.(w, c);
  return w;
}

/**
 * Each player gains 1 cost every costIncreaseTime, up to maxCost (spec 费用-1): its timer runs down by its recovery's
 * rate each frame — 1, × its operators' talents' (部署-10) —, what runs over kept.
 * @param {World} w @param {Content} c
 */
function gainCost(w, c) {
  const { maxCost, costIncreaseTime } = c.level.options;
  w.players.forEach((p, seat) => {
    p.costTimer -= costRate(w, c, seat);
    if (p.costTimer > 0) return;
    p.costTimer += secondsToFrames(costIncreaseTime);
    p.cost = Math.min(maxCost, p.cost + 1);
  });
}

/**
 * Removes units with no HP left (伤害-9): enemies killed by attacks die — unless an ability keeps them (敌能-2) —, the
 * talents that see one fall give their SP (职业-25), enemies at the goal leave quietly; an operator that falls releases what it blocks (阻挡-3) and leaves the field without a
 * refund (部署-3), its summons with it (召唤-5) — but a tactical summon in its summon form turns into its point (召唤-11).
 * @param {World} w @param {Content} c
 */
function removeDead(w, c) {
  const reachedGoal = new Set(w.events.filter((e) => e.type === 'goal').map((e) => e.id));
  for (const u of w.units) {
    if (stays(w, c, u, reachedGoal.has(u.id))) continue;
    announceDeath(w, u, reachedGoal.has(u.id));
    if (!reachedGoal.has(u.id)) talentDeaths(w, c, u);
    u.anim = ANIM.DIE;
    if (!reachedGoal.has(u.id)) w.events.push({ type: 'death', id: u.id });
    if (!reachedGoal.has(u.id) && u.kind === KIND.ENEMY && u.base.neutral === true) neutralDown(w, c, u);
    if (!reachedGoal.has(u.id) && u.kind === KIND.ENEMY) foeDeath(w, c, u);
    if (u.kind === KIND.ENEMY) releasePassengers(w, c, u);
    stageCount(w, c, u, reachedGoal.has(u.id));
    releaseAll(w, u.id);
    if (u.kind === KIND.OPERATOR) leaveField(w, c, u, false);
  }
  const fell = w.units.filter((u) => u.hp <= 0 && u.kind === KIND.OPERATOR).map((u) => u.id);
  w.units = w.units.filter((u) => u.hp > 0);
  if (fell.length) dismissSummons(w, c, fell);
}

/**
 * Whether a unit stays on the field at the frame's end (伤害-9): it has HP, or at 0 an ability keeps the enemy (敌能-2) —
 * not one at the goal —, the tactical summon turns into its point (召唤-11), the 傀儡师 switches to its 替身 (职业-15), the
 * operator takes its second life (职业-22) or a talent keeps it (职业-27) — not one devoured (敌能-30).
 * @param {World} w @param {Content} c @param {Unit} u @param {boolean} atGoal
 */
const stays = (w, c, u, atGoal) => u.hp > 0 || (u.kind === KIND.ENEMY && !atGoal && foeFatal(w, c, u))
  || (u.ab['@devoured'] === undefined && (tacticalFatal(w, c, u) || dollFatal(w, c, u) || secondLifeFatal(w, c, u) || lifeFatal(w, c, u)));

/**
 * The unit whose hit this frame brought `u` to 0 HP — the last hit on it this frame —, while it is on the field; null
 * for none or a hit without a source (钩子-3).
 * @param {World} w @param {Unit} u @returns {Unit | null}
 */
function killerOf(w, u) {
  for (let i = w.events.length - 1; i >= 0; i--) {
    const e = /** @type {any} */ (w.events[i]);
    if (e.type === 'hit' && e.target === u.id) return e.id >= 0 ? w.units.find((x) => x.id === e.id) ?? null : null;
  }
  return null;
}

/**
 * The events of a unit leaving at 0 HP (钩子-3): `kill` when a unit's hit brought it there, `skillEnd` when its skill
 * runs, then `death` — `leak` for an enemy that reached a goal, else `killed` with its killer.
 * @param {World} w @param {Unit} u @param {boolean} leak
 */
function announceDeath(w, u, leak) {
  const killer = leak || !(hasHook(w, 'kill') || hasHook(w, 'death')) ? null : killerOf(w, u);
  if (killer) emit(w, 'kill', { killer, victim: u });
  if (u.skill?.active) emit(w, 'skillEnd', { unit: u, reason: 'death' });
  emit(w, 'death', { unit: u, reason: leak ? 'leak' : 'killed', killer });
}

/** The engine's own buff behaviours (状态-8, 元素-4, 职业-10, 职业-12, 职业-15, 职业-27…职业-29, 召唤-11, 装置-6); content cannot replace them. @param {Content} c */
const builtin = (c) => ({ ...STATUS_BEHAVIORS, ...BURST_BEHAVIORS, ...TALENT_BEHAVIORS, ...HEAL_BEHAVIORS, ...SKILL_TEXT_BEHAVIORS, ...FIGHT_BEHAVIORS, ...lifeBehaviors(c), ...foeBehaviors(c, holds), ...elementBehaviors(), ...upkeepBehaviors(c), ...timedBehaviors(c), charge: chargeBehavior(c), ...tacticalBehaviors(c), ...dollBehaviors(c), ...carriedBehaviors(c), bleed: { tick: bleedTick } });

/** Each content's buff behaviours, made once (they depend on the content alone), with the content's table they were made from. @type {WeakMap<Content, { from: unknown, table: Record<string, import('./buffs.js').Behavior> }>} */
const buffTables = new WeakMap();

/** The buff behaviours of a battle: the content's, then the engine's own. @param {Content} c */
function buffBehaviors(c) {
  const from = c.behaviors?.buffs, known = buffTables.get(c);
  if (known && known.from === from) return known.table;
  const table = { ...from, ...builtin(c) };
  buffTables.set(c, { from, table });
  return table;
}

/**
 * Runs frame `w.frame` with the commands executed in it ([seat, command] in the order the server sealed them) and
 * advances to the next frame — on the field as the facilities make it at the frame's start (守御-5). Returns the
 * frame's presentation events.
 * @param {World} w @param {Content} level @param {[number, Command][]} commands
 */
export function step(w, level, commands = []) {
  const c = fieldContent(w, level);
  fortressHooks(w, level);
  elementHooks(w, level);
  healHooks(w, level);
  w.events = [];
  w.bornThisFrame = 0;
  for (const [seat, cmd] of commands) applyCommand(w, c, seat, cmd);
  runTimers(w);
  if (w.frame === 0) emit(w, 'battleStart', {});
  gainCost(w, c);
  coolSummons(w, c);
  expireSummons(w, c);
  tickRevival(w, c);
  tickRequests(w);
  tickStage(w, c);
  tickWaves(w, c);
  tickFortress(w, c);
  tickBuffs(w, buffBehaviors(c));
  // A skill that switches to the 替身 as it starts: after buffs tick, before the rest of the frame, so the switch's flags
  // are on before enemies act and the phase buff is not counted down on the frame it appears (职业-15), as a fatal switch is.
  flushSkillDolls(w, c);
  regenAll(w);
  epRegenAll(w);
  enemiesAct(w, c);
  fallIntoHoles(w, c);
  tickAlchemy(w, c);
  auras(w, c);
  runeRangeSp(w, c);
  operatorsAttack(w, c);
  // A skill that switches as it ends does so in the operator's turn (tickSkill). Still this frame, before shots land and
  // before a unit at 0 HP is removed, so the two do not both start a switch (职业-15).
  flushSkillDolls(w, c);
  timedBlasts(w, c);
  shotsFly(w, c);
  foeEffects(w, c);
  emit(w, 'tick', { frames: 1 });
  removeDead(w, c);
  checkEnd(w, c);
  w.frame++;
  return w.events;
}

/**
 * Plain data as numbers for the hash (spec 同步-1): a tag, then the value — numbers (−0 as 0), strings by length and
 * UTF-16 code units, booleans, null, arrays by length then items, objects by key count then each key and value in
 * order. Keys holding undefined are skipped, as a snapshot (JSON) drops them.
 * @param {number[]} out @param {unknown} v
 */
export function pushValue(out, v) {
  if (typeof v === 'number') out.push(0, v + 0);
  else if (typeof v === 'string') pushText(out, 1, v);
  else if (typeof v === 'boolean') out.push(2, v ? 1 : 0);
  else if (v === null) out.push(3);
  else if (Array.isArray(v)) { out.push(4, v.length); for (const x of v) pushValue(out, x); }
  else if (typeof v === 'object') {
    const entries = Object.entries(v).filter(([, x]) => x !== undefined);
    out.push(5, entries.length);
    for (const [k, x] of entries) { pushText(out, 1, k); pushValue(out, x); }
  } else throw new TypeError(`stateHash: not plain data: ${typeof v}`);
}

/** @param {number[]} out @param {number} tag @param {string} s */
function pushText(out, tag, s) {
  out.push(tag, s.length);
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
}

/**
 * The state hash (spec 同步-1): the frame, the random state, the id counter, the waves' progress, the predefined units in
 * effect, the result, the co-op stages, the players, the units, the projectiles, bolts and explosions, 堡垒守御's
 * progress when there is one (守御-1), the enemies brought in to appear later once there have been some (敌能-22), the 炼金单元
 * once there have been some (技能-13), 污染秽蚀 once there has been one (敌能-46), all of their data.
 * @param {World} w @returns {number}
 */
export function stateHash(w) {
  return hashValue(HASH_START, { frame: w.frame, rng: w.rng, nextId: w.nextId, sched: w.sched, predefined: w.predefined, result: w.result, stage: w.stage, players: w.players, units: w.units, shots: w.shots, blasts: w.blasts, bolts: w.bolts,
    fortress: w.fortress, broods: w.broods, alchemy: w.alchemy, zones: w.zones });
}

