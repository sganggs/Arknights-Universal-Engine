// 污染秽蚀 and 逐腐 bleed (docs/spec/foes.md 敌能-46), and a 燃烧区域 on the same list (敌能-60). A zone stays where it
// was placed and ticks once a second.
// Overlapping zones of this name share one tick per unit per second. Bleed is a buff the engine owns: content kits
// replace the buff table, so the tick cannot live only in content.
import { FPS, secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { addBuff, makeBuff, retune, setLeft } from './buffs.js';
import { dealDamage } from './damage.js';
import { stealthed } from './targeting.js';
import { tileOf } from './body.js';
import { tileAt } from './level.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').Zone} Zone */

/** The buff key of 逐腐 bleed. damage.js clears it by this string so the two files do not import each other. */
export const BLEED = 'bleed';

/** A unit's stamp of the last 污染秽蚀 tick it took (敌能-46): one tick per second, even when 无敌 zeroes it. */
const STAMP = '@polluted';

/** Squared distance. Kept here so this file does not import foes.js (that file imports this one). @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/**
 * Places a 污染秽蚀 zone (敌能-46). The first tick is a full second later: a skill places the zone before this frame's
 * effect pass, a death places it after, and skipping the birth frame makes both wait the same 30 frames.
 * @param {World} w @param {number} src the placer's id @param {{ x: number, y: number, radius: number, life: number, low: number, high: number, air?: boolean, open?: boolean, wide?: boolean, arts?: number, pad?: number }} o
 */
export function placeZone(w, src, o) {
  /** @type {Zone} */
  const z = {
    x: o.x, y: o.y, radius: o.radius, low: o.low, high: o.high,
    air: o.air === true, open: o.open === true, wide: o.wide === true,
    src, placed: w.frame, next: FPS, life: secondsToFrames(o.life),
  };
  // A 燃烧区域 (敌能-60). Left off a 污染秽蚀 zone so its snapshot stays the same.
  if (typeof o.arts === 'number') z.arts = o.arts;
  if (typeof o.pad === 'number') z.pad = o.pad;
  if (w.zones) w.zones.push(z);
  else w.zones = [z];
}

/** Whether 无法选择 or 迷彩 keeps a unit out of a zone that does not ignore them (敌能-46, 索敌-2). @param {Unit} u @param {import('./attrs.js').Stats} s */
const closed = (u, s) => !!(s.flags.untargetable || s.flags.camou || s.flags.liftoff || stealthed(u));

/**
 * Whether a unit can take this zone's tick (敌能-46): operators and summons always (they are operators); our devices
 * only when the page says 我方单位 (`wide`); flying only when 可对空; 无法选择 and 迷彩 only when the page ignores them.
 * @param {Unit} u @param {Zone} z
 */
function accepts(u, z) {
  if (u.hp <= 0 || u.hidden) return false;
  const s = statsOf(u);
  if (s.flying && !z.air) return false;
  if (!z.open && closed(u, s)) return false;
  if (u.kind === KIND.OPERATOR) return true;
  return z.wide && u.kind === KIND.DEVICE && u.base.hostile !== true;
}

/** The true damage of a unit's tile, or 0 when the tile has neither height (敌能-46, INF-0370). @param {Content} c @param {Unit} u @param {Zone} z */
function heightDamage(c, u, z) {
  const [r, col] = tileOf(u), h = tileAt(c.level, r, col)?.height;
  if (h === 'LOWLAND') return z.low;
  if (h === 'HIGHLAND') return z.high;
  return 0;
}

/** Whether this unit has not taken 污染秽蚀 in the last second (敌能-46). @param {Unit} u @param {number} frame */
const due = (u, frame) => { const last = u.ab[STAMP]; return last === undefined || frame - last >= FPS; };

/**
 * One 污染秽蚀 tick (敌能-46): each unit in range takes the earlier zone's numbers, at most once this second.
 * @param {World} w @param {Content} c @param {Zone} z @param {Unit | null} src
 */
function pollute(w, c, z, src) {
  for (const u of [...w.units]) {
    if (!accepts(u, z) || dist2(u, z) > z.radius * z.radius) continue;
    const amount = heightDamage(c, u, z);
    if (!(amount > 0) || !due(u, w.frame)) continue;
    u.ab[STAMP] = w.frame;
    dealDamage(w, src, u, { type: 'true', amount }, c);
  }
}

/**
 * One 燃烧区域 tick (敌能-60): flat arts, the radius plus the ally collider, every overlapping zone. No shared stamp.
 * @param {World} w @param {Content} c @param {Zone} z @param {Unit | null} src
 */
function burn(w, c, z, src) {
  const reach = z.radius + (z.pad ?? 0), amount = z.arts ?? 0;
  if (!(amount > 0)) return;
  const r2 = reach * reach;
  for (const u of [...w.units]) {
    if (!accepts(u, z) || dist2(u, z) > r2) continue;
    dealDamage(w, src, u, { type: 'arts', amount }, c);
  }
}

/** One zone's tick. A burn zone does not take the 污染秽蚀 stamp, and a blight zone does not deal arts. @param {World} w @param {Content} c @param {Zone} z */
function pulse(w, c, z) {
  const src = w.units.find((u) => u.id === z.src && u.hp > 0) ?? null;
  if (typeof z.arts === 'number') burn(w, c, z, src);
  else pollute(w, c, z, src);
}

/**
 * One frame of a zone (敌能-46): it waits the frame it is placed; then its countdowns run, it ticks each second, and it
 * is gone once its last tick's frame has passed. Returns whether it stays.
 * @param {World} w @param {Content} c @param {Zone} z @returns {boolean}
 */
function tickOne(w, c, z) {
  if (z.placed === w.frame) return true;
  z.life -= 1;
  z.next -= 1;
  if (z.next <= 0) {
    z.next = FPS;
    pulse(w, c, z);
  }
  return z.life > 0;
}

/** Every zone this frame (敌能-46, 敌能-60). An empty list is dropped so it stays out of the state hash. @param {World} w @param {Content} c */
export function tickBlight(w, c) {
  const zones = w.zones;
  if (!zones) return;
  const keep = [];
  for (const z of zones) if (tickOne(w, c, z)) keep.push(z);
  if (keep.length) w.zones = keep;
  else delete w.zones;
}

/**
 * Gives or refreshes 逐腐 bleed (敌能-46): the per-tick damage and the remaining time change, the one-second phase
 * (`acc`) does not, and a second buff is not added.
 * @param {Unit} t @param {number} damage @param {number} seconds
 */
export function giveBleed(t, damage, seconds) {
  const left = secondsToFrames(seconds), old = t.buffs.find((b) => b.key === BLEED);
  if (old) { retune(t, old, damage, old.mods); setLeft(old, left); return; }
  addBuff(t, makeBuff({ key: BLEED, value: damage, every: FPS, fixed: true, left }));
}

/**
 * One tick of bleed (敌能-46): sourceless arts, so there is no source penetration or multiplier, and RES still applies.
 * `stopAt` keeps the target at 1 HP.
 * @param {World} w @param {Unit} u @param {import('./types.js').Buff} b
 */
export function bleedTick(w, u, b) {
  dealDamage(w, null, u, { type: 'arts', amount: b.value, sourceless: true, stopAt: 1 });
}

/** Whether a unit stands on a 低地 tile (敌能-46). @param {Content} c @param {Unit} u */
export const onLow = (c, u) => { const [r, col] = tileOf(u); return tileAt(c.level, r, col)?.height === 'LOWLAND'; };

/**
 * The context members 敌能-46 adds. Spread into the foe context so that function stays within its line budget.
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function blightContext(w, c, e) {
  return {
    zone: (/** @type {{ x: number, y: number, radius: number, life: number, low: number, high: number, air?: boolean, open?: boolean, wide?: boolean, arts?: number, pad?: number }} */ o) => { placeZone(w, e.id, o); },
    bleed: (/** @type {Unit} */ t, /** @type {number} */ damage, /** @type {number} */ seconds) => { giveBleed(t, damage, seconds); },
    onLow: (/** @type {Unit} */ u) => onLow(c, u),
  };
}
