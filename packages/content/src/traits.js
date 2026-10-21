// Branch traits of the official content (docs/spec/traits.md 职业-7): each covered profession branch as the engine's
// trait data and damage type — data first; a branch that needs more than the data is not covered yet and takes the
// defaults of its position (M4).

import rangeTable from '../data/ranges.json' with { type: 'json' };

/** @typedef {import('@aue/sim').TraitDef} TraitDef @typedef {import('@aue/sim').OperatorDef} OperatorDef */

/**
 * A covered branch: its normal attack's damage type, and its trait as data, made from the trait's blackboard and its
 * module's hidden talents' (干员-7).
 * @typedef {{ dmgType?: 'phys' | 'arts', trait?: (bb: Readonly<Record<string, number>>, hidden?: Readonly<Record<string, number>>, type?: string, text?: string) => Partial<TraitDef> }} Branch
 */

const ARTS = /** @type {const} */ ('arts');
/** Normal attacks heal; at most n targets. @param {number} n @returns {Branch} */
const healer = (n) => ({ trait: () => ({ heal: true, targets: n }) });
/** A range of range_table by id (干员-8). @param {string} id @returns {{ row: number, col: number }[]} */
const cellsOf = (id) => /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)[id];
/**
 * The seconds of a 傀儡师's switch between its own form and its 替身 (职业-15): every one of the switch clips of the 7
 * 傀儡师's battle skeletons (Start_B, Start_2, Doll_SwitchIn, Doll_SwitchOut, SwitchOut …) lasts 1 s.
 */
const DOLL_SWITCH = 1;
/**
 * The trait's 倍率 against a target as `when` says (职业-17), when its module gives one: × `scale` on the hit's attack
 * 倍率 (`atk`), its 伤害倍率 (`dmg`) or a heal (`heal`).
 * @param {import('@aue/sim').VsScale['when']} when @param {'atk' | 'dmg' | 'heal' | 'ep'} kind @param {number | undefined} scale
 * @param {Partial<import('@aue/sim').VsScale>} [more] @returns {{ vs?: import('@aue/sim').VsScale[] }}
 */
const vsWhen = (when, kind, scale, more = {}) => (scale ? { vs: [{ when, [kind]: scale, ...more }] } : {});
/**
 * The 伤害倍率 by the distance to the target its module gives (职业-17): min_dist to max_dist, up to + damage_scale.
 * @param {Readonly<Record<string, number>>} bb @returns {Partial<TraitDef>}
 */
const farOf = (bb) => (bb.max_dist !== undefined && bb.damage_scale ? { far: { min: bb.min_dist ?? 0, max: bb.max_dist, dmg: bb.damage_scale } } : {});
/**
 * The trait's modifiers while a condition on the operator holds (职业-18), when its module gives some: the modifiers
 * its module's values make (those it gives), `value` for the condition.
 * @param {import('@aue/sim').WhileMods['when']} when @param {Record<string, number | undefined>} mods @param {number} [value]
 * @returns {{ whiles?: import('@aue/sim').WhileMods[] }}
 */
function whileOf(when, mods, value) {
  const given = /** @type {Record<string, number>} */ (Object.fromEntries(Object.entries(mods).filter(([, v]) => v !== undefined && v !== 0)));
  return Object.keys(given).length ? { whiles: [{ when, ...(value !== undefined ? { value } : {}), mods: given }] } : {};
}
/**
 * Several conditions' modifiers in one trait (职业-18): those given, in order. @param {...{ whiles?: import('@aue/sim').WhileMods[] }} parts
 * @returns {{ whiles?: import('@aue/sim').WhileMods[] }}
 */
function joinWhiles(...parts) {
  const all = parts.flatMap((p) => p.whiles ?? []);
  return all.length ? { whiles: all } : {};
}
/** The share of damage taken that a reduction (庇护) of `r` leaves (职业-18). @param {number | undefined} r */
const taken = (r) => (r ? 1 - r : undefined);
/**
 * 术战者 AFT-Y's auras (职业-20): the enemies it blocks take × `scale` arts damage (法术脆弱); 维娜·维多利亚's (its text names
 * its summons) × `scale` all damage (脆弱), on the enemies its summons block too.
 * @param {number} scale @param {boolean} summons @returns {import('@aue/sim').ModuleAura[]}
 */
const blockedFragile = (scale, summons) => (summons
  ? [{ to: 'blocked', mods: { dmgTakenMul: scale } }, { to: 'summonBlocked', mods: { dmgTakenMul: scale } }] : [{ to: 'blocked', mods: { artsTakenMul: scale } }]);
/**
 * A blackboard key that ends so — the operator's own name before it (阵法术师 PLX-X: `lin_e_002[buff].def`) —, or ''.
 * @param {Readonly<Record<string, number>>} bb @param {string} end
 */
const keyEnding = (bb, end) => Object.keys(bb).find((k) => k.endsWith(end)) ?? '';

/** The covered branches, by subProfessionId (职业-7). A branch not here uses its position's defaults. */
export const BRANCHES = Object.freeze(/** @type {Record<string, Branch>} */ ({
  // 先锋
  // SOL-X: attack and defence + atk, def while it blocks (职业-18); SOL-Y: its first deployment costs runtime_cost (−4) more
  // (the module's own data; 职业-21)
  pioneer: { trait: (bb, own, type) => ({ ...whileOf('blocking', { atkPct: bb.atk, defPct: bb.def }), ...(type === 'SOL-Y' && own?.runtime_cost ? { firstCost: own.runtime_cost } : {}) }) },
  // AGE-X: 嘲讽等级 + taunt_level (职业-18); AGE-Y: its first retreat's 再部署时间 × (1 + respawn_time) (职业-21)
  agent: { trait: (bb) => ({ antiAir: true, blockedFirst: false, ...whileOf('always', { taunt: bb.taunt_level }), ...(bb.respawn_time ? { firstRetreatRespawn: 1 + bb.respawn_time } : {}) }) },
  // BEA-X: while its skill runs, the operator in front of it blocks block_cnt more; BEA-Y: 迷彩 while its skill runs (职业-21)
  bearer: { trait: (bb, _own, type) => ({
    ...(bb.block_cnt ? { auras: [{ to: 'frontAlly', skill: true, mods: { blockCnt: bb.block_cnt } }] } : {}),
    ...(type === 'BEA-Y' ? { whiles: [{ when: 'inSkill', mods: {}, flags: { camou: true } }] } : {}),
  }) },
  // CHG-Y: × atk_scale against an enemy below hp_ratio of its HP (the module's own data; 职业-17)
  // CHG-X: its refund not capped at its initial cost (the module's own data withdraw_cost_recover_ratio; 职业-21)
  charger: { trait: (bb, own) => ({
    killCost: bb.cost ?? 1, refund: 1, ...(own?.hp_ratio ? vsWhen('hpBelow', 'atk', own.atk_scale, { value: own.hp_ratio }) : {}),
    ...(own?.withdraw_cost_recover_ratio ? { refund: own.withdraw_cost_recover_ratio, refundUncapped: true } : {}),
  }) },
  // its 战术点 is a summon (召唤-11); × atk_scale against the enemies its own summons block (职业-14)
  // TAC-Y: the enemies its summons block 嘲讽等级 +1 (职业-20); TAC-X: its summons take damage_scale of the damage from the
  // units they block (the module's own data where it has one, else the 85 % of its text; 职业-21)
  tactician: { trait: (bb, own, type) => ({
    summonBlockedScale: bb.atk_scale ?? 1.5, ...(type === 'TAC-Y' ? { auras: [{ to: 'summonBlocked', mods: { taunt: 1 } }] } : {}),
    ...(type === 'TAC-X' ? { auras: [{ to: 'summons', mods: { blockedTakenMul: own?.damage_scale ?? 0.85 } }] } : {}),
  }) },
  // the support of the operators in the deck is its skills' and talents' (职业-7)
  counsellor: {},
  // 近卫
  // DRE-X: × atk_scale against a blocked enemy (职业-17); DRE-Y: brought to 0 HP, it stays once with its HP whole, its maximum ×
  // (1 − value) and attack speed + attack_speed (职业-22)
  fearless: { trait: (bb) => ({
    ...vsWhen('blocked', 'atk', bb.atk_scale), ...(bb.value && bb.hp_ratio ? { secondLife: { hp: bb.hp_ratio, mods: { hpMul: 1 - bb.value, aspd: bb.attack_speed ?? 0 } } } : {}),
  }) },
  // FGT-X: physical dodge prob; FGT-Y: attack speed + attack_speed while its HP is above hp_ratio (0.5) (职业-18)
  fighter: { trait: (bb) => joinWhiles(whileOf('always', { dodgePhys: bb.prob }), whileOf('hpAbove', { aspd: bb.attack_speed }, bb.hp_ratio ?? 0.5)) },
  // AFT-X: attack speed + attack_speed while it blocks none (职业-18)
  // AFT-D: elemental damage of ep_damage_ratio of its attack on a target in a 灼燃 burst; AFT-Y: the enemies it blocks 法术脆弱
  // damage_scale (职业-20)
  artsfghter: { dmgType: ARTS, trait: (bb, _own, type, text = '') => ({
    ...whileOf('notBlocking', { aspd: bb.attack_speed }), ...(type === 'AFT-D' && bb.ep_damage_ratio ? { burstHit: { el: 'FIRE', scale: bb.ep_damage_ratio } } : {}),
    ...(type === 'AFT-Y' && bb.damage_scale ? { auras: blockedFragile(bb.damage_scale, text.includes('召唤物')) } : {}),
  }) },
  // SWO-X: its skill's damage × damage_scale (职业-17); SWO-Y: def_penetrate_fixed of the target's defence ignored (职业-18)
  sword: { trait: (bb) => ({ hits: 2, ...vsWhen('skill', 'dmg', bb.damage_scale), ...whileOf('always', { defIgnoreFlat: bb.def_penetrate_fixed }) }) },
  // the attack's 倍率 against an enemy it does not block (职业-8)
  // INS-Y: also on ranged tiles (the module's own data buildable_type 2; 职业-19)
  instructor: { trait: (bb, own) => ({ unblockedScale: bb.atk_scale ?? 1.2, ...(own?.buildable_type === 2 ? { rangedTiles: true } : {}) }) },
  // LOR-Y: attack speed + attack_speed while cnt (2) enemies are in its range (the trait's, or the module's own data; 职业-18)
  // LOR-X: arts damage of atk_scale_m of its attack on each hit; LOR-D: 神经损伤 of ep_damage_ratio of its damage (职业-20)
  lord: { trait: (bb, own, type) => ({
    antiAir: true, unblockedScale: bb.atk_scale ?? 0.8, ...whileOf('enemies', { aspd: bb.attack_speed ?? own?.attack_speed }, own?.cnt ?? 2),
    ...(type === 'LOR-X' ? { extraArts: bb.atk_scale_m ?? own?.magic_atk_scale ?? 0.1 } : {}),
    ...(type === 'LOR-D' ? { epRider: { el: 'SANITY', ratio: bb.ep_damage_ratio ?? own?.ep_damage_ratio ?? 0.1, arts: false } } : {}),
  }) },
  // the other enemies around the target take the share of the hit (职业-8)
  // HAM-X: × atk_scale_e for an attack whose splash reaches cnt enemies (职业-17)
  hammer: { trait: (bb) => ({
    splash: { radius: bb['attack@ability_range_radius'] ?? 1, scale: bb['attack@atk_scale_2'] ?? 0.5, ground: false },
    ...(bb.atk_scale_e && bb.cnt ? { packed: { cnt: bb.cnt, atk: bb.atk_scale_e } } : {}),
  }) },
  // CEN-X: × atk_scale against a blocked enemy (职业-17); CEN-Y: physical damage taken − damage_resistance while its HP is
  // above hp_ratio (职业-18)
  centurion: { trait: (bb) => ({
    targets: 'blockCnt', ...vsWhen('blocked', 'atk', bb.atk_scale), ...whileOf('hpAbove', { physTakenMul: taken(bb.damage_resistance) }, bb.hp_ratio ?? 0.5),
  }) },
  // no ally heals them; they heal themselves for the enemies their attacks reach (职业-9)
  // SBL-X: 庇护 damage_resistance while its HP is below hp_ratio (the module's own data; 职业-18)
  musha: { trait: (bb, own, type) => ({
    flags: { noAllyHeal: true }, selfHeal: bb.value ?? 0, selfHealOn: 'damage',
    ...(own?.hp_ratio ? whileOf('hpBelow', { physTakenMul: taken(own.damage_resistance), artsTakenMul: taken(own.damage_resistance) }, own.hp_ratio) : {}),
    // SBL-Y: brought to 0 HP, it stays once with hp_ratio of its HP (职业-22)
    ...(type === 'SBL-Y' && bb.hp_ratio ? { secondLife: { hp: bb.hp_ratio, mods: {} } } : {}),
  }) },
  // REA-Y: attack speed + attack_speed while cnt (2) enemies are in its range (the trait's, or the module's own data; 职业-18)
  reaper: { trait: (bb, own) => ({
    flags: { noAllyHeal: true }, filter: 'ALL', targets: 'all', selfHeal: bb.value ?? 0, selfHealMax: 'blockCnt',
    ...whileOf('enemies', { aspd: bb.attack_speed ?? own?.attack_speed }, bb.cnt ?? own?.['trigger_cnt[equip]'] ?? 2),
  }) },
  // CRU-Y: 伤害倍率 × damage_scale against a blocked enemy (职业-17); CRU-X: heals it takes × heal_scale (职业-18)
  crusher: { trait: (bb) => ({ targets: 'blockCnt', ...vsWhen('blocked', 'dmg', bb.damage_scale), ...whileOf('always', { healingTakenMul: bb.heal_scale }) }) },
  primguard: {},
  // the 应变 that spends cost is its skills' (职业-7, 技能-10); MCN-X: attack + atk for each cost a skill of its pays, at most
  // max_stack_cnt, while the skill runs (the module's own data; 职业-20)
  mercenary: { trait: (bb, own, type) => (type === 'MCN-X' && own?.atk ? { spendAtk: { atk: own.atk, max: own.max_stack_cnt ?? 10 } } : {}) },
  // attacks only while its skill runs; 阻挡数 × 0 while it does not, and an attack bonus building up to atk over max_stack_cnt s (职业-12)
  librator: { trait: (bb, hidden) => ({ attackInSkill: true, idleMods: { blockCntMul: 0 }, charge: { atk: bb.atk ?? 2, steps: bb.max_stack_cnt ?? 40, init: hidden?.init_atk ?? 0 } }) },
  // 重装
  // PRO-X: defence + def while it blocks (职业-18)
  protector: { trait: (bb) => whileOf('blocking', { defPct: bb.def }) },
  // GUA-X: its heals × heal_scale on one below hp_ratio of its HP (职业-17); GUA-Y: damage taken − damage_resistance (职业-18)
  guardian: { trait: (bb) => ({ ...(bb.hp_ratio ? vsWhen('hpBelow', 'heal', bb.heal_scale, { value: bb.hp_ratio }) : {}), ...whileOf('always', { dmgTakenMul: taken(bb.damage_resistance) }) }) },
  // PRP-X: 元素损伤 it deals × ep_damage_scale while it blocks (职业-18)
  primprotector: { trait: (bb) => whileOf('blocking', { epDealtMul: bb.ep_damage_scale }) },
  // SPT-Y: 攻击距离 + ability_range_forward_extend (职业-19)
  // SPT-X: the enemies in its range lose 隐匿 (职业-20)
  shotprotector: { trait: (bb, _own, type) => ({
    antiAir: true, ...whileOf('always', { rangeExtend: bb.ability_range_forward_extend }), ...(type === 'SPT-X' ? { auras: [{ to: 'range', flags: { 'immune:stealth': true } }] } : {}),
  }) },
  // UNY-X: damage from a unit it blocks × damage_scale; UNY-Y: attack and defence + atk, def while no other operator stands on
  // the 8 tiles around (职业-18)
  unyield: { trait: (bb) => ({
    flags: { noAllyHeal: true }, ...joinWhiles(whileOf('always', { blockedTakenMul: bb.damage_scale }), whileOf('alone8', { atkPct: bb.atk, defPct: bb.def })),
  }) },
  // 阻回 always, but not while it blocks (职业-10); HES-X, HES-Y: no 阻回, but SP recovery × (1 + sp_recover_ratio) while it blocks
  // none; HES-Y: attack and defence + atk, def while it blocks (职业-18)
  duelist: { trait: (bb) => ({
    ...(bb.sp_recover_ratio === undefined ? { flags: { noSp: true }, immuneBlocking: ['noSp'] } : {}),
    ...joinWhiles(whileOf('notBlocking', { spRecoveryMul: bb.sp_recover_ratio === undefined ? undefined : 1 + bb.sp_recover_ratio }), whileOf('blocking', { atkPct: bb.atk, defPct: bb.def })),
  }) },
  // AST-X: arts damage of atk_scale of its attack on each hit of its attack, and on each attacker (职业-20)
  artsprotector: { trait: (bb) => ({ skillArts: true, ...(bb.atk_scale ? { extraArts: bb.atk_scale, counterArts: bb.atk_scale } : {}) }) },
  // 狙击
  // MAR-X: × atk_scale against a flying enemy (职业-17)
  fastshot: { trait: (bb, own) => ({
    secondary: 'FLY_FIRST', ...vsWhen('flying', 'atk', bb.atk_scale),
    // MAR-Y: attack speed + attack_speed while a ground enemy is in its range (the trait's, or the module's own data; 职业-18)
    ...whileOf('groundEnemies', { aspd: bb.cnt ? bb.attack_speed : own?.attack_speed }, bb.cnt ?? 1),
  }) },
  // ARC-Y: × atk_scale against an enemy straight in front, its physical dodge ignored (the trait's, or the module's own data; 职业-17)
  closerange: { trait: (bb, own) => vsWhen('front', 'atk', bb.atk_scale ?? own?.atk_scale, { noDodge: true }) },
  // DEA-X: 伤害倍率 by the distance (职业-17)
  // DEA-Y: SP + sp for a hit on a target it does not bring down (职业-20)
  longrange: { trait: (bb, _own, type) => ({ filter: 'DEF_ASC', ...farOf(bb), ...(type === 'DEA-Y' && bb.sp ? { spOn: { on: 'survives', sp: bb.sp } } : {}) }) },
  // SIE-X: × atk_scale against an enemy of 重量等级 value or more (the module's own data); SIE-Y: 伤害倍率 by the distance (职业-17)
  siegesniper: { trait: (bb, own) => ({ filter: 'MASS_DES', ...(own?.value ? vsWhen('heavy', 'atk', own.atk_scale, { value: own.value }) : {}), ...farOf(bb) }) },
  // ART-X: × atk_scale against a blocked enemy (职业-17); ART-Y: def_penetrate_fixed of the target's defence ignored (职业-18)
  aoesniper: { trait: (bb) => ({ splash: { radius: 1, scale: 1, ground: false }, ...vsWhen('blocked', 'atk', bb.atk_scale), ...whileOf('always', { defIgnoreFlat: bb.def_penetrate_fixed }) }) },
  // BOM-X: two aftershocks (attack@times 3, or attack@enable_third_attack; 职业-22)
  bombarder: { trait: (bb) => ({
    antiAir: false, splash: { radius: 0.9, scale: 1, ground: true }, aftershock: bb['attack@append_atk_scale'] ?? 0.5,
    ...((bb['attack@times'] ?? 2) > 2 || bb['attack@enable_third_attack'] ? { aftershocks: Math.max(2, (bb['attack@times'] ?? 3) - 1) } : {}),
  }) },
  // melee on what it blocks or what stands on its tile, ranged with a 1.0 splash on the others in its range (职业-12)
  // FOR-X: × atk_scale against a blocked enemy (职业-17)
  // FOR-Y: attack speed + attack_speed while it blocks none (the module's own data; 职业-18)
  fortress: { trait: (bb, own) => ({ fortress: 1, ...vsWhen('blocked', 'atk', bb.atk_scale), ...whileOf('notBlocking', { aspd: own?.attack_speed }) }) },
  // air too; blocks 2 flying enemies once it took off (职业-12)
  skywalker: { trait: () => ({ antiAir: true, liftoffBlock: 2 }) },
  // air too, the blocked first; up in the air (起飞) while its skill does not run, attacking only flying enemies and those it
  // blocks; its skill's attacks splash 1.1 (职业-12)
  // BRK-X: while its skill runs, × atk_scale against a ground enemy (the module's own data; 职业-17)
  skybreaker: { trait: (_bb, own) => ({
    antiAir: true, blockedFirst: true, idleFlags: { liftoff: true }, idleAirOnly: true, skillSplash: { radius: 1.1, scale: 1, ground: false }, ...vsWhen('skillGround', 'atk', own?.atk_scale),
  }) },
  // its attacks throw boomerangs, out at 15 and back at 3.75 tiles a second; it attacks again once it caught them all (职业-12)
  // LPS-X: × atk_scale against an enemy on the 8 tiles around (the module's own data; 职业-17)
  // LPS-Y: SP + sp for every come_back_cnt boomerangs caught (职业-20)
  loopshooter: { trait: (bb, own) => ({
    boomerang: { out: 15, back: 3.75 }, ...vsWhen('near', 'atk', own?.atk_scale), ...(bb.come_back_cnt ? { spOn: { on: 'catch', sp: bb.sp ?? 1, every: bb.come_back_cnt } } : {}),
  }) },
  // value bullets at atk_scale, reloaded one at a time (职业-12)
  // HUN-X: an empty reload loads extra_add more (职业-22)
  hunter: { trait: (bb) => ({ bullets: { max: bb.value ?? 8, scale: bb.atk_scale ?? 1.2, ...(bb.extra_add ? { extra: bb.extra_add } : {}) } }) },
  // every enemy in range; 倍率 × atk_scale for those in its own and the three tiles before it (range 1-3, 职业-11)
  reaperrange: { trait: (bb) => ({ filter: 'ALL', targets: 'all', zone: { cells: cellsOf('1-3'), scale: bb.atk_scale ?? 1.5, outside: false } }) },
  // 术师
  // CCR-X: magic_resist_penetrate_fixed of the target's 法术抗性 ignored (职业-18)
  // CCR-Y: SP + sp for a normal attack's hit on an elite or leader; CCR-D: 凋亡损伤 of ep_damage_ratio of its arts damage (the
  // module's own data; 职业-20)
  corecaster: { dmgType: ARTS, trait: (bb, own, type) => ({
    ...whileOf('always', { resIgnoreFlat: bb.magic_resist_penetrate_fixed }), ...(type === 'CCR-Y' ? { spOn: { on: 'elite', sp: bb.sp ?? own?.sp ?? 1 } } : {}),
    ...(type === 'CCR-D' && own?.ep_damage_ratio ? { epRider: { el: 'DARK', ratio: own.ep_damage_ratio, arts: true } } : {}),
  }) },
  // BLA-X: 伤害倍率 by the distance (职业-17)
  // BLA-D: 灼燃损伤 of ep_damage_ratio of its arts damage (职业-20)
  blastcaster: { dmgType: ARTS, trait: (bb, _own, type) => ({
    filter: 'ALL', targets: 'all', ...farOf(bb), ...(type === 'BLA-D' && bb.ep_damage_ratio ? { epRider: { el: 'FIRE', ratio: bb.ep_damage_ratio, arts: true } } : {}),
  }) },
  // attacks only while its skill runs, every enemy in range, air ones too; DEF × (1 + def) and RES + magic_resistance while it does not (职业-12);
  // PLX-Y: 伤害倍率 + damage_scale for each enemy in its range, at most max_valid_stack_cnt (the module's own data; 职业-17)
  phalanx: { dmgType: ARTS, trait: (bb, own) => ({
    antiAir: true, filter: 'ALL', targets: 'all', attackInSkill: true, idleMods: { defPct: bb.def ?? 2, resFlat: bb.magic_resistance ?? 20 },
    ...(own?.damage_scale && own.max_valid_stack_cnt ? { crowd: { step: own.damage_scale, cap: own.max_valid_stack_cnt } } : {}),
    // PLX-X: while its skill runs, part of it stays: DEF × (1 + <op>[buff].def), RES + <op>[buff].magic_resistance (职业-22)
    ...whileOf('inSkill', { defPct: bb[keyEnding(bb, '[buff].def')], resFlat: bb[keyEnding(bb, '[buff].magic_resistance')] }),
  }) },
  splashcaster: { dmgType: ARTS, trait: () => ({ splash: { radius: 1.1, scale: 1, ground: false } }) },
  // arts; also the enemies its own summons block, × atk_scale against them (its module's; 职业-14)
  soulcaster: { dmgType: ARTS, trait: (bb) => ({ summonBlocked: true, summonBlockedScale: bb.atk_scale ?? 1 }) },
  // PRI-X: 伤害倍率 × damage_scale against an enemy in an element burst (职业-17); PRI-Y: SP recovery + sp_recovery_per_sec while
  // an enemy in an element burst is in its range (the module's own data; 职业-18)
  primcaster: { dmgType: ARTS, trait: (bb, own) => ({ ...vsWhen('burst', 'dmg', bb.damage_scale), ...whileOf('burstEnemies', { spRecoveryFlat: own?.sp_recovery_per_sec }) }) },
  // arts, air too; init_atk_scale on a new target, delta_atk_scale more for each attack on the same, at most max_atk_scale (职业-12)
  funnel: { dmgType: ARTS, trait: (bb) => ({ antiAir: true, funnel: { init: bb.init_atk_scale ?? 0.2, delta: bb.delta_atk_scale ?? 0.15, max: bb.max_atk_scale ?? 1.1 } }) },
  // stores up to times attacks of energy when it has no target, and sends them with its next attack (职业-12)
  // MSC-Y: attack speed + attack_speed while it holds stored energy (the module's own data; 职业-18)
  // MSC-D: 凋亡损伤 of ep_damage_ratio of its arts damage (the module's own data; 职业-20)
  mystic: { dmgType: ARTS, trait: (bb, own, type) => ({
    store: bb.times ?? 3, ...whileOf('energy', { aspd: own?.attack_speed }), ...(type === 'MSC-D' && own?.ep_damage_ratio ? { epRider: { el: 'DARK', ratio: own.ep_damage_ratio, arts: true } } : {}),
  }) },
  // jumps among max_target enemies within 1.7 tiles, 85 % of the hit before (its module's attack@chain.atk_scale: 90 %, or
  // no less); each hit 停顿 (职业-11)
  chain: { dmgType: ARTS, trait: (bb) => ({
    chain: { max: bb['attack@max_target'] ?? bb['attack@chain.max_target'] ?? 3, scale: bb['attack@chain.atk_scale'] ?? 0.85, radius: 1.7, cells: null },
    hitStatus: { key: 'sluggish', seconds: bb['attack@sluggish'] ?? 0.5 },
  }) },
  // 医疗
  // PHY-X: heals × heal_scale on one below hp_ratio of its HP; PHY-Y (no hp_ratio): on one on a ground tile (职业-17)
  physician: { trait: (bb) => ({ heal: true, targets: 1, ...vsWhen(bb.hp_ratio ? 'hpBelow' : 'onGround', 'heal', bb.heal_scale, bb.hp_ratio ? { value: bb.hp_ratio } : {}) }) },
  // RIN-Y: heals attack@max_target (4) (the module's own data; 职业-19)
  ringhealer: { trait: (_bb, own) => ({ heal: true, targets: own?.['attack@max_target'] ?? 3 }) },
  watchman: healer(1),
  // heal_scale for a target outside range 2-3 (职业-11)
  // WAH-X: 抵抗 (one_minus_status_resistance) and 嘲讽等级 + taunt_level (职业-18)
  healer: { trait: (bb) => ({
    heal: true, targets: 1, zone: { cells: cellsOf('2-3'), scale: bb.heal_scale ?? 0.8, outside: true },
    ...whileOf('always', { taunt: bb.taunt_level, statusResMul: bb.one_minus_status_resistance === undefined ? undefined : 1 + bb.one_minus_status_resistance }),
  }) },
  // jumps among max_target operators in the 3 × 3 around each, 75 % of the heal before (职业-11)
  // XAH-X: the jumps and their 倍率 of the module's own data (0.85: 15 % less a jump; 职业-23)
  chainhealer: { trait: (bb, own) => ({ heal: true, targets: 1, chain: {
    max: own?.['attack@chain.max_target'] ?? bb['attack@chain.max_target'] ?? 3, scale: own?.['attack@chain.atk_scale'] ?? bb['attack@chain.atk_scale'] ?? 0.75, radius: 0, cells: cellsOf('x-4'),
  } }) },
  // its heals also restore element values by ep_heal_ratio of them (职业-12)
  // WDM-Y: attack speed + attack_speed while a friendly unit with element damage is in its range (职业-18)
  wandermedic: { trait: (bb) => ({ heal: true, targets: 1, epHeal: bb.ep_heal_ratio ?? 0.5, ...whileOf('epAllies', { aspd: bb.attack_speed }) }) },
  // arts; its damage heals the most wounded operator in range by scale of it (职业-11)
  // INC-Y: its damage × damage_scale while a wounded friendly unit is in its range (the module's own data; 职业-18)
  incantationmedic: { dmgType: ARTS, trait: (bb, own) => ({ healOnHit: bb.scale ?? 0.5, ...whileOf('injuredAllies', { dmgDealtMul: own?.damage_scale }) }) },
  // 辅助
  // DEC-X: SP recovery + sp_recovery_per_sec while an enemy is in its range (the module's own data; 职业-18)
  slower: { dmgType: ARTS, trait: (bb, own) => ({ hitStatus: { key: 'sluggish', seconds: bb.sluggish ?? 0.8 }, ...whileOf('enemies', { spRecoveryFlat: own?.sp_recovery_per_sec }, 1) }) },
  // no attacks, outside the deploy limit, 鼓舞 does not reach it; the operators in its range regenerate a share of its attack a
  // second (职业-13)
  // BAR-X: attack + atk while cnt other operators are in its range (the module's own data; 职业-18); BAR-Y: while its skill
  // runs, the operators in its range take −damage_resistance (30) of each physical and arts hit (伤害减免; 职业-20)
  bard: { trait: (bb, own, type) => ({
    noAttack: true, free: true, noInspire: true, regenAura: bb['attack@atk_to_hp_recovery_ratio'] ?? bb.atk_to_hp_recovery_ratio ?? 0.1,
    ...(own?.cnt ? whileOf('allies', { atkPct: own.atk }, own.cnt) : {}),
    ...(type === 'BAR-Y' && own?.damage_resistance ? { auras: [{ to: 'rangeAllies', skill: true, mods: { dmgReduceFlat: Math.abs(own.damage_resistance) } }] } : {}),
  }) },
  // arts; while its skill runs, its attacks heal at heal_scale (职业-12)
  // BLS-Y: attacks and heals attack@max_target (2) (职业-19)
  blessing: { dmgType: ARTS, trait: (bb) => ({ skillHeal: bb.heal_scale ?? 0.75, ...(bb['attack@max_target'] ? { targets: bb['attack@max_target'] } : {}) }) },
  // SUM-X: cnt (1) of its summons take no place in the deploy limit (职业-21)
  summoner: { dmgType: ARTS, trait: (bb, _own, type) => (type === 'SUM-X' && bb.cnt ? { freeSummons: bb.cnt } : {}) },
  // UMD-Y: SP recovery + sp_recovery_per_sec while an elite or leader is in its range (the trait's, or the module's own data; 职业-18)
  // UMD-X: each hit 虚弱 −atk for duration seconds (职业-20)
  underminer: { dmgType: ARTS, trait: (bb, own) => ({
    ...whileOf('eliteEnemies', { spRecoveryFlat: bb.sp_recovery_per_sec ?? own?.sp_recovery_per_sec }),
    ...(bb.atk && bb.duration ? { hitStatus: { key: 'weaken', seconds: bb.duration, value: -bb.atk } } : {}),
  }) },
  // RIT-X: 元素损伤 on an elite or leader × ep_damage_scale (职业-17); RIT-Y: the enemies in its range 元素脆弱 damage_scale (the
  // module's own data; 职业-20)
  ritualist: { dmgType: ARTS, trait: (bb, own, type) => ({
    ...vsWhen('elite', 'ep', bb.ep_damage_scale), ...(type === 'RIT-Y' && own?.damage_scale ? { auras: [{ to: 'range', mods: { elementalTakenMul: own.damage_scale } }] } : {}),
  }) },
  // its support devices are summons (召唤-4); 触发型效果 are its skills' (职业-7)
  craftsman: {},
  // RAN-X: attack + atk while another operator in its range has its skill running (职业-18)
  supportiveranger: { trait: (bb) => whileOf('skillAllies', { atkPct: bb.atk }) },
  // 特种
  // EXE-Y (and Misery's EXE-X): attack + atk while no other operator stands on the 4 tiles next to it (职业-18); EXE-X: a
  // retreat returns withdraw_cost_recover_ratio of its cost, not capped at its initial cost (职业-21)
  executor: { trait: (bb) => ({
    ...whileOf('alone4', { atkPct: bb.atk }), ...(bb.withdraw_cost_recover_ratio ? { refund: bb.withdraw_cost_recover_ratio, refundUncapped: true } : {}),
  }) },
  // its 炼金单元 are its skills' (职业-7)
  // ALC-X: SP recovery + sp_recovery_per_sec while a 炼金单元 it threw is on the field (the module's own data; 职业-18, 技能-13)
  alchemist: { trait: (bb, own, type) => (type === 'ALC-X' && own?.sp_recovery_per_sec ? whileOf('alchemy', { spRecoveryFlat: own.sp_recovery_per_sec }) : {}) },
  // at 0 HP in its own form, a switch to its 替身 for duration seconds, attack and HP + atk, max_hp; switches take 1 s (职业-15)
  dollkeeper: { trait: (bb) => ({ doll: { duration: bb.duration ?? 20, switch: DOLL_SWITCH, atk: bb.atk ?? 0, maxHp: bb.max_hp ?? 0 } }) },
  // its summons (traps) not on a tile a ground enemy stands on (职业-14)
  // TRP-D: itself on melee tiles too, its traps on ranged tiles too (the module's own data buildable_type 3; 职业-19, 职业-21);
  // TRP-Y: a trap at the chance prob deals × atk_scale damage (职业-21)
  traper: { trait: (bb, own) => ({
    trapTiles: true, ...(own?.buildable_type === 3 ? { meleeTiles: true, summonRangedTiles: true } : {}), ...(bb.prob && bb.atk_scale ? { summonBoost: { prob: bb.prob, scale: bb.atk_scale } } : {}),
  }) },
  // every enemy in range; half of the physical and arts hits dodged (blackboard prob)
  // AMB-X: the enemies in its range move − move_speed (直接乘算; the module's own data; 职业-20)
  stalker: { trait: (bb, own, type) => ({
    filter: 'ALL', targets: 'all', blockedFirst: false, mods: { dodgePhys: bb.prob ?? 0.5, dodgeArts: bb.prob ?? 0.5 },
    ...(type === 'AMB-X' && own?.move_speed ? { auras: [{ to: 'range', mods: { movePct: own.move_speed } }] } : {}),
  }) },
  // melee, but may stand on ranged tiles too (职业-10)
  // PUS-Y: its pushes one 力度 stronger while it blocks cnt (2) or more (base_force_level; 职业-23); PUS-X: half the cost
  // back when deployed on a ranged tile (value; 职业-23)
  pusher: { trait: (bb, own, type) => ({
    targets: 'blockCnt', rangedTiles: true,
    ...(type === 'PUS-Y' ? { pushBoost: { cnt: bb.cnt ?? 2, level: bb.base_force_level ?? 1 } } : {}), ...(type === 'PUS-X' ? { rangedRefund: bb.value ?? 0.5 } : {}),
  }) },
  // HOK-X: 移动创伤 — the arts damage of value (800) a tile its pulls move a target, every interval s (职业-23); HOK-Y: a pull
  // one 力度 stronger on a target farther than range_radius (2.5) tiles (the module's own data, skill@ / attack@; 职业-23)
  hookmaster: { trait: (bb, own, type) => ({
    antiAir: true, rangedTiles: true,
    ...(type === 'HOK-X' && bb.value ? { pullTrauma: { perTile: bb.value, every: bb.interval ?? 0.066 } } : {}),
    ...(type === 'HOK-Y' && own?.['skill@delta_force'] ? { pullBoost: { range: own['skill@range_radius'] ?? 2.5, level: own['skill@delta_force'] } } : {}),
  }) },
  // no refund; the blackboard's cost (negative) every interval seconds on the field, or it retreats (职业-10)
  // MER-Y: attack + atk for each upkeep payment, at most max_stack_cnt (the module's own data; 职业-20)
  merchant: { trait: (bb, own, type) => ({
    refund: 0, costDrain: { every: bb.interval ?? 3, cost: -(bb.cost ?? -3) }, ...(type === 'MER-Y' && own?.atk ? { payStack: { atk: own.atk, max: own.max_stack_cnt ?? 5 } } : {}),
  }) },
  // GEE-X: SP recovery + sp_recovery_per_sec while its HP is above 80 % (the module's own data, or 新约能天使's trait keys; 职业-18)
  geek: { trait: (bb, own) => ({
    hpDrain: bb.hp_ratio ?? 0.01, ...whileOf('hpAbove', { spRecoveryFlat: own?.sp_recovery_per_sec ?? bb['angel2_tr[e].sp_recovery_per_sec'] }, bb['angel2_tr[e].hp_ratio'] ?? 0.8),
  }) },
}));

/** Whether a branch's trait is covered (职业-7). @param {string} branch */
export const coveredBranch = (branch) => Object.hasOwn(BRANCHES, branch);

/**
 * An operator record with its branch's trait (职业-7): the damage type and the trait data from the branch table and the
 * trait's blackboard (`traitBb`), its module's hidden talents' (`hiddenBb`, 干员-7) and its module's type (`moduleType`,
 * such as `SPT-X`) and the text it adds to the trait (`moduleText`); an uncovered branch adds nothing.
 * @param {OperatorDef & { traitBb?: Record<string, number>, hiddenBb?: Record<string, number>, moduleType?: string, moduleText?: string }} op
 * @returns {OperatorDef}
 */
export function withTrait(op) {
  const { traitBb = {}, hiddenBb = {}, moduleType, moduleText, ...rest } = op;
  const b = op.branch && coveredBranch(op.branch) ? BRANCHES[op.branch] : null;
  if (!b) return rest;
  return { ...rest, ...(b.dmgType ? { dmgType: b.dmgType } : {}), trait: { ...b.trait?.(traitBb, hiddenBb, moduleType, moduleText), bb: { ...traitBb } } };
}

/**
 * Trait data of single operators beyond their branch's, by character id (职业-7). 谬因: her search and attack judge an
 * enemy by the tile of its position, not by its collider (体积-5; PRTS 谬因 oldid=435070, 链路协议 备注
 * "谬因的索敌与攻击始终采用格子判定而非碰撞判定").
 * @type {Readonly<Record<string, Readonly<Partial<TraitDef>>>>}
 */
export const OPERATOR_TRAITS = Object.freeze({ char_4229_aphris: Object.freeze({ rangeTiles: true }) });

/**
 * An operator record with its own trait data (OPERATOR_TRAITS) over its branch's; another operator's as it is.
 * @param {string} id the character id @param {OperatorDef} op @returns {OperatorDef}
 */
export const withOwnTrait = (id, op) => (Object.hasOwn(OPERATOR_TRAITS, id) ? { ...op, trait: { ...op.trait, ...OPERATOR_TRAITS[id] } } : op);
