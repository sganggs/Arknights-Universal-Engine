// What a module adds to an operator's hits (docs/spec/traits.md 职业-20): arts damage riding on its attacks' hits and
// on the attacks it takes, 元素损伤 riding on its damage, elemental damage on a target in a burst, SP for some hits,
// for its boomerangs caught, and an attack bonus for each upkeep payment.
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, retune } from './buffs.js';
import { dealEp } from './elements.js';
import { gainSp } from './sp.js';
import { setHp } from './damage.js';
import { traitOf, creditedDamage } from './traits.js';
import { vsEp } from './vs.js';
import { reflectHit } from './talentlife.js';
import { RIDER, foeAfter } from './talentfoe.js';
import { chargedRider } from './talentfight.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./damage.js').Damage} Damage */

/** Whether an enemy is an elite or a leader (职业-20). @param {Unit} t */
export const eliteOf = (t) => t.base.levelType === 'ELITE' || t.base.levelType === 'BOSS';

/** Whether a unit is in a burst of an element (元素-3). @param {Unit} u @param {string} el */
const burstOf = (u, el) => u.buffs.some((b) => b.key === `burst:${el}`);

/**
 * What rides on an operator's damage that took HP or reached its target (职业-20), after the hit: its trait's 元素损伤 of
 * a share of the HP it took (arts damage only, when the trait says so); elemental damage of a share of its attack on a
 * target in the trait's element burst; on a hit of its attack, arts damage of a share of its attack; then what its target
 * 倍率 left for after the hit and its marks' arts damage (foeAfter, 职业-28). A rider's own damage takes none.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} t @param {{ dmg: Damage, taken: number }} hit
 */
export function afterOwnHit(w, c, op, t, hit) {
  if (op.kind !== KIND.OPERATOR || (hit.dmg.tags ?? []).includes(RIDER)) return;
  const tr = traitOf(c, op), r = tr.epRider, b = tr.burstHit;
  if (r && hit.taken > 0 && (!r.arts || hit.dmg.type === 'arts')) dealEp(w, t, r.el, hit.taken * r.ratio * vsEp(w, c, op, t), op);
  if (b && t.hp > 0 && burstOf(t, b.el)) creditedDamage(w, c, op, t, { type: 'elemental', amount: statsOf(op).atk * b.scale, tags: [RIDER] });
  if (tr.extraArts > 0 && hit.dmg.isAttack && t.hp > 0) creditedDamage(w, c, op, t, { type: 'arts', amount: statsOf(op).atk * tr.extraArts, tags: [RIDER] });
  chargedRider(w, c, op, t);
  foeAfter(w, c, op, t, hit.dmg);
}

/**
 * An operator hit by an enemy's attack (职业-20, 职业-27): arts damage on the attacker of a share of its attack — its
 * trait's, with what its buffs add (`counterArts`, summed: a talent's while a condition holds) —, then the true damage
 * operators return for an attack on their faction (reflectHit).
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} attacker @param {Damage} dmg
 */
export function attacked(w, c, op, attacker, dmg) {
  if (!dmg.isAttack || attacker.kind !== KIND.ENEMY || attacker.hp <= 0 || op.kind !== KIND.OPERATOR) return;
  const k = op.hp > 0 ? traitOf(c, op).counterArts + (statsOf(op).sum.counterArts ?? 0) : 0;
  if (k > 0) creditedDamage(w, c, op, attacker, { type: 'arts', amount: statsOf(op).atk * k, tags: [RIDER] });
  reflectHit(w, c, op, attacker, RIDER);
}

/**
 * SP for a hit of an operator's attack on its target (职业-20): on an elite or leader (`elite`), on one it did not bring
 * down (`survives`). @param {Content} c @param {Unit} op @param {Unit} t
 */
export function hitSp(c, op, t) {
  const s = op.kind === KIND.OPERATOR && op.skill ? traitOf(c, op).spOn : null;
  if (!s || !op.skill) return;
  if ((s.on === 'elite' && eliteOf(t)) || (s.on === 'survives' && t.hp > 0)) gainSp(op.skill, s.sp);
}

/**
 * An operator caught one of its boomerangs (职业-20): every `every` catches, its trait's SP; the count is a buff
 * `catches` it keeps while on the field. @param {Content} c @param {Unit} op
 */
export function caughtSp(c, op) {
  const s = traitOf(c, op).spOn;
  if (!s || s.on !== 'catch' || !op.skill) return;
  const b = op.buffs.find((x) => x.key === 'catches'), n = (b?.value ?? 0) + 1;
  if (n >= (s.every ?? 1)) gainSp(op.skill, s.sp);
  const left = n >= (s.every ?? 1) ? 0 : n;
  if (b) retune(op, b, left, {});
  else addBuff(op, makeBuff({ key: 'catches', src: op.id, value: left }));
}

/**
 * An operator at 0 HP this frame keeps its place once a deployment (职业-22): with its trait's second life, a buff
 * `secondLife` with the life's modifiers, then its HP set to the life's share of its maximum (after them). Whether it
 * stays. @param {World} w @param {Content} c @param {Unit} u
 */
export function secondLifeFatal(w, c, u) {
  const s = u.kind === KIND.OPERATOR ? traitOf(c, u).secondLife : null;
  if (!s || u.buffs.some((b) => b.key === 'secondLife')) return false;
  addBuff(u, makeBuff({ key: 'secondLife', src: u.id, mods: { ...s.mods } }));
  setHp(u, statsOf(u).maxHp * s.hp);
  w.events.push({ type: 'heal', id: u.id, target: u.id, amount: u.hp });
  return true;
}

/**
 * An operator paid its upkeep (职业-20): a step of its trait's attack bonus, up to its most; the steps are a buff
 * `payStack` it keeps while on the field. @param {Content} c @param {Unit} op
 */
export function paidStack(c, op) {
  const p = traitOf(c, op).payStack;
  if (!p) return;
  const b = op.buffs.find((x) => x.key === 'payStack'), n = Math.min(p.max, (b?.value ?? 0) + 1);
  if (b) retune(op, b, n, { atkPct: p.atk * n });
  else addBuff(op, makeBuff({ key: 'payStack', src: op.id, value: n, mods: { atkPct: p.atk * n } }));
}
