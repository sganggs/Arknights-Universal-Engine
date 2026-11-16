// A trait's 倍率 by the target (docs/spec/traits.md 职业-17, 职业-24): an operator's hits on a target as it stands — its
// attack 倍率 before the target's 防御, its 伤害倍率 after, more 无视防御 —, its heals by the one it heals, and a whole
// attack's by how many enemies its splash reaches.
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { bursting } from './elements.js';
import { tileOf } from './body.js';
import { dirVec } from './dir.js';
import { reachKeys } from './reach.js';
import { inKeys, hostile } from './targeting.js';
import { inSkill } from './modes.js';
import { traitOf } from './traits.js';
import { counts, seenKey, hasStatus, standsStill, markedHit, heldBefore } from './talentfoe.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').VsScale} VsScale @typedef {import('./damage.js').Damage} Damage */

/** Whether a unit is blocked, or blocks a unit (职业-17). @param {World} w @param {Unit} t */
const inBlock = (w, t) => (t.blockedBy ?? -1) >= 0 || w.units.some((u) => u.blockedBy === t.id);

/** Whether a unit stands on the line of tiles straight in front of an operator (职业-17). @param {Unit} op @param {Unit} t */
function inFront(op, t) {
  const [fr, fc] = dirVec(op.dir), [or, oc] = tileOf(op), [tr, tc] = tileOf(t), dr = tr - or, dc = tc - oc;
  return dr * fc - dc * fr === 0 && dr * fr + dc * fc > 0;
}

/** Whether a unit stands on an operator's tile or one of the 8 around it (职业-17). @param {Unit} op @param {Unit} t */
function nearBy(op, t) {
  const [or, oc] = tileOf(op), [tr, tc] = tileOf(t);
  return Math.max(Math.abs(tr - or), Math.abs(tc - oc)) <= 1;
}

/** The tags of an enemy's record (关卡-1); none for another unit. @param {Content} c @param {Unit} t @returns {string[]} */
export const tagsOf = (c, t) => (t.kind === KIND.ENEMY ? /** @type {{ tags?: string[] }} */ (c.enemies[t.key] ?? {}).tags ?? [] : []);

/**
 * The target conditions (职业-17, 职业-24), each asked of the operator and the target as the hit (when there is one) or
 * the heal is worked out.
 * @type {Readonly<Record<VsScale['when'], (w: World, op: Unit, t: Unit, v: { value: number, dmg?: Damage, c: Content, x: VsScale }) => boolean>>}
 */
const WHEN = Object.freeze({
  blocked: (w, _op, t) => inBlock(w, t),
  flying: (_w, _op, t) => statsOf(t).flying,
  skillGround: (_w, op, t) => inSkill(op) && !statsOf(t).flying,
  hpBelow: (_w, _op, t, v) => t.hp < v.value * statsOf(t).maxHp,
  heavy: (_w, _op, t, v) => statsOf(t).massLevel >= v.value,
  front: (_w, op, t) => inFront(op, t),
  near: (_w, op, t) => nearBy(op, t),
  burst: (_w, _op, t) => bursting(t),
  onGround: (_w, _op, t) => t.z === 0,
  skill: (_w, _op, _t, v) => !!v.dmg?.isSkill,
  elite: (_w, _op, t) => t.base.levelType === 'ELITE' || t.base.levelType === 'BOSS',
  unblocked: (w, _op, t) => !inBlock(w, t),
  notOwnBlocked: (_w, op, t) => t.blockedBy !== op.id,
  hpAbove: (_w, _op, t, v) => t.hp > v.value * statsOf(t).maxHp,
  light: (_w, _op, t, v) => statsOf(t).massLevel <= v.value,
  tag: (_w, _op, t, v) => !!v.x.tag && tagsOf(v.c, t).includes(v.x.tag),
  rangedFoe: (_w, _op, t) => t.kind === KIND.ENEMY && t.base.applyWay === 'RANGED',
  status: (_w, _op, t, v) => !!v.x.status && !!statsOf(t).flags[v.x.status],
  abnormal: (_w, _op, t) => t.buffs.some((b) => b.resist),
  slainKind: (w, op, t) => (w.players[op.owner]?.slain?.[op.key] ?? []).includes(t.key),
  hpRatioAtMostOwn: (_w, op, t) => t.hp / statsOf(t).maxHp <= op.hp / statsOf(op).maxHp,
  hpFull: (_w, _op, t) => t.hp >= statsOf(t).maxHp,
  still: (_w, _op, t) => standsStill(t),
  statusAny: (_w, _op, t, v) => (v.x.statuses ?? []).some((k) => hasStatus(t, k)),
  first: (_w, op, t, v) => !t.buffs.some((b) => b.key === seenKey(op, v.x)),
  burstOf: (_w, _op, t, v) => !!v.x.el && t.buffs.some((b) => b.key === `burst:${v.x.el}`),
});

/**
 * Whether a 倍率's condition holds for the target (and the hit). @param {World} w @param {Content} c
 * @param {{ op: Unit, t: Unit, dmg?: Damage }} at @param {VsScale} v
 */
export const holds = (w, c, at, v) => WHEN[v.when](w, at.op, at.t, { value: v.value ?? 0, dmg: at.dmg, c, x: v });

/**
 * The 伤害倍率 by the distance to the target (职业-17): 1 up to `min` tiles, rising in a line to 1 + `dmg` at `max` and on.
 * @param {Unit} op @param {Unit} t @param {{ min: number, max: number, dmg: number }} far
 */
function farMul(op, t, far) {
  const d = Math.sqrt((t.x - op.x) * (t.x - op.x) + (t.y - op.y) * (t.y - op.y));
  return 1 + far.dmg * Math.min(1, Math.max(0, (d - far.min) / (far.max - far.min)));
}

/** How many enemies stand in an operator's attack range now (职业-17). @param {World} w @param {Content} c @param {Unit} op */
function crowdOf(w, c, op) {
  const keys = reachKeys(c, op), grid = { rows: c.level.height, cols: c.level.width };
  return w.units.filter((u) => hostile(u) && u.hp > 0 && !u.hidden && inKeys(u, keys, grid)).length;
}

/** Whether a 倍率 does anything to a damage (职业-17, 职业-28): a 倍率 or 无视防御 on the hit, or an effect after it. @param {VsScale} v */
const acts = (v) => !!(v.atk || v.dmg || v.defFlat || v.defPct || v.inflict || v.steal || v.sp || v.mark || v.arts || v.burstDot || v.epDot);

/**
 * Whether a 倍率's condition lets it on before a hit (职业-17, 职业-29): it holds, or it is checked `later` or `post`.
 * @param {World} w @param {Content} c @param {{ op: Unit, t: Unit, dmg: Damage }} at @param {VsScale} v
 */
const checkedNow = (w, c, at, v) => !!(v.later || v.post) || holds(w, c, at, v);

/** A 倍率 whose condition holds on a hit (职业-17, 职业-28): its 倍率 (scaleHit), then what it leaves for after the hit. @param {Unit} op @param {Unit} t @param {Damage} dmg @param {VsScale} v */
function heldOn(op, t, dmg, v) {
  if (v.atk || v.dmg || v.defFlat || v.defPct) scaleHit(dmg, v);
  heldBefore(op, t, dmg, v);
}

/** One 倍率 on a hit whose condition holds (职业-17, 职业-24). @param {Damage} dmg @param {VsScale} v */
function scaleHit(dmg, v) {
  if (v.atk) dmg.amount *= v.atk;
  if (v.dmg) dmg.mul = (dmg.mul ?? 1) * v.dmg;
  if (v.noDodge && dmg.type === 'phys') dmg.noDodgeCancel = true;
  if (v.defFlat) dmg.defIgnoreFlat = (dmg.defIgnoreFlat ?? 0) + v.defFlat;
  if (v.defPct) dmg.defIgnorePct = (dmg.defIgnorePct ?? 0) + v.defPct;
}

/**
 * An operator's hit on a target, by its trait's 倍率 for the target (职业-17), before the hit is dealt: through 沉睡 when
 * its trait hurts sleeping enemies (职业-28), × the marks it left on the target (markedHit); every 倍率 that counts the
 * damage (职业-28) and whose condition holds (one checked `later` or `post` waits for its check, 职业-29) — its attack 倍率 on the amount,
 * its 伤害倍率 on the hit's `mul`, physical dodge ignored, then what it leaves for after the hit (heldBefore) —, the
 * distance's and the enemies in range's 伤害倍率.
 * A sourceless hit, 生命流失 and elemental damage take none; nor a hit of a unit that is not an operator.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} t @param {Damage} dmg
 */
export function vsDamage(w, c, op, t, dmg) {
  if (op.kind !== KIND.OPERATOR || dmg.sourceless || dmg.hpLoss || dmg.type === 'elemental') return;
  const tr = traitOf(c, op);
  if (tr.hurtSleeping) dmg.throughSleep = true;
  markedHit(op, t, dmg);
  for (const v of [...tr.vs, ...fieldVs(w, c, op)]) if (acts(v) && counts(v, dmg) && checkedNow(w, c, { op, t, dmg }, v)) heldOn(op, t, dmg, v);
  if (tr.far) dmg.mul = (dmg.mul ?? 1) * farMul(op, t, tr.far);
  if (tr.crowd) dmg.mul = (dmg.mul ?? 1) * (1 + tr.crowd.step * Math.min(tr.crowd.cap, crowdOf(w, c, op)));
}

/**
 * The 倍率 the operators on the field give an operator of a faction (职业-35: `fieldVs`): each one's (itself too) whose
 * faction it has. @param {World} w @param {Content} c @param {Unit} op @returns {VsScale[]}
 */
function fieldVs(w, c, op) {
  const powers = c.operators[op.key].powers ?? [];
  if (powers.length === 0) return [];
  return w.units.flatMap((u) => {
    const x = u.kind === KIND.OPERATOR && u.hp > 0 ? traitOf(c, u).fieldVs : null;
    return x && powers.includes(x.power) ? x.vs : [];
  });
}

/**
 * The 元素损伤 an operator deals a target, by its 元素损伤倍率 (`epDealtMul`, 职业-18) and its trait's 倍率 for the target
 * (`ep`, 职业-17); 1 for a source that is not an operator.
 * @param {World} w @param {Content} c @param {Unit | null} src @param {Unit} t
 */
export function vsEp(w, c, src, t) {
  if (!src || src.kind !== KIND.OPERATOR) return 1;
  let k = statsOf(src).epDealtMul;
  for (const v of traitOf(c, src).vs) if (v.ep && holds(w, c, { op: src, t }, v)) k *= v.ep;
  return k;
}

/**
 * An operator's heal on a unit, by its trait's 倍率 for the one healed (职业-17): the product of those whose condition
 * holds; 1 for a healer that is not an operator.
 * @param {World} w @param {Content} c @param {Unit | null} src @param {Unit} t
 */
export function vsHeal(w, c, src, t) {
  if (!src || src.kind !== KIND.OPERATOR) return 1;
  let k = 1;
  for (const v of traitOf(c, src).vs) if (v.heal && holds(w, c, { op: src, t }, v)) k *= v.heal;
  return k;
}
