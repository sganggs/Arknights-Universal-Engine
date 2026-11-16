// 腐败骑士 and 凋零骑士 (docs/spec/foes.md 敌能-145) on the tiny map. Neither is in a shipped level: the records are built
// from enemy_database (ArknightsGameData 17759cc8, level 0), with the extras the content adds. Ours have 防御力 0, 法术抗性
// 0 and no attack, so each hit is exactly the knights' number. The skills are ready 22 s (660 frames) after the spawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, damage, bus, stateHash, takeSnapshot, restoreSnapshot, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import rangeTable from '../data/ranges.json' with { type: 'json' };
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, withoutIncomplete, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef @typedef {import('@aue/sim').World} World */
/** @typedef {{ f: number, by: number, to: number, amount: number, type: string, attack: boolean, skill: boolean, splash: boolean }} Hit */

const ROT = 'enemy_1513_dekght';
const WITHER = 'enemy_1513_dekght_2';
const AOE = Object.freeze({ 'attack@dekght[aoe].atk_scale': 1, 'attack@dekght[aoe].range_id': 'x-5' });
const RAGE = Object.freeze({ atk: 0.8, attack_speed: 100, move_speed: 1.5 });
const HAMMER = Object.freeze({ atk_scale: 3, 'dekght[aoe].atk_scale': 3, 'dekght[aoe].range_id': 'x-5', duration: 4 });
const ARROWS = Object.freeze({ 'dekght_2[aoe].interval': 2.5, 'dekght_2[aoe].atk_scale': 1.6, 'dekght_2[aoe].range_id': 'x-5' });
const BODY = Object.freeze({ maxHp: 40000, moveSpeed: 0.65, baseAttackTime: 4, motion: 'WALK', massLevel: 6, levelType: 'BOSS', immune: ['silence'] });

/** 腐败骑士 at level 0. `o` replaces a blackboard, the first cooldown or other fields. @param {any} [o] @returns {EnemyDef} */
const rotDef = (o = {}) => /** @type {any} */ ({
  name: '腐败骑士', atk: 1200, def: 1200, res: 30, applyWay: 'MELEE', rangeRadius: 0, ...BODY,
  talents: { aoe: o.aoe ?? AOE, triggerrage: o.rage ?? RAGE },
  skills: [{ key: 'ChargeAttack', initCooldown: o.init ?? 22, cooldown: 22, sp: 0, bb: o.hammer ?? HAMMER }], ...o.more,
});

/** 凋零骑士 at level 0, 法术 by its page's 攻击性. `o` as for rotDef. @param {any} [o] @returns {EnemyDef} */
const witherDef = (o = {}) => /** @type {any} */ ({
  name: '凋零骑士', atk: 500, def: 600, res: 70, applyWay: 'RANGED', rangeRadius: 2.5, dmgType: 'arts', ...BODY,
  talents: o.talents ?? { triggerrage: RAGE },
  skills: [{ key: 'TripleAttack', initCooldown: o.init ?? 22, cooldown: 22, sp: 0, bb: o.arrows ?? ARROWS }], ...o.more,
});

/** Ours: harmless, 防御力 and 法术抗性 0, 1e6 HP; guards on the road, snipers on the high ground. @param {any} c */
function ours(c) {
  const stats = { cost: 0, maxHp: 1e6, atk: 0, def: 0, res: 0 };
  Object.assign(c.operators.guard, stats);
  Object.assign(c.operators.sniper, stats);
  for (const k of ['guard2', 'guard3']) c.operators[k] = { ...c.operators.guard, name: k };
  for (const k of ['sniper2', 'sniper3']) c.operators[k] = { ...c.operators.sniper, name: k };
  c.operators.fly = { ...c.operators.sniper, name: 'fly', motion: 'FLY' };
}

/**
 * Enemies [key, record, x, y, walks] on the tiny map — rooted unless `walks` (then heading for the goal), as the content
 * gives them (extras merged, incomplete abilities dropped) unless `o.raw` — spawning in frame 0, or `o.late` seconds in;
 * `o.prep` sees them before ours deploy in frame 1 ([key, row, col]). Every hit that took HP is in `log`.
 * @param {[string, EnemyDef, number, number, boolean?][]} foes @param {[string, number, number][]} ops @param {any} [o]
 */
function field(foes, ops, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = Object.fromEntries(foes.map(([k, d]) => [k, o.raw ? d : withoutIncomplete(withFoeExtras(k, d))]));
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(foes.map(([k], i) => spawnAt(i === foes.length - 1 ? o.late ?? 0 : 0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 12 };
  ours(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @type {Hit[]} */
  const log = [];
  bus.on(w, 'damaged', (k) => {
    log.push({ f: w.frame, by: k.credit ? k.credit.id : -1, to: k.target.id, amount: k.amount, type: k.type, attack: !!k.dmg.isAttack, skill: !!k.dmg.isSkill, splash: !!k.dmg.isSplash });
  });
  step(w, c);
  const es = w.units.filter((u) => u.kind === KIND.ENEMY);
  es.forEach((e, i) => {
    Object.assign(e, { x: foes[i][2], y: foes[i][3], path: [], pt: 0 });
    if (foes[i][4]) e.leg = 2;
    else status.applyStatus(e, 'root', {});
  });
  o.prep?.(es);
  step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  /** @param {string} k */
  const op = (k) => /** @type {Unit} */ (w.units.find((u) => u.key === k));
  return { c, w, es, op, log };
}

/** Steps until the world frame is `frame`; the events with the frame they happened in. @param {{ w: World, c: any }} box @param {number} frame */
function play(box, frame) {
  /** @type {any[]} */
  const out = [];
  while (box.w.frame < frame) for (const ev of step(box.w, box.c)) out.push({ ...ev, f: box.w.frame - 1 });
  return out;
}

/** The skill hits in the log at frame `f`, as [unit key, amount, 溅射]. @param {ReturnType<typeof field>} box @param {number} f */
function skillHits(box, f) {
  const key = (/** @type {number} */ id) => box.w.units.find((u) => u.id === id)?.key ?? `#${id}`;
  return box.log.filter((h) => h.skill && h.f === f).map((h) => [key(h.to), h.amount, h.splash]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}

/** @param {Unit} u @param {string} key */
const has = (u, key) => u.buffs.filter((b) => b.key === key).length;

test('[敌能-145] [关卡-2] the two read knights are covered whole; the unread twins, 雪牝 and every other form of the four names are not', () => {
  const rot = withFoeExtras(ROT, rotDef()), wither = withFoeExtras(WITHER, witherDef());
  assert.deepEqual(uncoveredAbilities([rot, wither]), []);
  assert.deepEqual(rot.talents?.triggerrage, { ...RAGE, page: 1, partner: WITHER });
  assert.deepEqual(wither.talents?.Targets, { n: 2 });
  assert.deepEqual(wither.skills?.[0].bb, { ...ARROWS, n: 3 });
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_15073_dqkght', rotDef())]), ['aoe', 'triggerrage', 'ChargeAttack'], '并驾骑士');
  assert.deepEqual(uncoveredAbilities([withFoeExtras('enemy_15074_dqdght', witherDef())]), ['triggerrage', 'TripleAttack'], 'the other 凋零骑士');
  assert.deepEqual(withoutIncomplete(rotDef()).talents, {});
  assert.deepEqual(withoutIncomplete(rotDef()).skills, []);
  const talent = (/** @type {string} */ k, /** @type {unknown} */ bb) => uncoveredAbilities([/** @type {any} */ ({ talents: { [k]: bb } })]);
  const skill = (/** @type {string} */ k, /** @type {unknown} */ bb) => uncoveredAbilities([/** @type {any} */ ({ skills: [{ key: k, bb }] })]);
  assert.deepEqual(talent('triggerrage', { attack_speed: 100, move_speed: 2, page: 1, partner: ROT }), ['triggerrage'], '雪牝 / 霜牡');
  for (const bb of [{ ...RAGE, page: 1 }, { ...RAGE, page: 1, partner: '' }, { ...RAGE, page: 1, partner: 7 }, { ...RAGE, page: 1, partner: ROT, atk: '0.8' }, { ...RAGE, page: '1', partner: ROT }]) {
    assert.deepEqual(talent('triggerrage', bb), ['triggerrage'], JSON.stringify(bb));
  }
  for (const bb of [{ ...AOE, page: 1, 'attack@dekght[aoe].range_id': 'x-4' }, { ...AOE, page: 1, 'attack@dekght[aoe].atk_scale': '1' }, { ...AOE, page: 1, more: 1 }, { 'attack@dekght[aoe].atk_scale': 1, page: 1 }]) {
    assert.deepEqual(talent('aoe', bb), ['aoe'], JSON.stringify(bb));
  }
  for (const bb of [{ ...HAMMER, page: 1, duration: '4' }, { ...HAMMER, page: 1, 'dekght[aoe].range_id': 'x-1' }, { ...HAMMER, page: 1, range_radius: 2.2 }]) {
    assert.deepEqual(skill('ChargeAttack', bb), ['ChargeAttack'], JSON.stringify(bb));
  }
  for (const bb of [{ ...ARROWS, n: '3' }, { ...ARROWS, n: 3, 'dekght_2[aoe].range_id': 'x-4' }, { ...ARROWS, n: 3, 'dekght_2[aoe].interval': '2.5' }, { ...ARROWS, n: 3, page: 1 }]) {
    assert.deepEqual(skill('TripleAttack', bb), ['TripleAttack'], JSON.stringify(bb));
  }
  assert.deepEqual([talent('aoe', { ...AOE, page: 1 }), skill('ChargeAttack', { ...HAMMER, page: 1 }), skill('TripleAttack', { ...ARROWS, n: 3 })], [[], [], []]);
});

test('[敌能-145] range_table\'s x-5 is the cross of 敌能-26: the tile and the four next to it', () => {
  const cells = /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)['x-5'].map((g) => `${g.row},${g.col}`).sort();
  assert.deepEqual(cells, ['-1,0', '0,-1', '0,0', '0,1', '1,0']);
});

/** 腐败骑士 blocked at (1, 2), ours on its cross and one on the diagonal. @param {any} [o] */
const crossBox = (o = {}) => field([[ROT, rotDef(o), 2, 1]], [['guard', 1, 2], ['guard2', 1, 1], ['guard3', 1, 3], ['sniper', 0, 2], ['sniper2', 2, 2], ['sniper3', 0, 3]], o);

test('[敌能-145] [敌能-26] 腐败骑士\'s attack: the blocker takes it, the four tiles next to it as much again as 溅射, the diagonal nothing', () => {
  const box = crossBox();
  play(box, 130);
  const rot = box.es[0];
  const first = Math.min(...box.log.filter((h) => h.by === rot.id && h.attack).map((h) => h.f));
  const got = box.log.filter((h) => h.by === rot.id && h.f === first).map((h) => [box.w.units.find((u) => u.id === h.to)?.key, h.amount, h.splash, h.skill]);
  assert.deepEqual(got.sort(), [['guard', 1200, false, false], ['guard2', 1200, true, false], ['guard3', 1200, true, false], ['sniper', 1200, true, false], ['sniper2', 1200, true, false]]);
  assert.equal(box.op('sniper3').hp, 1e6);
});

test('[敌能-145] [敌能-26] the 溅射 is attack@dekght[aoe].atk_scale of the hit, on the 攻击力 it has as it attacks', () => {
  const up = (/** @type {Unit[]} */ es) => { buffs.addBuff(es[0], buffs.makeBuff({ key: 'up', mods: { atkPct: 0.5 } })); };
  const box = crossBox({ aoe: { ...AOE, 'attack@dekght[aoe].atk_scale': 0.25 }, prep: up });
  play(box, 130);
  const rot = box.es[0];
  assert.equal(attrs.statsOf(rot).atk, 1800);
  const first = Math.min(...box.log.filter((h) => h.by === rot.id).map((h) => h.f));
  const amounts = box.log.filter((h) => h.by === rot.id && h.f === first).map((h) => [h.splash, h.amount]).sort();
  assert.deepEqual(amounts, [[false, 1800], [true, 450], [true, 450], [true, 450], [true, 450]]);
});

test('[敌能-145] [敌能-26] who the cross reaches: 迷彩, flying and neutral units do; 隐匿 and 起飞 do not', () => {
  const neutral = /** @type {any} */ ({ name: 'n', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true });
  const box = field([[ROT, rotDef(), 2, 1], ['neutral', neutral, 1, 1]], [['guard', 1, 2], ['guard2', 1, 1], ['guard3', 1, 3], ['fly', 0, 2], ['sniper2', 2, 2]]);
  const flag = (/** @type {string} */ k, /** @type {string} */ f) => { buffs.addBuff(box.op(k), buffs.makeBuff({ key: `t:${f}`, flags: { [f]: true } })); };
  flag('guard3', 'camou');
  flag('sniper2', 'stealth');
  flag('guard2', 'liftoff');
  const rot = box.es[0], neu = box.es[1];
  play(box, 260);
  const late = box.log.filter((h) => h.by === rot.id && h.f > 2);
  const first = Math.min(...late.map((h) => h.f));
  const hit = new Set(late.filter((h) => h.f === first).map((h) => h.to));
  assert.deepEqual([box.op('guard'), box.op('guard3'), box.op('fly'), neu].map((u) => hit.has(u.id)), [true, true, true, true]);
  assert.deepEqual([box.op('sniper2'), box.op('guard2')].map((u) => hit.has(u.id)), [false, false]);
});

test('[敌能-145] 蓄力锤 at 22 s on its blocker: the attack turn taken, 4 s without attack or step, then 300% and 300% 溅射 as skill hits; 22 s from the end', () => {
  const box = field([[ROT, rotDef(), 2, 1]], [['guard', 1, 2], ['guard2', 1, 1], ['sniper', 0, 2], ['sniper3', 0, 3]]);
  const rot = box.es[0];
  play(box, 660);
  assert.equal(rot.ab['ChargeAttack.ch'] ?? 0, 0);
  const cast = play(box, 661);
  assert.deepEqual([rot.ab['ChargeAttack.ch'], rot.ab['ChargeAttack.aim'] - 1, has(rot, 'rotHammer'), rot.atkCd], [120, box.op('guard').id, 1, 119]);
  const charge = play(box, 780);
  assert.equal([...cast, ...charge].some((x) => x.type === 'attack' && x.id === rot.id), false, 'no normal attack from the cast to the smash');
  assert.equal(box.log.some((h) => h.skill), false);
  const smashed = play(box, 781);
  assert.deepEqual(skillHits(box, 780), [['guard', 3600, false], ['guard2', 3600, true], ['sniper', 3600, true]]);
  assert.equal(box.log.some((h) => h.skill && h.attack), false, 'skill hits, not the normal attack');
  assert.equal(smashed.some((x) => x.type === 'attack' && x.id === rot.id), true, 'the 4 s interval taken at the cast is over: it attacks that frame');
  assert.deepEqual([...new Set(box.log.filter((h) => h.skill).map((h) => h.type))], ['phys']);
  assert.deepEqual([rot.ab['ChargeAttack.ch'], rot.ab['ChargeAttack.cd'], has(rot, 'rotHammer')], [0, 659, 0]);
  play(box, 1440);
  assert.equal(rot.ab['ChargeAttack.ch'], 0);
  play(box, 1441);
  assert.equal(rot.ab['ChargeAttack.ch'], 120, 'the next one 22 s after the smash');
});

test('[敌能-145] 蓄力锤\'s numbers are the blackboard\'s: its first cooldown, `duration`, both 倍率, on the 攻击力 it has as it smashes', () => {
  const hammer = { ...HAMMER, duration: 2, atk_scale: 2, 'dekght[aoe].atk_scale': 0.5 };
  const box = field([[ROT, rotDef({ init: 10, hammer }), 2, 1]], [['guard', 1, 2], ['sniper', 0, 2]]);
  const rot = box.es[0];
  play(box, 301);
  assert.equal(rot.ab['ChargeAttack.ch'], 60, '2 s');
  play(box, 330);
  buffs.addBuff(rot, buffs.makeBuff({ key: 'up', mods: { atkPct: 0.5 } }));
  play(box, 361);
  assert.deepEqual(skillHits(box, 360), [['guard', 3600, false], ['sniper', 900, true]]);
});

test('[敌能-145] 蓄力锤 cut short: stunned, it does not smash and the cooldown starts; silence cannot take hold, and without the immunity it cuts too', () => {
  for (const [name, put, more] of /** @type {[string, (u: Unit) => void, any][]} */ ([
    ['stun', (u) => { status.applyStatus(u, 'stun', { seconds: 1 }); }, {}],
    ['silence', (u) => { status.applyStatus(u, 'silence', {}); }, { immune: [] }],
  ])) {
    const box = field([[ROT, rotDef({ more }), 2, 1]], [['guard', 1, 2], ['sniper', 0, 2]]);
    const rot = box.es[0];
    play(box, 700);
    put(rot);
    play(box, 701);
    assert.deepEqual([rot.ab['ChargeAttack.ch'], rot.ab['ChargeAttack.cd'], has(rot, 'rotHammer')], [0, 659, 0], name);
    play(box, 800);
    assert.equal(box.log.some((h) => h.skill), false, name);
  }
  const immune = field([[ROT, rotDef(), 2, 1]], [['guard', 1, 2]]);
  play(immune, 700);
  status.applyStatus(immune.es[0], 'silence', {});
  assert.equal(attrs.statsOf(immune.es[0]).flags.silence, undefined);
  play(immune, 781);
  assert.deepEqual(skillHits(immune, 780), [['guard', 3600, false]]);
});

test('[敌能-145] [敌能-62] neither skill starts while it cannot act or, without the immunity, is silenced: each stays ready and goes on the first turn after', () => {
  for (const [name, put] of /** @type {[string, (u: Unit) => void][]} */ ([
    ['stun', (u) => { status.applyStatus(u, 'stun', { seconds: 1 }); }],
    ['silence', (u) => { status.applyStatus(u, 'silence', { seconds: 1 }); }],
  ])) {
    const rot = field([[ROT, rotDef({ more: { immune: [] } }), 2, 1]], [['guard', 1, 2]]);
    const arc = field([[WITHER, witherDef({ more: { immune: [] } }), 2, 1]], [['sniper', 0, 2]]);
    for (const box of [rot, arc]) {
      play(box, 650);
      put(box.es[0]);
      play(box, 661);
    }
    assert.deepEqual([rot.es[0].ab['ChargeAttack.ch'] ?? 0, rot.es[0].ab['ChargeAttack.cd'] ?? 0], [0, 0], `${name}: the hammer waits, ready`);
    assert.deepEqual([arc.es[0].ab['TripleAttack.cd'] ?? 0, has(arc.op('sniper'), 'blastArrow')], [0, 0], `${name}: the arrows wait, ready`);
    play(rot, 700);
    play(arc, 700);
    assert.ok(rot.es[0].ab['ChargeAttack.ch'] > 0, `${name} over: the hammer starts`);
    assert.equal(has(arc.op('sniper'), 'blastArrow'), 1, `${name} over: the arrow is shot`);
  }
});

test('[敌能-145] [敌能-62] [状态-12] 蓄力锤 waits for a turn it could attack in: unblocked, 缴械, 强制缴械, noAttack, feared or under 战栗 it stays ready, then starts on the first turn it may', () => {
  const lone = field([[ROT, rotDef(), 2, 1]], [['sniper', 0, 2]]);
  play(lone, 700);
  assert.deepEqual([lone.es[0].ab['ChargeAttack.cd'] ?? 0, lone.es[0].ab['ChargeAttack.ch'] ?? 0], [0, 0], 'nobody blocks it');
  step(lone.w, lone.c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  play(lone, 703);
  assert.ok(lone.es[0].ab['ChargeAttack.ch'] > 0, 'blocked, it starts');
  for (const flags of /** @type {Record<string, boolean>[]} */ ([{ disarm: true }, { forceDisarm: true }, { noAttack: true }, { fear: true }, { disarmedCombat: true }])) {
    const box = field([[ROT, rotDef(), 2, 1]], [['guard', 1, 2]]);
    const rot = box.es[0];
    buffs.addBuff(rot, buffs.makeBuff({ key: 'hold', flags, left: 700 }));
    play(box, 701);
    assert.deepEqual([rot.ab['ChargeAttack.ch'] ?? 0, rot.ab['ChargeAttack.cd'] ?? 0], [0, 0], JSON.stringify(flags));
    play(box, 703);
    assert.equal(rot.ab['ChargeAttack.ch'] > 0, true, JSON.stringify(flags));
  }
});

test('[敌能-145] 蓄力锤 on a target that is gone by the smash: nothing, not even on the cross; it stood still until then and the cooldown starts', () => {
  const box = field([[ROT, rotDef(), 2, 1, true]], [['guard', 1, 2], ['guard2', 1, 3], ['sniper', 0, 2]]);
  const rot = box.es[0];
  play(box, 700);
  assert.ok(rot.ab['ChargeAttack.ch'] > 0);
  step(box.w, box.c, [[0, { type: 'retreat', unit: box.op('guard').id }]]);
  const x = rot.x;
  play(box, 780);
  assert.equal(rot.x, x, 'the charge holds it, unblocked');
  play(box, 781);
  assert.deepEqual([skillHits(box, 780), rot.ab['ChargeAttack.cd'], has(rot, 'rotHammer')], [[], 659, 0]);
  const down = field([[ROT, rotDef(), 2, 1]], [['guard', 1, 2], ['guard2', 1, 3], ['sniper', 0, 2]]);
  play(down, 780);
  damage.setHp(down.op('guard'), 0);
  play(down, 781);
  assert.deepEqual(skillHits(down, 780), [], 'down that frame, still in the list: no smash around it either');
  const veiled = field([[ROT, rotDef(), 2, 1]], [['guard', 1, 2], ['guard2', 1, 3], ['sniper', 0, 2]]);
  play(veiled, 780);
  veiled.op('guard').hidden = true;
  play(veiled, 781);
  assert.deepEqual(skillHits(veiled, 780), [], 'disappeared (消失) that frame: no smash around it either');
});

/** 凋零骑士 at (1, 2) and four of ours in its reach, deployed so that 索敌-5 orders them sniper, sniper2, guard, sniper3. @param {EnemyDef} def @param {any} [o] */
const archery = (def, o = {}) => field([[WITHER, def, 2, 1]], [['sniper3', 0, 3], ['guard', 1, 0], ['sniper2', 2, 3], ['sniper', 0, 2]], o);

test('[敌能-145] [敌能-27] 凋零骑士\'s normal attack locks two targets and shoots each, before its 22 s', () => {
  const box = archery(witherDef());
  const w = box.es[0];
  const ev = play(box, 250);
  const shots = ev.filter((x) => x.type === 'attack' && x.id === w.id);
  const first = shots[0].f;
  assert.deepEqual(shots.filter((x) => x.f === first).map((x) => x.target), [box.op('sniper').id, box.op('sniper2').id]);
  const hits = box.log.filter((h) => h.by === w.id && h.f > first && h.f < first + 120).map((h) => [h.to, h.amount, h.attack, h.skill]);
  assert.deepEqual(hits, [[box.op('sniper').id, 500, true, false], [box.op('sniper2').id, 500, true, false]], 'one shot each, landing a few frames later');
});

test('[敌能-145] 爆炸箭 at 22 s: the first three by 索敌-5 each carry an arrow; 75 frames later each blows 160% arts on its carrier and as 溅射 on its cross', () => {
  const box = archery(witherDef());
  const w = box.es[0];
  const cast = play(box, 661);
  assert.equal(cast.some((x) => x.type === 'attack' && x.id === w.id && x.f === 660), false, 'the cast takes the attack');
  assert.deepEqual([w.ab['TripleAttack.cd'], w.atkCd], [659, 119]);
  assert.deepEqual(['sniper', 'sniper2', 'guard', 'sniper3'].map((k) => has(box.op(k), 'blastArrow')), [1, 1, 1, 0]);
  const arrow = /** @type {any} */ (box.op('sniper').buffs.find((b) => b.key === 'blastArrow'));
  assert.deepEqual([arrow.src, arrow.value, arrow.n, arrow.left], [w.id, 1.6, 500, 75]);
  play(box, 735);
  assert.equal(box.log.some((h) => h.skill), false);
  play(box, 736);
  assert.deepEqual(skillHits(box, 735), [['guard', 800, false], ['sniper', 800, false], ['sniper2', 800, false], ['sniper3', 800, true]]);
  assert.equal(box.log.some((h) => h.skill && h.attack), false);
  assert.deepEqual([...new Set(box.log.filter((h) => h.skill).map((h) => h.type))], ['arts']);
  assert.equal(has(box.op('sniper'), 'blastArrow'), 0);
});

test('[敌能-145] 爆炸箭\'s numbers are the blackboard\'s: `n`, the fuse in seconds, the 倍率, on the 攻击力 it has as it blows', () => {
  const arrows = { ...ARROWS, n: 2, 'dekght_2[aoe].interval': 1, 'dekght_2[aoe].atk_scale': 0.5 };
  const box = archery(witherDef({ init: 10, arrows, talents: {} }), { raw: true });
  const w = box.es[0];
  play(box, 301);
  assert.deepEqual(['sniper', 'sniper2', 'guard'].map((k) => has(box.op(k), 'blastArrow')), [1, 1, 0]);
  play(box, 310);
  buffs.addBuff(w, buffs.makeBuff({ key: 'up', mods: { atkPct: 1 } }));
  play(box, 331);
  assert.deepEqual(skillHits(box, 330), [['sniper', 500, false], ['sniper2', 500, false], ['sniper3', 500, true]]);
});

test('[敌能-145] two arrows on one carrier each blow: two 凋零骑士 shooting the one sniper in reach', () => {
  const box = field([[WITHER, witherDef(), 2, 1], [WITHER, witherDef(), 3, 1]], [['sniper', 0, 2]]);
  play(box, 661);
  assert.equal(has(box.op('sniper'), 'blastArrow'), 2);
  play(box, 736);
  assert.deepEqual(skillHits(box, 735), [['sniper', 800, false], ['sniper', 800, false]]);
  assert.deepEqual(box.log.filter((h) => h.skill).map((h) => h.by).sort(), box.es.map((e) => e.id).sort(), 'one from each, its own source');
});

test('[敌能-145] [敌能-76] an arrow still blows once 凋零骑士 has gone — no source, the 攻击力 of the shot — but not once its carrier has gone', () => {
  const box = archery(witherDef(), { prep: (/** @type {Unit[]} */ es) => { buffs.addBuff(es[0], buffs.makeBuff({ key: 'shot', mods: { atkPct: 1 } })); } });
  const w = box.es[0];
  play(box, 700);
  buffs.addBuff(w, buffs.makeBuff({ key: 'up', mods: { atkPct: 0.5 } }));
  damage.setHp(w, 0);
  damage.setHp(box.op('sniper'), 0);
  play(box, 736);
  assert.equal(box.w.units.includes(w), false);
  assert.deepEqual(skillHits(box, 735), [['guard', 1600, false], ['sniper2', 1600, false]], 'the 攻击力 1000 it had as it shot; the sniper\'s arrow went with it: nothing on sniper3');
  assert.equal(box.log.filter((h) => h.skill).every((h) => h.by === -1), true);
});

test('[敌能-145] [敌能-26] an arrow\'s cross: a neutral unit under 迷彩 is in it; 隐匿, 起飞 and the diagonal are not, with 凋零骑士 gone too', () => {
  const neutral = /** @type {any} */ ({ name: 'n', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true });
  // 凋零骑士 at (1, 4): of ours only the sniper at (0, 2) can be picked; around it the neutral unit at (0, 1), 隐匿 at
  // (0, 3), 起飞 at (1, 2), and on the diagonal (1, 1), out of its reach.
  const box = field([[WITHER, witherDef(), 4, 1], ['neutral', neutral, 1, 0]], [['sniper', 0, 2], ['sniper3', 0, 3], ['guard', 1, 2], ['guard2', 1, 1]]);
  const flag = (/** @type {Unit} */ u, /** @type {string} */ f) => { buffs.addBuff(u, buffs.makeBuff({ key: `t:${f}`, flags: { [f]: true } })); };
  flag(box.op('sniper3'), 'stealth');
  flag(box.op('guard'), 'liftoff');
  flag(box.es[1], 'camou');
  play(box, 661);
  assert.deepEqual(['sniper', 'sniper3', 'guard', 'guard2'].map((k) => has(box.op(k), 'blastArrow')), [1, 0, 0, 0]);
  damage.setHp(box.es[0], 0);
  play(box, 736);
  assert.deepEqual(skillHits(box, 735), [['neutral', 800, true], ['sniper', 800, false]]);
});

test('[敌能-145] an arrow\'s carrier takes the blast under 隐匿 too, but not once it took off — with 凋零骑士 gone, nothing else refuses the hit', () => {
  // Two carriers whose crosses do not meet: the sniper at (0, 2) and sniper2 at (2, 3).
  const box = field([[WITHER, witherDef(), 2, 1]], [['sniper', 0, 2], ['sniper2', 2, 3]]);
  play(box, 661);
  assert.deepEqual(['sniper', 'sniper2'].map((k) => has(box.op(k), 'blastArrow')), [1, 1]);
  const flag = (/** @type {Unit} */ u, /** @type {string} */ f) => { buffs.addBuff(u, buffs.makeBuff({ key: `t:${f}`, flags: { [f]: true } })); };
  flag(box.op('sniper'), 'stealth');
  flag(box.op('sniper2'), 'liftoff');
  damage.setHp(box.es[0], 0);
  play(box, 736);
  assert.deepEqual(skillHits(box, 735), [['sniper', 800, false]]);
});

test('[敌能-145] 爆炸箭 reaches as far as its normal attack: its own attack radius + 0.25', () => {
  // 凋零骑士 at x 0.4 on the road; the guard three tiles on, 2.6 away: inside 2.5 + 0.25, outside 2.3 + 0.25.
  const near = field([[WITHER, witherDef(), 0.4, 1]], [['guard', 1, 3]]);
  const short = field([[WITHER, witherDef({ more: { rangeRadius: 2.3 } }), 0.4, 1]], [['guard', 1, 3]]);
  play(near, 661);
  play(short, 661);
  assert.equal(has(near.op('guard'), 'blastArrow'), 1, 'radius 2.5');
  assert.deepEqual([has(short.op('guard'), 'blastArrow'), short.es[0].ab['TripleAttack.cd'] ?? 0], [0, 0], 'radius 2.3: nobody in reach, it stays ready');
});

test('[敌能-145] [敌能-62] [状态-12] 爆炸箭 waits for a turn it could attack in: under 缴械, 强制缴械, noAttack or 恐惧, or 战栗 while blocked, it stays ready', () => {
  for (const [flags, ops] of /** @type {[Record<string, boolean>, [string, number, number][]][]} */ ([
    [{ disarm: true }, [['sniper', 0, 2]]], [{ forceDisarm: true }, [['sniper', 0, 2]]],
    [{ noAttack: true }, [['sniper', 0, 2]]], [{ fear: true }, [['sniper', 0, 2]]], [{ disarmedCombat: true }, [['guard', 1, 2]]],
  ])) {
    const box = field([[WITHER, witherDef(), 2, 1]], ops);
    buffs.addBuff(box.es[0], buffs.makeBuff({ key: 'hold', flags, left: 700 }));
    play(box, 701);
    assert.equal(box.es[0].ab['TripleAttack.cd'] ?? 0, 0, JSON.stringify(flags));
    assert.equal(has(box.op(ops[0][0]), 'blastArrow'), 0, JSON.stringify(flags));
    play(box, 702);
    assert.equal(has(box.op(ops[0][0]), 'blastArrow'), 1, JSON.stringify(flags));
  }
});

test('[敌能-145] [位移-3] 爆炸箭 waits while 凋零骑士 is in 失衡, when it cannot attack, and is shot on the first turn after', () => {
  const box = field([[WITHER, witherDef(), 2, 1]], [['sniper', 0, 2]]);
  play(box, 650);
  box.es[0].slide = { vx: 0, vy: 0, hard: 20 };
  play(box, 661);
  assert.deepEqual([box.es[0].ab['TripleAttack.cd'] ?? 0, has(box.op('sniper'), 'blastArrow')], [0, 0], 'ready, in 失衡: not shot');
  play(box, 700);
  assert.deepEqual([box.es[0].slide, has(box.op('sniper'), 'blastArrow')], [undefined, 1], 'the 失衡 over, it shoots');
});

test('[敌能-145] 爆炸箭 is not shot while 凋零骑士 has disappeared (消失); 战栗 does not hold it while nobody blocks it', () => {
  const box = field([[WITHER, witherDef(), 2, 1]], [['sniper', 0, 2]]);
  box.es[0].hidden = true;
  play(box, 700);
  assert.deepEqual([box.es[0].ab['TripleAttack.cd'] ?? 0, has(box.op('sniper'), 'blastArrow')], [0, 0]);
  box.es[0].hidden = false;
  play(box, 701);
  assert.equal(has(box.op('sniper'), 'blastArrow'), 1);
  const shaken = field([[WITHER, witherDef(), 2, 1]], [['sniper', 0, 2]]);
  status.applyStatus(shaken.es[0], 'disarmedCombat', {});
  play(shaken, 661);
  assert.equal(has(shaken.op('sniper'), 'blastArrow'), 1, 'unblocked, at 22 s');
});

test('[敌能-145] who 爆炸箭 picks: flyers, neutral units and its blocker whatever its 迷彩; not 迷彩, 隐匿 or 起飞 otherwise; nobody, then it stays ready', () => {
  const neutral = /** @type {any} */ ({ name: 'n', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true });
  const box = field([[WITHER, witherDef(), 2, 1], ['neutral', neutral, 3, 1]], [['guard', 1, 2], ['fly', 0, 2], ['sniper', 2, 2], ['sniper2', 0, 3], ['guard2', 1, 1]]);
  const flag = (/** @type {string} */ k, /** @type {string} */ f) => { buffs.addBuff(box.op(k), buffs.makeBuff({ key: `t:${f}`, flags: { [f]: true } })); };
  flag('guard', 'camou');
  flag('sniper', 'camou');
  flag('sniper2', 'stealth');
  flag('guard2', 'liftoff');
  play(box, 661);
  assert.deepEqual(['guard', 'fly', 'sniper', 'sniper2', 'guard2'].map((k) => has(box.op(k), 'blastArrow')), [1, 1, 0, 0, 0]);
  assert.equal(has(box.es[1], 'blastArrow'), 1, 'the neutral unit');
  const empty = field([[WITHER, witherDef(), 2, 1]], []);
  play(empty, 700);
  assert.equal(empty.es[0].ab['TripleAttack.cd'] ?? 0, 0);
  step(empty.w, empty.c, [[0, { type: 'deploy', op: 'sniper', row: 0, col: 2, dir: 0 }]]);
  play(empty, 702);
  assert.equal(has(empty.op('sniper'), 'blastArrow'), 1);
});

/** The two knights on the road, nobody of ours; 凋零骑士 one tile from the goal, walking there with `o.walk`. @param {any} [o] */
const pair = (o = {}) => field([[ROT, rotDef(o.rot), 2, 1], [WITHER, witherDef(o.wither), 4, 1, o.walk]], [], o);

test('[敌能-145] 凋零骑士\'s death enrages 腐败骑士 the next frame: 攻击力 +80%, 攻击速度 +100, 移动速度 +150%, one buff kept for good', () => {
  const box = pair({ rot: { more: { immune: [] } } });
  const [rot, wither] = box.es;
  damage.setHp(wither, 0);
  play(box, 3);
  assert.equal(has(rot, 'rotRage'), 0, 'seen on its next turn');
  play(box, 4);
  const s = attrs.statsOf(rot);
  assert.deepEqual([s.atk, s.aspd, s.moveSpeed, has(rot, 'rotRage')], [2160, 200, 0.65 * 2.5, 1]);
  play(box, 40);
  assert.equal(has(rot, 'rotRage'), 1, 'one buff, not one a frame');
  buffs.removeBuff(rot, 'rotRage');
  assert.equal(attrs.statsOf(rot).atk, 1200);
  play(box, 41);
  assert.equal(attrs.statsOf(rot).atk, 2160, 'taken away, it is back on the next turn');
  status.applyStatus(rot, 'silence', {});
  assert.equal(attrs.statsOf(rot).flags.silence, true, 'without the immunity the silence takes hold');
  buffs.removeBuff(rot, 'rotRage');
  play(box, 60);
  assert.equal(has(rot, 'rotRage'), 1, 'a talent: silenced, it is given again all the same');
});

test('[敌能-145] the rage follows the blackboard, both ways, as 直接乘算 and 直接加算: 腐败骑士\'s death enrages 凋零骑士', () => {
  const box = pair({ wither: { talents: { triggerrage: { atk: 0.5, attack_speed: 30, move_speed: 1 } } } });
  const [rot, wither] = box.es;
  buffs.addBuff(wither, buffs.makeBuff({ key: 'other', mods: { atkPct: 0.5, movePct: -0.5, aspd: 20 } }));
  damage.setHp(rot, 0);
  play(box, 4);
  const s = attrs.statsOf(wither);
  assert.deepEqual([s.atk, s.aspd], [500 * (1 + 0.5 + 0.5), 100 + 20 + 30], 'added to the other 直接乘算 and 直接加算, not multiplied');
  assert.ok(Math.abs(s.moveSpeed - 0.65 * (1 + 1 - 0.5)) < 1e-9, `移动速度 ${s.moveSpeed}`);
});

test('[敌能-145] the partner at its goal enrages it too; another enemy\'s death, or a partner gone before it came, does not', () => {
  const walk = pair({ walk: true });
  const [rot, wither] = walk.es;
  const life = walk.w.players[0].life;
  for (let i = 0; i < 400 && walk.w.units.includes(wither); i++) step(walk.w, walk.c);
  assert.equal(walk.w.units.includes(wither), false);
  assert.ok(walk.w.players[0].life < life, 'it reached the goal');
  step(walk.w, walk.c);
  assert.equal(has(rot, 'rotRage'), 1);
  const fodder = /** @type {any} */ ({ name: 'f', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 0 });
  const other = field([[ROT, rotDef(), 2, 1], ['f', fodder, 4, 0]], []);
  damage.setHp(other.es[1], 0);
  play(other, 30);
  assert.equal(has(other.es[0], 'rotRage'), 0, 'not its partner');
  const late = field([[WITHER, witherDef(), 4, 0], [ROT, rotDef(), 2, 1]], [], { late: 2 });
  damage.setHp(late.es[0], 0);
  play(late, 120);
  const knight = /** @type {Unit} */ (late.w.units.find((u) => u.key === ROT));
  assert.equal(has(knight, 'rotRage'), 0, 'its partner left before it came');
});

test('[敌能-145] two partners leaving give one rage', () => {
  const box = field([[ROT, rotDef(), 2, 1], [WITHER, witherDef(), 4, 0], [WITHER, witherDef(), 4, 2]], []);
  damage.setHp(box.es[1], 0);
  play(box, 10);
  damage.setHp(box.es[2], 0);
  play(box, 20);
  assert.deepEqual([has(box.es[0], 'rotRage'), attrs.statsOf(box.es[0]).atk], [1, 2160]);
});

test('[敌能-145] [同步-2] the charge, the arrows and the partners seen are in the snapshot: a match restored mid-way goes on alike', () => {
  const box = field([[ROT, rotDef(), 2, 1], [WITHER, witherDef(), 2, 0]], [['guard', 1, 2], ['sniper', 0, 3], ['sniper2', 2, 2]]);
  play(box, 700);
  assert.ok(box.es[0].ab['ChargeAttack.ch'] > 0);
  assert.ok(box.w.units.some((u) => has(u, 'blastArrow') > 0));
  const copy = { w: restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(box.w)))), c: box.c };
  damage.setHp(box.es[1], 0);
  damage.setHp(/** @type {Unit} */ (copy.w.units.find((u) => u.key === WITHER)), 0);
  play(box, 800);
  play(copy, 800);
  assert.equal(stateHash(copy.w), stateHash(box.w));
  assert.equal(has(/** @type {Unit} */ (copy.w.units.find((u) => u.key === ROT)), 'rotRage'), 1);
});
