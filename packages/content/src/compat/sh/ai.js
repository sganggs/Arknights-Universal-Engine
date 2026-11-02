// Stands in for Stronghold's server/sim/ai.js (兼容-2): the names its operator kits import — a unit's attack profile now
// (its trait's, compat/unit.js, with its running skill spec's attack and targeting, as Stronghold's effectiveProfile) and
// the targets an attack of it would take (acquireTargets); a heal chain's next jump and an attack with a profile of the
// kit's (kitstubs.js, 兼容-4); the rest still gaps.
import { traits } from '@aue/sim';
import { gap } from './gap.js';
import { sortEnemyTargets } from './targeting.js';

/** How many enemies an attack takes (Stronghold's targetCount): its 阻挡数 when it hits all it blocks, else its maxTargets, at least 1. @param {any} u @param {Record<string, any>} prof */
const targetCount = (u, prof) => Math.max(1, Math.floor((prof.hitAllBlocked ? Math.max(1, Math.floor(u.s?.blockCnt ?? 1)) : (prof.maxTargets || 1)) + (u.s?.maxTargets ?? 0)));

/** How many allies a heal takes: a multi-heal's count, the trait's for a healer's own (职业-2), else 1. @param {any} u @param {Record<string, any>} prof */
function healCount(u, prof) {
  const t = u.u ? traits.traitOfDef(u.b.c.operators[u.u.key]) : null;
  const own = prof.heal === true && typeof t?.targets === 'number' ? t.targets : 1;
  const n = prof.heal?.mode === 'multi' ? Math.max(1, prof.heal.count || 3) : own;
  return Math.max(n, Math.floor(prof.maxTargets ?? 0)) + Math.max(0, Math.floor(u.s?.maxTargets ?? 0));
}

/**
 * The targets an attack of `u` with profile `prof` takes (Stronghold's acquireTargets, ported): a heal the injured
 * allies in range, the most wounded first (at most an HP ratio when it says so); otherwise the enemies in range it may
 * select and those it blocks — every one for `allInRange`, else as many as it takes, in its order.
 * @param {any} b @param {any} u @param {Record<string, any>} prof @returns {any[]}
 */
export function acquireTargets(b, u, prof) {
  if (prof.heal && (prof.dmgType === 'heal' || prof.heal === true)) {
    let cands = b.injuredAlliesInKeys(u.rangeKeys, u, !!prof.heal?.elementHealRatio);
    if (prof.heal?.hpAtMost > 0) cands = cands.filter((/** @type {any} */ a) => a.hpRatio <= prof.heal.hpAtMost + 1e-9);
    return cands.slice(0, healCount(u, prof));
  }
  const cands = b.enemiesInKeys(u.rangeKeys, u, prof);
  if (u.blocking.length) for (const e of b.blockedTargets(u, prof)) if (!cands.includes(e)) cands.push(e);
  if (!cands.length || prof.allInRange) return cands;
  const n = targetCount(u, prof);
  sortEnemyTargets(b, u, cands, prof.priority);
  return n >= cands.length ? cands : cands.slice(0, n);
}

export { chainHealNext, performAttack } from '../kitstubs.js';
export const attackCountdown = gap('ai.attackCountdown');

/** The targeting keys a skill spec may override. */
const TARGETING = Object.freeze(['maxTargets', 'priority', 'allInRange', 'canHitFly']);
/** A spec's attack keys under the profile's own names. @type {Readonly<Record<string, string>>} */
const RENAMED = Object.freeze({ onHit: 'skillOnHit', onEachHit: 'skillOnEachHit' });

/**
 * A spec's attack override on a profile: its keys (the hit callbacks under the profile's names, a numeric damage
 * multiplier as `skillDmgMul`), a heal for an attack that heals, none for one that deals damage.
 * @param {Record<string, any>} p @param {Record<string, any>} ov
 */
function overAttack(p, ov) {
  for (const [k, v] of Object.entries(ov)) {
    if (k !== 'dmgMul') p[RENAMED[k] ?? k] = v;
    else if (typeof v === 'number') p.skillDmgMul = v;
  }
  if (ov.dmgType === 'heal' && !p.heal) p.heal = { mode: 'single' };
  if (ov.dmgType && ov.dmgType !== 'heal' && !ov.heal) p.heal = null;
}

/**
 * A unit's attack profile now (Stronghold's effectiveProfile): its own; while its skill runs and its spec overrides the
 * attack or the targeting, a copy with them.
 * @param {{ profile: Record<string, any>, skill?: { active: boolean, spec: Record<string, any> | null } | null }} u
 * @returns {Record<string, any>}
 */
export function effectiveProfile(u) {
  const spec = u.skill?.active ? u.skill.spec : null, ov = spec?.attack ?? null, tg = spec?.targeting ?? null;
  if (!ov && !tg) return u.profile;
  /** @type {Record<string, any>} */
  const p = { ...u.profile, isSkill: true };
  if (ov) overAttack(p, ov);
  for (const k of TARGETING) if (tg?.[k] != null) p[k] = tg[k];
  return p;
}
