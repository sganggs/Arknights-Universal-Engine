// The network messages, version 11 (ADR 0053; version 2 adds the skill command, version 3 the cost request and its answer,
// and the speed and pause controls, version 4 the match settings in the welcome, version 5 the content hash in it,
// version 6 the ready message: the page has loaded the battle, version 7 the replay in the welcome and the resync, version 8 the seats' runes
// in the match settings, version 9 the signals between seats: 同步-13, version 10 the 「休整完毕」 command: 守御-2,
// version 11 the arbiter's player count in the welcome: 同步-5). Messages from browsers are untrusted: the server accepts one only when
// clientMessageProblem returns null — exact fields, integers in range, short ids, nothing else.
import { isRecord, isInt, isId, keyProblem } from './checks.js';
import { matchProblem } from './match.js';

export const PROTOCOL_VERSION = 12;

/** Largest frame number (about 9.5 hours at 30 frames per second). */
export const MAX_FRAME = 1_000_000;
/** Largest seat index. */
export const MAX_SEAT = 7;

/** @typedef {{ type: 'deploy', op: string, row: number, col: number, dir: number }} DeployCommand */
/** @typedef {{ type: 'retreat', unit: number }} RetreatCommand */
/** @typedef {{ type: 'skill', unit: number }} SkillCommand */
/** @typedef {{ type: 'ask' }} AskCommand */
/** @typedef {{ type: 'answer', accept: number }} AnswerCommand */
/** @typedef {{ type: 'rest' }} RestCommand */
/** @typedef {DeployCommand | RetreatCommand | SkillCommand | AskCommand | AnswerCommand | RestCommand} Command */

/** @type {Record<string, (c: Record<string, unknown>) => string | null>} */
const COMMANDS = {
  deploy: (c) => keyProblem(c, ['type', 'op', 'row', 'col', 'dir'])
    ?? (!isId(c.op) ? 'deploy.op is not an id' : null)
    ?? (!isInt(c.row, 0, 63) || !isInt(c.col, 0, 63) ? 'deploy tile out of range' : null)
    ?? (!isInt(c.dir, 0, 3) ? 'deploy.dir is not 0–3' : null),
  retreat: (c) => keyProblem(c, ['type', 'unit']) ?? (!isInt(c.unit, 1, 0x7fffffff) ? 'retreat.unit is not a unit id' : null),
  skill: (c) => keyProblem(c, ['type', 'unit']) ?? (!isInt(c.unit, 1, 0x7fffffff) ? 'skill.unit is not a unit id' : null),
  ask: (c) => keyProblem(c, ['type']),
  answer: (c) => keyProblem(c, ['type', 'accept']) ?? (!isInt(c.accept, 0, 1) ? 'answer.accept is not 0 or 1' : null),
  rest: (c) => keyProblem(c, ['type']),
};

/** Most fields a signal has besides its kind (同步-13). */
export const SIGNAL_FIELDS = 5;
/** Largest number a signal field holds. */
export const SIGNAL_MAX = 9999;

/**
 * Why a signal (同步-13) is malformed, or null: its kind a short id, at most SIGNAL_FIELDS more fields, each a whole
 * number from 0 to SIGNAL_MAX or a short id.
 * @param {unknown} s @returns {string | null}
 */
export function signalProblem(s) {
  if (!isRecord(s)) return 'signal is not an object';
  if (!isId(s.kind)) return 'signal.kind is not an id';
  const rest = Object.keys(s).filter((k) => k !== 'kind');
  if (rest.length > SIGNAL_FIELDS) return `a signal has at most ${SIGNAL_FIELDS} fields besides its kind`;
  for (const k of rest) if (!/^[a-z][a-zA-Z0-9]{0,15}$/.test(k) || !(isInt(s[k], 0, SIGNAL_MAX) || isId(s[k]))) return `signal.${k.slice(0, 16)} is malformed`;
  return null;
}

/** @param {unknown} c @returns {string | null} why the command is malformed, or null */
export function commandProblem(c) {
  if (!isRecord(c)) return 'command is not an object';
  const check = typeof c.type === 'string' && Object.hasOwn(COMMANDS, c.type) ? COMMANDS[c.type] : null;
  return check ? check(c) : `unknown command type ${String(c.type)}`;
}

/** @type {Record<string, (m: Record<string, unknown>) => string | null>} */
const CLIENT = {
  hello: (m) => keyProblem(m, ['t', 'v', 'seat', 'key', 'since'])
    ?? (m.v !== PROTOCOL_VERSION ? `protocol version ${String(m.v)}, expected ${PROTOCOL_VERSION}` : null)
    ?? (!isInt(m.seat, 0, MAX_SEAT) ? 'hello.seat out of range' : null)
    ?? (!isId(m.key) ? 'hello.key is not an id' : null)
    ?? (!isInt(m.since, -1, MAX_FRAME) ? 'hello.since out of range' : null),
  cmd: (m) => keyProblem(m, ['t', 'at', 'cmd']) ?? (!isInt(m.at, 0, MAX_FRAME) ? 'cmd.at out of range' : null) ?? commandProblem(m.cmd),
  hash: (m) => keyProblem(m, ['t', 'frame', 'hash'])
    ?? (!isInt(m.frame, 0, MAX_FRAME) ? 'hash.frame out of range' : null)
    ?? (!isInt(m.hash, 0, 0xffffffff) ? 'hash.hash is not a uint32' : null),
  speed: (m) => keyProblem(m, ['t', 'on']) ?? (!isInt(m.on, 0, 1) ? 'speed.on is not 0 or 1' : null),
  pause: (m) => keyProblem(m, ['t']),
  pauseReply: (m) => keyProblem(m, ['t', 'accept']) ?? (!isInt(m.accept, 0, 1) ? 'pauseReply.accept is not 0 or 1' : null),
  resume: (m) => keyProblem(m, ['t']),
  ready: (m) => keyProblem(m, ['t']),
  signal: (m) => keyProblem(m, ['t', 's']) ?? signalProblem(m.s),
};

/**
 * Why a message from a browser is rejected, or null when it is well formed.
 * @param {unknown} m the parsed JSON @returns {string | null}
 */
export function clientMessageProblem(m) {
  if (!isRecord(m)) return 'message is not an object';
  const check = typeof m.t === 'string' && Object.hasOwn(CLIENT, m.t) ? CLIENT[m.t] : null;
  return check ? check(m) : `unknown message type ${String(m.t)}`;
}

/** @param {unknown} cmds @returns {string | null} */
function sealedCommandsProblem(cmds) {
  if (!Array.isArray(cmds)) return 'sealed commands are not an array';
  for (const c of cmds) {
    if (!Array.isArray(c) || c.length !== 3 || !isInt(c[0], 0, MAX_FRAME) || !isInt(c[1], 0, MAX_SEAT)) return 'frames.cmds has a malformed entry';
    const why = commandProblem(c[2]);
    if (why) return why;
  }
  return null;
}

/** @type {Record<string, (m: Record<string, unknown>) => string | null>} */
const SERVER = {
  welcome: (m) => keyProblem(m, ['t', 'v', 'seat', 'seats', 'seed', 'frame', 'snapshot', 'match', 'content', 'replay'])
    ?? (m.v !== PROTOCOL_VERSION ? `protocol version ${String(m.v)}, expected ${PROTOCOL_VERSION}` : null)
    ?? (!isInt(m.seats, 1, MAX_SEAT + 1) || !isInt(m.seat, 0, /** @type {number} */ (m.seats) - 1) || !isInt(m.frame, -1, MAX_FRAME) || !Number.isSafeInteger(m.seed) || !isInt(m.content, 0, 0xffffffff) ? 'welcome fields out of range' : null)
    ?? (m.match === null ? null : matchProblem(m.match))
    ?? (m.replay === null ? null : sealedCommandsProblem(m.replay)),
  frames: (m) => keyProblem(m, ['t', 'from', 'to', 'cmds'])
    ?? (!isInt(m.from, 0, MAX_FRAME) || !isInt(m.to, 0, MAX_FRAME) || /** @type {number} */ (m.to) < /** @type {number} */ (m.from) ? 'frames range malformed' : null)
    ?? sealedCommandsProblem(m.cmds),
  restamp: (m) => keyProblem(m, ['t', 'from', 'to']) ?? (!isInt(m.from, 0, MAX_FRAME) || !isInt(m.to, 0, MAX_FRAME) ? 'restamp out of range' : null),
  resync: (m) => keyProblem(m, ['t', 'snapshot', 'frame', 'replay']) ?? (!isInt(m.frame, -1, MAX_FRAME) ? 'resync.frame out of range' : null)
    ?? (m.replay === null ? null : sealedCommandsProblem(m.replay)),
  error: (m) => keyProblem(m, ['t', 'code', 'message']) ?? (typeof m.code !== 'string' || typeof m.message !== 'string' ? 'error fields are not strings' : null),
  signal: (m) => keyProblem(m, ['t', 'seat', 's']) ?? (!isInt(m.seat, 0, MAX_SEAT) ? 'signal.seat out of range' : null) ?? signalProblem(m.s),
  control: (m) => keyProblem(m, ['t', 'fast', 'held', 'asker', 'resuming'])
    ?? (!Array.isArray(m.fast) || m.fast.length > MAX_SEAT + 1 || !m.fast.every((f) => isInt(f, 0, 1)) ? 'control.fast is not a list of 0 and 1' : null)
    ?? (!isInt(m.held, 0, 1) || !isInt(m.asker, -1, MAX_SEAT) || !isInt(m.resuming, 0, 1) ? 'control fields out of range' : null),
};

/**
 * Why a message from the server is rejected, or null. Clients check it too: a broken or hostile host must not crash
 * a page. Snapshots are checked when they are restored (snapshotProblem).
 * @param {unknown} m the parsed JSON @returns {string | null}
 */
export function serverMessageProblem(m) {
  if (!isRecord(m)) return 'message is not an object';
  const check = typeof m.t === 'string' && Object.hasOwn(SERVER, m.t) ? SERVER[m.t] : null;
  return check ? check(m) : `unknown message type ${String(m.t)}`;
}

/** @typedef {{ t: 'hello', v: number, seat: number, key: string, since: number }} HelloMessage */
/** @typedef {{ t: 'cmd', at: number, cmd: Command }} CommandMessage */
/** @typedef {{ t: 'hash', frame: number, hash: number }} HashMessage */
/** @typedef {{ t: 'speed', on: number }} SpeedMessage */
/** @typedef {{ t: 'pause' }} PauseMessage */
/** @typedef {{ t: 'pauseReply', accept: number }} PauseReplyMessage */
/** @typedef {{ t: 'resume' }} ResumeMessage */
/** The page has loaded the battle (同步-11). @typedef {{ t: 'ready' }} ReadyMessage */
/** A signal between seats (同步-13): its kind and a few small fields. @typedef {{ kind: string, [field: string]: string | number }} Signal */
/** @typedef {{ t: 'signal', s: Signal }} SignalMessage */
/** @typedef {HelloMessage | CommandMessage | HashMessage | SpeedMessage | PauseMessage | PauseReplyMessage | ResumeMessage | ReadyMessage | SignalMessage} ClientMessage */

/**
 * A training (干员-1, 干员-2, 干员-7); without the module fields, no module.
 * @typedef {{ elite: number, level: number, potential: number, trust: number, skill: number, skillLevel: number, module?: number, moduleLevel?: number }} Build
 */
/** A deck's operator: its id, its training, and whether it is the seat's support unit (同步-9). @typedef {{ id: string, build: Build, assist?: true }} DeckEntry */
/** A seat rune (符文-1): its key, the professions it applies to (a bit mask), its blackboard. @typedef {{ key: string, professions: number, board: [string, number | string][] }} SeatRune */
/** The match settings (同步-9; match.js checks them). @typedef {{ level: string, difficulty: 'NORMAL' | 'FOUR_STAR', seed: number, decks: DeckEntry[][], runes?: SeatRune[][] }} Match */
/**
 * The welcome: the seat and total seats, the seed, the last sealed frame, the arbiter's snapshot — or, for content with a world setup,
 * every sealed command from frame 0 to replay (同步-5) —, and the match settings (同步-9; null when both sides know the
 * content otherwise).
 * @typedef {{ t: 'welcome', v: number, seat: number, seats: number, seed: number, frame: number, snapshot: object | null, match: Match | null, content: number,
 *   replay: [number, number, Command][] | null }} WelcomeMessage
 */
/** @typedef {{ t: 'frames', from: number, to: number, cmds: [number, number, Command][] }} FramesMessage */
/** @typedef {{ t: 'restamp', from: number, to: number }} RestampMessage */
/** The arbiter's state after a desync (同步-5): its snapshot, or the commands to replay up to `frame`. @typedef {{ t: 'resync', snapshot: object | null, frame: number, replay: [number, number, Command][] | null }} ResyncMessage */
/** @typedef {{ t: 'error', code: string, message: string }} ErrorMessage */
/**
 * Every seat's 2× switch; whether the battle is paused; the seat asking to pause (−1 for none); whether a resume is
 * counting down.
 * @typedef {{ t: 'control', fast: number[], held: number, asker: number, resuming: number }} ControlMessage
 */
/** A seat's signal, passed on to every connected seat (同步-13). @typedef {{ t: 'signal', seat: number, s: Signal }} SeatSignalMessage */
/** @typedef {WelcomeMessage | FramesMessage | RestampMessage | ResyncMessage | ErrorMessage | ControlMessage | SeatSignalMessage} ServerMessage */
