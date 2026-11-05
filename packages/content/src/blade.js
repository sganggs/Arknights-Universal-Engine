// “邪魔的利刃” and “邪魔的利刃”，游荡者 (docs/spec/foes.md 敌能-141): 【国度】. Each ground tile one enters lays 【国度】 on
// the 可部署位 of its range around that tile, kept in its own ability state while it is on the field; ours standing there
// that it could select are lent 攻击速度 + `attack_speed`, and its hits on a unit holding that buff take × `atk_scale`
// before the defences. The other shapes of the two talent names stay uncovered (关卡-2). Acts only through the context
// (ADR 0055); the tile test is the context's `deployable`, the hit-time 倍率 the attack mods' `vsBuff`.

import { body } from '@aue/sim';
import rangeTable from '../data/ranges.json' with { type: 'json' };

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** The buff ours in 【国度】 are lent (敌能-141). No other ability gives this key; DamageUp's 倍率 looks for it. */
export const REALM = 'blackFog';

/** Keys a read `DamageUp` may hold: `page` marks the two read pages, it is not enemy data. */
const UP_KEYS = new Set(['atk_scale', 'page']);

/** range_table's ranges by id (干员-8), as the data stores them. */
const RANGES = /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges);

/** A range id's cells, or null for anything that is not one of range_table's ids. @param {unknown} id */
const cellsOf = (id) => (typeof id === 'string' && Object.hasOwn(RANGES, id) ? RANGES[id] : null);

/**
 * `BlackFog` as the two pages read it (敌能-141): exactly a number `attack_speed` and a range id `range_id`. 追猎者's
 * radius and resistance, a number written as text, or one key more is another ability.
 * @param {Record<string, unknown>} bb
 */
const fogShape = (bb) => Object.keys(bb).length === 2 && typeof bb.attack_speed === 'number' && cellsOf(bb.range_id) !== null;

/**
 * `DamageUp` as the two pages read it (敌能-141): a number `atk_scale`, and `page` 1 when it is there. 新生血裔's
 * `scale_ratio` and `add_on` are another ability.
 * @param {Record<string, unknown>} bb
 */
function upShape(bb) {
  if (typeof bb.atk_scale !== 'number' || (bb.page !== undefined && bb.page !== 1)) return false;
  return Object.keys(bb).every((k) => UP_KEYS.has(k));
}

/**
 * Whether a talent of this name, with this blackboard, is this clause's (敌能-141). Any other name is not this family's
 * concern; DamageUp's page marker itself is asked by FOE_NEEDS.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function bladeOwns(name, bb) {
  if (name === 'BlackFog') return fogShape(bb);
  if (name === 'DamageUp') return upShape(bb);
  return true;
}

/** The ability-state key that marks a 【国度】 tile (敌能-141). @param {number} row @param {number} col */
const realmKey = (row, col) => `r${row}c${col}`;

/**
 * The tile it entered this turn, if any (敌能-141, INF-0880): its tile (体积-1) when that is not the tile it saw last —
 * its first turn too. Nothing while it is 消失 (路线-4), so the turn it shows again looks.
 * @param {FoeContext} ctx @returns {[number, number] | null}
 */
function entered(ctx) {
  if (ctx.self.hidden) return null;
  const st = ctx.state, [row, col] = body.tileOf(ctx.self);
  if (st.get('seen') === 1 && st.get('row') === row && st.get('col') === col) return null;
  st.set('seen', 1);
  st.set('row', row);
  st.set('col', col);
  return [row, col];
}

/**
 * 【国度】 laid (敌能-141): on entering a ground tile (低地), the 可部署位 of its range around that tile, whoever stands
 * there. The set only grows; it is this ability's state, so it is the enemy's and goes when it leaves (INF-0881).
 * @param {FoeContext} ctx @param {{ row: number, col: number }[]} cells
 */
function lay(ctx, cells) {
  const at = entered(ctx);
  if (!at || !ctx.onLow(ctx.self)) return;
  for (const c of cells) {
    const row = at[0] + c.row, col = at[1] + c.col;
    if (ctx.deployable(row, col)) ctx.state.set(realmKey(row, col), 1);
  }
}

/**
 * Whether 【国度】's slow takes a unit `foes` gave (敌能-141, INF-0882): ours, not a neutral unit, and not one that took off
 * from a blade on the ground (阻挡-2). `foes` already leaves out 隐匿, 迷彩, 无法选中 and 沉睡 (索敌-2).
 * @param {FoeContext} ctx @param {Unit} u
 */
const slowable = (ctx, u) => u.base.neutral !== true && !(ctx.stats(u).flags.liftoff && !ctx.stats(ctx.self).flying);

/**
 * 【国度】's slow (敌能-141): each turn ours standing on a 【国度】 tile are lent 攻击速度 + `attack_speed` under one key, so
 * one buff however many 【国度】 or blades; it is gone within two frames once that stops (敌能-25). Taken as an enemy's
 * selector would (INF-0882): flying units in, since the pages' 天赋 header note makes 光环 可对空 by default; 迷彩 ones
 * out, since a hostile selector that does not ignore 迷彩 cannot select them (PRTS 选择器) and the pages say nothing.
 * @param {FoeContext} ctx
 */
function slow(ctx) {
  for (const u of ctx.foes(Infinity, { canHitFly: true })) {
    const [row, col] = body.tileOf(u);
    if (ctx.state.get(realmKey(row, col)) === 1 && slowable(ctx, u)) ctx.lend(u, REALM, { mods: { aspd: ctx.bb.attack_speed } });
  }
}

/** `BlackFog` (敌能-141): lay 【国度】 on entering a ground tile, then slow ours on it. Silence does not stop a talent. @type {FoeBehavior} */
const BlackFog = Object.freeze({
  tick: (ctx) => {
    const bb = /** @type {Record<string, unknown>} */ (ctx.bb), cells = fogShape(bb) ? cellsOf(bb.range_id) : null;
    if (!cells) return;
    lay(ctx, cells);
    slow(ctx);
  },
});

/**
 * `DamageUp` (敌能-141): its attack's hits on a unit holding 【国度】's buff take × `atk_scale` on the 倍率, looked at as
 * each hit is worked out (a shot's on arrival). Only the marked shape; anything else leaves the attack as it is.
 * @type {FoeBehavior}
 */
const DamageUp = Object.freeze({
  attack: (ctx, mods) => (ctx.bb.page === 1 && upShape(ctx.bb) ? { ...mods, vsBuff: { key: REALM, scale: ctx.bb.atk_scale } } : mods),
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const bladeBehaviors = Object.freeze({ BlackFog, DamageUp });
