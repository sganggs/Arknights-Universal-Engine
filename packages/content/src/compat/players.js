// Stronghold's players of a battle (docs/spec/compat.md 兼容-7): what its battle content beyond the kits reads of each
// seat — the live bonds (count, active, tier, layers), the band, the per-battle input — and changes during the battle:
// the layers of its bonds (the `layerGain` event first, at most 999 a bond), and a free redeployment, which in our modes
// is the official reading of 「立刻重新部署」: the operator's next deployment takes no 再部署时间 and no cost. What the
// engine's records of a piece do not carry (its chess id, bonds, shop tier, elite form, equipment) comes with the seat.
// A piece's exit is kept as Stronghold keeps it (reason, time, when it may come back), on the engine's card.
import { attrs } from '@aue/sim';
import { CompatGap } from './sh/gap.js';

/** @typedef {import('./battle.js').ShBattle} ShBattle @typedef {import('./unit.js').ShUnit} ShUnit */
/**
 * A bond's live state: members counted, whether it is active, the tier reached and its layers.
 * @typedef {{ count?: number, active?: boolean, tier?: number, layers?: number }} BondState
 */
/**
 * What the engine's records of an operator do not carry (Stronghold's chess record): its chess id (an elite one ends in
 * `_b`), its bonds, its shop tier, its elite form, the equipment it carries.
 * @typedef {{ id?: string, bonds?: string[], tier?: number, golden?: boolean, items?: string[] }} PieceFacts
 */
/**
 * A seat's input (Stronghold's PlayerBattleInput, the parts its battle content reads): its bonds' live state, its band,
 * its pieces' facts by operator key, the prep side's facts (`contentInfo`), its 规程 effect replacements, its 变形同构体 rule.
 * @typedef {{ bonds?: Record<string, BondState>, bandId?: string | null, units?: Record<string, PieceFacts>,
 *   contentInfo?: Record<string, unknown>, bondEffectOverrides?: Record<string, string>, morphPairing?: string }} PlayerInput
 */

/** The most layers a bond holds (Stronghold's BOND_LAYER_CAP; 推断 INF-1090). */
export const LAYER_CAP = 999;

/** Frames a second (时间-1). */
const FPS = 30;

/** A card cut no cost outweighs: a free deployment (部署-10, the card's own cut, taken as it deploys). */
const FREE_CUT = -1e9;

/** The layers that fit under the cap after `before`, of `n` (Stronghold's layerGainRoom). @param {number} before @param {number} n */
const room = (before, n) => (n > 0 ? Math.max(0, Math.min(n, LAYER_CAP - (Number.isFinite(before) && before > 0 ? before : 0))) : 0);

/**
 * A seat as Stronghold's battle content reads it (its Battle's player state): one side of an unmirrored field, its live
 * bonds (a copy of the input's, which in-battle gains change), band and input; its cost and its units read now.
 * @param {ShBattle} b @param {number} seat @param {PlayerInput} input
 */
export function makePlayer(b, seat, input) {
  const bonds = Object.fromEntries(Object.entries(input.bonds ?? {}).map(([k, v]) => [k, { ...v }]));
  return {
    id: seat, playerId: seat, seat, side: 'L', mirror: false, facing: 1, dir: 'RIGHT', half: 'L', colOffset: 0,
    bonds, bandId: input.bandId ?? null, playerEffects: [], input,
    ...(input.morphPairing === 'plus' ? { morphPairing: 'plus' } : {}),
    /** @type {Record<string, number>} the layers this battle added, by bond */
    layerGains: {},
    /** @type {Record<string, number>} 规程's temporary layers, by bond */
    tempLayerGains: {},
    get dp() { return b.w.players[seat]?.cost ?? 0; },
    get units() { return b.allyUnits.filter((u) => u.ownerId === seat); },
  };
}

/** @typedef {ReturnType<typeof makePlayer>} ShPlayer */

/**
 * The tile of a gain's source (Stronghold's _sourceTile): where it stands, or where it stood when it left the field at
 * this very moment (a gain 被击倒时 comes from its `death`); null for none or one gone earlier.
 * @param {ShBattle} b @param {any} u @returns {[number, number] | null}
 */
function sourceTile(b, u) {
  if (!u || typeof u !== 'object' || !Number.isFinite(u.x)) return null;
  const here = u.alive && u.deployed && !u.hidden;
  if (!here && !(u.deathAt === b.time && !u.alive)) return null;
  return u.side === 'ally' ? [u.tileR, u.tileC] : [Math.round(u.y), Math.round(u.x)];
}

/**
 * The seat a gain or temporary layers may go to: one of this battle's, while in-battle gains are on, for a bond id and a
 * positive number of layers; else null. @param {ShBattle} b @param {number} pid @param {unknown} bondId @param {number} n
 */
const gainSeat = (b, pid, bondId, n) => (b.flags.layerGainsEnabled && n > 0 && Number.isFinite(n) && typeof bondId === 'string' && bondId ? b.players[pid] ?? null : null);

/**
 * The `layerGain` event of a gain: its player, bond, layers, reason, source and the source's tile (or the tile given).
 * Returns the layers its handlers leave. @param {ShBattle} b @param {number} pid @param {string} bondId @param {number} n
 * @param {{ reason?: string, source?: any, tile?: [number, number] }} o
 */
function gainEvent(b, pid, bondId, n, o) {
  const ctx = { playerId: pid, bondId, n, reason: o.reason ?? '', source: o.source ?? null, tile: Array.isArray(o.tile) ? o.tile : sourceTile(b, o.source) };
  if (b.hasHook('layerGain')) b.emit('layerGain', ctx);
  return ctx.n;
}

/**
 * An in-battle layer gain (Stronghold's addLayers): nothing while gains are off or for no seat; the `layerGain` event
 * first (a handler may change `n`, or cancel it with no positive finite number), then at most what the cap leaves on the
 * live copy. Returns the layers added.
 * @param {ShBattle} b @param {number} pid @param {string} bondId @param {number} n @param {{ reason?: string, source?: any, tile?: [number, number] }} [o]
 */
export function addLayers(b, pid, bondId, n, o = {}) {
  const ps = gainSeat(b, pid, bondId, n);
  if (!ps) return 0;
  const live = ps.bonds[bondId] ? ps.bonds[bondId].layers ?? 0 : ps.layerGains[bondId] ?? 0;
  if (!(room(live, Infinity) > 0)) return 0;
  const asked = gainEvent(b, pid, bondId, n, o);
  const add = Number.isFinite(asked) ? room(live, asked) : 0;
  if (!(add > 0)) return 0;
  ps.layerGains[bondId] = (ps.layerGains[bondId] ?? 0) + add;
  if (ps.bonds[bondId]) ps.bonds[bondId].layers = (ps.bonds[bondId].layers ?? 0) + add;
  return add;
}

/**
 * 规程's temporary layers (Stronghold's addTempLayers): kept apart, no event; whole layers, at most 10⁴. Returns those added.
 * @param {ShBattle} b @param {number} pid @param {string} bondId @param {number} n
 */
export function addTempLayers(b, pid, bondId, n) {
  const ps = gainSeat(b, pid, bondId, n);
  if (!ps) return 0;
  const add = Math.min(1e4, Math.floor(n));
  if (!(add > 0)) return 0;
  ps.tempLayerGains[bondId] = Math.min(1e4, (ps.tempLayerGains[bondId] ?? 0) + add);
  return add;
}

/**
 * A piece's card once the engine has set it for the piece's exit — off the field, no longer counted as deployed —, else
 * null: in a knock-out's own `death` event the engine has not yet (it sets the card after that event; a retreat before).
 * @param {ShBattle} b @param {ShUnit} piece
 */
function settledCard(b, piece) {
  const p = b.w.players[piece.ownerId], card = p?.cards[piece.defId];
  return card && !piece.deployed && !p.deployed.includes(piece.defId) ? card : null;
}

/** A free redeployment's card comes ready now. @param {ShBattle} b @param {{ ready: number }} card */
const readyNow = (b, card) => { card.ready = Math.min(card.ready, b.w.frame); };

/**
 * Stronghold's redeploy in our modes (兼容-7): an operator's piece off the field — or leaving it now — gets its next
 * deployment without 再部署时间 and, `free` (the default), without cost (the card's own cut, 部署-10); the player deploys
 * it. Whether it was given: not to a unit on the field, nor to a summon, nor twice for one exit. A redeploy on another
 * tile or keeping its SP (突袭) is a gap.
 * @param {ShBattle} b @param {ShUnit} unit @param {{ free?: boolean, tile?: unknown, keepSp?: boolean }} [o]
 */
export function redeploy(b, unit, o = {}) {
  if (o.tile != null || o.keepSp) throw new CompatGap('battle.redeploy.tile');
  if (!unit || unit.kind !== 'op' || unit.pieceId < 0 || unit.alive || unit.freeNext || !b.w.players[unit.ownerId]) return false;
  unit.freeNext = true;
  unit.freeCost = o.free !== false;
  keepFreeCuts(b, unit.ownerId);
  const card = unit.leaving ? null : settledCard(b, unit);
  if (card) readyNow(b, card);
  return true;
}

/**
 * The free cuts of a seat's pieces waiting for a free redeployment, set again: another operator's deployment may lower a
 * card's cut to its own bound (部署-10 `deployCut`). @param {ShBattle} b @param {number} seat
 */
export function keepFreeCuts(b, seat) {
  const p = b.w.players[seat];
  if (!p) return;
  for (const piece of b.pieces.values()) {
    if (piece.ownerId !== seat || !piece.freeNext || !piece.freeCost) continue;
    p.cuts ??= {};
    p.cuts[piece.defId] = FREE_CUT;
  }
}

/**
 * A respawn time content sets (Stronghold's respawnAt, in battle seconds): kept on the unit; for a piece off the field
 * also its card's — during a knock-out's own `death` event once the engine has set the card. A time that is no number is
 * a gap there.
 * @param {ShBattle} b @param {ShUnit} piece @param {number} t
 */
export function setRespawn(b, piece, t) {
  const card = piece.pieceId < 0 || piece.leaving ? null : settledCard(b, piece);
  if ((card || piece.leaving) && !Number.isFinite(t)) throw new CompatGap('unit.respawnAt');
  piece.backAt = t;
  if (piece.leaving) piece.backWanted = t;
  else if (card) card.ready = Math.max(0, Math.round(t * FPS));
}

/**
 * An operator's piece leaves the field (the `death` event, before any other handler: knocked out, retreated): its exit
 * as Stronghold keeps it (`removeReason`, `deathAt`) and, once the engine has set its card, its 再部署时间 × the product of
 * its lasting buffs' `redeployMul` (助力), the time it may come back (`respawnAt`) — then what content set meanwhile,
 * and a free redeployment given meanwhile.
 * @param {ShBattle} b @param {ShUnit} piece @param {string} reason
 */
export function pieceLeft(b, piece, reason) {
  piece.removeReason = reason;
  piece.deathAt = b.time;
  const mul = redeployMul(piece), left = b.w.frame;
  const settle = () => {
    piece.leaving = false;
    const card = settledCard(b, piece), wanted = piece.backWanted;
    piece.backWanted = null;
    if (!card) return;
    if (mul !== 1 && card.ready > left) card.ready = left + Math.max(0, Math.round((card.ready - left) * mul));
    piece.backAt = card.ready / FPS;
    if (wanted !== null) setRespawn(b, piece, wanted);
    if (piece.freeNext) readyNow(b, card);
  };
  if (settledCard(b, piece)) {
    settle();
    return;
  }
  piece.leaving = true;
  piece.backAt = Infinity;
  b.after(0, settle);
}

/**
 * The product of a piece's `redeployMul` modifiers (Stronghold's: 助力 ×(1 + respawn_time); 突袭's milestone in other data), each to the
 * power of its layers — only its lasting (`persist`) buffs, as Stronghold drops the others before it reads them; 1 for
 * none. The engine reads no such key itself.
 * @param {ShUnit} piece
 */
function redeployMul(piece) {
  const keys = new Set(piece.persist.map((x) => x.key));
  let k = 1;
  for (const x of piece.u ? attrs.activeBuffs(piece.u.buffs) : []) {
    const v = x.mods.redeployMul;
    if (keys.has(x.key) && typeof v === 'number' && Number.isFinite(v) && v >= 0) for (let i = 0; i < x.stacks; i++) k *= v;
  }
  return k;
}

/** A piece's next deployment took what a free redeployment gave. @param {ShUnit} piece */
export function pieceBack(piece) {
  piece.freeNext = false;
  piece.freeCost = false;
}
