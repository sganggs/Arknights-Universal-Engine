// Traits (docs/spec/traits.md) and the deck (docs/spec/field.md 部署-3, 撤退-1): the defaults by position, healers,
// target counts and hits, lasting modifiers and on-hit statuses, cost on a kill, behaviours by branch; the deploy cost
// the 再部署惩罚 raises, the 再部署时间, the retreat refund.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent } from '@aue/testkit';
import { KIND } from '@aue/schema';
import { createWorld, step, deployProblem, stateHash, takeSnapshot, restoreSnapshot, bus } from '../src/index.js';
import { defaultTrait, traitTargets, traitOfDef, creditedDamage } from '../src/traits.js';
import { deployCost, cardOf, MAX_PENALTY } from '../src/deck.js';
import { makeEnemy } from '../src/units.js';
import { applyStatus } from '../src/status.js';
import { heal } from '../src/damage.js';
import { statsOf } from '../src/attrs.js';
import { makeBuff } from '../src/buffs.js';
import { pickTarget, targetsOf, traitScale, attackNow } from '../src/combat.js';
import { BEHAVIOR_API_VERSION, CONTEXT_MEMBERS, SKILL_CONTEXT_MEMBERS } from '../src/api.js';

/** @typedef {import('../src/types.js').Unit} Unit @typedef {import('../src/types.js').World} World */

/**
 * The tiny level without spawns; `tweak` changes the content first. Rooted foes are added with `foe`.
 * @param {(c: any) => void} [tweak]
 */
function arena(tweak) {
  const c = tinyContent();
  c.level.waves = [];
  tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 2 });
  /** A rooted enemy at (row, col) with HP and over. @param {number} row @param {number} col @param {Record<string, any>} [over] */
  const foe = (row, col, over = {}) => {
    const e = makeEnemy(w, c, { key: 'slime', route: 0 });
    e.x = col; e.y = row;
    e.base = { ...e.base, ...over };
    e.hp = e.maxHp = statsOf(e).maxHp;
    applyStatus(e, 'root', {});
    w.units.push(e);
    return e;
  };
  return { w, c, foe };
}
/**
 * Runs n frames, collecting the events with their frame. Commands in the first: [seat, command], or a bare command of
 * seat 0. @param {World} w @param {any} c @param {number} n @param {any[]} [cmds]
 */
function run(w, c, n, cmds = []) {
  const first = /** @type {[number, any][]} */ (cmds.map((x) => (Array.isArray(x) ? x : [0, x])));
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const e of step(w, c, i === 0 ? first : [])) out.push({ ...e, f: w.frame - 1 });
  return out;
}
/** A deploy command. @param {string} op @param {number} row @param {number} col @returns {import('@aue/schema').DeployCommand} */
const deploy = (op, row, col, dir = 0) => ({ type: 'deploy', op, row, col, dir });

test('[职业-1] defaults by position: melee prefers what it blocks and cannot select other flyers; ranged can', () => {
  assert.deepEqual([defaultTrait('MELEE').blockedFirst, defaultTrait('MELEE').antiAir, defaultTrait('RANGED').blockedFirst, defaultTrait('RANGED').antiAir],
    [true, false, false, true]);
  assert.deepEqual(traitOfDef(/** @type {any} */ ({ position: 'MELEE', trait: { hits: 2 } })).hits, 2);
  const { w, c, foe } = arena();
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = w.units[0], flyer = foe(1, 2, { motion: 'FLY' });
  assert.equal(pickTarget(w, c, guard), null, 'a flyer in range: a melee operator cannot select it');
  c.operators.guard.trait = { antiAir: true };
  assert.equal(pickTarget(w, c, guard), flyer, '可对空');
});

test('[职业-1] [阻挡-2] a trait flag lets a melee operator block a flyer; then it attacks it, flying and out of range', () => {
  const { w, c, foe } = arena((cc) => { cc.operators.guard.trait = { flags: { blockFly: true } }; cc.operators.guard.range = [{ row: 0, col: 5 }]; });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = w.units[0], flyer = foe(1, 1.2, { motion: 'FLY', maxHp: 1e6 });
  run(w, c, 2);
  assert.equal(flyer.blockedBy, guard.id);
  assert.deepEqual(targetsOf(w, c, guard), [flyer]);
});

test('[职业-2] a healer heals the ally in range with the lowest HP ratio, never one at full HP or under 禁疗', () => {
  const { w, c } = arena((cc) => {
    cc.operators.medic = { ...cc.operators.sniper, name: 'medic', atk: 100, trait: { heal: true }, range: [{ row: 0, col: 0 }, { row: -1, col: 0 }, { row: -1, col: -1 }, { row: -1, col: 1 }] };
  });
  run(w, c, 1, [[0, deploy('medic', 2, 2)], [0, deploy('guard', 1, 2)], [1, deploy('guard', 1, 3)]]);
  const [medic, g1, g2] = w.units;
  assert.deepEqual([medic.owner, g1.owner, g2.owner], [0, 0, 1]);
  assert.equal(targetsOf(w, c, medic).length, 0, 'all at full HP: no target, no attack');
  g1.hp = 600; g2.hp = 500;
  const ev = run(w, c, 1);
  assert.deepEqual(ev.filter((e) => e.type === 'heal').map((e) => [e.target, e.amount]), [[g2.id, 100]], 'the lower ratio, the other player\'s included');
  assert.equal(g2.hp, 600);
  applyStatus(g2, 'healFree', {});
  assert.deepEqual(targetsOf(w, c, medic), [g1], '禁疗: not a target');
  assert.equal(ev.filter((e) => e.type === 'hit').length, 0, 'it hits no enemy');
});

test('[职业-2] a healer under a buff with attackFoes attacks the enemies in range instead', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.medic = { ...cc.operators.sniper, name: 'medic', atk: 100, trait: { heal: true }, range: [{ row: 0, col: 0 }, { row: 0, col: 1 }] };
  });
  run(w, c, 1, [deploy('medic', 2, 2)]);
  const medic = /** @type {Unit} */ (w.units[0]), e = foe(2, 3, { maxHp: 1e6, def: 0 });
  assert.deepEqual(targetsOf(w, c, medic), [], 'no one hurt: no target');
  medic.buffs.push(makeBuff({ key: 'skill', flags: { attackFoes: true } }));
  assert.deepEqual(targetsOf(w, c, medic), [e]);
  run(w, c, 60);
  assert.ok(e.hp < 1e6, 'it hit the enemy');
});

test('[职业-3] targets: the 阻挡数 (blocked first, then others in range), every candidate, or the skill\'s if more', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.trait = { targets: 'blockCnt' };
    cc.operators.guard.range = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }];
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = w.units[0];
  for (const col of [2, 3, 4]) foe(1, col, { maxHp: 1e6 });
  assert.equal(traitTargets({ ...defaultTrait('MELEE'), targets: 'blockCnt' }, guard), 2);
  let ev = run(w, c, 1);
  assert.equal(ev.filter((e) => e.type === 'attack').length, 2, '阻挡数 2: two of the three in range, none blocked');
  c.operators.guard.trait = { targets: 'all' };
  guard.atkCd = 0;
  ev = run(w, c, 1);
  assert.equal(ev.filter((e) => e.type === 'attack').length, 3);
  assert.equal(traitTargets({ ...defaultTrait('MELEE'), targets: 'blockCnt' }, { ...guard, base: { ...guard.base, blockCnt: 0 } }), 1, 'never below 1');
});

test('[职业-3] hits: each target takes the trait\'s hits per attack (剑豪: two)', () => {
  const { w, c, foe } = arena((cc) => { cc.operators.guard.trait = { hits: 2 }; });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const e = foe(1, 2, { maxHp: 1e6, def: 0 });
  const ev = run(w, c, 1);
  assert.deepEqual(ev.filter((x) => x.type === 'hit').map((x) => [x.target, x.damage]), [[e.id, 50], [e.id, 50]]);
  assert.equal(ev.filter((x) => x.type === 'attack').length, 1, 'one attack');
});

test('[职业-4] lasting modifiers and flags while deployed; a status on each hit (凝滞师: 停顿 0.8 s)', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.sniper.trait = { mods: { taunt: -1, dodgePhys: 0.5 }, hitStatus: { key: 'sluggish', seconds: 0.8 } };
    cc.operators.sniper.dmgType = 'arts';
  });
  run(w, c, 1, [deploy('sniper', 2, 2)]);
  const sn = w.units[0];
  assert.equal(statsOf(sn).taunt, -1);
  assert.deepEqual(sn.buffs.map((b) => b.key), ['trait']);
  const e = foe(1, 3, { maxHp: 1e6 });
  const ev = run(w, c, 4);
  assert.deepEqual(ev.filter((x) => x.type === 'shot').map((x) => x.f), [1], 'a ranged attack launches a projectile (攻击-3)');
  const hitAt = ev.find((x) => x.type === 'hit')?.f;
  assert.equal(hitAt, 4, '√2 tiles at 12 tiles/s: 0.4 a frame, it arrives in the fourth frame');
  assert.equal(e.buffs.find((b) => b.key === 'sluggish')?.left, 24);
  assert.equal(statsOf(e).moveSpeed, 0.2);
});

test('[职业-5] a kill by the operator\'s attack or skill gives the trait\'s cost (冲锋手); a dead target gives none', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.trait = { killCost: 1 };
    cc.operators.guard.skill = { id: 'zap', type: 'MANUAL', sp: 'time', cost: 1, init: 1, charges: 1, duration: 0, ammo: false, bb: { cost: 0 } };
    cc.behaviors = { skills: { zap: { start: (/** @type {any} */ ctx) => { for (const u of /** @type {any} */ (globalThis).__targets) ctx.dealDamage(u, { type: 'true', amount: 1e9 }); } } } };
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = w.units[0];
  foe(1, 2, { maxHp: 40, def: 0 });
  const cost = w.players[0].cost;
  run(w, c, 1);
  assert.equal(w.players[0].cost, cost + 1, 'its hit killed the slime');
  const far = foe(0, 5, { maxHp: 10 });
  const dead = foe(2, 5, { maxHp: 10 });
  dead.hp = 0;
  /** @type {any} */ (globalThis).__targets = [far, dead];
  const before = w.players[0].cost;
  run(w, c, 1, [[0, { type: 'skill', unit: guard.id }]]);
  assert.equal(w.players[0].cost, before + 1, 'the skill killed one; the dead one gives nothing');
  delete (/** @type {any} */ (globalThis).__targets);
});

test('[职业-6] behaviours by branch act through the context: at deployment, on each hit, after a kill', () => {
  /** @type {string[]} */
  const log = [];
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.branch = 'test_branch';
    cc.behaviors = { traits: { test_branch: {
      deploy: (/** @type {any} */ ctx) => { log.push(`deploy ${ctx.self.key}`); ctx.addBuff(ctx.self, { key: 'own', mods: { atkFlat: 10 } }); },
      hit: (/** @type {any} */ ctx, /** @type {any} */ t) => { log.push(`hit ${t.id}`); },
      kill: (/** @type {any} */ ctx) => { log.push('kill'); ctx.gainCost(2); },
    } } };
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const e = foe(1, 2, { maxHp: 60, def: 0 }), cost = w.players[0].cost;
  run(w, c, 1);
  assert.deepEqual(log, ['deploy guard', 'kill', `hit ${e.id}`]);
  assert.equal(statsOf(w.units[0]).atk, 60);
  assert.equal(w.players[0].cost, Math.min(12, cost + 2));
});

test('[职业-6] every context function acts on the battle: stats, buffs, statuses, damage, 元素损伤, healing, cost', () => {
  /** @type {any} */
  let seen = null;
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.branch = 'ctx_branch';
    cc.operators.guard.trait = { bb: { k: 3 } };
    cc.behaviors = { traits: { ctx_branch: { hit: (/** @type {any} */ ctx, /** @type {any} */ t) => {
      if (seen) return;
      ctx.addBuff(t, { key: 'mark', mods: { defFlat: -5 } });
      ctx.removeBuff(t, 'mark');
      ctx.applyStatus(t, 'stun', { seconds: 1 });
      seen = { bb: ctx.bb.k, frame: ctx.frame, atk: ctx.stats(ctx.self).atk, dmg: ctx.dealDamage(t, { type: 'true', amount: 7 }), ep: ctx.dealEp(t, 'FIRE', 100) };
      ctx.self.hp = 900;
      seen.healed = ctx.heal(ctx.self, 50);
      ctx.gainCost(1);
    } } } };
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const e = foe(1, 2, { maxHp: 1e6, def: 0 }), cost = w.players[0].cost;
  run(w, c, 1);
  assert.deepEqual(seen, { bb: 3, frame: 1, atk: 50, dmg: 7, ep: 100, healed: 50 });
  assert.deepEqual(e.buffs.map((b) => b.key), ['root', 'stun']);
  assert.equal(e.ep.FIRE, 900);
  assert.equal(w.units[0].hp, 950);
  assert.equal(w.players[0].cost, Math.min(12, cost + 1));
});

test('[职业-6] [技能-6] the behaviour interface, version 3: a skill’s and a trait’s contexts have exactly the listed members; a skill’s end is told why', () => {
  /** @type {any[]} */
  const got = [];
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.branch = 'b';
    cc.operators.guard.skill = { id: 's', type: 'AUTO', sp: 'time', cost: 1, init: 1, charges: 1, duration: 0, ammo: false, bb: { cost: 0 } };
    cc.behaviors = { skills: { s: { trigger: 'ready', start: (/** @type {any} */ ctx) => { got.push(['skill', Object.keys(ctx)]); }, end: (/** @type {any} */ _ctx, /** @type {string} */ why) => { got.push(['end', why]); } } },
      traits: { b: { deploy: (/** @type {any} */ ctx) => { got.push(['trait', Object.keys(ctx)]); } } } };
  });
  run(w, c, 2, [deploy('guard', 1, 1)]);
  foe(1, 2);
  assert.equal(BEHAVIOR_API_VERSION, 5);
  assert.deepEqual(got, [['trait', [...CONTEXT_MEMBERS]], ['skill', [...SKILL_CONTEXT_MEMBERS]], ['end', 'instant']]);
  assert.deepEqual(SKILL_CONTEXT_MEMBERS.filter((k) => !CONTEXT_MEMBERS.includes(k)), ['kind', 'extra']);
});

test('[部署-3] the 再部署惩罚: each leaving adds a layer (at most 2), the cost × 1.5 then × 2, rounded down', () => {
  const { w, c } = arena((cc) => { cc.operators.guard.cost = 9; cc.operators.guard.respawnTime = 2; cc.level.options.maxCost = 99; });
  const p = w.players[0];
  p.cost = 99;
  assert.equal(deployCost(c, p, 'guard'), 9);
  const costs = [];
  for (let i = 0; i < 4; i++) {
    costs.push(deployCost(c, p, 'guard'));
    const before = p.cost;
    run(w, c, 1, [deploy('guard', 1, 1)]);
    assert.equal(before - p.cost, costs[i], 'paid what it cost then');
    const u = /** @type {Unit} */ (w.units.find((x) => x.kind === KIND.OPERATOR));
    assert.equal(u.paid, costs[i]);
    u.hp = 0;
    run(w, c, 1);
    assert.equal(deployProblem(w, c, 0, deploy('guard', 1, 1)), 'redeploying');
    run(w, c, 59);
    assert.equal(deployProblem(w, c, 0, deploy('guard', 1, 1)), null, '2 s later');
  }
  assert.deepEqual(costs, [9, 13, 18, 18]);
  assert.equal(cardOf(p, 'guard').penalty, MAX_PENALTY);
});

test('[撤退-1] a retreat returns ⌊min(paid × 返还倍率, initial cost)⌋: half by default, all for 冲锋手, none for 行商; a fall none', () => {
  const refund = (/** @type {number} */ rate, /** @type {number} */ penalty) => {
    const { w, c } = arena((cc) => { cc.operators.guard.cost = 9; cc.operators.guard.trait = { refund: rate }; cc.level.options.maxCost = 99; });
    const p = w.players[0];
    p.cost = 50;
    p.cards.guard = { penalty, ready: 0 };
    run(w, c, 1, [deploy('guard', 1, 1)]);
    const after = p.cost;
    run(w, c, 1, [[0, { type: 'retreat', unit: w.units[0].id }]]);
    return p.cost - after;
  };
  assert.deepEqual([refund(0.5, 0), refund(0.5, 1), refund(0.5, 2), refund(1, 0), refund(1, 1), refund(0, 0)], [4, 6, 9, 9, 9, 0],
    '⌊4.5⌋, ⌊6.5⌋, min(9, 9), 9, min(13, 9), 0');
  const { w, c } = arena();
  run(w, c, 1, [deploy('guard', 1, 1)]);
  w.players[0].cost = 11;
  run(w, c, 1, [[0, { type: 'retreat', unit: w.units[0].id }]]);
  assert.equal(w.players[0].cost, 12, 'at most the level\'s maximum (费用-1)');
  const fall = arena();
  run(fall.w, fall.c, 1, [deploy('guard', 1, 1)]);
  const left = fall.w.players[0].cost;
  fall.w.units[0].hp = 0;
  run(fall.w, fall.c, 1);
  assert.equal(fall.w.players[0].cost, left);
});

test('[部署-3] [同步-1] cards and paid costs are state: a snapshot restores to the same hash and runs on the same', () => {
  const { w, c } = arena((cc) => { cc.operators.guard.respawnTime = 1; });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  run(w, c, 1, [[0, { type: 'retreat', unit: w.units[0].id }]]);
  const copy = restoreSnapshot(JSON.parse(JSON.stringify(takeSnapshot(w))));
  assert.equal(stateHash(copy), stateHash(w));
  run(w, c, 40, [[0, deploy('guard', 1, 1)]]);
  run(copy, c, 40, [[0, deploy('guard', 1, 1)]]);
  assert.equal(stateHash(copy), stateHash(w));
  assert.deepEqual(copy.players[0].cards.guard, { penalty: 1, ready: 31 });
});

test('[职业-8] the 倍率 against enemies the operator does not block (教官 1.2, 领主 0.8)', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.trait = { unblockedScale: 1.2, targets: 'all' };
    cc.operators.guard.range = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }];
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = /** @type {Unit} */ (w.units[0]), near = foe(1, 1, { maxHp: 1e6, def: 0 }), far = foe(1, 3, { maxHp: 1e6, def: 0 });
  near.blockedBy = guard.id;
  const ev = run(w, c, 1);
  assert.deepEqual(ev.filter((e) => e.type === 'hit').map((e) => [e.target, e.damage]).sort((a, b) => a[0] - b[0]), [[near.id, 50], [far.id, 60]]);
  assert.deepEqual([traitScale(w, c, guard, near), traitScale(w, c, guard, far), traitScale(w, c, far, guard)], [1, 1.2, 1], 'the trait’s 倍率 per target; 1 for an enemy attacker');
});

test('[职业-8] a splash: the other enemies within the radius take its share; ground-only spares flyers; an aftershock hits them all again', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.trait = { splash: { radius: 1, scale: 0.5, ground: true }, aftershock: 0.5 };
    cc.operators.guard.range = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const main = foe(1, 2, { maxHp: 1e6, def: 0 }), near = foe(2, 2, { maxHp: 1e6, def: 0 }), flyer = foe(1, 3, { maxHp: 1e6, def: 0, motion: 'FLY' });
  const away = foe(3, 2, { maxHp: 1e6, def: 0 });
  const hits = run(w, c, 1).filter((e) => e.type === 'hit').map((e) => [e.target, e.damage]);
  assert.deepEqual(hits, [[main.id, 50], [near.id, 25], [main.id, 25], [near.id, 12.5]]);
  assert.ok(!hits.some(([t]) => t === flyer.id || t === away.id), 'the flyer (ground-only) and the enemy 2 tiles away are spared');
});

test('[职业-8] a ranged splash lands where its projectile arrives', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.sniper.trait = { splash: { radius: 1, scale: 1, ground: false } };
    cc.operators.sniper.range = [{ row: 0, col: 1 }, { row: 0, col: 2 }];
  });
  run(w, c, 1, [deploy('sniper', 0, 2, 2)]);
  assert.equal(w.units[0]?.key, 'sniper', 'on the high ground, facing left');
  const main = foe(0, 0, { maxHp: 1e6, def: 0 }), side = foe(1, 0, { maxHp: 1e6, def: 0 });
  const ev = run(w, c, 60);
  const hits = ev.filter((e) => e.type === 'hit');
  assert.ok(ev.some((e) => e.type === 'shot') && hits.some((e) => e.target === main.id), 'shot, then the hit');
  const first = hits.find((e) => e.target === main.id);
  assert.ok(hits.some((e) => e.target === side.id && e.f === first?.f && e.damage === first?.damage), 'the side enemy takes the same in the same frame');
});

test('[职业-9] no ally heals a noAllyHeal operator, not even a healer picks it; its own heals pass even under 禁疗', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.trait = { flags: { noAllyHeal: true }, selfHeal: 30, selfHealMax: 'blockCnt', targets: 'all' };
    cc.operators.guard.range = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = /** @type {Unit} */ (w.units[0]);
  guard.hp = 100;
  for (const col of [1, 2]) foe(1, col, { maxHp: 1e6 });
  applyStatus(guard, 'healFree', {});
  const ev = run(w, c, 1);
  const own = ev.filter((e) => e.type === 'heal' && e.target === guard.id);
  assert.deepEqual(own.map((e) => e.amount), [30, 30], 'one heal per enemy reached, its 阻挡数 (2) at most, despite 禁疗');
  assert.equal(guard.hp, 160);
  assert.equal(heal(w, guard, guard, 10), 10);
  assert.equal(heal(w, w.units[1] ?? null, guard, 10), 0, 'another unit\'s heal does nothing');
});

test('[职业-9] a 武者 heals itself for every hit it deals: each hit of an attack, content damage too; not 生命流失 nor a sourceless hit', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.trait = { flags: { noAllyHeal: true }, selfHeal: 30, selfHealOn: 'damage', hits: 2 };
    cc.operators.guard.range = [{ row: 0, col: 0 }, { row: 0, col: 1 }];
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = /** @type {Unit} */ (w.units[0]);
  guard.hp = 100;
  const e = foe(1, 2, { maxHp: 1e6 });
  const healsOf = (/** @type {any[]} */ ev) => ev.filter((x) => x.type === 'heal' && x.target === guard.id).map((x) => x.amount);
  assert.deepEqual(healsOf(run(w, c, 1)), [30, 30], 'an attack of two hits: two heals');
  const before = w.events.length;
  creditedDamage(w, c, guard, e, { type: 'arts', amount: 100 });
  creditedDamage(w, c, guard, e, { type: 'true', amount: 100, hpLoss: true });
  creditedDamage(w, c, guard, e, { type: 'true', amount: 100, sourceless: true });
  assert.deepEqual(healsOf(w.events.slice(before)), [30], 'a skill\'s or talent\'s damage heals too; 生命流失 and a sourceless hit do not');
});

test('[职业-10] [部署-1] a melee operator whose trait allows it may stand on a ranged tile', () => {
  const { w, c } = arena();
  assert.equal(deployProblem(w, c, 0, deploy('guard', 0, 2)), 'tile not buildable for this operator');
  c.operators.guard.trait = { rangedTiles: true };
  assert.equal(deployProblem(w, c, 0, deploy('guard', 0, 2)), null);
  assert.equal(deployProblem(w, c, 0, deploy('guard', 1, 1)), null, 'its own tiles still');
  assert.equal(deployProblem(w, c, 0, deploy('guard', 0, 0)), 'tile not buildable for this operator');
});

test('[职业-19] [部署-1] a ranged operator whose trait allows it may stand on a melee tile', () => {
  const { w, c } = arena();
  assert.equal(deployProblem(w, c, 0, deploy('sniper', 1, 1)), 'tile not buildable for this operator');
  c.operators.sniper.trait = { meleeTiles: true };
  assert.deepEqual([deployProblem(w, c, 0, deploy('sniper', 1, 1)), deployProblem(w, c, 0, deploy('sniper', 0, 2))], [null, null], 'a melee tile, and its own still');
  assert.equal(deployProblem(w, c, 0, deploy('sniper', 0, 0)), 'tile not buildable for this operator');
});

test('[职业-10] [状态-7] 阻回 always, immune to it while blocking: SP recovers only then', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.trait = { flags: { noSp: true }, immuneBlocking: ['noSp'] };
    cc.operators.guard.skill = { id: 's', type: 'MANUAL', sp: 'time', cost: 30, init: 0, charges: 1, duration: 0, ammo: false, bb: {} };
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = /** @type {Unit} */ (w.units[0]), st = /** @type {NonNullable<Unit['skill']>} */ (guard.skill);
  run(w, c, 60);
  assert.equal(st.sp, 0, 'not blocking: 阻回');
  const e = foe(1, 1, { maxHp: 1e9 });
  run(w, c, 2);
  assert.equal(e.blockedBy, guard.id);
  assert.deepEqual([statsOf(guard).flags.noSp, guard.buffs.map((b) => b.key)], [undefined, ['trait', 'blocking']]);
  run(w, c, 60);
  assert.ok(st.sp >= 1, `blocking: it recovers (${st.sp})`);
  w.units.splice(w.units.indexOf(e), 1);
  run(w, c, 1);
  assert.deepEqual([statsOf(guard).flags.noSp, guard.buffs.map((b) => b.key)], [true, ['trait']], 'blocking none: the immunity goes');
});

test('[职业-10] attacks started while the skill runs deal arts damage', () => {
  const { w, c, foe } = arena((cc) => {
    cc.operators.guard.trait = { skillArts: true };
    cc.operators.guard.skill = { id: 's', type: 'MANUAL', sp: 'time', cost: 1, init: 1, charges: 1, duration: 100, ammo: false, bb: {} };
  });
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = /** @type {Unit} */ (w.units[0]);
  foe(1, 2, { maxHp: 1e9, def: 1e9 });
  const before = run(w, c, 40).filter((e) => e.type === 'hit' && e.id === guard.id).map((e) => e.damage);
  assert.ok(before.length > 0 && before.every((d) => d === 2.5), `physical: the 5% floor (${before})`);
  run(w, c, 1, [{ type: 'skill', unit: guard.id }]);
  const during = run(w, c, 40).filter((e) => e.type === 'hit' && e.id === guard.id).map((e) => e.damage);
  assert.ok(during.length > 0 && during.every((d) => d === 50), `arts: the resistance is 0 (${during})`);
});

test('[职业-10] the HP drain: a share of the maximum HP each second from deployment, never the last point', () => {
  const { w, c } = arena((cc) => { cc.operators.guard.trait = { hpDrain: 0.01 }; });
  run(w, c, 29, [deploy('guard', 1, 1)]);
  const guard = /** @type {Unit} */ (w.units[0]);
  assert.equal(guard.hp, 1000);
  run(w, c, 1);
  assert.equal(guard.hp, 990);
  guard.hp = 5;
  run(w, c, 30);
  assert.equal(guard.hp, 1, 'down to 1, not lethal');
  run(w, c, 30);
  assert.equal(guard.hp, 1);
});

test('[职业-10] [撤退-1] the cost upkeep: paid every interval from deployment; short of it, the operator retreats', () => {
  const { w, c } = arena((cc) => { cc.operators.guard.trait = { refund: 0, costDrain: { every: 3, cost: 3 } }; cc.level.options.costIncreaseTime = 1000; });
  run(w, c, 89, [deploy('guard', 1, 1)]);
  assert.equal(w.players[0].cost, 5);
  run(w, c, 1);
  assert.equal(w.players[0].cost, 2, 'paid 3 at 3 s');
  const ev = run(w, c, 90);
  assert.deepEqual([ev.filter((e) => e.type === 'retreat').map((e) => e.f), w.units.length, w.players[0].cost, cardOf(w.players[0], 'guard').penalty], [[179], 0, 2, 1],
    'at 6 s 2 < 3: it retreats, no refund, a penalty layer');
});

test('[职业-10] [钩子-3] merchantPay before each payment: a handler changes its cost or cancels it', () => {
  const { w, c } = arena((cc) => { cc.operators.guard.trait = { refund: 0, costDrain: { every: 3, cost: 3 } }; cc.level.options.costIncreaseTime = 1000; });
  const seen = /** @type {number[]} */ ([]);
  let n = 0;
  bus.on(w, 'merchantPay', (k) => { seen.push(k.cost); n++; if (n === 1) k.cost = 1; else k.cancel = true; });
  run(w, c, 180, [deploy('guard', 1, 1)]);
  assert.deepEqual([seen, w.players[0].cost, w.units.length], [[3, 3], 4, 1], 'paid 1 at 3 s, nothing at 6 s');
});

test('[攻击-5] an attack now: at once, on the targets given or its own, its cooldown untouched, even while it makes no normal attacks', () => {
  const { w, c, foe } = arena();
  run(w, c, 1, [deploy('guard', 1, 1)]);
  const guard = /** @type {Unit} */ (w.units[0]);
  assert.equal(attackNow(w, c, guard), false, 'no target');
  const near = foe(1, 1, { maxHp: 1e6, def: 0 }), cd = guard.atkCd;
  assert.equal(attackNow(w, c, guard, [near]), true);
  assert.deepEqual([1e6 - near.hp, guard.atkCd], [50, cd], 'its hit at once; its cooldown as it was');
  guard.buffs.push(makeBuff({ key: 'hold', flags: { noAttack: true } }));
  assert.equal(attackNow(w, c, guard), true, 'its own target, though it makes no normal attack now');
  assert.equal(1e6 - near.hp, 100);
});
