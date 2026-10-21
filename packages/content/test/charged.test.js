// Attack-recovery enemy skills (docs/spec/foes.md 敌能-36): the attacks that charge one, the hit that spends it, the
// reset, and silence where the page says the skill can be silenced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, status, buffs } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { levelContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const real = levelContent('act1multi_fortress_hard-01', 'NORMAL');

/**
 * The tiny map: `foes` spawn in frame 0, stand rooted at (row, col); operators deploy in frame 1, free, a million HP.
 * @param {[string, number, number][]} foes @param {[string, number, number][]} ops
 * @param {{ tweak?: (c: any) => void, guard?: Record<string, unknown>, beforeDeploy?: (es: Unit[]) => void }} [o]
 */
function arena(foes, ops, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { ...real.enemies };
  c.behaviors = real.behaviors;
  c.level.waves = [oneWave(foes.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e6 });
  Object.assign(c.operators.guard, { def: 0, ...o.guard });
  o.tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.owner < 0);
  es.forEach((e, i) => { e.x = foes[i][2]; e.y = foes[i][1]; e.path = []; status.applyStatus(e, 'root', {}); });
  o.beforeDeploy?.(es);
  const opened = [...step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]))];
  return { c, w, es, ops: w.units.filter((u) => u.owner >= 0), opened };
}

/**
 * The next `ask.n` attacks' hits and whether the guard is freshly stunned (7 s is 210 frames). `ask.prior` is the
 * deploy step: a melee hit lands there, before the caller starts watching.
 * @param {World} w @param {any} c @param {Unit} e @param {Unit} g @param {{ n: number, prior?: any[] }} ask
 */
function swings(w, c, e, g, ask) {
  const n = ask.n;
  /** @type {{ hits: number[], stun: boolean }[]} */
  const out = [];
  /** @type {any[]} */
  let carry = ask.prior ?? [];
  for (let i = 0; i < 9000 && out.length < n; i++) {
    const ev = carry.length > 0 ? carry : [...step(w, c)];
    carry = [];
    /** @type {number[]} */
    const hits = [];
    for (const x of ev) if (x.type === 'hit' && x.id === e.id) hits.push(x.damage);
    if (hits.length === 0) continue;
    const stun = g.buffs.find((b) => b.key === 'stun');
    out.push({ hits, stun: !!stun && stun.left > 180 });
  }
  assert.equal(out.length, n, `${e.key} landed ${out.length} of ${n}`);
  return out;
}

/** A melee body plus what the test's skill needs. @param {Record<string, unknown>} over */
function body(over) {
  return {
    name: 't', maxHp: 5000, atk: 1000, def: 0, res: 0, moveSpeed: 0.5, baseAttackTime: 2, rangeRadius: 1,
    applyWay: 'MELEE', motion: 'WALK', massLevel: 1, levelType: 'ELITE', lifePointReduce: 1, ...over,
  };
}

/** @param {string} key */
const stunOn = (key) => {
  const { c, w, es: [e], ops: [g], opened } = arena([[key, 1, 2]], [['guard', 1, 2]]);
  return swings(w, c, e, g, { n: 6, prior: opened }).map((s) => s.stun);
};

test('[敌能-36] 粉碎攻坚手 and 组长: two ordinary hits, the third stuns 7 s, then the count starts again', () => {
  assert.deepEqual(stunOn('enemy_1045_hammer'), [false, false, true, false, false, true]);
  assert.deepEqual(stunOn('enemy_1045_hammer_2'), [false, false, true, false, false, true]);
  assert.deepEqual(uncoveredAbilities([real.enemies.enemy_1045_hammer]), []);
});

test('[敌能-36] 眩晕打击 is silenceable: while silenced the full bar does not stun, and the next hit after it does', () => {
  const { c, w, es: [e], ops: [g], opened } = arena([['enemy_1045_hammer', 1, 2]], [['guard', 1, 2]], {
    beforeDeploy: (es) => { status.applyStatus(es[0], 'silence', {}); },
  });
  const held = swings(w, c, e, g, { n: 4, prior: opened });
  assert.ok(held.every((s) => !s.stun));
  assert.equal(e.ab['stuncombat.sp'], 2, 'the bar stays full');
  buffs.removeBuff(e, 'silence');
  const [spent] = swings(w, c, e, g, { n: 1 });
  assert.equal(spent.stun, true);
  assert.equal(e.ab['stuncombat.sp'], 0);
});

test('[敌能-36] a cooldown that is not ready holds a full bar: the hit stays ordinary until the skill is ready', () => {
  const key = 'slow_stun';
  const { c, w, es: [e], ops: [g], opened } = arena([[key, 1, 2]], [['guard', 1, 2]], {
    tweak: (cc) => {
      cc.enemies[key] = body({ skills: [{ key: 'stuncombat', cooldown: 30, initCooldown: 30, sp: 1, bb: { stun: 7 } }] });
    },
  });
  const held = swings(w, c, e, g, { n: 3, prior: opened });
  assert.ok(held.every((s) => !s.stun));
  assert.equal(e.ab['stuncombat.sp'], 1);
  assert.ok(e.ab['stuncombat.cd'] > 30);
  e.ab['stuncombat.cd'] = 0;
  const [spent] = swings(w, c, e, g, { n: 1 });
  assert.equal(spent.stun, true);
  assert.equal(e.ab['stuncombat.sp'], 0);
  assert.ok(e.ab['stuncombat.cd'] > 30, 'using it starts the cooldown');
});

test('[敌能-36] 码头水手: stuncombat at its own cost (the 4th hit); Drown stays uncovered', () => {
  const sailor = body({
    skills: [{ key: 'stuncombat', cooldown: 1, initCooldown: 1, sp: 3, bb: { stun: 7 } }],
    talents: { Drown: { damage: 1000 } },
  });
  assert.deepEqual(uncoveredAbilities([sailor]), ['Drown']);
  const key = 'enemy_1160_hvyslr';
  const { c, w, es: [e], ops: [g], opened } = arena([[key, 1, 2]], [['guard', 1, 2]], { tweak: (cc) => { cc.enemies[key] = sailor; } });
  assert.deepEqual(swings(w, c, e, g, { n: 5, prior: opened }).map((s) => s.stun), [false, false, false, true, false]);
});

test('[敌能-36] 澪: every attack is two hits; the 4th and the 8th are at 150%, and silence immunity lets 寒晖 through', () => {
  const key = 'enemy_10118_ymgprc';
  const def = withFoeExtras(key, body({
    atk: 777, immune: ['silence'],
    skills: [{ key: 'PowerAttack', cooldown: 0, initCooldown: 0, sp: 3, bb: { atk_scale: 1.5 } }],
  }));
  assert.equal(def.skills?.[0].bb.times, 2);
  const { c, w, es: [e], ops: [g], opened } = arena([[key, 1, 2]], [['guard', 1, 2]], {
    tweak: (cc) => { cc.enemies[key] = def; },
    beforeDeploy: (es) => { status.applyStatus(es[0], 'silence', {}); },
  });
  // Cost 3: three ordinary swings fill the bar, the next is 寒晖. A zero cooldown does not skip that refill, so the
  // second 寒晖 is the 8th swing, and the points are empty again.
  const got = swings(w, c, e, g, { n: 8, prior: opened });
  const n = got[0].hits[0];
  assert.ok(got.every((s) => s.hits.length === 2 && s.hits[1] === s.hits[0]));
  assert.deepEqual(got.map((s) => s.hits[0] === n), [true, true, true, false, true, true, true, false]);
  assert.ok(Math.abs(got[3].hits[0] - n * 1.5) < 1e-6 && Math.abs(got[7].hits[0] - n * 1.5) < 1e-6);
  assert.equal(e.ab['PowerAttack.sp'], 0);
});

test('[敌能-36] 无胄盟清扫小队: three ordinary hits, the 4th at 150% and back; silenced, the 4th stays ordinary. EpDamage stays uncovered', () => {
  const sweep = body({
    atk: 700, applyWay: 'RANGED', rangeRadius: 10, baseAttackTime: 5,
    skills: [{ key: 'PowerAttack', cooldown: 1, initCooldown: 1, sp: 3, bb: { atk_scale: 1.5, ep_damage_ratio: 0.35 } }],
    talents: { EpDamage: { 'attack@ep_damage_ratio': 0.35 } },
  });
  assert.deepEqual(uncoveredAbilities([sweep]), ['EpDamage']);
  assert.equal(withFoeExtras('enemy_1183_mlasrt', sweep).skills?.[0].bb.times, undefined);
  const key = 'enemy_1183_mlasrt';
  const open = arena([[key, 1, 4]], [['guard', 1, 2]], { tweak: (cc) => { cc.enemies[key] = sweep; } });
  const got = swings(open.w, open.c, open.es[0], open.ops[0], { n: 5, prior: open.opened });
  const n = got[0].hits[0];
  assert.ok(got.every((s) => s.hits.length === 1));
  assert.deepEqual(got.map((s) => Math.abs(s.hits[0] - n) < 1e-6), [true, true, true, false, true]);
  assert.ok(Math.abs(got[3].hits[0] - n * 1.5) < 1e-6);
  assert.deepEqual(open.ops[0].ep, {}, 'no 侵蚀 from this family');
  const shut = arena([[key, 1, 4]], [['guard', 1, 2]], {
    tweak: (cc) => { cc.enemies[key] = sweep; },
    beforeDeploy: (es) => { status.applyStatus(es[0], 'silence', {}); },
  });
  const held = swings(shut.w, shut.c, shut.es[0], shut.ops[0], { n: 4, prior: shut.opened });
  assert.ok(held.every((s) => Math.abs(s.hits[0] - held[0].hits[0]) < 1e-6));
  assert.equal(shut.es[0].ab['PowerAttack.sp'], 3);
  buffs.removeBuff(shut.es[0], 'silence');
  const [spent] = swings(shut.w, shut.c, shut.es[0], shut.ops[0], { n: 1 });
  assert.ok(Math.abs(spent.hits[0] - held[0].hits[0] * 1.5) < 1e-6);
  assert.equal(shut.es[0].ab['PowerAttack.sp'], 0);
});
