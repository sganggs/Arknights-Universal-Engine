// 阵地足球's pitch (docs/spec/football.md 足球-13, 足球-14): a 守门位 is a marker in front of our goal that gives one of
// ours standing on its tile its block and takes it out of the deploy limit; a ball such a goalkeeper stops leaves the
// field as a card of the goalkeeper's seat, to be deployed on our half within its seconds — the ball comes back there at
// rest —, and a card not deployed in time puts the ball back where it was caught.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { addBuff, makeBuff, removeBuff } from './buffs.js';
import { board, alight } from './routes.js';
import { tileAt } from './level.js';
import { PREDEFINED } from './constants.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */

/** The buff of one of ours standing on a 守门位 (足球-13). */
export const KEEPER = 'keeper';

/** Seconds a caught ball's card may be deployed in (足球-14). */
export const CATCH_SECONDS = 5;

/** What a 守门位 is (足球-13): 无敌, not selected, not blocked, 束缚, it does not attack, 浮空 does not take. */
const SPOT_FLAGS = Object.freeze({ invincible: true, untargetable: true, unblockable: true, root: true, noAttack: true, 'immune:levitate': true });

/**
 * Makes an enemy a 守门位 (足球-13): the block it gives, and the buff of what it is.
 * @param {Unit} u @param {number} block
 */
export function makeSpot(u, block) {
  u.spot = { block };
  addBuff(u, makeBuff({ key: 'spot', src: u.id, flags: { ...SPOT_FLAGS } }));
}

/** The 守门位 on a tile, or null (足球-13). @param {World} w @param {number} row @param {number} col */
export const spotAt = (w, row, col) => w.units.find((u) => u.spot && u.hp > 0 && !u.hidden && Math.round(u.x) === col && Math.round(u.y) === row) ?? null;

/**
 * Whether a goal tile is open (足球-15): the tile in front of it — toward the field's middle — has no device that
 * blocks routes (阵地屏障) and is no 守门位 with a goalkeeper on it.
 * @param {World} w @param {Content} c @param {{ x: number, y: number }} g
 */
export function goalOpen(w, c, g) {
  const col = g.x + (g.x < c.level.width / 2 ? 1 : -1), row = g.y, at = (/** @type {Unit} */ u) => u.hp > 0 && !u.hidden && Math.round(u.x) === col && Math.round(u.y) === row;
  if (w.units.some((u) => u.kind === KIND.DEVICE && at(u) && c.devices?.[u.key]?.routeBlock)) return false;
  return !(spotAt(w, row, col) && w.units.some((u) => at(u) && isKeeper(u)));
}

/** Whether a unit is one of ours a 守门位 works on (足球-13): an operator or a device of ours on the field. @param {Unit} u */
const ours = (u) => u.hp > 0 && !u.hidden && (u.kind === KIND.OPERATOR || (u.kind === KIND.DEVICE && u.base.hostile !== true));

/** Whether a unit stands on a 守门位 as its goalkeeper (足球-13). @param {Unit} u */
export const isKeeper = (u) => u.buffs.some((b) => b.key === KEEPER);

/**
 * The goalkeepers of this frame (足球-13): each of ours on a 守门位's tile has its buff — block + the spot's — whatever
 * else it is under; one that left the tile, or whose spot left, loses it.
 * @param {World} w
 */
export function goalkeepers(w) {
  if (!w.football) return;
  for (const u of w.units) {
    if (!ours(u)) continue;
    const s = spotAt(w, Math.round(u.y), Math.round(u.x)), had = u.buffs.find((b) => b.key === KEEPER);
    if (had && had.src === s?.id) continue;
    if (had) removeBuff(u, had);
    if (s?.spot) addBuff(u, makeBuff({ key: KEEPER, src: s.id, mods: { blockCnt: s.spot.block }, flags: { keeper: true } }));
  }
}

/**
 * A goalkeeper stops a ball (足球-14): the ball leaves the field — hidden where it is, nothing touching it — and the
 * goalkeeper's seat holds it until the card's time is up, with the tile it was caught on; a predefined operator's
 * catch (波次-7, the level's own) is the first seat's. In a 锦标 penalty shootout no seat holds it (锦标-4).
 * @param {World} w @param {Unit} b @param {Unit} by
 */
export function catchBall(w, b, by) {
  const p = w.players[by.key.endsWith(PREDEFINED) ? 0 : by.owner];
  if (!p || !b.ball) return;
  board(b);
  b.ball.touch = [];
  // a 锦标 penalty: the ball caught is the round's end, no card (锦标-4)
  if (w.football?.pk) return;
  (p.balls ??= []).push({ id: b.id, until: w.frame + secondsToFrames(CATCH_SECONDS), row: Math.round(by.y), col: Math.round(by.x) });
}

/** The ball a seat holds first, still in the world, or null (足球-14). @param {World} w @param {number} seat */
function heldBall(w, seat) {
  const h = w.players[seat]?.balls?.[0];
  return h ? w.units.find((u) => u.id === h.id && u.ball) ?? null : null;
}

/**
 * Why a ball card is not deployed (足球-14): the seat holds no ball, or the tile is not on our half (a `landball`
 * tile); null otherwise. @param {World} w @param {Content} c @param {number} seat @param {number} row @param {number} col
 */
export function ballCardProblem(w, c, seat, row, col) {
  if (!heldBall(w, seat)) return 'no ball held';
  return tileAt(c.level, row, col)?.landball ? null : 'not on our half';
}

/**
 * A held ball comes back (足球-14): at the centre of a tile, at rest; the seat holds it no more.
 * @param {World} w @param {Content} c @param {number} seat @param {number} row @param {number} col
 */
export function kickoffBall(w, c, seat, row, col) {
  const p = w.players[seat], b = heldBall(w, seat);
  p.balls?.shift();
  if (p.balls?.length === 0) delete p.balls;
  if (b) alight(c, b, { x: col, y: row });
}

/**
 * Cards not deployed in time (足球-14): at its last frame the ball comes back on the tile it was caught on.
 * @param {World} w @param {Content} c
 */
export function expireBalls(w, c) {
  w.players.forEach((p, seat) => {
    while (p.balls && p.balls.length > 0 && p.balls[0].until <= w.frame) {
      const { row, col } = p.balls[0];
      kickoffBall(w, c, seat, row, col);
    }
  });
}
