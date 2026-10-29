// 阵地足球's settings (docs/spec/football.md 足球-1, 足球-6): a level whose tiles have both goals is 阵地足球; its kickoff
// tables, teams, players' wait and match time come from the co-op battle table and the level's options, its stamps from
// the missions' texts (「争取N个净胜球」). A level with the 阵地足球锦标 manager among its runes is the event's (cup.md
// 锦标-1): the manager's enemy move speed of its 冻人冬日 stadium, and from the level's config blackboard its stadium,
// the lead that wins at once, the change to the deploy limit in a penalty shootout and the type of team it draws.
import { asArray, asNumber, asObject, asString, field } from './validate.js';

/** The goal tiles that make a level 阵地足球 (足球-1). */
const GOALS = Object.freeze(['tile_allygoal', 'tile_enemygoal']);

/**
 * The teams of the co-op 阵地足球 (足球-6): the four the 促融共竞 page lists. The table's other three (直球队, 门神会,
 * 魔球帮) are new in the 阵地足球锦标 event.
 */
export const COOP_TEAMS = Object.freeze(['normal', 'shooter', 'hurrier', 'kungfuer']);

/** A mission's net goals (足球-6): the number in 「争取N个净胜球」, or null. @param {unknown} m */
function missionGoals(m) {
  const d = typeof m === 'object' && m !== null ? /** @type {Record<string, unknown>} */ (m).description : null;
  const hit = typeof d === 'string' ? /争取(\d+)个净胜球/.exec(d) : null;
  return hit ? Number(hit[1]) : null;
}

/** Whether a level's tiles have both goals (足球-1). @param {{ key: string }[][]} tiles */
export const isFootball = (tiles) => GOALS.every((g) => tiles.some((row) => row.some((t) => t.key === g)));

/**
 * The kickoff level each lead reaches (足球-6): [the lead, the level] by the table's `footballAheadGoalCntFactor`, in
 * its order. @param {Record<string, unknown>} coop
 */
function aheadOf(coop) {
  const p = 'cooperate_battle_table.footballAheadGoalCntFactor';
  return asArray(field(coop, 'footballAheadGoalCntFactor', p), p).map((x, i) => {
    const o = asObject(x, `${p}[${i}]`);
    return [asNumber(field(o, 'aheadCnt', p), `${p}[${i}].aheadCnt`, 0, 1e6), asNumber(field(o, 'level', p), `${p}[${i}].level`, 0, 99)];
  });
}

/**
 * Each kickoff level's weights of the wave tags (足球-6): level → the weight of tag 0, 1, … by the table's
 * `footballLevelOfWaveFactor`. @param {Record<string, unknown>} coop
 */
function weightsOf(coop) {
  const p = 'cooperate_battle_table.footballLevelOfWaveFactor', o = asObject(field(coop, 'footballLevelOfWaveFactor', p), p);
  return Object.fromEntries(Object.entries(o).map(([level, list]) => {
    const ws = asArray(list, `${p}.${level}`).map((x, i) => asObject(x, `${p}.${level}[${i}]`));
    const tags = ws.map((x, i) => asNumber(field(x, 'wave', p), `${p}.${level}[${i}].wave`, 0, 99));
    const out = Array.from({ length: Math.max(...tags) + 1 }, () => 0);
    ws.forEach((x, i) => { out[tags[i]] = asNumber(field(x, 'weight', p), `${p}.${level}[${i}].weight`, 0, 1e6); });
    return [level, out];
  }));
}

/** The table's teams with their weights and types (足球-6, 锦标-6). @param {Record<string, unknown>} coop */
function teamWeights(coop) {
  const p = 'cooperate_battle_table.footballTeamWeights';
  return asArray(field(coop, 'footballTeamWeights', 'cooperate_battle_table'), p).map((x, i) => asObject(x, `${p}[${i}]`));
}

/**
 * Teams with their weights and players (足球-6, 锦标-6), and each team's elite players: a player's `_2` that the level's
 * enemy references name (`has`). @param {Record<string, unknown>} coop @param {(key: string) => boolean} has
 * @param {readonly string[]} names the teams, by name @param {(role: string) => boolean} [eliteRole] a role whose
 * players all have their `_2` as the elite one (锦标-6)
 * @returns {{ name: string, weight: number, players: Record<string, string>, elite?: Record<string, string> }[]}
 */
function teamsOf(coop, has, names, eliteRole = () => false) {
  const p = 'cooperate_battle_table', players = asObject(field(coop, 'footballTeamPlayers', p), `${p}.footballTeamPlayers`), weights = teamWeights(coop);
  return names.map((name) => {
    const w = weights.find((x) => x.teamName === name), roles = asObject(field(players, name, `${p}.footballTeamPlayers`), `${p}.footballTeamPlayers.${name}`);
    if (!w) throw new Error(`${p}.footballTeamWeights has no ${name}`);
    const keys = Object.entries(roles).map(([role, key]) => [role, asString(key, `${p}.footballTeamPlayers.${name}.${role}`)]);
    const elite = keys.filter(([role, key]) => has(`${key}_2`) || eliteRole(role)).map(([role, key]) => [role, `${key}_2`]);
    return { name, weight: asNumber(field(w, 'weight', p), `${p}.footballTeamWeights.${name}.weight`, 0, 1e6),
      players: Object.fromEntries(keys), ...(elite.length > 0 ? { elite: Object.fromEntries(elite) } : {}) };
  });
}

/** The 阵地足球锦标 manager's key in its `env_system_new` rune (锦标-1). */
export const CUP_MANAGER = 'env_v074_football_cup_mgr';

/**
 * The 阵地足球锦标 manager's rune of a level (锦标-1): its `env_system_new` rune keyed {@link CUP_MANAGER}, or null.
 * @param {unknown} raw level.runes
 */
const managerOf = (raw) => (Array.isArray(raw) ? raw : []).map((x, i) => asObject(x, `level.runes[${i}]`))
  .find((r) => r.key === 'env_system_new' && asArray(r.blackboard ?? [], 'level.runes.blackboard').some((b) => asObject(b, 'blackboard').valueStr === CUP_MANAGER)) ?? null;

/** A level's config blackboard (锦标-1): `options.configBlackBoard` by key. @param {Record<string, unknown>} options */
function configOf(options) {
  const p = 'level.options.configBlackBoard';
  return Object.fromEntries(asArray(options.configBlackBoard ?? [], p).map((x, i) => {
    const o = asObject(x, `${p}[${i}]`);
    return [asString(field(o, 'key', p), `${p}[${i}].key`), asNumber(o.value, `${p}[${i}].value`, -1e6, 1e6)];
  }));
}

/**
 * The stadium types a 锦标 level draws from with their weights (锦标-2): the table's `footballStadiumWeights`.
 * @param {Record<string, unknown>} coop @returns {[number, number][]}
 */
function stadiumWeights(coop) {
  const p = 'cooperate_battle_table.footballStadiumWeights';
  return asArray(field(coop, 'footballStadiumWeights', 'cooperate_battle_table'), p).map((x, i) => {
    const o = asObject(x, `${p}[${i}]`);
    return [asNumber(field(o, 'stadiumType', p), `${p}[${i}].stadiumType`, 1, 99), asNumber(field(o, 'weight', p), `${p}[${i}].weight`, 0, 1e6)];
  });
}

/**
 * The 阵地足球锦标 settings of a level (锦标-1, 锦标-2, 锦标-4, 锦标-6), null for another level: the manager's
 * `move_speed`; from the config blackboard the stadium type (`stadium_type`, 0 for one drawn by the table's
 * `footballStadiumWeights`), the lead that wins at once (`win_goal_difference`, −1 for none), the change to the deploy
 * limit in a penalty shootout (`delta_buildable_cnt_penalty`) and the type of team drawn (`team_type`, −1 for none).
 * @param {unknown} runes level.runes @param {Record<string, unknown>} options @param {Record<string, unknown>} coop
 */
function cupOf(runes, options, coop) {
  const rune = managerOf(runes);
  if (!rune) return null;
  const speed = asArray(rune.blackboard, 'level.runes.blackboard').map((b) => asObject(b, 'blackboard')).find((b) => b.key === 'move_speed');
  const bb = configOf(options), stadiumType = bb.stadium_type ?? 1;
  return { moveSpeed: speed ? asNumber(speed.value, `level.runes[${CUP_MANAGER}].move_speed`, 0, 100) : 1, stadiumType, mercy: bb.win_goal_difference ?? -1,
    ...(stadiumType === 0 ? { stadiumWeights: stadiumWeights(coop) } : {}),
    ...(bb.delta_buildable_cnt_penalty === undefined ? {} : { kickerDelta: bb.delta_buildable_cnt_penalty }), teamType: bb.team_type ?? -1 };
}

/** A rune of the event's as a seat rune (同步-9): its key, profession mask and board. @param {unknown} raw @param {string} p */
function seatRuneOf(raw, p) {
  const r = asObject(raw, p), sel = asObject(field(r, 'selector', p), `${p}.selector`);
  const board = asArray(field(r, 'blackboard', p), `${p}.blackboard`).map((x, i) => {
    const b = asObject(x, `${p}.blackboard[${i}]`), key = asString(field(b, 'key', p), `${p}.blackboard[${i}].key`);
    return [key, typeof b.valueStr === 'string' ? b.valueStr : asNumber(b.value, `${p}.blackboard[${i}].value`, -1e9, 1e9)];
  });
  return { key: asString(field(r, 'key', p), `${p}.key`), professions: asNumber(field(sel, 'professionMask', p), `${p}.selector.professionMask`, 0, 1023), board };
}

/**
 * A 锦标 stage's event settings (锦标-7): the two sides' names and the event's relics — each with the name and text of
 * the stage that unlocks it (matched by the relic's description), and its runes as seat runes. None outside the event.
 * @param {unknown} raw the event data the CLI reads (activity table) @returns {{ sides?: { ours: string, theirs: string }, relics?: unknown[] }}
 */
function cupEventField(raw) {
  if (raw === undefined) return {};
  const p = 'activity_table.ACT_FOOTBALL', ev = asObject(raw, p), st = asObject(field(ev, 'stage', p), `${p}.stage`);
  const stages = asArray(field(ev, 'stages', p), `${p}.stages`).map((x, i) => asObject(x, `${p}.stages[${i}]`));
  const relics = asArray(field(ev, 'relics', p), `${p}.relics`).map((x, i) => {
    const r = asObject(x, `${p}.relics[${i}]`), text = asString(field(r, 'description', p), `${p}.relics[${i}].description`);
    const by = stages.find((s) => s.unlockBuffDesc === text);
    return { id: asString(field(r, 'id', p), `${p}.relics[${i}].id`), name: by ? asString(by.unlockBuffName, `${p}.unlockBuffName`) : '', text,
      ...(by ? { unlockedBy: asString(by.stageId, `${p}.stageId`) } : {}),
      runes: asArray(field(r, 'runes', p), `${p}.relics[${i}].runes`).map((y, j) => seatRuneOf(y, `${p}.relics[${i}].runes[${j}]`)) };
  });
  return { sides: { ours: asString(field(st, 'selfTeamName', p), `${p}.selfTeamName`), theirs: asString(field(st, 'enemyTeamName', p), `${p}.enemyTeamName`) }, relics };
}

/**
 * The teams a 锦标 level draws (锦标-6): those of its team type in the table, with the standard team's `_2` the level
 * names making each team's of the same role elite; none for a level without a team type.
 * @param {Record<string, unknown>} coop @param {number} type @param {(key: string) => boolean} has
 */
function cupTeams(coop, type, has) {
  if (type <= 0) return [];
  const names = teamWeights(coop).filter((x) => x.teamType === type).map((x) => asString(x.teamName, 'cooperate_battle_table.footballTeamWeights.teamName'));
  const standard = asObject(asObject(coop.footballTeamPlayers, 'cooperate_battle_table.footballTeamPlayers')[COOP_TEAMS[0]], 'cooperate_battle_table.footballTeamPlayers.normal');
  return teamsOf(coop, has, names, (role) => typeof standard[role] === 'string' && has(`${standard[role]}_2`));
}

/** The global buff that strengthens the players by our lead (足球-17). */
const CATCH_UP = 'cooperate_enemy_catch_up';

/**
 * What each goal of our lead adds to the players (足球-17): the level's `cooperate_enemy_catch_up` global buff — max
 * HP, ATK and move speed as fractions —, none when it adds nothing. A non-zero `attack_speed` is not read yet.
 * @param {unknown} raw level.globalBuffs @returns {{ catchUp?: { maxHp: number, atk: number, moveSpeed: number } }}
 */
function catchUpOf(raw) {
  const buff = asArray(raw ?? [], 'level.globalBuffs').map((x, i) => asObject(x, `level.globalBuffs[${i}]`)).find((x) => x.prefabKey === CATCH_UP);
  if (!buff) return {};
  const p = `level.globalBuffs[${CATCH_UP}]`;
  const bb = Object.fromEntries(asArray(field(buff, 'blackboard', p), `${p}.blackboard`).map((e, i) => {
    const o = asObject(e, `${p}.blackboard[${i}]`);
    return [asString(field(o, 'key', p), `${p}.key`), asNumber(o.value, `${p}.blackboard[${i}].value`, 0, 100)];
  }));
  if (bb.attack_speed) throw new Error(`${p}: attack_speed ${bb.attack_speed} is not read yet`);
  const up = { maxHp: bb.max_hp ?? 0, atk: bb.atk ?? 0, moveSpeed: bb.move_speed ?? 0 };
  return up.maxHp || up.atk || up.moveSpeed ? { catchUp: up } : {};
}

/**
 * A 阵地足球 level's settings (足球-6, 足球-17, 锦标-1), none for another level: the match time (`maxPlayTime`), the
 * players' wait at a kickoff, the stamps' net goals, the kickoff tables, the co-op teams with their elite players — in a
 * 锦标 level those of its team type, none where its waves name its players —, the name part of each player role, what
 * our lead adds to the players, and the 锦标 settings.
 * @param {{ key: string }[][]} tiles @param {{ options: unknown, globalBuffs?: unknown, runes?: unknown, event?: unknown }} level the raw
 * level's options, global buffs and runes, and a 锦标 stage's event data (锦标-7) @param {unknown} coop cooperate_battle_table.json @param {unknown} [missions]
 * @param {(key: string) => boolean} [has] whether the level's enemy references name a key
 * @returns {{ football?: Record<string, unknown> }}
 */
export function footballField(tiles, level, coop, missions, has = () => false) {
  if (!isFootball(tiles) || coop === undefined) return {};
  const c = asObject(coop, 'cooperate_battle_table'), p = 'cooperate_battle_table', options = asObject(level.options, 'level.options');
  const stamps = asArray(missions ?? [], 'missions').map(missionGoals).filter((n) => n !== null);
  const roles = asObject(field(c, 'footballPlayersName', p), `${p}.footballPlayersName`), cup = cupOf(level.runes, options, c);
  return { football: {
    time: asNumber(field(options, 'maxPlayTime', 'level.options'), 'level.options.maxPlayTime', 1, 1e6),
    wait: asNumber(field(c, 'footballPlayersWaitTimeOnWaveStart', p), `${p}.footballPlayersWaitTimeOnWaveStart`, 0, 1e6),
    stamps, ahead: aheadOf(c), weights: weightsOf(c), teams: cup ? cupTeams(c, cup.teamType, has) : teamsOf(c, has, COOP_TEAMS),
    roles: Object.fromEntries(Object.entries(roles).map(([k, v]) => [k, asString(v, `${p}.footballPlayersName.${k}`)])),
    ...catchUpOf(level.globalBuffs), ...(cup ? { cup: { ...cup, ...cupEventField(level.event) } } : {}),
  } };
}

/** The enemy keys a 阵地足球 level's teams field (足球-6), their elite players too, to extract with it. @param {{ football?: any }} f */
export const footballPlayers = (f) => (f.football
  ? /** @type {{ players: Record<string, string>, elite?: Record<string, string> }[]} */ (f.football.teams).flatMap((t) => [...Object.values(t.players), ...Object.values(t.elite ?? {})])
  : []);
