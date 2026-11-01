// 深池弩炮手 / 深池弩炮队长's 爆破弹发射, and the shapes `PowerAttack` covers (docs/spec/foes.md 敌能-152). Their skill
// attack is 敌能-36's third attack, its 倍率 unchanged, made the engine's 3×3 tile splash (敌能-26, the reading of
// 迫击炮兵's shell, INF-0219): it lands on the target and the eight tiles around it at the end of the swing, with no
// projectile. The data's blackboard is empty: `square` 1 marks the two pages that were read.

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** 无胄盟's 强力击 (敌能-36). */
const SWEEP = Object.freeze(['atk_scale', 'ep_damage_ratio']);
/** 澪's 寒晖, `times` from her FOE_EXTRAS row (敌能-36). */
const TWIN = Object.freeze(['atk_scale', 'times']);

/** 爆破弹发射's blackboard (敌能-152): the page marker alone. @param {Record<string, unknown>} bb @returns {boolean} */
const blastShape = (bb) => Object.keys(bb).length === 1 && bb.square === 1;

/**
 * Whether a `PowerAttack` blackboard is one of the three shapes its behaviour runs (关卡-2; 敌能-36, 敌能-152); any
 * other name passes. Every other shape of the name, a talent's included, stays uncovered.
 * @param {string} name @param {Record<string, unknown>} bb @returns {boolean}
 */
export function powerAttackOwns(name, bb) {
  if (name !== 'PowerAttack') return true;
  return exact(bb, SWEEP) || exact(bb, TWIN) || blastShape(bb);
}

/**
 * The skill attack's tile splash (敌能-152): the 3×3, the others at the target's full amount (敌能-26), physical as the
 * skill table says, whatever the record's type.
 */
const BLAST = Object.freeze({ square: true, splashScale: 1, type: /** @type {const} */ ('phys') });

/**
 * What 爆破弹发射 adds to its skill attack's mods (敌能-152): on its shape, the 3×3 at a share of 1 — the target and each
 * unit the engine's tile splash finds around its tile take the same hit; on any other shape, nothing.
 * @param {Record<string, unknown>} bb @returns {{ square?: boolean, splashScale?: number }}
 */
export function blastOf(bb) {
  return blastShape(bb) ? BLAST : {};
}
