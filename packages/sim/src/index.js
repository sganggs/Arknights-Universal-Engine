// @aue/sim: the battle core. M0.5 skeleton plus M1 (pure modules) and M2 (attributes, buffs and statuses, damage,
// targeting); each simplification left is a registered inference, replaced in M3–M4.
export { createWorld, step, stateHash } from './world.js';
export { takeSnapshot, restoreSnapshot } from './snapshot.js';
export { toView } from './view.js';
export { deployProblem, fitsTile } from './commands.js';
export { predefinedKey } from './predefined.js';
export { reachKeys, placedReach, setRange, setExtraRange } from './reach.js';
export { healsNow } from './modes.js';
export { rangeCell, pickTarget, targetsOf, setAtkCd, traitScale, attackNow, boomerangStrike } from './combat.js';
export * as dir from './dir.js';
export * as body from './body.js';
export * as constants from './constants.js';
export * as attrs from './attrs.js';
export * as buffs from './buffs.js';
export * as status from './status.js';
export * as damage from './damage.js';
export * as targeting from './targeting.js';
export * as blocking from './blocking.js';
export * as routes from './routes.js';
export * as paths from './paths.js';
export * as skills from './skills.js';
export * as sp from './sp.js';
export * as elements from './elements.js';
export * as traits from './traits.js';
export * as deck from './deck.js';
export * as summons from './summons.js';
export * as tactical from './tactical.js';
export * as doll from './doll.js';
export * as displacement from './displacement.js';
export { moveOperator, canMoveTo } from './move.js';
export * as devices from './devices.js';
export * as fortress from './fortress.js';
export * as facilities from './facilities.js';
export * as swing from './swing.js';
export * as coop from './coop.js';
export * as waves from './waves.js';
export * as stage from './stage.js';
export * as foes from './foes.js';
export * as bus from './bus.js';
/** Unit kinds, for content (which does not depend on @aue/schema). */
export { KIND, DIR } from '@aue/schema';
export { nextUint32, seedState, draw, weightedPick } from './rng.js';
export { BEHAVIOR_API_VERSION, CONTEXT_MEMBERS, SKILL_CONTEXT_MEMBERS } from './api.js';
export { hashNumbers, HASH_START, contentHash, canonicalJson } from './hash.js';
export { teamFits } from './aura.js';
export { reserveIds } from './units.js';

/** @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').DeviceDef} DeviceDef */
/** @typedef {import('./types.js').World} World */
/** @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Buff} Buff */
/** @typedef {import('./types.js').SkillState} SkillState */
/** @typedef {import('./dir.js').Dir} Dir */
/** @typedef {import('./types.js').SkillDef} SkillDef */
/** @typedef {import('./skills.js').SkillBehavior} SkillBehavior */
/** @typedef {import('./types.js').TraitDef} TraitDef */
/** @typedef {import('./types.js').VsScale} VsScale */
/** @typedef {import('./types.js').WhileMods} WhileMods */
/** @typedef {import('./types.js').TalentHit} TalentHit @typedef {import('./types.js').TalentStack} TalentStack @typedef {import('./types.js').TalentSp} TalentSp @typedef {import('./types.js').NextAttack} NextAttack */
/** @typedef {import('./types.js').ModuleAura} ModuleAura */
/** @typedef {import('./types.js').Doll} Doll */
/** @typedef {import('./types.js').OperatorDef} OperatorDef @typedef {import('./types.js').TeamTalent} TeamTalent @typedef {import('./types.js').RangeTalent} RangeTalent @typedef {import('./types.js').CritTalent} CritTalent @typedef {import('./types.js').TimedTalent} TimedTalent @typedef {import('./types.js').DeployTalent} DeployTalent @typedef {import('./types.js').CarriedEffect} CarriedEffect */
/** @typedef {import('./types.js').SummonDef} SummonDef @typedef {import('./types.js').SummonCard} SummonCard */
/** @typedef {import('./types.js').EnemyDef} EnemyDef */
/** @typedef {import('./foes.js').FoeBehavior} FoeBehavior @typedef {import('./foes.js').FoeContext} FoeContext */
/** @typedef {import('./traits.js').TraitBehavior} TraitBehavior */
/** @typedef {import('@aue/schema').Command} Command */
