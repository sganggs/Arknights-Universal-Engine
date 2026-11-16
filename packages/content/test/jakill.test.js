// 杰斯顿·威廉姆斯 (docs/spec/foes.md 敌能-146): 狱警形态 — RES up, ranged arts that never pick a flyer, 钢铁风暴 on every 4th
// attack stunning two —, the first knockdown's 4 s rebirth, then 杀手形态 — the prisoners on the field liberated, ATK / DEF
// / interval / speed up, melee physical, 装甲穿刺 on every 4th attack. No shipped level has it: the record is enemy_database's
// level 0 (ArknightsGameData 17759cc8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, buffs, bus, damage, status, targeting, routes } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras, FOE_EXTRAS } from '../src/foes.js';
import hard02 from '../data/levels/act1multi_hard-02.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const KEY = 'enemy_1516_jakill';
const DQ = 'enemy_5055_dqkill';
/** 老练囚犯 of IG-S-2 (MELEE): placed away from everyone it never attacks, so only 杰斯顿 can liberate it. */
const PRISONER = 'enemy_1116_liprr_2';
/** 杰斯顿 stands rooted on the road at (row 1, col 2): the four high-ground tiles and the road next to it are in range. */
const AT = /** @type {const} */ ([1, 2]);
/** Frames its next attack is held off, so a deployment lands before it and a test can set things up. */
const HOLD = 10;

/**
 * enemy_1516_jakill at level 0, each blackboard open to a test; `cost` is both skills' spCost.
 * @param {{ reborn?: object, enhance?: object, storm?: object, pierce?: object, more?: object, cost?: number }} [o] @returns {any}
 */
function raw(o = {}) {
  const sp = o.cost ?? 3;
  return {
    name: '杰斯顿·威廉姆斯', maxHp: 25000, atk: 700, def: 400, res: 20, moveSpeed: 0.6, baseAttackTime: 4, rangeRadius: 2,
    applyWay: 'ALL', motion: 'WALK', massLevel: 6, levelType: 'BOSS', lifePointReduce: 2, immune: ['silence', 'sleep'],
    talents: {
      reborn: { sp: -1, duration: 4, ...o.reborn },
      enhance: { magic_resistance: 50, atk: 700, def: 1000, base_attack_time: -1.5, move_speed: 0.3, ...o.enhance },
    },
    skills: [
      { key: 'ironsandstorm', cooldown: 0, initCooldown: 0, sp, bb: { stun: 3, max_target: 2, ...o.storm } },
      { key: 'armorpiercing', cooldown: 0, initCooldown: 0, sp, bb: { times: 2, def_penetrate: 0.6, ...o.pierce } },
    ],
    ...o.more,
  };
}

/** The read record: FOE_EXTRAS's page markers merged. @param {Parameters<typeof raw>[0]} [o] */
const jakill = (o) => withFoeExtras(KEY, raw(o));

/**
 * The tiny map: 杰斯顿 (and `others`) spawn in frame 0 and stand rooted; `ops` deploy in frame 1 — free, no attack, no DEF
 * or RES, ten million HP —; `late` spawns at 20 s; `before` sees the world before its first frame. Its first attack
 * waits HOLD frames.
 * @param {any} def @param {[string, number, number][]} ops
 * @param {{ tweak?: (c: any) => void, others?: [string, number, number][], late?: string, before?: (w: World) => void }} [o]
 */
function arena(def, ops, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [KEY]: def, [PRISONER]: withFoeExtras(PRISONER, /** @type {any} */ (hard02).enemies[PRISONER]) };
  c.behaviors = skeletonContent.behaviors;
  /** @type {[string, number, number][]} */
  const foes = [[KEY, AT[0], AT[1]], ...(o.others ?? [])];
  c.level.waves = [oneWave([...foes.map(([k]) => spawnAt(0, k)), ...(o.late ? [spawnAt(20, o.late)] : [])])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, atk: 0, def: 0, res: 0, maxHp: 1e7 });
  c.operators.sniper2 = { ...c.operators.sniper, name: 'sniper2' };
  c.operators.hawk = { ...c.operators.guard, name: 'hawk', motion: 'FLY' };
  o.tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  o.before?.(w);
  step(w, c);
  const es = w.units.filter((u) => u.owner < 0);
  es.forEach((u, i) => { u.x = foes[i][2]; u.y = foes[i][1]; u.path = []; status.applyStatus(u, 'root', {}); });
  es[0].atkCd = HOLD;
  step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  return { c, w, e: es[0], es };
}

/** Deploys an operator on 杰斯顿's tile, its next attack held off HOLD frames. @param {World} w @param {any} c @param {Unit} e @param {string} op */
function blockWith(w, c, e, op) {
  e.atkCd = HOLD;
  step(w, c, [[0, { type: 'deploy', op, row: AT[0], col: AT[1], dir: 0 }]]);
  return unit(w, op);
}

/** @param {World} w @param {string} key @returns {Unit} */
function unit(w, key) {
  const u = w.units.find((x) => x.key === key);
  if (!u) throw new Error(`no ${key}`);
  return u;
}

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  for (let i = 0; i < n; i++) step(w, c);
}

/** @param {Unit} u @param {string} key */
const count = (u, key) => u.buffs.filter((b) => b.key === key).length;
/** The frames left on a unit's 晕眩, 0 for none. @param {Unit} u */
const stunLeft = (u) => u.buffs.find((b) => b.key === 'stun')?.left ?? 0;

/**
 * Each hit 杰斯顿 deals, as the bus's `damaged` sees it (钩子-3): target, HP taken, type, whether attack and skill.
 * @param {World} w @param {Unit} e
 */
function watch(w, e) {
  /** @type {{ target: number, amount: number, type: string, attack: boolean, skill: boolean }[]} */
  const seen = [];
  bus.on(w, 'damaged', (k) => {
    if (k.credit === e) seen.push({ target: k.target.id, amount: k.amount, type: k.type, attack: !!k.dmg.isAttack, skill: !!k.dmg.isSkill });
  });
  return seen;
}

/**
 * Steps until 杰斯顿 has started `n` more attacks: each one's frame and the ids it attacked.
 * @param {World} w @param {any} c @param {Unit} e @param {number} n
 */
function attacks(w, c, e, n) {
  /** @type {{ frame: number, targets: number[] }[]} */
  const out = [];
  for (let i = 0; i < 4000 && out.length < n; i++) {
    const frame = w.frame, ev = /** @type {any[]} */ ([...step(w, c)]);
    const targets = ev.filter((x) => x.type === 'attack' && x.id === e.id).map((x) => x.target);
    if (targets.length > 0) out.push({ frame, targets });
  }
  assert.equal(out.length, n, `${out.length} of ${n} attacks`);
  return out;
}

/** Knocks 杰斯顿 down this step (伤害-9), then roots it again: the rebirth clears every buff. @param {World} w @param {any} c @param {Unit} e */
function knock(w, c, e) {
  damage.dealDamage(w, null, e, { type: 'true', amount: 1e9 });
  step(w, c);
  status.applyStatus(e, 'root', {});
}

test('[敌能-146] the read page is covered once its four markers are merged; enemy_5055_dqkill and other shapes are not', () => {
  assert.deepEqual(FOE_EXTRAS[KEY].talents, { reborn: { page: 1 }, enhance: { page: 1 } });
  assert.deepEqual(FOE_EXTRAS[KEY].skills, { ironsandstorm: { page: 1 }, armorpiercing: { page: 1 } });
  assert.deepEqual(uncoveredAbilities([jakill()]), []);
  assert.equal(FOE_EXTRAS[DQ], undefined);
  assert.deepEqual(uncoveredAbilities([withFoeExtras(DQ, raw({ more: { rangeRadius: 3 } }))]), ['reborn', 'enhance', 'ironsandstorm', 'armorpiercing']);
  /** @param {Parameters<typeof raw>[0]} o */
  const gaps = (o) => uncoveredAbilities([jakill(o)]);
  assert.deepEqual(gaps({ reborn: { sp: 0 } }), ['reborn'], '清空 is a negative sp; 0 has no source');
  assert.deepEqual(gaps({ reborn: { sp: 2 } }), ['reborn']);
  assert.deepEqual(gaps({ reborn: { sp: '-1' } }), ['reborn'], 'a string is not a number');
  assert.deepEqual(gaps({ reborn: { hp_ratio: 1 } }), ['reborn']);
  assert.deepEqual(gaps({ enhance: { atk: '700' } }), ['enhance']);
  assert.deepEqual(gaps({ enhance: { attack_speed: 5 } }), ['enhance']);
  assert.deepEqual(gaps({ storm: { stun: '3' } }), ['ironsandstorm']);
  assert.deepEqual(gaps({ pierce: { range_radius: 1 } }), ['armorpiercing']);
  const boiling = { atk: 0.1, attack_speed: 5, max_stack_cnt: 10, page: 1 };
  assert.deepEqual(uncoveredAbilities([/** @type {any} */ ({ name: 'b', maxHp: 1, atk: 1, def: 0, res: 0, moveSpeed: 1, talents: { enhance: boiling, reborn: { duration: 5, page: 1 } } })]), []);
});

test('[敌能-146] other shapes stay inert when left on: enemy_5055_dqkill acts as a plain enemy, an unmarked enhance gives no numbers', () => {
  const dq = arena(withFoeExtras(DQ, raw({ more: { rangeRadius: 3 } })), [['sniper', 0, 2], ['sniper2', 2, 2]]);
  assert.equal(count(dq.e, 'warden'), 0);
  assert.equal(attrs.statsOf(dq.e).res, 20);
  const seen = watch(dq.w, dq.e);
  assert.deepEqual(attacks(dq.w, dq.c, dq.e, 4).map((x) => x.targets.length), [1, 1, 1, 1]);
  assert.ok(seen.every((s) => s.type === 'phys' && !s.skill));
  knock(dq.w, dq.c, dq.e);
  assert.equal(dq.w.units.includes(dq.e), false, 'no rebirth');
  const half = arena({ ...jakill(), talents: { ...jakill().talents, enhance: raw().talents.enhance } }, []);
  assert.equal(attrs.statsOf(half.e).res, 20);
  knock(half.w, half.c, half.e);
  run(half.w, half.c, 120);
  assert.equal(count(half.e, 'killer'), 1);
  assert.deepEqual([attrs.statsOf(half.e).atk, attrs.statsOf(half.e).def], [700, 400]);
});

test('[敌能-146] 狱警形态: RES +magic_resistance (直接加算) from its appearance, one buff, given back the turn after it is removed', () => {
  for (const [mr, res] of [[50, 70], [35, 55]]) {
    /** @type {number[]} */
    const atSpawn = [];
    const before = (/** @type {World} */ ww) => { bus.on(ww, 'enemySpawn', (k) => { if (k.enemy.key === KEY) atSpawn.push(attrs.statsOf(k.enemy).res); }); };
    const { c, w, e } = arena(jakill({ enhance: { magic_resistance: mr } }), [], { before });
    assert.deepEqual(atSpawn, [res], 'already as it appears (钩子-3 enemySpawn), before its first turn');
    assert.equal(attrs.statsOf(e).res, res);
    run(w, c, 30);
    assert.equal(count(e, 'warden'), 1);
    buffs.removeBuff(e, 'warden');
    assert.equal(attrs.statsOf(e).res, 20);
    step(w, c);
    assert.equal(count(e, 'warden'), 1);
    assert.equal(attrs.statsOf(e).res, res);
  }
});

test('[敌能-146] 狱警形态 attacks at range, arts at its current ATK, and never a flyer — a flying blocker neither (敌能-33)', () => {
  const alone = arena(jakill(), [['hawk', AT[0], AT[1]]]);
  run(alone.w, alone.c, 400);
  assert.equal(alone.e.blockedBy, unit(alone.w, 'hawk').id);
  assert.equal(unit(alone.w, 'hawk').hp, 1e7, 'a flyer that blocks it is its only target: no attack at all');
  const { c, w, e } = arena(jakill(), [['hawk', AT[0], AT[1]], ['sniper', 2, 3]], { tweak: (cc) => { cc.operators.sniper.res = 50; } });
  buffs.addBuff(e, buffs.makeBuff({ key: 'boost', mods: { atkPct: 1 } }));
  const seen = watch(w, e), sniper = unit(w, 'sniper');
  const [first] = attacks(w, c, e, 1);
  assert.deepEqual(first.targets, [sniper.id]);
  assert.deepEqual(seen.map((s) => [s.target, s.amount, s.type, s.attack, s.skill]), [[sniper.id, 1400 * 0.5, 'arts', true, false]]);
  assert.equal(unit(w, 'hawk').hp, 1e7);
  const bound = arena(jakill(), [['hawk', AT[0], AT[1]]]), hawk = unit(bound.w, 'hawk');
  status.applyStatus(hawk, 'groundbind', { seconds: 100 });
  assert.equal(attrs.statsOf(hawk).flying, false);
  const hits = watch(bound.w, bound.e);
  attacks(bound.w, bound.c, bound.e, 1);
  assert.deepEqual(hits.map((s) => s.target), [hawk.id], 'flying is the current motion (属性 flying, as 敌能-33): a flyer under 缚地 is hit');
});

test('[敌能-146] 钢铁风暴: three ordinary attacks, then the 4th hits two for 100 % arts and stuns each 3 s; the count starts again', () => {
  const { c, w, e } = arena(jakill(), [['sniper', 0, 2], ['sniper2', 2, 2]]);
  buffs.addBuff(e, buffs.makeBuff({ key: 'boost', mods: { atkPct: 1 } }));
  const seen = watch(w, e), a = unit(w, 'sniper'), b = unit(w, 'sniper2');
  const got = attacks(w, c, e, 4);
  assert.deepEqual(got.map((x) => x.targets.length), [1, 1, 1, 2]);
  assert.deepEqual([stunLeft(a), stunLeft(b)], [90, 90], '3 s is 90 frames from the hit');
  assert.deepEqual(seen.slice(3).map((s) => [s.amount, s.type, s.attack, s.skill]), [[1400, 'arts', true, true], [1400, 'arts', true, true]]);
  assert.ok(seen.slice(0, 3).every((s) => s.amount === 1400 && s.type === 'arts' && !s.skill));
  assert.equal(e.ab['ironsandstorm.sp'], 0);
  assert.equal(e.ab['armorpiercing.sp'] ?? 0, 0, 'the other form\'s skill does not count');
  assert.deepEqual(attacks(w, c, e, 4).map((x) => x.targets.length), [1, 1, 1, 2]);
});

test('[敌能-146] 钢铁风暴 follows stun and max_target: 2 s, one target; three targets when three are in range', () => {
  const short = arena(jakill({ storm: { stun: 2, max_target: 1 } }), [['sniper', 0, 2], ['sniper2', 2, 2]]);
  const got = attacks(short.w, short.c, short.e, 4);
  assert.deepEqual(got.map((x) => x.targets.length), [1, 1, 1, 1]);
  assert.equal(stunLeft(unit(short.w, got[3].targets[0] === unit(short.w, 'sniper').id ? 'sniper' : 'sniper2')), 60);
  const wide = arena(jakill({ storm: { max_target: 3 } }), [['sniper', 0, 2], ['sniper2', 2, 2], ['guard', 1, 3]]);
  assert.deepEqual(attacks(wide.w, wide.c, wide.e, 4).map((x) => x.targets.length), [1, 1, 1, 3]);
  assert.equal(wide.e.blockedBy, -1, 'the guard beside it does not block it');
});

test('[敌能-146] 钢铁风暴 leaves a flying blocker out; a dodged hit still stuns (the hit\'s status, as 敌能-36\'s)', () => {
  const { c, w, e } = arena(jakill(), [['hawk', AT[0], AT[1]], ['sniper', 0, 3], ['sniper2', 2, 2]]);
  const bird = unit(w, 'hawk'), a = unit(w, 'sniper'), b = unit(w, 'sniper2');
  buffs.addBuff(b, buffs.makeBuff({ key: 'testDodge', mods: { dodgeArts: 1 } }));
  const seen = watch(w, e);
  const got = attacks(w, c, e, 4);
  assert.deepEqual([...got[3].targets].sort(), [a.id, b.id].sort());
  assert.equal(stunLeft(bird), 0);
  assert.equal(stunLeft(b), 90);
  assert.equal(b.hp, 1e7, 'every hit on it was dodged');
  assert.ok(seen.every((s) => s.target !== bird.id && s.target !== b.id));
});

test('[敌能-146] the first knockdown: a 4 s rebirth at full HP with every buff cleared; 杀手形态 and the liberation come the frame it ends', () => {
  const { c, w, e } = arena(jakill(), [], { others: [[PRISONER, 0, 5]], late: PRISONER });
  const p = unit(w, PRISONER);
  assert.equal(attrs.statsOf(p).aspd, 50);
  knock(w, c, e);
  assert.equal(w.units.includes(e), true);
  assert.equal(e.hp, 25000);
  assert.equal(count(e, 'warden'), 0);
  assert.equal(attrs.statsOf(e).res, 20);
  assert.equal(attrs.statsOf(e).invincible, true);
  assert.equal(targeting.selectable(e), false);
  run(w, c, 119);
  assert.equal(count(e, 'reborn'), 1);
  assert.equal(count(e, 'killer'), 0);
  assert.equal(p.buffs.some((x) => x.key === 'liberty'), false, 'not at the knockdown, nor during the rebirth');
  step(w, c);
  assert.equal(count(e, 'reborn'), 0);
  assert.equal(count(e, 'killer'), 1);
  assert.equal(p.buffs.some((x) => x.key === 'liberty'), true);
  assert.equal(p.buffs.some((x) => x.key === 'confinement'), false);
  assert.equal(attrs.statsOf(p).aspd, 100);
  for (let i = 0; i < 900 && !w.units.some((u) => u.key === PRISONER && u !== p); i++) step(w, c);
  const late = w.units.find((u) => u.key === PRISONER && u !== p);
  assert.ok(late, 'the 20 s prisoner came');
  assert.equal(late.buffs.some((x) => x.key === 'confinement'), true, 'one that comes later stays confined');
  assert.equal(count(e, 'killer'), 1);
});

test('[敌能-146] the liberation leaves out a prisoner not on the field at that frame: a passenger (敌能-16) stays confined', () => {
  const { c, w, e, es } = arena(jakill(), [], { others: [[PRISONER, 0, 5]] });
  const p = es[1];
  routes.board(p);
  knock(w, c, e);
  run(w, c, 121);
  assert.equal(count(e, 'killer'), 1);
  assert.equal(p.buffs.some((x) => x.key === 'liberty'), false);
  assert.equal(p.buffs.some((x) => x.key === 'confinement'), true);
});

test('[敌能-146] [敌能-71] its enhance is not 沸血: another enemy knocked down gives a 沸血 knight a layer and it none', () => {
  const boil = { name: 'boil', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, talents: { enhance: { atk: 0.1, attack_speed: 5, max_stack_cnt: 10, page: 1 } } };
  const { c, w, e, es } = arena(jakill(), [], { others: [[PRISONER, 0, 5], ['boil', 0, 4]], tweak: (cc) => { cc.enemies.boil = boil; } });
  damage.dealDamage(w, null, es[1], { type: 'true', amount: 1e9 });
  step(w, c);
  assert.equal(w.units.includes(es[1]), false);
  assert.equal(count(es[2], 'blood'), 1);
  assert.equal(count(e, 'blood'), 0);
});

test('[敌能-146] the rebirth follows duration: 2 s is 60 frames', () => {
  const { c, w, e } = arena(jakill({ reborn: { duration: 2 } }), []);
  knock(w, c, e);
  run(w, c, 59);
  assert.equal(count(e, 'killer'), 0);
  step(w, c);
  assert.equal(count(e, 'killer'), 1);
});

test('[敌能-146] 杀手形态: ATK, DEF, attack interval and speed 直接加算 by enhance, no RES bonus; one buff, given back when removed', () => {
  /** @type {[Record<string, number>, number[]][]} */
  const cases = [[{}, [1400, 1400, 2.5, 0.9, 20]], [{ atk: 300, def: 200, base_attack_time: -1, move_speed: 0.2 }, [1000, 600, 3, 0.8, 20]]];
  for (const [over, want] of cases) {
    const { c, w, e } = arena(jakill({ enhance: over }), []);
    knock(w, c, e);
    run(w, c, 120);
    const s = attrs.statsOf(e);
    assert.deepEqual([s.atk, s.def, s.bat, Math.round(s.moveSpeed * 1e9) / 1e9, s.res], want);
    buffs.removeBuff(e, 'killer');
    assert.equal(attrs.statsOf(e).atk, 700);
    step(w, c);
    assert.equal(count(e, 'killer'), 1);
    assert.equal(count(e, 'warden'), 0);
    assert.equal(attrs.statsOf(e).atk, want[0]);
  }
});

test('[敌能-146] 杀手形态 hits only what blocks it, physical; 装甲穿刺 is its 4th attack — the guard form\'s points do not carry over', () => {
  const { c, w, e } = arena(jakill(), [['sniper', 0, 2]], { tweak: (cc) => { cc.operators.guard.def = 1000; } });
  attacks(w, c, e, 2);
  assert.equal(e.ab['ironsandstorm.sp'], 2);
  knock(w, c, e);
  run(w, c, 120);
  const sniper = unit(w, 'sniper');
  run(w, c, 200);
  assert.equal(sniper.hp, 1e7 - 1400, 'only the two guard-form hits before the knockdown');
  const g = blockWith(w, c, e, 'guard'), seen = watch(w, e);
  const got = attacks(w, c, e, 4);
  assert.equal(e.blockedBy, g.id);
  assert.ok(got.every((x) => x.targets.length === 1 && x.targets[0] === g.id));
  assert.deepEqual(got.slice(1).map((x, i) => x.frame - got[i].frame), [75, 75, 75], '2.5 s');
  assert.deepEqual(seen.map((s) => [s.amount, s.type, s.skill]), [[400, 'phys', false], [400, 'phys', false], [400, 'phys', false], [1000, 'phys', true], [1000, 'phys', true]]);
  assert.ok(seen.every((s) => s.attack));
  assert.equal(sniper.hp, 1e7 - 1400);
});

test('[敌能-146] 装甲穿刺 follows times and def_penetrate, at the current ATK', () => {
  const { c, w, e } = arena(jakill({ pierce: { times: 3, def_penetrate: 0.3 } }), [], { tweak: (cc) => { cc.operators.guard.def = 1000; } });
  knock(w, c, e);
  run(w, c, 120);
  buffs.addBuff(e, buffs.makeBuff({ key: 'boost', mods: { atkPct: 0.5 } }));
  blockWith(w, c, e, 'guard');
  const seen = watch(w, e);
  attacks(w, c, e, 4);
  assert.deepEqual(seen.map((s) => s.amount), [1100, 1100, 1100, 1400, 1400, 1400], '2100 − 1000, then 3 × (2100 − 700)');
});

test('[敌能-146] each skill costs its record\'s spCost: at 2, the 3rd attack of either form is its skill', () => {
  const { c, w, e } = arena(jakill({ cost: 2 }), [['sniper', 0, 2], ['sniper2', 2, 2]], { tweak: (cc) => { cc.operators.guard.def = 1000; } });
  assert.deepEqual(attacks(w, c, e, 3).map((x) => x.targets.length), [1, 1, 2]);
  knock(w, c, e);
  run(w, c, 120);
  blockWith(w, c, e, 'guard');
  const seen = watch(w, e);
  attacks(w, c, e, 3);
  assert.deepEqual(seen.map((s) => [s.amount, s.skill]), [[400, false], [400, false], [1000, true], [1000, true]]);
});

test('[敌能-146] 杀手形态 hits a flying blocker: 不会攻击飞行单位 is 狱警形态\'s line', () => {
  const { c, w, e } = arena(jakill(), []);
  knock(w, c, e);
  run(w, c, 120);
  const hawk = blockWith(w, c, e, 'hawk'), seen = watch(w, e);
  attacks(w, c, e, 1);
  assert.equal(e.blockedBy, hawk.id);
  assert.deepEqual(seen.map((s) => [s.target, s.amount, s.type]), [[hawk.id, 1400, 'phys']]);
});

test('[敌能-146] the second knockdown, in 杀手形态, leaves the field', () => {
  const { c, w, e } = arena(jakill(), []);
  knock(w, c, e);
  run(w, c, 120);
  assert.equal(count(e, 'killer'), 1);
  damage.dealDamage(w, null, e, { type: 'true', amount: 1e9 });
  step(w, c);
  assert.equal(w.units.includes(e), false);
});

test('[敌能-146] silence: its data makes it immune; without that a silenced 钢铁风暴 waits with a full bar', () => {
  const immune = arena(jakill(), [['sniper', 0, 2], ['sniper2', 2, 2]]);
  status.applyStatus(immune.e, 'silence', {});
  assert.equal(attrs.statsOf(immune.e).flags.silence ?? false, false);
  assert.deepEqual(attacks(immune.w, immune.c, immune.e, 4).map((x) => x.targets.length), [1, 1, 1, 2]);
  const open = arena(jakill({ more: { immune: ['sleep'] } }), [['sniper', 0, 2], ['sniper2', 2, 2]]);
  status.applyStatus(open.e, 'silence', {});
  assert.deepEqual(attacks(open.w, open.c, open.e, 5).map((x) => x.targets.length), [1, 1, 1, 1, 1]);
  assert.equal(open.e.ab['ironsandstorm.sp'], 3);
  buffs.removeBuff(open.e, 'silence');
  assert.deepEqual(attacks(open.w, open.c, open.e, 1).map((x) => x.targets.length), [2]);
});
