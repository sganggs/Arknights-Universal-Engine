// 转译基底·α and 转译基底·β (docs/spec/foes.md 敌能-158). Their 原始形态 neither attacks nor takes damage: its buff's 伤判
// cancels every hit and counts the physical and the arts ones. At its turn a block, else a full count, starts the one change:
// the pages' 2 s standing still (`Passive.change`, FOE_EXTRAS), then the form whose `Mode_*_Passive` numbers it adds — 寻仇者
// (melee, physical, `Mode_Fuchou_Anger` below half its HP), 特战术师 (arts at `Mode_Shushi_Passive.targets` targets) or
// 幽灵 (no attack, unblockable). The data's `Passive` is shared with other enemies' shapes, so passive.js keeps the name's
// one object and runs these hooks for this shape; the Mode talents and the three ChangeTo skills have no behaviour of
// their own. The cancel is the buff's take, through the sim's buff module; the rest acts through the context (ADR 0055).
import { buffs } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').Buff} Buff */
/** @typedef {import('@aue/sim').skills.AttackMods} AttackMods */

/** The 原始形态's buff, and its 伤判 behaviour's key (敌能-158). */
const ORIGIN = 'translator';
/** The counts of the cancelled hits: `value` the data's count, `n` the hits so far (敌能-158). */
const PHYS = 'translatorPhys';
const ARTS = 'translatorArts';
/** The 变化过程: it does not move. A flag, not the 束缚 status. */
const CHANGE = 'translatorChange';
/** The form it changed into: `value` the form, the mods its Mode talent's. */
const FORM = 'translatorForm';
/** 寻仇者形态's attack while below half its HP. */
const ANGER = 'translatorAnger';

/** 失衡免疫 (位移-1) and the page's six immunities (状态-7; 寒冷's flag holds off its −30 too, 状态-5). */
const ORIGIN_FLAGS = Object.freeze({ noAttack: true, noDisplace: true, 'immune:stun': true, 'immune:sleep': true, 'immune:cold': true, 'immune:freeze': true, 'immune:levitate': true, 'immune:fear': true });

/** The forms, in the page's order: ① 寻仇者 ② 特战术师 ③ 幽灵. 0 is none yet. */
const FUCHOU = 1, SHUSHI = 2, YOULING = 3;
/** Each form's talent of numbers (the data's names: 复仇, 术师, 幽灵). */
const MODE = Object.freeze({ [FUCHOU]: 'Mode_Fuchou_Passive', [SHUSHI]: 'Mode_Shushi_Passive', [YOULING]: 'Mode_Youling_Passive' });
/** A Mode talent's seven numbers and the direct-add modifier each becomes (属性-2). */
const MODE_MODS = Object.freeze({ max_hp: 'hpFlat', atk: 'atkFlat', def: 'defFlat', magic_resistance: 'resFlat', move_speed: 'moveFlat', base_attack_time: 'batFlat', mass_level: 'massFlat' });
const MODE_KEYS = Object.freeze(Object.keys(MODE_MODS));
/** The three skills: empty blackboards, never used (敌能-158). */
const SKILLS = new Set(['ChangeToB', 'ChangeToC', 'ChangeToD']);

/** Whether `bb` has exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/**
 * The read pages' `Passive` (敌能-158, INF-1090): the data's two counts and the page's `change`, every one a number
 * (关卡-2). The two counts without `change` are not this shape.
 * @param {Record<string, unknown>} bb @returns {boolean}
 */
export const translatorShape = (bb) => exact(bb, ['phy_max_count', 'magic_max_count', 'change']);

/**
 * Whether a talent or skill of this family's other names has its shape (关卡-2, INF-1090); any other name passes.
 * @param {string} name @param {Record<string, unknown>} bb @returns {boolean}
 */
export function translatorOwns(name, bb) {
  if (name === 'Mode_Fuchou_Anger') return exact(bb, ['atk']);
  if (name === MODE[FUCHOU] || name === MODE[YOULING]) return exact(bb, MODE_KEYS);
  if (name === MODE[SHUSHI]) return exact(bb, [...MODE_KEYS, 'targets']);
  if (SKILLS.has(name)) return Object.keys(bb).length === 0;
  return true;
}

/**
 * 原始形态 from its spawn (敌能-158): the buff whose 伤判 cancels, and the two counts.
 * @param {FoeContext} ctx @returns {void}
 */
export function translatorSpawn(ctx) {
  const self = ctx.self;
  ctx.addBuff(self, { key: ORIGIN, act: ORIGIN, flags: { ...ORIGIN_FLAGS } });
  ctx.addBuff(self, { key: PHYS, value: ctx.bb.phy_max_count });
  ctx.addBuff(self, { key: ARTS, value: ctx.bb.magic_max_count });
}

/** A count that reached its number. @param {Buff} b */
const full = (b) => (b.key === PHYS || b.key === ARTS) && b.n >= b.value;

/**
 * The form due at this turn (敌能-158, INF-1092): a block, else a full physical count, else a full arts count; 0 for
 * none. A block is made in its turn after this tick (阻挡-1), so one seen here came before the hits counted since then.
 * @param {FoeContext} ctx
 */
function due(ctx) {
  if (ctx.blocked) return YOULING;
  const done = ctx.self.buffs.find(full);
  if (done) return done.key === PHYS ? FUCHOU : SHUSHI;
  return 0;
}

/**
 * The change starts (敌能-158, INF-1093): no more counting, `change` seconds standing still in 原始形态.
 * @param {FoeContext} ctx @param {number} form
 */
function begin(ctx, form) {
  const self = ctx.self, frames = ctx.frames(ctx.bb.change);
  ctx.removeBuff(self, PHYS);
  ctx.removeBuff(self, ARTS);
  ctx.state.set('form', form);
  ctx.state.set('end', ctx.frame + frames);
  if (frames > 0) ctx.addBuff(self, { key: CHANGE, left: frames, flags: { root: true } });
}

/**
 * The change ends (敌能-158, INF-1094, INF-1097): 原始形态 goes; the form's buff holds its Mode talent's numbers for good,
 * and 幽灵's no attack and no block. A Mode talent the record lacks adds no numbers.
 * @param {FoeContext} ctx
 */
function finish(ctx) {
  const self = ctx.self, form = ctx.state.get('form'), bb = ctx.talent(MODE[/** @type {1 | 2 | 3} */ (form)]) ?? {};
  ctx.removeBuff(self, ORIGIN);
  ctx.removeBuff(self, CHANGE);
  /** @type {Record<string, number>} */
  const mods = {};
  for (const [k, m] of Object.entries(MODE_MODS)) if (typeof bb[k] === 'number') mods[m] = bb[k];
  ctx.addBuff(self, { key: FORM, value: form, mods, flags: form === YOULING ? { unblockable: true, noAttack: true } : {} });
  ctx.state.set('done', 1);
}

/** The form it is in once the change is over, else 0. @param {FoeContext} ctx */
const formOf = (ctx) => (ctx.state.get('done') === 1 ? ctx.state.get('form') : 0);

/**
 * 寻仇者形态 below half its maximum HP (敌能-158, INF-1095): 攻击力 + `Mode_Fuchou_Anger.atk`, directly multiplied; one buff,
 * gone again at half or more.
 * @param {FoeContext} ctx
 */
function anger(ctx) {
  const self = ctx.self, atk = ctx.talent('Mode_Fuchou_Anger')?.atk;
  if (typeof atk !== 'number') return;
  const low = self.hp < ctx.stats(self).maxHp * 0.5, on = self.buffs.some((b) => b.key === ANGER);
  if (low && !on) ctx.addBuff(self, { key: ANGER, mods: { atkPct: atk } });
  else if (!low && on) ctx.removeBuff(self, ANGER);
}

/**
 * Each turn (敌能-158): in 原始形态 the change may start; once its time is up the form begins; 寻仇者形态's anger.
 * @param {FoeContext} ctx @returns {void}
 */
export function translatorTick(ctx) {
  const st = ctx.state;
  if (st.get('form') === 0) {
    const form = due(ctx);
    if (form !== 0) begin(ctx, form);
  }
  if (st.get('form') !== 0 && st.get('done') === 0 && ctx.frame >= st.get('end')) finish(ctx);
  if (formOf(ctx) === FUCHOU) anger(ctx);
}

/**
 * 寻仇者形态 attacks only what blocks it (敌能-158, INF-1095); the others keep the candidates (特战术师: the ranged ones).
 * @param {FoeContext} ctx @param {Unit[]} cands @returns {Unit[]}
 */
export function translatorTargets(ctx, cands) {
  if (formOf(ctx) !== FUCHOU) return cands;
  const b = ctx.blocker();
  return b ? cands.filter((u) => u === b) : [];
}

/**
 * The forms' attacks (敌能-158, INF-1095, INF-1096): 寻仇者 physical; 特战术师 arts at `Mode_Shushi_Passive.targets` targets.
 * @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods}
 */
export function translatorAttack(ctx, mods) {
  const form = formOf(ctx);
  if (form === FUCHOU) return { ...mods, type: 'phys' };
  if (form !== SHUSHI) return mods;
  const n = ctx.talent(MODE[SHUSHI])?.targets;
  return { ...mods, type: 'arts', ...(typeof n === 'number' ? { targets: n } : {}) };
}

/** The count a hit of this type goes to. */
const TALLY = Object.freeze({ phys: PHYS, arts: ARTS });

/**
 * 原始形态's 伤判 (敌能-158, INF-1091, INF-1092): every hit that reaches it is cancelled; a physical or an arts one is
 * counted first, while neither count is full. `n` is written only in buffs.js (ADR 0045).
 * @type {NonNullable<import('@aue/sim').buffs.Behavior['take']>}
 */
function cancel(_w, u, _b, _amount, hit) {
  const type = hit.dmg.type ?? '', key = Object.hasOwn(TALLY, type) ? TALLY[/** @type {keyof typeof TALLY} */ (type)] : '';
  const tally = key && !u.buffs.some(full) ? u.buffs.find((x) => x.key === key) : undefined;
  if (tally) buffs.count(tally, 1);
  return 0;
}

/** Read by `Passive` (the Mode talents), or never used (the three skills): nothing of their own (敌能-158). @type {FoeBehavior} */
const idle = Object.freeze({});

/** The behaviours of this file, by name; `Passive` dispatches here by its shape (passive.js). @type {Readonly<Record<string, FoeBehavior>>} */
export const translatorBehaviors = Object.freeze({
  Mode_Fuchou_Anger: idle, Mode_Fuchou_Passive: idle, Mode_Shushi_Passive: idle, Mode_Youling_Passive: idle, ChangeToB: idle, ChangeToC: idle, ChangeToD: idle,
});

/** 原始形态's 伤判 (敌能-158). @type {Readonly<Record<string, import('@aue/sim').buffs.Behavior>>} */
export const translatorBuffs = Object.freeze({ [ORIGIN]: { take: cancel } });
