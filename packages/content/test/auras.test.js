// Support auras and 远眺's death debuff (docs/spec/foes.md 敌能-35) on the tiny map. Blackboards are the enemy_database
// values: 御4 and 寒霜 from act1multi_rm05 (commit 17759cc8); 护障 and 远眺 are not in an extracted level, so the test
// builds those records with the same blackboards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';
import rm05 from '../data/levels/act1multi_rm05.json' with { type: 'json' };
import rm07 from '../data/levels/act1multi_rm07.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const wolf = /** @type {any} */ (rm05).enemies.enemy_1087_ltwolf;
/** Records the arena can spawn. 护障 and 远眺 keep the stated blackboards; the scout and the mouse are the other shapes. */
const ENEMIES = {
  enemy_1017_defdrn: /** @type {any} */ (rm05).enemies.enemy_1017_defdrn,
  enemy_1042_frostd: /** @type {any} */ (rm05).enemies.enemy_1042_frostd,
  enemy_1087_ltwolf: wolf,
  neutral_wolf: { ...wolf, name: '中立', neutral: true },
  enemy_1138_tumor: /** @type {any} */ (rm07).enemies.enemy_1138_tumor,
  enemy_1355_mrfly: {
    name: '护障', maxHp: 6000, atk: 0, def: 80, res: 40, moveSpeed: 1.2, baseAttackTime: 2, rangeRadius: 2.5,
    applyWay: 'NONE', motion: 'FLY', massLevel: 0, tags: ['drone'], talents: { magdef_add: { magic_resistance: 30 } },
  },
  enemy_1355_mrfly_2: {
    name: '护障·P', maxHp: 10000, atk: 0, def: 80, res: 50, moveSpeed: 1.2, baseAttackTime: 2, rangeRadius: 2.5,
    applyWay: 'NONE', motion: 'FLY', massLevel: 0, tags: ['drone'], talents: { magdef_add: { magic_resistance: 30 } },
  },
  enemy_1407_hummbd: {
    name: '远眺', maxHp: 4500, atk: 250, def: 120, res: 20, moveSpeed: 0.7, baseAttackTime: 3, rangeRadius: 2,
    applyWay: 'RANGED', motion: 'FLY', massLevel: 1, tags: ['drone'],
    talents: { Expose: { 'weak[limit]': 8, range_radius: 1.7, damage_scale: 1.2 } },
  },
  enemy_scout: {
    name: '侦察', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 1,
    talents: { Expose: { 'weak[limit]': 5, damage_scale: 1.2 } },
  },
  enemy_mouse: {
    name: '鼠', maxHp: 100, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { defup: { def: 3000 } },
  },
};

/**
 * The tiny map: `foes` [key, row, col] spawn rooted at (col, row); then `ops` [key, row, col] deploy.
 * @param {[string, number, number][]} foes
 * @param {{ ops?: [string, number, number][] }} [o]
 */
function arena(foes, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = Object.fromEntries(Object.entries(ENEMIES).map(([k, e]) => [k, withFoeExtras(k, e)]));
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(foes.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  Object.assign(c.operators.guard, { cost: 0, maxHp: 1e6 });
  Object.assign(c.operators.sniper, { cost: 0, maxHp: 1e6 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.kind === KIND.ENEMY);
  es.forEach((e, i) => {
    const [, row, col] = foes[i];
    Object.assign(e, { x: col, y: row, path: [], pt: 0 });
    status.applyStatus(e, 'root', {});
  });
  const ops = o.ops ?? [];
  if (ops.length) step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  return { c, w, es, ops: w.units.filter((u) => u.kind === KIND.OPERATOR) };
}

/** Runs n frames. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const e of step(w, c)) out.push(e);
  return out;
}

const S = attrs.statsOf;
/** @param {Unit} u @param {string} key */
const buff = (u, key) => u.buffs.find((b) => b.key === key);
/** @param {Unit} u @param {number} x */
const put = (u, x) => { u.x = x; };

test('[敌能-35] 御4: 防御力 +300 inside 2.5, not outside, not itself, not a neutral; it does not attack', () => {
  const { c, w, es: [drone, inside, outside, neutral] } = arena([
    ['enemy_1017_defdrn', 1, 1], ['enemy_1087_ltwolf', 1, 1], ['enemy_1087_ltwolf', 1, 1], ['neutral_wolf', 1, 1],
  ]);
  put(inside, 1 + 2.5);
  put(outside, 1 + 2.6);
  put(neutral, 2);
  const ev = run(w, c, 40);
  assert.equal(S(inside).def, 300);
  assert.equal(S(outside).def, 0);
  assert.equal(S(drone).def, 150);
  assert.equal(S(neutral).def, 0);
  assert.equal(S(drone).flags.noAttack, true);
  assert.equal(ev.filter((e) => e.type === 'hit' && e.id === drone.id).length, 0);
});

test('[敌能-35] 御4: two holders lend one +300; one silenced holder leaves it, both drop it', () => {
  const { c, w, es: [a, b, wolfU] } = arena([
    ['enemy_1017_defdrn', 1, 1], ['enemy_1017_defdrn', 1, 2], ['enemy_1087_ltwolf', 1, 3],
  ]);
  run(w, c, 2);
  assert.equal(S(wolfU).def, 300);
  assert.equal(wolfU.buffs.filter((x) => x.key === 'defup').length, 1);
  status.applyStatus(a, 'silence', {});
  run(w, c, 2);
  assert.equal(S(wolfU).def, 300, 'the other holder still lends the one key');
  status.applyStatus(b, 'silence', {});
  run(w, c, 3);
  assert.equal(S(wolfU).def, 0);
});

test('[敌能-35] 寒霜: 攻击速度 ×0.5 inside 2.5, no 防御力, no attack; the tumour key stays unused', () => {
  const frost = withFoeExtras('enemy_1042_frostd', /** @type {any} */ (rm05).enemies.enemy_1042_frostd);
  assert.equal(frost.talents?.atkSpeedDown?.range_radius, 2.5);
  assert.equal(frost.talents?.atkSpeedDown?.attack_speed, -0.5);
  assert.equal(frost.talents?.defup?.def, undefined);
  const { c, w, es: [holder, ally, neutral], ops: [near, far] } = arena([
    ['enemy_1042_frostd', 1, 1], ['enemy_1087_ltwolf', 1, 2], ['neutral_wolf', 1, 2],
  ], { ops: [['guard', 1, 3], ['sniper', 0, 3]] });
  put(near, 1 + 2.5);
  far.y = 1;
  put(far, 1 + 2.6);
  const ev = run(w, c, 40);
  assert.equal(S(near).aspd, 50);
  assert.equal(S(far).aspd, 100);
  assert.equal(S(near).def, 100);
  assert.equal(S(ally).def, 0);
  assert.equal(S(neutral).aspd, 100);
  assert.equal(buff(near, 'frostAspd')?.mods.aspdPct, -0.5);
  assert.equal(buff(near, 'atkSpeedDown'), undefined);
  assert.equal(S(holder).flags.noAttack, true);
  assert.equal(ev.filter((e) => e.type === 'hit' && e.id === holder.id).length, 0);
});

test('[敌能-35] 寒霜: two holders do not stack the slow; silence drops it and the attack stays off', () => {
  const { c, w, ops: [g] } = arena([
    ['enemy_1042_frostd', 1, 1], ['enemy_1042_frostd', 1, 2],
  ], { ops: [['guard', 1, 3]] });
  run(w, c, 2);
  assert.equal(S(g).aspd, 50);
  assert.equal(g.buffs.filter((b) => b.key === 'frostAspd').length, 1);
  for (const e of w.units) if (e.kind === KIND.ENEMY) status.applyStatus(e, 'silence', {});
  run(w, c, 3);
  assert.equal(S(g).aspd, 100);
  assert.equal(w.units.filter((u) => u.kind === KIND.ENEMY).every((u) => S(u).flags.noAttack === true), true);
});

test('[敌能-35] 畸变恶性瘤: still only its blocker, at a fifth of its speed, and not on the 寒霜 key', () => {
  const { c, w, es: [e], ops: [blocker, bystander] } = arena(
    [['enemy_1138_tumor', 1, 2]], { ops: [['guard', 1, 2], ['sniper', 2, 3]] });
  run(w, c, 2);
  assert.equal(S(blocker).aspd, 20);
  assert.equal(S(bystander).aspd, 100);
  assert.equal(buff(blocker, 'atkSpeedDown')?.mods.aspdPct, -0.8);
  assert.equal(buff(blocker, 'frostAspd'), undefined);
  assert.equal(buff(bystander, 'atkSpeedDown'), undefined);
  e.hp = 0;
  run(w, c, 3);
  assert.equal(S(blocker).aspd, 100);
});

test('[敌能-35] 护障: 法术抗性 +30 inside rangeRadius 2.5, not at 2.75, not itself', () => {
  const { c, w, es: [fly, inside, edge, onTop] } = arena([
    ['enemy_1355_mrfly', 1, 1], ['enemy_1087_ltwolf', 1, 1], ['enemy_1087_ltwolf', 1, 1], ['enemy_1087_ltwolf', 1, 1],
  ]);
  put(inside, 1 + 2.5);
  put(edge, 1 + 2.75);
  put(onTop, 1);
  run(w, c, 2);
  assert.equal(S(inside).res, 50);
  assert.equal(S(edge).res, 20, '2.75 is inside attack reach +0.25 and outside this aura');
  assert.equal(S(onTop).res, 50);
  assert.equal(S(fly).res, 40);
});

test('[敌能-35] 护障: 护障 and 护障·P lend one +30; silence drops it', () => {
  const { c, w, es: [a, b, wolfU] } = arena([
    ['enemy_1355_mrfly', 1, 1], ['enemy_1355_mrfly_2', 1, 2], ['enemy_1087_ltwolf', 1, 3],
  ]);
  run(w, c, 2);
  assert.equal(S(wolfU).res, 50);
  assert.equal(wolfU.buffs.filter((x) => x.key === 'magdef').length, 1);
  status.applyStatus(a, 'silence', {});
  status.applyStatus(b, 'silence', {});
  run(w, c, 3);
  assert.equal(S(wolfU).res, 20);
});

test('[敌能-35] 远眺: death gives 脆弱 v = 1.2 − 1 for 8s inside 1.7, not outside', () => {
  const { c, w, es: [bird], ops: [near, far] } = arena(
    [['enemy_1407_hummbd', 1, 1]], { ops: [['guard', 1, 2], ['sniper', 0, 3]] });
  // 1.7 is not dyadic: (1 + 1.7) − 1 is just past 1.7, so the edge is measured from x = 0.
  bird.x = 0;
  near.y = bird.y;
  far.y = bird.y;
  put(near, 1.7);
  put(far, 1.8);
  bird.hp = 0;
  run(w, c, 1);
  const fr = near.buffs.filter((b) => b.key === 'fragile');
  assert.equal(fr.length, 1);
  assert.equal(fr[0].value, 1.2 - 1);
  assert.equal(fr[0].mods.dmgTakenMul, 1 + (1.2 - 1));
  assert.equal(fr[0].left, 240);
  assert.equal(far.buffs.some((b) => b.key === 'fragile'), false);
});

test('[敌能-35] 远眺: two deaths stay one 20% 脆弱; a stronger one stays; a silenced death applies none', () => {
  const both = arena([['enemy_1407_hummbd', 1, 1], ['enemy_1407_hummbd', 1, 1]], { ops: [['guard', 1, 2]] });
  both.es[0].hp = 0;
  both.es[1].hp = 0;
  run(both.w, both.c, 1);
  const fr = both.ops[0].buffs.filter((b) => b.key === 'fragile');
  assert.equal(fr.length, 2);
  assert.equal(attrs.activeBuffs(both.ops[0].buffs).find((b) => b.key === 'fragile')?.value, 1.2 - 1);
  const strong = arena([['enemy_1407_hummbd', 1, 1]], { ops: [['guard', 1, 2]] });
  status.applyStatus(strong.ops[0], 'fragile', { seconds: 20, value: 0.5 });
  strong.es[0].hp = 0;
  run(strong.w, strong.c, 1);
  assert.equal(attrs.activeBuffs(strong.ops[0].buffs).find((b) => b.key === 'fragile')?.value, 0.5);
  const quiet = arena([['enemy_1407_hummbd', 1, 1]], { ops: [['guard', 1, 2]] });
  status.applyStatus(quiet.es[0], 'silence', {});
  quiet.es[0].hp = 0;
  run(quiet.w, quiet.c, 1);
  assert.equal(quiet.ops[0].buffs.some((b) => b.key === 'fragile'), false);
});

test('[敌能-35] a radius-less Expose and a def-only defup stay uncovered and do nothing', () => {
  const bare = (/** @type {Record<string, Record<string, number>>} */ talents) => uncoveredAbilities([/** @type {any} */ ({ talents })]);
  assert.deepEqual(bare({ Expose: { 'weak[limit]': 5, damage_scale: 1.2 } }), ['Expose']);
  assert.deepEqual(bare({ defup: { def: 3000 } }), ['defup']);
  assert.deepEqual(bare({
    Expose: { 'weak[limit]': 8, range_radius: 1.7, damage_scale: 1.2 },
    defup: { range_radius: 2.5 }, atkSpeedDown: { attack_speed: -0.8 }, magdef_add: { magic_resistance: 30 },
  }), []);
  const { c, w, es: [scout, mouse, wolfU], ops: [g] } = arena([
    ['enemy_scout', 1, 1], ['enemy_mouse', 1, 1], ['enemy_1087_ltwolf', 1, 2],
  ], { ops: [['guard', 1, 2]] });
  run(w, c, 2);
  assert.equal(S(wolfU).def, 0);
  assert.equal(S(mouse).flags.noAttack, undefined);
  scout.hp = 0;
  run(w, c, 1);
  assert.equal(g.buffs.some((b) => b.key === 'fragile'), false);
});
