// Stands in for the Stronghold modules only its prep side reaches from its battle content's files (兼容-2, 兼容-7): its
// random streams (server/sim/rng.js), the 特质 upgrades (shared/garrisonUpgrades.js) and the plugins' skill specs
// (shared/plugins/skillSpec.js). A battle here never runs that side; every name is a gap, and the schema a plain empty
// value.
import { gap } from './gap.js';

export const createRng = gap('rng.createRng');
export const garrisonUpgradeKey = gap('garrisonUpgrades.garrisonUpgradeKey');
export const nextGarrisonUpgrade = gap('garrisonUpgrades.nextGarrisonUpgrade');
export const validateSkillSpec = gap('skillSpec.validateSkillSpec');
export const matchesSchema = gap('skillSpec.matchesSchema');
export const MODS_SCHEMA = Object.freeze({});
