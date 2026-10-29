// Operators an enemy takes and gives back (docs/spec/foes.md 敌能-108, 敌能-109): a 伴随兽 carries one of ours off —
// knocked down like a devoured one, its card locked and its direction kept — and puts it back on the tile it stands on,
// stunned; a 食人花 that has digested one unlocks its card, which then waits out its 再部署时间.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { knockDown } from './damage.js';
import { makeOperator } from './units.js';
import { arrive, fits, tileTaken } from './commands.js';
import { applyStatus } from './status.js';
import { respawnFactor } from './facilities.js';
import { DEFAULT_RESPAWN } from './deck.js';
import { codeOfDir } from './dir.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */

/**
 * Enemy `e` carries off unit `t` (敌能-109): an operator of ours, not a summon, that no enemy holds yet — its HP may have
 * run out this frame — is knocked down at the frame's end, its card locked by `e` (敌能-30) with its direction kept.
 * Whether it was. @param {Content} c @param {Unit} e @param {Unit} t
 */
export function carryOff(c, e, t) {
  if (t.kind !== KIND.OPERATOR || c.operators[t.key]?.summon || t.ab['@devoured'] !== undefined) return false;
  t.ab['@devoured'] = e.id;
  t.ab['@carried'] = 1;
  if (t.hp > 0) knockDown(t);
  return true;
}

/** The card an enemy locked, with its seat and key, or null (敌能-30). @param {World} w @param {Unit} e */
function lockedBy(w, e) {
  for (const [seat, p] of w.players.entries()) {
    for (const [key, card] of Object.entries(p.cards)) if (card.lock === e.id) return { seat, key, card };
  }
  return null;
}

/**
 * Enemy `e` puts back the operator it carries (敌能-109): on the tile it stands on, facing as it did, when that tile may
 * hold it — deployed at no cost, then stunned `seconds`; otherwise its card is only unlocked. Whether it was put back.
 * @param {World} w @param {Content} c @param {Unit} e @param {number} seconds
 */
export function putBack(w, c, e, seconds) {
  const held = lockedBy(w, e);
  if (!held || held.card.facing === undefined) return false;
  const { seat, key, card } = held, facing = codeOfDir(card.facing), row = Math.round(e.y), col = Math.round(e.x);
  delete card.lock;
  delete card.facing;
  if (!fits(c, c.operators[key], row, col) || tileTaken(w, c, row, col)) return false;
  const u = makeOperator(w, c, { key, owner: seat, row, col, dir: facing, paid: 0 });
  w.players[seat].deployed.push(key);
  w.units.push(u);
  w.events.push({ type: 'deploy', id: u.id, key, owner: seat });
  arrive(w, c, u);
  applyStatus(u, 'stun', { seconds });
  return true;
}

/**
 * Enemy `e` lets go of the card it locked (敌能-108): unlocked, and — `wait` — its 再部署时间 starts now.
 * @param {World} w @param {Content} c @param {Unit} e @param {boolean} wait
 */
export function unlock(w, c, e, wait) {
  const held = lockedBy(w, e);
  if (!held) return;
  delete held.card.lock;
  delete held.card.facing;
  if (wait) held.card.ready = w.frame + secondsToFrames((c.operators[held.key].respawnTime ?? DEFAULT_RESPAWN) * respawnFactor(w, c));
}
