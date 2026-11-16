// Enemies that exist only in enemyDbRefs (docs/spec/level.md 关卡-1, 关卡-2, 关卡-8): they stay in the extracted table
// and out of the enemies that appear, so an uncovered ability of theirs does not refuse the level or enter `uncovered`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelAt, LEVELS } from '../src/index.js';

const ILLUSIONS = ['enemy_1324_wdsdw', 'enemy_1324_wdsdw_2'];
const RM07_REFS = ['enemy_1273_stmgun', 'enemy_1220_dzoms', 'enemy_1069_icebrk_2', 'enemy_1361_dthrow', 'enemy_1361_dthrow_2', 'enemy_1220_dzoms_2'];

/** A copy that loads: its unsupported runes cleared, marked as being tested (关卡-8). @param {string} id */
function opened(id) {
  const raw = structuredClone(LEVELS[id]);
  for (const d of Object.values(raw.difficulties)) d.unsupported = [];
  raw.testing = true;
  return raw;
}

/** @param {any} raw @param {'NORMAL' | 'FOUR_STAR'} difficulty */
const assembled = (raw, difficulty) => levelAt(raw.level.id, difficulty, undefined, { [raw.level.id]: raw });

test('[关卡-1] [关卡-2] a refs-only enemy is not one that appears: its uncovered ability, and one it names, do not refuse the level', () => {
  const raw = structuredClone(LEVELS.act1multi_01);
  raw.enemies.enemy_only_ref = { name: 'only', maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { summon: { enemy_key: 'enemy_named' }, nope: {} } };
  raw.enemies.enemy_named = { name: 'named', maxHp: 1, atk: 0, def: 0, res: 0, moveSpeed: 1, talents: { nope: {} } };
  const lv = levelAt('act1multi_01', 'NORMAL', undefined, { act1multi_01: raw });
  assert.equal(lv.level.uncovered, undefined);
  assert.equal(lv.enemies.enemy_only_ref, undefined);
  assert.equal(lv.enemies.enemy_named, undefined);
});

test('[关卡-1] [关卡-2] [关卡-8] act1multi_02 exports both 虚像; they do not appear, and uncovered is the same without them', () => {
  const table = LEVELS.act1multi_02.enemies;
  assert.equal(table.enemy_1324_wdsdw.name, '萨卡兹悖谬裂变学徒');
  assert.equal(table.enemy_1324_wdsdw_2.name, '萨卡兹悖谬裂变术师');
  assert.throws(() => levelAt('act1multi_02', 'NORMAL'), /runes not supported yet: env_system_new/);
  assert.throws(() => levelAt('act1multi_02', 'FOUR_STAR'), /runes not supported yet: env_system_new/);
  for (const difficulty of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
    const full = opened('act1multi_02');
    const gone = structuredClone(full);
    for (const k of ILLUSIONS) delete gone.enemies[k];
    const a = assembled(full, difficulty), b = assembled(gone, difficulty);
    assert.deepEqual(a.level.uncovered ?? null, b.level.uncovered ?? null, difficulty);
    for (const k of ILLUSIONS) assert.equal(a.enemies[k], undefined, `${difficulty} ${k}`);
    assert.equal(Object.keys(a.enemies).length, Object.keys(b.enemies).length, difficulty);
  }
});

test('[关卡-1] [关卡-2] a refs-only enemy keeps the level\'s override and is left out of the enemies that appear', () => {
  const mule = LEVELS.act1multi_tr01.enemies.enemy_4007_murino;
  assert.deepEqual([mule.maxHp, mule.atk], [2000, 700]);
  for (const difficulty of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
    const lv = levelAt('act1multi_tr01', difficulty);
    assert.equal(lv.enemies.enemy_4007_murino, undefined, difficulty);
    assert.equal(lv.level.uncovered, undefined, difficulty);
    assert.equal(Object.keys(lv.enemies).length, 5, difficulty);
  }
  const rm = levelAt('act1multi_rm07', 'NORMAL');
  for (const k of RM07_REFS) {
    assert.ok(LEVELS.act1multi_rm07.enemies[k], k);
    assert.equal(rm.enemies[k], undefined, k);
  }
  assert.equal(Object.keys(rm.enemies).length, 46);
  assert.equal(rm.level.uncovered, undefined);
  assert.throws(() => levelAt('act1multi_rm07', 'FOUR_STAR'), /runes not supported yet: env_gbuff_new_with_verify, env_system_new/);
  for (const difficulty of /** @type {const} */ (['NORMAL', 'FOUR_STAR'])) {
    const sub = levelAt('act1football_sub-1-2', difficulty);
    assert.ok(LEVELS['act1football_sub-1-2'].enemies.enemy_1277_sgman);
    assert.equal(sub.enemies.enemy_1277_sgman, undefined, difficulty);
    assert.equal(Object.keys(sub.enemies).length, 65, difficulty);
    assert.equal(sub.level.uncovered, undefined, difficulty);
  }
});
