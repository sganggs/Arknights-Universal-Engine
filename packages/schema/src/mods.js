// A mod's manifest (docs/spec/mods.md mod-1, ADR 0064): Stronghold Protocol's pack.json, type "data", with the mods it
// depends on and a priority; the versions and version ranges it names (mod-2). From a host's folder or the network a
// manifest is untrusted: readModManifest never throws — a problem keeps a mod from loading, a warning does not.
import { isRecord, isInt, keyProblem } from './checks.js';

/** The engine's version: what a mod's `app` range is matched against. */
export const ENGINE_VERSION = '0.1.4';
/** The built-in mod of the official content (ADR 0037). */
export const OFFICIAL = 'official';
/** A mod id: 1–32 of a–z 0–9 _ - — the prefix of the ids it adds ("<mod id>:<name>"). */
export const MOD_ID = /^[a-z0-9_-]{1,32}$/;
/** A content id in a data file (mod-4): a–z A–Z 0–9 _ -, after a mod id and `:` when it is a mod's; no `#` (keys are "id#seat"). */
export const CONTENT_ID = /^(?:[a-z0-9_-]{1,32}:)?[A-Za-z0-9_-]{1,64}$/;
/** The pack types: what this version loads, and what it only lists. */
export const PACK_TYPES = Object.freeze({ data: 'supported', assets: 'planned' });
/** The tables a data file may hold (mod-4). */
export const MOD_TABLES = Object.freeze(['operators', 'levels', 'enemies', 'tokens']);
/** Mods' limits (mod-9): bytes of one data file, of one mod's data files; the most mods; the deepest nesting. */
export const MOD_LIMITS = Object.freeze({ fileBytes: 8 * 1024 * 1024, modBytes: 32 * 1024 * 1024, mods: 64, depth: 64 });
/** The most data files of a mod, and a priority's bounds. */
const MAX_FILES = 64, PRIORITY = 1000;

/** @typedef {[number, number, number]} Version */
/**
 * A manifest as the loader reads it.
 * @typedef {{ id: string, type: 'data', version: string, app: string | null, name: string, englishName: string | null,
 *   authors: string[], credits: string | null, license: string | null, files: { data: string[] },
 *   dependencies: Record<string, string>, priority: number }} ModManifest
 */

/** A semantic version (mod-2). */
export const VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-[0-9A-Za-z.-]{1,32})?(?:\+[0-9A-Za-z.-]{1,32})?$/;

/**
 * A semantic version's numbers, or null; a pre-release (0.2.0-dev) and build metadata count as the release (mod-2).
 * @param {unknown} s @returns {Version | null}
 */
export function parseVersion(s) {
  const m = typeof s === 'string' ? VERSION.exec(s) : null;
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** @param {Version} a @param {Version} b */
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const PART = /^(\d{1,9})(?:\.(\d{1,9}|[xX*]))?(?:\.(\d{1,9}|[xX*]))?$/;
const OP = /^(>=|<=|>|<|=|\^|~)?(.+)$/;

/** @typedef {(v: Version) => boolean} Test */

/**
 * One comparator of a range as a test, or null when it is malformed: `>=1.2.3`, `>1.2.3`, `<=1.2.3`, `<1.2.3`,
 * `=1.2.3` or `1.2.3`, `^1.2.3`, `~1.2.3`, the x-ranges `1.x`, `1.2.x` (`*` alike), `*`.
 * @param {string} tok @returns {Test | null}
 */
function comparator(tok) {
  if (tok === '*' || tok === 'x' || tok === 'X') return () => true;
  const [, op = '', rest] = /** @type {RegExpExecArray} */ (OP.exec(tok));
  const m = PART.exec(rest);
  if (!m) return null;
  const wild = (/** @type {string | undefined} */ s) => s === undefined || /^[xX*]$/.test(s);
  const [a, b, c] = [Number(m[1]), wild(m[2]) ? null : Number(m[2]), wild(m[3]) ? null : Number(m[3])];
  if (b === null && c !== null) return null;
  if (b === null || c === null) return op === '' || op === '=' ? xRange(a, b) : null;
  return fullComparator(op, [a, b, c]);
}

/** @param {Version} lo @param {Version} hi @returns {Test} lo ≤ v < hi */
const between = (lo, hi) => (v) => cmp(v, lo) >= 0 && cmp(v, hi) < 0;

/** An x-range: `1.x` or `1.2.x`. @param {number} a @param {number | null} b @returns {Test} */
const xRange = (a, b) => (b === null ? between([a, 0, 0], [a + 1, 0, 0]) : between([a, b, 0], [a, b + 1, 0]));

/** @type {Readonly<Record<string, (d: number) => boolean>>} */
const BY = Object.freeze({ '>=': (d) => d >= 0, '>': (d) => d > 0, '<=': (d) => d <= 0, '<': (d) => d < 0, '=': (d) => d === 0, '': (d) => d === 0 });

/**
 * A comparator with a whole version: `^`, `~`, or a comparison.
 * @param {string} op @param {Version} at @returns {Test}
 */
function fullComparator(op, at) {
  const [a, b, c] = at;
  if (op === '^') return between(at, a > 0 ? [a + 1, 0, 0] : b > 0 ? [0, b + 1, 0] : [0, 0, c + 1]);
  if (op === '~') return between(at, [a, b + 1, 0]);
  return (v) => BY[op](cmp(v, at));
}

/**
 * A version range as a test, or null when it is malformed (mod-2): alternatives split by `||`, each a list of
 * comparators joined by spaces, all of which must hold.
 * @param {unknown} range @returns {Test | null}
 */
function rangeTest(range) {
  if (typeof range !== 'string' || range.length === 0 || range.length > 128) return null;
  const alts = range.split('||').map((alt) => alt.trim().split(/\s+/).filter(Boolean).map(comparator));
  if (alts.some((alt) => alt.length === 0 || alt.some((t) => t === null))) return null;
  const tests = /** @type {Test[][]} */ (alts);
  return (v) => tests.some((alt) => alt.every((t) => t(v)));
}

/** @param {unknown} range @returns {boolean} whether a version range is well formed (mod-2) */
export const isRange = (range) => rangeTest(range) !== null;

/**
 * Whether a version is in a range (mod-2); false when either is malformed.
 * @param {string} version @param {string} range @returns {boolean}
 */
export function versionInRange(version, range) {
  const v = parseVersion(version), t = rangeTest(range);
  return v !== null && t !== null && t(v);
}

/** A data file's path in its mod's folder (mod-1). */
export const DATA_PATH = /^(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*\/){0,7}[A-Za-z0-9_-][A-Za-z0-9_.-]*\.json$/;
/** @param {unknown} p @returns {p is string} a data file's path in the mod's folder: forward slashes, no `..`, `.json` */
export const isDataPath = (p) => typeof p === 'string' && p.length <= 128 && DATA_PATH.test(p);

/** @param {unknown} s @param {number} max @returns {s is string} */
const isText = (s, max) => typeof s === 'string' && s.length > 0 && s.length <= max;

const FIELDS = Object.freeze(['$schema', 'id', 'type', 'version', 'app', 'name', 'englishName', 'authors', 'credits', 'license', 'files', 'dependencies', 'priority']);

/**
 * The manifest's fields, id, type, version, app range and name (mod-1).
 * @param {Record<string, unknown>} m @param {string} id @param {string[]} problems @param {string[]} warnings
 */
function headProblems(m, id, problems, warnings) {
  for (const k of Object.keys(m)) if (!FIELDS.includes(k)) warnings.push(`unknown field ${k}, ignored`);
  if (m.id !== undefined && m.id !== id) warnings.push(`id ${JSON.stringify(m.id)} differs from the folder's "${id}"; the folder's counts`);
  if (!Object.hasOwn(PACK_TYPES, String(m.type))) problems.push(`type ${JSON.stringify(m.type)} is not a pack type (${Object.keys(PACK_TYPES).join(', ')})`);
  else if (m.type !== 'data') problems.push(`type "${m.type}" is planned, not loaded by this version`);
  if (parseVersion(m.version) === null) problems.push(`version ${JSON.stringify(m.version)} is not a semantic version`);
  if (m.app === undefined) warnings.push('no app range: the engine versions it is made for are unknown');
  else if (!isRange(m.app)) problems.push(`app ${JSON.stringify(m.app)} is not a version range`);
  else if (!versionInRange(ENGINE_VERSION, /** @type {string} */ (m.app))) warnings.push(`made for engine ${m.app}, this is ${ENGINE_VERSION}`);
  if (!isText(m.name, 64)) problems.push('name is not a text of 1–64 characters');
}

/**
 * A mod's data files from its manifest's `files` (mod-1): `data`, one path or a list.
 * @param {unknown} files @param {string[]} problems @param {string[]} warnings @returns {string[]}
 */
function dataFiles(files, problems, warnings) {
  if (!isRecord(files)) {
    problems.push('files is not an object of role → path');
    return [];
  }
  for (const role of Object.keys(files)) if (role !== 'data') warnings.push(`files.${role}: not a role of a data mod, ignored`);
  const list = typeof files.data === 'string' ? [files.data] : files.data;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_FILES) {
    problems.push(`files.data names no data file, or more than ${MAX_FILES}`);
    return [];
  }
  const bad = list.find((p) => !isDataPath(p));
  if (bad !== undefined) problems.push(`files.data: ${JSON.stringify(bad)} is not a .json path inside the folder`);
  const seen = new Set(list.map((p) => String(p).toLowerCase()));
  if (seen.size !== list.length) problems.push('files.data names a file twice');
  return /** @type {string[]} */ (list);
}

/**
 * A mod's dependencies (mod-3): id → version range.
 * @param {unknown} deps @param {string} id @param {string[]} problems @returns {Record<string, string>}
 */
function dependenciesOf(deps, id, problems) {
  if (deps === undefined) return {};
  if (!isRecord(deps)) {
    problems.push('dependencies is not an object of mod id → version range');
    return {};
  }
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, r] of Object.entries(deps)) {
    if (!MOD_ID.test(k) || k === OFFICIAL || k === id) problems.push(`dependencies: "${k}" is not another mod's id`);
    else if (!isRange(r)) problems.push(`dependencies.${k}: ${JSON.stringify(r)} is not a version range`);
    else out[k] = /** @type {string} */ (r);
  }
  return out;
}

/**
 * The optional text fields (mod-1): a wrong one is a warning and reads as absent.
 * @param {Record<string, unknown>} m @param {string[]} warnings
 */
function textFields(m, warnings) {
  /** @param {string} k @param {number} max */
  const text = (k, max) => {
    if (m[k] === undefined) return null;
    if (isText(m[k], max)) return /** @type {string} */ (m[k]);
    warnings.push(`${k} is not a text of at most ${max} characters, ignored`);
    return null;
  };
  const authors = m.authors === undefined ? [] : Array.isArray(m.authors) && m.authors.length <= 16 && m.authors.every((a) => isText(a, 64)) ? /** @type {string[]} */ (m.authors) : null;
  if (authors === null) warnings.push('authors is not a list of at most 16 names, ignored');
  return { englishName: text('englishName', 64), credits: text('credits', 1024), license: text('license', 256), authors: authors ?? [] };
}

/**
 * A mod's pack.json against its folder's id (mod-1): the manifest as the loader uses it — null when a problem keeps the
 * mod from loading —, the problems and the warnings. Never throws.
 * @param {unknown} m @param {string} id the folder's name
 * @returns {{ manifest: ModManifest | null, problems: string[], warnings: string[] }}
 */
export function readModManifest(m, id) {
  /** @type {string[]} */
  const problems = [];
  /** @type {string[]} */
  const warnings = [];
  if (!MOD_ID.test(id)) problems.push(`id "${id}" is not 1–32 of a–z 0–9 _ -`);
  else if (id === OFFICIAL) problems.push('id "official" is the official content\'s');
  if (!isRecord(m)) return { manifest: null, problems: [...problems, 'pack.json is not an object'], warnings };
  headProblems(m, id, problems, warnings);
  const files = dataFiles(m.files, problems, warnings);
  const dependencies = dependenciesOf(m.dependencies, id, problems);
  if (m.priority !== undefined && !isInt(m.priority, -PRIORITY, PRIORITY)) problems.push(`priority is not an integer in [${-PRIORITY}, ${PRIORITY}]`);
  const texts = textFields(m, warnings);
  if (problems.length > 0) return { manifest: null, problems, warnings };
  return {
    manifest: { id, type: 'data', version: /** @type {string} */ (m.version), app: /** @type {string | undefined} */ (m.app) ?? null, name: /** @type {string} */ (m.name),
      ...texts, files: { data: files }, dependencies, priority: /** @type {number | undefined} */ (m.priority) ?? 0 },
    problems, warnings,
  };
}

/** The version of a host's list of its mods (mod-10). */
export const MOD_INDEX_VERSION = 1;
const SHA256 = /^[0-9a-f]{64}$/;

/** @param {unknown} f @returns {string | null} the problem of a listed file: its path, bytes and sha256 */
function listedFileProblem(f) {
  const why = !isRecord(f) ? 'a file is not an object' : keyProblem(f, ['path', 'size', 'sha256']);
  if (why || !isRecord(f)) return why;
  return isDataPath(f.path) && isInt(f.size, 0, MOD_LIMITS.fileBytes) && typeof f.sha256 === 'string' && SHA256.test(f.sha256) ? null : 'a file\'s path, size or sha256 is malformed';
}

/**
 * The problem of a listed mod's files (mod-10): its manifest's data files, each with its bytes and sha256.
 * @param {Record<string, unknown>} m @returns {string | null}
 */
function listedFilesProblem(m) {
  const files = m.files, manifest = /** @type {Record<string, any>} */ (m.manifest);
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES) return `${m.id}: files is not a list of 1–${MAX_FILES}`;
  const bad = files.map(listedFileProblem).find((why) => why !== null);
  if (bad) return `${m.id}: ${bad}`;
  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MOD_LIMITS.modBytes) return `${m.id}: its files are more than ${MOD_LIMITS.modBytes} bytes`;
  const named = typeof manifest.files?.data === 'string' ? [manifest.files.data] : manifest.files?.data;
  return JSON.stringify(named) === JSON.stringify(files.map((f) => f.path)) ? null : `${m.id}: the files are not its manifest's data files`;
}

/**
 * The problem of a host's list of its mods from the network (mod-10), or null: version 1, the engine's version, the
 * mods in load order — each its id, version, data sha256, manifest and data files.
 * @param {unknown} x @returns {string | null}
 */
export function modIndexProblem(x) {
  if (!isRecord(x)) return 'the list is not an object';
  const why = keyProblem(x, ['version', 'engine', 'mods']);
  if (why) return why;
  if (x.version !== MOD_INDEX_VERSION) return `list version ${JSON.stringify(x.version)} is not ${MOD_INDEX_VERSION}`;
  if (parseVersion(x.engine) === null) return 'engine is not a version';
  if (!Array.isArray(x.mods) || x.mods.length > MOD_LIMITS.mods) return `mods is not a list of at most ${MOD_LIMITS.mods}`;
  const ids = new Set();
  for (const m of x.mods) {
    const why = listedModProblem(m, ids);
    if (why) return why;
  }
  return null;
}

/**
 * The problem of a listed mod (mod-10): its id (not one listed before), version, sha, manifest and files.
 * @param {unknown} m @param {Set<unknown>} ids the ids listed before @returns {string | null}
 */
function listedModProblem(m, ids) {
  const bad = !isRecord(m) ? 'a mod is not an object' : keyProblem(m, ['id', 'version', 'sha', 'manifest', 'files']);
  if (bad || !isRecord(m)) return bad;
  if (typeof m.id !== 'string' || !MOD_ID.test(m.id) || m.id === OFFICIAL || ids.has(m.id)) return `${JSON.stringify(m.id)} is not a mod id, or is listed twice`;
  ids.add(m.id);
  if (parseVersion(m.version) === null || typeof m.sha !== 'string' || !SHA256.test(m.sha) || !isRecord(m.manifest)) return `${m.id}: its version, sha or manifest is malformed`;
  return listedFilesProblem(m);
}
