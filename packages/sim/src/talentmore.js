// More talents in the simulation (docs/spec/traits.md 职业-31): what an operator's deployment does — a random gain,
// buffs for a profession, a stun on its first target and those around, a blast on the tiles around it —, heals for
// enemies falling near it or blocked by it, SP for its damage at a chance, what its heals leave on the one healed, its
// 元素损伤 heal on ground units, the floor of its attacks' damage, the conditions it keeps.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, setLeft, stamp } from './buffs.js';
import { gainSp } from './sp.js';
import { draw } from './rng.js';
import { dealDamage, heal } from './damage.js';
import { inflict } from './status.js';
import { tileOf } from './body.js';
import { tileAt } from './level.js';
import { hostile, stealthed } from './targeting.js';
import { traitOf, traitOfDef } from './traits.js';
import { targetsOf } from './combat.js';
import { rotateOffset } from './dir.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */

/** The friendly units, with HP, on the field (summons too). @param {World} w */
const friends = (w) => w.units.filter((u) => u.kind === KIND.OPERATOR && u.hp > 0);
/** The enemies with HP on the field. @param {World} w */
const foes = (w) => w.units.filter((u) => hostile(u) && u.hp > 0 && !u.hidden);

/**
 * An operator's deployment for these talents (职业-31): one of its `deployPick` gains at random (one draw, 随机-1), its
 * buff `pick` without an end; its `deployBuff` on each operator on the field of the profession — itself too, any
 * player's — for its seconds (buff `deployBuff:<id>`, its time starting again); its `deployStun` on the first target its
 * attack would take and the enemies within `radius` of it, none without a target; its `deployBlast` on the enemies on its
 * tile and the 4 next to it — true damage of `scale` × its attack, again when its seat's operator deployed before it is
 * of the faction `again`, then 晕眩 for `stun` seconds.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function moreDeploy(w, c, op) {
  const t = traitOf(c, op);
  if (t.deployPick.length) addBuff(op, makeBuff({ key: 'pick', src: op.id, mods: { ...t.deployPick[Math.min(t.deployPick.length - 1, Math.floor(draw(w) * t.deployPick.length))] } }));
  if (t.deployBuff) {
    const x = t.deployBuff, key = `deployBuff:${op.id}`, left = secondsToFrames(x.seconds);
    for (const u of friends(w)) {
      if (c.operators[u.key].profession !== x.profession) continue;
      const b = u.buffs.find((y) => y.key === key);
      if (b) setLeft(b, left);
      else addBuff(u, makeBuff({ key, src: op.id, left, mods: { ...x.mods } }));
    }
  }
  if (t.deployStun) deployStun(w, c, op, t.deployStun);
  if (t.deployBlast) deployBlast(w, c, op, t.deployBlast);
}

/** A stun on deployment (职业-31: 灰烬). The locked target is stunned while 隐匿; others are not when it is in effect (索敌-2). 迷彩 is not checked. @param {World} w @param {Content} c @param {Unit} op @param {{ seconds: number, radius: number }} x */
function deployStun(w, c, op, x) {
  const first = targetsOf(w, c, op)[0];
  if (!first) return;
  for (const e of foes(w)) {
    if (e !== first && stealthed(e)) continue;
    const dx = e.x - first.x, dy = e.y - first.y;
    if (dx * dx + dy * dy <= x.radius * x.radius) inflict(w, e, 'stun', { seconds: x.seconds, src: op });
  }
}

/** A blast on deployment (职业-31: 耀骑士临光). 隐匿 in effect is left out, on the operator's tile too (索敌-2). 迷彩 is not checked. @param {World} w @param {Content} c @param {Unit} op @param {{ scale: number, stun: number, again: string }} x */
function deployBlast(w, c, op, x) {
  const [r, col] = tileOf(op), last = w.players[op.owner]?.last, twice = !!last && (c.operators[last]?.powers ?? []).includes(x.again);
  const near = foes(w).filter((e) => {
    if (stealthed(e)) return false;
    const [er, ec] = tileOf(e);
    return Math.abs(er - r) + Math.abs(ec - col) <= 1;
  });
  for (const e of near) {
    for (let k = 0; k < (twice ? 2 : 1); k++) dealDamage(w, op, e, { type: 'true', amount: x.scale * statsOf(op).atk }, c);
    if (e.hp > 0) inflict(w, e, 'stun', { seconds: x.stun, src: op });
  }
}

/**
 * Whether a seat remembers its last operator deployed (职业-31): its deck has one with a `deployBlast` that asks for it.
 * @param {Content} c @param {string[]} deck
 */
export const keepsLast = (c, deck) => deck.some((k) => Object.hasOwn(c.operators, k) && !!traitOfDef(c.operators[k]).deployBlast);

/**
 * An enemy that fell this frame, for these talents (职业-31): each operator on the field with `downHeal` heals itself its
 * `share` of its maximum HP, 禁疗 no matter — `around` when the enemy's tile is its own or one of the 8 around it,
 * `blocked` when it blocked the enemy.
 * @param {World} w @param {Content} c @param {Unit} dead
 */
export function downHeals(w, c, dead) {
  if (dead.kind !== KIND.ENEMY) return;
  const [r, col] = tileOf(dead);
  for (const op of friends(w)) {
    for (const x of traitOf(c, op).downHeal) {
      const [or, oc] = tileOf(op), near = x.where === 'blocked' ? dead.blockedBy === op.id : Math.max(Math.abs(or - r), Math.abs(oc - col)) <= 1;
      if (near) w.events.push({ type: 'heal', id: op.id, target: op.id, amount: heal(w, op, op, x.share * statsOf(op).maxHp, { free: true }) });
    }
  }
}

/**
 * A hit of an operator's that took HP from an enemy, for its talents' SP (职业-31: `dealt`): at each one's chance (one
 * draw), its SP (技能-2).
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function dealtSp(w, c, op) {
  for (const x of traitOf(c, op).talentSp) if (x.on === 'dealt' && op.skill && draw(w) < (x.prob ?? 1)) gainSp(op.skill, x.sp ?? 0);
}

/**
 * What a healer's heal leaves on the one healed (职业-31: `healGives`): its modifiers for its seconds — `aboveSeconds`
 * when the HP before the heal was above `above` of the maximum — as the buff `healGives:<healer id>`, its time set again.
 * @param {Content} c @param {Unit} a @param {Unit} u @param {number} ratio the HP before the heal over the maximum
 */
export function healGives(c, a, u, ratio) {
  const x = traitOf(c, a).healGives;
  if (!x || u.hp <= 0) return;
  const key = `healGives:${a.id}`, left = secondsToFrames(x.above !== undefined && ratio > x.above ? x.aboveSeconds ?? x.seconds : x.seconds), b = u.buffs.find((y) => y.key === key);
  if (b) setLeft(b, left);
  else addBuff(u, makeBuff({ key, src: a.id, left, mods: { ...x.mods } }));
}

/** × a healer's 元素损伤 heal on a unit (职业-31): its `groundEpHeal` on a unit on a 低地 tile. @param {Content} c @param {Unit} a @param {Unit} u */
export function epHealMul(c, a, u) {
  const k = traitOf(c, a).groundEpHeal;
  if (k === 1) return 1;
  const [r, col] = tileOf(u);
  return tileAt(c.level, r, col)?.height === 'LOWLAND' ? k : 1;
}

/** The tiles straight in front of an operator: its own and the two ahead, facing right (职业-31: 酸糖). */
const FRONT_TWO = Object.freeze(/** @type {[number, number][]} */ ([[0, 0], [0, 1], [0, 2]]));

/**
 * The least damage an attack's hit of an operator does after the defences (职业-31: `minDamage`): `scale` × its attack —
 * `front` while the target stands on its tile or the two straight ahead —; 0 without the talent.
 * @param {Content} c @param {Unit} op @param {Unit} target
 */
export function damageFloor(c, op, target) {
  const x = op.kind === KIND.OPERATOR ? traitOf(c, op).minDamage : null;
  if (!x) return 0;
  const [r, col] = tileOf(op), [tr, tc] = tileOf(target);
  const ahead = x.front !== undefined && FRONT_TWO.some(([dr, dc]) => { const [a, b] = rotateOffset(dr, dc, op.dir); return r + a === tr && col + b === tc; });
  return (ahead ? /** @type {number} */ (x.front) : x.scale) * statsOf(op).atk;
}

/** Its skill ended (职业-31): the frame on its `lastSkillEnd` tracker, when it has one. @param {World} w @param {Unit} op */
export function skillEndStamp(w, op) {
  const b = op.buffs.find((y) => y.key === 'lastSkillEnd');
  if (b) stamp(b, w.frame);
}
