// A broken deployment shield and a chance that depends on the tile ahead (docs/spec/field.md 部署-8,
// docs/spec/operators.md 干员-12, 干员-14, docs/spec/combat.md 攻击-4) on the tiny map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { createWorld, step, attackNow } from '../src/index.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { statsOf } from '../src/attrs.js';
import { dealDamage } from '../src/damage.js';
import { makeBuff, addBuff } from '../src/buffs.js';

/** @typedef {import('../src/types.js').Unit} Unit */

const RANGE = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 1, col: 0 }];
/** @param {Record<string, unknown>} [over] */
const skill = (over = {}) => ({ id: 's', type: 'MANUAL', sp: 'time', cost: 30, init: 0, charges: 1, duration: 20, ammo: false, bb: {}, ...over });

/** The tiny level, the guard carrying `rec`. @param {Record<string, unknown>} rec */
function world(rec) {
  const c = tinyContent();
  c.level.waves = [];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 9 };
  c.operators.guard = { ...c.operators.guard, cost: 0, range: RANGE, ...rec };
  return { c, w: createWorld(c, { seed: 1, players: 1 }) };
}

/** @param {import('../src/types.js').World} w @param {any} c */
function deploy(w, c) {
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  return /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
}

/** A rooted enemy with no attack and no defence. @param {any} w @param {any} c @param {number} row @param {number} col */
function foeAt(w, c, row, col) {
  const e = makeEnemy(w, c, { key: 'slime', route: 0 });
  e.x = col;
  e.y = row;
  e.base = { ...e.base, atk: 0, def: 0, maxHp: 1e6 };
  e.hp = e.maxHp = 1e6;
  applyStatus(e, 'root', {});
  w.units.push(e);
  return e;
}

/** The guard's first hit. State 12 draws about 0.288: under 0.2 it misses, at 0.5 or more it hits. @param {any} crit @param {number} row @param {number} col */
function shot(crit, row, col) {
  const { c, w } = world({ critTalents: crit });
  foeAt(w, c, row, col);
  w.rng = 12;
  const ev = step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  return ev.find((x) => x.type === 'hit' && x.id === op.id)?.damage;
}

test('[部署-8] [干员-14] three layers stack ATK and DEF to the cap and give SP; a further layer still gives SP', () => {
  const { c, w } = world({ skill: skill(), deployTalents: [{ shield: 3, break: { mods: { atkPct: 0.07, defPct: 0.07 }, max: 3, sp: 3 } }] });
  const op = deploy(w, c);
  const punch = () => dealDamage(w, null, op, { type: 'phys', amount: 1000 }, c);
  punch();
  punch();
  punch();
  const b = op.buffs.find((x) => x.key === 'shieldBreak'), s = statsOf(op);
  assert.deepEqual(b && { stacks: b.stacks, maxStacks: b.maxStacks, left: b.left }, { stacks: 3, maxStacks: 3, left: -1 });
  assert.equal(s.atk, 50 * (1 + 0.07 * 3));
  assert.equal(s.def, 100 * (1 + 0.07 * 3));
  assert.equal(op.skill && op.skill.sp, 9);
  addBuff(op, makeBuff({ key: 'deployShield', src: op.id, shieldHits: 1, tag: 'shieldBreak', n: 0 }));
  punch();
  assert.equal(op.buffs.find((x) => x.key === 'shieldBreak')?.stacks, 3);
  assert.equal(op.skill && op.skill.sp, 12);
});

test('[部署-8] [技能-2] no SP while the skill runs; a break with only SP adds no attribute buff; no cap keeps stacking', () => {
  const running = world({ skill: skill({ cost: 10, init: 10 }), deployTalents: [{ shield: 1, break: { mods: { atkPct: 0.07 }, max: 3, sp: 3 } }] });
  const busy = deploy(running.w, running.c);
  step(running.w, running.c, [[0, { type: 'skill', unit: busy.id }]]);
  dealDamage(running.w, null, busy, { type: 'phys', amount: 1000 }, running.c);
  assert.equal(busy.skill && busy.skill.sp, 0);
  assert.equal(busy.buffs.find((b) => b.key === 'shieldBreak')?.stacks, 1);
  const only = world({ skill: skill(), deployTalents: [{ shield: 1, break: { sp: 4 } }] });
  const op = deploy(only.w, only.c);
  dealDamage(only.w, null, op, { type: 'phys', amount: 1000 }, only.c);
  assert.equal(op.buffs.some((b) => b.key === 'shieldBreak'), false);
  assert.equal(op.skill && op.skill.sp, 4);
  const open = world({ deployTalents: [{ shield: 2, break: { mods: { atkPct: 0.1 }, sp: 1 } }] });
  const bare = deploy(open.w, open.c);
  dealDamage(open.w, null, bare, { type: 'phys', amount: 1000 }, open.c);
  dealDamage(open.w, null, bare, { type: 'phys', amount: 1000 }, open.c);
  assert.equal(bare.buffs.find((b) => b.key === 'shieldBreak')?.stacks, 2);
  assert.equal(statsOf(bare).atk, 50 * (1 + 0.1 * 2));
});

test('[攻击-4] [干员-12] one tile ahead raises the chance; her own tile and a tile further along do not', () => {
  const crit = [{ prob: 0.2, scale: 1.8, front: { tiles: 1, prob: 0.5 } }];
  assert.equal(shot(crit, 1, 2), 90);
  assert.equal(shot(crit, 1, 1), 50);
  assert.equal(shot(crit, 1, 3), 50);
  assert.equal(shot(crit, 2, 1), 50);
});

test('[攻击-4] [干员-12] more than one tile includes her own tile and that many ahead', () => {
  const crit = [{ prob: 0.2, scale: 1.85, front: { tiles: 2, prob: 0.55 } }];
  const hit = 50 * 1.85;
  assert.equal(shot(crit, 1, 1), hit);
  assert.equal(shot(crit, 1, 3), hit);
  assert.equal(shot(crit, 1, 4), 50);
  assert.equal(shot(crit, 2, 1), 50);
});

test('[攻击-4] no primary target keeps the original chance', () => {
  const { c, w } = world({ skill: skill({ sp: 'attack' }), critTalents: [{ prob: 0, scale: 2, front: { tiles: 1, prob: 1 }, sp: 5 }] });
  const op = deploy(w, c);
  assert.equal(attackNow(w, c, op), false);
  assert.equal(op.skill && op.skill.sp, 0);
  foeAt(w, c, 1, 2);
  assert.equal(attackNow(w, c, op), true);
  assert.equal(op.skill && op.skill.sp, 6, 'the chance gives 5 and the attack itself gives 1');
});

/** One hit while the skill runs. State 7 draws about 0.012: below 0.2, so the base chance would hit and a chance of 0 misses. @param {number} row @param {number} col */
function skilledHit(row, col) {
  const { c, w } = world({ skill: skill({ cost: 1, init: 1, duration: 30 }), critTalents: [{ prob: 0.2, scale: 2, skillProb: 0, front: { tiles: 1, prob: 1 } }] });
  const op = deploy(w, c);
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  foeAt(w, c, row, col);
  w.rng = 7;
  const ev = step(w, c);
  return ev.find((x) => x.type === 'hit' && x.id === op.id)?.damage;
}

test('[攻击-4] the front chance replaces the skill chance; off those tiles the skill chance stays', () => {
  assert.equal(skilledHit(1, 2), 100);
  assert.equal(skilledHit(2, 1), 50);
});
