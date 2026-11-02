// 钩子-5's events as kits see them (docs/spec/compat.md 兼容-7): statusApplied with Stronghold's names and seconds,
// enemyAttackStart with its units — a stun a kit gives there cancels the attack —, palsyTrigger with the 麻痹 buff and
// `keep`; then the pinned kits that listen to them, unchanged: 真言's 噤声限域 and 酒神's 堕梦.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir, tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, bus, buffs, status, attrs, elements } from '@aue/sim';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf } from '../src/compat/records.js';
import { kitsBehaviors } from '../src/compat/kits.js';
import { loadTraining, operatorAt } from '../src/operators.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle */

const MANTRA = 'char_4204_mantra', PHATM = 'char_1042_phatm2';
/** E2 90, 潜能 6, S1, the module at stage 3 (PRI-X / RIT-X). */
const BUILD = { elite: 2, level: 90, potential: 6, trust: 100, skill: 0, skillLevel: 10, module: 0, moduleLevel: 3 };
/** @type {Record<string, { factory: any, training: any }>} */
const real = {};

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  for (const [id, file] of [[MANTRA, 'op-mantra.js'], [PHATM, 'op-phatm2.js']]) {
    const mod = await loadUnderGrid(() => import(pathToFileURL(join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops', file)).href));
    real[id] = { factory: mod.default[id], training: await loadTraining(id) };
  }
});

/**
 * The tiny level: the guard (a million HP) and `kitted` (a kit's operator), a slime that spawns at once — ranged (ATK 150,
 * an attack every 2 s, OnAttack 15 frames in), a million HP — put rooted at (1, 4) once it is there. Returns the world,
 * content, battle, slime and a runner that also gives the frames of the slime's shots.
 * @param {Record<string, any>} kits by operator key @param {Record<string, any>} [ops] more operators' records
 */
function match(kits, ops = {}) {
  const c = /** @type {any} */ (tinyContent());
  Object.assign(c.level.options, { initialCost: 60, maxCost: 99, characterLimit: 4 });
  c.level.waves = [oneWave([spawnAt(0.1, 'slime')])];
  c.operators.guard.maxHp = 1e6;
  Object.assign(c.operators, ops);
  Object.assign(c.enemies.slime, { atk: 150, baseAttackTime: 2, maxHp: 1e6, applyWay: 'RANGED', rangeRadius: 3.5, attack: { duration: 1, hit: 0.5 } });
  c.decks = [Object.keys(c.operators)];
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  c.behaviors = kitsBehaviors(kits, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @type {any} */
  let slime;
  for (let i = 0; i < 30 && !(slime = w.units.find((u) => u.key === 'slime')); i++) step(w, c);
  Object.assign(slime, { x: 4, y: 1 });
  status.applyStatus(slime, 'root', {});
  /** @param {number} n */
  const run = (n) => {
    const shots = /** @type {number[]} */ ([]);
    for (let i = 0; i < n; i++) { const f = w.frame; for (const e of step(w, c)) if (e.type === 'shot' && e.id === slime.id) shots.push(f); }
    return shots;
  };
  return { w, c, b: /** @type {ShBattle} */ (box.b), slime, run };
}

/** @param {any} w @param {string} key */
const unit = (w, key) => w.units.find((/** @type {any} */ u) => u.key === key);
/** A unit's layers of 麻痹. @param {any} u */
const layersOf = (u) => u.buffs.find((/** @type {any} */ x) => x.key === 'palsy')?.stacks ?? 0;
/**
 * Holds an operator's normal attacks from the moment it enters (职业-13's flag), so only its talents act.
 * @param {any} w @param {string} key
 */
const hold = (w, key) => bus.on(w, 'enter', (k) => { if (k.unit.key === key) buffs.addBuff(k.unit, buffs.makeBuff({ key: 'test:hold', flags: { noAttack: true } })); });

test('[兼容-7] a kit sees statusApplied in Stronghold\'s names and seconds, a stand-in\'s too; enemyAttackStart with its units, a stun there cancelling the attack; palsyTrigger\'s buff and keep', () => {
  const log = /** @type {any[]} */ ([]);
  const kit = () => ({ skills: {}, install(/** @type {ShBattle} */ b, /** @type {any} */ u) {
    b.on('statusApplied', (k) => { log.push(['applied', k.status, k.duration, k.value, k.entered, k.source?.defId ?? null, k.target.defId]); }, { owner: u });
    b.on('enemyAttackStart', (k) => {
      log.push(['strike', k.enemy.defId, k.targets.map((/** @type {any} */ t) => t.defId)]);
      if (u.mem.stun) b.applyStatus(k.enemy, 'stun', { duration: 0.1, source: u });
    }, { owner: u });
    b.on('palsyTrigger', (k) => { log.push(['palsy', k.enemy.defId, k.buff.key, k.buff.status, k.buff.stacks]); k.keep = !!u.mem.keep; }, { owner: u });
  } });
  const { w, b, slime, run } = match({ guard: { def: { name: 'guard', skill: null, raw: {} }, factory: kit } });
  step(w, b.c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const g = b.unitOf(unit(w, 'guard')), s = b.unitOf(slime);
  assert.deepEqual([b.applyStatus(s, 'bind', { duration: 1.5, source: g }), b.applyStatus(g, 'cold', { duration: 2, source: s })], [true, true]);
  assert.deepEqual([b.applyStatus(s, 'defDown', { duration: 1, value: 0.2 }), b.applyStatus(s, 'defDown', {}), b.applyStatus(s, 'palsy', {})], [true, true, true]);
  assert.deepEqual(log.splice(0), [
    ['applied', 'bind', 1.5, 0, false, 'guard', 'slime'], ['applied', 'cold', 2, 0, true, 'slime', 'guard'],
    ['applied', 'defDown', 1, 0.2, true, null, 'slime'], ['applied', 'defDown', Infinity, 0.3, false, null, 'slime'], ['applied', 'palsy', Infinity, 0, true, null, 'slime'],
  ], 'root as bind (already rooted: no entry), the enemy\'s cold as cold; the stand-in after its beforeStatus');
  g.mem.keep = true;
  const kept = run(60);
  assert.deepEqual([log.splice(0), kept, layersOf(slime)], [[['strike', 'slime', ['guard']], ['palsy', 'slime', 'palsy', 'palsy', 1]], [], 1], 'interrupted, the layer kept');
  g.mem.stun = true;
  const stunned = run(60);
  assert.deepEqual([log.splice(0).map((x) => x[0]), stunned, layersOf(slime)], [['strike', 'applied'], [], 1], 'a stun at the landing: no shot, 麻痹 not looked at');
  assert.deepEqual(b.errors, []);
});

/**
 * 真言 (her kit, 噤声限域's blackboard set to `bb`) on (2, 2) facing away, her attacks held, ATK +50 %, and the guard;
 * the slime under 2 麻痹.
 * @param {Record<string, number>} bb
 */
function mantraMatch(bb) {
  const { factory, training } = real[MANTRA], def = defOf(MANTRA, training, BUILD);
  def.raw = { ...def.raw, talents: def.raw.talents.map((/** @type {any} */ t) => (t.name === '噤声限域' ? { ...t, bb: { ...t.bb, ...bb } } : t)) };
  const m = match({ mantra: { factory, def } }, { mantra: { ...operatorAt(training, BUILD), respawnTime: 1 } });
  hold(m.w, 'mantra');
  step(m.w, m.c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }], [0, { type: 'deploy', op: 'mantra', row: 2, col: 2, dir: 2 }]]);
  const me = unit(m.w, 'mantra');
  buffs.addBuff(me, buffs.makeBuff({ key: 'test:atk', mods: { atkPct: 0.5 } }));
  for (let i = 0; i < 2; i++) status.applyStatus(m.slime, 'palsy');
  /** @type {{ amount: number, source: any, isAttack: boolean }[]} */
  const hush = [];
  bus.on(m.w, 'damaged', (k) => { if (k.dmg.tags?.includes('mantraHush')) hush.push({ amount: k.amount, source: k.source, isAttack: !!k.dmg.isAttack }); });
  return { ...m, me, hush };
}

test('[兼容-7] [钩子-5] 真言\'s kit, unchanged: 麻痹 interrupting an enemy\'s attack deals her attack now × atk_scale as 元素伤害; prob 1 keeps the layer, 0 spends it', () => {
  for (const [scale, prob, layers] of [[2.5, 1, 2], [1.25, 0, 1]]) {
    const { b, slime, me, hush, run } = mantraMatch({ atk_scale: scale, prob });
    const shots = run(45);
    const atk = attrs.statsOf(me).atk;
    assert.ok(atk > 873 * 1.4, `her attack with the +50 %: ${atk}`);
    assert.deepEqual([shots, hush.map((x) => [x.amount, x.source === me, x.isAttack]), layersOf(slime)], [[], [[atk * scale, true, false]], layers], `atk_scale ${scale}, prob ${prob}`);
    assert.deepEqual(b.errors, []);
  }
});

/**
 * 酒神 (her kit, 堕梦's `value` set) on `at` facing `dir` with her attacks held, and the guard; logs the slime's
 * 神经损伤 element value at each of its attacks' landings, before and after the kit's handlers.
 * @param {number} value @param {[number, number]} at @param {number} dir
 */
function phatmMatch(value, at, dir) {
  const { factory, training } = real[PHATM], def = defOf(PHATM, training, BUILD);
  def.raw = { ...def.raw, talents: def.raw.talents.map((/** @type {any} */ t) => (t.name === '堕梦' ? { ...t, bb: { ...t.bb, value } } : t)) };
  const m = match({ phatm: { factory, def } }, { phatm: { ...operatorAt(training, BUILD), respawnTime: 1 } });
  hold(m.w, 'phatm');
  step(m.w, m.c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }], [0, { type: 'deploy', op: 'phatm', row: at[0], col: at[1], dir }]]);
  const ep = /** @type {[number, number][]} */ ([]), sanity = () => elements.epOf(m.slime, 'SANITY');
  bus.on(m.w, 'enemyAttackStart', () => { ep.push([sanity(), 0]); }, { priority: 1e9 });
  bus.on(m.w, 'enemyAttackStart', () => { ep[ep.length - 1][1] = sanity(); }, { priority: -1e9 });
  return { ...m, ep };
}

test('[兼容-7] [钩子-5] 酒神\'s kit, unchanged: an enemy of her range whose attack lands takes 堕梦\'s value as 神经损伤 first; the burst it causes interrupts that attack', () => {
  const { b, slime, ep, run } = phatmMatch(41, [0, 3], 0);
  const shot = run(45);
  assert.deepEqual([ep, shot.length], [[[1000, 959]], 1], 'value 41; that attack lands');
  slime.ep.SANITY = 30;
  const hp = slime.hp, cut = run(75);
  assert.deepEqual([ep.slice(1), cut, layersOf(slime), hp - slime.hp], [[[30, 0]], [], 2, 6000], 'the burst: its 3 麻痹 (one spent on this attack) and its 6000');
  assert.deepEqual(b.errors, []);
  const far = phatmMatch(41, [0, 2], 2);
  far.run(45);
  assert.deepEqual(far.ep, [[1000, 1000]], 'not in her range: nothing');
});
