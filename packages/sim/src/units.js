// Creating units from content (spec 部署-1, 部署-4, 出怪-1, 属性-1): the base attributes come from the content, the buffs
// start empty but for an operator's always-on talents, the HP and the element values full.
import { secondsToFrames } from '@aue/math';
import { KIND, ANIM } from '@aue/schema';
import { tileAt } from './level.js';
import { dirOfCode, DEFAULT_DIR } from './dir.js';
import { computeStats } from './attrs.js';
import { makeSkillState, statMods } from './skills.js';
import { makeBuff } from './buffs.js';
import { LEADER_MAX_EP } from './elements.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Base} Base */
/** @typedef {import('./types.js').Content} Content @typedef {import('./types.js').EnemyDef} EnemyDef @typedef {import('./types.js').OperatorDef} OperatorDef */

/** @param {import('./level.js').Tile | null} tile */
const heightLevel = (tile) => (tile && tile.height === 'HIGHLAND' ? 1 : 0);

/** What a content record may leave out, with the value then (属性-3, 敌人攻击-1). */
const OPTIONAL = Object.freeze({
  aspd: 100, blockCnt: 1, moveSpeed: 1, tauntLevel: 0, massLevel: 0, epDamageResistance: 0, epResistance: 0, motion: 'WALK',
  dmgType: 'phys', rangeRadius: 0, applyWay: 'MELEE',
});

/** A record's maximum element value: its own, else 2000 for a leader (领袖, levelType BOSS), else 1000 (元素-1). @param {Record<string, any>} r */
const maxEpOf = (r) => r.maxEp ?? (r.levelType === 'BOSS' ? LEADER_MAX_EP : 1000);

/**
 * The base attributes of a content record (属性-1); what the record leaves out takes the default.
 * @param {EnemyDef | OperatorDef} d @returns {Base}
 */
export function baseOf(d) {
  /** @type {Record<string, any>} */
  const r = d;
  /** @param {keyof typeof OPTIONAL} k @returns {any} */
  const opt = (k) => r[k] ?? OPTIONAL[k];
  return {
    maxHp: d.maxHp, atk: d.atk, def: d.def, res: d.res, aspd: opt('aspd'), bat: d.baseAttackTime ?? 1, blockCnt: opt('blockCnt'),
    moveSpeed: opt('moveSpeed'), tauntLevel: opt('tauntLevel'), massLevel: opt('massLevel'), epDamageResistance: opt('epDamageResistance'),
    epResistance: opt('epResistance'), motion: opt('motion'), immune: [...(d.immune ?? [])], dmgType: opt('dmgType'),
    rangeRadius: opt('rangeRadius'), applyWay: opt('applyWay'), maxEp: maxEpOf(r), shared: r.shared === true,
    levelType: r.levelType ?? 'NORMAL', neutral: r.neutral === true, deathLife: r.deathLife ?? 0, lifeCost: r.lifePointReduce ?? 1,
  };
}

/**
 * The fields every unit starts with: full HP, the buffs given (none by default), ready to attack, not blocked, created now.
 * @param {World} w @param {Base} base @param {import('./types.js').Buff[]} [buffs]
 */
function fresh(w, base, buffs = []) {
  const maxHp = computeStats({ base, buffs }).maxHp;
  return { base, buffs, hp: maxHp, maxHp, atkCd: 0, blockedBy: -1, blockedAt: -1, born: w.frame, bornN: ++w.bornThisFrame, path: [], pt: 0, wait: -1, hidden: false, skill: null, ep: {}, swing: null };
}

/**
 * The buffs an operator is deployed with (部署-4, 部署-7, 符文-3): its always-on talents' attribute keys and their effects'
 * modifiers as one buff without an end; its seat runes' modifiers as another (`rune`); each timed talent as a buff
 * `timed:<index>` — for a 'during' one its modifiers for its time, for the others a step a time (timedBehaviors).
 * @param {OperatorDef} d
 */
function talentBuffs(d) {
  const mods = { ...statMods(d.talentBb ?? {}), ...d.talentMods };
  const timed = (d.timedTalents ?? []).map((t, i) => (t.kind === 'during'
    ? makeBuff({ key: `timed:${i}`, left: secondsToFrames(t.seconds), mods: t.mods })
    : makeBuff({ key: `timed:${i}`, every: Math.max(1, secondsToFrames(t.seconds)), fixed: true })));
  const rune = d.runeMods && Object.keys(d.runeMods).length ? [makeBuff({ key: 'rune', mods: d.runeMods })] : [];
  return [...(Object.keys(mods).length ? [makeBuff({ key: 'talent', mods })] : []), ...rune, ...timed];
}

/**
 * Unit ids for content's own objects (钩子-4): `n` ids no unit will get; the first is returned.
 * @param {World} w @param {number} n @returns {number}
 */
export function reserveIds(w, n) {
  const first = w.nextId;
  w.nextId += Math.max(0, Math.floor(n));
  return first;
}

/**
 * A deployed operator; `dir` is the protocol's direction code (schema DIR), `paid` what its deployment cost (部署-3),
 * `summoner` the id of the unit that summoned it (召唤-4, 召唤-6), `expires` the frame it leaves at (召唤-9).
 * @param {World} w @param {Content} c @param {{ key: string, owner: number, row: number, col: number, dir: number, paid?: number, summoner?: number, expires?: number, id?: number }} o
 * @returns {Unit}
 */
export function makeOperator(w, c, o) {
  return {
    id: o.id ?? w.nextId++, kind: KIND.OPERATOR, key: o.key, owner: o.owner, x: o.col, y: o.row, z: heightLevel(tileAt(c.level, o.row, o.col)),
    dir: dirOfCode(o.dir), ...fresh(w, baseOf(c.operators[o.key]), talentBuffs(c.operators[o.key])), route: -1, leg: 0, frag: 0, wave: -1, ab: {}, anim: ANIM.IDLE, paid: o.paid ?? c.operators[o.key].cost,
    skill: c.operators[o.key].skill ? makeSkillState(/** @type {import('./types.js').SkillDef} */ (c.operators[o.key].skill)) : null,
    ...(o.summoner !== undefined ? { summoner: o.summoner } : {}), ...(o.expires !== undefined ? { expires: o.expires } : {}),
  };
}

/**
 * A device (装置-1): a predefined unit's record at its tile, facing its way, on no player's deck (owner −1).
 * @param {World} w @param {Content} c @param {import('./types.js').Predefine} p @returns {Unit}
 */
export function makeDevice(w, c, p) {
  const d = /** @type {Record<string, import('./types.js').DeviceDef>} */ (c.devices)[p.key], row = p.row ?? 0, col = p.col ?? 0;
  return {
    id: w.nextId++, kind: KIND.DEVICE, key: p.key, owner: -1, x: col, y: row, z: heightLevel(tileAt(c.level, row, col)), dir: /** @type {import('./dir.js').Dir} */ (p.dir ?? DEFAULT_DIR),
    ...fresh(w, { ...baseOf(/** @type {any} */ (d)), ...(d.side === 'ENEMY' ? { hostile: true } : {}) }), route: -1, leg: 0, frag: 0, wave: -1, ab: {}, anim: ANIM.IDLE, paid: 0, alias: p.alias,
  };
}

/**
 * An enemy at the start of its route (spec 出怪-1): the centre of the start tile, moved by the route's spawn offset —
 * or, brought in by another enemy (敌能-22), at the point and on the leg of `place`. `frag` is the frame its fragment began
 * (路线-1), `wave` the wave that waits for it (波次-3; −1 for none), `unharmful` whether it costs no life at the goal
 * (目标-1), `up` what its base max HP, ATK and move speed are multiplied by (足球-17).
 * @param {World} w @param {Content} c
 * @param {{ key: string, route: number, frag?: number, wave?: number, unharmful?: boolean, place?: { leg: number, x: number, y: number },
 *   up?: { maxHp: number, atk: number, moveSpeed: number } }} e @returns {Unit}
 */
export function makeEnemy(w, c, e) {
  const r = c.level.routes[e.route], start = r.start, off = r.spawnOffset ?? { x: 0, y: 0 };
  const p = e.place ?? { leg: 0, x: start.col + off.x, y: start.row + off.y }, tile = e.place ? tileAt(c.level, Math.round(p.y), Math.round(p.x)) : tileAt(c.level, start.row, start.col);
  const b = baseOf(c.enemies[e.key]), base = e.up ? { ...b, maxHp: b.maxHp * e.up.maxHp, atk: b.atk * e.up.atk, moveSpeed: b.moveSpeed * e.up.moveSpeed } : b;
  return {
    id: w.nextId++, kind: KIND.ENEMY, key: e.key, owner: -1, x: p.x, y: p.y,
    z: heightLevel(tile), dir: DEFAULT_DIR, ...fresh(w, base), route: e.route, leg: p.leg,
    frag: e.frag ?? w.frame, wave: e.wave ?? -1, ...(e.unharmful ? { unharmful: true } : {}), ab: {}, anim: ANIM.MOVE, paid: 0,
  };
}
