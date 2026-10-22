// Support auras and 远眺's death debuff (docs/spec/foes.md 敌能-35) on the tiny map. Blackboards are the enemy_database
// values: 御4 and 寒霜 from act1multi_rm05 (commit 17759cc8); 护障 and 远眺 are not in an extracted level, so the test
// builds those records with the same blackboards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, KIND, damage, buffs, elements } from '@aue/sim';
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
/** The 脆弱 this expose applies (敌能-54, 敌能-35). @param {Unit} u */
const exposed = (u) => u.buffs.filter((b) => b.key === 'fragile');
/** Stops an operator attacking while a test steps; the hits are dealt directly. @param {Unit} u */
const hold = (u) => { buffs.addBuff(u, buffs.makeBuff({ key: 'hold', flags: { noAttack: true } })); };

/**
 * One scout and the operators named, held so stepping does not add hits.
 * @param {[string, number, number][]} [ops]
 */
function scouts(ops = [['guard', 1, 2]]) {
  const a = arena([['enemy_scout', 1, 1]], { ops });
  for (const u of a.ops) hold(u);
  return a;
}

/** @param {World} w @param {any} c @param {Unit | null} src @param {Unit} t @param {{ type: 'phys' | 'arts' | 'true' | 'elemental', amount: number, sourceless?: boolean, hpLoss?: boolean, isSplash?: boolean }} [dmg] */
const hit = (w, c, src, t, dmg = { type: 'true', amount: 10 }) => damage.dealDamage(w, src, t, dmg, c);

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

test('[敌能-35] [敌能-54] a def-only defup stays uncovered; radius-less Expose is covered and a death alone exposes nobody', () => {
  const bare = (/** @type {Record<string, Record<string, number>>} */ talents) => uncoveredAbilities([/** @type {any} */ ({ talents })]);
  assert.deepEqual(bare({ Expose: { 'weak[limit]': 5, damage_scale: 1.2 } }), []);
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
  assert.equal(exposed(g).length, 0);
});

test('[敌能-54] an operator hit exposes it for 5s at ×1.2; that hit is not amplified', () => {
  const { c, w, es: [scout], ops: [g] } = scouts();
  const before = scout.hp;
  assert.equal(hit(w, c, g, scout, { type: 'true', amount: 100 }), 100);
  assert.equal(before - scout.hp, 100);
  const fr = exposed(g);
  assert.equal(fr.length, 1);
  assert.equal(fr[0].value, 1.2 - 1);
  assert.equal(fr[0].mods.dmgTakenMul, 1.2);
  assert.equal(fr[0].left, 150);
  const gp = g.hp;
  assert.equal(hit(w, c, scout, g, { type: 'true', amount: 100 }), 120);
  assert.equal(gp - g.hp, 120);
});

test('[敌能-54] a device, a sourceless hit, silence, another enemy, and a dead operator do not expose', () => {
  const device = scouts();
  device.ops[0].kind = KIND.DEVICE;
  hit(device.w, device.c, device.ops[0], device.es[0]);
  assert.equal(exposed(device.ops[0]).length, 0);
  const none = scouts();
  hit(none.w, none.c, none.ops[0], none.es[0], { type: 'true', amount: 10, sourceless: true });
  assert.equal(exposed(none.ops[0]).length, 0);
  const quiet = scouts();
  status.applyStatus(quiet.es[0], 'silence', {});
  hit(quiet.w, quiet.c, quiet.ops[0], quiet.es[0]);
  assert.equal(exposed(quiet.ops[0]).length, 0);
  const { c, w, es: [scout, wolfU], ops: [g] } = arena([
    ['enemy_scout', 1, 1], ['enemy_1087_ltwolf', 1, 2],
  ], { ops: [['guard', 1, 3]] });
  hold(g);
  hit(w, c, wolfU, scout);
  assert.equal(exposed(wolfU).length, 0);
  assert.equal(exposed(g).length, 0);
  g.hp = 0;
  hit(w, c, g, scout);
  assert.equal(exposed(g).length, 0);
});

test('[敌能-54] re-applying keeps two 脆弱 buffs at ×1.2; the later one waits, then lasts', () => {
  const { c, w, es: [scout], ops: [g] } = scouts();
  hit(w, c, g, scout);
  assert.equal(exposed(g)[0].left, 150);
  run(w, c, 100);
  assert.equal(exposed(g)[0].left, 50);
  hit(w, c, g, scout);
  assert.equal(exposed(g).length, 2);
  assert.equal(attrs.activeBuffs(g.buffs).find((b) => b.key === 'fragile')?.value, 1.2 - 1);
  const gp = g.hp;
  hit(w, c, scout, g, { type: 'true', amount: 100 });
  assert.equal(gp - g.hp, 120);
  run(w, c, 50);
  assert.equal(exposed(g).length, 1);
  assert.equal(exposed(g)[0].value, 1.2 - 1);
  const later = g.hp;
  hit(w, c, scout, g, { type: 'true', amount: 100 });
  assert.equal(later - g.hp, 120);
});

test('[敌能-54] splash, arts, true and elemental HP damage expose; element injury, 生命流失, a shield and a zero hit do not', () => {
  const splash = scouts();
  hit(splash.w, splash.c, splash.ops[0], splash.es[0], { type: 'true', amount: 10, isSplash: true });
  assert.equal(exposed(splash.ops[0]).length, 1);
  const arts = scouts();
  hit(arts.w, arts.c, arts.ops[0], arts.es[0], { type: 'arts', amount: 100 });
  assert.equal(exposed(arts.ops[0]).length, 1);
  const el = scouts();
  const [eg, es] = [el.ops[0], el.es[0]];
  hit(el.w, el.c, eg, es, { type: 'elemental', amount: 100 });
  assert.equal(exposed(eg).length, 1);
  const ep = eg.hp;
  hit(el.w, el.c, es, eg, { type: 'elemental', amount: 100 });
  assert.equal(ep - eg.hp, 100);
  const gauge = scouts();
  elements.dealEp(gauge.w, gauge.es[0], 'FIRE', 100, gauge.ops[0]);
  assert.equal(exposed(gauge.ops[0]).length, 0);
  const loss = scouts();
  hit(loss.w, loss.c, loss.ops[0], loss.es[0], { type: 'phys', amount: 40, hpLoss: true });
  assert.equal(exposed(loss.ops[0]).length, 0);
  const pad = scouts();
  buffs.addBuff(pad.es[0], buffs.makeBuff({ key: 'pad', shieldHits: 1 }));
  assert.equal(hit(pad.w, pad.c, pad.ops[0], pad.es[0], { type: 'true', amount: 50 }), 0);
  assert.equal(exposed(pad.ops[0]).length, 0);
  const zero = scouts();
  assert.equal(hit(zero.w, zero.c, zero.ops[0], zero.es[0], { type: 'true', amount: 0 }), 0);
  assert.equal(exposed(zero.ops[0]).length, 0);
});

test('[敌能-54] a summon is exposed, a device summon and a tactical point are not; 隐匿 does not stop it; the killing hit does', () => {
  const owned = scouts([['guard', 1, 2], ['sniper', 0, 3]]);
  const [owner, summon] = owned.ops;
  summon.summoner = owner.id;
  owned.c.operators.sniper.summon = { deployLimit: 1, holdLimit: 1, supply: 0, occupy: 0, respawn: 'default' };
  hit(owned.w, owned.c, summon, owned.es[0]);
  assert.equal(exposed(summon).length, 1);
  assert.equal(exposed(owner).length, 0);
  const dev = scouts([['sniper', 0, 3]]);
  dev.c.operators.sniper.summon = { deployLimit: 1, holdLimit: 1, supply: 0, occupy: 0, respawn: 'default', device: true };
  hit(dev.w, dev.c, dev.ops[0], dev.es[0]);
  assert.equal(exposed(dev.ops[0]).length, 0);
  const point = scouts();
  buffs.addBuff(point.ops[0], buffs.makeBuff({ key: 'tactical', left: 90 }));
  hit(point.w, point.c, point.ops[0], point.es[0]);
  assert.equal(exposed(point.ops[0]).length, 0);
  const form = scouts();
  buffs.addBuff(form.ops[0], buffs.makeBuff({ key: 'tactical' }));
  hit(form.w, form.c, form.ops[0], form.es[0]);
  assert.equal(exposed(form.ops[0]).length, 1);
  const hidden = scouts();
  buffs.addBuff(hidden.es[0], buffs.makeBuff({ key: 'hide', flags: { stealth: true } }));
  buffs.addBuff(hidden.ops[0], buffs.makeBuff({ key: 'hide', flags: { stealth: true } }));
  hit(hidden.w, hidden.c, hidden.ops[0], hidden.es[0]);
  assert.equal(exposed(hidden.ops[0]).length, 1);
  const kill = scouts();
  assert.equal(hit(kill.w, kill.c, kill.ops[0], kill.es[0], { type: 'true', amount: 100 }), 100);
  assert.equal(kill.es[0].hp, 0);
  run(kill.w, kill.c, 1);
  assert.equal(exposed(kill.ops[0]).length, 1);
  assert.equal(exposed(kill.ops[0])[0].value, 1.2 - 1);
});

test('[敌能-35] [敌能-54] a hit on 远眺 does not expose; the death aura is unchanged', () => {
  const { c, w, es: [bird], ops: [g] } = arena([['enemy_1407_hummbd', 1, 1]], { ops: [['guard', 1, 2]] });
  hold(g);
  hit(w, c, g, bird, { type: 'true', amount: 10 });
  assert.equal(exposed(g).length, 0);
  bird.hp = 0;
  run(w, c, 1);
  assert.equal(exposed(g).length, 1);
  assert.equal(exposed(g)[0].value, 1.2 - 1);
  assert.equal(exposed(g)[0].left, 240);
});
