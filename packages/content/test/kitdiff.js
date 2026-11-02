// The per-kit differential (docs/spec/compat.md 兼容-6, ADR 0058): one kit, one skill, in the pinned Stronghold's own
// battle harness and in our engine through the compat layer — the same training (its 自选 elite form: E2 60, 潜能 6,
// trust 0, skill rank 7, its last module at stage 3), alone against a still dummy (1e7 HP, 0 DEF and RES) in front of
// it for 40 s, on the same field (our level is Stronghold's battle field of the run, tile for tile). A MANUAL skill
// starts as Stronghold's automatic operations start it (autoCast): on our side it is an AUTO one for the run that starts
// at the same point of the frame — as the operator is about to attack, or as soon as it is ready —, never sooner than
// 3 s after it last started (the harness's `startOpCooldown` 0: at once at the battle start); a skill Stronghold never
// starts here does not start on ours either. The kit's random numbers on our side are Stronghold's stream of the same seed (its rng.js): nothing else
// draws from it in this setting, so a kit's draws fall as in Stronghold (in a match the kit draws from the battle's own
// stream, 随机-1). Compared: the buffs one second after
// deployment (those that change something, the skill's aside), the HP each of its hits took (元素损伤 aside) and each of
// its heals gave (as sets — each value on either side has one on the other within 0.5 %, at least 1: Stronghold's
// attributes are rounded), the skill starts (±1), the statuses it applied (key and seconds), and our side's recorded
// kit errors.
// The kits load from a copy of the commit's content files (.cache/kitroot/), so the compat hook never touches
// Stronghold's own harness, which runs from the commit itself.
import { register } from 'node:module';
import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir, STRONGHOLD, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, bus, buffs as buffKit } from '@aue/sim';
import { KIT_FILES } from '../src/index.js';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf, tokenDefOf } from '../src/compat/records.js';
import { kitsBehaviors, withKitTrait } from '../src/compat/kits.js';
import { STATUS_NAME } from '../src/compat/mods.js';
import { SHIELD_KEEP } from '../src/compat/shields.js';
import { loadTraining, operatorAt } from '../src/operators.js';
import { TOKENS, loadToken, tokenAt } from '../src/tokens.js';

const SECONDS = 40;
/** The seed of Stronghold's battle, and of its random stream the kit draws from on our side. */
const SH_SEED = 1;
/** Stronghold's trigger rules its skills check every tick (its skills.js TICK_RULES). */
const TICK_RULES = new Set(['SP_FULL', 'SEARCH', 'CUSTOM_RANGE', 'SKILL_RANGE', 'ACTIVE_RANGE', 'GDGLOW_SKILL_2']);
/** Stronghold's AUTO_OP_COOLDOWN in frames: no automatic cast sooner after the last. */
const OP_COOLDOWN = 90;
/** When Stronghold's automatic operations start a MANUAL skill (autoCast); null for no MANUAL skill. @typedef {'never' | 'ready' | 'attack' | 'range' | null} Auto */
/**
 * AUE_KITDIFF_TRACE=<char id>:<skill index> prints every damaged event of that run on both sides (a debugging aid).
 * @type {{ on: boolean }}
 */
const TRACE = { on: false };

/** @param {number} x */
const r1 = (x) => Math.round(x * 10) / 10;
/** @param {[string, unknown]} a @param {[string, unknown]} b */
const byKey = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/** Our engine's own buffs of a branch trait (职业-6, 职业-12): the trait's, its idle modifiers', its attack bonus'. */
const OUR_TRAIT = new Set(['trait', 'idle', 'charge']);

/**
 * The branch trait's buffs — our engine's own (OUR_TRAIT), Stronghold's `trait:…` — as one `trait`: their modifiers
 * summed (Stronghold keeps a trait's flags in the unit's profile instead); Stronghold's 阻挡数 −99, its way of writing
 * the 解放者's 「阻挡数×0」, as the engine's ×0. @param {any[]} list
 */
function traitOf(list) {
  /** @type {Record<string, number>} */
  const mods = {};
  for (const b of list) if (OUR_TRAIT.has(b.key) || String(b.key).startsWith('trait:')) for (const [k, v] of Object.entries(b.mods ?? {})) mods[k] = (mods[k] ?? 0) + Number(v);
  if (mods.blockCnt <= -99) { delete mods.blockCnt; mods.blockCntMul = 0; }
  return { key: 'trait', mods };
}

/** Whether a buff's flags change something: the compat layer's SHIELD_KEEP only keeps a spent kit shield (兼容-4). @param {any} b */
const flagsChange = (b) => Object.entries(b.flags ?? {}).some(([k, on]) => on && k !== SHIELD_KEEP);

/**
 * Buffs as key → sorted mods, without the ones that change nothing, the skill's and this harness's own (`kitdiff:`); the
 * branch trait's as one (traitOf); unit ids in keys read as roles (roleKey).
 * @param {any[]} list @param {Map<number, string>} roles
 */
const buffMap = (list, roles) => Object.fromEntries([traitOf(list), ...list.filter((b) => !OUR_TRAIT.has(b.key) && !String(b.key).startsWith('trait:')).map((b) => ({ ...b, key: roleKey(roles, String(b.key)) }))]
  .filter((b) => !String(b.key).startsWith('skill') && !String(b.key).startsWith('kitdiff:') && (Object.keys(b.mods ?? {}).length > 0 || flagsChange(b)))
  .map((b) => /** @type {[string, unknown]} */ ([b.key, Object.fromEntries(Object.entries(b.mods ?? {}).sort(byKey).map(([k, v]) => [k, Math.round(Number(v) * 1e6) / 1e6]))]))
  .sort(byKey));

/**
 * A buff key with the unit ids in it as roles — the operator, a summon, the dummy: the two sides number units
 * differently (Stronghold's piece is its unit; ours keeps an id of its own beside its unit's).
 * @param {Map<number, string>} roles @param {string} key
 */
const roleKey = (roles, key) => key.replace(/([:#])(\d+)(?=$|[:#])/g, (m, sep, n) => (roles.has(Number(n)) ? `${sep}${roles.get(Number(n))}` : m));

/** Stronghold's units as roles. @param {any} h the harness battle @param {any} u its operator @returns {Map<number, string>} */
const shRoles = (h, u) => new Map(/** @type {[number, string][]} */ ([...h.allies().map((/** @type {any} */ x) => [x.id, x === u ? 'op' : 'token']), ...h.enemies().map((/** @type {any} */ e) => [e.id, 'dummy'])]));

/** Our units as roles: the piece's id and its unit's are the operator. @param {any[]} units @param {any} u @param {any} piece @returns {Map<number, string>} */
const ourRoles = (units, u, piece) => new Map(/** @type {[number, string][]} */ ([[piece.id, 'op'], ...units.map((x) => [x.id, x === u ? 'op' : x.kind === 0 ? 'token' : 'dummy'])]));

/** @type {{ harness: any, kitRoot: string, createRng: (seed: number) => any } | null} */
let ready = null;

/** The kits' copy of the commit's content files, Stronghold's harness and its random numbers, made once. */
async function setUp() {
  if (ready) return ready;
  const oracle = oracleDir(), kitDir = join(oracle, '..', '..', 'kitroot', STRONGHOLD.sha.slice(0, 12));
  if (!existsSync(join(kitDir, 'server', 'sim', 'content'))) cpSync(join(oracle, 'server', 'sim', 'content'), join(kitDir, 'server', 'sim', 'content'), { recursive: true });
  const kitRoot = pathToFileURL(`${kitDir}/`).href, compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: kitRoot, compat } });
  const harness = await import(pathToFileURL(join(oracle, 'test', 'helpers', 'battleHarness.js')).href);
  const { createRng } = await import(pathToFileURL(join(oracle, 'server', 'sim', 'rng.js')).href);
  ready = { harness, kitRoot, createRng };
  return ready;
}

/**
 * When Stronghold's automatic operations start a unit's MANUAL skill (its skills.js tick and onAboutToAttack): never
 * under TAKE_DAMAGE or NEVER (nothing hurts the unit here); as soon as it is ready under a rule it checks every tick and
 * for a unit that does not attack (or only in its skill); with trigger ranges of content (`range`), as soon as it is
 * ready while one holds an enemy, else as the unit is about to attack; else as the unit is about to attack. Null without a MANUAL skill. (A skill whose own condition the dummy never meets — 黑键 S3 starts only against
 * an elite or a leader — Stronghold never starts: kitDiff takes its run's count of starts for that.)
 * @param {any} u @returns {Auto}
 */
function autoCast(u) {
  const sk = u.skill;
  if (!sk || sk.noSkill || !sk.manual) return null;
  if (sk.rule === 'TAKE_DAMAGE' || sk.rule === 'NEVER') return 'never';
  if (everyTick(u)) return 'ready';
  return sk.triggerRanges?.length && !sk.healSkill ? 'range' : 'attack';
}

/** Whether Stronghold checks a unit's skill every tick: a tick rule, or a unit that does not attack (or only in its skill). @param {any} u */
const everyTick = (u) => TICK_RULES.has(u.skill.rule) || !!u.profile?.noAttack || !!u.profile?.noAttackUnlessSkill;

/** Stronghold's run as AUE_KITDIFF_TRACE prints it: each damaged event, the operator's skill starts. @param {any} h @param {any} u */
function traceStronghold(h, u) {
  const name = (/** @type {any} */ x) => x?.defId ?? '-';
  for (const x of h.hooksOf('damaged')) console.log(`stronghold ${Math.round(x.t * 30)} ${name(x.source)} → ${name(x.target)} ${r1(x.amount)} ${x.type} ${(x.dmg?.tags ?? []).join(',')}`);
  for (const x of h.hooksOf('skillStart').filter((/** @type {any} */ x) => x.unit === u)) console.log(`stronghold skillStart ${Math.round(x.t * 30)}`);
}

/** Stronghold's run. @param {any} H the harness @param {string} charId @param {number} skillIndex @param {string | null} uniEquipId */
function strongholdRun(H, charId, skillIndex, uniEquipId) {
  const h = H.makeBattle({
    seed: SH_SEED,
    defs: { enemies: { enemy_dummy: H.enemyRec({ key: 'enemy_dummy', hp: 1e7, speed: 0 }) } },
    units: [{ diy: { slot: 6, charId, skillIndex, ...(uniEquipId ? { uniEquipId } : {}) }, elite: true, row: 10, col: 4 }],
    enemies: [{ key: 'enemy_dummy', pos: [10, 5] }], hooks: ['damaged', 'heal', 'skillStart', 'beforeStatus'], captureNoisy: true, flags: { startOpCooldown: 0 },
  });
  h.step(1);
  const u = h.allies()[0], field = fieldOf(h, u);
  h.run(1);
  const buffs = buffMap(u.buffs, shRoles(h, u));
  h.run(SECONDS - 1);
  const mine = (/** @type {any} */ x) => x.source === u || x.source?.id === u.id;
  const damaged = h.hooksOf('damaged');
  if (TRACE.on) traceStronghold(h, u);
  return {
    atk: u.base.atk, buffs, auto: autoCast(u), field,
    hits: damaged.filter((/** @type {any} */ x) => mine(x) && x.type !== 'element').map((/** @type {any} */ x) => r1(x.amount)),
    heals: h.hooksOf('heal').filter(mine).map((/** @type {any} */ x) => r1(x.amount)),
    starts: h.hooksOf('skillStart').filter((/** @type {any} */ x) => x.unit === u || x.unit?.id === u.id).length,
    statuses: [...new Set(h.hooksOf('beforeStatus').filter(mine).map((/** @type {any} */ x) => `${x.status}:${r1(x.duration)}`))].sort(),
  };
}

/**
 * Stronghold's battle field of a run (its grid's `rect`): each tile's key, height, what may be deployed and what passes,
 * row by row from the bottom; where the operator and the dummy stand in it; its first start and goal tiles.
 * @typedef {{ rows: number, cols: number, tiles: { key: string, height: string, build: string, pass: string, special: string | null }[][], op: number[], dummy: number[], start: number[], end: number[] }} Field
 */

/** At the battle's start (before anything moves). @param {any} h the harness battle @param {any} u its operator @returns {Field} */
function fieldOf(h, u) {
  const g = h.b.grid, R = g.rect, e = h.enemies()[0];
  const tiles = Array.from({ length: R.r1 - R.r0 + 1 }, (_, r) => Array.from({ length: R.c1 - R.c0 + 1 }, (_, c) => g.tile(R.r0 + r, R.c0 + c)));
  const find = (/** @type {string} */ sp) => { for (let r = 0; r < tiles.length; r++) for (let c = 0; c < tiles[r].length; c++) if (tiles[r][c].special === sp) return [r, c]; return [0, 0]; };
  return { rows: tiles.length, cols: tiles[0].length, tiles, op: [u.tileR - R.r0, u.tileC - R.c0], dummy: [e.tileR - R.r0, e.tileC - R.c0], start: find('start'), end: find('end') };
}

/** Stronghold's ways through a tile as the level's (地形-1). @type {Record<string, string>} */
const PASS = { ALL: 'ALL', NONE: 'NONE', FLY: 'FLY_ONLY' };

/**
 * Our level: Stronghold's battle field, tile for tile; the dummy appears at once on its tile, off the route from the
 * start tile to the goal (a route it would walk, as Stronghold's spawn has one). @param {Field} f
 */
function level(f) {
  const tiles = f.tiles.map((row) => row.map((t) => ({ key: t.key, height: t.height === 'HIGH' ? 'HIGHLAND' : 'LOWLAND', buildable: t.build, passable: PASS[t.pass] ?? 'ALL', side: 'ALL' })));
  const route = { start: { row: f.start[0], col: f.start[1] }, end: { row: f.end[0], col: f.end[1] }, motion: 'WALK', checkpoints: [], spawnOffset: { x: f.dummy[1] - f.start[1], y: f.dummy[0] - f.start[0] } };
  return { id: 'kitdiff', width: f.cols, height: f.rows, options: { maxLifePoint: 3, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 8, moveMultiplier: 1 },
    tiles, routes: [route], waves: [oneWave([spawnAt(0, 'dummy')])] };
}

/** The engine's record without its talents: the kit applies them. @param {Record<string, any>} d */
const bare = ({ talentBb, talentMods, talentTrait, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest }) => rest;

/**
 * What our run records of the operator: the HP its hits take, its heals, its skill starts, the statuses it applies.
 * @param {any} w @param {() => any} op @param {{ hits: number[], heals: number[], starts: number, statuses: Set<string> }} log
 */
function record(w, op, log) {
  bus.on(w, 'damaged', (k) => {
    if (TRACE.on) console.log(`ours ${w.frame} ${k.source?.key ?? '-'} → ${k.target?.key ?? '-'} ${r1(k.amount)} ${k.type} ${(k.dmg?.tags ?? []).join(',')}`);
    if (k.source === op()) log.hits.push(r1(k.amount));
  }, { priority: -1e9 });
  bus.on(w, 'heal', (k) => { if (k.source === op()) log.heals.push(r1(k.amount)); }, { priority: -1e9 });
  bus.on(w, 'skillStart', (k) => {
    if (k.unit !== op()) return;
    log.starts++;
    if (TRACE.on) console.log(`ours skillStart ${w.frame}`);
  });
  bus.on(w, 'beforeStatus', (k) => { if (k.source === op()) log.statuses.add(`${STATUS_NAME[k.status] ?? k.status}:${k.frames < 0 ? Infinity : r1(k.frames / 30)}`); }, { priority: -1e9 });
}

/**
 * A MANUAL skill as Stronghold's automatic operations start it (autoCast): for the run an AUTO one of the engine that
 * starts when they would — `attack` as the operator is about to attack, `ready` as soon as it is ready, both at that
 * point of the frame; `range` the one while the kit's trigger ranges hold an enemy (the piece's triggerSatisfied), else
 * the other —; another start waits 3 s (AUTO_OP_COOLDOWN), held by a 静默 when a charge is ready at once. A skill
 * Stronghold never starts here stays MANUAL (an AUTO one becomes so — 黍 S1 waits for an ally below half HP), with no
 * command.
 * @param {any} c @param {Auto} auto @param {{ b: any }} box the compat battle, once the world is made
 */
function asStronghold(c, auto, box) {
  const sk = c.operators.op.skill;
  if (sk && auto === 'never' && sk.type === 'AUTO') c.operators.op = { ...c.operators.op, skill: { ...sk, type: 'MANUAL' } };
  if (!sk || sk.type !== 'MANUAL' || auto === null || auto === 'never') return;
  const trigger = auto === 'range' ? (/** @type {any} */ ctx) => (box.b?.unitOf(ctx.self)?.skill?.triggerSatisfied() ? 'ready' : 'attack') : auto;
  c.operators.op = { ...c.operators.op, skill: { ...sk, type: 'AUTO' } };
  c.behaviors.skills = { ...c.behaviors.skills, [sk.id]: { ...c.behaviors.skills?.[sk.id], trigger } };
}

/**
 * Stronghold's wait between two automatic starts of a MANUAL skill (AUTO_OP_COOLDOWN; an AUTO one has none): a 静默 for
 * it while a charge is ready at once. @param {any} w @param {() => any} op @param {Auto} auto
 */
function opCooldown(w, op, auto) {
  if (auto === null || auto === 'never') return;
  bus.on(w, 'skillStart', (k) => {
    const u = op();
    if (k.unit === u && u.skill.cost > 0 && u.skill.sp >= u.skill.cost) buffKit.addBuff(u, buffKit.makeBuff({ key: 'kitdiff:opCooldown', left: OP_COOLDOWN, flags: { mute: true } }));
  });
}

/**
 * Our run. @param {string} charId @param {Function} factory @param {number} skill @param {number} module
 * @param {{ createRng: (seed: number) => any, auto: Auto, field: Field }} sh Stronghold's random numbers, the kit's here; when its automatic operations start the skill
 */
async function ourRun(charId, factory, skill, module, sh) {
  const t = await loadTraining(charId), b = { elite: 2, level: 60, potential: 6, trust: 0, skill, skillLevel: 7, ...(module >= 0 ? { module, moduleLevel: 3 } : {}) };
  const entry = { factory: /** @type {any} */ (factory), def: defOf(charId, t, b) }, lv = level(sh.field);
  const c = /** @type {any} */ ({ level: lv, enemies: { dummy: { name: 'dummy', maxHp: 1e7, atk: 0, def: 0, res: 0, moveSpeed: 1, massLevel: 1 } }, operators: { op: withKitTrait(/** @type {any} */ (bare(operatorAt(t, b))), entry, lv) }, decks: [['op']] });
  /** @type {Record<string, any>} */
  const tokens = {};
  for (const id of (t.tokens ?? []).filter((x) => Object.hasOwn(TOKENS, x))) {
    const token = await loadToken(id);
    c.operators[`${id}#0`] = { ...bare(tokenAt(token, id, t, b)), char: id, summoner: 'op' };
    tokens[id] = tokenDefOf(id, token, t, b);
  }
  const box = /** @type {{ b: any }} */ ({ b: null });
  c.behaviors = kitsBehaviors({ op: { ...entry, tokens } }, (x) => { box.b = x; });
  asStronghold(c, sh.auto, box);
  const w = createWorld(c, { seed: 7, players: 1 }), log = { hits: /** @type {number[]} */ ([]), heals: /** @type {number[]} */ ([]), starts: 0, statuses: /** @type {Set<string>} */ (new Set()) };
  box.b.rng = sh.createRng(SH_SEED);
  // held in place as Stronghold's speed-0 dummy: by a buff that is no status (束缚 is one a kit may look for)
  bus.on(w, 'enemySpawn', (k) => { buffKit.addBuff(k.enemy, buffKit.makeBuff({ key: 'kitdiff:still', flags: { root: true } })); }, { priority: 1e9 });
  const op = () => w.units.find((x) => x.key === 'op');
  record(w, op, log);
  opCooldown(w, op, sh.auto);
  step(w, c, [[0, { type: 'deploy', op: 'op', row: sh.field.op[0], col: sh.field.op[1], dir: 0 }]]);
  for (let i = 0; i < 30; i++) step(w, c);
  const u = op(), buffs = u ? buffMap(u.buffs, ourRoles(w.units, u, box.b.unitOf(u))) : null;
  for (let i = 30; i < SECONDS * 30; i++) step(w, c);
  return { atk: c.operators.op.atk, buffs, ...log, statuses: [...log.statuses].sort(), errors: [...new Set(box.b.errors.map((/** @type {any} */ e) => `${e.label}: ${e.message}`))] };
}

/** @param {number[]} xs @param {number} k */
const distinct = (xs, k) => [...new Set(xs.map((x) => r1(x * k)))].sort((a, b) => a - b);
/** Within 0.5 % (at least 1) of `y`. @param {number} x @param {number} y */
const close = (x, y) => Math.abs(x - y) <= Math.max(1, Math.abs(y) * 0.005);
/**
 * The two sides' values agree: each one of either side has one of the other's close to it (a damage that drifts as its
 * target's HP falls takes a few more or fewer values on one side).
 * @param {number[]} a @param {number[]} b
 */
const near = (a, b) => a.every((x) => b.some((y) => close(x, y))) && b.every((y) => a.some((x) => close(x, y)));

/**
 * The differences of one kit's skills between Stronghold and us; none for each skill that matches.
 * @param {string} charId @returns {Promise<{ skill: number, diffs: string[] }[]>}
 */
export async function kitDiff(charId) {
  const { harness, kitRoot, createRng } = await setUp();
  const factory = (await loadUnderGrid(() => import(kitRoot + KIT_FILES[charId]))).default[charId], t = await loadTraining(charId);
  const m = t.modules.length - 1, uni = m >= 0 ? t.modules[m].id : null, out = [];
  for (let skill = 0; skill < t.skills.length; skill++) {
    TRACE.on = process.env['AUE_KITDIFF_TRACE'] === `${charId}:${skill}`;
    const sh = strongholdRun(harness, charId, skill, uni), ours = await ourRun(charId, factory, skill, m, { createRng, auto: sh.starts === 0 ? 'never' : sh.auto, field: sh.field }), k = sh.atk / ours.atk, d = [];
    TRACE.on = false;
    if (JSON.stringify(sh.buffs) !== JSON.stringify(ours.buffs)) d.push(`buffs ${JSON.stringify(sh.buffs)} ≠ ${JSON.stringify(ours.buffs)}`);
    if (!near(distinct(ours.hits, k), distinct(sh.hits, 1))) d.push(`hits ${distinct(sh.hits, 1).slice(0, 8)} ≠ ${distinct(ours.hits, k).slice(0, 8)}`);
    if (!near(distinct(ours.heals, k), distinct(sh.heals, 1))) d.push(`heals ${distinct(sh.heals, 1).slice(0, 6)} ≠ ${distinct(ours.heals, k).slice(0, 6)}`);
    if (Math.abs(sh.starts - ours.starts) > 1) d.push(`starts ${sh.starts} ≠ ${ours.starts}`);
    if (JSON.stringify(sh.statuses) !== JSON.stringify(ours.statuses)) d.push(`statuses ${sh.statuses} ≠ ${ours.statuses}`);
    if (ours.errors.length) d.push(`errors ${ours.errors.join(' | ')}`);
    out.push({ skill, diffs: d });
  }
  return out;
}
