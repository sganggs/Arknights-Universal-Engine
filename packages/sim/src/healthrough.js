// Heals through 禁疗 (docs/spec/damage.md 伤害-13): some healers ignore the 禁疗 of some allies — PRTS 凯尔希「治疗效果无视
// 禁疗，但对象选取受禁疗制约」— and content names those allies through the healer's trait behaviour (职业-6 `healThrough`).
// One answer serves both the heal (伤害-11) and the heal attack's choice of targets (职业-2), as Stronghold's healThrough.
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { actorContext, traitOf } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */

/** The heal options of a heal through 禁疗 (伤害-11, 伤害-13). */
const THROUGH = Object.freeze({ through: true });

/**
 * Whether `healer` heals `target` through its 禁疗 (伤害-13): its trait behaviour, by the healer's branch (职业-6), answers
 * `true` for it — anything else, no behaviour or no operator is no.
 * @param {World} w @param {Content} c @param {Unit} healer @param {Unit} target @returns {boolean}
 */
export function healsThrough(w, c, healer, target) {
  const d = healer.kind === KIND.OPERATOR ? c.operators[healer.key] : undefined, own = c.behaviors?.traits;
  const b = d && own && Object.hasOwn(own, d.branch ?? '') ? own[d.branch ?? ''] : undefined;
  return typeof b?.healThrough === 'function' && b.healThrough(actorContext(w, c, healer, traitOf(c, healer).bb), target) === true;
}

/** Whether 禁疗 or 不被友方治疗 keeps heals off a unit (伤害-11, 职业-9). @param {Unit} u */
function barred(u) {
  const f = statsOf(u).flags;
  return f.healFree === true || f.noAllyHeal === true;
}

/**
 * Whether a healer's heal attack may take `u` (职业-2, 伤害-13): it holds neither 禁疗 nor 不被友方治疗, or the healer heals
 * it through them.
 * @param {World} w @param {Content} c @param {Unit} healer @param {Unit} u @returns {boolean}
 */
export const healable = (w, c, healer, u) => !barred(u) || healsThrough(w, c, healer, u);

/**
 * The options of one of a healer's heals on `u` (伤害-11): through for one it heals through 禁疗 (伤害-13), else none.
 * @param {World} w @param {Content} c @param {Unit} healer @param {Unit} u @returns {{ through: true } | undefined}
 */
export const healHow = (w, c, healer, u) => (barred(u) && healsThrough(w, c, healer, u) ? THROUGH : undefined);
