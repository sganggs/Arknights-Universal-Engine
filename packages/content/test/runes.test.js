// Seat runes on a match's content (docs/spec/runes.md): which units they apply to, the records they change, the seat's
// deploy limit, and runes not supported yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchContent, seatRules, withRunes, PROFESSION_BITS, carriedDef, CARRIED_PROFILES, LEVELS, OFFICIAL_SOURCE } from '../src/index.js';
import football from '../data/levels/act1multi_football.json' with { type: 'json' };

const BUILD = { elite: 2, level: 90, potential: 1, trust: 100, skill: 0, skillLevel: 10 };
/** The eight operator professions (符文-1). */
const OPERATORS = 639;
/** @param {string} key @param {[string, number | string][]} board @param {number} [professions] */
const rune = (key, board, professions = OPERATORS) => ({ key, professions, board });

/** A carried unit's card rune (符文-6) as the play styles have them. @param {string} key */
const card = (key) => rune('insert_token_card', [['token_key', key], ['level', 1], ['skill', 0], ['count', 1], ['skill_level', 1]], 384);

/** Runes of the 促融共竞 play styles (activity_table MULTIPLAY_V3/act1multi squadEffectList), without the device cards (CARDS). */
const STYLES = {
  基础: [rune('char_attribute_mul', [['atk', 1.1]])],
  驻场: [rune('char_respawntime_mul', [['scale', 1.15]]), rune('env_gbuff_new', [['key', 'attr_up_on_trigger[atk][max_hp]'], ['atk', 0.03], ['max_hp', 0.03], ['max_stack_cnt', 20], ['interval', 5]])],
  游走: [rune('char_respawntime_mul', [['scale', 0.8]]), rune('env_gbuff_new', [['key', 'modify_sp[born]'], ['sp', 10]]), rune('env_gbuff_new', [['key', 'sp_recovery_reduction'], ['sp_recovery_per_sec', 1]]),
    rune('global_deck_placeable_char_num_add', [['value', -1]])],
  攻坚: [rune('char_attribute_mul', [['attack_speed', 1.2]]), rune('char_blockcnt_add', [['value', 0]]), rune('env_gbuff_new', [['key', 'attack_prob_get[sp][char]'], ['prob', 0.1], ['sp', 1]]),
    rune('env_gbuff_new', [['key', 'damage_scale[input][char]'], ['damage_scale', 1.2]])],
  支援: [rune('char_dynamic_ability_new', [['key', 'dyn_attr_get_in_attack_range[modify_sp]'], ['sp', 1], ['interval', 1]]), rune('env_gbuff_new', [['key', 'damage_scale[out]'], ['damage_scale', 0.9]]),
    rune('env_gbuff_new', [['key', 'heal_scale[advanced][out]'], ['heal_scale', 1.4]])],
};

/** Each play style's carried unit. */
const CARDS = { 基础: 'trap_201_muulco', 驻场: 'trap_197_muulwr', 游走: 'trap_198_muulas', 攻坚: 'trap_199_muulrg', 支援: 'trap_200_muulcl' };

test('[符文-1] the profession bits; 639 is the eight operator professions, without summons and devices', () => {
  assert.deepEqual(PROFESSION_BITS, { WARRIOR: 1, SNIPER: 2, TANK: 4, MEDIC: 8, SUPPORT: 16, CASTER: 32, SPECIAL: 64, TOKEN: 128, TRAP: 256, PIONEER: 512 });
  const ops = Object.entries(PROFESSION_BITS).filter(([, b]) => (OPERATORS & b) !== 0).map(([p]) => p);
  assert.deepEqual(ops, ['WARRIOR', 'SNIPER', 'TANK', 'MEDIC', 'SUPPORT', 'CASTER', 'SPECIAL', 'PIONEER']);
});

test('[符文-1] [符文-2] [符文-3] [符文-4] [符文-5] each play style\'s runes are supported; a rune not supported is named', () => {
  for (const [name, runes] of Object.entries(STYLES)) assert.deepEqual(seatRules([...runes, card(CARDS[/** @type {keyof typeof CARDS} */ (name)])]).unsupported, [], name);
  assert.equal(seatRules(STYLES.游走).limitAdd, -1);
  assert.deepEqual(seatRules([card('trap_201_muulco')]).cards, [{ key: 'trap_201_muulco', level: 1, skill: 0, skillLevel: 1 }]);
  const two = rune('insert_token_card', [['token_key', 'trap_201_muulco'], ['level', 1], ['skill', 0], ['count', 2], ['skill_level', 1]], 384);
  assert.deepEqual(seatRules([two, rune('env_gbuff_new', [['key', 'nope']])]).unsupported, ['insert_token_card', 'env_gbuff_new:nope']);
});

test('[符文-1] [符文-2] [符文-3] a unit whose profession is in the mask takes the runes: base attributes, redeployment, block, SP at deployment, buffs', () => {
  const sniper = /** @type {any} */ ({ name: 'x', profession: 'SNIPER', atk: 100, aspd: 100, maxHp: 1000, respawnTime: 70, blockCnt: 1, skill: { init: 5 } });
  const r = seatRules([...STYLES.基础, ...STYLES.驻场, ...STYLES.游走, ...STYLES.攻坚, ...STYLES.支援]), d = /** @type {any} */ (withRunes(sniper, r.effects));
  assert.deepEqual([d.atk, d.aspd, d.respawnTime, d.blockCnt, d.skill.init], [100 * 1.1, 100 * 1.2, 70 * 1.15 * 0.8, 1, 15]);
  assert.deepEqual(d.runeMods, { spRecoveryMul: 1, dmgTakenMul: 1.2, dmgDealtMul: 0.9, healingDealtMul: 1.4 });
  assert.deepEqual(d.timedTalents, [{ kind: 'stack', seconds: 5, max: 20, mods: { atkPct: 0.03, hpPct: 0.03 } }]);
  assert.deepEqual([d.probSp, d.rangeSp], [[{ prob: 0.1, sp: 1 }], { sp: 1, interval: 1 }]);
  const token = { ...sniper, profession: 'TOKEN' };
  assert.equal(withRunes(token, r.effects), token, 'a summon is not in 639');
  assert.equal(sniper.atk, 100, 'the record given is not changed');
});

test('[符文-2] char_skill_cd_mul: the SP its skill needs × scale; a unit with no skill as it was', () => {
  const r = seatRules([rune('char_skill_cd_mul', [['scale', 0.8]], 1023)]);
  const d = /** @type {any} */ (withRunes(/** @type {any} */ ({ name: 'x', profession: 'CASTER', skill: { cost: 35, init: 10 } }), r.effects));
  assert.deepEqual([d.skill.cost, d.skill.init], [35 * 0.8, 10]);
  const none = /** @type {any} */ ({ name: 'y', profession: 'CASTER' });
  assert.deepEqual(withRunes(none, r.effects), none);
});

test('[关卡-2] [符文-1] a level\'s runes on our units are every seat\'s: IG-FT-1\'s 技力需求-20% on both seats\' operators; one not supported refused', async () => {
  const decks = [[{ id: 'char_1035_wisdel', build: BUILD }], [{ id: 'char_1035_wisdel', build: BUILD }]];
  const base = LEVELS.act1multi_01, ft = /** @type {any} */ (football).difficulties.NORMAL.ours;
  /** act1multi_01 with these runes on our units. @param {any[]} ours */
  const source = (ours) => ({ ...OFFICIAL_SOURCE, levels: { x: { ...base, difficulties: { ...base.difficulties, NORMAL: { ...base.difficulties.NORMAL, ours } } } } });
  const plain = await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks });
  const c = await matchContent({ level: 'x', difficulty: 'NORMAL', seed: 1, decks }, { source: source(ft) });
  const op = (/** @type {any} */ x, /** @type {string} */ k) => x.operators[k];
  for (const seat of [0, 1]) assert.equal(op(c, `char_1035_wisdel#${seat}`).skill.cost, op(plain, `char_1035_wisdel#${seat}`).skill.cost * 0.8);
  assert.deepEqual(op(c, 'char_1035_wisdel#0').runeMods, { spRecoveryMul: 1 });
  await assert.rejects(matchContent({ level: 'x', difficulty: 'NORMAL', seed: 1, decks }, { source: source([rune('env_gbuff_new', [['key', 'nope']], 1023)]) }),
    /level x at NORMAL: runes not supported yet: env_gbuff_new:nope/);
});

test('[符文-1] [符文-2] a match with runes: each seat\'s own operators and summons by profession, the seat\'s deploy limit; runes not supported are refused', async () => {
  const decks = [[{ id: 'char_1035_wisdel', build: BUILD }], [{ id: 'char_1035_wisdel', build: BUILD }]];
  const plain = await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks });
  const c = await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks, runes: [[...STYLES.基础, ...STYLES.游走], []] });
  const op = (/** @type {any} */ x, /** @type {string} */ k) => x.operators[k];
  assert.equal(op(c, 'char_1035_wisdel#0').atk, op(plain, 'char_1035_wisdel#0').atk * 1.1);
  assert.equal(op(c, 'char_1035_wisdel#0').skill.init, op(plain, 'char_1035_wisdel#0').skill.init + 10);
  assert.equal(op(c, 'char_1035_wisdel#1').atk, op(plain, 'char_1035_wisdel#1').atk, 'the other seat as it was');
  assert.equal(op(c, 'token_10035_wisdel_wward#0').atk, op(plain, 'token_10035_wisdel_wward#0').atk, 'her summon is a TOKEN');
  assert.deepEqual(c.level.options.characterLimitAdd, [-1, 0]);
  assert.equal(plain.level.options.characterLimitAdd, undefined);
  await assert.rejects(matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks, runes: [[rune('nope', [])], []] }), /seat 0: runes not supported yet: nope/);
});

test('[符文-6] [装置-6] each play style\'s carried unit: a free card on any tile that never attacks, its effect from its skill, no skill of its own', async () => {
  const want = {
    trap_201_muulco: { seconds: 10, allyMods: { atkPct: 0.2 } },
    trap_197_muulwr: { seconds: 20, barrier: 6000 },
    trap_198_muulas: { enemyDamage: { type: 'arts', amount: 3000 }, readyCards: true },
    trap_199_muulrg: { seconds: 10, allyMods: { defMul: 0, resMul: 0, aspd: 120 } },
    trap_200_muulcl: { spray: { shots: 20, every: 0.2, targets: 3, sp: 3 } },
  };
  assert.deepEqual(Object.keys(CARRIED_PROFILES).sort(), Object.keys(want).sort());
  for (const [id, effect] of Object.entries(want)) {
    const d = /** @type {any} */ (await carriedDef(id, { level: 1, skill: 0, skillLevel: 1 }));
    assert.deepEqual([d.position, d.profession, d.cost, d.respawnTime, d.maxHp, d.trait.free, d.trait.noAttack, d.skill], ['ALL', 'TRAP', 5, 60, 100, true, true, undefined], id);
    assert.deepEqual(d.carried, effect, id);
  }
  await assert.rejects(carriedDef('trap_257_muulct', { level: 1, skill: 0, skillLevel: 1 }), /no profile yet/);
});

test('[符文-6] a match with a carried card: the unit in the seat\'s deck once, its seat\'s operator runes not on it', async () => {
  const decks = [[{ id: 'char_1035_wisdel', build: BUILD }], []];
  const c = await matchContent({ level: 'act1multi_01', difficulty: 'NORMAL', seed: 1, decks, runes: [[...STYLES.基础, card('trap_201_muulco'), card('trap_201_muulco')], []] });
  assert.deepEqual(c.decks, [['char_1035_wisdel#0', 'trap_201_muulco#0'], []]);
  assert.equal(c.operators['trap_201_muulco#0'].atk, 0, 'atk × 1.1 is for operators');
});
