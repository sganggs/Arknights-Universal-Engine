// “墓碑” (docs/spec/foes.md 敌能-139). No shipped level carries it, so the record is enemy_database level 0
// (ArknightsGameData 17759cc8); the page's 3×3 comes from FOE_EXTRAS. It stands rooted on the tiny map's road at (2, 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, damage, bus, KIND, stateHash, takeSnapshot, restoreSnapshot } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, FOE_EXTRAS } from '../src/index.js';
import { withFoeExtras, uncoveredAbilities, withoutIncomplete } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const KEY = 'enemy_2008_flking';
const BARRIER = 'tombBarrier';
const INTERVAL = attrs.intervalFrames(3.5, 100);

/** The skill as the data has it, with `o` over it. @param {Record<string, unknown>} [o] @returns {any} */
const skill = (o = {}) => ({ key: 'refreshshield', cooldown: 30, initCooldown: 10, sp: 0, bb: { hp_ratio: 0.1 }, ...o });

/** 墓碑 at level 0 of enemy_database (17759cc8), with `over` over it, before FOE_EXTRAS. @param {Record<string, unknown>} [over] @returns {EnemyDef} */
function raw(over = {}) {
  return /** @type {EnemyDef} */ ({
    name: '“墓碑”', maxHp: 60000, atk: 2000, def: 330, res: 55, moveSpeed: 0.5, baseAttackTime: 3.5, rangeRadius: 2.2,
    applyWay: 'ALL', motion: 'WALK', massLevel: 6, levelType: 'BOSS', lifePointReduce: 30, immune: ['silence'],
    talents: { atkdown: { atk_scale: 0.4 } }, skills: [skill()], ...over,
  });
}

/** The record the content plays: the data's with the page's extras. @param {Record<string, unknown>} [over] */
const tomb = (over) => withFoeExtras(KEY, raw(over));

/**
 * 墓碑 rooted at (2, 1), with `man` a neutral unit rooted at (3, 1); then `seats` deploy (op, row, col). Operators deal
 * nothing and have no DEF or RES; `sniper` taunts 1, the flying `bird` 2; `wall` blocks. Both enemies come in on the
 * start tile, where 墓碑's spawn-frame attack hits the neutral unit: its HP is put back.
 * @param {EnemyDef} def @param {[string, number, number][]} seats @param {{ tune?: (c: any) => void, man?: boolean }} [o]
 */
function stand(def, seats, o = {}) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = { [KEY]: def, man: { name: 'man', maxHp: 1e6, atk: 0, def: 0, res: 0, moveSpeed: 0, neutral: true } };
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave([spawnAt(0, KEY), ...(o.man ? [spawnAt(0, 'man')] : [])])];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  const quiet = { cost: 0, atk: 0, def: 0, res: 0, blockCnt: 0, maxHp: 1e6 };
  Object.assign(c.operators.guard, quiet);
  Object.assign(c.operators.sniper, quiet, { tauntLevel: 1 });
  c.operators.bird = { ...c.operators.sniper, name: 'bird', motion: 'FLY', tauntLevel: 2 };
  c.operators.far = { ...c.operators.sniper, name: 'far', tauntLevel: 0 };
  c.operators.side = { ...c.operators.guard, name: 'side' };
  c.operators.wall = { ...c.operators.guard, name: 'wall', blockCnt: 3 };
  o.tune?.(c);
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const e = /** @type {Unit} */ (w.units.find((u) => u.key === KEY)), man = w.units.find((u) => u.key === 'man');
  const cd0 = e.ab['refreshshield.cd'];
  Object.assign(e, { x: 2, y: 1, path: [], pt: 0 });
  status.applyStatus(e, 'root', {});
  if (man) { Object.assign(man, { x: 3, y: 1, path: [], pt: 0, hp: man.maxHp }); status.applyStatus(man, 'root', {}); }
  e.atkCd = 40;
  if (seats.length) step(w, c, seats.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  return { c, w, e, man, cd0 };
}

/** @param {World} w @param {string} key */
const unitOf = (w, key) => /** @type {Unit} */ (w.units.find((u) => u.key === key));
/** One frame with the attack ready. @param {ReturnType<typeof stand>} box */
const strike = (box) => { box.e.atkCd = 0; return /** @type {any[]} */ (step(box.w, box.c)); };
/** The skill ready and the attack ready, then one frame. @param {ReturnType<typeof stand>} box */
const release = (box) => { box.e.ab['refreshshield.cd'] = 0; return strike(box); };
/** @param {any[]} ev @param {number} id */
const hitsOf = (ev, id) => ev.filter((x) => x.type === 'hit' && x.id === id);
/** @param {any[]} ev @param {number} id @param {Unit} t */
const dealt = (ev, id, t) => hitsOf(ev, id).filter((h) => h.target === t.id).map((h) => h.damage);
/** @param {Unit} e */
const barriers = (e) => e.buffs.filter((b) => b.key === BARRIER);

test('[敌能-139] [关卡-2] the page\'s 3×3 completes 墓碑; any other atkdown or refreshshield shape stays uncovered', () => {
  const merged = tomb();
  assert.deepEqual(merged.talents?.atkdown, { atk_scale: 0.4, square: 1 });
  assert.deepEqual(merged.skills?.[0], skill());
  assert.deepEqual(uncoveredAbilities([merged]), []);
  assert.deepEqual(uncoveredAbilities([raw()]), ['atkdown'], 'without the page the 3×3 is unknown');
  assert.match(FOE_EXTRAS[KEY].source, /%E2%80%9C%E5%A2%93%E7%A2%91%E2%80%9D&oldid=367181$/);
  for (const atkdown of [{ atk_scale: '0.4', square: 1 }, { atk_scale: 0, square: 1 }, { atk_scale: 0.4, square: 2 }, { atk_scale: 0.4, square: 1, range_radius: 1 }, { square: 1 }]) {
    assert.deepEqual(uncoveredAbilities([{ ...merged, talents: /** @type {any} */ ({ atkdown }) }]), ['atkdown'], JSON.stringify(atkdown));
  }
  for (const bb of [{ hp_ratio: '0.1' }, { hp_ratio: 0 }, { hp_ratio: -0.1 }, { hp_ratio: 0.1, duration: 5 }, {}]) {
    assert.deepEqual(uncoveredAbilities([{ ...merged, skills: [skill({ bb })] }]), ['refreshshield'], JSON.stringify(bb));
  }
  const cut = withoutIncomplete(raw());
  assert.equal(cut.talents?.atkdown, undefined);
  assert.deepEqual(cut.skills?.[0].bb, { hp_ratio: 0.1 });
});

test('[敌能-139] [敌人攻击-1] blocked: one hit of 100% of the current ATK on the blocker — a flying one too —, no 3×3, no projectile', () => {
  for (const motion of ['WALK', 'FLY']) {
    const box = stand(tomb(), [['wall', 1, 2], ['sniper', 0, 3]], { man: true, tune: (c) => { c.operators.wall.motion = motion; } });
    const wall = unitOf(box.w, 'wall'), sniper = unitOf(box.w, 'sniper');
    assert.equal(box.e.blockedBy, wall.id, motion);
    assert.equal(attrs.statsOf(wall).flying, motion === 'FLY');
    buffs.addBuff(box.e, buffs.makeBuff({ key: 'up', mods: { atkPct: 0.5 } }));
    const ev = strike(box);
    assert.deepEqual(hitsOf(ev, box.e.id).map((h) => [h.target, h.damage]), [[wall.id, 3000]], motion);
    const man = /** @type {Unit} */ (box.man);
    assert.equal(sniper.hp, sniper.maxHp);
    assert.equal(man.hp, man.maxHp, 'the neutral unit beside it');
    assert.equal(ev.some((x) => x.type === 'shot'), false);
  }
});

/**
 * One unblocked swing with ATK +50 % over the field of the 3×3 test; the hits it dealt by unit key, the `hit` events'
 * flags and the `attackHit` kinds. @param {EnemyDef} def
 */
function splashOnce(def) {
  const box = stand(def, [['sniper', 0, 3], ['bird', 0, 2], ['side', 1, 4], ['far', 2, 3]], { man: true });
  buffs.addBuff(box.e, buffs.makeBuff({ key: 'up', mods: { atkPct: 0.5 } }));
  /** @type {Record<string, unknown[]>} */
  const flags = {};
  /** @type {Record<string, unknown[]>} */
  const kinds = {};
  const key = (/** @type {Unit} */ u) => u.key;
  bus.on(box.w, 'hit', (x) => { if (x.credit?.id === box.e.id) flags[key(x.target)] = [x.dmg.type, !!x.dmg.isAttack, !!x.dmg.isSkill, !!x.dmg.isSplash, !!x.dmg.isProjectile]; });
  bus.on(box.w, 'attackHit', (x) => { if (x.attacker.id === box.e.id) kinds[key(x.target)] = [x.kind, x.isSkill]; });
  const ev = strike(box);
  const of = (/** @type {string} */ k) => dealt(ev, box.e.id, unitOf(box.w, k));
  return { box, ev, flags, kinds, of };
}

test('[敌能-139] [敌能-26] unblocked: the current ATK × atk_scale on the ground target and on its 3×3 — a flyer and a neutral unit too —, nothing further', () => {
  for (const scale of [0.4, 0.25]) {
    const { box, ev, flags, kinds, of } = splashOnce(tomb({ talents: { atkdown: { atk_scale: scale } } }));
    const hit = 3000 * scale;
    assert.equal(box.e.blockedBy, -1);
    assert.deepEqual(ev.filter((x) => x.type === 'attack' && x.id === box.e.id).map((x) => x.target), [unitOf(box.w, 'sniper').id], 'the flyer taunts more and is not the target');
    for (const k of ['sniper', 'bird', 'side', 'man']) assert.deepEqual(of(k), [hit], `${scale} ${k}`);
    assert.deepEqual(of('far'), [], 'two rows away');
    assert.equal(ev.some((x) => x.type === 'shot'), false, 'ALL fires no projectile');
    assert.deepEqual(flags.sniper, ['phys', true, false, false, false]);
    for (const k of ['bird', 'side', 'man']) assert.deepEqual(flags[k], ['phys', true, false, true, false], k);
    assert.deepEqual(kinds.sniper, ['main', false]);
    for (const k of ['bird', 'side', 'man']) assert.deepEqual(kinds[k], ['splash', false], k);
  }
});

test('[敌能-139] [索敌-2] unblocked: a flyer alone is not attacked; 迷彩 is no main target but is splashed, 隐匿 is neither', () => {
  const alone = stand(tomb(), [['bird', 0, 2]]);
  const bird = unitOf(alone.w, 'bird');
  const ev = strike(alone);
  assert.equal(ev.some((x) => x.type === 'attack' && x.id === alone.e.id), false);
  assert.equal(bird.hp, bird.maxHp);
  const box = stand(tomb(), [['sniper', 0, 3], ['side', 1, 4], ['far', 2, 3]]);
  const sniper = unitOf(box.w, 'sniper'), far = unitOf(box.w, 'far'), side = unitOf(box.w, 'side');
  buffs.addBuff(sniper, buffs.makeBuff({ key: 'camou', flags: { camou: true } }));
  buffs.addBuff(far, buffs.makeBuff({ key: 'stealth', flags: { stealth: true } }));
  const swing = strike(box);
  assert.deepEqual(swing.filter((x) => x.type === 'attack' && x.id === box.e.id).map((x) => x.target), [side.id]);
  assert.deepEqual(dealt(swing, box.e.id, sniper), [800], '迷彩 on the 3×3');
  assert.deepEqual(dealt(swing, box.e.id, far), [], '隐匿 on the 3×3');
});

/**
 * Frames of 墓碑's attacks and hits while a wall blocks it, over `n` frames from the deploy; the barriers it gained;
 * the hits that dealt nothing, as [frame, dealt, isSkill] (inside a step `w.frame` is the frame being run).
 * @param {ReturnType<typeof stand>} box @param {number} n
 */
function timeline(box, n) {
  /** @type {number[]} */
  const attacks = [];
  /** @type {number[]} */
  const hits = [];
  /** @type {number[]} */
  const shields = [];
  /** @type {[number, number, boolean][]} */
  const empty = [];
  bus.on(box.w, 'attackHit', (x) => { if (x.attacker.id === box.e.id && x.dealt === 0) empty.push([box.w.frame, x.dealt, x.isSkill]); });
  for (let i = 0; i < n; i++) {
    const f = box.w.frame, before = barriers(box.e)[0];
    for (const x of step(box.w, box.c)) {
      if (x.id === box.e.id && x.type === 'attack') attacks.push(f);
      if (x.id === box.e.id && x.type === 'hit') hits.push(f);
    }
    const now = barriers(box.e)[0];
    if (now && now !== before) shields.push(now.shield);
  }
  return { attacks, hits, shields, empty, releases: attacks.filter((f) => !hits.includes(f)) };
}

/** The first attack frame at or after `from`. @param {number[]} attacks @param {number} from */
const firstFrom = (attacks, from) => /** @type {number} */ (attacks.find((f) => f >= from));

test('[敌能-139] 刷新护盾 takes the first attack after its cooldown: no hit, the interval spent, a 屏障 of max HP × hp_ratio, then again a cooldown later', () => {
  const rows = [
    { def: tomb(), init: 10, every: 30, shield: 6000 },
    { def: tomb({ maxHp: 50000, skills: [skill({ initCooldown: 4, cooldown: 6, bb: { hp_ratio: 0.25 } })] }), init: 4, every: 6, shield: 12500 },
  ];
  /** @type {number[]} */
  const cds = [];
  for (const row of rows) {
    const box = stand(row.def, [['wall', 1, 2]]);
    cds.push(box.cd0);
    const t = timeline(box, 1500);
    const [first, second] = t.releases;
    assert.equal(first, firstFrom(t.attacks, box.cd0), `${row.init} s: the first attack once the initial cooldown is out`);
    assert.equal(second, firstFrom(t.attacks, first + row.every * 30), `${row.every} s after the release`);
    for (const r of [first, second]) assert.equal(t.attacks[t.attacks.indexOf(r) + 1] - r, INTERVAL, 'the release took a whole interval');
    assert.ok(t.hits.length > 0 && t.hits.every((f) => !t.releases.includes(f)));
    assert.deepEqual(t.shields.slice(0, 2), [row.shield, row.shield]);
    assert.deepEqual(t.empty.slice(0, 2), [[first, 0, true], [second, 0, true]], 'the released attack deals 0 and is the skill');
    assert.equal(barriers(box.e).length, 1, 'one buff, refreshed, not one per release');
  }
  assert.equal(cds[0] - cds[1], (10 - 4) * 30, 'the initial cooldown, seconds to frames');
});

/** Steps with the attack held until frame `at`, then lets one attack start in frame `at`. @param {ReturnType<typeof stand>} box @param {number} at */
function attackAt(box, at) {
  while (box.w.frame < at) { box.e.atkCd = 999; step(box.w, box.c); }
  return strike(box);
}

test('[敌能-139] frames: an attack sees the skill ready 299 frames after the spawn frame, then 900 frames after each release', () => {
  const box = stand(tomb(), [['wall', 1, 2]]);
  assert.equal(box.cd0, 299, 'the spawn frame\'s turn took one off 10 s');
  assert.deepEqual(hitsOf(attackAt(box, 298), box.e.id).map((h) => h.damage), [2000], 'frame 298: an attack');
  assert.equal(barriers(box.e).length, 0);
  assert.deepEqual(hitsOf(attackAt(box, 299), box.e.id), [], 'frame 299: the release');
  assert.equal(barriers(box.e).length, 1);
  buffs.removeBuff(box.e, BARRIER);
  assert.deepEqual(hitsOf(attackAt(box, 299 + 899), box.e.id).map((h) => h.damage), [2000]);
  assert.equal(barriers(box.e).length, 0);
  assert.deepEqual(hitsOf(attackAt(box, 299 + 900), box.e.id), [], '30 s after the release');
  assert.equal(barriers(box.e).length, 1);
});

test('[敌能-139] the 屏障: every type after DEF and RES, not HP loss; refreshed in place of what is left, from the current max HP; spent, it goes; unspent, it has no end', () => {
  const box = stand(tomb(), [['wall', 1, 2]]);
  const e = box.e, hp = e.hp;
  release(box);
  assert.deepEqual(barriers(e).map((b) => b.shield), [6000]);
  assert.equal(e.ab['refreshshield.cd'], 900);
  const hurt = (/** @type {'phys' | 'arts' | 'true' | 'elemental'} */ type, /** @type {number} */ amount, more = {}) => damage.dealDamage(box.w, null, e, { type, amount, ...more });
  assert.equal(hurt('phys', 1330), 0);
  assert.equal(barriers(e)[0].shield, 5000, 'DEF 330 first');
  assert.equal(hurt('arts', 1000), 0);
  assert.equal(barriers(e)[0].shield, 4550, 'RES 55 first');
  assert.equal(hurt('true', 500), 0);
  assert.equal(hurt('elemental', 100), 0);
  assert.equal(barriers(e)[0].shield, 3950);
  assert.equal(hurt('true', 100, { hpLoss: true }), 100);
  assert.equal(barriers(e)[0].shield, 3950, 'HP loss is not damage');
  assert.equal(e.hp, hp - 100);
  release(box);
  assert.deepEqual(barriers(e).map((b) => b.shield), [6000], 'refreshed, not 9950');
  buffs.addBuff(e, buffs.makeBuff({ key: 'big', mods: { hpPct: 0.5 } }));
  release(box);
  assert.deepEqual(barriers(e).map((b) => b.shield), [9000], 'the max HP now');
  assert.equal(hurt('true', 10000), 1000);
  assert.equal(barriers(e).length, 0, 'spent, the buff goes');
  release(box);
  assert.deepEqual(barriers(e).map((b) => b.shield), [9000], 'the next release brings it back');
  for (let i = 0; i < 1800; i++) { e.atkCd = 999; step(box.w, box.c); }
  assert.deepEqual(barriers(e).map((b) => b.shield), [9000], 'no end: 60 s on, with no release since, it is all still there');
});

test('[敌能-139] [攻击-3] the release launches nothing, also on a record whose attack shoots (RANGED)', () => {
  const box = stand(tomb({ applyWay: 'RANGED' }), [['wall', 1, 2]]);
  const shots = (/** @type {any[]} */ ev) => ev.filter((x) => x.type === 'shot' && x.id === box.e.id).length;
  assert.equal(shots(strike(box)), 1, 'its attack is a projectile');
  assert.equal(shots(release(box)), 0, 'the release is not');
  assert.equal(barriers(box.e).length, 1);
});

/**
 * Whether the release waits under `hold` (the attack ready, the skill ready) and comes on the frame after `free`.
 * @param {ReturnType<typeof stand>} box @param {(e: Unit) => void} hold @param {(e: Unit) => void} free
 */
function waits(box, hold, free) {
  hold(box.e);
  box.e.ab['refreshshield.cd'] = 0;
  box.e.atkCd = 0;
  for (let i = 0; i < 40; i++) step(box.w, box.c);
  const held = barriers(box.e).length === 0 && box.e.ab['refreshshield.cd'] === 0;
  free(box.e);
  box.e.atkCd = 0;
  const ev = step(box.w, box.c);
  return { held, now: barriers(box.e).length === 1 && hitsOf(ev, box.e.id).length === 0 };
}

test('[敌能-139] the release waits while no attack can start — no target, 缴械, 战栗 while blocked, 晕眩 — and takes the next one', () => {
  const none = stand(tomb(), []);
  none.e.ab['refreshshield.cd'] = 0;
  none.e.atkCd = 0;
  for (let i = 0; i < 40; i++) step(none.w, none.c);
  assert.deepEqual([barriers(none.e).length, none.e.ab['refreshshield.cd']], [0, 0], 'no target: ready, not released');
  /** @type {[string, string][]} */
  const touched = [];
  bus.on(none.w, 'attackHit', (x) => { if (x.attacker.id === none.e.id) touched.push([x.target.key, x.kind]); });
  const opened = step(none.w, none.c, [[0, { type: 'deploy', op: 'sniper', row: 0, col: 3, dir: 0 }], [0, { type: 'deploy', op: 'side', row: 1, col: 4, dir: 0 }]]);
  assert.equal(opened.some((x) => x.type === 'attack' && x.id === none.e.id), true);
  assert.deepEqual([barriers(none.e).length, hitsOf(opened, none.e.id).length], [1, 0], 'the first attack it can start is the release');
  assert.deepEqual(touched, [['sniper', 'main']], 'unblocked, the release reaches no 3×3');
  const cases = [
    ['缴械', (/** @type {Unit} */ e) => { buffs.addBuff(e, buffs.makeBuff({ key: 'disarm', flags: { noAttack: true } })); }, (/** @type {Unit} */ e) => { buffs.removeBuff(e, 'disarm'); }],
    ['战栗', (/** @type {Unit} */ e) => { status.applyStatus(e, 'disarmedCombat', {}); }, (/** @type {Unit} */ e) => { buffs.removeBuff(e, 'disarmedCombat'); }],
    ['晕眩', (/** @type {Unit} */ e) => { status.applyStatus(e, 'stun', {}); }, (/** @type {Unit} */ e) => { buffs.removeBuff(e, 'stun'); }],
  ];
  for (const [name, hold, free] of /** @type {[string, (e: Unit) => void, (e: Unit) => void][]} */ (cases)) {
    const box = stand(tomb(), [['wall', 1, 2]]);
    assert.deepEqual(waits(box, hold, free), { held: true, now: true }, name);
  }
});

test('[敌能-139] silence holds the release only without the immunity, and never the ranged attack, a talent', () => {
  const immune = stand(tomb(), [['wall', 1, 2]]);
  status.applyStatus(immune.e, 'silence', { seconds: 30 });
  assert.equal(!!attrs.statsOf(immune.e).flags.silence, false, '异常抗性：沉默');
  release(immune);
  assert.equal(barriers(immune.e).length, 1);
  const bare = stand(tomb({ immune: [] }), [['wall', 1, 2]]);
  status.applyStatus(bare.e, 'silence', { seconds: 30 });
  assert.equal(attrs.statsOf(bare.e).flags.silence, true);
  const hit = release(bare);
  assert.deepEqual(hitsOf(hit, bare.e.id).map((h) => h.damage), [2000], 'silenced, the attack stays an attack');
  assert.equal(barriers(bare.e).length, 0);
  assert.equal(bare.e.ab['refreshshield.cd'], 0, 'still ready');
  buffs.removeBuff(bare.e, 'silence');
  release(bare);
  assert.equal(barriers(bare.e).length, 1);
  const loud = stand(tomb({ immune: [] }), [['sniper', 0, 3], ['side', 1, 4]]);
  status.applyStatus(loud.e, 'silence', { seconds: 30 });
  assert.equal(attrs.statsOf(loud.e).flags.silence, true);
  const ev = strike(loud);
  assert.deepEqual(dealt(ev, loud.e.id, unitOf(loud.w, 'sniper')), [800], 'the ranged attack under silence');
  assert.deepEqual(dealt(ev, loud.e.id, unitOf(loud.w, 'side')), [800], 'and its 3×3');
});

test('[敌能-139] a text or missing page key leaves the attack ordinary, and a text hp_ratio never releases', () => {
  const plain = [
    raw(),
    withFoeExtras(KEY, raw({ talents: /** @type {any} */ ({ atkdown: { atk_scale: '0.4' } }) })),
  ];
  for (const def of plain) {
    const box = stand(def, [['sniper', 0, 3], ['side', 1, 4]]);
    const ev = strike(box);
    assert.deepEqual(hitsOf(ev, box.e.id).map((h) => h.damage), [2000], JSON.stringify(def.talents));
  }
  const odd = stand(tomb({ skills: [skill({ bb: { hp_ratio: '0.1' } })] }), [['wall', 1, 2]]);
  const ev = release(odd);
  assert.deepEqual(hitsOf(ev, odd.e.id).map((h) => h.damage), [2000]);
  assert.equal(barriers(odd.e).length, 0);
});

test('[敌能-139] an attack a skill listed before it already took is not the release', () => {
  const first = { key: 'CriticalHit', cooldown: 0, initCooldown: 0, sp: 0, bb: { atk_scale: 2, arts: 0 } };
  const box = stand(tomb({ skills: [first, skill()] }), [['wall', 1, 2]]);
  const ev = release(box);
  assert.deepEqual(hitsOf(ev, box.e.id).map((h) => h.damage), [4000], 'the earlier skill\'s hit');
  assert.deepEqual([barriers(box.e).length, box.e.ab['refreshshield.cd']], [0, 0], 'still ready, not released');
});

test('[敌能-139] the map effect is not this enemy\'s: our ATK, DEF and cost stay as they are with 墓碑 on the field', () => {
  /** @param {boolean} on */
  const field = (on) => {
    const box = stand(tomb(), [['wall', 1, 2]], { tune: (c) => {
      Object.assign(c.operators.wall, { atk: 300, def: 200 });
      c.level.options = { ...c.level.options, initialCost: 0, costIncreaseTime: 1 };
    } });
    if (!on) box.e.hp = 0;
    for (let i = 0; i < 90; i++) step(box.w, box.c);
    const s = attrs.statsOf(unitOf(box.w, 'wall'));
    return { atk: s.atk, def: s.def, cost: box.w.players[0].cost };
  };
  const there = field(true);
  assert.deepEqual([there.atk, there.def], [300, 200]);
  assert.deepEqual(there, field(false));
});

test('[敌能-139] the 屏障 and the cooldown are state: a snapshot restores them with the same hash', () => {
  const box = stand(tomb(), [['wall', 1, 2]]);
  release(box);
  const copy = restoreSnapshot(takeSnapshot(box.w));
  assert.equal(stateHash(copy), stateHash(box.w));
  for (let i = 0; i < 950; i++) { step(box.w, box.c); step(copy, box.c); }
  assert.equal(stateHash(copy), stateHash(box.w));
  const twin = /** @type {Unit} */ (copy.units.find((u) => u.kind === KIND.ENEMY && u.key === KEY));
  assert.deepEqual(barriers(twin).map((b) => b.shield), barriers(box.e).map((b) => b.shield));
});
