// 帝国炮火先兆者 and 帝国炮火中枢先兆者 (docs/spec/foes.md 敌能-130) on the tiny map, with act1multi_01's records and the
// official behaviours: each attack is a shell on the target's spot that lands 89 frames later on everyone within
// 1.2 + 0.25, without a source, of the attack it was fired with; at equal taunt a neutral unit comes first; a shell
// outlives its shooter and the co-op intermission.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, targeting, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { levelContent, LEVELS, FOE_EXTRAS } from '../src/index.js';
import { foeBehaviors, uncoveredAbilities, withFoeExtras } from '../src/foes.js';
import rm05 from '../data/levels/act1multi_rm05.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const real = levelContent('act1multi_01', 'NORMAL');
const PNT = 'enemy_1112_emppnt', HUB = 'enemy_1112_emppnt_2';
const HP = 1e6;
/** A neutral unit that stays where it is put, sturdy and harmless (合作-9). */
const CIV = { name: 'civ', maxHp: HP, atk: 0, def: 0, res: 0, moveSpeed: 0, applyWay: 'NONE', neutral: true };
/** Frames from the attack to the landing: 3 s, the attack's own frame counted (敌能-130). */
const FLIGHT = 89;

/**
 * The tiny map: `key` (act1multi_01's record) at `at` and the `others` (civ, bird) at their points, rooted; the shooter
 * holds its fire (a test buff) until `fire`. Our operators (key, row, col) come in frame 1, with a million HP and no
 * attack. The others walk in on a route of their own, far from the shooter's start, so nothing is in its reach in frame 0.
 * @param {string} key @param {{ x: number, y: number }} at @param {[string, number, number][]} others @param {[string, number, number][]} ops
 */
function arena(key, at, others, ops) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: real.enemies[key], civ: CIV, bird: { ...CIV, name: 'bird', motion: 'FLY' } };
  c.behaviors = real.behaviors;
  c.level.routes = [...c.level.routes, { start: { row: 0, col: 5 }, end: { row: 1, col: 5 }, motion: 'WALK', checkpoints: [] }];
  c.level.waves = [oneWave([spawnAt(0, key), ...others.map(([k]) => spawnAt(0, k, { route: 1 }))])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 9 };
  for (const o of Object.values(c.operators)) Object.assign(o, { cost: 0, maxHp: HP, atk: 0 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.kind === KIND.ENEMY), points = [at, ...others.map(([, x, y]) => ({ x, y }))];
  es.forEach((u, i) => { u.x = points[i].x; u.y = points[i].y; status.applyStatus(u, 'root', {}); });
  buffs.addBuff(es[0], buffs.makeBuff({ key: 'test:hold', flags: { noAttack: true } }));
  step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  const op = (/** @type {string} */ k) => /** @type {Unit} */ (w.units.find((u) => u.key === k));
  return { c, w, e: es[0], others: es.slice(1), op };
}

/** The shooter's hold lifted: the frame of its attack, its events. @param {{ c: any, w: World, e: Unit }} a */
function fire(a) {
  buffs.removeBuff(a.e, 'test:hold');
  return { at: a.w.frame, ev: step(a.w, a.c) };
}

/** Runs n frames; the events. @param {{ c: any, w: World }} a @param {number} n */
function run(a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(...step(a.w, a.c));
  return out;
}

/** HP lost. @param {Unit} u */
const lost = (u) => attrs.statsOf(u).maxHp - u.hp;

test('[敌能-130] [敌能-37] both get DelayShell and Static from FOE_EXTRAS; the data has neither; the shipped levels\' records are covered', () => {
  assert.ok(Object.hasOwn(foeBehaviors, 'DelayShell'));
  for (const key of [PNT, HUB]) {
    assert.equal(LEVELS.act1multi_01.enemies[key].talents, undefined, key);
    assert.deepEqual(FOE_EXTRAS[key].talents, { Static: {}, DelayShell: {} }, key);
    for (const id of ['act1multi_01', 'act2multi_rm01']) assert.deepEqual(levelContent(id, 'NORMAL').enemies[key].talents, { Static: {}, DelayShell: {} }, `${id} ${key}`);
    assert.deepEqual(uncoveredAbilities([real.enemies[key]]), [], key);
  }
  assert.deepEqual(levelContent('act1football_03', 'NORMAL').enemies[HUB].talents, { Static: {}, DelayShell: {} });
  const raw = /** @type {any} */ (rm05.enemies)[PNT];
  assert.equal(raw.talents, undefined);
  assert.deepEqual(withFoeExtras(PNT, raw).talents, { Static: {}, DelayShell: {} }, 'act1multi_rm05\'s 先兆者');
  const { e } = arena(HUB, { x: 3, y: 1 }, [], []);
  assert.deepEqual([attrs.statsOf(e).flags.staticBody, attrs.statsOf(e).flying], [true, true]);
});

test('[敌能-130] the attack is a shell: no projectile and no hit at the shot; 89 frames later a blast on the target\'s spot, the ATK as physical damage without a source', () => {
  const a = arena(HUB, { x: 3, y: 1 }, [], [['guard', 1, 2]]), g = a.op('guard');
  const shot = fire(a);
  assert.deepEqual(shot.ev.filter((x) => x.id === a.e.id && (x.type === 'attack' || x.type === 'shot')).map((x) => [x.type, x.target]), [['attack', g.id]]);
  assert.equal(a.w.shots.length, 0);
  assert.deepEqual(a.w.blasts, [{ x: 2, y: 1, radius: 1.45, left: 89, air: true, src: -1, type: 'phys', amount: 1200, status: null }]);
  const flight = run(a, FLIGHT - 1);
  assert.deepEqual([flight.filter((x) => x.type === 'blast').length, lost(g)], [0, 0], 'nothing before it lands');
  const ev = run(a, 1);
  assert.equal(a.w.frame - 1 - shot.at, FLIGHT);
  assert.deepEqual(ev.filter((x) => x.type === 'blast'), [{ type: 'blast', x: 2, y: 1 }]);
  assert.deepEqual(ev.filter((x) => x.type === 'hit').map((x) => [x.id, x.target, x.damage]), [[-1, g.id, 1200 - 100]], 'sourceless, DEF 100');
  assert.equal(a.w.blasts.length, 0);
});

test('[敌能-130] the reach is 1.2 + the collider 0.25: 1.3 and the diagonal tile in, 1.5 and two tiles out; flying and camouflaged units in, 隐匿 out', () => {
  // the target (2, 0) is the only one the shooter may select within its reach (2.25 from (0, 0)): the 隐匿 guard (√5) is
  // in reach but not selectable; the others stand around the target, beyond the reach
  const a = arena(HUB, { x: 0, y: 0 }, [['civ', 2, 0], ['civ', 3.3, 0], ['civ', 3.5, 0], ['civ', 3, 1], ['civ', 4, 0], ['bird', 2.5, 1]], [['sniper', 0, 3], ['guard', 1, 2]]);
  const [t, near, far, diag, two, bird] = a.others, s = a.op('sniper'), g = a.op('guard');
  assert.equal(attrs.statsOf(bird).flying, true);
  buffs.addBuff(s, buffs.makeBuff({ key: 'test:camou', flags: { camou: true } }));
  buffs.addBuff(g, buffs.makeBuff({ key: 'test:stealth', flags: { stealth: true } }));
  const shot = fire(a);
  assert.deepEqual(shot.ev.filter((x) => x.type === 'attack' && x.id === a.e.id).map((x) => x.target), [t.id]);
  run(a, FLIGHT);
  assert.deepEqual([t, near, diag, bird].map(lost), [1200, 1200, 1200, 1200], 'the target, 1.3, √2 and the flyer');
  assert.deepEqual([far, two].map(lost), [0, 0], '1.5 and 2');
  assert.equal(lost(s), 1200 - 20, 'camouflaged');
  assert.equal(lost(g), 0, '隐匿');
});

test('[敌能-130] not forced onto the target, the ATK of the shot, and done with its shooter: the target that walked off is missed; a shooter that fell still hits', () => {
  // the decoy at 2.5 is beyond the shooter's reach (2.25 from (0, 0)), 0.5 from the shot's spot
  const a = arena(PNT, { x: 0, y: 0 }, [['civ', 2, 0], ['civ', 2.5, 0]], []);
  const [t, decoy] = a.others;
  const shot = fire(a);
  assert.deepEqual(shot.ev.filter((x) => x.type === 'attack' && x.id === a.e.id).map((x) => x.target), [t.id]);
  t.x = 4;
  buffs.addBuff(a.e, buffs.makeBuff({ key: 'test:atk', mods: { atkPct: 1 } }));
  const ev = run(a, FLIGHT);
  assert.deepEqual(ev.filter((x) => x.type === 'blast'), [{ type: 'blast', x: 2, y: 0 }]);
  assert.deepEqual([lost(t), lost(decoy)], [0, 1000], 'the spot, not the target; 1000 as at the shot, not the 2000 since');
  t.x = 2;
  const next = run(a, 150 - FLIGHT);
  assert.deepEqual(next.filter((x) => x.type === 'attack' && x.id === a.e.id).map((x) => x.target), [t.id], 'its next attack, at 2000');
  a.e.hp = 0;
  run(a, 1);
  assert.equal(a.w.units.includes(a.e), false, 'the shooter is gone');
  const late = run(a, FLIGHT - 1);
  assert.deepEqual(late.filter((x) => x.type === 'hit').map((x) => [x.id, x.damage]), [[-1, 2000], [-1, 2000]], 'the target and the decoy, without a source');
});

test('[敌能-130] a talent, and no hit on the target: a silenced shooter still fires the shell; an invincible target still gets it', () => {
  const a = arena(HUB, { x: 3, y: 1 }, [], [['guard', 1, 2]]), g = a.op('guard');
  status.applyStatus(a.e, 'silence', {});
  buffs.addBuff(g, buffs.makeBuff({ key: 'test:inv', flags: { invincible: true } }));
  assert.deepEqual([attrs.statsOf(a.e).flags.silence, attrs.statsOf(g).flags.invincible], [true, true]);
  const shot = fire(a);
  assert.deepEqual(shot.ev.filter((x) => x.type === 'attack' && x.id === a.e.id).map((x) => x.target), [g.id]);
  assert.deepEqual([a.w.shots.length, a.w.blasts.length], [0, 1]);
  buffs.removeBuff(g, 'test:inv');
  run(a, FLIGHT);
  assert.equal(lost(g), 1200 - 100, 'it lands once the target is no longer invincible');
});

test('[敌能-130] [敌能-8] at equal taunt a neutral unit before ours, though ours came later; a more taunting operator before it; blocked, the blocker', () => {
  // the guard (1, 1) and the civilian (5, 0) are both within 2.25 of (3, 1), and more than 1.45 apart
  const a = arena(HUB, { x: 3, y: 1 }, [['civ', 5, 0]], [['guard', 1, 1]]);
  const [civ] = a.others, g = a.op('guard');
  assert.deepEqual(targeting.sortAllies(a.e, [civ, g], 30).map((u) => u.id), [g.id, civ.id], 'by 仇恨值 alone the guard, deployed later');
  const shot = fire(a);
  assert.deepEqual(shot.ev.filter((x) => x.type === 'attack' && x.id === a.e.id).map((x) => x.target), [civ.id]);
  run(a, FLIGHT);
  assert.deepEqual([lost(civ), lost(g)], [1200, 0]);
  const b = arena(HUB, { x: 3, y: 1 }, [['civ', 5, 0]], [['guard', 1, 1]]), bg = b.op('guard');
  buffs.addBuff(bg, buffs.makeBuff({ key: 'test:taunt', mods: { taunt: 1 } }));
  const taunted = fire(b);
  assert.deepEqual(taunted.ev.filter((x) => x.type === 'attack' && x.id === b.e.id).map((x) => x.target), [bg.id]);
  run(b, FLIGHT);
  assert.deepEqual([lost(b.others[0]), lost(bg)], [0, 1200 - 100]);
  // blocked by a guard that blocks flying enemies, under it: the blocker, though the civilian (1.5 off) ties (索敌-5)
  const k = arena(HUB, { x: 2, y: 1 }, [['civ', 3.5, 1]], [['guard', 1, 2]]), kg = k.op('guard');
  buffs.addBuff(kg, buffs.makeBuff({ key: 'test:sky', flags: { blockFly: true } }));
  const held = fire(k);
  assert.equal(k.e.blockedBy, kg.id);
  assert.deepEqual(held.ev.filter((x) => x.type === 'attack' && x.id === k.e.id).map((x) => x.target), [kg.id]);
  run(k, FLIGHT);
  assert.deepEqual([lost(k.others[0]), lost(kg)], [0, 1200 - 100]);
});

/**
 * A two-stage level on the tiny map (合作-6, 合作-8): the first survives 10 s, the second rests 3 s; the shooter comes in
 * the first. @param {string} key
 */
function staged(key) {
  const c = /** @type {any} */ (tinyContent());
  const wave = (/** @type {any[]} */ actions) => ({ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions }] });
  const activate = (/** @type {string} */ alias) => ({ type: 'ACTIVATE', key: alias, route: -1, count: 1, preDelay: 0, interval: 0 });
  c.level.stages = [{ alias: 'c#1', objective: 'survive', goal: 10, time: 10, rest: 0 }, { alias: 'c#2', objective: 'survive', goal: 10, time: 10, rest: 3 }];
  c.level.predefines = c.level.stages.map((/** @type {any} */ s) => ({ alias: s.alias, key: 'trap_179_muctrl', hidden: true }));
  c.level.waves = [wave([activate('c#1')]), wave([spawnAt(0, key)]), wave([activate('c#2')]), wave([])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99 };
  c.enemies = { [key]: real.enemies[key] };
  c.behaviors = real.behaviors;
  c.operators.guard = { ...c.operators.guard, cost: 0, maxHp: HP, atk: 0 };
  return c;
}

test('[敌能-130] [合作-8] a shell fired before the intermission still lands in the rest, on whoever stands there then', () => {
  const c = staged(HUB), w = createWorld(c, { seed: 1, players: 1 });
  const deploy = /** @type {[number, any][]} */ ([[0, { type: 'deploy', op: 'guard', row: 1, col: 2, dir: 0 }]]);
  /** @type {any[]} */
  const ev = [];
  let e = /** @type {Unit | undefined} */ (undefined);
  while (w.frame < 250) {
    ev.push(...step(w, c));
    e ??= w.units.find((u) => u.key === HUB);
    if (e && !e.buffs.some((b) => b.key === 'root')) { e.x = 3; e.y = 1; status.applyStatus(e, 'root', {}); }
  }
  ev.push(...step(w, c, deploy));
  assert.equal(w.blasts.length, 1, 'fired at 250');
  while (w.frame < 301) ev.push(...step(w, c));
  assert.ok(ev.some((x) => x.type === 'stage' && x.on === 0 && x.index === 0), 'the first stage passed');
  assert.deepEqual([w.units.filter((u) => u.kind !== KIND.OPERATOR).length, w.blasts.length], [0, 1], 'the shooter is gone, the shell is not');
  step(w, c, deploy);
  const g = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  while (w.frame <= 250 + FLIGHT) ev.push(...step(w, c));
  assert.equal(lost(g), 1200 - 100, 'redeployed in the rest, hit by the shell');
});
