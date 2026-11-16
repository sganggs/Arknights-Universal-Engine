// What a kit sees of its operator's trait and what its own trait changes (docs/spec/compat.md 兼容-4, 兼容-5): the state a
// kit keeps in `unit.trait` over the engine's (a ramp, a drone ramp, a 替身's phase), the HP-loss time and base range of a
// unit, the elite form in the chess record, the fields of a kit's trait that reach the engine's trait data — and the ones
// that are named gaps.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, bus, damage, status, setExtraRange, traits } from '@aue/sim';
import { kitsBehaviors, withKitTrait } from '../src/compat/kits.js';
import { defOf } from '../src/compat/records.js';
import { loadTraining, operatorAt, TALENT_FIELDS } from '../src/operators.js';
import { matchContent } from '../src/index.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle @typedef {import('../src/compat/unit.js').ShUnit} ShUnit */

const SIEGE = 'char_112_siege';
const BUILD = { elite: 2, level: 90, potential: 6, trust: 100, skill: 2, skillLevel: 10, module: 0, moduleLevel: 3 };
/** @type {any} */
let training;

before(async () => {
  training = await loadTraining(SIEGE);
});

/**
 * The tiny level with the pieces of the kits given by key (a kit is `{ factory, chess? }`; the factory gets the record and def as a kit's does), each on 推进之王's record; `patch`
 * changes the content before the world is made, `o` is the content beyond the kits (兼容-7). Each kit's trait reaches its
 * record as it does in a match (withKitTrait).
 * @param {Record<string, { factory: (bb: any, chess: any) => any, chess?: boolean }>} kits @param {(c: any) => void} [patch] @param {import('../src/compat/kits.js').ContentInput} [o]
 */
function world(kits, patch = () => {}, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 4000;
  Object.assign(c.level.options, { initialCost: 40, maxCost: 99, characterLimit: 4 });
  const { talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, talentTrait, ...rest } = operatorAt(training, BUILD);
  void [talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, talentTrait];
  const deck = Object.keys(kits), def = defOf(SIEGE, training, BUILD);
  for (const k of deck) c.operators[k] = { ...rest, respawnTime: 1 };
  patch(c);
  const entries = Object.fromEntries(Object.entries(kits).map(([k, v]) => [k, { ...v, def }]));
  for (const k of deck) c.operators[k] = withKitTrait(c.operators[k], entries[k], c.level);
  c.decks = [deck];
  const box = /** @type {{ b: any }} */ ({ b: null });
  const { world: setup, skills, buffs, traits: behaviors } = kitsBehaviors(entries, (x) => { box.b = x; }, o);
  c.behaviors = { world: setup, skills, buffs, traits: behaviors };
  const w = createWorld(c, { seed: 1, players: 1 });
  return { c, w, b: /** @type {ShBattle} */ (box.b) };
}

/** The deployment of a key: on the road tile of the given column, facing left (its range covers that tile and the one before). @param {string} key @param {number} [col] */
const deploy = (key, col = 3) => /** @type {any} */ ([0, { type: 'deploy', op: key, row: 1, col, dir: 2 }]);
/** The piece of an operator key. @param {ShBattle} b @param {string} key @returns {ShUnit} */
const piece = (b, key) => /** @type {ShUnit} */ (b.pieces.get(`0|${key}`));
/** Steps n frames. @param {any} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** A unit's buff of a key, or undefined. @param {any} u @param {string} key */
const buffOf = (u, key) => u.buffs.find((/** @type {any} */ x) => x.key === key);
/** The kit that gives only a trait. @param {Record<string, any>} trait @param {(b: ShBattle, u: ShUnit) => void} [install] */
const kit = (trait, install) => ({ factory: () => ({ trait, ...(install ? { install } : {}) }), chess: true });

test('[兼容-4] unit.trait.ramp is the engine’s charge: read as its attack bonus, a write goes to the nearest step, at most all of them; a plain value off the field', () => {
  const { c, w, b } = world({ siege: kit({}) }, (cc) => { cc.operators.siege.trait = { charge: { atk: 2, steps: 40, init: 0.5 } }; });
  const p = piece(b, 'siege');
  p.trait.ramp = 7;
  assert.equal(p.trait.ramp, 7, 'off the field: a plain value');
  step(w, c, [deploy('siege')]);
  const u = w.units[0];
  assert.deepEqual([p.trait.ramp, buffOf(u, 'charge').value], [0.5, 10], 'the init bonus of the module: ten steps');
  p.trait.ramp = 1.02;
  assert.deepEqual([p.trait.ramp, buffOf(u, 'charge').value, buffOf(u, 'charge').mods], [1, 20, { atkPct: 1 }], 'the nearest step; the engine’s own buff is what holds it');
  p.trait.ramp = 99;
  assert.equal(p.trait.ramp, 2, 'at most all the steps');
  p.trait.ramp = 0;
  assert.deepEqual([p.trait.ramp, buffOf(u, 'charge').value], [0, 0]);
  run(w, c, 31);
  assert.equal(p.trait.ramp, 0.05, 'the engine goes on from where the kit left it: a step a second');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] unit.trait.funnelTarget and funnelScale are the engine’s funnel buff, funnelMap its ramp per target; plain values without a funnel', () => {
  const { c, w, b } = world({ siege: kit({}), texas: kit({}) }, (cc) => { cc.operators.siege.trait = { funnel: { init: 0.2, delta: 0.15, max: 1.1 } }; });
  const p = piece(b, 'siege'), plain = piece(b, 'texas');
  assert.deepEqual([p.trait.funnelTarget, p.trait.funnelScale, p.trait.funnelMap], [null, undefined, undefined], 'off the field: nothing yet');
  step(w, c, [deploy('siege')]);
  assert.deepEqual([p.trait.funnelTarget, p.trait.funnelScale, [...p.trait.funnelMap]], [null, 0.2, []], 'no target: the initial 倍率');
  p.trait.funnelTarget = 5;
  p.trait.funnelScale = 0.5;
  const u = w.units[0];
  assert.deepEqual([buffOf(u, 'funnel').value, buffOf(u, 'funnel').n, p.trait.funnelTarget, p.trait.funnelScale], [5, 2, 5, 0.5], 'written: the buff’s target and count that give it');
  assert.deepEqual([...p.trait.funnelMap], [[5, { s: 0.5, t: -Infinity }]], 'the map has the ramp of the latest target; its time is never now');
  p.trait.funnelScale = 9;
  assert.equal(p.trait.funnelScale, 1.1, 'at most the cap');
  p.trait.funnelMap = new Map([[5, { s: 0.35, t: 3 }], [8, { s: 1, t: 3 }]]);
  assert.equal(p.trait.funnelScale, 0.35, 'a map written back sets the ramp of the target the engine has');
  p.trait.funnelTarget = null;
  assert.deepEqual([buffOf(u, 'funnel').value, p.trait.funnelTarget], [-1, null]);
  // the engine’s attack counts the same ramp: the target it hits, the 倍率 of its last hit
  const e = (() => { run(w, c, 220); return b.enemies[0]; })();
  run(w, c, 80);
  assert.deepEqual([p.trait.funnelTarget, p.trait.funnelScale > 0.2], [e.id, true]);
  plain.trait.funnelTarget = 3;
  plain.trait.funnelScale = 0.9;
  assert.deepEqual([plain.trait.funnelTarget, plain.trait.funnelScale], [3, 0.9], 'a piece without a funnel keeps what a kit writes');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] unit.trait.doll and dollSwitching follow the engine’s 替身 phase: on from the switch to it until it ends, switching both ways; a write is a gap', () => {
  const doll = { duration: 2, switch: 1, atk: 0, maxHp: 0, attack: true, aura: null, range: null, antiAir: false };
  const { c, w, b } = world({ siege: kit({}), texas: kit({}) }, (cc) => { cc.operators.siege.trait = { doll }; });
  const p = piece(b, 'siege'), none = piece(b, 'texas');
  step(w, c, [deploy('siege')]);
  const state = () => [p.trait.doll, p.trait.dollSwitching];
  assert.deepEqual(state(), [false, false], 'its own form');
  damage.setHp(w.units[0], 0);
  run(w, c, 3);
  assert.deepEqual(state(), [true, true], 'the switch to the 替身');
  run(w, c, 30);
  assert.deepEqual(state(), [true, false], 'the 替身');
  run(w, c, 60);
  assert.deepEqual([state(), traits.dollPhase(w.units[0])], [[false, true], traits.DOLL_PHASE.OUT], 'the switch back');
  run(w, c, 30);
  assert.deepEqual(state(), [false, false]);
  p.trait.doll = true;
  p.trait.doll = true;
  assert.deepEqual(b.errors.map((e) => [e.label, e.message]), [['trait.doll', 'compat: trait.doll is not provided yet']], 'the engine keeps the phase: a write has no effect, a gap once');
  none.trait.doll = true;
  assert.equal(none.trait.doll, true, 'a piece without a 替身 keeps what a kit writes');
});

test('[兼容-4] lastHitAt: −Infinity until the unit loses HP, then the battle time of the last loss, for each deployment; an enemy’s too', () => {
  const { c, w, b } = world({ siege: kit({}) });
  const p = piece(b, 'siege');
  assert.equal(p.lastHitAt, -Infinity, 'off the field');
  step(w, c, [deploy('siege')]);
  assert.equal(p.lastHitAt, -Infinity);
  run(w, c, 10);
  damage.dealDamage(w, null, w.units[0], { type: 'true', amount: 5 }, c);
  const at = b.time;
  assert.equal(p.lastHitAt, at);
  run(w, c, 30);
  damage.dealDamage(w, null, w.units[0], { type: 'true', amount: 0 }, c);
  assert.equal(p.lastHitAt, at, 'a hit that took nothing is none');
  run(w, c, 40);
  const e = b.enemies[0];
  assert.equal(e.lastHitAt, -Infinity);
  damage.dealDamage(w, null, /** @type {any} */ (e.u), { type: 'true', amount: 5 }, c);
  assert.equal(e.lastHitAt, b.time);
  e.lastHitAt = 1;
  assert.equal(e.lastHitAt, 1, 'a kit may write it');
  run(w, c, 1);
  w.units.splice(0, 1);
  assert.equal(p.lastHitAt, at, 'left unwritten after the unit left');
});

test('[兼容-4] baseRangeKeys: the tiles of its own range where it stands, without a skill’s tiles, extra tiles or a kit’s change; none off the field and for an enemy', () => {
  const { c, w, b } = world({ siege: kit({}) });
  const p = piece(b, 'siege');
  assert.equal(p.baseRangeKeys, undefined, 'off the field');
  step(w, c, [deploy('siege')]);
  assert.deepEqual(p.baseRangeKeys, [9, 8], 'facing left from (1, 3) on a map six tiles wide: its own tile and the one before, in the grid’s order');
  setExtraRange(c, w.units[0], [0, 17]);
  assert.deepEqual([p.rangeKeys.length, p.baseRangeKeys], [4, [9, 8]], 'the extra tiles are in its range, not in its base range');
  p.rangeGrid = [[0, 0], [0, 1], [0, 2]];
  assert.deepEqual(p.baseRangeKeys, [9, 8, 7], 'its own range as a kit gave it');
  run(w, c, 40);
  assert.equal(b.enemies[0].baseRangeKeys, undefined);
});

test('[兼容-7] the elite form and the ids of a piece’s facts are in the chess record a kit receives (chess.isGolden)', () => {
  /** @type {Record<string, any>[]} */
  const seen = [];
  const make = () => ({ factory: (/** @type {any} */ _bb, /** @type {Record<string, any>} */ chess) => { seen.push(chess); return {}; }, chess: true });
  /** The record the kit last received: the piece’s own, at its install. @param {import('../src/compat/kits.js').ContentInput} [o] */
  const received = (o) => { world({ siege: make() }, () => {}, o); return /** @type {Record<string, any>} */ (seen.at(-1)); };
  const gold = received({ players: [{ units: { siege: { id: 'chess_char_112_siege_b', golden: true } } }] });
  const normal = received({ players: [{ units: { siege: { id: 'chess_char_112_siege_a', golden: false } } }] });
  const none = received();
  assert.deepEqual([gold.isGolden, gold.chessId, gold.baseId], [true, 'chess_char_112_siege_b', 'chess_char_112_siege_a']);
  assert.deepEqual([normal.isGolden, normal.chessId, normal.baseId], [false, 'chess_char_112_siege_a', 'chess_char_112_siege_a']);
  assert.deepEqual([none.isGolden, none.chessId], [undefined, 'aue_char_112_siege'], 'without facts: the record as the layer made it');
});

test('[兼容-5] a kit trait’s onHitStatus is the status each hit gives: the kit’s time over the profession’s (a talent’s extension in it), null clears it', () => {
  const op = { ...RECORD, position: 'MELEE', trait: { hitStatus: { key: 'sluggish', seconds: 0.8 }, hitStatusPlus: 0.13 } };
  const status = (/** @type {Record<string, any>} */ trait) => /** @type {any} */ (under(op, trait).trait).hitStatus;
  assert.deepEqual(status({ onHitStatus: { key: 'sluggish', duration: 1.33 } }), { key: 'sluggish', seconds: 1.33 });
  assert.deepEqual(status({ onHitStatus: { key: 'silence', duration: 2, value: 3 } }), { key: 'silence', seconds: 2, value: 3 });
  assert.equal(status({ onHitStatus: null }), null, 'cleared');
  assert.equal(status({ onHitStatus: { key: 'silence', duration: 0 } }), null, 'no time: none');
  assert.deepEqual(status({}), { key: 'sluggish', seconds: 0.8 }, 'a kit that says nothing: the profession’s');
  const { c, w, b } = world({ siege: kit({ onHitStatus: { key: 'sluggish', duration: 1.33 } }) }, (cc) => { cc.operators.siege.trait = { hitStatus: { key: 'sluggish', seconds: 0.8 } }; });
  /** @type {number[]} */
  const left = [];
  bus.on(w, 'attackHit', (k) => { left.push(Math.max(...k.target.buffs.filter((/** @type {any} */ x) => x.key === 'sluggish').map((/** @type {any} */ x) => x.left))); });
  step(w, c, [deploy('siege')]);
  run(w, c, 300);
  assert.ok(left.length > 0 && left.every((x) => x === 40), `the kit’s 1.33 s (40 frames), not 0.8 s: ${left}`);
  assert.deepEqual(b.errors, []);
});

test('[兼容-5] a kit trait’s hits and hitDmgMul: that many hits of that share each after the defences; only the first gives 受击回复', () => {
  const { c, w, b } = world({ siege: kit({ hits: 2, hitDmgMul: 0.5 }), texas: kit({}) });
  assert.deepEqual([c.operators.siege.trait.hits, c.operators.siege.trait.hitMul, c.operators.texas.trait?.hits], [2, 0.5, undefined]);
  /** @type {[number, boolean][]} */
  const seen = [];
  bus.on(w, 'hit', (k) => { if (k.dmg.isAttack && k.source === w.units[0]) seen.push([k.dmg.mul, k.dmg.noHurtSp === true]); });
  step(w, c, [deploy('siege')]);
  run(w, c, 300);
  assert.ok(seen.length >= 4 && seen.length % 2 === 0, `${seen.length} hits`);
  assert.deepEqual(seen.slice(0, 4), [[0.5, false], [0.5, true], [0.5, false], [0.5, true]]);
  assert.deepEqual(b.errors, []);
});

test('[兼容-5] noAttackUnlessSkill: it attacks only while its skill runs, and its AUTO skill starts as soon as it is ready', () => {
  const attacks = (/** @type {boolean} */ only) => {
    const { c, w } = world({ siege: { factory: () => ({ trait: only ? { noAttackUnlessSkill: true } : {}, skill: { kind: 'duration', duration: 3 } }), chess: true } }, (cc) => {
      cc.operators.siege.skill = { ...cc.operators.siege.skill, type: 'AUTO', cost: 4, init: 0 };
    });
    /** @type {{ at: number, skill: boolean }[]} */
    const seen = [];
    bus.on(w, 'attack', (k) => { seen.push({ at: w.frame, skill: !!k.attacker.skill?.active }); });
    const starts = /** @type {number[]} */ ([]);
    bus.on(w, 'skillStart', () => { starts.push(w.frame); });
    step(w, c, [deploy('siege')]);
    run(w, c, 700);
    return { seen, starts };
  };
  const control = attacks(false), only = attacks(true);
  assert.ok(control.seen.some((x) => !x.skill), 'without the flag it attacks with its skill off');
  assert.ok(only.seen.length > 0 && only.seen.every((x) => x.skill), 'with it: only while the skill runs');
  assert.ok(only.starts.length >= 2 && only.starts[0] <= 125, `its skill starts when ready and again: ${only.starts}`);
});

test('[兼容-5] hitSleep: the operator selects and damages sleeping enemies; without it a sleeping enemy is left alone', () => {
  /** @param {boolean} sleeps @returns {number} the HP the sleeping enemy lost */
  const lost = (sleeps) => {
    const { c, w, b } = world({ siege: kit(sleeps ? { hitSleep: true } : {}) });
    step(w, c, [deploy('siege')]);
    run(w, c, 215);
    const e = /** @type {any} */ (b.enemies[0].u);
    status.inflict(w, e, 'sleep', { seconds: 20 });
    const hp = e.hp;
    run(w, c, 90);
    return hp - e.hp;
  };
  assert.equal(lost(false), 0);
  assert.ok(lost(true) > 0);
});

/** An operator record on the branch `b` and a kit that gives only a trait. */
const RECORD = /** @type {any} */ ({ name: 'x', position: 'RANGED', cost: 9, blockCnt: 1, baseAttackTime: 1, maxHp: 1, atk: 1, def: 0, res: 0, range: [], branch: 'b' });
const LEVEL = { width: 6, height: 3 };
/** The record under a kit with this trait. @param {any} op @param {Record<string, any>} trait */
const under = (op, trait) => withKitTrait(op, { factory: () => ({ trait }), def: { raw: {} } }, LEVEL);

test('[兼容-5] a trait with its own install replaces the profession’s regeneration aura; the other fields that follow the kit: targets, flying block, tiles', () => {
  const bard = { ...RECORD, trait: { noAttack: true, regenAura: 0.1 } };
  assert.equal(under(bard, { install() {} }).trait?.regenAura, 0, 'the kit gives the regeneration itself');
  assert.equal(under(bard, {}), bard, 'a kit without an install of its own: the engine’s aura stays');
  const fields = /** @type {any} */ (under(RECORD, { maxTargets: 3, blockFly: true, rangeTiles: true }).trait);
  assert.deepEqual([fields.targets, fields.flags, fields.rangeTiles], [3, { blockFly: true }, true]);
});

test('[兼容-5] a 傀儡师 under a kit: the module’s attack and HP bonus for its 替身 are the kit’s, and it makes no attack when the kit says so', () => {
  const dolls = { ...RECORD, trait: { doll: { duration: 20, switch: 1, atk: 0.15, maxHp: 0.2, attack: true, aura: null, range: null, antiAir: false } } };
  const doll = (/** @type {Record<string, any>} */ trait) => /** @type {any} */ (under(dolls, trait).trait).doll;
  assert.deepEqual([doll({}).atk, doll({}).maxHp, doll({}).attack], [0, 0, true], 'the kit applies the module’s bonus');
  assert.equal(doll({ dollNoAttack: true }).attack, false);
});

test('[兼容-5] a field of a kit’s trait that the layer does not honour is a gap, once for the piece and name; the fields it honours are not', () => {
  const trait = { hits: 2, hitDmgMul: 0.5, onHitStatus: null, noAttackUnlessSkill: false, hitSleep: false, canAttack: () => true, rampInit: 0.5, priority: 'notBurst', healThrough: () => true, selfHeal: 1 };
  const { b } = world({ siege: kit(trait) });
  assert.deepEqual(b.errors.map((e) => [e.label, e.who, e.message]).sort(), ['priority', 'selfHeal'].map((k) => [`trait.${k}`, 'siege', `compat: trait.${k} is not provided yet`]));
});

test('[兼容-5] a bard’s regeneration aura asks the kit’s bardRegen handler for each ally’s share, as Stronghold’s profession does', () => {
  /** @param {((c: any) => void) | null} handler @returns {number | undefined} the aura the ally got */
  const given = (handler) => {
    const { c, w, b } = world({ siege: kit({}, (bb, u) => { if (handler) bb.on('bardRegen', (/** @type {any} */ x) => { if (x.unit === u) handler(x); }); }), texas: kit({}) }, (cc) => {
      cc.operators.siege.trait = { noAttack: true, free: true, regenAura: 0.1 };
      cc.operators.texas.trait = {};
    });
    step(w, c, [deploy('siege', 3)]);
    step(w, c, [deploy('texas', 2)]);
    run(w, c, 3);
    assert.deepEqual(b.errors, []);
    return buffOf(w.units[1], `aura:${w.units[0].id}`)?.mods.hpRegen;
  };
  const base = /** @type {number} */ (given(null));
  assert.ok(base > 0);
  assert.equal(given((x) => { x.value *= 1.5; }), base * 1.5, 'a handler changes the share');
  assert.equal(given((x) => { x.value = 0; }), undefined, 'a share that is not above 0 gives none');
});

test('[兼容-4] a funnel’s `funnelMul` and `funnel` in the profile: off when a kit writes funnelMul null, other numbers when it writes funnel — the engine’s attack follows', () => {
  /** @type {any} */
  let given;
  const funnel = { init: 0.2, delta: 0.15, max: 1.1 };
  const { c, w, b } = world({ siege: { factory: () => ({ install(/** @type {ShBattle} */ _bb, /** @type {ShUnit} */ u) { given = u; } }), chess: true } }, (cc) => { cc.operators.siege.trait = { funnel }; });
  const p = piece(b, 'siege');
  assert.equal(given, p);
  assert.deepEqual([p.profile.funnel, typeof p.profile.funnelMul, p.profile.hits], [funnel, 'function', 1], 'a piece has its funnel before it is deployed');
  /** @type {number[]} */
  const amounts = [];
  bus.on(w, 'hit', (k) => { if (k.dmg.isAttack) amounts.push(Math.round(k.dmg.amount * 100) / 100); });
  step(w, c, [deploy('siege')]);
  const atk = p.atk;
  const hits = (/** @type {number} */ from) => { amounts.length = 0; run(w, c, from); return amounts.slice(0, 3); };
  assert.deepEqual(hits(300).map((x) => x / atk).map((x) => Math.round(x * 100) / 100), [0.2, 0.35, 0.5], 'the trait’s ramp');
  const mul = p.profile.funnelMul;
  p.profile = { ...p.profile, funnelMul: null };
  assert.deepEqual(hits(120), [atk, atk, atk], 'off: the 倍率 stays 1');
  p.profile = { ...p.profile, funnelMul: mul };
  assert.ok(hits(120)[0] < atk, 'on again');
  p.profile.funnel = { ...funnel, init: 0.5, delta: 0, max: 0.5 };
  assert.deepEqual(hits(120), [atk / 2, atk / 2, atk / 2], 'other numbers');
  assert.deepEqual(b.errors, [], 'the funnel is the engine’s to read: no gap');
  p.profile.hits = 3;
  assert.deepEqual(/** @type {any[]} */ (b.errors).map((e) => e.label), ['profile.hits'], 'what the engine does not read still is');
  const enemy = b.enemies[0];
  assert.equal(p.profile.funnelMul(b, p, enemy), p.profile.funnel.init === 0.5 ? 0.5 : 1, 'called: the 倍率 the funnel would give');
});

test('[兼容-6] a kitted operator’s record has none of its talents’ fields — the ones a talent gives its attack speed too (TALENT_FIELDS)', async () => {
  const build = { elite: 2, level: 90, potential: 6, trust: 100, skill: 2, skillLevel: 10, module: 0, moduleLevel: 3 };
  const match = (/** @type {string} */ id) => ({ level: 'act1multi_01', difficulty: /** @type {const} */ ('NORMAL'), seed: 7, decks: [[{ id, build }]] });
  const id = 'char_1039_thorn2', key = `${id}#0`;
  const plain = /** @type {any} */ (await matchContent(match(id))).operators[key], kitted = /** @type {any} */ (await matchContent(match(id), { kits: { [id]: () => ({}) } })).operators[key];
  assert.ok(plain.fieldAspd, 'the engine’s own: the 视界 talent’s attack speed for every unit');
  assert.ok(TALENT_FIELDS.every((k) => !(k in kitted)) && TALENT_FIELDS.includes('fieldAspd'));
  assert.deepEqual(Object.keys(plain).filter((k) => !(k in kitted)).sort(), TALENT_FIELDS.filter((k) => k in plain).sort(), 'nothing else is lost');
  const ghost = 'char_1023_ghost2';
  const doll = (/** @type {any} */ c) => c.operators[`${ghost}#0`].trait.doll;
  const plainDoll = doll(await matchContent(match(ghost))), own = doll(await matchContent(match(ghost), { kits: { [ghost]: () => ({ trait: { dollNoAttack: true } }) } }));
  assert.deepEqual([plainDoll.atk, plainDoll.attack, own.atk, own.maxHp, own.attack], [0.15, false, 0, 0, false], 'the module’s attack is the kit’s; the 替身 attacks as the kit says');
});
