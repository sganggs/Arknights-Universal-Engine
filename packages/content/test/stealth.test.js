// 隐匿 that the enemy data does not carry (docs/spec/foes.md 敌能-131) on the tiny map: the pages' plain 隐匿 with 索敌-2's
// 3 s, the 0 s pages, 业余竞演者's 孤立 and 流泪小子's attack stun. The records are built here from enemy_database
// (ArknightsGameData 17759cc8, level 0); 隐形弩手组长 (act1multi_fortress_rm01), 访问团强攻手 and 访问团强攻冠军
// (act1multi_01, act2multi_rm01) also come from their shipped levels' records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, status, buffs, damage, targeting, blocking, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { levelAt, levelContent } from '../src/index.js';
import { foeBehaviors, withFoeExtras, uncoveredAbilities, FOE_EXTRAS } from '../src/foes.js';

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').EnemyDef} EnemyDef */

const LURKER = 'enemy_1009_lurker', SHOOTER = 'enemy_1019_jshoot', SHOOTER_2 = 'enemy_1019_jshoot_2', MAGE = 'enemy_1023_jmage';
const STRIKER = 'enemy_1389_winbab', CHAMP = 'enemy_1389_winbab_2', AMATEUR = 'enemy_10031_cnvsld', THIEF = 'enemy_2034_sythef', THIEF_2 = 'enemy_2034_sythef_2';
const BLADE = 'enemy_1175_dushdo', BLADE_2 = 'enemy_1175_dushdo_2', GUARD = 'enemy_1174_duholy';

/**
 * A record from enemy_database (17759cc8, level 0). @param {string} name @param {Partial<EnemyDef>} p
 * @returns {EnemyDef}
 */
const foe = (name, p) => ({ name, maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, baseAttackTime: 2, applyWay: 'MELEE', motion: 'WALK', massLevel: 1, ...p });

/** @type {Record<string, EnemyDef>} */
const RAW = {
  [LURKER]: foe('潜伏者', { maxHp: 2200, atk: 300, def: 90, res: 20 }),
  [SHOOTER]: foe('隐形弩手', { maxHp: 1800, atk: 260, def: 100, res: 20, moveSpeed: 0.9, baseAttackTime: 2.7, applyWay: 'RANGED', rangeRadius: 2.2 }),
  [SHOOTER_2]: foe('隐形弩手组长', { maxHp: 2700, atk: 310, def: 130, res: 20, moveSpeed: 0.9, baseAttackTime: 2.7, applyWay: 'RANGED', rangeRadius: 2.2 }),
  [MAGE]: foe('隐形术师', { maxHp: 2200, atk: 350, def: 80, res: 50, moveSpeed: 0.8, baseAttackTime: 4, applyWay: 'RANGED', rangeRadius: 2, dmgType: 'arts' }),
  [STRIKER]: foe('访问团强攻手', { maxHp: 6000, atk: 550, def: 300, res: 10, moveSpeed: 0.6, baseAttackTime: 3, applyWay: 'RANGED', rangeRadius: 3.5, massLevel: 2, levelType: 'NORMAL' }),
  [CHAMP]: foe('访问团强攻冠军', { maxHp: 7000, atk: 650, def: 400, res: 10, moveSpeed: 0.6, baseAttackTime: 3, applyWay: 'RANGED', rangeRadius: 3.5, massLevel: 2, levelType: 'NORMAL' }),
  [AMATEUR]: foe('业余竞演者', { maxHp: 4000, atk: 300, def: 100, moveSpeed: 1.5, rangeRadius: -1, levelType: 'NORMAL' }),
  [THIEF]: foe('流泪小子', { maxHp: 8000, atk: 300, def: 150, res: 20, moveSpeed: 0.8, massLevel: 2, levelType: 'ELITE', talents: { Combat: { 'attack@stun': 4 } } }),
  [THIEF_2]: foe('流泪小子', { maxHp: 4500, atk: 300, def: 150, res: 20, moveSpeed: 0.8, massLevel: 2, levelType: 'ELITE', talents: { Combat: { 'attack@stun': 3.5 } } }),
  [BLADE]: foe('深池伙友影刃', { maxHp: 12000, atk: 400, def: 350, moveSpeed: 0.8, baseAttackTime: 2.1, rangeRadius: 1.4, massLevel: 2, levelType: 'ELITE', dmgType: 'arts', talents: { traitAbility: { base_attack_time: -1.2 } } }),
  [BLADE_2]: foe('深池伙友影刃精英', { maxHp: 15000, atk: 580, def: 550, moveSpeed: 0.8, baseAttackTime: 2.1, rangeRadius: 1.4, massLevel: 2, levelType: 'ELITE', dmgType: 'arts', talents: { traitAbility: { base_attack_time: -1.3 } } }),
  [GUARD]: foe('深池伙友卫队', { maxHp: 15000, atk: 900, def: 900, moveSpeed: 0.8, baseAttackTime: 4, rangeRadius: 1.4, massLevel: 5, levelType: 'ELITE', talents: { traitAbility: { range_radius: 1.1, taunt_level: 0, attack_speed: -30 } } }),
};

/** Each row's `Stealth` and its page's revision (敌能-131). @type {[string, Record<string, number>, number][]} */
const ROWS = [
  [LURKER, {}, 361358], [SHOOTER, {}, 422262], [SHOOTER_2, {}, 422263], [MAGE, {}, 413925], [BLADE, {}, 353500], [BLADE_2, {}, 353501],
  [STRIKER, { restore: 0 }, 356721], [CHAMP, { restore: 0 }, 360436], [AMATEUR, { restore: 0, alone: 1 }, 356722], [THIEF, { restore: 0 }, 361355],
];

/** `Combat`'s other shapes in enemy_database (17759cc8): 反装甲步兵, 裂礁者, “肇事者”, “皇帝的利刃”, 伊祖米克的子代. */
const OTHER_COMBAT = /** @type {Record<string, number>[]} */ ([
  { 'attack@atk_scale': 2 }, { atk_scale: 2 }, { atk_scale: 800, rush_damage: 0.4 }, { 'attack@combat_atkscale.atk_scale': 2.5 },
  /** @type {any} */ ({ enemy_key: 'enemy_2021_syfish', offset_bound: 0.15 }),
]);

/**
 * The tiny map: each foe [key, x, y] spawns rooted at (x, y), its attack held. `defs` are the records, the extras
 * merged unless they come merged from a level; our units are sturdy.
 * @param {[string, number, number][]} foes @param {Record<string, EnemyDef>} [defs]
 */
function arena(foes, defs) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = defs ?? Object.fromEntries(foes.map(([k]) => [k, withFoeExtras(k, RAW[k])]));
  c.behaviors = { foes: foeBehaviors };
  c.level.waves = [oneWave(foes.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000, characterLimit: 9 };
  for (const op of Object.values(c.operators)) Object.assign(op, { cost: 0, maxHp: 1e6 });
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.kind === KIND.ENEMY);
  es.forEach((e, i) => {
    Object.assign(e, { x: foes[i][1], y: foes[i][2], path: [], pt: 0, atkCd: 1000 });
    status.applyStatus(e, 'root', {});
  });
  return { c, w, es };
}

/** Steps n frames, the events collected. @param {World} w @param {any} c @param {number} n @param {any[]} [cmds] */
function run(w, c, n, cmds = []) {
  /** @type {any[]} */
  const out = [];
  for (let i = 0; i < n; i++) out.push(...step(w, c, i === 0 ? cmds.map((x) => [0, x]) : []));
  return out;
}

/** Deploys one of ours facing right. @param {World} w @param {any} c @param {string} op @param {number} row @param {number} col */
function put(w, c, op, row, col) {
  step(w, c, [[0, { type: 'deploy', op, row, col, dir: 0 }]]);
  return /** @type {Unit} */ (w.units.find((u) => u.key === op));
}

/** @param {Unit} u @param {string} key */
const buffOf = (u, key) => u.buffs.find((b) => b.key === key);
/** @param {Unit} u */
const windowOf = (u) => buffOf(u, 'stealthOff:lurk');
/** @param {any[]} ev @param {Unit} by */
const hitsBy = (ev, by) => ev.filter((x) => x.type === 'hit' && x.id === by.id);

test('[敌能-131] [关卡-2] the ten rows: Stealth, with the page\'s restore where it names one, 孤立 on 业余竞演者, the marker on 流泪小子\'s Combat', () => {
  for (const [key, want, oldid] of ROWS) {
    const merged = withFoeExtras(key, RAW[key]);
    assert.deepEqual(merged.talents?.Stealth, want, key);
    assert.deepEqual(uncoveredAbilities([merged]), [], key);
    assert.ok(FOE_EXTRAS[key].source.endsWith(`oldid=${oldid}`), key);
  }
  assert.deepEqual(withFoeExtras(BLADE, RAW[BLADE]).talents?.traitAbility, { base_attack_time: -1.2, partner: 1.4 }, '敌能-126\'s row, extended');
  assert.deepEqual(withFoeExtras(THIEF, RAW[THIEF]).talents?.Combat, { 'attack@stun': 4, page: 1 });
  assert.deepEqual(uncoveredAbilities([RAW[THIEF]]), ['Combat'], 'without its page marker');
  assert.deepEqual(Object.keys(foeBehaviors.Stealth).sort(), ['spawn', 'tick']);
});

test('[敌能-131] [关卡-2] the other 流泪小子 record (no page read) and Combat\'s other shapes stay uncovered, marked or not', () => {
  assert.equal(FOE_EXTRAS[THIEF_2], undefined);
  assert.deepEqual(uncoveredAbilities([withFoeExtras(THIEF_2, RAW[THIEF_2])]), ['Combat']);
  for (const bb of OTHER_COMBAT) {
    assert.deepEqual(uncoveredAbilities([foe('e', { talents: { Combat: bb } })]), ['Combat'], JSON.stringify(bb));
    assert.deepEqual(uncoveredAbilities([foe('e', { talents: { Combat: { ...bb, page: 1 } } })]), ['Combat'], `${JSON.stringify(bb)} with a marker`);
  }
  assert.deepEqual(uncoveredAbilities([foe('e', { talents: { Combat: { 'attack@stun': 4, page: 1, extra: 1 } } })]), ['Combat']);
});

test('[敌能-131] [索敌-2] a page with only 隐匿 (潜伏者): hidden from spawn, ours hold fire; blocked they shoot; released, hidden 3 s later', () => {
  const { c, w, es: [e] } = arena([[LURKER, 2, 1]]);
  const hide = buffOf(e, 'lurk');
  assert.equal(hide?.flags.stealth, true);
  assert.equal(Object.hasOwn(/** @type {object} */ (hide), 'restore'), false, '索敌-2\'s default');
  status.applyStatus(e, 'silence', {});
  const sniper = put(w, c, 'sniper', 2, 2);
  assert.equal(hitsBy(run(w, c, 90), sniper).length, 0, 'hidden, silenced too');
  assert.deepEqual([targeting.stealthed(e), targeting.selectable(e)], [true, false]);
  const g = put(w, c, 'guard', 1, 2);
  assert.equal(e.blockedBy, g.id);
  assert.ok(hitsBy(run(w, c, 90), sniper).length > 0, 'blocked: selectable');
  run(w, c, 1, [{ type: 'retreat', unit: g.id }]);
  assert.equal(windowOf(e)?.left, 89, 'the retreat counts its frame (索敌-2)');
  run(w, c, 88);
  assert.equal(targeting.stealthed(e), false);
  run(w, c, 1);
  assert.deepEqual([targeting.stealthed(e), windowOf(e)], [true, undefined]);
  run(w, c, 9000);
  assert.deepEqual([w.units.includes(e), buffOf(e, 'lurk')?.left, targeting.stealthed(e)], [true, -1, true], 'it does not expire: 5 minutes on');
});

test('[敌能-131] [时间-2] a `restore` in seconds becomes the buff\'s frames: a page naming 1 s would give a 30-frame window', () => {
  const { c, w, es: [e] } = arena([['one', 2, 1]], { one: foe('one', { maxHp: 1000, talents: { Stealth: { restore: 1 } } }) });
  assert.equal(buffOf(e, 'lurk')?.restore, 30);
  const g = put(w, c, 'guard', 1, 2);
  assert.deepEqual([e.blockedBy, targeting.stealthed(e)], [g.id, false]);
  Object.assign(e, { x: 3 });
  blocking.release(e);
  assert.equal(windowOf(e)?.left, 30);
  run(w, c, 29);
  assert.equal(targeting.stealthed(e), false);
  run(w, c, 1);
  assert.equal(targeting.stealthed(e), true);
});

test('[敌能-131] [索敌-2] 隐形弩手组长 as act1multi_fortress_rm01 has it, and the other two plain pages: hidden, back 90 frames after a release', () => {
  const real = levelContent('act1multi_fortress_rm01', 'NORMAL').enemies;
  assert.deepEqual(real[SHOOTER_2].talents?.Stealth, {});
  assert.ok(!(levelAt('act1multi_fortress_rm01', 'NORMAL').level.uncovered ?? []).includes('Stealth'));
  for (const [key, defs] of /** @type {[string, Record<string, EnemyDef> | undefined][]} */ ([[SHOOTER_2, { [SHOOTER_2]: real[SHOOTER_2] }], [SHOOTER, undefined], [MAGE, undefined]])) {
    const { c, w, es: [e] } = arena([[key, 2, 1]], defs);
    assert.equal(targeting.stealthed(e), true, key);
    const g = put(w, c, 'guard', 1, 2);
    assert.deepEqual([e.blockedBy, targeting.stealthed(e)], [g.id, false], key);
    Object.assign(e, { x: 3 });
    blocking.release(e);
    assert.equal(windowOf(e)?.left, 90, key);
    run(w, c, 90);
    assert.equal(targeting.stealthed(e), true, key);
  }
});

test('[敌能-131] [索敌-2] 「解除阻挡0秒后恢复」: 访问团强攻手 and 冠军 as act1multi_01 and act2multi_rm01 have them are hidden again the frame the block ends', () => {
  for (const id of ['act1multi_01', 'act2multi_rm01']) {
    const real = levelContent(id, 'NORMAL').enemies;
    assert.equal(levelAt(id, 'NORMAL').level.uncovered, undefined, id);
    for (const key of [STRIKER, CHAMP]) {
      assert.deepEqual(real[key].talents?.Stealth, { restore: 0 }, `${id} ${key}`);
      const { c, w, es: [e] } = arena([[key, 2, 1]], { [key]: real[key] });
      assert.equal(buffOf(e, 'lurk')?.restore, 0, key);
      const sniper = put(w, c, 'sniper', 2, 2);
      const g = put(w, c, 'guard', 1, 2);
      assert.equal(targeting.stealthed(e), false, key);
      assert.ok(hitsBy(run(w, c, 60), sniper).length > 0, key);
      run(w, c, 1, [{ type: 'retreat', unit: g.id }]);
      assert.equal(e.blockedBy, -1, key);
      assert.deepEqual([targeting.stealthed(e), windowOf(e)], [true, undefined], `${id} ${key}: no window`);
      assert.equal(hitsBy(run(w, c, 60), sniper).length, 0, key);
    }
  }
});

test('[敌能-131] [索敌-2] 反隐 lifts the 隐匿 of each kind of page, the 0 s ones too, and it comes back when the 反隐 goes', () => {
  for (const key of [LURKER, CHAMP]) {
    const { c, w, es: [e] } = arena([[key, 2, 1]]);
    buffs.addBuff(e, buffs.makeBuff({ key: 'reveal', flags: { unstealth: true } }));
    run(w, c, 1);
    assert.deepEqual([targeting.stealthed(e), targeting.selectable(e)], [false, true], key);
    buffs.removeBuff(e, 'reveal');
    assert.equal(targeting.stealthed(e), true, key);
  }
});

test('[敌能-131] 业余竞演者: 孤立 while its 隐匿 holds — no heal from another unit —; blocked or under 反隐 neither; released, both back at once', () => {
  const { c, w, es: [e, other] } = arena([[AMATEUR, 2, 1], [LURKER, 3, 1]]);
  const alone = () => buffOf(e, 'lurkAlone')?.flags.noAllyHeal === true;
  e.hp = 3000;
  assert.deepEqual([targeting.stealthed(e), alone(), damage.heal(w, other, e, 100)], [true, true, 0]);
  assert.equal(buffOf(other, 'lurkAlone'), undefined, 'only the page that writes 孤立');
  const g = put(w, c, 'guard', 1, 2);
  assert.deepEqual([e.blockedBy, targeting.stealthed(e), alone()], [g.id, false, true], 'its turn looked before the deploy blocked it');
  run(w, c, 1);
  assert.deepEqual([targeting.stealthed(e), alone()], [false, false], 'its next turn');
  assert.equal(damage.heal(w, other, e, 100), 100);
  run(w, c, 1, [{ type: 'retreat', unit: g.id }]);
  assert.deepEqual([e.blockedBy, targeting.stealthed(e), windowOf(e), alone()], [-1, true, undefined, true], '0 s; its turn came after the retreat');
  buffs.addBuff(e, buffs.makeBuff({ key: 'reveal', flags: { unstealth: true } }));
  run(w, c, 1);
  assert.deepEqual([targeting.stealthed(e), alone()], [false, false], '反隐');
  buffs.removeBuff(e, 'reveal');
  run(w, c, 1);
  assert.deepEqual([targeting.stealthed(e), alone()], [true, true]);
});

/**
 * 流泪小子 blocked by the guard on (1, 2); `tune` runs before its attack is let go. Stops at the frame its first hit
 * lands: the hit event (none when it took no HP: dodged, 无敌) or the guard's stun, whichever comes.
 * @param {(e: Unit, g: Unit) => void} [tune] @param {string} [key]
 */
function struck(tune, key = THIEF) {
  const { c, w, es: [e] } = arena([[key, 2, 1]]);
  const g = put(w, c, 'guard', 1, 2);
  run(w, c, 1);
  assert.equal(e.blockedBy, g.id);
  tune?.(e, g);
  e.atkCd = 0;
  for (let i = 0; i < 60; i++) {
    const hit = hitsBy(step(w, c), e)[0];
    if (hit || buffOf(g, 'stun')) return { c, w, e, g, hit };
  }
  throw new Error('no hit');
}

test('[敌能-131] 流泪小子: a hit stuns the guard blocking it for 4 s; the block ends and its 隐匿 (0 s) is back the next frame', () => {
  const { c, w, e, g, hit } = struck();
  assert.equal(hit?.damage, 300 - 100);
  assert.equal(buffOf(g, 'stun')?.left, 120, '4 s, from the next frame');
  assert.equal(buffOf(e, 'lurk')?.restore, 0);
  run(w, c, 1);
  assert.equal(buffOf(g, 'stun')?.left, 119);
  assert.deepEqual([e.blockedBy, targeting.stealthed(e), windowOf(e)], [-1, true, undefined], 'a stunned guard blocks no more (阻挡-3)');
});

test('[敌能-131] 流泪小子\'s stun: silenced, on a dodged hit, on an invincible unit too; the unmarked record and another Combat shape stun nothing', () => {
  const silenced = struck((e) => status.applyStatus(e, 'silence', {}));
  assert.equal(buffOf(silenced.g, 'stun')?.left, 120, 'a talent: silence does not stop it');
  const dodged = struck((_e, g) => buffs.addBuff(g, buffs.makeBuff({ key: 'evade', mods: { dodgePhys: 1 } })));
  assert.deepEqual([dodged.hit, dodged.g.hp, buffOf(dodged.g, 'stun')?.left], [undefined, 1e6, 120], 'dodged');
  const shielded = struck((_e, g) => status.applyStatus(g, 'invincible', {}));
  assert.deepEqual([shielded.hit, shielded.g.hp, buffOf(shielded.g, 'stun')?.left], [undefined, 1e6, 120], '无敌');
  const plain = struck(undefined, THIEF_2);
  assert.equal(plain.hit?.damage, 200);
  assert.equal(buffOf(plain.g, 'stun'), undefined, 'enemy_2034_sythef_2: no page marker');
  RAW.other = foe('other', { maxHp: 1e4, atk: 300, talents: { Combat: { atk_scale: 2, page: 1 } } });
  RAW.marked = foe('marked', { maxHp: 1e4, atk: 300, talents: { Combat: { 'attack@stun': 3.5, page: 1 } } });
  const other = struck(undefined, 'other'), marked = struck(undefined, 'marked');
  delete RAW.other;
  delete RAW.marked;
  assert.equal(other.hit?.damage, 200);
  assert.equal(buffOf(other.g, 'stun'), undefined, 'another shape');
  assert.equal(buffOf(marked.g, 'stun')?.left, 105, 'the blackboard\'s attack@stun seconds, not the page\'s 4');
});

test('[敌能-131] [敌能-126] 影刃: hidden from spawn beside its 卫队, the shorter interval kept; blocked and released, back 3 s later', () => {
  for (const key of [BLADE, BLADE_2]) {
    const { c, w, es: [e] } = arena([[key, 2, 1], [GUARD, 3.4, 1]]);
    run(w, c, 2);
    assert.equal(targeting.stealthed(e), true, key);
    assert.ok(buffOf(e, 'partnerHaste'), `${key}: 敌能-126`);
    const g = put(w, c, 'guard', 1, 2);
    assert.deepEqual([e.blockedBy, targeting.stealthed(e)], [g.id, false], key);
    Object.assign(e, { x: 1 });
    blocking.release(e);
    assert.equal(windowOf(e)?.left, 90, key);
    run(w, c, 90);
    assert.equal(targeting.stealthed(e), true, key);
  }
});
