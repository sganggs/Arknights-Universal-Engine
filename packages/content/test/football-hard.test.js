// 阵地足球's harder matches (docs/spec/football.md 足球-6, 足球-17; level.md 关卡-2): IG-FT-2's and IG-S-4's elite
// players — a team's `_2` in place of the standard team's elite one —, IG-S-4 drawing no standard team, its multipliers
// of the players' talents, and the players stronger the more we lead. The levels are the extracted ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, football as fb, KIND } from '@aue/sim';
import { levelAt, matchContent, TESTING, LEVEL_EXTRAS } from '../src/index.js';

/** @typedef {import('@aue/sim').Unit} Unit */

const HARD = 'act1multi_football_hard-01';
const BUILD = { elite: 2, level: 90, potential: 1, trust: 100, skill: 0, skillLevel: 10 };

/** @param {string} level @param {'NORMAL' | 'FOUR_STAR'} difficulty @param {number} seed */
const match = (level, difficulty, seed) => matchContent({ level, difficulty, seed, decks: [[{ id: 'char_010_chen', build: BUILD }]] });

/** The players of a world, by key. @param {any} w */
const players = (w) => w.units.filter((/** @type {Unit} */ u) => u.kind === KIND.ENEMY && !u.ball && /_mu(mssi|bufn|gnfu|sht|hry|kfu)/.test(u.key)).map((/** @type {Unit} */ u) => u.key);

test('[足球-6] IG-FT-2 (FOUR_STAR): the standard team’s elite players bring the drawn team’s elite ones; IG-FT-1 the plain ones', () => {
  const ft2 = levelAt('act1multi_football', 'FOUR_STAR'), ft1 = levelAt('act1multi_football', 'NORMAL'), f = /** @type {any} */ (ft2.level.football);
  for (const t of f.teams) {
    for (const role of ['forward', 'goalkeeper', 'muscleman']) {
      assert.ok(Object.hasOwn(ft2.enemies, t.elite[role]) && !Object.hasOwn(ft2.enemies, t.players[role]), `${t.name} ${role}: elite only at FOUR_STAR`);
      assert.ok(Object.hasOwn(ft1.enemies, t.players[role]) && !Object.hasOwn(ft1.enemies, t.elite[role]), `${t.name} ${role}: plain only at NORMAL`);
    }
  }
  assert.deepEqual(ft2.level.uncovered ?? [], [], 'IG-FT-2: every ability read');
  const c = /** @type {any} */ ({ level: ft2.level }), w = /** @type {any} */ ({ football: { team: 1 } });
  assert.deepEqual(['enemy_4012_mumssi_2', 'enemy_4013_mubufn_2', 'enemy_4014_mugnfu_2', 'enemy_4012_mumssi', 'enemy_1021_bslime'].map((k) => fb.teamKey(w, c, k)),
    ['enemy_4022_mushtm_2', 'enemy_4023_mushtb_2', 'enemy_4024_mushtg_2', 'enemy_4022_mushtm', 'enemy_1021_bslime']);
  w.football.team = 0;
  assert.equal(fb.teamKey(w, c, 'enemy_4014_mugnfu_2'), 'enemy_4014_mugnfu_2', 'the standard team: 锤锤到肉 itself');
});

test('[足球-6] [关卡-8] IG-S-4 loads being tested and never draws the standard team; its elite players come on the field', async () => {
  assert.ok(TESTING.includes(HARD));
  assert.match(LEVEL_EXTRAS[HARD].source, /oldid=428766$/);
  const lv = levelAt(HARD, 'NORMAL'), f = /** @type {any} */ (lv.level.football);
  assert.deepEqual(f.teams.map((/** @type {any} */ t) => [t.name, t.weight]), [['normal', 0], ['shooter', 10], ['hurrier', 10], ['kungfuer', 10]]);
  assert.equal(Object.hasOwn(lv.enemies, 'enemy_4014_mugnfu') || Object.hasOwn(lv.enemies, 'enemy_4022_mushtm'), false, 'no plain players');
  const drawn = new Set();
  for (let seed = 1; seed <= 40; seed++) drawn.add(fb.newFootball(createWorld(/** @type {any} */ ({ level: lv.level, enemies: {}, operators: {} }), { seed, players: 1 }), /** @type {any} */ ({ level: lv.level })).team);
  assert.deepEqual([...drawn].toSorted(), [1, 2, 3]);
  const c = await match(HARD, 'NORMAL', 3), w = createWorld(c, { seed: 3, players: 1 });
  for (let i = 0; i < 300 && players(w).length < 3; i++) step(w, c);
  const team = /** @type {any} */ (c.level.football).teams[/** @type {any} */ (w.football).team];
  assert.ok(players(w).length > 0 && players(w).every((/** @type {string} */ k) => Object.values(team.elite).includes(k)), players(w).join());
});

test('[关卡-2] IG-S-4’s enemy_talent_blackb_mul: each on the talents of the enemies it is for, on their values', () => {
  const e = levelAt(HARD, 'NORMAL').enemies, t = (/** @type {string} */ k) => /** @type {any} */ (e[k]).talents;
  // 战术队精英击球手: the level's own 1.8 and 3.0 and 15 (its overwrite) × 1.2, × 1.5, × 0.6
  assert.ok(Math.abs(t('enemy_4022_mushtm_2').football.slapshot_force - 1.8 * 1.2) < 1e-9);
  assert.equal(t('enemy_4022_mushtm_2').searchBall.range_radius, 4.5);
  assert.ok(Math.abs(t('enemy_4022_mushtm_2').Reborn.duration - 9) < 1e-9);
  // 爱球会荣誉击球手: 1.0 × 1.2 × 0.88; its 带球 of the level's block_volume 2
  assert.ok(Math.abs(t('enemy_4025_muhrym_2').football.slapshot_force - 1.056) < 1e-9);
  assert.equal(/** @type {any} */ (e.enemy_4025_muhrym_2).skills.find((/** @type {any} */ s) => s.key === 'slapshot').bb.block_volume, 2);
  // a goalkeeper is not among the forwards of the 1.5: its radius as it is; every Reborn × 0.6
  assert.equal(t('enemy_4026_muhryb_2').searchBall.range_radius, 2);
  assert.ok(Math.abs(t('enemy_4026_muhryb_2').Reborn.duration - 12) < 1e-9);
  // IG-FT-1 has none of them
  assert.equal(/** @type {any} */ (levelAt('act1multi_football', 'FOUR_STAR').enemies.enemy_4022_mushtm_2).talents.football.slapshot_force, 1.7);
});

test('[足球-17] a player brought in while we lead 2: max HP × 1.4, ATK × 1.3, move speed × 1.02, at full HP; the balls as they are', async () => {
  const c = await match(HARD, 'NORMAL', 5), w = createWorld(c, { seed: 5, players: 1 }), st = /** @type {any} */ (w.football);
  assert.deepEqual(/** @type {any} */ (c.level.football).catchUp, { maxHp: 0.2, atk: 0.15, moveSpeed: 0.01 });
  st.home = 2;
  for (let i = 0; i < 300 && players(w).length < 3; i++) step(w, c);
  const p = /** @type {Unit} */ (w.units.find((u) => players(w).includes(u.key))), rec = /** @type {any} */ (c.enemies[p.key]);
  assert.ok(Math.abs(p.base.maxHp - rec.maxHp * 1.4) < 1e-6 && p.hp === p.maxHp && p.maxHp === p.base.maxHp);
  assert.ok(Math.abs(p.base.atk - rec.atk * 1.3) < 1e-6);
  assert.ok(Math.abs(p.base.moveSpeed - rec.moveSpeed * 1.02) < 1e-9);
  const ball = /** @type {Unit} */ (w.units.find((u) => u.ball));
  assert.equal(ball.base.maxHp, /** @type {any} */ (c.enemies[ball.key]).maxHp);
  // behind: nothing more
  const w2 = createWorld(c, { seed: 5, players: 1 });
  /** @type {any} */ (w2.football).away = 2;
  for (let i = 0; i < 300 && players(w2).length < 3; i++) step(w2, c);
  const q = /** @type {Unit} */ (w2.units.find((u) => players(w2).includes(u.key)));
  assert.equal(q.base.maxHp, /** @type {any} */ (c.enemies[q.key]).maxHp);
});
