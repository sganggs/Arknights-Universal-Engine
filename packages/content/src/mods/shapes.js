// The structure of content records (docs/spec/mods.md mod-6): the fields the engine reads, their types and ranges, which
// may be left out, and the links between them a level needs. The official data passes the same checks
// (test/mods.test.js); a record a mod adds or patches must pass them to load.

/**
 * A check of a value, and the JSON Schema of what it accepts (mod-6): one source for the loader's checks and for the
 * schemas editors read.
 * @typedef {((v: unknown, path: string, out: string[]) => void) & { json: Record<string, any> }} Shape
 */

/** The most problems reported for one record. */
const MAX_PROBLEMS = 20;

/** @param {unknown} x @returns {x is Record<string, any>} */
const isPlain = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);

/** @param {string[]} out @param {string} path @param {string} what */
function fail(out, path, what) {
  if (out.length < MAX_PROBLEMS) out.push(`${path}: ${what}`);
}

/** @param {(v: unknown, path: string, out: string[]) => void} check @param {Record<string, any>} json @returns {Shape} */
const shape = (check, json) => Object.assign(check, { json });

/** @param {number} lo @param {number} hi @returns {Shape} a finite number in [lo, hi] */
const num = (lo = -1e9, hi = 1e9) => shape((v, p, out) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) fail(out, p, `not a number in [${lo}, ${hi}]`);
}, { type: 'number', minimum: lo, maximum: hi });
/** @param {number} lo @param {number} hi @returns {Shape} an integer in [lo, hi] */
const int = (lo = -1e9, hi = 1e9) => shape((v, p, out) => {
  if (!Number.isSafeInteger(v) || /** @type {number} */ (v) < lo || /** @type {number} */ (v) > hi) fail(out, p, `not an integer in [${lo}, ${hi}]`);
}, { type: 'integer', minimum: lo, maximum: hi });
/** A text of at most 4096 characters. */
const str = shape((v, p, out) => {
  if (typeof v !== 'string' || v.length > 4096) fail(out, p, 'not a text of at most 4096 characters');
}, { type: 'string', maxLength: 4096 });
const bool = shape((v, p, out) => {
  if (typeof v !== 'boolean') fail(out, p, 'not true or false');
}, { type: 'boolean' });
/** @param {...(string | number)} values @returns {Shape} one of the values */
const oneOf = (...values) => shape((v, p, out) => {
  if (!values.includes(/** @type {any} */ (v))) fail(out, p, `not one of ${values.join(', ')}`);
}, { enum: values });
/** @param {Shape} s @returns {Shape} null or s */
const nullable = (s) => shape((v, p, out) => {
  if (v !== null) s(v, p, out);
}, { anyOf: [s.json, { type: 'null' }] });
/** @param {Shape} a @param {Shape} b @returns {Shape} a or b */
const either = (a, b) => shape((v, p, out) => {
  /** @type {string[]} */
  const ra = [];
  /** @type {string[]} */
  const rb = [];
  a(v, p, ra);
  if (ra.length === 0) return;
  b(v, p, rb);
  if (rb.length > 0) fail(out, p, `${ra[0].slice(p.length + 2)}, nor ${rb[0].slice(p.length + 2)}`);
}, { anyOf: [a.json, b.json] });
/** @param {Shape} s @param {number} min @param {number} max @returns {Shape} a list of s */
const list = (s, min = 0, max = 4096) => shape((v, p, out) => {
  if (!Array.isArray(v) || v.length < min || v.length > max) return fail(out, p, `not a list of ${min}–${max}`);
  v.forEach((x, i) => s(x, `${p}/${i}`, out));
}, { type: 'array', items: s.json, minItems: min, maxItems: max });
/** @param {Shape} s @param {number} max @returns {Shape} an object of any keys to s */
const dict = (s, max = 4096) => shape((v, p, out) => {
  if (!isPlain(v) || Object.keys(v).length > max) return fail(out, p, `not an object of at most ${max} entries`);
  for (const [k, x] of Object.entries(v)) s(x, `${p}/${k}`, out);
}, { type: 'object', additionalProperties: s.json, maxProperties: max });
/**
 * An object with the required fields, maybe the optional ones, no others.
 * @param {Record<string, Shape>} req @param {Record<string, Shape>} [opt] @returns {Shape}
 */
const obj = (req, opt = {}) => shape((v, p, out) => {
  if (!isPlain(v)) return fail(out, p, 'not an object');
  for (const k of Object.keys(v)) if (!Object.hasOwn(req, k) && !Object.hasOwn(opt, k)) fail(out, p, `unknown field ${k}`);
  for (const [k, s] of Object.entries(req)) {
    if (Object.hasOwn(v, k)) s(v[k], `${p}/${k}`, out);
    else fail(out, p, `missing field ${k}`);
  }
  for (const [k, s] of Object.entries(opt)) if (Object.hasOwn(v, k)) s(v[k], `${p}/${k}`, out);
}, {
  type: 'object', properties: Object.fromEntries(Object.entries({ ...req, ...opt }).map(([k, s]) => [k, s.json])), required: Object.keys(req), additionalProperties: false,
});
/**
 * A shape with a further check after it passes.
 * @param {Shape} s @param {(v: any, p: string, out: string[]) => void} more @returns {Shape}
 */
const also = (s, more) => shape((v, p, out) => {
  const n = out.length;
  s(v, p, out);
  if (out.length === n) more(v, p, out);
}, s.json);

const phase = int(0, 2), level = int(1, 90), potential = int(0, 5), bb = dict(num()), text = dict(str, 64), cell = obj({ row: int(-20, 20), col: int(-20, 20) });
/** A unit's attributes (干员-1); a summon's also its card stacks and deploy count. */
const STATS = Object.freeze({
  maxHp: num(1, 1e7), atk: num(0, 1e6), def: num(0, 1e6), res: num(-100, 100), cost: int(0, 99), blockCnt: int(0, 10), baseAttackTime: num(0.05, 60),
  respawnTime: num(0, 3600), aspd: num(1, 1000), tauntLevel: int(-10, 10), massLevel: int(0, 10),
});
const stats = obj(STATS), summonStats = obj(STATS, { maxDeckStackCnt: int(0, 99), maxDeployCount: int(0, 99) });
/** Attribute changes: a potential's, a module level's, the trust bonus'. */
const changes = obj({}, Object.fromEntries(Object.keys(STATS).map((k) => [k, num()])));

const skillLevel = obj({
  skillType: oneOf('MANUAL', 'AUTO', 'PASSIVE'), durationType: oneOf('NONE', 'AMMO'), duration: num(-1, 3600),
  spData: obj({ spType: either(oneOf('INCREASE_WITH_TIME', 'INCREASE_WHEN_ATTACK', 'INCREASE_WHEN_TAKEN_DAMAGE'), int(0, 64)), spCost: int(0, 999), initSp: int(0, 999), maxChargeTime: int(0, 99) }),
  blackboard: list(obj({ key: str, value: num() }), 0, 64), stoppable: bool, rangeId: nullable(str), description: str,
});
const skill = obj({ id: str, name: str, phase, levels: list(skillLevel, 1, 10) }, { token: str });
const talent = obj({ phase, level, potential, name: nullable(str), description: nullable(str), rangeId: nullable(str), bb, hidden: bool, token: nullable(str), prefab: str }, { text });
const trait = obj({ phase, level, potential, bb }, { rangeId: str });
const moduleTalent = obj({ phase, level, potential, index: int(-8, 16), name: nullable(str), prefab: str, rangeId: nullable(str), bb, hidden: bool, upgrade: str, modes: nullable(list(int(0, 64))) }, { text });
const moduleTrait = obj({ phase, level, potential, bb, add: nullable(str), override: nullable(str), rangeId: nullable(str) }, { text });
const part = obj({
  target: oneOf('TRAIT', 'TRAIT_DATA_ONLY', 'TALENT', 'TALENT_DATA_ONLY', 'DISPLAY', 'OVERWRITE_BATTLE_DATA'), gameTag: nullable(str), mapTag: nullable(str), token: bool,
  trait: list(moduleTrait, 0, 16), talents: list(moduleTalent, 0, 16),
});
/** A module level's changes to a summon: its attributes and its card counts. */
const summonChanges = dict(num(), 16);
const moduleShape = obj({ id: str, name: str, type: str, phase, level, levels: list(obj({ level: int(1, 3), stats: changes, tokens: dict(summonChanges), parts: list(part, 0, 16) }), 1, 3) });
/** An elite phase's keyframes: their levels start at 1 and rise (干员-1). @param {Shape} s the attributes @returns {Shape} */
const frames = (s) => also(list(obj({ level, stats: s }), 1, 8), (v, p, out) => {
  if (v[0].level !== 1 || v.some((/** @type {any} */ f, /** @type {number} */ i) => i > 0 && f.level <= v[i - 1].level)) fail(out, p, 'levels do not start at 1 and rise');
});
const phaseOf = (/** @type {Shape} */ s) => obj({ maxLevel: level, range: list(cell, 0, 400), frames: frames(s) });
const mainPower = obj({ nationId: nullable(str), groupId: nullable(str), teamId: nullable(str) });

/** An operator's record (data/operators/<id>.json, 干员-1); one a mod adds may name the operator it looks like. */
const operatorShape = obj({
  name: str, appellation: str, position: oneOf('MELEE', 'RANGED'), profession: oneOf('PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL'),
  branch: str, powers: list(str, 0, 8), mainPower, rarity: int(1, 6), phases: list(phaseOf(stats), 1, 3), favor: obj({ level: int(0, 200), stats: changes }),
  potentials: list(changes, 0, 5), skills: list(skill, 0, 3), traits: list(trait, 0, 16), talents: list(list(talent, 0, 16), 0, 8), modules: list(moduleShape, 0, 8),
  description: str,
}, { tokens: list(str, 0, 16), look: str });

/** A summon's record (data/tokens/<id>.json, 召唤-1). */
const tokenShape = obj({
  name: str, appellation: str, position: oneOf('MELEE', 'RANGED', 'ALL'), profession: oneOf('TOKEN'), branch: str, powers: list(str, 0, 8), mainPower, rarity: int(1, 6),
  phases: list(phaseOf(summonStats), 1, 3), favor: nullable(obj({ level: int(0, 200), stats: changes })), potentials: list(changes, 0, 5), skills: list(nullable(skill), 0, 3),
  traits: list(trait, 0, 16), talents: list(list(talent, 0, 16), 0, 8), modules: list(moduleShape, 0, 8), description: nullable(str),
});

/** An enemy's record in a level (敌人-1, 敌能-1). */
const enemyShape = obj({
  name: str, maxHp: num(1, 1e9), atk: num(0, 1e7), def: num(0, 1e6), res: num(-100, 100), moveSpeed: num(0, 100), baseAttackTime: num(0, 600), rangeRadius: num(-1, 100),
  applyWay: oneOf('MELEE', 'RANGED', 'ALL', 'NONE'), motion: oneOf('WALK', 'FLY'), massLevel: int(0, 10), levelType: oneOf('NORMAL', 'ELITE', 'BOSS'), lifePointReduce: int(0, 100),
}, {
  tags: list(str, 0, 16), talents: dict(dict(either(num(), str), 64), 64), immune: list(str, 0, 16), dmgType: oneOf('arts'), shared: bool, neutral: bool, deathLife: int(0, 99),
  epDamageResistance: num(-1000, 1000), epResistance: num(-1000, 1000),
  skills: list(obj({ key: str, sp: int(0, 999), cooldown: num(-1, 1e6), initCooldown: num(0, 1e6), bb: dict(either(num(), str), 64) }), 0, 16),
});

const build = obj({ elite: int(0, 2), level, potential: int(1, 6), trust: int(0, 200), skill: int(-1, 2), skillLevel: int(1, 10) }, { module: int(-1, 2), moduleLevel: int(1, 3) });
const action = obj({ type: oneOf('SPAWN', 'ACTIVATE', 'WITHDRAW', 'NONE', 'STORY'), key: str, count: int(0, 999), interval: num(0, 3600), preDelay: num(0, 3600), route: int(-1, 4096) },
  { group: str, hidden: str, pack: str, unharmful: bool, weight: int(0, 1000), dontBlockWave: bool });
const fragment = obj({ preDelay: num(0, 3600), actions: list(action, 0, 256) });
/** A tile position, maybe just off the map. */
const cell64 = obj({ row: int(-64, 128), col: int(-64, 128) });
const route = obj({
  motion: oneOf('WALK', 'FLY'), start: cell64, end: cell64, spawnOffset: obj({ x: num(-10, 10), y: num(-10, 10) }), allowDiagonal: bool,
  checkpoints: list(obj({ type: oneOf('MOVE', 'PATROL_MOVE', 'MAP_OFFSET_MOVE', 'WAIT_CURRENT_FRAGMENT_TIME', 'WAIT_FOR_SECONDS', 'DISAPPEAR', 'APPEAR_AT_POS'), row: int(-64, 128), col: int(-64, 128), time: num(0, 1e6), dx: num(-10, 10), dy: num(-10, 10) }), 0, 256),
});
const tile = obj({ key: str, buildable: oneOf('NONE', 'MELEE', 'RANGED', 'ALL'), height: oneOf('LOWLAND', 'HIGHLAND'), passable: oneOf('NONE', 'FLY_ONLY', 'ALL'), side: oneOf('ALL', 'SIDE_A', 'SIDE_B') },
  { goal: oneOf('A', 'B'), landball: bool });
const enemyMul = list(obj({ mods: dict(num(0, 1000), 8) }, { enemy: list(str, 0, 64), exclude: list(str, 0, 64) }), 0, 16);
const difficulty = obj({ enemyMul, hiddenGroups: list(str, 0, 64), replace: dict(str, 64), unsupported: list(str, 0, 64) },
  { talentMul: enemyMul, lifePoint: int(1, 999), maxCost: int(0, 999), costScale: num(0.01, 100), blockAdd: int(-10, 10),
    ours: list(obj({ key: str, professions: int(0, 1023), board: list(list(either(num(), str), 2, 2), 0, 32) }), 0, 32) });
/** 阵地足球's settings (足球-1, 足球-6), a 阵地足球锦标 level's manager (锦标-1). */
const football = obj({
  time: num(1, 36000), wait: num(0, 3600), stamps: list(int(0, 999), 0, 8), ahead: list(list(int(0, 1e6), 2, 2), 1, 32), weights: dict(list(num(0, 1e6), 1, 64), 32),
  teams: list(obj({ name: str, weight: num(0, 1e6), players: dict(str, 8) }, { elite: dict(str, 8) }), 0, 16), roles: dict(str, 8),
}, { catchUp: obj({ maxHp: num(0, 100), atk: num(0, 100), moveSpeed: num(0, 100) }), cup: obj({ moveSpeed: num(0, 100), stadiumType: int(0, 5), mercy: int(-1, 99), teamType: int(-1, 9) },
  { kickerDelta: int(-99, 99), stadiumWeights: list(list(num(0, 1e6), 2, 2), 1, 8), sides: obj({ ours: str, theirs: str }), icons: obj({ ours: str, theirs: str }),
    relics: list(obj({ id: str, name: str, text: str, runes: list(obj({ key: str, professions: int(0, 1023), board: list(list(either(num(), str), 2, 2), 0, 32) }), 1, 8) }, { unlockedBy: str }), 0, 8) }) });
const device = obj({
  name: str, maxHp: num(1, 1e9), atk: num(0, 1e7), def: num(0, 1e6), res: num(-100, 100), blockCnt: int(0, 99), cost: int(0, 99), aspd: num(1, 1000), baseAttackTime: num(0.05, 600),
  tauntLevel: int(-10, 10), massLevel: int(0, 10), talentBb: bb, talents: list(bb, 0, 16),
});
const levelBody = obj({
  id: str, code: str, name: str, width: int(1, 64), height: int(1, 64), bgm: str, view: list(num(), 0, 16),
  options: obj({ characterLimit: int(0, 99), costIncreaseTime: num(0.01, 3600), initialCost: int(0, 999), maxCost: int(0, 999), maxLifePoint: int(1, 999), moveMultiplier: num(0.01, 100) }),
  tiles: list(list(tile, 1, 64), 1, 64), routes: list(route, 0, 4096), waves: list(obj({ preDelay: num(0, 3600), postDelay: num(0, 3600), maxWait: num(-1, 1e6), fragments: list(fragment, 0, 64) }, { tag: int(0, 99), penalty: bool }), 0, 256),
  predefines: list(obj({ key: str, alias: str, row: int(0, 63), col: int(0, 63), dir: oneOf('UP', 'DOWN', 'LEFT', 'RIGHT'), hidden: bool }, { build }), 0, 256),
  stages: list(obj({ alias: str, goal: int(0, 1e6), objective: oneOf('protect', 'target', 'survive', 'tower'), rest: int(0, 3600), time: int(0, 36000), task: dict(str, 8) }, { advanced: int(0, 1e6), enemy: str }), 0, 16),
}, {
  blockEdges: list(obj({ row: int(0, 63), col: int(0, 63), dir: oneOf('UP', 'DOWN', 'LEFT', 'RIGHT'), mask: oneOf('WALK_ONLY') }), 0, 1024),
  branches: dict(list(fragment, 0, 64), 64),
  cards: obj({ operators: list(obj({ key: str, build }, { alias: str, hidden: bool }), 0, 16), tokens: list(obj({ key: str, alias: str, count: int(0, 99), hidden: bool }), 0, 16) }),
  fortress: obj({ life: int(1, 999), rest: int(0, 3600), restAdd: int(0, 3600), wave: int(0, 3600), waveLast: int(0, 3600) }),
  football,
});
/** A level's file (data/levels/<id>.json, 关卡-1). */
const levelShape = obj({ level: levelBody, difficulties: obj({ NORMAL: difficulty, FOUR_STAR: difficulty }), enemies: dict(enemyShape, 512), devices: dict(device, 64) }, { source: dict(str, 8), testing: bool });

/**
 * The links inside a level a battle needs (mod-6): the tiles fill its width and height, a spawn's route exists and its
 * enemy is the level's, a predefined unit stands on the map.
 * @param {any} f @param {string} p @param {string[]} out
 */
function levelLinks(f, p, out) {
  const lv = f.level;
  if (lv.tiles.length !== lv.height || lv.tiles.some((/** @type {unknown[]} */ row) => row.length !== lv.width)) fail(out, `${p}/level/tiles`, `not ${lv.height} rows of ${lv.width} tiles`);
  const frags = [...lv.waves.flatMap((/** @type {any} */ w) => w.fragments), ...Object.values(lv.branches ?? {}).flat()];
  for (const a of frags.flatMap((/** @type {any} */ x) => x.actions)) {
    if (a.type !== 'SPAWN') continue;
    if (a.route < 0 || a.route >= lv.routes.length) fail(out, `${p}/level/waves`, `a spawn of ${a.key} takes route ${a.route}, the level has ${lv.routes.length}`);
    if (!Object.hasOwn(f.enemies, a.key)) fail(out, `${p}/level/waves`, `a spawn of ${a.key}, not one of the level's enemies`);
  }
  for (const d of lv.predefines) if (d.row >= lv.height || d.col >= lv.width) fail(out, `${p}/level/predefines`, `${d.alias} stands off the map`);
}

/** Each table's record shape (mod-6). @type {Readonly<Record<'operators' | 'tokens' | 'enemies' | 'levels', Shape>>} */
const TABLES = Object.freeze({ operators: operatorShape, tokens: tokenShape, enemies: enemyShape, levels: also(levelShape, levelLinks) });

/**
 * The problems of a record of a table (mod-6), at most 20; none: it is well formed.
 * @param {keyof typeof TABLES} table @param {unknown} record @param {string} [path] where it is, for the messages
 * @returns {string[]}
 */
export function recordProblems(table, record, path = table) {
  /** @type {string[]} */
  const out = [];
  TABLES[table](record, path, out);
  return out;
}

/** @param {Record<string, any>} j @returns {boolean} whether a schema is of a { key, value } pair */
const isPairJson = (j) => j.type === 'object' && j.properties && Object.keys(j.properties).join() === 'key,value';
/** @param {Record<string, any>} j */
const orNull = (j) => ({ anyOf: [j, { type: 'null' }] });

/**
 * The JSON Schema of a patch of what a schema accepts (mod-5): every field may be left out and an optional one may be
 * null (removed); a list may be written whole — its elements as patches, which whole elements pass too —, or as an object
 * addressing its elements — null removes one, a { key, value } pair may be its value alone. A whole record passes it.
 * @param {Record<string, any>} j @returns {Record<string, any>}
 */
function patchJson(j) {
  if (j.anyOf) return { anyOf: j.anyOf.map(patchJson) };
  if (j.type === 'object' && j.properties) {
    const props = Object.entries(j.properties).map(([k, v]) => [k, j.required.includes(k) ? patchJson(v) : orNull(patchJson(v))]);
    return { type: 'object', properties: Object.fromEntries(props), additionalProperties: false };
  }
  if (j.type === 'object') return { type: 'object', additionalProperties: orNull(patchJson(j.additionalProperties)) };
  if (j.type !== 'array') return j;
  const item = patchJson(j.items), element = { anyOf: [item, { type: 'null' }, ...(isPairJson(j.items) ? [j.items.properties.value] : [])] };
  return { anyOf: [{ ...j, items: item }, { type: 'object', additionalProperties: element }] };
}

/**
 * The JSON Schemas of a table's records and of its patches (mod-5, mod-6), as the checks accept them.
 * @param {keyof typeof TABLES} table @returns {{ record: Record<string, any>, patch: Record<string, any> }}
 */
export const tableSchemas = (table) => ({ record: TABLES[table].json, patch: patchJson(TABLES[table].json) });
