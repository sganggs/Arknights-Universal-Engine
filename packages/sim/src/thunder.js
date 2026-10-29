// 超强对流球场 (docs/spec/cup.md 锦标-2): every ball in play draws lightning. Each so many seconds after it came on the
// field a warning starts on it; a little later the bolt hits it — every other unit within its radius, ours and theirs,
// takes sourceless physical damage and is stunned —, then for a while the ball hurts every other unit near it each
// second with sourceless arts damage. Ours (operators, tokens, devices) and the enemies take numbers of their own.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { dealDamage } from './damage.js';
import { inflict } from './status.js';
import { stadiumOf } from './cup.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').ThunderDef} ThunderDef */

/** The phases a `thunder` event tells (锦标-2): the warning on a ball, the bolt, the ball's burning over. */
export const THUNDER_PHASE = Object.freeze({ warn: 0, strike: 1, over: 2 });

/** Whether a unit is near enough to a ball to be hit, by their centres (锦标-2: 中点判定). @param {Unit} u @param {Unit} b @param {number} r */
const within = (u, b, r) => (u.x - b.x) * (u.x - b.x) + (u.y - b.y) * (u.y - b.y) <= r * r;

/**
 * The units lightning may hit around a ball (锦标-2): every other one on the field and alive, flying or not, ours and
 * theirs — no ball and no 守门位. @param {World} w @param {Unit} b @param {number} r
 */
const around = (w, b, r) => w.units.filter((u) => u !== b && !u.ball && !u.spot && !u.hidden && u.hp > 0 && within(u, b, r));

/** One of a pair of numbers by side (锦标-2): the first for ours, the second for the enemies. @param {Unit} u @param {number} ours @param {number} theirs */
const bySide = (u, ours, theirs) => (u.kind === KIND.ENEMY ? theirs : ours);

/** The bolt on a ball (锦标-2). @param {World} w @param {Content} c @param {Unit} b @param {ThunderDef} t */
function strike(w, c, b, t) {
  for (const u of around(w, b, t.radius)) {
    dealDamage(w, null, u, { type: 'phys', amount: bySide(u, t.ally, t.enemy), sourceless: true }, c);
    if (u.hp > 0) inflict(w, u, 'stun', { seconds: t.stun, src: null });
  }
}

/** A second of the ball's burning (锦标-2). @param {World} w @param {Content} c @param {Unit} b @param {ThunderDef} t */
function burn(w, c, b, t) {
  for (const u of around(w, b, t.burn.radius)) dealDamage(w, null, u, { type: 'arts', amount: bySide(u, t.burn.ally, t.burn.enemy), sourceless: true }, c);
}

/**
 * A ball's lightning this frame (锦标-2): its first warning `every` seconds after it is first seen, then one each
 * `every`; the bolt `warn` seconds after a warning; its burning each second for `burn.seconds` after the bolt.
 * @param {World} w @param {Content} c @param {Unit} b @param {ThunderDef} t
 */
function ballStep(w, c, b, t) {
  const s = /** @type {NonNullable<Unit['ball']>} */ (b.ball), st = (s.storm ??= { next: w.frame + secondsToFrames(t.every) });
  if (w.frame === st.next) {
    st.next += secondsToFrames(t.every);
    st.bolt = w.frame + secondsToFrames(t.warn);
    w.events.push({ type: 'thunder', id: b.id, phase: THUNDER_PHASE.warn });
  }
  if (w.frame === st.bolt) {
    delete st.bolt;
    strike(w, c, b, t);
    st.burns = { lit: w.frame, ticks: t.burn.seconds };
    w.events.push({ type: 'thunder', id: b.id, phase: THUNDER_PHASE.strike });
  }
  const f = st.burns;
  if (!f || w.frame === f.lit || (w.frame - f.lit) % secondsToFrames(1) !== 0) return;
  burn(w, c, b, t);
  if (--f.ticks > 0) return;
  delete st.burns;
  w.events.push({ type: 'thunder', id: b.id, phase: THUNDER_PHASE.over });
}

/**
 * The lightning of a 超强对流 stadium this frame (锦标-2): each ball on the field and in play, in turn.
 * @param {World} w @param {Content} c
 */
export function thunderStep(w, c) {
  const t = stadiumOf(w, c)?.thunder;
  if (!t) return;
  for (const b of w.units) if (b.ball && b.hp > 0 && !b.hidden && b.ball.goal === undefined) ballStep(w, c, b, t);
}
