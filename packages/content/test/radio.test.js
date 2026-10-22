// 神经损伤 on a recorder's hit, and from a blocked designer each second (docs/spec/foes.md 敌能-65).
// Attack values are the level-0 enemy_database figures so 20%, 15% and 20% stay readable. maxEp is a fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, elements, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const RATIO = 'attack@ep_damage_ratio';

/** @param {Record<string, Record<string, number>>} talents @param {Partial<EnemyDef>} [more] @returns {EnemyDef} */
function enemy(talents, more = {}) {
  return { name: 'e', maxHp: 1e6, atk: 400, def: 0, res: 0, moveSpeed: 0, baseAttackTime: 2, maxEp: 1e6, talents, ...more };
}

/** @param {string} key @param {EnemyDef} def */
const gaps = (key, def) => uncoveredAbilities([withFoeExtras(key, def)]);

/** @param {number} got @param {number} want */
const close = (got, want) => Math.abs(got - want) < 1e-6;

/** @param {Unit} u */
const sanity = (u) => elements.epOf(u, 'SANITY');

/**
 * The enemy spawns rooted on the guard's road tile. Incomplete talents stay on the record, so a bad shape can be seen
 * to add nothing.
 * @param {string} key @param {EnemyDef} def
 */
function fight(key, def) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [key]: withFoeExtras(key, def) };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, key)])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 8 };
  const tough = { cost: 0, maxHp: 1e6, atk: 0, def: 10000, res: 0, maxEp: 1e6 };
  Object.assign(c.operators.guard, tough);
  Object.assign(c.operators.sniper, tough);
  c.operators.g2 = { ...c.operators.guard, name: 'g2' };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = w.units.find((u) => u.kind === KIND.ENEMY);
  assert.ok(e);
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  return { c, w, e };
}

/** @param {ReturnType<typeof fight>} box @param {number} n */
function frames(box, n) {
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < n; i++) for (const x of step(box.w, box.c)) ev.push(x);
  return ev;
}

/** @param {ReturnType<typeof fight>} box @param {string} op @param {number} row @param {number} col */
function place(box, op, row, col) {
  /** @type {any[]} */
  const ev = [];
  for (const x of step(box.w, box.c, [[0, { type: 'deploy', op, row, col, dir: 0 }]])) ev.push(x);
  const u = box.w.units.find((x) => x.kind === KIND.OPERATOR && x.key === op);
  assert.ok(u);
  return { ev, u };
}

/** @param {any[]} ev @param {number} id */
const hitsOf = (ev, id) => ev.filter((x) => x.type === 'hit' && x.id === id);

/** @param {ReturnType<typeof fight>} box @param {Unit} u @param {number} quiet @param {number} more */
function dropped(box, u, quiet, more) {
  const was = sanity(u);
  frames(box, quiet);
  assert.equal(sanity(u), was);
  frames(box, more);
  return was - sanity(u);
}

test('[敌能-65] recorders are covered; designers stay refused on weakness; a bad ratio stays uncovered', () => {
  for (const key of ['enemy_10094_crstf', 'enemy_10094_crstf_2']) {
    assert.deepEqual(gaps(key, enemy({ ep: { ep_damage_ratio: 0.2 } })), [], key);
    assert.equal(FOE_EXTRAS[key], undefined, key);
  }
  const shy = enemy({ weakness: { damage_resistance: 0.8 }, block: { ep_damage_ratio: 0.15 } }, { applyWay: 'NONE' });
  const obey = enemy({ weakness: { damage_resistance: 0.8 }, block: { ep_damage_ratio: 0.2 } }, { applyWay: 'NONE' });
  assert.deepEqual(gaps('enemy_10097_crshd', shy), ['weakness']);
  assert.deepEqual(gaps('enemy_10097_crshd_2', obey), ['weakness']);
  assert.equal(FOE_EXTRAS.enemy_10097_crshd, undefined);
  assert.deepEqual(gaps('enemy_10094_crstf', enemy({ ep: {} })), ['ep']);
  assert.deepEqual(gaps('enemy_10094_crstf', enemy({ ep: { ep_damage_ratio: 0.2, el: 1 } })), ['ep']);
  assert.deepEqual(gaps('enemy_10097_crshd', enemy({ weakness: { damage_resistance: 0.8 }, block: { ep_damage_ratio: 0.15, el: 1 } }, { applyWay: 'NONE' })), ['weakness', 'block']);
});

test('[敌能-65] a recorder hit adds 20% of its current ATK as 神经损伤, on both pages', () => {
  for (const [key, atk] of /** @type {const} */ ([['enemy_10094_crstf', 350], ['enemy_10094_crstf_2', 400]])) {
    const box = fight(key, enemy({ ep: { ep_damage_ratio: 0.2 } }, { atk }));
    const { ev, u: g } = place(box, 'guard', 1, 2);
    const first = hitsOf(ev, box.e.id);
    assert.equal(first.length, 1, key);
    assert.ok(close(1e6 - sanity(g), atk * 0.2), key);
    const more = frames(box, 60);
    assert.equal(hitsOf(more, box.e.id).length, 1, key);
    assert.ok(close(1e6 - sanity(g), atk * 0.4), key);
    assert.equal(elements.epOf(g, 'DARK'), 1e6);
  }
});

test('[敌能-65] a neutral blocker takes the hit and none of the 神经损伤', () => {
  const box = fight('enemy_10094_crstf', enemy({ ep: { ep_damage_ratio: 0.2 } }, { atk: 350 }));
  const { u: g } = place(box, 'guard', 1, 2);
  assert.ok(close(1e6 - sanity(g), 70));
  g.base.neutral = true;
  const ev = frames(box, 60);
  assert.equal(hitsOf(ev, box.e.id).length, 1);
  assert.ok(close(1e6 - sanity(g), 70));
  g.base.neutral = false;
  frames(box, 60);
  assert.ok(close(1e6 - sanity(g), 140));
});

test('[敌能-65] a wrong ep blackboard hits and adds no element', () => {
  const box = fight('enemy_10094_crstf', enemy({ ep: { ep_damage_ratio: 0.2, el: 1 } }, { atk: 350 }));
  const { ev, u: g } = place(box, 'guard', 1, 2);
  assert.equal(hitsOf(ev, box.e.id).length, 1);
  assert.equal(sanity(g), 1e6);
});

test('[敌能-65] a blocked designer deals 15% or 20% ATK of 神经损伤 each second, and nothing before', () => {
  for (const [key, ratio] of /** @type {const} */ ([['enemy_10097_crshd', 0.15], ['enemy_10097_crshd_2', 0.2]])) {
    const box = fight(key, enemy({ weakness: { damage_resistance: 0.8 }, block: { ep_damage_ratio: ratio } }, { applyWay: 'NONE', baseAttackTime: 1 }));
    assert.equal(attrs.statsOf(box.e).flags.noAttack, true, key);
    frames(box, 40);
    const { ev, u: g } = place(box, 'guard', 1, 2);
    assert.equal(hitsOf(ev, box.e.id).length, 0, key);
    assert.equal(sanity(g), 1e6, key);
    assert.ok(close(dropped(box, g, 29, 1), 400 * ratio), key);
    box.e.base.atk = 1000;
    assert.ok(close(dropped(box, g, 29, 1), 1000 * ratio), `${key} current atk`);
    assert.equal(hitsOf(frames(box, 5), box.e.id).length, 0, key);
    assert.equal(elements.epOf(g, 'WATER'), 1e6);
  }
});

test('[敌能-65] nothing while unblocked; a new block and a new blocker each start a fresh second', () => {
  const box = fight('enemy_10097_crshd', enemy({ weakness: { damage_resistance: 0.8 }, block: { ep_damage_ratio: 0.15 } }, { applyWay: 'NONE', baseAttackTime: 1 }));
  const { u: far } = place(box, 'sniper', 0, 2);
  frames(box, 40);
  assert.equal(sanity(far), 1e6);
  const { u: g } = place(box, 'guard', 1, 2);
  assert.ok(close(dropped(box, g, 20, 0), 0));
  step(box.w, box.c, [[0, { type: 'retreat', unit: g.id }]]);
  frames(box, 15);
  assert.equal(sanity(far), 1e6);
  const { u: again } = place(box, 'g2', 1, 2);
  assert.ok(close(dropped(box, again, 29, 1), 60));
  assert.equal(box.e.blockedBy, again.id);
  box.e.blockedBy = far.id;
  assert.ok(close(dropped(box, far, 29, 1), 60));
  assert.equal(sanity(again), 1e6 - 60);
});

test('[敌能-65] silence and stun do not stop the second; the designer still does not attack', () => {
  const box = fight('enemy_10097_crshd_2', enemy({ weakness: { damage_resistance: 0.8 }, block: { ep_damage_ratio: 0.2 } }, { applyWay: 'NONE', baseAttackTime: 1 }));
  const { u: g } = place(box, 'guard', 1, 2);
  assert.ok(close(dropped(box, g, 29, 1), 80));
  status.applyStatus(box.e, 'silence', { seconds: 30 });
  status.applyStatus(box.e, 'stun', { seconds: 30 });
  assert.equal(attrs.statsOf(box.e).flags.silence, true);
  assert.equal(attrs.statsOf(box.e).flags.stun, true);
  assert.equal(box.e.blockedBy, g.id);
  const ev = frames(box, 30);
  assert.equal(hitsOf(ev, box.e.id).length, 0);
  assert.ok(close(1e6 - sanity(g), 160));
});

test('[敌能-65] 敌能-38 enemies are unchanged', () => {
  const slide = enemy({ epdamage: { [RATIO]: 0.15 } });
  assert.equal(withFoeExtras('enemy_1148_dssbr', slide).talents?.epdamage?.el, 1);
  assert.deepEqual(gaps('enemy_1148_dssbr', slide), []);
  const tide = enemy({ EpDamage: { [RATIO]: 0.8 } }, { dmgType: 'arts' });
  assert.equal(withFoeExtras('enemy_1161_tidmag', tide).talents?.EpDamage?.el, 2);
  assert.equal(withFoeExtras('enemy_1161_tidmag', tide).talents?.EpDamage?.cross, 1);
  assert.deepEqual(gaps('enemy_1161_tidmag', tide), []);
  assert.deepEqual(gaps('enemy_1230_bare', enemy({ EpDamage: { ep_damage_ratio: 0.8, el: 2 } })), ['EpDamage']);
  assert.equal(FOE_EXTRAS.enemy_10094_crstf, undefined);
});
