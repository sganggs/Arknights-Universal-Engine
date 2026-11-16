// Stands in for Stronghold's shared/constants.js (兼容-2): the names its operator kits and battle content import.
import { gap } from './gap.js';

/** A summon a skill makes is deployed at the battle's start when its owner is (Stronghold's value). */
export const SKILL_SUMMON_START_DEPLOY = true;

/**
 * Stronghold's board geometry (v0.4.0): its field's size, a player's own board, the rects of its battle kinds, the hand and
 * 临时整备区 rows. Our levels have their own size (兼容-1); the content reads these only for Stronghold's boss fields and
 * its prep side.
 */
export const GEO = Object.freeze({
  ROWS: 19, COLS: 21,
  FIELD: Object.freeze({ r0: 9, r1: 12, c0: 2, c1: 10 }),
  NORMAL_RECT: Object.freeze({ r0: 9, r1: 12, c0: 0, c1: 10 }),
  UNITE_RECT: Object.freeze({ r0: 9, r1: 12, c0: 0, c1: 20 }),
  BOSS_RECT: Object.freeze({ r0: 0, r1: 5, c0: 0, c1: 20 }),
  HAND_ROW: 7, HAND_SIZE: 10,
  TEMP_ROW: 8, TEMP_C0: 4, TEMP_SIZE: 5,
  PARTNER_COL_OFFSET: 8,
});

/** The gate of a 决策 effect (prep side). */
export const gateOf = gap('sharedConstants.gateOf');
