// 锏's skills (docs/spec/foes.md 敌能-157): 速杀 (`Blink`, `Blink2`) — 弑君者's slip and glide, then the hat's hit on the
// unit that blocked it, twice in the second form — and 肆虐风雪 (`CircleAttack`, `CircleAttack2`) — every unit of ours
// in its radius at its cooldown, twice in the second form —; one of them a frame, and the rebirth stopping a 速杀.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, attrs, buffs, damage } from '@aue/sim';
import { mace, arena, deploy, opAt, run, has, watch, secondForm, repin } from './mace-arena.js';

/** @typedef {import('@aue/sim').Unit} Unit */

/** Our guard has this much 防御. */
const GUARD_DEF = 500;
/** @param {any} c */
const sturdy = (c) => { c.operators.guard.def = GUARD_DEF; };
/** The attack interval in frames (4 s at 100 攻击速度), less the frame it is set on (敌能-62's `holdAttack`). */
const HELD = 119;

/** @param {number} got @param {number} want */
const close = (got, want) => assert.ok(Math.abs(got - want) < 1e-9, `${got} vs ${want}`);
/** @param {Unit} e @param {string} k */
const flag = (e, k) => !!attrs.statsOf(e).flags[k];

test('[敌能-157] [敌能-84] 速杀: blocked and ready, it slips for 1 s and glides `dist` over `glide` s, invincible; 0.3 s on, the unit that blocked it takes its 攻击力 then × `atk_scale` as physical skill damage, once; it takes the attack\'s turn', () => {
  const def = mace({ skill: { CircleAttack: { initCooldown: 999 } }, bb: { Blink: { atk_scale: 1.2, glide: 0.3 } } });
  const { c, w, e } = arena(def, [], { at: { x: 1, y: 1 } });
  const hits = watch(w, e);
  e.atkCd = 50;
  deploy(w, c, [['guard', 1, 1]]);
  const g = opAt(w, 1, 1);
  assert.equal(e.blockedBy, g.id);
  step(w, c);
  // after the trigger: the hit takes the 攻击力 it has when it lands, not at the trigger nor its base
  buffs.addBuff(e, buffs.makeBuff({ key: 'testAtk', mods: { atkPct: 0.5 } }));
  assert.deepEqual([e.blockedBy, flag(e, 'unblockable'), flag(e, 'invincible'), flag(e, 'noDisplace')], [-1, true, true, true]);
  close(e.x, 1 + 1.5 / 9);
  assert.deepEqual([e.ab['Blink.cd'], e.atkCd], [899, HELD], 'the 30 s cooldown from the trigger; the attack waits its interval');
  assert.deepEqual([e.ab['Blink2.cd'], e.ab['Blink2.due'] ?? 0], [0, 0], 'Blink2 is the second form\'s');
  run(w, c, 8);
  close(e.x, 2.5);
  assert.equal(has(e, 'blinkGlide'), true);
  step(w, c);
  assert.deepEqual([has(e, 'blinkGlide'), flag(e, 'invincible'), flag(e, 'unblockable')], [false, false, true], 'the glide is 9 frames, the slip 30');
  assert.deepEqual(hits, [{ frame: 11, target: g.id, amount: 1350 * 1.2, pen: 0, attack: false, skill: true }], '9 frames on; no 防御 ignored, nobody blocks it then');
  run(w, c, 20);
  assert.equal(flag(e, 'unblockable'), true, 'frame 31: the slip\'s last');
  step(w, c);
  assert.equal(flag(e, 'unblockable'), false, 'frame 32: 30 frames (1 s) after the trigger');
  assert.equal(hits.length, 1);
});

test('[敌能-157] 速杀\'s next cast comes `cooldown` s after the trigger, blocked again; an impassable destination only slips, and the hit still lands', () => {
  const def = mace({ skill: { CircleAttack: { initCooldown: 999 }, Blink: { cooldown: 20 } } });
  const { c, w, e } = arena(def, [], { at: { x: 1, y: 1 }, tune: (k) => { k.level.tiles[1][2] = { ...k.level.tiles[1][2], passable: 'NONE' }; } });
  const hits = watch(w, e);
  e.atkCd = 1e9;
  deploy(w, c, [['guard', 1, 1]]);
  step(w, c);
  assert.equal(has(e, 'blinkSlip'), true);
  assert.deepEqual([e.x, has(e, 'blinkGlide')], [1, false], 'x 2.5 is on the wall: no glide');
  run(w, c, 30);
  assert.equal(e.blockedBy, opAt(w, 1, 1).id, 'blocked again once the slip ends');
  assert.equal(hits.length, 1);
  run(w, c, 569);
  assert.deepEqual([e.ab['Blink.cd'], has(e, 'blinkSlip')], [0, false], 'frame 601: not yet');
  step(w, c);
  assert.deepEqual([e.ab['Blink.cd'], has(e, 'blinkSlip')], [599, true], 'the second cast at frame 602, 600 frames (20 s) after the first');
});

test('[敌能-157] second form: Blink2 glides its own `dist` and hits the unit that blocked it twice in one frame, at its own `atk_scale`; Blink no longer casts', () => {
  const { c, w, e } = arena(mace({ skill: { CircleAttack2: { initCooldown: 999 } }, bb: { Blink2: { dist: 1, atk_scale: 1.4 } } }));
  const at = secondForm(w, c, e);
  const hits = watch(w, e);
  e.atkCd = 1e9;
  deploy(w, c, [['guard', 1, 2]]);
  const g = opAt(w, 1, 2);
  step(w, c);
  assert.deepEqual([e.ab['Blink.cd'], e.ab['Blink2.cd']], [0, 899], 'only the second form\'s 速杀');
  run(w, c, 9);
  assert.deepEqual(hits, [at + 11, at + 11].map((frame) => ({ frame, target: g.id, amount: 900 * 1.4, pen: 0, attack: false, skill: true })));
  // the page's 0.5 s (FOE_EXTRAS `glide`): 15 even steps, the 14th not yet there
  run(w, c, 4);
  close(e.x, 2 + 14 / 15);
  step(w, c);
  close(e.x, 3);
});

test('[敌能-157] 肆虐风雪: at its first cooldown, our units within `range_radius` — 迷彩 and flying ones too; not 隐匿, not a neutral unit — take its current 攻击力 × `atk_scale` as physical skill damage, the blocker with 20% of its 防御 ignored; it takes the attack\'s turn', () => {
  for (const radius of [1.5, 2]) {
    const def = mace({ skill: { Blink: { initCooldown: 999 }, CircleAttack: { initCooldown: 10 } }, bb: { CircleAttack: { atk_scale: 1.3, range_radius: radius } } });
    const { c, w, e } = arena(def, [], { man: true, tune: sturdy });
    const hits = watch(w, e);
    deploy(w, c, [['guard', 1, 2], ['sniper', 0, 3], ['archer', 2, 2], ['wall', 1, 4]]);
    const [g, sn, ar, wall] = [opAt(w, 1, 2), opAt(w, 0, 3), opAt(w, 2, 2), opAt(w, 1, 4)];
    buffs.addBuff(sn, buffs.makeBuff({ key: 'camo', flags: { camou: true } }));
    buffs.addBuff(ar, buffs.makeBuff({ key: 'hide', flags: { stealth: true } }));
    buffs.addBuff(wall, buffs.makeBuff({ key: 'up', flags: { hover: true } }));
    buffs.addBuff(e, buffs.makeBuff({ key: 'testAtk', mods: { atkPct: 0.5 } }));
    assert.equal(attrs.statsOf(wall).flying, true);
    run(w, c, 298);
    assert.equal(hits.filter((h) => h.skill).length, 0, 'not before 10 s');
    const hp = g.hp;
    step(w, c);
    const want = [{ id: g.id, pen: 0.2 }, { id: sn.id, pen: 0 }, ...(radius === 2 ? [{ id: wall.id, pen: 0 }] : [])];
    assert.deepEqual(hits.filter((h) => h.skill), want.map((x) => ({ frame: 300, target: x.id, amount: 1350 * 1.3, pen: x.pen, attack: false, skill: true })));
    close(hp - g.hp, 1350 * 1.3 - 0.8 * GUARD_DEF);
    assert.deepEqual([e.ab['CircleAttack.cd'], e.atkCd, ar.hp], [449, HELD, 1e6]);
    run(w, c, 120);
    assert.deepEqual(hits.filter((h) => h.attack).map((h) => h.frame), [1, 121, 241, 420], 'the attack due at 361 waited its interval');
  }
});

test('[敌能-157] 肆虐风雪 casts with nobody near; in the second form CircleAttack2 hits each unit twice in one frame, the blocker with 40% of its 防御 ignored', () => {
  const alone = arena(mace({ skill: { Blink: { initCooldown: 999 }, CircleAttack: { initCooldown: 1, cooldown: 12 } } }));
  run(alone.w, alone.c, 30);
  assert.equal(alone.e.ab['CircleAttack.cd'], 359, 'cast at 30 frames with no one in range; then 12 s');
  const def = mace({ skill: { Blink2: { initCooldown: 999 }, CircleAttack: { initCooldown: 1 }, CircleAttack2: { initCooldown: 2 } }, bb: { CircleAttack2: { atk_scale: 0.8 } } });
  const { c, w, e } = arena(def, [], { tune: sturdy });
  const at = secondForm(w, c, e);
  e.atkCd = 1e9;
  const hits = watch(w, e);
  deploy(w, c, [['guard', 1, 2], ['sniper', 0, 2]]);
  const g = opAt(w, 1, 2), sn = opAt(w, 0, 2);
  run(w, c, 58);
  assert.deepEqual([e.ab['CircleAttack.cd'], hits.length], [0, 0], 'the first form\'s 肆虐风雪 is ready and does not cast');
  const hp = g.hp;
  step(w, c);
  const one = (/** @type {number} */ id, /** @type {number} */ pen) => ({ frame: at + 60, target: id, amount: 900 * 0.8, pen, attack: false, skill: true });
  assert.deepEqual(hits, [one(g.id, 0.4), one(sn.id, 0), one(g.id, 0.4), one(sn.id, 0)]);
  close(hp - g.hp, 2 * (720 - 0.6 * GUARD_DEF));
});

test('[敌能-157] one skill a frame, in the table\'s order: 肆虐风雪 and 速杀 both ready on a blocked frame — 速杀 casts, 肆虐风雪 the frame after; unblocked, 肆虐风雪 does not wait', () => {
  const { c, w, e } = arena(mace(), [], { at: { x: 1, y: 1 } });
  deploy(w, c, [['guard', 1, 1]]);
  e.ab['CircleAttack.cd'] = 0;
  step(w, c);
  assert.deepEqual([e.ab['Blink.cd'], has(e, 'blinkSlip'), e.ab['CircleAttack.cd'], has(e, 'maceCast')], [899, true, 0, true], '速杀 first, 肆虐风雪 still ready');
  step(w, c);
  assert.deepEqual([e.ab['CircleAttack.cd'], e.ab['Blink.cd']], [449, 898], '肆虐风雪 the frame after');
  const lone = arena(mace(), [], { at: { x: 1, y: 1 } });
  lone.e.ab['CircleAttack.cd'] = 0;
  step(lone.w, lone.c);
  assert.deepEqual([lone.e.ab['CircleAttack.cd'], lone.e.ab['Blink.cd']], [449, 0], 'not blocked: 速杀 cannot go, so 肆虐风雪 does not wait for it');
});

test('[敌能-157] the rebirth stops a 速杀 under way: the glide stays where it was, also once the second form begins, and the hit never lands', () => {
  const quiet = { CircleAttack: { initCooldown: 999 }, CircleAttack2: { initCooldown: 999 }, Blink2: { initCooldown: 999 } };
  const { c, w, e } = arena(mace({ skill: quiet }), [], { at: { x: 1, y: 1 } });
  const hits = watch(w, e);
  e.atkCd = 1e9;
  deploy(w, c, [['guard', 1, 1]]);
  run(w, c, 2);
  close(e.x, 1.2);
  damage.setHp(e, 0);
  step(w, c);
  assert.equal(has(e, 'reborn'), true, 'at 0 HP it has no turn; reviving from that frame\'s end');
  repin(e);
  run(w, c, 20);
  close(e.x, 1.2);
  assert.deepEqual([hits.length, e.ab['Blink.due']], [0, 0]);
  run(w, c, 140);
  assert.equal(has(e, 'maceSecond'), true);
  close(e.x, 1.2);
  assert.deepEqual([hits.length, e.ab['Blink.n']], [0, 0], 'the glide does not go on after the rebirth');
});

test('[敌能-157] [关卡-2] other shapes stay inert: 速杀 with 路加萨尔古斯\'s blackboard (no `glide`) and a 肆虐风雪 with a key more do nothing, blocked and ready, in either form', () => {
  const def = /** @type {any} */ (mace());
  def.skills = def.skills.map((/** @type {any} */ s) => ({ ...s, bb: s.key.startsWith('Blink') ? { atk_scale: 1.5, dist: 1.5 } : { ...s.bb, extra: 1 } }));
  const { c, w, e } = arena(def, [], { at: { x: 1, y: 1 } });
  const hits = watch(w, e);
  e.atkCd = 1e9;
  deploy(w, c, [['guard', 1, 1]]);
  const g = opAt(w, 1, 1);
  e.ab['CircleAttack.cd'] = 0;
  step(w, c);
  assert.deepEqual([e.blockedBy, has(e, 'blinkSlip'), e.ab['Blink.cd'], e.ab['CircleAttack.cd'], hits.length], [g.id, false, 0, 0, 0], 'first form');
  secondForm(w, c, e);
  e.ab['CircleAttack2.cd'] = 0;
  run(w, c, 2);
  assert.deepEqual([e.blockedBy, has(e, 'blinkSlip'), e.ab['Blink2.cd'], e.ab['CircleAttack2.cd'], hits.length], [g.id, false, 0, 0, 0], 'second form');
});
