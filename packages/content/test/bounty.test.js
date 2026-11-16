// 赏金猎人弩手 and 赏金猎人弩手队长's 赏金攫取 (docs/spec/foes.md 敌能-151), the `{cost}` shape of `PowerHit`. The bounty
// hunter stands rooted on the tiny map's road at (1, 1). Our main target at (1, 3) has the taunt, so every ordinary shot
// goes to it and only the skill's cross reaches the four tiles next to it. Our units have no attack and a million HP;
// a guard's defence is 100, a sniper's 20. Its attacks start in frames 1, 91, 181 … (3 s apart).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, bus, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelAt, levelContent, FOE_EXTRAS, carriedDef } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */
/** @typedef {{ c: any, w: World, e: Unit, ev: any[] }} Box */

const KEY = 'enemy_1340_bthtbw', CAPTAIN = 'enemy_1340_bthtbw_2', ROGUE = 'enemy_15038_dqhtbw';
const LEVEL = 'act1multi_06';
/** The 携带物 赛场啦啦队 (符文-6): a player's card, an operator unit whose profession is 装置. */
const CHEER = await carriedDef('trap_201_muulco', { level: 1, skill: 0, skillLevel: 1 });

/**
 * 赏金猎人弩手 at level 0 (enemy_database 17759cc8): `skill` changes its PowerHit, `more` the rest.
 * @param {Record<string, any>} [skill] @param {Record<string, any>} [more] @returns {EnemyDef}
 */
function crossbow(skill = {}, more = {}) {
  return /** @type {any} */ ({
    name: '赏金猎人弩手', maxHp: 15000, atk: 500, def: 500, res: 30, moveSpeed: 0.7, baseAttackTime: 3, rangeRadius: 2.8,
    applyWay: 'RANGED', motion: 'WALK', massLevel: 2, levelType: 'ELITE', immune: ['silence'],
    skills: [{ key: 'PowerHit', cooldown: 0, initCooldown: 0, sp: 2, bb: { cost: -1 }, ...skill }], ...more,
  });
}

/** An inline record with its extras merged, as the content gives it. @param {Record<string, any>} [skill] @param {Record<string, any>} [more] */
const marked = (skill, more) => withFoeExtras(KEY, crossbow(skill, more));
/** act1multi_06's record of a key at a difficulty, assembled. @param {'NORMAL' | 'FOUR_STAR'} d @param {string} [key] */
const real = (d, key = KEY) => /** @type {EnemyDef} */ (levelContent(LEVEL, d).enemies[key]);

/** Our units: `main` has the taunt; ranged ones stand on the high ground, melee ones on the road; `cheer` is the 携带物. @param {any} c */
function ours(c) {
  const body = { cost: 0, atk: 0, maxHp: 1e6 };
  c.operators.main = { ...c.operators.guard, ...body, name: 'main', tauntLevel: 1 };
  for (const k of ['up', 'down', 'diag']) c.operators[k] = { ...c.operators.sniper, ...body, name: k };
  for (const k of ['left', 'right']) c.operators[k] = { ...c.operators.guard, ...body, name: k };
  c.operators.cheer = { ...CHEER, ...body };
}

/** Our device `box` at (1, 2), on the left of the main target. @param {any} c */
function ourBox(c) {
  c.devices = { box: { name: 'box', maxHp: 1e6, atk: 0, def: 0, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} } };
  c.level.predefines = [{ alias: 'box#1', key: 'box', hidden: false, row: 1, col: 2, dir: 'UP' }];
}

/**
 * The bounty hunter `def` rooted at (1, `o.x` ?? 1); with `o.civ` a neutral unit rooted at (1, 4); with `o.box` our device.
 * `seats` [key, row, col, seat] are deployed in frame 1, when its first attack starts; `ev` holds that frame's events.
 * @param {EnemyDef} def @param {[string, number, number, number?][]} seats @param {{ x?: number, civ?: boolean, box?: boolean, players?: number }} [o]
 * @returns {Box}
 */
function stand(def, seats, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [KEY]: def, civ: { name: 'civ', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, KEY), ...(o.civ ? [spawnAt(0, 'civ')] : [])])];
  c.level.options = { ...c.level.options, initialCost: 20, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  ours(c);
  if (o.box) ourBox(c);
  const w = createWorld(c, { seed: 1, players: o.players ?? 1 });
  const ev = step(w, c).map((x) => ({ ...x, f: 0 }));
  for (const u of w.units.filter((x) => x.kind === KIND.ENEMY)) {
    Object.assign(u, u.base.neutral ? { x: 4, y: 1 } : { x: o.x ?? 1, y: 1 }, { path: [], pt: 0 });
    status.applyStatus(u, 'root', {});
  }
  ev.push(...step(w, c, seats.map(([op, row, col, seat = 0]) => [seat, { type: 'deploy', op, row, col, dir: 0 }])).map((x) => ({ ...x, f: 1 })));
  return { c, w, e: /** @type {Unit} */ (w.units.find((u) => u.key === KEY)), ev };
}

/** Steps n frames; the events with their frame (also kept in the box). @param {Box} box @param {number} n */
function run(box, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(box.w, box.c)) out.push({ ...ev, f: box.w.frame - 1 });
  box.ev.push(...out);
  return out;
}
/** The unit of a key. @param {Box} box @param {string} key */
const unit = (box, key) => /** @type {Unit} */ (box.w.units.find((u) => u.key === key));
/** Each player's cost. @param {Box} box */
const costs = (box) => box.w.players.map((p) => p.cost);
/** The bounty hunter's hits so far, by target id: [frame, damage]. @param {Box} box @param {Unit} t */
const hitsOn = (box, t) => box.ev.filter((x) => x.type === 'hit' && x.id === box.e.id && x.target === t.id).map((x) => [x.f, x.damage]);
/**
 * Which of its attacks (from 1) were the cross: those that hit `side`, a unit the ordinary shots never aim at — each hit
 * belongs to the last attack started at or before it (a wind-up lands later).
 * @param {Box} box @param {Unit} side
 */
function crosses(box, side) {
  const starts = box.ev.filter((x) => x.type === 'attack' && x.id === box.e.id).map((x) => x.f);
  return [...new Set(hitsOn(box, side).map(([f]) => starts.filter((s) => s <= f).length))];
}
/** Gives a unit a buff of its own. @param {Unit} u @param {import('@aue/sim').buffs.BuffInit} init */
const give = (u, init) => { buffs.addBuff(u, buffs.makeBuff(init)); };

test('[敌能-151] [关卡-2] act1multi_06\'s 赏金猎人弩手 and 队长 at both difficulties: PowerHit {cost −1}, sp 2, no cooldown, immune to silence; covered with the page marker only', () => {
  for (const d of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
    const own = levelAt(LEVEL, d).enemies;
    for (const key of [KEY, CAPTAIN]) {
      const raw = /** @type {any} */ (own[key]);
      assert.deepEqual(raw.skills, [{ key: 'PowerHit', cooldown: 0, initCooldown: 0, sp: 2, bb: { cost: -1 } }], `${d} ${key}`);
      assert.deepEqual([raw.applyWay, raw.rangeRadius, raw.immune], ['RANGED', 2.8, ['silence']]);
      assert.deepEqual(uncoveredAbilities([raw]), ['PowerHit'], 'the data alone is not this shape');
      assert.deepEqual(withFoeExtras(key, raw).skills?.[0].bb, { cost: -1, page: 1 });
      assert.deepEqual(uncoveredAbilities([withFoeExtras(key, raw)]), []);
      assert.deepEqual(real(d, key).skills?.[0].bb, { cost: -1, page: 1 }, 'the assembled record keeps the skill');
    }
    assert.deepEqual([own[KEY].atk, own[CAPTAIN].atk], d === 'NORMAL' ? [500, 600] : [500 * 1.2, 600 * 1.2]);
  }
  assert.ok(FOE_EXTRAS[KEY].source.endsWith('oldid=355359'));
  assert.ok(FOE_EXTRAS[CAPTAIN].source.endsWith('oldid=355360'));
});

test('[敌能-151] [敌能-11] [关卡-2] PowerHit is covered as exactly {atk} or the marked negative {cost}: 赛场无赖射手, strings, extra keys and the rest stay uncovered', () => {
  const rogue = withFoeExtras(ROGUE, /** @type {any} */ ({ ...crossbow(), name: '赛场无赖射手', rangeRadius: 3.8, talents: { rarity: { '': 1 } } }));
  assert.deepEqual(rogue.skills?.[0].bb, { cost: -1 }, 'no saved page, no marker');
  assert.deepEqual(uncoveredAbilities([rogue]), ['rarity', 'PowerHit']);
  /** @param {Record<string, unknown>} bb */
  const gaps = (bb) => uncoveredAbilities([crossbow({ bb })]);
  for (const bb of [{ atk: 0.8 }, { cost: -1, page: 1 }, { cost: -2, page: 1 }]) assert.deepEqual(gaps(bb), [], JSON.stringify(bb));
  const not = [{}, { atk: '0.8' }, { atk: 0.8, page: 1 }, { cost: -1 }, { cost: '-1', page: 1 }, { cost: -1, page: '1' }, { cost: -1, page: 2 },
    { cost: 0, page: 1 }, { cost: 1, page: 1 }, { cost: -1, page: 1, atk: 0.8 }];
  for (const bb of not) assert.deepEqual(gaps(bb), ['PowerHit'], JSON.stringify(bb));
  assert.deepEqual(levelContent('act1multi_01', 'NORMAL').enemies.enemy_1406_chghmr.skills?.[0].bb, { atk: 0.8 }, '战线推进者 keeps its 强击');
});

test('[敌能-151] [敌能-11] one PowerHit object: 战线推进者\'s {atk} still takes its mark at spawn and when its block ends, the bounty hunter never does', () => {
  const pushing = /** @type {EnemyDef} */ (levelContent('act1multi_01', 'NORMAL').enemies.enemy_1406_chghmr), pusher = stand(pushing, []);
  assert.equal(pusher.e.ab['PowerHit.mark'], 1);
  const hunter = stand(real('NORMAL'), []);
  assert.equal(hunter.e.ab['PowerHit.mark'], undefined);
  assert.equal(hunter.e.ab['PowerHit.sp'], undefined, 'no attack yet: no point');
  // blocked by `left` on its tile, which then falls: the block ends
  const seen = [pushing, real('NORMAL')].map((def) => {
    const box = stand(def, [['left', 1, 1]]), left = unit(box, 'left');
    run(box, 10);
    const blocked = [box.e.blockedBy === left.id, box.e.ab['PowerHit.mark']];
    left.hp = 0;
    run(box, 3);
    return [...blocked, box.e.blockedBy, box.e.ab['PowerHit.mark']];
  });
  assert.deepEqual(seen, [[true, 0, -1, 1], [true, undefined, -1, undefined]], 'the pusher spent its mark and took it again; the hunter none');
});

test('[敌能-151] every third attack is a 100 % physical cross on the current attack, with no projectile; each operator it damages costs its own player 1 (co-op)', () => {
  const box = stand(real('NORMAL'), [['main', 1, 3, 0], ['up', 0, 3, 1], ['left', 1, 2, 0], ['down', 2, 3, 1], ['diag', 0, 2, 0]], { players: 2 });
  const [main, up, left, down, diag] = ['main', 'up', 'left', 'down', 'diag'].map((k) => unit(box, k));
  run(box, 100);
  assert.deepEqual(hitsOn(box, main), [[7, 400], [97, 400]], 'two ordinary shots, 500 − 100');
  assert.deepEqual(costs(box), [20, 20], 'ordinary attacks take nothing');
  give(box.e, { key: 'atkTest', mods: { atkPct: 0.5 } });
  const skill = run(box, 81).filter((x) => x.f === 181 && x.id === box.e.id);
  assert.deepEqual(skill.filter((x) => x.type === 'shot'), [], 'no projectile');
  assert.deepEqual([main, up, left, down].map((u) => hitsOn(box, u).at(-1)), [[181, 650], [181, 730], [181, 650], [181, 730]], '750 physical on each');
  assert.deepEqual(hitsOn(box, diag), [], 'not the diagonal');
  assert.deepEqual(costs(box), [18, 18], 'two of each seat');
  run(box, 180);
  assert.deepEqual(costs(box), [18, 18], 'the 4th and 5th are ordinary');
  run(box, 90);
  assert.deepEqual(crosses(box, up), [3, 6]);
  assert.deepEqual(costs(box), [16, 16]);
});

test('[敌能-151] the cross hits summons, our devices (a device unit, a 携带物), neutral units and 迷彩 too; it takes cost only for the operators; 隐匿 and 起飞 are not in it', () => {
  const kinds = stand(real('NORMAL'), [['main', 1, 3], ['up', 0, 3], ['down', 2, 3]], { box: true, civ: true });
  const [main, up, down] = ['main', 'up', 'down'].map((k) => unit(kinds, k));
  const box = /** @type {Unit} */ (kinds.w.units.find((u) => u.kind === KIND.DEVICE)), civ = unit(kinds, 'civ');
  up.summoner = main.id;
  give(down, { key: 'camouTest', flags: { camou: true } });
  run(kinds, 180);
  // The device and the neutral unit are on the field in frame 0, so its first attack is then, at one of them.
  const third = kinds.ev.filter((x) => x.type === 'attack' && x.id === kinds.e.id)[2].f;
  assert.deepEqual([main, up, down, box, civ].map((u) => hitsOn(kinds, u).at(-1)?.[0]), [third, third, third, third, third]);
  assert.equal(20 - costs(kinds)[0], 2, 'main and the 迷彩 operator; not the summon, the device or the neutral unit');
  const hidden = stand(real('NORMAL'), [['main', 1, 3], ['up', 0, 3], ['down', 2, 3], ['left', 1, 2], ['cheer', 1, 4]]);
  give(unit(hidden, 'up'), { key: 'stealthTest', flags: { stealth: true } });
  give(unit(hidden, 'down'), { key: 'liftTest', flags: { liftoff: true } });
  run(hidden, 180);
  assert.deepEqual(['up', 'down'].map((k) => hitsOn(hidden, unit(hidden, k))), [[], []]);
  assert.deepEqual(hitsOn(hidden, unit(hidden, 'left')), [[181, 400]]);
  const cheer = unit(hidden, 'cheer');
  assert.deepEqual([cheer.kind, cheer.owner, CHEER.profession, hitsOn(hidden, cheer)], [KIND.OPERATOR, 0, 'TRAP', [[181, 500]]], 'a player\'s 装置');
  assert.equal(20 - costs(hidden)[0], 2, 'main and left; not the 携带物');
});

test('[敌能-151] 成功造成伤害: a dodge, a shield layer, a barrier that takes it all and 无敌 give nothing; a barrier that takes part of it gives', () => {
  const box = stand(real('NORMAL'), [['main', 1, 3], ['up', 0, 3], ['down', 2, 3], ['left', 1, 2], ['right', 1, 4]]);
  const [main, up, down, left, right] = ['main', 'up', 'down', 'left', 'right'].map((k) => unit(box, k));
  run(box, 100);
  give(main, { key: 'barrierTest', shield: 100 });
  give(up, { key: 'dodgeTest', mods: { dodgePhys: 1 } });
  give(down, { key: 'shieldTest', shieldHits: 1 });
  give(left, { key: 'wallTest', shield: 1e5 });
  give(right, { key: 'invTest', flags: { invincible: true } });
  run(box, 81);
  assert.deepEqual([main, up, down, left, right].map((u) => 1e6 - u.hp), [400 + 400 + 300, 0, 0, 0, 0]);
  assert.deepEqual(costs(box), [19], 'only the main target, through the barrier');
});

test('[敌能-151] 成功造成伤害: the hit that knocks an operator down still takes; a hit cut to 0 takes nothing; a player at 0 stays at 0', () => {
  const box = stand(real('NORMAL'), [['main', 1, 3, 0], ['up', 0, 3, 1], ['down', 2, 3, 2]], { players: 3 });
  const [main, up, down] = ['main', 'up', 'down'].map((k) => unit(box, k));
  run(box, 100);
  main.hp = 1;
  bus.on(box.w, 'hpDamage', (k) => { if (/** @type {any} */ (k).target === up) /** @type {any} */ (k).amount = 0; });
  box.w.players[2].cost = 0;
  run(box, 81);
  assert.deepEqual([main.hp, box.w.units.includes(main), 1e6 - up.hp, 1e6 - down.hp], [0, false, 0, 480]);
  assert.deepEqual(costs(box), [19, 20, 0]);
});

test('[敌能-151] 「※此技能无法被沉默」: silenced, it still counts its points and fires; the data\'s immunity keeps silence off the real ones', () => {
  const box = stand(marked({}, { immune: [] }), [['main', 1, 3], ['up', 0, 3]]);
  status.applyStatus(box.e, 'silence', { seconds: 1000 });
  assert.equal(attrs.statsOf(box.e).flags.silence, true);
  run(box, 180);
  assert.deepEqual(crosses(box, unit(box, 'up')), [3]);
  assert.deepEqual(costs(box), [18]);
  const realOne = stand(real('NORMAL'), []);
  status.applyStatus(realOne.e, 'silence', { seconds: 1000 });
  assert.equal(attrs.statsOf(realOne.e).flags.silence ?? false, false);
});

test('[敌能-151] the numbers are the record\'s: cost −2 takes 2 a hit, sp 3 makes it every fourth attack, a 10 s cooldown the 3rd and 7th, a 7 s first cooldown the 4th and 7th', () => {
  /** @param {Record<string, any>} skill @param {number} n */
  const play = (skill, n) => { const box = stand(marked(skill), [['main', 1, 3], ['up', 0, 3]]); run(box, n); return box; };
  assert.deepEqual(costs(play({ bb: { cost: -2 } }, 180)), [16], 'two operators, 2 each');
  const plays = [{}, { sp: 3 }, { cooldown: 10 }, { initCooldown: 7 }].map((s) => play(s, 640));
  assert.deepEqual(plays.map((box) => crosses(box, unit(box, 'up'))), [[3, 6], [4, 8], [3, 7], [4, 7]]);
  assert.deepEqual(plays.map((box) => 20 - costs(box)[0]), [4, 4, 4, 4]);
});

test('[敌能-151] the cross is physical whatever the record\'s type; a melee record of the shape takes nothing with its ordinary blows between crosses', () => {
  const arts = stand(marked({}, { dmgType: 'arts' }), [['main', 1, 3], ['up', 0, 3]]);
  run(arts, 180);
  assert.deepEqual(hitsOn(arts, unit(arts, 'main')), [[7, 500], [97, 500], [181, 400]], 'arts shots through no resistance; the cross 500 − 100');
  const melee = stand(marked({}, { applyWay: 'MELEE', rangeRadius: 0 }), [['main', 1, 3], ['up', 0, 3]], { x: 3 });
  run(melee, 360);
  const main = unit(melee, 'main');
  assert.equal(melee.e.blockedBy, main.id);
  assert.deepEqual(hitsOn(melee, main).map(([f]) => f), [1, 91, 181, 271, 361], 'blows with no projectile');
  assert.deepEqual([crosses(melee, unit(melee, 'up')), costs(melee)], [[3], [18]], 'the 4th and 5th blow take nothing');
});

test('[敌能-151] the cross\'s hits are the skill\'s attack: isAttack and isSkill, the side one isSplash, none a projectile; the ordinary shots are projectiles', () => {
  const box = stand(real('NORMAL'), [['main', 1, 3], ['up', 0, 3]]);
  /** @type {string[]} */
  const seen = [];
  bus.on(box.w, 'hit', (k) => {
    const { source, target, dmg } = /** @type {any} */ (k);
    if (source === box.e) seen.push(`${box.w.frame}:${target.key}:${['isAttack', 'isSkill', 'isSplash', 'isProjectile'].filter((f) => dmg[f] === true).join('+')}`);
  });
  /** @type {string[]} */
  const kinds = [];
  bus.on(box.w, 'attackHit', (k) => { const x = /** @type {any} */ (k); if (x.attacker === box.e) kinds.push(`${x.target.key}:${x.kind}:${x.isSkill}`); });
  run(box, 180);
  assert.deepEqual(seen, ['7:main:isAttack+isProjectile', '97:main:isAttack+isProjectile', '181:main:isAttack+isSkill', '181:up:isAttack+isSkill+isSplash']);
  assert.deepEqual(kinds, ['main:main:false', 'main:main:false', 'main:main:true', 'up:splash:true']);
});

test('[敌能-151] a shot still in flight when the cross lands takes nothing; a cross cancelled in its wind-up keeps its points spent and takes nothing', () => {
  const fast = stand(marked({}, { baseAttackTime: 0.2 }), [['main', 1, 3], ['up', 0, 3]], { x: 0 });
  run(fast, 17);
  const main = unit(fast, 'main');
  assert.deepEqual(hitsOn(fast, main), [[10, 400], [13, 400], [16, 400]], 'attack 2\'s shot lands in frame 16, after the cross of frame 13');
  assert.deepEqual([costs(fast), fast.e.ab['PowerHit.live']], [[18], 1], 'the cross took 2, the shot nothing');
  const slow = stand(marked({}, { attack: { duration: 1, hit: 0.5 } }), [['main', 1, 3], ['up', 0, 3]]);
  run(slow, 184);
  status.applyStatus(slow.e, 'stun', { seconds: 1 });
  run(slow, 46);
  assert.deepEqual([slow.e.ab['PowerHit.sp'], costs(slow)], [0, [20]], 'the 3rd attack was cut: points spent, nothing taken');
  run(slow, 480);
  assert.deepEqual(crosses(slow, unit(slow, 'up')), [6]);
  assert.deepEqual(costs(slow), [18]);
});

test('[敌能-151] act1multi_06 突袭: the 弩手\'s and the 队长\'s crosses at 120 % attack each take a cost an operator', () => {
  for (const [key, atk] of /** @type {[string, number][]} */ ([[KEY, 600], [CAPTAIN, 720]])) {
    const box = stand(real('FOUR_STAR', key), [['main', 1, 3], ['up', 0, 3]]);
    run(box, 180);
    assert.deepEqual([unit(box, 'main'), unit(box, 'up')].map((u) => hitsOn(box, u).at(-1)), [[181, Math.round(atk) - 100], [181, Math.round(atk) - 20]], key);
    assert.deepEqual(costs(box), [18], key);
  }
});
