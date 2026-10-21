// Shield-break talents and a chance that rises on the tiles ahead (docs/spec/operators.md 干员-12, 干员-14,
// docs/spec/combat.md 攻击-4, docs/spec/field.md 部署-8), read from the real operators and run on the tiny map.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, damage, attrs, buffs, status } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { loadTraining, operatorAt } from '../src/index.js';
import { critPart, deployPart } from '../src/talents.js';

/** @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('../src/operators.js').Build} Build */

const E2 = /** @type {Build} */ ({ elite: 2, level: 60, potential: 1, trust: 0, skill: 0, skillLevel: 7 });
const SKILL = { id: 's', type: 'MANUAL', sp: 'time', cost: 30, init: 0, charges: 1, duration: 20, ammo: false, bb: {} };
const RANGE = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 1, col: 0 }];

/** A clause, as deployPart and critPart read it. @param {string} description @param {Record<string, number>} bb */
const clause = (description, bb) => ({ description, bb, hidden: false });

/** The guard deployed with this one deployment talent. @param {any} talent @param {any} [skill] */
function deployed(talent, skill = SKILL) {
  const c = tinyContent();
  c.level.waves = [];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99 };
  c.operators.guard = { ...c.operators.guard, cost: 0, deployTalents: [talent], skill };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  return { c, w, op: /** @type {Unit} */ (w.units.find((u) => u.key === 'guard')) };
}

/** One physical hit on the operator, absorbed by a shield layer when it still has one. @param {any} w @param {any} c @param {Unit} op */
const punch = (w, c, op) => damage.dealDamage(w, null, op, { type: 'phys', amount: 1000 }, c);

/**
 * The guard's first hit on a rooted enemy at (row, col). The draw is the state's first (随机-1): state 12 falls in
 * [0.2, 0.5), so a 20 % chance misses and a front chance of 50 % or more hits.
 * @param {any} crit @param {number} row @param {number} col
 */
function shot(crit, row, col) {
  const c = tinyContent();
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99 };
  c.enemies.slime = { ...c.enemies.slime, atk: 0, def: 0, maxHp: 1e6 };
  c.operators.guard = { ...c.operators.guard, cost: 0, range: RANGE, critTalents: crit };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.owner < 0));
  e.x = col;
  e.y = row;
  e.base = { ...e.base, atk: 0, def: 0, maxHp: 1e6 };
  e.hp = 1e6;
  status.applyStatus(e, 'root', {});
  w.rng = 12;
  const ev = step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  const op = /** @type {Unit} */ (w.units.find((u) => u.key === 'guard'));
  return ev.find((x) => x.type === 'hit' && x.id === op.id)?.damage;
}

test('[干员-14] a broken layer: SP after the shield, or ATK and DEF up to max_stack_cnt, and deploy SP on another key', () => {
  const c = (/** @type {string} */ description, /** @type {Record<string, number>} */ bb) => deployPart(clause(description, bb));
  assert.deepEqual(c('部署后立即获得一层护盾，护盾破裂后获得7点技力', { sp: 7 }), { shield: 1, break: { sp: 7 } });
  assert.deepEqual(c('部署后立即获得3层护盾，每层护盾破裂时，攻击力+7%，防御力+7%且获得3点技力', { times: 3, atk: 0.07, def: 0.07, sp: 3, max_stack_cnt: 3 }),
    { shield: 3, break: { mods: { atkPct: 0.07, defPct: 0.07 }, max: 3, sp: 3 } });
  assert.deepEqual(c('部署后立即获得5点技力与一层护盾，护盾破裂后获得7点技力', { 'archet_e_t_2.sp': 5, sp: 7 }), { sp: [5, 6], shield: 1, break: { sp: 7 } });
  assert.deepEqual(c('部署后立即获得5点技力与一层护盾', { sp: 5 }), { sp: [5, 6], shield: 1 });
  assert.equal(c('部署后立即获得5点技力与一层护盾，护盾破裂后获得7点技力', { sp: 7 }), null, 'the bare sp is the break, not both');
  assert.equal(c('部署后立即获得5点技力与一层护盾', { 'a.sp': 1, 'b.sp': 2 }), null);
  assert.deepEqual(c('部署后立即获得3层护盾，每层护盾破裂时，攻击力+5%，并晕眩敌人', { times: 3, atk: 0.05 }), { shield: 3 });
  assert.equal(c('每9秒恢复一层护盾（最多3层，部署后立即获得1层）', { times: 1 }), null);
});

test('[干员-12] 「当敌人在正前方N格时」 is a front chance, and 「技能中这个几率提高到」 stays the skill chance', () => {
  const front = '攻击时，20%几率当次攻击的攻击力提升至180%。当敌人在正前方一格时，该几率提升到50%';
  assert.deepEqual(critPart(clause(front, { prob: 0.2, atk_scale: 1.8, prob2: 0.5 })), { prob: 0.2, scale: 1.8, front: { tiles: 1, prob: 0.5 } });
  assert.deepEqual(critPart(clause(front.replace('一格', '2格'), { prob: 0.2, atk_scale: 1.8, prob2: 0.5 })), { prob: 0.2, scale: 1.8, front: { tiles: 2, prob: 0.5 } });
  assert.deepEqual(critPart(clause(front, { prob: 0.2, atk_scale: 1.8 })), { prob: 0.2, scale: 1.8 });
  assert.deepEqual(critPart(clause('攻击时，10%几率当次攻击的攻击力+110%。技能中这个几率提高到30%', { prob1: 0.1, prob2: 0.3, atk: 1.1 })),
    { prob: 0.1, scale: 1, atk: 1.1, skillProb: 0.3 });
});

test('[干员-14] 年 PRO-X and 空弦, from the real data', async () => {
  const nian = await loadTraining('char_2014_nian'), archet = await loadTraining('char_332_archet');
  const at = (/** @type {any} */ t, /** @type {Partial<Build>} */ extra) => operatorAt(t, { ...E2, ...extra }).deployTalents;
  assert.deepEqual(at(nian, {}), [{ shield: 3 }]);
  assert.deepEqual(at(nian, { module: 0, moduleLevel: 1 }), [{ shield: 3 }]);
  assert.deepEqual(at(nian, { module: 0, moduleLevel: 2 }), [{ shield: 3, break: { mods: { atkPct: 0.05, defPct: 0.05 }, max: 3, sp: 2 } }]);
  assert.deepEqual(at(nian, { module: 0, moduleLevel: 3 }), [{ shield: 3, break: { mods: { atkPct: 0.07, defPct: 0.07 }, max: 3, sp: 3 } }]);
  assert.deepEqual(at(archet, {}), [{ shield: 1, break: { sp: 7 } }]);
  assert.deepEqual(at(archet, { module: 0, moduleLevel: 1 }), [{ shield: 1, break: { sp: 7 } }]);
  assert.deepEqual(at(archet, { module: 0, moduleLevel: 2 }), [{ sp: [5, 6], shield: 1, break: { sp: 7 } }]);
  assert.deepEqual(at(archet, { module: 0, moduleLevel: 3 }), [{ sp: [9, 10], shield: 1, break: { sp: 7 } }]);
});

test('[干员-12] 普罗旺斯 狩猎箭头, from the real data: one tile, and two once the module says so', async () => {
  const t = await loadTraining('char_145_prove');
  const at = (/** @type {Partial<Build>} */ extra) => operatorAt(t, { ...E2, ...extra }).critTalents;
  assert.deepEqual(at({}), [{ prob: 0.2, scale: 1.8, front: { tiles: 1, prob: 0.5 } }]);
  assert.deepEqual(at({ module: 0, moduleLevel: 1 }), [{ prob: 0.2, scale: 1.8, front: { tiles: 1, prob: 0.5 } }]);
  assert.deepEqual(at({ module: 0, moduleLevel: 2 }), [{ prob: 0.2, scale: 1.85, front: { tiles: 2, prob: 0.55 } }]);
  assert.deepEqual(at({ module: 0, moduleLevel: 3 }), [{ prob: 0.2, scale: 1.9, front: { tiles: 2, prob: 0.6 } }]);
  const e1 = operatorAt(t, { elite: 1, level: 1, potential: 1, trust: 0, skill: 0, skillLevel: 1 }).critTalents;
  assert.deepEqual(e1, [{ prob: 0.2, scale: 1.4, front: { tiles: 1, prob: 0.5 } }]);
});

test('[部署-8] [干员-14] 年 PRO-X 3: three broken layers stack to the cap and give SP; one more still gives SP', async () => {
  const talent = operatorAt(await loadTraining('char_2014_nian'), { ...E2, module: 0, moduleLevel: 3 }).deployTalents?.[0];
  const { c, w, op } = deployed(talent);
  punch(w, c, op);
  punch(w, c, op);
  punch(w, c, op);
  const b = op.buffs.find((x) => x.key === 'shieldBreak'), s = attrs.statsOf(op);
  assert.equal(op.buffs.some((x) => x.key === 'deployShield'), false);
  assert.deepEqual(b && { stacks: b.stacks, maxStacks: b.maxStacks, left: b.left, mods: b.mods }, { stacks: 3, maxStacks: 3, left: -1, mods: { atkPct: 0.07, defPct: 0.07 } });
  assert.equal(s.atk, 50 * (1 + 0.07 * 3));
  assert.equal(s.def, 100 * (1 + 0.07 * 3));
  assert.equal(op.skill && op.skill.sp, 9);
  buffs.addBuff(op, buffs.makeBuff({ key: 'deployShield', src: op.id, shieldHits: 1, tag: 'shieldBreak', n: 0 }));
  punch(w, c, op);
  assert.equal(op.buffs.find((x) => x.key === 'shieldBreak')?.stacks, 3);
  assert.equal(op.skill && op.skill.sp, 12);
});

test('[部署-8] [技能-2] a broken layer gives no SP while the skill runs, and the stack still grows', async () => {
  const talent = operatorAt(await loadTraining('char_2014_nian'), { ...E2, module: 0, moduleLevel: 3 }).deployTalents?.[0];
  const { c, w, op } = deployed(talent, { ...SKILL, cost: 10, init: 10 });
  step(w, c, [[0, { type: 'skill', unit: op.id }]]);
  assert.equal(op.skill && op.skill.active, true);
  punch(w, c, op);
  assert.equal(op.skill && op.skill.sp, 0);
  assert.equal(op.buffs.find((x) => x.key === 'shieldBreak')?.stacks, 1);
});

test('[攻击-4] [干员-12] 普罗旺斯: the chance rises on the tile ahead, not on her own tile', async () => {
  const crit = operatorAt(await loadTraining('char_145_prove'), E2).critTalents;
  const scale = crit?.[0]?.scale;
  assert.equal(scale, 1.8);
  assert.equal(shot(crit, 1, 2), 50 * scale, 'the tile ahead');
  assert.equal(shot(crit, 1, 1), 50, 'her own tile');
  assert.equal(shot(crit, 1, 3), 50, 'two tiles ahead');
  assert.equal(shot(crit, 2, 1), 50, 'off the line');
});

test('[攻击-4] [干员-12] 普罗旺斯 X: two tiles include her own tile and the two ahead', async () => {
  const crit = operatorAt(await loadTraining('char_145_prove'), { ...E2, module: 0, moduleLevel: 2 }).critTalents;
  const scale = crit?.[0]?.scale;
  assert.equal(scale, 1.85);
  assert.equal(shot(crit, 1, 1), 50 * scale, 'her own tile');
  assert.equal(shot(crit, 1, 2), 50 * scale, 'one ahead');
  assert.equal(shot(crit, 1, 3), 50 * scale, 'two ahead');
  assert.equal(shot(crit, 1, 4), 50, 'three ahead');
  assert.equal(shot(crit, 2, 1), 50, 'off the line');
});
