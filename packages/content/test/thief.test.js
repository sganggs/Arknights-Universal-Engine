// 荒原窃盗者 / 荒原劫掠者 and their 精英 (docs/spec/foes.md 敌能-12): whom 资源偷取 and 劫掠 rob. The thief stands rooted
// on the tiny map's road; its target is the only unit in its reach. Our units have no attack and a million HP; a
// guard's defence is 100, a sniper's 20. Deployed in frame 1, a 窃盗者 at (1, 1) attacks in frames 1, 61, 121 … (2 s,
// no attack time) and its shot lands 4 frames later; SP 2 makes the 3rd and 6th attack 资源偷取. A 劫掠者 at (1, 2),
// blocked by the unit on its tile, strikes in frames 1, 121, 241 … (4 s); SP 1 makes the 2nd and 4th one 劫掠.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, bus, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelAt, levelContent, carriedDef } from '../src/index.js';
import { uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */
/** @typedef {{ c: any, w: World, e: Unit, ev: any[] }} Box */

const LEVEL = 'act1multi_06';
const THIEF = 'enemy_1337_bhrknf', THIEF2 = 'enemy_1337_bhrknf_2', RAIDER = 'enemy_1339_bhrgrd', RAIDER2 = 'enemy_1339_bhrgrd_2';
/** The 携带物 赛场啦啦队 (符文-6): a player's card, an operator unit whose profession is 装置. */
const CHEER = await carriedDef('trap_201_muulco', { level: 1, skill: 0, skillLevel: 1 });

/** act1multi_06's assembled record of a key at a difficulty. @param {string} key @param {'NORMAL' | 'FOUR_STAR'} [d] @returns {EnemyDef} */
const real = (key, d = 'NORMAL') => /** @type {EnemyDef} */ (levelContent(LEVEL, d).enemies[key]);
/** A record with every skill's fields changed by `more` (sp, bb …) and its own fields by `own`. @param {EnemyDef} def @param {Record<string, any>} more @param {Record<string, any>} [own] @returns {EnemyDef} */
const varied = (def, more, own = {}) => /** @type {any} */ ({ ...def, ...own, skills: (def.skills ?? []).map((s) => ({ ...s, ...more, bb: { ...s.bb, ...more.bb } })) });

/**
 * Our units, none attacking: `g` a guard, `s` a sniper, `t` a sniper whose profession is 装置, `tg` such a guard,
 * `cheer` the 携带物; `s1` (taunting) and `s2` two snipers. A test makes one a summon by giving it a `summoner`.
 * @param {any} c
 */
function ours(c) {
  const body = { cost: 0, atk: 0, maxHp: 1e6 }, { guard, sniper } = c.operators;
  Object.assign(c.operators, {
    g: { ...guard, ...body, name: 'g' }, s: { ...sniper, ...body, name: 's' }, t: { ...sniper, ...body, name: 't', profession: 'TRAP' },
    tg: { ...guard, ...body, name: 'tg', profession: 'TRAP' }, cheer: { ...CHEER, ...body },
    s1: { ...sniper, ...body, name: 's1', tauntLevel: 1 }, s2: { ...sniper, ...body, name: 's2' },
  });
}

/**
 * The thief `def` rooted at (1, `o.x`): 1 for a shooter, 2 for a 劫掠者 (its blocker's tile). With `o.civ` a neutral unit
 * rooted at (1, 2); with `o.box` our device unit at (0, 2). `seats` [key, row, col, seat] are deployed in frame 1.
 * @param {EnemyDef} def @param {[string, number, number, number?][]} seats
 * @param {{ x?: number, civ?: boolean, box?: boolean, players?: number }} [o] @returns {Box}
 */
function stand(def, seats, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { foe: def, civ: { name: 'civ', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, 'foe'), ...(o.civ ? [spawnAt(0, 'civ')] : [])])];
  c.level.options = { ...c.level.options, initialCost: 20, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  ours(c);
  if (o.box) {
    c.devices = { box: { name: 'box', maxHp: 1e6, atk: 0, def: 0, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} } };
    c.level.predefines = [{ alias: 'box#1', key: 'box', hidden: false, row: 0, col: 2, dir: 'UP' }];
  }
  const w = createWorld(c, { seed: 1, players: o.players ?? 1 });
  const ev = step(w, c).map((x) => ({ ...x, f: 0 }));
  for (const u of w.units.filter((x) => x.kind === KIND.ENEMY)) {
    Object.assign(u, { x: u.key === 'civ' ? 2 : o.x ?? 1, y: 1, path: [], pt: 0 });
    status.applyStatus(u, 'root', {});
  }
  ev.push(...step(w, c, seats.map(([op, row, col, seat = 0]) => [seat, { type: 'deploy', op, row, col, dir: 0 }])).map((x) => ({ ...x, f: 1 })));
  return { c, w, e: /** @type {Unit} */ (w.units.find((u) => u.key === 'foe')), ev };
}

/** Steps n frames, keeping the events with their frame. @param {Box} box @param {number} n */
function run(box, n) {
  for (let i = 0; i < n; i++) for (const ev of step(box.w, box.c)) box.ev.push({ ...ev, f: box.w.frame - 1 });
}
/** The unit of a key. @param {Box} box @param {string} key */
const unit = (box, key) => /** @type {Unit} */ (box.w.units.find((u) => u.key === key));
/** Each player's cost. @param {Box} box */
const costs = (box) => box.w.players.map((p) => p.cost);
/** The thief's hits on a unit so far: [frame, damage]. @param {Box} box @param {Unit} t */
const hitsOn = (box, t) => box.ev.filter((x) => x.type === 'hit' && x.id === box.e.id && x.target === t.id).map((x) => [x.f, x.damage]);
/** Gives a unit a buff of its own. @param {Unit} u @param {import('@aue/sim').buffs.BuffInit} init */
const give = (u, init) => { buffs.addBuff(u, buffs.makeBuff(init)); };
/** The thief at half its maximum HP, so that a heal shows. @param {Box} box */
const halve = (box) => { box.e.hp = attrs.statsOf(box.e).maxHp / 2; return box.e.hp; };

test('[敌能-12] [关卡-2] act1multi_06\'s 窃盗者, 劫掠者 and their 精英 at both difficulties: the records\' theft skills, all covered', () => {
  const thief = (/** @type {number} */ sp) => ['CostMeleeAttack', 'CostRangedAttack'].map((key) => ({ key, cooldown: 0, initCooldown: 0, sp, bb: { cost: -1 } }));
  const raider = (/** @type {number} */ hp) => [{ key: 'CostHealHit', cooldown: 0, initCooldown: 0, sp: 1, bb: { cost: -3, hp_ratio: hp } }];
  const want = { [THIEF]: thief(2), [THIEF2]: thief(1), [RAIDER]: raider(0.05), [RAIDER2]: raider(0.1) };
  for (const d of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
    const own = levelAt(LEVEL, d).enemies;
    for (const [key, skills] of Object.entries(want)) {
      assert.deepEqual(own[key].skills, skills, `${d} ${key}`);
      assert.deepEqual(uncoveredAbilities([own[key]]), [], `${d} ${key}`);
      assert.deepEqual(real(key, d).skills, skills, 'the assembled record keeps them');
    }
    assert.deepEqual([THIEF, RAIDER].map((k) => [own[k].applyWay, own[k].rangeRadius, own[k].baseAttackTime]), [['RANGED', 2, 2], ['MELEE', 0, 4]]);
  }
});

test('[敌能-12] 资源偷取 on a summon, a 携带物, an operator unit whose profession is 装置 or our device unit takes nothing; each still takes the damage', () => {
  const op = stand(real(THIEF), [['s', 0, 2]]);
  run(op, 320);
  assert.deepEqual(hitsOn(op, unit(op, 's')).map(([f]) => f), [5, 65, 125, 185, 245, 305]);
  assert.deepEqual(costs(op), [18], 'an operator: the 3rd and 6th shot take 1 each');
  for (const key of ['s', 'cheer', 't']) {
    const box = stand(real(THIEF), [[key, 0, 2]]), t = unit(box, key);
    if (key === 's') t.summoner = -7;
    run(box, 320);
    assert.equal(hitsOn(box, t).length, 6, key);
    assert.deepEqual(costs(box), [20], key);
  }
  const dev = stand(real(THIEF), [], { box: true }), box = /** @type {Unit} */ (dev.w.units.find((u) => u.kind === KIND.DEVICE));
  run(dev, 320);
  assert.deepEqual([box.owner, hitsOn(dev, box).length, costs(dev)], [-1, 6, [20]], 'a device unit, on the field from frame 0');
  assert.deepEqual([CHEER.profession, unit(stand(real(THIEF), [['cheer', 0, 2]]), 'cheer').owner], ['TRAP', 0], 'the 携带物 is a player\'s');
});

test('[敌能-12] 劫掠 on a summon or a 装置 neither takes cost nor heals; on an operator it takes 3 and heals 5 % of its maximum HP', () => {
  /** @param {string} key @param {boolean} [summon] */
  const play = (key, summon = false) => {
    const box = stand(real(RAIDER), [[key, 1, 2]], { x: 2 }), t = unit(box, key), half = halve(box);
    if (summon) t.summoner = -7;
    run(box, 130);
    assert.equal(box.e.blockedBy, t.id, key);
    assert.deepEqual(hitsOn(box, t), [[1, 400], [121, 400]], key);
    return [costs(box)[0], box.e.hp - half];
  };
  assert.deepEqual(play('g'), [17, 0.05 * 20000]);
  assert.deepEqual(play('g', true), [20, 0], 'a summon');
  assert.deepEqual(play('tg'), [20, 0], 'an operator unit whose profession is 装置');
});

test('[敌能-12] co-op: the skill takes from the player of the unit it hits, never the other seat; a seat\'s summon gives nobody anything', () => {
  // seat 0 and seat 1 each have one unit; only the one on the high ground at (0, 2) is in the thief's reach
  const one = stand(real(THIEF), [['g', 1, 4, 0], ['s', 0, 2, 1]], { players: 2 });
  run(one, 320);
  assert.deepEqual(costs(one), [20, 18]);
  const zero = stand(real(THIEF), [['s', 0, 2, 0], ['g', 1, 4, 1]], { players: 2 });
  run(zero, 320);
  assert.deepEqual(costs(zero), [18, 20]);
  const summon = stand(real(THIEF), [['g', 1, 4, 0], ['s', 0, 2, 1]], { players: 2 });
  unit(summon, 's').summoner = unit(summon, 'g').id;
  run(summon, 320);
  assert.deepEqual([hitsOn(summon, unit(summon, 's')).length, costs(summon)], [6, [20, 20]]);
});

test('[敌能-12] the theft is the skill hit\'s own: one dodged, stopped by a shield layer, taken whole by a barrier or by 无敌 takes nothing and leaves nothing for the next shots; a barrier that takes part of it does not stop it', () => {
  const stops = [{ mods: { dodgePhys: 1 } }, { shieldHits: 1 }, { shield: 1e5 }, { flags: { invincible: true } }];
  for (const init of [...stops, { shield: 100 }]) {
    const box = stand(real(THIEF), [['s', 0, 2]]), s = unit(box, 's');
    run(box, 119);
    give(s, { key: 'stopTest', left: 10, ...init });
    run(box, 201);
    const at = hitsOn(box, s).map(([f]) => f), what = JSON.stringify(init);
    if (init.shield === 100) {
      assert.deepEqual([at, costs(box)], [[5, 65, 125, 185, 245, 305], [18]], what);
      continue;
    }
    assert.deepEqual(at, [5, 65, 185, 245, 305], `${what}: the 3rd shot took no HP, the 4th and 5th did`);
    assert.deepEqual(costs(box), [19], `${what}: only the 6th took`);
    assert.equal(box.e.ab['CostRangedAttack.armed'], 0);
  }
});

test('[敌能-12] the theft is lost with a skill attack cut in its wind-up, or a skill shot whose target fell before it landed; the ordinary attacks after it take nothing', () => {
  const slow = stand(varied(real(THIEF), {}, { attack: { duration: 1, hit: 0.5 } }), [['s', 0, 2]]);
  run(slow, 125);
  assert.equal(slow.e.ab['CostRangedAttack.armed'], 1, 'the 3rd attack, started in frame 121, is 资源偷取');
  status.applyStatus(slow.e, 'stun', { seconds: 1 });
  run(slow, 400);
  assert.deepEqual(slow.ev.filter((x) => x.type === 'attack' && x.id === slow.e.id).map((x) => x.f), [1, 61, 121, 210, 270, 330, 390, 450, 510]);
  assert.deepEqual(hitsOn(slow, unit(slow, 's')).map(([f]) => f), [20, 80, 229, 289, 349, 409, 469], 'the 3rd never landed');
  assert.deepEqual(costs(slow), [19], 'the 4th and 5th took nothing, the 6th took 1');
  const fell = stand(real(THIEF), [['s1', 0, 2], ['s2', 2, 2]]), [s1, s2] = [unit(fell, 's1'), unit(fell, 's2')];
  run(fell, 121);
  assert.deepEqual([fell.w.shots.length, fell.e.ab['CostRangedAttack.armed']], [1, 1], 'the skill shot flies at s1, who has the taunt');
  s1.hp = 0;
  run(fell, 199);
  assert.deepEqual([fell.w.units.includes(s1), hitsOn(fell, s1).length], [false, 2]);
  assert.deepEqual(hitsOn(fell, s2).map(([f]) => f), [185, 245, 305]);
  assert.deepEqual(costs(fell), [19], 'only the 6th attack took');
});

test('[敌能-12] 成功造成伤害: the skill hit that knocks the operator down takes; one cut to 0 by an hpDamage handler takes nothing; a player at 0 stays at 0 and 劫掠 still heals', () => {
  const last = stand(real(THIEF), [['s', 0, 2]]), s = unit(last, 's');
  run(last, 119);
  s.hp = 1;
  run(last, 10);
  assert.deepEqual([last.w.units.includes(s), hitsOn(last, s).at(-1), costs(last)], [false, [125, 330], [19]]);
  const cut = stand(real(THIEF), [['s', 0, 2]]);
  bus.on(cut.w, 'hpDamage', (k) => { if (cut.w.frame === 125) /** @type {any} */ (k).amount = 0; });
  run(cut, 320);
  assert.deepEqual([hitsOn(cut, unit(cut, 's')).map(([f]) => f), costs(cut)], [[5, 65, 185, 245, 305], [19]]);
  const broke = stand(real(RAIDER), [['g', 1, 2]], { x: 2 }), half = halve(broke);
  broke.w.players[0].cost = 2;
  run(broke, 130);
  assert.deepEqual([costs(broke), broke.e.hp - half], [[0], 1000], 'down to 0, not below; healed');
  run(broke, 240);
  assert.deepEqual([costs(broke), broke.e.hp - half], [[0], 2000], 'at 0 it stays 0; healed again');
});

test('[敌能-12] neutral units: 资源偷取 takes nothing from one; a shooting 劫掠 neither takes nor heals on one, and heals on an operator', () => {
  const civ = stand(real(THIEF), [], { civ: true }), u = unit(civ, 'civ');
  run(civ, 320);
  assert.deepEqual([hitsOn(civ, u).length >= 6, costs(civ)], [true, [20]]);
  const shooter = varied(real(RAIDER), {}, { applyWay: 'RANGED', rangeRadius: 2 });
  const onCiv = stand(shooter, [], { x: 1, civ: true }), half = halve(onCiv);
  run(onCiv, 250);
  assert.deepEqual([hitsOn(onCiv, unit(onCiv, 'civ')).length, costs(onCiv), onCiv.e.hp - half], [3, [20], 0]);
  const onOp = stand(shooter, [['s', 0, 2]], { x: 1 }), half2 = halve(onOp);
  run(onOp, 250);
  assert.deepEqual([costs(onOp), onOp.e.hp - half2], [[17], 1000]);
});

test('[敌能-12] the numbers are the record\'s: cost −2 takes 2, sp 3 makes it every 4th shot, hp_ratio 0.2 heals 20 % of the current maximum HP', () => {
  /** @param {EnemyDef} def @param {number} n */
  const lost = (def, n) => { const box = stand(def, [['s', 0, 2]]); run(box, n); return 20 - costs(box)[0]; };
  assert.equal(lost(varied(real(THIEF), { bb: { cost: -2 } }), 320), 4);
  assert.deepEqual([170, 320, 520].map((n) => lost(varied(real(THIEF), { sp: 3 }), n)), [0, 1, 2], 'the 4th (181) and 8th (421) attack');
  const melee = real(THIEF), onlyMelee = /** @type {any} */ ({ ...melee, skills: melee.skills?.map((s) => (s.key === 'CostMeleeAttack' ? { ...s, bb: { cost: -5 } } : s)) });
  assert.equal(lost(onlyMelee, 320), 2, 'a shooter counts only CostRangedAttack');
  const box = stand(varied(real(RAIDER), { bb: { cost: -2, hp_ratio: 0.2 } }), [['g', 1, 2]], { x: 2 });
  give(box.e, { key: 'hpTest', mods: { hpPct: 0.5 } });
  const half = halve(box);
  run(box, 130);
  assert.deepEqual([costs(box), box.e.hp - half, attrs.statsOf(box.e).maxHp], [[18], 0.2 * 30000, 30000]);
});

test('[敌能-12] act1multi_06\'s own records at both difficulties: a summon gives nothing; an operator costs its player; the 劫掠者 heal 5 % and the 精英 10 %', () => {
  for (const d of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
    for (const [key, skills] of /** @type {[string, number][]} */ ([[THIEF, 2], [THIEF2, 3]])) {
      const op = stand(real(key, d), [['s', 0, 2]]), summon = stand(real(key, d), [['s', 0, 2]]);
      unit(summon, 's').summoner = -7;
      run(op, 320);
      run(summon, 320);
      assert.deepEqual([costs(op), costs(summon)], [[20 - skills], [20]], `${d} ${key}`);
    }
    for (const [key, ratio, hp] of /** @type {[string, number, number][]} */ ([[RAIDER, 0.05, 20000], [RAIDER2, 0.1, 25000]])) {
      const op = stand(real(key, d), [['g', 1, 2]], { x: 2 }), max = attrs.statsOf(op.e).maxHp, half = halve(op);
      run(op, 130);
      assert.deepEqual([costs(op), op.e.hp - half, max], [[17], ratio * max, hp * (d === 'NORMAL' ? 1 : 1.2)], `${d} ${key}: 突袭 ×1.2`);
      const summon = stand(real(key, d), [['g', 1, 2]], { x: 2 }), half2 = halve(summon);
      unit(summon, 'g').summoner = -7;
      run(summon, 130);
      assert.deepEqual([costs(summon), summon.e.hp - half2], [[20], 0], `${d} ${key}`);
    }
  }
});

test('[敌能-12] silence: silenced with its SP full, the 窃盗者 shoots as usual and takes nothing, SP held; the first attack after it is 资源偷取; silenced while the skill shot flies, that shot still takes', () => {
  const held = stand(real(THIEF), [['s', 0, 2]]);
  run(held, 119);
  status.applyStatus(held.e, 'silence', { seconds: 1.5 });
  run(held, 60);
  assert.deepEqual([hitsOn(held, unit(held, 's')).length, costs(held), held.e.ab['CostRangedAttack.sp']], [3, [20], 2], 'the 3rd attack (frame 121) was an ordinary one');
  run(held, 150);
  assert.deepEqual([hitsOn(held, unit(held, 's')).map(([f]) => f), costs(held)], [[5, 65, 125, 185, 245, 305], [19]], 'the 4th (181) took; the 6th was ordinary');
  const late = stand(real(THIEF), [['s', 0, 2]]);
  run(late, 120);
  assert.deepEqual([late.w.shots.length, late.e.ab['CostRangedAttack.armed']], [1, 1], 'the 3rd attack\'s skill shot is in flight');
  status.applyStatus(late.e, 'silence', { seconds: 1 });
  run(late, 10);
  assert.deepEqual([hitsOn(late, unit(late, 's')).at(-1)?.[0], costs(late), late.e.ab['CostRangedAttack.armed']], [125, [19], 0]);
});

test('[敌能-12] a 窃盗者 knocked down before its skill shot lands: the shot still hits, with no source, and takes nothing', () => {
  const box = stand(real(THIEF), [['s', 0, 2]]), s = unit(box, 's');
  run(box, 120);
  box.e.hp = 0;
  run(box, 10);
  assert.equal(box.w.units.includes(box.e), false);
  assert.deepEqual(box.ev.filter((x) => x.type === 'hit' && x.target === s.id).map((x) => [x.f, x.id === box.e.id ? 'thief' : x.id]), [[5, 'thief'], [65, 'thief'], [125, -1]]);
  assert.deepEqual(costs(box), [20]);
});
