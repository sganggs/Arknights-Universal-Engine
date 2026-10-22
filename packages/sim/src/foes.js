// Enemy abilities (docs/spec/foes.md 敌能-1…敌能-4, 敌能-22, 敌能-30, 敌能-39, 敌能-45): the hooks through which the content's behaviours
// act on an enemy's talents and skills, the skills' cooldowns, delayed explosions, 直击 bolts, the enemies an enemy
// brings in, 吞噬, and one draw from the match.
import { secondsToFrames, FPS } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { addBuff, removeBuff, makeBuff, retune, setLeft, setBaseMaxHp } from './buffs.js';
import { setAmmo } from './skills.js';
import { inflict } from './status.js';
import { dealDamage, heal, setHp, knockDown } from './damage.js';
import { dealEp } from './elements.js';
import { selectable, sortAllies, friendly, evadesGround, stealthed } from './targeting.js';
import { tileOf } from './body.js';
import { tileAt } from './level.js';
import { board, alight, detour, wayKeys, becomeFlyer, becomeGround } from './routes.js';
import { draw } from './rng.js';
import { release } from './blocking.js';
import { spawnDevice } from './devices.js';
import { keyAt } from './paths.js';
import { bringIn, hatch } from './broods.js';
import { devour } from './deck.js';
import { blightContext, tickBlight } from './blight.js';
import { atPoint } from './tactical.js';
import { on } from './bus.js';
import { placeTasting, tickTastings } from './tasting.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').EnemyDef} EnemyDef @typedef {import('./types.js').Blast} Blast @typedef {import('./types.js').Bolt} Bolt */
/** @typedef {import('./types.js').DamageType} DamageType @typedef {import('./skills.js').AttackMods} AttackMods */

/** The cooldown, in frames, of a skill used once (its record's cooldown below 0, 敌能-2): longer than any battle. */
const ONCE = 2147483647;

/** A 直击 bolt's speed in tiles per second, and the radius it hits within (敌能-4). */
export const BOLT_SPEED = 10;
export const BOLT_RADIUS = 0.3;

/**
 * What an explosion or a bolt does to a unit it hits (敌能-3, 敌能-4): damage, and a status.
 * @typedef {{ type: DamageType, amount: number, status?: { key: string, seconds: number } }} Payload
 */

/**
 * An enemy ability's context (敌能-2): the common members (技能-6) and the enemy's own.
 * @typedef {object} FoeContext
 * @property {Unit} self
 * @property {Record<string, number>} bb the ability's blackboard
 * @property {number} sp a skill's SP cost (0 for a talent or a skill without)
 * @property {number} frame
 * @property {(u: Unit) => import('./attrs.js').Stats} stats
 * @property {(t: Unit, init: import('./buffs.js').BuffInit) => void} addBuff
 * @property {(t: Unit, key: string) => void} removeBuff
 * @property {(t: Unit, key: string, o?: object) => void} applyStatus
 * @property {(t: Unit, dmg: import('./damage.js').Damage) => number} dealDamage
 * @property {(t: Unit, el: string, amount: number) => number} dealEp
 * @property {(t: Unit, amount: number) => number} heal
 * @property {(n: number) => void} gainCost no effect for an enemy
 * @property {{ get: (k: string) => number, set: (k: string, v: number) => void }} state its own ability state
 * @property {boolean} blocked
 * @property {boolean} unbalanced it is in 失衡 as this turn starts (位移-3); read-only
 * @property {boolean} hurt it took damage since its last turn
 * @property {number} taken how many accepted hits it has taken, at the 受击回复 gate, since an ability of its first read this
 *   (敌能-38); an enemy no ability asks about keeps no count
 * @property {boolean} unblocked its block ended since its last turn
 * @property {boolean} fell it fell into a 地穴 (地图-4)
 * @property {boolean} ready a skill's cooldown is over
 * @property {() => void} use a skill was used: its cooldown starts again — one with a cooldown below 0 is not ready again
 * @property {(seconds: number) => number} frames seconds as whole frames (时间-2)
 * @property {(name: string) => Record<string, number> | null} talent another talent's blackboard
 * @property {(radius: number, sel?: import('./targeting.js').Selector) => Unit[]} foes the units it may attack within `radius` of it.
 *   `sel` is 索敌-2's selector; omitted, flying units stay out and 迷彩 still hides a unit
 * @property {(units: Unit[]) => Unit[]} order units it may attack in the order its attack picks them (索敌-5)
 * @property {(radius: number) => Unit[]} allies the enemies (not neutral units) on the field within `radius` of it, itself too
 * @property {(u: Unit, name: string) => Record<string, number> | null} talentOf another enemy's talent blackboard
 * @property {(u: Unit, key: string) => number | null} buffValue the value of a unit's buff of a key, or null
 * @property {(u: Unit, key: string, value: number, mods: Record<string, number>) => void} setBuff gives a unit a buff of a key
 *   without an end, or retunes the one it has (属性-4)
 * @property {(t: Unit, n: number) => void} drainCost an operator's player loses n cost, down to 0 (费用-1)
 * @property {() => Unit | null} blocker the unit blocking it, or null
 * @property {(u: Unit) => string[]} tagsOf an enemy's tags (关卡-1)
 * @property {() => string} tileKey the key of the tile it stands on ('' off the map)
 * @property {(u: Unit) => void} board takes an enemy aboard as a passenger (敌能-16)
 * @property {() => number} passengers how many passengers it carries
 * @property {() => void} alight its passengers alight (敌能-16)
 * @property {() => Unit[]} inLine the units in its row or column a 直击 may select, nearest first
 * @property {(b: { x: number, y: number, radius: number, delay: number, air: boolean, sourced: boolean, buff?: import('./buffs.js').BuffInit } & Payload) => void} blast
 * @property {(b: { dx: number, dy: number, blast?: number } & Payload) => void} bolt
 * @property {(t: Unit, hp: number) => void} setHp sets a unit's HP outright (伤害-9)
 * @property {(hp: number) => void} setBaseMaxHp sets this enemy's base maximum HP and the cached maximum, without
 *   rescaling its current HP (敌能-45). A later buff refresh would scale a still-positive HP if the cache were stale.
 * @property {() => void} resetSkills its skills' cooldowns back to their first ones (敌能-18)
 * @property {(u: Unit) => boolean} onWay whether a unit's tile is on its way to the end of the move it is on, its own tile
 *   included (寻路-2)
 * @property {(row: number, col: number) => void} detour makes the centre of a tile the next point of the move it is on (路线-6)
 * @property {() => void} release its block ends (阻挡-3)
 * @property {(key: string) => boolean} placeDevice places a device of the level's record `key` on its tile (装置-5): whether
 *   it stands there
 * @property {(key: string, o: import('./broods.js').BringIn) => Unit[]} summon brings in enemies of a key on its route
 *   (敌能-22): those that appeared now
 * @property {() => number} draw one uniform draw in [0, 1) from the match (随机-1)
 * @property {(u: Unit) => void} remove an enemy's HP to 0 outright: it is knocked down at the frame's end (敌能-24)
 * @property {(t: Unit) => boolean} devour 吞噬 (敌能-30): whether the unit was devoured
 * @property {(t: Unit, key: string, init: { mods?: Record<string, number>, flags?: Record<string, boolean>, value?: number, prio?: number, act?: string, restore?: number }) => void} lend
 *   gives a unit a buff of a key that lasts while it is given again each turn (敌能-25): it ends within two frames of the
 *   last. `prio` and `act` are kept from the first time it is given
 * @property {(t: Unit, area: 'cross' | 'square') => Unit[]} around the units it may attack on a unit's tile and the four
 *   tiles next to it (a cross) or the eight around it (a square), in creation order (敌能-29)
 * @property {() => Unit[]} enemies every enemy on the field that is not neutral, selectable or not (敌能-25)
 * @property {(u: Unit | null) => boolean} defaultAlly the unit is still on the field and is a 默认类 ally (敌能-54)
 * @property {() => void} fly its own motion becomes flying and the move it is on is planned again (路线-2, 敌能-34)
 * @property {() => void} attackAgain its next attack may start at once: the attack cooldown is cleared (敌能-44, 攻击-2)
 * @property {(o: { x: number, y: number, radius: number, life: number, low: number, high: number, air?: boolean, open?: boolean, wide?: boolean, arts?: number, pad?: number }) => void} zone
 *   places a zone (污染秽蚀 敌能-46; a 燃烧区域 when `arts` is set, 敌能-60)
 * @property {(t: Unit, damage: number, seconds: number) => void} bleed gives or refreshes 逐腐 bleed (敌能-46)
 * @property {(u: Unit) => boolean} onLow whether a unit's tile is 低地 (敌能-46)
 * @property {() => void} ground a flying unit's own motion becomes ground (`WALK`) and the move it is on drops its plan
 *   (路线-2, 敌能-48); a unit that is not flying is left as it is
 * @property {(u: Unit) => number} ammoOf shots left on a unit's running ammo skill, otherwise 0 (敌能-49, 技能-4)
 * @property {(u: Unit, n: number) => void} spendAmmo takes that many shots, not below 0, and does not end the skill (敌能-49)
 * @property {(u: Unit, key: string, frames: number, mods: Record<string, number>) => void} renew sets that buff's frames
 *   left and replaces its modifiers; adds it when the unit has none (敌能-49)
 * @property {() => Unit[]} ours operators and our devices still on the field (敌能-49)
 * @property {() => void} holdAttack this frame's attack, if one can start, waits out the current interval first (敌能-62)
 * @property {(t: Unit, o: { radius: number, seconds: number, aspd: number, dodge: number }) => void} pour places a 【免费品尝】
 *   area at the centre of the target's tile (敌能-62)
 */

/**
 * An enemy ability's behaviour (敌能-2).
 * @typedef {object} FoeBehavior
 * @property {(ctx: FoeContext) => void} [spawn]
 * @property {(ctx: FoeContext) => void} [tick]
 * @property {(ctx: FoeContext, cands: Unit[]) => Unit[]} [targets]
 * @property {(ctx: FoeContext, mods: AttackMods) => AttackMods} [attack]
 * @property {(ctx: FoeContext, target: Unit) => boolean} [cancelHit] before the main hit of its normal attack is settled
 *   (a splash, a chain and an aftershock are not this): true cancels that hit (敌能-49)
 * @property {(ctx: FoeContext) => void} [death]
 * @property {(ctx: FoeContext, target: Unit, dealt: number, ranged: boolean) => void} [hit] a hit of its normal attack
 *   dealt damage (`ranged`: it came by a projectile)
 * @property {(ctx: FoeContext, target: Unit, how: { dealt: number, ranged: boolean, skill: boolean }) => void} [landed]
 *   a normal attack's hit connected (`dealt` may be 0; `skill`: the skill's attack). Splash does not (敌能-46)
 * @property {(ctx: FoeContext) => boolean} [fatal] its HP ran out: true when the ability keeps it on the field, its HP
 *   above 0
 * @property {(ctx: FoeContext) => void} [unbalanceEnd] 失衡 ended this turn, after the slide settled (敌能-2)
 * @property {(ctx: FoeContext, hit: FoeHpDamage) => void} [hpDamage] a hit on it came through 伤判 with damage left,
 *   before its HP drops (敌能-2; the bus's `hpDamage`, 钩子-3). The amount of this hit is already fixed
 */

/** The squared distance between two points. @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** The units an enemy may attack (敌人攻击-1, 合作-9, 装置-2): operators, neutral units and our devices. @param {Unit} u @param {Unit} e */
export const isFoeOf = (u, e) => u !== e && friendly(u);

/** @param {Content} c @param {Unit} e @returns {EnemyDef} */
const defOf = (c, e) => c.enemies[e.key];

/** @typedef {[string, Record<string, number>, import('./types.js').FoeSkill | null][]} Abilities */
/** Each content's enemies' abilities, worked out once per enemy key (the content does not change). @type {WeakMap<Content, { own: unknown, by: Map<string, Abilities> }>} */
const abilityTables = new WeakMap();

/** The abilities of an enemy that have a behaviour: [name, blackboard, skill or null]. @param {Content} c @param {Unit} e @returns {Abilities} */
function abilities(c, e) {
  const own = c.behaviors?.foes ?? {};
  let t = abilityTables.get(c);
  if (!t || t.own !== c.behaviors?.foes) { t = { own: c.behaviors?.foes, by: new Map() }; abilityTables.set(c, t); }
  const known = t.by.get(e.key);
  if (known) return known;
  const d = defOf(c, e);
  /** @type {Abilities} */
  const out = [];
  for (const [k, bb] of Object.entries(d.talents ?? {})) if (Object.hasOwn(own, k)) out.push([k, bb, null]);
  for (const s of d.skills ?? []) if (Object.hasOwn(own, s.key)) out.push([s.key, s.bb, s]);
  t.by.set(e.key, out);
  return out;
}

/**
 * A 默认类 ally still on the field (敌能-54): an operator, not a 装置类 summon and not in 战术点 form. A level device is
 * not an operator. A summon form keeps the `tactical` key with no end; only the point form (a remaining time) is excluded.
 * @param {Content} c @param {Unit | null} u
 */
function defaultAlly(c, u) {
  if (!u || u.kind !== KIND.OPERATOR || !(u.hp > 0) || atPoint(u)) return false;
  return c.operators[u.key]?.summon?.device !== true;
}

/**
 * The context's `bolt` (敌能-4): a direct bolt from the enemy, and its event. Kept out of contextOf for its line budget.
 * @param {World} w @param {Unit} e @param {Parameters<FoeContext['bolt']>[0]} b
 */
function fireBolt(w, e, b) {
  w.bolts.push({ src: e.id, x: e.x, y: e.y, dx: b.dx, dy: b.dy, type: b.type, amount: b.amount, status: b.status ?? null, blast: b.blast ?? 0 });
  w.events.push({ type: 'bolt', id: e.id });
}

/**
 * An ability's context (敌能-2): `of` is the ability — its name, blackboard and skill (null for a talent).
 * @param {World} w @param {Content} c @param {Unit} e
 * @param {{ name: string, bb: Record<string, number>, skill: import('./types.js').FoeSkill | null }} of @returns {FoeContext}
 */
function contextOf(w, c, e, of) {
  const { name, bb, skill } = of;
  const ab = e.ab;
  return {
    self: e, bb, sp: skill?.sp ?? 0, frame: w.frame, stats: statsOf,
    addBuff: (t, init) => { addBuff(t, makeBuff({ src: e.id, ...init })); },
    removeBuff: (t, key) => { removeBuff(t, key); },
    applyStatus: (t, key, o) => { inflict(w, t, /** @type {any} */ (key), { ...o, src: e }); },
    dealDamage: (t, dmg) => dealDamage(w, e, t, dmg, c),
    dealEp: (t, el, amount) => dealEp(w, t, /** @type {any} */ (el), amount, e),
    heal: (t, amount) => heal(w, e, t, amount),
    gainCost: () => {},
    state: { get: (k) => ab[`${name}.${k}`] ?? 0, set: (k, v) => { ab[`${name}.${k}`] = v; } },
    blocked: e.blockedBy >= 0,
    unbalanced: e.slide !== undefined,
    hurt: (ab['@hurt'] ?? 0) === 1,
    get taken() { if (!Object.hasOwn(ab, '@taken')) ab['@taken'] = 0; return ab['@taken']; },
    unblocked: (ab['@unblocked'] ?? 0) === 1,
    fell: (ab['@fell'] ?? 0) === 1,
    ready: skill !== null && (ab[`${name}.cd`] ?? 0) <= 0,
    use: () => { if (skill) ab[`${name}.cd`] = skill.cooldown < 0 ? ONCE : secondsToFrames(skill.cooldown); },
    frames: secondsToFrames,
    talent: (t) => defOf(c, e).talents?.[t] ?? null,
    foes: (radius, sel) => w.units.filter((u) => isFoeOf(u, e) && selectable(u, sel) && dist2(u, e) <= radius * radius),
    order: (units) => sortAllies(e, units, FPS),
    allies: (radius) => w.units.filter((u) => u.kind === KIND.ENEMY && u.base.neutral !== true && u.hp > 0 && !u.hidden && dist2(u, e) <= radius * radius),
    talentOf: (u, t) => (u.kind === KIND.ENEMY ? defOf(c, u).talents?.[t] ?? null : null),
    buffValue: (u, key) => u.buffs.find((b) => b.key === key)?.value ?? null,
    setBuff: (u, key, value, mods) => { setBuffOf(e, u, key, value, mods); },
    blocker: () => (e.blockedBy >= 0 ? w.units.find((u) => u.id === e.blockedBy) ?? null : null),
    tagsOf: (u) => (u.kind === KIND.ENEMY ? defOf(c, u).tags ?? [] : []),
    tileKey: () => { const [r, col] = tileOf(e); return tileAt(c.level, r, col)?.key ?? ''; },
    board: (u) => { if (u !== e && u.kind === KIND.ENEMY && !u.hidden && !carried(u)) { board(u); u.ab['@carrier'] = e.id; } },
    passengers: () => w.units.filter((u) => u.ab['@carrier'] === e.id).length,
    alight: () => { releasePassengers(w, c, e); },
    drainCost: (t, n) => { const p = t.kind === KIND.OPERATOR ? w.players[t.owner] : undefined; if (p) p.cost = Math.max(0, p.cost - n); },
    inLine: () => inLine(w, e),
    // `buff` is omitted when absent: a null field would change the hash of every blast (敌能-43).
    blast: (b) => { w.blasts.push({ x: b.x, y: b.y, radius: b.radius, left: secondsToFrames(b.delay), air: b.air, src: b.sourced ? e.id : -1, type: b.type, amount: b.amount, status: b.status ?? null, ...(b.buff ? { buff: b.buff } : {}) }); },
    bolt: (b) => { fireBolt(w, e, b); },
    setBaseMaxHp: (hp) => { setBaseMaxHp(e, hp); },
    ...blightContext(w, c, e),
    ground: () => { becomeGround(e); },
    defaultAlly: (u) => defaultAlly(c, u),
    ...barrelContext(w, ab),
    ...lateContext(w, c, e, ab),
  };
}

/**
 * The rest of an ability's context (敌能-2, 敌能-49). Split so `contextOf` stays within the line limit.
 * @param {World} w @param {Content} c @param {Unit} e @param {Record<string, number>} ab
 * @returns {Pick<FoeContext, 'setHp' | 'resetSkills' | 'onWay' | 'detour' | 'release' | 'placeDevice' | 'summon' | 'draw' | 'remove'
 *   | 'devour' | 'lend' | 'around' | 'enemies' | 'fly' | 'attackAgain' | 'ammoOf' | 'spendAmmo' | 'renew' | 'ours'>}
 */
function lateContext(w, c, e, ab) {
  return {
    setHp: (t, hp) => { setHp(t, hp); },
    resetSkills: () => { for (const s of defOf(c, e).skills ?? []) ab[`${s.key}.cd`] = secondsToFrames(s.initCooldown); },
    onWay: (u) => wayKeys(c, e).includes(keyAt(c.level, u.x, u.y)),
    detour: (row, col) => { detour(c, e, row, col); },
    release: () => { release(e); },
    placeDevice: (key) => { const [r, col] = tileOf(e); return spawnDevice(w, c, key, r, col); },
    summon: (key, o) => bringIn(w, c, e, key, o),
    draw: () => draw(w),
    remove: (u) => { if (u.kind === KIND.ENEMY) knockDown(u); },
    devour: (t) => devour(e, t),
    lend: (t, key, init) => { lend(e, t, key, init); },
    around: (t, area) => around(w, e, t, area),
    enemies: () => w.units.filter((u) => u.kind === KIND.ENEMY && u.base.neutral !== true && u.hp > 0),
    fly: () => { becomeFlyer(e); },
    attackAgain: () => { ab['@again'] = 1; },
    ammoOf: (u) => ammoLeft(c, u),
    spendAmmo: (u, n) => { const st = u.skill; if (st && ammoLeft(c, u) > 0) setAmmo(st, st.ammo - n); },
    renew: (u, key, frames, mods) => { renewBuff(e, u, key, frames, mods); },
    ours: () => w.units.filter(ourUnit),
  };
}

/**
 * The context members of 敌能-62, kept out of `contextOf` for its line limit: the attack interval a skill takes, and the
 * 【免费品尝】 area. @param {World} w @param {Record<string, number>} ab
 * @returns {Pick<FoeContext, 'holdAttack' | 'pour'>}
 */
function barrelContext(w, ab) {
  return {
    holdAttack: () => { ab['@holdAtk'] = 1; },
    pour: (t, o) => {
      const [row, col] = tileOf(t);
      placeTasting(w, { x: col, y: row, radius: o.radius, remain: secondsToFrames(o.seconds), aspd: o.aspd, dodge: o.dodge });
    },
  };
}

/**
 * The context's `setBuff` (敌能-2): retunes the buff of this key the unit holds, or gives it one from the enemy.
 * @param {Unit} e @param {Unit} u @param {string} key @param {number} value @param {Record<string, number>} mods
 */
function setBuffOf(e, u, key, value, mods) {
  const b = u.buffs.find((x) => x.key === key);
  if (b) retune(u, b, value, mods);
  else addBuff(u, makeBuff({ key, src: e.id, value, mods }));
}

/** Shots left on a running ammo skill (敌能-49, 技能-4); 0 when the unit has none running. @param {Content} c @param {Unit} u */
function ammoLeft(c, u) {
  const st = u.skill;
  if (!st?.active || u.kind !== KIND.OPERATOR) return 0;
  return c.operators[u.key]?.skill?.ammo ? st.ammo : 0;
}

/**
 * A buff's remaining time replaced, its modifiers replaced with `mods` (敌能-49). The same key stays where it is in
 * the list. A unit without it gains one.
 * @param {Unit} src @param {Unit} u @param {string} key @param {number} frames @param {Record<string, number>} mods
 */
function renewBuff(src, u, key, frames, mods) {
  const b = u.buffs.find((x) => x.key === key);
  if (!b) { addBuff(u, makeBuff({ key, src: src.id, left: frames, mods })); return; }
  setLeft(b, frames);
  if (!sameMods(mods, b.mods)) retune(u, b, b.value, mods);
}

/** An operator, or a device of ours, still on the field (敌能-49). A neutral unit is neither. @param {Unit} u */
function ourUnit(u) {
  if (u.hp <= 0 || u.hidden) return false;
  if (u.kind === KIND.OPERATOR) return true;
  return u.kind === KIND.DEVICE && u.base.hostile !== true;
}

/** Frames a lent buff lasts without being given again (敌能-25): it outlasts the next frame's buff tick. */
const LENT = 2;

/** Whether two sets of mods are the same. @param {Record<string, number>} a @param {Record<string, number>} b */
const sameMods = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

/**
 * A buff enemy `e` lends unit `t` (敌能-25): made the first time, its frames left back to LENT each time after — retuned
 * when its value or mods changed.
 * @param {Unit} e @param {Unit} t @param {string} key @param {{ mods?: Record<string, number>, flags?: Record<string, boolean>, value?: number, prio?: number, act?: string, restore?: number }} init
 */
function lend(e, t, key, init) {
  const b = t.buffs.find((x) => x.key === key);
  if (!b) { addBuff(t, makeBuff({ key, src: e.id, left: LENT, ...init })); return; }
  setLeft(b, LENT);
  const mods = init.mods ?? {}, value = init.value ?? b.value;
  if (value !== b.value || !sameMods(mods, b.mods)) retune(t, b, value, mods);
}

/**
 * The units enemy `e` may attack on unit `t`'s tile and the tiles around it (敌能-29): a cross or a square; on the field,
 * selectable or not, not evading a ground attacker; in creation order. The locked target stays while 隐匿; the others do
 * not when 隐匿 is in effect (索敌-2). 迷彩 does not leave one out.
 * @param {World} w @param {Unit} e @param {Unit} t @param {'cross' | 'square'} area @returns {Unit[]}
 */
function around(w, e, t, area) {
  const [r, col] = tileOf(t);
  return w.units.filter((u) => {
    if (u.hp <= 0 || u.hidden || !isFoeOf(u, e) || evadesGround(e, u)) return false;
    if (u !== t && stealthed(u)) return false;
    const [ur, uc] = tileOf(u), dr = Math.abs(ur - r), dc = Math.abs(uc - col);
    return area === 'square' ? Math.max(dr, dc) <= 1 : dr + dc <= 1;
  });
}

/**
 * The units in an enemy's row or column a 直击 may select (敌能-4, 敌能-9): ones it may attack, on the field, not
 * disappeared, camouflage or not; nearest first.
 * @param {World} w @param {Unit} e @returns {Unit[]}
 */
function inLine(w, e) {
  const [r, col] = tileOf(e);
  return w.units.filter((u) => {
    if (!isFoeOf(u, e) || !selectable(u, { ignoreCamou: true, canHitFly: true })) return false;
    const [ur, uc] = tileOf(u);
    return (ur === r) !== (uc === col);
  }).toSorted((a, b) => Math.abs(a.x - e.x) + Math.abs(a.y - e.y) - (Math.abs(b.x - e.x) + Math.abs(b.y - e.y)) || a.id - b.id);
}

/**
 * Runs a hook of every ability of an enemy that has one; the context is made only for those (an ability without the
 * hook does nothing with it).
 * @param {World} w @param {Content} c @param {Unit} e @param {keyof FoeBehavior} hook @param {(b: FoeBehavior, ctx: FoeContext) => void} run
 */
function each(w, c, e, hook, run) {
  const own = c.behaviors?.foes ?? {};
  for (const [name, bb, skill] of abilities(c, e)) {
    const b = own[name];
    if (b[hook] != null) run(b, contextOf(w, c, e, { name, bb, skill }));
  }
}

/**
 * A new enemy (敌能-2): its skills' first cooldowns, then its abilities' spawn.
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function foeSpawn(w, c, e) {
  for (const s of defOf(c, e).skills ?? []) e.ab[`${s.key}.cd`] = secondsToFrames(s.initCooldown);
  e.ab['@hp'] = e.hp;
  e.ab['@blocked'] = e.blockedBy >= 0 ? 1 : 0;
  each(w, c, e, 'spawn', (b, ctx) => b.spawn?.(ctx));
}

/**
 * The start of an enemy's turn (敌能-2): whether it was hurt or unblocked since its last turn, its abilities' tick,
 * then a frame off its skills' cooldowns — a skill with n frames of cooldown is ready n frames after it was used.
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function foeTick(w, c, e) {
  const ab = e.ab, blocked = e.blockedBy >= 0 ? 1 : 0;
  ab['@hurt'] = e.hp < (ab['@hp'] ?? e.hp) ? 1 : 0;
  ab['@unblocked'] = (ab['@blocked'] ?? 0) === 1 && blocked === 0 ? 1 : 0;
  each(w, c, e, 'tick', (b, ctx) => b.tick?.(ctx));
  for (const s of defOf(c, e).skills ?? []) if ((ab[`${s.key}.cd`] ?? 0) > 0) ab[`${s.key}.cd`]--;
  ab['@hp'] = e.hp;
  ab['@blocked'] = e.blockedBy >= 0 ? 1 : 0;
}

/**
 * The frame 失衡 ends (敌能-2): after this turn's slide settled. `unbalanced` is already false.
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function foeUnbalanceEnd(w, c, e) {
  each(w, c, e, 'unbalanceEnd', (b, ctx) => b.unbalanceEnd?.(ctx));
}

/**
 * An enemy whose HP ran out, before it leaves (敌能-2): whether one of its abilities keeps it on the field.
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function foeFatal(w, c, e) {
  let kept = false;
  each(w, c, e, 'fatal', (b, ctx) => { if (!kept && b.fatal) kept = b.fatal(ctx) && e.hp > 0; });
  return kept;
}

/** The candidates of an enemy's attack after its abilities (敌能-2). @param {World} w @param {Content} c @param {Unit} e @param {Unit[]} cands */
export function foeTargets(w, c, e, cands) {
  let out = cands;
  each(w, c, e, 'targets', (b, ctx) => { if (b.targets) out = b.targets(ctx, out); });
  return out;
}

/** The mods of an enemy's attack after its abilities (敌能-2). @param {World} w @param {Content} c @param {Unit} e @param {AttackMods} mods */
export function foeAttack(w, c, e, mods) {
  let out = mods;
  each(w, c, e, 'attack', (b, ctx) => { if (b.attack) out = b.attack(ctx, out); });
  return out;
}

/**
 * Before the main hit of an enemy's normal attack (敌能-49). True when an ability cancels it: no HP damage, no
 * 元素损伤, no on-hit status, displacement, `attackHit` or SP. A splash, a chain and an aftershock do not ask.
 * @param {World} w @param {Content} c @param {Unit} e @param {Unit} t
 */
export function foeCancelHit(w, c, e, t) {
  let stop = false;
  each(w, c, e, 'cancelHit', (b, ctx) => { if (!stop && b.cancelHit?.(ctx, t)) stop = true; });
  return stop;
}

/** Whether an enemy rides a carrier (敌能-16). @param {Unit} u */
export const carried = (u) => Object.hasOwn(u.ab, '@carrier');

/**
 * A carrier's passengers alight (敌能-16), when it says so and when it leaves the field: at the centre of its tile,
 * or, when a `busUnload` buff names a half-width, at a seeded point in that square, on the carrier's remaining route.
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function releasePassengers(w, c, e) {
  const half = e.buffs.find((b) => b.key === 'busUnload')?.value ?? 0;
  for (const u of w.units) {
    if (u.ab['@carrier'] !== e.id) continue;
    delete u.ab['@carrier'];
    if (!(half > 0)) { alight(c, u, e); continue; }
    const at = { x: e.x + (draw(w) * 2 - 1) * half, y: e.y + (draw(w) * 2 - 1) * half };
    alight(c, u, at, { exact: true, route: e.route, leg: e.leg });
  }
}

/** An enemy knocked down (敌能-2). @param {World} w @param {Content} c @param {Unit} e */
export function foeDeath(w, c, e) {
  each(w, c, e, 'death', (b, ctx) => b.death?.(ctx));
}

/**
 * A hit of an enemy's normal attack dealt damage (敌能-2): its abilities' hit.
 * @param {World} w @param {Content} c @param {Unit} e @param {Unit} t @param {{ dealt: number, ranged: boolean }} how
 */
export function foeHit(w, c, e, t, how) {
  each(w, c, e, 'hit', (b, ctx) => b.hit?.(ctx, t, how.dealt, how.ranged));
}

/**
 * A normal attack's hit connected (敌能-46): abilities' `landed`, also when the hit took no HP. Splash does not.
 * @param {World} w @param {Content} c @param {Unit} e @param {Unit} t
 * @param {{ dealt: number, ranged: boolean, skill: boolean }} how
 */
export function foeLanded(w, c, e, t, how) {
  each(w, c, e, 'landed', (b, ctx) => b.landed?.(ctx, t, how));
}

/**
 * The hit a foe `hpDamage` hook sees (敌能-2): the bus event's `source` (none for a sourceless hit), `credit` (who it
 * is credited to), `amount` (the damage left after 伤判) and `dmg` (钩子-3).
 * @typedef {{ source: Unit | null, credit: Unit | null, amount: number, dmg: import('./damage.js').Damage }} FoeHpDamage
 */

/** The owner of the bus handler below (钩子-1). */
const HP_DAMAGE = 'foeHpDamage';

/**
 * The foe `hpDamage` hook (敌能-2) on the bus's `hpDamage` (钩子-3): once per world, and only when a foe behaviour of the
 * content has one. Every hit on an enemy with damage left after 伤判 calls it once, before the HP drops.
 * @param {World} w @param {Content} c
 */
export function foeHooks(w, c) {
  if (!Object.values(c.behaviors?.foes ?? {}).some((b) => b.hpDamage) || w.bus?.hooks.get('hpDamage')?.some((h) => h.owner === HP_DAMAGE)) return;
  on(w, 'hpDamage', (ctx) => {
    if (ctx.target.kind !== KIND.ENEMY) return;
    const hit = { source: ctx.source, credit: ctx.credit, amount: ctx.amount, dmg: ctx.dmg };
    each(w, c, ctx.target, 'hpDamage', (b, x) => b.hpDamage?.(x, hit));
  }, { owner: HP_DAMAGE });
}

/**
 * A unit takes a bolt's or an explosion's payload (敌能-3, 敌能-4).
 * @param {World} w @param {Content} c @param {Unit | null} src @param {Unit} t
 * @param {{ type: DamageType, amount: number, status: { key: string, seconds: number } | null, buff?: import('./buffs.js').BuffInit }} p
 */
function take(w, c, src, t, p) {
  dealDamage(w, src, t, { type: p.type, amount: p.amount }, c);
  if (t.hp <= 0) return;
  if (p.status) inflict(w, t, /** @type {any} */ (p.status.key), { seconds: p.status.seconds, src });
  if (p.buff) addBuff(t, makeBuff({ src: src ? src.id : -1, ...p.buff }));
}

/**
 * The first unit a bolt's path comes within the hit radius of this frame (敌能-4): one an enemy may attack, on the
 * field, selectable camouflage or not; nearest along the path, then the earliest created.
 * @param {World} w @param {Bolt} b @param {number} step tiles it flies this frame @returns {Unit | null}
 */
function firstHit(w, b, step) {
  let hit = /** @type {Unit | null} */ (null), at = Infinity;
  for (const u of w.units) {
    if (u.hp <= 0 || u.hidden || !friendly(u) || !selectable(u, { ignoreCamou: true, canHitFly: true })) continue;
    const along = (u.x - b.x) * b.dx + (u.y - b.y) * b.dy, off = Math.abs((u.x - b.x) * b.dy - (u.y - b.y) * b.dx);
    if (along >= -BOLT_RADIUS && along <= step + BOLT_RADIUS && off <= BOLT_RADIUS && along < at) { at = along; hit = u; }
  }
  return hit;
}

/**
 * One frame of the 直击 bolts (敌能-4): each moves; the first unit its path comes within the hit radius of takes it —
 * or an explosion goes off there; off the map it is gone.
 * @param {World} w @param {Content} c
 */
function flyBolts(w, c) {
  const step = BOLT_SPEED / FPS, { width, height } = c.level;
  /** @type {Bolt[]} */
  const keep = [];
  for (const b of w.bolts) {
    const src = w.units.find((u) => u.id === b.src) ?? null, nx = b.x + b.dx * step, ny = b.y + b.dy * step;
    const hit = firstHit(w, b, step);
    if (hit) {
      if (b.blast > 0) w.blasts.push({ x: hit.x, y: hit.y, radius: b.blast, left: 0, air: true, src: b.src, type: b.type, amount: b.amount, status: b.status });
      else take(w, c, src, hit, b);
      continue;
    }
    if (nx < -0.5 || ny < -0.5 || nx > width - 0.5 || ny > height - 0.5) continue;
    keep.push({ ...b, x: nx, y: ny });
  }
  w.bolts = keep;
}

/**
 * One frame of the delayed explosions (敌能-3): each counts down; at 0 every unit an enemy may attack within its radius
 * — flying ones only if it reaches the air — takes it, camouflage or not. 隐匿 in effect leaves a unit out (索敌-2).
 * @param {World} w @param {Content} c
 */
function blow(w, c) {
  /** @type {Blast[]} */
  const keep = [];
  for (const b of w.blasts) {
    if (b.left - 1 > 0) { keep.push({ ...b, left: b.left - 1 }); continue; }
    const src = b.src >= 0 ? w.units.find((u) => u.id === b.src) ?? null : null;
    w.events.push({ type: 'blast', x: b.x, y: b.y });
    for (const u of [...w.units]) {
      if (u.hp <= 0 || u.hidden || !friendly(u) || stealthed(u)) continue;
      if (statsOf(u).flying && !b.air) continue;
      if (dist2(u, b) <= b.radius * b.radius) take(w, c, src, u, b);
    }
  }
  w.blasts = keep;
}

/** The bolts, the explosions due this frame, the enemies brought in due now, then 污染秽蚀 and 【免费品尝】 (帧-1, 敌能-3, 敌能-4, 敌能-22, 敌能-46, 敌能-62). @param {World} w @param {Content} c */
export function foeEffects(w, c) {
  flyBolts(w, c);
  blow(w, c);
  hatch(w, c);
  tickBlight(w, c);
  tickTastings(w);
}
