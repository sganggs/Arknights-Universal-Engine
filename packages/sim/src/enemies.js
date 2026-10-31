// Enemies: each enemy's turn (帧-1): its 失衡 slide (位移-3), blocking (阻挡-1, 阻挡-3), its attack (敌人攻击-1), walking
// its route (移动-1) and reaching the goal (目标-1). They spawn by the waves (waves.js, 出怪-1).
import { KIND, ANIM } from '@aue/schema';
import { followRoute, speedOf } from './routes.js';
import { enemyAtGoal, goalSeats } from './coop.js';
import { tryBlock, keepOrRelease } from './blocking.js';
import { enemyAttack } from './combat.js';
import { foeTick, foeUnbalanceEnd, carried } from './foes.js';
import { slideStep } from './displacement.js';
import { induceStep } from './induce.js';
import { statsOf } from './attrs.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */

/**
 * An enemy at the end of its route leaves and costs lives by the co-op rules (目标-1, 合作-1…合作-3).
 * @param {World} w @param {Content} c @param {Unit} e
 */
function reachGoal(w, c, e) {
  const seats = goalSeats(c, w.players.length, c.level.routes[e.route].end);
  enemyAtGoal(w, c, e);
  e.hp = 0;
  w.events.push({ type: 'goal', id: e.id, owner: seats[0] });
}

/**
 * The turn of an enemy that does not walk (位移-3, 足球-2): one in 失衡 only slides, and when that slide ends its
 * abilities hear it (敌能-2) — unless it left the field, as a ball in a goal does (足球-5); a ball at rest stays where it
 * is: it neither walks, is blocked nor attacks.
 * @param {World} w @param {Content} c @param {Unit} e
 */
function stillTurn(w, c, e) {
  e.anim = ANIM.IDLE;
  if (!e.slide) return;
  const still = slideStep(c, e, w);
  if (!still && w.units.includes(e)) foeUnbalanceEnd(w, c, e);
}

/** An enemy's animation after its move this turn: moving when it left its place. @param {Unit} e @param {number} x0 @param {number} y0 */
const moved = (e, x0, y0) => (e.x !== x0 || e.y !== y0 ? ANIM.MOVE : ANIM.IDLE);

/**
 * One enemy's turn (帧-1): one in 失衡 only slides (位移-3), and when that slide ends its abilities hear it (敌能-2);
 * otherwise it is released if its blocker is gone or cannot block; it may be blocked; it attacks; an enemy that is not
 * blocked and did not attack walks, unless content placed it this turn (路线-5, 敌能-73), and may be blocked where it arrives.
 * @param {World} w @param {Content} c @param {Unit} e
 */
function enemyTurn(w, c, e) {
  const x0 = e.x, y0 = e.y;
  foeTick(w, c, e);
  if (e.slide || e.ball) { stillTurn(w, c, e); return; }
  keepOrRelease(w, e);
  tryBlock(w, c, e);
  const attacked = enemyAttack(w, c, e);
  if (e.blockedBy >= 0) {
    if (!attacked) e.anim = ANIM.IDLE;
    return;
  }
  if (attacked) return;
  // place() this turn is the whole move (路线-5, 敌能-73): do not also fear-walk or follow the route; held where it was, it stands
  if (e.ab['@held'] === w.frame) { e.anim = moved(e, x0, y0); return; }
  const speed = speedOf(c, e);
  if (speed === 0) { e.anim = ANIM.IDLE; return; }
  const x = e.x, y = e.y;
  const flags = statsOf(e).flags;
  if (flags.fear || flags.attract) {
    induceStep(w, c, e, speed);
    e.anim = e.x !== x || e.y !== y ? ANIM.MOVE : ANIM.IDLE;
    tryBlock(w, c, e);
    return;
  }
  if (followRoute(w, c, e, speed)) { reachGoal(w, c, e); return; }
  e.anim = e.x !== x || e.y !== y ? ANIM.MOVE : ANIM.IDLE;
  tryBlock(w, c, e);
}

/** Every enemy's turn, in creation order (帧-1); a passenger has none (敌能-16). @param {World} w @param {Content} c */
export function enemiesAct(w, c) {
  for (const e of w.units) if (e.kind === KIND.ENEMY && e.hp > 0 && !carried(e)) enemyTurn(w, c, e);
}
