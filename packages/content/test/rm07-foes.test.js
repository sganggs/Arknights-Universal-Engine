// The enemies of IG-14 创造与繁殖 (docs/spec/foes.md 敌能-23…敌能-32) on the tiny map, rooted where they are put: broods
// and splits, the 恶性瘤's slowing, the infiltrators' hologram, the partisans' 战术命令 and splashes, the ice-field
// enemies, the 重生造物 and their supply, 凋亡 and the 死亡之眼, 吞噬, the spies' cost drain, the sentries' alarm.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, elements, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent } from '../src/index.js';
import { withFoeExtras } from '../src/foes.js';
import rm07 from '../data/levels/act1multi_rm07.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/**
 * The tiny map with IG-14's enemies: `foes` [key, row, col, free] spawn in frame 0 and stand at (row, col) — rooted
 * unless `free` —; then the operators `ops` [key, row, col] are deployed; guard and sniper of a million HP with what
 * `guard` and `sniper` give.
 * @param {[string, number, number, boolean?][]} foes
 * @param {{ ops?: [string, number, number][], guard?: Record<string, unknown>, sniper?: Record<string, unknown>, tweak?: (c: any) => void }} [o]
 */
function arena(foes, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = Object.fromEntries(Object.entries(/** @type {any} */ (rm07).enemies).map(([k, e]) => [k, withFoeExtras(k, /** @type {any} */ (e))]));
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(foes.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  Object.assign(c.operators.guard, { cost: 0, maxHp: 1e6, ...o.guard });
  Object.assign(c.operators.sniper, { cost: 0, maxHp: 1e6, ...o.sniper });
  o.tweak?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.kind === KIND.ENEMY);
  es.forEach((e, i) => {
    const [, row, col, free] = foes[i];
    Object.assign(e, { x: col, y: row, path: [], pt: 0 });
    if (!free) status.applyStatus(e, 'root', {});
  });
  if (o.ops?.length) step(w, c, o.ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  const ops = w.units.filter((u) => u.kind === KIND.OPERATOR);
  return { c, w, es, ops };
}
/** Runs n frames, returning the events with their frame. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const e of step(w, c)) out.push({ ...e, f: w.frame - 1 });
  return out;
}
const S = attrs.statsOf;
const has = (/** @type {Unit} */ u, /** @type {string} */ key) => u.buffs.some((b) => b.key === key);
const spawned = (/** @type {any[]} */ ev, /** @type {string} */ key) => ev.filter((x) => x.type === 'spawn' && x.key === key);
const dark = (/** @type {Unit} */ u) => elements.epOf(u, 'DARK');

test('[敌能-23] 变异巨岩蛛: a 畸变赘生物 at its tile\'s centre every 5 s; knocked down, four around it 0.2 s later — none when silenced or fallen', () => {
  const { c, w, es: [e] } = arena([['enemy_1133_harchn', 1, 3]]);
  const ev = run(w, c, 151), first = spawned(ev, 'enemy_1137_plasm');
  assert.deepEqual(first.map((x) => x.f), [150]);
  e.hp = 0;
  const died = w.frame, brood = spawned(run(w, c, 8), 'enemy_1137_plasm');
  assert.deepEqual(brood.map((x) => x.f), [died + 6, died + 6, died + 6, died + 6]);
  const quiet = arena([['enemy_1133_harchn', 1, 3]]);
  status.applyStatus(quiet.es[0], 'silence', {});
  run(quiet.w, quiet.c, 160);
  quiet.es[0].hp = 0;
  assert.equal(spawned(run(quiet.w, quiet.c, 10), 'enemy_1137_plasm').length, 0, 'silenced: no split, no brood');
  const hole = arena([['enemy_1133_harchn', 0, 4]], { tweak: (cc) => { cc.level.tiles[0][4] = { ...cc.level.tiles[0][4], key: 'tile_hole' }; } });
  const fell = run(hole.w, hole.c, 10);
  assert.ok(!hole.w.units.includes(hole.es[0]) && spawned(fell, 'enemy_1137_plasm').length === 0, 'a fall brings none');
});

test('[敌能-23] 畸变恶性瘤: the unit blocking it attacks at a fifth of its speed while it does, back within two frames of it gone', () => {
  const { c, w, es: [e], ops: [g] } = arena([['enemy_1138_tumor', 1, 2]], { ops: [['guard', 1, 2]] });
  run(w, c, 2);
  assert.equal(S(g).aspd, 20);
  e.hp = 0;
  run(w, c, 3);
  assert.equal(S(g).aspd, 100);
});

test('[敌能-24] “红标”渗透者: a frame after its first damage a rooted hologram where it stands; meanwhile no attacks, unblockable, 嘲讽 −1; it takes the hologram with it', () => {
  const { c, w, es: [e] } = arena([['enemy_1136_redace', 1, 3]]);
  run(w, c, 2);
  e.hp -= 10;
  const ev = run(w, c, 2), [h] = w.units.filter((u) => u.key === 'enemy_1139_hologc');
  assert.equal(spawned(ev, 'enemy_1139_hologc').length, 1);
  assert.deepEqual([h.x, h.y, S(h).immobile], [3, 1, true]);
  assert.deepEqual([S(e).flags.noAttack, S(e).flags.unblockable, S(e).taunt, S(e).blockCnt], [true, true, -1, 0]);
  e.hp -= 10;
  assert.equal(spawned(run(w, c, 3), 'enemy_1139_hologc').length, 0, 'only the first time');
  e.hp = 0;
  run(w, c, 1);
  assert.ok(!w.units.includes(h), 'gone with it');
  run(w, c, 2);
});

test('[敌能-25] 传令兵: every enemy 攻击力 +10%, 防御力 +100 and the 战术命令 while it is there — not twice for two —; 战士 faster, 迫击炮兵 quicker under it; 盾卫 嘲讽 +1', () => {
  const { c, w, es: [herald, herald2, fighter, mortar, shield] } = arena([
    ['enemy_1080_sotidp', 1, 4], ['enemy_1080_sotidp_2', 0, 4], ['enemy_1078_sotisc', 1, 3], ['enemy_1082_soticn', 1, 2], ['enemy_1081_sotisd', 1, 1]]);
  run(w, c, 3);
  assert.deepEqual([S(fighter).atk, S(fighter).def, S(fighter).moveSpeed, S(mortar).aspd, S(shield).taunt, S(herald).atk], [330, 400, 1.1 * 1.3, 150, 1, 330]);
  herald.hp = 0; herald2.hp = 0;
  run(w, c, 4);
  assert.deepEqual([S(fighter).atk, S(fighter).moveSpeed, S(mortar).aspd, has(fighter, 'command')], [300, 1.1, 100, false]);
});

test('[敌能-26] 爆破攻坚手 hits the unit next to its target at half; 迫击炮兵\'s shell hits the eight tiles around alike', () => {
  const blast = arena([['enemy_1076_bsthmr', 1, 2]], { ops: [['guard', 1, 2], ['sniper', 0, 2]], guard: { def: 0 }, sniper: { def: 0 } });
  run(blast.w, blast.c, 60);
  const [g, s] = blast.ops;
  assert.ok(g.hp < 1e6 && 1e6 - s.hp === (1e6 - g.hp) / 2, `${1e6 - g.hp} and ${1e6 - s.hp}`);
  const shell = arena([['enemy_1082_soticn', 1, 4]], { ops: [['guard', 1, 2], ['sniper', 0, 2]], guard: { def: 0 }, sniper: { def: 0 } });
  run(shell.w, shell.c, 60);
  assert.ok(shell.ops[0].hp < 1e6 && shell.ops[0].hp === shell.ops[1].hp);
});

test('[敌能-27] 冰原术师: two targets, every third attack gives 寒冷; 抵抗. 凿冰人 ×2.5 and 冰原狂战士 ×2 on a frozen target. 冰原猎人: the blocker without a projectile, else the lowest 防御力', () => {
  const ice = arena([['enemy_1192_krgscr', 1, 4]], { ops: [['guard', 1, 2], ['sniper', 0, 3]] });
  const [g, s] = ice.ops;
  assert.ok(has(ice.es[0], 'buffres'));
  run(ice.w, ice.c, 230);
  assert.ok(g.hp < 1e6 && s.hp < 1e6 && !has(g, 'enemyCold'), 'two attacks on both, no 寒冷 yet');
  run(ice.w, ice.c, 140);
  assert.ok(has(g, 'enemyCold') && has(s, 'enemyCold'), 'the third');
  for (const [key, k] of /** @type {[string, number][]} */ ([['enemy_1069_icebrk', 2.5], ['enemy_1193_krgbsk_2', 2]])) {
    const hurt = [true, false].map((frozen) => {
      const a = arena([[key, 1, 2]], { ops: [['guard', 1, 2]], guard: { def: 0 } });
      if (frozen) status.applyStatus(a.ops[0], 'freeze', { seconds: 100 });
      const hp = a.ops[0].hp;
      run(a.w, a.c, 130);
      return hp - a.ops[0].hp;
    });
    assert.ok(hurt[1] > 0 && hurt[0] === hurt[1] * k, `${key}: ${hurt}`);
  }
  assert.ok(has(arena([['enemy_1193_krgbsk_2', 1, 2]]).es[0], 'buffres'));
  const far = arena([['enemy_1190_krgbow_2', 1, 4]], { ops: [['guard', 1, 2], ['sniper', 0, 3]], guard: { def: 500 }, sniper: { def: 20 } });
  const shots = run(far.w, far.c, 120).filter((x) => x.type === 'attack' && x.id === far.es[0].id).map((x) => x.target);
  assert.deepEqual(shots, [far.ops[1].id], 'the sniper: the lowest 防御力');
  const near = arena([['enemy_1190_krgbow_2', 1, 2]], { ops: [['guard', 1, 2], ['sniper', 0, 3]], guard: { def: 500 }, sniper: { def: 20 } });
  const ev = run(near.w, near.c, 120);
  assert.deepEqual(ev.filter((x) => x.type === 'attack' && x.id === near.es[0].id).map((x) => x.target), [near.ops[0].id], 'blocked: the guard');
  assert.ok(!ev.some((x) => x.type === 'shot' && x.id === near.es[0].id), 'without a projectile');
});

test('[敌能-28] 大君之赐 takes a tenth of physical damage and makes its blocker hold one more, six at most; supply carts feed 重生造物, a 集恨者 grows with them and leaves one behind', () => {
  const plain = arena([['enemy_1221_dzomg', 1, 2]], { ops: [['guard', 1, 2]], guard: { atk: 1000 } });
  const ev = run(plain.w, plain.c, 40), hits = ev.filter((x) => x.type === 'hit' && x.target === plain.es[0].id);
  assert.ok(hits.length > 0 && hits.every((x) => Math.abs(x.damage - 80) < 1e-9), JSON.stringify(hits.map((x) => x.damage)));
  const crowd = arena(Array.from({ length: 7 }, () => /** @type {[string, number, number]} */ (['enemy_1221_dzomg', 1, 2])), { ops: [['guard', 1, 2]], guard: { blockCnt: 8 } });
  run(crowd.w, crowd.c, 5);
  assert.equal(S(crowd.ops[0]).blockCnt, 14);
  const fed = arena([['enemy_1224_dsuply', 1, 4], ['enemy_1224_dsuply', 0, 4], ['enemy_1224_dsuply_2', 2, 4], ['enemy_1221_dzomg', 1, 2]], { ops: [['guard', 1, 2]], guard: { maxEp: 1e6 } });
  const z = fed.es[3], g = fed.ops[0], ep = dark(g);
  const fedHits = run(fed.w, fed.c, 130).filter((x) => x.type === 'hit' && x.id === z.id).length;
  assert.equal(S(z).atk, 680 * 1.3);
  assert.ok(fedHits > 0 && Math.abs(ep - dark(g) - fedHits * 884 * 0.2) < 1e-6, `凋亡 ${ep - dark(g)} over ${fedHits} hits`);
  for (const cart of fed.es.slice(0, 3)) status.applyStatus(cart, 'silence', {});
  run(fed.w, fed.c, 3);
  assert.equal(S(z).atk, 680, 'silenced carts: nothing');
  const lord = arena([['enemy_1226_dklord', 1, 4], ['enemy_1221_dzomg', 1, 3], ['enemy_1221_dzomg', 0, 3]]);
  run(lord.w, lord.c, 2);
  assert.equal(S(lord.es[0]).atk, 1000 * 1.3);
  lord.es[0].hp = 0;
  const died = lord.w.frame, left = spawned(run(lord.w, lord.c, 32), 'enemy_1221_dzomg');
  assert.deepEqual(left.map((x) => x.f), [died + 30]);
});

test('[敌能-29] 凋亡 on 王庭军战士\'s hits; 死亡之眼: 8 s of arts on one target, silence kept off, then 凋亡 on it and the units next to it', () => {
  const guard = { maxEp: 1e6, def: 0, res: 0 };
  const soldier = arena([['enemy_1229_darmy', 1, 2]], { ops: [['guard', 1, 2]], guard }), ep = dark(soldier.ops[0]);
  const n = run(soldier.w, soldier.c, 160).filter((x) => x.type === 'hit' && x.id === soldier.es[0].id).length;
  assert.ok(n > 0 && Math.abs(ep - dark(soldier.ops[0]) - n * 240 * 0.37) < 1e-6);
  const mage = arena([['enemy_1275_dwlock', 1, 4]], { ops: [['guard', 1, 2], ['sniper', 0, 2]], guard, sniper: { ...guard } });
  const [g, s] = mage.ops, e = mage.es[0];
  run(mage.w, mage.c, 298);
  const before = [dark(g), dark(s)], hp = [g.hp, s.hp];
  const start = run(mage.w, mage.c, 2);
  assert.ok(has(e, 'deathEye') && S(e).immobile && !start.some((x) => x.type === 'attack' && x.id === e.id));
  status.applyStatus(e, 'silence', { seconds: 20 });
  assert.equal(S(e).flags.silence, undefined, '沉默反制');
  const ev = run(mage.w, mage.c, 240);
  const target = g.hp < hp[0] ? g : s, ticks = ev.filter((x) => x.type === 'hit' && x.id === e.id && x.target === target.id);
  assert.equal(ticks.length, 8);
  assert.ok([before[0] - dark(g), before[1] - dark(s)].every((x) => Math.abs(x - 450 * 2.2) < 1e-9), 'the target and the one next to it');
  assert.ok(!has(e, 'deathEye'));
});

test('[敌能-29] [敌能-2] 死亡之眼\'s cooldown waits while it channels: the next channel starts one cooldown after the last one ended, finished or stopped', () => {
  const { c, w, es: [e] } = arena([['enemy_1275_dwlock', 1, 4]], { ops: [['guard', 1, 2]], guard: { maxEp: 1e6, def: 0, res: 0 } });
  const cd = Math.round(c.enemies.enemy_1275_dwlock.skills.find((/** @type {any} */ s) => s.key === 'DeathEye').cooldown * 30);
  const left = () => e.ab['DeathEye.left'] ?? 0;
  const next = (/** @type {number} */ from) => { while (!(left() > 0) && w.frame < from + 3000) step(w, c); return w.frame - from; };
  next(w.frame);
  const held = e.ab['DeathEye.cd'];
  run(w, c, 30);
  assert.equal(e.ab['DeathEye.cd'], held, 'no cooldown while it channels');
  while (left() > 0) step(w, c);
  assert.equal(next(w.frame), cd, 'from the end of a finished channel');
  run(w, c, 30);
  status.applyStatus(e, 'stun', { seconds: 1 });
  step(w, c);
  assert.equal(left(), 0, 'stopped');
  assert.equal(next(w.frame), cd, 'from the frame it stopped');
});

test('[敌能-30] 枯朽吞噬者: blocked, it devours the guard — its card locked while it stands — and turns 饱腹: 防御力 +700, 移动速度 −30%', () => {
  const { c, w, es: [e], ops: [g] } = arena([['enemy_1271_nhkodo', 1, 2]], { ops: [['guard', 1, 2]] });
  run(w, c, 3);
  assert.ok(!w.units.includes(g));
  assert.deepEqual([w.players[0].cards.guard.lock, S(e).def, S(e).moveSpeed], [e.id, 700, 0.6 * 0.7]);
  e.hp = 0;
  run(w, c, 1);
  step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: 0 }]]);
  assert.ok(w.units.some((u) => u.key === 'guard'), 'free again');
});

test('[敌能-31] 悖谬谍报官: three ranged attacks, each costing the player hit 2 cost once it deals damage; then only the unit blocking it', () => {
  const { c, w, es: [e] } = arena([['enemy_1317_wdexg', 1, 4]], { ops: [['guard', 1, 2]] });
  const ev = run(w, c, 400), shots = ev.filter((x) => x.type === 'attack' && x.id === e.id).map((x) => x.f);
  assert.deepEqual([shots.length, w.players[0].cost], [2, 99 - 6], 'the first as the guard came, two more; 6 cost');
  assert.ok(shots[1] < 300, 'none after the third');
});

test('[敌能-32] 萨卡兹哨兵: 不死 until its alarm; hurt, within 0.2 s every enemy 攻击力/防御力 +30% (组长 +50%) and the mercenaries take up arms; one hurt takes up arms alone', () => {
  const { c, w, es: [sentry, chief, mage, sword] } = arena([['enemy_1073_dscout', 1, 4], ['enemy_1073_dscout_2', 0, 4], ['enemy_1074_dbskar', 1, 2], ['enemy_1075_dmgswd', 1, 3]]);
  run(w, c, 2);
  assert.deepEqual([S(sentry).flags.undying, S(mage).flags.noAttack, S(mage).immobile], [true, true, true]);
  sentry.hp -= 10;
  run(w, c, 7);
  assert.deepEqual([S(sword).atk, S(sword).def, S(sentry).flags.undying, has(chief, 'warn')], [400 * 1.3, 200 * 1.3, undefined, true]);
  assert.deepEqual([S(mage).flags.noAttack, has(mage, 'engaged'), S(sword).moveSpeed], [undefined, true, 0.4 * 3]);
  chief.hp -= 10;
  run(w, c, 7);
  assert.equal(S(sword).atk, 400 * 1.5, 'the strongest alarm');
  const alone = arena([['enemy_1075_dmgswd', 1, 3, true]]);
  run(alone.w, alone.c, 2);
  assert.equal(S(alone.es[0]).moveSpeed, 0.4);
  alone.es[0].hp -= 10;
  run(alone.w, alone.c, 2);
  assert.equal(S(alone.es[0]).moveSpeed, 0.4 * 3);
});

test('[敌能-27] 积怨者 under arms: two targets at once, without a projectile', () => {
  const { c, w, es: [e], ops: [g, s] } = arena([['enemy_1074_dbskar', 1, 4]], { ops: [['guard', 1, 2], ['sniper', 0, 3]] });
  e.hp -= 100;
  const ev = run(w, c, 60);
  assert.ok(g.hp < 1e6 && s.hp < 1e6, 'both');
  assert.ok(!ev.some((x) => x.type === 'shot' && x.id === e.id));
});
