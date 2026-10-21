// Official constants of the battle (spec 常量-1…常量-6), with the names of the Stronghold-compatible content interface
// (ADR 0012). Each value has its source in docs/spec/constants.md. Constants of later mechanics (statuses, elements,
// push and pull …) arrive with them; the grid's size is per level and is not here (the content adapter, M4).
import { FPS } from '@aue/math';

/** Seconds per frame (spec 时间-1). */
export const TICK = 1 / FPS;

/** Damage after mitigation is at least this share of the amount before it (spec 常量-1, 伤害-2). */
export const MIN_DAMAGE_RATIO = 0.05;

/** Collider radius of an allied unit, in tiles (spec 常量-2). */
export const ALLY_COLLIDER_RADIUS = 0.25;

/** Collider radius of a regular enemy, in tiles: what a range must overlap to reach it (spec 常量-6, 体积-5). */
export const ENEMY_COLLIDER_RADIUS = 0.1;

/** Block radius, in tiles: ground and flying (spec 常量-3). */
export const BLOCK_RADIUS = Object.freeze({ ground: 0.70709997, fly: 0.8944 });
/** The same, squared as the official client compares them (spec 常量-3). */
export const BLOCK_RADIUS_SQ = Object.freeze({ ground: 0.49999037, fly: 0.79995137 });

/** The attack speed attribute's bounds (spec 常量-4). */
export const ASPD_MIN = 20;
export const ASPD_MAX = 600;

/** A level's default move multiplier: tiles per second = moveSpeed × this (spec 常量-5, 移动-1). */
export const MOVE_SCALE = 0.5;
