// Which animation a figure plays (docs/spec/render.md 渲染-3, 渲染-4): the animations of a model by role — idle, move,
// attack, die, start — found by their names; what a unit is doing picks the role; its facing picks the model's side
// and whether it is mirrored.
import { ANIM } from '@aue/schema';

/** @typedef {{ idle: string, move: string, attack: string, die: string | null, start: string | null }} Roles */

/** A name ending in _Begin, _Start or _End. @param {string} n */
const isEdge = (n) => /_(begin|start|end)$/i.test(n);

/**
 * The animations of a model by role (渲染-3): exact names first (any case), then the first name in order that looks
 * like the role (an attack is not a die); a role with nothing of its own plays idle (die and start may have none).
 * @param {string[]} names @returns {Roles}
 */
export function animationRoles(names) {
  const find = (/** @type {string} */ n) => names.find((x) => x.toLowerCase() === n.toLowerCase()) ?? null;
  const like = (/** @type {RegExp} */ re, /** @type {(n: string) => boolean} */ ok = () => true) => names.find((n) => re.test(n) && ok(n)) ?? null;
  const plain = (/** @type {string} */ n) => !isEdge(n) && !/down|skill/i.test(n);
  const idle = find('Idle') ?? like(/(^|_)idle/i, plain) ?? find('Default') ?? names[0] ?? '';
  return {
    idle,
    move: find('Move_Loop') ?? find('Move') ?? like(/^move/i, plain) ?? idle,
    attack: find('Attack') ?? find('Attack_Loop') ?? find('Combat') ?? like(/^attack/i, (n) => plain(n) && !/die/i.test(n)) ?? idle,
    die: dieOf(find, like),
    start: find('Start'),
  };
}

/**
 * The animations of a model by role for each of its forms (渲染-3): a model whose animations come in sets named by a
 * letter (A_Idle, A_Attack …, B_Idle …) has one form a letter, in letter order, each found among its own set as above;
 * any other model has one form.
 * @param {string[]} names @returns {Roles[]}
 */
export function formRoles(names) {
  const letters = [...new Set(names.map((n) => /^([A-Z])_/.exec(n)?.[1] ?? ''))].sort();
  if (letters.length < 2 || letters.includes('')) return [animationRoles(names)];
  return letters.map((l) => {
    const r = animationRoles(names.filter((n) => n.startsWith(`${l}_`)).map((n) => n.slice(2)));
    const own = (/** @type {string | null} */ n) => (n ? `${l}_${n}` : n);
    return { idle: own(r.idle) ?? '', move: own(r.move) ?? '', attack: own(r.attack) ?? '', die: own(r.die), start: own(r.start) };
  });
}

/**
 * A 傀儡师's 替身 clips (渲染-24): those named Doll_… (not a skill's), else its first skill's (Doll_Skill_1_…), else those
 * ending in _B; each with its name without that prefix or suffix. Empty for a model with none.
 * @param {string[]} names @returns {Map<string, string>}
 */
function dollSet(names) {
  const plain = names.filter((n) => /^doll_/i.test(n) && !/^doll_skill/i.test(n));
  if (plain.length) return new Map(plain.map((n) => [n.replace(/^doll_/i, ''), n]));
  const first = names.filter((n) => /^doll_skill_1_/i.test(n));
  if (first.length) return new Map(first.map((n) => [n.replace(/^doll_skill_1_/i, ''), n]));
  return new Map(names.filter((n) => /_b$/i.test(n)).map((n) => [n.replace(/_b$/i, ''), n]));
}

/**
 * Roles found among names given without a prefix or suffix (渲染-3), back to their full names.
 * @param {Map<string, string>} named the full name by its bare one @returns {Roles}
 */
function rolesIn(named) {
  const r = animationRoles([...named.keys()]), full = (/** @type {string | null} */ n) => (n ? named.get(n) ?? n : n);
  return { idle: full(r.idle) ?? '', move: full(r.move) ?? '', attack: full(r.attack) ?? '', die: full(r.die), start: full(r.start) };
}

/**
 * A 傀儡师's clips by form (渲染-24), or null for a model with no 替身 clips: the 替身's roles among its own clips
 * (dollSet), `in` the clip of the switch to it (Doll_SwitchIn, its first skill's, Start_B) and `out` the one of the
 * switch back (Doll_SwitchOut, its first skill's, else its own form's start); its own form's roles among the other clips
 * (not a 替身 one), a suffix _A dropped.
 * @param {string[]} names @returns {{ own: Roles, doll: Roles & { in: string | null, out: string | null } } | null}
 */
export function dollRoles(names) {
  const set = dollSet(names);
  if (set.size === 0) return null;
  const doll = new Set(set.values()), rest = names.filter((n) => !doll.has(n) && !/^doll_/i.test(n));
  const own = rolesIn(new Map(rest.map((n) => [n.replace(/_a$/i, ''), n]))), find = (/** @type {RegExp} */ re) => names.find((n) => re.test(n)) ?? null;
  return {
    own,
    doll: { ...rolesIn(set), start: null, in: find(/^doll_switchin$/i) ?? find(/^doll_skill_1_switchin$/i) ?? find(/^start_b$/i),
      out: find(/^doll_switchout$/i) ?? find(/^doll_skill_1_switchout$/i) ?? own.start },
  };
}

/**
 * The die animation: Die, else the first ending in Die that is not an attack, else the first with die in its name.
 * @param {(n: string) => string | null} find @param {(re: RegExp, ok?: (n: string) => boolean) => string | null} like
 */
const dieOf = (find, like) => find('Die') ?? like(/(^|_)die$/i, (n) => !/^attack/i.test(n)) ?? like(/die/i);

/** The role of what a unit is doing (渲染-3). @param {number} anim @returns {'idle' | 'move' | 'attack' | 'die'} */
export const roleOf = (anim) => (anim === ANIM.MOVE ? 'move' : anim === ANIM.ATTACK ? 'attack' : anim === ANIM.DIE ? 'die' : 'idle');

/**
 * The side of the model for an operator whose facing this frame is `facing` (渲染-4): the back when the facing asks for it,
 * the model has one, and it is not dying into a back that has no death animation.
 * @param {{ side: 'front' | 'back', flip: boolean }} facing
 * @param {{ back: boolean, backDies: boolean, dying: boolean }} m
 * @returns {{ side: 'front' | 'back', flip: boolean }}
 */
export const operatorFacing = (facing, m) => ({ side: facing.side === 'back' && m.back && (m.backDies || !m.dying) ? 'back' : 'front', flip: facing.flip });

/**
 * An enemy's mirroring (渲染-4): the simulation's left or right (敌能-90, the render state's `lr`), mirrored when left.
 * @param {number | undefined} lr −1 left, 1 right
 */
export const enemyFacing = (lr) => lr === -1;
