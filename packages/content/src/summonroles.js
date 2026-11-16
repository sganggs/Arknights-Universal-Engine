// A summon's attack role (docs/spec/summons.md 召唤-12). A summon has no branch of its own — its data's `notchar1` is
// a placeholder (PRTS 作战机制: 召唤物「通常没有分支」) that no branch trait covers (职业-7) —, so its normal attack is
// its position's default, physical and at enemies (职业-1), unless its description says otherwise: arts or true damage,
// heals instead (职业-2) or no attack (职业-13). The summons whose texts only say what they do instead attack neither.
import { plainText } from './summontext.js';

/** @typedef {import('@aue/sim').OperatorDef} OperatorDef */
/**
 * What a summon's description makes of its normal attack (召唤-12): its damage type, or its trait's heal or no attack.
 * @typedef {{ dmgType?: 'arts' | 'true', trait?: Partial<import('@aue/sim').TraitDef> }} Role
 */

/**
 * What a description says of the normal attack (召唤-12), the first that holds: 「攻击造成法术伤害」 (流形's 「初始攻击造成
 * 法术伤害」 too: the type before its copy), 「攻击造成真实伤害」, 「恢复…友方单位的生命」 — one target an attack, as a 医师
 * (INF-0720) —, and a clause that begins 「不攻击」 (not 「不会受到攻击」, which is 召唤-7's).
 * @type {readonly { says: RegExp, role: Role }[]}
 */
const SAYS = Object.freeze([
  { says: /攻击造成法术伤害/, role: Object.freeze({ dmgType: 'arts' }) },
  { says: /攻击造成真实伤害/, role: Object.freeze({ dmgType: 'true' }) },
  { says: /恢复[^，。；]*友方单位的生命/, role: Object.freeze({ trait: Object.freeze({ heal: true, targets: 1 }) }) },
  { says: /(?:^|[，。；])不攻击/, role: Object.freeze({ trait: Object.freeze({ noAttack: true }) }) },
].map((row) => Object.freeze(row)));

/**
 * The summons whose description says nothing of an attack while their own and their owner's texts say only what they
 * do instead (召唤-12, INF-0721): 诅咒娃娃 lowers the enemies around it; 沙之碑 and 迷迭香的战术装备 block and act as they
 * appear; 斯卡蒂的海嗣's range is its owner's, a 吟游者 that 「不攻击」; 香槟炸弹 hits the first enemy that touches it;
 * 从不混淆的方向 is where 乌尔比安 returns; 风雪之眼 of 凛御银灰's first two skills marks a place in the deck (the one of
 * her third skill 「与凛御银灰同时进行范围直线攻击」, so it is not here); 保护目标（冻结状态） is ice that blocks;
 * 爬行号·防护单元 gives a barrier. What each of them does instead is its own mechanic, not this file's.
 * @type {readonly string[]}
 */
export const NO_ATTACK = Object.freeze([
  'token_10006_vodfox_doll', 'token_10011_beewax_oblisk', 'token_10012_rosmon_shield', 'token_10017_skadi2_dedant', 'token_10031_swire2_gdtrap',
  'token_10039_ulpia_block', 'token_10057_svash2_eagle1', 'token_10057_svash2_eagle2', 'token_10058_sbell2_icetgt', 'token_10041_cathy_catsld',
]);

/** No normal attack (召唤-12, 职业-13). @type {Role} */
const NONE = Object.freeze({ trait: Object.freeze({ noAttack: true }) });

/**
 * A summon's role (召唤-12): none for those of NO_ATTACK, else what its description says (SAYS); {} when it says nothing
 * — physical damage, at enemies.
 * @param {string} id @param {string | null | undefined} description its character_table description @returns {Role}
 */
export function roleOf(id, description) {
  if (NO_ATTACK.includes(id)) return NONE;
  const text = plainText(description);
  return SAYS.find((row) => row.says.test(text))?.role ?? {};
}

/**
 * A summon's record with its role (召唤-12): its damage type, and its trait's heal or no attack over the trait it has;
 * the record itself when the role is the default.
 * @param {OperatorDef} rec @param {string} id @param {string | null | undefined} description @returns {OperatorDef}
 */
export function withRole(rec, id, description) {
  const r = roleOf(id, description);
  if (!r.dmgType && !r.trait) return rec;
  return { ...rec, ...(r.dmgType ? { dmgType: r.dmgType } : {}), ...(r.trait ? { trait: { ...rec.trait, ...r.trait } } : {}) };
}
