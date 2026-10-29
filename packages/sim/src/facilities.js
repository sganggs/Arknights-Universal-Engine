// 堡垒守御's facilities and builders (docs/spec/fortress.md 守御-3…守御-6): a facility's level 0…3 as a buff on its
// device (the raw box invincible, unselectable and not blocking; a level's maximum HP), its progress from the builders'
// hits, its fall back to the box, its effects — builders at a rest, the deploy limit and redeployment, the operators'
// buff, the platform's tile and its operators, the roadblock's blast —; the builders' work and leaving; the rubble pile's
// guards and its advanced builder.
import { secondsToFrames, hypot } from '@aue/math';
import { KIND } from '@aue/schema';
import { DIR_VEC } from './dir.js';
import { makeBuff, addBuff, removeBuff } from './buffs.js';
import { statsOf } from './attrs.js';
import { dealDamage, setHp } from './damage.js';
import { releaseAll } from './blocking.js';
import { rangeKeys } from './targeting.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').FacilityDef} FacilityDef @typedef {import('./types.js').BuilderDef} BuilderDef */

/** The highest level (守御-3). */
export const TOP = 3;
/** A platform's tile once built (守御-5): high ground for ranged operators, a 类障碍物地块 for the enemies' ways (寻路-1). */
const PLATFORM_TILE = Object.freeze({ height: 'HIGHLAND', buildable: 'RANGED', obstacle: true });

/** A unit's facility record, or null. @param {Content} c @param {Unit} u @returns {FacilityDef | null} */
export const facilityOf = (c, u) => (u.kind === KIND.DEVICE ? c.devices?.[u.key]?.facility ?? null : null);

/** A unit's builder record (a deployed card or a level's own), or null. @param {Content} c @param {Unit} u @returns {BuilderDef | null} */
export const builderOf = (c, u) => (u.kind === KIND.DEVICE ? c.devices?.[u.key]?.builder : u.kind === KIND.OPERATOR ? c.operators[u.key]?.builder : null) ?? null;

/** The facilities on the field with their records. @param {World} w @param {Content} c */
export const facilities = (w, c) => (!w.fortress ? [] : w.units.flatMap((u) => { const f = facilityOf(c, u); return f && u.fac ? [{ u, f }] : []; }));

/** The mode of a facility's level (守御-3). @param {FacilityDef} f @param {number} level */
const modeOf = (f, level) => f.modes[Math.min(level, f.modes.length - 1)] ?? {};

/**
 * A facility takes a level (守御-3): its buff for the level — the raw box (0) invincible, unselectable and not blocking; a
 * level's maximum HP — and full HP; the platform's operators are struck down when it falls back to the box (守御-5). The
 * event `facility` tells it.
 * @param {World} w @param {Content} c @param {Unit} u @param {FacilityDef} f @param {number} level
 */
export function setLevel(w, c, u, f, level) {
  const fac = /** @type {NonNullable<Unit['fac']>} */ (u.fac), was = fac.level;
  fac.level = level;
  fac.top = Math.max(fac.top, level);
  removeBuff(u, 'facility');
  const hp = modeOf(f, level).max_hp ?? 0;
  addBuff(u, level === 0 ? makeBuff({ key: 'facility', mods: { blockCntMul: 0 }, flags: { invincible: true, untargetable: true } })
    : makeBuff({ key: 'facility', mods: hp ? { hpPct: hp } : {} }));
  setHp(u, statsOf(u).maxHp);
  if (f.kind === 'platform' && was > 0 && level === 0) {
    for (const op of w.units) if (op.kind === KIND.OPERATOR && op.hp > 0 && Math.round(op.x) === u.x && Math.round(op.y) === u.y) setHp(op, 0);
  }
  w.events.push({ type: 'facility', id: u.id, level });
}

/** Every facility at level 0 when the battle starts (守御-3); a rubble pile unselectable and unharmed (守御-6). @param {World} w @param {Content} c */
export function setUpFacilities(w, c) {
  for (const u of w.units) {
    if (u.kind === KIND.DEVICE && c.devices?.[u.key]?.rubble) addBuff(u, makeBuff({ key: 'rubble', flags: { invincible: true, untargetable: true } }));
    const f = facilityOf(c, u);
    if (!f || u.fac) continue;
    u.fac = { level: 0, top: 0, pts: 0 };
    setLevel(w, c, u, f, 0);
  }
}

/**
 * A builder's hit (守御-3): progress by its key (sp or sp2) of the facility's mode; at the mode's cost the facility goes
 * up — a box rebuilt goes back to the highest level it reached, else one level up —, the progress cleared; what is over
 * is dropped. @param {World} w @param {Content} c @param {Unit} u the facility @param {FacilityDef} f @param {'sp' | 'sp2'} key
 */
export function build(w, c, u, f, key) {
  const fac = /** @type {NonNullable<Unit['fac']>} */ (u.fac), mode = modeOf(f, fac.level);
  if (fac.level >= TOP) return;
  fac.pts += mode[key] ?? 0;
  if (fac.pts < (mode.cost ?? Infinity)) return;
  fac.pts = 0;
  setLevel(w, c, u, f, fac.level === 0 && fac.top > 0 ? fac.top : Math.min(TOP, fac.top + 1));
}

/**
 * A facility's lethal hit (守御-3): the hit taken away, its progress cleared, back to the raw box; a roadblock at level 3
 * blasts the ground enemies within 1 tile first (守御-5). @param {World} w @param {Content} c @param {Unit} u @param {FacilityDef} f
 */
export function fallBack(w, c, u, f) {
  const fac = /** @type {NonNullable<Unit['fac']>} */ (u.fac);
  if (f.kind === 'roadblock' && fac.level === TOP && f.boom) {
    for (const e of w.units.filter((x) => x.kind === KIND.ENEMY && x.hp > 0 && !statsOf(x).flying && hypot(x.x - u.x, x.y - u.y) <= 1)) {
      dealDamage(w, u, e, { type: 'phys', amount: f.boom }, c);
    }
  }
  releaseAll(w, u.id);
  fac.pts = 0;
  setLevel(w, c, u, f, 0);
}

/** A rest begins (守御-2): every facility back at the highest level it reached. @param {World} w @param {Content} c */
export function restoreFacilities(w, c) {
  for (const { u, f } of facilities(w, c)) if (u.fac && u.fac.level < u.fac.top) setLevel(w, c, u, f, u.fac.top);
}

/** What the built facilities give (守御-5): the sum of a key over the facilities of a kind. @param {World} w @param {Content} c @param {string} kind @param {string} key */
export function facilitySum(w, c, kind, key) {
  return facilities(w, c).filter(({ f, u }) => f.kind === kind && /** @type {any} */ (u.fac).level > 0).reduce((n, { f, u }) => n + (modeOf(f, /** @type {any} */ (u.fac).level)[key] ?? 0), 0);
}

/** The redeployment time's factor (守御-5): 0.8 while a 临时休息舱 is at level 3. @param {World} w @param {Content} c */
export const respawnFactor = (w, c) => (facilities(w, c).some(({ f, u }) => f.kind === 'lounge' && /** @type {any} */ (u.fac).level === TOP) ? 0.8 : 1);

/**
 * The operators' buffs from the facilities (守御-5): the 便携健身架's on every operator but devices' cards, and the attack
 * speed of an operator on a platform at level 3; kept as they are while nothing changed. @param {World} w @param {Content} c
 */
export function facilityBuffs(w, c) {
  const gym = { hpPct: facilitySum(w, c, 'gym', 'max_hp'), atkPct: facilitySum(w, c, 'gym', 'atk'), spRecoveryFlat: facilitySum(w, c, 'gym', 'sp_recovery_per_sec') };
  const mods = Object.fromEntries(Object.entries(gym).filter(([, v]) => v !== 0));
  const top = facilities(w, c).filter(({ f, u }) => f.kind === 'platform' && /** @type {any} */ (u.fac).level === TOP).map(({ u }) => u);
  for (const op of w.units.filter((u) => u.kind === KIND.OPERATOR && c.operators[u.key]?.profession !== 'TRAP')) {
    syncBuff(op, 'fortress:gym', mods);
    const on = top.find((p) => Math.round(op.x) === p.x && Math.round(op.y) === p.y);
    syncBuff(op, 'fortress:platform', on ? { aspd: modeOf(/** @type {FacilityDef} */ (facilityOf(c, on)), TOP).attack_speed ?? 0 } : {});
  }
}

/** A buff with these mods on a unit, none when they are empty; left alone when it already has them. @param {Unit} u @param {string} key @param {Record<string, number>} mods */
function syncBuff(u, key, mods) {
  const had = u.buffs.find((b) => b.key === key), empty = Object.keys(mods).length === 0;
  if (had && !empty && JSON.stringify(had.mods) === JSON.stringify(mods)) return;
  if (had) removeBuff(u, key);
  if (!empty) addBuff(u, makeBuff({ key, mods }));
}

/** Per content, the content whose map has these platforms built (守御-5) and these devices standing (寻路-1), by their tiles. @type {WeakMap<Content, Map<string, Content>>} */
const BUILT = new WeakMap();

/** The tile of a device that blocks routes (寻路-1: 阵地屏障, 足球-12): a 类障碍物地块 while it stands. */
const BLOCKER_TILE = Object.freeze({ obstacle: true });

/** The tiles [row, col] of the devices on the field that block routes (寻路-1). @param {World} w @param {Content} c */
const blockerTiles = (w, c) => (c.devices ? w.units.filter((u) => u.kind === KIND.DEVICE && u.hp > 0 && !u.hidden && c.devices?.[u.key]?.routeBlock).map((u) => [Math.round(u.y), Math.round(u.x)]) : []);

/**
 * The content as the facilities and devices make the field now (守御-5, 寻路-1): its map with every built platform's
 * tile high ground for ranged operators and a 类障碍物地块, and every route-blocking device's tile a 类障碍物地块 — the
 * same content while there are none. Made once for each set of them (the maps' flow fields are cached beside them,
 * 寻路-1). @param {World} w @param {Content} c @returns {Content}
 */
export function fieldContent(w, c) {
  const built = w.fortress ? facilities(w, c).filter(({ f, u }) => f.kind === 'platform' && /** @type {any} */ (u.fac).level > 0).map(({ u }) => [u.y, u.x]) : [];
  const blockers = blockerTiles(w, c);
  if (built.length === 0 && blockers.length === 0) return c;
  const keyOf = (/** @type {number[][]} */ cells) => cells.map(([r, col]) => r * c.level.width + col).sort((a, b) => a - b).join(';');
  const key = `${keyOf(built)}|${keyOf(blockers)}`;
  let byKey = BUILT.get(c);
  if (!byKey) { byKey = new Map(); BUILT.set(c, byKey); }
  const hit = byKey.get(key);
  if (hit) return hit;
  const tiles = c.level.tiles.map((row) => [...row]);
  for (const [r, col] of built) tiles[r][col] = { ...tiles[r][col], ...PLATFORM_TILE };
  for (const [r, col] of blockers) if (tiles[r]?.[col]) tiles[r][col] = { ...tiles[r][col], ...BLOCKER_TILE };
  const made = { ...c, level: { ...c.level, tiles } };
  byKey.set(key, made);
  return made;
}

/** A built platform on a tile (守御-5): operators stand on it. @param {World} w @param {Content} c @param {number} row @param {number} col */
export const builtPlatform = (w, c, row, col) => facilities(w, c).some(({ f, u }) => f.kind === 'platform' && u.x === col && u.y === row && /** @type {any} */ (u.fac).level > 0);

/** The facility a builder faces (守御-4): the one on the tile in front of it, not at the highest level; else null. @param {World} w @param {Content} c @param {Unit} b */
function facing(w, c, b) {
  const [dr, dc] = DIR_VEC[b.dir], row = Math.round(b.y) + dr, col = Math.round(b.x) + dc;
  return facilities(w, c).find(({ u }) => u.x === col && u.y === row && /** @type {any} */ (u.fac).level < TOP) ?? null;
}

/**
 * The builders' work this frame (守御-4): from a second after it arrived, a hit a second on the facility it faces; after
 * its hits, or its time, it goes — one that never hit gives its card back. @param {World} w @param {Content} c
 * @param {(seat: number, key: string) => void} giveBack
 */
export function tickBuilders(w, c, giveBack) {
  for (const u of [...w.units]) {
    const b = builderOf(c, u);
    if (!b || u.hp <= 0) continue;
    const st = (u.bld ??= { hits: 0, next: w.frame + secondsToFrames(1), leave: w.frame + secondsToFrames(b.life) });
    if (w.frame >= st.next) {
      const t = facing(w, c, u);
      if (t) { build(w, c, t.u, t.f, b.sp); st.hits++; }
      st.next += secondsToFrames(1);
    }
    if (st.hits < b.hits && w.frame < st.leave) continue;
    w.units.splice(w.units.indexOf(u), 1);
    w.events.push({ type: 'retreat', id: u.id });
    if (st.hits === 0 && u.kind === KIND.OPERATOR) giveBack(u.owner, u.key);
  }
}

/**
 * Whether a builder may be placed on a tile (守御-4): next to a facility not at the highest level (up, down, left or right).
 * @param {World} w @param {Content} c @param {number} row @param {number} col
 */
export const nextToFacility = (w, c, row, col) => facilities(w, c).some(({ u }) => /** @type {any} */ (u.fac).level < TOP && Math.abs(u.x - col) + Math.abs(u.y - row) === 1);

/**
 * The rubble pile this frame (守御-6): the enemies in its range at a taunt level 1 lower; from `first` seconds into the
 * defence, every `every` seconds, with no enemy in its range, every seat gets an advanced builder, once a defence.
 * @param {World} w @param {Content} c @param {(seat: number) => void} free
 */
export function tickRubble(w, c, free) {
  const f = /** @type {NonNullable<World['fortress']>} */ (w.fortress), grid = { rows: c.level.height, cols: c.level.width };
  const piles = w.units.flatMap((u) => { const r = u.kind === KIND.DEVICE ? c.devices?.[u.key]?.rubble : null; return r ? [{ r, keys: rangeKeys(grid, u, r.cells) }] : []; });
  if (piles.length === 0) return;
  const inRange = (/** @type {Unit} */ e, /** @type {Set<number>} */ keys) => e.kind === KIND.ENEMY && e.hp > 0 && keys.has(Math.round(e.y) * c.level.width + Math.round(e.x));
  for (const e of w.units) if (e.kind === KIND.ENEMY) syncBuff(e, 'rubble:taunt', piles.some((p) => inRange(e, p.keys)) ? { taunt: -1 } : {});
  if (f.phase !== 'defend' || f.freed) return;
  const since = w.frame - f.start;
  for (const { r, keys } of piles) {
    const first = secondsToFrames(r.first), every = secondsToFrames(r.every);
    if (since < first || (since - first) % every !== 0 || w.units.some((e) => inRange(e, keys))) continue;
    f.freed = true;
    w.players.forEach((_, seat) => free(seat));
    return;
  }
}
