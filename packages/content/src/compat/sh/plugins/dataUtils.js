// Stand-in for Stronghold's shared/plugins/dataUtils.js (兼容-2, since v0.3.2). The real module imports no engine code,
// but jsonProblems is outside the source limits (complexity 21), so the mapping loads this. Kit load imports only
// RECORD_MAPS (content/index.js, support/index.js): the id prefix and id field of a plugin's records per table, the
// same value as the real module's.

/** A plugin record's id prefix and id field, per data table. */
export const RECORD_MAPS = Object.freeze({
  chess: ['chess_x', 'chessId'], enemies: ['enemy_x', 'key'], items: ['item_x', 'id'],
  bands: ['band_x', 'bandId'], garrisons: ['garrison_x', 'garrisonId'], effects: ['effect_x', 'effectId'],
  waves: ['wave_x', 'id'], stages: ['stage_x', 'id'], tokens: ['token_x', 'tokenId'],
});
