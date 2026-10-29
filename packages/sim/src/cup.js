// 阵地足球锦标 (docs/spec/cup.md): a 阵地足球 level with the event's manager (锦标-1) — the players the waves name play,
// or a team of the level's type drawn (锦标-6); every player waits at a kickoff; no field bonus, so the 再部署惩罚 grows
// as anywhere; a side as many goals ahead as the level's config says wins at once; at the match time the side ahead
// wins. A draw goes to the penalty shootout where the level has one (锦标-4) — six rounds, ours first: our ball counts
// down and is kicked by what hit it; theirs a player kicks — and is no win where it has none.
import { secondsToFrames } from '@aue/math';
import { kickSlide } from './displacement.js';
import { FORCE_TO_SPEED } from './ball.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */

/** The rounds of a penalty shootout, ours and theirs in turn (锦标-4: 双方各罚3次). */
export const ROUNDS = 6;

/** Whether a level is a 阵地足球锦标 one (锦标-1): its 阵地足球 settings have the manager. @param {Content} c */
export const isCup = (c) => !!c.level.football?.cup;

/**
 * Whether an enemy key is a 阵地足球 player (足球-9): its def has `football` or `searchtarget`.
 * @param {Content} c @param {string} key
 */
export function isPlayerKey(c, key) {
  const t = c.enemies[key]?.talents;
  return !!t && (Object.hasOwn(t, 'football') || Object.hasOwn(t, 'searchtarget'));
}

/**
 * The stadium of a 锦标 match (锦标-2): the level's, or the one drawn from its stadiums; null for none.
 * @param {World} w @param {Content} c @returns {import('./types.js').Stadium | null}
 */
export function stadiumOf(w, c) {
  const cup = c.level.football?.cup;
  return cup?.stadium ?? cup?.stadiums?.[w.football?.stadium ?? -1] ?? null;
}

/**
 * The hidden groups the waves act with (波次-4, 锦标-2): the level's, and a drawn stadium's group (a fixed stadium's the
 * level already has). @param {World} w @param {Content} c @returns {readonly string[]}
 */
export function actingGroups(w, c) {
  const groups = c.level.hiddenGroups ?? [], g = c.level.football?.cup?.stadiums ? stadiumOf(w, c)?.group : undefined;
  return g && !groups.includes(g) ? [...groups, g] : groups;
}

/**
 * A kickoff in a 冻人冬日 stadium (锦标-2): every field tile (`tile_football`) is iced (足球-16).
 * @param {World} w @param {Content} c
 */
export function stadiumKickoff(w, c) {
  const ice = stadiumOf(w, c)?.ice, st = w.football;
  if (ice === undefined || !st) return;
  const m = c.level, cover = (st.cover ??= {});
  for (let r = 0; r < m.height; r++) for (let col = 0; col < m.width; col++) if (m.tiles[r][col]?.key === 'tile_football') cover[String(r * m.width + col)] = ice;
}

/** What a stadium multiplies a new enemy's move speed by (锦标-2: 冻人冬日), 1 for none. @param {World} w @param {Content} c */
export const stadiumSpeed = (w, c) => stadiumOf(w, c)?.moveMul ?? 1;

/** The first wave of the level's penalty shootout, or −1 (锦标-4). @param {Content} c */
export const penaltyStart = (c) => c.level.waves.findIndex((x) => x.penalty === true);

/** Who kicks in the penalty round under way (锦标-4): even rounds us, odd ones them; null outside a shootout. @param {World} w @returns {'ours' | 'theirs' | null} */
export const penaltySide = (w) => (w.football?.pk ? (w.football.pk.round % 2 === 0 ? 'ours' : 'theirs') : null);

/** Ends the battle (结束-1) for us (1) or not (0). @param {World} w @param {0 | 1} result */
function end(w, result) {
  w.result = result;
  w.events.push({ type: 'end', result });
}

/**
 * The wave of the next penalty round (锦标-4), noted as begun at a frame. @param {World} w @param {Content} c @param {number} at
 */
export function penaltyWave(w, c, at) {
  const pk = /** @type {NonNullable<import('./types.js').FootballState['pk']>} */ (w.football?.pk);
  Object.assign(pk, { begun: at, ball: 0, kicked: false, counted: false });
  w.events.push({ type: 'penalty', round: pk.round, goal: -1 });
  return penaltyStart(c) + pk.round;
}

/**
 * A ball's penalty countdown (锦标-4): in our round it holds what hits it until `seconds` from now. @param {World} w
 * @param {Unit} b @param {number} seconds
 */
export function startCountdown(w, b, seconds) {
  if (b.ball && penaltySide(w) === 'ours') b.ball.countdown = w.frame + secondsToFrames(seconds);
}

/**
 * Countdowns over this frame (锦标-4): the ball is kicked along all that hit it at its force when that reached its
 * threshold, else it stays. @param {World} w
 */
function countdowns(w) {
  for (const b of w.units) {
    const s = b.ball;
    if (!s || s.countdown === undefined || s.countdown > w.frame) continue;
    delete s.countdown;
    if (w.football?.pk) w.football.pk.counted = true;
    if (s.sum < s.need) continue;
    const d = Math.sqrt(s.ax * s.ax + s.ay * s.ay);
    kickSlide(b, d > 0 ? s.ax / d : 1, d > 0 ? s.ay / d : 0, s.force * FORCE_TO_SPEED);
    s.sum = 0; s.ax = 0; s.ay = 0;
  }
}

/**
 * Whether the penalty round under way is over without a goal (锦标-4): its ball was caught, or rests after a kick, or our
 * countdown ended with no kick. @param {World} w
 */
function missed(w) {
  const pk = /** @type {NonNullable<import('./types.js').FootballState['pk']>} */ (w.football?.pk);
  const b = w.units.find((u) => u.ball && (pk.ball === 0 || u.id === pk.ball));
  if (!b) return pk.ball !== 0;
  pk.ball = b.id;
  if (b.hidden) return true;
  if (b.slide) pk.kicked = true;
  return !b.slide && (pk.kicked || pk.counted);
}

/**
 * A frame's end in a penalty shootout (锦标-4): countdowns run out; a round with a goal (the field already cleared) or a
 * miss is over — a miss clears the field; the round counts for the side kicking when it was its goal —; after the sixth
 * the side with more goals in all wins, a draw is no win. @param {World} w @param {number} scored the side whose goal
 * went in this frame — 1 ours, 0 theirs (SCORE_GOAL) —, −1 for none @param {() => void} clear
 */
function penaltyStep(w, scored, clear) {
  const st = /** @type {import('./types.js').FootballState} */ (w.football), pk = /** @type {NonNullable<typeof st.pk>} */ (st.pk);
  if (pk.begun < 0) return;
  countdowns(w);
  if (scored < 0 && !missed(w)) return;
  if (scored < 0) clear();
  const goal = scored === (penaltySide(w) === 'ours' ? 1 : 0) ? 1 : 0;
  w.events.push({ type: 'penalty', round: pk.round, goal });
  pk.round += 1;
  pk.begun = -1;
  if (pk.round >= ROUNDS) end(w, st.home > st.away ? 1 : 0);
}

/**
 * A 锦标 match's end at a frame's end (锦标-1, 锦标-4): a side the level's `mercy` net goals ahead wins at once (none
 * for −1); at the match time the side ahead wins, a draw goes to the penalty shootout — the field cleared — where the
 * level has one and is no win where it has none. @param {World} w @param {Content} c @param {number} scored for which side a ball went in this frame:
 * 1 us, 0 them, −1 none @param {() => void} clear clears the field (足球-7)
 */
export function cupEnd(w, c, scored, clear) {
  const st = w.football;
  if (!st || w.result >= 0) return;
  if (st.pk) { penaltyStep(w, scored, clear); return; }
  const lead = st.home - st.away, mercy = c.level.football?.cup?.mercy ?? -1;
  if (mercy > 0 && Math.abs(lead) >= mercy) { end(w, lead > 0 ? 1 : 0); return; }
  if (w.frame + 1 < st.until) return;
  if (lead === 0 && penaltyStart(c) >= 0) {
    st.pk = { round: 0, begun: -1, ball: 0, kicked: false, counted: false };
    clear();
    return;
  }
  end(w, lead > 0 ? 1 : 0);
}
