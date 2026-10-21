// Elements (docs/spec/elements.md 元素-1…元素-5): each unit's element values, the 元素损伤 that lowers them, the burst
// (元素损伤爆发) when one reaches 0 — its effects on characters and on other units, the lock while it lasts, the values
// back at their maximum when it ends — and the 当前损伤元素.
import { FPS, secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { liftoffRefused } from './targeting.js';
import { makeBuff, addBuff, count, retune } from './buffs.js';
import { inflict } from './status.js';
import { dealDamage } from './damage.js';
import { loseSp } from './sp.js';
import { MIN_DAMAGE_RATIO } from './constants.js';
import { emit } from './bus.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Buff} Buff */
/** @typedef {'SANITY' | 'WATER' | 'FIRE' | 'DARK' | 'ANGER'} Element */

/** The elements in the order of their ids 1…5 (元素-1). */
export const ELEMENTS = /** @type {readonly Element[]} */ (Object.freeze(['SANITY', 'WATER', 'FIRE', 'DARK', 'ANGER']));

/** A leader (领袖) enemy's maximum element value; every other unit's is 1000 (元素-1). */
export const LEADER_MAX_EP = 2000;

/** The 狂躁 burst's damage per second on a character: 100, 50 more for each attack since it began, at most 600 (元素-4). */
export const rampageDamage = (/** @type {number} */ attacks) => Math.min(600, 100 + 50 * attacks);

/** The burst buff's key for an element. @param {Element} el */
const burstKey = (el) => `burst:${el}`;
/** Whether a buff is a burst. @param {Buff} b */
const isBurst = (b) => b.key.startsWith('burst:');

/** Whether the unit is in a burst: its element values are locked (元素-3). @param {Unit} u */
export const bursting = (u) => u.buffs.some(isBurst);

/** Whether the burst effects for characters apply (元素-4): to operators; every other unit takes the others'. @param {Unit} u */
const character = (u) => u.kind === KIND.OPERATOR;

/**
 * The element value of one element (元素-1): what is recorded, or the maximum when none is.
 * @param {Unit} u @param {Element} el
 */
export const epOf = (u, el) => (Object.hasOwn(u.ep, el) ? u.ep[el] : statsOf(u).maxEp);

/**
 * The 当前损伤元素 (元素-5): of the elements below their maximum, the lowest value, the lower id of equals; null when
 * none is below it.
 * @param {Unit} u @returns {Element | null}
 */
export function currentElement(u) {
  const max = statsOf(u).maxEp;
  /** @type {Element | null} */
  let best = null;
  for (const el of ELEMENTS) if (epOf(u, el) < max && (best === null || epOf(u, el) < epOf(u, best))) best = el;
  return best;
}

/** The key of a unit's 元素损伤 multiplier for one element (元素-2, 职业-29): `<元素>TakenMul`, a product. @param {Element} el */
export const epTakenKey = (el) => `${el}TakenMul`;

/**
 * The 元素损伤 a unit takes of an amount (元素-2): A with no 损伤抵抗, max(0.05A, A·(1 − 0.01·D)) with D > 0, then
 * times its 元素损伤 multiplier and, for an element, that element's (职业-29).
 * @param {number} amount A @param {import('./attrs.js').Stats} s @param {Element} [el]
 */
export function epTaken(amount, s, el) {
  const d = s.epResistance, a = d > 0 ? Math.max(MIN_DAMAGE_RATIO * amount, amount * (1 - 0.01 * d)) : amount;
  return a * s.epTakenMul * (el ? s.prod[epTakenKey(el)] ?? 1 : 1);
}

/** The units whose burst is beginning (its `elementBurst` handlers run): they take no 元素损伤 meanwhile (元素-3). @type {WeakSet<Unit>} */
const beginning = new WeakSet();

/** Whether a unit takes no 元素损伤 now (元素-2 step 1). @param {Unit} u */
const unaffected = (u) => {
  const s = statsOf(u);
  return u.hp <= 0 || s.invincible || u.hidden || s.flags.epImmune || u.base.neutral === true || bursting(u) || beginning.has(u);
};

/**
 * Deals 元素损伤 (元素-2, 元素-3): nothing to a unit at 0 HP, invincible, disappeared, immune to elements (元素免疫) or
 * in a burst, or to a unit that took off when `src` is a ground enemy or a hostile device (起飞, 阻挡-2; judged once,
 * before `elementHit`); otherwise the `elementHit` event (钩子-3: its handlers may change the amount or its multiplier, or cancel
 * it), then the element's value drops by what the unit takes, and at 0 the burst begins — the burst of `src`, the unit
 * that dealt it (元素-4). Returns the amount taken.
 * @param {World} w @param {Unit} u @param {Element} el @param {number} amount @param {Unit | null} [src]
 */
export function dealEp(w, u, el, amount, src = null) {
  if (!(amount > 0) || unaffected(u) || liftoffRefused(src, u)) return 0;
  const dmg = emit(w, 'elementHit', { source: src, target: u, dmg: { type: 'element', element: el, amount, mul: 1, cancel: false } }).dmg;
  if (dmg.cancel || unaffected(u) || !(dmg.amount * dmg.mul > 0)) return 0;
  const taken = epTaken(dmg.amount * dmg.mul, statsOf(u), el), left = epOf(u, el) - taken;
  u.ep[el] = Math.max(0, left);
  if (left <= 0) burst(w, u, el, src);
  return taken;
}

/**
 * Restores element values (职业-12): each one below the maximum rises by the amount, up to it; nothing for a unit at 0
 * HP or in a burst (元素-3).
 * @param {Unit} u @param {number} amount
 */
export function restoreEp(u, amount) {
  if (u.hp <= 0 || !(amount > 0) || bursting(u)) return;
  const max = statsOf(u).maxEp;
  for (const el of ELEMENTS) {
    if (!Object.hasOwn(u.ep, el)) continue;
    const v = u.ep[el] + amount;
    if (v >= max) delete u.ep[el];
    else u.ep[el] = v;
  }
}

/**
 * Every unit's 元素回复 this frame (元素-2, 职业-29): one on the field with HP restores its element values (restoreEp) by
 * its 元素回复速度 — `epRegen` and `epRegenRatio` × its maximum HP, summed — ÷ 30.
 * @param {World} w
 */
export function epRegenAll(w) {
  for (const u of w.units) {
    if (u.hp <= 0 || Object.keys(u.ep).length === 0) continue;
    const s = statsOf(u), per = (s.sum.epRegen ?? 0) + (s.sum.epRegenRatio ?? 0) * s.maxHp;
    if (per > 0) restoreEp(u, per / FPS);
  }
}

/**
 * Burst damage (元素-4): 无来源, credited to the burst's source (伤害-7 `sourceless`), cannot be dodged.
 * @param {World} w @param {Unit} u @param {import('./types.js').DamageType} type @param {number} amount @param {Unit | null} src
 */
const burstHit = (w, u, type, amount, src) => { dealDamage(w, src, u, { type, amount, canDodge: false, sourceless: true }); };

/** The source of a burst buff while it is on the field, or null. @param {World} w @param {Buff} b */
const sourceOf = (w, b) => (b.src >= 0 ? w.units.find((x) => x.id === b.src) ?? null : null);

/** A permanent, endlessly stacking cut of DEF (侵蚀, 元素-4). @param {Unit} u @param {number} by */
const erode = (u, by) => { addBuff(u, makeBuff({ key: 'erosion', rule: 'stack', maxStacks: Number.MAX_SAFE_INTEGER, mods: { defFlat: by } })); };

/**
 * One side of an element's burst (元素-4): how long it lasts, what its buff carries for as long, whether that buff
 * triggers each second, and what happens at once (the damage last).
 * @typedef {{ secs: number, mods: Record<string, number>, ticks: boolean, start: (w: World, u: Unit, frames: number, src: Unit | null) => void }} BurstSide
 */

/** @param {Partial<BurstSide> & { secs: number }} o @returns {BurstSide} */
const side = (o) => ({ mods: {}, ticks: false, start: () => {}, ...o });

/** Each element's burst: on a character, on any other unit (元素-4). @type {Readonly<Record<Element, readonly [BurstSide, BurstSide]>>} */
const BURSTS = Object.freeze({
  SANITY: [
    side({ secs: 10, start: (w, u, frames, src) => { inflict(w, u, 'stun', { frames, src }); burstHit(w, u, 'true', 1000, src); } }),
    side({ secs: 10, start: (w, u, _frames, src) => {
      if (!(u.base.immune ?? []).includes('palsy')) for (let i = 0; i < 3; i++) inflict(w, u, 'palsy', { src });
      burstHit(w, u, 'elemental', 6000, src);
    } }),
  ],
  WATER: [
    side({ secs: 10, start: (w, u, _frames, src) => { erode(u, -100); burstHit(w, u, 'phys', 800, src); } }),
    side({ secs: 8, start: (w, u, _frames, src) => { erode(u, -120); burstHit(w, u, 'elemental', 5000, src); } }),
  ],
  FIRE: [
    side({ secs: 10, mods: { resFlat: -20 }, start: (w, u, _frames, src) => burstHit(w, u, 'arts', 1200, src) }),
    side({ secs: 10, mods: { resFlat: -20 }, start: (w, u, _frames, src) => burstHit(w, u, 'elemental', 7000, src) }),
  ],
  DARK: [
    side({ secs: 15, ticks: true, start: (w, u, frames, src) => { inflict(w, u, 'noSp', { frames, src }); inflict(w, u, 'mute', { frames, src }); } }),
    side({ secs: 15, ticks: true, start: (w, u, frames, src) => { inflict(w, u, 'weaken', { frames, value: 0.5, tag: burstKey('DARK'), src }); } }),
  ],
  ANGER: [side({ secs: 15, ticks: true, mods: { aspd: 50 } }), side({ secs: 15 })],
});

/**
 * The burst (元素-3, 元素-4): the `elementBurst` event (钩子-3; a unit it leaves at 0 HP, or in another burst, has its
 * values back at their maximum and nothing more), then a burst buff that locks the element values for the burst's time
 * and carries what lasts as long — with the burst's source, the unit whose 元素损伤 set it off —, then the effects that
 * come at once, then the `burstStart` event (钩子-3: the talents that answer a burst, 职业-29).
 * @param {World} w @param {Unit} u @param {Element} el @param {Unit | null} src
 */
function burst(w, u, el, src) {
  beginning.add(u);
  try { emit(w, 'elementBurst', { source: src, target: u, element: el }); } finally { beginning.delete(u); }
  if (u.hp <= 0 || bursting(u)) { u.ep = {}; return; }
  const s = BURSTS[el][character(u) ? 0 : 1], frames = secondsToFrames(s.secs);
  addBuff(u, makeBuff({ key: burstKey(el), src: src ? src.id : -1, left: frames, value: frames, every: s.ticks ? FPS : 0, fixed: true, mods: s.mods }));
  w.events.push({ type: 'burst', id: u.id, el: ELEMENTS.indexOf(el) + 1 });
  s.start(w, u, frames, src);
  emit(w, 'burstStart', { source: src, target: u, element: el });
}

/**
 * Each second of a 凋亡 burst (元素-4): a character loses 1 SP and takes 100 arts damage; another unit takes 800
 * elemental damage and its 虚弱 drops to 50% × the time left ÷ the burst's time.
 * @type {import('./buffs.js').Behavior}
 */
const darkTick = {
  tick(w, u, b) {
    if (character(u)) {
      if (u.skill) loseSp(u.skill, 1);
      burstHit(w, u, 'arts', 100, sourceOf(w, b));
      return;
    }
    burstHit(w, u, 'elemental', 800, sourceOf(w, b));
    const weak = u.buffs.find((x) => x.key === 'weaken' && x.tag === b.key);
    if (!weak) return;
    const v = (0.5 * Math.max(0, b.left - 1)) / b.value;
    retune(u, weak, v, { atkMul: 1 - v });
  },
};

/** Each second of a 狂躁 burst on a character (元素-4): true damage by the attacks it made since the burst began. @type {import('./buffs.js').Behavior} */
const angerTick = {
  tick(w, u, b) { burstHit(w, u, 'true', rampageDamage(b.n), sourceOf(w, b)); },
};

/** A burst's end (元素-3): every element value back at its maximum. @type {import('./buffs.js').Behavior} */
const burstEnd = {
  expire(_w, u) { u.ep = {}; },
};

/** The behaviours of the burst buffs, by key. @type {Readonly<Record<string, import('./buffs.js').Behavior>>} */
export const BURST_BEHAVIORS = Object.freeze(Object.fromEntries(ELEMENTS.map((el) => [burstKey(el), {
  ...(el === 'DARK' ? darkTick : el === 'ANGER' ? angerTick : {}), ...burstEnd,
}])));

/** An attack a unit makes during a 狂躁 burst raises its damage (元素-4). @param {Unit} u */
export function rampageAttack(u) {
  const b = u.buffs.find((x) => x.key === burstKey('ANGER'));
  if (b) count(b, 1);
}
