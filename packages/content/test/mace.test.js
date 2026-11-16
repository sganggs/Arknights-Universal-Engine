// 锏 (docs/spec/foes.md 敌能-157): its shapes, its two forms, the rebirth between them, 抵抗 and 隐匿, the 防御 its damage
// ignores on the unit blocking it, the second form's double hits and 【瞬息杀机】. 速杀 and 肆虐风雪 are mace-skills.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, attrs, damage, targeting, buffs, status, bus } from '@aue/sim';
import { uncoveredAbilities, withoutIncomplete } from '../src/foes.js';
import { maceReborn } from '../src/mace.js';
import { MAN, rawMace, mace, arena, deploy, opAt, unitOf, run, has, watch, fell, secondForm, repin } from './mace-arena.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

/** No skill of 锏's casts for the length of a test. */
const NO_SKILLS = { CircleAttack: { initCooldown: 999 }, Blink: { initCooldown: 999 }, CircleAttack2: { initCooldown: 999 }, Blink2: { initCooldown: 999 } };
/** Our guard has this much 防御. */
const GUARD_DEF = 500;
/** @param {any} c */
const sturdy = (c) => { c.operators.guard.def = GUARD_DEF; };

/** A one-ability enemy: a talent, or a skill when `skill` is set. @param {string} k @param {Record<string, unknown>} bb @param {boolean} skill @returns {EnemyDef} */
function only(k, bb, skill) {
  const base = { name: 'e', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1 };
  return /** @type {EnemyDef} */ (skill ? { ...base, skills: [{ key: k, cooldown: 1, initCooldown: 0, sp: 0, bb }] } : { ...base, talents: { [k]: bb } });
}

/** The blackboard with one key more, one key less, and its first value as text. @param {Record<string, unknown>} bb */
function variants(bb) {
  const [first] = Object.keys(bb);
  const { [first]: _drop, ...less } = bb;
  return [{ ...bb, extra: 1 }, less, { ...bb, [first]: String(bb[first]) }];
}

test('[敌能-157] [关卡-2] 锏 with its page extras is covered whole; each of its names counts only with its exact shape; the shared names\' other users stay as they were', () => {
  const def = mace();
  assert.deepEqual(uncoveredAbilities([def]), []);
  assert.equal(withoutIncomplete(def), def, 'nothing left out where it would load (关卡-8)');
  assert.deepEqual(uncoveredAbilities([rawMace()]), ['Blink', 'Blink2'], 'without the page\'s `glide` the two 速杀 are 路加萨尔古斯\'s shape');
  const e = /** @type {any} */ (def);
  for (const [k, bb] of Object.entries(e.talents)) {
    if (k === 'Reborn' || k === 'Resist') continue;
    for (const v of variants(/** @type {Record<string, unknown>} */ (bb))) assert.deepEqual(uncoveredAbilities([only(k, v, false)]), [k], `${k} ${JSON.stringify(v)}`);
  }
  for (const s of e.skills) for (const v of variants(s.bb)) assert.deepEqual(uncoveredAbilities([only(s.key, v, true)]), [s.key], `${s.key} ${JSON.stringify(v)}`);
  assert.equal(maceReborn(e.talents.Reborn), true);
  for (const v of variants(e.talents.Reborn)) assert.equal(maceReborn(v), false, JSON.stringify(v));
  assert.deepEqual(uncoveredAbilities([only('Blink', { dist: 1.5, atk_scale: 1.5 }, true)]), ['Blink'], '路加萨尔古斯，历法之王 (enemy_2058_smlion)');
  assert.deepEqual(uncoveredAbilities([only('Blink', { max_hp_ratio: 0.5, dist: 1.5 }, true)]), [], '裹骸死士 keeps its shape (敌能-96)');
  assert.equal(maceReborn({ duration: 5, invincible: 15 }), false, '“领袖” (enemy_1536_ncrmcr)');
  assert.equal(maceReborn({ duration: 20, invincible: 10 }), false, '“酒神” (enemy_1568_dirctr)');
});

test('[敌能-157] first form: 抵抗 from spawn, no ATK from AtkUp (no 降雪); its attack on its blocker ignores the first form\'s share of 防御, one hit a swing', () => {
  for (const [pen, loss] of /** @type {[number, number][]} */ ([[0.2, 900 - 0.8 * GUARD_DEF], [0.35, 900 - 0.65 * GUARD_DEF]])) {
    const { c, w, e } = arena(mace({ skill: NO_SKILLS, bb: { DefPenetrate: { 'enemy_blkswb_t_2.def_penetrate': pen } } }), [], { tune: sturdy });
    assert.ok(has(e, 'buffres') && attrs.statsOf(e).statusRes < 1, '抵抗 (状态-5)');
    const hits = watch(w, e);
    e.atkCd = 0;
    deploy(w, c, [['guard', 1, 2]]);
    const g = opAt(w, 1, 2);
    assert.equal(e.blockedBy, g.id);
    assert.deepEqual(hits, [{ frame: 1, target: g.id, amount: 900, pen, attack: true, skill: false }], 'one hit, an attack, at the full 攻击力');
    assert.ok(Math.abs(1e6 - g.hp - loss) < 1e-6, `${1e6 - g.hp} vs ${loss}`);
    run(w, c, 240);
    assert.equal(attrs.statsOf(e).atk, 900, 'AtkUp adds nothing');
    assert.deepEqual(e.buffs.map((b) => b.key), ['buffres', 'root'], 'no buff of AtkUp\'s or DefPenetrate\'s');
    assert.equal(hits.length, 3, 'one hit every 4 s (attack interval 120 frames)');
  }
});

test('[敌能-157] [敌能-18] the first fall revives it at full HP for `duration` s — its buffs, 抵抗 too, cleared —, then the second form: `invincible` s of 无敌, first cooldowns, 隐匿; the second fall knocks it down', () => {
  const { c, w, e } = arena(mace({ bb: { Reborn: { duration: 4, invincible: 7 } } }));
  e.ab['CircleAttack.cd'] = 99;
  damage.dealDamage(w, null, e, { type: 'true', amount: 1e9 });
  step(w, c);
  assert.equal(has(e, 'root'), false, 'every buff cleared, the test\'s root too');
  repin(e);
  assert.ok(w.units.includes(e), 'kept on the field');
  assert.equal(e.hp, attrs.statsOf(e).maxHp, '恢复100%生命值');
  const s = attrs.statsOf(e);
  assert.deepEqual([s.invincible, s.disabled, targeting.selectable(e), has(e, 'reborn'), has(e, 'buffres')], [true, true, false, true, false]);
  run(w, c, 119);
  assert.deepEqual([has(e, 'reborn'), has(e, 'maceSecond')], [true, false], 'still reviving at 119 frames');
  assert.equal(e.ab['CircleAttack.cd'], 0, '肆虐风雪 came ready while it revived and was not cast: it does not act');
  step(w, c);
  assert.deepEqual([has(e, 'reborn'), has(e, 'maceSecond'), has(e, 'maceHide')], [false, true, true], 'the second form from the 120th frame (4 s)');
  assert.equal(e.buffs.find((b) => b.key === 'reborn:invincible')?.left, 210, '7 s of 无敌');
  assert.deepEqual([e.ab['CircleAttack.cd'], e.ab['CircleAttack2.cd'], e.ab['Blink2.cd']], [449, 449, 0], 'cooldowns back to their first');
  run(w, c, 209);
  assert.ok(attrs.statsOf(e).invincible && !targeting.selectable(e));
  step(w, c);
  assert.ok(!attrs.statsOf(e).invincible && !has(e, 'reborn:invincible'));
  assert.equal(targeting.stealthed(e), true, '隐匿 in effect while it is not blocked');
  assert.equal(has(e, 'buffres'), false, 'no 抵抗 in the second form');
  assert.deepEqual(['maceSecond', 'maceHide'].map((k) => e.buffs.filter((b) => b.key === k).length), [1, 1], 'one of each, not one a frame');
  for (const k of ['maceSecond', 'maceHide']) buffs.removeBuff(e, k);
  step(w, c);
  assert.deepEqual([has(e, 'maceSecond'), has(e, 'maceHide')], [true, true], 'taken off, back on its next turn');
  fell(w, c, e);
  assert.ok(!w.units.includes(e), 'the second fall knocks it down');
});

test('[敌能-157] [敌能-2] reaching the goal is no fall: it leaves in its first form, and no rebirth keeps it', () => {
  const { c, w, e } = arena(mace({ skill: NO_SKILLS }));
  buffs.removeBuff(e, 'root');
  let at = -1;
  for (let i = 0; i < 600 && at < 0; i++) if (step(w, c).some((x) => x.type === 'goal' && x.id === e.id)) at = w.frame - 1;
  assert.ok(at > 0, 'it reached the goal');
  assert.deepEqual([w.units.includes(e), has(e, 'reborn'), has(e, 'maceSecond')], [false, false, false]);
});

test('[敌能-157] second form: 隐匿 is off while blocked and back 3 s after; each swing hits twice, every hit ignoring the second form\'s share of 防御', () => {
  for (const [pen, loss] of /** @type {[number, number][]} */ ([[0.4, 2 * (900 - 0.6 * GUARD_DEF)], [0.25, 2 * (900 - 0.75 * GUARD_DEF)]])) {
    const { c, w, e } = arena(mace({ skill: NO_SKILLS, bb: { DefPenetrate: { 'enemy_blkswb_t_2[reborn].def_penetrate': pen } } }), [], { tune: sturdy });
    secondForm(w, c, e);
    const hits = watch(w, e);
    e.atkCd = 0;
    deploy(w, c, [['guard', 1, 2]]);
    const g = opAt(w, 1, 2);
    assert.equal(targeting.stealthed(e), false, 'blocked: 隐匿 not in effect (索敌-2)');
    assert.deepEqual(hits.map((h) => [h.amount, h.pen, h.attack]), [[900, pen, true], [900, pen, true]], '二连击');
    assert.ok(Math.abs(1e6 - g.hp - loss) < 1e-6, `${1e6 - g.hp} vs ${loss}`);
    step(w, c, [[0, { type: 'retreat', unit: g.id }]]);
    assert.equal(e.blockedBy, -1);
    assert.ok(has(e, 'stealthOff:maceHide') && !targeting.stealthed(e), 'released: the restore window');
    run(w, c, 88);
    assert.equal(targeting.stealthed(e), false, 'not yet 3 s');
    step(w, c);
    assert.equal(targeting.stealthed(e), true, 'back 3 s (90 frames) after the release');
  }
});

/** Our guard with a skill — SP 30 of 40 at deployment, not started — and a sniper whose skill can start at once. @param {any} c */
function skilled(c) {
  c.operators.guard.skill = { id: 'g', type: 'MANUAL', sp: 'time', cost: 40, init: 30, charges: 1, duration: 0, ammo: false, bb: {} };
  c.operators.sniper.skill = { id: 's', type: 'MANUAL', sp: 'time', cost: 5, init: 5, charges: 1, duration: 60, ammo: false, bb: {} };
}

/** HP down to this share of its maximum, then a step. @param {any} w @param {any} c @param {Unit} e @param {number} share */
function downTo(w, c, e, share) {
  damage.setHp(e, attrs.statsOf(e).maxHp * share);
  step(w, c);
}

test('[敌能-157] [敌能-89] 瞬息杀机: in the second form, past each `hp_ratio` of its HP lost, our units within `range_radius` lose their SP and get `duration` s of 强制缴械 and 阻回; one pass however many stages a hit crosses', () => {
  const ops = /** @type {[string, number, number][]} */ ([['guard', 1, 4], ['sniper', 0, 2]]);
  const { c, w, e } = arena(mace({ skill: NO_SKILLS, bb: { ClearSp: { hp_ratio: 0.3, duration: 6, range_radius: 2.1 } } }), ops, { tune: skilled, man: true });
  const g = opAt(w, 1, 4), sn = opAt(w, 0, 2), man = unitOf(w, MAN);
  downTo(w, c, e, 0.6);
  assert.deepEqual([g.skill?.sp, has(g, 'forceDisarm')], [30, false], 'not in the first form');
  step(w, c, [[0, { type: 'skill', unit: sn.id }]]);
  assert.equal(sn.skill?.active, true);
  secondForm(w, c, e);
  downTo(w, c, e, 0.71);
  assert.equal(has(g, 'forceDisarm'), false, '29% lost: below 30%');
  downTo(w, c, e, 0.69);
  for (const u of [g, sn]) {
    assert.equal(u.skill?.sp, 0, 'SP cleared');
    assert.equal(u.buffs.find((b) => b.key === 'forceDisarm')?.left, 180, '6 s of 强制缴械');
    assert.deepEqual([attrs.statsOf(u).flags.forceDisarm, attrs.statsOf(u).flags.noAttack, attrs.statsOf(u).flags.noSp], [true, undefined, true]);
  }
  assert.equal(sn.skill?.active, true, 'a running skill goes on');
  assert.ok(!man.buffs.some((b) => b.key === 'forceDisarm' || b.key === 'noSp'), 'not a neutral unit');
  run(w, c, 179);
  assert.deepEqual([g.skill?.sp, has(g, 'forceDisarm'), has(g, 'noSp')], [0, true, true], 'no SP back under 阻回');
  step(w, c);
  assert.deepEqual([g.skill?.sp, has(g, 'forceDisarm'), has(g, 'noSp')], [0, false, false], 'both end after 6 s (180 frames)');
  downTo(w, c, e, 0.05);
  assert.equal(g.buffs.filter((b) => b.key === 'forceDisarm').length, 1, '31% → 95% lost: one pass across the 60% and 90% stages');
  downTo(w, c, e, 0.04);
  assert.equal(g.buffs.filter((b) => b.key === 'forceDisarm').length, 1, 'no stage left until it dies');
});

test('[敌能-157] 瞬息杀机 reaches only units within its radius: the same loss with `range_radius` 1.5 leaves the guard at distance 2 alone, and one that took off; the second player\'s sniper is reached', () => {
  const ops = /** @type {[string, number, number, number?][]} */ ([['guard', 1, 4], ['sniper', 0, 2, 1], ['archer', 2, 2]]);
  const tune = (/** @type {any} */ k) => { skilled(k); k.operators.archer.skill = k.operators.sniper.skill; };
  const { c, w, e } = arena(mace({ skill: NO_SKILLS, bb: { ClearSp: { range_radius: 1.5 } } }), ops, { tune, players: 2 });
  const g = opAt(w, 1, 4), sn = opAt(w, 0, 2), ar = opAt(w, 2, 2);
  secondForm(w, c, e);
  buffs.addBuff(ar, buffs.makeBuff({ key: 'up', flags: { liftoff: true } }));
  downTo(w, c, e, 0.74);
  assert.ok((g.skill?.sp ?? 0) > 0 && !has(g, 'forceDisarm'), 'the guard at distance 2 keeps its SP');
  assert.deepEqual([sn.owner, sn.skill?.sp, has(sn, 'forceDisarm')], [1, 0, true], 'the sniper at distance 1 does not');
  assert.ok((ar.skill?.sp ?? 0) > 0 && !has(ar, 'forceDisarm'), 'one that took off is out of a ground enemy\'s reach (阻挡-2)');
});

test('[敌能-157] [状态-7] [状态-9] 沉默 and 静默: its data makes it immune to 沉默, so its skills go on; a 锏 without that immunity casts none under 沉默; 静默 stops both skills, not its talents', () => {
  for (const immune of [undefined, ['stun', 'sleep', 'freeze']]) {
    const def = mace({ skill: { Blink: { initCooldown: 999 }, CircleAttack: { initCooldown: 1 } }, ...(immune ? { def: { immune } } : {}) });
    const { c, w, e } = arena(def);
    status.applyStatus(e, 'silence', {});
    assert.equal(!!attrs.statsOf(e).flags.silence, !!immune);
    run(w, c, 31);
    assert.equal(e.ab['CircleAttack.cd'] > 0, !immune, immune ? 'silenced: ready and not cast' : 'immune: cast at its cooldown');
  }
  const { c, w, e } = arena(mace({ skill: { CircleAttack: { initCooldown: 999 }, CircleAttack2: { initCooldown: 999 }, Blink2: { initCooldown: 999 } } }), [], { tune: (k) => { sturdy(k); skilled(k); } });
  status.applyStatus(e, 'mute', {});
  const hits = watch(w, e);
  e.atkCd = 0;
  e.ab['CircleAttack.cd'] = 0;
  deploy(w, c, [['guard', 1, 2]]);
  const g = opAt(w, 1, 2);
  step(w, c);
  assert.deepEqual([e.blockedBy, has(e, 'blinkSlip'), e.ab['Blink.cd'], e.ab['CircleAttack.cd']], [g.id, false, 0, 0], '静默: neither skill casts, blocked and ready');
  assert.deepEqual(hits.map((h) => [h.pen, h.attack]), [[0.2, true]], 'the attack still ignores 20% of 防御 (a talent)');
  secondForm(w, c, e);
  status.applyStatus(e, 'mute', {});
  assert.ok(attrs.statsOf(e).flags.mute && (g.skill?.sp ?? 0) > 0);
  downTo(w, c, e, 0.7);
  assert.deepEqual([g.skill?.sp, has(g, 'forceDisarm')], [0, true], '瞬息杀机 lets out under 静默 (a talent)');
});

test('[敌能-157] [状态-12] 瞬息杀机\'s 强制缴械 cancels a swing under way and keeps our operators from attacking while it lasts', () => {
  const tune = (/** @type {any} */ k) => { Object.assign(k.operators.guard, { atk: 1000, baseAttackTime: 3, attack: { duration: 1, hit: 0.5 } }); };
  const { c, w, e } = arena(mace({ skill: NO_SKILLS }), [], { tune });
  secondForm(w, c, e);
  run(w, c, 300);
  e.atkCd = 1e9;
  deploy(w, c, [['guard', 1, 2]]);
  const g = opAt(w, 1, 2);
  for (let i = 0; i < 200 && !(g.swing && g.swing.since === 0); i++) step(w, c);
  const lands = w.frame - 1 + (g.swing?.wind ?? 0);
  assert.ok(g.swing !== null && lands > w.frame + 1, 'a swing under way');
  /** @type {number[]} */
  const after = [];
  bus.on(w, 'hit', (x) => { if (x.source === g) after.push(w.frame); });
  downTo(w, c, e, 0.7);
  assert.equal(has(g, 'forceDisarm'), true, '强制缴械');
  step(w, c);
  assert.equal(g.swing, null, 'the swing under way is cancelled on its turn');
  run(w, c, 200);
  assert.deepEqual(after, [], 'it never lands, and no new one starts while 强制缴械 lasts');
});
