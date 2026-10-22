// Field auras (docs/spec/foes.md 敌能-74) on the tiny map. 术师囚犯 is act1multi_07, 梅菲斯特 is
// act1multi_fortress_hard-01 (ArknightsGameData 17759cc8). A plain victim has that record's stats and no talents,
// so 禁锢's −50 attack speed is not mistaken for the aura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, attrs, status, buffs, KIND } from '@aue/sim';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { skeletonContent, levelAt } from '../src/index.js';
import { uncoveredAbilities, withFoeExtras } from '../src/foes.js';
import act07 from '../data/levels/act1multi_07.json' with { type: 'json' };
import fort from '../data/levels/act1multi_fortress_hard-01.json' with { type: 'json' };

/** @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

const ig = /** @type {any} */ (act07).enemies;
const df = /** @type {any} */ (fort).enemies;
/** @param {any} e @param {string} name */
const bare = (e, name) => ({ ...e, name, talents: {}, skills: [] });

/** Records the arena can spawn. The two shared `healaura` shapes have no page marker. */
const ENEMIES = {
  enemy_1120_vofwiz: ig.enemy_1120_vofwiz,
  enemy_1120_vofwiz_2: ig.enemy_1120_vofwiz_2,
  plain: bare(ig.enemy_1121_lifbos, '重犯'),
  neutral_one: { ...bare(ig.enemy_1121_lifbos, '中立'), neutral: true },
  enemy_1507_mephi: df.enemy_1507_mephi,
  regen: bare(df.enemy_1508_faust, '浮士德'),
  enemy_1156_hymhr: {
    name: '荷谟伊英雄', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 1,
    talents: { healaura: { hp_recovery_per_sec: 100 } },
  },
  enemy_1514_smephi: {
    name: '梅菲斯特，“歌者”', maxHp: 1000, atk: 0, def: 0, res: 0, moveSpeed: 1,
    talents: { healaura: { hp_recovery_per_sec: 0 } },
  },
};

/**
 * The tiny map. Each foe is [key, row, col, rooted]; a null row keeps the spawn point and its path.
 * @param {[string, number | null, number, boolean][]} foes
 */
function arena(foes) {
  const c = /** @type {any} */ (tinyContent());
  c.enemies = Object.fromEntries(Object.entries(ENEMIES).map(([k, e]) => [k, withFoeExtras(k, e)]));
  c.behaviors = skeletonContent.behaviors;
  c.level.waves = [oneWave(foes.map(([k]) => spawnAt(0, k)))];
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, costIncreaseTime: 1000 };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c);
  const es = w.units.filter((u) => u.kind === KIND.ENEMY);
  es.forEach((e, i) => {
    const [, row, col, rooted] = foes[i];
    if (row !== null) { e.x = col; e.y = row; e.path = []; e.pt = 0; }
    if (rooted) status.applyStatus(e, 'root', {});
  });
  return { c, w, es };
}

/** Runs n frames. @param {World} w @param {any} c @param {number} n */
function run(w, c, n) {
  for (let i = 0; i < n; i++) step(w, c);
}

const S = attrs.statsOf;
/** @param {Unit} u @param {string} key */
const lent = (u, key) => u.buffs.find((b) => b.key === key);
/** The base field attrs reads for 生命回复速度; the typedef leaves it out (属性-3's default 0). @param {Unit} u @param {number} per */
const regenOf = (u, per) => { /** @type {{ hpRecoveryPerSec?: number }} */ (u.base).hpRecoveryPerSec = per; };

test('[敌能-74] 术师囚犯: +30 on every enemy, the holder included; not on a neutral', () => {
  const { c, w, es: [holder, cant, neutral, gone, fly, stealth] } = arena([
    ['enemy_1120_vofwiz', 1, 1, true], ['plain', 1, 2, true], ['neutral_one', 1, 3, true],
    ['plain', 0, 1, true], ['plain', 0, 3, true], ['plain', 0, 4, true],
  ]);
  gone.hidden = true;
  fly.base.motion = 'FLY';
  buffs.addBuff(cant, buffs.makeBuff({ key: 'cant', flags: { untargetable: true } }));
  buffs.addBuff(stealth, buffs.makeBuff({ key: 'hide', flags: { stealth: true } }));
  status.applyStatus(holder, 'silence', {});
  run(w, c, 3);
  assert.equal(lent(holder, 'atkspeedup')?.mods.aspd, 30);
  assert.equal(S(holder).aspd, 80, '禁锢 −50 and the aura +30');
  assert.notEqual(S(holder).flags.silence, true, '异常抗性：沉默 does not take effect');
  for (const u of [cant, gone, fly, stealth]) assert.equal(S(u).aspd, 130);
  assert.equal(cant.buffs.filter((b) => b.key === 'atkspeedup').length, 1);
  assert.equal(S(neutral).aspd, 100);
  assert.equal(lent(neutral, 'atkspeedup'), undefined);
});

test('[敌能-74] two 术师囚犯 lend +30 once', () => {
  const { c, w, es: [a, b, ally] } = arena([
    ['enemy_1120_vofwiz', 1, 1, true], ['enemy_1120_vofwiz', 1, 2, true], ['plain', 1, 3, true],
  ]);
  run(w, c, 2);
  assert.equal(S(ally).aspd, 130);
  assert.equal(ally.buffs.filter((b) => b.key === 'atkspeedup').length, 1);
  assert.deepEqual([S(a).aspd, S(b).aspd], [80, 80]);
});

test('[敌能-74] 术师囚犯 and 危险术师囚犯 lend +50 once; +30 remains after +50 is knocked down', () => {
  const { c, w, es: [low, high, ally] } = arena([
    ['enemy_1120_vofwiz', 1, 1, true], ['enemy_1120_vofwiz_2', 1, 2, true], ['plain', 1, 3, true],
  ]);
  run(w, c, 2);
  assert.equal(S(ally).aspd, 150);
  assert.equal(lent(ally, 'atkspeedup')?.mods.aspd, 50);
  assert.equal(ally.buffs.filter((b) => b.key === 'atkspeedup').length, 1);
  high.hp = 0;
  run(w, c, 1);
  assert.equal(S(ally).aspd, 130);
  assert.equal(lent(ally, 'atkspeedup')?.mods.aspd, 30);
  assert.equal(S(low).aspd, 80);
});

test('[敌能-74] the attack-speed aura outlasts one frame after the holder is knocked down, then ends', () => {
  const { c, w, es: [holder, ally] } = arena([
    ['enemy_1120_vofwiz', 1, 1, true], ['plain', 1, 3, true],
  ]);
  run(w, c, 1);
  assert.equal(S(ally).aspd, 130);
  holder.hp = 0;
  run(w, c, 1);
  assert.equal(S(ally).aspd, 130);
  run(w, c, 2);
  assert.equal(S(ally).aspd, 100);
  assert.equal(lent(ally, 'atkspeedup'), undefined);
});

test('[敌能-74] the attack-speed aura ends after the holder reaches the goal', () => {
  const { c, w, es: [holder, ally] } = arena([
    ['enemy_1120_vofwiz', null, 0, false], ['plain', 0, 2, true],
  ]);
  holder.base.moveSpeed = 8;
  run(w, c, 2);
  assert.equal(S(ally).aspd, 130);
  /** @type {any[]} */
  const ev = [];
  for (let i = 0; i < 600 && !ev.some((e) => e.type === 'goal' && e.id === holder.id); i++) ev.push(...step(w, c));
  assert.ok(ev.some((e) => e.type === 'goal' && e.id === holder.id));
  run(w, c, 1);
  assert.equal(S(ally).aspd, 130);
  run(w, c, 2);
  assert.equal(S(ally).aspd, 100);
});

test('[敌能-74] 梅菲斯特 doubles 生命回复速度, including himself; none stays none; silence still lends', () => {
  const { c, w, es: [holder, regen, zero, flat, neutral] } = arena([
    ['enemy_1507_mephi', 1, 1, true], ['regen', 1, 2, true], ['regen', 1, 3, true], ['regen', 0, 1, true], ['neutral_one', 0, 3, true],
  ]);
  regenOf(holder, 3);
  regenOf(regen, 6);
  regenOf(neutral, 6);
  buffs.addBuff(flat, buffs.makeBuff({ key: 'flat', mods: { hpRegen: 4 } }));
  buffs.addBuff(regen, buffs.makeBuff({ key: 'cant', flags: { untargetable: true } }));
  run(w, c, 2);
  assert.equal(S(holder).hpRecoveryPerSec, 6);
  assert.equal(S(regen).hpRecoveryPerSec, 12);
  assert.equal(lent(regen, 'healaura')?.mods.hpRegenPct, 1);
  assert.equal(S(zero).hpRecoveryPerSec, 0);
  assert.equal(S(flat).hpRecoveryPerSec, 8);
  assert.equal(S(neutral).hpRecoveryPerSec, 6);
  assert.equal(lent(neutral, 'healaura'), undefined);
  status.applyStatus(holder, 'silence', {});
  run(w, c, 2);
  assert.equal(S(holder).flags.silence, true);
  assert.equal(S(regen).hpRecoveryPerSec, 12);
});

test('[敌能-74] two 梅菲斯特 still double once', () => {
  const { c, w, es: [, , regen] } = arena([
    ['enemy_1507_mephi', 1, 1, true], ['enemy_1507_mephi', 1, 2, true], ['regen', 1, 3, true],
  ]);
  regenOf(regen, 6);
  run(w, c, 2);
  assert.equal(S(regen).hpRecoveryPerSec, 12);
  assert.equal(regen.buffs.filter((b) => b.key === 'healaura').length, 1);
});

test('[敌能-74] 荷谟伊英雄 and 歌者 healaura stay uncovered and lend nothing', () => {
  const hymn = ENEMIES.enemy_1156_hymhr, singer = ENEMIES.enemy_1514_smephi;
  assert.deepEqual(uncoveredAbilities([hymn, singer]), ['healaura']);
  const mephi = df.enemy_1507_mephi;
  assert.equal(uncoveredAbilities([mephi]).includes('healaura'), true);
  assert.equal(uncoveredAbilities([withFoeExtras('enemy_1507_mephi', mephi)]).includes('healaura'), false);
  const { c, w, es: [, , regen] } = arena([
    ['enemy_1156_hymhr', 1, 1, true], ['enemy_1514_smephi', 1, 2, true], ['regen', 1, 3, true],
  ]);
  regenOf(regen, 6);
  run(w, c, 3);
  assert.equal(S(regen).hpRecoveryPerSec, 6);
  assert.equal(lent(regen, 'healaura'), undefined);
});

/** Enemy keys one record's blackboards name that this level also has. @param {any} enemies @param {any} e @param {Set<string>} used */
function bringIns(enemies, e, used) {
  const boards = [...Object.values(e.talents ?? {}), ...(e.skills ?? []).map((/** @type {any} */ x) => x.bb ?? {})];
  for (const bb of boards) for (const v of Object.values(bb)) if (typeof v === 'string' && Object.hasOwn(enemies, v)) used.add(v);
}

/**
 * The gap list levelAt would name (关卡-2): spawned enemies, extras merged. act1multi_07 is not loaded — its devices
 * are not profiled — so this is that list without the device check.
 * @param {any} raw
 */
function gapsOf(raw) {
  const level = raw.level;
  const frags = [...level.waves.flatMap((/** @type {any} */ w) => w.fragments), ...Object.values(level.branches ?? {}).flat()];
  const used = new Set(frags.flatMap((/** @type {any} */ f) => f.actions.filter((/** @type {any} */ a) => a.type === 'SPAWN').map((/** @type {any} */ a) => a.key)));
  for (const k of used) if (raw.enemies[k]) bringIns(raw.enemies, raw.enemies[k], used);
  return uncoveredAbilities([...used].map((k) => withFoeExtras(k, raw.enemies[k])));
}

test('[敌能-74] [关卡-2] act1multi_07 and IG-DF-1 hard drop these auras from the gap list', () => {
  const prisoners = [withFoeExtras('enemy_1120_vofwiz', ig.enemy_1120_vofwiz), withFoeExtras('enemy_1120_vofwiz_2', ig.enemy_1120_vofwiz_2)];
  assert.deepEqual(uncoveredAbilities(prisoners), []);
  assert.equal(gapsOf(act07).includes('atkspeedup'), false);
  for (const d of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
    const lv = levelAt('act1multi_fortress_hard-01', d);
    assert.equal((lv.level.uncovered ?? []).includes('healaura'), false);
    assert.ok((lv.level.uncovered ?? []).length > 0);
  }
});
