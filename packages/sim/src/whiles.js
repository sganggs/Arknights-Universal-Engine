// A trait's modifiers while a condition on the operator holds (docs/spec/traits.md 职业-18, 职业-24): its modules' and
// talents' additions that last while it blocks or does not, while its HP is above or below a share, while enemies or
// allies in its range are so, while no ally or enemy stands around it, while it holds stored energy, while its skill
// runs or not — a buff each, given and taken back at its turn.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune } from './buffs.js';
import { bursting, ELEMENTS, epOf } from './elements.js';
import { tileOf } from './body.js';
import { rangeKeys, inKeys, hostile, stealthed } from './targeting.js';
import { traitOf } from './traits.js';
import { gritTurn, spPulseTurn } from './talentfx.js';
import { quiet, idleShieldTurn, hurtOnce, afterSkill } from './talenttime.js';
import { lifeTurn } from './talentlife.js';
import { foeTurn } from './talentfoe.js';
import { pulseTurn } from './talentelem.js';
import { tileAt } from './level.js';
import { rotateOffset } from './dir.js';
import { shareTurn } from './talentaround.js';
import { comboTurn, firstBlockTurn } from './talentfight.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').WhileMods} WhileMods */

/** The units on an operator's own attack range now (职业-18): its range, not a skill's, turned with it and extended. @param {World} w @param {Content} c @param {Unit} op */
function inOwnRange(w, c, op) {
  const grid = { rows: c.level.height, cols: c.level.width }, keys = rangeKeys(grid, op, op.range ?? c.operators[op.key].range, statsOf(op).rangeExtend);
  return w.units.filter((u) => u.hp > 0 && !u.hidden && inKeys(u, keys, grid));
}

/** Whether a unit is an operator, not a summon (职业-18). @param {Unit} u */
const isOperator = (u) => u.kind === KIND.OPERATOR && u.summoner === undefined;

/** Whether another operator stands on one of the tiles around a unit: the 4 next to it, or the 8 (职业-18). @param {World} w @param {Unit} op @param {number} n */
function crowded(w, op, n) {
  const [r, col] = tileOf(op);
  return w.units.some((u) => {
    if (u === op || u.hp <= 0 || !isOperator(u)) return false;
    const [ur, uc] = tileOf(u), dr = Math.abs(ur - r), dc = Math.abs(uc - col);
    return n === 4 ? dr + dc === 1 : Math.max(dr, dc) === 1;
  });
}

/** How many enemies stand on an operator's tile or the 8 around it (职业-31). @param {World} w @param {Unit} op */
function enemiesNear(w, op) {
  const [r, col] = tileOf(op);
  return w.units.filter((u) => {
    if (u.hp <= 0 || u.hidden || !hostile(u)) return false;
    const [ur, uc] = tileOf(u);
    return Math.max(Math.abs(ur - r), Math.abs(uc - col)) <= 1;
  }).length;
}

/** How many friendly units (summons too, devices not) stand on the 8 tiles around an operator (职业-32). @param {World} w @param {Unit} op */
function alliesNear(w, op) {
  const [r, col] = tileOf(op);
  return w.units.filter((u) => {
    if (u === op || u.hp <= 0 || u.hidden || u.kind !== KIND.OPERATOR) return false;
    const [ur, uc] = tileOf(u);
    return Math.max(Math.abs(ur - r), Math.abs(uc - col)) <= 1;
  }).length;
}

/**
 * The other operators (not summons) on a tile of an operator's own range or of one of its summons' (职业-32: 「自身或
 * <召唤物>攻击范围内」). @param {World} w @param {Content} c @param {Unit} op
 */
function rangeAllies(w, c, op) {
  const grid = { rows: c.level.height, cols: c.level.width };
  const keys = [op, ...w.units.filter((u) => u.summoner === op.id && u.hp > 0)].map((u) => rangeKeys(grid, u, u.range ?? c.operators[u.key].range, statsOf(u).rangeExtend));
  return w.units.filter((u) => u !== op && isOperator(u) && u.hp > 0 && !u.hidden && keys.some((k) => inKeys(u, k, grid)));
}
/** Whether a unit's record is of a faction. @param {Content} c @param {Unit} u @param {string | undefined} power */
const ofPower = (c, u, power) => !!power && (c.operators[u.key].powers ?? []).includes(power);

/** How many of the 4 tiles next to an operator are 高地 (职业-32: 暴行). @param {Content} c @param {Unit} op */
function highAround(c, op) {
  const [r, col] = tileOf(op);
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, dc]) => tileAt(c.level, r + dr, col + dc)?.height === 'HIGHLAND').length;
}

/** Whether each level has a water tile, once worked out (职业-32: 锡兰). @type {WeakMap<object, boolean>} */
const WATER = new WeakMap();
/** Whether a level has a tile of water (its key names water). @param {Content['level']} level */
function hasWater(level) {
  let v = WATER.get(level);
  if (v === undefined) WATER.set(level, (v = level.tiles.some((row) => row.some((t) => /water/u.test(t?.key ?? '')))));
  return v;
}

/** How many operators (not summons) of a faction are on the field (职业-32). @param {World} w @param {Content} c @param {string | undefined} power */
const powerOnField = (w, c, power) => w.units.filter((u) => isOperator(u) && u.hp > 0 && !u.hidden && ofPower(c, u, power)).length;

/** Whether a unit has an element value below its maximum. @param {Unit} u */
const epDamaged = (u) => ELEMENTS.some((el) => epOf(u, el) < statsOf(u).maxEp);

/** The units on an operator's tile or the 4 next to it (职业-24). @param {World} w @param {Unit} op @param {(u: Unit) => boolean} which */
function onCross(w, op, which) {
  const [r, col] = tileOf(op);
  return w.units.filter((u) => {
    if (u.hp <= 0 || u.hidden || !which(u)) return false;
    const [ur, uc] = tileOf(u);
    return Math.abs(ur - r) + Math.abs(uc - col) <= 1;
  });
}

/** How many times an operator's skill started since its deployment, as its talents count them (职业-25). @param {Unit} op */
const starts = (op) => op.buffs.find((b) => b.key === 'starts')?.value ?? 0;

/** How many enemies with HP an operator blocks. @param {World} w @param {Unit} op */
const blockedBy = (w, op) => w.units.filter((e) => e.blockedBy === op.id && e.hp > 0).length;
/** Whether a unit is in a burst of an element, or of any without one (元素-3). @param {Unit} u @param {string | undefined} el */
const burstOf = (u, el) => (el ? u.buffs.some((b) => b.key === `burst:${el}`) : bursting(u));

/** The tiles behind an operator and at its sides, as offsets facing right (职业-26). */
const BEHIND_SIDES = Object.freeze(/** @type {[number, number][]} */ ([[0, -1], [-1, 0], [1, 0]]));

/** How many 高台 tiles are behind an operator and at its sides, turned with it (职业-26). @param {Content} c @param {Unit} op */
function highSides(c, op) {
  const [r, col] = tileOf(op);
  return BEHIND_SIDES.filter(([dr, dc]) => { const [x, y] = rotateOffset(dr, dc, op.dir); return tileAt(c.level, r + x, col + y)?.height === 'HIGHLAND'; }).length;
}

/**
 * The conditions on the operator (职业-18, 职业-24, 职业-26), each asked at its turn.
 * @type {Readonly<Record<WhileMods['when'], (w: World, c: Content, op: Unit, value: number, x: WhileMods) => boolean>>}
 */
const WHEN = Object.freeze({
  blocking: (w, _c, op) => blockedBy(w, op) > 0,
  notBlocking: (w, _c, op) => blockedBy(w, op) === 0,
  blockingAtLeast: (w, _c, op, v) => blockedBy(w, op) >= v,
  hpAbove: (_w, _c, op, v) => op.hp > v * statsOf(op).maxHp,
  hpBelow: (_w, _c, op, v) => op.hp < v * statsOf(op).maxHp,
  enemies: (w, c, op, v) => inOwnRange(w, c, op).filter(hostile).length >= v,
  groundEnemies: (w, c, op, v) => inOwnRange(w, c, op).filter((u) => hostile(u) && !statsOf(u).flying).length >= v,
  eliteEnemies: (w, c, op) => inOwnRange(w, c, op).some((u) => hostile(u) && (u.base.levelType === 'ELITE' || u.base.levelType === 'BOSS')),
  burstEnemies: (w, c, op, _v, x) => inOwnRange(w, c, op).some((u) => hostile(u) && burstOf(u, x.el)),
  lowHpEnemies: (w, c, op, v) => inOwnRange(w, c, op).some((u) => hostile(u) && u.hp < v * statsOf(u).maxHp),
  allies: (w, c, op, v) => inOwnRange(w, c, op).filter((u) => u !== op && isOperator(u)).length >= v,
  injuredAllies: (w, c, op) => inOwnRange(w, c, op).some((u) => u.kind === KIND.OPERATOR && u.hp < statsOf(u).maxHp),
  epAllies: (w, c, op) => inOwnRange(w, c, op).some((u) => u.kind === KIND.OPERATOR && epDamaged(u)),
  skillAllies: (w, c, op) => inOwnRange(w, c, op).some((u) => u !== op && isOperator(u) && !!u.skill && u.skill.active),
  alone4: (w, _c, op) => !crowded(w, op, 4),
  alone8: (w, _c, op) => !crowded(w, op, 8),
  noEnemies4: (w, _c, op) => onCross(w, op, (u) => u.kind === KIND.ENEMY).length === 0,
  soleEnemy4: (w, _c, op) => onCross(w, op, (u) => u.kind === KIND.ENEMY).length === 1,
  aloneUnits4: (w, _c, op) => onCross(w, op, (u) => u !== op && u.kind === KIND.OPERATOR).length === 0,
  energy: (_w, _c, op) => (op.buffs.find((b) => b.key === 'energy')?.value ?? 0) > 0,
  always: () => true,
  inSkill: (_w, _c, op) => !!op.skill && op.skill.active,
  notInSkill: (_w, _c, op) => !(op.skill && op.skill.active),
  noKills: (_w, _c, op) => !op.buffs.some((b) => b.key === 'kills' && b.value > 0),
  fewStarts: (_w, _c, op, v) => starts(op) < v,
  laterSkill: (_w, _c, op) => !!op.skill && op.skill.active && starts(op) >= 2,
  alchemy: (w, _c, op) => (w.alchemy ?? []).some((a) => a.src === op.id),
  idle: (w, _c, op, _v, x) => quiet(w, op, x),
  unhurt: (w, _c, op, _v, x) => quiet(w, op, x),
  calm: (w, _c, op, _v, x) => quiet(w, op, x),
  highSide: (_w, c, op, v) => highSides(c, op) >= v,
  fieldOps: (w, _c, _op, v) => w.units.filter((u) => isOperator(u) && u.hp > 0 && !u.hidden).length >= v,
  firstDeploy: (w, _c, op) => !Object.hasOwn(w.players[op.owner]?.cards ?? {}, op.key),
  hpNotBelow: (_w, _c, op, v) => op.hp >= v * statsOf(op).maxHp,
  neverHurt: (_w, _c, op) => !hurtOnce(op),
  stealthEnemies: (w, c, op) => inOwnRange(w, c, op).some((u) => hostile(u) && stealthed(u)),
  skillOrAfter: (w, _c, op, v) => (!!op.skill && op.skill.active) || afterSkill(w, op, v),
  lowSp: (_w, _c, op, v) => !!op.skill && !op.skill.active && op.skill.sp <= v * op.skill.cap,
  enemiesNear: (w, _c, op, v) => enemiesNear(w, op) >= v,
  fewEnemiesNear: (w, _c, op, v) => enemiesNear(w, op) < v,
  rangeAlly: (w, c, op, _v, x) => rangeAllies(w, c, op).some((u) => ofPower(c, u, x.power)),
  rangeAllyOnly: (w, c, op, _v, x) => { const list = rangeAllies(w, c, op); return list.length > 0 && !list.some((u) => ofPower(c, u, x.power)); },
  alliesNear: (w, _c, op, v) => alliesNear(w, op) >= Math.max(1, v),
  blockedExtra: (w, _c, op, v) => blockedBy(w, op) - 1 >= Math.max(1, v),
  powerOnField: (w, c, _op, v, x) => powerOnField(w, c, x.power) >= Math.max(1, v),
  highAround: (_w, c, op, v) => highAround(c, op) >= v,
  waterMap: (_w, c) => hasWater(c.level),
  noWaterMap: (_w, c) => !hasWater(c.level),
  onFieldFor: (w, _c, op, v) => w.frame - op.born >= secondsToFrames(v),
  liftoff: (_w, _c, op) => !!statsOf(op).flags.liftoff,
  grounded: (_w, _c, op) => !statsOf(op).flags.liftoff,
});

/** Whether a condition on an operator holds now, its value 0 (职业-32: an in-range talent's `srcWhen`). @param {World} w @param {Content} c @param {Unit} op @param {WhileMods['when']} when */
export const holdsWhen = (w, c, op, when) => WHEN[when](w, c, op, 0, { when, mods: {} });

/**
 * What a part with `per` counts (职业-25, 职业-32): the enemies in its own range, the friendly units on the 8 tiles
 * around it (`alliesNear`), the enemies it blocks beyond the first (`blockedExtra`), the operators of a faction on the
 * field (`powerOnField`). @type {Record<string, (w: World, c: Content, op: Unit, x: WhileMods) => number>}
 */
const PER = Object.freeze({
  enemies: (w, c, op) => inOwnRange(w, c, op).filter(hostile).length,
  alliesNear: (w, _c, op) => alliesNear(w, op),
  blockedExtra: (w, _c, op) => Math.max(0, blockedBy(w, op) - 1),
  powerOnField: (w, c, _op, x) => powerOnField(w, c, x.power),
});

/**
 * A part by a count (职业-25, 职业-32: PER, the enemies in its own range unless its condition names another): its buff
 * with the modifiers × the count, at most `per`; none while it is 0.
 * @param {World} w @param {Content} c @param {Unit} op @param {WhileMods} x @param {string} key
 */
function perWhile(w, c, op, x, key) {
  const n = Math.min(x.per ?? 0, (Object.hasOwn(PER, x.when) ? PER[x.when] : PER.enemies)(w, c, op, x)), b = op.buffs.find((y) => y.key === key);
  const mods = Object.fromEntries(Object.entries(x.mods).map(([k, v]) => [k, v * n]));
  if (n === 0) { if (b) removeBuff(op, key); return; }
  if (!b) addBuff(op, makeBuff({ key, src: op.id, value: n, mods }));
  else if (b.value !== n) retune(op, b, n, mods);
}

/**
 * At the start of an operator's turn (职业-18, 职业-25…职业-28): its 坚忍 (gritTurn), its talents on its life (lifeTurn),
 * its 屏障 after a while without attacking (idleShieldTurn), its talents on the enemies (foeTurn) and their pulses
 * (pulseTurn, 职业-29), its SP pulses (spPulseTurn, 职业-30), its share after a while (shareTurn, 职业-32), then each of its
 * trait's `whiles` is a buff `while:<n>` with
 * its modifiers while its condition holds; when it no longer does, the buff goes.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function traitWhiles(w, c, op) {
  gritTurn(c, op);
  lifeTurn(w, c, op);
  idleShieldTurn(w, c, op);
  foeTurn(w, c, op);
  pulseTurn(w, c, op);
  spPulseTurn(w, c, op);
  shareTurn(w, c, op);
  comboTurn(op);
  firstBlockTurn(w, c, op);
  const list = traitOf(c, op).whiles;
  for (let i = 0; i < list.length; i++) {
    const x = list[i], key = `while:${i}`;
    if (x.per) { perWhile(w, c, op, x, key); continue; }
    const on = WHEN[x.when](w, c, op, x.value ?? 0, x), has = op.buffs.some((b) => b.key === key);
    if (on && !has) addBuff(op, makeBuff({ key, src: op.id, mods: { ...x.mods }, ...(x.flags ? { flags: { ...x.flags } } : {}) }));
    else if (!on && has) removeBuff(op, key);
  }
}
