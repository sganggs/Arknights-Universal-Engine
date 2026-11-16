// How a kit's skill starts and what its attacks are (docs/spec/compat.md 兼容-5): the start rule its spec declares — a kit
// that starts its own skill, a skill range, an ally in need — as the engine's skill behaviour answers it (技能-3); a hit that
// counts as a skill's only when the spec changes the attack or the targeting; the profile's callbacks asked once for an
// attack on a target, as Stronghold's one resolveHit does. Small kits of the test's own on the tiny level, two pieces on
// 推进之王's record (her second skill: AUTO, ready at once) and one 秘术师.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, bus } from '@aue/sim';
import { kitsBehaviors } from '../src/compat/kits.js';
import { defOf } from '../src/compat/records.js';
import { loadTraining, operatorAt } from '../src/operators.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle @typedef {import('../src/compat/unit.js').ShUnit} ShUnit */

const SIEGE = 'char_112_siege', INDIGO = 'char_469_indigo';
/** @type {Record<string, any>} */
const training = {};

before(async () => {
  for (const id of [SIEGE, INDIGO]) training[id] = await loadTraining(id);
});

/**
 * The tiny level with two pieces — `siege` and `texas`, both on 推进之王's record, whose skill is `skchr_siege_2`: AUTO, ready
 * at once — and a kit for each; the slimes of the level, or none; the starts of any skill, frame by frame.
 * @param {Record<string, () => any>} kits @param {{ waves?: boolean, id?: string, build?: Record<string, number>, reach?: number }} [o] `reach`: tiles ahead of
 * each piece in its range, in place of the record's
 */
function arena(kits, o = {}) {
  const id = o.id ?? SIEGE, build = { elite: 2, level: 90, potential: 6, trust: 100, skill: 1, skillLevel: 10, module: 0, moduleLevel: 3, ...o.build };
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 1e6;
  Object.assign(c.level.options, { initialCost: 90, maxCost: 99, characterLimit: 4 });
  if (o.waves === false) c.level.waves = [];
  const { talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest } = operatorAt(training[id], /** @type {any} */ (build));
  void [talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents];
  const deck = Object.keys(kits);
  const range = o.reach ? Array.from({ length: o.reach }, (_, col) => ({ row: 0, col })) : rest.range;
  for (const k of deck) c.operators[k] = { ...rest, range, respawnTime: 1 };
  c.decks = [deck];
  const box = /** @type {{ b: any }} */ ({ b: null });
  const entries = Object.fromEntries(Object.entries(kits).map(([k, factory]) => [k, { factory, chess: true, def: defOf(id, training[id], /** @type {any} */ (build)) }]));
  const { world, skills, buffs, traits } = kitsBehaviors(entries, (x) => { box.b = x; });
  c.behaviors = { world, skills, buffs, traits };
  const w = createWorld(c, { seed: 1, players: 1 });
  /** @type {number[]} */
  const starts = [];
  bus.on(w, 'skillStart', (k) => { if (k.unit.key === 'siege') starts.push(w.frame); });
  return { c, w, b: /** @type {ShBattle} */ (box.b), starts };
}

/** Where each piece stands: siege on the road at column 3 facing the enemies that come from the left, texas one tile in front of her. */
/** @type {Record<string, any>} */
const DEPLOY = Object.freeze({ siege: [0, { type: 'deploy', op: 'siege', row: 1, col: 3, dir: 2 }], texas: [0, { type: 'deploy', op: 'texas', row: 1, col: 2, dir: 2 }] });

/** A kit with `skill` as its default skill's spec. @param {Record<string, any>} skill @param {(b: ShBattle, u: ShUnit) => void} [install] */
const kitOf = (skill, install) => () => ({ skill, install });

/** The piece of an operator key. @param {ShBattle} b @param {string} key @returns {ShUnit} */
const piece = (b, key) => /** @type {ShUnit} */ (b.pieces.get(`0|${key}`));

/** Runs `n` frames; the frames the skill started in, in all so far. @param {{ c: any, w: any, starts: number[] }} m @param {number} n */
function run(m, n) {
  for (let i = 0; i < n; i++) step(m.w, m.c);
  return [...m.starts];
}

/** A running skill of 2 s, started by the kit alone: no rule of the spec's lets the engine start it. @type {Record<string, any>} */
const TIMED = Object.freeze({ kind: 'duration', duration: 2 });

test('[兼容-5] a kit that starts its own skill — NEVER, MANUAL, CUSTOM_RANGE with no tile — keeps the engine from starting it; the kit’s own start works; a kit that declares nothing is started by the engine at the attack', () => {
  const fresh = arena({ siege: kitOf(TIMED) });
  step(fresh.w, fresh.c, [DEPLOY.siege]);
  const first = run(fresh, 300);
  assert.ok(first.length === 1 && first[0] > 150, 'no rule: the engine starts it at the first attack, once');
  for (const trigger of ['NEVER', 'manual', { rule: 'CUSTOM_RANGE', grid: [] }, { rule: 'custom_range_search_enemy', grid: [] }]) {
    const m = arena({ siege: kitOf({ ...TIMED, trigger }) });
    step(m.w, m.c, [DEPLOY.siege]);
    assert.deepEqual(run(m, 400), [], `${JSON.stringify(trigger)}: not started in 13 s of fighting with the skill ready`);
    const p = piece(m.b, 'siege');
    assert.ok(p.skill?.ready && p.skill.activate('auto'), 'the kit starts it itself');
    assert.equal(m.starts.length, 1);
    assert.deepEqual(m.b.errors, []);
  }
});

test('[兼容-5] SP_FULL starts the skill as soon as it is ready, with no enemy; a rule that waits for the attack does not', () => {
  for (const [trigger, want] of /** @type {[any, number][]} */ ([['SP_FULL', 1], [{ rule: 'ALWAYS' }, 1], ['DEFAULT', 0], [undefined, 0]])) {
    const m = arena({ siege: kitOf({ ...TIMED, ...(trigger ? { trigger } : {}) }) }, { waves: false });
    step(m.w, m.c, [DEPLOY.siege]);
    assert.equal(run(m, 60).length, want, `${JSON.stringify(trigger)}: no enemy`);
  }
});

test('[兼容-5] CUSTOM_RANGE and SKILL_RANGE on a grid start the skill when an enemy is on its tiles — before it is in the operator’s range — and never else', () => {
  const ahead = [[0, 2]], off = [[0, 8]];
  for (const rule of ['CUSTOM_RANGE', 'SKILL_RANGE']) {
    const m = arena({ siege: kitOf({ ...TIMED, trigger: { rule, grid: ahead } }) });
    step(m.w, m.c, [DEPLOY.siege]);
    const first = run(m, 300);
    assert.equal(first.length, 1, `${rule}: started`);
    assert.ok(first[0] > 130 && first[0] < 160, `${rule}: with the enemy on the tile two ahead of her (frame ${first[0]}), where she herself reaches one tile: it takes 30 frames more to get there`);
    const out = arena({ siege: kitOf({ ...TIMED, trigger: { rule, grid: off } }) });
    step(out.w, out.c, [DEPLOY.siege]);
    assert.deepEqual(run(out, 400), [], `${rule}: a grid with no enemy on it`);
    assert.deepEqual(m.b.errors, []);
  }
  const plain = arena({ siege: kitOf({ ...TIMED, trigger: { rule: 'CUSTOM_RANGE' } }) });
  step(plain.w, plain.c, [DEPLOY.siege]);
  assert.ok(run(plain, 400)[0] > 170, 'CUSTOM_RANGE with no grid at all is the basic rule: at her attack, not at the tile two ahead');
});

test('[兼容-5] a heal skill, or one that asks for allies, starts when an injured ally is in range — in a grid, at most hpAtMost of its HP — else never', () => {
  const heal = { kind: 'instant', heal: true, attack: { dmgType: 'heal', healScale: 1 } };
  /**
   * Whether it started before and after texas, in her range, has lost a share of her HP, the enemies at the gate the whole
   * time (her second charge, stored by then, may start it twice).
   * @param {Record<string, any>} spec @param {number} loss @returns {[boolean, boolean]}
   */
  const play = (spec, loss) => {
    const m = arena({ siege: kitOf(spec), texas: kitOf({}) }, { reach: 3 });
    step(m.w, m.c, [DEPLOY.siege, DEPLOY.texas]);
    for (let i = 0; i < 150; i++) step(m.w, m.c);
    const texas = piece(m.b, 'texas'), before = run(m, 120).length;
    m.b.dealDamage({ source: m.b.enemies[0], target: texas, amount: texas.maxHp * loss, type: 'true' });
    assert.deepEqual(m.b.errors, []);
    return [before > 0, run(m, 120).length > before];
  };
  assert.equal(play({ ...heal, heal: false }, 0.3)[0], true, 'a skill that does not heal: at the attack, with the whole team well');
  assert.deepEqual(play(heal, 0.3), [false, true], 'a heal skill waits for an ally in need, with the enemy there');
  const half = { ...heal, trigger: { rule: 'DEFAULT', allies: true, hpAtMost: 0.5 } };
  assert.deepEqual(play(half, 0.3), [false, false], 'DEFAULT with allies: 70 % is above the half');
  assert.deepEqual(play(half, 0.6), [false, true], 'and 40 % is below it');
  assert.deepEqual(play({ ...heal, trigger: { rule: 'SKILL_RANGE', grid: [[0, 1]], allies: true } }, 0.2), [false, true], 'SKILL_RANGE with allies: the ally is on the grid');
  assert.deepEqual(play({ ...heal, trigger: { rule: 'SKILL_RANGE', grid: [[0, -1]], allies: true } }, 0.2), [false, false], 'and one that is not on it is not asked for');
});

test('[兼容-5] setTrigger changes the rule from then on, over the spec’s: its grid, none for an empty one; the spec’s allies and hpAtMost stay', () => {
  const m = arena({ siege: kitOf({ ...TIMED, trigger: 'NEVER' }) }, { waves: false });
  step(m.w, m.c, [DEPLOY.siege]);
  const sk = /** @type {NonNullable<ShUnit['skill']>} */ (piece(m.b, 'siege').skill);
  assert.deepEqual(run(m, 30), [], 'NEVER');
  sk.setTrigger('SP_FULL');
  assert.equal(run(m, 3).length, 1, 'SP_FULL, once it is set');
  sk.end();
  sk.sp = sk.spCost;
  sk.setTrigger('never');
  assert.equal(run(m, 60).length, 1, 'NEVER again');
  sk.setTrigger('CUSTOM_RANGE', []);
  assert.equal(run(m, 60).length, 1, 'an empty grid is none: the basic rule, which waits for an enemy');
  sk.setTrigger('SP_FULL', [[0, 1]]);
  assert.equal(run(m, 3).length, 2, 'a rule that takes no grid ignores it');
  assert.deepEqual(m.b.errors, []);
});

/**
 * What a kit saw of the hits of the skill: a piece with `spec` as its skill, the skill started by the kit, the attacks of
 * 3 s against the slimes — what each `damaged` of its attacks and each `attack` said of `isSkill`, and one dealt by
 * the kit itself.
 * @param {Record<string, any>} spec
 */
function skillFlags(spec) {
  /** @type {boolean[]} */
  const hits = [];
  /** @type {boolean[]} */
  const attacks = [];
  const kit = kitOf({ ...TIMED, trigger: 'NEVER', duration: 30, ...spec }, (/** @type {ShBattle} */ b, /** @type {ShUnit} */ u) => {
    b.on('damaged', (ctx) => { if (ctx.source === u && ctx.dmg.isAttack) hits.push(!!ctx.dmg.isSkill); }, { owner: u });
    b.on('attack', (ctx) => { if (ctx.attacker === u) attacks.push(!!ctx.isSkill); }, { owner: u });
  });
  const m = arena({ siege: kit });
  step(m.w, m.c, [DEPLOY.siege]);
  assert.ok(piece(m.b, 'siege').skill?.activate('manual', { free: true }));
  run(m, 400);
  return { hits, attacks, m };
}

test('[兼容-5] a hit is a skill’s for the kit only when the running skill’s spec changes the attack or the targeting: a skill of modifiers alone leaves its attacks plain', () => {
  const none = skillFlags({ mods: { atkPct: 0.5 } });
  assert.ok(none.hits.length > 3 && none.hits.every((x) => !x), 'modifiers only: every hit plain');
  assert.ok(none.attacks.length > 3 && none.attacks.every((x) => !x), 'and the attack event');
  for (const spec of [{ attack: { atkScale: 2 } }, { targeting: { maxTargets: 2 } }]) {
    const { hits, attacks } = skillFlags(spec);
    assert.ok(hits.length > 3 && hits.every((x) => x), `${JSON.stringify(spec)}: its hits are the skill’s`);
    assert.ok(attacks.length > 3 && attacks.every((x) => x), 'and its attacks');
  }
  assert.deepEqual(none.m.b.errors, []);
});

test('[兼容-5] a profile’s dmgMul and hitsFn are asked once for an attack on a target, whatever its hits: the answers stand for each', () => {
  /** @type {number[]} */
  const muls = [];
  let asked = 0;
  const kit = kitOf({ ...TIMED, trigger: 'NEVER', duration: 30, attack: {
    hits: 3, hitsFn: () => (++asked === 1 ? 0 : 1), dmgMul: () => { muls.push(asked); return 1 + muls.length; } } });
  const m = arena({ siege: kit });
  step(m.w, m.c, [DEPLOY.siege]);
  piece(m.b, 'siege').skill?.activate('manual', { free: true });
  /** @type {Map<number, number[]>} */
  const landed = new Map();
  bus.on(m.w, 'damaged', (k) => { if (k.source?.key === 'siege') landed.set(m.w.frame, [...(landed.get(m.w.frame) ?? []), k.amount]); });
  run(m, 600);
  const attacks = [...landed.values()];
  assert.ok(attacks.length >= 3, `${attacks.length} attacks landed`);
  assert.ok(attacks.every((a) => a.length === 3 && a.every((x) => x === a[0])), `each attack: three hits, one 倍率 — ${JSON.stringify(attacks)}`);
  assert.equal(asked, attacks.length + 1, 'hitsFn asked once an attack — the first answer, 0, stood for all three hits of the attack it cancelled');
  assert.equal(muls.length, asked, 'dmgMul asked once an attack too, the cancelled one included, and before hitsFn');
  assert.equal(muls[0], 0, 'before: the first attack asked the 倍率 when hitsFn had not been asked yet');
  assert.deepEqual(m.b.errors, []);
});

test('[兼容-5] the stored energy of a 秘术师 leaves with its attack: the profile’s afterHit and onEachHit run once for the attack and its bolts', () => {
  /** @type {number[]} */
  const after = [];
  /** @type {number[]} */
  const each = [];
  const kit = () => ({ trait: {
    afterHit: () => { after.push(m.w.frame); },
    onEachHit: (/** @type {ShBattle} */ _b, /** @type {ShUnit} */ _u, /** @type {ShUnit} */ _t, /** @type {Record<string, any>} */ h) => { if (h.kind === 'main') each.push(h.attackId); },
  } });
  const m = arena({ siege: kit }, { id: INDIGO, build: { skill: 0 } });
  m.c.level.waves = [{ preDelay: 0, postDelay: 0, maxWait: -1, fragments: [{ preDelay: 0, actions: [{ type: 'SPAWN', key: 'slime', route: 0, count: 1, preDelay: 14, interval: 0 }] }] }];
  /** @type {Map<number, number>} */
  const mains = new Map();
  bus.on(m.w, 'attackHit', (k) => { if (k.attacker.key === 'siege' && k.kind === 'main') mains.set(m.w.frame, (mains.get(m.w.frame) ?? 0) + 1); });
  step(m.w, m.c, [[0, { type: 'deploy', op: 'siege', row: 2, col: 2, dir: 2 }]]);
  for (let i = 0; i < 900; i++) step(m.w, m.c);
  const frames = [...mains.entries()];
  assert.ok(frames.some(([, n]) => n > 1), `the energy it stored went with an attack, as hits of their own: ${JSON.stringify(frames)}`);
  assert.deepEqual(after, frames.map(([f]) => f), 'afterHit: once for each attack, bolts or none');
  assert.equal(new Set(each).size, each.length, 'onEachHit: once for each attack too');
  assert.equal(each.length, frames.length);
  assert.deepEqual(m.b.errors, []);
});
