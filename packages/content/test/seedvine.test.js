// 卷心籽 / 卷心草 and 灼藤 / 灼芯 (docs/spec/foes.md 敌能-136). No AUE level carries them, so the records are built here
// from ArknightsGameData 17759cc8: enemy_database level 0 (stats, `boom`, `onfire`, `pow` — attack@range_id is its
// valueStr) and enemy_handbook_table (damageType MAGIC for the vines). The units are put where a test needs them and
// rooted, their attacks held until a test lets one go; the operators are soft (0 ATK, DEF, RES) with a million HP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, elements, bus, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, FOE_EXTRAS } from '../src/foes.js';
import ranges from '../data/ranges.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const SEED = 'enemy_10065_ftzlc', WEED = 'enemy_10065_ftzlc_2', VINE = 'enemy_10067_ftsjc', CORE = 'enemy_10067_ftsjc_2';
/** The vines' `pow` as the data has it. */
const POW = Object.freeze({ add_max_atk: 2, time: 50, 'attack@ep_damage_ratio': 0.25, 'attack@ep_damage_ratio_normal': 0.2, 'attack@range_id': 'x-4' });
/** The seeds' `boom` with the page's extras (FOE_EXTRAS). */
const LIT_BOOM = Object.freeze({ atk_scale: 2, radius: 1.25, delay: 0.4, arts: 1, air: 0, sourced: 1, kindle: 1 });
/** The same death blast without the marker: a plain 敌能-5 `boom`, which needs no light. */
const PLAIN_BOOM = Object.freeze({ atk_scale: 2, radius: 1.25, delay: 0.4, arts: 1, air: 0, sourced: 1 });
const HP = 1e6;

/** @param {Unit | undefined} u @returns {Unit} */
function must(u) {
  if (!u) throw new Error('missing unit');
  return u;
}

/**
 * A seed as enemy_database gives it (卷心籽 3800 / 240, 卷心草 5000 / 380), `boom` and `onfire` as the data names them.
 * @param {number} maxHp @param {number} atk @param {Record<string, unknown>} [boom] @returns {EnemyDef}
 */
function seedOf(maxHp, atk, boom = { atk_scale: 2 }) {
  return /** @type {any} */ ({
    name: 'seed', maxHp, atk, def: 0, res: 5, moveSpeed: 1, baseAttackTime: 1.7, rangeRadius: -1, applyWay: 'MELEE', motion: 'WALK', massLevel: 1,
    levelType: 'NORMAL', talents: { boom }, skills: [{ key: 'onfire', cooldown: 0, initCooldown: 0, sp: 0, bb: {} }],
  });
}

/**
 * A vine (灼藤 13000 / 800 / 250, 灼芯 15500 / 1000 / 350; RES 65), arts by its handbook damageType.
 * @param {number} maxHp @param {number} atk @param {number} def @param {Record<string, unknown>} [pow] @returns {EnemyDef}
 */
function vineOf(maxHp, atk, def, pow = POW) {
  return /** @type {any} */ ({
    name: 'vine', maxHp, atk, def, res: 65, moveSpeed: 0.85, baseAttackTime: 3.5, rangeRadius: -1, applyWay: 'MELEE', motion: 'WALK', massLevel: 4,
    levelType: 'ELITE', dmgType: 'arts', talents: { pow },
  });
}

/** The official records with their extras. */
const seed = () => withFoeExtras(SEED, seedOf(3800, 240));
const vine = () => withFoeExtras(VINE, vineOf(13000, 800, 250));
/** A vine whose page numbers a test chooses: rise to + `add` over `time` s, then `ratio` / `normal` 灼燃, `splash`. */
const tunedVine = (/** @type {Record<string, unknown>} */ pow) => vineOf(13000, 800, 250, { ...POW, splash: 1, ignite: 0.5, ...pow });
const BYSTANDER = /** @type {EnemyDef} */ ({ name: 'bystander', maxHp: HP, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true });

/**
 * The tiny map with these enemies, each under its own key, spawned in frame 0 — vines at the route's start, the others at
 * a second start across the map, so frame 0 lights nothing — then put at (x, y), rooted and their attacks held; then the
 * operators (key, row, col) in frame 1. `g1`, `g3`, `out` are guards, `s2`…`s4` snipers.
 * @param {[string, EnemyDef, number, number][]} foes @param {[string, number, number][]} [ops]
 */
function field(foes, ops = []) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = Object.fromEntries(foes.map(([k, def]) => [k, def]));
  c.behaviors = skeletonContent.behaviors;
  c.level.routes.push({ ...c.level.routes[0], start: { row: 0, col: 5 } });
  c.level.waves = [oneWave(foes.map(([k, def]) => spawnAt(0, k, { route: def.talents?.pow ? 0 : 1 })))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 12 };
  for (const o of Object.values(c.operators)) Object.assign(o, { cost: 0, maxHp: HP, atk: 0, def: 0, res: 0 });
  for (const id of ['g1', 'g3', 'out']) c.operators[id] = { ...c.operators.guard, name: id };
  for (const id of ['s2', 's3', 's4']) c.operators[id] = { ...c.operators.sniper, name: id };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  /** @type {Record<string, Unit>} */
  const by = {};
  for (const [k, , x, y] of foes) {
    const e = must(w.units.find((u) => u.key === k));
    Object.assign(e, { x, y, atkCd: 1e6 });
    status.applyStatus(e, 'root', {});
    by[k] = e;
  }
  if (ops.length) step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  return { c, w, by };
}

/** Steps until frame `f` has run. @param {World} w @param {any} c @param {number} f @returns {any[]} the events of those frames */
function until(w, c, f) {
  /** @type {any[]} */
  const ev = [];
  while (w.frame <= f) ev.push(...step(w, c));
  return ev;
}

/** @param {World} w @param {number} row @param {number} col */
const at = (w, row, col) => must(w.units.find((u) => u.kind === KIND.OPERATOR && u.y === row && u.x === col));
/** @param {Unit} u */
const lit = (u) => u.buffs.filter((b) => b.key === 'vineLit');
/** @param {Unit} u */
const ramp = (u) => u.buffs.filter((b) => b.key === 'vineRamp');
/** @param {number} got @param {number} want */
const near = (got, want) => Math.abs(got - want) < 1e-6;

test('[敌能-136] [关卡-2] the four take their page extras and are covered; without them they stay uncovered', () => {
  const weed = withFoeExtras(WEED, seedOf(5000, 380)), core = withFoeExtras(CORE, vineOf(15500, 1000, 350));
  assert.deepEqual([seed().talents?.boom, weed.talents?.boom], [LIT_BOOM, LIT_BOOM]);
  const pow = { ...POW, splash: 1, ignite: 0.5 };
  assert.deepEqual([vine().talents?.pow, core.talents?.pow], [pow, pow]);
  assert.deepEqual(seed().skills, [{ key: 'onfire', cooldown: 0, initCooldown: 0, sp: 0, bb: {} }]);
  assert.deepEqual(uncoveredAbilities([seed(), weed, vine(), core]), []);
  assert.deepEqual(uncoveredAbilities([seedOf(3800, 240)]), ['boom'], 'no radius or delay without the page');
  assert.deepEqual(uncoveredAbilities([vineOf(13000, 800, 250)]), ['pow'], 'no splash or ignite without the page');
  const oldids = [[SEED, 375979], [WEED, 365426], [VINE, 376257], [CORE, 406825]];
  for (const [k, id] of oldids) assert.ok(FOE_EXTRAS[k].source.endsWith(`oldid=${id}`), String(k));
  const cells = ranges.ranges['x-4'].map((p) => `${p.row},${p.col}`).toSorted((a, b) => a.localeCompare(b));
  const square = [-1, 0, 1].flatMap((r) => [-1, 0, 1].map((col) => `${r},${col}`)).toSorted((a, b) => a.localeCompare(b));
  assert.deepEqual(cells, square, 'x-4 is the 3×3 around the target: the engine square');
});

test('[敌能-136] [关卡-2] another shape is not this ability: text for a number, another range, one more key, time 0, a kindle not 1, numbers on onfire', () => {
  const pow = { ...POW, splash: 1, ignite: 0.5 };
  const wrong = [{ add_max_atk: '2' }, { 'attack@range_id': 'x-1' }, { 'attack@range_id': 0 }, { more: 1 }, { time: 0 }, { splash: '1' }, { ignite: '0.5' }];
  for (const p of wrong) assert.deepEqual(uncoveredAbilities([vineOf(1, 1, 0, { ...pow, ...p })]), ['pow'], JSON.stringify(p));
  for (const b of [{ kindle: 2 }, { kindle: '1' }, { freeze: 10 }, { atk_scale: '2' }]) {
    assert.deepEqual(uncoveredAbilities([seedOf(1, 1, { ...LIT_BOOM, ...b })]), ['boom'], JSON.stringify(b));
  }
  const { air: _air, ...noAir } = LIT_BOOM;
  assert.deepEqual(uncoveredAbilities([seedOf(1, 1, noAir)]), ['boom'], 'a key short');
  const busy = /** @type {any} */ (seedOf(1, 1, LIT_BOOM));
  busy.skills[0].bb = { x: 1 };
  assert.deepEqual(uncoveredAbilities([busy]), ['onfire']);
  // 冬灵血巫, 冬灵血巫大师, 源阶粒素, 惊喜赞助无人机: only atk_scale, no extras for it — still uncovered (敌能-5)
  for (const k of ['enemy_1089_ltlntc', 'enemy_1089_ltlntc_2', 'enemy_2149_shorsm', 'enemy_9001_ayokai']) {
    const e = withFoeExtras(k, /** @type {any} */ ({ name: k, maxHp: 1, atk: 1, def: 0, res: 0, moveSpeed: 1, talents: { boom: { atk_scale: 2 } } }));
    assert.deepEqual([e.talents?.boom, uncoveredAbilities([e])], [{ atk_scale: 2 }, ['boom']], k);
  }
});

test('[敌能-136] [关卡-2] another shape does nothing when it runs: a pow with another range neither rises, lights nor splashes', () => {
  const box = field([['vine', tunedVine({ 'attack@range_id': 'x-1' }), 2, 1], ['seed', seed(), 2.3, 1]], [['guard', 1, 2], ['g1', 1, 1]]);
  const v = box.by.vine, g = at(box.w, 1, 2);
  until(box.w, box.c, 30);
  assert.equal(v.blockedBy, g.id);
  assert.deepEqual([ramp(v).length, attrs.statsOf(v).atk, lit(box.by.seed).length], [0, 800, 0]);
  v.atkCd = 0;
  until(box.w, box.c, 31);
  took(g, 800, 0);
  took(at(box.w, 1, 1), 0, 0);
});

test('[敌能-136] lighting: seeds within ignite, not in the air, once each and for good; not a neutral or disappeared one nor another boom; silence on either side does not stop it', () => {
  const slime = seedOf(3800, 240, { atk_scale: 4, radius: 1.25, delay: 1, arts: 0, air: 0, sourced: 0 });
  const { c, w, by } = field([
    ['vine', vine(), 2, 1], ['near', seed(), 2.4, 1], ['edge', seed(), 2, 1.5], ['far', seed(), 2.6, 1],
    ['air', seed(), 1.7, 1], ['calm', { ...seed(), neutral: true }, 2.3, 1], ['slime', slime, 2.2, 1], ['gone', seed(), 2, 0.7],
    ['odd', seedOf(3800, 240, { ...LIT_BOOM, kindle: 2 }), 2.1, 1],
  ]);
  status.applyStatus(by.air, 'levitate', {});
  status.applyStatus(by.vine, 'silence', {});
  status.applyStatus(by.near, 'silence', {});
  by.gone.hidden = true;
  assert.equal(attrs.statsOf(by.air).flying, true);
  until(w, c, 1);
  for (const k of ['near', 'edge']) assert.deepEqual(lit(by[k]).map((b) => b.src), [by.vine.id], k);
  for (const k of ['far', 'air', 'calm', 'slime', 'gone', 'odd']) assert.equal(lit(by[k]).length, 0, k);
  until(w, c, 31);
  assert.deepEqual([lit(by.near).length, lit(by.edge).length], [1, 1], 'one mark, not one a frame');
  by.vine.hp = 0;
  until(w, c, 40);
  assert.equal(w.units.includes(by.vine), false);
  assert.deepEqual([lit(by.near).length, lit(by.edge).length], [1, 1], 'still lit with the vine gone');
  until(w, c, 940);
  assert.deepEqual([lit(by.near).length, lit(by.edge).length], [1, 1], 'and 30 s later: the mark has no end');
  by.edge.hp = 0;
  until(w, c, 941);
  assert.deepEqual(w.blasts.map((b) => b.src), [by.edge.id], 'its death blast goes off long after its vine left');
  const wide = field([['vine', tunedVine({ ignite: 1 }), 2, 1], ['far', seed(), 2.6, 1], ['out', seed(), 3.1, 1]]);
  until(wide.w, wide.c, 1);
  assert.deepEqual([lit(wide.by.far).length, lit(wide.by.out).length], [1, 0], 'the radius is ignite');
});

/**
 * A lit seed at (3, 1) with a guard on (1, 2), another guard two tiles off on (1, 1), a levitated sniper on (2, 3) and a
 * neutral unit at (3, 0); the vine that lit it is knocked down in frame 2. @param {EnemyDef} rec
 */
function litSeed(rec) {
  const box = field([['seed', rec, 3, 1], ['vine', vine(), 3, 1.4], ['bystander', BYSTANDER, 3, 0]],
    [['guard', 1, 2], ['out', 1, 1], ['sniper', 2, 3]]);
  status.applyStatus(at(box.w, 2, 3), 'levitate', {});
  assert.equal(lit(box.by.seed).length, 1);
  box.by.vine.hp = 0;
  until(box.w, box.c, 2);
  return box;
}

test('[敌能-136] [敌能-5] [敌能-3] a lit 卷心籽 knocked down: 0.4 s later an arts blast of its current attack × 200 % within 1.25, not on the flyer; not an attack', () => {
  const { c, w, by } = litSeed(seed());
  const s = by.seed, g = at(w, 1, 2), far = at(w, 1, 1), air = at(w, 2, 3);
  buffs.addBuff(s, buffs.makeBuff({ key: 'test', mods: { atkPct: 0.5 } }));
  /** @type {any[]} */
  const hits = [];
  bus.on(w, 'hit', (k) => { hits.push({ id: k.target.id, attack: k.dmg.isAttack === true, skill: k.dmg.isSkill === true, type: k.dmg.type }); });
  s.hp = 0;
  until(w, c, 3);
  assert.equal(w.blasts.length, 1);
  const [b] = w.blasts;
  assert.deepEqual([b.radius, b.left, b.air, b.type, b.amount, b.src], [1.25, 12, false, 'arts', 240 * 1.5 * 2, s.id]);
  assert.equal(until(w, c, 14).filter((x) => x.type === 'blast').length, 0);
  const fired = until(w, c, 15);
  assert.equal(fired.filter((x) => x.type === 'blast').length, 1, 'knocked down in frame 3, 12 frames later');
  assert.equal(HP - g.hp, 720);
  assert.equal(HP - by.bystander.hp, 720, 'a neutral unit inside it is hit (敌能-3)');
  assert.deepEqual([far.hp, air.hp], [HP, HP]);
  assert.deepEqual(hits.filter((x) => x.id === g.id), [{ id: g.id, attack: false, skill: false, type: 'arts' }]);
});

test('[敌能-136] [敌能-5] the blast follows boom: atk_scale, radius and delay vary; unlit or silenced there is none; a boom without kindle needs no light', () => {
  const tuned = litSeed(seedOf(3800, 240, { ...LIT_BOOM, atk_scale: 3, radius: 2.1, delay: 1 }));
  tuned.by.seed.hp = 0;
  until(tuned.w, tuned.c, 3);
  assert.deepEqual([tuned.w.blasts[0].left, tuned.w.blasts[0].amount], [30, 720]);
  until(tuned.w, tuned.c, 33);
  assert.equal(HP - at(tuned.w, 1, 1).hp, 720, 'two tiles off is inside 2.1');
  const quiet = litSeed(seed());
  status.applyStatus(quiet.by.seed, 'silence', {});
  quiet.by.seed.hp = 0;
  until(quiet.w, quiet.c, 20);
  assert.equal(quiet.w.blasts.length, 0, 'silenced, no blast');
  assert.equal(at(quiet.w, 1, 2).hp, HP);
  const dark = field([['seed', seed(), 3, 1], ['plain', seedOf(3800, 240, PLAIN_BOOM), 4, 1]]);
  dark.by.seed.hp = 0;
  dark.by.plain.hp = 0;
  until(dark.w, dark.c, 1);
  assert.deepEqual(dark.w.blasts.map((x) => x.src), [dark.by.plain.id], 'the unlit seed: none; the boom without kindle: its own');
});

test('[敌能-136] the rise: + add_max_atk × steps of 0.1 s ÷ time from its spawn, one buff, then full; silence and stun do not stop it', () => {
  const { c, w, by } = field([['vine', vine(), 2, 1]]);
  const v = by.vine;
  status.applyStatus(v, 'silence', {});
  status.applyStatus(v, 'stun', {});
  until(w, c, 2);
  assert.deepEqual([ramp(v).length, attrs.statsOf(v).atk], [0, 800]);
  until(w, c, 3);
  assert.deepEqual(ramp(v).map((b) => b.mods), [{ atkPct: 2 * 3 / 1500 }]);
  assert.ok(near(attrs.statsOf(v).atk, 803.2));
  until(w, c, 1499);
  assert.ok(near(ramp(v)[0].mods.atkPct, 2 * 1497 / 1500));
  until(w, c, 1500);
  assert.deepEqual([ramp(v).length, ramp(v)[0].mods.atkPct, attrs.statsOf(v).atk], [1, 2, 2400], '+200 % at 50 s');
  until(w, c, 1600);
  assert.deepEqual([ramp(v).length, attrs.statsOf(v).atk], [1, 2400]);
  const tuned = field([['vine', tunedVine({ add_max_atk: 1, time: 3 }), 2, 1]]);
  until(tuned.w, tuned.c, 45);
  assert.ok(near(ramp(tuned.by.vine)[0].mods.atkPct, 0.5));
  until(tuned.w, tuned.c, 90);
  assert.equal(attrs.statsOf(tuned.by.vine).atk, 1600);
  until(tuned.w, tuned.c, 120);
  assert.equal(attrs.statsOf(tuned.by.vine).atk, 1600);
});

test('[敌能-136] the rise counts from its own spawn: a vine that comes in at 1 s first steps at 1.1 s', () => {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [VINE]: vine() };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(1, VINE)])];
  const w = createWorld(c, { seed: 1, players: 1 });
  until(w, c, 30);
  const v = must(w.units.find((u) => u.key === VINE));
  assert.equal(v.ab['pow.start'], 30, 'it came in in frame 30');
  until(w, c, 32);
  assert.equal(ramp(v).length, 0);
  until(w, c, 33);
  assert.deepEqual(ramp(v).map((b) => b.mods), [{ atkPct: 2 * 3 / 1500 }]);
});

/** Blocker on the vine's tile, six around it (one levitated), one two tiles off, and a neutral unit in the square. */
const SEATS = /** @type {[string, number, number][]} */ ([
  ['guard', 1, 2], ['g1', 1, 1], ['g3', 1, 3], ['sniper', 0, 2], ['s3', 0, 3], ['s2', 2, 2], ['s4', 2, 3], ['out', 1, 4],
]);
const AROUND = /** @type {[number, number][]} */ ([[1, 1], [1, 3], [0, 2], [0, 3], [2, 2], [2, 3]]);

/**
 * A vine at (2, 1) whose rise is full (+100 % over 3 s), with a test buff of +50 %: its attack is 2000. `pow` tunes the
 * rest. The flags and order of each operator's hits and 灼燃 are recorded. @param {Record<string, unknown>} pow
 */
function arena(pow) {
  const box = field([['vine', tunedVine({ add_max_atk: 1, time: 3, ...pow }), 2, 1], ['bystander', BYSTANDER, 1, 0]], SEATS);
  status.applyStatus(at(box.w, 0, 3), 'levitate', {});
  buffs.addBuff(box.by.vine, buffs.makeBuff({ key: 'test', mods: { atkPct: 0.5 } }));
  until(box.w, box.c, 95);
  assert.equal(attrs.statsOf(box.by.vine).atk, 2000);
  assert.equal(box.by.vine.blockedBy, at(box.w, 1, 2).id);
  /** @type {any[]} */
  const log = [];
  const v = box.by.vine;
  bus.on(box.w, 'hit', (k) => {
    if (k.credit === v) log.push({ what: 'hit', id: k.target.id, attack: k.dmg.isAttack === true, splash: k.dmg.isSplash === true, skill: k.dmg.isSkill === true, type: k.dmg.type });
  });
  bus.on(box.w, 'elementHit', (k) => { if (k.source === v) log.push({ what: 'ep', id: k.target.id, el: k.dmg.element }); });
  return { ...box, log };
}

/** Lets the held attack go this frame. @param {ReturnType<typeof arena>} box */
function strike(box) {
  box.by.vine.atkCd = 0;
  until(box.w, box.c, box.w.frame);
  box.by.vine.atkCd = 1e6;
}

/** @param {Unit} u @param {number} dmg @param {number} fire */
function took(u, dmg, fire) {
  assert.equal(HP - u.hp, dmg, u.key);
  assert.ok(near(elements.epOf(u, 'FIRE'), 1000 - fire), u.key);
}

test('[敌能-136] [敌能-26] [元素-2] the first attack: the 3×3 takes the hit × splash, each with 灼燃 of the current attack × ratio; the target its hit; flags, damage before 灼燃', () => {
  const box = arena({ 'attack@ep_damage_ratio': 0.3, 'attack@ep_damage_ratio_normal': 0.1, splash: 0.5 });
  const g = at(box.w, 1, 2);
  strike(box);
  took(g, 2000, 600);
  for (const [row, col] of AROUND) took(at(box.w, row, col), 1000, 600);
  took(at(box.w, 1, 4), 0, 0);
  assert.equal(HP - box.by.bystander.hp, 1000, 'a neutral unit in the square takes the splash');
  assert.equal(elements.epOf(box.by.bystander, 'FIRE'), 1000, 'and no 灼燃');
  const mine = box.log.filter((x) => x.id === g.id);
  assert.deepEqual(mine, [{ what: 'hit', id: g.id, attack: true, splash: false, skill: false, type: 'arts' }, { what: 'ep', id: g.id, el: 'FIRE' }]);
  const side = box.log.filter((x) => x.what === 'hit' && x.id !== g.id && x.id !== box.by.bystander.id);
  assert.equal(box.log.filter((x) => x.what === 'ep').length, 1 + AROUND.length, 'no 灼燃 on the neutral unit');
  assert.equal(side.length, AROUND.length);
  assert.ok(side.every((x) => x.attack && x.splash && !x.skill && x.type === 'arts'));
  assert.deepEqual([ramp(box.by.vine).length, attrs.statsOf(box.by.vine).atk], [0, 1200], 'the 增益 is gone after it');
});

test('[敌能-136] after the first successful attack: no splash, 灼燃 × the normal ratio on the target only; the rise does not come back', () => {
  const box = arena({ 'attack@ep_damage_ratio': 0.3, 'attack@ep_damage_ratio_normal': 0.1, splash: 0.5 });
  strike(box);
  until(box.w, box.c, box.w.frame + 30);
  assert.equal(ramp(box.by.vine).length, 0);
  const g = at(box.w, 1, 2);
  const others = () => box.w.units.filter((u) => u !== g && (u.kind === KIND.OPERATOR || u === box.by.bystander)).map((u) => [u.key, u.hp, elements.epOf(u, 'FIRE')]);
  const before = others();
  strike(box);
  took(g, 2000 + 1200, 600 + 120);
  assert.deepEqual(others(), before, 'no splash any more');
});

test('[敌能-136] 灼藤 striking before its rise is full (+3.2 % at 0.8 s): the 增益 goes, and stays gone as the 0.1 s steps go by', () => {
  const box = field([['vine', vine(), 2, 1]], [['guard', 1, 2]]);
  const v = box.by.vine, g = at(box.w, 1, 2);
  until(box.w, box.c, 23);
  assert.ok(near(attrs.statsOf(v).atk, 800 * (1 + 2 * 21 / 1500)), 'seven steps by frame 23');
  v.atkCd = 0;
  until(box.w, box.c, 24);
  v.atkCd = 1e6;
  assert.ok(near(HP - g.hp, 800 * (1 + 2 * 24 / 1500)), 'the hit at the eighth step');
  assert.ok(near(1000 - elements.epOf(g, 'FIRE'), 0.25 * 800 * (1 + 2 * 24 / 1500)));
  until(box.w, box.c, 90);
  assert.deepEqual([ramp(v).length, attrs.statsOf(v).atk], [0, 800]);
});

test('[敌能-136] a first attack that took no HP — dodged, or on an invincible target — keeps the 增益: the next attack splashes again', () => {
  // 10 % 灼燃 a strike, so three strikes stay below the burst (元素-4)
  const box = arena({ 'attack@ep_damage_ratio': 0.1 });
  const g = at(box.w, 1, 2);
  buffs.addBuff(g, buffs.makeBuff({ key: 'dodgeTest', mods: { dodgeArts: 1 } }));
  strike(box);
  assert.equal(g.hp, HP, 'dodged');
  assert.equal(ramp(box.by.vine).length, 1);
  assert.equal(HP - at(box.w, 1, 1).hp, 2000, 'the splash still landed, at splash 1');
  buffs.removeBuff(g, 'dodgeTest');
  status.applyStatus(g, 'invincible', {});
  until(box.w, box.c, box.w.frame + 5);
  strike(box);
  assert.deepEqual([g.hp, ramp(box.by.vine).length], [HP, 1], 'invincible: no HP taken');
  assert.equal(HP - at(box.w, 1, 1).hp, 4000, 'and the square again');
  buffs.removeBuff(g, 'invincible');
  strike(box);
  assert.deepEqual([HP - g.hp, ramp(box.by.vine).length], [2000, 0], 'the first that took HP ends it');
});
