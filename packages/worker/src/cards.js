// What the battle UI shows of a player's deck (界面-10, 界面-23): each operator card's cost now, the frame it may be
// deployed again from and whether it is locked, how many more operators it may deploy, and each summon card — its cost, when it may be deployed,
// the copies held, whether its owner is on the field to deploy it from and whether as many are on the field as may be.
import { KIND, deck, traits, summons } from '@aue/sim';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Content} Content */
/**
 * A summon card as the UI reads it (界面-23): cost, ready frame, copies held, copies cooling (队列), whether it is shown —
 * its owner on the field and a copy held, cooling or, under 唯一, its one —, as many on the field as may be, whether it
 * takes a deploy place.
 * @typedef {{ cost: number, ready: number, held: number, cooling: number, shown: boolean, full: boolean, occupy: boolean }} SummonStatus
 */

/** An operator record that takes no place in the deploy limit (部署-2). @param {import('@aue/sim').OperatorDef} d */
const free = (d) => traits.traitOfDef(d).free === true;

/**
 * A seat's operator cards — cost, the frame each may be deployed again from, whether it is locked by the enemy that
 * devoured its operator (敌能-30) — and the deploy places left (部署-2, 部署-3, 召唤-4).
 * @param {World} w @param {Content} c @param {number} seat
 */
export function operatorCards(w, c, seat) {
  const p = w.players[seat];
  return {
    slots: deck.deployLimit(c, seat, w) - summons.occupying(w, c, seat, free),
    cards: Object.fromEntries((c.decks?.[seat] ?? []).map((k) => [k, { cost: deck.deployCost(c, p, k, w), ready: deck.cardOf(p, k).ready, locked: deck.cardLocked(w, deck.cardOf(p, k)) }])),
    // a ball card shows only while the seat holds a caught ball (足球-14)
    hidden: (c.decks?.[seat] ?? []).filter((k) => deck.cardHidden(w, c, k) || (c.operators[k]?.ballCard && !p.balls?.length)),
  };
}

/**
 * A seat's summon cards (召唤-4, 界面-23): one for each summon with a card of an operator in its deck.
 * @param {World} w @param {Content} c @param {number} seat @returns {Record<string, SummonStatus>}
 */
export function summonCards(w, c, seat) {
  const mine = new Set(c.decks?.[seat] ?? Object.keys(c.operators)), p = w.players[seat];
  /** @type {Record<string, SummonStatus>} */
  const out = {};
  for (const [key, d] of Object.entries(c.operators)) {
    const s = d.summon;
    if (!s || !summons.hasCard(s) || !mine.has(d.summoner ?? '')) continue;
    const card = summons.summonCardOf(p, key), there = w.units.filter((u) => u.kind === KIND.OPERATOR && u.owner === seat && u.key === key && u.hp > 0).length;
    const open = summons.summonerOf(w, c, seat, key) !== null, unique = s.respawn === 'unique';
    out[key] = { cost: d.cost, ready: card.ready, held: card.held, cooling: card.cooling, shown: open && (card.held > 0 || card.cooling > 0 || unique),
      full: there >= s.deployLimit || (unique && there > 0), occupy: s.occupy === 1 };
  }
  return out;
}
