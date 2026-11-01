// 扎罗，“狼之主” (docs/spec/foes.md 敌能-148): the shapes the read page covers, the first form's guard, the rebirth with
// its HP coming back, 【远古威慑】 and the second form. The two skills are in wolflord-skills.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { step, attrs, damage, status, buffs } from '@aue/sim';
import { oneWave, spawnAt } from '@aue/testkit';
import { FOE_EXTRAS, uncoveredAbilities, withoutIncomplete } from '../src/foes.js';
import { KEY, AGAIN, rawWolf, wolf, arena, run, hitsOn, fell, pin, unitOf, buffOf } from './wolflord-arena.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('./wolflord-arena.js').WolfChange} WolfChange */

/** @param {Unit} u */
const stats = (u) => attrs.statsOf(u);
/** @param {Unit} u @param {string} key */
const has = (u, key) => u.buffs.some((b) => b.key === key);
/** @param {number} a @param {number} b */
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('[敌能-148] the page row adds the markers and the page-only numbers, and only the read record is covered', () => {
  const x = FOE_EXTRAS[KEY];
  assert.ok(x?.source.endsWith('oldid=365712'));
  assert.deepEqual(x?.talents, { Passive: { page: 1 }, Reborn: { range_radius: 1.5, attack_speed: -50 }, Passive2: { range_radius: 1.25, times: 2 } });
  assert.deepEqual(x?.skills, { WildCalling: { page: 1 }, FearCage: { init_sp: 0, sp_recovery_per_sec: 1 } });
  assert.deepEqual(uncoveredAbilities([wolf()]), []);
  assert.deepEqual(uncoveredAbilities([rawWolf()]), ['Passive', 'Passive2', 'WildCalling', 'FearCage']);
  // 依然“狼之主”: the same blackboards, no saved page, no row. Its duration-only Reborn is not this clause's.
  assert.equal(FOE_EXTRAS[AGAIN], undefined);
  assert.deepEqual(uncoveredAbilities([rawWolf(true)]), ['Passive', 'Passive2', 'WildCalling', 'FearCage']);
  const kept = withoutIncomplete(rawWolf(true));
  assert.deepEqual(Object.keys(kept.talents ?? {}), ['Reborn']);
  assert.deepEqual(kept.skills, []);
});

test('[敌能-148] a key more, a key less or a text value is not the read shape', () => {
  /** @param {WolfChange} o */
  const gaps = (o) => uncoveredAbilities([wolf(o)]);
  assert.deepEqual(gaps({ bb: { Passive: { extra: 1 } } }), ['Passive']);
  assert.deepEqual(gaps({ bb: { Passive: { page: 'x' } } }), ['Passive']);
  assert.deepEqual(gaps({ bb: { Passive2: { times: '2' } } }), ['Passive2']);
  assert.deepEqual(gaps({ bb: { Passive2: { damage_scale: 0.5 } } }), ['Passive2']);
  assert.deepEqual(gaps({ bb: { WildCalling: { page: '1' } } }), ['WildCalling']);
  assert.deepEqual(gaps({ bb: { FearCage: { max_target: '3' } } }), ['FearCage']);
  assert.deepEqual(gaps({ bb: { FearCage: { extra: 0 } } }), ['FearCage']);
  // 血骑士狄开俄波利斯's Passive2 is another ability of the name; it stays uncovered and is left out of a tested record.
  const knight = { name: 'k', maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { Passive2: { damage_scale: 0.5, atk: 0.5, invincible_time: 6 } } };
  assert.deepEqual(uncoveredAbilities([knight]), ['Passive2']);
  assert.deepEqual(withoutIncomplete(knight).talents, {});
});

test('[敌能-148] the first form: physical and arts damage × (1 − damage_resistance), true damage whole, no stun, 失衡免疫', () => {
  for (const dr of [0.3, 0.45]) {
    const { c, w, e } = arena(wolf({ bb: { Passive: { damage_resistance: dr } }, def: { def: 0, res: 0 } }));
    assert.equal(stats(e).flags.noDisplace, true);
    for (const type of /** @type {const} */ (['phys', 'arts', 'true'])) {
      const before = e.hp;
      damage.dealDamage(w, null, e, { type, amount: 1000 });
      assert.ok(near(before - e.hp, type === 'true' ? 1000 : 1000 * (1 - dr)), `${type} ${dr}`);
    }
    status.applyStatus(e, 'stun', { seconds: 5 });
    assert.equal(stats(e).flags.stun, undefined);
    assert.equal(stats(e).disabled, false);
    // something took the guard off: back on its next turn, still the first form
    buffs.removeBuff(e, 'wolfGuard');
    buffs.removeBuff(e, 'wolfSteady');
    step(w, c);
    assert.deepEqual([has(e, 'wolfGuard'), stats(e).flags.noDisplace], [true, true]);
  }
});

test('[敌能-148] the first fall is 敌能-18’s rebirth, once: buffs cleared, the HP back k ÷ N of the current maximum a frame, the first cooldowns at its end', () => {
  for (const seconds of [40, 2]) {
    const { c, w, e } = arena(wolf({ bb: { Reborn: { duration: seconds } } }));
    const n = secondsToFrames(seconds);
    status.applyStatus(e, 'stun', { seconds: 99 });
    run(w, c, 3);
    fell(w, c, e);
    assert.ok(w.units.includes(e));
    assert.ok(near(e.hp, 35000 / n));
    const s = stats(e);
    assert.deepEqual([s.flags.invincible, s.flags.untargetable, s.flags.unblockable, s.flags.sidelined], [true, true, true, true]);
    assert.deepEqual(e.buffs.map((b) => b.key).toSorted(), ['reborn', 'wolfFallen', 'wolfSteady']);
    // a maximum raised during the rebirth: the HP comes back to the current one, not the data's
    buffs.addBuff(e, buffs.makeBuff({ key: 'test:hp', mods: { hpFlat: 5000 } }));
    const max = 40000;
    step(w, c);
    assert.ok(near(e.hp, max / n));
    step(w, c);
    assert.ok(near(e.hp, (max * 2) / n));
    run(w, c, n - 3);
    assert.ok(near(e.hp, (max * (n - 1)) / n));
    assert.equal(has(e, 'reborn'), true);
    step(w, c);
    assert.equal(has(e, 'reborn'), false);
    assert.equal(e.hp, max);
    // 敌能-18: the cooldowns start over at the rebirth's end; this turn already took one frame off
    assert.equal(e.ab['WildCalling.cd'], secondsToFrames(5) - 1);
    assert.deepEqual([has(e, 'wolfGuard'), stats(e).flags.noDisplace, stats(e).flags.stun], [false, true, undefined]);
    pin(e);
    damage.dealDamage(w, null, e, { type: 'true', amount: 1e6 });
    assert.equal(e.hp, max, 'invincible for invincible_time after the rebirth');
    run(w, c, secondsToFrames(10));
    damage.dealDamage(w, null, e, { type: 'true', amount: 1000 });
    run(w, c, 3);
    assert.equal(e.hp, max - 1000, 'no refill in the second form');
    damage.dealDamage(w, null, e, { type: 'true', amount: 1e6 });
    assert.equal(e.hp, 0);
    step(w, c);
    assert.equal(w.units.includes(e), false, 'the second fall leaves the field');
  }
});

test('[敌能-148] a knockdown by damage starts the rebirth as setting the HP to 0 does', () => {
  const { c, w, e } = arena(wolf());
  damage.dealDamage(w, null, e, { type: 'true', amount: 35000 });
  assert.equal(e.hp, 0);
  step(w, c);
  assert.deepEqual([w.units.includes(e), has(e, 'reborn'), has(e, 'wolfFallen')], [true, true, true]);
});

/** Our units around 扎罗 for 【远古威慑】: d 1 (row 0), d √2 (row 0, col 3), a flyer at d 1, d 2 on the road. */
const AROUND = /** @type {[string, number, number][]} */ ([['sniper', 0, 2], ['archer', 0, 3], ['bird', 2, 2], ['guard', 1, 4]]);

test('[敌能-148] 【远古威慑】 from the first fall on: 攻击速度 + attack_speed within range_radius of its centre, flyers too', () => {
  for (const [radius, aspd] of [[1.5, -50], [2, -30]]) {
    const { c, w, e } = arena(wolf({ bb: { Reborn: { range_radius: radius, attack_speed: aspd } } }), AROUND);
    const [one, two, bird, far] = AROUND.map(([op]) => unitOf(w, op));
    // another 直接加算 on one of them: the two add up
    buffs.addBuff(two, buffs.makeBuff({ key: 'test:aspd', mods: { aspd: 20 } }));
    run(w, c, 5);
    assert.equal([one, two, bird, far].some((u) => has(u, 'ancientAwe')), false, 'nothing before the fall');
    fell(w, c, e);
    step(w, c);
    for (const u of [one, bird]) assert.equal(stats(u).aspd, 100 + aspd);
    assert.equal(stats(two).aspd, 120 + aspd, '直接加算');
    assert.equal(stats(far).aspd, radius >= 2 ? 100 + aspd : 100);
    assert.equal(buffOf(one, 'ancientAwe')?.left, 2);
  }
});

test('[敌能-148] 【远古威慑】 skips neutral, lifted and stealthed units, not camouflaged ones, lasts into the second form, and ends two frames after one leaves', () => {
  const { c, w, e } = arena(wolf({ bb: { Reborn: { duration: 1 } } }), [['sniper', 0, 2], ['archer', 0, 3], ['bird', 2, 2], ['guard', 1, 3]], (k) => {
    k.enemies.npc = { name: 'npc', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 0.1, neutral: true };
    k.level.waves = [oneWave([spawnAt(0, KEY), spawnAt(0, 'npc')])];
  });
  const [one, two, bird, cam] = ['sniper', 'archer', 'bird', 'guard'].map((op) => unitOf(w, op)), npc = unitOf(w, 'npc');
  Object.assign(npc, { x: 1, y: 1, path: [], pt: 0 });
  status.applyStatus(npc, 'root', {});
  buffs.addBuff(two, buffs.makeBuff({ key: 'lift', flags: { liftoff: true } }));
  buffs.addBuff(bird, buffs.makeBuff({ key: 'hide', flags: { stealth: true } }));
  // 迷彩 does not hide a unit from an aura (异常效果, 阻挡-2)
  buffs.addBuff(cam, buffs.makeBuff({ key: 'cam', flags: { camou: true } }));
  fell(w, c, e);
  step(w, c);
  assert.deepEqual([one, two, bird, npc, cam].map((u) => has(u, 'ancientAwe')), [true, false, false, false, true], 'reviving');
  run(w, c, 30);
  pin(e);
  run(w, c, 10);
  assert.deepEqual([has(e, 'reborn'), has(e, 'wolfRage')], [false, true]);
  assert.equal(stats(one).aspd, 50);
  assert.deepEqual([has(two, 'ancientAwe'), has(bird, 'ancientAwe')], [false, false], 'the second form');
  buffs.removeBuff(two, 'lift');
  step(w, c);
  assert.equal(stats(two).aspd, 50, 'landed again, it is in');
  Object.assign(one, { y: -3 });
  step(w, c);
  assert.equal(has(one, 'ancientAwe'), true);
  step(w, c);
  assert.equal(has(one, 'ancientAwe'), false);
});

test('[敌能-148] the second form: invincible_time s of 无敌 that cannot be selected, 攻击力 + atk (直接乘算), 攻击间隔 + base_attack_time (直接加算)', () => {
  for (const [seconds, atk, bat] of [[10, 0.5, -1.5], [2, 0.25, -1]]) {
    const { c, w, e } = arena(wolf({ bb: { Reborn: { duration: 1 }, Passive2: { invincible_time: seconds, atk, base_attack_time: bat } }, without: ['WildCalling'] }));
    fell(w, c, e);
    run(w, c, secondsToFrames(1));
    assert.equal(has(e, 'reborn'), false);
    assert.equal(buffOf(e, 'reborn:invincible')?.left, secondsToFrames(seconds));
    assert.deepEqual([stats(e).flags.invincible, stats(e).flags.untargetable], [true, true]);
    // another 直接乘算 of each: 攻击力 adds to it, 攻击间隔 comes before it
    buffs.addBuff(e, buffs.makeBuff({ key: 'test:mods', mods: { atkPct: 0.2, batPct: 0.5 } }));
    assert.ok(near(stats(e).atk, 800 * (1 + atk + 0.2)));
    assert.ok(near(stats(e).bat, (4 + bat) * 1.5));
    run(w, c, secondsToFrames(seconds) - 1);
    assert.equal(stats(e).flags.invincible, true);
    step(w, c);
    assert.equal(stats(e).flags.invincible, undefined);
    buffs.removeBuff(e, 'wolfRage');
    step(w, c);
    assert.ok(near(stats(e).atk, 800 * (1 + atk + 0.2)), 'the rage is put back');
  }
});

test('[敌能-148] one buff of each key however many turns pass; wolfFallen comes back after it was taken off, and the guard stays off', () => {
  const { c, w, e } = arena(wolf({ bb: { Reborn: { duration: 1 } }, without: ['WildCalling'] }), [['sniper', 0, 2]]);
  const sniper = unitOf(w, 'sniper');
  /** @param {Unit} u @param {string} key */
  const count = (u, key) => u.buffs.filter((b) => b.key === key).length;
  run(w, c, 10);
  assert.deepEqual([count(e, 'wolfSteady'), count(e, 'wolfGuard')], [1, 1], 'the first form');
  fell(w, c, e);
  run(w, c, secondsToFrames(1) + 10);
  assert.deepEqual(['wolfSteady', 'wolfFallen', 'wolfRage', 'wolfGuard'].map((k) => count(e, k)), [1, 1, 1, 0], 'the second form');
  assert.equal(count(sniper, 'ancientAwe'), 1);
  buffs.removeBuff(e, 'wolfFallen');
  run(w, c, 2);
  assert.deepEqual([count(e, 'wolfFallen'), count(e, 'wolfGuard')], [1, 0]);
});

/**
 * 扎罗 past a 1 s rebirth, WildCalling left out so it attacks all the while; pinned again, its attack ready. `prep` runs
 * once our units are on the field, before the fall.
 * @param {WolfChange} o @param {[string, number, number][]} ops @param {(w: import('@aue/sim').World) => void} [prep]
 */
function raging(o, ops, prep) {
  const a = arena(wolf({ ...o, bb: { ...o.bb, Reborn: { duration: 1 } }, without: ['WildCalling'] }), ops);
  prep?.(a.w);
  fell(a.w, a.c, a.e);
  run(a.w, a.c, secondsToFrames(1));
  pin(a.e);
  a.e.atkCd = 0;
  return a;
}

test('[敌能-148] the second form hits at range_radius + 0.25, `times` hits a swing of 攻击力 × 1, 2.5 s apart', () => {
  for (const times of [2, 3]) {
    const { c, w, e } = raging({ bb: { Passive2: { times } } }, [['archer', 0, 3]]);
    const hits = hitsOn(w, c, unitOf(w, 'archer').id, secondsToFrames(2.5) + 1);
    assert.equal(hits.length, 2 * times);
    assert.ok(hits.every((h) => h.src === e.id && near(h.damage, 1200)));
    assert.equal(hits[times].frame - hits[0].frame, secondsToFrames(2.5));
  }
  for (const [radius, reached] of [[1.25, false], [1.8, true]]) {
    const { c, w } = raging({ bb: { Passive2: { range_radius: radius } } }, [['guard', 1, 4]]);
    assert.equal(hitsOn(w, c, unitOf(w, 'guard').id, 10).length > 0, reached, `radius ${radius}`);
  }
});

test('[敌能-148] the ranged attack skips flyers and lifted units; blocked, the melee is `times` hits too, on a camouflaged blocker as well; the first form hits only its blocker, once a swing', () => {
  // each later deploy is first in attack order (索敌-5): the sniper is hit only if the flyer, the lifted one and the
  // camouflaged one are left out
  for (const [other, row, col, flag] of /** @type {[string, number, number, string][]} */ ([['bird', 2, 2, ''], ['archer', 2, 3, 'liftoff'], ['archer', 2, 3, 'camou']])) {
    const mark = (/** @type {import('@aue/sim').World} */ x) => { if (flag) buffs.addBuff(unitOf(x, other), buffs.makeBuff({ key: `test:${flag}`, flags: { [flag]: true } })); };
    const { c, w } = raging({}, [['sniper', 0, 2], [other, row, col]], mark);
    const them = unitOf(w, other);
    assert.equal(hitsOn(w, c, unitOf(w, 'sniper').id, 3).length, 2, `${other} ${flag}`);
    assert.equal(them.hp, 40000);
  }
  const held = raging({}, [['wall', 1, 2]]);
  const wall = unitOf(held.w, 'wall');
  assert.equal(held.e.blockedBy, wall.id);
  assert.equal(hitsOn(held.w, held.c, wall.id, 3).length, 2);
  // 迷彩 keeps a unit out of the ranged reach, not off the blocker's place in the candidates
  const hid = raging({}, [['wall', 1, 2]], (x) => { buffs.addBuff(unitOf(x, 'wall'), buffs.makeBuff({ key: 'cam', flags: { camou: true } })); });
  const camWall = unitOf(hid.w, 'wall');
  assert.equal(hid.e.blockedBy, camWall.id);
  assert.equal(hitsOn(hid.w, hid.c, camWall.id, 3).length, 2, 'a camouflaged blocker is still hit');
  const first = arena(wolf(), [['archer', 0, 3]]);
  first.e.atkCd = 0;
  assert.deepEqual(hitsOn(first.w, first.c, unitOf(first.w, 'archer').id, 200), []);
  const melee = arena(wolf(), [['wall', 1, 2]]);
  melee.e.atkCd = 0;
  assert.equal(hitsOn(melee.w, melee.c, unitOf(melee.w, 'wall').id, 3).length, 1, 'the first form hits its blocker once a swing');
});
