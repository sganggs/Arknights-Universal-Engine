// What a skill's description does besides what 技能-9 and 技能-14 read (docs/spec/skills.md 技能-15): no new attacks while
// it runs (or for its first seconds, or for some seconds after it ends), cost bit by bit while it runs, HP lost as it
// starts, and statuses — after a hit, for some — on enemies as it starts. A skill id that already has its own behaviour is
// left alone (技能-6), as for 技能-14: doing it again would stack.
import { decimalOf, secondsToFrames } from '@aue/math';
import { statsOf } from './attrs.js';
import { addBuff, count, makeBuff, removeBuff } from './buffs.js';
import { targetsOf } from './combat.js';
import { dealDamage } from './damage.js';
import { reachKeys } from './reach.js';
import { inflict } from './status.js';
import { hostile, inKeys } from './targeting.js';
import { creditedDamage, gainCost } from './traits.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {NonNullable<import('./types.js').SkillDef['extra']>} Extra */
/** @typedef {NonNullable<Extra['costGain']>} CostGain */
/** @typedef {NonNullable<Extra['opening']>[number]} Opening */

/** The buffs this clause puts on the operator; nothing else uses these keys, so removing them takes no one else's (技能-15). */
const STOP = 'skillStop', AFTER = 'skillStopAfter', GAIN = 'skillCostGain';

/**
 * What the operator's skill adds by 技能-15, or null: none for a skill id the content runs itself (技能-6).
 * @param {Content} c @param {Unit} op @returns {Extra | null}
 */
function extraOf(c, op) {
  const def = c.operators[op.key]?.skill, own = c.behaviors?.skills;
  return def?.extra && !(own && Object.hasOwn(own, def.id)) ? def.extra : null;
}

/** A buff that holds back new attacks (职业-13: `noAttack`); −1 frames for no end of its own. @param {Unit} op @param {string} key @param {number} frames */
const holdBack = (op, key, frames) => makeBuff({ key, src: op.id, flags: { noAttack: true }, left: frames });

/**
 * The frame, counted from the skill's start, of its k-th cost (技能-15): k × `every` seconds on the decimals the data wrote
 * (数值-1), then 时间-2 — 5 × 0.57 s is 2.85 s, 85.5 → 86 frames, where the float product 2.8499… would make 85.
 * @param {number} every @param {number} k
 */
function stepFrame(every, k) {
  const { mantissa, exponent } = decimalOf(every);
  let num = Number(mantissa) * k, den = 1;
  for (let i = 0; i < exponent; i++) num *= 10;
  for (let i = exponent; i < 0; i++) den *= 10;
  return secondsToFrames(num / den);
}

/**
 * The costs that have come due by now (技能-15): one `cost` for each step whose frame has come, at most `steps` in all;
 * the buff's counter keeps how many were given.
 * @param {World} w @param {Content} c @param {Unit} op @param {CostGain} g
 */
function gainDue(w, c, op, g) {
  const b = op.buffs.find((x) => x.key === GAIN), st = op.skill;
  if (!b || !st) return;
  const since = w.frame - st.at;
  while (b.n < g.steps && stepFrame(g.every, b.n + 1) <= since) {
    count(b, 1);
    gainCost(w, c, op.owner, g.cost);
  }
}

/**
 * The enemies an opening reaches (技能-15), fixed before any of them is hit: hostile only (not a neutral unit, 合作-9), on
 * the field (not disappeared, 路线-4). `blocked`: those the operator blocks; `most`: the first that many its attack would
 * take now (索敌-3); else every one in its attack range now (技能-8), flying ones too.
 * @param {World} w @param {Content} c @param {Unit} op @param {Opening} o @returns {Unit[]}
 */
function foesOf(w, c, op, o) {
  const fits = (/** @type {Unit} */ u) => hostile(u) && u.hp > 0 && !u.hidden;
  if (o.where === 'blocked') return w.units.filter((u) => fits(u) && u.blockedBy === op.id);
  if (o.most) return targetsOf(w, c, op).filter(fits).slice(0, o.most);
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, op);
  return w.units.filter((u) => fits(u) && inKeys(u, keys, grid));
}

/**
 * One opening (技能-15): each enemy takes the hit — the operator's attack × the scale, not an attack —, then the
 * statuses while it still has HP, whether or not the hit was dodged or stopped by 无敌 (as 技能-9's hit statuses).
 * @param {World} w @param {Content} c @param {Unit} op @param {Opening} o
 */
function openOn(w, c, op, o) {
  const amount = o.hit ? statsOf(op).atk * o.hit.scale : 0;
  for (const e of foesOf(w, c, op, o)) {
    if (o.hit) creditedDamage(w, c, op, e, { type: o.hit.type, amount, isAttack: false, isSkill: true });
    if (e.hp > 0) for (const s of o.status) inflict(w, e, s.key, { seconds: s.seconds, src: op });
  }
}

/**
 * The HP a skill costs as it starts (技能-15): 生命流失 (伤害-10) — no barrier, dodge or 无敌 stops it, and it gives no
 * 受击 SP (技能-2) — of the share of the HP the operator has, or of its maximum.
 * @param {World} w @param {Content} c @param {Unit} op @param {NonNullable<Extra['selfLoss']>} l
 */
function loseOwn(w, c, op, l) {
  const amount = (l.ofMax ? statsOf(op).maxHp : op.hp) * l.ratio;
  if (amount > 0) dealDamage(w, op, op, { type: 'true', amount, hpLoss: true }, c);
}

/**
 * As the skill starts (技能-15), after its stat buff (技能-5) and 技能-14's opening: the HP it costs, the hold on new
 * attacks, the cost counter, then what it does to enemies.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function openSkillText2(w, c, op) {
  const x = extraOf(c, op);
  if (!x || op.hp <= 0) return;
  if (x.selfLoss) loseOwn(w, c, op, x.selfLoss);
  if (x.stopAttack) addBuff(op, holdBack(op, STOP, x.stopAttack.seconds ? secondsToFrames(x.stopAttack.seconds) : -1));
  if (x.costGain) {
    removeBuff(op, GAIN);
    addBuff(op, makeBuff({ key: GAIN, src: op.id }));
  }
  for (const o of x.opening ?? []) if (op.hp > 0) openOn(w, c, op, o);
}

/** Each frame of a running skill (技能-15): the costs that came due. @param {World} w @param {Content} c @param {Unit} op */
export function tickSkillText2(w, c, op) {
  const g = extraOf(c, op)?.costGain;
  if (g && op.skill?.active) gainDue(w, c, op, g);
}

/**
 * As the skill ends (技能-15), while it still runs: a skill that ran its time also gives the cost due in its last frame;
 * the hold and the counter go; after-skill seconds without attacks start — not once the operator is down, nor when it
 * ends because the operator leaves the field.
 * @param {World} w @param {Content} c @param {Unit} op @param {string} reason
 */
export function closeSkillText2(w, c, op, reason) {
  const x = extraOf(c, op);
  if (!x) return;
  if (x.costGain && reason === 'duration' && op.hp > 0) gainDue(w, c, op, x.costGain);
  removeBuff(op, GAIN);
  removeBuff(op, STOP);
  if (x.stopAfter && op.hp > 0 && reason !== 'death') addBuff(op, holdBack(op, AFTER, secondsToFrames(x.stopAfter.seconds)));
}
