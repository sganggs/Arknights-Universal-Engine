// Player commands (spec 部署-1…部署-3, 撤退-1, 守御-2, 守御-4). A command that breaks a rule is ignored, the same way on
// every peer: the server relays commands without judging them, every simulation applies the same rules.
import { KIND } from '@aue/schema';
import { tileAt, buildableFor } from './level.js';
import { makeOperator } from './units.js';
import { onDeploy, commandSkill } from './skills.js';
import { traitDeploy, traitOfDef, traitOf, gainCost } from './traits.js';
import { modeDeploy, deployTalents } from './modes.js';
import { carriedDeploy } from './carried.js';
import { cardOf, cardHidden, cardLocked, deployCost, deployLimit, withdraw, takeCuts, giveCuts, deckOf } from './deck.js';
import { occupying, summonProblem, deploySummon, supplySummons, inOwnerRange, trapRefused } from './summons.js';
import { isDown, askCost, answerCost } from './coop.js';
import { emit } from './bus.js';
import { statsOf } from './attrs.js';
import { pointForm } from './tactical.js';
import { makeBuff, addBuff } from './buffs.js';
import { restReady, poolCount, usePool } from './fortress.js';
import { nextToFacility, facilityOf } from './facilities.js';
import { talentDeploy } from './talentfx.js';
import { moreDeploy, keepsLast } from './talentmore.js';
import { shareArrive } from './talentaround.js';
import { spendBoost } from './talentfight.js';
import { lootHeld, takeLoot } from './loot.js';
import { spotAt, ballCardProblem, kickoffBall } from './pitch.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content */
/** @typedef {import('@aue/schema').Command} Command */
/** @typedef {import('@aue/schema').DeployCommand} DeployCommand */

/**
 * Whether an operator may stand on a tile (部署-1): a tile of its position or of both; a melee one whose trait allows it
 * (职业-10) also on a ranged tile, a ranged one whose trait allows it (职业-19) also on a melee tile, a summon whose
 * owner's trait allows it (职业-21) also on a ranged tile; a summon of 全部位 on either (召唤-4).
 * @param {Content} c @param {import('./types.js').OperatorDef} d @param {number} row @param {number} col
 */
export function fits(c, d, row, col) {
  const tile = tileAt(c.level, row, col), melee = buildableFor(tile, 'MELEE'), ranged = buildableFor(tile, 'RANGED');
  const t = traitOfDef(d), byOwner = !!d.summoner && Object.hasOwn(c.operators, d.summoner) && traitOfDef(c.operators[d.summoner]).summonRangedTiles;
  return d.position === 'ALL' ? melee || ranged : buildableFor(tile, d.position) || ((t.rangedTiles || byOwner) && ranged) || (t.meleeTiles && melee);
}

/**
 * Whether an operator (by content key) may stand on a tile (部署-1), for the deploy highlight (渲染-8).
 * @param {Content} c @param {string} key @param {number} row @param {number} col
 */
export const fitsTile = (c, key, row, col) => Object.hasOwn(c.operators, key) && fits(c, c.operators[key], row, col);

/** An operator record that takes no place in the deploy limit (部署-2): a free trait's. @param {import('./types.js').OperatorDef} d */
const free = (d) => traitOfDef(d).free === true;

/**
 * Why a deploy is refused, or null (spec 部署-1…部署-3, 召唤-4, 职业-14, 波次-9): a summon's by its card, an operator's by its
 * own; a card held back is not deployed.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd @returns {string | null}
 */
export function deployProblem(w, c, seat, cmd) {
  const d = Object.hasOwn(c.operators, cmd.op) ? c.operators[cmd.op] : null, p = w.players[seat];
  if (!d || !p) return 'unknown operator or seat';
  const card = cardProblem(w, c, seat, cmd, d);
  if (card) return card;
  if (isDown(p)) return 'player down';
  if (d.ballCard) return ballCardProblem(w, c, seat, cmd.row, cmd.col) ?? placeProblem(w, c, seat, cmd, d.cost);
  return d.summon ? summonProblem(w, c, seat, cmd.op) ?? limitProblem(w, c, seat, d) ?? placeProblem(w, c, seat, cmd, d.cost) ?? rangeProblem(w, c, seat, cmd)
    ?? trapProblem(w, c, seat, cmd) : operatorProblem(w, c, seat, cmd);
}

/**
 * A card not in the seat's deck — a summon's owner's (部署-1) — or held back (波次-9).
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd @param {import('./types.js').OperatorDef} d
 */
const cardProblem = (w, c, seat, cmd, d) => (c.decks && !c.decks[seat]?.includes(d.summon ? d.summoner ?? '' : cmd.op) ? 'not in the deck'
  : cardHidden(w, c, cmd.op) ? 'card held back' : null);

/**
 * A summon that may only stand in its owner's attack range (召唤-4), on a tile outside it.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd
 */
const rangeProblem = (w, c, seat, cmd) => (inOwnerRange(w, c, seat, cmd.op, cmd) ? null : 'outside the summoner\'s range');

/**
 * A summon whose owner's trait keeps it off the tiles of ground enemies (职业-14), on such a tile.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd
 */
const trapProblem = (w, c, seat, cmd) => (trapRefused(w, c, seat, cmd.op, cmd) ? 'an enemy on the tile' : null);

/**
 * An operator's own reasons (部署-2, 部署-3): on the field already, the deploy limit, redeploying, its card locked by the
 * enemy that devoured it (敌能-30), then the place's; a builder's own (守御-4).
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd
 */
function operatorProblem(w, c, seat, cmd) {
  const p = w.players[seat], d = c.operators[cmd.op];
  if (d.builder) return builderProblem(w, c, seat, cmd);
  if (d.rumble) return rumbleProblem(w, c, seat, cmd);
  if (p.deployed.includes(cmd.op)) return 'already deployed';
  return limitProblem(w, c, seat, d, cmd) ?? (w.frame < cardOf(p, cmd.op).ready ? 'redeploying' : null) ?? (cardLocked(w, cardOf(p, cmd.op)) ? 'devoured' : null) ?? ((cardOf(p, cmd.op).seal ?? 0) > w.frame ? 'sealed' : null) ?? placeProblem(w, c, seat, cmd, deployCost(c, p, cmd.op, w));
}

/**
 * 轰隆隆先生 (装置-7): a copy must be held. It takes no deploy slot when its trait is free. The cost is the record's,
 * not a redeploy penalty, and the tile is a melee one with no operator on it.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd
 */
function rumbleProblem(w, c, seat, cmd) {
  if (lootHeld(w, seat, cmd.op) <= 0) return 'no device card left';
  const d = c.operators[cmd.op];
  return limitProblem(w, c, seat, d) ?? placeProblem(w, c, seat, cmd, d.cost);
}

/**
 * The deploy limit (部署-2, 召唤-4, 符文-2): an operator that is not free, or a summon whose 部署占用数 is 1, needs a place
 * — not on a 守门位's tile (足球-13).
 * @param {World} w @param {Content} c @param {number} seat @param {import('./types.js').OperatorDef} d @param {DeployCommand} [cmd]
 */
function limitProblem(w, c, seat, d, cmd) {
  if (cmd && spotAt(w, cmd.row, cmd.col)) return null;
  const takes = d.summon ? d.summon.occupy === 1 : !free(d);
  return takes && occupying(w, c, seat, free) >= deployLimit(c, seat, w) ? 'deploy limit reached' : null;
}

/**
 * A builder's reasons (守御-4): only in a rest, while the seat holds one of its cards, next to a facility not at the
 * highest level, then the place's at its record's cost.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd
 */
function builderProblem(w, c, seat, cmd) {
  if (w.fortress?.phase !== 'rest') return 'builders only in a rest';
  if (poolCount(w, seat, cmd.op) <= 0) return 'no builder card left';
  if (!nextToFacility(w, c, cmd.row, cmd.col)) return 'not next to a facility';
  return placeProblem(w, c, seat, cmd, c.operators[cmd.op].cost);
}

/** A unit that takes its tile from operators (部署-1): an operator, or a device but a built platform (守御-5). @param {Content} c @param {import('./types.js').Unit} u */
const holdsTile = (c, u) => u.kind === KIND.OPERATOR || (u.kind === KIND.DEVICE && !(facilityOf(c, u)?.kind === 'platform' && (u.fac?.level ?? 0) > 0));

/** Whether a unit already holds a tile (部署-2). @param {World} w @param {Content} c @param {number} row @param {number} col */
export const tileTaken = (w, c, row, col) => w.units.some((u) => holdsTile(c, u) && u.x === col && u.y === row);

/**
 * The cost and the tile (部署-1, 部署-2): the cost of now, a tile the record may stand on, no operator there.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd @param {number} cost
 */
function placeProblem(w, c, seat, cmd, cost) {
  if (w.players[seat].cost < cost) return 'not enough cost';
  if (!fits(c, c.operators[cmd.op], cmd.row, cmd.col)) return 'tile not buildable for this operator';
  if (tileTaken(w, c, cmd.row, cmd.col)) return 'tile occupied';
  return null;
}

/**
 * A card that is no operator of the seat's (召唤-4, 足球-14): a summon's, or a ball card — the ball comes back on the
 * tile, the card's cost paid. Whether it was one.
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd
 */
function deployCard(w, c, seat, cmd) {
  const d = c.operators[cmd.op];
  if (d.summon) deploySummon(w, c, seat, cmd);
  else if (d.ballCard) {
    w.players[seat].cost -= d.cost;
    kickoffBall(w, c, seat, cmd.row, cmd.col);
  }
  return !!(d.summon || d.ballCard);
}

/**
 * Deploys: the cost of now (部署-3) is paid and kept on the unit, the cuts it took gone (部署-10); its trait takes hold,
 * then its passive skill starts; a seat whose deck asks for it remembers the operator as its last (职业-31).
 * @param {World} w @param {Content} c @param {number} seat @param {DeployCommand} cmd
 */
function deploy(w, c, seat, cmd) {
  if (deployProblem(w, c, seat, cmd)) return;
  if (deployCard(w, c, seat, cmd)) return;
  const p = w.players[seat], op = c.operators[cmd.op], b = op.builder, paid = b || op.rumble ? op.cost : deployCost(c, p, cmd.op, w);
  const u = makeOperator(w, c, { key: cmd.op, owner: seat, row: cmd.row, col: cmd.col, dir: cmd.dir, paid });
  p.cost -= paid;
  if (!b && !op.rumble) takeCuts(c, p, cmd.op);
  // 推击手 PUS-X: part of the cost back on a ranged tile (职业-23)
  const back = traitOf(c, u).rangedRefund;
  if (back > 0 && tileAt(c.level, cmd.row, cmd.col)?.buildable === 'RANGED') gainCost(w, c, seat, Math.floor(paid * back));
  // a builder is one of the seat's cards (守御-4): untargetable, it stays until its work is done.
  // 轰隆隆先生 is a counted card (装置-7): not in `deployed`, so another copy may stand too. Its trait buff is applied in arrive.
  if (b) { usePool(w, seat, cmd.op); addBuff(u, makeBuff({ key: 'builder', flags: { untargetable: true, noRetreat: true } })); }
  else if (op.rumble) takeLoot(w, c, seat, cmd.op, u.id);
  else p.deployed.push(cmd.op);
  w.units.push(u);
  w.events.push({ type: 'deploy', id: u.id, key: u.key, owner: seat });
  arrive(w, c, u);
  if (!b && !op.rumble && keepsLast(c, deckOf(c, seat))) p.last = cmd.op;
}

/**
 * An operator's deployment takes hold (部署-2, 部署-9): the `enter` event, its trait, its attack mode, its deployment
 * talents, its talents' SP and cost on deployments, their other effects (职业-31), the shares (职业-32) and its cuts for the deck (职业-30,
 * 部署-10) — a 移动 never a first deployment —, a carried unit's effect (装置-6), its passive skill, its summon cards, then the `deploy` event — `move`
 * for a 移动.
 * @param {World} w @param {Content} c @param {import('./types.js').Unit} u @param {boolean} [move]
 */
export function arrive(w, c, u, move = false) {
  const first = !move && !Object.hasOwn(w.players[u.owner]?.cards ?? {}, u.key);
  emit(w, 'enter', { unit: u });
  traitDeploy(w, c, u);
  modeDeploy(u, traitOf(c, u));
  deployTalents(w, c, u);
  talentDeploy(w, c, u, first);
  moreDeploy(w, c, u);
  shareArrive(w, c, u);
  if (!move) spendBoost(w, c, u);
  giveCuts(w, c, u);
  carriedDeploy(w, c, u);
  onDeploy(w, c, u);
  supplySummons(w, c, u);
  emit(w, 'deploy', { unit: u, initial: false, ...(move ? { move: true } : {}) });
}

/**
 * Retreat: a player's own operator leaves the field (spec 撤退-1) with its refund, a penalty layer and its 再部署时间 —
 * not one that cannot retreat (`noRetreat`); a tactical summon in its summon form turns into its point instead (召唤-11).
 * @param {World} w @param {Content} c @param {number} seat @param {number} unit
 */
function retreat(w, c, seat, unit) {
  const u = w.units.find((x) => x.id === unit && x.kind === KIND.OPERATOR && x.owner === seat);
  if (u && !statsOf(u).flags.noRetreat && !pointForm(w, c, u)) withdraw(w, c, u);
}

/** Applies one command of a seat. @param {World} w @param {Content} c @param {number} seat @param {Command} cmd */
export function applyCommand(w, c, seat, cmd) {
  if (cmd.type === 'deploy') deploy(w, c, seat, cmd);
  else if (cmd.type === 'skill') commandSkill(w, c, seat, cmd.unit);
  else if (cmd.type === 'ask') askCost(w, c, seat);
  else if (cmd.type === 'answer') answerCost(w, c, seat, cmd.accept === 1);
  else if (cmd.type === 'rest') restReady(w, seat);
  else retreat(w, c, seat, cmd.unit);
}
