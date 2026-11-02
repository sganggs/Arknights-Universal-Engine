// A burst's damage and the target's dodges (docs/spec/elements.md 元素-3, 元素-4): it goes through the 伤判 as any hit of
// its type — on a character 侵蚀's physical and 灼燃's / 凋亡's arts are dodged by the dodge of their type (物理闪避, 法术闪避,
// 近战物理闪避; one 伤判 effect that dodges both, like 老鲤 S3's or 赤刃明霄陈's, takes its turn among the others), 神经's
// and 狂躁's true damage and the other units' 元素伤害 by none —; the source's 命中率 and 无视物理闪避 do not count, the hit
// having no source; a dodge takes the damage alone and is a dodge like any other; the `hit` event shows the hit as
// dodgeable as an attack's; 元素损伤 itself is no hit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, bus } from '../src/index.js';
import { dealEp, epOf, bursting } from '../src/elements.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { makeBuff, addBuff } from '../src/buffs.js';
import { statsOf } from '../src/attrs.js';
import { dealDamage } from '../src/damage.js';
import { draw } from '../src/rng.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */
/** @typedef {import('../src/elements.js').Element} Element */

/**
 * The tiny level without waves: the guard (防御 100, 法术抗性 0, a million HP) deployed at (1, 1) facing right, and a rooted
 * slime (防御 10, a million HP) at (1, 4), out of its range. Returns the world, content, guard and slime.
 * @param {(c: any) => void} [tweak]
 */
function arena(tweak) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [];
  c.operators.guard.maxHp = 1e6;
  c.enemies.slime.maxHp = 1e6;
  tweak?.(c);
  const w = createWorld(c, { seed: 7, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const guard = /** @type {Unit} */ (w.units[0]), slime = makeEnemy(w, c, { key: 'slime', route: 0 });
  slime.x = 4; slime.y = 1;
  applyStatus(slime, 'root', {});
  w.units.push(slime);
  return { w, c, guard, slime };
}

/** Gives a unit a dodge buff with these chances (伤害-8, 伤害-12). @param {Unit} u @param {Record<string, number>} mods @param {number} [prio] */
const evade = (u, mods, prio = 0) => { addBuff(u, makeBuff({ key: 'test:evade', prio, mods })); };
/** The HP a unit lost while `f` ran. @param {Unit} u @param {() => void} f */
const lost = (u, f) => { const hp = u.hp; f(); return hp - u.hp; };
/** Runs n frames. @param {World} w @param {any} c @param {number} n */
const run = (w, c, n) => { for (let i = 0; i < n; i++) step(w, c); };
/** Every dodge event on a unit: [source id or −1, type, sourceless]. @param {World} w @param {Unit} u */
function dodges(w, u) {
  /** @type {any[]} */
  const out = [];
  bus.on(w, 'dodge', (k) => { if (k.target === u) out.push([k.source ? k.source.id : -1, k.dmg.type, k.dmg.sourceless === true]); });
  return out;
}

test('[元素-3] [元素-4] [伤害-8] on a character 侵蚀\'s 800 physical is dodged by 物理闪避 and 灼燃\'s 1200 arts by 法术闪避, each by its own type\'s only', () => {
  /** @type {[Element, number, string][]} */
  const kinds = [['WATER', 800, 'phys'], ['FIRE', 1200, 'arts']];
  for (const [el, dmg, type] of kinds) {
    for (const key of ['dodgePhys', 'dodgeArts']) {
      const { w, guard } = arena();
      evade(guard, { [key]: 1 });
      const own = (key === 'dodgePhys') === (type === 'phys');
      assert.equal(lost(guard, () => dealEp(w, guard, el, 1000)), own ? 0 : dmg, `${el} under ${key}`);
      assert.ok(bursting(guard), `${el} under ${key}: the burst goes on`);
    }
  }
});

test('[元素-3] [元素-4] [职业-26] a dodged burst hit is a dodge like any: the dodge event without a source, one more on the dodges tracker; the burst and its other effects stay', () => {
  const { w, c, guard, slime } = arena((k) => { k.operators.guard.res = 50; });
  evade(guard, { dodgePhys: 1, dodgeArts: 1 });
  addBuff(guard, makeBuff({ key: 'dodges', src: guard.id, n: 0 }));
  const seen = dodges(w, guard);
  dealEp(w, guard, 'WATER', 1000, slime);
  assert.equal(statsOf(guard).def, 0, '侵蚀\'s −100 stays');
  assert.equal(guard.buffs.find((b) => b.key === 'erosion')?.stacks, 1);
  assert.equal(guard.buffs.find((b) => b.key === 'burst:WATER')?.left, 300, 'the 10 s burst and its lock');
  assert.equal(dealEp(w, guard, 'FIRE', 1000, slime), 0, 'locked');
  assert.deepEqual(seen, [[-1, 'phys', true]], 'no source in the event, as for every 无来源 hit');
  assert.equal(guard.buffs.find((b) => b.key === 'dodges')?.n, 1);
  run(w, c, 300);
  assert.ok(!bursting(guard));
  assert.equal(lost(guard, () => dealEp(w, guard, 'FIRE', 1000, slime)), 0);
  assert.equal(statsOf(guard).res, 30, '灼燃\'s −20 for the burst');
  assert.deepEqual(seen, [[-1, 'phys', true], [-1, 'arts', true]]);
  assert.equal(guard.buffs.find((b) => b.key === 'dodges')?.n, 2);
});

test('[元素-3] [元素-4] 神经\'s 1000 and 狂躁\'s X a second are true damage: no dodge takes them, and no draw is made; the stun stays', () => {
  const all = { dodgePhys: 1, dodgeArts: 1, dodgeMelee: 1 };
  const { w, guard } = arena();
  evade(guard, all);
  const r = w.rng;
  assert.equal(lost(guard, () => dealEp(w, guard, 'SANITY', 1000)), 1000);
  assert.equal(w.rng, r);
  assert.equal(guard.buffs.find((b) => b.key === 'stun')?.left, 300);
  const a = arena();
  evade(a.guard, all);
  dealEp(a.w, a.guard, 'ANGER', 1000);
  const r2 = a.w.rng;
  assert.equal(lost(a.guard, () => run(a.w, a.c, 60)), 200, 'two seconds of X = 100: no attack made');
  assert.equal(a.w.rng, r2);
});

test('[元素-4] [状态-9] 凋亡 on a character under 法术闪避: each second\'s 100 arts is dodged, its SP still lost, 阻回 and 静默 there', () => {
  const { w, c, guard } = arena((k) => {
    k.operators.guard.skill = { id: 's', type: 'MANUAL', sp: 'time', cost: 30, init: 20, charges: 1, duration: 0, ammo: false, bb: {} };
  });
  evade(guard, { dodgeArts: 1 });
  const seen = dodges(w, guard), st = /** @type {any} */ (guard.skill);
  const hp = guard.hp;
  dealEp(w, guard, 'DARK', 1000);
  run(w, c, 449);
  assert.ok(statsOf(guard).flags.noSp && statsOf(guard).flags.mute);
  run(w, c, 1);
  assert.equal(hp - guard.hp, 0);
  assert.deepEqual(seen, Array.from({ length: 15 }, () => [-1, 'arts', true]), 'one a second');
  assert.equal(st.sp, 5, 'one SP lost each second all the same');
  const p = arena();
  evade(p.guard, { dodgePhys: 1, dodgeMelee: 1 });
  dealEp(p.w, p.guard, 'DARK', 1000);
  assert.equal(lost(p.guard, () => run(p.w, p.c, 60)), 200, 'a physical dodge lets the arts through');
});

test('[元素-3] [伤害-12] [伤害-8] 侵蚀\'s 800 is no projectile\'s: 近战物理闪避 dodges it too; the burst\'s source counts neither its 无视物理闪避 nor its 命中率, the hit having none', () => {
  const m = arena();
  evade(m.guard, { dodgeMelee: 1 });
  assert.equal(lost(m.guard, () => dealEp(m.w, m.guard, 'WATER', 1000)), 0);
  const f = arena();
  evade(f.guard, { dodgeMelee: 1 });
  assert.equal(lost(f.guard, () => dealEp(f.w, f.guard, 'FIRE', 1000)), 1200, 'physical only');
  const i = arena();
  addBuff(i.slime, makeBuff({ key: 'test:pierce', flags: { ignoreDodgePhys: true } }));
  evade(i.guard, { dodgePhys: 1 });
  assert.equal(dealDamage(i.w, i.slime, i.guard, { type: 'phys', amount: 500 }), 400, 'its own hit ignores the dodge');
  assert.equal(lost(i.guard, () => dealEp(i.w, i.guard, 'WATER', 1000, i.slime)), 0, 'the burst it set off is dodged');
  const h = arena();
  addBuff(h.slime, makeBuff({ key: 'test:blind', mods: { hitRateMul: 0 } }));
  assert.equal(dealDamage(h.w, h.slime, h.guard, { type: 'phys', amount: 500 }), 0, 'its own hit misses');
  const r = h.w.rng;
  assert.equal(lost(h.guard, () => dealEp(h.w, h.guard, 'WATER', 1000, h.slime)), 800, 'the burst it set off does not');
  assert.equal(h.w.rng, r, 'no draw for a 命中率');
});

test('[元素-3] [伤害-8] a burst hit\'s dodge is one draw against the buff\'s chance: dodged exactly when the draw is below it', () => {
  for (const p of [0.3, 0.7]) {
    const { w, guard } = arena();
    evade(guard, { dodgePhys: p });
    let n = 0;
    for (let k = 0; k < 40; k++) {
      const below = draw({ rng: w.rng }) < p;
      assert.equal(lost(guard, () => dealEp(w, guard, 'WATER', 1000)), below ? 0 : 800, `p ${p}, burst ${k}`);
      if (below) n++;
      guard.buffs = guard.buffs.filter((b) => !b.key.startsWith('burst:'));
      guard.ep = {};
    }
    assert.ok(n > 0 && n < 40, `p ${p}: ${n} of 40 dodged`);
  }
});

test('[元素-3] [伤害-8] a burst hit takes the target\'s 伤判 effects in their order: a barrier ahead of the dodge absorbs first, a dodge ahead of the barrier leaves it whole', () => {
  const late = arena();
  addBuff(late.guard, makeBuff({ key: 'test:wall', shield: 500, mods: { defFlat: 0 } }));
  evade(late.guard, { dodgePhys: 1, dodgeArts: 1 }, -1000);
  assert.equal(lost(late.guard, () => dealEp(late.w, late.guard, 'FIRE', 1000)), 0);
  assert.equal(late.guard.buffs.find((b) => b.key === 'test:wall')?.shield, 0, '500 of the 1200 went into the barrier first');
  const early = arena();
  addBuff(early.guard, makeBuff({ key: 'test:wall', shield: 500, mods: { defFlat: 0 } }));
  evade(early.guard, { dodgePhys: 1, dodgeArts: 1 }, 1000);
  assert.equal(lost(early.guard, () => dealEp(early.w, early.guard, 'FIRE', 1000)), 0);
  assert.equal(early.guard.buffs.find((b) => b.key === 'test:wall')?.shield, 500);
});

test('[元素-4] [伤害-8] the other column\'s 元素伤害 meets no dodge: an enemy with 物理和法术闪避 takes 6000, 5000, 7000 and 800 a second, without a draw', () => {
  const all = { dodgePhys: 1, dodgeArts: 1, dodgeMelee: 1 };
  /** @type {[Element, number][]} */
  const kinds = [['SANITY', 6000], ['WATER', 5000], ['FIRE', 7000]];
  for (const [el, dmg] of kinds) {
    const { w, guard, slime } = arena();
    evade(slime, all);
    const r = w.rng;
    assert.equal(lost(slime, () => dealEp(w, slime, el, 1000, guard)), dmg, el);
    assert.equal(w.rng, r, `${el}: no draw`);
  }
  const { w, c, guard, slime } = arena();
  evade(slime, all);
  dealEp(w, slime, 'DARK', 1000, guard);
  assert.equal(lost(slime, () => run(w, c, 60)), 1600);
});

test('[元素-2] 元素损伤 is no hit: a unit with every dodge takes it in full and without a draw, and bursts as before', () => {
  const all = { dodgePhys: 1, dodgeArts: 1, dodgeMelee: 1 };
  const { w, guard, slime } = arena();
  evade(guard, all);
  evade(slime, all);
  const r = w.rng;
  assert.deepEqual([dealEp(w, guard, 'FIRE', 400, slime), dealEp(w, slime, 'WATER', 250, guard)], [400, 250]);
  assert.equal(w.rng, r);
  assert.deepEqual([epOf(guard, 'FIRE'), epOf(slime, 'WATER')], [600, 750]);
  assert.equal(dealEp(w, guard, 'FIRE', 600, slime), 600);
  assert.ok(bursting(guard), 'it bursts; the burst\'s hit is what the dodge takes');
  assert.equal(epOf(guard, 'FIRE'), 0);
});

test('[元素-3] [钩子-3] the `hit` event shows a burst\'s hit as dodgeable as an attack\'s hit (the same `canDodge`), so a `hit` handler\'s own dodge, as a kit\'s, takes the two alike', () => {
  const { w, c, guard, slime } = arena();
  slime.x = 2;
  /** @type {Map<string, boolean | undefined>} */
  const seen = new Map();
  bus.on(w, 'hit', (k) => {
    if (k.source === guard) seen.set('attack', k.dmg.canDodge);
    else if (k.source === null && k.target === guard) seen.set('burst', k.dmg.canDodge);
  });
  for (let i = 0; i < 90 && !seen.has('attack'); i++) step(w, c);
  assert.ok(seen.has('attack'), 'the guard\'s attack hit the slime');
  dealEp(w, guard, 'WATER', 1000, slime);
  assert.ok(seen.has('burst'), 'the burst\'s hit, with no source in the event');
  assert.equal(seen.get('burst'), seen.get('attack'));
});
