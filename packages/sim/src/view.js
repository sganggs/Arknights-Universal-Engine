// The world as the renderer sees it (schema render state v7), written straight into the array the worker transfers.
import { VIEW_VERSION, VIEW_HEADER, VIEW_PLAYER, VIEW_UNIT, viewLength, SKILL_STATE, STATUS_BIT, KIND } from '@aue/schema';
import { codeOfDir } from './dir.js';
import { currentElement, epOf, ELEMENTS } from './elements.js';
import { statsOf } from './attrs.js';
import { dollPhase } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').SkillState} SkillState @typedef {import('./types.js').Unit} Unit */

/** The layout toView writes, field by field; it must be the schema's. */
const LAYOUT = Object.freeze({
  header: ['version', 'frame', 'units', 'players'], player: ['life', 'cost'],
  unit: ['id', 'kind', 'owner', 'x', 'y', 'z', 'dir', 'hp', 'maxHp', 'anim', 'sp', 'spCost', 'skill', 'skillLeft', 'status', 'element', 'ep', 'burst', 'form', 'lr'],
});
if (LAYOUT.header.join() !== VIEW_HEADER.join() || LAYOUT.player.join() !== VIEW_PLAYER.join() || LAYOUT.unit.join() !== VIEW_UNIT.join()) {
  throw new Error(`toView writes render state v${VIEW_VERSION} in an older layout: update sim/src/view.js with the schema`);
}

/**
 * A skill's state for the view: none, gathering SP, ready (holds its SP cost, and the deployment cost it takes while the
 * owner has less: 技能-10), running (技能-2…技能-4).
 * @param {SkillState | null} st @param {number} cost the owner's deployment cost
 */
const skillState = (st, cost) => (!st ? SKILL_STATE.NONE : st.active ? SKILL_STATE.RUNNING : st.sp >= st.cost && !((st.spend ?? 0) > cost) ? SKILL_STATE.READY : SKILL_STATE.CHARGING);

/** Whether a unit has no element value recorded: every value at its maximum (元素-1). @param {Unit} u */
function allFull(u) {
  for (const k in u.ep) if (Object.hasOwn(u.ep, k)) return false;
  return true;
}

/**
 * Writes a unit's element for the view (元素-3, 元素-5) at `i`: during a burst its element and the share of the burst
 * gone by; else its 当前损伤元素 and that value's share of the maximum; none (and a full share) when every value is full.
 * @param {Float64Array | number[]} a @param {number} i @param {Unit} u
 */
function writeElement(a, i, u) {
  const b = u.buffs.find((x) => x.key.startsWith('burst:'));
  if (b) {
    a[i] = ELEMENTS.indexOf(/** @type {any} */ (b.key.slice(6))) + 1; a[i + 1] = b.value > 0 ? Math.min(1, Math.max(0, 1 - b.left / b.value)) : 1; a[i + 2] = 1;
    return;
  }
  const el = allFull(u) ? null : currentElement(u);
  if (el) { a[i] = ELEMENTS.indexOf(el) + 1; a[i + 1] = epOf(u, el) / statsOf(u).maxEp; a[i + 2] = 0; }
  else { a[i] = 0; a[i + 1] = 1; a[i + 2] = 0; }
}

/**
 * A unit's element for the view, as writeElement writes it.
 * @param {Unit} u @returns {{ element: number, ep: number, burst: number }}
 */
export function elementOf(u) {
  const a = [0, 0, 0];
  writeElement(a, 0, u);
  return { element: a[0], ep: a[1], burst: a[2] };
}

/** The view's status bit of each status buff (状态-5); the others show nothing. */
const SHOWN = Object.freeze({
  stun: STATUS_BIT.stun, freeze: STATUS_BIT.freeze, enemyFreeze: STATUS_BIT.freeze, sleep: STATUS_BIT.sleep, cold: STATUS_BIT.cold, enemyCold: STATUS_BIT.cold,
  silence: STATUS_BIT.silence, sluggish: STATUS_BIT.sluggish, fragile: STATUS_BIT.fragile, artsFragile: STATUS_BIT.fragile, elemFragile: STATUS_BIT.fragile,
  weaken: STATUS_BIT.weaken, fear: STATUS_BIT.fear, levitate: STATUS_BIT.levitate, root: STATUS_BIT.root, invincible: STATUS_BIT.invincible,
});

/** The statuses a unit has, as the view's or-ed bits. @param {Unit} u */
export function statusBits(u) {
  let bits = 0;
  for (const b of u.buffs) bits |= Object.hasOwn(SHOWN, b.key) ? /** @type {Record<string, number>} */ (SHOWN)[b.key] : 0;
  return bits;
}

/**
 * Writes one unit's fields (schema VIEW_UNIT) at `i`; returns the index after them.
 * @param {Float64Array} a @param {number} i @param {Unit} u @param {number} cost its owner's deployment cost
 */
function writeUnit(a, i, u, cost) {
  const st = u.skill;
  a[i] = u.id; a[i + 1] = u.kind; a[i + 2] = u.owner; a[i + 3] = u.x; a[i + 4] = u.y; a[i + 5] = u.z; a[i + 6] = codeOfDir(u.dir);
  a[i + 7] = u.hp; a[i + 8] = u.maxHp; a[i + 9] = u.anim;
  a[i + 10] = st ? st.sp : -1; a[i + 11] = st ? st.cost : 0; a[i + 12] = skillState(st, cost); a[i + 13] = st && st.active ? st.dur : -1;
  a[i + 14] = statusBits(u);
  writeElement(a, i + 15, u);
  a[i + 18] = dollPhase(u);
  a[i + 19] = u.kind === KIND.ENEMY ? (u.lr === -1 ? -1 : 1) : 0;
  return i + 20;
}

/**
 * Writes the render state of the world (into `out` when it is long enough): the units not hidden (渲染-1: a passenger
 * aboard, an enemy between a route's DISAPPEAR and APPEAR, a caught ball are not drawn) — a 守门位 is drawn as its
 * tile's mark, not as a unit (渲染-26).
 * @param {World} w @param {Float64Array} [out] @returns {Float64Array}
 */
export function toView(w, out) {
  const shown = w.units.filter((u) => !u.hidden && !u.spot);
  const n = viewLength(shown.length, w.players.length), a = out && out.length >= n ? out : new Float64Array(n);
  a[0] = VIEW_VERSION; a[1] = w.frame; a[2] = shown.length; a[3] = w.players.length;
  let i = 4;
  for (const p of w.players) { a[i] = p.life; a[i + 1] = p.cost; i += 2; }
  for (const u of shown) i = writeUnit(a, i, u, w.players[u.owner]?.cost ?? 0);
  return a;
}
