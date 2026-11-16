// Stronghold v0.3.2's settlement surface through the compat layer (docs/spec/compat.md 兼容-2, 兼容-4): the helpers its
// kits import from server/sim/attack.js, and the battle's request forms of damage, heal and 生命流失, element damage and
// recovery, the share of an HP hit set aside for a transfer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step } from '@aue/sim';
import { kitsWorld } from '../src/compat/kits.js';
import { CompatGap } from '../src/compat/sh/gap.js';
import * as attack from '../src/compat/sh/attack.js';

/** @typedef {import('../src/compat/battle.js').ShBattle} ShBattle */

/**
 * The tiny level with one 近卫 whose kit is `install`, deployed, and the first slime on the field.
 * @param {(b: ShBattle, u: any) => void} install
 */
function field(install) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies.slime.maxHp = 4000;
  c.decks = [['guard']];
  const box = /** @type {{ b: any }} */ ({ b: null });
  const kit = () => ({ skills: {}, install });
  c.behaviors = { world: kitsWorld({ guard: { def: { name: 'guard', skill: null, raw: {} }, factory: kit } }, (x) => { box.b = x; }) };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 3, dir: 2 }]]);
  for (let i = 0; i < 60 && !w.units.some((u) => u.key === 'slime'); i++) step(w, c);
  const b = /** @type {ShBattle} */ (box.b), find = (/** @type {string} */ k) => b.unitOf(/** @type {any} */ (w.units.find((u) => u.key === k)));
  return { w, c, b, g: find('guard'), e: find('slime') };
}

test('[兼容-2] attack.js helpers: how a hit is applied, its 攻击类型 and dodge mode, a cancel it may refuse, a burst', () => {
  assert.deepEqual([{ isProjectile: true }, { isAttack: true }, {}, { applyWay: 'ALL', isAttack: true }].map(attack.damageApplyWay), ['RANGED', 'MELEE', 'NONE', 'ALL']);
  assert.deepEqual([{ isSplash: true }, { tags: ['dot'] }, { tags: ['apoptosis'] }, {}, { attackType: 'ADDITION', isSplash: true }].map(attack.damageAttackType),
    ['SPLASH', 'BUFF', 'BUFF', 'NORMAL', 'ADDITION']);
  assert.deepEqual([{}, { canDodge: false }, { dodgeMode: 'uncancellable' }, { ignoreCancelReasons: ['dodge'] }].map(attack.damageDodgeMode),
    ['normal', 'ignore', 'uncancellable', 'uncancellable']);
  const plain = /** @type {Record<string, any>} */ ({}), sure = /** @type {Record<string, any>} */ ({ ignoreCancelReasons: ['dodge', 'block', 'miss'] });
  assert.deepEqual([attack.cancelDamage(plain, 'block'), plain.cancel, attack.cancelDamage(sure, 'miss'), sure.cancel, sure.missed], [true, true, false, undefined, true]);
  assert.deepEqual([attack.burstLocked({ s: { flags: { burstLock: true } } }), attack.burstLocked({ s: null }), attack.burstLocked(null)], [true, false, false]);
  assert.throws(() => attack.attackInput(), (e) => e instanceof CompatGap && e.what === 'attack.attackInput');
});

test('[兼容-2] reserveTransfer: a share of what the first transfer saw, at most what is left, once a tag', () => {
  const ctx = /** @type {any} */ ({ amount: 100 }), f = () => {};
  assert.deepEqual([attack.reserveTransfer(ctx, 0.3, 'a', f), attack.reserveTransfer(ctx, 0.3, 'a', f), attack.reserveTransfer(ctx, 0.9, 'b', f), ctx.amount], [30, 0, 70, 0]);
  assert.equal(attack.reserveTransfer({ amount: 0 }, 1, 'a', f), 0);
});

test('[兼容-4] v0.3.2 requests: damage credited with no source, a typed 生命流失, a heal; a credit beside a source is a gap', () => {
  const kills = /** @type {string[]} */ ([]), heals = /** @type {any[]} */ ([]), go = { now: false };
  const { w, c, b, g, e } = field((bb, u) => {
    bb.on('kill', (k) => kills.push(`${k.killer?.defId}>${k.victim.defId}`), { owner: u });
    bb.on('heal', (k) => heals.push(k.opts), { owner: u });
    bb.on('tick', () => { if (go.now) { go.now = false; bb.dealDamage({ source: null, credit: u, target: bb.enemies[0], amount: 99999, type: 'true' }); } }, { owner: u });
  });
  assert.equal(b.dealDamage({ source: null, credit: g, target: e, amount: 100, type: 'phys' }), 90, 'no source: its multipliers do not apply');
  assert.equal(b.dealDamage(null, e, { amount: 50, type: 'arts' }, { credit: g }), 50, 'positional, opts.credit');
  assert.throws(() => b.dealDamage({ source: g, credit: null, target: e, amount: 1 }), (x) => x instanceof CompatGap && x.what === 'attack.credit');
  assert.equal(b.dealHPLose({ target: g, amount: 200, type: 'phys' }), 100, 'phys: DEF 100 first');
  assert.equal(b.dealHPLose(g, 50), 50, 'positional: true by default');
  assert.equal(b.loseHp(g, 30, { type: 'arts' }), 30, 'RES 0');
  assert.throws(() => b.dealHPLose({ target: g, amount: 1, type: 'element' }), TypeError);
  assert.deepEqual([b.heal({ source: null, target: g, amount: 10, mode: 'regen' }), heals.at(-1)], [10, { mode: 'regen' }]);
  go.now = true;
  step(w, c);
  step(w, c);
  assert.deepEqual(kills, ['guard>slime'], 'the kill is the credited unit’s');
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] element damage and recovery by Stronghold’s element names; its gauge maximum', () => {
  const { b, g, e } = field(() => {});
  assert.equal(b.dealElementDamage({ source: g, target: e, element: 'burn', amount: 300 }), 300);
  assert.equal(/** @type {any} */ (e.u).ep.FIRE, 700);
  /** @type {any} */ (g.u).ep = { FIRE: 400, WATER: 800 };
  assert.equal(b.healElement({ target: g, amount: 100 }), 200, 'each element by the amount');
  assert.equal(b.reduceElement(g, 1000, 'burn'), 500, 'only the one named, up to the maximum');
  assert.deepEqual(/** @type {any} */ (g.u).ep, { WATER: 900 }, 'at the maximum it is gone');
  assert.equal(b.healElement(g, 10, 'neural'), 0, 'none of that element');
  assert.equal(g.gaugeMax, 1000);
  assert.deepEqual(b.errors, []);
});

test('[兼容-4] hpDamage: a share set aside goes after every handler, with the hit’s tags and its own; _hooks reads the bus', () => {
  const sent = /** @type {any[]} */ ([]), seen = /** @type {any[]} */ ([]);
  const { b, g, e } = field((bb, u) => {
    bb.on('hpDamage', (k) => { if (k.target === u) attack.reserveTransfer(k, 0.5, 'share', (/** @type {number} */ n, /** @type {string[]} */ t) => sent.push([n, t])); }, { owner: u });
    bb.on('hpDamage', (k) => { if (k.target === u) seen.push(k.amount); }, { owner: u, priority: -1 });
    bb.on('hit', (k) => { if (k.target === e) seen.push([k.dmg.canDodge, k.dmg.noDodgeCancel]); }, { owner: u });
  });
  const hp = g.hp;
  assert.equal(b.dealDamage(null, g, { amount: 400, type: 'true', tags: ['probe'] }), 200);
  assert.deepEqual([g.hp, sent], [hp - 200, [[200, ['probe', 'share']]]]);
  assert.deepEqual(seen, [200], 'later handlers see what is left');
  b.dealDamage({ source: g, target: e, amount: 1, dodgeMode: 'ignore' });
  b.dealDamage({ source: g, target: e, amount: 1, ignoreCancelReasons: ['dodge'] });
  assert.deepEqual(seen.slice(1), [[false, undefined], [undefined, true]], 'dodge modes as the engine’s');
  assert.deepEqual([b._hooks.hpDamage, b._hooks.block], [true, undefined]);
  assert.deepEqual(b.errors, []);
});
