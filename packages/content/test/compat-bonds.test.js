// Stronghold's bonds (盟约, 第二期下半: content/bonds/core.js and addon/battle.js) in our battles through the compat
// layer (docs/spec/compat.md 兼容-7): its content unchanged, its data from the same checkout, each seat's bonds and
// pieces given as Stronghold's battle input. Needs a Stronghold checkout of v0.4.0 or later in AUE_STRONGHOLD_DIR (as the
// oracle's, @aue/testkit oracle.js); without one, skipped.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, bus, attrs, deck } from '@aue/sim';
import { kitsBehaviors } from '../src/compat/kits.js';
import { loadUnderGrid } from '../src/compat/grid.js';
import { setShData } from '../src/compat/sh/data.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle @typedef {import('../src/compat/players.js').PlayerInput} PlayerInput */

const SH = process.env.AUE_STRONGHOLD_DIR ? resolve(process.env.AUE_STRONGHOLD_DIR) : '';
const HERE = !!SH && existsSync(join(SH, 'server', 'sim', 'content', 'bonds', 'regulation.js')) && existsSync(join(SH, 'data', 'bonds.json'));
const skip = HERE ? false : 'no Stronghold checkout of v0.4.0 or later in AUE_STRONGHOLD_DIR';
/** The data files the bonds read. */
const FILES = ['bonds', 'items', 'effects', 'config', 'chess', 'garrisons', 'bands'];

/** @type {{ install: (b: any) => void }} */
let bonds;
/** @type {Record<string, any>} */
let DATA = {};

before(async () => {
  if (!HERE) return;
  const compat = new URL('../src/compat/', import.meta.url).href;
  register(new URL('hook.js', compat), { data: { root: pathToFileURL(`${SH}/`).href, compat } });
  DATA = Object.fromEntries(FILES.map((k) => [k, JSON.parse(readFileSync(join(SH, 'data', `${k}.json`), 'utf8'))]));
  setShData(DATA);
  const at = (/** @type {string} */ f) => pathToFileURL(join(SH, 'server', 'sim', 'content', f)).href;
  const [b, core, addon] = await loadUnderGrid(() => Promise.all([import(at('bonds.js')), import(at('bonds/core.js')), import(at('bonds/addon.js'))]));
  assert.deepEqual([typeof core.install, typeof addon.install], ['function', 'function'], 'both parts load (bonds.js would swallow a failure)');
  bonds = b;
});

/** A bond's blackboard in the data. @param {string} id */
const bb = (id) => Object.assign({}, ...(DATA.bonds[id].buffs ?? []).filter((/** @type {any} */ x) => !x.bbStr || !/\[share\]/.test(x.bbStr.key ?? '')).map((/** @type {any} */ x) => ({ ...x.bb, ...x.bbStr })));
/** An active bond's live state. @param {number} count @param {number} layers @param {number} [tier] */
const on = (count, layers, tier = 1) => ({ count, active: true, tier, layers });

const W = 10;
/**
 * A field of 10 columns: a road on row 1 (start at column 0, end at 9), high ground above and below; four melee
 * operators with a 3-SP skill and two snipers; one slow slime (or none). `facts` by operator key; `tweak` changes the content.
 * @param {Record<string, any>} bondsState @param {Record<string, any>} facts @param {{ slime?: boolean, tweak?: (c: any) => void }} [o]
 */
function match(bondsState, facts, o = {}) {
  const c = /** @type {any} */ (tinyContent()), [top, road, bottom] = c.level.tiles;
  c.level.width = W;
  c.level.tiles = [Array(W).fill(top[2]), [bottom[0], ...Array(W - 2).fill(road[0]), road[5]], Array(W).fill(top[2])];
  c.level.routes = [{ start: { row: 1, col: 0 }, end: { row: 1, col: W - 1 }, motion: 'WALK', checkpoints: [] }];
  if (o.slime === false) c.level.waves = [];
  Object.assign(c.enemies.slime, { maxHp: 1e6, moveSpeed: 0.3 });
  Object.assign(c.level.options, { initialCost: 99, maxCost: 99, characterLimit: 12, maxLifePoint: 99 });
  const skill = { type: 'AUTO', sp: 'time', cost: 3, init: 3, charges: 1, duration: 2, ammo: false, bb: {} };
  for (const k of ['m1', 'm2', 'm3', 'm4']) c.operators[k] = { ...c.operators.guard, name: k, respawnTime: 20, skill: { ...skill, id: `s_${k}` } };
  for (const k of ['r1', 'r2']) c.operators[k] = { ...c.operators.sniper, name: k };
  c.decks = [['m1', 'm2', 'm3', 'm4', 'r1', 'r2']];
  o.tweak?.(c);
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  c.behaviors = kitsBehaviors({}, (x) => { box.b = x; }, { players: [{ bonds: bondsState, units: facts }], modules: [{ name: 'bonds', install: bonds.install }] });
  const w = createWorld(c, { seed: 1, players: 1 });
  return { c, w, b: /** @type {ShBattle} */ (box.b) };
}

/** Deploy commands, [key, row, col] facing right. @param {[string, number, number][]} list @returns {[number, any][]} */
const at = (list) => list.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]);
/** @param {any} w @param {string} key */
const unit = (w, key) => w.units.find((/** @type {any} */ u) => u.key === key);
/** A unit's buff mods by key. @param {any} u @param {string} key */
const mods = (u, key) => u?.buffs.find((/** @type {any} */ x) => x.key === key)?.mods;
/** @param {any} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** The melee operators' skills started by the player (MANUAL). @param {any} c */
const manual = (c) => { for (const k of ['m1', 'm2', 'm3', 'm4']) c.operators[k].skill.type = 'MANUAL'; };
/** Commands that start these operators' skills. @param {any} w @param {string[]} keys @returns {[number, any][]} */
const cast = (w, keys) => keys.map((k) => [0, { type: 'skill', unit: unit(w, k).id }]);
/** Every bond of the data. */
const ALL = () => Object.keys(DATA.bonds);

test('[兼容-7] the bonds of v0.4.0 load through the hook and install for the seats’ bonds; a seat with none gets nothing', { skip }, () => {
  const { w, c, b } = match({}, { m1: { bonds: ALL() } });
  step(w, c, at([['m1', 1, 1]]));
  run(w, c, 30);
  assert.deepEqual(unit(w, 'm1').buffs.filter((/** @type {any} */ x) => x.key.startsWith('bond:')), []);
  assert.deepEqual(b.errors, []);
});

test('[兼容-7] standing buffs at the live layers: 炎, 精准 (2: ranged operators, penetration), 坚守, 助力, 协防, 独行, 绝技 (2: SP cost), 维多利亚, 突袭’s milestone', { skip }, () => {
  const raid = bb('raidShip');
  const state = { yanShip: on(3, 10), preciShip: on(3, 5, 2), steadShip: on(2, 10), deputShip: on(2, 0), emptyShip: on(2, 0), soloShip: on(1, 0), suntShip: on(5, 0, 2), victoriaShip: on(3, 4),
    raidShip: on(2, raid.power_bond_stack_cnt) };
  const facts = { m1: { id: 'chess_m1_b', golden: true, bonds: ['yanShip', 'preciShip', 'victoriaShip', 'soloShip', 'emptyShip', 'raidShip'], items: ['chess_item_1_01_a'] }, m2: { bonds: [] }, r1: { bonds: [] } };
  const { w, c, b } = match(state, facts);
  step(w, c, at([['m1', 1, 1], ['m2', 1, 2], ['r1', 0, 2]]));
  const [m1, m2, r1] = ['m1', 'm2', 'r1'].map((k) => unit(w, k)), x = (/** @type {string} */ id) => bb(id);
  assert.deepEqual(mods(m1, 'bond:yan'), { atkPct: x('yanShip').base_atk + x('yanShip').atk_per_stack * 10 });
  const preci = { atkPct: x('preciShip').base_atk + x('preciShip').atk_per_stack * 5, defIgnorePct: x('preciShip').power_def_penetrate, resIgnorePct: x('preciShip').power_magic_resist_penetrate };
  assert.deepEqual([mods(m1, 'bond:preciShip'), mods(m2, 'bond:preciShip'), mods(r1, 'bond:preciShip')], [preci, undefined, preci], 'members, and ranged operators at 2');
  for (const u of [m1, m2, r1]) {
    assert.deepEqual(mods(u, 'bond:steadShip'), { hpPct: x('steadShip').base_max_hp + x('steadShip').max_hp_per_stack * 10 });
    assert.deepEqual(mods(u, 'bond:deputShip'), { defPct: x('deputShip').base_def, redeployMul: 1 + x('deputShip').respawn_time });
    assert.deepEqual(mods(u, 'bond:emptyShip'), { physTakenMul: 1 - x('emptyShip').damage_resistance, artsTakenMul: 1 - x('emptyShip').damage_resistance });
  }
  assert.deepEqual([mods(m1, 'bond:emptyShip:dmg'), mods(m2, 'bond:emptyShip:dmg')], [{ dmgDealtMul: x('emptyShip').damage_scale_extra }, undefined]);
  assert.deepEqual([mods(m1, 'bond:soloShip'), mods(m1, 'bond:suntShip'), mods(m2, 'bond:suntShip')], [{ atkPct: x('soloShip').atk, hpPct: x('soloShip').max_hp }, { atkPct: x('suntShip').power_atk }, undefined]);
  assert.deepEqual([m1.skill.cost, m2.skill.cost], [Math.floor(3 * x('suntShip').sp_ratio), 3], '绝技 2: elites’ SP cost');
  assert.deepEqual(mods(m1, 'bond:victoria'), { dmgDealtMul: x('victoriaShip').base_damage_scale + x('victoriaShip').damage_scale_per_stack * 4 }, 'carrying equipment');
  assert.equal(mods(m2, 'bond:victoria'), undefined);
  assert.deepEqual([mods(m2, 'bond:raidShip:aspd'), mods(r1, 'bond:raidShip:aspd')], [{ aspd: raid.power_attack_speed }, { aspd: raid.power_attack_speed }], '突袭 at its milestone: every operator');
  assert.deepEqual(b.errors, []);
});

test('[兼容-7] layers gained in the battle: the standing buffs follow at the next frame’s start', { skip }, () => {
  const { w, c, b } = match({ yanShip: on(3, 10) }, { m1: { bonds: ['yanShip'] } });
  step(w, c, at([['m1', 1, 1]]));
  assert.equal(b.addLayers(0, 'yanShip', 5, 'bond'), 5);
  step(w, c);
  assert.deepEqual(mods(unit(w, 'm1'), 'bond:yan'), { atkPct: bb('yanShip').base_atk + bb('yanShip').atk_per_stack * 10 }, 'the next frame’s start');
  step(w, c);
  assert.deepEqual(mods(unit(w, 'm1'), 'bond:yan'), { atkPct: bb('yanShip').base_atk + bb('yanShip').atk_per_stack * 15 });
});

test('[兼容-7] 卡西米尔: each deployment raises its members’ ATK, to the cap; 叙拉古: a member’s deployment gives ASPD for its seconds, 隐匿 with 6', { skip }, () => {
  const facts = { m1: { bonds: ['kazimierzShip', 'siracusaShip'] }, m2: {}, m3: {} };
  const { w, c, b } = match({ kazimierzShip: on(3, 0), siracusaShip: on(6, 5) }, facts, { slime: false });
  const k = bb('kazimierzShip'), s = bb('siracusaShip');
  step(w, c, at([['m1', 1, 1], ['m2', 1, 2]]));
  assert.deepEqual(mods(unit(w, 'm1'), 'bond:kazimierz'), { atkPct: 2 * k.atk_when_born });
  step(w, c, at([['m3', 1, 3]]));
  assert.deepEqual(mods(unit(w, 'm1'), 'bond:kazimierz'), { atkPct: k.base_max_atk_when_born }, 'the cap');
  const m1 = unit(w, 'm1'), dur = s.base_duration + s.duration_per_stack * 5;
  assert.deepEqual(mods(m1, 'bond:siracusa'), { aspd: s.base_attack_speed + s.attack_speed_per_stack * 5 });
  const stealth = m1.buffs.find((/** @type {any} */ x) => x.key === 'bond:siracusa:stealth');
  assert.deepEqual([stealth.flags.stealth, attrs.statsOf(m1).flags.stealth, m1.buffs.find((/** @type {any} */ x) => x.key === 'bond:siracusa').left], [true, true, Math.round(dur * 30) - 2]);
  assert.equal(mods(unit(w, 'm2'), 'bond:siracusa'), undefined, 'not a member');
  assert.deepEqual(b.errors, []);
});

test('[兼容-7] 萨尔贡: a member’s skill start gives every member on the field a stack of ASPD, with 6 the ATK of each stack', { skip }, () => {
  const facts = { m1: { bonds: ['sargonShip'] }, m2: { bonds: ['sargonShip'] }, m3: {} };
  const { w, c, b } = match({ sargonShip: on(6, 0) }, facts, { slime: false, tweak: manual });
  step(w, c, at([['m1', 1, 1], ['m2', 1, 2], ['m3', 1, 3]]));
  step(w, c, cast(w, ['m1', 'm2', 'm3']));
  const g = bb('sargonShip'), stacks = (/** @type {any} */ u) => u.buffs.filter((/** @type {any} */ x) => x.key === 'bond:sargon');
  assert.deepEqual(stacks(unit(w, 'm1')).map((/** @type {any} */ x) => x.mods), [{ aspd: g.base_attack_speed }, { aspd: g.base_attack_speed }], 'two members started theirs');
  assert.deepEqual(mods(unit(w, 'm2'), 'bond:sargon:atk'), { atkPct: g.base_atk * 2 });
  assert.deepEqual(stacks(unit(w, 'm3')), [], 'not a member');
  run(w, c, Math.round(g.base_time * 30));
  assert.deepEqual([stacks(unit(w, 'm1')).length, mods(unit(w, 'm1'), 'bond:sargon:atk')], [0, undefined], 'they run out, the ATK with them');
  assert.deepEqual(b.errors, []);
});

test('[兼容-7] 拉特兰: a member’s ammo skill starts with ×(1 + base + per·L) of its ammo', { skip }, () => {
  const tweak = (/** @type {any} */ x) => { manual(x); for (const k of ['m1', 'm2']) Object.assign(x.operators[k].skill, { ammo: true, duration: 0, bb: { trigger_time: 10 } }); };
  const { w, c, b } = match({ lateranoShip: on(3, 10) }, { m1: { bonds: ['lateranoShip'] }, m2: {} }, { slime: false, tweak });
  step(w, c, at([['m1', 1, 1], ['m2', 1, 2]]));
  step(w, c, cast(w, ['m1', 'm2']));
  const l = bb('lateranoShip');
  assert.deepEqual([unit(w, 'm1').skill.ammo, unit(w, 'm2').skill.ammo], [Math.floor(10 * (1 + l.base_ammo_percent + l.ammo_percent_per_stack * 10) + 1e-9), 10], 'a member; not one');
  assert.deepEqual(b.errors, []);
});

test('[兼容-7] 阿戈尔: HP at every tier; the battle-start 吞噬 — the marker takes the base ATK and block, the marked loses HP, the seat gains layers', { skip }, () => {
  const facts = { m1: { bonds: ['egirShip'] }, m2: { bonds: ['egirShip'], tier: 2 } };
  const { w, c, b } = match({ egirShip: on(3, 0) }, facts, { slime: false, tweak: (x) => { x.operators.m2.maxHp = 100000; } });
  /** @type {string[]} */
  const deaths = [];
  b.on('death', (k) => { deaths.push(`${k.killer?.defId}>${k.unit?.defId}`); });
  step(w, c, at([['m1', 1, 1], ['m2', 1, 2]]));
  const e = bb('egirShip'), m1 = unit(w, 'm1'), m2 = unit(w, 'm2');
  assert.deepEqual(mods(m1, 'bond:egir:devour'), { atkFinal: 50, blockCnt: 2 }, 'm1 faces m2');
  assert.equal(mods(m2, 'bond:egir:devour'), undefined, 'nothing in front of m2');
  const max = 100000 * (1 + e.base_max_hp);
  assert.ok(Math.abs(m2.hp - (max - (e.damage_value - 100))) < 1e-6, '物理流失: 5000 less its DEF');
  assert.equal(b.players[0].bonds.egirShip.layers, 2, 'its tier');
  step(w, c);
  assert.deepEqual(mods(m2, 'bond:egir'), { hpPct: e.base_max_hp + e.max_hp_per_stack * 2 });
  assert.deepEqual([deaths, b.errors], [[], []]);
});

test('[兼容-7] 阿戈尔 5: a member the 吞噬 knocks out comes back at once — its next deployment free and without 再部署时间', { skip }, () => {
  const { w, c, b } = match({ egirShip: on(5, 0) }, { m1: { bonds: ['egirShip'] }, m2: { bonds: ['egirShip'] } }, { slime: false });
  /** @type {string[]} */
  const deaths = [];
  b.on('death', (k) => { deaths.push(`${k.killer?.defId}>${k.unit?.defId}:${k.reason}`); }, { priority: -100 });
  step(w, c, at([['m1', 1, 1], ['m2', 1, 2]]));
  step(w, c);
  assert.deepEqual(deaths, ['m1>m2:killed'], 'the kill is the marker’s');
  const p = w.players[0];
  assert.equal(unit(w, 'm2'), undefined);
  assert.ok(p.cards.m2.ready <= w.frame);
  assert.equal(deck.deployCost(c, p, 'm2', w), 0);
  assert.deepEqual(b.errors, []);
});

test('[兼容-7] 不屈 (2): a ground operator knocked out gives every operator on the field SP and may come back at once', { skip }, () => {
  const g = bb('indomShip'), sure = Math.ceil((1 - g.base_prob) / g.prob_per_stack);
  const { w, c, b } = match({ indomShip: on(3, sure, 2) }, { m1: { bonds: ['indomShip'] }, m2: {} }, { slime: false, tweak: (x) => { x.operators.m2.skill.init = 0; x.operators.m2.skill.cost = 30; } });
  step(w, c, at([['m1', 1, 1], ['m2', 1, 2]]));
  const m2 = unit(w, 'm2'), sp = m2.skill.sp;
  b.unitOf(unit(w, 'm1')).hp = 0;
  step(w, c);
  assert.ok(m2.skill.sp - sp >= g.sp && m2.skill.sp - sp < g.sp + 1, `+${g.sp} SP`);
  step(w, c);
  assert.equal(deck.deployCost(c, w.players[0], 'm1', w), 0);
  assert.ok(w.players[0].cards.m1.ready <= w.frame);
  assert.deepEqual(b.errors, []);
});

test('[兼容-7] 谢拉格: members deal ×base, ×(ex + per·L) on a 寒冷 enemy; with 6 the cold wind gives every enemy 寒冷', { skip }, () => {
  const k = bb('kjeragShip');
  const { w, c, b } = match({ kjeragShip: on(6, 10) }, { m1: { bonds: ['kjeragShip'] } });
  step(w, c, at([['m1', 1, 1]]));
  assert.deepEqual(mods(unit(w, 'm1'), 'bond:kjerag'), { dmgDealtMul: k.base_damage_scale });
  /** @type {number[]} */
  const muls = [];
  bus.on(w, 'hit', (x) => { if (x.source === unit(w, 'm1')) muls.push(x.dmg.mul); }, { priority: -1e9 });
  run(w, c, Math.round(k['bond_eff_kjerag[storm].interval'] * 30) + 1);
  const e = b.enemies[0], go = { now: true };
  assert.ok(e.u?.buffs.some((x) => x.key === 'cold'), 'the wind');
  muls.length = 0;
  b.on('tick', () => { if (go.now) { go.now = false; b.dealDamage(b.unitOf(unit(w, 'm1')), e, { amount: 1, type: 'phys' }); } });
  step(w, c);
  assert.ok(Math.abs(muls[muls.length - 1] - (k.base_ex_damage_scale + k.ex_damage_scale_per_stack * 10) / k.base_damage_scale) < 1e-9);
  assert.deepEqual(b.errors, []);
});

test('[兼容-7] 坚守 2: a share of a non-member’s damage goes to the members on the field; 奥术: a member’s arts damage, its target’s arts taken', { skip }, () => {
  const state = { steadShip: on(3, 0, 2), arcaneShip: on(2, 10) };
  const { w, c, b } = match(state, { m1: { bonds: ['steadShip', 'arcaneShip'] }, m2: {} });
  step(w, c, at([['m1', 1, 1], ['m2', 1, 3]]));
  const m1 = unit(w, 'm1'), m2 = unit(w, 'm2'), h1 = m1.hp, h2 = m2.hp, s = bb('steadShip');
  b.dealDamage({ source: null, target: b.unitOf(m2), amount: 100, type: 'true' });
  assert.deepEqual([h1 - m1.hp, h2 - m2.hp].map((v) => Math.round(v * 1e6) / 1e6), [100 * s.damage_resistance, 100 * (1 - s.damage_resistance)]);
  run(w, c, 300);
  const e = b.enemies[0];
  b.dealDamage(b.unitOf(m1), e, { amount: 10, type: 'arts' });
  const a = bb('arcaneShip');
  assert.deepEqual(mods(e.u, 'bond:arcaneShip'), { artsTakenMul: a.base_damage_scale + a.damage_scale_per_stack * 10 });
  assert.deepEqual(b.errors, []);
});

test('[兼容-7] 灵巧: its members and the operators beside them get its ASPD; 迅捷: a member’s skill end gives SP', { skip }, () => {
  const sw = bb('swiftShip'), sure = Math.ceil((1 - sw.base_prob) / sw.prob_per_stack);
  const state = { skillfulShip: on(2, 0), swiftShip: on(2, sure) };
  const { w, c, b } = match(state, { m1: { bonds: ['skillfulShip', 'swiftShip'] }, m2: {}, m3: {} }, { slime: false, tweak: (x) => { manual(x); x.operators.m1.skill.cost = 40; x.operators.m1.skill.init = 40; } });
  /** @type {number[]} */
  const after = [];
  bus.on(w, 'skillEnd', (k) => { if (k.unit.key === 'm1') after.push(k.unit.skill.sp); }, { priority: -1e9 });
  step(w, c, at([['m1', 1, 1], ['m2', 1, 2], ['m3', 1, 4]]));
  step(w, c, cast(w, ['m1']));
  run(w, c, 10);
  const aura = { aspd: bb('skillfulShip').base_attack_speed };
  assert.deepEqual(['m1', 'm2', 'm3'].map((k) => mods(unit(w, k), 'bond:skillfulShip')), [aura, aura, undefined]);
  run(w, c, 70);
  assert.ok(after.length === 1 && after[0] >= sw.normal_sp + sw.power_sp, `${after}: both rolls`);
  assert.deepEqual(b.errors, []);
});

test('[兼容-7] the gaps: 炎 6’s 炎佑 (Stronghold’s raw enemy record), 突袭’s jump (a retreat it follows with a redeployment elsewhere)', { skip }, () => {
  const { w, c, b } = match({ yanShip: on(6, 0), raidShip: on(2, 0) }, { r1: { bonds: ['yanShip', 'raidShip'] } });
  step(w, c, at([['r1', 0, 8]]));
  assert.deepEqual(b.errors.map((e) => `${e.label}: ${e.message}`), ['hook:battleStart: compat: data.rawEnemy is not provided yet']);
  run(w, c, 11 * 30);
  assert.ok(b.errors.some((e) => e.label === 'every' && e.message === 'compat: battle.retreat.raid is not provided yet'), 'idle 10 s, nothing in range');
  assert.ok(unit(w, 'r1'), 'it stays');
});
