// The pinned Stronghold kits in matches (docs/spec/compat.md 兼容-6, ADR 0058): the commit, each operator kit's file, the
// kits that run (those that passed the checks), and loading them from where the environment serves that commit — under
// Node a file URL with the compat hook registered (hook.js), in a browser the platform's rewritten copy. The content of
// a match then uses them for its operators (index.js matchContent). Stronghold's battle content beyond the kits (兼容-7)
// loads the same way, from a checkout the host names.
import kitData from '../../data/kits.json' with { type: 'json' };
import { loadUnderGrid } from './grid.js';

/**
 * A kit's factory (兼容-3). `chess` marks a chess kit (兼容-5): one written for a chess piece, whose `skill` is the spec of the skill the piece fights with.
 * @typedef {((bb: Record<string, any>, chess: Record<string, any>, def: Record<string, any>) => any) & { chess?: boolean }} KitFactory
 */

/**
 * Marks a factory as a chess kit's (兼容-5) and returns it: the kit's default `skill` then stands for the piece's selected skill when
 * `skills` does not name it, as Stronghold reads a chess kit.
 * @param {KitFactory} factory @returns {KitFactory}
 */
export function chessKit(factory) {
  factory.chess = true;
  return factory;
}

/** The pinned commit the kits come from (the oracle's, ADR 0058). */
export const KIT_SOURCE = Object.freeze({ ...kitData.source });
/** Each operator kit's file in that commit, by character id. @type {Readonly<Record<string, string>>} */
export const KIT_FILES = Object.freeze({ ...kitData.files });
/** The kits that run in matches. @type {readonly string[]} */
export const KITS_ENABLED = Object.freeze([...kitData.enabled]);
/**
 * For a kit that passes the differential but for registered differences (兼容-6): each skill's expected lines of the
 * differential (`S1`…) and the registered differences behind them. @type {Readonly<Record<string, { because: string[], skills: Record<string, string[]> }>>}
 */
export const KIT_DIFFERENCES = Object.freeze({ ...kitData.differences });

/**
 * Loads the enabled kits of the given operators from the pinned commit at `base` (a URL ending in "/"), one at a time,
 * in character-id order: the factories that loaded, and the ids that did not (they fight on the engine's own).
 * @param {string} base @param {Iterable<string>} charIds @param {(url: string) => Promise<any>} [load] how to import a URL
 * @returns {Promise<{ kits: Record<string, KitFactory>, failed: string[] }>}
 */
export async function loadKits(base, charIds, load = (url) => import(url)) {
  /** @type {Record<string, KitFactory>} */
  const kits = {};
  const failed = [];
  for (const id of [...new Set(charIds)].filter((x) => KITS_ENABLED.includes(x) && Object.hasOwn(KIT_FILES, x)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) {
    try {
      const mod = await loadUnderGrid(() => load(base + KIT_FILES[id]));
      const f = mod?.default?.[id];
      if (typeof f === 'function') kits[id] = f;
      else failed.push(id);
    } catch {
      failed.push(id);
    }
  }
  return { kits, failed };
}

/** Stronghold's domain modules in the order its battles install them (its installContent, content/index.js). */
export const CONTENT_MODULES = Object.freeze(['tokens', 'devices', 'enemies', 'bosses', 'bonds', 'garrisons', 'items', 'bands', 'choices']);

/**
 * Loads Stronghold's content modules (兼容-7) from a checkout at `base` (a URL ending in "/"): each
 * `server/sim/content/<name>.js` under the load grid, in the order given, as the modules a match installs after its kits;
 * the names whose file did not load or has no `install` are in `failed`.
 * @param {string} base @param {readonly string[]} [names] @param {(url: string) => Promise<any>} [load] how to import a URL
 * @returns {Promise<{ modules: { name: string, install: (b: any) => void }[], failed: string[] }>}
 */
export async function loadContent(base, names = CONTENT_MODULES, load = (url) => import(url)) {
  /** @type {{ name: string, install: (b: any) => void }[]} */
  const modules = [];
  const failed = [];
  for (const name of names) {
    try {
      const mod = await loadUnderGrid(() => load(`${base}server/sim/content/${name}.js`));
      if (typeof mod?.install === 'function') modules.push({ name, install: mod.install });
      else failed.push(name);
    } catch {
      failed.push(name);
    }
  }
  return { modules, failed };
}
