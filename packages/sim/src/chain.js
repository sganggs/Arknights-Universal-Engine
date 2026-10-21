// Chains and zones (docs/spec/traits.md 职业-11): an attack or heal that jumps on from its first target, each jump at a
// share of the one before; the 倍率 a trait gives targets inside (or outside) a set of tiles near the operator; the heal
// an operator gives for the damage its attack deals.
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { DEFAULT_DIR } from './dir.js';
import { rangeKeys, inKeys, selectable, sortHealTargets, precisionKey, hostile } from './targeting.js';
import { reachKeys } from './reach.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Chain} Chain @typedef {import('./types.js').TraitDef} TraitDef */

/** @param {Content} c */
const gridOf = (c) => ({ rows: c.level.height, cols: c.level.width });

/**
 * The 倍率 a trait's zone gives a target (职业-11): its scale when the target has a tile among the zone's cells around
 * the operator (turned with it) — or, for a zone that scales the outside, when it has none; otherwise 1.
 * @param {Content} c @param {Unit} op @param {Unit} t @param {TraitDef} tr
 */
export function zoneScale(c, op, t, tr) {
  if (!tr.zone) return 1;
  const grid = gridOf(c), inside = inKeys(t, rangeKeys(grid, op, tr.zone.cells), grid);
  return inside !== tr.zone.outside ? tr.zone.scale : 1;
}

/** Squared distance between two units' positions. @param {Unit} a @param {Unit} b */
const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/**
 * The next enemy a damage chain jumps to from `at` (职业-11): a selectable enemy within the radius that the chain has
 * not reached — 迷彩 or not (INF-0290), not while 隐匿 is in effect, flying ones only when the attacker can hit them;
 * the nearest, the earlier created on a tie.
 * @param {World} w @param {Unit} at @param {Chain} ch @param {Set<number>} seen @param {boolean} antiAir @returns {Unit | null}
 */
function nextFoe(w, at, ch, seen, antiAir) {
  let best = null, bestD = Infinity;
  const sel = { canHitFly: antiAir, ignoreCamou: true };
  for (const u of w.units) {
    if (!hostile(u) || u.hp <= 0 || seen.has(u.id)) continue;
    const d = dist2(at, u);
    if (d <= ch.radius * ch.radius && d < bestD && selectable(u, sel)) { best = u; bestD = d; }
  }
  return best;
}

/**
 * The next operator a heal chain jumps to from `at` (职业-11): one with a tile among the chain's cells around `at`'s
 * tile, on the field, not refusing allies' heals (职业-9), not reached yet — full HP or not; the lowest 生命比例
 * (at 0.001), then the latest deployed.
 * @param {World} w @param {Content} c @param {Unit} at @param {Chain} ch @param {Set<number>} seen @returns {Unit | null}
 */
function nextAlly(w, c, at, ch, seen) {
  const grid = gridOf(c), keys = rangeKeys(grid, { ...at, dir: DEFAULT_DIR }, ch.cells ?? []);
  const cands = w.units.filter((u) => u.kind === KIND.OPERATOR && u.hp > 0 && !seen.has(u.id) && inKeys(u, keys, grid) && !statsOf(u).flags.noAllyHeal);
  const key = (/** @type {Unit} */ u) => precisionKey(u.hp / u.maxHp, 0.001);
  return cands.reduce((/** @type {Unit | null} */ b, u) => (!b || key(u) < key(b) || (key(u) === key(b) && (u.born > b.born || (u.born === b.born && u.bornN > b.bornN))) ? u : b), null);
}

/**
 * The units a chain jumps on to after its first target, in jump order (职业-11): at most `max` − 1 of them, each the
 * next from the one before, none twice.
 * @param {World} w @param {Content} c @param {Unit} first @param {Chain} ch @param {{ heals: boolean, antiAir: boolean }} how @returns {Unit[]}
 */
export function chainOf(w, c, first, ch, how) {
  /** @type {Unit[]} */
  const out = [];
  const seen = new Set([first.id]);
  for (let at = first; out.length < ch.max - 1;) {
    const next = how.heals ? nextAlly(w, c, at, ch, seen) : nextFoe(w, at, ch, seen, how.antiAir);
    if (!next) break;
    out.push(next);
    seen.add(next.id);
    at = next;
  }
  return out;
}

/**
 * Whom an operator's damage heals (职业-11): the operators in its attack range a healer would pick (职业-2), the
 * first of them; null when there is none.
 * @param {World} w @param {Content} c @param {Unit} op @returns {Unit | null}
 */
export function woundedInRange(w, c, op) {
  const grid = gridOf(c), keys = reachKeys(c, op);
  return sortHealTargets(w.units.filter((u) => u.kind === KIND.OPERATOR && u.hp > 0 && inKeys(u, keys, grid) && !statsOf(u).flags.healFree && !statsOf(u).flags.noAllyHeal))[0] ?? null;
}
