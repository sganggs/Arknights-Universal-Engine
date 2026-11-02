// The pinned kits that call the Stronghold functions that were gaps (docs/spec/compat.md 兼容-4), unchanged, on an open
// field: 酒神's 空剧场 until the element values lock (burstLocked), 死芒's 复燃 upgrade by 仇恨值 (aggroCmp), Mon3tr's
// 熔毁 chain from herself (chainHealNext), 黍's 离离枯荣 heal with no target (performAttack), 真言's 【麻痹付与】 2 layers.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { oracleDir, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, bus, buffs, status, attrs, damage } from '@aue/sim';
import { loadUnderGrid } from '../src/compat/grid.js';
import { defOf, tokenDefOf } from '../src/compat/records.js';
import { kitsBehaviors, withKitTrait } from '../src/compat/kits.js';
import { loadTraining, operatorAt } from '../src/operators.js';
import { TOKENS, loadToken, tokenAt } from '../src/tokens.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle @typedef {import('../src/compat/unit.js').ShUnit} ShUnit */

/** E2 90, 潜能 6, the third skill at 专精 3, no module. */
const BUILD = { elite: 2, level: 90, potential: 6, trust: 100, skill: 2, skillLevel: 10 };
/** The kits by key: character id and file in the pinned commit. @type {Record<string, [string, string]>} */
const FILES = { phatm2: ['char_1042_phatm2', 'op-phatm2.js'], necras: ['char_450_necras', 'op-necras.js'], monstr: ['char_4179_monstr', 'op-monstr.js'],
  shu: ['char_2025_shu', 'op-shu.js'], mantra: ['char_4204_mantra', 'op-mantra.js'] };
/** @type {Record<string, { id: string, factory: any, training: any }>} */
const kits = {};

before(async () => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${oracleDir()}/`).href, compat } });
  for (const [key, [id, file]] of Object.entries(FILES)) {
    const mod = await loadUnderGrid(() => import(pathToFileURL(join(oracleDir(), 'server', 'sim', 'content', 'kits', 'ops', file)).href));
    kits[key] = { id, factory: mod.default[id], training: await loadTraining(id) };
  }
});

/** The engine's record without its talents: the kit applies them (兼容-6). @param {Record<string, any>} d */
const bare = ({ talentBb, talentMods, talentTrait, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest }) => rest;
/** A low tile any operator may stand on. @param {string} key @param {string} [buildable] */
const tile = (key, buildable = 'ALL') => ({ key, height: 'LOWLAND', buildable, passable: 'ALL', side: 'ALL' });
/** Guards without a kit: they do not attack. @param {string[]} keys */
const guards = (keys) => Object.fromEntries(keys.map((k) => [k, { name: k, position: 'MELEE', cost: 1, blockCnt: 1, baseAttackTime: 1, maxHp: 1000, atk: 0, def: 0, res: 0, range: [{ row: 0, col: 0 }] }]));

/**
 * An open field 7 × 5 (any operator on any tile; the start at (2, 0), the goal at (2, 6); `n` slimes — a million HP, ATK
 * 0 — at 0.1 s, put rooted on `spots` once there) with the pinned kit `key` at BUILD or `build` (`tweak` changes its def)
 * as a match makes it — its record under its kit's trait, its summons' records and defs (兼容-6) — and guards `more`.
 * @param {string} key @param {{ n?: number, spots?: number[][], more?: string[], tweak?: (def: any) => void, build?: typeof BUILD }} [o]
 */
async function field(key, o = {}) {
  const k = kits[key], b0 = o.build ?? BUILD, def = defOf(k.id, k.training, b0), entry = { factory: k.factory, def, tokens: /** @type {Record<string, any>} */ ({}) };
  o.tweak?.(def);
  const tiles = Array.from({ length: 5 }, (_, r) => Array.from({ length: 7 }, (_, c) => (r === 2 && c === 0 ? tile('tile_start', 'NONE') : r === 2 && c === 6 ? tile('tile_end', 'NONE') : tile('tile_road'))));
  const lv = { id: 'open', width: 7, height: 5, options: { maxLifePoint: 9, initialCost: 99, maxCost: 99, costIncreaseTime: 1, characterLimit: 9, moveMultiplier: 1 }, tiles,
    routes: [{ start: { row: 2, col: 0 }, end: { row: 2, col: 6 }, motion: 'WALK', checkpoints: [] }], waves: o.n ? [oneWave(Array.from({ length: o.n }, () => spawnAt(0.1, 'slime')))] : [] };
  const c = /** @type {any} */ ({ level: lv, enemies: { slime: { name: 'slime', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 1 } }, decks: [[key, ...(o.more ?? [])]],
    operators: { [key]: { ...withKitTrait(/** @type {any} */ (bare(operatorAt(k.training, b0))), entry, lv), respawnTime: 1 }, ...guards(o.more ?? []) } });
  for (const id of (k.training.tokens ?? []).filter((/** @type {string} */ x) => Object.hasOwn(TOKENS, x))) {
    const token = await loadToken(id);
    c.operators[`${id}#0`] = { ...bare(tokenAt(token, id, k.training, b0)), char: id, summoner: key };
    entry.tokens[id] = tokenDefOf(id, token, k.training, b0);
  }
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  c.behaviors = kitsBehaviors({ [key]: entry }, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @param {number} frames @param {any[]} [cmds] */
  const run = (frames, cmds = []) => { for (let i = 0; i < frames; i++) step(w, c, i === 0 ? cmds : []); };
  /** An engine unit by key (the n-th of them). @param {string} k2 @param {number} [i] @returns {any} */
  const unit = (k2, i = 0) => w.units.filter((u) => u.key === k2)[i];
  if (o.n) {
    run(6);
    w.units.filter((u) => u.key === 'slime').forEach((e, i) => { const [r, col] = (o.spots ?? [])[i] ?? [2, 3]; Object.assign(e, { x: col, y: r }); status.applyStatus(e, 'root', {}); });
  }
  return { w, c, b: /** @type {ShBattle} */ (box.b), run, unit };
}

/** A deploy command. @param {string} op @param {number} row @param {number} col @returns {[number, any]} */
const deploy = (op, row, col) => [0, { type: 'deploy', op, row, col, dir: 0 }];
/** Starts an operator's MANUAL skill now: its SP full, the command. @param {any} u @returns {[number, any]} */
const cast = (u) => { u.skill.sp = u.skill.cost; return [0, { type: 'skill', unit: u.id }]; };
/** The heals of a battle: [frame, source key, target key, amount]. @param {any} w */
function heals(w) {
  /** @type {any[]} */
  const out = [];
  bus.on(w, 'heal', (k) => { out.push([w.frame, k.source?.key, k.target?.key, Math.round(k.amount)]); }, { priority: -1e9 });
  return out;
}

test('[兼容-4] 酒神\'s 空剧场, unchanged: an enemy she gave 神经损伤 takes it every second until its element values lock (burstLocked), not while they are', async () => {
  const { w, b, run, unit } = await field('phatm2', { n: 1, spots: [[2, 4]] });
  // her attacks held from her entry (职业-13's flag), so only the skill gives 神经损伤
  bus.on(w, 'enter', (k) => { if (k.unit.key === 'phatm2') buffs.addBuff(k.unit, buffs.makeBuff({ key: 'test:hold', flags: { noAttack: true } })); });
  run(1, [deploy('phatm2', 1, 2)]);
  const me = unit('phatm2'), e = unit('slime');
  run(1, [cast(me)]);
  const key = `phatm2:s3dot#${b.unitOf(me).id}`, dot = () => e.buffs.some((/** @type {any} */ x) => x.key === key);
  // her 神经损伤 as the engine's `damaged` would carry it (伤害-7 has no 元素损伤, so it never does: 兼容-4)
  const gave = () => bus.emit(w, 'damaged', { source: me, credit: me, target: e, amount: 50, type: 'element', dmg: { type: 'element', element: 'neural', amount: 50, tags: [] } });
  /** @type {number[]} */
  const ticks = [];
  bus.on(w, 'elementHit', (k) => { if (k.source === me && k.target === e) ticks.push(w.frame); });
  e.ep.SANITY = 200;
  const f = w.frame, tick = attrs.statsOf(me).atk * 0.1;
  gave();
  assert.equal(dot(), true, 'it starts');
  run(4);
  assert.deepEqual([ticks, Math.round(e.ep.SANITY)], [[f + 3], Math.round(200 - tick)], 'ep_damage_ratio × her ATK, 0.1 s later');
  run(29);
  assert.deepEqual([ticks, dot()], [[f + 3], true], 'not before a second has passed');
  run(1);
  assert.deepEqual([ticks, dot()], [[f + 3, f + 33], false], 'a second later: the hit that bursts it, so its values are locked and it ends');
  assert.equal(e.buffs.some((/** @type {any} */ x) => x.key === 'burst:SANITY'), true);
  gave();
  assert.equal(dot(), false, 'not while its values are locked');
  for (let i = 0; i < 400 && e.buffs.some((/** @type {any} */ x) => x.key === 'burst:SANITY'); i++) run(1);
  gave();
  assert.equal(dot(), true, 'after the burst: again');
  assert.deepEqual(b.errors, []);
});

/**
 * 死芒 (S2: with S3 her first summon is the special form, which this upgrade never takes) at (1, 3) facing right, and
 * four slimes killed one after another on her range: three summons, then — at her cap — the upgrade; `beforeLast` runs
 * before the fourth kill. Which summons were upgraded, in the order made.
 * @param {(skels: any[]) => void} [beforeLast]
 */
async function necras(beforeLast = () => {}) {
  const { w, b, run } = await field('necras', { n: 4, spots: [[2, 4], [2, 5], [1, 5], [0, 4]], build: { ...BUILD, skill: 1 } });
  run(1, [deploy('necras', 1, 3)]);
  const slimes = w.units.filter((u) => u.key === 'slime'), skels = () => w.units.filter((u) => u.key.startsWith('token_10043'));
  for (const e of slimes.slice(0, 3)) { damage.dealDamage(w, null, e, { type: 'true', amount: 2e6 }); run(15); }
  beforeLast(skels());
  damage.dealDamage(w, null, slimes[3], { type: 'true', amount: 2e6 });
  run(15);
  assert.deepEqual(b.errors, []);
  return skels().map((u) => u.buffs.some((/** @type {any} */ x) => x.key === 'necras:upgrade'));
}

test('[兼容-4] 死芒\'s 复燃, unchanged: at her cap the upgrade goes to the summon of the highest 仇恨值 among equal HP (aggroCmp): the last made, or a higher 嘲讽等级', async () => {
  assert.deepEqual(await necras(), [false, false, true], 'the same HP: the last one made');
  assert.deepEqual(await necras((s) => { buffs.addBuff(s[0], buffs.makeBuff({ key: 'test:taunt', mods: { taunt: 1 } })); }), [true, false, false], 'the first one, taunt +1');
  assert.deepEqual(await necras((s) => { s[1].hp -= 1; }), [false, true, false], 'the lowest HP before any 仇恨值 (the kit\'s own order)');
});

/**
 * Mon3tr (S3) at (1, 2), her 重构体 at (1, 3) and guards g1 (0, 3), g2 (0, 4), g3 (1, 4) at `hp`; a slime at (2, 4); her
 * 熔毁 cast: she moves onto the 重构体's tile and every attack of hers starts a chain from herself.
 * @param {number[]} hp
 */
async function meltdown(hp) {
  const { w, b, run, unit } = await field('monstr', { n: 1, spots: [[2, 4]], more: ['g1', 'g2', 'g3'] });
  run(1, [deploy('monstr', 1, 2), deploy('g1', 0, 3), deploy('g2', 0, 4), deploy('g3', 1, 4)]);
  run(1, [deploy('token_10050_monstr_prosts#0', 1, 3)]);
  ['g1', 'g2', 'g3'].forEach((k, i) => { unit(k).hp = hp[i]; });
  const log = heals(w), me = unit('monstr');
  run(1, [cast(me)]);
  for (let i = 0; i < 60 && log.length === 0; i++) run(1);
  assert.deepEqual(b.errors, []);
  return { log, me, atk: attrs.statsOf(me).atk };
}

test('[兼容-4] Mon3tr\'s 熔毁, unchanged: each attack a chain from herself (a free link), each next the lowest HP ratio around the last (chainHealNext), ×0.75 a jump', async () => {
  const one = await meltdown([200, 500, 600]), base = Math.round(one.atk * 0.5);
  assert.deepEqual([one.me.x, one.me.y], [3, 1], 'on her 重构体\'s tile');
  const f = one.log[0][0];
  assert.deepEqual(one.log, [[f, 'monstr', 'monstr', base], [f, 'monstr', 'g1', base], [f, 'monstr', 'g2', Math.round(one.atk * 0.5 * 0.75)], [f, 'monstr', 'g3', Math.round(one.atk * 0.5 * 0.75 * 0.75)]],
    'attack@heal_scale × her ATK; after herself the next keeps the amount');
  const two = await meltdown([600, 200, 500]);
  assert.deepEqual(two.log.map((x) => x[2]), ['monstr', 'g2', 'g3', 'g1'], 'g2 lowest; from g2 (0, 4): g3 before g1');
});

test('[兼容-4] 黍\'s 离离枯荣, unchanged: with no enemy to attack her attack heals the most injured ally of her range for her ATK now, at her attack interval (performAttack)', async () => {
  const { w, b, run, unit } = await field('shu', { more: ['g1'] });
  run(1, [deploy('shu', 2, 3), deploy('g1', 1, 3)]);
  const me = unit('shu'), g1 = unit('g1');
  buffs.setBaseMaxHp(g1, 1e6);
  g1.hp = 100;
  buffs.addBuff(me, buffs.makeBuff({ key: 'test:atk', mods: { atkFlat: 100 } }));
  const log = heals(w);
  run(1, [cast(me)]);
  run(80);
  const atk = Math.round(attrs.statsOf(me).atk), mine = log.filter((x) => x[1] === 'shu' && x[2] === 'g1' && x[3] > 100);
  assert.ok(atk > 800, `her ATK in the skill, +100: ${atk}`);
  assert.deepEqual(mine.map((x) => [x[0] - mine[0][0], x[3]]), [[0, atk], [36, atk], [72, atk]], 'her ATK each 1.2 s');
  assert.deepEqual(b.errors, []);
});

/**
 * 真言 (S3; `per` its per_active) at (1, 3) and slimes at (1, 4) and (1, 5), the second under 1 麻痹 already; her 无言为真
 * cast. Returns their layers 0.1 s later and the overflow bounces (元素伤害 hits tagged mantraOverflow) on each.
 * @param {number} [per]
 */
async function grant(per) {
  const tweak = per === undefined ? undefined : (/** @type {any} */ d) => { d.raw = { ...d.raw, skill: { ...d.raw.skill, bb: { ...d.raw.skill.bb, per_active: per } } }; };
  const { w, b, run, unit } = await field('mantra', { n: 2, spots: [[1, 4], [1, 5]], ...(tweak ? { tweak } : {}) });
  run(1, [deploy('mantra', 1, 3)]);
  const s = [unit('slime', 0), unit('slime', 1)], bounces = [0, 0];
  status.applyStatus(s[1], 'palsy', {});
  bus.on(w, 'damaged', (k) => { if ((k.dmg.tags ?? []).includes('mantraOverflow')) bounces[s.indexOf(k.target)]++; });
  run(1, [cast(unit('mantra'))]);
  run(5);
  assert.deepEqual(b.errors, []);
  return { layers: s.map((e) => e.buffs.find((/** @type {any} */ x) => x.key === 'palsy')?.stacks ?? 0), bounces };
}

test('[兼容-4] 真言\'s 【麻痹付与】, unchanged: per_active layers at once; her cap of 2 cuts them to what fits, the rest overflows', async () => {
  assert.deepEqual(await grant(), { layers: [2, 2], bounces: [0, 1] }, 'her 2: both at her cap; the second\'s third layer one bounce');
  assert.deepEqual(await grant(1), { layers: [1, 2], bounces: [0, 0] });
  assert.deepEqual(await grant(3), { layers: [2, 2], bounces: [1, 1] }, '3 over a cap of 2');
});
