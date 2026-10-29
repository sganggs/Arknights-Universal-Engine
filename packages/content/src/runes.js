// Seat runes (docs/spec/runes.md): what a mode gives one seat — a play style's buffs and costs — as changes to that
// seat's operators and summons whose profession is in each rune's mask (符文-1): their base attributes, redeployment,
// blocking and SP on deployment (符文-2), an always-on buff and a stacking one (符文-3), SP on dealing damage (符文-4)
// and SP for the operators in their attack range (符文-5); the seat's deploy limit; and the carried units its runes put
// into its deck (符文-6).

/** Each profession's bit in a rune's mask (符文-1). */
export const PROFESSION_BITS = Object.freeze({ WARRIOR: 1, SNIPER: 2, TANK: 4, MEDIC: 8, SUPPORT: 16, CASTER: 32, SPECIAL: 64, TOKEN: 128, TRAP: 256, PIONEER: 512 });

/** char_attribute_mul's keys: the def field and its value when the def has none (符文-2, as 关卡-2's enemy multipliers). */
const MUL_FIELDS = Object.freeze({
  atk: ['atk', 0], def: ['def', 0], max_hp: ['maxHp', 0], magic_resistance: ['res', 0], attack_speed: ['aspd', 100], move_speed: ['moveSpeed', 1], mass_level: ['massLevel', 0],
});
/** env_gbuff_new's always-on keys: the board value and the modifier it gives (符文-3). */
const BUFF_KEYS = Object.freeze({
  'damage_scale[out]': ['damage_scale', 'dmgDealtMul'], 'damage_scale[input][char]': ['damage_scale', 'dmgTakenMul'],
  'heal_scale[advanced][out]': ['heal_scale', 'healingDealtMul'], sp_recovery_reduction: ['sp_recovery_per_sec', 'spRecoveryMul'],
});

/** A seat rune as the match settings carry it (同步-9, @aue/schema's SeatRune). @typedef {{ key: string, professions: number, board: [string, number | string][] }} SeatRune */
/** @typedef {import('@aue/sim').OperatorDef} OperatorDef */
/**
 * What one rune does to a unit it applies to.
 * @typedef {{ mask: number, mul?: Record<string, number>, respawn?: number, blockAdd?: number, bornSp?: number, skillCost?: number, mods?: Record<string, number>,
 *   stack?: import('@aue/sim').TimedTalent, probSp?: { prob: number, sp: number }, rangeSp?: { sp: number, interval: number } }} RuneEffect
 */

/** @param {SeatRune} r */
const boardOf = (r) => Object.fromEntries(r.board);
/** @param {Record<string, number | string>} bb @param {string} k */
const num = (bb, k) => { const v = bb[k]; if (typeof v !== 'number') throw new RangeError(`a rune needs a number ${k}`); return v; };

/** env_gbuff_new / char_dynamic_ability_new by their `key` (符文-2…5), or null for a key not supported. @param {number} mask @param {Record<string, number | string>} bb @returns {RuneEffect | null} */
function keyedEffect(mask, bb) {
  const key = String(bb.key);
  if (Object.hasOwn(BUFF_KEYS, key)) {
    const [field, mod] = BUFF_KEYS[/** @type {keyof typeof BUFF_KEYS} */ (key)];
    return { mask, mods: { [mod]: num(bb, field) } };
  }
  if (key === 'modify_sp[born]') return { mask, bornSp: num(bb, 'sp') };
  if (key === 'attr_up_on_trigger[atk][max_hp]') return { mask, stack: { kind: 'stack', seconds: num(bb, 'interval'), max: num(bb, 'max_stack_cnt'), mods: { atkPct: num(bb, 'atk'), hpPct: num(bb, 'max_hp') } } };
  if (key === 'attack_prob_get[sp][char]') return { mask, probSp: { prob: num(bb, 'prob'), sp: num(bb, 'sp') } };
  if (key === 'dyn_attr_get_in_attack_range[modify_sp]') return { mask, rangeSp: { sp: num(bb, 'sp'), interval: num(bb, 'interval') } };
  return null;
}

/** A carried unit's card (符文-6): its unit, level, skill and skill level. @typedef {{ key: string, level: number, skill: number, skillLevel: number }} CarriedCard */

/** insert_token_card's card, or null for one not supported (a count other than 1). @param {SeatRune} r @returns {CarriedCard | null} */
function cardOf(r) {
  const bb = boardOf(r);
  if (typeof bb.token_key !== 'string' || (bb.count ?? 1) !== 1) return null;
  return { key: bb.token_key, level: num(bb, 'level'), skill: num(bb, 'skill'), skillLevel: num(bb, 'skill_level') };
}

/** One rune's effect (符文-2…5), or null for a key not supported. @param {SeatRune} r @returns {RuneEffect | null} */
function effectOf(r) {
  const bb = boardOf(r), mask = r.professions;
  if (r.key === 'char_attribute_mul') return { mask, mul: Object.fromEntries(Object.keys(MUL_FIELDS).filter((k) => k in bb).map((k) => [k, num(bb, k)])) };
  if (r.key === 'char_respawntime_mul') return { mask, respawn: num(bb, 'scale') };
  if (r.key === 'char_blockcnt_add') return { mask, blockAdd: num(bb, 'value') };
  if (r.key === 'char_skill_cd_mul') return { mask, skillCost: num(bb, 'scale') };
  if (r.key === 'env_gbuff_new' || r.key === 'char_dynamic_ability_new') return keyedEffect(mask, bb);
  return null;
}

/**
 * A seat's runes (符文-1): each one's effect, the change to the seat's deploy limit, the carried units' cards (符文-6),
 * and the runes not supported.
 * @param {readonly SeatRune[]} runes @returns {{ effects: RuneEffect[], limitAdd: number, cards: CarriedCard[], unsupported: string[] }}
 */
export function seatRules(runes) {
  /** @type {RuneEffect[]} */
  const effects = [];
  let limitAdd = 0;
  /** @type {CarriedCard[]} */
  const cards = [];
  /** @type {string[]} */
  const unsupported = [];
  for (const r of runes) {
    if (r.key === 'global_deck_placeable_char_num_add') { limitAdd += num(boardOf(r), 'value'); continue; }
    if (r.key === 'insert_token_card') { const card = cardOf(r); if (card) cards.push(card); else unsupported.push(r.key); continue; }
    const e = effectOf(r);
    if (e) effects.push(e);
    else unsupported.push(r.key === 'env_gbuff_new' || r.key === 'char_dynamic_ability_new' ? `${r.key}:${String(boardOf(r).key)}` : r.key);
  }
  return { effects, limitAdd, cards, unsupported };
}

/** Modifiers of two runes together: products for the `Mul` keys, sums for the others (属性-2). @param {Record<string, number>} a @param {Record<string, number>} b */
function joinMods(a, b) {
  /** @type {Record<string, number>} */
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k.endsWith('Mul') ? (out[k] ?? 1) * v : (out[k] ?? 0) + v;
  return out;
}

/** An effect's changes to a def's skill (符文-2): SP at deployment, the SP it needs. @param {Record<string, any>} skill @param {RuneEffect} e */
const skillChanges = (skill, e) => ({ ...skill, ...(e.bornSp !== undefined ? { init: skill.init + e.bornSp } : {}), ...(e.skillCost !== undefined ? { cost: skill.cost * e.skillCost } : {}) });

/** An effect's changes to a def's record (符文-2): base attributes, redeployment, block, its skill. @param {Record<string, any>} d @param {RuneEffect} e */
function recordChanges(d, e) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [k, v] of Object.entries(e.mul ?? {})) {
    const [f, dflt] = /** @type {[string, number]} */ (MUL_FIELDS[/** @type {keyof typeof MUL_FIELDS} */ (k)]);
    out[f] = (d[f] ?? dflt) * v;
  }
  if (e.respawn !== undefined) out.respawnTime = (d.respawnTime ?? 0) * e.respawn;
  if (e.blockAdd !== undefined) out.blockCnt = Math.max(0, (d.blockCnt ?? 0) + e.blockAdd);
  return (e.bornSp !== undefined || e.skillCost !== undefined) && d.skill ? { ...out, skill: skillChanges(d.skill, e) } : out;
}

/** An effect's battle parts (符文-3…5): the rune buff's modifiers, a stacking talent, SP on damage or in range. @param {Record<string, any>} d @param {RuneEffect} e */
function battleChanges(d, e) {
  return {
    ...(e.mods ? { runeMods: joinMods(d.runeMods ?? {}, e.mods) } : {}),
    ...(e.stack ? { timedTalents: [...(d.timedTalents ?? []), e.stack] } : {}),
    ...(e.probSp ? { probSp: [...(d.probSp ?? []), e.probSp] } : {}),
    ...(e.rangeSp ? { rangeSp: e.rangeSp } : {}),
  };
}

/**
 * A unit def with every effect whose mask has its profession (符文-1). @param {OperatorDef} def @param {readonly RuneEffect[]} effects
 * @returns {OperatorDef}
 */
export function withRunes(def, effects) {
  const bit = PROFESSION_BITS[/** @type {keyof typeof PROFESSION_BITS} */ (def.profession ?? '')] ?? 0;
  const mine = effects.filter((e) => (e.mask & bit) !== 0);
  if (mine.length === 0) return def;
  /** @type {Record<string, any>} */
  let d = def;
  for (const e of mine) d = { ...d, ...recordChanges(d, e), ...battleChanges(d, e) };
  return /** @type {OperatorDef} */ (d);
}
