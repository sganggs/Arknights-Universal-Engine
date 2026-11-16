// 锏 (docs/spec/foes.md 敌能-157), a 领袖 with two forms. The first has 抵抗 (敌能-27's `Resist`, from the page) and its
// damage ignores part of the 防御 of the unit blocking it; its first fall is 敌能-18's 重生 at full HP, and from the end
// of that rebirth the second form is 隐匿, hits twice a swing, ignores more 防御 and lets out 【瞬息杀机】 at each quarter of
// its HP lost. 【肆虐风雪】 (`CircleAttack`, `CircleAttack2`) is here; 【速杀】 (`Blink`, `Blink2`) is blink.js's, and the
// shared names keep their single objects: `Reborn` in footballers.js hands this shape here, `AtkUp` (降雪, which the
// engine has no object for) is volley.js's. Every ability reads the form from 锏's own buffs, so each finds it through
// the context alone (ADR 0055).
import { KIND } from '@aue/schema';
import { beginRebirth, endRebirth } from './avenger.js';
import { lostLifePassed } from './lostlife.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** The second form, from the end of the rebirth on: the mark the abilities read the form from. */
const SECOND = 'maceSecond';
/** The second form's 隐匿 (索敌-2: an enemy's, off while blocked, back 3 s after). */
const HIDE = 'maceHide';
/** One of 锏's skills was cast this frame: the others wait. Lasts the rest of the frame. */
const CAST = 'maceCast';
/** 敌能-18's rebirth buff (avenger.js). */
const REBORN = 'reborn';

/** `DefPenetrate`'s two numbers (enemy_database 17759cc8): the first form's, and the second form's (`[reborn]`). */
const PEN1 = 'enemy_blkswb_t_2.def_penetrate';
const PEN2 = 'enemy_blkswb_t_2[reborn].def_penetrate';

/** 【肆虐风雪】's blackboard, the same in both forms. */
const CIRCLE_KEYS = Object.freeze(['atk_scale', 'range_radius']);
/** The blackboards of the names only 锏 has, as the data has them. */
const KEYS = Object.freeze({
  DefPenetrate: Object.freeze([PEN1, PEN2]),
  ClearSp: Object.freeze(['hp_ratio', 'duration', 'range_radius']),
  CircleAttack: CIRCLE_KEYS,
  CircleAttack2: CIRCLE_KEYS,
});
/** 锏's `Reborn`: the data's two numbers and `page`, the read page's marker (FOE_EXTRAS). */
const REBORN_KEYS = Object.freeze(['duration', 'invincible', 'page']);

/** Exactly these keys, every one a number (关卡-2). @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/**
 * Whether a blackboard of `DefPenetrate`, `ClearSp`, `CircleAttack` or `CircleAttack2` is 锏's (关卡-2, 敌能-157): exactly
 * the data's keys, numbers all. Other names pass. @param {string} name @param {Record<string, unknown>} bb @returns {boolean}
 */
export function maceOwns(name, bb) {
  return !Object.hasOwn(KEYS, name) || exact(bb, KEYS[/** @type {keyof typeof KEYS} */ (name)]);
}

/**
 * 锏's `Reborn` (敌能-157): the data's `duration` and `invincible` with the read page's `page`. “领袖” and “酒神” have the
 * same two numbers and no marker. @param {Record<string, unknown>} bb @returns {boolean}
 */
export const maceReborn = (bb) => exact(bb, REBORN_KEYS);

/** @param {Unit} u @param {string} key */
const has = (u, key) => u.buffs.some((b) => b.key === key);

/** Whether 锏 is in its second form (敌能-157). @param {FoeContext} ctx @returns {boolean} */
export const maceSecond = (ctx) => has(ctx.self, SECOND);

/** Whether 锏 is reviving: 重生 「中止当前行动」 (敌能-157). @param {FoeContext} ctx @returns {boolean} */
export const maceReviving = (ctx) => has(ctx.self, REBORN);

/**
 * Whether one of 锏's skills may start this frame (敌能-157): able to act, neither silenced nor 静默, and no other of its
 * skills cast this frame (one a frame, in the data's order). @param {FoeContext} ctx @returns {boolean}
 */
export function maceFree(ctx) {
  const s = ctx.stats(ctx.self);
  return !s.disabled && !s.flags.silence && !s.flags.mute && !has(ctx.self, CAST);
}

/**
 * A skill of 锏's is cast (敌能-157): its cooldown starts again, it takes the attack's turn (敌能-62's `holdAttack`) and
 * no other of its skills starts this frame. @param {FoeContext} ctx @returns {void}
 */
export function maceCast(ctx) {
  ctx.use();
  ctx.holdAttack();
  ctx.addBuff(ctx.self, { key: CAST, left: 1 });
}

/**
 * The first fall (敌能-157): 敌能-18's rebirth with the HP back to the maximum, once; the second fall leaves the field.
 * @param {FoeContext} ctx @returns {boolean}
 */
export function maceFatal(ctx) {
  if (!beginRebirth(ctx, 1)) return false;
  ctx.state.set('fell', 1);
  return true;
}

/**
 * Each turn (敌能-157): the rebirth ends as 敌能-18's — its skills' first cooldowns, `invincible` s of 无敌 —, and from
 * then on the second form's mark and its 隐匿.
 * @param {FoeContext} ctx @returns {void}
 */
export function maceRebornTick(ctx) {
  endRebirth(ctx);
  if (!ctx.state.get('fell') || has(ctx.self, REBORN)) return;
  if (!has(ctx.self, SECOND)) ctx.addBuff(ctx.self, { key: SECOND });
  if (!has(ctx.self, HIDE)) ctx.addBuff(ctx.self, { key: HIDE, flags: { stealth: true } });
}

/** The share of 防御 its damage ignores on the unit blocking it, in this form (敌能-157). @param {FoeContext} ctx @param {Record<string, unknown>} bb */
const pierceOf = (ctx, bb) => /** @type {number} */ (maceSecond(ctx) ? bb[PEN2] : bb[PEN1]);

/**
 * `DefPenetrate` (敌能-157): an attack it starts while blocked ignores the form's share of the 防御 of its target — a
 * melee enemy attacks only the unit blocking it —; in the second form each target is hit twice.
 * @type {FoeBehavior}
 */
const DefPenetrate = Object.freeze({
  attack: (ctx, mods) => {
    if (!maceOwns('DefPenetrate', ctx.bb)) return mods;
    const pen = ctx.blocked ? pierceOf(ctx, ctx.bb) : 0, out = maceSecond(ctx) ? { ...mods, times: mods.times * 2 } : mods;
    return pen > 0 ? { ...out, ignoreDef: Math.max(out.ignoreDef ?? 0, pen) } : out;
  },
});

/**
 * The units of ours within `r` of its centre that 锏's abilities reach (敌能-157): operators, summons and our devices, no
 * neutral unit; selectable (索敌-2), 迷彩 and flyers included; while it is on the ground, none that took off (阻挡-2).
 * @param {FoeContext} ctx @param {number} r @returns {Unit[]}
 */
function ours(ctx, r) {
  const ground = !ctx.stats(ctx.self).flying;
  return ctx.foes(r, { canHitFly: true, ignoreCamou: true }).filter((u) => u.kind !== KIND.ENEMY && !(ground && ctx.stats(u).flags.liftoff));
}

/** The share of 防御 ignored on the unit blocking it, as `DefPenetrate` gives it in this form (敌能-157); 0 without it. @param {FoeContext} ctx */
function blockerPierce(ctx) {
  const bb = ctx.talent('DefPenetrate');
  return bb && maceOwns('DefPenetrate', bb) ? pierceOf(ctx, bb) : 0;
}

/**
 * This form's 【速杀】 is cast this frame — ready and blocked, and 锏 free —, so 【肆虐风雪】 waits: the page's table puts
 * 速杀 first, and the table's order is the casting priority (敌能-157). @param {FoeContext} ctx @param {boolean} second
 */
const blinkFirst = (ctx, second) => ctx.blocked && ctx.readyOf(second ? 'Blink2' : 'Blink');

/**
 * 【肆虐风雪】 (敌能-157): the form's own one, ready and free, with or without anyone near, unless this form's 速杀 goes
 * first: our units within `range_radius` take 攻击力 × `atk_scale` physical skill damage — twice in the second form —,
 * the unit blocking it with the form's share of its 防御 ignored. @param {FoeContext} ctx @param {boolean} second the second form's skill
 */
function circle(ctx, second) {
  if (!exact(ctx.bb, CIRCLE_KEYS) || maceSecond(ctx) !== second || !ctx.ready || !maceFree(ctx) || blinkFirst(ctx, second)) return;
  maceCast(ctx);
  const amount = ctx.stats(ctx.self).atk * ctx.bb.atk_scale, blocker = ctx.blocker(), pierce = blockerPierce(ctx);
  const hit = ours(ctx, ctx.bb.range_radius);
  for (let n = second ? 2 : 1; n > 0; n--) {
    for (const u of hit) {
      if (u.hp > 0) ctx.dealDamage(u, { type: 'phys', amount, isAttack: false, isSkill: true, ...(u === blocker && pierce > 0 ? { defIgnorePct: pierce } : {}) });
    }
  }
}

/**
 * 【瞬息杀机】 (`ClearSp`, 敌能-157): in the second form, each turn 敌能-89's 已损失生命值判定 at `hp_ratio`, from a full
 * HP; passed, every unit of ours within `range_radius` loses all its SP and gets `duration` s of 强制缴械 (状态-12)
 * and 阻回. A talent: no state of 锏's stops it.
 * @type {FoeBehavior}
 */
const ClearSp = Object.freeze({
  tick: (ctx) => {
    if (!maceOwns('ClearSp', ctx.bb) || !maceSecond(ctx) || !lostLifePassed(ctx, ctx.bb.hp_ratio)) return;
    const seconds = ctx.bb.duration;
    for (const u of ours(ctx, ctx.bb.range_radius)) {
      ctx.clearSp(u);
      ctx.applyStatus(u, 'forceDisarm', { seconds });
      ctx.applyStatus(u, 'noSp', { seconds });
    }
  },
});

/** 【肆虐风雪】 of the first form (敌能-157). @type {FoeBehavior} */
const CircleAttack = Object.freeze({ tick: (ctx) => { circle(ctx, false); } });

/** 【肆虐风雪】 of the second form, twice (敌能-157). @type {FoeBehavior} */
const CircleAttack2 = Object.freeze({ tick: (ctx) => { circle(ctx, true); } });

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const maceBehaviors = Object.freeze({ DefPenetrate, ClearSp, CircleAttack, CircleAttack2 });
