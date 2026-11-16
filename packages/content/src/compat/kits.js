// Stronghold's kits in a battle (docs/spec/compat.md 兼容-4): the content's world setup (钩子-4) makes the battle a kit
// sees (battle.js), a piece for each deck entry that has a kit — as Stronghold's board pieces, before anything is
// deployed, each with its own id for the whole battle — and installs each piece's kit once: its own setup and its
// talents'. Each deployment of an operator binds its piece to the engine's unit as it enters the field (钩子-3 `enter`:
// before its trait, talents and passive skill take hold, so a passive skill's spec runs as Stronghold's does) and gives
// its lasting buffs again.
import { KIND, bus, reserveIds, traits } from '@aue/sim';
import { ShBattle } from './battle.js';
import { ShUnit, hurtAt } from './unit.js';
import { battles, SPEC_BEHAVIOR, KIT_TRAIT_BEHAVIOR, onAttackHit, onAttackDone, onSpecHit, onBoomerangHit } from './specs.js';
import { KIT_BUFF, KIT_BUFF_BEHAVIOR, worldBattles } from './buffhooks.js';
import { withGrid } from './grid.js';
import { pieceLeft, pieceBack, keepFreeCuts } from './players.js';
import { statusKeyOf } from './mods.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Content} Content @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('./players.js').PlayerInput} PlayerInput @typedef {import('./players.js').PieceFacts} PieceFacts */
/**
 * A kit for an operator key: Stronghold's factory and the def it is built from (records.js defOf), and its summons' defs
 * by summon id (records.js tokenDefOf).
 * @typedef {{ factory: (bb: Record<string, any>, chess: Record<string, any>, def: Record<string, any>) => any, chess?: boolean, def: Record<string, any>,
 *   tokens?: Record<string, Record<string, any>> }} KitEntry
 */

/** A kit's own trait, built under the level's grid; null when it has none or cannot be built. @param {KitEntry} entry @param {{ width: number, height: number }} level */
function kitTraitOf(entry, level) {
  try {
    return withGrid(level, () => entry.factory(entry.def.skill?.bb ?? {}, entry.def.raw, entry.def))?.trait ?? null;
  } catch {
    return null;
  }
}

/**
 * The trait data of a branch that Stronghold has no profession rule for, so that its kits carry it themselves (兼容-5):
 * a kitted operator of the branch leaves it to its kit — the 塑灵术师's 倍率 against the enemies its summons block (its
 * kit multiplies its hits on them).
 * @type {Readonly<Record<string, Partial<import('@aue/sim').TraitDef>>>}
 */
const KIT_OWNED = Object.freeze({ soulcaster: { summonBlockedScale: 1 } });

/**
 * What a module adds to the trait in battle (职业-17, 职业-18, 职业-20, 职业-21), none: a kit carries its operator's modules
 * itself, their trait additions too (兼容-5). The deck's rules — the first deployment's cost, the 再部署时间, the refund,
 * the places in the deploy limit — stay the engine's: Stronghold has no deploy cost (op-siege.js: SOL-Y's
 * 「首次部署时部署费用-4」 has no effect there).
 * @type {Readonly<Partial<import('@aue/sim').TraitDef>>}
 */
const NO_MODULE_ADDITIONS = Object.freeze({
  vs: [], far: null, crowd: null, packed: null, whiles: [], extraArts: 0, counterArts: 0, epRider: null, burstHit: null, spOn: null, payStack: null, auras: [],
  summonBoost: null, secondLife: null, pushBoost: null, pullBoost: null, pullTrauma: null,
});

/** Whether a trait has some of what modules add (NO_MODULE_ADDITIONS). @param {import('@aue/sim').TraitDef} t */
const moduleAdded = (t) => Object.entries(NO_MODULE_ADDITIONS).some(([k, none]) => {
  const v = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (t))[k];
  return Array.isArray(none) ? Array.isArray(v) && v.length > 0 : !!v && v !== none;
});

/**
 * The status a kit's trait gives each hit (Stronghold's `onHitStatus` `{ key, duration, value }`) as the engine's trait data
 * (职业-4); none for a kit that clears it (`null`) or gives no time.
 * @param {Record<string, any> | null | undefined} st @returns {import('@aue/sim').TraitDef['hitStatus']}
 */
function hitStatusOf(st) {
  if (!st || !(Number(st.duration) > 0)) return null;
  return { key: /** @type {any} */ (statusKeyOf(st.key)), seconds: Number(st.duration), ...(Number.isFinite(st.value) ? { value: Number(st.value) } : {}) };
}

/**
 * The trait data of a 傀儡师 under its kit (兼容-5): the kit applies its module's attack and HP for the 替身 itself, so the
 * trait's are none; the 替身 makes no normal attack when the kit says so (`dollNoAttack`).
 * @param {NonNullable<import('@aue/sim').TraitDef['doll']>} doll @param {Record<string, any>} kt
 */
const dollUnder = (doll, kt) => ({ ...doll, atk: 0, maxHp: 0, ...(kt.dollNoAttack ? { attack: false } : {}) });

/**
 * What a kit's own `trait` changes of the engine's attack data (兼容-5): `afterHit` takes the place of the 投掷手's aftershock,
 * `splashRadius` the splash's radius, `onHitStatus` the status each hit gives, `hits` and `hitDmgMul` the hits of an attack and
 * the share each takes, `maxTargets` the most targets.
 * @param {Record<string, any>} kt @param {import('@aue/sim').TraitDef} t @returns {Partial<import('@aue/sim').TraitDef>}
 */
function attackFrom(kt, t) {
  /** @type {Partial<import('@aue/sim').TraitDef>} */
  const over = {};
  if (typeof kt.afterHit === 'function' && t.aftershock > 0) over.aftershock = 0;
  if (Number(kt.splashRadius) > 0) over.splash = { scale: 1, ground: false, ...t.splash, radius: Number(kt.splashRadius) };
  if (Object.hasOwn(kt, 'onHitStatus')) over.hitStatus = hitStatusOf(kt.onHitStatus);
  if (Number.isFinite(kt.hits)) over.hits = Math.max(1, Math.floor(kt.hits));
  if (Number(kt.hitDmgMul) > 0) over.hitMul = Number(kt.hitDmgMul);
  if (Number.isFinite(kt.maxTargets)) over.targets = Math.max(1, Math.floor(kt.maxTargets));
  return over;
}

/**
 * What a kit's own `trait` changes of how the engine's operator acts (兼容-5): `noAttackUnlessSkill` makes it attack only while
 * its skill runs, `hitSleep` lets it select and damage sleeping enemies, `rangeTiles` searches by the tile of an enemy, `blockFly`
 * blocks flying units; a trait with its own `install` replaces the profession's, the 吟游者's regeneration aura with it (the kit
 * gives it itself); a 傀儡师's 替身 (dollUnder).
 * @param {Record<string, any>} kt @param {import('@aue/sim').TraitDef} t @returns {Partial<import('@aue/sim').TraitDef>}
 */
function modeFrom(kt, t) {
  /** @type {Partial<import('@aue/sim').TraitDef>} */
  const over = {};
  if (kt.noAttackUnlessSkill) over.attackInSkill = true;
  if (kt.hitSleep) over.hurtSleeping = true;
  if (kt.rangeTiles === true) over.rangeTiles = true;
  if (typeof kt.install === 'function' && t.regenAura > 0) over.regenAura = 0;
  if (t.doll) over.doll = dollUnder(t.doll, kt);
  return { ...over, ...(kt.blockFly === true ? { flags: { ...t.flags, blockFly: true } } : {}) };
}

/**
 * An operator's record under its kit's trait (兼容-5): where the kit's `trait` takes the place of a part of the
 * profession's profile that the engine keeps as trait data, that data follows it (attackFrom, modeFrom), the trait data its branch
 * leaves to kits is its kit's (KIT_OWNED), and so are its module's trait additions (NO_MODULE_ADDITIONS). The
 * kit is built for this (under the level's grid); one that cannot be has no trait of its own.
 * @param {import('@aue/sim').OperatorDef} op @param {KitEntry} entry @param {{ width: number, height: number }} level
 * @returns {import('@aue/sim').OperatorDef}
 */
export function withKitTrait(op, entry, level) {
  const kt = kitTraitOf(entry, level), t = traits.traitOfDef(op), added = moduleAdded(t);
  const over = /** @type {Partial<import('@aue/sim').TraitDef>} */ ({ ...(op.branch && Object.hasOwn(KIT_OWNED, op.branch) ? KIT_OWNED[op.branch] : {}), ...(added ? NO_MODULE_ADDITIONS : {}),
    ...attackFrom(kt ?? {}, t), ...modeFrom(kt ?? {}, t) });
  return Object.keys(over).length ? { ...op, trait: { ...op.trait, ...over } } : op;
}

/** Runs before every other handler of the same event. */
const FIRST = 1e9;

/**
 * Stronghold's battle content beyond the kits (兼容-7): its players' inputs by seat, and the content modules a battle
 * installs after the kits, in order (Stronghold's installContent: each module's `install(battle)`); `seen`, given to a
 * match's content (index.js matchContent), gets each battle made.
 * @typedef {{ players?: (PlayerInput | null | undefined)[], modules?: { name: string, install: (b: ShBattle) => void }[], seen?: (b: ShBattle) => void }} ContentInput
 */

/**
 * The world setup that brings kits into a battle (兼容-4) — and, given Stronghold's players, a piece for every operator of
 * the decks and its content modules after the kits (兼容-7); `seen` gets each battle made (for tests and tools).
 * @param {Record<string, KitEntry>} kits by operator key @param {(b: ShBattle) => void} [seen] @param {ContentInput} [o]
 * @returns {(w: World, c: Content) => void}
 */
export function kitsWorld(kits, seen, o = {}) {
  return (w, c) => {
    const b = new ShBattle(w, c, { players: o.players });
    worldBattles.set(w, b);
    bus.on(w, 'battleStart', () => { b.started = true; }, { priority: FIRST });
    bus.on(w, 'enter', (k) => bind(b, k.unit), { priority: FIRST });
    bus.on(w, 'death', (k) => left(b, k.unit, k.reason), { priority: FIRST });
    bus.on(w, 'deploy', (k) => keepFreeCuts(b, k.unit.owner), { priority: FIRST });
    bus.on(w, 'attack', (k) => { b.unitOf(k.attacker).lastAttackAt = b.time; }, { priority: FIRST });
    bus.on(w, 'damaged', (k) => { if (k.target && k.amount > 0) hurtAt.set(k.target, b.time); }, { priority: FIRST });
    bus.on(w, 'skillStart', (k) => { const s = b.pieces.get(`${k.unit.owner}|${k.unit.key}`)?.skill; if (s && !s.counted) s.activations++; if (s) s.counted = false; }, { priority: FIRST });
    bus.on(w, 'attackHit', onAttackHit);
    bus.on(w, 'attack', onAttackDone, { priority: FIRST });
    bus.on(w, 'hit', onSpecHit, { priority: FIRST });
    bus.on(w, 'boomerangHit', onBoomerangHit);
    bus.on(w, 'tick', (k) => b.projectiles.update(k.frames / 30), { priority: FIRST });
    const decks = c.decks ?? w.players.map(() => Object.keys(c.operators));
    decks.forEach((deck, seat) => {
      for (const key of deck) {
        const facts = o.players?.[seat]?.units?.[key];
        if (Object.hasOwn(kits, key)) install(b, seat, key, kits[key], facts);
        else if (o.players && Object.hasOwn(c.operators, key) && !c.operators[key].summon) addPiece(b, seat, key, plainDef(c, key, facts), facts);
      }
    });
    for (const m of o.modules ?? []) b.safe(() => m.install(b), `content:${m.name}`, null);
    seen?.(b);
  };
}

/**
 * A piece's def with its seat's facts (兼容-7): its chess id (and the normal one as its base), bonds, shop tier, elite
 * form, 特质 (`garrisonIds`, where Stronghold's 特质 read them), over the def its records make — the chess record `raw` too has
 * the elite form (`isGolden`) and the ids, which the kits read —; the def itself without facts.
 * @param {Record<string, any>} def @param {PieceFacts | undefined} facts @returns {Record<string, any>}
 */
function withFacts(def, facts) {
  if (!facts) return def;
  const base = facts.id ? facts.id.replace(/_b$/, '_a') : null;
  // the chess record a kit receives (`def.raw`) carries the elite form and the ids too: kits read `chess.isGolden`
  const raw = { ...def.raw, ...(facts.golden != null ? { isGolden: !!facts.golden } : {}), ...(facts.id ? { chessId: facts.id, baseId: base } : {}) };
  return { ...def, raw, ...(facts.id ? { id: facts.id, baseId: base } : {}), ...(facts.bonds ? { bonds: [...facts.bonds] } : {}),
    ...(facts.tier != null ? { tier: facts.tier } : {}), ...(facts.golden != null ? { golden: !!facts.golden } : {}),
    ...(facts.garrisons ? { garrisonIds: [...facts.garrisons] } : {}) };
}

/**
 * The def of an operator without a kit, as Stronghold's content reads one: its key, name, profession and branch,
 * position and rarity from the content's record — the rarity its shop tier too unless the facts give one, as the kits'
 * records have it (records.js) —, with the facts.
 * @param {Content} c @param {string} key @param {PieceFacts | undefined} facts
 */
function plainDef(c, key, facts) {
  const d = c.operators[key];
  return withFacts({ id: key, baseId: key, charId: d.char ?? key, name: d.name, profession: d.profession ?? null, subProf: d.branch ?? null,
    position: d.position, rarity: d.rarity ?? 1, tier: d.rarity ?? 1, raw: {} }, facts);
}

/**
 * An operator's piece for the whole battle, with the equipment of its facts. @param {ShBattle} b @param {number} seat @param {string} key
 * @param {Record<string, any>} def @param {PieceFacts | undefined} facts
 */
function addPiece(b, seat, key, def, facts) {
  const piece = new ShUnit(b, { kind: 'op', key, ownerId: seat, def, pieceId: reserveIds(b.w, 1) });
  piece.items = [...(facts?.items ?? [])];
  b.pieces.set(`${seat}|${key}`, piece);
  return piece;
}

/**
 * An operator's piece and its kit, installed once. @param {ShBattle} b @param {number} seat @param {string} key @param {KitEntry} entry
 * @param {PieceFacts} [facts]
 */
function install(b, seat, key, entry, facts) {
  const def = withFacts(entry.def, facts), piece = addPiece(b, seat, key, def, facts);
  piece.tokenDefs = entry.tokens ?? {};
  const kit = b.safe(() => entry.factory(def.skill?.bb ?? {}, def.raw, def), 'kit', piece);
  if (!kit) return;
  piece.kit = kit;
  piece.noteTraitGaps(kit.trait);
  if (piece.skill) piece.skill.spec = skillSpecOf(kit, def, !!entry.chess);
  b.safe(() => kit.trait?.install?.(b, piece), 'profile.install', piece);
  for (const t of kit.talents ?? []) b.safe(() => t.install?.(b, piece), 'talent', piece);
  b.safe(() => kit.install?.(b, piece), 'install', piece);
}

/**
 * The kit's spec of the skill the piece fights with (兼容-5), as Stronghold's selectSkillSpec reads a kit: `skills[id]` of the
 * selected skill; else, for a chess kit (`chess`: its piece fights with its chess's own skill), the kit's
 * default `skill`; else none, and the engine's generic effects run the skill (技能-5). An operator kit names
 * every skill it supports in `skills`, so the default does not stand for another skill.
 * @param {Record<string, any>} kit @param {Record<string, any>} def @param {boolean} chess
 * @returns {Record<string, any> | null}
 */
export function skillSpecOf(kit, def, chess) {
  const id = def.skill?.id, own = kit.skills;
  if (id && own && typeof own === 'object' && Object.hasOwn(own, id)) return own[id] ?? null;
  return chess && kit.skill && typeof kit.skill === 'object' ? kit.skill : null;
}

/**
 * A deployment binds the operator's piece to its engine unit and gives its lasting buffs again; a summon becomes its
 * token, with the kit it was spawned with.
 * @param {ShBattle} b @param {Unit} u
 */
function bind(b, u) {
  if (u.kind !== KIND.OPERATOR) return;
  if (u.summoner !== undefined) {
    b.unitOf(u);
    battles.set(u, b);
    return;
  }
  const piece = b.pieces.get(`${u.owner}|${u.key}`);
  if (!piece) return;
  piece.u = u;
  // what a kit set in the piece's `base` goes on each deployment's unit (unit.js base)
  for (const [k, v] of Object.entries(piece.baseSet)) if (k !== 'cost' && k !== 'respawnTime') /** @type {Record<string, any>} */ (u.base)[k] = v;
  piece.deploySeq++;
  piece.lastAttackAt = -Infinity;
  pieceBack(piece);
  battles.set(u, b);
  piece.skill?.applyCost();
  for (const spec of piece.persist) b.giveBuff(piece, spec);
}

/**
 * A unit leaving the field (the `death` event, before any other handler) keeps its exit (兼容-7): an operator's piece
 * (players.js pieceLeft), another unit content has seen its reason and time.
 * @param {ShBattle} b @param {Unit} u @param {string} reason
 */
function left(b, u, reason) {
  const piece = u.kind === KIND.OPERATOR && u.summoner === undefined ? b.pieces.get(`${u.owner}|${u.key}`) : undefined;
  if (piece) {
    if (piece.u === u) pieceLeft(b, piece, reason);
    return;
  }
  const seen = b.others.get(u);
  if (seen) Object.assign(seen, { removeReason: reason, deathAt: b.time });
}

/**
 * What content needs to bring kits into its battles (兼容-4, 兼容-5): the world setup, the skill behaviour of every
 * skill a kit describes, by skill id, the behaviour of a kit's buffs with callbacks, and the trait behaviour of every
 * branch a kitted operator has (职业-6).
 * @param {Record<string, KitEntry>} kits by operator key @param {(b: ShBattle) => void} [seen] @param {ContentInput} [o] Stronghold's content beyond the kits (兼容-7)
 * @returns {{ world: (w: World, c: Content) => void, skills: Record<string, import('@aue/sim').SkillBehavior>, buffs: Record<string, import('@aue/sim').buffs.Behavior>,
 *   traits: Record<string, import('@aue/sim').TraitBehavior> }}
 */
export function kitsBehaviors(kits, seen, o = {}) {
  const ids = Object.values(kits).flatMap((e) => [e.def.skill?.id, ...Object.values(e.tokens ?? {}).map((d) => d.skill?.id)]).filter((id) => typeof id === 'string');
  const branches = [...new Set(Object.values(kits).map((e) => e.def.subProf).filter((x) => typeof x === 'string'))];
  return { world: kitsWorld(kits, seen, o), skills: Object.fromEntries(ids.map((id) => [id, SPEC_BEHAVIOR])), buffs: { [KIT_BUFF]: KIT_BUFF_BEHAVIOR },
    traits: Object.fromEntries(branches.map((x) => [x, KIT_TRAIT_BEHAVIOR])) };
}
