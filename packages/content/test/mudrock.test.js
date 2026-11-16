// 泥岩 (docs/spec/foes.md 敌能-143): 沉睡免疫, the attack layers of `charge`, 刷新屏障 setting 敌能-66's barrier back, and
// the idle 占据. It is in no level of the engine: its record is enemy_database (17759cc8) level 0, built here as
// defdown.test.js builds 碎骨. Blackboard numbers are changed in places, so that a constant in the code would fail.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, damage, bus, displacement, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, withoutIncomplete, uncoveredAbilities, foeBehaviors, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const KEY = 'enemy_1511_mdrock';
const ATK = 'attack@enemy_mdrock_s_1[charge].atk';
/** enemy_database level 0: `shield.*` and RefreshShield's blackboard are the same three numbers. */
const BARRIER = { dynamic: 5500, max_hp: 0.5, attack_speed: 50 };
const OCCUPY = { key: 'occupy', cooldown: 35, initCooldown: 35, sp: 0, bb: { sp: -1 } };
const S = attrs.statsOf;

/**
 * 泥岩 at enemy_database level 0 (17759cc8): maxHp 45000, atk 800, def 1000, magicResistance 30, moveSpeed 0.6,
 * baseAttackTime 4.5, massLevel 6, applyWay MELEE, silenceImmune, the talents and the two skills. `over` changes it.
 * @param {{ refresh?: Record<string, number>, cd?: [number, number], skills?: any[], immune?: string[], attack?: object }} [over]
 * @returns {EnemyDef}
 */
function rock(over = {}) {
  const { refresh, cd, skills, ...rest } = over;
  return /** @type {EnemyDef} */ ({
    name: '泥岩', maxHp: 45000, atk: 800, def: 1000, res: 30, moveSpeed: 0.6, baseAttackTime: 4.5, rangeRadius: 0, applyWay: 'MELEE', motion: 'WALK',
    massLevel: 6, levelType: 'BOSS', lifePointReduce: 2, immune: ['silence'], tags: ['sarkaz'],
    talents: { charge: { [ATK]: 0.6 }, shield: { ...BARRIER } },
    skills: skills ?? [{ key: 'RefreshShield', cooldown: cd?.[1] ?? 17, initCooldown: cd?.[0] ?? 17, sp: 0, bb: { ...BARRIER, ...refresh } }, { ...OCCUPY }],
    ...rest,
  });
}

/** The record with the page's extras merged (FOE_EXTRAS), then changed by `tune`. @param {EnemyDef} def @param {(d: any) => void} [tune] */
function merged(def, tune) {
  const d = /** @type {any} */ (withFoeExtras(KEY, def));
  tune?.(d);
  return /** @type {EnemyDef} */ (d);
}

/**
 * 泥岩 spawns in frame 0 and stands rooted on the road at (2, 1). The guard that may block it later takes every hit in
 * full: no defence, a great deal of HP.
 * @param {EnemyDef} def
 */
function stand(def) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [KEY]: def };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, KEY)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  Object.assign(c.operators.guard, { cost: 0, maxHp: 1e9, atk: 0, def: 0, res: 0 });
  const w = /** @type {World} */ (createWorld(c, { seed: 1, players: 1 }));
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.kind === KIND.ENEMY));
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  /** @type {{ f: number, damage: number }[]} */
  const hits = [];
  return { c, w, e, hits };
}

/** One frame, noting 泥岩's hits. @param {ReturnType<typeof stand>} box @param {any[]} [cmds] */
function once(box, cmds = []) {
  const f = box.w.frame;
  for (const ev of step(box.w, box.c, cmds)) if (ev.type === 'hit' && ev.id === box.e.id) box.hits.push({ f, damage: /** @type {any} */ (ev).damage });
}

/** Frames up to and including `last`. @param {ReturnType<typeof stand>} box @param {number} last */
function run(box, last) {
  while (box.w.frame <= last) once(box);
}

/** The guard deploys on 泥岩's tile in this frame and blocks it. @param {ReturnType<typeof stand>} box @returns {Unit} */
function block(box) {
  once(box, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  return /** @type {Unit} */ (box.w.units.find((u) => u.kind === KIND.OPERATOR));
}

/** Arts damage on 泥岩 (法术抗性 30 takes 30 % first). @param {ReturnType<typeof stand>} box @param {number} amount */
const arts = (box, amount) => damage.dealDamage(box.w, null, box.e, { type: 'arts', amount }, box.c);
/** @param {Unit} e */
const shields = (e) => e.buffs.filter((b) => b.key === 'mudShield');
/** HP, maximum, attack speed and the barrier; −n when there are n barrier buffs. @param {Unit} e */
function view(e) {
  const b = shields(e);
  return { hp: e.hp, max: e.maxHp, aspd: S(e).aspd, barrier: b.length === 1 ? b[0].value : b.length === 0 ? null : -b.length };
}
/** @param {Unit} e */
const layers = (e) => e.buffs.filter((b) => b.key === 'rockCharge');
/** @param {number} a @param {number} b */
const near = (a, b) => Math.abs(a - b) < 1e-6;
/** @param {number[]} got @param {number[]} want */
const nearAll = (got, want) => got.length === want.length && got.every((v, i) => near(v, want[i]));
/** An enemy of other abilities only (关卡-2). @param {Record<string, unknown>} part @returns {EnemyDef} */
const other = (part) => /** @type {EnemyDef} */ ({ name: 'o', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, ...part });
/** @param {string} key @param {Record<string, unknown>} bb */
const skill = (key, bb) => ({ key, cooldown: 10, initCooldown: 10, sp: 0, bb });

test('[敌能-143] [关卡-2] the page\'s layer cap and markers are 泥岩\'s alone; the other shapes of its four names stay uncovered', () => {
  const x = FOE_EXTRAS[KEY];
  assert.deepEqual(x?.talents, { SleepImmune: {}, shield: { page: 1 }, charge: { layers: 6 } });
  assert.deepEqual(x?.skills, { RefreshShield: { page: 1 }, occupy: { page: 1 } });
  assert.match(x?.source ?? '', /oldid=378890$/);
  for (const k of ['SleepImmune', 'charge', 'shield', 'RefreshShield', 'occupy']) assert.equal(Object.hasOwn(foeBehaviors, k), true, k);
  const read = withFoeExtras(KEY, rock());
  assert.deepEqual(uncoveredAbilities([read]), []);
  assert.equal(withoutIncomplete(read), read);
  assert.deepEqual(uncoveredAbilities([rock()]), ['charge', 'shield', 'RefreshShield', 'occupy']);
  const bare = withoutIncomplete(rock());
  assert.deepEqual([bare.talents, bare.skills], [{}, []]);
  // The other users of the names, as enemy_database (17759cc8) has them.
  const others = /** @type {[EnemyDef, string][]} */ ([
    [other({ talents: { charge: { sp: 1 } } }), 'charge'], // 萨卡兹征用工程无人机 / 尖端无人机
    [other({ skills: [skill('charge', { hit_duration: 25, sp: -2, duration: 25 })] }), 'charge'], // 莱塔尼亚轻语者 / 吟唱者
    [other({ skills: [skill('charge', { sp_ratio: 0, sp: -1, 'enemy_act29side[recover_sp_timer].sp_ratio': 1, 'enemy_act29side[recover_sp_timer].recover_sp_duration': 3 })] }), 'charge'],
    [other({ skills: [skill('RefreshShield', { dynamic: 3333 })] }), 'RefreshShield'], // “物欲拮抗者”
    [other({ talents: { occupy: { sp: -1 } } }), 'occupy'], // 冬灵血巫 / 冬灵血巫大师
  ]);
  for (const [def, name] of others) assert.deepEqual(uncoveredAbilities([def]), [name], name);
  assert.equal(uncoveredAbilities([withFoeExtras('enemy_1089_ltlntc', other({ talents: { occupy: { sp: -1 } } }))]).includes('occupy'), true);
});

test('[敌能-143] [关卡-2] a string, a missing key, an extra key or a cap below one is not the shape', () => {
  const page = (/** @type {Record<string, unknown>} */ part) => uncoveredAbilities([/** @type {EnemyDef} */ (/** @type {unknown} */ (other(part)))]);
  assert.deepEqual(page({ talents: { charge: { [ATK]: 0.6, layers: 6 } } }), []);
  assert.deepEqual(page({ skills: [skill('RefreshShield', { ...BARRIER, page: 1 })] }), []);
  assert.deepEqual(page({ skills: [skill('occupy', { sp: -1, page: 1 })] }), []);
  for (const charge of [{ [ATK]: '0.6', layers: 6 }, { [ATK]: 0.6, layers: '6' }, { [ATK]: 0.6, layers: 0 }, { [ATK]: 0.6 }, { [ATK]: 0.6, layers: 6, sp: 1 }]) {
    assert.deepEqual(page({ talents: { charge } }), ['charge'], JSON.stringify(charge));
  }
  for (const bb of [{ ...BARRIER, dynamic: '5500', page: 1 }, { ...BARRIER }, { ...BARRIER, page: 1, interval: 8 }, { dynamic: 5500, page: 1 }]) {
    assert.deepEqual(page({ skills: [skill('RefreshShield', bb)] }), ['RefreshShield'], JSON.stringify(bb));
  }
  for (const bb of [{ sp: '-1', page: 1 }, { sp: -1 }, { sp: -1, page: 1, radius: 1 }]) {
    assert.deepEqual(page({ skills: [skill('occupy', bb)] }), ['occupy'], JSON.stringify(bb));
  }
});

test('[敌能-143] [敌能-66] appearing: the 16500 arts barrier with +50% max HP and +50 attack speed; another dynamic, another barrier', () => {
  const box = stand(merged(rock()));
  assert.deepEqual(view(box.e), { hp: 67500, max: 67500, aspd: 150, barrier: 16500 });
  assert.equal(S(box.e).interval, 3);
  assert.equal(arts(box, 1000), 0);
  assert.deepEqual(view(box.e), { hp: 67500, max: 67500, aspd: 150, barrier: 15800 });
  assert.equal(damage.dealDamage(box.w, null, box.e, { type: 'true', amount: 500 }, box.c), 500);
  assert.equal(view(box.e).barrier, 15800);
  const thin = stand(merged(rock(), (d) => { d.talents.shield.dynamic = 1000; d.talents.shield.max_hp = 0.2; d.talents.shield.attack_speed = 30; }));
  assert.deepEqual(view(thin.e), { hp: 54000, max: 54000, aspd: 130, barrier: 3000 });
  const unread = stand(rock());
  assert.deepEqual(view(unread.e), { hp: 45000, max: 45000, aspd: 100, barrier: null });
});

test('[敌能-143] 沉睡免疫 from the appearance: 沉睡 is kept but does not act; taken away, it is back the next frame; silence cannot land', () => {
  const box = stand(merged(rock()));
  const e = box.e;
  assert.equal(e.buffs.filter((b) => b.key === 'sleepImmune').length, 1);
  status.applyStatus(e, 'sleep', {});
  assert.equal(e.buffs.some((b) => b.key === 'sleep'), true, '沉睡免疫不会清除相关BUFF');
  assert.deepEqual([S(e).flags.sleep, S(e).disabled, S(e).invincible], [undefined, false, false]);
  assert.equal(arts(box, 1000), 0);
  assert.equal(view(e).barrier, 15800, 'not invincible: the barrier takes the hit');
  buffs.removeBuff(e, 'sleepImmune');
  assert.deepEqual([S(e).flags.sleep, S(e).disabled], [true, true]);
  once(box);
  assert.deepEqual([S(e).flags.sleep, S(e).disabled], [undefined, false]);
  run(box, 60);
  assert.equal(e.buffs.filter((b) => b.key === 'sleepImmune').length, 1, 'one buff, not one per frame');
  status.applyStatus(e, 'silence', {});
  assert.equal(S(e).flags.silence, undefined);
  const plain = stand(rock());
  status.applyStatus(plain.e, 'sleep', {});
  assert.equal(S(plain.e).flags.sleep, true, 'the data has no 沉睡免疫');
});

test('[敌能-143] 刷新屏障 at 17 s and every 17 s: the barrier back to 3 × dynamic; with some left the one buff is retuned', () => {
  const box = stand(merged(rock()));
  arts(box, 10000);
  assert.equal(view(box.e).barrier, 9500);
  run(box, 509);
  assert.equal(view(box.e).barrier, 9500);
  assert.equal(box.e.ab['RefreshShield.cd'], 0);
  once(box);
  assert.deepEqual(view(box.e), { hp: 67500, max: 67500, aspd: 150, barrier: 16500 });
  assert.equal(shields(box.e).length, 1);
  arts(box, 30000);
  assert.deepEqual(view(box.e), { hp: 40500, max: 45000, aspd: 100, barrier: null });
  run(box, 1019);
  assert.equal(view(box.e).barrier, null);
  once(box);
  assert.deepEqual(view(box.e), { hp: 60750, max: 67500, aspd: 150, barrier: 16500 });
  assert.equal(shields(box.e)[0].act, 'mudShield');
  assert.equal(arts(box, 10000), 0, 'the given-again barrier absorbs arts as 敌能-66\'s does');
  assert.equal(view(box.e).barrier, 9500);
});

test('[敌能-143] 刷新屏障 reads its own blackboard and cooldowns: 2000 → 6000, +20%, +30, first at 3 s then every 5 s', () => {
  const box = stand(merged(rock({ refresh: { dynamic: 2000, max_hp: 0.2, attack_speed: 30 }, cd: [3, 5] })));
  assert.equal(view(box.e).barrier, 16500, 'the appearance barrier is the talent\'s');
  arts(box, 30000);
  assert.deepEqual(view(box.e), { hp: 40500, max: 45000, aspd: 100, barrier: null });
  run(box, 89);
  assert.equal(view(box.e).barrier, null);
  once(box);
  assert.deepEqual(view(box.e), { hp: 48600, max: 54000, aspd: 130, barrier: 6000 });
  arts(box, 1000);
  run(box, 239);
  assert.equal(view(box.e).barrier, 5300);
  once(box);
  assert.equal(view(box.e).barrier, 6000);
  const unread = stand(merged(rock(), (d) => { delete d.skills[0].bb.page; }));
  arts(unread, 10000);
  run(unread, 600);
  assert.equal(view(unread.e).barrier, 9500, 'without the page marker the skill does nothing');
  const odd = stand(merged(rock(), (d) => { d.skills[0].bb.interval = 8; }));
  arts(odd, 10000);
  run(odd, 600);
  assert.equal(view(odd.e).barrier, 9500, 'another shape does nothing at run time, marker or not');
});

test('[敌能-143] 刷新屏障 takes the attack interval: blocked, the next hit is 90 frames after it; unblocked, the first block waits it out', () => {
  const box = stand(merged(rock()));
  block(box);
  run(box, 700);
  assert.deepEqual(box.hits.map((h) => h.f), [1, 91, 181, 271, 361, 451, 600, 690]);
  assert.equal(box.e.ab['@holdAtk'], undefined);
  const walk = stand(merged(rock()));
  run(walk, 509);
  assert.equal(walk.e.atkCd, 0);
  once(walk);
  assert.equal(walk.e.atkCd, 89);
  run(walk, 519);
  block(walk);
  run(walk, 700);
  assert.deepEqual(walk.hits.map((h) => h.f), [600, 690]);
  const never = stand(merged(rock({ skills: [{ ...OCCUPY }] })));
  run(never, 519);
  block(never);
  assert.deepEqual(never.hits.map((h) => h.f), [520], 'with no 刷新屏障, the block is hit at once');
});

/**
 * 刷新屏障 held back by `hold` from frame 505 to 520 (敌能-143): no cast at 510, the cooldown stays ready, the cast is
 * the first free frame and the cooldown starts again from it.
 * @param {(box: ReturnType<typeof stand>) => void} hold @param {(box: ReturnType<typeof stand>) => void} free
 * @param {{ def?: EnemyDef, blocked?: boolean }} [o]
 */
function heldBack(hold, free, o = {}) {
  const box = stand(o.def ?? merged(rock()));
  if (o.blocked) block(box);
  arts(box, 10000);
  run(box, 504);
  hold(box);
  run(box, 520);
  assert.equal(view(box.e).barrier, 9500);
  assert.equal(box.e.ab['RefreshShield.cd'], 0);
  assert.equal(box.e.ab['@holdAtk'], undefined);
  free(box);
  once(box);
  assert.equal(view(box.e).barrier, 16500);
  arts(box, 10000);
  run(box, 1030);
  assert.equal(view(box.e).barrier, 9500);
  once(box);
  assert.equal(view(box.e).barrier, 16500);
}

test('[敌能-143] [状态-12] stun, 失衡, 恐惧, 不进行攻击, 缴械, 强制缴械, 战栗 while blocked and, without the resistance, silence postpone 刷新屏障', () => {
  heldBack((b) => { status.applyStatus(b.e, 'stun', {}); }, (b) => { buffs.removeBuff(b.e, 'stun'); });
  // 失衡 (位移-3): the turn only slides and does not attack, so the interval would be taken when the slide ends.
  heldBack((b) => { b.e.slide = { vx: 0, vy: 0, hard: 1000 }; }, (b) => { displacement.stopSlide(b.e); });
  heldBack((b) => { status.applyStatus(b.e, 'fear', {}); }, (b) => { buffs.removeBuff(b.e, 'fear'); });
  heldBack((b) => { buffs.addBuff(b.e, buffs.makeBuff({ key: 'held', flags: { noAttack: true } })); }, (b) => { buffs.removeBuff(b.e, 'held'); });
  heldBack((b) => { status.applyStatus(b.e, 'disarm', {}); }, (b) => { buffs.removeBuff(b.e, 'disarm'); });
  heldBack((b) => { status.applyStatus(b.e, 'forceDisarm', {}); }, (b) => { buffs.removeBuff(b.e, 'forceDisarm'); });
  heldBack((b) => { status.applyStatus(b.e, 'disarmedCombat', {}); }, (b) => { buffs.removeBuff(b.e, 'disarmedCombat'); }, { blocked: true });
  heldBack((b) => { status.applyStatus(b.e, 'silence', {}); }, (b) => { buffs.removeBuff(b.e, 'silence'); }, { def: merged(rock({ immune: [] })) });
  // 消失 (路线-4): the engine's attack does not run while it is hidden, so the interval would be taken later.
  heldBack((b) => { b.e.hidden = true; }, (b) => { b.e.hidden = false; });
});

test('[敌能-143] 刷新屏障 with no barrier to give is not cast: the cooldown stays ready and the attack interval is not taken', () => {
  const def = merged(rock({ refresh: { dynamic: 0 } }));
  assert.deepEqual(uncoveredAbilities([def]), [], 'still the shape: the amount, 3 × 0, is what stops it');
  const box = stand(def);
  block(box);
  arts(box, 10000);
  run(box, 700);
  assert.equal(view(box.e).barrier, 9500);
  assert.equal(box.e.ab['RefreshShield.cd'], 0);
  assert.equal(box.e.ab['@holdAtk'], undefined);
  assert.deepEqual(box.hits.map((h) => h.f), [1, 91, 181, 271, 361, 451, 541, 631]);
});

test('[敌能-143] 战栗 while not blocked and silence against the resistance do not postpone 刷新屏障', () => {
  for (const key of /** @type {const} */ (['disarmedCombat', 'silence'])) {
    const box = stand(merged(rock()));
    status.applyStatus(box.e, key, {});
    arts(box, 10000);
    run(box, 510);
    assert.equal(view(box.e).barrier, 16500, key);
  }
});

test('[敌能-143] each attack that lands is one layer of +60% 攻击力, that attack included, up to 6, for good; a normal attack, not a skill', () => {
  const box = stand(merged(rock()));
  /** @type {[boolean, boolean][]} */
  const flags = [];
  bus.on(box.w, 'hit', (ctx) => { if (ctx.source === box.e) flags.push([!!ctx.dmg.isAttack, !!ctx.dmg.isSkill]); });
  block(box);
  run(box, 700);
  assert.ok(nearAll(box.hits.map((h) => h.damage), [1.6, 2.2, 2.8, 3.4, 4, 4.6, 4.6, 4.6].map((k) => 800 * k)));
  const l = layers(box.e);
  assert.equal(l.length, 1, 'one buff, its stacks the layers');
  assert.deepEqual([l[0].stacks, l[0].maxStacks, l[0].left, l[0].mods.atkPct], [6, 6, -1, 0.6]);
  assert.deepEqual(new Set(flags.map((f) => f.join())), new Set(['true,false']));
  assert.equal(S(box.e).atk, 800 * 4.6);
});

test('[敌能-143] the layers add to the current 攻击力 with its other bonuses; another number and cap follow', () => {
  const more = stand(merged(rock()));
  buffs.addBuff(more.e, buffs.makeBuff({ key: 'more', mods: { atkFlat: 100, atkPct: 0.5 } }));
  block(more);
  run(more, 100);
  assert.ok(nearAll(more.hits.map((h) => h.damage), [900 * 2.1, 900 * 2.7]));
  const small = stand(merged(rock(), (d) => { d.talents.charge[ATK] = 0.25; d.talents.charge.layers = 3; }));
  block(small);
  run(small, 300);
  assert.ok(nearAll(small.hits.map((h) => h.damage), [1000, 1200, 1400, 1400]));
  assert.equal(layers(small.e)[0].stacks, 3);
});

test('[敌能-143] [关卡-2] another shape of `charge` does nothing at run time: every hit 800, no layer', () => {
  const odd = stand(merged(rock(), (d) => { d.talents.charge.sp = 1; }));
  block(odd);
  run(odd, 100);
  assert.ok(nearAll(odd.hits.map((h) => h.damage), [800, 800]));
  assert.equal(layers(odd.e).length, 0);
});

test('[敌能-143] an attack of two hits is still one layer', () => {
  // 敌能-36's `times` (澪) on an unspent skill makes every normal attack two hits; 泥岩's own attack is one.
  const twice = { key: 'PowerAttack', cooldown: 0, initCooldown: 0, sp: 99, bb: { atk_scale: 1, times: 2 } };
  const box = stand(merged(rock({ skills: [twice] })));
  block(box);
  run(box, 100);
  assert.ok(nearAll(box.hits.map((h) => h.damage), [1.6, 1.6, 2.2, 2.2].map((k) => 800 * k)));
  assert.equal(layers(box.e)[0].stacks, 2);
});

test('[敌能-143] a dodged hit and one on an invincible blocker are each a layer; silence does not stop the layers', () => {
  const dodge = stand(merged(rock()));
  dodge.e.atkCd = 3;
  const g = block(dodge);
  buffs.addBuff(g, buffs.makeBuff({ key: 'dodge', mods: { dodgePhys: 1 } }));
  run(dodge, 4);
  assert.deepEqual([dodge.hits.length, layers(dodge.e)[0]?.stacks, g.hp], [0, 1, 1e9]);
  buffs.removeBuff(g, 'dodge');
  run(dodge, 100);
  assert.ok(nearAll(dodge.hits.map((h) => h.damage), [800 * 2.2]));
  const wall = stand(merged(rock()));
  wall.e.atkCd = 3;
  const w = block(wall);
  status.applyStatus(w, 'invincible', {});
  run(wall, 4);
  assert.deepEqual([wall.hits.length, layers(wall.e)[0]?.stacks, w.hp], [0, 1, 1e9]);
  const mute = stand(merged(rock({ immune: [] })));
  status.applyStatus(mute.e, 'silence', {});
  block(mute);
  run(mute, 100);
  assert.equal(S(mute.e).flags.silence, true);
  assert.ok(nearAll(mute.hits.map((h) => h.damage), [800 * 1.6, 800 * 2.2]));
});

test('[敌能-143] a swing cut by stun, or whose target left before it landed, is no layer', () => {
  const cut = stand(merged(rock({ attack: { duration: 2, hit: 1 } })));
  block(cut);
  run(cut, 10);
  status.applyStatus(cut.e, 'stun', {});
  run(cut, 20);
  buffs.removeBuff(cut.e, 'stun');
  run(cut, 130);
  assert.deepEqual([cut.hits.length, layers(cut.e).length], [0, 0]);
  once(cut);
  assert.deepEqual(cut.hits.map((h) => h.f), [131]);
  assert.ok(near(cut.hits[0].damage, 800 * 1.6), 'the cut swing gave nothing');
  assert.equal(layers(cut.e)[0].stacks, 1);
  const gone = stand(merged(rock({ attack: { duration: 2, hit: 1 } })));
  const g = block(gone);
  run(gone, 10);
  damage.dealDamage(gone.w, null, g, { type: 'true', amount: 1e12 }, gone.c);
  run(gone, 40);
  assert.equal(gone.w.units.includes(g), false);
  assert.equal(layers(gone.e).length, 0);
});

test('[敌能-143] 占据 is covered and does nothing: at 35 s no buff, no attack interval taken, the cooldown ready', () => {
  const box = stand(merged(rock({ skills: [{ ...OCCUPY }] })));
  block(box);
  run(box, 1049);
  const before = box.e.buffs.map((b) => b.key);
  once(box);
  assert.deepEqual(box.e.buffs.map((b) => b.key), before);
  assert.equal(box.e.ab['@holdAtk'], undefined);
  assert.equal(box.e.ab['occupy.cd'], 0);
  run(box, 1100);
  const frames = box.hits.map((h) => h.f);
  assert.deepEqual(frames, Array.from({ length: 13 }, (_, i) => 1 + 90 * i));
  const none = stand(merged(rock({ skills: [] })));
  block(none);
  run(none, 1100);
  assert.deepEqual(none.hits, box.hits, 'the same hits as with no 占据 at all');
});
