// A summon's attack role (docs/spec/summons.md 召唤-12): what its description says — arts or true damage, a heal, no
// attack —, none for the summons whose texts only say what they do instead, physical for the rest; then their real
// records on the tiny level. Test names cite the clauses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step, summons, attrs, DIR } from '@aue/sim';
import { ROSTER, loadTraining } from '../src/operators.js';
import { TOKENS, loadToken, tokenAt } from '../src/tokens.js';
import { NO_ATTACK, roleOf, withRole } from '../src/summonroles.js';
import { skillBehaviors } from '../src/skills.js';
import { matchContent } from '../src/index.js';

/** @typedef {import('@aue/sim').OperatorDef} OperatorDef @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Unit} Unit */

/** An owner's elite-2 training at its top level with skill `skill` (0-based). @param {import('../src/operators.js').Training} o @param {number} skill */
const topBuild = (o, skill) => ({ elite: o.phases.length - 1, level: o.phases[o.phases.length - 1].maxLevel, potential: 1, trust: 0, skill, skillLevel: 7 });

/** A summon's record at its owner's top training (召唤-2), named for the stand-in owner of the tiny level. @param {string} owner @param {string} id @param {number} skill */
async function summonRecord(owner, id, skill) {
  const o = await loadTraining(owner);
  return /** @type {OperatorDef} */ ({ ...tokenAt(await loadToken(id), id, o, topBuild(o, skill)), summoner: 'sniper' });
}

/** The role a record has (召唤-12): its damage type, heal, none, or phys by default. @param {OperatorDef} r */
const roleName = (r) => r.dmgType ?? (r.trait?.heal ? 'heal' : r.trait?.noAttack ? 'none' : 'phys');

const ARTS = ['token_10005_mgllan_drone2', 'token_10015_dusk_drgn', 'token_10020_ling_soul2', 'token_10030_mlyss_wtrman', 'token_10036_lasher_mcbird',
  'token_10042_tecno_puppet', 'token_10043_necras_skeltn', 'token_10053_radian_tower3'];
/** The summons that make no normal attack (召唤-12): the clause's list (INF-0721), and 指挥中心 by its own 「不攻击」. */
const NONE = ['token_10006_vodfox_doll', 'token_10011_beewax_oblisk', 'token_10012_rosmon_shield', 'token_10017_skadi2_dedant', 'token_10031_swire2_gdtrap',
  'token_10039_ulpia_block', 'token_10041_cathy_catsld', 'token_10057_svash2_eagle1', 'token_10057_svash2_eagle2', 'token_10058_sbell2_icetgt', 'token_10066_closur_ourbase'];

test('[召唤-12] every summon\'s role: 法术 and 真实 from its description, 治疗 and 不攻击 too, none for the listed ones; the rest physical', async () => {
  /** @type {Record<string, string>} */
  const owners = {};
  for (const id of Object.keys(ROSTER)) for (const t of (await loadTraining(id)).tokens ?? []) if (Object.hasOwn(TOKENS, t)) owners[t] ??= id;
  /** @type {Record<string, string[]>} */
  const by = {};
  for (const id of Object.keys(TOKENS)) (by[roleName(await summonRecord(owners[id], id, -1))] ??= []).push(id);
  assert.deepEqual(by.arts.sort(), ARTS);
  assert.deepEqual([by.true, by.heal], [['token_10040_siege2_vlion'], ['token_10000_silent_healrb']]);
  assert.deepEqual(by.none.sort(), NONE, 'the listed ones, and 指挥中心 by its 「不攻击」');
  assert.deepEqual([...NO_ATTACK].sort(), NONE.filter((id) => id !== 'token_10066_closur_ourbase'));
  assert.equal(by.phys.length, 74 - 8 - 1 - 1 - 11);
  assert.ok(by.phys.includes('token_10005_mgllan_drone3') && by.phys.includes('token_10057_svash2_eagle3'), '群体物理伤害 is physical; the third 风雪之眼 attacks');
  for (const id of NO_ATTACK) assert.deepEqual(roleOf('', (await loadToken(id)).description), {}, `${id}: its description says nothing of an attack`);
});

test('[召唤-12] [召唤-7] the reading: rich text removed, 「不会受到攻击」 is no 「不攻击」; the drone heals one, its page flags kept', async () => {
  assert.deepEqual(roleOf('x', '攻击造成<@ba.kw>法术伤害</>'), { dmgType: 'arts' });
  assert.deepEqual(roleOf('x', '初始攻击造成<@ba.kw>法术伤害</>，只能部署在召唤者攻击范围内'), { dmgType: 'arts' });
  assert.deepEqual(roleOf('x', '能够阻挡一个敌人，攻击造成<@ba.kw>真实伤害</>'), { dmgType: 'true' });
  assert.deepEqual(roleOf('x', '不攻击，能够阻挡两个敌人'), { trait: { noAttack: true } });
  assert.deepEqual(roleOf('x', '能够阻挡两个敌人；不攻击'), { trait: { noAttack: true } }, 'a later clause that begins 「不攻击」');
  assert.deepEqual(roleOf('x', '恢复攻击范围内<@ba.kw>友方单位</>的生命'), { trait: { heal: true, targets: 1 } });
  for (const d of ['不会受到攻击', '阻挡的敌人不攻击自身', '受到攻击时恢复自身生命', '攻击造成<@ba.kw>群体物理伤害</>', null, undefined]) assert.deepEqual(roleOf('x', d), {}, String(d));
  const rec = /** @type {OperatorDef} */ ({ name: 'x', position: 'MELEE', cost: 0, blockCnt: 1, baseAttackTime: 1, maxHp: 1, atk: 1, def: 0, res: 0, range: [] });
  assert.equal(withRole(rec, 'x', '能够阻挡一个敌人'), rec, 'the default: the record itself');
  const branched = /** @type {OperatorDef} */ ({ ...rec, trait: { targets: 3, flags: { healFree: true } } });
  assert.deepEqual(withRole(branched, 'x', '不攻击').trait, { targets: 3, flags: { healFree: true }, noAttack: true }, 'the trait it has, kept');
  const drone = await summonRecord('char_108_silent', 'token_10000_silent_healrb', 1);
  assert.deepEqual(drone.trait, { heal: true, targets: 1, flags: { untargetable: true } });
  assert.equal(drone.dmgType, undefined);
});

test('[召唤-12] [兼容-6] a match\'s summons have their role, also those of an owner fighting with a kit', async () => {
  const build = { elite: 2, level: 90, potential: 1, trust: 100, skill: 1, skillLevel: 10 };
  const match = { level: 'act1multi_01', difficulty: /** @type {const} */ ('NORMAL'), seed: 7, decks: [[{ id: 'char_2023_ling', build }]] };
  const plain = await matchContent(match), kitted = await matchContent(match, { kits: { char_2023_ling: () => ({ skills: {} }) } });
  assert.deepEqual([plain.operators['token_10020_ling_soul2#0'].dmgType, kitted.operators['token_10020_ling_soul2#0'].dmgType], ['arts', 'arts']);
  assert.equal(plain.operators['token_10020_ling_soul1#0'].dmgType, undefined, '“清平” says nothing: physical');
});

/**
 * The tiny level with an enemy standing at (1, 3) for good (its stats over the slime's), the stand-in owner (the tiny
 * sniper) deployed at (2, 3) and the records given; `prepare` runs on the world, then `key` is summoned at `at` facing
 * right (召唤-6) and `frames` frames run. The world, the summon and every event of those frames, with its frame's index (`frame`).
 * @param {Record<string, OperatorDef>} records @param {string} key @param {{ row: number, col: number }} at
 * @param {{ frames?: number, enemy?: Record<string, number>, prepare?: (w: World, c: any) => void }} [o]
 */
function arena(records, key, at, o = {}) {
  const c = tinyContent();
  c.level.options = { ...c.level.options, initialCost: 99, maxCost: 99, characterLimit: 9 };
  c.level.routes[0].start = { row: 1, col: 3 };
  c.level.routes[0].checkpoints = [{ type: 'WAIT_FOR_SECONDS', row: 0, col: 0, time: 1000 }];
  c.level.waves = [oneWave([spawnAt(0, 'slime')])];
  c.enemies.slime = { ...c.enemies.slime, maxHp: 1e9, def: 0, res: 0, ...o.enemy };
  c.operators = { ...c.operators, ...records };
  c.behaviors = { skills: skillBehaviors };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'sniper', row: 2, col: 3, dir: DIR.RIGHT }]]);
  o.prepare?.(w, c);
  const owner = /** @type {Unit} */ (w.units.find((u) => u.key === 'sniper'));
  const unit = /** @type {Unit} */ (summons.spawnSummon(w, c, owner, key, { ...at, dir: DIR.RIGHT }));
  assert.ok(unit && w.units.some((u) => u.key === 'slime'), 'summoned, the enemy there');
  /** @type {any[]} */
  const events = [];
  for (let i = 0; i < (o.frames ?? 90); i++) for (const e of step(w, c)) events.push({ ...e, frame: i });
  return { w, unit, events };
}

test('[召唤-12] [职业-2] 医疗探机 heals the most wounded friendly unit in its range, never a 禁疗 one, never the enemy there', async () => {
  const drone = await summonRecord('char_108_silent', 'token_10000_silent_healrb', 1), base = tinyContent().operators.guard;
  const ward = { ...base, trait: { flags: { healFree: true } } };
  /** @param {World} w @param {any} c */
  const prepare = (w, c) => {
    step(w, c, [[0, { type: 'deploy', op: 'guard', row: 1, col: 1, dir: DIR.RIGHT }]]);
    step(w, c, [[0, { type: 'deploy', op: 'ward', row: 1, col: 2, dir: DIR.RIGHT }]]);
    for (const [k, share] of /** @type {[string, number][]} */ ([['guard', 0.5], ['ward', 0.3], ['sniper', 0.8]])) {
      const u = /** @type {Unit} */ (w.units.find((x) => x.key === k));
      u.hp = u.maxHp * share;
    }
  };
  const { w, unit, events } = arena({ drone, ward }, 'drone', { row: 2, col: 2 }, { frames: 60, prepare });
  const key = (/** @type {number} */ id) => w.units.find((u) => u.id === id)?.key;
  const heals = events.filter((e) => e.type === 'heal' && e.id === unit.id);
  assert.ok(heals.length >= 3, `${heals.length} heals`);
  assert.equal(new Set(heals.map((e) => e.frame)).size, heals.length, 'one friendly unit an attack (INF-0720)');
  assert.deepEqual([key(heals[0].target), heals[0].amount], ['guard', attrs.statsOf(unit).atk], 'the lowest HP share, its attack\'s worth');
  assert.ok(heals.every((e) => key(e.target) !== 'ward'), '禁疗');
  assert.deepEqual(events.filter((e) => (e.type === 'attack' || e.type === 'hit') && e.id === unit.id && key(e.target) === 'slime'), [], 'no enemy');
});

test('[召唤-12] [职业-13] 诅咒娃娃, 斯卡蒂的海嗣 and 爬行号·防护单元 make no normal attack on the enemy in their range', async () => {
  const cases = [['char_254_vodfox', 'token_10006_vodfox_doll', 1], ['char_1012_skadi2', 'token_10017_skadi2_dedant', 0], ['char_4162_cathy', 'token_10041_cathy_catsld', 0]];
  for (const [owner, id, skill] of /** @type {[string, string, number][]} */ (cases)) {
    const rec = await summonRecord(owner, id, skill);
    const quiet = arena({ s: rec }, 's', { row: 1, col: 2 }), attacking = arena({ s: { ...rec, trait: { ...rec.trait, noAttack: false } } }, 's', { row: 1, col: 2 });
    const swings = (/** @type {ReturnType<typeof arena>} */ r) => r.events.filter((e) => e.type === 'attack' && e.id === r.unit.id).length;
    assert.equal(swings(quiet), 0, id);
    assert.ok(swings(attacking) > 0, `${id}: without its role it would attack`);
  }
});

test('[召唤-12] [职业-1] “小自在” deals arts damage and 黄金盟誓 true damage: against DEF 10⁶ and RES 50, half and all of their attack', async () => {
  const enemy = { def: 1e6, res: 50 };
  const firstHit = (/** @type {ReturnType<typeof arena>} */ r) => r.events.find((e) => e.type === 'hit' && e.id === r.unit.id);
  const dusk = await summonRecord('char_2015_dusk', 'token_10015_dusk_drgn', 2), lion = await summonRecord('char_1019_siege2', 'token_10040_siege2_vlion', 2);
  const arts = arena({ s: dusk }, 's', { row: 1, col: 2 }, { enemy }), phys = arena({ s: { ...dusk, dmgType: 'phys' } }, 's', { row: 1, col: 2 }, { enemy });
  assert.equal(firstHit(arts)?.damage, attrs.statsOf(arts.unit).atk * 0.5);
  assert.equal(firstHit(phys)?.damage, attrs.statsOf(phys.unit).atk * 0.05, 'physical: the 5 % floor');
  const truly = arena({ s: lion }, 's', { row: 1, col: 3 }, { enemy });
  assert.equal(firstHit(truly)?.damage, attrs.statsOf(truly.unit).atk);
});
