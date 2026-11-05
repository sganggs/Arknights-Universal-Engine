// “帝国的甲胄” (docs/spec/foes.md 敌能-137) on the tiny map. It is in no shipped level, so its record is built here from
// enemy_database (ArknightsGameData 17759cc8, level 0); withFoeExtras adds the page's three seconds of 回忆里的誓死.
// The route starts on (2, 0). A zone on (1, 4) is rows 0–2 and columns 3–5, out of the armour's reach from the start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, status, buffs, bus } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, withFoeExtras, FOE_EXTRAS, LEVELS } from '../src/index.js';
import { uncoveredAbilities } from '../src/foes.js';
import { imperialArmorBehaviors } from '../src/imperialarmor.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const KEY = 'enemy_10027_vtsk';
const APPEAR = Object.freeze({ key: 'Appear', cooldown: 0, initCooldown: 0, sp: 0, bb: { times: 8 } });
const COMBO = Object.freeze({ key: 'MultiCombat', cooldown: 15, initCooldown: 10, sp: 0, bb: { times: 3 } });
/** 回忆里的誓死 with the page's seconds, for records of another key (no FOE_EXTRAS). */
const PAGE = Object.freeze({ times: 8, duration: 5.85, delay: 1.33, interval: 0.53 });
/** enemy_database level 0 of enemy_10027_vtsk (数据). @type {EnemyDef} */
const RAW = /** @type {EnemyDef} */ (/** @type {any} */ ({
  name: '“帝国的甲胄”', maxHp: 30000, atk: 1020, def: 1800, res: 5, moveSpeed: 0.5, baseAttackTime: 5, massLevel: 6, rangeRadius: 1.5,
  applyWay: 'ALL', motion: 'WALK', levelType: 'ELITE', talents: { range: { 'attack@atk_scale_range': 0.8 } }, skills: [APPEAR, COMBO],
}));

/** The record with fields replaced, FOE_EXTRAS merged for its key. @param {Record<string, any>} [over] @param {string} [key] */
const armor = (over = {}, key = KEY) => withFoeExtras(key, /** @type {EnemyDef} */ ({ ...RAW, ...over }));
/** Its skills with 回忆里的誓死's blackboard (and fields) replaced. @param {Record<string, any>} bb @param {Record<string, any>} [more] */
const appearing = (bb, more = {}) => ({ skills: [{ ...APPEAR, ...more, bb }, COMBO] });
/** @param {Record<string, any>} talents @returns {EnemyDef} */
const named = (talents) => ({ name: 'e', maxHp: 100, atk: 100, def: 0, res: 0, moveSpeed: 1, talents });

/** @typedef {{ at?: number, key?: string, free?: boolean, tune?: (c: any) => void, more?: Record<string, any>, spawns?: any[] }} Open */

/**
 * The tiny map's content: the armour of `key` from the route's start at `at` seconds, after `spawns`; operators of no
 * attack, DEF or RES and a million HP, with a second guard, a second sniper and a flying sniper.
 * @param {EnemyDef} def @param {string} key @param {Open} o
 */
function content(def, key, o) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: def, ...o.more };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([...(o.spawns ?? []), spawnAt(o.at ?? 0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, atk: 0, def: 0, res: 0, maxHp: 1e6 });
  c.operators.g2 = { ...c.operators.guard, name: 'g2' };
  c.operators.s2 = { ...c.operators.sniper, name: 's2' };
  c.operators.bird = { ...c.operators.sniper, name: 'bird', motion: 'FLY' };
  return c;
}

/**
 * The tiny map: operators — [key, row, col, maxHp] — deployed in frame 0, then the armour on the route's start at `at`
 * seconds (0: frame 0, after the deployments). `tune` may change the content first. With `at` 0 the armour is rooted
 * and its normal attack held off after frame 0 unless `free`.
 * @param {EnemyDef} def @param {[string, number, number, number][]} ops @param {Open} [o]
 */
function open(def, ops, o = {}) {
  const key = o.key ?? KEY, c = content(def, key, o);
  for (const [op, , , hp] of ops) c.operators[op].maxHp = hp;
  o.tune?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  const first = step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === key) ?? null);
  if (e && !o.free) hold(e);
  return { c, w, e, first };
}

/** Rooted, its normal attack held off. @param {Unit} e */
function hold(e) {
  status.applyStatus(e, 'root', {});
  e.atkCd = 99999;
}

/** Steps until the armour is on the field; it is then held. @param {{ c: any, w: World }} box @param {string} [key] */
function arrive(box, key = KEY) {
  while (!box.w.units.some((u) => u.key === key)) step(box.w, box.c);
  const e = /** @type {Unit} */ (box.w.units.find((u) => u.key === key));
  hold(e);
  return e;
}

/** @param {World} w @param {string} key @returns {Unit} */
const unitOf = (w, key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));
/** @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** The armour's damaging hits in events: [target id, damage]. @param {any[]} ev @param {Unit} e */
const hitsOf = (ev, e) => ev.filter((x) => x.type === 'hit' && x.id === e.id).map((x) => [x.target, x.damage]);

/**
 * Runs n frames (the first command list, if any, in the first): the armour's damaging hits as [frame, target key,
 * damage] and its attack starts as [frame, target key].
 * @param {World} w @param {any} c @param {Unit} e @param {number} n @param {any[]} [cmds]
 */
function watchFrames(w, c, e, n, cmds = []) {
  /** @type {Map<number, string>} */
  const names = new Map();
  /** @type {any[]} */
  const mine = [];
  for (let i = 0; i < n; i++) {
    for (const u of w.units) names.set(u.id, u.key);
    const f = w.frame, ev = /** @type {any[]} */ (step(w, c, i === 0 ? cmds : []));
    for (const u of w.units) names.set(u.id, u.key);
    for (const x of ev) if (x.id === e.id) mine.push({ ...x, f });
  }
  const who = (/** @type {any} */ x) => names.get(x.target) ?? '';
  return {
    hits: mine.filter((x) => x.type === 'hit').map((x) => /** @type {[number, string, number]} */ ([x.f, who(x), x.damage])),
    attacks: mine.filter((x) => x.type === 'attack').map((x) => /** @type {[number, string]} */ ([x.f, who(x)])),
  };
}

/** The flags of the armour's hits as they pass the `hit` event. @param {World} w @param {Unit} e */
function flagsOf(w, e) {
  /** @type {{ attack: boolean, skill: boolean, type: string }[]} */
  const out = [];
  bus.on(w, 'hit', (k) => { if (k.credit === e) out.push({ attack: k.dmg.isAttack === true, skill: k.dmg.isSkill === true, type: k.dmg.type }); });
  return out;
}

/** The deploy command. @param {string} op @param {number} row @param {number} col @returns {[number, any]} */
const deploy = (op, row, col) => [0, { type: 'deploy', op, row, col, dir: 0 }];

test('[敌能-137] [关卡-2] the data record lacks the page\'s seconds; with them it is covered; 汉科\'s talent Appear and other shapes are not', () => {
  assert.deepEqual(uncoveredAbilities([RAW]), ['Appear']);
  assert.deepEqual(FOE_EXTRAS[KEY].skills, { Appear: { duration: 5.85, delay: 1.33, interval: 0.53 } });
  assert.ok(FOE_EXTRAS[KEY].source.endsWith('oldid=377746'));
  const merged = armor();
  assert.deepEqual(merged.skills?.map((s) => s.bb), [{ times: 8, duration: 5.85, delay: 1.33, interval: 0.53 }, { times: 3 }]);
  assert.deepEqual(merged.talents, { range: { 'attack@atk_scale_range': 0.8 } });
  assert.deepEqual(uncoveredAbilities([merged]), []);
  assert.equal(Object.values(LEVELS).some((lv) => Object.hasOwn(lv.enemies ?? {}, KEY)), false, 'in no shipped level');
  for (const k of ['enemy_2138_shdbjg', 'enemy_2139_shdbj2']) assert.deepEqual(uncoveredAbilities([withFoeExtras(k, named({ Appear: { mark: 1 } }))]), ['Appear'], k);
  const full = [{ ...APPEAR, bb: PAGE }, COMBO];
  assert.deepEqual(uncoveredAbilities([armor({ skills: full }, 'other')]), []);
  /** @type {[Record<string, any>, string][]} */
  const shapes = [
    [{ talents: { range: { 'attack@atk_scale_range': '0.8' } }, skills: full }, 'range'],
    [{ talents: { range: { 'attack@atk_scale_range': 0.8, atk: 0.5 } }, skills: full }, 'range'],
    [appearing({ ...PAGE, duration: '5.85' }), 'Appear'],
    [appearing({ ...PAGE, atk_scale: 1 }), 'Appear'],
    [appearing({ times: 8, duration: 5.85, delay: 1.33 }), 'Appear'],
    [{ skills: [full[0], { ...COMBO, bb: { times: '3' } }] }, 'MultiCombat'],
    [{ skills: [full[0], { ...COMBO, bb: { times: 3, atk_scale: 1 } }] }, 'MultiCombat'],
  ];
  for (const [over, name] of shapes) assert.deepEqual(uncoveredAbilities([armor(over, 'other')]), [name], JSON.stringify(over));
});

test('[敌能-137] 回忆里的誓死: cast on the spawn frame on the tile of ours with the most HP anywhere; from frame 40, every 16, the one with the most HP in the 3×3, at most 8; gone at 176', () => {
  const { c, w, e, first } = open(armor(), [['guard', 1, 4, 9000], ['sniper', 0, 3, 8000], ['s2', 0, 2, 8500]]);
  assert.deepEqual([e.ab['Appear.row'], e.ab['Appear.col'], e.ab['Appear.on']], [1, 4, 1], 'the guard\'s tile, beyond its 1.5 tiles');
  assert.deepEqual(hitsOf(first, e), [], 'nothing on the cast frame');
  const { hits } = watchFrames(w, c, e, 175);
  assert.deepEqual(hits, [[40, 'guard', 1020], [56, 'sniper', 1020], [72, 'guard', 1020], [88, 'sniper', 1020],
    [104, 'guard', 1020], [120, 'sniper', 1020], [136, 'guard', 1020], [152, 'sniper', 1020]], 're-picked by the HP left each time');
  assert.equal(e.ab['Appear.on'], 1, 'up through frame 175');
  step(w, c);
  assert.equal(e.ab['Appear.on'], 0, 'gone after frame 176');
  assert.equal(unitOf(w, 's2').hp, 8500, 'more HP than the sniper, but outside the 3×3');
  assert.deepEqual(watchFrames(w, c, e, 400).hits, [], 'cast once');
  assert.equal(e.ab['Appear.done'], 1);
});

test('[敌能-137] [伤害-7] each strike is the current 攻击力 as physical damage, an attack and the skill\'s, not a normal attack\'s hit', () => {
  const { c, w, e } = open(armor(), [['guard', 1, 4, 9000]]);
  const flags = flagsOf(w, e);
  let attackHits = 0;
  bus.on(w, 'attackHit', (k) => { if (k.attacker === e) attackHits++; });
  assert.deepEqual(watchFrames(w, c, e, 40).hits, [[40, 'guard', 1020]]);
  buffs.addBuff(e, buffs.makeBuff({ key: 'test', mods: { atkPct: 0.5 } }));
  assert.deepEqual(watchFrames(w, c, e, 16).hits, [[56, 'guard', 1530]], '攻击力 at the strike');
  assert.deepEqual(flags, [{ attack: true, skill: true, type: 'phys' }, { attack: true, skill: true, type: 'phys' }]);
  assert.equal(attackHits, 0);
});

test('[敌能-137] the zone stays on its tile when the centre retreats; an empty check is not counted, so the ninth fills in; one outside is never struck', () => {
  const { c, w, e } = open(armor(), [['guard', 1, 4, 9000]]);
  step(w, c, [[0, { type: 'retreat', unit: unitOf(w, 'guard').id }]]);
  run(w, c, 43);
  const { hits } = watchFrames(w, c, e, 140, [deploy('sniper', 0, 3), deploy('g2', 1, 2)]);
  assert.deepEqual(hits.map(([f, k]) => [f, k]), [56, 72, 88, 104, 120, 136, 152, 168].map((f) => [f, 'sniper']));
  assert.deepEqual([e.ab['Appear.row'], e.ab['Appear.col'], e.ab['Appear.hits']], [1, 4, 8]);
});

test('[敌能-137] with none of ours to pick, the zone is on its own tile', () => {
  const { c, w, e } = open(armor(), []);
  assert.deepEqual([e.ab['Appear.row'], e.ab['Appear.col']], [2, 0]);
  const { hits } = watchFrames(w, c, e, 176, [deploy('guard', 1, 1), deploy('g2', 1, 2)]);
  assert.deepEqual(hits.map(([f, k]) => [f, k]), [40, 56, 72, 88, 104, 120, 136, 152].map((f) => [f, 'guard']), 'g2 on (1, 2) is outside');
});

test('[敌能-137] [索敌-2] [索敌-5] [合作-9] the centre passes over 隐匿, 迷彩, 沉睡, 无法选中 and 起飞; a flying or a neutral unit may be it; a tie goes to the later deployed', () => {
  /** The zone's column with `op` (9000 HP) on (0, 2) and the guard (5000) on (1, 4); `prep` runs on `op` first. @param {(u: Unit) => void} prep */
  const centre = (prep, op = 's2') => {
    const box = open(armor(), [[op, 0, 2, 9000], ['guard', 1, 4, 5000]], { at: 1 });
    prep(unitOf(box.w, op));
    return arrive(box).ab['Appear.col'];
  };
  assert.equal(centre(() => {}), 2);
  assert.equal(centre(() => {}, 'bird'), 2, 'a flying unit: a skill may target air');
  for (const flags of /** @type {Record<string, boolean>[]} */ ([{ stealth: true }, { camou: true }, { untargetable: true }, { liftoff: true }])) {
    assert.equal(centre((u) => buffs.addBuff(u, buffs.makeBuff({ key: 'test', flags }))), 4, JSON.stringify(flags));
  }
  assert.equal(centre((u) => { status.applyStatus(u, 'sleep', {}); }), 4, '沉睡');
  const tie = (/** @type {[string, number, number, number][]} */ ops) => arrive(open(armor(), ops, { at: 1 })).ab['Appear.col'];
  assert.equal(tie([['s2', 0, 2, 5000], ['guard', 1, 4, 5000]]), 4, 'the guard deployed after s2');
  assert.equal(tie([['guard', 1, 4, 5000], ['s2', 0, 2, 5000]]), 2);
  const civ = { name: 'civ', maxHp: 9500, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true };
  const box = open(armor(), [['guard', 1, 4, 5000]], { at: 1, more: { civ }, spawns: [spawnAt(0, 'civ')] });
  const man = unitOf(box.w, 'civ');
  Object.assign(man, { x: 3, y: 1 });
  const e = arrive(box);
  assert.deepEqual([e.ab['Appear.row'], e.ab['Appear.col']], [1, 3]);
  assert.deepEqual(watchFrames(box.w, box.c, e, 40).hits.map(([, k]) => k), ['civ'], 'the neutral unit is struck first');
});

test('[敌能-137] [索敌-2] each strike picks by the centre\'s rules: a flying unit in the 3×3 is struck, 迷彩, 隐匿 and 起飞 in it are passed over', () => {
  const box = open(armor(), [['guard', 1, 4, 9000], ['bird', 0, 3, 8500], ['s2', 2, 3, 9900], ['g2', 1, 3, 9800]], { at: 1 });
  const s2 = unitOf(box.w, 's2');
  buffs.addBuff(s2, buffs.makeBuff({ key: 'test', flags: { camou: true } }));
  buffs.addBuff(unitOf(box.w, 'g2'), buffs.makeBuff({ key: 'test', flags: { liftoff: true } }));
  const e = arrive(box), cast = box.w.frame - 1;
  assert.deepEqual([e.ab['Appear.row'], e.ab['Appear.col']], [1, 4]);
  const first = watchFrames(box.w, box.c, e, 40);
  buffs.removeBuff(s2, 'test');
  buffs.addBuff(s2, buffs.makeBuff({ key: 'test', flags: { stealth: true } }));
  const later = watchFrames(box.w, box.c, e, 32);
  assert.deepEqual([...first.hits, ...later.hits].map(([f, k]) => [f - cast, k]), [[40, 'guard'], [56, 'bird'], [72, 'guard']], 's2 迷彩, then 隐匿');
});

test('[敌能-137] [时间-2] 回忆里的誓死 waits out its first cooldown and a stun, not a silence, 缴械 nor a block', () => {
  const late = armor(appearing(APPEAR.bb, { initCooldown: 1 }));
  /** The frame of the cast with `prep` on the armour in frame 1. @param {(e: Unit) => void} prep */
  const castAt = (prep) => {
    const { c, w, e } = open(late, [['guard', 1, 4, 9000]]);
    prep(e);
    while (!e.ab['Appear.done'] && w.frame < 200) step(w, c);
    return w.frame - 1;
  };
  assert.equal(castAt(() => {}), 30, '1 s after the spawn');
  assert.equal(castAt((e) => { status.applyStatus(e, 'silence', { seconds: 20 }); }), 30, 'not silenceable');
  assert.equal(castAt((e) => { status.applyStatus(e, 'disarmedCombat', { seconds: 20 }); }), 30, 'not an attack');
  assert.equal(castAt((e) => { status.applyStatus(e, 'stun', { seconds: 2 }); }), 60, 'the first turn after the stun');
  const held = onRoad([['guard', 1, 2]], appearing(APPEAR.bb, { initCooldown: 1 })), guard = unitOf(held.w, 'guard');
  assert.equal(held.e.blockedBy, guard.id);
  while (!held.e.ab['Appear.done'] && held.w.frame < 200) step(held.w, held.c);
  assert.deepEqual([held.w.frame - 1, held.e.blockedBy], [30, guard.id], 'cast while blocked');
});

test('[敌能-137] the cast does not hold the armour: it walks and makes its normal attacks while the zone is up', () => {
  const { c, w, e, first } = open(armor(), [['guard', 1, 1, 20000]], { free: true });
  assert.deepEqual([e.ab['Appear.row'], e.ab['Appear.col']], [1, 1]);
  assert.deepEqual(hitsOf(first, e), [[unitOf(w, 'guard').id, 816]], 'its normal attack in frame 0, unblocked');
  const y0 = e.y, early = watchFrames(w, c, e, 39);
  assert.ok(e.y < y0, 'it walked before the first strike');
  const { hits } = watchFrames(w, c, e, 137);
  assert.deepEqual([...early.hits, ...hits].map(([f, , d]) => [f, d]), [[40, 1020], [56, 1020], [72, 1020], [88, 1020], [104, 1020], [120, 1020], [136, 1020], [150, 816], [152, 1020]]);
});

test('[敌能-137] [时间-2] times, delay, interval and duration follow the blackboard; a check on the last frame counts; delay 0 strikes on the cast frame', () => {
  /** Strike frames over 60 frames for 回忆里的誓死 of this blackboard. @param {Record<string, number>} bb */
  const frames = (bb) => {
    const { c, w, e, first } = open(armor(appearing(bb), 'armor'), [['guard', 1, 4, 9000]], { key: 'armor' });
    return [...hitsOf(first, e).map(() => 0), ...watchFrames(w, c, e, 60).hits.map(([f]) => f)];
  };
  assert.deepEqual(frames({ times: 2, duration: 0.9, delay: 0.5, interval: 0.2 }), [15, 21]);
  assert.deepEqual(frames({ times: 5, duration: 0.9, delay: 0.5, interval: 0.2 }), [15, 21, 27]);
  assert.deepEqual(frames({ times: 5, duration: 0.85, delay: 0.5, interval: 0.2 }), [15, 21], '0.85 s is 26 frames');
  assert.deepEqual(frames({ times: 5, duration: 0.9, delay: 0, interval: 0.2 }), [0, 6, 12, 18, 24]);
});

test('[敌能-137] [伤害-8] a dodged strike and one on an invincible unit still count', () => {
  const { c, w, e } = open(armor(), [['guard', 1, 4, 9000]]);
  const g = unitOf(w, 'guard');
  buffs.addBuff(g, buffs.makeBuff({ key: 'test', mods: { dodgePhys: 1 } }));
  run(w, c, 44);
  assert.equal(g.hp, 9000);
  buffs.removeBuff(g, 'test');
  status.applyStatus(g, 'invincible', { frames: 20 });
  const { hits } = watchFrames(w, c, e, 140);
  assert.deepEqual(hits.map(([f]) => f), [72, 88, 104, 120, 136, 152], 'the checks at 40 and 56 were strikes 1 and 2');
  assert.equal(e.ab['Appear.hits'], 8);
});

test('[敌能-137] [敌能-2] the armour\'s stun and silence leave the zone striking; once it is knocked down, nothing more', () => {
  const { c, w, e } = open(armor(), [['guard', 1, 4, 9000]]);
  run(w, c, 44);
  status.applyStatus(e, 'stun', { seconds: 1 });
  status.applyStatus(e, 'silence', { seconds: 10 });
  assert.deepEqual(watchFrames(w, c, e, 30).hits.map(([f]) => f), [56, 72]);
  e.hp = 0;
  assert.deepEqual(watchFrames(w, c, e, 120).hits, []);
  assert.equal(w.units.includes(e), false);
});

/**
 * The armour on (1, 2), held, with operators deployed one per frame; its zone is on (2, 0), away from them.
 * @param {[string, number, number][]} ops @param {Record<string, any>} [over] @param {(c: any) => void} [tune]
 */
function onRoad(ops, over = {}, tune) {
  const box = open(armor(over), [], { tune });
  Object.assign(box.e, { x: 2, y: 1 });
  for (const [op, row, col] of ops) step(box.w, box.c, [deploy(op, row, col)]);
  return box;
}

/** One attack now: its hits as [target key, damage]. @param {{ c: any, w: World, e: Unit }} box */
function attackNow({ c, w, e }) {
  e.atkCd = 0;
  const { hits } = watchFrames(w, c, e, 1);
  e.atkCd = 99999;
  return hits.map(([, k, d]) => [k, d]);
}

test('[敌能-137] range: unblocked, flying units are left out and the hit is the current 攻击力 × the talent\'s number; silence does not stop it; blocked, the blocker at 100 %', () => {
  const box = onRoad([['sniper', 0, 3], ['bird', 0, 2]]);
  const flags = flagsOf(box.w, box.e);
  assert.equal(box.e.blockedBy, -1);
  assert.deepEqual(attackNow(box), [['sniper', 816]], 'the bird was deployed later, but flies');
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'test', mods: { atkPct: 0.5 } }));
  assert.deepEqual(attackNow(box), [['sniper', 1224]]);
  buffs.removeBuff(box.e, 'test');
  status.applyStatus(box.e, 'silence', { seconds: 60 });
  assert.deepEqual(attackNow(box), [['sniper', 816]], 'a talent is not silenced');
  assert.deepEqual(flags, Array(3).fill({ attack: true, skill: false, type: 'phys' }));
  step(box.w, box.c, [[0, { type: 'retreat', unit: unitOf(box.w, 'sniper').id }]]);
  assert.deepEqual(attackNow(box), [], 'only a flyer in reach: no attack');
  assert.deepEqual(attackNow(onRoad([['sniper', 0, 3]], { talents: { range: { 'attack@atk_scale_range': 0.6 } } })), [['sniper', 612]]);
  const held = onRoad([['sniper', 0, 3], ['bird', 0, 2], ['guard', 1, 2]]);
  assert.equal(held.e.blockedBy, unitOf(held.w, 'guard').id);
  assert.deepEqual(attackNow(held), [['guard', 1020]]);
});

test('[敌能-137] range\'s own filter: unblocked it drops flying candidates, blocked it keeps the list, another shape keeps it (the engine\'s candidates already leave flyers out)', () => {
  const pick = /** @type {NonNullable<import('@aue/sim').FoeBehavior['targets']>} */ (imperialArmorBehaviors.range.targets);
  const flyer = /** @type {any} */ ({ id: 1, fly: true }), walker = /** @type {any} */ ({ id: 2, fly: false });
  /** @param {boolean} blocked @param {Record<string, number>} [bb] */
  const ctx = (blocked, bb = { 'attack@atk_scale_range': 0.8 }) => /** @type {any} */ ({ blocked, bb, stats: (/** @type {any} */ u) => ({ flying: u.fly }) });
  assert.deepEqual(pick(ctx(false), [flyer, walker]), [walker]);
  assert.deepEqual(pick(ctx(true), [flyer, walker]), [flyer, walker]);
  assert.deepEqual(pick(ctx(false, { 'attack@atk_scale_range': 0.8, atk: 0.5 }), [flyer, walker]), [flyer, walker]);
});

test('[敌能-137] [关卡-2] the other shapes stay inert in battle: 汉科\'s talent Appear, the data-only Appear, an extra key on MultiCombat or range', () => {
  for (const [def, key] of /** @type {[EnemyDef, string][]} */ ([[named({ Appear: { mark: 1 } }), 'hanke'], [armor({}, 'other'), 'other']])) {
    const { c, w, e } = open(def, [['guard', 1, 4, 9000]], { key });
    assert.deepEqual([watchFrames(w, c, e, 200).hits, e.ab['Appear.done'] ?? 0, e.ab['Appear.on'] ?? 0], [[], 0, 0], key);
  }
  const combo = onRoad([['guard', 1, 2]], { skills: [APPEAR, { ...COMBO, bb: { times: 3, atk_scale: 1 } }] });
  combo.e.ab['MultiCombat.cd'] = 0;
  assert.deepEqual(attackNow(combo), [['guard', 1020]], 'one hit, no skill');
  assert.equal(combo.e.ab['MultiCombat.cd'], 0);
  assert.deepEqual(attackNow(onRoad([['sniper', 0, 3]], { talents: { range: { 'attack@atk_scale_range': 0.8, atk: 0.5 } } })), [['sniper', 1020]], 'no ×0.8');
});

/**
 * Attacks over n frames from frame 1, the guard deployed then: [frame, hits, damage each, skill].
 * @param {{ c: any, w: World, e: Unit }} box @param {number} n @returns {[number, number, number | undefined, boolean][]}
 */
function combos({ c, w, e }, n) {
  const flags = flagsOf(w, e);
  e.atkCd = 0;
  const { hits, attacks } = watchFrames(w, c, e, n, [deploy('guard', 1, 2)]);
  let k = 0;
  return attacks.map(([f]) => {
    const mine = hits.filter(([hf]) => hf === f), skill = flags.slice(k, k + mine.length).every((x) => x.skill && x.attack);
    k += mine.length;
    return [f, mine.length, mine[0]?.[2], skill];
  });
}

test('[敌能-137] 回忆里的怒守: blocked and ready, the attack is 3 hits of 攻击力 on the blocker, each against its DEF; first ready 10 s after the spawn, then 15 s after each', () => {
  const box = open(armor(), [], { tune: (c) => { c.operators.guard.def = 500; } });
  Object.assign(box.e, { x: 2, y: 1 });
  assert.deepEqual(combos(box, 800), [[1, 1, 520, false], [151, 1, 520, false], [301, 3, 520, true], [451, 1, 520, false], [601, 1, 520, false], [751, 3, 520, true]]);
  const quick = open(armor({ baseAttackTime: 1, skills: [APPEAR, { ...COMBO, initCooldown: 2, cooldown: 3, bb: { times: 4 } }] }), []);
  Object.assign(quick.e, { x: 2, y: 1 });
  const got = combos(quick, 260);
  assert.deepEqual(got.filter(([, n]) => n > 1), [[61, 4, 1020, true], [151, 4, 1020, true], [241, 4, 1020, true]]);
  assert.deepEqual(got.filter(([, n]) => n === 1).map(([f]) => f), [1, 31, 91, 121, 181, 211]);
});

test('[敌能-137] 回忆里的怒守 is silenceable; it does not fire unblocked, nor while 缴械 stops the blocked attack; it keeps ready meanwhile', () => {
  const box = onRoad([['guard', 1, 2]]);
  box.e.ab['MultiCombat.cd'] = 0;
  status.applyStatus(box.e, 'silence', { seconds: 60 });
  assert.deepEqual(attackNow(box), [['guard', 1020]]);
  assert.equal(box.e.ab['MultiCombat.cd'], 0);
  buffs.removeBuff(box.e, 'silence');
  status.applyStatus(box.e, 'disarmedCombat', { seconds: 60 });
  assert.deepEqual(attackNow(box), []);
  assert.equal(box.e.ab['MultiCombat.cd'], 0);
  buffs.removeBuff(box.e, 'disarmedCombat');
  assert.deepEqual(attackNow(box), Array(3).fill(['guard', 1020]));
  assert.equal(box.e.ab['MultiCombat.cd'], 450);
  const free = onRoad([['sniper', 0, 3]]);
  free.e.ab['MultiCombat.cd'] = 0;
  assert.deepEqual(attackNow(free), [['sniper', 816]]);
  assert.equal(free.e.ab['MultiCombat.cd'], 0);
});

test('[敌能-137] [攻击-2] 回忆里的怒守 is spent as its attack starts: the blocker gone before the hit, nothing lands and the cooldown runs', () => {
  const box = onRoad([['guard', 1, 2]], { attack: { duration: 1, hit: 0.5 } });
  box.e.ab['MultiCombat.cd'] = 0;
  box.e.atkCd = 0;
  const start = watchFrames(box.w, box.c, box.e, 1);
  box.e.atkCd = 99999;
  assert.deepEqual([start.attacks.length, start.hits.length], [1, 0], 'a 15-frame wind-up');
  assert.equal(box.e.ab['MultiCombat.cd'], 450);
  const later = watchFrames(box.w, box.c, box.e, 20, [[0, { type: 'retreat', unit: unitOf(box.w, 'guard').id }]]);
  assert.deepEqual(later.hits, []);
  assert.equal(box.e.ab['MultiCombat.cd'], 430);
});
