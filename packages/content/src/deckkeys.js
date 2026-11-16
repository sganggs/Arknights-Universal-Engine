// The content keys of a match's units (docs/spec/lockstep.md 同步-9): "id#seat" for an operator of a seat's deck and
// "summon id#seat" for its summons. A mode that lets a deck hold copies of one operator gives the n-th copy (n from 2,
// in deck order) "id#seat#n", and its summons the same ending, so every copy is its own card and unit.

/** A deck key: the unit id, the seat and, from the second copy on, "#n". */
const DECK_KEY = /^[^#]+#(\d+)((?:#\d+)?)$/;

/**
 * The content keys of a seat's deck, in deck order (同步-9): an id's first entry "id#seat", its n-th "id#seat#n".
 * @param {readonly string[]} ids @param {number} seat @returns {string[]}
 */
export function deckKeys(ids, seat) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  return ids.map((id) => {
    const n = (seen.get(id) ?? 0) + 1;
    seen.set(id, n);
    return n === 1 ? `${id}#${seat}` : `${id}#${seat}#${n}`;
  });
}

/** The seat of a deck's key (a summon's, a card's too), or −1 for another key (a predefined operator's "alias#pre"). @param {string} key */
export function seatOfKey(key) {
  const m = DECK_KEY.exec(key);
  return m ? Number(m[1]) : -1;
}

/**
 * A summon's key for its owner's (召唤-2): the summon id with the owner's seat and copy; null for an owner without a
 * deck key. @param {string} token @param {string} owner @returns {string | null}
 */
export function summonKey(token, owner) {
  const m = DECK_KEY.exec(owner);
  return m ? `${token}#${m[1]}${m[2]}` : null;
}
