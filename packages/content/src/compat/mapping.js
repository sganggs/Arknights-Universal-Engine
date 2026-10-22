// The import mapping table (docs/spec/compat.md 兼容-2; ADR 0010): every Stronghold engine module its operator kits
// reach, by its path from the Stronghold repository root, and the compat module that stands in for it (a path from
// this directory). Content files — `server/sim/content/…`: the kits, their shared helpers, the summons and items
// modules — load as they are; only their imports of engine modules are pointed here. The Node hook (hook.js), the
// worker's build and the debug import map are all made from this one table.

/** Stronghold engine module → compat module. */
export const MAPPING = Object.freeze({
  'server/sim/constants.js': './sh/constants.js',
  'server/sim/detmath.js': './sh/detmath.js',
  'server/sim/dir.js': './sh/dir.js',
  'server/sim/targeting.js': './sh/targeting.js',
  'server/sim/body.js': './sh/body.js',
  'server/sim/damage.js': './sh/damage.js',
  'server/sim/buffs.js': './sh/buffs.js',
  'server/sim/ai.js': './sh/ai.js',
  'server/sim/professions.js': './sh/professions.js',
  'server/sim/simdata.js': './sh/simdata.js',
  'server/data.js': './sh/data.js',
  'shared/constants.js': './sh/sharedConstants.js',
  'shared/potential.js': './sh/potential.js',
  'shared/plugins/steps.js': './sh/plugins/steps.js',
  'shared/plugins/textNumber.js': './sh/plugins/textNumber.js',
  'shared/plugins/limits.js': './sh/plugins/limits.js',
  'shared/plugins/officialBounds.js': './sh/plugins/officialBounds.js',
  'shared/plugins/rules.js': './sh/plugins/rules.js',
});

/** The content files of Stronghold: they load as they are. */
export const CONTENT_DIR = 'server/sim/content/';

/**
 * Where an import from a Stronghold file lands (兼容-2): the compat module standing in for an engine module of the
 * table; null for content (it loads as it is) and for anything outside Stronghold. Throws for an engine module the
 * table does not have, so a new dependency of the kits shows at once.
 * @param {string} root the Stronghold repository root as a URL (ending in /) @param {string} target the resolved URL of
 *   the import @param {string} compat this directory as a URL (ending in /) @returns {string | null}
 */
export function mappedUrl(root, target, compat) {
  if (!target.startsWith(root)) return null;
  const rel = target.slice(root.length);
  if (rel.startsWith(CONTENT_DIR)) return null;
  const to = Object.hasOwn(MAPPING, rel) ? MAPPING[/** @type {keyof typeof MAPPING} */ (rel)] : null;
  if (!to) throw new Error(`compat: no mapping for the Stronghold module ${rel}`);
  return new URL(to, compat).href;
}
