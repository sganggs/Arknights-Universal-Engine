// What a skill's description does besides its attacks (docs/spec/skills.md 技能-14): a counter while it runs, a barrier
// gained as it starts, a burst then or at the end, a self-stun at the end, a non-medic healing a friendly unit.
// A skill id that already has its own behaviour is left alone (技能-6): doing it again would stack.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { addBuff, makeBuff, removeBuff, stamp } from './buffs.js';
import { heal, setShield } from './damage.js';
import { dealEp } from './elements.js';
import { reachKeys } from './reach.js';
import { inflict } from './status.js';
import { inKeys, rangeKeys, sortHealTargets } from './targeting.js';
import { creditedDamage } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Buff} Buff */
/** @typedef {import('./types.js').SkillDef} SkillDef */
/** @typedef {NonNullable<SkillDef['extra']>} Extra */
/** @typedef {NonNullable<Extra['counter']>} Counter */
/** @typedef {NonNullable<Extra['barrier']>} Barrier */
/** @typedef {NonNullable<Extra['bursts']>[number]} Burst */
/** @typedef {NonNullable<Extra['allyHeal']>} AllyHeal */

/** Distance squared of 「周围」 when the description gives no tiles (技能-14): 1.5 × 1.5. */
const NEAR = 1.5 * 1.5;

/** @param {Content} c @param {Unit} op @returns {SkillDef | null} */
const defOf = (c, op) => c.operators[op.key]?.skill ?? null;

/** A skill the content already runs itself (技能-6). @param {Content} c @param {string} id */
const owned = (c, id) => !!(c.behaviors?.skills && Object.hasOwn(c.behaviors.skills, id));

/** @param {Content} c */
const gridOf = (c) => ({ rows: c.level.height, cols: c.level.width });

/** Enemies a burst reaches (技能-14): the stored cells, else the attack range now. Flying enemies stay in. @param {World} w @param {Content} c @param {Unit} op @param {Burst} area */
function foesIn(w, c, op, area) {
  const grid = gridOf(c);
  const keys = area.where === 'cells' && area.range ? rangeKeys(grid, op, area.range) : reachKeys(c, op);
  return w.units.filter((u) => u.kind === KIND.ENEMY && u.hp > 0 && inKeys(u, keys, grid));
}

/** One burst (技能-14): each enemy once, the operator's attack × the scale, not itself an attack. @param {World} w @param {Content} c @param {Unit} op @param {Burst} area */
function burstAt(w, c, op, area) {
  const amount = statsOf(op).atk * area.scale;
  for (const e of foesIn(w, c, op, area)) creditedDamage(w, c, op, e, { type: area.type, amount, isAttack: false, isSkill: true });
}

/**
 * The barrier as the skill starts (技能-14), after the skill's own stat buff so the maximum HP already includes it.
 * Decay is linear in the total, every 0.5 s — not a share of what remains.
 * @param {Unit} op @param {Barrier} b
 */
function giveBarrier(op, b) {
  const max = statsOf(op).maxHp;
  const shield = b.cap !== undefined ? Math.min(max * b.ratio, max * b.cap) : max * b.ratio;
  removeBuff(op, 'skillBarrier');
  const decay = b.decay === true && b.seconds > 0;
  addBuff(op, makeBuff({
    key: 'skillBarrier', src: op.id, shield, shieldType: b.type === 'phys' ? 'phys' : '',
    left: b.seconds > 0 ? secondsToFrames(b.seconds) : -1, ...(b.tied ? { tag: 'tied' } : {}),
    ...(decay ? { act: 'skillBarrierDecay', every: secondsToFrames(0.5), fixed: true, value: shield * 0.5 / b.seconds } : {}),
  }));
}

/** The engine's barrier decay (技能-14). `value` is the amount that leaves every 0.5 s. */
export const SKILL_TEXT_BEHAVIORS = Object.freeze({
  skillBarrierDecay: { tick: (/** @type {World} */ _w, /** @type {Unit} */ u, /** @type {Buff} */ b) => { setShield(u, b, b.shield - b.value); } },
});

/** Whether the counter is still waiting out `aoe_cd` (技能-14). @param {Unit} op @param {number} frame @param {number} cd */
function cooling(op, frame, cd) {
  const b = op.buffs.find((x) => x.key === 'counterCd');
  return !!b && frame - b.n < secondsToFrames(cd);
}

/** Starts the counter's cooldown at this frame (技能-14), whether or not anyone was there to hit. @param {World} w @param {Unit} op */
function stampCd(w, op) {
  const b = op.buffs.find((x) => x.key === 'counterCd');
  if (b) stamp(b, w.frame);
  else addBuff(op, makeBuff({ key: 'counterCd', src: op.id, n: w.frame }));
}

/** An enemy inside the counter's 周围 (技能-14). @param {Unit} op @param {Unit} u @param {boolean} ground */
function foeNear(op, u, ground) {
  if (u.kind !== KIND.ENEMY || u.hp <= 0) return false;
  if (ground && statsOf(u).flying) return false;
  const dx = u.x - op.x, dy = u.y - op.y;
  return dx * dx + dy * dy <= NEAR;
}

/** One victim of the counter (技能-14): the damage, then the sentence's 元素损伤 and silence. @param {World} w @param {Content} c @param {Unit} op @param {Unit} e @param {Counter} x */
function strike(w, c, op, e, x) {
  if (e.hp <= 0) return;
  creditedDamage(w, c, op, e, { type: x.type, amount: statsOf(op)[x.stat] * x.scale, isAttack: false, isSkill: true, canDodge: false });
  if (x.element && x.epScale) dealEp(w, e, x.element, statsOf(op).atk * x.epScale, op);
  if (x.silence && e.hp > 0) inflict(w, e, 'silence', { seconds: x.silence, src: op });
}

/** The counter while this skill is up (技能-14), or null. @param {Content} c @param {Unit} op @returns {Counter | null} */
function readyCounter(c, op) {
  const def = defOf(c, op), x = def?.extra?.counter;
  if (!def || !x || !op.skill?.active || op.hp <= 0 || owned(c, def.id)) return null;
  return x;
}

/** Who the counter hits (技能-14): everyone 周围, or the attacker. @param {World} w @param {Unit} op @param {Unit} src @param {Counter} x */
function victims(w, op, src, x) {
  if (x.around) return w.units.filter((u) => foeNear(op, u, x.ground === true));
  return src.hp > 0 ? [src] : [];
}

/**
 * The counter (技能-14), from an enemy's attack landing on the operator. Not an attack of the operator's, so it gives
 * the operator no attack SP and does not answer itself.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit | null} src @param {import('./damage.js').Damage} dmg
 */
export function skillCounter(w, c, op, src, dmg) {
  const x = readyCounter(c, op);
  if (!x || !src || src.kind !== KIND.ENEMY || dmg.isAttack !== true) return;
  if (x.cooldown && cooling(op, w.frame, x.cooldown)) return;
  if (x.cooldown) stampCd(w, op);
  for (const e of victims(w, op, src, x)) strike(w, c, op, e, x);
}

/** A friendly unit another operator may heal (技能-14). Itself is allowed; 禁疗-free and 无法治疗 allies are not. @param {Unit} op @param {Unit} u */
function keptFrom(op, u) {
  if (u === op) return false;
  const f = statsOf(u).flags;
  return f.noAllyHeal === true || f.healFree === true;
}

/** Friendly units on the field this operator may heal (技能-14). @param {World} w @param {Unit} op */
function mates(w, op) {
  return w.units.filter((u) => u.kind === KIND.OPERATOR && u.owner === op.owner && u.hp > 0 && !keptFrom(op, u));
}

/** One ally the sentence allows (技能-14): hurt, not itself when it says 其他, under the HP gate when it writes one. @param {Unit} op @param {Unit} u @param {AllyHeal} h */
function canHeal(op, u, h) {
  if (u.hp >= u.maxHp || (h.others && u === op)) return false;
  return !(h.below && u.hp / u.maxHp >= h.below);
}

/** Allies inside the stored cells, else the attack range (技能-14). @param {World} w @param {Content} c @param {Unit} op @param {AllyHeal} h */
function inArea(w, c, op, h) {
  const grid = gridOf(c);
  const keys = h.range ? rangeKeys(grid, op, h.range) : reachKeys(c, op);
  return mates(w, op).filter((u) => inKeys(u, keys, grid));
}

/** Allies within 1.5 of the operator (技能-14), the single-target fallback. @param {World} w @param {Unit} op */
function closeMates(w, op) {
  return mates(w, op).filter((u) => {
    const dx = u.x - op.x, dy = u.y - op.y;
    return dx * dx + dy * dy <= NEAR;
  });
}

/** Who gets the heal (技能-14): every injured ally, or the most injured one. 「所有」 does not fall back to 1.5. @param {World} w @param {Content} c @param {Unit} op @param {AllyHeal} h */
function pickAllies(w, c, op, h) {
  let pool = inArea(w, c, op, h).filter((u) => canHeal(op, u, h));
  if (!h.all && pool.length === 0) pool = closeMates(w, op).filter((u) => canHeal(op, u, h));
  const sorted = sortHealTargets(pool);
  return h.all ? sorted : sorted.slice(0, 1);
}

/** Heals the allies the sentence names (技能-14). A medic does not, even when the sentence was read. @param {World} w @param {Content} c @param {Unit} op @param {AllyHeal} h */
function healAllies(w, c, op, h) {
  if (c.operators[op.key].profession === 'MEDIC') return;
  const amount = statsOf(op).atk * h.scale;
  for (const u of pickAllies(w, c, op, h)) w.events.push({ type: 'heal', id: op.id, target: u.id, amount: heal(w, op, u, amount) });
}

/** Opening effects (技能-14): the barrier, a start burst, a heal that is not waiting for an attack. @param {World} w @param {Content} c @param {Unit} op */
export function openSkillText(w, c, op) {
  const def = defOf(c, op);
  if (!def || owned(c, def.id) || op.hp <= 0 || !def.extra) return;
  const x = def.extra;
  if (x.barrier) giveBarrier(op, x.barrier);
  for (const b of x.bursts ?? []) if (b.at === 'start') burstAt(w, c, op, b);
  if (x.allyHeal?.on === 'start') healAllies(w, c, op, x.allyHeal);
}

/**
 * The heal that rides on an attack (技能-14). A passive skill's every attack; any other skill, only the attacks the
 * skill makes. The caller checks which.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function healSkillAllies(w, c, op) {
  const def = defOf(c, op), h = def?.extra?.allyHeal;
  if (!def || !h || h.on !== 'attack' || !op.skill?.active || op.hp <= 0 || owned(c, def.id)) return;
  healAllies(w, c, op, h);
}

/**
 * Closing effects (技能-14), while the skill is still up so the end burst still uses its range. Nothing that hits or
 * stuns once the operator is already down, or when the skill is ending because they leave the field.
 * @param {World} w @param {Content} c @param {Unit} op @param {string} reason
 */
export function closeSkillText(w, c, op, reason) {
  const def = defOf(c, op);
  if (!def || owned(c, def.id)) return;
  removeBuff(op, 'counterCd');
  if (op.hp <= 0 || reason === 'death' || !def.extra) return;
  const x = def.extra;
  for (const b of x.bursts ?? []) if (b.at === 'end') burstAt(w, c, op, b);
  if (x.selfStun) inflict(w, op, 'stun', { seconds: x.selfStun.seconds, src: op });
  if (x.barrier?.tied) removeBuff(op, 'skillBarrier');
}
