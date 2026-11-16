// An operator's 移动 (docs/spec/field.md 部署-9): a deployed operator stands on another tile at once — as the official
// term has it, a retreat and a deployment in one: on a tile it may not take it is retreated instead; otherwise nothing
// of it carries over but its HP ratio (a fresh deployment of the same unit: no buff, no skill state, no SP, its
// deployment effects again, no redeploy penalty) — or, for content that says so, it keeps its buffs, skill and HP.
import { KIND } from '@aue/schema';
import { tileAt } from './level.js';
import { statsOf } from './attrs.js';
import { makeOperator } from './units.js';
import { fits, arrive } from './commands.js';
import { withdraw } from './deck.js';
import { releaseAll } from './blocking.js';
import { displace } from './routes.js';
import { dealDamage } from './damage.js';
import { setSp } from './sp.js';
import { codeOfDir } from './dir.js';
import { tileOf } from './body.js';
import { endSkill } from './skills.js';
import { emit } from './bus.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */

/**
 * Whether an operator may move onto (row, col) (部署-9): a tile its record may stand on (部署-1) with no other operator.
 * @param {World} w @param {Content} c @param {Unit} op @param {number} row @param {number} col
 */
export function canMoveTo(w, c, op, row, col) {
  return fits(c, c.operators[op.key], row, col) && !w.units.some((u) => u !== op && u.kind === KIND.OPERATOR && tileOf(u)[0] === row && tileOf(u)[1] === col);
}

/**
 * An operator's 移动 onto (row, col) (部署-9). A tile it may not take: it is retreated (撤退-1) and false. Otherwise it
 * lets go of the enemies it blocks and stands there: with `keep` its buffs, skill and HP stay and only the `deploy`
 * event (`move`) follows; without, the same unit is deployed afresh there — no buff or skill state carried, its
 * deployment effects again (部署-2) — and then loses HP (生命流失) down to its ratio before. Returns the unit standing
 * there, or false. A skill it was running ends first (`move`).
 * @param {World} w @param {Content} c @param {Unit} op @param {{ row: number, col: number }} to @param {{ keep?: boolean }} [o]
 * @returns {Unit | false}
 */
export function moveOperator(w, c, op, to, o = {}) {
  if (op.kind !== KIND.OPERATOR || op.hp <= 0 || !w.units.includes(op)) return false;
  if (!canMoveTo(w, c, op, to.row, to.col)) { withdraw(w, c, op); return false; }
  releaseAll(w, op.id);
  if (o.keep) {
    displace(op, to.col, to.row);
    op.z = tileAt(c.level, to.row, to.col)?.height === 'HIGHLAND' ? 1 : 0;
    op.born = w.frame;
    op.swing = null;
    emit(w, 'deploy', { unit: op, initial: false, move: true });
    return op;
  }
  if (op.skill?.active) endSkill(w, c, op, 'move');
  const ratio = op.hp / Math.max(1, statsOf(op).maxHp);
  const u = makeOperator(w, c, { key: op.key, owner: op.owner, row: to.row, col: to.col, dir: codeOfDir(op.dir), paid: op.paid, id: op.id });
  w.units[w.units.indexOf(op)] = u;
  if (u.skill) setSp(u.skill, 0);
  arrive(w, c, u, true);
  const lose = u.hp - ratio * statsOf(u).maxHp;
  if (lose > 0) dealDamage(w, null, u, { type: 'true', amount: lose, hpLoss: true, tags: ['move'] });
  return u;
}
