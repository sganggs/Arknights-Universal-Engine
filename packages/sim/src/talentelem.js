// Talents on elements (docs/spec/traits.md 职业-29): what answers an enemy's burst as it begins — elemental damage, a
// heal, a step —, elemental damage while a burst lasts and 元素损伤 over time from a hit, the pulses each second on the
// enemies in range or blocked, elemental damage when 麻痹 cuts an enemy's attack, element values restored on hits, and
// the heals over time a heal leaves.
import { FPS, secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff, setLeft, retune, setStacks, count } from './buffs.js';
import { dealDamage, heal } from './damage.js';
import { dealEp, restoreEp } from './elements.js';
import { inflict } from './status.js';
import { on } from './bus.js';
import { reachKeys } from './reach.js';
import { inKeys, hostile, selectable } from './targeting.js';
import { traitOf, creditedDamage } from './traits.js';
import { burstStep } from './talentfx.js';
import { RIDER } from './talentfoe.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').Buff} Buff @typedef {import('./elements.js').Element} Element */

/** The owner of the engine's hooks for these talents (ADR 0057). */
const OWNER = 'talents:elements';

/** Whether a unit has a tile in an operator's attack range (攻击-1), whatever it is. @param {Content} c @param {Unit} op @param {Unit} u */
const inRange = (c, op, u) => inKeys(u, reachKeys(c, op), { rows: c.level.height, cols: c.level.width });

/** The operators on the field with HP. @param {World} w */
const fielded = (w) => w.units.filter((u) => u.kind === KIND.OPERATOR && u.hp > 0 && !u.hidden);

/**
 * The hooks of these talents (职业-29), when the world has none yet — hooks are no state (ADR 0057), so a world
 * restored from a snapshot gets them again at its next frame: `burstStart` answered (burstTalents).
 * @param {World} w @param {Content} c
 */
export function elementHooks(w, c) {
  if (w.bus?.hooks.get('burstStart')?.some((h) => h.owner === OWNER)) return;
  on(w, 'burstStart', (ctx) => burstTalents(w, c, ctx.target, ctx.element), { owner: OWNER });
}

/**
 * An enemy's burst has begun (职业-29): for each operator on the field in order, each of its `burstOn` of the element —
 * on the field, or the enemy with a tile in its attack range — deals the enemy elemental damage of `dmg` × its attack (a
 * rider's) and heals it `heal` × its maximum HP (even under 禁疗); then its steps of the element's bursts in its range
 * (talentfx burstStep).
 * @param {World} w @param {Content} c @param {Unit} u @param {Element} el
 */
export function burstTalents(w, c, u, el) {
  if (!hostile(u)) return;
  for (const op of fielded(w)) {
    const t = traitOf(c, op), near = inRange(c, op, u);
    for (const b of t.burstOn) {
      if (b.el !== el || (b.where === 'range' && !near)) continue;
      if (b.dmg && u.hp > 0) creditedDamage(w, c, op, u, { type: 'elemental', amount: statsOf(op).atk * b.dmg, tags: [RIDER] });
      if (b.heal) {
        const n = heal(w, op, op, b.heal * statsOf(op).maxHp, { free: true });
        if (n > 0) w.events.push({ type: 'heal', id: op.id, target: op.id, amount: n });
      }
    }
    if (near) burstStep(c, op, el);
  }
}

/**
 * Elemental damage while a burst lasts (职业-29: 妮芙), from a hit: the target's buff `burstDot:<operator id>` (act
 * `burstDot`, its element as its tag), each second elemental damage of its value × the operator's attack; the higher
 * value of the two when it is there already.
 * @param {Unit} op @param {Unit} t @param {{ el: string, scale: number }} d
 */
export function burstDotOn(op, t, d) {
  const key = `burstDot:${op.id}`, b = t.buffs.find((x) => x.key === key);
  if (b) { if (d.scale > b.value) retune(t, b, d.scale, {}); return; }
  addBuff(t, makeBuff({ key, act: 'burstDot', src: op.id, value: d.scale, tag: d.el, every: FPS, fixed: true }));
}

/**
 * 元素损伤 over time from a hit (职业-29: 波卜): at once, then each second for `seconds`, 元素损伤 of the element of
 * `scale` × the operator's attack (buff `epDot:<operator id>`, act `epDot`, the time starting again).
 * @param {World} w @param {Unit} op @param {Unit} t @param {{ el: string, scale: number, seconds: number }} d
 */
export function epDotOn(w, op, t, d) {
  dealEp(w, t, /** @type {Element} */ (d.el), statsOf(op).atk * d.scale, op);
  const key = `epDot:${op.id}`, b = t.buffs.find((x) => x.key === key), left = secondsToFrames(d.seconds) + 1;
  if (b) { setLeft(b, left); return; }
  addBuff(t, makeBuff({ key, act: 'epDot', src: op.id, value: d.scale, tag: d.el, every: FPS, fixed: true, left }));
}

/**
 * The behaviours of these talents' buffs (职业-29), each needing its operator on the field with HP: `burstDot` deals
 * the target elemental damage while it is in the burst of its element, and goes when it is not; `epDot` deals its
 * 元素损伤; `healDot` heals and restores element values (its value and `n` the heal and the restored amount a layer).
 * @returns {Record<string, import('./buffs.js').Behavior>}
 */
export function elementBehaviors() {
  /** @param {World} w @param {Buff} b */
  const srcOf = (w, b) => w.units.find((x) => x.id === b.src && x.hp > 0) ?? null;
  return {
    burstDot: { tick: (w, u, b) => {
      const op = srcOf(w, b);
      if (!op || !u.buffs.some((x) => x.key === `burst:${b.tag}`)) { removeBuff(u, b); return; }
      dealDamage(w, op, u, { type: 'elemental', amount: statsOf(op).atk * b.value, sourceless: true });
    } },
    epDot: { tick: (w, u, b) => {
      const op = srcOf(w, b);
      if (op) dealEp(w, u, /** @type {Element} */ (b.tag), statsOf(op).atk * b.value, op);
    } },
    healDot: { tick: (w, u, b) => {
      if (statsOf(u).flags.healFree) return;
      const n = heal(w, srcOf(w, b), u, b.value * b.stacks);
      if (n > 0) w.events.push({ type: 'heal', id: b.src, target: u.id, amount: n });
      restoreEp(u, b.n * b.stacks);
    } },
  };
}

/**
 * At the start of an operator's turn (职业-29): each `pulses` every `every` seconds from its deployment, on the enemies
 * it blocks (`blocked`) or those with a tile in its attack range that can be selected (`range`, 迷彩 and flight no
 * matter): 元素损伤 of `ep.scale` × its attack, then arts damage of `arts` × it (sourceless), then the status.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function pulseTurn(w, c, op) {
  const list = traitOf(c, op).pulses, since = w.frame - op.born;
  if (list.length === 0 || since <= 0) return;
  for (const p of list) {
    if (since % secondsToFrames(p.every) !== 0) continue;
    const foes = w.units.filter((u) => hostile(u) && u.hp > 0 && !u.hidden
      && (p.who === 'blocked' ? u.blockedBy === op.id : inRange(c, op, u) && selectable(u, { canHitFly: true, ignoreCamou: true })));
    for (const e of foes) {
      if (p.ep) dealEp(w, e, /** @type {Element} */ (p.ep.el), statsOf(op).atk * p.ep.scale, op);
      if (p.arts && e.hp > 0) dealDamage(w, op, e, { type: 'arts', amount: statsOf(op).atk * p.arts, sourceless: true });
      if (p.status && e.hp > 0) inflict(w, e, /** @type {import('./status.js').StatusKey} */ (p.status.key), { seconds: p.status.seconds, src: op });
    }
  }
}

/**
 * 麻痹 cut an enemy's attack (状态-8, 职业-29): each operator on the field whose attack range has a tile of it deals it
 * elemental damage of `palsyHit` × its attack (a rider's).
 * @param {World} w @param {Content} c @param {Unit} e
 */
export function palsyCut(w, c, e) {
  for (const op of fielded(w)) {
    const k = traitOf(c, op).palsyHit;
    if (k > 0 && e.hp > 0 && inRange(c, op, e)) creditedDamage(w, c, op, e, { type: 'elemental', amount: statsOf(op).atk * k, tags: [RIDER] });
  }
}

/**
 * After an operator's attack reached enemies (职业-29): its element values restored by `epOnHit` for each, at most as
 * many as it blocks (at least 1).
 * @param {Content} c @param {Unit} op @param {number} reached
 */
export function epOnHit(c, op, reached) {
  const k = traitOf(c, op).epOnHit;
  if (k > 0 && reached > 0) restoreEp(op, k * Math.min(reached, Math.max(1, statsOf(op).blockCnt)));
}

/**
 * A heal of an operator's normal attack on a unit (职业-29): its `healDot` — a buff `healDot:<operator id>` (act
 * `healDot`) for `seconds`, each second a heal of `share` × the operator's attack then and its element values restored
 * by that × its trait's `epHeal`, for each layer; one more layer (at most `max`) with the time and the amounts new when
 * it is there already.
 * @param {Content} c @param {Unit} op @param {Unit} u
 */
export function healDotOn(c, op, u) {
  const t = traitOf(c, op), d = t.healDot;
  if (!d || u.hp <= 0) return;
  const key = `healDot:${op.id}`, b = u.buffs.find((x) => x.key === key), amount = statsOf(op).atk * d.share, left = secondsToFrames(d.seconds);
  if (!b) { addBuff(u, makeBuff({ key, act: 'healDot', src: op.id, value: amount, n: amount * t.epHeal, maxStacks: d.max, every: FPS, fixed: true, left })); return; }
  setStacks(u, b, b.stacks + 1);
  retune(u, b, amount, {});
  count(b, amount * t.epHeal - b.n);
  setLeft(b, left);
}
