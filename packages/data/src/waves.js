// A level's waves, hidden groups, predefined units and co-op stages as the engine's (docs/spec/waves.md 波次-1, 波次-4,
// 波次-6; coop.md 合作-6, 合作-7).
import { asArray, asInt, asNumber, asObject, asString, field } from './validate.js';

/**
 * @typedef {{ type: 'SPAWN' | 'ACTIVATE' | 'WITHDRAW' | 'STORY' | 'NONE', key: string, route: number, count: number, preDelay: number, interval: number,
 *   dontBlockWave?: boolean, hidden?: string, group?: string, pack?: string, weight?: number, unharmful?: boolean }} WaveAction
 */
/**
 * @typedef {{ alias: string, objective: string, goal: number, advanced?: number, time: number, rest: number, enemy?: string, hpMax?: number }} Stage
 */
/** @typedef {{ preDelay: number, actions: WaveAction[] }} Fragment */
/** @typedef {{ preDelay: number, postDelay: number, maxWait: number, tag?: number, fragments: Fragment[] }} Wave */

/** The data's action types the simulation acts on (波次-1); every other type is NONE. */
const ACTION_TYPES = Object.freeze({ SPAWN: 'SPAWN', ACTIVATE_PREDEFINED: 'ACTIVATE', TRIGGER_PREDEFINED: 'ACTIVATE', WITHDRAW_PREDEFINED: 'WITHDRAW', STORY: 'STORY' });

/** An instance's promotion by its phase name (干员-1). */
const ELITE = Object.freeze({ PHASE_0: 0, PHASE_1: 1, PHASE_2: 2 });
/** The trust of the operators a level gives (its predefined ones and its cards), as PRTS gives it (INF-0201). */
const LEVEL_TRUST = 100;

/**
 * The training of an operator a level gives (波次-7, 关卡-7): its instance's promotion, level and potential, its
 * skill and skill level, trust 100. @param {Record<string, unknown>} o the predefine @param {string} p
 */
function levelBuild(o, p) {
  const inst = asObject(field(o, 'inst', p), `${p}.inst`), phase = asString(field(inst, 'phase', `${p}.inst`), `${p}.inst.phase`);
  if (!Object.hasOwn(ELITE, phase)) throw new RangeError(`${p}.inst.phase: unknown phase ${phase}`);
  return {
    elite: ELITE[/** @type {keyof typeof ELITE} */ (phase)], level: asInt(field(inst, 'level', `${p}.inst`), `${p}.inst.level`, 1, 90),
    potential: asInt(inst.potentialRank ?? 0, `${p}.inst.potentialRank`, 0, 5) + 1, trust: LEVEL_TRUST,
    skill: asInt(o.skillIndex ?? 0, `${p}.skillIndex`, -1, 2), skillLevel: asInt(o.mainSkillLvl ?? 1, `${p}.mainSkillLvl`, 1, 10),
  };
}

/** A difficulty's bit in a numeric difficultyMask (波次-4). */
const MASK_BITS = Object.freeze({ NORMAL: 1, FOUR_STAR: 2, EASY: 4, SIX_STAR: 8 });

/** @param {unknown} v @param {string} p @returns {string | undefined} a non-empty string, or nothing for null, undefined or '' */
function optString(v, p) {
  if (v === null || v === undefined || v === '') return undefined;
  return asString(v, p);
}

/**
 * One action (波次-1); null when the data marks it invalid. `routeOf` maps the data's route index to the content's;
 * actions that are not spawns keep route −1.
 * @param {unknown} raw @param {string} p @param {(index: number) => number} routeOf @returns {WaveAction | null}
 */
export function readAction(raw, p, routeOf) {
  const a = asObject(raw, p);
  if (a.isValid === false) return null;
  const kind = asString(field(a, 'actionType', p), `${p}.actionType`);
  const type = /** @type {Record<string, WaveAction['type']>} */ (ACTION_TYPES)[kind] ?? 'NONE';
  /** @type {WaveAction} */
  const out = {
    type,
    key: type === 'NONE' ? '' : asString(field(a, 'key', p), `${p}.key`),
    route: type === 'SPAWN' ? routeOf(asInt(field(a, 'routeIndex', p), `${p}.routeIndex`, 0, 100000)) : -1,
    count: asInt(a.count ?? 1, `${p}.count`, 0, 100000),
    preDelay: asNumber(a.preDelay ?? 0, `${p}.preDelay`, 0, 1e6),
    interval: asNumber(a.interval ?? 0, `${p}.interval`, 0, 1e6),
  };
  if (a.dontBlockWave === true) out.dontBlockWave = true;
  if (a.isUnharmfulAndAlwaysCountAsKilled === true) out.unharmful = true;
  const hidden = optString(a.hiddenGroup, `${p}.hiddenGroup`), group = optString(a.randomSpawnGroupKey, `${p}.randomSpawnGroupKey`);
  const pack = optString(a.randomSpawnGroupPackKey, `${p}.randomSpawnGroupPackKey`);
  if (hidden) out.hidden = hidden;
  if (group) out.group = group;
  if (pack) out.pack = pack;
  if (group) out.weight = asNumber(a.weight ?? 1, `${p}.weight`, 0, 1e6);
  return out;
}

/**
 * A level's waves (波次-1…波次-3): every wave and fragment with its delays, every valid action.
 * @param {unknown} wavesRaw level.waves @param {(index: number) => number} routeOf @returns {Wave[]}
 */
export function extractWaves(wavesRaw, routeOf) {
  return asArray(wavesRaw, 'level.waves').map((wRaw, wi) => {
    const wp = `level.waves[${wi}]`, wave = asObject(wRaw, wp);
    return {
      preDelay: asNumber(wave.preDelay ?? 0, `${wp}.preDelay`, 0, 1e6),
      postDelay: asNumber(wave.postDelay ?? 0, `${wp}.postDelay`, 0, 1e6),
      maxWait: asNumber(wave.maxTimeWaitingForNextWave ?? -1, `${wp}.maxTimeWaitingForNextWave`, -1, 1e6),
      // 阵地足球's kickoff tag (足球-6), when the wave has one; other levels write words there (stage, bosswave…); a
      // 阵地足球锦标 penalty shootout starts at the wave written penaltystart (锦标-4)
      ...(/^\d+$/.test(String(wave.advancedWaveTag ?? '')) ? { tag: asInt(Number(wave.advancedWaveTag), `${wp}.advancedWaveTag`, 0, 99) } : {}),
      ...(wave.advancedWaveTag === 'penaltystart' ? { penalty: true } : {}),
      fragments: asArray(field(wave, 'fragments', wp), `${wp}.fragments`).map((fRaw, fi) => {
        const fp = `${wp}.fragments[${fi}]`, frag = asObject(fRaw, fp);
        const actions = asArray(field(frag, 'actions', fp), `${fp}.actions`).map((a, ai) => readAction(a, `${fp}.actions[${ai}]`, routeOf));
        return { preDelay: asNumber(frag.preDelay ?? 0, `${fp}.preDelay`, 0, 1e6), actions: /** @type {WaveAction[]} */ (actions.filter(Boolean)) };
      }),
    };
  });
}

/**
 * A level's branches (守御-6): each named branch's phases as fragments — their preDelay and their valid actions; none
 * without branches. @param {unknown} raw level.branches @param {(index: number) => number} routeOf @returns {Record<string, Fragment[]>}
 */
export function branchesOf(raw, routeOf) {
  if (raw === null || raw === undefined) return {};
  return Object.fromEntries(Object.entries(asObject(raw, 'level.branches')).map(([name, b]) => {
    const p = `level.branches.${name}`;
    return [name, asArray(field(asObject(b, p), 'phases', p), `${p}.phases`).map((f, i) => {
      const fp = `${p}.phases[${i}]`, fo = asObject(f, fp);
      const actions = asArray(field(fo, 'actions', fp), `${fp}.actions`).map((a, ai) => readAction(a, `${fp}.actions[${ai}]`, routeOf));
      return { preDelay: asNumber(fo.preDelay ?? 0, `${fp}.preDelay`, 0, 1e6), actions: /** @type {WaveAction[]} */ (actions.filter(Boolean)) };
    })];
  }));
}

/**
 * Whether a rune's difficultyMask covers a difficulty (波次-4): the difficulty's name, ALL, or a number whose bit for the
 * difficulty is set.
 * @param {unknown} mask @param {'NORMAL' | 'FOUR_STAR'} difficulty
 */
export function maskCovers(mask, difficulty) {
  if (typeof mask === 'number') return (mask & MASK_BITS[difficulty]) !== 0;
  return mask === 'ALL' || mask === difficulty;
}

/**
 * The hidden groups a level enables at a difficulty (波次-4): the `key` of each level_hidden_group_enable rune whose
 * mask covers it, in rune order.
 * @param {unknown} runesRaw level.runes @param {'NORMAL' | 'FOUR_STAR'} difficulty @returns {string[]}
 */
export function hiddenGroupsOf(runesRaw, difficulty) {
  if (!Array.isArray(runesRaw)) return [];
  /** @type {string[]} */
  const out = [];
  runesRaw.forEach((r, i) => {
    const rp = `level.runes[${i}]`, rune = asObject(r, rp);
    if (rune.key !== 'level_hidden_group_enable' || !maskCovers(rune.difficultyMask, difficulty)) return;
    const bb = asArray(field(rune, 'blackboard', rp), `${rp}.blackboard`).map((b, k) => asObject(b, `${rp}.blackboard[${k}]`));
    const key = bb.find((b) => b.key === 'key');
    if (key) out.push(asString(key.valueStr, `${rp}.blackboard.key`));
  });
  return out;
}

/**
 * Whether a predefined instance is an operator (波次-7): a character instance with a tile that has no alias or is an
 * operator's (its key `char_…`). @param {string} list the predefines list it is in @param {Record<string, unknown>} o @param {string} key
 */
export const predefinedOperator = (list, o, key) => list === 'characterInsts' && !!o.position && typeof o.position === 'object' && (!o.alias || key.startsWith('char_'));

/**
 * The predefined units (波次-6): the character and token instances that have an alias, with their key, whether they
 * start hidden, and their tile and facing when the data gives them; and the predefined operators (波次-7): the
 * character instances with a tile that have no alias or are operators, by their alias (else their key), with their
 * training (`build`).
 * @param {unknown} raw level.predefines
 * @returns {{ alias: string, key: string, hidden: boolean, row?: number, col?: number, dir?: string, build?: ReturnType<typeof levelBuild> }[]}
 */
export function predefinesOf(raw) {
  if (raw === null || raw === undefined) return [];
  const pd = asObject(raw, 'level.predefines');
  return ['characterInsts', 'tokenInsts'].flatMap((k) => (Array.isArray(pd[k]) ? pd[k] : []).flatMap((x, i) => {
    const p = `level.predefines.${k}[${i}]`, o = asObject(x, p);
    const pos = o.position && typeof o.position === 'object' ? asObject(o.position, `${p}.position`) : null;
    const key = keyOf(o, p), operator = predefinedOperator(k, o, key);
    if (!o.alias && !operator) return [];
    return [{ alias: o.alias ? asString(o.alias, `${p}.alias`) : key, key, hidden: o.hidden === true,
      ...(pos ? { row: asInt(field(pos, 'row', `${p}.position`), `${p}.position.row`, 0, 99), col: asInt(field(pos, 'col', `${p}.position`), `${p}.position.col`, 0, 99) } : {}),
      ...(typeof o.direction === 'string' ? { dir: o.direction } : {}), ...(operator ? { build: levelBuild(o, p) } : {}) }];
  }));
}

/** A predefine's character key. @param {Record<string, unknown>} o @param {string} p */
const keyOf = (o, p) => asString(field(asObject(field(o, 'inst', p), `${p}.inst`), 'characterKey', `${p}.inst`), `${p}.inst.characterKey`);

/**
 * The cards a level gives (关卡-7): its character cards with their training, and its token cards with how many; each
 * with whether it starts hidden (and the alias a wave action shows it by).
 * @param {unknown} raw level.predefines
 * @returns {{ operators: { key: string, build: ReturnType<typeof levelBuild>, alias?: string, hidden?: true }[], tokens: { key: string, alias: string, count: number, hidden: boolean }[] }}
 */
export function levelCardsOf(raw) {
  if (raw === null || raw === undefined) return { operators: [], tokens: [] };
  const pd = asObject(raw, 'level.predefines');
  return {
    operators: (Array.isArray(pd.characterCards) ? pd.characterCards : []).map((x, i) => {
      const p = `level.predefines.characterCards[${i}]`, o = asObject(x, p), key = keyOf(o, p);
      return { key, build: levelBuild(o, p), ...(o.hidden === true ? { alias: o.alias ? asString(o.alias, `${p}.alias`) : key, hidden: /** @type {const} */ (true) } : {}) };
    }),
    tokens: (Array.isArray(pd.tokenCards) ? pd.tokenCards : []).map((x, i) => {
      const p = `level.predefines.tokenCards[${i}]`, o = asObject(x, p), key = keyOf(o, p);
      return { key, alias: o.alias ? asString(o.alias, `${p}.alias`) : key, count: asInt(o.initialCnt ?? 1, `${p}.initialCnt`, 0, 99), hidden: o.hidden === true };
    }),
  };
}

/** The co-op stage controller (合作-6). */
const STAGE_CONTROLLER = 'trap_179_muctrl';

/**
 * The objectives (合作-7): the blackboard keys of the minimum and advanced targets and of the time limit.
 * @type {Readonly<Record<string, { goal: string, advanced?: string, enemy?: boolean }>>}
 */
const OBJECTIVES = Object.freeze({
  protect: { goal: 'protect_y1', advanced: 'protect_y2' },
  target: { goal: 'kill_y1', advanced: 'kill_y2', enemy: true },
  kill: { goal: 'cnt_y1', advanced: 'cnt_y2' },
  tower: { goal: 'tower_y1', advanced: 'tower_y2' },
  car: { goal: 'distance_y1' },
});

/**
 * One stage from its controller's blackboard (合作-6, 合作-7). The first stage (`basic`) has no advanced target; 生存's
 * targets are its times and its limit the longer; 突击's are fractions of `hp_max`, its advanced target all of it.
 * @param {string} alias @param {Record<string, number | string>} bb @param {string} p @returns {Stage}
 */
function readStage(alias, bb, p) {
  const num = (/** @type {string} */ k) => asNumber(field(bb, k, p), `${p}.${k}`, 0, 1e9);
  const objective = asString(field(bb, 'ability_name', p), `${p}.ability_name`), basic = bb.basic === 1, rest = bb.rest_time === undefined ? 0 : num('rest_time');
  if (objective === 'survive') {
    const x1 = num('time_x1'), x2 = num('time_x2');
    return { alias, objective, goal: x1, ...(!basic && x2 > x1 ? { advanced: x2 } : {}), time: Math.max(x1, x2), rest };
  }
  if (objective === 'boss') {
    const x = num('hp_x1');
    return { alias, objective, goal: x, ...(!basic && x < 1 ? { advanced: 1 } : {}), time: num('time_x'), rest, hpMax: num('hp_max') };
  }
  const o = OBJECTIVES[objective];
  if (!o) throw new RangeError(`${p}: unknown stage objective ${objective}`);
  return {
    alias, objective, goal: num(o.goal), ...(!basic && o.advanced && bb[o.advanced] !== undefined ? { advanced: num(o.advanced) } : {}),
    time: num('time_x'), rest, ...(o.enemy ? { enemy: asString(field(bb, 'enemy_key', p), `${p}.enemy_key`) } : {}),
  };
}

/**
 * A level's co-op stages (合作-6): its stage controllers among the predefined units, in order, read from their
 * blackboards.
 * @param {unknown} raw level.predefines @returns {Stage[]}
 */
export function stagesOf(raw) {
  if (raw === null || raw === undefined) return [];
  const pd = asObject(raw, 'level.predefines');
  return ['characterInsts', 'tokenInsts'].flatMap((k) => (Array.isArray(pd[k]) ? pd[k] : []).flatMap((x, i) => {
    const p = `level.predefines.${k}[${i}]`, o = asObject(x, p);
    if (asObject(field(o, 'inst', p), `${p}.inst`).characterKey !== STAGE_CONTROLLER) return [];
    const bb = Object.fromEntries(asArray(field(o, 'overrideSkillBlackboard', p), `${p}.overrideSkillBlackboard`).map((b, j) => {
      const e = asObject(b, `${p}.overrideSkillBlackboard[${j}]`);
      return [asString(e.key, `${p}.overrideSkillBlackboard[${j}].key`), /** @type {number | string} */ (e.valueStr ?? e.value)];
    }));
    return [readStage(asString(field(o, 'alias', p), `${p}.alias`), bb, `${p}.overrideSkillBlackboard`)];
  }));
}

