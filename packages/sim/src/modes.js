// Attack modes (docs/spec/traits.md 职业-12): attacks only while the skill runs, modifiers while it does not, an attack
// bonus that builds up while it does not, heals instead of attacks while it runs, bullets that are reloaded, attack
// energy stored when there is no target, and heals that also restore element values.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf, intervalFrames } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune, count } from './buffs.js';
import { ELEMENTS, epOf, currentElement } from './elements.js';
import { precisionKey, insertionSort, selectable, hostile, inKeys } from './targeting.js';
import { tileOf } from './body.js';
import { traitOf, traitAsk } from './traits.js';
import { launch } from './swing.js';
import { gainSp } from './sp.js';
import { draw } from './rng.js';
import { heal } from './damage.js';
import { vsHeal } from './vs.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Buff} Buff @typedef {import('./skills.js').AttackMods} AttackMods */

/** A unit's buff of a key, or null. @param {Unit} u @param {string} key @returns {Buff | null} */
const held = (u, key) => u.buffs.find((b) => b.key === key) ?? null;

/** Whether an operator's skill runs. @param {Unit} op */
export const inSkill = (op) => !!op.skill && op.skill.active;

/**
 * Whether an operator may make a normal attack now (职业-12, 职业-13): never one that makes none, nor one a buff's flag
 * `noAttack` holds back; not one that attacks only while its skill runs, while it does not.
 * @param {Content} c @param {Unit} op
 */
export function mayAttack(c, op) {
  const t = traitOf(c, op);
  return !t.noAttack && !statsOf(op).flags.noAttack && (!t.attackInSkill || inSkill(op));
}

/** Whether an operator is a healer now (职业-2): its trait heals and no buff turns its attacks on enemies (`attackFoes`). @param {Content} c @param {Unit} op */
export const healerNow = (c, op) => traitOf(c, op).heal && !statsOf(op).flags.attackFoes;

/** Whether an operator's normal attacks heal now (职业-2, 职业-12): a healer's (healerNow), a skill healer's while the skill runs. @param {Content} c @param {Unit} op */
export function healsNow(c, op) {
  const t = traitOf(c, op);
  return healerNow(c, op) || (t.skillHeal > 0 && inSkill(op));
}

/**
 * The buffs an operator's mode starts with at deployment (职业-12): full bullets, no stored energy, the charge, the
 * funnel's count (no target yet), and the
 * modifiers while its skill does not run (it does not at deployment).
 * @param {Unit} op @param {import('./types.js').TraitDef} t
 */
export function modeDeploy(op, t) {
  if (t.bullets) addBuff(op, makeBuff({ key: 'bullets', src: op.id, value: t.bullets.max }));
  if (t.store > 0) addBuff(op, makeBuff({ key: 'energy', src: op.id }));
  if (t.charge) addBuff(op, chargeAt(t.charge, op));
  if (t.funnel) addBuff(op, makeBuff({ key: 'funnel', src: op.id, value: -1 }));
  skillIdle(op, t);
}

/**
 * The 倍率 of an operator's attack on a target by its funnel (职业-12), counted as the attack reaches it: the trait's
 * `init` on another target than the last (its `funnel` buff keeps that one's id), `delta` more for each attack on the
 * same, at most `max`; 1 without one.
 * @param {Content} c @param {Unit} a @param {Unit} t
 */
export function funnelScale(c, a, t) {
  const f = traitOf(c, a).funnel, b = f ? held(a, 'funnel') : null;
  if (!f || !b) return 1;
  if (b.value === t.id) count(b, 1);
  else {
    retune(a, b, t.id, {});
    count(b, -b.n);
  }
  return Math.min(f.max, f.init + f.delta * b.n);
}

/**
 * What an operator's deployment talents do as it is deployed (部署-8), each in order: SP — a whole number from the
 * lower bound to below the upper, one draw (随机-1) when they differ — up to the skill's cap; a heal of every operator
 * on the field (any player's); shield layers. A shield that breaks remembers which talent it is, so the layer can stack
 * and grant SP (干员-14).
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function deployTalents(w, c, op) {
  const talents = c.operators[op.key].deployTalents ?? [];
  for (let i = 0; i < talents.length; i++) {
    const t = talents[i];
    if (t.sp && op.skill) gainSp(op.skill, t.sp[1] - t.sp[0] > 1 ? t.sp[0] + Math.floor(draw(w) * (t.sp[1] - t.sp[0])) : t.sp[0]);
    if (t.heal) {
      const amount = 'value' in t.heal ? t.heal.value : t.heal.scale * statsOf(op).atk;
      for (const u of w.units) if (u.kind === KIND.OPERATOR && u.hp > 0) w.events.push({ type: 'heal', id: op.id, target: u.id, amount: heal(w, op, u, amount * vsHeal(w, c, op, u)) });
    }
    if (t.shield) addBuff(op, makeBuff({ key: 'deployShield', src: op.id, shieldHits: t.shield, ...(t.break ? { tag: 'shieldBreak', n: i } : {}) }));
  }
}

/**
 * The modifiers and flags while an operator's skill does not run (职业-12): a buff `idle` while it does not, none while
 * it does.
 * At the start of the operator's turn, after its skill's.
 * @param {Unit} op @param {import('./types.js').TraitDef} t
 */
export function skillIdle(op, t) {
  if (Object.keys(t.idleMods).length === 0 && Object.keys(t.idleFlags).length === 0) return;
  const has = !!held(op, 'idle');
  if (!inSkill(op) && !has) addBuff(op, makeBuff({ key: 'idle', src: op.id, mods: t.idleMods, flags: t.idleFlags }));
  else if (inSkill(op) && has) removeBuff(op, 'idle');
}

/**
 * The frames an operator's turn is spent on something other than an attack (职业-12), or 0: a reload — one bullet, for
 * its base attack interval — when it has no bullet, or has room for one and no target; a store of attack energy —
 * one, for its attack interval — when it has no target and room for one; with no target, its trait behaviour's `store`
 * decides instead when it says (职业-6: stored, for its attack interval; or nothing).
 * @param {World} w @param {Content} c @param {Unit} op @param {boolean} target whether it has a target
 */
export function holdFrames(w, c, op, target) {
  const t = traitOf(c, op), bullets = held(op, 'bullets'), energy = held(op, 'energy');
  if (t.bullets && bullets && bullets.value < t.bullets.max && (bullets.value === 0 || !target)) {
    retune(op, bullets, Math.min(t.bullets.max, bullets.value + 1 + (bullets.value === 0 ? t.bullets.extra ?? 0 : 0)), {});
    return Math.max(1, secondsToFrames(op.base.bat));
  }
  const own = target ? undefined : traitAsk(w, c, op, 'store');
  if (own !== undefined) return own ? intervalFrames(statsOf(op).bat, statsOf(op).aspd) : 0;
  if (energy && !target && energy.value < t.store) {
    retune(op, energy, energy.value + 1, {});
    const s = statsOf(op);
    return intervalFrames(s.bat, s.aspd);
  }
  return 0;
}

/**
 * An attack's mods as the operator's mode makes them (职业-12): a bullet spent and its 倍率; heals, at the skill
 * healer's 倍率, while a skill healer's skill runs.
 * @param {Content} c @param {Unit} op @param {AttackMods} mods @returns {AttackMods}
 */
export function modeMods(c, op, mods) {
  const t = traitOf(c, op), bullets = held(op, 'bullets');
  let out = mods;
  if (t.bullets && bullets) {
    retune(op, bullets, bullets.value - 1, {});
    out = { ...out, scale: out.scale * t.bullets.scale };
  }
  if (!t.heal && t.skillHeal > 0 && inSkill(op)) out = { ...out, heal: true, scale: out.scale * t.skillHeal };
  return out;
}

/**
 * The stored energy goes with an attack that lands (职业-12): each unit a projectile of the operator's attack as arts
 * damage at the first target; then none is left.
 * @param {World} w @param {Unit} a @param {Unit} t
 */
export function releaseEnergy(w, a, t, scale = 1) {
  const energy = held(a, 'energy');
  if (!energy || energy.value === 0) return;
  const amount = statsOf(a).atk * scale;
  for (let k = 0; k < energy.value; k++) launch(w, a, t, { type: 'arts', amount, times: 1, element: '', ep: 0 });
  retune(a, energy, 0, {});
}

/** Whether a unit has element values below their maximum. @param {Unit} u */
const epDamaged = (u) => ELEMENTS.some((el) => epOf(u, el) < statsOf(u).maxEp);

/**
 * A healer's candidates in order (职业-2, 职业-12): those not at full HP by 生命比例 (at 0.001); one that also restores
 * element values takes those with element damage too, then by the value of their 当前损伤元素.
 * @param {Content} c @param {Unit} op @param {Unit[]} cands @returns {Unit[]}
 */
export function healOrder(c, op, cands) {
  const ep = traitOf(c, op).epHeal > 0;
  const lowest = (/** @type {Unit} */ u) => { const el = currentElement(u); return el ? epOf(u, el) : Infinity; };
  const rows = cands.filter((u) => u.hp < u.maxHp || (ep && epDamaged(u))).map((u) => ({ u, k: precisionKey(u.hp / u.maxHp, 0.001), e: ep ? lowest(u) : 0 }));
  return insertionSort(rows, (a, b) => a.k - b.k || a.e - b.e).map((r) => r.u);
}

/** A 要塞's own tile as a range of one tile (职业-12), for inKeys. @param {Content} c @param {Unit} op */
function ownTile(c, op) {
  const [r, col] = tileOf(op), grid = { rows: c.level.height, cols: c.level.width };
  return { keys: new Set([r * grid.cols + col]), grid };
}

/**
 * Whether a 要塞's target is one for its melee attack (职业-12): it blocks it, or it is in its own tile's range — an
 * enemy whose collider overlaps that tile (体积-5).
 * @param {Content} c @param {Unit} op @param {Unit} t
 */
const fortressMelee = (c, op, t) => {
  const own = ownTile(c, op);
  return t.blockedBy === op.id || inKeys(t, own.keys, own.grid);
};

/**
 * A 要塞's candidates (职业-12): the others, then the enemies in its own tile's range (its melee range, which its range
 * need not hold; by their colliders, 体积-5) — those it may select, in creation order.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit[]} found the others, in their order
 */
export function fortressTargets(w, c, op, found) {
  if (!(traitOf(c, op).fortress > 0)) return found;
  const tile = ownTile(c, op), own = w.units.filter((u) => hostile(u) && !found.includes(u) && selectable(u) && inKeys(u, tile.keys, tile.grid));
  return [...found, ...own];
}

/**
 * The splash of a 要塞's ranged attack on a target (职业-12), or null: its melee attack's — on one it blocks or that
 * overlaps its tile — and any other operator's have none of their own.
 * @param {Content} c @param {Unit} op @param {Unit} t @returns {import('./types.js').Splash | null}
 */
export function fortressSplash(c, op, t) {
  const r = op.kind === KIND.OPERATOR ? traitOf(c, op).fortress : 0;
  return r > 0 && !fortressMelee(c, op, t) ? { radius: r, scale: 1, ground: false } : null;
}

/**
 * The charge at deployment (职业-12): the steps of its `init` attack bonus, at most all of them.
 * @param {{ atk: number, steps: number, init?: number }} ch @param {Unit} op
 */
function chargeAt(ch, op) {
  const n = ch.atk > 0 ? Math.min(ch.steps, Math.max(0, Math.round(((ch.init ?? 0) * ch.steps) / ch.atk))) : 0;
  return makeBuff({ key: 'charge', src: op.id, every: secondsToFrames(1), fixed: true, value: n, mods: n > 0 ? { atkPct: (ch.atk * n) / ch.steps } : {} });
}

/**
 * The charge's behaviour (职业-12): each second its skill does not run it gains a step, up to its trait's steps, each
 * step the share of its attack bonus; while the skill runs it holds. The skill's end takes it back to 0 (restartCharge).
 * @param {Content} c @returns {import('./buffs.js').Behavior}
 */
export function chargeBehavior(c) {
  return {
    tick: (_w, u, b) => {
      const ch = traitOf(c, u).charge;
      if (!ch || u.kind !== KIND.OPERATOR || inSkill(u)) return;
      const n = Math.min(b.value + 1, ch.steps);
      retune(u, b, n, { atkPct: (ch.atk * n) / ch.steps });
    },
  };
}

/**
 * A charge back at 0 when its operator's skill ends (职业-12: 「技能结束时重置攻击力」) — also a skill that began and ended
 * between two of its triggers. @param {Unit} op
 */
export function restartCharge(op) {
  const b = op.buffs.find((x) => x.key === 'charge');
  if (b && b.value !== 0) retune(op, b, 0, {});
}
