// Whole levels (docs/spec/level.md 关卡-2): a level extracted by @aue/data (data/levels/<id>.json) assembled at a
// difficulty — its hidden groups, life point, enemy replacements and enemy multipliers applied.
import act1multi01 from '../data/levels/act1multi_01.json' with { type: 'json' };
import act1multi02 from '../data/levels/act1multi_02.json' with { type: 'json' };
import act1multi06 from '../data/levels/act1multi_06.json' with { type: 'json' };
import act1multiHard02 from '../data/levels/act1multi_hard-02.json' with { type: 'json' };
import act1multiRm07 from '../data/levels/act1multi_rm07.json' with { type: 'json' };
import act2multiRm01 from '../data/levels/act2multi_rm01.json' with { type: 'json' };
import act1multiTr01 from '../data/levels/act1multi_tr01.json' with { type: 'json' };
import act1multiTr02 from '../data/levels/act1multi_tr02.json' with { type: 'json' };
import act1multiFortressRm01 from '../data/levels/act1multi_fortress_rm01.json' with { type: 'json' };
import act1multiFortressHard01 from '../data/levels/act1multi_fortress_hard-01.json' with { type: 'json' };
import act1multiFootball from '../data/levels/act1multi_football.json' with { type: 'json' };
import act1multiFootballHard01 from '../data/levels/act1multi_football_hard-01.json' with { type: 'json' };
import act1footballTr01 from '../data/levels/act1football_tr01.json' with { type: 'json' };
import act1football01 from '../data/levels/act1football_01.json' with { type: 'json' };
import act1football02 from '../data/levels/act1football_02.json' with { type: 'json' };
import act1football03 from '../data/levels/act1football_03.json' with { type: 'json' };
import act1football04 from '../data/levels/act1football_04.json' with { type: 'json' };
import act1football05 from '../data/levels/act1football_05.json' with { type: 'json' };
import act1football06 from '../data/levels/act1football_06.json' with { type: 'json' };
import act1football07 from '../data/levels/act1football_07.json' with { type: 'json' };
import act1footballEx01 from '../data/levels/act1football_ex01.json' with { type: 'json' };
import act1footballEx02 from '../data/levels/act1football_ex02.json' with { type: 'json' };
import act1footballEx03 from '../data/levels/act1football_ex03.json' with { type: 'json' };
import act1footballEx04 from '../data/levels/act1football_ex04.json' with { type: 'json' };
import act1footballSub11 from '../data/levels/act1football_sub-1-1.json' with { type: 'json' };
import act1footballSub12 from '../data/levels/act1football_sub-1-2.json' with { type: 'json' };
import { uncoveredAbilities, withFoeExtras } from './foes.js';
import { profiledDevices, DEVICE_PROFILES } from './devices.js';
import { CARRIED } from './carried.js';
import { seatRules } from './runes.js';
import { withStadium, stadiumGroup } from './cup.js';

/** @typedef {'NORMAL' | 'FOUR_STAR'} Difficulty */
/** @typedef {import('@aue/sim').EnemyDef} EnemyDef */

/** The extracted levels, by id. @type {Readonly<Record<string, any>>} */
export const LEVELS = Object.freeze({
  act1multi_01: act1multi01, act1multi_02: act1multi02, act1multi_06: act1multi06, 'act1multi_hard-02': act1multiHard02, act1multi_rm07: act1multiRm07,
  act2multi_rm01: act2multiRm01, act1multi_tr01: act1multiTr01, act1multi_tr02: act1multiTr02, act1multi_fortress_rm01: act1multiFortressRm01, 'act1multi_fortress_hard-01': act1multiFortressHard01,
  act1multi_football: act1multiFootball, 'act1multi_football_hard-01': act1multiFootballHard01,
  act1football_tr01: act1footballTr01, act1football_01: act1football01, act1football_02: act1football02, act1football_03: act1football03,
  act1football_04: act1football04, act1football_05: act1football05, act1football_06: act1football06, act1football_07: act1football07,
  act1football_ex01: act1footballEx01, act1football_ex02: act1footballEx02, act1football_ex03: act1footballEx03,
  act1football_ex04: act1footballEx04, 'act1football_sub-1-1': act1footballSub11, 'act1football_sub-1-2': act1footballSub12,
});

const PRTS = 'https://prts.wiki/index.php?title=';

/**
 * What a level's PRTS page says beyond its data (足球-6): the teams not drawn there — IG-S-4 「将会遭遇下列球员之一：
 * 战术队/爱球会/球德联精英球员」, so not the standard team.
 * @type {Readonly<Record<string, { teamsOut: readonly string[], source: string }>>}
 */
export const LEVEL_EXTRAS = Object.freeze({
  'act1multi_football_hard-01': { teamsOut: Object.freeze(['normal']), source: `${PRTS}IG-S-4%20%E5%A4%A7%E5%8A%9B%E5%87%BA%E5%A5%87%E8%BF%B9&oldid=428766` },
});

/**
 * A level's 阵地足球 settings with its page's extras (足球-6): the teams it says are not drawn weigh 0.
 * @param {string} id @param {import('@aue/sim').FootballRules | undefined} f
 */
function footballOf(id, f) {
  const out = Object.hasOwn(LEVEL_EXTRAS, id) ? LEVEL_EXTRAS[id].teamsOut : [];
  return f && out.length > 0 ? { ...f, teams: f.teams.map((t) => (out.includes(t.name) ? { ...t, weight: 0 } : t)) } : f;
}

/** enemy_attribute_mul's keys and the enemy fields they multiply, with each field's value when the enemy has none. */
const MUL_FIELDS = Object.freeze({
  atk: ['atk', 0], def: ['def', 0], max_hp: ['maxHp', 0], magic_resistance: ['res', 0], move_speed: ['moveSpeed', 1], attack_speed: ['aspd', 100], mass_level: ['massLevel', 0],
});

/**
 * An enemy with every multiplier of the difficulty that applies to it (关卡-2): on the base values.
 * @param {string} key @param {EnemyDef} e @param {{ mods: Record<string, number>, enemy?: string[], exclude?: string[] }[]} muls @returns {EnemyDef}
 */
function multiplied(key, e, muls) {
  /** @type {Record<string, any>} */
  const out = { ...e };
  for (const m of muls) {
    if ((m.enemy && !m.enemy.includes(key)) || m.exclude?.includes(key)) continue;
    for (const [k, v] of Object.entries(m.mods)) {
      const [f, dflt] = /** @type {[string, number]} */ (MUL_FIELDS[/** @type {keyof typeof MUL_FIELDS} */ (k)]);
      out[f] = (out[f] ?? dflt) * v;
    }
  }
  return /** @type {EnemyDef} */ (out);
}

/**
 * An enemy with every multiplier of its talents' values the difficulty has for it (关卡-2: enemy_talent_blackb_mul,
 * keys `<talent>.<field>`): on the values it has; a field it lacks stays absent.
 * @param {string} key @param {EnemyDef} e @param {{ mods: Record<string, number>, enemy?: string[], exclude?: string[] }[]} muls @returns {EnemyDef}
 */
function talentsMultiplied(key, e, muls) {
  const mine = muls.filter((m) => !(m.enemy && !m.enemy.includes(key)) && !m.exclude?.includes(key));
  if (mine.length === 0 || !e.talents) return e;
  /** @type {Record<string, Record<string, number>>} */
  const talents = Object.fromEntries(Object.entries(e.talents).map(([k, bb]) => [k, { ...bb }]));
  for (const m of mine) {
    for (const [k, v] of Object.entries(m.mods)) {
      const [name, f] = k.split('.'), bb = talents[name];
      if (bb && typeof bb[f] === 'number') bb[f] *= v;
    }
  }
  return /** @type {EnemyDef} */ ({ ...e, talents });
}

/**
 * A level's waves and branches (守御-6) with a difficulty's replacements of the enemies they spawn (关卡-2).
 * @param {any} level @param {Record<string, string>} replace @returns {{ waves: any[], branches?: Record<string, any[]> }}
 */
function replacedSpawns(level, replace) {
  const replaced = (/** @type {any} */ f) => ({ ...f, actions: f.actions.map((/** @type {any} */ a) => (a.type === 'SPAWN' ? { ...a, key: replace[a.key] ?? a.key } : a)) });
  const waves = level.waves.map((/** @type {any} */ w) => ({ ...w, fragments: w.fragments.map(replaced) }));
  if (!level.branches) return { waves };
  return { waves, branches: Object.fromEntries(Object.entries(level.branches).map(([k, fs]) => [k, /** @type {any[]} */ (fs).map(replaced)])) };
}

/**
 * 阵地足球's players a level's spawns bring in (足球-6, 锦标-6): for each role a spawn names — a standard player, or an
 * elite one (its `_2`) —, every team's that may be drawn player of that role, or its elite one.
 * @param {import('@aue/sim').FootballRules | undefined} football @param {Set<string>} spawned @returns {string[]}
 */
function teamPlayers(football, spawned) {
  if (!football) return [];
  const teams = football.teams, out = [];
  for (const [part, role] of Object.entries(football.roles)) {
    const named = [...spawned].filter((k) => k.includes(`_${part}`));
    const elite = named.some((k) => k.endsWith('_2')), plain = named.some((k) => !k.endsWith('_2'));
    for (const t of teams.filter((x) => x.weight > 0)) out.push(...(plain ? [t.players[role]] : []), ...(elite && t.elite?.[role] ? [t.elite[role]] : []));
  }
  return out;
}

/**
 * The enemies a level's waves and branches spawn (关卡-2, 守御-6) — in 阵地足球 every team's players (足球-6) —, and
 * those their abilities bring in turn (a split, a summon, a rebirth as another: an enemy key in a blackboard, 敌能-22).
 * @param {any[]} waves @param {Record<string, any[]> | undefined} branches @param {Record<string, any>} enemies the level's records
 * @param {import('@aue/sim').FootballRules} [football]
 */
function spawnedKeys(waves, branches, enemies, football) {
  const frags = [...waves.flatMap((/** @type {any} */ w) => w.fragments), ...Object.values(branches ?? {}).flat()];
  const used = new Set(frags.flatMap((/** @type {any} */ f) => f.actions.filter((/** @type {any} */ a) => a.type === 'SPAWN').map((/** @type {any} */ a) => a.key)));
  for (const k of teamPlayers(football, used)) if (Object.hasOwn(enemies, k)) used.add(k);
  for (const k of used) {
    const e = enemies[k];
    const named = e ? [...Object.values(e.talents ?? {}), ...(e.skills ?? []).map((/** @type {any} */ x) => x.bb)].flatMap((bb) => Object.values(bb)) : [];
    for (const v of named) if (typeof v === 'string' && Object.hasOwn(enemies, v)) used.add(v);
  }
  return used;
}

/**
 * The devices a level never places (装置-3): its predefined units that are all hidden and that no wave or branch
 * activates, and are no card. @param {any} level @param {any[]} waves @param {Record<string, any[]> | undefined} branches
 * @returns {Set<string>}
 */
function unplacedDevices(level, waves, branches) {
  const frags = [...waves.flatMap((/** @type {any} */ w) => w.fragments), ...Object.values(branches ?? {}).flat()];
  const activated = new Set(frags.flatMap((/** @type {any} */ f) => f.actions.filter((/** @type {any} */ a) => a.type === 'ACTIVATE').map((/** @type {any} */ a) => a.key)));
  const placed = new Set([...(level.predefines ?? []).filter((/** @type {any} */ p) => !p.hidden || activated.has(p.alias)), ...(level.cards?.tokens ?? [])].map((/** @type {any} */ p) => p.key));
  return new Set((level.predefines ?? []).map((/** @type {any} */ p) => p.key).filter((/** @type {string} */ k) => !placed.has(k)));
}

/**
 * A level's options at a difficulty (关卡-2): the life point, the max cost and the cost recovery its runes set.
 * @param {any} options @param {{ lifePoint?: number, maxCost?: number, costScale?: number }} d
 */
function optionsAt(options, d) {
  return { ...options, ...(d.lifePoint !== undefined ? { maxLifePoint: d.lifePoint } : {}), ...(d.maxCost !== undefined ? { maxCost: d.maxCost } : {}),
    ...(d.costScale !== undefined ? { costIncreaseTime: options.costIncreaseTime * d.costScale } : {}) };
}

/** The levels being tested (关卡-8): they load with enemy abilities that have no behaviour yet, which do nothing there. */
export const TESTING = Object.freeze(['act1multi_fortress_rm01', 'act1multi_fortress_hard-01', 'act1multi_football', 'act1multi_football_hard-01',
  ...Object.keys(LEVELS).filter((k) => k.startsWith('act1football_'))]);

/** Whether a level is being tested (关卡-8): one of TESTING, or its file says so. @param {string} id @param {any} raw */
const beingTested = (id, raw) => TESTING.includes(id) || raw.testing === true;

/**
 * A level's file and its rules at a difficulty, with its runes on our units read (关卡-2, 符文-1); throws for no such
 * level or difficulty, or runes not supported there.
 * @param {string} id @param {Difficulty} difficulty @param {Readonly<Record<string, any>>} levels
 */
function difficultyAt(id, difficulty, levels) {
  const raw = Object.hasOwn(levels, id) ? levels[id] : undefined;
  if (!raw) throw new RangeError(`no level ${id}`);
  const d = raw.difficulties[difficulty];
  if (!d) throw new RangeError(`level ${id}: no difficulty ${difficulty}`);
  const ours = seatRules(d.ours ?? []);
  const unsupported = [...d.unsupported, ...ours.unsupported];
  if (unsupported.length > 0) throw new RangeError(`level ${id} at ${difficulty}: runes not supported yet: ${unsupported.join(', ')}`);
  return { raw, d, ours };
}

/**
 * A level at a difficulty (关卡-2), as @aue/sim's level and enemies; `attack` adds each enemy's attack timing; the
 * effects of its runes on our units (`runes`, 符文-1…5 on every seat). Throws for a level with runes not supported at that difficulty, whose enemies there have abilities with no
 * behaviour yet — unless it is being tested (one of TESTING, or a level file that says so, `testing: true`): then the
 * level names them (`uncovered`, 关卡-8) —, or with devices not
 * profiled yet (装置-3).
 * @param {string} id @param {Difficulty} difficulty @param {(key: string) => object} [attack]
 * @param {Readonly<Record<string, any>>} [levels] the extracted levels to take it from (LEVELS)
 * @returns {{ level: import('@aue/sim').Content['level'], enemies: Record<string, EnemyDef>, blockAdd: number, runes: import('./runes.js').RuneEffect[],
 *   devices: Record<string, import('@aue/sim').DeviceDef> }}
 */
export function levelAt(id, difficulty, attack = () => ({}), levels = LEVELS) {
  const { raw, d, ours } = difficultyAt(id, difficulty, levels);
  const { waves, branches } = replacedSpawns(raw.level, d.replace);
  const football = withStadium(id, footballOf(id, raw.level.football)), group = stadiumGroup(football);
  const used = spawnedKeys(waves, branches, raw.enemies, football);
  const missing = uncoveredAbilities(Object.entries(raw.enemies).filter(([k]) => used.has(k)).map(([k, e]) => withFoeExtras(k, /** @type {EnemyDef} */ (e))));
  if (missing.length > 0 && !beingTested(id, raw)) throw new RangeError(`level ${id} at ${difficulty}: enemy abilities not supported yet: ${missing.join(', ')}`);
  // a carried unit's card (符文-6) is no device on the field: carried.js makes it; a device never placed needs no profile
  const unplaced = unplacedDevices(raw.level, waves, branches);
  const dev = profiledDevices(Object.fromEntries(Object.entries(raw.devices ?? {}).filter(([k]) => !Object.hasOwn(CARRIED, k) && (Object.hasOwn(DEVICE_PROFILES, k) || !unplaced.has(k)))));
  if (dev.missing.length > 0) throw new RangeError(`level ${id}: devices not supported yet: ${dev.missing.join(', ')}`);
  return {
    level: { ...raw.level, ...(football ? { football } : {}), waves, ...(branches ? { branches } : {}), ...(missing.length > 0 ? { uncovered: missing } : {}), hiddenGroups: group ? [...d.hiddenGroups, group] : d.hiddenGroups, ...(dev.works ? { works: dev.works } : {}),
      options: optionsAt(raw.level.options, d) },
    enemies: Object.fromEntries(Object.entries(raw.enemies).filter(([k]) => used.has(k))
      .map(([k, e]) => [k, { ...talentsMultiplied(k, multiplied(k, /** @type {EnemyDef} */ (e), d.enemyMul), d.talentMul ?? []), ...attack(k) }])),
    blockAdd: d.blockAdd ?? 0,
    runes: ours.effects,
    devices: dev.devices,
  };
}
