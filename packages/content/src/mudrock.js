// 泥岩 (docs/spec/foes.md 敌能-143): the 沉睡免疫 its page names, the attack layers of its talent `charge`, 刷新屏障
// (`RefreshShield`) setting 敌能-66's barrier back, and 占据 (`occupy`), which takes a L-44"留声机" — a device no level
// of the engine can place (装置-3), so it is covered and idle. `charge`, `RefreshShield` and `occupy` are shared names:
// only the blackboards below, with the layer cap or the marker of the page, are this family (关卡-2). They act only
// through the context (ADR 0055).
import { disarmed } from '@aue/sim';
import { resetBarrier } from './mudshield.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** The talent's one data key: 攻击力 + this, per layer (攻击力+60%). */
const ATK = 'attack@enemy_mdrock_s_1[charge].atk';
/** The page's 增益最多叠加6层. Not in the data: FOE_EXTRAS gives it, so it is the marker of the page too. */
const CAP = 'layers';
/** Exactly the keys of each shape (敌能-143). `page` is the content's marker, not enemy data. */
const CHARGE_KEYS = Object.freeze([ATK, CAP]);
const REFRESH_KEYS = Object.freeze(['dynamic', 'max_hp', 'attack_speed', 'page']);
const OCCUPY_KEYS = Object.freeze(['sp', 'page']);
/** The layer buff: one buff, its stacks the layers. Not the talent name: `charge` is shared. */
const LAYER = 'rockCharge';
/** The 沉睡免疫 buff. */
const SLEEPLESS = 'sleepImmune';

/** Whether `bb` has exactly these keys and each is a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
function exact(bb, keys) {
  return Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');
}

/** The layer talent with a cap of at least one layer (敌能-143). @param {Record<string, unknown>} bb */
const chargeShape = (bb) => exact(bb, CHARGE_KEYS) && /** @type {number} */ (bb[CAP]) >= 1;

/**
 * Whether a behaviour of this name is this family's, by its shape (关卡-2); any other name passes. 萨卡兹征用无人机's
 * `charge` ({ sp }), the 轻语者 and 乐团 skills of that name, 物欲拮抗者's `RefreshShield` ({ dynamic }) and 冬灵血巫's
 * unmarked `occupy` are not.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function mudrockOwns(name, bb) {
  if (name === 'charge') return chargeShape(bb);
  if (name === 'RefreshShield') return exact(bb, REFRESH_KEYS);
  if (name === 'occupy') return exact(bb, OCCUPY_KEYS);
  return true;
}

/** The 沉睡免疫 buff, given back when something removed it (敌能-143). @param {FoeContext} ctx */
function sleepless(ctx) {
  if (!ctx.self.buffs.some((b) => b.key === SLEEPLESS)) ctx.addBuff(ctx.self, { key: SLEEPLESS, flags: { 'immune:sleep': true } });
}

/**
 * 沉睡免疫 (敌能-143): the page names it, the data has no immunity for it. From the appearance for good — a 沉睡 buff stays
 * and does not take effect (状态-7). Not silenceable.
 * @type {FoeBehavior}
 */
const SleepImmune = Object.freeze({ spawn: sleepless, tick: sleepless });

/** The layers it holds now (敌能-143). @param {FoeContext} ctx */
const layersOf = (ctx) => ctx.self.buffs.find((b) => b.key === LAYER)?.stacks ?? 0;

/**
 * 攻击成功时 one layer (敌能-143): the attack starting below the cap is already one layer stronger, and the layer is
 * added when its hit lands — dodged or on an invincible unit too, not when the swing was cut or its target left —, once
 * per attack. 攻击力 ×(1 + atk × layers) with the other 直接乘算; permanent. Not silenceable.
 * @type {FoeBehavior}
 */
const charge = Object.freeze({
  attack: (ctx, mods) => {
    const bb = ctx.bb;
    if (!chargeShape(bb)) return mods;
    ctx.state.set('due', 1);
    return layersOf(ctx) < bb[CAP] ? { ...mods, atkPct: (mods.atkPct ?? 0) + bb[ATK] } : mods;
  },
  landed: (ctx) => {
    const bb = ctx.bb;
    if (!chargeShape(bb) || ctx.state.get('due') !== 1) return;
    ctx.state.set('due', 0);
    ctx.addBuff(ctx.self, { key: LAYER, rule: 'stack', stacks: 1, maxStacks: bb[CAP], mods: { atkPct: bb[ATK] } });
  },
});

/**
 * Able to cast now (敌能-143): ready, able to act, not in 失衡, not silenced, not feared, not kept from attacking (`noAttack`,
 * 缴械 or 强制缴械, 状态-12), on the field, not under 战栗 while blocked — the cast takes an attack's place, so it waits as
 * 敌能-62's barrel does; in 失衡 the turn only slides (位移-3), so the interval taken would stay pending until the slide
 * ends.
 * @param {FoeContext} ctx
 */
function mayCast(ctx) {
  const s = ctx.stats(ctx.self), f = s.flags;
  return ctx.ready && !ctx.unbalanced && !s.disabled && !f.silence && !f.fear && !f.noAttack && !disarmed(ctx.self) && !ctx.self.hidden && !(ctx.blocked && f.disarmedCombat);
}

/**
 * 刷新屏障 (敌能-143): blocked or not, the barrier back to its amount within the frame; the cooldown starts again and
 * the attack interval is taken (敌能-62's `holdAttack`). Another shape does nothing.
 * @type {FoeBehavior}
 */
const RefreshShield = Object.freeze({
  tick: (ctx) => {
    if (!exact(ctx.bb, REFRESH_KEYS) || !mayCast(ctx) || !resetBarrier(ctx, ctx.bb)) return;
    ctx.use();
    ctx.holdAttack();
  },
});

/** 占据 (敌能-143): no level of the engine has a 留声机 to take (装置-3), so it is never cast. @type {FoeBehavior} */
const occupy = Object.freeze({});

/** The behaviours of this family, by talent and skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const mudrockBehaviors = Object.freeze({ SleepImmune, charge, RefreshShield, occupy });
