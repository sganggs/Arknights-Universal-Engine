// 深池弩炮手 / 深池弩炮队长 (docs/spec/foes.md 敌能-152): 爆破弹发射 — the third attack is the engine's 3×3 tile splash
// (敌能-26): no bolt; as its swing ends, the target and every unit on the eight tiles around its tile take 攻击力 100% —
// and the three shapes `PowerAttack` covers (敌能-36's list). The records are enemy_database's at level 0
// (ArknightsGameData 17759cc8); 深池弩炮队长 is also tested through act1football_sub-1-2's record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, bus, devices, summons } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { foeBehaviors, withFoeExtras, uncoveredAbilities, withoutIncomplete } from '../src/foes.js';
import { levelAt, levelContent } from '../src/index.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const SHOOTER = 'enemy_1289_dubmb', CAPTAIN = 'enemy_1289_dubmb_2', LEVEL = 'act1football_sub-1-2';
const HP = 1e6;
/** A test record's attack clip (攻击-2): 1 s, its hit at 0.5 s — a 15-frame wind-up at the 5 s interval. The data's have none. */
const CLIP = Object.freeze({ duration: 1, hit: 0.5 });

/**
 * 深池弩炮手 at level 0 (数据：enemy_database enemy_1289_dubmb — atk 500, def 300, res 20, rangeRadius 10, RANGED,
 * baseAttackTime 5; PowerAttack initCooldown 0, cooldown 0, spCost 2, blackboard empty), with what a test changes.
 * @param {Partial<EnemyDef>} [over] @param {number} [sp] @returns {EnemyDef}
 */
function shooter(over = {}, sp = 2) {
  return {
    name: '深池弩炮手', maxHp: 6000, atk: 500, def: 300, res: 20, moveSpeed: 0.6, baseAttackTime: 5, rangeRadius: 10, applyWay: 'RANGED',
    motion: 'WALK', massLevel: 2, skills: [{ key: 'PowerAttack', cooldown: 0, initCooldown: 0, sp, bb: {} }], ...over,
  };
}

/** As the content assembles a record (index.js): its extras merged, incomplete abilities left out. @param {string} key @param {EnemyDef} def */
const assembled = (key, def) => withoutIncomplete(withFoeExtras(key, def));

/**
 * One of ours: placeable on road and high ground, no block, attacking only its own tile, ATK, DEF and RES 0 unless
 * `over` says; `main` has taunt 1. @param {string} name @param {Record<string, number>} [over]
 */
const ours = (name, over = {}) => ({
  name, position: 'ALL', cost: 0, blockCnt: 0, baseAttackTime: 1, maxHp: HP, atk: 0, def: 0, res: 0, tauntLevel: name === 'main' ? 1 : 0, range: [{ row: 0, col: 0 }], ...over,
});

/** A neutral unit (合作-9) and one of our devices. */
const MAN = { name: 'man', maxHp: HP, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true };
const BOX = { name: 'box', maxHp: HP, atk: 0, def: 0, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} };

/**
 * The shooter rooted on row 0, col 5 (x 5, y 0) and `ops` deployed at [row, col] on frame 1; `main` is the target. The
 * shooter holds its fire until then: its first attack is the next frame. With `man`, a neutral unit comes in at 0.5 s on
 * the start tile (2, 0), off the 3×3 — not at frame 0, where the shooter would spend an attack on it. With `seats`, a
 * co-op world of two seats, those ops deployed by seat 1; `more` names operators that are only defined (a summon's);
 * `defs` changes an operator's record.
 * @param {EnemyDef} rec @param {Record<string, [number, number]>} ops
 * @param {{ key?: string, man?: boolean, seats?: Record<string, number>, more?: string[], defs?: Record<string, Record<string, number>> }} [o]
 * @returns {{ c: any, w: World, e: Unit, by: Record<string, Unit> }}
 */
function arena(rec, ops, o = {}) {
  const key = o.key ?? SHOOTER, c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: rec, man: MAN };
  c.devices = { box: BOX };
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave([spawnAt(0, key), ...(o.man ? [spawnAt(0.5, 'man')] : [])])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 12 };
  c.operators = Object.fromEntries([...Object.keys(ops), ...(o.more ?? [])].map((n) => [n, ours(n, o.defs?.[n])]));
  const w = createWorld(c, { seed: 1, players: o.seats ? 2 : 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === key));
  Object.assign(e, { x: 5, y: 0, path: [], atkCd: 999 });
  status.applyStatus(e, 'root', {});
  step(w, c, Object.entries(ops).map(([op, [row, col]]) => [o.seats?.[op] ?? 0, { type: 'deploy', op, row, col, dir: 0 }]));
  e.atkCd = 0;
  return { c, w, e, by: Object.fromEntries(w.units.filter((u) => u.owner >= 0).map((u) => [u.key, u])) };
}

/** The `hit` events of a step (伤害-9). @param {readonly any[]} ev @returns {{ id: number, target: number, damage: number }[]} */
const hitsOf = (ev) => ev.filter((x) => x.type === 'hit');

/**
 * Steps until `n` of the shooter's attacks have landed — a bolt reaching its target (攻击-3), or the 3×3 at once: per
 * landing, its frame `f`, the frame `at` its attack started (攻击-2), what each unit took, in hits, by key, and the bolts
 * the shooter launched since the landing before. A bolt whose shooter left lands with no source (id −1) and counts too.
 * @param {World} w @param {any} c @param {Unit} e @param {number} n
 */
function landings(w, c, e, n) {
  const keyOf = new Map();
  /** @type {{ f: number, at: number, took: Record<string, number[]>, bolts: number }[]} */
  const out = [];
  let at = -1, bolts = 0;
  for (let i = 0; i < 200 * n && out.length < n; i++) {
    for (const u of w.units) keyOf.set(u.id, u.key);
    const ev = step(w, c);
    if (ev.some((x) => x.type === 'attack' && x.id === e.id)) at = w.frame - 1;
    bolts += ev.filter((x) => x.type === 'shot' && x.id === e.id).length;
    const hits = hitsOf(ev).filter((x) => x.id === e.id || x.id === -1);
    if (hits.length === 0) continue;
    /** @type {Record<string, number[]>} */
    const took = {};
    for (const x of hits) (took[keyOf.get(x.target) ?? String(x.target)] ??= []).push(x.damage);
    out.push({ f: w.frame - 1, at, took, bolts });
    bolts = 0;
  }
  assert.equal(out.length, n, `${out.length} of ${n} attacks landed`);
  return out;
}

/** Steps until the shooter starts an attack (攻击-2): that frame, and the wind-up its `attack` event gives. @param {World} w @param {any} c @param {Unit} e */
function begin(w, c, e) {
  for (let i = 0; i < 200; i++) {
    const a = /** @type {any} */ (step(w, c)).find((/** @type {any} */ x) => x.type === 'attack' && x.id === e.id);
    if (a) return { f: w.frame - 1, wind: /** @type {number} */ (a.wind) };
  }
  throw new Error('no attack');
}

/** Steps until the shooter launches a bolt (攻击-3); the frame it did. @param {World} w @param {any} c @param {Unit} e */
function launch(w, c, e) {
  for (let i = 0; i < 200; i++) if (step(w, c).some((x) => x.type === 'shot' && x.id === e.id)) return w.frame - 1;
  throw new Error('no bolt');
}

/** Steps `frames` frames; every `hit` event in them (伤害-9). @param {World} w @param {any} c @param {number} frames */
function quiet(w, c, frames) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < frames; i++) out.push(...hitsOf(step(w, c)));
  return out;
}

/** A `PowerAttack` holder with this blackboard, and no other ability. @param {Record<string, unknown>} bb @returns {EnemyDef} */
const holder = (bb) => /** @type {EnemyDef} */ ({ ...shooter(), skills: [{ key: 'PowerAttack', cooldown: 0, initCooldown: 0, sp: 3, bb }] });

/** A talent `PowerAttack` with this blackboard. @param {Record<string, number>} bb @returns {EnemyDef} */
const talentHolder = (bb) => ({ ...shooter(), skills: [], talents: { PowerAttack: bb } });

test('[敌能-152] [敌能-36] PowerAttack covers 无胄盟\'s, 澪\'s and the two marked 深池 pages; every other shape, the talents\' too, stays uncovered', () => {
  assert.deepEqual(uncoveredAbilities([holder({ ep_damage_ratio: 0.35, atk_scale: 1.5 })]), [], '无胄盟清扫小队 and the five others');
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_10118_ymgprc', holder({ atk_scale: 1.5 }))]), [], '澪, `times` from her row');
  for (const key of [SHOOTER, CAPTAIN]) {
    assert.deepEqual(withFoeExtras(key, shooter()).skills?.[0].bb, { square: 1 }, key);
    assert.deepEqual(uncoveredAbilities([withFoeExtras(key, shooter())]), [], key);
  }
  assert.deepEqual(uncoveredAbilities([shooter()]), ['PowerAttack'], 'the empty blackboard alone is not the marked page');
  const others = [
    { atk_scale: 1.5, def: -150 }, { atk_scale: 2 }, { atk_scale_init: 0.3, atk_scale_add: 0.3, times: 4, duration: 20 }, { force: 3 },
    { s1_anim_duration: 8, atk_scale: 1.5 }, { s1_anim_duration: 8, atk_scale: 1.5, ep_damage_ratio: 0.3 }, { atk_scale: 3, range_radius: 0.8 },
    { atk_scale: 3, stun: 3, ghost_time: 6 },
  ];
  for (const bb of others) assert.deepEqual(uncoveredAbilities([holder(bb)]), ['PowerAttack'], JSON.stringify(bb));
  /** @type {Record<string, number>[]} */
  const talents = [{ 'attack@max_target': 3 }, { 'attack@prob': 0.3, 'attack@sluggish': 2 }, { 'attack@prob': 0.3, 'attack@stun': 2 }];
  for (const bb of talents) {
    assert.deepEqual(uncoveredAbilities([talentHolder(bb)]), ['PowerAttack'], JSON.stringify(bb));
    assert.equal(withoutIncomplete(talentHolder(bb)).talents?.PowerAttack, undefined);
  }
  for (const bb of [{ atk_scale: '1.5', ep_damage_ratio: 0.35 }, { atk_scale: 1.5, times: '2' }, { square: '1' }, { square: 2 }, { square: 1, atk_scale: 1.5 }]) {
    assert.deepEqual(uncoveredAbilities([holder(bb)]), ['PowerAttack'], JSON.stringify(bb));
  }
  assert.deepEqual(withoutIncomplete(holder({ atk_scale: 2 })).skills, [], '圣愚\'s skill does not act in a level being tested (关卡-8)');
});

test('[敌能-152] 深池弩炮手: two bolts, then the third attack hits its target\'s 3×3 at 100% at once, with no bolt — and again every third', () => {
  const { c, w, e } = arena(assembled(SHOOTER, shooter()), { main: [1, 2], left: [1, 1], right: [1, 3], far: [1, 0], far2: [1, 4] });
  const got = landings(w, c, e, 6);
  const splash = { main: [500], left: [500], right: [500] };
  assert.deepEqual(got.map((g) => g.took), [{ main: [500] }, { main: [500] }, splash, { main: [500] }, { main: [500] }, splash]);
  assert.deepEqual(got.map((g) => g.bolts), [1, 1, 0, 1, 1, 0], 'the 3rd and the 6th launch no bolt');
  assert.deepEqual(got.map((g) => g.f === g.at), [false, false, true, false, false, true], 'a bolt flies; the 3×3 lands as its attack starts (no attack clip, 攻击-2)');
  assert.deepEqual(got.slice(1).map((g, i) => g.at - got[i].at), [150, 150, 150, 150, 150], 'one attack per 5 s attack interval');
  assert.equal(e.ab['PowerAttack.sp'], 0, 'the skill spent the points');
  assert.equal(w.shots.length, 0);
});

test('[敌能-152] with a wind-up each attack lands as its swing ends: the first two launch their bolt then, the third hits the 3×3 then, at the 攻击力 then', () => {
  const { c, w, e } = arena(assembled(SHOOTER, shooter({ attack: CLIP })), { main: [1, 2], left: [1, 1], right: [1, 3] });
  for (let k = 0; k < 2; k++) {
    const a = begin(w, c, e);
    assert.equal(a.wind, 15, '1 s clip, its hit at 0.5 s (攻击-2)');
    assert.equal(launch(w, c, e), a.f + 15);
    assert.equal(w.shots.length, 1, 'in flight');
    assert.deepEqual(landings(w, c, e, 1)[0].took, { main: [500] });
  }
  const a = begin(w, c, e);
  assert.equal(e.ab['PowerAttack.sp'], 0, 'the points go as the skill attack starts');
  buffs.addBuff(e, buffs.makeBuff({ key: 'testAtk', mods: { atkPct: 1 } }));
  assert.equal(attrs.statsOf(e).atk, 1000);
  const [hit] = landings(w, c, e, 1);
  assert.deepEqual([hit.f, hit.bolts], [a.f + 15, 0], 'no bolt: it lands as the wind-up ends');
  assert.deepEqual(hit.took, { main: [1000], left: [1000], right: [1000] }, 'the 攻击力 as it lands, not as it started');
  assert.equal(w.shots.length, 0);
});

test('[敌能-152] the count follows spCost; the 3×3 takes the current 攻击力 at a share of 1, physical; it reaches past the attack radius', () => {
  const rec = assembled(SHOOTER, shooter({ atk: 640, rangeRadius: 3.3 }, 3));
  const { c, w, e, by } = arena(rec, { main: [1, 2], left: [1, 1], right: [1, 3], far: [1, 0] });
  buffs.addBuff(e, buffs.makeBuff({ key: 'testAtk', mods: { atkPct: 0.25 } }));
  by.left.base.def = 200;
  by.right.base.res = 50;
  // left (x 1, y 1) is 4.12 from the shooter: past 3.3 + 0.25, so not a target of its own, but on the 3×3 (敌能-26)
  const got = landings(w, c, e, 4);
  assert.deepEqual(got.map((g) => g.took), [{ main: [800] }, { main: [800] }, { main: [800] }, { main: [800], left: [600], right: [800] }]);
  assert.deepEqual(got.map((g) => g.bolts), [1, 1, 1, 0]);
});

test('[敌能-152] the 3×3 is physical whatever the record\'s type (「物理普通伤害」); the record\'s ordinary bolts keep its type', () => {
  const rec = assembled(SHOOTER, shooter({ dmgType: 'arts', rangeRadius: 3.3 }));
  const { c, w, e, by } = arena(rec, { main: [1, 2], left: [1, 1] });
  for (const u of [by.main, by.left]) Object.assign(u.base, { def: 100, res: 50 });
  const got = landings(w, c, e, 3);
  assert.deepEqual(got.map((g) => g.took), [{ main: [250] }, { main: [250] }, { main: [400], left: [400] }], 'arts bolts at res 50; the 3×3 physical at def 100');
});

test('[敌能-152] the hits\' flags and kinds: bolts are attacks by projectile; the 3×3 is its target\'s main hit and the others\' splash, all the skill\'s, none by projectile', () => {
  const { c, w, e, by } = arena(assembled(SHOOTER, shooter()), { main: [1, 2], left: [1, 1] });
  /** @type {{ id: number, attack: boolean, skill: boolean, splash: boolean, shot: boolean, type: string }[]} */
  const seen = [];
  bus.on(w, 'hit', (k) => {
    if (k.credit !== e) return;
    seen.push({ id: k.target.id, attack: k.dmg.isAttack === true, skill: k.dmg.isSkill === true, splash: k.dmg.isSplash === true, shot: k.dmg.isProjectile === true, type: k.dmg.type });
  });
  /** @type {[number, string, boolean][]} */
  const kinds = [];
  bus.on(w, 'attackHit', (k) => { if (k.attacker === e) kinds.push([k.target.id, k.kind, k.isSkill]); });
  landings(w, c, e, 3);
  const flag = (/** @type {Unit} */ u, /** @type {boolean} */ skill, /** @type {boolean} */ splash, /** @type {boolean} */ shot) => ({ id: u.id, attack: true, skill, splash, shot, type: 'phys' });
  assert.deepEqual(seen, [flag(by.main, false, false, true), flag(by.main, false, false, true), flag(by.main, true, false, false), flag(by.left, true, true, false)]);
  assert.deepEqual(kinds, [[by.main.id, 'main', false], [by.main.id, 'main', false], [by.main.id, 'main', true], [by.left.id, 'splash', true]], '钩子-3 attackHit');
});

test('[敌能-152] the 3×3: the target\'s own tile, 迷彩, a flying unit, a neutral unit and our device are in; 隐匿 and 起飞 are not', () => {
  const ops = /** @type {Record<string, [number, number]>} */ ({ main: [1, 2], twin: [1, 4], left: [1, 1], camou: [1, 3], stealth: [0, 2], lift: [0, 3], fly: [2, 2], far: [1, 0] });
  const { c, w, e, by } = arena(assembled(SHOOTER, shooter()), ops, { man: true });
  Object.assign(by.twin, { x: 2.25, y: 1 });
  assert.equal(devices.spawnDevice(w, c, 'box', 2, 1), true);
  const box = /** @type {Unit} */ (w.units.find((u) => u.key === 'box'));
  landings(w, c, e, 2);
  const man = /** @type {Unit} */ (w.units.find((u) => u.key === 'man'));
  Object.assign(man, { x: 1, y: 0, path: [] });
  status.applyStatus(man, 'root', {});
  buffs.addBuff(by.camou, buffs.makeBuff({ key: 'camou', flags: { camou: true } }));
  buffs.addBuff(by.stealth, buffs.makeBuff({ key: 'stealth', flags: { stealth: true } }));
  buffs.addBuff(by.lift, buffs.makeBuff({ key: 'lift', flags: { liftoff: true } }));
  status.applyStatus(by.fly, 'levitate', {});
  assert.equal(attrs.statsOf(by.fly).flying, true);
  const [hit] = landings(w, c, e, 1);
  assert.deepEqual(hit.took, { main: [500], twin: [500], left: [500], camou: [500], fly: [500], man: [500], box: [500] });
  assert.equal(box.hp, HP - 500);
});

test('[敌能-152] 无法选中, 无敌 and 沉睡 neighbours are on the 3×3 too: each takes the splash hit, only the unselectable one loses HP; 起飞 and 消失 ones are not on it', () => {
  const { c, w, e, by } = arena(assembled(SHOOTER, shooter()), { main: [1, 2], left: [1, 1], right: [1, 3], up: [0, 2], lift: [2, 2] }, { man: true });
  /** @type {Record<string, [string, number]>} */
  const got = {};
  bus.on(w, 'attackHit', (k) => { if (k.attacker === e && k.isSkill) got[k.target.key] = [k.kind, k.dealt]; });
  landings(w, c, e, 2);
  buffs.addBuff(by.left, buffs.makeBuff({ key: 'testFlag', flags: { untargetable: true } }));
  status.applyStatus(by.right, 'invincible', {});
  status.applyStatus(by.up, 'sleep', {});
  buffs.addBuff(by.lift, buffs.makeBuff({ key: 'testFlag', flags: { liftoff: true } }));
  // the neutral unit on a corner of the 3×3, disappeared (消失)
  const man = /** @type {Unit} */ (w.units.find((u) => u.key === 'man'));
  Object.assign(man, { x: 1, y: 2, path: [], hidden: true });
  status.applyStatus(man, 'root', {});
  assert.deepEqual(landings(w, c, e, 1)[0].took, { main: [500], left: [500] });
  assert.ok(w.units.includes(man) && man.x === 1 && man.y === 2, 'the one that disappeared is still there, on the corner');
  // 起飞 and 消失 get no hit at all (they are not on it), unlike 无敌 and 沉睡, which take one for 0 (伤害-7)
  assert.deepEqual(got, { main: ['main', 500], left: ['splash', 500], right: ['splash', 0], up: ['splash', 0] });
});

test('[敌能-152] the locked target: made 隐匿 in the wind-up it is still hit; taken off (起飞), it alone is not on the 3×3', () => {
  /** @type {[Record<string, boolean>, Record<string, number[]>, string[]][]} */
  const cases = [[{ stealth: true }, { main: [500], left: [500] }, ['main', 'left']], [{ liftoff: true }, { left: [500] }, ['left']]];
  for (const [flags, took, on] of cases) {
    const { c, w, e, by } = arena(assembled(SHOOTER, shooter({ attack: CLIP })), { main: [1, 2], left: [1, 1] });
    /** @type {string[]} */
    const hit = [];
    bus.on(w, 'attackHit', (k) => { if (k.attacker === e && k.isSkill) hit.push(k.target.key); });
    landings(w, c, e, 2);
    begin(w, c, e);
    buffs.addBuff(by.main, buffs.makeBuff({ key: 'testFlag', flags }));
    assert.deepEqual(landings(w, c, e, 1)[0].took, took, JSON.stringify(flags));
    assert.deepEqual(hit, on, `${JSON.stringify(flags)}: the units the 3×3 hit at all`);
  }
});

test('[敌能-152] co-op: the other seat\'s operator and a summon on the 3×3 take it too', () => {
  const { c, w, e, by } = arena(assembled(SHOOTER, shooter()), { main: [1, 2], mate: [1, 1], far: [1, 0] }, { seats: { mate: 1 }, more: ['puppet'] });
  assert.deepEqual([by.main.owner, by.mate.owner], [0, 1]);
  assert.ok(summons.spawnSummon(w, c, by.main, 'puppet', { row: 0, col: 3 }), 'the summon stands on a corner of the 3×3');
  assert.deepEqual(landings(w, c, e, 3).map((g) => g.took), [{ main: [500] }, { main: [500] }, { main: [500], mate: [500], puppet: [500] }]);
});

test('[敌能-152] dodge and 无敌 are each unit\'s own; the target dodging, invincible or downed still leaves the others theirs; 近战物理闪避 dodges the 3×3, not a bolt', () => {
  const plan = /** @type {Record<string, [number, number]>} */ ({ main: [1, 2], left: [1, 1], right: [1, 3], up: [0, 2] });
  const dodge = (/** @type {Unit} */ u, /** @type {Record<string, number>} */ mods) => buffs.addBuff(u, buffs.makeBuff({ key: 'testDodge', mods }));
  /** The third attack's landing after `set` changed the arena. @param {(a: ReturnType<typeof arena>) => void} set */
  const third = (set) => {
    const a = arena(assembled(SHOOTER, shooter()), plan);
    landings(a.w, a.c, a.e, 2);
    set(a);
    const before = a.by.main.hp;
    return { a, before, took: landings(a.w, a.c, a.e, 1)[0].took };
  };
  const others = { left: [500], right: [500], up: [500] };
  assert.deepEqual(third((a) => dodge(a.by.main, { dodgePhys: 1 })).took, others, 'the target dodged');
  const shielded = third((a) => status.applyStatus(a.by.main, 'invincible', {}));
  assert.deepEqual(shielded.took, others, 'the target invincible');
  assert.equal(shielded.a.by.main.hp, shielded.before, '无敌 took it to 0');
  const side = third((a) => { dodge(a.by.left, { dodgePhys: 1 }); status.applyStatus(a.by.right, 'invincible', {}); });
  assert.deepEqual(side.took, { main: [500], up: [500] }, 'a neighbour that dodges or is invincible spares only itself');
  const downed = third((a) => { a.by.main.hp = 100; });
  assert.deepEqual(downed.took, { main: [500], ...others }, 'a hit that downs its target still leaves the others theirs');
  assert.equal(downed.a.by.main.hp, 0);
  // 近战物理闪避 (伤害-12) is only against what is not a projectile: the bolts hit, the 3×3 is dodged
  const near = arena(assembled(SHOOTER, shooter()), plan);
  dodge(near.by.main, { dodgeMelee: 1 });
  assert.deepEqual(landings(near.w, near.c, near.e, 3).map((g) => g.took), [{ main: [500] }, { main: [500] }, others]);
});

test('[敌能-152] each unit on the 3×3 takes it as an attack\'s hit: an operator\'s 受击附带的法术伤害 answers from the target and from the splash', () => {
  const op = { atk: 100 };
  const { c, w, e, by } = arena(assembled(SHOOTER, shooter()), { main: [1, 2], left: [1, 1] }, { defs: { main: op, left: op } });
  for (const u of [by.main, by.left]) buffs.addBuff(u, buffs.makeBuff({ key: 'testCounter', mods: { counterArts: 0.5 } }));
  /** @type {number[]} */
  const hp = [];
  for (let k = 0; k < 3; k++) {
    landings(w, c, e, 1);
    hp.push(e.hp);
  }
  // each hit of the attack on one of them: 100 × 0.5 arts on the shooter, RES 20 → 40 (职业-20, 职业-27)
  assert.deepEqual(hp, [6000 - 40, 6000 - 80, 6000 - 160]);
});

test('[敌能-152] [敌能-36] only the marked shape is the 3×3: 无胄盟\'s 强力击 (×1.5), 澪\'s 寒晖 (two hits) and near shapes stay bolts on their target', () => {
  const sweep = arena(holder({ atk_scale: 1.5, ep_damage_ratio: 0.35 }), { main: [1, 2], left: [1, 1] }, { key: 'sweep' });
  const plain = { main: [500] };
  assert.deepEqual(landings(sweep.w, sweep.c, sweep.e, 4).map((g) => g.took), [plain, plain, plain, { main: [750] }]);
  const mio = 'enemy_10118_ymgprc';
  const twin = arena(assembled(mio, holder({ atk_scale: 1.5 })), { main: [1, 2], left: [1, 1] }, { key: mio });
  const two = { main: [500, 500] };
  assert.deepEqual(landings(twin.w, twin.c, twin.e, 4).map((g) => g.took), [two, two, two, { main: [750, 750] }]);
  // the attack reads the shape itself: records left unassembled (关卡-2 would drop these) get no 3×3
  /** @type {[Record<string, unknown>, number][]} */
  const near = [[{ square: 1, atk_scale: 1.5 }, 750], [{ square: 2 }, 500], [{ square: '1' }, 500], [{ square: true }, 500]];
  for (const [bb, skill] of near) {
    const a = arena(holder(bb), { main: [1, 2], left: [1, 1] }, { key: 'near' });
    const got = landings(a.w, a.c, a.e, 4);
    assert.deepEqual(got.map((g) => g.took), [plain, plain, plain, { main: [skill] }], JSON.stringify(bb));
    assert.deepEqual(got.map((g) => g.bolts), [1, 1, 1, 1], JSON.stringify(bb));
  }
});

test('[敌能-152] silenced as it starts, the third attack stays an ordinary bolt and the bar stays at 2; after silence the next is the 3×3', () => {
  const { c, w, e } = arena(assembled(SHOOTER, shooter()), { main: [1, 2], left: [1, 1] });
  landings(w, c, e, 2);
  status.applyStatus(e, 'silence', {});
  const held = landings(w, c, e, 2);
  assert.deepEqual(held.map((g) => [g.took, g.bolts]), [[{ main: [500] }, 1], [{ main: [500] }, 1]]);
  assert.equal(e.ab['PowerAttack.sp'], 2, 'the bar stays at the cost');
  buffs.removeBuff(e, 'silence');
  const [next] = landings(w, c, e, 1);
  assert.deepEqual([next.took, next.bolts], [{ main: [500], left: [500] }, 0]);
  assert.equal(e.ab['PowerAttack.sp'], 0);
});

test('[敌能-152] in the wind-up: silenced, the 3×3 still lands; stunned, it is called off with its points spent, and the count starts again', () => {
  for (const key of /** @type {const} */ (['silence', 'stun'])) {
    const { c, w, e } = arena(assembled(SHOOTER, shooter({ attack: CLIP })), { main: [1, 2], left: [1, 1] });
    landings(w, c, e, 2);
    begin(w, c, e);
    status.applyStatus(e, key, { seconds: 1 });
    const hits = quiet(w, c, 30);
    assert.equal(e.ab['PowerAttack.sp'], 0, key);
    if (key === 'silence') {
      assert.deepEqual(hits.map((x) => x.damage), [500, 500], 'the target and left, as the wind-up ends');
      continue;
    }
    assert.deepEqual(hits, [], 'no hit (攻击-2)');
    assert.deepEqual(landings(w, c, e, 3).map((g) => [g.took, g.bolts]), [[{ main: [500] }, 1], [{ main: [500] }, 1], [{ main: [500], left: [500] }, 0]]);
  }
});

test('[敌能-152] the shooter or its target gone in the wind-up: the 3×3 lands on no one, and its points are spent', () => {
  for (const gone of ['shooter', 'target']) {
    const { c, w, e, by } = arena(assembled(SHOOTER, shooter({ attack: CLIP })), { main: [1, 2], left: [1, 1] });
    landings(w, c, e, 2);
    begin(w, c, e);
    const u = gone === 'shooter' ? e : by.main;
    u.hp = 0;
    assert.deepEqual(quiet(w, c, 30), [], gone);
    assert.equal(w.units.includes(u), false, `${gone} left`);
    assert.equal(by.left.hp, HP, `${gone}: the 3×3 did not land`);
    assert.equal(e.ab['PowerAttack.sp'], 0, gone);
  }
});

test('[敌能-152] 深池弩炮队长 through act1football_sub-1-2: spawned at both difficulties, covered by its row, and its record\'s third attack is the 3×3 for 600', () => {
  for (const d of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
    const lv = levelAt(LEVEL, d);
    assert.equal(lv.level.uncovered, undefined, d);
    assert.ok(lv.enemies[CAPTAIN], `${d}: spawned`);
    assert.deepEqual(uncoveredAbilities([lv.enemies[CAPTAIN]]), ['PowerAttack'], `${d}: the level's record alone`);
    assert.deepEqual(uncoveredAbilities([withFoeExtras(CAPTAIN, lv.enemies[CAPTAIN])]), [], d);
  }
  const rec = levelContent(LEVEL, 'NORMAL').enemies[CAPTAIN];
  assert.deepEqual(rec.skills, [{ key: 'PowerAttack', cooldown: 0, initCooldown: 0, sp: 2, bb: { square: 1 } }]);
  assert.equal(rec.atk, 600);
  assert.equal(rec.attack, undefined, 'no attack clip: the 3×3 lands as its attack starts');
  const { c, w, e } = arena(rec, { main: [1, 2], left: [1, 1], far: [1, 0] }, { key: CAPTAIN });
  const got = landings(w, c, e, 3);
  assert.deepEqual(got.map((g) => g.took), [{ main: [600] }, { main: [600] }, { main: [600], left: [600] }]);
  assert.deepEqual(got.map((g) => [g.bolts, g.f === g.at]), [[1, false], [1, false], [0, true]]);
});
