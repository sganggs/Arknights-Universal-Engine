// The start rule a kit gives its skill (docs/spec/compat.md 兼容-5 何时发动): the `trigger` of Stronghold's skill spec — a rule's
// name, or { rule, grid, allies, hpAtMost, enemies } — answered as the engine's skill behaviour asks (技能-3): start as soon
// as it is ready, not now, or no opinion (the engine's own rule). The rules chess kits write are read as Stronghold's
// SkillRuntime does: NEVER (a kit that starts its own skill), SP_FULL, CUSTOM_RANGE and SKILL_RANGE on a grid, an ally in
// need for a heal skill. A kit that says nothing, and every other rule, leave it to the engine.
import { body, constants, traits } from '@aue/sim';
import { absoluteRangeKeys } from './sh/targeting.js';

/** @typedef {import('./battle.js').ShBattle} ShBattle @typedef {import('./unit.js').ShUnit} ShUnit */
/** @typedef {{ rule: string, grid: number[][] | null }} Change a rule and grid a kit set while the battle runs (setTrigger) */
/** @typedef {{ rule: string, grid: number[][] | null, allies: boolean, enemies: boolean, hpAtMost: number }} Trigger */
/** @typedef {'ready' | 'attack' | 'never' | undefined} Answer */

/** Enemies a trigger range takes: any it can select, air units too (Stronghold's TRIGGER_PROFILE). */
const ANY_ENEMY = Object.freeze({ canHitFly: true });

/**
 * A rule's name as Stronghold's SkillRuntime keeps it: upper case; ALWAYS is SP_FULL, MANUAL is NEVER (the kit starts it), a
 * CUSTOM_RANGE_… is CUSTOM_RANGE. @param {unknown} raw
 */
export function ruleName(raw) {
  const rule = String(raw ?? 'DEFAULT').toUpperCase();
  if (rule === 'ALWAYS') return 'SP_FULL';
  if (rule === 'MANUAL') return 'NEVER';
  return rule.startsWith('CUSTOM_RANGE') ? 'CUSTOM_RANGE' : rule;
}

/**
 * A grid a kit gave, or null for none: a list of [row, column] offsets (facing right), empty or not.
 * @param {unknown} grid @returns {number[][] | null}
 */
const gridOf = (grid) => (Array.isArray(grid) ? /** @type {number[][]} */ (grid) : null);

/**
 * A spec's trigger as Stronghold reads it. A string is the rule alone. The grid is `grid` or `rangeGrid` — an empty one
 * stands, it is a rule that no tile ever satisfies —, `allies` asks for an injured ally on the grid (the unit's own range
 * without one) with at most `hpAtMost` of its HP, `enemies` lets a heal skill open for an enemy too. A change a kit made
 * mid-battle (`ShSkill.setTrigger`) is the rule and the grid, the options stay.
 * @param {Record<string, any>} spec @param {Change | null} [change] @returns {Trigger}
 */
export function readTrigger(spec, change = null) {
  const t = typeof spec.trigger === 'string' ? { rule: spec.trigger } : spec.trigger && typeof spec.trigger === 'object' ? spec.trigger : {};
  const at = Number(t.hpAtMost);
  return {
    rule: change?.rule ?? ruleName(t.rule), grid: change ? change.grid : gridOf(t.grid ?? t.rangeGrid),
    allies: !!t.allies, enemies: !!t.enemies, hpAtMost: Number.isFinite(at) && at > 0 ? at : 1,
  };
}

/**
 * Whether the skill heals (Stronghold's `healSkill`): its spec says so, else its unit is a healer.
 * @param {ShBattle} b @param {ShUnit} p @param {Record<string, any>} spec
 */
const heals = (b, p, spec) => (spec.heal != null ? !!spec.heal : !!(p.u && traits.traitOf(b.c, p.u).heal));

/**
 * The injured allies a heal condition looks at: those on `keys` a healer may heal (and, for one that restores element
 * values, those with element damage).
 * @param {ShBattle} b @param {ShUnit} p @param {Iterable<number>} keys
 */
function patients(b, p, keys) {
  const ep = !!p.u && traits.traitOf(b.c, p.u).epHeal > 0;
  return b.injuredAlliesInKeys(keys, p, ep);
}

/**
 * Stronghold's `trigger.allies`: an injured, healable ally of the grid — the unit's own range without one — whose HP ratio
 * is at most `hpAtMost`.
 * @param {ShBattle} b @param {ShUnit} p @param {Trigger} t
 */
function allyHolds(b, p, t) {
  const keys = t.grid ? absoluteRangeKeys(t.grid, p.tileR, p.tileC, p.dir) : p.rangeKeys;
  return patients(b, p, keys).some((a) => a.hpRatio <= t.hpAtMost + 1e-9);
}

/**
 * A heal skill's own condition on the basic rule: an injured ally in the unit's range (an enemy it may select, with
 * `trigger.enemies`).
 * @param {ShBattle} b @param {ShUnit} p @param {Trigger} t
 */
function healHolds(b, p, t) {
  const keys = p.rangeKeys;
  return patients(b, p, keys).length > 0 || (t.enemies && b.enemiesInKeys(keys, p, ANY_ENEMY).length > 0);
}

/**
 * A living enemy on the tile keys, whether it can be selected or not (Stronghold's anyEnemyInKeys, the 技能范围 rule):
 * by its collider, or by the tile it stands on for a unit that searches by tile.
 * @param {ShBattle} b @param {ShUnit} p @param {number[]} keys
 */
function livingIn(b, p, keys) {
  const tiles = new Set(keys), g = { rows: b.c.level.height, cols: b.c.level.width }, byTile = p.profile.rangeTiles === true;
  return b.enemies.some((e) => e.alive && !e.hidden && (byTile ? body.bodyKeys(e, g) : body.colliderKeys(e, g, constants.ENEMY_COLLIDER_RADIUS)).some((k) => tiles.has(k)));
}

/**
 * Whether an enemy is on a trigger grid: one the unit may select (CUSTOM_RANGE) or any living one (SKILL_RANGE).
 * @param {ShBattle} b @param {ShUnit} p @param {number[][]} grid @param {boolean} selectable
 */
function enemyOn(b, p, grid, selectable) {
  const keys = absoluteRangeKeys(grid, p.tileR, p.tileC, p.dir);
  return selectable ? b.enemiesInKeys(keys, p, ANY_ENEMY).length > 0 : livingIn(b, p, keys);
}

/** A rule checked every tick: as soon as its condition holds, else not now. @param {boolean} holds @returns {Answer} */
const asTick = (holds) => (holds ? 'ready' : 'never');

/**
 * The basic rule (DEFAULT, and a rule Stronghold does not know, which falls back to it): the cast waits for the attack
 * about to be made, which the engine's rule does too; what the spec adds is the ally a cast needs — an injured one for
 * `trigger.allies`, for a heal skill one in the unit's range. A toggle says so itself: the engine takes the record's kind,
 * and a stance with no duration and no attack keys in its record (山's 横扫架势) is instant there, started when ready.
 * Nothing else to add: no opinion.
 * @param {ShBattle} b @param {ShUnit} p @param {Trigger} t @param {Record<string, any>} spec @returns {Answer}
 */
function basic(b, p, t, spec) {
  const held = t.allies ? !allyHolds(b, p, t) : heals(b, p, spec) && !healHolds(b, p, t);
  if (held) return 'never';
  return spec.kind === 'toggle' ? 'attack' : undefined;
}

/**
 * The rules that start the skill on their own, by name; each answers for a trigger.
 * @type {Record<string, (b: ShBattle, p: ShUnit, t: Trigger, spec: Record<string, any>) => Answer>}
 */
const RULES = {
  NEVER: () => 'never',
  SP_FULL: () => 'ready',
  CUSTOM_RANGE: (b, p, t, spec) => (t.grid ? asTick(enemyOn(b, p, t.grid, true)) : basic(b, p, t, spec)),
  SKILL_RANGE: (b, p, t, spec) => {
    if (t.allies) return asTick(allyHolds(b, p, t));
    return t.grid ? asTick(enemyOn(b, p, t.grid, false)) : basic(b, p, t, spec);
  },
};

/**
 * What a piece's kit says about starting its skill now: 'ready' — start as soon as it is ready —, 'never' — not now, the
 * kit starts it itself or its condition does not hold —, or undefined: the kit declares nothing here and the engine's
 * rule stands (技能-3).
 * @param {ShBattle} b @param {ShUnit} p @param {Change | null} [change] @returns {Answer}
 */
export function startRule(b, p, change = null) {
  const spec = p.skill?.spec;
  if (!spec) return undefined;
  const t = readTrigger(spec, change);
  return Object.hasOwn(RULES, t.rule) ? RULES[t.rule](b, p, t, spec) : basic(b, p, t, spec);
}
