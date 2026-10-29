// Extract a whole level from a local ArknightsGameData checkout (docs/spec/level.md).
// Usage: node packages/data/src/cli/level.js --gamedata <dir> --level act1multi_01 [--map <map.json> --map-source <repo@commit>]
//   [--view-from <level>] (or set AUE_GAMEDATA). --map takes the camera view vectors by level path (关卡-3), e.g.
//   ArknightsGameResource's map.json; --view-from takes another level's there for a level the file lacks whose map
//   (mapData) is the same.
// Writes packages/content/data/levels/<id>.json (deterministic: the same input gives byte-identical output).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLevel } from '../level.js';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../content/data/levels');

/** @param {string} file @returns {unknown} */
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** The level file level_<id>.json anywhere under dir, or null. @param {string} dir @param {string} name @returns {string | null} */
function findLevel(dir, name) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isFile() && e.name === name) return p;
    const found = e.isDirectory() ? findLevel(p, name) : null;
    if (found !== null) return found;
  }
  return null;
}

/**
 * A co-op stage's missions in order (关卡-5): the activity table's multiplayer activity that maps the stage, its
 * missions by sort id; none for other stages.
 * @param {string} data the gamedata directory @param {string} id @returns {unknown[] | undefined}
 */
function missionsOf(data, id) {
  const acts = /** @type {{ activity: Record<string, Record<string, any>> }} */ (readJson(join(data, 'excel', 'activity_table.json'))).activity.MULTIPLAY_V3 ?? {};
  for (const a of Object.values(acts)) {
    const ids = a.mapDataDict?.[id]?.missionIdList;
    if (Array.isArray(ids)) return ids.map((m) => a.targetMissionDataDict[m]).toSorted((x, y) => x.sortId - y.sortId);
  }
  return undefined;
}

/**
 * A 阵地足球锦标 stage's event data (锦标-7): the ACT_FOOTBALL activity that lists the stage — its entry for the stage,
 * every stage's entry and the activity's relics (trapRuneDataDict `<activity>_relic_*`); none for other stages.
 * @param {string} data the gamedata directory @param {unknown} stage the stage table entry @returns {unknown}
 */
function cupEventOf(data, stage) {
  const table = /** @type {{ activity: Record<string, Record<string, any>>, trapRuneDataDict?: Record<string, unknown> }} */ (readJson(join(data, 'excel', 'activity_table.json')));
  const stageId = /** @type {any} */ (stage)?.stageId;
  for (const [actId, a] of Object.entries(table.activity.ACT_FOOTBALL ?? {})) {
    if (!a.stageAdditionDataMap?.[stageId]) continue;
    const relics = Object.entries(table.trapRuneDataDict ?? {}).filter(([k]) => k.startsWith(`${actId}_relic_`)).map(([, v]) => v);
    return { stage: a.stageAdditionDataMap[stageId], stages: Object.values(a.stageAdditionDataMap), relics };
  }
  return undefined;
}

/** @param {string} dir @returns {string} */
function gitCommit(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * A level's stage table entry (关卡-4): the stage of its id, else the first stage that plays its level file (堡垒守御's
 * stage ids differ from their levels', and two stages may share one level). @param {Record<string, unknown>} stages @param {string} id
 */
function stageOf(stages, id) {
  if (Object.hasOwn(stages, id)) return stages[id];
  return Object.values(stages).find((s) => String(/** @type {any} */ (s)?.levelId ?? '').toLowerCase().endsWith(`/level_${id}`));
}

/** A level's file under a gamedata directory; throws for none. @param {string} data @param {string} id @returns {string} */
function levelFile(data, id) {
  const file = findLevel(join(data, 'levels'), `level_${id}.json`);
  if (file === null) throw new Error(`level_${id}.json not found under ${data}`);
  return file;
}

/**
 * The camera view of a level from a map file (关卡-3): the first vector of its path — or of `map.from`'s, a level with
 * the same map (mapData) that the file has —, and where it came from.
 * @param {string} data @param {string} file the level's file @param {unknown} level @param {{ file: string, source: string, from?: string }} map
 */
function viewFrom(data, file, level, map) {
  const viewFile = map.from ? levelFile(data, map.from) : file;
  if (map.from && JSON.stringify(/** @type {any} */ (readJson(viewFile)).mapData) !== JSON.stringify(/** @type {any} */ (level).mapData)) {
    throw new Error(`level_${map.from}'s map is not this level's: its view is not this one's`);
  }
  const path = relative(join(data, 'levels'), viewFile).replaceAll('\\', '/').replace(/\.json$/, '');
  const vectors = /** @type {Record<string, unknown[]>} */ (readJson(map.file))[path];
  if (!vectors) throw new Error(`no camera view for ${path} in ${map.file}`);
  return { vector: vectors[0], source: map.from ? `${map.source} (${path}: the same map)` : map.source };
}

/**
 * Extract level `id` from a checkout, with its camera view from a map file when given (the first vector of its path,
 * or of `map.from`'s with the same map) and its code and name from the stage table (关卡-4), its stages' task texts
 * from the activity table (关卡-5), a 阵地足球锦标 stage's event data from it too (锦标-7).
 * @param {string} root the checkout directory @param {string} id @param {{ file: string, source: string, from?: string }} [map]
 * @returns {Record<string, unknown>}
 */
export function extractLevelFromCheckout(root, id, map) {
  const data = join(root, 'zh_CN', 'gamedata');
  const file = levelFile(data, id), level = readJson(file), stage = stageOf(/** @type {{ stages: Record<string, unknown> }} */ (readJson(join(data, 'excel', 'stage_table.json'))).stages, id);
  return extractLevel({
    id, level, enemyDb: readJson(join(data, 'levels', 'enemydata', 'enemy_database.json')),
    handbook: readJson(join(data, 'excel', 'enemy_handbook_table.json')), commit: gitCommit(root),
    view: map ? viewFrom(data, file, level, map) : undefined,
    stage, missions: missionsOf(data, id), cupEvent: cupEventOf(data, stage),
    charTable: readJson(join(data, 'excel', 'character_table.json')),
    coop: readJson(join(data, 'battle', 'cooperate_battle_table.json')),
  });
}

/** @param {string[]} argv @param {string} name @returns {string | undefined} */
const arg = (argv, name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

/** @param {string[]} argv */
function main(argv) {
  const dir = arg(argv, '--gamedata') ?? process.env.AUE_GAMEDATA, id = arg(argv, '--level'), mapFile = arg(argv, '--map'), mapSource = arg(argv, '--map-source');
  const from = arg(argv, '--view-from');
  if (!dir || !id) {
    console.error('usage: node packages/data/src/cli/level.js --gamedata <dir> --level <id>   (or set AUE_GAMEDATA)');
    process.exitCode = 2;
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const out = join(OUT, `${id}.json`);
  const map = mapFile ? { file: resolve(mapFile), source: mapSource ?? 'unknown', ...(from ? { from } : {}) } : undefined;
  writeFileSync(out, `${JSON.stringify(extractLevelFromCheckout(resolve(dir), id, map), null, 2)}\n`);
  console.log(`wrote ${out}`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
