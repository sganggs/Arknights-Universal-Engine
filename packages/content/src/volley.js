// 排球发球车 / 排球重扣车 (docs/spec/foes.md 敌能-149): every normal attack it starts first adds one ATK layer, up to a
// cap; 晕眩, 冻结, 沉睡, 浮空, 束缚 or 沉默 takes them all away and adds none while it lasts. `AtkUp` is a shared talent
// name, so its one behaviour and its shape check live here: “复仇者”'s blackboard is read by 敌能-8's `atkup` and
// 新硎's by `DeadSpawn` (敌能-44), so for those two this behaviour does nothing; any other shape stays uncovered (关卡-2).
// 锏's (敌能-157) is its ATK in 降雪, a weather the engine's levels do not have: covered, and nothing happens for it.
// They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** The cars' layers: one stacking buff. A key no other ability gives, so clearing it takes no other source's buff. */
const LAYERS = 'volleyAtk';

/** The cars' blackboard: exactly these two numbers, from the enemy data. */
const VOLLEY_KEYS = Object.freeze(['atk', 'max_stack_cnt']);
/** “复仇者”'s, with `low`, the marker of its read page (FOE_EXTRAS): the bonus at low HP that `atkup` reads (敌能-8). */
const AVENGER_KEYS = Object.freeze(['atk', 'damage_resistance', 'low']);
/** 新硎's, with `blade`, the marker of its read page (FOE_EXTRAS): the bonus while it holds a 断刃 (敌能-44). */
const BLADE_KEYS = Object.freeze(['atk', 'blade']);
/** 锏's two forms' bonus in 降雪 (敌能-157), from the data; no other enemy has these keys. */
const MACE_KEYS = Object.freeze(['enemy_blkswb_t_1.atk', 'enemy_blkswb_t_1[reborn].atk']);

/** The flags that take the layers away and keep new ones off (状态-5): 晕眩, 冻结 (either kind), 沉睡, 浮空, 束缚, 沉默. */
const CLEARS = Object.freeze(['stun', 'freeze', 'sleep', 'levitate', 'root', 'silence']);

/** Whether `bb` holds exactly these keys, each a number. @param {Record<string, unknown>} bb @param {readonly string[]} keys */
const exact = (bb, keys) => Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');

/** Whether an `AtkUp` blackboard is the cars' (敌能-149). @param {Record<string, unknown>} bb */
export const volleyShape = (bb) => exact(bb, VOLLEY_KEYS);

/**
 * Whether a talent or skill of this name, with this blackboard, is an `AtkUp` the engine implements (敌能-149): the
 * cars', “复仇者”'s or 新硎's, each marker included, or 锏's (敌能-157). Any other name is not this check's concern.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function atkUpOwns(name, bb) {
  if (name !== 'AtkUp') return true;
  return volleyShape(bb) || exact(bb, AVENGER_KEYS) || exact(bb, BLADE_KEYS) || exact(bb, MACE_KEYS);
}

/** Whether it is in one of the states that clear its layers; one it is immune to is no flag (状态-7). @param {FoeContext} ctx */
function halted(ctx) {
  const f = ctx.stats(ctx.self).flags;
  return CLEARS.some((k) => f[k] === true);
}

/** Every layer goes at once (敌能-149). @param {FoeContext} ctx */
function clear(ctx) {
  if (ctx.self.buffs.some((b) => b.key === LAYERS)) ctx.removeBuff(ctx.self, LAYERS);
}

/**
 * `AtkUp` (敌能-149). The cars: in one of those states as its turn starts, every layer goes; an attack it starts adds a
 * layer before the attack is worked out (直接乘算 +`atk` each, layers summed, at most `max_stack_cnt`), or none while
 * it is in one of them. 复仇者's and 新硎's are read by their own behaviours, so nothing happens here for them, nor for
 * 锏's: the engine has no 降雪 (敌能-157).
 * @type {FoeBehavior}
 */
const AtkUp = Object.freeze({
  tick: (ctx) => { if (volleyShape(ctx.bb) && halted(ctx)) clear(ctx); },
  attack: (ctx, mods) => {
    if (!volleyShape(ctx.bb)) return mods;
    if (halted(ctx)) clear(ctx);
    else ctx.addBuff(ctx.self, { key: LAYERS, rule: 'stack', stacks: 1, maxStacks: ctx.bb.max_stack_cnt, mods: { atkPct: ctx.bb.atk } });
    return mods;
  },
});

/** The behaviour of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const volleyBehaviors = Object.freeze({ AtkUp });
