// Stands in for Stronghold's server/sim/constants.js (兼容-2): the names its operator kits import. COLS and ROWS are
// the level's (兼容-1); TICK is the engine's frame (时间-1); the others are Stronghold v0.2.4's values, each to be
// checked against the official one when the kits using it are compared with the oracle.
export { COLS, ROWS } from '../grid.js';

/** Seconds per simulated frame (时间-1: 30 frames a second). */
export const TICK = 1 / 30;
/** Tiles a second = move speed × MOVE_SCALE. */
export const MOVE_SCALE = 0.5;
/** The least damage of a hit, as a share of the attack (伤害-2: 5%). */
export const MIN_DAMAGE_RATIO = 0.05;
/** The most 麻痹 layers. */
export const PALSY_MAX = 3;
/** Projectile speeds in tiles a second, by kind. */
export const PROJECTILE_SPEEDS = Object.freeze({ arrow: 14, bolt: 11, bomb: 8, lob: 8, orb: 10, drone: 16, enemy: 10, boomerang: 15, droneBomb: 5 });
/** Skills whose push is a 推 (not a 拉). */
export const PUSH_EFFECT_SKILLS = Object.freeze(new Set(['skchr_forcer_1', 'skchr_forcer_2']));
/** A pull stops this close to its point. */
export const PULL_STOP_RADIUS = 0.6708;
/** A push closer than this goes along the pusher's facing. */
export const PUSH_DIRECTIONAL_MIN_DIST = 0.25;
/** The reason an enemy leaves the field without reaching a goal. */
export const FORCED_EXIT = 'forcedExit';
/** How direct bonuses of one kind combine. */
export const DIRECT_BONUS_STACKING = 'add';
/** A chain's jump radius, in tiles (Stronghold v0.2.4 constants.js CHAIN_RADIUS; its chess kits 雷蛇、伺夜). */
export const CHAIN_RADIUS = 1.7;
/** An element gauge's top (Stronghold v0.2.4 constants.js ELEMENT_GAUGE_MAX; its chess kit 哈洛德). */
export const ELEMENT_GAUGE_MAX = 1000;

// Stronghold v0.4.0's values of the names its battle content beyond the kits imports (兼容-7).

/** Seconds an attack's wind-up shows (莱塔尼亚's 余音). */
export const ATTACK_ANIM_TIME = 0.35;
/** Squared contact distances of blocking, by what blocks. */
export const BLOCK_RADIUS_SQ = Object.freeze({ ground: 0.49999037, fly: 0.79995137, device: 0.4472 * 0.4472 });
/** A boss field's rows below the board's (board row − 7). */
export const BOSS_ROW_OFFSET = -7;
/** An ally's collider radius, in tiles. */
export const ALLY_COLLIDER_RADIUS = 0.25;
/** Seconds an enemy's 隐匿 takes to return after a block ends. */
export const STEALTH_RESTORE = 3;
/** The most enemies alive on a field. */
export const MAX_ALIVE_ENEMIES = 600;
/** Element bursts on allies and on enemies, by Stronghold's element name. */
export const ELEMENT = Object.freeze({
  burn: Object.freeze({
    burstDamage: 1200, burstType: 'arts', resDown: 20, duration: 10,
    ally: Object.freeze({ damage: 1200, type: 'arts', resDown: 20, duration: 10 }),
    enemy: Object.freeze({ elemDamage: 7000, resDown: 20, duration: 10 }),
  }),
  neural: Object.freeze({
    burstDamage: 1000, burstType: 'true', stun: 10, duration: 10,
    ally: Object.freeze({ damage: 1000, type: 'true', stun: 10, duration: 10 }),
    enemy: Object.freeze({ elemDamage: 6000, palsy: 3, duration: 10 }),
  }),
  apoptosis: Object.freeze({
    dps: 100, duration: 15,
    ally: Object.freeze({ dps: 100, dpsType: 'arts', spLossPerSec: 1, duration: 15 }),
    enemy: Object.freeze({ elemDps: 800, weaken: 0.5, duration: 15 }),
  }),
  erosion: Object.freeze({
    ally: Object.freeze({ damage: 800, type: 'phys', defDown: 100, duration: 10 }),
    enemy: Object.freeze({ elemDamage: 5000, defDown: 120, duration: 8 }),
  }),
  necrosis: Object.freeze({ dps: 100, duration: 12, atkDownPct: 0.2 }),
});
