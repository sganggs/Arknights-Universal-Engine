// The match settings (docs/spec/lockstep.md 同步-9): the level, its difficulty, the seed, every seat's deck of
// operators with their trainings (docs/spec/operators.md), and, when a mode gives them, every seat's runes
// (docs/spec/runes.md 符文-1). From the network they are untrusted: matchProblem checks them — exact fields, integers in
// range, short ids.
import { isRecord, isInt, isId, keyProblem } from './checks.js';
import { MAX_SEAT } from './protocol.js';

/** The most operators a deck holds: twelve and a support unit (同步-9, 阵地足球锦标's 「12名参赛选手+至多1名助战单位」). */
export const MAX_DECK = 13;
/** The most runes a seat carries, and the most entries of a rune's blackboard (符文-1). */
export const MAX_RUNES = 16, MAX_BOARD = 16;
/** A rune key, a blackboard key or a text value: lower-case letters, digits and _ [ ] @ . */
const RUNE_TEXT = /^[a-z0-9_[\]@.]{1,64}$/;
/** The difficulties a level is played at (关卡-2). */
export const DIFFICULTIES = Object.freeze(['NORMAL', 'FOUR_STAR']);

/** @typedef {import('./protocol.js').Build} Build @typedef {import('./protocol.js').Match} Match */

/** Each training field and its range; the module fields may be left out (no module). @type {Readonly<Record<keyof Build, [number, number]>>} */
const BUILD = Object.freeze({ elite: [0, 2], level: [1, 90], potential: [1, 6], trust: [0, 200], skill: [-1, 2], skillLevel: [1, 10], module: [-1, 2], moduleLevel: [1, 3] });
/** @type {readonly string[]} */
const OPTIONAL = Object.freeze(['module', 'moduleLevel']);

/** @param {unknown} b @returns {string | null} why a training is malformed, or null */
export function buildProblem(b) {
  if (!isRecord(b)) return 'build is not an object';
  const keys = /** @type {(keyof Build)[]} */ (Object.keys(BUILD)).filter((k) => !OPTIONAL.includes(k) || k in b);
  const why = keyProblem(b, keys);
  if (why) return why;
  const bad = keys.find((k) => !isInt(b[k], BUILD[k][0], BUILD[k][1]));
  return bad ? `build.${bad} out of range` : null;
}

/** @param {unknown} deck @returns {string | null} why a deck is malformed: at most one entry its support unit (`assist: true`) */
function deckProblem(deck) {
  if (!Array.isArray(deck) || deck.length > MAX_DECK) return `a deck is not a list of at most ${MAX_DECK}`;
  const ids = new Set();
  let assists = 0;
  for (const e of deck) {
    if (!isRecord(e)) return 'a deck entry is not an object';
    const why = keyProblem(e, 'assist' in e ? ['id', 'build', 'assist'] : ['id', 'build']) ?? (!isId(e.id) ? 'deck entry id is not an id' : null) ?? buildProblem(e.build);
    if (why) return why;
    if ('assist' in e && e.assist !== true) return 'deck entry assist is not true';
    if ('assist' in e && ++assists > 1) return 'more than one support unit in one deck';
    if (ids.has(e.id)) return `${String(e.id)} twice in one deck`;
    ids.add(e.id);
  }
  return null;
}

/** @param {unknown} b one blackboard entry: [key, number or text] */
const boardEntryOk = (b) => Array.isArray(b) && b.length === 2 && typeof b[0] === 'string' && RUNE_TEXT.test(b[0])
  && (typeof b[1] === 'string' ? RUNE_TEXT.test(b[1]) : Number.isFinite(b[1]));

/** @param {unknown} r @returns {string | null} why a seat rune is malformed (符文-1), or null */
function runeProblem(r) {
  if (!isRecord(r)) return 'a rune is not an object';
  const why = keyProblem(r, ['key', 'professions', 'board']);
  if (why) return why;
  if (typeof r.key !== 'string' || !RUNE_TEXT.test(r.key)) return 'rune.key is not a rune key';
  if (!isInt(r.professions, 0, 1023)) return 'rune.professions is not a profession mask';
  if (!Array.isArray(r.board) || r.board.length > MAX_BOARD || !r.board.every(boardEntryOk)) return 'rune.board is not a list of [key, value]';
  return null;
}

/** A match's fields, without and with the seats' runes. */
const FIELDS = Object.freeze(['level', 'difficulty', 'seed', 'decks']), WITH_RUNES = Object.freeze([...FIELDS, 'runes']);

/** @param {unknown} runes @param {number} seats @returns {string | null} why a match's runes are malformed, or null */
function runesProblem(runes, seats) {
  if (!Array.isArray(runes) || runes.length !== seats) return 'match.runes is not one list per seat';
  for (const list of runes) {
    if (!Array.isArray(list) || list.length > MAX_RUNES) return `a seat's runes are not a list of at most ${MAX_RUNES}`;
    for (const r of list) { const w = runeProblem(r); if (w) return w; }
  }
  return null;
}

/** Why a match's level, difficulty, seed or deck count is malformed, or null. @param {Record<string, unknown>} m @returns {string | null} */
function headProblem(m) {
  if (!isId(m.level)) return 'match.level is not an id';
  if (!DIFFICULTIES.includes(/** @type {string} */ (m.difficulty))) return 'match.difficulty is not NORMAL or FOUR_STAR';
  if (!isInt(m.seed, 0, 0xffffffff)) return 'match.seed is not a uint32';
  return !Array.isArray(m.decks) || m.decks.length < 1 || m.decks.length > MAX_SEAT + 1 ? 'match.decks is not one deck per seat' : null;
}

/**
 * Why a match's settings are rejected, or null when they are well formed (同步-9, 符文-1).
 * @param {unknown} m @returns {string | null}
 */
export function matchProblem(m) {
  if (!isRecord(m)) return 'match is not an object';
  const why = keyProblem(m, 'runes' in m ? WITH_RUNES : FIELDS) ?? headProblem(m);
  if (why) return why;
  for (const d of /** @type {unknown[]} */ (m.decks)) { const w = deckProblem(d); if (w) return w; }
  return 'runes' in m ? runesProblem(m.runes, /** @type {unknown[]} */ (m.decks).length) : null;
}
