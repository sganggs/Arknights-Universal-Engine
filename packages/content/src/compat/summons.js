// Stronghold's summons over the engine's (docs/spec/compat.md 兼容-4, docs/spec/summons.md 召唤-6): a summon on the
// field is a token to the kits — its id, its owner's unit, the def of its owner's loadout; spawnToken summons one
// through the engine with the kit it brings, installed before any handler of its deployment runs. The battle's methods
// call these.
import { DIR, summons } from '@aue/sim';
import { ShUnit } from './unit.js';
import { normDir } from './sh/dir.js';
import { CompatGap } from './sh/gap.js';
import { summonKey } from '../deckkeys.js';

/** @typedef {import('./battle.js').ShBattle} ShBattle @typedef {import('@aue/sim').Unit} Unit */

/**
 * A kit's setup on a unit (兼容-4): its skill spec, its talents' and its own install.
 * @param {ShBattle} b @param {ShUnit} unit @param {Record<string, any>} kit
 */
export function setupKit(b, unit, kit) {
  unit.kit = kit;
  if (unit.skill) unit.skill.spec = kit.skill ?? null;
  for (const t of kit.talents ?? []) b.safe(() => t.install?.(b, unit), 'talent', unit);
  b.safe(() => kit.install?.(b, unit), 'install', unit);
}

/**
 * A summon on the field as a token (兼容-4): its summon id, its owner's unit and the def of its owner's loadout; the kit
 * spawnToken is placing, installed.
 * @param {ShBattle} b @param {Unit} u @returns {ShUnit}
 */
export function tokenUnit(b, u) {
  const d = b.c.operators[u.key], id = d.char ?? u.key, owner = b.unitById(/** @type {number} */ (u.summoner));
  const s = new ShUnit(b, { kind: 'token', key: id, ownerId: u.owner, def: owner?.tokenDefs[id] ?? { name: d.name }, unit: u, ownerUnit: owner });
  b.others.set(u, s);
  const kit = b.pendingKit;
  b.pendingKit = null;
  if (kit) setupKit(b, s, kit);
  return s;
}

/**
 * Stronghold's spawnToken (兼容-4, 召唤-6): the engine summons `tokenId` for an ally on the field on a tile facing as told
 * (else as the owner), with the kit given; untargetable when told; it retreats after `duration` seconds. Null when the
 * owner is not on the field, has no such summon, or the tile is off the map or taken.
 * @param {ShBattle} b @param {ShUnit | number | null} owner @param {string} tokenId @param {{ row: number, col: number }} tile
 * @param {Record<string, any>} [opts] @returns {ShUnit | null}
 */
export function spawnToken(b, owner, tokenId, tile, opts = {}) {
  for (const k of ['def', 'stats', 'hp']) if (opts[k] != null) throw new CompatGap(`spawnToken.${k}`);
  if (!(owner instanceof ShUnit) || !owner.u || !owner.alive) return null;
  const facing = opts.dir ?? opts.facing, at = { ...tile, ...(facing != null ? { dir: DIR[normDir(facing)] } : {}) };
  b.pendingKit = opts.kit ?? null;
  // the owner's own summon record: a copy of an operator has its own (同步-9)
  const u = summons.spawnSummon(b.w, b.c, owner.u, summonKey(tokenId, owner.u.key) ?? `${tokenId}#${owner.ownerId}`, at);
  b.pendingKit = null;
  if (!u) return null;
  const t = b.unitOf(u);
  if (opts.untargetable) b.addBuff(t, { key: 'trait:untargetable', flags: { untargetable: true }, persist: true });
  const seconds = Number(opts.duration);
  if (seconds > 0) b.after(seconds, () => { if (t.alive) b.retreat(t); }, { owner: t });
  return t;
}

/**
 * Stronghold's raw summon record (`battle.data.rawToken(id)`, 兼容-3): the summon's record at its owner's training — the
 * first piece of the battle that owns it —, its field limit also at the top as Stronghold's tokens.json has it; null for
 * none.
 * @param {ShBattle} b @param {string} id @returns {Record<string, any> | null}
 */
export function rawToken(b, id) {
  for (const p of b.pieces.values()) {
    const raw = p.tokenDefs?.[id]?.raw;
    if (raw) return { ...raw, deployLimit: raw.stats?.deployLimit ?? 1 };
  }
  return null;
}
