// The deck (待部署区, docs/spec/field.md 部署-3, 撤退-1): each operator's card holds its 再部署惩罚 and when it may be
// deployed again; the deploy cost the penalty raises; what leaving the field does — the refund of a retreat, a
// penalty layer and the 再部署时间 for a retreat or a fall alike; an operator devoured (吞噬, docs/spec/foes.md 敌能-30)
// is locked in the deck while its devourer is on the field, with no 再部署时间.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { knockDown } from './damage.js';
import { traitOfDef, gainCost } from './traits.js';
import { releaseAll } from './blocking.js';
import { emit } from './bus.js';
import { summonLeft, dismissSummons } from './summons.js';
import { facilitySum, respawnFactor } from './facilities.js';
import { foeLeave } from './talentfoe.js';
import { noteExit } from './exits.js';
import { shareLeave } from './talentaround.js';
import { firstBlockLeave } from './talentfight.js';
import { dropRumble } from './loot.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Player} Player @typedef {import('./types.js').Card} Card */

/** The most 再部署惩罚 layers a card holds (部署-3). */
export const MAX_PENALTY = 2;
/** The 再部署时间 of an operator whose record gives none, in seconds (部署-3). */
export const DEFAULT_RESPAWN = 60;

/** A player's card for an operator: the one recorded, or a fresh one (no penalty, deployable at once). @param {Player} p @param {string} key @returns {Card} */
export const cardOf = (p, key) => (Object.hasOwn(p.cards, key) ? p.cards[key] : { penalty: 0, ready: 0 });

/** Whether a card is locked (敌能-30): the enemy that devoured its operator is on the field. @param {World} w @param {Card} card */
export const cardLocked = (w, card) => card.lock !== undefined && w.units.some((u) => u.id === card.lock && u.hp > 0);

/**
 * Enemy `e` devours unit `t` (敌能-30): an operator or summon of ours with HP is knocked down at the frame's end (伤害-9),
 * nothing keeping it on the field; whether it was.
 * @param {Unit} e @param {Unit} t
 */
export function devour(e, t) {
  if (t.kind !== KIND.OPERATOR || t.hp <= 0) return false;
  t.ab['@devoured'] = e.id;
  knockDown(t);
  return true;
}

/**
 * Whether a deck card is held back (波次-9): its unit is one of the level's cards hidden at first (关卡-7) — a token's or
 * an operator's — and that card's alias has not come into effect (波次-6). @param {World} w @param {Content} c @param {string} key the card (unit id#seat)
 */
export function cardHidden(w, c, key) {
  const id = key.split('#')[0], cards = c.level.cards;
  const t = cards?.tokens.find((x) => x.key === id && x.hidden) ?? cards?.operators?.find((x) => x.key === id && x.hidden);
  return t?.alias !== undefined && !w.predefined.includes(t.alias);
}

/**
 * A seat's deploy limit (部署-2): the level's, changed by the seat's runes (符文-2), the built 临时休息舱 (守御-5) and, in
 * a 锦标 penalty shootout, the level's `kickerDelta` (锦标-4), not below 0. @param {Content} c @param {number} seat @param {World} [w]
 */
export const deployLimit = (c, seat, w) => Math.max(0, c.level.options.characterLimit + (c.level.options.characterLimitAdd?.[seat] ?? 0)
  + (w ? facilitySum(w, c, 'lounge', 'value_char') : 0) + (w?.football?.pk ? c.level.football?.cup?.kickerDelta ?? 0 : 0));

/** Whether a cut is for an operator record (部署-10): of its profession or one of its factions. @param {{ profession: string } | { power: string }} x @param {import('./types.js').OperatorDef} d */
const cutFits = (x, d) => ('profession' in x ? d.profession === x.profession : (d.powers ?? []).includes(x.power));

/** Whether a player has deployed an operator in this battle: it is on the field, or its card has a record. @param {Player} p @param {string} key */
const deployedOnce = (p, key) => Object.hasOwn(p.cards, key) || p.deployed.includes(key);

/** The deck of the seat a card is of (部署-10): the content's, or every operator record but summons without decks. @param {Content} c @param {string} key */
const deckWith = (c, key) => (c.decks ? c.decks.find((d) => d.includes(key)) ?? [] : Object.keys(c.operators).filter((k) => !c.operators[k].summon));

/** A seat's deck (部署-10): the content's, or every operator record but summons without decks. @param {Content} c @param {number} seat */
export const deckOf = (c, seat) => (c.decks ? c.decks[seat] ?? [] : Object.keys(c.operators).filter((k) => !c.operators[k].summon));

/**
 * The cuts the talents of a card's deck give it (部署-10): each `costCuts` of an operator in the deck — not for the field
 * — that is for the card, one with `first` only while the seat has deployed none it is for.
 * @param {Content} c @param {Player} p @param {string} key @param {import('./types.js').OperatorDef} d
 */
function deckCut(c, p, key, d) {
  let n = 0;
  const deck = deckWith(c, key);
  for (const k of deck) {
    for (const x of Object.hasOwn(c.operators, k) ? traitOfDef(c.operators[k]).costCuts : []) {
      if (x.field || !cutFits(x, d)) continue;
      if (!x.first || !deck.some((o) => Object.hasOwn(c.operators, o) && cutFits(x, c.operators[o]) && deployedOnce(p, o))) n += x.value;
    }
  }
  return n;
}

/**
 * The cuts the operators on the field give a card of any seat (部署-10): each one's `costCuts` for the field that is for
 * the card, the same talent of operators of the same id only once — the largest cut.
 * @param {World} w @param {Content} c @param {import('./types.js').OperatorDef} d
 */
function fieldCut(w, c, d) {
  /** @type {Map<string, number>} */
  const best = new Map();
  for (const u of w.units) {
    if (u.kind !== KIND.OPERATOR || u.hp <= 0) continue;
    traitOfDef(c.operators[u.key]).costCuts.forEach((x, i) => {
      const k = `${c.operators[u.key].char ?? u.key}:${i}`;
      if (x.field && cutFits(x, d)) best.set(k, Math.min(best.get(k) ?? 0, x.value));
    });
  }
  let n = 0;
  for (const v of best.values()) n += v;
  return n;
}

/**
 * The cost to deploy an operator now (部署-3): its initial cost × (1 + 0.5 × 再部署惩罚), rounded down; then, never below 0,
 * plus before its first deployment its trait's first-deployment change (职业-21) and the talents' cuts (部署-10): its
 * deck's, the field's (with the world), the seat's cut for its next operator and the card's own.
 * @param {Content} c @param {Player} p @param {string} key @param {World} [w]
 */
export function deployCost(c, p, key, w) {
  const d = c.operators[key], base = Math.floor(d.cost * (1 + 0.5 * cardOf(p, key).penalty)), first = traitOfDef(d).firstCost;
  const cut = (first !== 0 && !deployedOnce(p, key) ? first : 0) + deckCut(c, p, key, d) + (w ? fieldCut(w, c, d) : 0) + (d.carried || d.builder ? 0 : p.cut ?? 0) + (p.cuts?.[key] ?? 0);
  return cut !== 0 ? Math.max(0, base + cut) : base;
}

/**
 * A seat's deployment of an operator takes its cuts (部署-10): the seat's cut for its next operator — not a carried
 * unit's or a builder's —, the card's own.
 * @param {Content} c @param {Player} p @param {string} key
 */
export function takeCuts(c, p, key) {
  const d = c.operators[key];
  if (!d.carried && !d.builder) delete p.cut;
  if (p.cuts && Object.hasOwn(p.cuts, key)) {
    delete p.cuts[key];
    if (Object.keys(p.cuts).length === 0) delete p.cuts;
  }
}

/**
 * The cost a seat starts with (费用-1, 部署-10): the level's initial cost, plus the `startCost` of each operator in its deck,
 * then not above the maximum.
 * @param {Content} c @param {number} seat
 */
export function startCost(c, seat) {
  const { initialCost, maxCost } = c.level.options;
  const more = deckOf(c, seat).reduce((n, k) => n + (Object.hasOwn(c.operators, k) ? traitOfDef(c.operators[k]).startCost : 0), 0);
  return more !== 0 ? Math.min(maxCost, initialCost + more) : initialCost;
}

/**
 * × a seat's cost recovery (费用-1, 部署-10): the product of the `costRate` of its operators on the field.
 * @param {World} w @param {Content} c @param {number} seat
 */
export function costRate(w, c, seat) {
  let k = 1;
  for (const u of w.units) if (u.kind === KIND.OPERATOR && u.owner === seat && u.hp > 0) k *= traitOfDef(c.operators[u.key]).costRate;
  return k;
}

/**
 * An operator deployed gives the cards of its seat's deck of a profession not on the field their cut (部署-10,
 * `deployCut`): `value` more each time, at most `max` × `value` until that card is deployed.
 * @param {World} w @param {Content} c @param {Unit} u
 */
export function giveCuts(w, c, u) {
  const x = traitOfDef(c.operators[u.key]).deployCut, p = w.players[u.owner];
  if (!x || !p) return;
  for (const k of deckOf(c, u.owner)) {
    if (!Object.hasOwn(c.operators, k) || p.deployed.includes(k) || !cutFits(x, c.operators[k])) continue;
    p.cuts ??= {};
    p.cuts[k] = Math.max(x.value * x.max, (p.cuts[k] ?? 0) + x.value);
  }
}

/**
 * A card's 再部署惩罚 after its operator leaves (部署-3): one more, at most MAX_PENALTY; in 阵地足球 the same (足球-8), but
 * one more again in 阵地足球锦标 (锦标-1: no field bonus). @param {World} w @param {Content} c @param {{ penalty: number }} card
 */
const nextPenalty = (w, c, card) => (w.football && !c.level.football?.cup ? card.penalty : Math.min(MAX_PENALTY, card.penalty + 1));

/**
 * An operator leaves the field (部署-3, 撤退-1): a retreat returns ⌊min(paid × 返还倍率, initial cost)⌋ cost (without the
 * cap when its trait says so, 职业-21); either way its card gains a penalty layer (at most 2) and it may be deployed again
 * after its 再部署时间 — × its trait's share for its first retreat (职业-21), 20% shorter while a
 * 临时休息舱 is at level 3, none for a retreat in a rest (守御-2, 守御-5) — an operator devoured is locked instead, with
 * none (敌能-30); a retreat sets its seat's cut for the next operator by its trait's, the larger one kept (部署-10). A
 * summon has its own card (召唤-4). Either way the marks it left (foeLeave, 职业-28) and its shares (shareLeave, 职业-32) go first.
 * @param {World} w @param {Content} c @param {Unit} u @param {boolean} retreated
 */
export function leaveField(w, c, u, retreated) {
  foeLeave(w, u);
  shareLeave(w, u);
  firstBlockLeave(w, c, u);
  if (c.operators[u.key].summon) {
    summonLeft(w, c, u);
    return;
  }
  // 轰隆隆先生 (装置-7): the redeploy time already started at deploy. Leaving refunds nothing and does not start another.
  if (c.operators[u.key].rumble) {
    dropRumble(w, u);
    return;
  }
  const p = w.players[u.owner], d = c.operators[u.key], card = cardOf(p, u.key), t = traitOfDef(d);
  if (retreated) retreatGains(w, c, u, t);
  const first = retreated && !card.retreated ? t.firstRetreatRespawn : 1;
  const wait = retreated && w.fortress?.phase === 'rest' ? 0 : secondsToFrames((d.respawnTime ?? DEFAULT_RESPAWN) * respawnFactor(w, c) * first);
  const penalty = nextPenalty(w, c, card), once = (retreated || card.retreated) && t.firstRetreatRespawn !== 1 ? { retreated: true } : {};
  p.cards[u.key] = { penalty, ...lockOf(w, u, retreated, wait), ...once };
  p.deployed = p.deployed.filter((k) => k !== u.key);
}

/**
 * A card's time and lock as its operator leaves (敌能-30, 敌能-109): devoured or carried off, not retreated, it may be
 * deployed now but is locked by that enemy — a carried one's direction kept —; otherwise it waits `wait` frames.
 * @param {World} w @param {Unit} u @param {boolean} retreated @param {number} wait
 */
function lockOf(w, u, retreated, wait) {
  const lock = u.ab['@devoured'];
  if (lock === undefined || retreated) return { ready: w.frame + wait };
  return { ready: w.frame, lock, ...(u.ab['@carried'] === 1 ? { facing: u.dir } : {}) };
}

/**
 * What a retreat gives its seat (撤退-1): the refund, ⌊min(paid × 返还倍率, initial cost)⌋ — without the cap when its
 * trait says so (职业-21) —, and its trait's cut for the next operator, the larger one kept (部署-10).
 * @param {World} w @param {Content} c @param {Unit} u @param {import('./types.js').TraitDef} t
 */
function retreatGains(w, c, u, t) {
  const p = w.players[u.owner], d = c.operators[u.key];
  gainCost(w, c, u.owner, Math.floor(t.refundUncapped ? u.paid * t.refund : Math.min(u.paid * t.refund, d.cost)));
  if (t.retreatCut !== 0) p.cut = Math.min(p.cut ?? 0, t.retreatCut);
}

/**
 * An operator on the field retreats (撤退-1): it leaves at once, lets go of what it blocks, takes its refund, penalty and
 * 再部署时间, and the event `retreat` tells it; its summons leave with it (召唤-5).
 * @param {World} w @param {Content} c @param {Unit} u
 */
export function withdraw(w, c, u) {
  noteExit(w, u);
  w.units.splice(w.units.indexOf(u), 1);
  releaseAll(w, u.id);
  leaveField(w, c, u, true);
  w.events.push({ type: 'retreat', id: u.id });
  if (u.skill?.active) emit(w, 'skillEnd', { unit: u, reason: 'death' });
  emit(w, 'death', { unit: u, reason: 'retreat', killer: null });
  dismissSummons(w, c, [u.id]);
}
