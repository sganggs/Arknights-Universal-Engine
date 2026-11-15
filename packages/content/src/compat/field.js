// What Stronghold's battle answers about the field and does on it (docs/spec/compat.md 兼容-4), over the engine's own:
// the enemies on tiles or within a radius that an ability may select (索敌-2), the unit on a tile, the enemies a unit
// blocks; damage (伤害-7, 元素-2), healing (伤害-11), 生命流失 (伤害-10), retreat (撤退-1) and 移动 (部署-9). The battle's methods
// (battle.js) call these; units are the kits' (unit.js).
import { KIND, attrs, body, constants, damage, traits, elements, deck, blocking, routes, paths, sp, targeting, moveOperator, canMoveTo } from '@aue/sim';
import { absoluteRangeKeys, canTargetEnemy } from './sh/targeting.js';
import { bodyInKeys, bodyInRange } from './sh/body.js';
import { localOrder } from './sh/dir.js';
import { ELEMENT } from './mods.js';
import { CompatGap } from './sh/gap.js';

/** @typedef {import('./battle.js').ShBattle} ShBattle @typedef {import('./unit.js').ShUnit} ShUnit @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').damage.Damage} Damage */

/** The level's grid. @param {ShBattle} b */
const gridOf = (b) => ({ rows: b.c.level.height, cols: b.c.level.width });

/**
 * Whether an operator searches its range by the tile of each enemy's position, not by its collider (体积-5: 谬因's trait
 * data). @param {ShBattle} b @param {ShUnit | null} attacker
 */
const searchesByTile = (b, attacker) => {
  if (attacker?.profile?.rangeTiles === true) return true;
  const u = attacker?.u;
  return !!u && u.kind === KIND.OPERATOR && traits.traitOf(b.c, u).rangeTiles === true;
};

/**
 * Targetable enemies on the given tiles, in the keys' order, each once (索敌-2). `byTile`: the tile it occupies
 * (体积-1, a huge one's rectangle 体积-2). Otherwise the tiles its collider overlaps (体积-5).
 * @param {ShBattle} b @param {Iterable<number> | null | undefined} keys @param {ShUnit | null} attacker
 * @param {Record<string, any> | undefined} profile @param {boolean} byTile @returns {ShUnit[]}
 */
function enemiesOn(b, keys, attacker, profile, byTile) {
  if (!keys) return [];
  const g = gridOf(b), out = /** @type {ShUnit[]} */ ([]);
  const list = b.enemies.map((e) => ({ e, at: byTile ? body.bodyKeys(e, g) : body.colliderKeys(e, g, constants.ENEMY_COLLIDER_RADIUS) }));
  for (const k of keys) {
    for (const { e, at } of list) if (at.includes(k) && !out.includes(e) && canTargetEnemy(attacker, e, profile)) out.push(e);
  }
  return out;
}

/**
 * The enemies in the range of the tile keys that `attacker` may select with `profile` (索敌-2): by collider (体积-5),
 * or by the occupied tile when the attacker searches by tile (谬因, `profile.rangeTiles`).
 * @param {ShBattle} b @param {Iterable<number> | null | undefined} keys @param {ShUnit | null} attacker @param {Record<string, any>} [profile]
 * @returns {ShUnit[]}
 */
export function enemiesInKeys(b, keys, attacker, profile) {
  return enemiesOn(b, keys, attacker, profile, searchesByTile(b, attacker));
}

/**
 * The enemies standing on the tile keys (格子判定): the occupied tile, a huge one's rectangle, not the collider.
 * @param {ShBattle} b @param {Iterable<number> | null | undefined} keys @param {ShUnit | null} [attacker] @param {Record<string, any>} [profile]
 * @returns {ShUnit[]}
 */
export function enemiesOnTiles(b, keys, attacker = null, profile) {
  return enemiesOn(b, keys, attacker, profile, true);
}

/**
 * The enemies on the field within `r` tiles of (x, y): a huge one by its body unless `centre`, which counts every one
 * by its position.
 * @param {ShBattle} b @param {number} x @param {number} y @param {number} r @param {boolean} [centre] @returns {ShUnit[]}
 */
export function enemiesInRadius(b, x, y, r, centre = false) {
  const r2 = r * r + 1e-9;
  return b.enemies.filter((e) => e.alive && !e.hidden && (e.hitArea && !centre ? body.bodyInRadius(e, x, y, r) : (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) <= r2));
}

/** Those of them an ability may select: not 无法选中, not 隐匿 in effect (索敌-2). @param {ShBattle} b @param {number} x @param {number} y @param {number} r @param {boolean} [centre] */
export function foesInRadius(b, x, y, r, centre = false) {
  return enemiesInRadius(b, x, y, r, centre).filter((e) => {
    const u = /** @type {Unit} */ (e.u);
    return !attrs.statsOf(u).flags.untargetable && !targeting.stealthed(u);
  });
}

/**
 * foesInRadius by the enemies' colliders (体积-5, 常量-6): a regular enemy whose centre is within `r` plus the collider
 * radius, a huge one whose rectangle is within `r` (体积-3).
 * @param {ShBattle} b @param {number} x @param {number} y @param {number} r @returns {ShUnit[]}
 */
export function foesInColliderRadius(b, x, y, r) {
  return foesInRadius(b, x, y, r + constants.ENEMY_COLLIDER_RADIUS).filter((e) => !e.hitArea || body.bodyInRadius(e, x, y, r));
}

/**
 * The allies on the field within `r` of (x, y) by their centres, as Stronghold's: not hidden, devices only when asked, of
 * one player when `ownerId` is given.
 * @param {ShBattle} b @param {number} x @param {number} y @param {number} r @param {{ ownerId?: number | null, includeDevices?: boolean }} [o]
 */
export function alliesInRadius(b, x, y, r, o = {}) {
  const r2 = r * r + 1e-9;
  return b.allyUnits.filter((a) => a.alive && !a.hidden && (o.includeDevices || a.kind !== 'device') && (o.ownerId == null || a.ownerId === o.ownerId)
    && (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y) <= r2);
}

/** The ally on a tile, or null. @param {ShBattle} b @param {number} r @param {number} c */
export function unitAt(b, r, c) {
  return b.allyUnits.find((a) => a.alive && a.tileR === r && a.tileC === c) ?? null;
}

/** The allies on the field in a unit's attack range that it may select (孤立 aside), not devices. @param {ShBattle} b @param {ShUnit} unit */
export function alliesInGrid(b, unit) {
  const keys = unit.rangeKeySet, g = gridOf(b);
  return b.allies().filter((a) => !a.hidden && body.bodyKeys(a, g).some((k) => keys.has(k)) && b.allySelectable(a, unit));
}

/**
 * The allies on the tile keys a healer may heal that need it — HP below the maximum (or, with `element`, 元素损伤 taken) —,
 * the lowest HP ratio first; one under 禁疗 or no ally may heal only for itself.
 * @param {ShBattle} b @param {Iterable<number> | null | undefined} keys @param {ShUnit | null} healer @param {boolean} [element]
 */
export function injuredAlliesInKeys(b, keys, healer, element = false) {
  if (!keys) return [];
  const set = new Set(keys), g = gridOf(b);
  const out = b.allies().filter((a) => {
    const s = attrs.statsOf(/** @type {Unit} */ (a.u));
    if (a.hidden || !body.bodyKeys(a, g).some((k) => set.has(k))) return false;
    if (a !== healer && (s.flags.healFree || s.flags.noAllyHeal)) return false;
    return a.hp < s.maxHp - 1e-6 || (element && Object.keys(/** @type {Unit} */ (a.u).ep ?? {}).length > 0);
  });
  return out.map((a, i) => ({ a, i })).sort((x, y) => x.a.hpRatio - y.a.hpRatio || x.i - y.i).map((x) => x.a);
}

/** Whether a tile takes no unit placed by content: off the map, or a unit on it. @param {ShBattle} b @param {number} r @param {number} c */
export function isReservedTile(b, r, c) {
  return !b.grid.inBounds(r, c) || b.w.units.some((u) => u.hp > 0 && u.kind === KIND.OPERATOR && body.tileOf(u)[0] === r && body.tileOf(u)[1] === c);
}

/**
 * Whether (r, c) is a board tile (兼容-4, INF-0352): in bounds and a melee or ranged operator can stand there. Not
 * whether a unit already occupies it (that is isReservedTile). AUE levels have no hand rows.
 * @param {ShBattle} b @param {number} r @param {number} c
 */
export function onFieldBoard(b, r, c) {
  return b.grid.inBounds(r, c) && (b.grid.canStand(r, c) || b.grid.canStand(r, c, { ranged: true }));
}

/**
 * Units of `side` (default the opposite of `unit`) inside `grid` offsets from the unit's tile (体积-1). An attacker
 * with `rangeTiles` uses the occupied tile (bodyInKeys); otherwise a range (bodyInRange, 体积-5).
 * @param {ShBattle} b @param {ShUnit} unit @param {readonly number[][] | null | undefined} grid
 * @param {{ side?: string | null, extend?: number }} [o] @returns {ShUnit[]}
 */
export function unitsInGrid(b, unit, grid, o = {}) {
  if (!unit) return [];
  const side = o.side ?? (unit.side === 'ally' ? 'enemy' : 'ally');
  const keys = new Set(absoluteRangeKeys(grid || unit.rangeGrid || [[0, 0]], unit.tileR, unit.tileC, unit.dir, o.extend || 0));
  const tiles = unit.profile?.rangeTiles === true;
  const list = side === 'enemy' ? b.enemies : b.allyUnits;
  return list.filter((x) => x.alive && !x.hidden && (tiles ? bodyInKeys(x, keys) : bodyInRange(x, keys)));
}

/** What is left of an enemy's route, in tiles (索敌-6). @param {ShBattle} b @param {ShUnit} e */
export const remainingDistance = (b, e) => (e?.u && e.u.kind === KIND.ENEMY ? routes.pathDistance(b.c, e.u) : 0);

/** A unit lets go of every enemy it blocks (阻挡-3). @param {ShBattle} b @param {ShUnit} u */
export function releaseBlocked(b, u) {
  if (u?.u) blocking.releaseAll(b.w, u.u.id);
}

/** The enemies a unit blocks that it may select with `profile`. @param {ShUnit} u @param {Record<string, any>} [profile] */
export const blockedTargets = (u, profile) => (u?.blocking ?? []).filter((e) => canTargetEnemy(u, e, profile));

/** The hits kits deal themselves (not the engine's attacks'), for the attack overrides that act on an attack's own (specs.js). @type {WeakSet<object>} */
export const kitHits = new WeakSet();

/**
 * Stronghold's damage info as the engine's hit (the same names, ADR 0012): a copy, its amount a number; marked as a
 * kit's own hit.
 * @param {Record<string, any>} d @returns {Damage}
 */
function hitOf(d) {
  const hit = /** @type {Damage} */ ({ ...d, type: d.type ?? 'phys', amount: Number.isFinite(+d.amount) ? +d.amount : 0, tags: [...(d.tags ?? [])],
    ...(d.ignoreSleep ? { throughSleep: true } : {}), ...dodgeOf(d) });
  kitHits.add(hit);
  return hit;
}

/**
 * A request's dodge (Stronghold v0.3.2's `dodgeMode`, `ignoreCancelReasons`) as the engine's (伤害-12): 'ignore' draws no
 * dodge (`canDodge` false); 'uncancellable', or 'dodge' or 'miss' among the reasons it refuses, draws one that cannot
 * cancel it (`noDodgeCancel`).
 * @param {Record<string, any>} d
 */
function dodgeOf(d) {
  if (d.dodgeMode === 'ignore') return { canDodge: false };
  const refuses = Array.isArray(d.ignoreCancelReasons) && (d.ignoreCancelReasons.includes('dodge') || d.ignoreCancelReasons.includes('miss'));
  return d.dodgeMode === 'uncancellable' || refuses ? { noDodgeCancel: true } : {};
}

/**
 * Damage from a unit, or from none (伤害-7): an operator's is credited with a kill (职业-5); 元素损伤 (`type` 'element')
 * goes to the target's element (元素-2). Returns the HP taken (the 元素损伤 dealt).
 * @param {ShBattle} b @param {ShUnit | null} source @param {ShUnit} target @param {Record<string, any>} dmg
 */
export function dealDamage(b, source, target, dmg) {
  const t = target?.u, s = source?.u ?? null;
  if (!t || !target.alive) return 0;
  if (dmg.type === 'element') {
    const el = ELEMENT[dmg.element];
    return el ? elements.dealEp(b.w, t, el, Number(dmg.amount) || 0, s) : 0;
  }
  if (dmg.calculation === 'resolved') throw new CompatGap('attack.calculation.resolved');
  if (dmg.onApplied != null) throw new CompatGap('attack.onApplied');
  const hit = hitOf(dmg);
  return s && s.kind === KIND.OPERATOR ? traits.creditedDamage(b.w, b.c, s, t, hit) : damage.dealDamage(b.w, s, t, hit);
}

/**
 * Who a hit comes from as the engine says it (伤害-7): a source, or with no source but a `credit`, the credited unit
 * with the hit `sourceless`. A credit other than the source while there is one has no counterpart.
 * @param {ShUnit | null | undefined} source @param {ShUnit | null | undefined} credit @returns {{ from: ShUnit | null, sourceless: boolean }}
 */
function originOf(source, credit) {
  if (source) {
    if (credit !== undefined && credit !== source) throw new CompatGap('attack.credit');
    return { from: source, sourceless: false };
  }
  return { from: credit ?? null, sourceless: !!credit };
}

/**
 * Stronghold's damage call (伤害-7) in either form: the request of v0.3.2 (`{ source, credit, target, amount, type, … }`)
 * or the positional one (`source, target, dmg, opts`), where `opts.credit` names the unit a hit with no source is
 * credited to.
 * @param {ShBattle} b @param {any[]} args
 */
export function damageCall(b, args) {
  if (args.length === 1) {
    const { source = null, credit, target, ...d } = args[0] ?? {};
    const o = originOf(source, credit);
    return dealDamage(b, o.from, target, { ...d, ...(o.sourceless ? { sourceless: true } : {}) });
  }
  const [source, target, dmg, opts] = args;
  const o = source ? { from: source, sourceless: false } : originOf(null, opts?.credit);
  return dealDamage(b, o.from, target, { ...dmg, ...(o.sourceless ? { sourceless: true } : {}) });
}

/**
 * Stronghold's 元素损伤 request (元素-2): `{ source, credit, target, element, amount }` with Stronghold's element name.
 * The element taken.
 * @param {ShBattle} b @param {Record<string, any>} req
 */
export function elementDamage(b, req) {
  const { source = null, credit, target, ...d } = req ?? {};
  return dealDamage(b, source ?? credit ?? null, target, { ...d, type: 'element' });
}

/**
 * Stronghold's element recovery (职业-12): each element value of the unit — or only the one named — rises by the amount,
 * not during a burst. The total risen.
 * @param {ShUnit} target @param {number} amount @param {string | null} [element] Stronghold's name
 */
export function healElement(target, amount, element = null) {
  if (!target?.u || !target.alive) return 0;
  const el = element == null ? null : ELEMENT[/** @type {keyof typeof ELEMENT} */ (element)];
  if (el === undefined) return 0;
  return elements.restoreEp(target.u, Number(amount) || 0, /** @type {any} */ (el));
}

/**
 * A heal (伤害-11); its `heal` event shows the kit's options (Stronghold's `opts`: `regen`, `self`, `tags`, …).
 * @param {ShBattle} b @param {ShUnit | null} source @param {ShUnit} target @param {number} amount @param {Record<string, any>} [opts]
 */
export function heal(b, source, target, amount, opts) {
  if (!target?.u || !target.alive) return 0;
  const before = b.healOpts;
  b.healOpts = opts && typeof opts === 'object' ? opts : {};
  try {
    return damage.heal(b.w, source?.u ?? null, target.u, Number(amount) || 0);
  } finally {
    b.healOpts = before;
  }
}

/**
 * 生命流失 (伤害-10), tagged as Stronghold tags it (`hpLoss`, the tags of the hit it comes `from`, its own). Since v0.3.2 a
 * loss may be typed: 'phys' or 'arts' first takes the target's defence or resistance (伤害-1…伤害-5, with the
 * penetration the options give), 'true' (the default) is an amount already mitigated. With no source, a `credit` names
 * the unit it counts for; so does the source of a `sourceless` loss.
 * @param {ShBattle} b @param {ShUnit} target @param {number} amount
 * @param {Record<string, any>} [o] `source`, `credit`, `sourceless`, `tags`, `from`, `type`, penetration
 */
export function loseHp(b, target, amount, o = {}) {
  const type = lossType(o.type);
  if (!target?.u || !target.alive || !(amount > 0)) return 0;
  const lost = type === 'true' ? amount : damage.mitigate(amount, type, attrs.statsOf(target.u), damage.penetration(null, o));
  if (!(lost > 0)) return 0;
  const tags = [...new Set(['hpLoss', ...(o.from?.tags ?? []), ...(o.tags ?? [])])];
  const { who, sourceless } = lossOrigin(o);
  return damage.dealDamage(b.w, who?.u ?? null, target.u, { type, amount: lost, hpLoss: true, tags, ...(sourceless ? { sourceless: true } : {}) });
}

/**
 * A 生命流失's type: 'phys', 'arts' or 'true' (the default). @param {unknown} t @returns {'phys' | 'arts' | 'true'}
 */
function lossType(t) {
  if (t === undefined || t === null) return 'true';
  if (t !== 'phys' && t !== 'arts' && t !== 'true') throw new TypeError('HP loss supports phys, arts or true');
  return t;
}

/**
 * Whom a 生命流失 counts for and whether its events see no source: its source; with none, its `credit`, unseen; a
 * `sourceless` loss (or one from a sourceless hit) unseen too.
 * @param {Record<string, any>} o @returns {{ who: ShUnit | null, sourceless: boolean }}
 */
function lossOrigin(o) {
  const who = o.source ?? o.credit ?? null;
  return { who, sourceless: !!o.sourceless || !!o.from?.sourceless || (!o.source && !!o.credit) };
}

/**
 * Stronghold's 生命流失 call in either form (v0.3.2): the request `{ source, credit, target, amount, type, origin, … }` or
 * the positional `target, amount, opts`.
 * @param {ShBattle} b @param {any[]} args
 */
export function hpLossCall(b, args) {
  if (args.length !== 1) return loseHp(b, args[0], args[1], args[2] ?? {});
  const { target, amount, origin, ...o } = args[0] ?? {};
  return loseHp(b, target, amount, { ...o, from: origin ?? null });
}

/** An operator leaves the field as a retreat (撤退-1). @param {ShBattle} b @param {ShUnit} unit */
export function retreat(b, unit) {
  if (unit?.u && unit.alive && unit.u.kind === KIND.OPERATOR) deck.withdraw(b.w, b.c, unit.u);
}

/**
 * Whether Stronghold would let a living ally 移动 onto (r, c) — a tile of the field no other living ally stands on — and
 * the engine would not retreat it instead (部署-9).
 * @param {ShBattle} b @param {ShUnit} unit @param {number} r @param {number} c
 */
function mayMove(b, unit, r, c) {
  const u = unit?.u, occ = unitAt(b, r, c);
  if (!u || unit.side !== 'ally' || !unit.alive || !Number.isInteger(r) || !Number.isInteger(c) || !b.grid.inRect(r, c)) return false;
  return !(occ && occ !== unit) && canMoveTo(b.w, b.c, u, r, c);
}

/**
 * Stronghold's moveRedeploy: a living ally's 移动 (部署-9) that keeps its buffs, skill and HP, as Stronghold's does
 * (DIF-0034); where it may not (mayMove), false and nothing changes. `clearSp`: its SP emptied first, unless a timed
 * skill runs. A new deployment of its piece (`deploySeq`).
 * @param {ShBattle} b @param {ShUnit} unit @param {number} r @param {number} c @param {{ clearSp?: boolean }} [o]
 */
export function moveRedeploy(b, unit, r, c, o = {}) {
  if (!mayMove(b, unit, r, c)) return false;
  const u = /** @type {Unit} */ (unit.u), sk = unit.skill;
  if (o.clearSp && u.skill && sk && sk.kind !== 'passive' && !(sk.active && sk.isTimed)) sp.setSp(u.skill, 0);
  unit.deploySeq++;
  return !!moveOperator(b.w, b.c, u, { row: r, col: c }, { keep: true });
}

/**
 * The ground tiles the field's enemies walk on (Stronghold's groundPathTiles): of every route the level's waves spawn on
 * that is not a flying one (every such route when none is named), the tiles its way crosses (寻路-2) from its start
 * through its MOVE and APPEAR_AT_POS checkpoints to its end. Tile keys.
 * @param {ShBattle} b @returns {Set<number>}
 */
export function groundPathTiles(b) {
  const lv = b.c.level, out = new Set();
  const used = new Set(lv.waves.flatMap((w) => w.fragments.flatMap((f) => f.actions)).filter((a) => a.type === 'SPAWN' && Number.isInteger(a.route)).map((a) => a.route));
  const walks = (/** @type {any} */ r) => !!r && r.motion !== 'FLY';
  const any = [...used].some((i) => walks(lv.routes[i]));
  const keyOf = (/** @type {{ row: number, col: number }} */ p) => Math.max(0, Math.min(lv.height - 1, Math.round(p.row))) * lv.width + Math.max(0, Math.min(lv.width - 1, Math.round(p.col)));
  lv.routes.forEach((r, i) => {
    if (!walks(r) || (any && !used.has(i))) return;
    const pts = [r.start, ...r.checkpoints.filter((cp) => cp.type === 'MOVE' || cp.type === 'APPEAR_AT_POS'), r.end].map(keyOf);
    for (let j = 1; j < pts.length; j++) for (const k of paths.routeTiles(lv, pts[j - 1], pts[j], { diagonal: r.allowDiagonal ?? true }) ?? []) out.add(k);
  });
  return out;
}

/** Lexicographic a < b of two local (row, col) offsets; none to beat ⇒ true (Stronghold's localBefore). @param {number[]} a @param {number[] | null} b */
const localBefore = (a, b) => !b || a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

/**
 * Stronghold's tactical point (战术点) for a unit's reinforcements, ported: a free walkable ground tile of its attack
 * range — on an enemy ground path first (groundPathTiles), then the nearest (Chebyshev; the smaller sideways offset in
 * its facing frame breaks ties), then the lowest local (row, col) offset. [row, col], or null for none.
 * @param {ShBattle} b @param {ShUnit} unit @returns {[number, number] | null}
 */
export function findTacticalPoint(b, unit) {
  if (!unit?.u) return null;
  const onPath = groundPathTiles(b), cols = b.c.level.width;
  /** @type {[number, number] | null} */
  let best = null, bo = /** @type {number[] | null} */ (null);
  let bp = 2, bd = Infinity;
  for (const k of unit.rangeKeys) {
    const r = Math.floor(k / cols), c = k % cols;
    if (!b.grid.groundPassable(r, c) || !b.grid.canStand(r, c) || isReservedTile(b, r, c)) continue;
    const o = localOrder(r - unit.tileR, c - unit.tileC, unit.dir), d = Math.max(Math.abs(r - unit.tileR), Math.abs(c - unit.tileC)) + 0.01 * Math.abs(o[0]);
    if (!(d > 0)) continue;
    const p = onPath.has(k) ? 0 : 1;
    if (p < bp || (p === bp && (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && localBefore(o, bo))))) { bp = p; bd = d; bo = o; best = [r, c]; }
  }
  return best;
}
