// 萨卡兹枯朽系 (docs/spec/foes.md 敌能-46). No shipped level carries these ids, so the records are the game data's
// blackboards (ArknightsGameData 17759cc8) plus the page extras. initCooldown is 0 here: the data's −1 is not a duration
// secondsToFrames accepts, and the attack-charged bar does not use that cooldown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, damage, devices } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, withFoeExtras, FOE_EXTRAS } from '../src/index.js';
import { uncoveredAbilities } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const HP = 1e6;
const DIE = { polluted_damage_low: 50, polluted_damage_high: 25, projectile_life_time: 8, projectile_range: 2 };
const SKILL = { polluted_damage_low: 50, polluted_damage_high: 25, projectile_life_time: 10, projectile_delay_time: 10, range_radius: 2.2 };
const BOX = { name: 'box', maxHp: 400, atk: 0, def: 0, res: 0, blockCnt: 0, baseAttackTime: 1, aspd: 100, tauntLevel: 0, massLevel: 0, talentBb: {} };
const EIGHT = [50, 50, 50, 50, 50, 50, 50, 50];
const QUARTER = [25, 25, 25, 25, 25, 25, 25, 25];
const AT = [32, 62, 92, 122, 152, 182, 212, 242];

/** @param {string} key @param {Partial<EnemyDef>} more @returns {EnemyDef} */
function foe(key, more) {
  return /** @type {EnemyDef} */ ({ name: key, maxHp: 5000, atk: 0, def: 0, res: 0, moveSpeed: 0, ...more });
}

/** @param {EnemyDef} def */
function skillBb(def) {
  const skill = def.skills && def.skills[0];
  if (!skill) throw new Error(`${def.name} has no skill`);
  return skill.bb;
}

/** @param {EnemyDef} def @param {string} name */
function talentBb(def, name) {
  const bb = def.talents && def.talents[name];
  if (!bb) throw new Error(`${def.name} has no ${name}`);
  return bb;
}

/** @param {string} key */
const warrior = (key) => withFoeExtras(key, foe(key, { atk: 0, applyWay: 'MELEE', talents: { PollutedDie: { ...DIE } } }));

/** @param {string} key @param {number} [atk] */
function tank(key, atk = 100) {
  return withFoeExtras(key, foe(key, {
    atk, applyWay: 'ALL', rangeRadius: 2.2, baseAttackTime: 4.5, immune: ['silence'],
    talents: { Empty: { 'attack@chuang_atk_scale': 2, sp: 2 } },
    skills: [{ key: 'PollutedRangedAtk', cooldown: 0, initCooldown: 0, sp: 2, bb: { ...SKILL } }],
  }));
}

/** @param {string} key @param {number} dps @param {number} [bat] */
function bleedOf(key, dps, bat = 4.5) {
  return foe(key, {
    atk: 100, applyWay: 'MELEE', baseAttackTime: bat,
    talents: { Bleeding: { 'attack@bleeding_damage': dps, 'attack@duration': 10 } },
  });
}

/** 改装排污车: the shared keys, no page extras. */
function cart() {
  return foe('enemy_15058_dqtank', {
    atk: 100, applyWay: 'ALL', rangeRadius: 2.2, baseAttackTime: 4.5, immune: ['silence'],
    talents: { Empty: { 'attack@chuang_atk_scale': 2, sp: 2 } },
    skills: [{ key: 'PollutedRangedAtk', cooldown: 0, initCooldown: 0, sp: 2, bb: {
      polluted_damage_low: 100, polluted_damage_high: 100, projectile_life_time: 10, projectile_delay_time: 10, range_radius: 4,
    } }],
  });
}

/**
 * Tiny map, these enemies rooted at (3, 1), operators deployed on frame 1. Attack 100 so 100% and 200% are obvious
 * (the data's tank attack is 750 / 850).
 * @param {[string, any][]} defs @param {[string, number, number][]} ops
 */
function bring(defs, ops) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = Object.fromEntries(defs);
  c.behaviors = skeletonContent.behaviors;
  for (const name of ['g2', 'g3', 'g4']) c.operators[name] = { ...c.operators.guard, name };
  for (const name of ['s2', 's3']) c.operators[name] = { ...c.operators.sniper, name };
  c.level.waves = [oneWave(defs.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 9 };
  for (const o of Object.values(c.operators)) Object.assign(o, { cost: 0, atk: 0, def: 0, res: 0, maxHp: HP });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.owner < 0);
  for (const e of es) { e.x = 3; e.y = 1; status.applyStatus(e, 'root', {}); }
  const first = step(w, c, ops.map(([op, row, col]) => [0, { type: 'deploy', op, row, col, dir: 0 }]));
  const by = Object.fromEntries(w.units.filter((u) => u.owner >= 0).map((u) => [u.key, u]));
  return { c, w, e: /** @type {Unit} */ (es[0]), es, by, first };
}

/** @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) for (const ev of step(w, c)) out.push({ ...ev, f: w.frame - 1 });
  return out;
}

/** @param {any[]} ev @param {number} id */
const took = (ev, id) => ev.filter((x) => x.type === 'hit' && x.target === id);

/** Physical hits of `e` (100 or 200), not a zone's 25 or 50. @param {World} w @param {any} c @param {Unit} e @param {number} n */
function strikes(w, c, e, n) {
  /** @type {{ damage: number, sp: number, zones: number }[]} */
  const out = [];
  for (let i = 0; i < 500 && out.length < n; i++) {
    for (const x of step(w, c)) {
      const damage = Number(x.damage);
      if (x.type === 'hit' && x.id === e.id && damage >= 100) out.push({ damage, sp: Number(e.ab['PollutedRangedAtk.sp']), zones: w.zones ? w.zones.length : 0 });
    }
  }
  return out;
}

/** @param {Unit} u @param {string} name */
const flag = (u, name) => { buffs.addBuff(u, buffs.makeBuff({ key: name, flags: { [name]: true } })); };

/** SP left when the only ally is a highland sniper, or a flying blocker. @param {string} key @param {'high' | 'fly'} how */
function untouched(key, how) {
  const { c, w, e, by } = bring([[key, tank(key)]], [how === 'high' ? ['sniper', 2, 3] : ['guard', 1, 0]]);
  if (how === 'fly') { status.applyStatus(by.guard, 'levitate', {}); by.guard.x = 3; by.guard.y = 1; e.atkCd = 0; step(w, c); }
  return e.ab['PollutedRangedAtk.sp'];
}

/** SP after a wind-up whose target dies before the hit. @param {string} key @param {any} def */
function afterLoss(key, def) {
  def.attack = { duration: 0.1, hit: 0.1 };
  const { c, w, e, by } = bring([[key, def]], [['guard', 1, 1]]);
  assert.equal(e.swing === null, false);
  assert.equal(e.ab['PollutedRangedAtk.sp'], 0);
  assert.equal(w.zones, undefined);
  by.guard.hp = 0;
  for (let i = 0; i < 8 && e.swing; i++) step(w, c);
  assert.equal(e.swing, null);
  assert.equal(w.zones, undefined);
  const held = e.ab['PollutedRangedAtk.sp'];
  step(w, c);
  return { held, back: e.ab['PollutedRangedAtk.sp'] };
}

test('[敌能-46] 枯朽战士: death zone radius 2 for 8 s, 50 on 低地 and 25 on 高地, including flying, 迷彩 and 无法选择; not outside, not a device', () => {
  const { c, w, e, by } = bring([['enemy_1267_nhpbr', warrior('enemy_1267_nhpbr')]], [
    ['guard', 1, 2], ['g2', 1, 4], ['g3', 1, 1], ['g4', 1, 0], ['sniper', 2, 3], ['s2', 2, 2], ['s3', 0, 3],
  ]);
  status.applyStatus(by.g2, 'levitate', {});
  assert.equal(attrs.statsOf(by.g2).flying, true);
  flag(by.s2, 'camou');
  flag(by.s3, 'untargetable');
  c.devices = { box: BOX };
  assert.equal(devices.spawnDevice(w, c, 'box', 1, 5), true);
  const box = /** @type {Unit} */ (w.units.find((u) => u.key === 'box'));
  e.hp = 0;
  const ev = run(w, c, 250);
  const low = took(ev, by.guard.id);
  assert.deepEqual(low.map((x) => x.damage), EIGHT);
  assert.deepEqual(low.map((x) => x.f), AT);
  assert.deepEqual(low.map((x) => x.id), Array(8).fill(-1), 'the warrior is already gone, so the tick has no source');
  assert.deepEqual(took(ev, by.g2.id).map((x) => x.damage), EIGHT, '可对空');
  assert.deepEqual(took(ev, by.g3.id).map((x) => x.damage), EIGHT, 'distance 2 is inside');
  assert.deepEqual(took(ev, by.sniper.id).map((x) => x.damage), QUARTER);
  assert.deepEqual(took(ev, by.s2.id).map((x) => x.damage), QUARTER, '无视迷彩');
  assert.deepEqual(took(ev, by.s3.id).map((x) => x.damage), QUARTER, '无视无法选择');
  assert.deepEqual(took(ev, by.g4.id), [], 'distance 3 is outside radius 2');
  assert.deepEqual(took(ev, box.id), [], '干员和召唤物 does not include a device');
  assert.equal(w.zones, undefined, 'eight ticks and the zone is gone');
});

test('[敌能-46] two death zones due together tick the earlier one once', () => {
  const lead = warrior('enemy_1267_nhpbr_2');
  talentBb(lead, 'PollutedDie').polluted_damage_low = 80;
  const { c, w, es, by } = bring([
    ['enemy_1267_nhpbr', warrior('enemy_1267_nhpbr')],
    ['enemy_1267_nhpbr_2', lead],
  ], [['guard', 1, 2]]);
  for (const u of es) u.hp = 0;
  const ev = run(w, c, 40);
  assert.deepEqual(took(ev, by.guard.id).map((x) => x.damage), [50]);
});

test('[敌能-46] a silenced warrior leaves no zone; a fall does', () => {
  const quiet = bring([['enemy_1267_nhpbr', warrior('enemy_1267_nhpbr')]], [['guard', 1, 2]]);
  status.applyStatus(quiet.e, 'silence', {});
  quiet.e.hp = 0;
  assert.equal(run(quiet.w, quiet.c, 40).some((x) => x.type === 'hit'), false);
  assert.equal(quiet.w.zones, undefined);
  assert.equal(quiet.by.guard.hp, HP);
  const fell = bring([['enemy_1267_nhpbr', warrior('enemy_1267_nhpbr')]], []);
  fell.c.level.tiles[1][3] = { key: 'tile_hole', height: 'LOWLAND', buildable: 'NONE', passable: 'ALL', side: 'ALL' };
  step(fell.w, fell.c);
  assert.equal(fell.w.units.includes(fell.e), false);
  const z = /** @type {any} */ (fell.w.zones?.[0]);
  assert.deepEqual([z.x, z.y, z.radius, z.low, z.high, z.air, z.open, z.life], [3, 1, 2, 50, 25, true, true, 240]);
});

test('[敌能-46] 枯朽战车: the first attack is the skill, then two normal attacks, then the skill; the zone is wide and does not ignore 迷彩', () => {
  const { c, w, e, by, first } = bring([['enemy_1272_nhtank', tank('enemy_1272_nhtank')]], [['guard', 1, 1]]);
  const z = /** @type {any} */ (w.zones?.[0]);
  assert.equal(first.find((x) => x.type === 'hit')?.damage, 100);
  assert.equal(e.ab['PollutedRangedAtk.sp'], 0);
  assert.deepEqual([z.x, z.y, z.radius, z.air, z.wide, z.open, z.placed, z.low, z.high], [by.guard.x, by.guard.y, 2.2, true, true, false, 1, 50, 25]);
  const more = strikes(w, c, e, 3);
  // The first zone lasts 10 s (born on frame 1) and is already gone before the fourth attack opens the next one.
  assert.deepEqual(more.map((h) => [h.damage, h.sp, h.zones]), [[100, 1, 1], [100, 2, 1], [100, 0, 1]]);
  assert.equal(w.zones?.[0]?.placed, w.frame - 1);
  flag(by.guard, 'camou');
  c.devices = { box: BOX };
  devices.spawnDevice(w, c, 'box', 1, 5);
  const box = /** @type {Unit} */ (w.units.find((u) => u.key === 'box'));
  box.x = by.guard.x;
  box.y = by.guard.y;
  const ev = run(w, c, 40);
  assert.deepEqual(took(ev, by.guard.id), [], 'the plain zone still respects 迷彩');
  assert.deepEqual(took(ev, box.id).map((x) => x.damage), [50], '我方单位 includes our device');
});

test('[敌能-46] 枯朽战车 blocked: the skill stays 100% and the next attacks are 200%', () => {
  const { c, w, e, by, first } = bring([['enemy_1272_nhtank', tank('enemy_1272_nhtank')]], [['guard', 1, 3]]);
  assert.equal(e.blockedBy, by.guard.id);
  assert.equal(first.find((x) => x.type === 'hit')?.damage, 100);
  assert.equal(e.ab['PollutedRangedAtk.sp'], 0);
  assert.equal(w.zones?.length, 1);
  const more = strikes(w, c, e, 2);
  assert.deepEqual(more.map((h) => [h.damage, h.sp]), [[200, 1], [200, 2]]);
});

test('[敌能-46] both tanks ignore a highland ally and a flying blocker, and do not spend SP', () => {
  assert.equal(untouched('enemy_1272_nhtank', 'high'), 2);
  assert.equal(untouched('enemy_1272_nhtank_2', 'high'), 2);
  assert.equal(untouched('enemy_1272_nhtank', 'fly'), 2);
  assert.equal(untouched('enemy_1272_nhtank_2', 'fly'), 2);
});

test('[敌能-46] 尖端: a camouflaged lowland blocker is enough to spend the skill; its zone ignores 迷彩 and skips devices', () => {
  const { c, w, e, by } = bring([['enemy_1272_nhtank_2', tank('enemy_1272_nhtank_2')]], [['guard', 1, 0]]);
  flag(by.guard, 'camou');
  by.guard.x = 3;
  by.guard.y = 1;
  e.atkCd = 0;
  const ev = step(w, c);
  const z = /** @type {any} */ (w.zones?.[0]);
  assert.equal(ev.find((x) => x.type === 'hit')?.damage, 100);
  assert.equal(e.ab['PollutedRangedAtk.sp'], 0);
  assert.deepEqual([z.open, z.wide, z.air, z.radius], [true, false, true, 2.2]);
  c.devices = { box: BOX };
  devices.spawnDevice(w, c, 'box', 1, 5);
  const box = /** @type {Unit} */ (w.units.find((u) => u.key === 'box'));
  box.x = 3;
  box.y = 1;
  const later = run(w, c, 40);
  assert.deepEqual(took(later, by.guard.id).map((x) => x.damage), [50]);
  assert.deepEqual(took(later, box.id), []);
});

test('[敌能-46] 尖端 refunds the bar when the swing loses its target; the plain tank and 排污车 do not', () => {
  assert.deepEqual(afterLoss('enemy_1272_nhtank_2', tank('enemy_1272_nhtank_2')), { held: 0, back: 2 });
  assert.deepEqual(afterLoss('enemy_1272_nhtank', tank('enemy_1272_nhtank')), { held: 0, back: 0 });
  assert.deepEqual(afterLoss('enemy_15058_dqtank', cart()), { held: 0, back: 0 });
});

test('[敌能-46] silenced, with no immunity, the charged attack stays a normal 200% and the bar is not spent', () => {
  const bare = foe('enemy_1272_nhtank', {
    atk: 100, applyWay: 'ALL', rangeRadius: 2.2, baseAttackTime: 4.5,
    talents: { Empty: { 'attack@chuang_atk_scale': 2 } },
    skills: [{ key: 'PollutedRangedAtk', cooldown: 0, initCooldown: 0, sp: 2, bb: { ...SKILL } }],
  });
  const { c, w, e, by } = bring([['enemy_1272_nhtank', bare]], [['guard', 1, 0]]);
  status.applyStatus(e, 'silence', {});
  by.guard.x = 3;
  by.guard.y = 1;
  e.atkCd = 0;
  const ev = step(w, c);
  assert.equal(ev.find((x) => x.type === 'hit')?.damage, 200);
  assert.equal(e.ab['PollutedRangedAtk.sp'], 2);
  assert.equal(w.zones, undefined);
});

test('[敌能-46] 逐腐兽: bleed ticks sourceless arts, stops at 1 HP, refreshes in phase, and a heal ends it', () => {
  const { c, w, by, first } = bring([['enemy_1270_nhstlk', bleedOf('enemy_1270_nhstlk', 100)]], [['guard', 1, 3]]);
  assert.equal(first.find((x) => x.type === 'hit')?.damage, 100);
  const b = by.guard.buffs.find((x) => x.key === 'bleed');
  assert.equal(b?.value, 100);
  assert.equal(b?.left, 300);
  by.guard.hp = 30;
  const ev = run(w, c, 40);
  assert.deepEqual(took(ev, by.guard.id).map((x) => [x.damage, x.id, x.f]), [[29, -1, 31]]);
  assert.equal(by.guard.hp, 1);
  const later = run(w, c, 40);
  assert.equal(later.some((x) => x.type === 'hit' && x.id === -1), false);
  assert.equal(by.guard.hp, 1);
  const again = bring([['enemy_1270_nhstlk', bleedOf('enemy_1270_nhstlk', 100, 0.5)]], [['guard', 1, 3]]);
  for (let i = 0; i < 15; i++) step(again.w, again.c);
  const kept = again.by.guard.buffs.filter((x) => x.key === 'bleed');
  assert.equal(kept.length, 1);
  assert.equal(kept[0].value, 100);
  assert.equal(kept[0].left, 300);
  assert.ok(kept[0].acc > 0, 'the one-second phase is not restarted');
  const healed = bring([['enemy_1270_nhstlk', bleedOf('enemy_1270_nhstlk', 100)]], [['guard', 1, 3]]);
  assert.equal(damage.heal(healed.w, null, healed.by.guard, 10), 10);
  assert.equal(healed.by.guard.buffs.some((x) => x.key === 'bleed'), false);
});

test('[敌能-46] a heal of 0 and 禁疗 leave bleed; 无敌 still receives it; a skill attack does not', () => {
  const none = bring([['enemy_1270_nhstlk', bleedOf('enemy_1270_nhstlk', 100)]], [['guard', 1, 3]]);
  assert.equal(damage.heal(none.w, null, none.by.guard, 0), 0);
  assert.equal(none.by.guard.buffs.some((x) => x.key === 'bleed'), true);
  status.applyStatus(none.by.guard, 'healFree', {});
  assert.equal(damage.heal(none.w, null, none.by.guard, 10), 0);
  assert.equal(none.by.guard.buffs.some((x) => x.key === 'bleed'), true);
  const blocked = bring([['enemy_1270_nhstlk', bleedOf('enemy_1270_nhstlk', 100)]], [['guard', 1, 0]]);
  status.applyStatus(blocked.by.guard, 'invincible', {});
  blocked.by.guard.x = 3;
  blocked.by.guard.y = 1;
  blocked.e.atkCd = 0;
  step(blocked.w, blocked.c);
  assert.equal(blocked.by.guard.hp, HP);
  assert.equal(blocked.by.guard.buffs.some((x) => x.key === 'bleed'), true);
  const mixed = foe('m', {
    atk: 100, applyWay: 'MELEE', baseAttackTime: 4.5,
    talents: { Bleeding: { 'attack@bleeding_damage': 100, 'attack@duration': 10 } },
    skills: [{ key: 'PollutedRangedAtk', cooldown: 0, initCooldown: 0, sp: 2, bb: { ...SKILL } }],
  });
  const skill = bring([['m', mixed]], [['guard', 1, 3]]);
  assert.equal(skill.first.find((x) => x.type === 'hit')?.damage, 100);
  assert.equal(skill.by.guard.buffs.some((x) => x.key === 'bleed'), false);
  assert.equal(skill.w.zones?.length, 1);
});

test('[敌能-46] 疯狂的逐腐兽 bleeds 150 and 食腐野兽, unread, bleeds 100 from the same keys', () => {
  const crazy = bring([['enemy_1270_nhstlk_2', bleedOf('enemy_1270_nhstlk_2', 150)]], [['guard', 1, 3]]);
  assert.equal(crazy.by.guard.buffs.find((x) => x.key === 'bleed')?.value, 150);
  const beast = bring([['enemy_15011_dqnhst', bleedOf('enemy_15011_dqnhst', 100)]], [['guard', 1, 3]]);
  assert.equal(beast.by.guard.buffs.find((x) => x.key === 'bleed')?.value, 100);
});

test('[敌能-46] 改装排污车 follows the shared numbers: it hits a flying blocker, and its zone is not 可对空, not open, not wide', () => {
  const { c, w, e, by } = bring([['enemy_15058_dqtank', cart()]], [['guard', 1, 0]]);
  status.applyStatus(by.guard, 'levitate', {});
  by.guard.x = 3;
  by.guard.y = 1;
  e.atkCd = 0;
  const ev = step(w, c, [
    [0, { type: 'deploy', op: 'sniper', row: 2, col: 3, dir: 0 }],
    [0, { type: 'deploy', op: 'g2', row: 1, col: 0, dir: 0 }],
  ]);
  const z = /** @type {any} */ (w.zones?.[0]);
  assert.equal(ev.find((x) => x.type === 'hit' && x.target === by.guard.id)?.damage, 100);
  assert.equal(e.ab['PollutedRangedAtk.sp'], 0);
  assert.deepEqual([z.radius, z.air, z.open, z.wide, z.low, z.high], [4, false, false, false, 100, 100]);
  const sniper = /** @type {Unit} */ (w.units.find((u) => u.key === 'sniper'));
  const g2 = /** @type {Unit} */ (w.units.find((u) => u.key === 'g2'));
  flag(g2, 'camou');
  const later = run(w, c, 40);
  assert.deepEqual(took(later, sniper.id).map((x) => x.damage), [100], '高地 uses the data\'s 100');
  assert.deepEqual(took(later, by.guard.id), [], 'no 可对空, so the flying blocker takes no zone tick');
  assert.deepEqual(took(later, g2.id), [], 'no 无视迷彩');
});

test('[敌能-46] the six ids, 食腐野兽 and 改装排污车 are covered; 「阿米娅」 and a warrior without the page extras are not', () => {
  const raw = foe('enemy_1267_nhpbr', { atk: 0, applyWay: 'MELEE', talents: { PollutedDie: { ...DIE } } });
  assert.deepEqual(uncoveredAbilities([raw]), ['PollutedDie']);
  const amiya = foe('enemy_1552_mmamiy', { talents: { Bleeding: { interval: -1, hp_ratio: -1 } } });
  assert.deepEqual(uncoveredAbilities([amiya]), ['Bleeding']);
  assert.ok(uncoveredAbilities([bleedOf('enemy_1270_nhstlk', 100), amiya]).includes('Bleeding'));
  const covered = [
    warrior('enemy_1267_nhpbr'), warrior('enemy_1267_nhpbr_2'),
    tank('enemy_1272_nhtank'), tank('enemy_1272_nhtank_2'),
    bleedOf('enemy_1270_nhstlk', 100), bleedOf('enemy_1270_nhstlk_2', 150),
    bleedOf('enemy_15011_dqnhst', 100), cart(),
  ];
  const names = uncoveredAbilities(covered);
  for (const name of ['PollutedDie', 'Bleeding', 'Empty', 'PollutedRangedAtk']) assert.equal(names.includes(name), false);
});

test('[敌能-46] page extras merge only onto the ids whose pages were read', () => {
  const plain = skillBb(tank('enemy_1272_nhtank'));
  const tip = skillBb(tank('enemy_1272_nhtank_2'));
  const die = talentBb(warrior('enemy_1267_nhpbr'), 'PollutedDie');
  assert.equal(plain.wide, 1);
  assert.equal(plain.open, undefined);
  assert.equal(plain.air, 1);
  assert.equal(talentBb(tank('enemy_1272_nhtank'), 'Empty').low, 1);
  assert.equal(tip.gate, 1);
  assert.equal(tip.refund, 1);
  assert.equal(tip.open, 1);
  assert.equal(die.air, 1);
  assert.equal(die.open, 1);
  assert.equal(skillBb(cart()).air, undefined);
  assert.ok(FOE_EXTRAS.enemy_1267_nhpbr.source.endsWith('oldid=375553'));
  assert.ok(FOE_EXTRAS.enemy_1267_nhpbr_2.source.endsWith('oldid=375554'));
  assert.ok(FOE_EXTRAS.enemy_1272_nhtank.source.endsWith('oldid=367663'));
  assert.ok(FOE_EXTRAS.enemy_1272_nhtank_2.source.endsWith('oldid=380616'));
});
