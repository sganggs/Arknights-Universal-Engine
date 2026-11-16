// The native behaviour interface (ADR 0055, 0046): its version, and the members of the context every behaviour acts
// through — a skill's (技能-6), a trait's (职业-6). A change to either list is a new version.

/**
 * The behaviour interface's version. 1: skill, trait and buff behaviours with the contexts below; 2: a skill's context
 * has its description's extra modifiers; 3: a skill behaviour's end is told why the skill ends; 4: a trait behaviour may
 * say whether its operator may attack (canAttack) and what an attack turn without a target does (store); 5: a trait
 * behaviour may say which enemies its operator does not select (skip), a skill behaviour the running skill's range
 * (range).
 */
export const BEHAVIOR_API_VERSION = 5;

/** What every behaviour's context has (职业-6). */
export const CONTEXT_MEMBERS = Object.freeze(['self', 'bb', 'frame', 'stats', 'addBuff', 'removeBuff', 'applyStatus', 'dealDamage', 'dealEp', 'heal', 'gainCost']);

/** A skill behaviour's context: the common members and the skill's kind (技能-6). */
export const SKILL_CONTEXT_MEMBERS = Object.freeze([...CONTEXT_MEMBERS, 'kind', 'extra']);
