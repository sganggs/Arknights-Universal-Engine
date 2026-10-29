// A unit's figure over time (docs/spec/render.md 渲染-3, 渲染-4): which side of its model shows and mirrored or not,
// and which clip plays — the deploy clip first, each attack from its start at the pace that lands its OnAttack on the
// hit frame, idle once an attack is over, the die clip after the unit dies; a model with forms (A_…, B_…) takes its next
// form's clips after its first attack.
import * as THREE from 'three';
import { KIND, FORM } from '@aue/schema';
import { createFigure } from './spine.js';
import { formRoles, dollRoles, roleOf, operatorFacing, enemyFacing } from './roles.js';
import { facingStep, flipOf, sideOf, faceTurns } from './facing.js';
import { SKILL_STATE } from '@aue/schema';

/** Simulation frames per second (the engine's 时间-1). */
export const FPS = 30;

/**
 * A unit drawn as a figure: its figures, its roles (of its form) and its forms' roles by side, the side showing and the
 * mirroring, the role playing (and the clip of an attack playing), the frame it began and its pace, the role the view
 * last gave, the x it was last at, and whether it is dying.
 * @typedef {{ group: THREE.Group, sides: Record<string, ReturnType<typeof createFigure>>, roles: Record<string, import('./roles.js').Roles>,
 *   forms: Record<string, import('./roles.js').Roles[]>, dolls: Record<string, ReturnType<typeof dollRoles>>, form: number, side: string, flip: boolean,
 *   role: string, clip: string, since: number, rate: number, view: string, x: number, dying: boolean,
 *   aim: { x: number, y: number, id: number } | null, aimId: number, flipped: boolean,
 *   turn: { since: number, side: 'front' | 'back', flip: boolean } | null }} Figure
 */

/**
 * A figure for a unit from its model's sides (null without a front). An operator starts with its deploy clip when it
 * has one.
 * @param {{ front?: import('./spine.js').SpineModel, back?: import('./spine.js').SpineModel } | undefined} m
 * @param {import('@aue/schema').ViewUnit} u @param {number} frame @returns {Figure | null}
 */
export function newFigure(m, u, frame) {
  if (!m?.front) return null;
  /** @type {Figure} */
  const f = { group: new THREE.Group(), sides: {}, roles: {}, forms: {}, dolls: {}, form: FORM.OWN, side: 'front', flip: false, aimId: 0, turn: null, role: '', clip: '', since: frame, rate: 1, view: 'idle', x: u.x, dying: false, aim: null, flipped: flipOf(u.dir) };
  for (const side of /** @type {const} */ (['front', 'back'])) {
    const model = m[side];
    if (!model) continue;
    f.sides[side] = createFigure(model);
    f.dolls[side] = u.kind === KIND.OPERATOR ? dollRoles(f.sides[side].animations) : null;
    f.forms[side] = formRoles(f.sides[side].animations);
    f.roles[side] = f.dolls[side]?.own ?? f.forms[side][0];
    f.group.add(f.sides[side].object);
  }
  if (u.kind === KIND.OPERATOR && f.roles.front.start) f.role = 'start';
  return f;
}

/** @param {Figure} f @param {string} role @param {number} frame @param {number} rate @param {string} [clip] an attack's clip */
const play = (f, role, frame, rate, clip = '') => { f.role = role; f.since = frame; f.rate = rate; f.clip = clip; };

/**
 * The facing an operator's model takes this frame (渲染-4): from its deploy direction when no attack is playing, otherwise
 * the state machine over the target of the clip — a re-acquired target decides the side, the same target only switches it
 * inside the narrow band.
 * @param {Figure} f @param {import('@aue/schema').ViewUnit} u @param {string} key @returns {{ side: 'front' | 'back', flip: boolean }}
 */
function faced(f, u, key) {
  /** @type {{ side: 'front' | 'back', flip: boolean }} */
  const idle = { side: sideOf(u.dir), flip: flipOf(u.dir) };
  if (f.role !== 'attack') { f.aim = null; f.aimId = 0; return idle; }
  if (!f.aim) return idle;
  if (!faceTurns(key, u.skill === SKILL_STATE.RUNNING)) return idle;
  const next = facingStep({ side: /** @type {'front' | 'back'} */ (f.side), flip: f.flipped }, f.aim.x - u.x, f.aim.y - u.y, f.aim.id !== f.aimId, sideOf(u.dir) === 'back');
  f.aimId = f.aim.id;
  return next;
}

/**
 * A figure following its unit's view (渲染-3, 渲染-4): moving or idle starts that role; a deploy or attack clip plays
 * out unless the unit moves; operators face by their direction, enemies by how they moved.
 * @param {Figure} f @param {import('@aue/schema').ViewUnit} u @param {number} frame @param {string} [key] the
 *   operator's content key, for the per-operator facing table (渲染-4)
 */
export function follow(f, u, frame, key = '') {
  if ((u.form ?? FORM.OWN) !== f.form) switched(f, u.form ?? FORM.OWN, frame);
  const role = roleOf(u.anim), held = f.role === 'start' || f.role === 'attack';
  f.view = role;
  if (role === 'attack' && !held) play(f, 'attack', frame, 1);
  else if (role !== f.role && !(held && role === 'idle')) play(f, role, frame, 1);
  const back = { back: !!f.sides.back, backDies: !!f.roles.back?.die, dying: role === 'die' };
  const facing = u.kind === KIND.OPERATOR ? operatorFacing(faced(f, u, key), back) : { side: 'front', flip: enemyFacing(f.flip, u.x - f.x) };
  // A turn is animated (渲染-4): the model squeezes edge-on and opens again over TURN_FRAMES — 4 frames counted from the
  // game — its skeleton swapping on the narrowest frame. Only a real change of side or mirror starts one.
  if (facing.side !== f.side || facing.flip !== f.flip) {
    f.turn = { since: frame, side: /** @type {'front' | 'back'} */ (f.side), flip: f.flip };
    f.side = facing.side; f.flip = facing.flip;
  }
  f.x = u.x;
}

/**
 * A 傀儡师's form changed (渲染-24): the 替身's roles while it fights and while it switches back, its own the rest of the
 * time; the switch to the 替身 plays its `in` clip once, the switch back its `out` clip, as a deploy clip plays.
 * @param {Figure} f @param {number} form @param {number} frame
 */
function switched(f, form, frame) {
  f.form = form;
  const doll = form === FORM.DOLL || form === FORM.SWITCH_OUT;
  for (const [side, d] of Object.entries(f.dolls)) if (d) f.roles[side] = doll ? d.doll : d.own;
  const d = f.dolls[f.side] ?? f.dolls.front, clip = form === FORM.SWITCH_IN ? d?.doll.in : form === FORM.SWITCH_OUT ? d?.doll.out : null;
  if (clip) play(f, 'start', frame, 1, clip);
}

/**
 * An attack starting (渲染-3): the attack clip from its start, paced so its first OnAttack falls `wind` frames later;
 * at its own pace without a wind-up or an OnAttack. A model in its first form of several takes the next form's clips
 * from then on (the attack itself plays the first form's).
 * @param {Figure} f @param {number} wind @param {number} frame
 */
export function attacked(f, wind, frame) {
  const fig = f.sides[f.side], name = f.roles[f.side].attack, hit = fig.hit(name);
  play(f, 'attack', frame, wind > 0 && hit > 0 ? (hit * FPS) / wind : 1, name);
  for (const [side, forms] of Object.entries(f.forms)) if (forms.length > 1 && f.roles[side] === forms[0]) f.roles[side] = forms[1];
}

/**
 * The unit died (渲染-3): the die clip plays from this frame, on the front when the side showing has none; false when
 * the model has no die clip at all.
 * @param {Figure} f @param {number} frame
 */
export function dies(f, frame) {
  if (!f.roles[f.side].die) f.side = 'front';
  if (!f.roles[f.side].die) return false;
  play(f, 'die', frame, 1);
  f.dying = true;
  return true;
}

/** Whether a dying figure's die clip is over. @param {Figure} f @param {number} frame */
export const deathOver = (f, frame) => (frame - f.since) / FPS >= f.sides[f.side].duration(f.roles[f.side].die ?? '');

/**
 * The clip a figure shows at a (fractional) frame (渲染-3): a deploy or attack clip once, then the view's role (idle
 * after an attack) carrying on from the clip's end; a die clip once, holding its last pose; the others looping.
 * @param {Figure} f @param {number} frame @returns {{ name: string, time: number, loop: boolean }}
 */
export function clipAt(f, frame, side = f.side) {
  const fig = f.sides[side], roles = f.roles[side], t = ((frame - f.since) / FPS) * f.rate;
  const of = (/** @type {string} */ role) => roles[/** @type {'idle'} */ (role)] ?? roles.idle;
  if (f.role === 'start' || f.role === 'attack') {
    const name = f.clip || of(f.role), d = fig.duration(name);
    if (t < d) return { name, time: t, loop: false };
    return { name: of(f.role === 'start' ? f.view : 'idle'), time: t - d, loop: true };
  }
  return { name: of(f.role), time: t, loop: f.role !== 'die' };
}

/**
 * Poses a figure at a frame and turns it to face the camera; only its current side shows.
 * @param {Figure} f @param {number} frame @param {THREE.Camera} camera
 */
export function poseFigure(f, frame, camera) {
  const turn = f.turn, t = turn === null ? 1 : (frame - turn.since) / TURN_FRAMES;
  if (turn !== null && t >= 1) f.turn = null;
  const k = t >= 1 ? 1 : t * t * (3 - 2 * t), swap = t >= 0.5;
  const side = turn !== null && !swap ? turn.side : f.side;
  const flip = turn !== null && !swap ? turn.flip : f.flip;
  for (const [s, x] of Object.entries(f.sides)) x.object.visible = s === side;
  const c = clipAt(f, frame, side);
  f.sides[side].show(c.name, c.time, c.loop, flip);
  // edge-on at the narrowest frame, full width at both ends; the height does not change
  const squeeze = f.turn === null ? 1 : Math.abs(1 - 2 * k);
  f.group.scale.set(squeeze, 1, 1);
  f.group.quaternion.copy(camera.quaternion);
}

/**
 * The frames a turn takes (渲染-4): 4, counted from real gameplay footage at the game's 30 frames per second — 4/30 s.
 */
export const TURN_FRAMES = 4;
