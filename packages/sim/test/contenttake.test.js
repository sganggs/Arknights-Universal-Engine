// The engine's own damage meets the content's 伤判 behaviours (docs/spec/damage.md 伤害-8): a burst's damage at once and
// each second (元素-4), the talents' extra and periodic damage (职业-25, 职业-28, 职业-29), bleed (敌能-46), the 元素损伤
// of every caller carrying the content to the burst it sets off, and a buff's trigger getting the content (状态-4). A
// test-only buff behaviour `probe` notes what reaches it and keeps KEEP of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { addBuff, makeBuff, removeBuff, tickUnitBuffs } from '../src/buffs.js';
import { dealEp, dealEpFrom } from '../src/elements.js';
import { creditedDamage, actorContext, traitHit } from '../src/traits.js';
import { giveBleed } from '../src/blight.js';
import { skillCounter } from '../src/skilltext.js';
import { forceSp } from '../src/sp.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */
/** @typedef {{ id: number, amount: number, type: string, src: number, credit: number }} Seen */

/** What the probe keeps of the damage that reaches it. */
const KEEP = 0.25;

/**
 * The tiny level without spawns; the content's buff behaviour `probe` (its take notes each hit and keeps KEEP); the guard
 * (攻击力 50, 防御 100, a million HP; its tile and two ahead) with these record fields, deployed at (1, 1) facing right at
 * frame 0. `foe` adds a rooted enemy (a million HP, 防御 and 法术抗性 0) that carries the probe; `probe` gives one to a unit.
 * @param {Record<string, any>} [rec] @param {(c: any) => void} [prep]
 */
function arena(rec = {}, prep) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  Object.assign(c.operators.guard, { maxHp: 1e6, range: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], ...rec });
  /** @type {Seen[]} */
  const seen = [];
  /** @type {NonNullable<import('../src/buffs.js').Behavior['take']>} */
  const take = (_w, u, _b, amount, hit) => {
    seen.push({ id: u.id, amount, type: hit.dmg.type ?? '', src: hit.src ? hit.src.id : -1, credit: hit.credit ? hit.credit.id : -1 });
    return amount * KEEP;
  };
  c.behaviors = { buffs: { probe: { take } } };
  prep?.(c);
  const w = createWorld(c, { seed: 1, players: 2 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  /** @param {Unit} u */
  const probe = (u) => { addBuff(u, makeBuff({ key: 'probe', act: 'probe' })); return u; };
  /** @param {number} row @param {number} col */
  const foe = (row, col) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, maxHp: 1e6, def: 0, res: 0 };
    e.maxHp = statsOf(e).maxHp;
    e.hp = e.maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return probe(e);
  };
  /** @param {number} n */
  const frames = (n) => { for (let i = 0; i < n; i++) step(w, c, []); };
  /** What the probe saw on a unit: [amount, type] each. @param {Unit} u */
  const on = (u) => seen.filter((s) => s.id === u.id).map((s) => [s.amount, s.type]);
  /** Whom each hit the probe saw on a unit is credited to (−1: none). @param {Unit} u */
  const by = (u) => seen.filter((s) => s.id === u.id).map((s) => s.credit);
  return { w, c, op, seen, probe, foe, frames, on, by };
}

/** The HP a unit lost while `f` ran. @param {Unit} u @param {() => void} f */
const lost = (u, f) => { const hp = u.hp; f(); return hp - u.hp; };

test('[伤害-8] [元素-4] a burst\'s damage at once meets the content\'s take, on an enemy and on a character; without the content it does not', () => {
  const { w, c, op, seen, probe, foe, on, by } = arena();
  const [fire, sanity, water, bare] = [foe(1, 3), foe(1, 3), foe(1, 3), foe(1, 3)];
  assert.equal(lost(fire, () => dealEpFrom(w, fire, 'FIRE', 1000, { src: op, c })), 7000 * KEEP);
  assert.equal(lost(sanity, () => dealEpFrom(w, sanity, 'SANITY', 1000, { src: op, c })), 6000 * KEEP);
  assert.equal(lost(water, () => dealEpFrom(w, water, 'WATER', 1000, { src: null, c })), 5000 * KEEP);
  assert.deepEqual([on(fire), on(sanity), on(water)], [[[7000, 'elemental']], [[6000, 'elemental']], [[5000, 'elemental']]]);
  assert.deepEqual(seen.slice(0, 2).map((s) => [s.src, s.credit]), [[-1, op.id], [-1, op.id]], 'sourceless, credited to the burst\'s source');
  assert.equal(lost(bare, () => dealEp(w, bare, 'FIRE', 1000, op)), 7000, 'no content: the take never runs');
  assert.deepEqual(on(bare), []);
  probe(op);
  assert.equal(lost(op, () => dealEpFrom(w, op, 'SANITY', 1000, { src: fire, c })), 1000 * KEEP, 'a character: 1000 true');
  assert.deepEqual([on(op), by(op)], [[[1000, 'true']], [fire.id]], 'credited to the enemy whose 元素损伤 set it off');
});

test('[伤害-8] [元素-4] the take sees a burst\'s damage as an attack\'s: after a higher-priority barrier, what it left; a take that cancels ends the step', () => {
  const { w, c, op, seen, foe, on } = arena({}, (k) => { k.behaviors.buffs.eat = { take: () => 0 }; });
  const [burst, hit] = [foe(2, 4), foe(2, 4)];
  for (const e of [burst, hit]) addBuff(e, makeBuff({ key: 'wall', shield: 2500, prio: 1 }));
  assert.equal(lost(burst, () => dealEpFrom(w, burst, 'FIRE', 1000, { src: op, c })), (7000 - 2500) * KEEP);
  assert.equal(lost(hit, () => creditedDamage(w, c, op, hit, { type: 'elemental', amount: 7000, isAttack: true })), (7000 - 2500) * KEEP);
  assert.deepEqual([on(burst), on(hit)], [[[4500, 'elemental']], [[4500, 'elemental']]], 'the same order and amount');
  const fed = foe(2, 4);
  fed.buffs.unshift(makeBuff({ key: 'eat', act: 'eat' }));
  const before = seen.length;
  assert.equal(lost(fed, () => dealEpFrom(w, fed, 'FIRE', 1000, { src: op, c })), 0, 'the earlier take returns 0');
  assert.equal(seen.length, before, 'the probe after it is not reached');
});

test('[伤害-8] [元素-4] a character\'s 侵蚀 and 灼燃 bursts: 800 physical and 1200 arts reach the take after the defences', () => {
  const { w, c, op, probe, foe, on, by } = arena({ res: 40 });
  const e = foe(2, 4);
  probe(op);
  assert.equal(lost(op, () => dealEpFrom(w, op, 'WATER', 1000, { src: e, c })), 800 * KEEP, '防御 100 − 100 first');
  op.buffs = op.buffs.filter((b) => !b.key.startsWith('burst:'));
  assert.equal(lost(op, () => dealEpFrom(w, op, 'FIRE', 1000, { src: e, c })), 1200 * 0.8 * KEEP, '法术抗性 40 − 20 first');
  assert.deepEqual([on(op), by(op)], [[[800, 'phys'], [1200 * 0.8, 'arts']], [e.id, e.id]]);
});

test('[伤害-8] [元素-4] [状态-4] the 凋亡 burst each second meets the take through its trigger, on an enemy and a character; 狂躁 too', () => {
  const { w, op, probe, foe, frames, on, by } = arena();
  const e = foe(2, 4);
  probe(op);
  dealEp(w, e, 'DARK', 1000, op);
  dealEp(w, op, 'DARK', 1000, e);
  const [eHp, opHp] = [e.hp, op.hp];
  frames(60);
  assert.deepEqual([eHp - e.hp, opHp - op.hp], [2 * 800 * KEEP, 2 * 100 * KEEP], 'two seconds; dealt without the content, ticked with it');
  assert.deepEqual([on(e), on(op)], [[[800, 'elemental'], [800, 'elemental']], [[100, 'arts'], [100, 'arts']]]);
  assert.deepEqual([by(e), by(op)], [[op.id, op.id], [e.id, e.id]], 'each credited to its burst\'s source');
  const angry = arena();
  const rager = angry.foe(2, 4);
  angry.probe(angry.op);
  dealEp(angry.w, angry.op, 'ANGER', 1000, rager);
  assert.equal(lost(angry.op, () => angry.frames(30)), 100 * KEEP);
  assert.deepEqual([angry.on(angry.op), angry.by(angry.op)], [[[100, 'true']], [rager.id]]);
});

test('[伤害-8] [状态-4] a buff\'s trigger gets the content as its expiry does, a fixed trigger or not; called without it, both get none', () => {
  const { w, c, op } = arena();
  /** @type {[string, unknown][]} */
  const got = [];
  /** @type {Record<string, import('../src/buffs.js').Behavior>} */
  const beh = { t: { tick: (_w, _u, b, cc) => { got.push([b.key, cc]); }, expire: (_w, _u, b, cc) => { got.push([`${b.key} ends`, cc]); } } };
  addBuff(op, makeBuff({ key: 'fixed', act: 't', every: 2, left: 4, fixed: true }));
  addBuff(op, makeBuff({ key: 'decays', act: 't', every: 2, left: 4 }));
  for (let f = 0; f < 4; f++) tickUnitBuffs(w, op, beh, c);
  assert.deepEqual(got, [['fixed', c], ['decays', c], ['fixed', c], ['fixed ends', c], ['decays', c], ['decays ends', c]], 'two triggers each, then the expiry');
  addBuff(op, makeBuff({ key: 'fixed', act: 't', every: 2, left: 2, fixed: true }));
  addBuff(op, makeBuff({ key: 'decays', act: 't', every: 2, left: 2 }));
  for (let f = 0; f < 2; f++) tickUnitBuffs(w, op, beh);
  assert.deepEqual(got.slice(6), [['fixed', undefined], ['fixed ends', undefined], ['decays', undefined], ['decays ends', undefined]]);
});

test('[状态-4] a trigger that takes its own buff off ends that buff\'s triggers in the frame, though more were due', () => {
  const { w, c, op } = arena();
  /** @type {string[]} */
  const got = [];
  /** @type {Record<string, import('../src/buffs.js').Behavior>} */
  const beh = { t: { tick: (_w, u, b) => { got.push(b.key); if (b.key === 'goes') removeBuff(u, b); } } };
  addBuff(op, makeBuff({ key: 'goes', act: 't', every: 1, decay: 3 }));
  addBuff(op, makeBuff({ key: 'stays', act: 't', every: 1, decay: 3 }));
  tickUnitBuffs(w, op, beh, c);
  assert.deepEqual(got, ['goes', 'stays', 'stays', 'stays'], 'three due for each at decay 3');
});

test('[伤害-8] [职业-29] the elemental damage while a 凋亡 burst lasts and the burst\'s own each second meet the take', () => {
  const { w, c, op, foe, frames, on, by } = arena({ trait: { epRider: { el: 'DARK', ratio: 100 } }, talentTrait: { vs: [{ when: 'burstOf', el: 'DARK', on: 'attack', post: true, burstDot: 0.4 }] } });
  const e = foe(2, 4);
  creditedDamage(w, c, op, e, { type: 'phys', amount: 100, isAttack: true });
  assert.ok(e.buffs.some((b) => b.key === `burstDot:${op.id}`));
  assert.equal(lost(e, () => frames(30)), (800 + 0.4 * 50) * KEEP);
  assert.deepEqual(on(e), [[100, 'phys'], [800, 'elemental'], [0.4 * 50, 'elemental']], 'its hit, then the burst\'s second and the talent\'s');
  assert.deepEqual(by(e), [op.id, op.id, op.id], 'the rider\'s 元素损伤 set the burst off for the operator');
});

test('[伤害-8] [职业-29] the pulses: their arts damage meets the take, and their 元素损伤 carries the content to the burst it sets off', () => {
  const arts = arena({ trait: { noAttack: true }, talentTrait: { pulses: [{ who: 'blocked', every: 1, arts: 0.4 }] } });
  const held = arts.foe(1, 2);
  held.blockedBy = arts.op.id;
  assert.equal(lost(held, () => arts.frames(30)), 0.4 * 50 * KEEP);
  assert.deepEqual([arts.on(held), arts.by(held)], [[[20, 'arts']], [arts.op.id]]);
  const ep = arena({ trait: { noAttack: true }, talentTrait: { pulses: [{ who: 'blocked', every: 1, ep: { el: 'FIRE', scale: 40 } }] } });
  const hot = ep.foe(1, 2);
  hot.blockedBy = ep.op.id;
  assert.equal(lost(hot, () => ep.frames(30)), 7000 * KEEP);
  assert.deepEqual([ep.on(hot), ep.by(hot)], [[[7000, 'elemental']], [ep.op.id]], 'the burst is the operator\'s');
});

test('[伤害-8] [职业-29] 元素损伤 over time carries the content to a burst, set off at once or by its trigger a second later', () => {
  const once = arena({ talentTrait: { vs: [{ when: 'first', seen: 'attack', on: 'attack', epDot: { el: 'FIRE', scale: 20, seconds: 5 } }] } });
  const a = once.foe(2, 4);
  creditedDamage(once.w, once.c, once.op, a, { type: 'phys', amount: 100, isAttack: true });
  assert.deepEqual(once.on(a), [[100, 'phys'], [7000, 'elemental']], '50 × 20 = 1000 at once');
  assert.deepEqual(once.by(a), [once.op.id, once.op.id], 'the burst is the operator\'s');
  const later = arena({ talentTrait: { vs: [{ when: 'first', seen: 'attack', on: 'attack', epDot: { el: 'FIRE', scale: 10, seconds: 5 } }] } });
  const b = later.foe(2, 4);
  creditedDamage(later.w, later.c, later.op, b, { type: 'phys', amount: 100, isAttack: true });
  assert.deepEqual(later.on(b), [[100, 'phys']], '500 at once: no burst yet');
  later.frames(30);
  assert.deepEqual(later.on(b), [[100, 'phys'], [7000, 'elemental']], 'the trigger\'s 500 sets it off');
  assert.deepEqual(later.by(b), [later.op.id, later.op.id], 'for the operator');
});

test('[伤害-8] [职业-28] the arts damage at once on an enemy standing still, and each second on a sleeping one, meet the take', () => {
  const { w, c, op, foe, frames, on } = arena({ talentTrait: { hurtSleeping: true, vs: [{ when: 'still', on: 'damage', arts: 0.16 }], sleepDot: 0.32 } });
  const still = foe(2, 4);
  assert.equal(lost(still, () => creditedDamage(w, c, op, still, { type: 'phys', amount: 100, isAttack: true })), (100 + 50 * 0.16) * KEEP);
  assert.deepEqual(on(still), [[100, 'phys'], [50 * 0.16, 'arts']]);
  const z = foe(2, 4);
  applyStatus(z, 'sleep', { seconds: 100 });
  frames(15 - w.frame);
  assert.equal(lost(z, () => frames(1)), 50 * 0.32 * KEEP, 'at 0.5 s, through 沉睡');
  assert.deepEqual(on(z), [[50 * 0.32, 'arts']]);
});

test('[伤害-8] [职业-25] a talent\'s arts damage over time meets the take each second, also once its operator has left', () => {
  const { w, c, op, foe, frames, on, by } = arena({ talentTrait: { onHit: [{ dot: { amount: 85, seconds: 3.1 } }] } });
  const e = foe(0, 5);
  traitHit(w, c, op, e);
  assert.equal(lost(e, () => frames(60)), 2 * 85 * KEEP);
  assert.deepEqual(on(e), [[85, 'arts'], [85, 'arts']]);
  op.hp = 0;
  assert.equal(lost(e, () => frames(30)), 85 * KEEP, 'the third second');
  assert.equal(w.units.includes(op), false);
  assert.deepEqual(by(e), [op.id, op.id, -1], 'credited to no one once the operator is gone');
});

test('[伤害-8] [伤害-7] as for an attack, a dodge or 无敌 stops the engine\'s damage before the take: a talent\'s damage over time, a 凋亡 second', () => {
  const { w, c, op, seen, foe, frames } = arena({ talentTrait: { onHit: [{ dot: { amount: 85, seconds: 3.1 } }] } });
  const evader = foe(0, 5), shut = foe(2, 4), late = foe(0, 5);
  addBuff(evader, makeBuff({ key: 'evade', prio: 1, mods: { dodgeArts: 1 } }));
  addBuff(late, makeBuff({ key: 'evade', mods: { dodgeArts: 1 } }));
  traitHit(w, c, op, evader);
  traitHit(w, c, op, late);
  dealEp(w, shut, 'DARK', 1000);
  addBuff(shut, makeBuff({ key: 'shut', flags: { invincible: true } }));
  frames(30);
  assert.deepEqual([evader.hp, shut.hp, late.hp], [1e6, 1e6, 1e6]);
  assert.deepEqual(seen.map((s) => [s.id, s.amount]), [[late.id, 85]], 'a dodge before the probe and 无敌 stop it; a dodge after it does not');
  assert.equal(evader.buffs.some((b) => b.key.startsWith('dot:')), true, 'the damage over time still runs');
});

test('[伤害-8] [敌能-46] bleed meets the content\'s take on the unit it bleeds, after its 法术抗性', () => {
  const { op, probe, frames, on } = arena({ res: 20 });
  probe(op);
  giveBleed(op, 150, 10);
  assert.equal(lost(op, () => frames(30)), 150 * 0.8 * KEEP);
  assert.deepEqual(on(op), [[150 * 0.8, 'arts']]);
});

test('[伤害-8] [职业-27] [部署-8] a burst\'s damage on a character sets off its 受击 heal and breaks its deployment shield; without the content neither', () => {
  const rec = { talentTrait: { hurt: { heal: { low: 70, high: 130, below: 0.5 } } }, deployTalents: [{ shield: 1, break: { mods: { atkPct: 0.1 }, max: 3 } }] };
  const { w, c, op } = arena(rec);
  op.hp = 400;
  dealEpFrom(w, op, 'SANITY', 1000, { c });
  assert.deepEqual([op.hp, op.buffs.find((b) => b.key === 'shieldBreak')?.stacks, statsOf(op).atk], [400 + 130, 1, 50 * (1 + 0.1)], 'healed 130 below half; the layer took the 1000 true');
  const bare = arena(rec);
  bare.op.hp = 400;
  dealEp(bare.w, bare.op, 'SANITY', 1000);
  assert.deepEqual([bare.op.hp, bare.op.buffs.some((b) => b.key === 'shieldBreak'), statsOf(bare.op).atk], [400, false, 50], 'the layer is gone all the same');
  assert.equal(bare.op.buffs.some((b) => b.key === 'deployShield'), false);
});

test('[伤害-8] [元素-2] [职业-20] [职业-24] the 元素损伤 of a rider, a talent\'s hit and an operator\'s behaviour carries the content to the burst', () => {
  const rider = arena({ trait: { epRider: { el: 'FIRE', ratio: 0.5 } } });
  const a = rider.foe(1, 2);
  a.ep.FIRE = 1;
  creditedDamage(rider.w, rider.c, rider.op, a, { type: 'phys', amount: 100, isAttack: true });
  assert.deepEqual([rider.on(a), rider.by(a)], [[[100, 'phys'], [7000, 'elemental']], [rider.op.id, rider.op.id]]);
  const hit = arena({ talentTrait: { onHit: [{ ep: { el: 'FIRE', amount: 10 } }] } });
  const b = hit.foe(1, 2);
  b.ep.FIRE = 1;
  traitHit(hit.w, hit.c, hit.op, b);
  assert.deepEqual([hit.on(b), hit.by(b)], [[[7000, 'elemental']], [hit.op.id]]);
  const ctx = arena();
  const d = ctx.foe(1, 2);
  d.ep.FIRE = 1;
  actorContext(ctx.w, ctx.c, ctx.op, {}).dealEp(d, 'FIRE', 10);
  assert.deepEqual([ctx.on(d), ctx.by(d)], [[[7000, 'elemental']], [ctx.op.id]], 'each burst is the operator\'s');
});

test('[伤害-8] [元素-2] [技能-14] a skill counter\'s 元素损伤 carries the content to the burst it sets off', () => {
  const counter = { scale: 1.3, stat: 'atk', type: 'arts', element: 'FIRE', epScale: 0.2 };
  const skill = { id: 'text', type: 'MANUAL', sp: 'time', cost: 5, init: 0, charges: 1, duration: 20, ammo: false, bb: { atk_scale: 1.3 }, extra: { counter, hitScale: 'attack' } };
  const { w, c, op, foe, on, by } = arena({ skill });
  forceSp(/** @type {import('../src/types.js').SkillState} */ (op.skill), 99);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  const e = foe(2, 4);
  e.ep.FIRE = 1;
  skillCounter(w, c, op, e, { type: 'phys', amount: 10, isAttack: true });
  assert.deepEqual(on(e), [[50 * 1.3, 'arts'], [7000, 'elemental']], 'the counter\'s arts, then the burst its 元素损伤 set off');
  assert.deepEqual(by(e), [op.id, op.id]);
});

test('[伤害-8] [元素-2] [敌能-2] an attack\'s 元素损伤 and an enemy behaviour\'s carry the content to the burst they set off', () => {
  const atk = arena({ dmgType: 'arts', skill: { id: 'fire', type: 'AUTO', sp: 'time', cost: 1, init: 1, charges: 1, duration: 10, ammo: false, bb: {} } }, (c) => {
    c.behaviors.skills = { fire: { attack: (/** @type {any} */ _ctx, /** @type {any} */ m) => ({ ...m, element: 'FIRE', ep: 1000 }) } };
  });
  const t = atk.foe(1, 2);
  atk.frames(3);
  assert.deepEqual(atk.on(t), [[50, 'arts'], [7000, 'elemental']], 'the hit, then the burst it set off');
  assert.deepEqual(atk.by(t), [atk.op.id, atk.op.id]);
  const foes = arena({}, (c) => {
    c.enemies.zapper = { name: 'zapper', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 0, talents: { zap: { v: 1 } } };
    c.behaviors.foes = { zap: { tick: (/** @type {any} */ ctx) => { for (const g of ctx.ours()) ctx.dealEp(g, 'FIRE', 2000); } } };
  });
  foes.probe(foes.op);
  const z = makeEnemy(foes.w, foes.c, { key: 'zapper', route: 0 });
  z.x = 4; z.y = 1;
  foes.w.units.push(z);
  assert.equal(lost(foes.op, () => foes.frames(1)), 1200 * KEEP, 'a character\'s 灼燃: 1200 arts at 法术抗性 0 − 20');
  assert.deepEqual([foes.on(foes.op), foes.by(foes.op)], [[[1200, 'arts']], [z.id]], 'the burst is the enemy\'s');
});
