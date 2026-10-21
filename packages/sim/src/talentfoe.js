// Talents on the enemies they meet (docs/spec/traits.md 职业-28): what a target 倍率 that held before a hit leaves after
// it — a status, SP, an attack stolen, a mark for the operator's later damage, arts damage at once or a moment later —,
// the marks, the targets preferred, the sleeping enemies hurt every second, the extra arts damage on an attack's
// weakest targets, and what an operator that leaves takes back.
import { secondsToFrames } from '@aue/math';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune, setLeft } from './buffs.js';
import { dealDamage } from './damage.js';
import { inflict } from './status.js';
import { gainSp } from './sp.js';
import { hostile, stealthed } from './targeting.js';
import { traitOf, creditedDamage } from './traits.js';
import { holds } from './vs.js';
import { burstDotOn, epDotOn } from './talentelem.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').VsScale} VsScale @typedef {import('./damage.js').Damage} Damage */

/** The tag of a rider's damage (职业-20), which nothing rides on and no talent here counts. */
export const RIDER = 'rider';

/** The frames a 停顿/束缚 check waits after the damage (职业-28: 仇白, 0.1 s). */
const LATER_FRAMES = 3;

/** Whether a damage is a rider's (职业-20). @param {Damage} dmg */
export const isRider = (dmg) => (dmg.tags ?? []).includes(RIDER);

/**
 * Whether a target 倍率 counts a damage (职业-28): `on` 'attack' only a hit of an attack, 'damage' any damage but a
 * rider's; without `on`, any it is asked for (职业-17).
 * @param {VsScale} v @param {Damage} dmg
 */
export const counts = (v, dmg) => (v.on === 'attack' ? !!dmg.isAttack && !isRider(dmg) : v.on === 'damage' ? !isRider(dmg) : true);

/** The key of a 非首次标记 (职业-28): one for every operator of the same record and the talent. @param {Unit} op @param {VsScale} v */
export const seenKey = (op, v) => `seen:${op.key}:${v.seen ?? ''}`;

/** Whether a target has a status by its key (状态-5): its buff, of any source. @param {Unit} t @param {string} key */
export const hasStatus = (t, key) => t.buffs.some((b) => b.key === key);

/**
 * Whether a target stands still (职业-28): blocked, unable to move (状态-5: 晕眩, 冻结, 沉睡, 浮空, 麻痹震颤, 束缚, 缚地) or
 * waiting on its route (路线-1).
 * @param {Unit} t
 */
export const standsStill = (t) => (t.blockedBy ?? -1) >= 0 || statsOf(t).immobile || (t.wait ?? -1) > 0;

/**
 * The marks an operator left on a target, on a damage of its before it is dealt (职业-28): × each `markDmg:<operator
 * id>` value on its 伤害倍率. A rider's takes none.
 * @param {Unit} op @param {Unit} t @param {Damage} dmg
 */
export function markedHit(op, t, dmg) {
  if (isRider(dmg)) return;
  for (const b of t.buffs) if (b.key === `markDmg:${op.id}`) dmg.mul = (dmg.mul ?? 1) * b.value;
}

/**
 * A target 倍率 whose condition held before a hit (职业-28): a `first` one leaves its 非首次标记 at once (without an end,
 * the operator as its source); the effects for after the hit go with the damage (`foe`).
 * @param {Unit} op @param {Unit} t @param {Damage} dmg @param {VsScale} v
 */
export function heldBefore(op, t, dmg, v) {
  if (v.when === 'first') addBuff(t, makeBuff({ key: seenKey(op, v), src: op.id }));
  if (v.inflict || v.steal || v.sp || v.mark || v.arts || v.burstDot || v.epDot) dmg.foe = [...(dmg.foe ?? []), v];
}

/**
 * After a hit an operator dealt (职业-28), the effects its target 倍率 left on the damage, in order: the target's marks
 * (refreshed), its status, the attack stolen and SP (while the target has HP), the arts damage at once (sourceless,
 * through 沉睡) or `later` (a check 0.1 s on); then, for any damage but a rider's, arts damage of each `markArts:<operator
 * id>` value on the target.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} t @param {Damage} dmg
 */
export function foeAfter(w, c, op, t, dmg) {
  for (const v of dmg.foe ?? []) leftAfter(w, c, { op, t }, v);
  if (isRider(dmg) || t.hp <= 0) return;
  for (const b of t.buffs.filter((x) => x.key === `markArts:${op.id}`)) {
    if (t.hp > 0) creditedDamage(w, c, op, t, { type: 'arts', amount: statsOf(op).atk * b.value, tags: [RIDER] });
  }
}

/**
 * What one target 倍率 left for after a hit (foeAfter, 职业-28): one checked `post` only when its condition holds now
 * (职业-29); then its mark, and while the target has HP its status, 偷取, SP, arts damage, and its elemental damage while
 * a burst lasts or 元素损伤 over time (职业-29).
 * @param {World} w @param {Content} c @param {{ op: Unit, t: Unit }} at @param {VsScale} v
 */
function leftAfter(w, c, { op, t }, v) {
  if (v.post && !holds(w, c, { op, t }, v)) return;
  if (v.mark) mark(t, `${v.mark.arts ? 'markArts' : 'markDmg'}:${op.id}`, op, v.mark);
  if (t.hp <= 0) return;
  overTime(w, op, t, v);
  if (v.inflict) inflict(w, t, /** @type {import('./status.js').StatusKey} */ (v.inflict.key), { seconds: v.inflict.seconds, src: op });
  if (v.steal) steal(w, op, t, v.steal);
  if (v.sp && op.skill) gainSp(op.skill, v.sp);
  if (v.arts && v.later) addBuff(t, makeBuff({ key: `later:${op.id}:${w.frame}:${t.buffs.length}`, act: 'foeLater', src: op.id, value: traitOf(c, op).vs.indexOf(v), left: LATER_FRAMES }));
  else if (v.arts) dealDamage(w, op, t, { type: 'arts', amount: statsOf(op).atk * v.arts, sourceless: true, throughSleep: true });
}

/** The damage over time a target 倍率 leaves (职业-29): while a burst lasts, or 元素损伤. @param {World} w @param {Unit} op @param {Unit} t @param {VsScale} v */
function overTime(w, op, t, v) {
  if (v.burstDot && v.el) burstDotOn(op, t, { el: v.el, scale: v.burstDot });
  if (v.epDot) epDotOn(w, op, t, v.epDot);
}

/** A mark of an operator on a target for `seconds` (职业-28): its value; the time starts again when it is there. @param {Unit} t @param {string} key @param {Unit} op @param {{ seconds: number, dmg?: number, arts?: number }} m */
function mark(t, key, op, m) {
  const left = secondsToFrames(m.seconds), b = t.buffs.find((x) => x.key === key);
  if (b) setLeft(b, left);
  else addBuff(t, makeBuff({ key, src: op.id, value: m.arts ?? m.dmg ?? 1, left }));
}

/**
 * An attack stolen (职业-28: 偷取): the target's 攻击力 − `atk` (直接加算, buff `steal:<operator id>`, without an end);
 * the operator's then follows (stolenTurn).
 * @param {World} w @param {Unit} op @param {Unit} t @param {{ atk: number, max: number }} s
 */
function steal(w, op, t, s) {
  if (!t.buffs.some((b) => b.key === `steal:${op.id}`)) addBuff(t, makeBuff({ key: `steal:${op.id}`, src: op.id, value: s.atk, mods: { atkFlat: -s.atk } }));
  stolenTurn(w, op, s);
}

/**
 * The attack an operator holds by stealing (职业-28): the sum of its `steal` buffs on units with HP, at most `max`, as
 * 攻击力 直接加算 (buff `stolen`); none without any.
 * @param {World} w @param {Unit} op @param {{ atk: number, max: number }} s
 */
function stolenTurn(w, op, s) {
  let sum = 0;
  for (const u of w.units) if (u.hp > 0) for (const b of u.buffs) if (b.key === `steal:${op.id}`) sum += b.value;
  const n = Math.min(sum, s.max), b = op.buffs.find((x) => x.key === 'stolen');
  if (!b && n > 0) addBuff(op, makeBuff({ key: 'stolen', src: op.id, value: n, mods: { atkFlat: n } }));
  else if (b && n <= 0) removeBuff(op, b);
  else if (b && b.value !== n) retune(op, b, n, { atkFlat: n });
}

/**
 * The 停顿/束缚 check a moment after a hit (职业-28: buff act `foeLater`): when it ends, its operator with HP deals the
 * target that still has HP arts damage of its 倍率's `arts` × its attack (a rider's) when the 倍率's condition holds.
 * @param {Content} c @param {(w: World, c: Content, at: { op: Unit, t: Unit }, v: VsScale) => boolean} holds
 * @returns {Record<string, import('./buffs.js').Behavior>}
 */
export function foeBehaviors(c, holds) {
  return {
    foeLater: { expire: (w, u, b) => {
      const op = w.units.find((x) => x.id === b.src && x.hp > 0), v = op ? traitOf(c, op).vs[b.value] : undefined;
      if (!op || !v?.arts || u.hp <= 0 || !holds(w, c, { op, t: u }, v)) return;
      creditedDamage(w, c, op, u, { type: 'arts', amount: statsOf(op).atk * v.arts, tags: [RIDER] });
    } },
  };
}

/**
 * At the start of an operator's turn (职业-28): the attack it holds by stealing (stolenTurn); every second from 0.5 s
 * after it was deployed, each enemy asleep, with HP, on the field, not 隐匿 and selectable takes arts damage of
 * `sleepDot` × its attack (sourceless, through 沉睡).
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function foeTurn(w, c, op) {
  const t = traitOf(c, op), s = t.vs.find((v) => v.steal)?.steal;
  if (s || op.buffs.some((b) => b.key === 'stolen')) stolenTurn(w, op, s ?? { atk: 0, max: 0 });
  if (!t.sleepDot) return;
  const since = w.frame - op.born, half = secondsToFrames(0.5), every = secondsToFrames(1);
  if (since < half || (since - half) % every !== 0) return;
  const amount = statsOf(op).atk * t.sleepDot;
  for (const e of w.units.filter((u) => hostile(u) && u.hp > 0 && !u.hidden && statsOf(u).flags.sleep && !stealthed(u) && !statsOf(u).flags.untargetable)) {
    dealDamage(w, op, e, { type: 'arts', amount, sourceless: true, throughSleep: true });
  }
}

/**
 * After an operator's attack landed (职业-28): the `lowestArts.n` of its targets with the least HP (still on the field,
 * with HP; the earlier first on a tie) each take arts damage of `lowestArts.scale` × its attack (a rider's).
 * @param {World} w @param {Content} c @param {Unit} op @param {number[]} ids the attack's targets
 */
export function lowestArts(w, c, op, ids) {
  const l = traitOf(c, op).lowestArts;
  if (!l) return;
  const alive = ids.map((id) => w.units.find((u) => u.id === id && u.hp > 0 && !u.hidden)).filter((u) => u !== undefined);
  const weakest = alive.map((u, i) => ({ u, i })).sort((a, b) => a.u.hp - b.u.hp || a.i - b.i).slice(0, l.n);
  for (const { u } of weakest) if (u.hp > 0) creditedDamage(w, c, op, u, { type: 'arts', amount: statsOf(op).atk * l.scale, tags: [RIDER] });
}

/**
 * An operator leaves the field (职业-28, 职业-29): every unit loses the 非首次标记, marks, stolen attack, checks and damage
 * over time it gave.
 * @param {World} w @param {Unit} op
 */
export function foeLeave(w, op) {
  const mine = (/** @type {import('./types.js').Buff} */ b) => b.src === op.id && /^(seen|steal|markDmg|markArts|later|burstDot|epDot):/u.test(b.key);
  for (const u of w.units) for (const b of u.buffs.filter(mine)) removeBuff(u, b);
}
