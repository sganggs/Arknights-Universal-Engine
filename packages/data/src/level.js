// A whole level as content (docs/spec/level.md 关卡-1, 关卡-2): its map, routes, waves, predefined units, co-op stages,
// what each difficulty changes, and its enemies with the level's overrides. Pure functions over parsed game data.
import { asArray, asNumber, asObject, asString, field } from './validate.js';
import { extractEdges, extractTiles, readRoute } from './skeleton-world.js';
import { branchesOf, extractWaves, predefinesOf, stagesOf, maskCovers, levelCardsOf } from './waves.js';
import { devicesOf } from './devices.js';
import { extractOptions } from './skeleton.js';
import { enemyOf, sharedEnemies, damageTypeOf } from './enemies.js';
import { footballField, footballPlayers, CUP_MANAGER } from './football.js';

/** @typedef {'NORMAL' | 'FOUR_STAR'} Difficulty */
/** @typedef {{ mods: Record<string, number>, enemy?: string[], exclude?: string[] }} EnemyMul */
/** A rune on our units (关卡-2, 符文-1): its key, profession mask and blackboard. @typedef {{ key: string, professions: number, board: [string, number | string][] }} OurRune */
/**
 * What a difficulty changes (关卡-2): hidden groups enabled, the life point, enemy multipliers of attributes and of
 * talents' values (`talentMul`, keys `<talent>.<field>`), enemy replacements, the runes on our units (`ours`, as seat
 * runes on every seat), and the runes not supported yet.
 * @typedef {{ hiddenGroups: string[], lifePoint?: number, maxCost?: number, blockAdd?: number, costScale?: number, enemyMul: EnemyMul[], talentMul?: EnemyMul[],
 *   replace: Record<string, string>, ours?: OurRune[], unsupported: string[] }} DifficultyRules
 */

/** The runes 关卡-2 applies or that other clauses read (共同敌手, 合作-2). */
const KNOWN_RUNES = Object.freeze(['level_hidden_group_enable', 'level_hidden_group_disable', 'global_lifepoint', 'enemy_attribute_mul', 'level_enemy_replace', 'cooperate_enemy_side_shared']);
/** The runes that set one number (关卡-2): the rule's field and the blackboard key. */
/** @type {Readonly<Record<string, ['lifePoint' | 'maxCost' | 'costScale', string]>>} */
const SCALAR_RUNES = Object.freeze({ global_lifepoint: ['lifePoint', 'value'], cbuff_max_cost: ['maxCost', 'max_cost'], global_cost_recovery_mul: ['costScale', 'scale'] });
/** The runes on our units that 符文-1…5 read, as every seat's (关卡-2). */
const OUR_RUNES = Object.freeze(['char_attribute_mul', 'char_respawntime_mul', 'char_skill_cd_mul', 'env_gbuff_new']);
/** All ten professions' bits (符文-1), a mask written `ALL`. */
const ALL_PROFESSIONS = 1023;
/** enemy_attribute_mul's keys (关卡-2). */
const MUL_KEYS = Object.freeze(['atk', 'def', 'max_hp', 'magic_resistance', 'move_speed', 'attack_speed', 'mass_level']);

/** @param {string} s a `|`-separated list @returns {string[]} */
const list = (s) => s.split('|').filter(Boolean);

/**
 * One rune's blackboard as { key: value }, valueStr when given.
 * @param {Record<string, unknown>} rune @param {string} rp @returns {Record<string, number | string>}
 */
function boardOf(rune, rp) {
  return Object.fromEntries(asArray(field(rune, 'blackboard', rp), `${rp}.blackboard`).map((b, k) => {
    const o = asObject(b, `${rp}.blackboard[${k}]`);
    return [asString(o.key, `${rp}.blackboard[${k}].key`), /** @type {number | string} */ (o.valueStr ?? o.value)];
  }));
}

/**
 * A multiplier rune (关卡-2): the given keys' values, and the enemies it is for (`enemy`) or not for (`enemy_exclude`).
 * @param {Record<string, number | string>} bb @param {string[]} keys @param {(k: string) => number} num @returns {EnemyMul}
 */
const mulOf = (bb, keys, num) => ({
  mods: Object.fromEntries(keys.map((k) => [k, num(k)])),
  ...(typeof bb.enemy === 'string' ? { enemy: list(bb.enemy) } : {}),
  ...(typeof bb.enemy_exclude === 'string' ? { exclude: list(bb.enemy_exclude) } : {}),
});

/**
 * A rune on our units (关卡-2) as a seat rune (符文-1): its mask a number, or `ALL`.
 * @param {Record<string, unknown>} rune @param {string} key @param {Record<string, number | string>} bb @param {string} rp @returns {OurRune}
 */
function ourRune(rune, key, bb, rp) {
  const m = rune.professionMask ?? 'ALL';
  return { key, professions: m === 'ALL' ? ALL_PROFESSIONS : asNumber(m, `${rp}.professionMask`, 0, ALL_PROFESSIONS), board: Object.entries(bb) };
}

/**
 * Whether a rune is read by another clause, not a difficulty's (关卡-2): 合作-2's shared enemies, 锦标-1's manager.
 * @param {string} key @param {Record<string, number | string>} bb
 */
const readElsewhere = (key, bb) => (key === 'env_gbuff_new_with_verify' && bb.key === 'cooperate_enemy_side_shared') || (key === 'env_system_new' && bb.key === CUP_MANAGER);

/**
 * What the level's runes change at a difficulty (关卡-2).
 * @param {unknown} runesRaw level.runes @param {Difficulty} difficulty @returns {DifficultyRules}
 */
export function difficultyOf(runesRaw, difficulty) {
  /** @type {DifficultyRules} */
  const out = { hiddenGroups: [], enemyMul: [], replace: {}, unsupported: [] };
  /** @type {string[]} */
  const disabled = [];
  (Array.isArray(runesRaw) ? runesRaw : []).forEach((r, i) => {
    const rp = `level.runes[${i}]`, rune = asObject(r, rp), key = asString(field(rune, 'key', rp), `${rp}.key`);
    if (!maskCovers(rune.difficultyMask, difficulty)) return;
    const bb = boardOf(rune, rp), num = (/** @type {string} */ k) => asNumber(field(bb, k, `${rp}.blackboard`), `${rp}.blackboard.${k}`, 0, 1e9);
    if (key === 'level_hidden_group_enable') out.hiddenGroups.push(String(field(bb, 'key', `${rp}.blackboard`)));
    else if (key === 'level_hidden_group_disable') disabled.push(String(field(bb, 'key', `${rp}.blackboard`)));
    else if (Object.hasOwn(SCALAR_RUNES, key)) {
      const [to, from] = SCALAR_RUNES[key];
      out[to] = num(from);
    } else if (key === 'char_blockcnt_add') out.blockAdd = asNumber(field(bb, 'value', `${rp}.blackboard`), `${rp}.blackboard.value`, -10, 10);
    else if (key === 'level_enemy_replace') out.replace[String(field(bb, 'key', `${rp}.blackboard`))] = String(field(bb, 'value', `${rp}.blackboard`));
    else if (key === 'enemy_attribute_mul') out.enemyMul.push(mulOf(bb, MUL_KEYS.filter((k) => k in bb), num));
    else if (key === 'enemy_talent_blackb_mul') (out.talentMul ??= []).push(mulOf(bb, Object.keys(bb).filter((k) => k.includes('.')), num));
    else if (OUR_RUNES.includes(key)) (out.ours ??= []).push(ourRune(rune, key, bb, rp));
    else if (!readElsewhere(key, bb) && !KNOWN_RUNES.includes(key)) out.unsupported.push(key);
  });
  out.hiddenGroups = out.hiddenGroups.filter((g) => !disabled.includes(g));
  return out;
}

/**
 * The level's routes in first-use order, and the maps from a data route index — of its routes, or of its extra routes
 * (a branch's, 守御-6) — to the content's. @param {unknown} routesRaw @param {unknown} extraRaw level.extraRoutes
 */
function routeTable(routesRaw, extraRaw) {
  const all = asArray(routesRaw, 'level.routes'), extra = asArray(extraRaw ?? [], 'level.extraRoutes');
  /** @type {Map<string, number>} */
  const renumber = new Map();
  /** @type {import('./skeleton-world.js').Route[]} */
  const routes = [];
  /** The route a spawn names, among the level's routes or its extra ones (a branch's, 守御-6), numbered in first-use order. @param {unknown[]} list @param {string} name @param {number} index */
  const use = (list, name, index) => {
    if (index >= list.length || list[index] === null) throw new Error(`a spawn uses ${name} ${index}, which does not exist`);
    const k = `${name}:${index}`;
    if (!renumber.has(k)) { renumber.set(k, routes.length); routes.push(readRoute(list[index], `level.${name}[${index}]`)); }
    return /** @type {number} */ (renumber.get(k));
  };
  return { routes, routeOf: (/** @type {number} */ i) => use(all, 'routes', i), extraOf: (/** @type {number} */ i) => use(extra, 'extraRoutes', i) };
}

/**
 * A camera view vector (关卡-3): three finite numbers.
 * @param {unknown} v @returns {number[]}
 */
function viewOf(v) {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) throw new TypeError('level view: not three finite numbers');
  return [...v];
}

/**
 * A stage's code and name (关卡-4) from its stage table entry; none without one.
 * @param {unknown} stage @returns {{ code?: string, name?: string }}
 */
function stageNames(stage) {
  if (stage === undefined) return {};
  const o = asObject(stage, 'stage');
  return { code: asString(field(o, 'code', 'stage'), 'stage.code'), name: asString(field(o, 'name', 'stage'), 'stage.name') };
}

/**
 * The stages with their tasks' texts (关卡-5): the missions, in order, give each stage its basic task and then, when it
 * has an advanced goal, its advanced one; without missions, or when they are not one per goal, the stages as they are.
 * @param {ReturnType<typeof stagesOf>} stages @param {unknown} missions @returns {Record<string, unknown>[]}
 */
function withTasks(stages, missions) {
  if (missions === undefined) return stages;
  const list = asArray(missions, 'missions').map((m, i) => {
    const o = asObject(m, `missions[${i}]`);
    return { title: asString(field(o, 'title', `missions[${i}]`), `missions[${i}].title`), text: asString(field(o, 'description', `missions[${i}]`), `missions[${i}].description`) };
  });
  if (list.length !== stages.reduce((n, st) => n + (st.advanced === undefined ? 1 : 2), 0)) return stages;
  let k = 0;
  return stages.map((st) => {
    const basic = list[k++], advanced = st.advanced === undefined ? null : list[k++];
    return { ...st, task: { title: basic.title, basic: basic.text, ...(advanced ? { advanced: advanced.text } : {}) } };
  });
}

/**
 * The enemies of a level with those their abilities bring (关卡-1, 敌能-22): every enemy key a talent's or skill's
 * blackboard names (a split, a summon, a rebirth as another), and theirs in turn; sorted by key.
 * @param {string[]} keys @param {(key: string) => Record<string, any>} make @returns {Record<string, Record<string, any>>}
 */
export function withSummoned(keys, make) {
  /** @type {Record<string, Record<string, any>>} */
  const out = {};
  const queue = [...keys];
  while (queue.length > 0) {
    const k = /** @type {string} */ (queue.shift());
    if (Object.hasOwn(out, k)) continue;
    out[k] = make(k);
    queue.push(...summonedBy(out[k]));
  }
  return Object.fromEntries(Object.keys(out).toSorted().map((k) => [k, out[k]]));
}

/** The enemy keys an enemy's abilities name (敌能-22). @param {Record<string, any>} e @returns {string[]} */
export const summonedBy = (e) => [...Object.values(e.talents ?? {}), ...(e.skills ?? []).map((/** @type {any} */ s) => s.bb)]
  .flatMap((bb) => Object.values(bb)).filter((v) => typeof v === 'string' && /^enemy_\w+$/.test(v));

/** The global buff that makes a level 堡垒守御 (守御-1). */
const FORTRESS_BUFF = 'cooperate_fortress_global_buff';

/**
 * 堡垒守御's settings (守御-1, 守御-2) from the level's global buff: rest, defence and last defence times, the life a rest
 * gives, `rest_add`; none for another level. @param {unknown} raw level.globalBuffs
 */
function fortressField(raw) {
  const buff = asArray(raw ?? [], 'level.globalBuffs').map((x, i) => asObject(x, `level.globalBuffs[${i}]`)).find((x) => x.prefabKey === FORTRESS_BUFF);
  if (!buff) return {};
  const p = `level.globalBuffs[${FORTRESS_BUFF}]`;
  const bb = Object.fromEntries(asArray(field(buff, 'blackboard', p), `${p}.blackboard`).map((e, i) => {
    const o = asObject(e, `${p}.blackboard[${i}]`);
    return [asString(field(o, 'key', p), `${p}.key`), o.value];
  }));
  const num = (/** @type {string} */ k) => asNumber(field(bb, k, p), `${p}.${k}`, 0, 1e6);
  return { fortress: { rest: num('rest_time'), wave: num('wave_time'), waveLast: num('wave_time_last'), life: num('life_point'), restAdd: num('rest_add') } };
}

/** The level's branches (守御-6), only when it has some. @param {Record<string, unknown>} branches */
const branchesField = (branches) => (Object.keys(branches).length > 0 ? { branches } : {});

/**
 * The level's own cards (关卡-7), only when it has some: a card hidden at first stays hidden only when an action of the
 * level activates its alias (波次-9). @param {unknown} raw level.predefines @param {{ actions: { type: string, key: string }[] }[]} frags
 */
function cardsField(raw, frags) {
  const cards = levelCardsOf(raw), shown = new Set(frags.flatMap((f) => f.actions.filter((a) => a.type === 'ACTIVATE').map((a) => a.key)));
  if (!cards.operators.length && !cards.tokens.length) return {};
  return { cards: {
    operators: cards.operators.map(({ alias, hidden, ...o }) => (hidden && alias !== undefined && shown.has(alias) ? { ...o, alias, hidden } : o)),
    tokens: cards.tokens.map((t) => ({ ...t, hidden: t.hidden && shown.has(t.alias) })),
  } };
}

/**
 * A whole level (关卡-1…关卡-5): `id` names it in the content.
 * @param {{ id: string, level: unknown, enemyDb: unknown, handbook?: unknown, commit: string, view?: { vector: unknown, source: string }, stage?: unknown,
 *   missions?: unknown, charTable?: unknown, coop?: unknown, cupEvent?: unknown }} input
 * @returns {Record<string, unknown>}
 */
export function extractLevel({ id, level, enemyDb, handbook, commit, view, stage, missions, charTable, coop, cupEvent }) {
  const lv = asObject(level, 'level');
  const { width, height, tiles } = extractTiles(field(lv, 'mapData', 'level')), blockEdges = extractEdges(lv.mapData);
  const { routes, routeOf, extraOf } = routeTable(field(lv, 'routes', 'level'), lv.extraRoutes);
  // a branch's spawns name the level's extra routes (守御-6)
  const waves = extractWaves(field(lv, 'waves', 'level'), routeOf), branches = branchesOf(lv.branches, extraOf);
  const runes = lv.runes ?? null, difficulties = { NORMAL: difficultyOf(runes, 'NORMAL'), FOUR_STAR: difficultyOf(runes, 'FOUR_STAR') };
  const refs = new Map(asArray(lv.enemyDbRefs ?? [], 'level.enemyDbRefs').map((r, i) => {
    const o = asObject(r, `level.enemyDbRefs[${i}]`);
    return [asString(field(o, 'id', `level.enemyDbRefs[${i}]`), `level.enemyDbRefs[${i}].id`), o];
  }));
  // 阵地足球's teams field players the waves do not name (足球-6), their elite ones those the references name
  const football = footballField(tiles, { options: field(lv, 'options', 'level'), globalBuffs: lv.globalBuffs, runes: lv.runes, event: cupEvent }, coop, missions, (k) => refs.has(k));
  const frags = [...waves.flatMap((w) => w.fragments), ...Object.values(branches).flat()];
  const spawned = frags.flatMap((f) => f.actions.filter((a) => a.type === 'SPAWN').map((a) => a.key));
  const keys = [...new Set([...spawned, ...Object.values(difficulties).flatMap((d) => Object.values(d.replace)), ...footballPlayers(football)])].toSorted();
  const shared = sharedEnemies(runes);
  const enemies = withSummoned(keys, (k) => ({ ...enemyOf(enemyDb, k, refs.get(k)), ...damageTypeOf(handbook, k), ...(shared.has(k) ? { shared: true } : {}) }));
  return {
    source: { repo: 'Kengxxiao/ArknightsGameData', commit, server: 'zh_CN', ...(view ? { view: view.source } : {}) },
    level: { id, ...stageNames(stage), width, height, options: extractOptions(field(lv, 'options', 'level')), tiles, ...(blockEdges.length > 0 ? { blockEdges } : {}),
      routes, waves, ...branchesField(branches), predefines: predefinesOf(lv.predefines), stages: withTasks(stagesOf(lv.predefines), missions), ...cardsField(lv.predefines, frags),
      ...fortressField(lv.globalBuffs), ...football,
      ...(view ? { view: viewOf(view.vector) } : {}), ...(typeof lv.bgmEvent === 'string' && lv.bgmEvent ? { bgm: lv.bgmEvent } : {}) },
    difficulties,
    enemies,
    ...(charTable ? { devices: devicesOf(charTable, lv.predefines) } : {}),
  };
}
