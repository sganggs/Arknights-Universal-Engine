// What an enemy locks on our side's terminal (docs/spec/foes.md 敌能-110): the natural regeneration of every player's
// cost, for a while (费用-1), and a card in a player's 待部署区, sealed so that it may not be deployed (部署-3).
import { secondsToFrames } from '@aue/math';
import { cardOf, deckOf, deployCost } from './deck.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content */

/**
 * Every player's cost stops regenerating for `seconds` (敌能-110, 费用-1): its timer held at 0, so that the next point
 * comes at once when the lock ends. @param {World} w @param {number} seconds
 */
export function lockCost(w, seconds) {
  const until = w.frame + secondsToFrames(seconds);
  for (const p of w.players) {
    p.costLock = Math.max(p.costLock ?? 0, until);
    p.costTimer = 0;
  }
}

/** Whether a player's cost regeneration is locked now (敌能-110). @param {World} w @param {import('./types.js').Player} p */
export const costLocked = (w, p) => (p.costLock ?? 0) > w.frame;

/**
 * Seals one card in each player's 待部署区 for `seconds` (敌能-110, 部署-3): of the operators of its deck not on the
 * field, not sealed and not waiting their 再部署时间, the one of the highest deployment cost now, the last in the deck's
 * order among those. @param {World} w @param {Content} c @param {number} seconds
 */
export function sealCard(w, c, seconds) {
  const until = w.frame + secondsToFrames(seconds);
  w.players.forEach((p, seat) => {
    let best = null, most = -Infinity;
    for (const key of deckOf(c, seat)) {
      const d = c.operators[key], card = cardOf(p, key);
      if (!d || d.summon || p.deployed.includes(key) || (card.seal ?? 0) > w.frame || card.ready > w.frame) continue;
      const cost = deployCost(c, p, key, w);
      if (cost >= most) { most = cost; best = key; }
    }
    if (best) p.cards[best] = { ...cardOf(p, best), seal: until };
  });
}
