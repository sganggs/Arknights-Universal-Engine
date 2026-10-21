// Talents on attacks and statuses (docs/spec/traits.md 职业-34): steps for attacking the same target, an attacker
// weakened, steps by kinds of enemies killed and the kinds a card killed, a strike as the skill starts, a chance growing
// with kills near a faction, gains for spending cost, steps for statuses dealt, 脆弱 growing with the time in range,
// steps for a run of hits, blows that leave 重伤 and what 重伤 does, riders at full charge.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune, setLeft, stamp } from './buffs.js';
import { gainSp } from './sp.js';
import { knockDown } from './damage.js';
import { inflict } from './status.js';
import { tileOf } from './body.js';
import { reachKeys } from './reach.js';
import { inKeys, hostile, selectable, stealthed } from './targeting.js';
import { traitOf, creditedDamage, gainCost } from './traits.js';
import { withdraw } from './deck.js';
import { targetsOf } from './combat.js';
import { RIDER } from './talentfoe.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Unit} Unit @typedef {import('./types.js').Content} Content */
/** @typedef {import('./types.js').Buff} Buff */
/** @typedef {{ src: number, value: number, mods: Record<string, number>, flags?: Record<string, boolean> }} Want */

/** A step's modifiers × n: a product's (…Mul) share above 1 × n, the others × n. @param {Record<string, number>} mods @param {number} n */
const stepped = (mods, n) => Object.fromEntries(Object.entries(mods).map(([k, v]) => [k, k.endsWith('Mul') ? 1 + (v - 1) * n : v * n]));

/** Sets a count buff to n steps of these modifiers, added when missing, without an end. @param {Unit} u @param {string} key @param {number} n @param {Record<string, number>} mods */
function steps(u, key, n, mods) {
  const b = u.buffs.find((x) => x.key === key);
  if (!b) addBuff(u, makeBuff({ key, src: u.id, value: n, mods: stepped(mods, n) }));
  else if (b.value !== n) retune(u, b, n, stepped(mods, n));
}

/**
 * An operator's attack starts on a target (职业-34: `sameTarget`): another target than its last loses the steps; then a
 * step more, at most `max` (buff `sameTarget:<target id>`, without an end).
 * @param {Content} c @param {Unit} op @param {Unit | undefined} target
 */
export function sameTargetStep(c, op, target) {
  const x = traitOf(c, op).sameTarget;
  if (!x || !target) return;
  const key = `sameTarget:${target.id}`;
  for (const b of op.buffs.filter((y) => y.key.startsWith('sameTarget:') && y.key !== key)) removeBuff(op, b);
  steps(op, key, Math.min(x.max, (op.buffs.find((y) => y.key === key)?.value ?? 0) + 1), x.mods);
}

/**
 * An enemy's attack hit an operator (职业-34: `attackerMods`): the attacker, when the operator could select it, gets the
 * modifiers for their seconds (buff `attackerMods:<operator id>`, its time starting again).
 * @param {Content} c @param {Unit} op @param {Unit} attacker
 */
export function attackerHit(c, op, attacker) {
  const x = traitOf(c, op).attackerMods;
  if (!x || !hostile(attacker) || attacker.hp <= 0 || !selectable(attacker, { canHitFly: traitOf(c, op).antiAir })) return;
  const key = `attackerMods:${op.id}`, b = attacker.buffs.find((y) => y.key === key), left = secondsToFrames(x.seconds);
  if (b) setLeft(b, left);
  else addBuff(attacker, makeBuff({ key, src: op.id, left, mods: { ...x.mods } }));
}

/**
 * An operator killed an enemy (职业-34): a mark of the enemy's kind and the steps by the kinds it killed since its
 * deployment (`kindStack`: buff `kinds`, at most `max`); the kind in its seat's record for its card (`slainKinds`,
 * kept after it leaves); the SP of a 重伤 enemy for its killer.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target
 */
export function fightKill(w, c, op, target) {
  const t = traitOf(c, op), dying = target.buffs.find((b) => b.key === 'dying');
  if (dying && op.skill) gainSp(op.skill, dying.value);
  if (t.kindStack) {
    if (!op.buffs.some((b) => b.key === `kind:${target.key}`)) addBuff(op, makeBuff({ key: `kind:${target.key}`, src: op.id }));
    steps(op, 'kinds', Math.min(t.kindStack.max, op.buffs.filter((b) => b.key.startsWith('kind:')).length), t.kindStack.mods);
  }
  const p = w.players[op.owner];
  if (t.slainKinds && p) {
    const list = p.slain?.[op.key] ?? [];
    if (!list.includes(target.key)) p.slain = { ...p.slain, [op.key]: [...list, target.key] };
  }
}

/**
 * An operator's skill starts (职业-34): its `skillStrike` on the first target its attack would take — physical damage of
 * `scale` × its attack, then 寒冷 for `cold` seconds —; its `spendBoost` for a skill that spends cost; its first start
 * since its deployment its `powerAttacks` (职业-35: buff `powerAttacks`, its value the attacks left); the ammo it starts
 * with for a chance growing with ammo spent (buff `ammoStart`, 职业-35); its run of hits back at 0.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function fightSkillStart(w, c, op) {
  const t = traitOf(c, op), first = t.skillStrike ? targetsOf(w, c, op)[0] : undefined;
  if (t.skillStrike && first) {
    creditedDamage(w, c, op, first, { type: 'phys', amount: t.skillStrike.scale * statsOf(op).atk });
    if (first.hp > 0) inflict(w, first, 'cold', { seconds: t.skillStrike.cold, src: op });
  }
  if (t.spendBoost && c.operators[op.key].skill?.spend) spendBoost(w, c, op);
  if (t.powerAttacks && !op.buffs.some((b) => b.key === 'powerUsed')) {
    addBuff(op, makeBuff({ key: 'powerUsed', src: op.id }));
    addBuff(op, makeBuff({ key: 'powerAttacks', src: op.id, value: t.powerAttacks.count, mods: { atkScaleMul: t.powerAttacks.scale } }));
  }
  if ((c.operators[op.key].critTalents ?? []).some((k) => k.ammoProb) && op.skill) steps(op, 'ammoStart', op.skill.ammo, {});
  const combo = op.buffs.find((b) => b.key === 'combo');
  if (combo) retune(op, combo, 0, {});
}

/**
 * An operator spent cost — deployed, or started a skill that spends it (职业-34: `spendBoost`): a step more of its
 * modifiers, at most `max` (buff `spendBoost`), and 晕眩 for `stun` seconds on the ground enemies with a tile in its range.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function spendBoost(w, c, op) {
  const x = traitOf(c, op).spendBoost;
  if (!x) return;
  steps(op, 'spendBoost', Math.min(x.max, (op.buffs.find((b) => b.key === 'spendBoost')?.value ?? 0) + 1), x.mods);
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, op);
  for (const e of w.units) if (hostile(e) && e.hp > 0 && !e.hidden && !statsOf(e).flying && inKeys(e, keys, grid)) inflict(w, e, 'stun', { seconds: x.stun, src: op });
}

/**
 * A status about to be dealt (职业-34): its source's stacks on that status (`status`) take a step, unless the target is
 * immune to it. @param {Content} c @param {Unit | null} src @param {Unit} target @param {string} status @param {(c: Content, op: Unit, i: number) => void} step
 */
export function statusSteps(c, src, target, status, step) {
  if (!src || src.kind !== KIND.OPERATOR || !hostile(target) || statsOf(target).flags[`immune:${status}`]) return;
  traitOf(c, src).stacks.forEach((s, i) => { if (s.on === 'status' && s.status === status) step(c, src, i); });
}

/**
 * The 脆弱 of a source growing with the time an enemy stays in its range (职业-34: `stayVuln`): each enemy with a tile in
 * its range is marked as it comes in (buff `stay:<source id>`, gone as it leaves) and takes × `base` — × `max` once it
 * has stayed `after` seconds — as the aura buff `stayVuln:<source id>`.
 * @param {World} w @param {Content} c @param {Unit} src @param {Unit[]} units @param {Map<Unit, Map<string, Want>>} want
 */
export function stayVuln(w, c, src, units, want) {
  const x = traitOf(c, src).stayVuln;
  if (!x) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, src), mark = `stay:${src.id}`;
  for (const u of units) {
    if (!hostile(u)) continue;
    const m = u.buffs.find((b) => b.key === mark);
    if (!inKeys(u, keys, grid)) { if (m) removeBuff(u, m); continue; }
    if (!m) addBuff(u, makeBuff({ key: mark, src: src.id, n: w.frame }));
    const k = m && w.frame - m.n >= secondsToFrames(x.after) ? x.max : x.base;
    want.get(u)?.set(`stayVuln:${src.id}`, { src: src.id, value: k, mods: { dmgTakenMul: k } });
  }
}

/**
 * A hit of an operator's that took HP from an enemy, for a run of hits (职业-34: `combo`): outside its skill, a count —
 * started again after `gap` seconds without one —; at `hits`, a step more of the modifiers (buff `comboStack`, at most
 * `max`) and the count back at 0.
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function comboHit(w, c, op) {
  const x = traitOf(c, op).combo;
  if (!x || (op.skill && op.skill.active)) return;
  let b = op.buffs.find((y) => y.key === 'combo');
  if (!b) { addBuff(op, makeBuff({ key: 'combo', src: op.id, n: w.frame })); b = /** @type {Buff} */ (op.buffs.find((y) => y.key === 'combo')); }
  const count = (w.frame - b.n > secondsToFrames(x.gap) ? 0 : b.value) + 1;
  stamp(b, w.frame);
  if (count < x.hits) { retune(op, b, count, {}); return; }
  retune(op, b, 0, {});
  steps(op, 'comboStack', Math.min(x.max, (op.buffs.find((y) => y.key === 'comboStack')?.value ?? 0) + 1), x.mods);
}

/** At an operator's turn (职业-34): 晕眩, 冻结 or 缴械 set its run of hits back at 0. @param {Unit} op */
export function comboTurn(op) {
  const b = op.buffs.find((y) => y.key === 'combo'), f = statsOf(op).flags;
  if (b && b.value > 0 && (f.stun || f.freeze || f.disarm)) retune(op, b, 0, {});
}

/**
 * The most an operator's hit on an enemy may take (职业-34: `nonLethal`): all but 1 HP — its damage never kills; no cap
 * otherwise. @param {Content} c @param {Unit} src @param {Unit} target @param {number} amount
 */
export function nonLethalCap(c, src, target, amount) {
  return src.kind === KIND.OPERATOR && target.kind === KIND.ENEMY && traitOf(c, src).nonLethal ? Math.min(amount, Math.max(0, target.hp - 1)) : amount;
}

/**
 * After an operator's hit (职业-34: `nonLethal`): an enemy it left at 1 HP or less, not 重伤 yet, takes 重伤 for the
 * talent's seconds, its killer to gain the talent's SP.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} target
 */
export function afterNonLethal(w, c, op, target) {
  const x = op.kind === KIND.OPERATOR ? traitOf(c, op).nonLethal : null;
  if (x && target.kind === KIND.ENEMY && target.hp > 0 && target.hp <= 1 && !statsOf(target).flags.dying) inflict(w, target, 'dying', { seconds: x.seconds, src: op, value: x.sp });
}

/**
 * A rider at full charge (职业-34: `chargedRider`): a hit of an operator's — not a rider — while its charge (职业-12) is
 * at its steps deals the target physical damage of the share × its attack, a rider.
 * @param {World} w @param {Content} c @param {Unit} op @param {Unit} t
 */
export function chargedRider(w, c, op, t) {
  const tr = traitOf(c, op), b = op.buffs.find((y) => y.key === 'charge');
  if (tr.chargedRider > 0 && tr.charge && b && b.value >= tr.charge.steps && t.hp > 0) creditedDamage(w, c, op, t, { type: 'phys', amount: tr.chargedRider * statsOf(op).atk, tags: [RIDER] });
}

/**
 * A chance talent's 倍率 now (攻击-4, 职业-34): its `scale`, more by `grow.step` for each enemy that fell near an operator
 * of the faction while its holder was on the field (buff `critGrow`), at most `grow.max`.
 * @param {Unit} op @param {import('./types.js').CritTalent} k
 */
export const critScale = (op, k) => (k.grow ? Math.min(k.grow.max, k.scale + k.grow.step * (op.buffs.find((b) => b.key === 'critGrow')?.value ?? 0)) : k.scale);

/**
 * An enemy fell (职业-34): each operator on the field with a growing chance talent counts one more when the enemy's tile is
 * an operator's of the faction or one of the 4 next to it.
 * @param {World} w @param {Content} c @param {Unit} dead
 */
export function critGrowth(w, c, dead) {
  if (dead.kind !== KIND.ENEMY) return;
  const [r, col] = tileOf(dead);
  for (const op of w.units) {
    const g = op.kind === KIND.OPERATOR && op.hp > 0 ? (c.operators[op.key].critTalents ?? []).find((k) => k.grow)?.grow : undefined;
    if (!g) continue;
    const near = w.units.some((u) => u.kind === KIND.OPERATOR && u.hp > 0 && (c.operators[u.key].powers ?? []).includes(g.power) && (([ur, uc]) => Math.abs(ur - r) + Math.abs(uc - col) <= 1)(tileOf(u)));
    if (near) steps(op, 'critGrow', (op.buffs.find((b) => b.key === 'critGrow')?.value ?? 0) + 1, {});
  }
}

/**
 * An operator's attack starts (职业-35): one of its `powerAttacks` spent, the buff gone at 0.
 * @param {Unit} op
 */
export function powerAttack(op) {
  const b = op.buffs.find((y) => y.key === 'powerAttacks');
  if (!b) return;
  if (b.value <= 1) removeBuff(op, b);
  else retune(op, b, b.value - 1, b.mods);
}

/**
 * The chance more for ammo spent (攻击-4, 职业-35): `ammoProb` × the ammo its running skill spent since it started.
 * @param {Unit} op @param {import('./types.js').CritTalent} k
 */
export const ammoChance = (op, k) => (k.ammoProb && op.skill?.active ? k.ammoProb * Math.max(0, (op.buffs.find((b) => b.key === 'ammoStart')?.value ?? op.skill.ammo) - op.skill.ammo) : 0);

/**
 * The blasts of a while on the field (职业-35: `timedBlast`), after the operators' turns: an operator `after` seconds
 * from its deployment deals the enemies on its tile and the 8 around it physical damage of `scale` × its attack —
 * not one whose 隐匿 is in effect (索敌-2); 迷彩 is not checked — then 脆弱 of `fragile`, and retreats (撤退-1).
 * @param {World} w @param {Content} c
 */
export function timedBlasts(w, c) {
  for (const op of [...w.units]) {
    const x = op.kind === KIND.OPERATOR && op.hp > 0 ? traitOf(c, op).timedBlast : null;
    if (!x || w.frame - op.born !== secondsToFrames(x.after)) continue;
    const [r, col] = tileOf(op);
    for (const e of w.units.filter((u) => hostile(u) && u.hp > 0 && !u.hidden && !stealthed(u) && (([er, ec]) => Math.max(Math.abs(er - r), Math.abs(ec - col)) <= 1)(tileOf(u)))) {
      creditedDamage(w, c, op, e, { type: 'phys', amount: x.scale * statsOf(op).atk });
      if (e.hp > 0) inflict(w, e, 'fragile', { seconds: x.fragile.seconds, value: x.fragile.value, src: op });
    }
    if (w.units.includes(op)) withdraw(w, c, op);
  }
}

/**
 * At an operator's turn (职业-35: `firstBlock`): the first enemy it blocks in its deployment — the one of the lowest id —
 * gives its seat `cost` and sleeps for `sleep` seconds (状态-5), once (buff `firstBlock`).
 * @param {World} w @param {Content} c @param {Unit} op
 */
export function firstBlockTurn(w, c, op) {
  const x = traitOf(c, op).firstBlock;
  if (!x || op.buffs.some((b) => b.key === 'firstBlock')) return;
  const e = w.units.filter((u) => u.blockedBy === op.id && u.hp > 0).sort((a, b) => a.id - b.id)[0];
  if (!e) return;
  addBuff(op, makeBuff({ key: 'firstBlock', src: op.id }));
  gainCost(w, c, op.owner, x.cost);
  inflict(w, e, 'sleep', { seconds: x.sleep, src: op });
}

/** An operator with `firstBlock` leaves the field (职业-35): the sleep it gave goes. @param {World} w @param {Content} c @param {Unit} op */
export function firstBlockLeave(w, c, op) {
  if (!traitOf(c, op).firstBlock) return;
  for (const u of w.units) for (const b of u.buffs.filter((y) => y.key === 'sleep' && y.src === op.id)) removeBuff(u, b);
}

/** The engine's behaviour of 重伤 (职业-34): as it ends, its unit falls — no source, 不死 no matter. */
export const FIGHT_BEHAVIORS = Object.freeze({
  dying: { expire: (/** @type {World} */ _w, /** @type {Unit} */ u) => knockDown(u) },
});
