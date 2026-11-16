// 陷落雪祀 (docs/spec/foes.md 敌能-142): its normal attack's chain and 寒冷, and 反自然馈赠 (`ChainBuff`). It is in no
// shipped level: the record is built from enemy_database 17759cc8 at level 0 (.port/agd.txt); its damage type from the
// page's 攻击性 「远程 法术」. The priest and the other enemies stand rooted; our units are deployed and then put in place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secondsToFrames } from '@aue/math';
import { createWorld, step, attrs, status, buffs, bus } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, FOE_EXTRAS } from '../src/foes.js';
import { GIFT_BUFF } from '../src/snowpriest.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */
/**
 * A unit's record key (ours: a name), where it is put — x < 0 leaves one of ours on its seat —, its record's fields and,
 * for ours, the seat it is deployed on (else the next free one).
 * @typedef {[string, number, number, Record<string, unknown>?, [number, number]?]} Spot
 */

const KEY = 'enemy_2050_smsha';
/** 数据: enemy_2050_smsha level 0, talent Attack and skill ChainBuff. */
const ATTACK = Object.freeze({ 'attack@freeze': 4.5, 'attack@chain.max_target': 3, 'attack@chain.atk_scale': 0.85, 'attack@projectile_range': 1.6 });
const GIFT = Object.freeze({ duration: 10, move_speed: 1, attack_speed: 100, 'chain.max_target': 3, projectile_range: 1.6, 'chain.atk_scale': 1, atk_scale: 0.1 });
/** Seats ours are deployed on: the four high-ground tiles for snipers, then the road for guards. */
const SEATS = /** @type {[number, number][]} */ ([[0, 2], [0, 3], [2, 2], [2, 3], [1, 1], [1, 2], [1, 3], [1, 4]]);

/**
 * 陷落雪祀 at level 0, with blackboard numbers, cooldowns or record fields (`rec`) changed.
 * @param {{ attack?: Record<string, unknown>, gift?: Record<string, unknown>, init?: number, cd?: number, rec?: Record<string, unknown> }} [o] @returns {EnemyDef}
 */
function priest(o = {}) {
  return /** @type {EnemyDef} */ (/** @type {unknown} */ ({
    name: '陷落雪祀', maxHp: 40000, atk: 600, def: 300, res: 60, moveSpeed: 2.5, baseAttackTime: 5, massLevel: 3, rangeRadius: 3.5,
    applyWay: 'RANGED', motion: 'WALK', levelType: 'BOSS', immune: ['stun'], dmgType: 'arts', ...o.rec,
    talents: { Attack: { ...ATTACK, ...o.attack } },
    skills: [{ key: 'ChainBuff', initCooldown: o.init ?? 15, cooldown: o.cd ?? 15, sp: 0, bb: { ...GIFT, ...o.gift } }],
  }));
}
/** The priest with its page markers (FOE_EXTRAS). @param {Parameters<typeof priest>[0]} [o] */
const marked = (o) => withFoeExtras(KEY, priest(o));
/** Another enemy, of no attack. @param {Record<string, unknown>} [o] */
const fellow = (o = {}) => ({ name: 'fellow', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 1, ...o });
/** @param {Record<string, unknown>} talents @param {{ key: string, bb: Record<string, unknown> }[]} [skills] */
const named = (talents, skills = []) => /** @type {EnemyDef} */ (/** @type {unknown} */ ({
  name: 'e', maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents, skills: skills.map((s) => ({ cooldown: 15, initCooldown: 15, sp: 0, ...s })),
}));

/** @param {Unit} u @param {number} x @param {number} y */
const put = (u, x, y) => { u.x = x; u.y = y; u.path = []; };

/**
 * The tiny map: the priest at `at` and the other enemies (`foes`, each its own key) spawn in frame 0 and stand rooted;
 * ours (`ops`) are deployed in frame 1 with the priest's attack held, then put where given; the attack is let go then.
 * @param {{ boss?: EnemyDef, at?: [number, number], foes?: Spot[], ops?: Spot[] }} [o]
 */
function arena(o = {}) {
  const c = /** @type {any} */ (tinyContent()), foes = o.foes ?? [], ops = o.ops ?? [];
  c.enemies = { [KEY]: o.boss ?? marked(), ...Object.fromEntries(foes.map(([k, , , more]) => [k, fellow(more)])) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, KEY), ...foes.map(([k]) => spawnAt(0, k))])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  const seats = ops.map(([, , , , seat], i) => seat ?? SEATS[i]);
  ops.forEach(([name, , , more], i) => {
    const kind = seats[i][0] === 1 ? c.operators.guard : c.operators.sniper;
    c.operators[name] = { ...kind, name, cost: 0, atk: 0, def: 0, res: 0, maxHp: 1e6, blockCnt: 0, ...more };
  });
  const w = /** @type {World} */ (createWorld(c, { seed: 1, players: 1 }));
  step(w, c);
  const unit = (/** @type {string} */ k) => /** @type {Unit} */ (w.units.find((u) => u.key === k));
  const e = unit(KEY), [x0, y0] = o.at ?? [0, 1];
  put(e, x0, y0);
  status.applyStatus(e, 'root', {});
  for (const [k, x, y] of foes) { put(unit(k), x, y); status.applyStatus(unit(k), 'root', {}); }
  e.atkCd = 10000;
  step(w, c, ops.map(([name], i) => [0, { type: 'deploy', op: name, row: seats[i][0], col: seats[i][1], dir: 0 }]));
  for (const [name, x, y] of ops) if (x >= 0) put(unit(name), x, y);
  e.atkCd = 0;
  return { c, w, e, unit, all: new Map(w.units.map((u) => [u.id, u])) };
}

/**
 * Events of the next `n` frames, each with the frame it came in. @param {ReturnType<typeof arena>} box @param {number} n
 * @returns {(Record<string, any> & { frame: number })[]}
 */
function run(box, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const frame = box.w.frame;
    for (const ev of step(box.w, box.c)) out.push({ ...ev, frame });
  }
  return out;
}
/**
 * The events of the frame its first hits land (from `id`, the priest by default), stepping one frame at a time, so
 * what they left is read before the next frame's buffs tick. @param {ReturnType<typeof arena>} box @param {number} [id]
 */
function land(box, id = box.e.id) {
  for (let i = 0; i < 600; i++) {
    const ev = run(box, 1);
    if (ev.some((x) => x.type === 'hit' && x.id === id)) return ev;
  }
  throw new Error('no hit in 600 frames');
}
/** [target key, damage] of the hits of a source (the priest by default). @param {ReturnType<typeof arena>} box @param {any[]} ev @param {number} [id] */
const hitsOf = (box, ev, id = box.e.id) => ev.filter((x) => x.type === 'hit' && x.id === id).map((x) => [box.all.get(x.target)?.key, x.damage]);
/** @param {ReturnType<typeof arena>} box @param {any[]} ev */
const keysHit = (box, ev) => hitsOf(box, ev).map(([k]) => k);
/** @param {number} got @param {number} want */
const near = (got, want) => Math.abs(got - want) < 1e-6;
/** The 敌方寒冷 on a unit: its frames left, or null. @param {Unit} u */
const coldOf = (u) => u.buffs.find((b) => b.key === 'enemyCold')?.left ?? null;
/** @param {Unit} u */
const gifts = (u) => u.buffs.filter((b) => b.key === GIFT_BUFF);
/** Gives a unit a buff of these flags and mods. @param {Unit} u @param {Record<string, boolean>} flags @param {Record<string, number>} [mods] */
const flag = (u, flags, mods = {}) => { buffs.addBuff(u, buffs.makeBuff({ key: 'test', flags, mods })); };

/**
 * A line of ours, each on a row as the engine keeps them: the main target (taunt 1) 2 from the priest, then 1.5 apart;
 * `b` is 3 from `t`, and `d` 1 from `b`, 1.8 from `a`.
 */
const LINE = /** @type {Spot[]} */ ([['t', 2, 1, { tauntLevel: 1 }], ['a', 3.5, 1], ['b', 5, 1], ['d', 5, 2]]);

test('[敌能-142] [关卡-2] the read page marks both abilities; 空洞雪祀, “木裂”埃克提尔尼尔, a text value or another key stay uncovered', () => {
  const raw = priest(), m = marked();
  assert.deepEqual(m.talents?.Attack, { ...ATTACK, page: 1 });
  assert.deepEqual(m.skills?.[0].bb, { ...GIFT, page: 1 });
  assert.match(FOE_EXTRAS[KEY].source, /title=%E9%99%B7%E8%90%BD%E9%9B%AA%E7%A5%80&oldid=354397$/);
  assert.deepEqual([uncoveredAbilities([m]), uncoveredAbilities([raw])], [[], ['Attack', 'ChainBuff']]);
  // 空洞雪祀 (enemy_2051_smsha2, 数据): the same keys with 4 targets and 2.1. Its page was not read, so it has no row.
  const hollow = priest({ attack: { 'attack@chain.max_target': 4, 'attack@projectile_range': 2.1 }, gift: { 'chain.max_target': 4, projectile_range: 2.1 } });
  assert.equal(withFoeExtras('enemy_2051_smsha2', hollow), hollow);
  assert.deepEqual(uncoveredAbilities([hollow]), ['Attack', 'ChainBuff']);
  assert.deepEqual(uncoveredAbilities([named({ Attack: { 'attack@freeze': 4.5 } })]), ['Attack'], 'enemy_2055_smlead');
  assert.deepEqual(uncoveredAbilities([named({ Attack: { ...ATTACK, page: 1, 'attack@freeze': '4.5' } })]), ['Attack']);
  assert.deepEqual(uncoveredAbilities([named({ Attack: { ...ATTACK, page: 1, offset: 1 } })]), ['Attack']);
  assert.deepEqual(uncoveredAbilities([named({}, [{ key: 'ChainBuff', bb: { ...GIFT, page: 1, duration: '10' } }])]), ['ChainBuff']);
  assert.deepEqual(uncoveredAbilities([named({}, [{ key: 'ChainBuff', bb: { ...GIFT, page: 1, range_radius: 3 } }])]), ['ChainBuff']);
  const whip = { 'attack@ranged_atk_scale': 0.5, range_radius: 1, hp_ratio: 0.15, atk: 0.1, max_stack_cnt: 15 };
  assert.deepEqual(uncoveredAbilities([named({ Attack: whip }), named({ Attack: { duration: 10, def: 200 } })]), [], '敌能-63 and 敌能-87 untouched');
});

test('[敌能-142] [职业-11] [攻击-3] the shot lands, then jumps to the nearest of ours within 1.6 of the one before: 3 in all, 85% each', () => {
  const box = arena({ ops: LINE });
  assert.deepEqual(hitsOf(box, run(box, 20)), [['t', 600], ['a', 510], ['b', 433.5]], 'only a reaches b; d would be the fourth');
  const four = arena({ boss: marked({ attack: { 'attack@chain.max_target': 4 } }), ops: LINE });
  const got = hitsOf(four, run(four, 20));
  assert.deepEqual(got.map(([k]) => k), ['t', 'a', 'b', 'd']);
  assert.ok(near(Number(got[3][1]), 600 * 0.85 * 0.85 * 0.85));
  const half = arena({ boss: marked({ attack: { 'attack@chain.atk_scale': 0.5 } }), ops: LINE });
  assert.deepEqual(hitsOf(half, run(half, 20)), [['t', 600], ['a', 300], ['b', 150]]);
  const strong = arena({ ops: LINE });
  flag(strong.e, {}, { atkPct: 0.5 });
  assert.deepEqual(hitsOf(strong, run(strong, 20)), [['t', 900], ['a', 765], ['b', 650.25]], 'the current 攻击力');
});

test('[敌能-142] [职业-11] the jump radius is attack@projectile_range by centres, its edge inside; the nearest first, the earlier deployed on a tie', () => {
  const at = (/** @type {number} */ x, /** @type {Record<string, unknown>} */ attack = {}) => {
    const box = arena({ boss: marked({ attack }), ops: [['t', 2, 1, { tauntLevel: 1 }], ['x', x, 1]] });
    return keysHit(box, run(box, 20));
  };
  assert.deepEqual([at(3.6), at(3.61), at(3.61, { 'attack@projectile_range': 2 })], [['t', 'x'], ['t'], ['t', 'x']]);
  const box = arena({ ops: [['t', 2, 1, { tauntLevel: 1 }], ['far', 2, 2], ['close', 2.9, 1], ['twin', 3, 0]] });
  assert.deepEqual(keysHit(box, run(box, 20)), ['t', 'close', 'twin'], 'close (0.9) before far (1); from close, twin (1.005) before far (1.35)');
  const pq = arena({ ops: [['t', 2, 1, { tauntLevel: 1 }], ['p', 2, 0], ['q', 2, 2]] });
  const qp = arena({ ops: [['t', 2, 1, { tauntLevel: 1 }], ['q', 2, 2], ['p', 2, 0]] });
  assert.deepEqual([keysHit(pq, run(pq, 20)), keysHit(qp, run(qp, 20))], [['t', 'p'], ['t', 'q']], 'both 1 from t: the one deployed first');
});

/**
 * Around the main target, ours on its row: 隐匿 and 起飞 at 0.3, 迷彩 and a flyer at 0.6, a plain one at 1; another enemy at
 * 0.4 and a neutral unit at 0.5. Nine targets at most, so every one it may jump to is reached.
 */
function crowd() {
  const box = arena({
    boss: marked({ attack: { 'attack@chain.max_target': 9 } }),
    foes: [['other', 2, 0.6], ['neutral', 2, 1.5, { neutral: true }]],
    ops: [['t', 2, 1, { tauntLevel: 1 }], ['camou', 1.4, 1], ['flyer', 2.6, 1, { motion: 'FLY' }], ['hidden', 1.7, 1], ['lifted', 2.3, 1], ['plain', 2, 2]],
  });
  flag(box.unit('camou'), { camou: true });
  flag(box.unit('hidden'), { stealth: true });
  flag(box.unit('lifted'), { liftoff: true });
  return box;
}

test('[敌能-142] [合作-9] [阻挡-2] [索敌-2] jumps reach neutral units, 迷彩 and flyers of ours, not enemies, 隐匿 or 起飞', () => {
  const box = crowd();
  assert.equal(attrs.statsOf(box.unit('flyer')).flying, true);
  assert.deepEqual(keysHit(box, run(box, 20)), ['t', 'neutral', 'plain', 'camou', 'flyer'], 'nearest each time; camou ties flyer from plain and came first');
  assert.deepEqual(['other', 'hidden', 'lifted'].map((k) => box.unit(k).hp === box.unit(k).maxHp), [true, true, true]);
});

test('[敌能-142] [状态-6] every hit leaves attack@freeze s of 敌方寒冷 after its damage; one knocked down gets none, and the chain goes on from it', () => {
  const box = arena({ ops: LINE });
  /** @type {[string, number][]} */
  const order = [];
  bus.on(box.w, 'beforeStatus', (k) => { if (k.status === 'cold') order.push([k.target.key, k.target.maxHp - k.target.hp]); });
  land(box);
  assert.deepEqual(['t', 'a', 'b', 'd'].map((k) => coldOf(box.unit(k))), [135, 135, 135, null], '4.5 s');
  assert.deepEqual(order, [['t', 600], ['a', 510], ['b', 433.5]], 'each damage before its cold');
  const short = arena({ boss: marked({ attack: { 'attack@freeze': 2 } }), ops: LINE });
  land(short);
  assert.equal(coldOf(short.unit('t')), secondsToFrames(2));
  const dies = arena({ ops: LINE });
  const t = dies.unit('t');
  t.hp = 100;
  assert.deepEqual(keysHit(dies, land(dies)), ['t', 'a', 'b']);
  assert.deepEqual([t.hp, coldOf(t), coldOf(dies.unit('a'))], [0, null, 135]);
  const twice = arena({ ops: LINE });
  status.applyStatus(twice.unit('t'), 'cold', { src: twice.e, seconds: 10 });
  run(twice, 20);
  assert.ok(twice.unit('t').buffs.some((b) => b.key === 'enemyFreeze'), 'a second enemy cold turns into 敌方冻结');
});

test('[敌能-142] [伤害-8] a dodged jump and one on an invincible unit still leave the cold; the hits are attacks, not skills, the jumps tagged chain', () => {
  const box = arena({ ops: [['t', 2, 1, { tauntLevel: 1 }], ['dodger', 3.5, 1], ['still', 5, 1]] });
  flag(box.unit('dodger'), {}, { dodgeArts: 1 });
  status.applyStatus(box.unit('still'), 'invincible', {});
  /** @type {any[]} */
  const seen = [];
  bus.on(box.w, 'hit', (k) => { if (k.credit === box.e) seen.push([k.target.key, k.dmg.type, k.dmg.isAttack, !!k.dmg.isSkill, !!k.dmg.isProjectile, k.dmg.tags ?? []]); });
  const ev = land(box);
  assert.deepEqual(hitsOf(box, ev), [['t', 600]], 'the dodged and the invincible lose nothing');
  assert.deepEqual(['t', 'dodger', 'still'].map((k) => coldOf(box.unit(k))), [135, 135, 135]);
  assert.deepEqual(seen, [['t', 'arts', true, false, true, []], ['dodger', 'arts', true, false, true, ['chain']]], 'the invincible one is stopped before the hit event');
});

test('[敌能-142] [状态-6] silence does not stop the talent; a shot landing after the priest left still jumps to ours, with no source', () => {
  const box = arena({ ops: LINE });
  status.applyStatus(box.e, 'silence', { seconds: 60 });
  assert.deepEqual(keysHit(box, land(box)), ['t', 'a', 'b']);
  assert.equal(coldOf(box.unit('b')), 135);
  const gone = arena({ ops: LINE, foes: [['other', 2.3, 1.2]] });
  run(gone, 1);
  gone.e.hp = 0;
  const ev = land(gone, -1);
  assert.equal(gone.w.units.includes(gone.e), false);
  assert.deepEqual(hitsOf(gone, ev, -1), [['t', 600], ['a', 510], ['b', 433.5]], 'the 600 frozen at the shot; the enemy 0.36 from t is not jumped to');
  const t = gone.unit('t');
  assert.deepEqual([coldOf(t), t.buffs.find((b) => b.key === 'cold')?.left], [null, 135], 'a cold with no source is the friendly kind');
});

test('[敌能-142] without the page marker the same blackboards do nothing: plain hits, no cold, no 反自然馈赠', () => {
  const box = arena({ boss: priest(), ops: LINE, foes: [['f1', 2, 2.5]] });
  const ev = run(box, 460);
  assert.deepEqual(hitsOf(box, ev), [['t', 600], ['t', 600], ['t', 600], ['t', 600]], 'frames 2, 152, 302 and 452');
  assert.deepEqual([coldOf(box.unit('t')), gifts(box.unit('f1')).length], [null, 0]);
});

/** Other enemies 2 from the priest and then 1.5 apart: the first three are 反自然馈赠's, the fourth only with four targets. */
const PACK = /** @type {Spot[]} */ ([['f1', 2, 1], ['f2', 3.5, 1], ['f3', 3.5, 2.5], ['f4', 5, 2.5]]);

/**
 * The priest among the pack with none of ours, up to its first 反自然馈赠: that frame, its hits, each one's buff then.
 * @param {Parameters<typeof priest>[0]} [o] @param {Spot[]} [pack]
 */
function firstGift(o, pack = PACK) {
  const box = arena({ boss: marked(o), foes: pack });
  for (let i = 0; i < 600; i++) {
    const ev = run(box, 1);
    if (!ev.some((x) => x.type === 'hit' && x.id === box.e.id)) continue;
    const of = pack.map(([k]) => gifts(box.unit(k)).map((b) => [b.left, b.mods.aspd, b.mods.movePct]));
    return { box, frame: ev[0].frame, hits: hitsOf(box, ev), buffs: of };
  }
  throw new Error('no 反自然馈赠 in 600 frames');
}

test('[敌能-142] 反自然馈赠 at 15 s: the nearest other enemy, then two jumps within 1.6; 10% of 攻击力 as arts each, and the speed for 10 s', () => {
  const g = firstGift();
  assert.deepEqual([g.frame, g.hits], [secondsToFrames(15), [['f1', 60], ['f2', 60], ['f3', 60]]]);
  assert.deepEqual(g.buffs, [[[300, 100, 1]], [[300, 100, 1]], [[300, 100, 1]], []]);
  const s = attrs.statsOf(g.box.unit('f1'));
  assert.deepEqual([s.aspd, s.moveSpeed, gifts(g.box.e).length], [200, 2, 0], '+100 直接加算, +100% 直接乘算; never on itself');
  assert.deepEqual(firstGift({ gift: { atk_scale: 0.25 } }).hits.map(([, d]) => d), [150, 150, 150]);
  assert.deepEqual(firstGift({ gift: { 'chain.atk_scale': 0.5 } }).hits.map(([, d]) => d), [60, 30, 15]);
  assert.deepEqual(firstGift({ gift: { 'chain.max_target': 4 } }).hits.map(([k]) => k), ['f1', 'f2', 'f3', 'f4']);
  assert.deepEqual(firstGift({ gift: { projectile_range: 1.4 } }).hits.map(([k]) => k), ['f1']);
  const tuned = firstGift({ gift: { duration: 7, move_speed: 0.5, attack_speed: 30 } });
  assert.deepEqual(tuned.buffs[0], [[secondsToFrames(7), 30, 0.5]]);
  const t = attrs.statsOf(tuned.box.unit('f1'));
  assert.deepEqual([t.aspd, t.moveSpeed], [130, 1.5]);
  const strong = arena({ foes: PACK });
  flag(strong.e, {}, { atkPct: 0.5 });
  assert.deepEqual(hitsOf(strong, run(strong, 460)).map(([, d]) => d), [90, 90, 90], 'the current 攻击力');
});

test('[敌能-142] 反自然馈赠 waits for the attack\'s turn: initCooldown and cooldown from the data, never sooner than the attack interval', () => {
  const frames = (/** @type {number} */ init, /** @type {number} */ cd) => {
    const box = arena({ boss: marked({ init, cd }), foes: PACK });
    return [...new Set(run(box, 700).filter((x) => x.type === 'hit' && x.id === box.e.id).map((x) => x.frame))];
  };
  assert.deepEqual(frames(5, 8), [150, 390, 630], '5 s, then 8 s each');
  assert.deepEqual(frames(5, 2), [150, 300, 450, 600], 'ready 2 s after, but the attack interval of 5 s is the turn it takes');
});

test('[敌能-142] [敌人攻击-1] it takes a normal attack\'s turn: no shot that frame, the next one interval later; it waits while the attack does', () => {
  const box = arena({ ops: [['t', 2, 1]], foes: [['f1', 2, 2]] });
  const ev = run(box, 760);
  const shots = ev.filter((x) => x.type === 'shot' && x.id === box.e.id).map((x) => x.frame);
  const cast = ev.find((x) => x.type === 'hit' && x.id === box.e.id && x.target === box.unit('f1').id)?.frame;
  assert.deepEqual([shots, cast], [[2, 152, 302, 602, 752], 452], 'ready at 450, cast in the turn at 452, no shot then');
});

/**
 * Whether the priest (`o`) among the pack casts by frame 471, with `prep` done first; and its skill's cooldown then.
 * @param {(box: ReturnType<typeof arena>) => void} prep @param {Spot[]} [pack] @param {Parameters<typeof priest>[0]} [o]
 */
function held(prep, pack = PACK, o = {}) {
  const box = arena({ boss: marked(o), foes: pack });
  prep(box);
  const cast = run(box, 470).some((x) => x.type === 'hit' && x.id === box.e.id);
  return [cast, cast ? -1 : box.e.ab['ChainBuff.cd']];
}

test('[敌能-142] [状态-12] silence, 冻结, 恐惧, 缴械, 强制缴械 and noAttack hold 反自然馈赠 ready, as does no other enemy within 3.5; blocked, it still casts', () => {
  assert.deepEqual(held((b) => { status.applyStatus(b.e, 'silence', { seconds: 30 }); }), [false, 0]);
  assert.deepEqual(held((b) => { status.applyStatus(b.e, 'freeze', { seconds: 30 }); }), [false, 0]);
  assert.deepEqual(held((b) => { status.applyStatus(b.e, 'fear', { seconds: 30 }); }), [false, 0]);
  assert.deepEqual(held((b) => { status.applyStatus(b.e, 'disarm', { seconds: 30 }); }), [false, 0]);
  assert.deepEqual(held((b) => { status.applyStatus(b.e, 'forceDisarm', { seconds: 30 }); }), [false, 0]);
  assert.deepEqual(held((b) => { flag(b.e, { noAttack: true }); }), [false, 0]);
  assert.deepEqual([held(() => {}, [['f1', 3.6, 1]]), held(() => {}, [['f1', 3.5, 1]])], [[false, 0], [true, -1]], 'from the priest: 3.6 is out, 3.5 in');
  const short = { rec: { rangeRadius: 2 } };
  assert.deepEqual([held(() => {}, [['f1', 2.1, 1]], short), held(() => {}, [['f1', 2, 1]], short)], [[false, 0], [true, -1]], 'its own rangeRadius');
  const late = arena({ foes: PACK });
  status.applyStatus(late.e, 'silence', { seconds: 16 });
  const at = run(late, 500).find((x) => x.type === 'hit' && x.id === late.e.id)?.frame;
  assert.equal(at, 2 + secondsToFrames(16) - 1, 'the first turn its silence is gone');
  const blocked = arena({ at: [1, 1], foes: [['f1', 3, 1]], ops: [['wall', -1, -1, { blockCnt: 1 }, [1, 1]]] });
  assert.equal(blocked.e.blockedBy, blocked.unit('wall').id);
  assert.ok(run(blocked, 470).some((x) => x.type === 'hit' && x.id === blocked.e.id && x.target === blocked.unit('f1').id));
});

test('[敌能-142] [敌人攻击-1] [位移-3] 失衡, disappearing, no 攻击力 and 战栗 while blocked hold 反自然馈赠 ready too; 战栗 unblocked does not', () => {
  assert.deepEqual(held((b) => { b.e.slide = { vx: 0, vy: 0, hard: 600 }; }), [false, 0], '失衡 all through');
  assert.deepEqual(held((b) => { b.e.hidden = true; }), [false, 0], 'disappeared');
  assert.deepEqual(held((b) => { flag(b.e, {}, { atkPct: -1 }); }), [false, 0], '攻击力 0: no normal attack can start');
  assert.deepEqual(held((b) => { status.applyStatus(b.e, 'disarmedCombat', { seconds: 30 }); }), [true, -1], '战栗 stops only a blocked attack');
  const box = arena({ at: [1, 1], foes: [['f1', 3, 1]], ops: [['wall', -1, -1, { blockCnt: 1 }, [1, 1]]] });
  assert.equal(box.e.blockedBy, box.unit('wall').id);
  status.applyStatus(box.e, 'disarmedCombat', { seconds: 30 });
  assert.deepEqual([run(box, 470).some((x) => x.type === 'hit' && x.id === box.e.id), box.e.ab['ChainBuff.cd']], [false, 0], 'blocked under 战栗');
});

test('[敌能-142] [索敌-2] 反自然馈赠 picks its own side: not itself, a neutral unit, a 孤立 or disappeared one; 隐匿, 无敌 and flyers it does', () => {
  const box = arena({
    foes: [['neutral', 1, 1, { neutral: true }], ['alone', 0, 2.2], ['gone', 0, 2.4], ['shy', 2, 1], ['safe', 3.5, 1], ['bird', 3.5, 2.5, { motion: 'FLY' }]],
  });
  flag(box.unit('alone'), { noAllyHeal: true });
  box.unit('gone').hidden = true;
  flag(box.unit('shy'), { stealth: true, untargetable: true });
  status.applyStatus(box.unit('safe'), 'invincible', {});
  const ev = run(box, 460);
  assert.deepEqual(hitsOf(box, ev).filter(([k]) => k !== 'neutral'), [['shy', 60], ['bird', 60]], 'the invincible one takes 0 and has no hit');
  assert.deepEqual(['shy', 'safe', 'bird', 'neutral', 'alone', 'gone'].map((k) => gifts(box.unit(k)).length), [1, 1, 1, 0, 0, 0]);
  assert.equal(gifts(box.e).length, 0);
});

test('[敌能-142] [索敌-2] 反自然馈赠 breaks a tie by the earlier created, for the first target and for a jump', () => {
  const keys = (/** @type {Spot[]} */ pack) => firstGift({}, pack).hits.map(([k]) => k);
  // p and q are both √2 from the priest at (0, 1); from either the other is 2 away, beyond the jump radius
  assert.deepEqual([keys([['p', 1, 0], ['q', 1, 2]]), keys([['q', 1, 2], ['p', 1, 0]])], [['p'], ['q']]);
  // f1 is 2 from the priest; p and q are both √1.25 from f1 and 1 apart
  assert.deepEqual([keys([['f1', 2, 1], ['p', 3, 0.5], ['q', 3, 1.5]]), keys([['f1', 2, 1], ['q', 3, 1.5], ['p', 3, 0.5]])], [['f1', 'p', 'q'], ['f1', 'q', 'p']]);
});

test('[敌能-142] [伤害-7] 反自然馈赠 hits are arts, a skill\'s and an attack\'s, no projectile and no cold; one it knocks down gets no buff, the chain goes on', () => {
  const box = arena({ foes: PACK });
  /** @type {any[]} */
  const seen = [];
  bus.on(box.w, 'hit', (k) => { if (k.credit === box.e) seen.push([k.dmg.type, k.dmg.isAttack, k.dmg.isSkill, !!k.dmg.isProjectile]); });
  const f2 = box.unit('f2');
  f2.hp = 50;
  const ev = run(box, 460);
  assert.deepEqual(keysHit(box, ev), ['f1', 'f2', 'f3']);
  assert.deepEqual(seen, [['arts', true, true, false], ['arts', true, true, false], ['arts', true, true, false]]);
  assert.deepEqual([f2.hp, gifts(f2).length, gifts(box.unit('f3')).length, coldOf(box.unit('f1'))], [0, 0, 1, null]);
});

test('[敌能-142] [状态-2] one buff each, gone after duration, back at the next cast, queued behind one still on; the priest\'s death leaves it', () => {
  const g = firstGift({ cd: 12, gift: { duration: 7 } });
  const f1 = g.box.unit('f1');
  run(g.box, secondsToFrames(7) - 1);
  assert.equal(gifts(f1).length, 1, 'still there the frame before');
  run(g.box, 1);
  assert.equal(gifts(f1).length, 0, 'gone after 7 s');
  run(g.box, secondsToFrames(12) - secondsToFrames(7));
  assert.deepEqual(gifts(f1).map((b) => b.left), [secondsToFrames(7)], 'back once, 12 s after the first');
  g.box.e.hp = 0;
  run(g.box, 2);
  assert.equal(gifts(f1).length, 1);
  // A cast while the last one's buff is still on: the default rule, queue — both kept, the first in effect.
  const two = firstGift({ cd: 5, gift: { duration: 12 } }), f = two.box.unit('f1');
  run(two.box, secondsToFrames(5));
  assert.deepEqual([gifts(f).map((b) => b.left), attrs.statsOf(f).aspd], [[secondsToFrames(7), secondsToFrames(12)], 200], 'the second waits behind the first');
});
