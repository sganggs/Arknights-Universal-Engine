// Kits and the block event and heals through 禁疗 (docs/spec/compat.md 兼容-4; hooks.md 钩子-6, damage.md 伤害-13): a kit's
// `blocked` handler gets the units as a kit sees them; a kit that sends `blocked` itself (酒神's 牢笼) reaches kit and
// engine handlers each in their shape; a kit trait's `healThrough` lets its operator's heals and their choice through
// 禁疗 — on inline kits in the tiny level, and with 凯尔希's pinned kit and her Mon3tr.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { oracleDir, tinyContent } from '@aue/testkit';
import { createWorld, step, bus, status, KIND, DIR } from '@aue/sim';
import { kitsBehaviors } from '../src/compat/kits.js';
import { loadKits, matchContent } from '../src/index.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('../src/compat/battle.js').ShBattle} ShBattle */

/** The pinned commit's root as a URL. */
let root = '';

before(() => {
  const compat = new URL('../src/compat/', import.meta.url).href;
  root = pathToFileURL(`${oracleDir()}/`).href;
  register(new URL('hook.js', compat), { data: { root, compat } });
});

/** A 3 × 3 range around the operator. */
const AROUND = [-1, 0, 1].flatMap((row) => [-1, 0, 1].map((col) => ({ row, col })));

/**
 * The tiny level with a `medic` of branch `doc` (ATK 100) and a `guard`, each with the kit given; guards `pet` and
 * `other` without one. `waves`: keep the level's two slimes; `skill`: the medic's skill record (its kit's spec by its id).
 * @param {{ medic?: any, guard?: any }} kits @param {boolean} [waves] @param {Record<string, any>} [skill]
 */
function match(kits, waves = false, skill) {
  const c = /** @type {any} */ (tinyContent());
  if (!waves) c.level.waves = [];
  c.level.options = { ...c.level.options, characterLimit: 9, initialCost: 99, maxCost: 99 };
  c.enemies.slime.maxHp = 1e6;
  c.operators.medic = { ...c.operators.sniper, name: 'medic', atk: 100, branch: 'doc', trait: { heal: true }, range: AROUND, ...(skill ? { skill } : {}) };
  for (const k of ['pet', 'other']) c.operators[k] = { ...c.operators.guard, name: k };
  const defOf = (/** @type {string} */ k) => ({ name: k, subProf: k === 'medic' ? 'doc' : 'guard', raw: {}, ...(skill && k === 'medic' ? { skill: { id: skill.id, bb: {} } } : {}) });
  const entries = Object.fromEntries(Object.entries(kits).map(([k, kit]) => [k, { factory: () => kit, def: defOf(k) }]));
  const box = /** @type {{ b: ShBattle | null }} */ ({ b: null });
  c.behaviors = kitsBehaviors(entries, (x) => { box.b = x; });
  const w = createWorld(c, { seed: 1, players: 1 });
  /** Deploys `op` at (row, col). @param {string} op @param {number} row @param {number} col */
  const put = (op, row, col) => { step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]); return /** @type {Unit} */ (w.units.at(-1)); };
  return { c, w, b: /** @type {ShBattle} */ (box.b), put };
}

/** The heals of the next n frames: [healer key, target key, amount]. @param {any} w @param {any} c @param {number} n */
function heals(w, c, n) {
  const out = [];
  for (let i = 0; i < n; i++) for (const e of step(w, c)) if (e.type === 'heal') out.push([w.units.find((/** @type {Unit} */ u) => u.id === e.id)?.key, w.units.find((/** @type {Unit} */ u) => u.id === e.target)?.key, e.amount]);
  return out;
}

test('[兼容-4] [钩子-6] blocked: a kit’s handler gets its piece as the blocker and the enemy as battle.enemies has it, once a block', () => {
  /** @type {any[]} */
  const seen = [];
  const kit = { install(/** @type {any} */ battle, /** @type {any} */ unit) {
    battle.on('blocked', (/** @type {any} */ ctx) => { seen.push({ me: ctx.blocker === unit, enemy: ctx.enemy, same: battle.enemies.includes(ctx.enemy), by: ctx.enemy.blockedBy === unit, t: battle.time }); }, { owner: unit });
  } };
  const { c, w, b, put } = match({ guard: kit }, true);
  put('guard', 1, 3);
  for (let i = 0; i < 400; i++) step(w, c);
  assert.equal(seen.length, 2, 'two slimes, one event each');
  assert.deepEqual(seen.map((s) => [s.me, s.same, s.by]), [[true, true, true], [true, true, true]]);
  assert.notEqual(seen[0].enemy, seen[1].enemy);
  assert.ok(seen[0].t < seen[1].t);
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] [钩子-6] a kit that sends blocked itself (酒神’s 牢笼): a kit’s handler sees kit units, the engine’s engine units; its block sends nothing else', () => {
  /** @type {any[]} */
  const kitSaw = [];
  /** @type {Unit[][]} */
  const engineSaw = [];
  /** @type {boolean[]} */
  const own = [];
  const kit = { install(/** @type {any} */ battle, /** @type {any} */ unit) {
    battle.on('blocked', (/** @type {any} */ ctx) => { kitSaw.push([ctx.blocker, ctx.enemy]); }, { owner: unit });
    battle.every(0.1, () => {
      for (const e of battle.enemies) {
        if (!unit.alive || !e.alive || e.blockedBy) continue;
        e.blockedBy = unit;
        const ctx = { blocker: unit, enemy: e };
        if (battle.hasHook('blocked')) own.push(battle.emit('blocked', ctx) === ctx);
      }
    }, { owner: unit });
  } };
  const { c, w, b, put } = match({ guard: kit }, true);
  bus.on(w, 'blocked', (k) => { engineSaw.push([k.blocker, k.enemy]); });
  const guard = put('guard', 1, 4);
  for (let i = 0; i < 90; i++) step(w, c);
  const slimes = w.units.filter((u) => u.kind === KIND.ENEMY);
  assert.equal(slimes.length, 2);
  assert.ok(slimes.every((s) => s.blockedBy === guard.id && s.x < 2), 'held by content where they were, far from the guard');
  assert.deepEqual(kitSaw, slimes.map((s) => [b.unitOf(guard), b.unitOf(s)]));
  assert.deepEqual(engineSaw, slimes.map((s) => [guard, s]), 'once each: the kit’s own, none from the block itself');
  assert.deepEqual(own, [true, true], 'its emit gives the kit back its own context');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] [伤害-13] a kit trait’s healThrough: the engine’s heal attack takes and heals its ally under 禁疗, injuredAlliesInKeys keeps it, the kit’s heal passes; another stays out', () => {
  /** @type {[string, string][]} */
  const asked = [];
  const kit = { trait: { healThrough: (/** @type {any} */ healer, /** @type {any} */ a) => { asked.push([healer.defId, a.defId]); return a.defId === 'pet'; } } };
  const { c, w, b, put } = match({ medic: kit });
  const medic = put('medic', 2, 2), pet = put('pet', 1, 2), other = put('other', 1, 3);
  for (const u of [pet, other]) status.applyStatus(u, 'healFree', {});
  pet.hp = 600; other.hp = 300;
  const piece = b.unitOf(medic);
  assert.deepEqual(b.injuredAlliesInKeys(piece.rangeKeys, piece).map((a) => a.defId), ['pet'], 'the other is lower but under 禁疗');
  assert.ok(asked.some(([h, a]) => h === 'medic' && a === 'pet'), 'asked with its piece and the ally as a kit sees them');
  const got = heals(w, c, 31).filter((h) => h[0] === 'medic');
  assert.ok(got.length > 0 && got.every((h) => h[1] === 'pet' && h[2] === 100), JSON.stringify(got));
  assert.equal(other.hp, 300);
  pet.hp = 500;
  assert.deepEqual([b.heal(piece, b.unitOf(pet), 50), b.heal(piece, b.unitOf(other), 50)], [50, 0], 'its own heal: the one it names only');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] [伤害-13] a kit trait without healThrough, or a kit whose answer throws: 禁疗 as before, the error recorded', () => {
  for (const kit of [{}, { trait: { healThrough: () => { throw new Error('boom'); } } }]) {
    const { c, w, b, put } = match({ medic: kit });
    const medic = put('medic', 2, 2), pet = put('pet', 1, 2);
    status.applyStatus(pet, 'healFree', {});
    pet.hp = 600;
    const piece = b.unitOf(medic);
    assert.deepEqual([b.injuredAlliesInKeys(piece.rangeKeys, piece), heals(w, c, 31), pet.hp], [[], [], 600]);
    assert.equal(b.heal(piece, b.unitOf(pet), 50), 0);
    assert.equal(b.errors.length > 0, 'trait' in kit, JSON.stringify(b.errors.slice(0, 1)));
  }
});

test('[兼容-4] [伤害-13] healThrough as Stronghold reads it: any truthy answer of the kit trait’s counts; a running skill’s attack that has one does not', () => {
  const truthy = match({ medic: { trait: { healThrough: (/** @type {any} */ _h, /** @type {any} */ a) => (a.defId === 'pet' ? a : 0) } } });
  const m1 = truthy.put('medic', 2, 2), p1 = truthy.put('pet', 1, 2);
  status.applyStatus(p1, 'healFree', {});
  p1.hp = 600;
  const piece = truthy.b.unitOf(m1);
  assert.deepEqual(truthy.b.injuredAlliesInKeys(piece.rangeKeys, piece).map((a) => a.defId), ['pet'], 'the ally itself as the answer');
  assert.equal(truthy.b.heal(piece, truthy.b.unitOf(p1), 50), 50);
  const skill = { id: 's', type: 'AUTO', sp: 'time', cost: 2, init: 2, charges: 1, duration: 0, ammo: false, bb: {} };
  const sk = match({ medic: { skills: { s: { kind: 'duration', duration: 30, attack: { healThrough: () => true } } } } }, false, skill);
  const m2 = sk.put('medic', 2, 2), p2 = sk.put('pet', 1, 2);
  status.applyStatus(p2, 'healFree', {});
  p2.hp = 600;
  const got = heals(sk.w, sk.c, 31), kp = sk.b.unitOf(m2);
  assert.equal(/** @type {any} */ (m2).skill?.active, true, 'its skill runs');
  assert.deepEqual([got, p2.hp, sk.b.injuredAlliesInKeys(kp.rangeKeys, kp), sk.b.heal(kp, sk.b.unitOf(p2), 50)], [[], 600, [], 0]);
  assert.deepEqual([truthy.b.errors, sk.b.errors], [[], []]);
});

test('[兼容-4] [伤害-13] 凯尔希’s pinned kit: her heals take her Mon3tr through its 禁疗; an ally under 禁疗 stays out', async () => {
  const build = { elite: 2, level: 90, potential: 6, trust: 100, skill: 0, skillLevel: 10 }, low = { elite: 0, level: 30, potential: 1, trust: 0, skill: 0, skillLevel: 4 };
  const { kits } = await loadKits(root, ['char_003_kalts']);
  const c = /** @type {any} */ (await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 7, decks: [[{ id: 'char_003_kalts', build }, { id: 'char_123_fang', build: low }]] }, { kits }));
  c.level = { ...c.level, waves: [] };
  assert.equal(c.operators['token_10002_kalts_mon3tr#0'].trait.flags.healFree, true, 'Mon3tr holds 禁疗 (召唤-7)');
  const w = createWorld(c, { seed: 7, players: 1 });
  w.players[0].cost = 99;
  const at = (/** @type {string} */ op, /** @type {number} */ row, /** @type {number} */ col) => {
    step(w, c, [[0, { type: 'deploy', op, row, col, dir: DIR.RIGHT }]]);
    return /** @type {Unit} */ (w.units.find((u) => u.key === op));
  };
  const kalts = at('char_003_kalts#0', 3, 3), mon3tr = at('token_10002_kalts_mon3tr#0', 3, 4), fang = at('char_123_fang#0', 4, 4);
  assert.ok(kalts && mon3tr && fang, 'all three on the field');
  status.applyStatus(fang, 'healFree', {});
  mon3tr.hp = mon3tr.maxHp * 0.6; fang.hp = 1;
  const hp = mon3tr.hp, got = heals(w, c, 120).filter((h) => h[0] === kalts.key);
  assert.ok(got.length > 0 && got.every((h) => h[1] === mon3tr.key && /** @type {number} */ (h[2]) > 0), JSON.stringify(got));
  assert.ok(mon3tr.hp > hp);
  assert.equal(fang.hp, 1);
});
