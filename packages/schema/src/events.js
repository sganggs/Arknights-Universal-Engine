// Presentation events, version 4 (ADR 0053; version 2 adds a skill starting or ending, version 3 an element burst, version 4 a heal, version 5 a projectile launched, version 6 a player down and back, version 7 a cost request and its answer, version 8 a wave beginning, a predefined unit coming
// into effect or leaving, a co-op stage beginning and settled, an enemy's 直击 bolt and explosion, and the end of the battle, version 9 an attack's wind-up in frames, version 10 a story told: 波次-8, version 11 堡垒守御's phases and a facility's level: 守御-1, 守御-3, version 12 a 炼金单元 thrown: 技能-13, version 14 a goal in 阵地足球, a 阵地足球锦标 penalty round and its lightning: 足球-5, 锦标-4, 锦标-2): what happened in a frame, for the renderer and the sound. They flow from
// the simulation to the screen only; the simulation never reads them back.

export const EVENTS_VERSION = 14;

/** The goal a `score` event names (足球-5): ours (the other side scores) or theirs (we score). */
export const SCORE_GOAL = Object.freeze({ ours: 0, theirs: 1 });

/** The phases a `fortress` event tells (守御-1): a defence begins, a rest begins, the last defence is over. */
export const FORTRESS_PHASE = Object.freeze({ defend: 0, rest: 1, over: 2 });

/** Each event type and its fields besides `type` (all numbers, except `key`: a content id; `el` is an element id 1…5). */
export const EVENT_FIELDS = Object.freeze({
  spawn: Object.freeze(['id', 'key']),
  deploy: Object.freeze(['id', 'key', 'owner']),
  attack: Object.freeze(['id', 'target', 'wind', 'face']),
  hit: Object.freeze(['id', 'target', 'damage']),
  death: Object.freeze(['id']),
  goal: Object.freeze(['id', 'owner']),
  retreat: Object.freeze(['id']),
  skill: Object.freeze(['id', 'active']),
  burst: Object.freeze(['id', 'el']),
  heal: Object.freeze(['id', 'target', 'amount']),
  shot: Object.freeze(['id', 'target']),
  down: Object.freeze(['owner']),
  revive: Object.freeze(['owner']),
  ask: Object.freeze(['owner']),
  answer: Object.freeze(['owner', 'accept', 'amount']),
  wave: Object.freeze(['index']),
  predefine: Object.freeze(['key', 'on']),
  end: Object.freeze(['result']),
  stage: Object.freeze(['index', 'on', 'stamps']),
  bolt: Object.freeze(['id']),
  blast: Object.freeze(['x', 'y']),
  story: Object.freeze(['key']),
  fortress: Object.freeze(['wave', 'phase', 'until']),
  facility: Object.freeze(['id', 'level']),
  // a 炼金单元 (技能-13): its id, its thrower, its centre (x the column, y the row) and radius, the frames it lasts; drifting,
  // its speed (tiles a second), radius growth a second and the frames it drifts (0 for none)
  alchemy: Object.freeze(['id', 'src', 'x', 'y', 'r', 'frames', 'vx', 'vy', 'grow', 'drift']),
  // a ball in a goal (足球-5): the ball's id, the goal (SCORE_GOAL)
  score: Object.freeze(['id', 'goal']),
  // a 锦标 penalty round (锦标-4): the round 0…5 (even ours, odd theirs); at its start `goal` −1, at its end 1 when the
  // side kicking scored, else 0
  penalty: Object.freeze(['round', 'goal']),
  // 超强对流's lightning on a ball (锦标-2): the ball's id, the phase (THUNDER_PHASE in @aue/sim: 0 the warning, 1 the
  // bolt, 2 its burning over)
  thunder: Object.freeze(['id', 'phase']),
});

/** @typedef {{ type: keyof typeof EVENT_FIELDS, [field: string]: string | number }} PresentationEvent */

/**
 * The problems of an event (empty when it is well formed).
 * @param {unknown} e @returns {string[]}
 */
export function eventProblems(e) {
  if (!e || typeof e !== 'object') return ['not an object'];
  const ev = /** @type {Record<string, unknown>} */ (e);
  const fields = EVENT_FIELDS[/** @type {keyof typeof EVENT_FIELDS} */ (ev.type)];
  if (!fields) return [`unknown event type ${String(ev.type)}`];
  const out = [];
  for (const f of fields) {
    const want = f === 'key' ? 'string' : 'number';
    if (typeof ev[f] !== want) out.push(`${ev.type}.${f} is not a ${want}`);
  }
  for (const k of Object.keys(ev)) if (k !== 'type' && !fields.includes(k)) out.push(`${ev.type} has an unknown field ${k}`);
  return out;
}
