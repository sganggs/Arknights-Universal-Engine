// Summons (docs/spec/summons.md 召唤-4…召唤-6): a summon's card in its player's deck — copies held, the frame it may be
// deployed from, copies cooling down —, the owner's deployment adding to it, deploying from it, content summoning one,
// a summon leaving the field and the summons leaving with their owner.
import { secondsToFrames } from '@aue/math';
import { KIND, DIR } from '@aue/schema';
import { tileAt } from './level.js';
import { isKeeper } from './pitch.js';
import { makeOperator } from './units.js';
import { releaseAll } from './blocking.js';
import { reachKeys } from './reach.js';
import { statsOf } from './attrs.js';
import { tileOf } from './body.js';
import { onDeploy } from './skills.js';
import { traitDeploy, traitOf } from './traits.js';
import { modeDeploy, deployTalents } from './modes.js';
import { emit } from './bus.js';
import { summonForm } from './tactical.js';
import { draw } from './rng.js';
import { makeBuff, addBuff } from './buffs.js';
import { noteExit } from './exits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Player} Player @typedef {import('./types.js').SummonCard} SummonCard @typedef {import('./types.js').OperatorDef} OperatorDef */

/** Whether a summon has a card (召唤-4, 召唤-8): its owner's deployment or skill gives copies. @param {import('./types.js').SummonDef | undefined} s */
export const hasCard = (s) => !!s && (s.supply > 0 || (s.grant?.n ?? 0) > 0);

/** A player's card for a summon: the one recorded, or an empty one (召唤-4). @param {Player} p @param {string} key @returns {SummonCard} */
export const summonCardOf = (p, key) => (p.summons && Object.hasOwn(p.summons, key) ? p.summons[key] : { held: 0, ready: 0, cooling: 0 });

/** @param {Player} p @param {string} key @param {SummonCard} card */
function setCard(p, key, card) {
  p.summons = { ...p.summons, [key]: card };
}

/** The units of a seat on the field with a content key. @param {World} w @param {number} seat @param {string} key */
const onField = (w, seat, key) => w.units.filter((u) => u.kind === KIND.OPERATOR && u.owner === seat && u.key === key && u.hp > 0);

/** A summon's owner on the field for a seat, or null (召唤-4). @param {World} w @param {Content} c @param {number} seat @param {string} key */
export const summonerOf = (w, c, seat, key) => onField(w, seat, c.operators[key].summoner ?? '')[0] ?? null;

/**
 * The units of a seat that count toward its deploy limit (部署-2, 召唤-4): its operators but the free ones, and its
 * summons whose 部署占用数 is 1.
 * @param {World} w @param {Content} c @param {number} seat @param {(d: OperatorDef) => boolean} free
 */
export function occupying(w, c, seat, free) {
  const p = w.players[seat];
  const summons = w.units.filter((u) => u.kind === KIND.OPERATOR && u.owner === seat && u.summoner !== undefined && c.operators[u.key].summon?.occupy === 1);
  // a goalkeeper takes no place (足球-13)
  const keepers = w.units.filter((u) => u.kind === KIND.OPERATOR && u.owner === seat && u.summoner === undefined && p.deployed.includes(u.key) && !free(c.operators[u.key]) && isKeeper(u));
  return p.deployed.filter((k) => !free(c.operators[k])).length - keepers.length + summons.length - freeSummons(w, c, summons);
}

/**
 * How many of these summons take no place (职业-21): for each owner, up to its trait's number of them.
 * @param {World} w @param {Content} c @param {Unit[]} summons
 */
function freeSummons(w, c, summons) {
  let n = 0;
  for (const owner of w.units) {
    const k = owner.kind === KIND.OPERATOR && owner.hp > 0 ? traitOf(c, owner).freeSummons : 0;
    if (k > 0) n += Math.min(k, summons.filter((u) => u.summoner === owner.id).length);
  }
  return n;
}

/**
 * Why deploying a summon from its card is refused, or null (召唤-4); the deploy limit and the tile are deployProblem's.
 * @param {World} w @param {Content} c @param {number} seat @param {string} key
 */
export function summonProblem(w, c, seat, key) {
  const d = c.operators[key], s = /** @type {import('./types.js').SummonDef} */ (d.summon), card = summonCardOf(w.players[seat], key);
  if (!hasCard(s)) return 'no card for this summon';
  if (!summonerOf(w, c, seat, key)) return 'summoner not on the field';
  if (card.held < 1) return 'none held';
  if (s.respawn === 'unique' && onField(w, seat, key).length > 0) return 'already deployed';
  if (onField(w, seat, key).length >= s.deployLimit) return 'summon limit reached';
  if (w.frame < card.ready) return 'redeploying';
  return null;
}

/**
 * Whether a record may stand on a tile for its owner now (召唤-4): a summon that may only stand in its owner's attack
 * range, on a tile of the range its owner has now; any other, anywhere.
 * @param {World} w @param {Content} c @param {number} seat @param {string} key @param {{ row: number, col: number }} at
 */
export function inOwnerRange(w, c, seat, key, at) {
  if (c.operators[key]?.summon?.ownerRange !== true) return true;
  const owner = summonerOf(w, c, seat, key);
  return !!owner && reachKeys(c, owner).has(at.row * c.level.width + at.col);
}

/**
 * Whether a summon may not go on a tile for an enemy standing there (职业-14): its owner's trait keeps its summons off a
 * tile where a ground enemy-class unit stands now — of any side, neutral ones too; not a flying one, not a disappeared one.
 * @param {World} w @param {Content} c @param {number} seat @param {string} key @param {{ row: number, col: number }} at
 */
export function trapRefused(w, c, seat, key, at) {
  const owner = summonerOf(w, c, seat, key);
  if (!owner || !traitOf(c, owner).trapTiles) return false;
  return w.units.some((u) => {
    if (u.kind !== KIND.ENEMY || u.hp <= 0 || u.hidden || statsOf(u).flying) return false;
    const [row, col] = tileOf(u);
    return row === at.row && col === at.col;
  });
}

/**
 * A summon unit for an owner (召唤-4, 召唤-6): its record's, facing as told, the owner's; its trait, deployment talents
 * and passive skill take hold, the event and the hook `deploy` tell it.
 * @param {World} w @param {Content} c @param {Unit} owner @param {{ key: string, row: number, col: number, dir: number, paid: number }} o
 */
function enter(w, c, owner, o) {
  const life = c.operators[o.key].summon?.life ?? 0;
  const u = makeOperator(w, c, { ...o, owner: owner.owner, summoner: owner.id, ...(life > 0 ? { expires: w.frame + secondsToFrames(life) } : {}) });
  w.units.push(u);
  w.events.push({ type: 'deploy', id: u.id, key: u.key, owner: owner.owner });
  emit(w, 'enter', { unit: u });
  traitDeploy(w, c, u);
  modeDeploy(u, traitOf(c, u));
  deployTalents(w, c, u);
  onDeploy(w, c, u);
  emit(w, 'deploy', { unit: u, initial: false });
  return u;
}

/**
 * Deploys a summon from its card (召唤-4): its cost is paid, a copy is taken; under 默认 the card cools down from now. A
 * tactical point takes its summon form (召唤-11). One of an owner whose trait boosts its summons (职业-21) deals × the
 * boost's damage at the boost's chance (one draw, 随机-1).
 * @param {World} w @param {Content} c @param {number} seat @param {import('@aue/schema').DeployCommand} cmd
 */
export function deploySummon(w, c, seat, cmd) {
  const p = w.players[seat], d = c.operators[cmd.op], card = summonCardOf(p, cmd.op), owner = /** @type {Unit} */ (summonerOf(w, c, seat, cmd.op));
  p.cost -= d.cost;
  const ready = d.summon?.respawn === 'default' ? w.frame + secondsToFrames(d.respawnTime ?? 0) : card.ready;
  setCard(p, cmd.op, { ...card, held: card.held - 1, ready });
  const u = enter(w, c, owner, { key: cmd.op, row: cmd.row, col: cmd.col, dir: cmd.dir, paid: d.cost });
  if (d.summon?.tactical) summonForm(c, u);
  const boost = traitOf(c, owner).summonBoost;
  if (boost && draw(w) < boost.prob) addBuff(u, makeBuff({ key: 'boosted', src: owner.id, mods: { dmgDealtMul: boost.scale } }));
}

/**
 * Content summons a unit for an owner on a tile (召唤-6): no cost, no card; none on a tile off the map or taken.
 * @param {World} w @param {Content} c @param {Unit} owner @param {string} key @param {{ row: number, col: number, dir?: number }} at
 * @returns {Unit | null}
 */
export function spawnSummon(w, c, owner, key, at) {
  if (!Object.hasOwn(c.operators, key) || !tileAt(c.level, at.row, at.col)) return null;
  if (w.units.some((u) => u.kind === KIND.OPERATOR && u.hp > 0 && u.x === at.col && u.y === at.row)) return null;
  return enter(w, c, owner, { key, row: at.row, col: at.col, dir: at.dir ?? DIR[owner.dir], paid: 0 });
}

/**
 * An owner's deployment adds to its summons' cards (召唤-4): each summon of its with a card gains its `supply`, up to its
 * hold limit.
 * @param {World} w @param {Content} c @param {Unit} owner
 */
export function supplySummons(w, c, owner) {
  const p = w.players[owner.owner];
  for (const [key, d] of Object.entries(c.operators)) {
    if (d.summoner !== owner.key || !d.summon || d.summon.supply <= 0) continue;
    const card = summonCardOf(p, key);
    setCard(p, key, { ...card, held: Math.min(d.summon.holdLimit, card.held + d.summon.supply) });
  }
}

/**
 * An owner's skill gives copies (召唤-8): at its start or at its end, each summon of the owner its skill gives gains
 * them, up to its hold limit.
 * @param {World} w @param {Content} c @param {Unit} owner @param {'start' | 'end'} at
 */
export function grantSummons(w, c, owner, at) {
  const p = w.players[owner.owner];
  for (const [key, d] of Object.entries(c.operators)) {
    const s = d.summon;
    if (d.summoner !== owner.key || !s?.grant || s.grant.at !== at) continue;
    const card = summonCardOf(p, key);
    setCard(p, key, { ...card, held: Math.min(s.holdLimit, card.held + s.grant.n) });
  }
}

/**
 * A summon leaves the field (召唤-4): no refund, no penalty; under 唯一 its copy comes back and the card cools down from
 * now, under 队列 its copy starts cooling; under 默认 the copy is spent.
 * @param {World} w @param {Content} c @param {Unit} u
 */
export function summonLeft(w, c, u) {
  const p = w.players[u.owner], d = c.operators[u.key], s = d.summon, card = summonCardOf(p, u.key);
  if (!hasCard(s)) return;
  if (s?.respawn === 'unique') setCard(p, u.key, { ...card, held: Math.min(s.holdLimit, card.held + 1), ready: w.frame + secondsToFrames(d.respawnTime ?? 0) });
  if (s?.respawn === 'queue') setCard(p, u.key, { ...card, cooling: Math.min(s.holdLimit, card.cooling + 1), ready: card.cooling > 0 ? card.ready : w.frame + secondsToFrames(d.respawnTime ?? 0) });
}

/**
 * The 队列 cards' cooling (召唤-4): a card whose cooling ended turns a cooling copy back into a held one, and cools again
 * while copies are left cooling.
 * @param {World} w @param {Content} c
 */
export function coolSummons(w, c) {
  for (const p of w.players) {
    for (const [key, card] of Object.entries(p.summons ?? {})) {
      if (card.cooling < 1 || w.frame < card.ready) continue;
      const left = card.cooling - 1, hold = c.operators[key].summon?.holdLimit ?? 0;
      setCard(p, key, { held: Math.min(hold, card.held + 1), cooling: left, ready: left > 0 ? w.frame + secondsToFrames(c.operators[key].respawnTime ?? 0) : card.ready });
    }
  }
}

/**
 * The summons of operators that left the field leave with them (召唤-5), but those that stay: each retreats — it lets go
 * of what it blocks, its card handles it (summonLeft), the event `retreat` and the hooks tell it.
 * @param {World} w @param {Content} c @param {number[]} owners the units that left
 */
export function dismissSummons(w, c, owners) {
  retreatSummons(w, c, w.units.filter((u) => u.summoner !== undefined && owners.includes(u.summoner) && c.operators[u.key].summon?.stays !== true));
}

/**
 * Summons retreat (召唤-4, 召唤-5, 召唤-9, 召唤-10): each leaves at once, lets go of what it blocks, its card handles it
 * (summonLeft) — a recovered one under 默认 gets its copy back, up to the hold limit —, the event `retreat` and the hooks
 * tell it; then their own summons leave with them.
 * @param {World} w @param {Content} c @param {Unit[]} gone @param {boolean} [recover]
 */
function retreatSummons(w, c, gone, recover = false) {
  if (gone.length === 0) return;
  w.units = w.units.filter((u) => !gone.includes(u));
  for (const u of gone) {
    noteExit(w, u);
    releaseAll(w, u.id);
    summonLeft(w, c, u);
    const s = c.operators[u.key].summon, p = w.players[u.owner], card = summonCardOf(p, u.key);
    if (recover && s?.respawn === 'default') setCard(p, u.key, { ...card, held: Math.min(s.holdLimit, card.held + 1) });
    w.events.push({ type: 'retreat', id: u.id });
    if (u.skill?.active) emit(w, 'skillEnd', { unit: u, reason: 'death' });
    emit(w, 'death', { unit: u, reason: 'retreat', killer: null });
  }
  dismissSummons(w, c, gone.map((u) => u.id));
}

/**
 * The summons whose time is up retreat (召唤-9): those whose frame to leave has come.
 * @param {World} w @param {Content} c
 */
export function expireSummons(w, c) {
  retreatSummons(w, c, w.units.filter((u) => u.expires !== undefined && w.frame >= u.expires && u.hp > 0));
}

/**
 * The end of an owner's skill (召唤-10): its summons the skill's end takes off the field — those under the share of their
 * HP when it says so — retreat, recovered or not.
 * @param {World} w @param {Content} c @param {Unit} owner
 */
export function endSummons(w, c, owner) {
  for (const [key, d] of Object.entries(c.operators)) {
    const end = d.summon?.skillEnd;
    if (d.summoner !== owner.key || !end) continue;
    const below = end.below ?? Infinity;
    retreatSummons(w, c, w.units.filter((u) => u.key === key && u.summoner === owner.id && u.hp > 0 && u.hp < below * statsOf(u).maxHp), end.recover);
  }
}
