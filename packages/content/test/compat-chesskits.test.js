// What chess kits need of the battle they see (docs/spec/compat.md 兼容-4, 兼容-5): the default skill of a chess kit as the
// spec of the selected skill; a piece's `base` before it is deployed; its element gauges, profile and removal mark; buffs a
// kit holds; pulls, push distances and the board; bards' regeneration, the attack countdown and the 仇恨值 order; and
// the gaps that are named. The kits here are small ones of the test's own, on the tiny level with 推进之王's record.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, elements } from '@aue/sim';
import { kitsBehaviors, skillSpecOf } from '../src/compat/kits.js';
import { chessKit } from '../src/compat/kitmod.js';
import { defOf } from '../src/compat/records.js';
import { bardRegen } from '../src/compat/sh/professions.js';
import { attackCountdown } from '../src/compat/sh/ai.js';
import { aggroCmp } from '../src/compat/sh/targeting.js';
import { CompatGap } from '../src/compat/sh/gap.js';
import { loadTraining, operatorAt } from '../src/operators.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle @typedef {import('../src/compat/unit.js').ShUnit} ShUnit */

const SIEGE = 'char_112_siege';
/** E2 90, 潜能 6, S3 at 专精 3: her selected skill is `skchr_siege_3`. */
const BUILD = { elite: 2, level: 90, potential: 6, trust: 100, skill: 2, skillLevel: 10, module: 0, moduleLevel: 3 };
/** @type {any} */
let training;

before(async () => {
  training = await loadTraining(SIEGE);
});

/**
 * The tiny level with two pieces — `siege` and `texas`, both on the record of 推进之王 — and the kits given for them (a
 * kit is `{ factory, chess }`); enemies sturdy enough to last.
 * @param {Record<string, { factory: () => any, chess?: boolean }>} kits @param {string[]} [deck]
 */
function match(kits, deck = Object.keys(kits)) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 4000;
  Object.assign(c.level.options, { initialCost: 40, maxCost: 99, characterLimit: 4 });
  const { talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest } = operatorAt(training, BUILD);
  void [talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents];
  for (const k of deck) c.operators[k] = { ...rest, respawnTime: 1 };
  c.decks = [deck];
  const box = /** @type {{ b: any }} */ ({ b: null });
  const entries = Object.fromEntries(Object.entries(kits).map(([k, v]) => [k, { ...v, def: defOf(SIEGE, training, BUILD) }]));
  const { world, skills, buffs, traits } = kitsBehaviors(entries, (x) => { box.b = x; });
  c.behaviors = { world, skills, buffs, traits };
  const w = createWorld(c, { seed: 1, players: 1 });
  return { c, w, b: /** @type {ShBattle} */ (box.b) };
}

/** @type {Record<string, any>} */
const DEPLOY = Object.freeze({
  siege: [0, { type: 'deploy', op: 'siege', row: 1, col: 3, dir: 2 }],
  texas: [0, { type: 'deploy', op: 'texas', row: 1, col: 4, dir: 2 }],
});

/** The piece of an operator key. @param {ShBattle} b @param {string} key @returns {ShUnit} */
const piece = (b, key) => /** @type {ShUnit} */ (b.pieces.get(`0|${key}`));
/** An enemy of the field, after the first waves are in. @param {ShBattle} b @param {any} w @param {any} c */
function enemy(b, w, c) {
  for (let i = 0; i < 40; i++) step(w, c);
  return /** @type {ShUnit} */ (b.enemies[0]);
}

test('[兼容-5] a chess kit’s default skill is the spec of the selected skill; a spec in `skills` under its id comes first; an operator kit has no default', () => {
  const def = { skill: { id: 'skchr_siege_3' } }, dflt = { kind: 'duration' }, own = { kind: 'ammo' };
  assert.equal(skillSpecOf({ skill: dflt, skills: { skchr_siege_1: own } }, def, true), dflt, 'the default skill: the selected one, not named in skills');
  assert.equal(skillSpecOf({ skill: dflt, skills: { skchr_siege_3: own } }, def, true), own, 'named in skills: that one');
  assert.equal(skillSpecOf({ skill: dflt, skills: { skchr_siege_3: null } }, def, true), null, 'named with none: none');
  assert.equal(skillSpecOf({ skill: dflt }, def, false), null, 'an operator kit names every skill it supports: no default');
  assert.equal(skillSpecOf({ skills: { skchr_siege_1: own } }, def, true), null, 'a chess kit without a default skill');
  assert.equal(skillSpecOf({ skill: 'x' }, def, true), null, 'not a spec');
  const f = () => ({}), marked = chessKit(f);
  assert.equal(marked, f);
  assert.equal(/** @type {any} */ (marked).chess, true);
  const kit = { skill: { kind: 'duration' } };
  for (const [chess, want] of /** @type {[boolean, unknown][]} */ ([[true, kit.skill], [false, null]])) {
    const { b } = match({ siege: { factory: () => kit, chess } }, ['siege']);
    assert.equal(piece(b, 'siege').skill?.spec ?? null, want, `chess ${chess}`);
  }
});

test('[兼容-4] addAmmo: more shots for a running ammo skill, nothing for one that is not running, not an ammo skill, or a number that is not finite', () => {
  const { c, w, b } = match({ siege: { factory: () => ({ skill: { kind: 'ammo', ammo: 3 } }), chess: true } }, ['siege']);
  step(w, c, [DEPLOY.siege]);
  const sk = piece(b, 'siege').skill, st = /** @type {any} */ (w.units[0]).skill;
  assert.equal(sk?.kind, 'ammo');
  sk?.addAmmo(2);
  assert.equal(sk?.ammoLeft, 0, 'not running: nothing');
  assert.ok(sk?.activate('manual', { free: true }));
  const shots = st.ammo;
  assert.ok(shots >= 1);
  sk?.addAmmo(2);
  assert.equal(st.ammo, shots + 2);
  sk?.addAmmo(Infinity);
  sk?.addAmmo(NaN);
  assert.equal(st.ammo, shots + 2);
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] a piece’s base before it is deployed: its cost and 再部署时间 from the record, what a kit sets kept, its attributes put on each deployment', () => {
  const kit = () => ({ install(/** @type {ShBattle} */ _b, /** @type {ShUnit} */ u) { const x = /** @type {Record<string, any>} */ (u.base); x.cost = Math.max(0, x.cost + 2); x.respawnTime += 5; x.atk = 9; } });
  const { c, w, b } = match({ siege: { factory: kit, chess: true } }, ['siege']);
  const p = piece(b, 'siege'), base = /** @type {Record<string, any>} */ (p.base);
  assert.deepEqual([base.cost, base.respawnTime, base.atk], [c.operators.siege.cost + 2, 6, 9], 'a kit may change it at its install, before any deployment');
  assert.equal(base.maxHp, c.operators.siege.maxHp, 'what the kit left alone is the record’s');
  assert.deepEqual(b.errors.map((e) => [e.label, e.who, e.message]), [
    ['base.cost', 'siege', 'compat: base.cost is not provided yet'],
    ['base.respawnTime', 'siege', 'compat: base.respawnTime is not provided yet'],
  ], 'the cost and the 再部署时间 are kept and not used: a gap, once for each; the attributes are used');

  step(w, c, [DEPLOY.siege]);
  const u = /** @type {any} */ (w.units[0]);
  assert.equal(u.base.atk, 9, 'put on the unit of the deployment');
  assert.equal(base.cost, c.operators.siege.cost + 2, 'the cost is kept with the piece: the deck’s rules stay the engine’s');
  assert.equal(u.base.cost, undefined);
  base.atk = 11;
  assert.equal(u.base.atk, 11, 'written while deployed: on the unit');
  assert.equal(/** @type {any} */ (b.unitOf(u).base).atk, 11);
  base.cost = 1;
  base.respawnTime = 1;
  assert.equal(b.errors.length, 2, 'the gap is recorded once for each unit and name');
});

test('[兼容-4] elem: how much of each element gauge is filled, by Stronghold’s name', () => {
  const { c, w, b } = match({ siege: { factory: () => ({}), chess: true } }, ['siege']);
  const p = piece(b, 'siege');
  assert.deepEqual(p.elem, { burn: 0, neural: 0, necrosis: 0, apoptosis: 0, erosion: 0 }, 'off the field: empty');
  step(w, c, [DEPLOY.siege]);
  const u = /** @type {any} */ (w.units[0]), max = p.gaugeMax;
  assert.deepEqual(p.elem, { burn: 0, neural: 0, necrosis: 0, apoptosis: 0, erosion: 0 });
  const taken = elements.dealEp(w, u, 'FIRE', 300);
  assert.ok(taken > 0 && Math.abs(p.elem.burn - taken) < 1e-9, `${p.elem.burn} of ${taken}`);
  assert.equal(p.elem.neural, 0);
  elements.dealEp(w, u, 'SANITY', max);
  assert.equal(p.elem.neural, max, 'a full gauge is the maximum');
});

test('[兼容-4] a kit may give a unit another profile or write a field of it, and write the removal mark; a field the layer does not read is a gap, once for the unit and field', () => {
  const { c, w, b } = match({ siege: { factory: () => ({}), chess: true } }, ['siege']);
  step(w, c, [DEPLOY.siege]);
  const p = piece(b, 'siege'), was = { ...p.profile };
  p.profile.canHitFly = !was.canHitFly;
  p.profile.maxTargets = 3;
  p.profile.priority = 'lowestHp';
  assert.deepEqual(b.errors, [], 'the fields the target helpers read: no gap');
  p.profile.canHitFly = was.canHitFly;
  p.profile.funnelMul = 2;
  assert.equal(p.profile.funnelMul, 2, 'a field written is kept');
  p.profile.funnelMul = 2;
  p.profile = { ...p.profile, dmgMul: null, atkScale: 3, hits: 2, heal: { mode: 'multi' }, selfHeal: 0.1 };
  assert.deepEqual([p.profile.dmgMul, p.profile.atkScale, p.profile.funnelMul, p.profile.canHitFly], [null, 3, 2, was.canHitFly]);
  p.profile = { ...p.profile, atkScale: 4 };
  p.profile.hits = 3;
  p.profile = null;
  assert.deepEqual({ ...p.profile }, was, 'null takes it back');
  assert.deepEqual(/** @type {any[]} */ (b.errors).map((e) => [e.label, e.who, e.message]).sort(), ['atkScale', 'dmgMul', 'funnelMul', 'heal', 'hits', 'selfHeal'].map((k) => [`profile.${k}`, 'siege', `compat: profile.${k} is not provided yet`]), 'a field that is changed and not read: kept, has no effect, named once. A whole profile spread back with only some fields changed names only those');
  // a unit that is not an operator (a summon, an enemy) keeps what a kit writes in its profile as well
  const foe = enemy(b, w, c);
  assert.deepEqual({ ...foe.profile }, {});
  foe.profile.noAttack = true;
  assert.equal(foe.profile.noAttack, true);
  assert.deepEqual(/** @type {any[]} */ (b.errors).filter((e) => e.label === 'profile.noAttack').map((e) => [e.who, e.message]), [[foe.defId, 'compat: profile.noAttack is not provided yet']]);
  p.removed = true;
  assert.equal(p.removed, false, 'a piece never is removed (it may be deployed again)');
  p.removed = false;
  assert.equal(p.removed, false);
});

test('[兼容-4] buffs a kit holds: addBuff gives the buff, one object for its whole life; removeBuff of it takes that one alone', () => {
  /** @type {any[]} */
  const held = [];
  const kit = () => ({ install(/** @type {ShBattle} */ b, /** @type {ShUnit} */ u) {
    b.on('deploy', () => {
      held.push(b.addBuff(u, { key: 'kit:x', refresh: 'independent', maxStacks: 9, data: { n: 1 }, duration: 20 }), b.addBuff(u, { key: 'kit:x', refresh: 'independent', maxStacks: 9, data: { n: 2 }, duration: 20 }));
    }, { owner: u });
  } });
  const { c, w, b } = match({ siege: { factory: kit, chess: true } }, ['siege']);
  assert.equal(b.addBuff(piece(b, 'siege'), { key: 'kit:none', duration: 5 }), null, 'off the field: no buff given');
  step(w, c, [DEPLOY.siege]);
  const p = piece(b, 'siege');
  assert.equal(held.length, 2);
  assert.ok(held[0] && held[1] && held[0] !== held[1]);
  assert.ok(p.buffs.includes(held[0]) && p.buffs.includes(held[1]), 'the buffs a kit reads are the same objects');
  assert.deepEqual(held.map((x) => [x.key, x.data.n, x.seq > 0]), [['kit:x', 1, true], ['kit:x', 2, true]]);
  assert.ok(held[1].seq > held[0].seq, 'in acquisition order');
  assert.equal(p.findBuff('kit:x'), held[0]);
  b.removeBuff(p, held[0]);
  assert.deepEqual(p.buffs.map((x) => x.data?.n), [2], 'the one given');
  b.removeBuff(p, undefined);
  b.removeBuff(p, null);
  assert.equal(p.buffs.length, 1, 'a buff that was never given removes nothing');
  b.removeBuff(p, 'kit:x');
  assert.equal(p.buffs.length, 0, 'a key: all of them');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] an error of a handler a kit registered without an owner names the piece whose kit it is', () => {
  const kit = () => ({ install(/** @type {ShBattle} */ b) {
    b.on('tick', () => { throw new Error('boom'); });
    b.every(1, () => { throw new Error('beat'); });
  } });
  const { c, w, b } = match({ siege: { factory: kit, chess: true }, texas: { factory: () => ({}), chess: true } });
  step(w, c, [DEPLOY.siege]);
  for (let i = 0; i < 40; i++) step(w, c);
  assert.ok(b.errors.length > 2);
  assert.deepEqual([...new Set(b.errors.map((e) => `${e.label}|${e.who}`))].sort(), ['every|siege', 'hook:tick|siege']);
});

/**
 * siege on the field with the buffs `give` adds at her deployment, and an enemy to hit her with.
 * @param {(b: ShBattle, u: ShUnit) => void} give
 */
function judged(give) {
  const kit = () => ({ install(/** @type {ShBattle} */ b, /** @type {ShUnit} */ u) { b.on('deploy', () => give(b, u), { owner: u }); } });
  const m = match({ siege: { factory: kit, chess: true } }, ['siege']);
  step(m.w, m.c, [DEPLOY.siege]);
  return { ...m, p: piece(m.b, 'siege'), e: enemy(m.b, m.w, m.c) };
}

/** True damage from an enemy to siege, at once; the HP it took. @param {{ b: ShBattle, p: ShUnit, e: ShUnit }} m @param {number} amount @param {Record<string, unknown>} [more] */
function hit(m, amount, more = {}) {
  const before = m.p.hp;
  m.b.dealDamage({ source: m.e, target: m.p, amount, type: 'true', ...more });
  return Math.round((before - m.p.hp) * 1e6) / 1e6;
}

test('[兼容-4] a kit buff’s 伤判 callbacks run in its turn: injury may change the amount; of the reductions under one name only the strongest counts, other names add; observeInjury sees what is left', () => {
  /** @type {unknown[][]} */
  const seen = [];
  const m = judged((b, u) => {
    b.addBuff(u, { key: 'kit:half', injury(/** @type {any} */ c) { c.amount *= 0.5; } });
    b.addBuff(u, { key: 'kit:weak', damageReduction: { true: 100 }, reductionGroup: 'g' });
    b.addBuff(u, { key: 'kit:strong', damageReduction: { true: 300 }, reductionGroup: 'g' });
    b.addBuff(u, { key: 'kit:other', damageReduction: { true: 50, phys: 9 } });
    b.addBuff(u, { key: 'kit:watch', observeInjury(/** @type {any} */ c) { seen.push([c.amount, c.cancelled, c.outcome, c.type, c.source?.kind, c.target === u, c.buff.key]); } });
  });
  assert.equal(hit(m, 2000), 650, '2000 × 0.5 − 300 − 50');
  assert.deepEqual(seen, [[650, false, null, 'true', 'enemy', true, 'kit:watch']]);
  assert.deepEqual(m.b.errors, []);
});

test('[兼容-4] an injury callback may dodge or block the hit: nothing is taken, a dodge is the engine’s dodge event, the buffs after it only observe; a hit that cannot be dodged is not', () => {
  /** @type {unknown[][]} */
  const seen = [];
  let dodges = 0, how = 'dodge';
  const m = judged((b, u) => {
    b.addBuff(u, { key: 'kit:evade', injury(/** @type {any} */ c) { if (how === 'dodge') c.dodge(); else c.block(); } });
    b.addBuff(u, { key: 'kit:after', injury(/** @type {any} */ c) { c.amount = 0; seen.push(['injury']); }, observeInjury(/** @type {any} */ c) { seen.push([c.amount, c.cancelled, c.outcome]); } });
  });
  m.b.on('dodge', () => { dodges++; });
  assert.equal(hit(m, 500), 0);
  assert.equal(dodges, 1);
  how = 'block';
  assert.equal(hit(m, 500), 0);
  assert.equal(dodges, 1, 'a block is not a dodge');
  how = 'dodge';
  assert.equal(hit(m, 500, { canDodge: false }), 0, 'not dodged: the next buff takes it all');
  assert.deepEqual(seen, [[0, true, 'dodged'], [0, true, 'blocked'], ['injury'], [0, false, 'zero']]);
  assert.deepEqual(m.b.errors, []);
});

test('[兼容-4] a kit buff’s shield layers are the engine’s; the used-up one goes and its onRemove runs; a higher injuryPriority goes first; a callback that throws is recorded and the hit goes on', () => {
  /** @type {string[]} */
  const order = [];
  let removed = 0;
  const m = judged((b, u) => {
    b.addBuff(u, { key: 'kit:first', injury() { order.push('first'); } });
    b.addBuff(u, { key: 'kit:urgent', injuryPriority: 10, injury() { order.push('urgent'); throw new Error('boom'); } });
  });
  assert.equal(hit(m, 300), 300);
  assert.deepEqual(order, ['urgent', 'first']);
  assert.deepEqual(m.b.errors.map((e) => [e.label, e.who, e.message]), [['buff.injury', 'siege', 'boom']]);
  m.b.addBuff(m.p, { key: 'kit:layer', shieldHits: 1, onRemove() { removed++; } });
  assert.equal(m.p.findBuff('kit:layer')?.shieldHits, 1);
  assert.equal(hit(m, 300), 0, 'the layer takes the hit');
  assert.equal(m.p.hasBuff('kit:layer'), false);
  assert.equal(removed, 1);
  assert.equal(hit(m, 300), 300);
});

test('[兼容-4] an empty shield that stays is not carried yet: the buff is given and the gap is recorded once for the unit and key', () => {
  const m = judged((b, u) => { for (let i = 0; i < 3; i++) b.addBuff(u, { key: 'kit:armor', shield: 50, keepEmptyShield: true, mods: { defPct: 0.1 }, duration: 20 }); });
  assert.deepEqual(m.b.errors.map((e) => [e.label, e.who, e.message]), [['buff.keepEmptyShield', 'siege', 'compat: buff.keepEmptyShield is not provided yet (buff kit:armor)']]);
  assert.ok(m.p.hasBuff('kit:armor'));
});

test('[兼容-4] pushDistance is the distance the engine’s push takes an enemy on open ground; 0 for one that cannot be displaced or a force its weight takes away', () => {
  const { c, w, b } = match({ siege: { factory: () => ({}), chess: true } }, ['siege']);
  const e = enemy(b, w, c), x0 = e.x, y0 = e.y;
  const want = b.pushDistance(e, 1);
  assert.ok(want > 1 && b.pushDistance(e, 3) > want && b.pushDistance(e, 0) < want);
  assert.ok(b.pushDistance(e, 0, { effect: true }) < b.pushDistance(e, 0), 'an effect’s push moves from the next frame');
  assert.equal(b.pushDistance(e, -5), 0, 'weight takes the force away');
  assert.ok(Math.abs(b.push(e, 1, { from: { x: x0 - 1, y: y0 } }) - want) < 1e-9, 'push returns the tiles it moves it: on open ground the distance it says (the wall and the edge: compat-events.test.js)');
  for (let i = 0; i < 300 && /** @type {any} */ (e.u).slide; i++) step(w, c);
  assert.ok(Math.abs(Math.hypot(e.x - x0, e.y - y0) - want) < 1e-9, `moved ${Math.hypot(e.x - x0, e.y - y0)}, said ${want}`);
  assert.equal(b.pushDistance(piece(b, 'siege'), 1), 0, 'not an enemy');
});

test('[兼容-4] pull: the enemy is dragged toward the point and stops short of the puller; the distance returned is the way to the stop (推断 INF-1091); none for what a pull does not take', () => {
  const { c, w, b } = match({ siege: { factory: () => ({}), chess: true } }, ['siege']);
  const e = enemy(b, w, c), x0 = e.x, y0 = e.y;
  const puller = { x: x0 + 2, y: y0, side: 'ally' };
  const goes = b.pull(e, 1, { to: { x: x0 + 3, y: y0 }, center: puller });
  assert.ok(Math.abs(goes - (2 - 0.6708)) < 1e-9, `${goes}`);
  assert.ok(/** @type {any} */ (e.u).slide?.pull, 'a pull is under way');
  for (let i = 0; i < 300 && /** @type {any} */ (e.u).slide; i++) step(w, c);
  assert.ok(Math.abs(Math.hypot(e.x - x0, e.y - y0) - goes) < 0.05, `moved ${Math.hypot(e.x - x0, e.y - y0)}, said ${goes}`);
  assert.equal(b.pull(e, 1, { center: puller }), 0, 'no point: nothing');
  assert.equal(b.pull(e, -9, { to: { x: e.x + 2, y: e.y } }), 0, 'a force its weight takes away');
  assert.equal(b.pull(piece(b, 'siege'), 1, { to: { x: 1, y: 1 } }), 0, 'not an enemy');
});

test('[兼容-4] pullToFront drags an enemy to the front of an ally, half a tile ahead; an enemy the ally blocks is not pulled', () => {
  const { c, w, b } = match({ siege: { factory: () => ({}), chess: true } }, ['siege']);
  step(w, c, [DEPLOY.siege]);
  const e = enemy(b, w, c), p = piece(b, 'siege');
  assert.equal(p.alive, true);
  const goes = b.pullToFront(e, p, 1);
  assert.ok(goes > 0 && /** @type {any} */ (e.u).slide?.pull);
  const pull = /** @type {any} */ (e.u).slide.pull;
  assert.deepEqual([pull.x, pull.y, pull.bx, pull.by], [p.x + p.fwd[1] * 0.5, p.y + p.fwd[0] * 0.5, p.x, p.y]);
  assert.equal(b.pullToFront(e, /** @type {any} */ (null), 1), 0);
  // an enemy she blocks already stands in front of her
  for (let i = 0; i < 600 && e.blockedBy !== p; i++) step(w, c);
  assert.equal(e.blockedBy, p, 'blocked');
  assert.equal(b.pullToFront(e, p, 3), 0);
});

test('[兼容-4] onOwnBoard: a tile of the field a player may deploy on, for a player that is there; spawnEnemy is a named gap', () => {
  const { c, w, b } = match({ siege: { factory: () => ({}), chess: true } }, ['siege']);
  step(w, c);
  const player = b.getPlayer(0);
  assert.equal(b.onOwnBoard(player, 1, 3), true, 'a road tile');
  assert.equal(b.onOwnBoard(player, 2, 2), true, 'a high tile');
  assert.equal(b.onOwnBoard(player, 0, 0), false, 'floor');
  assert.equal(b.onOwnBoard(player, 9, 9), false, 'off the map');
  assert.equal(b.onOwnBoard(null, 1, 3), false, 'no player');
  assert.throws(() => b.spawnEnemy(), (e) => e instanceof CompatGap && e.what === 'battle.spawnEnemy');
});

test('[兼容-5] bardRegen gives an ally the bard’s regeneration for half a second, one buff for each bard; the event lets a handler change the share', () => {
  const { c, w, b } = match({ siege: { factory: () => ({}), chess: true }, texas: { factory: () => ({}), chess: true } });
  step(w, c, [DEPLOY.siege, DEPLOY.texas]);
  const bard = piece(b, 'siege'), ally = piece(b, 'texas');
  bardRegen(b, bard, ally, 12);
  bardRegen(b, bard, ally, 12);
  const mine = () => ally.buffs.filter((x) => x.key === `trait:bard:${bard.id}`);
  assert.equal(mine().length, 1, 'a second give of the same bard replaces the first');
  assert.deepEqual([mine()[0].mods, mine()[0].timeLeft], [{ hpRegen: 12 }, 0.5]);
  assert.equal(/** @type {any} */ (ally.u).buffs.some((/** @type {any} */ x) => x.key.startsWith('trait:bard:')), true);
  bardRegen(b, ally, bard, 7, 2);
  assert.deepEqual(bard.buffs.filter((x) => x.key.startsWith('trait:bard:')).map((x) => [x.mods, x.timeLeft]), [[{ hpRegen: 7 }, 2]], 'its own duration');
  b.on('bardRegen', (ctx) => { ctx.value *= 2; });
  bardRegen(b, bard, ally, 12);
  assert.deepEqual(mine()[0].mods, { hpRegen: 24 }, 'a handler doubled the share');
  b.on('bardRegen', (ctx) => { ctx.value = 0; });
  bardRegen(b, ally, bard, 9);
  assert.deepEqual(bard.buffs.filter((x) => x.key === `trait:bard:${ally.id}`).map((x) => [x.mods, x.timeLeft]), [[{ hpRegen: 7 }, 2]], 'a share of 0 gives nothing: the earlier one stands');
  bardRegen(b, bard, ally, 0);
  bardRegen(b, bard, null, 5);
  assert.equal(mine()[0].mods.hpRegen, 24, 'nothing for a value of 0 or no ally');
  assert.deepEqual(b.errors, []);
});

test('[兼容-5] attackCountdown ends a cooldown of whole frames on its frame; aggroCmp orders by taunt level, then the later deployment first', () => {
  let cd = 1;
  for (let i = 0; i < 30; i++) cd = attackCountdown(cd, 1 / 30);
  assert.equal(cd, 0, 'one second in thirty steps');
  assert.ok(Math.abs(attackCountdown(0.5, 0.2) - 0.3) < 1e-12, 'a cooldown that goes on');
  const { c, w, b } = match({ siege: { factory: () => ({}), chess: true }, texas: { factory: () => ({}), chess: true } });
  step(w, c, [DEPLOY.siege]);
  for (let i = 0; i < 5; i++) step(w, c);
  step(w, c, [DEPLOY.texas]);
  const a = piece(b, 'siege'), z = piece(b, 'texas');
  assert.ok(z.aggroSeq > a.aggroSeq);
  assert.ok(aggroCmp(a, z) > 0 && aggroCmp(z, a) < 0, 'the later one first');
  const stats = (/** @type {number} */ taunt) => ({ s: { taunt }, aggroSeq: 0 });
  assert.ok(aggroCmp(stats(1), z) < 0, 'a higher taunt level first, whenever it was deployed');
  assert.ok(aggroCmp(stats(-1), z) > 0);
  assert.equal(aggroCmp({}, {}), 0);
});
