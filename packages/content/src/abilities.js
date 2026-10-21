// More enemy abilities of the official content (docs/spec/foes.md 敌能-12…敌能-16): cost theft on hits, the 能量 and
// 过载 of the 匪帮, 隐匿 with a 强击 when blocked, a channelled 引导, and 载客. They act only through the context (ADR 0055).

import { targeting } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** Whether an enemy's attacks go by projectile (攻击-3). @param {Unit} e */
const shoots = (e) => e.base.applyWay === 'RANGED' && e.base.rangeRadius > 0;

/**
 * 资源偷取 / 劫掠 (敌能-12): an 攻击回复 skill — each attack of the enemy's kind (melee or by projectile, as the ability
 * says; either for 劫掠) gives 1 SP, and with SP at its cost the attack is the skill's instead, spending it; not while
 * silenced. The skill's hit, when it deals damage to an operator, takes −`cost` from that operator's player; 劫掠 also
 * heals the enemy `hp_ratio` of its maximum HP.
 * @param {boolean | null} ranged @returns {FoeBehavior}
 */
const costHit = (ranged) => Object.freeze({
  attack: (/** @type {FoeContext} */ ctx, /** @type {any} */ mods) => {
    const st = ctx.state;
    if (ranged !== null && shoots(ctx.self) !== ranged) return mods;
    if (st.get('sp') >= ctx.sp && !ctx.stats(ctx.self).flags.silence) { st.set('sp', 0); st.set('armed', 1); } else st.set('sp', Math.min(ctx.sp, st.get('sp') + 1));
    return mods;
  },
  hit: (/** @type {FoeContext} */ ctx, /** @type {Unit} */ t) => {
    if (ctx.state.get('armed') !== 1) return;
    ctx.state.set('armed', 0);
    if (t.owner < 0) return;
    ctx.drainCost(t, -ctx.bb.cost);
    if (ctx.bb.hp_ratio) ctx.heal(ctx.self, ctx.bb.hp_ratio * ctx.stats(ctx.self).maxHp);
  },
});

const ENERGY = 'energy';
const OVERLOAD = 'overload';

/** The modifiers of n points of 能量 (敌能-13): 攻击力 +10 % and 防御力 +20 % each. @param {number} n */
const energyMods = (n) => ({ atkPct: 0.1 * n, defPct: 0.2 * n });
/** A unit's 能量 cap (敌能-13): its `blacksteel_energy.max_stack_cnt`, 0 without. @param {FoeContext} ctx @param {Unit} u */
const capOf = (ctx, u) => ctx.talentOf(u, 'blacksteel_energy')?.max_stack_cnt ?? 0;
/** Whether a unit is in 过载 (敌能-13). @param {FoeContext} ctx @param {Unit} u */
const overloaded = (ctx, u) => ctx.buffValue(u, OVERLOAD) !== null;
/** A unit's 能量, or null for one without. @param {FoeContext} ctx @param {Unit} u */
const energyOf = (ctx, u) => (capOf(ctx, u) > 0 ? ctx.buffValue(u, ENERGY) : null);

/**
 * Adds 能量 to a unit (敌能-13), between 0 and its cap; nothing for one without 能量 or in 过载. Returns how much it
 * changed.
 * @param {FoeContext} ctx @param {Unit} u @param {number} n
 */
export function addEnergy(ctx, u, n) {
  const v = energyOf(ctx, u);
  if (v === null || overloaded(ctx, u)) return 0;
  const next = Math.max(0, Math.min(capOf(ctx, u), v + n));
  ctx.setBuff(u, ENERGY, next, energyMods(next));
  return next - v;
}

/** 能量 (敌能-13): from its appearance, `init_stack_cnt` points (0 without). @type {FoeBehavior} */
const blacksteel_energy = Object.freeze({
  spawn: (ctx) => { const n = ctx.bb.init_stack_cnt ?? 0; ctx.setBuff(ctx.self, ENERGY, n, energyMods(n)); },
});

/**
 * 过载 (敌能-13): at its cap it overloads for `duration` s — 攻击速度 +`attack_speed`, 防御力 × `def` (最终乘算), 法术抗性
 * +`magic_resistance` — and when that ends its 能量 is 0.
 * @type {FoeBehavior}
 */
const over_energy = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, self = ctx.self, over = overloaded(ctx, self);
    if (ctx.state.get('over') === 1 && !over) {
      ctx.state.set('over', 0);
      ctx.setBuff(self, ENERGY, 0, energyMods(0));
      return;
    }
    const v = energyOf(ctx, self);
    if (over || v === null || v < capOf(ctx, self)) return;
    ctx.addBuff(self, { key: OVERLOAD, left: ctx.frames(bb.duration), mods: { aspd: bb.attack_speed, defMul: bb.def, resFlat: bb.magic_resistance } });
    ctx.state.set('over', 1);
  },
});

/**
 * Counts down a timer of the ability's state and says whether it ran out (敌能-13): it starts at `every` seconds and
 * runs again from there.
 * @param {FoeContext} ctx @param {string} key @param {number} every
 */
function due(ctx, key, every) {
  const left = ctx.state.get(key) || ctx.frames(every);
  if (left > 1) { ctx.state.set(key, left - 1); return false; }
  ctx.state.set(key, ctx.frames(every));
  return true;
}

/** 能量衰减 (敌能-13): out of 过载, −`dec_count` 能量 every `interval` s. @type {FoeBehavior} */
const dec_energy = Object.freeze({
  tick: (ctx) => { if (!overloaded(ctx, ctx.self) && due(ctx, 't', ctx.bb.interval)) addEnergy(ctx, ctx.self, ctx.bb.dec_count); },
});

/**
 * 能量夺取 (敌能-13): out of 过载, every `interval` s it takes `steal_count` 能量 from each other enemy within
 * `range_radius` that has some and is neither in 过载 nor itself a taker, and gains what it took.
 * @type {FoeBehavior}
 */
const steal_energy = Object.freeze({
  tick: (ctx) => {
    if (overloaded(ctx, ctx.self) || !due(ctx, 't', ctx.bb.interval)) return;
    let got = 0;
    for (const u of ctx.allies(ctx.bb.range_radius)) {
      if (u === ctx.self || ctx.talentOf(u, 'steal_energy') || !((energyOf(ctx, u) ?? 0) > 0)) continue;
      got -= addEnergy(ctx, u, -ctx.bb.steal_count);
    }
    if (got > 0) addEnergy(ctx, ctx.self, got);
  },
});

/**
 * 辐射充能 (敌能-13): when ready it roots itself for `duration` s, and each `interval` s of it gives `add_count` 能量 to
 * every enemy within `range_radius`, itself too.
 * @type {FoeBehavior}
 */
const AddEnergy = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, st = ctx.state;
    if (st.get('cast') > 0) {
      st.set('cast', st.get('cast') - 1);
      if (due(ctx, 'pulse', bb.interval)) for (const u of ctx.allies(bb.range_radius)) addEnergy(ctx, u, bb.add_count);
      return;
    }
    const s = ctx.stats(ctx.self);
    if (!ctx.ready || s.disabled || s.flags.silence) return;
    ctx.use();
    ctx.applyStatus(ctx.self, 'root', { seconds: bb.duration });
    st.set('cast', ctx.frames(bb.duration));
    st.set('pulse', ctx.frames(bb.interval));
  },
});

/**
 * 隐匿 with 强击 (敌能-14): the `hide` buff stays. Blocking lifts 隐匿 through 索敌-2, and the same rule times the
 * return, so this ability keeps no second clock. The 强击 mark (one at most) is granted again on the frame 隐匿 takes
 * effect. Blocked, marked and able to act, it strikes the unit blocking it for `atk_scale` × its attack as physical
 * damage and spends the mark.
 * @type {FoeBehavior}
 */
const InvisibleCombat = Object.freeze({
  spawn: (ctx) => { ctx.addBuff(ctx.self, { key: 'hide', flags: { stealth: true } }); ctx.state.set('mark', 1); },
  tick: (ctx) => {
    const st = ctx.state;
    if (ctx.blocked) {
      const t = ctx.blocker(), s = ctx.stats(ctx.self);
      if (st.get('mark') === 1 && t && !s.disabled && !s.flags.silence) {
        st.set('mark', 0);
        ctx.dealDamage(t, { type: 'phys', amount: ctx.bb.atk_scale * s.atk });
      }
    }
    const on = targeting.stealthed(ctx.self);
    if (on && st.get('on') !== 1) st.set('mark', 1);
    st.set('on', on ? 1 : 0);
  },
});

/**
 * 引导 (敌能-15): ready, able to act, not silenced, with a unit to attack in its attack radius, it locks the first it
 * would attack and channels `anim_duration` s — standing, not attacking; a hindrance that stops it acting ends the
 * channel — then deals `atk_scale` × its attack to it as arts damage and gains 攻击速度 +`attack_speed` for `duration` s.
 * @type {FoeBehavior}
 */
const Guide = Object.freeze({
  targets: (ctx, cands) => (ctx.state.get('ch') > 0 ? [] : cands),
  tick: (ctx) => {
    const bb = ctx.bb, st = ctx.state, s = ctx.stats(ctx.self);
    if (st.get('ch') > 0) {
      if (s.disabled) { st.set('ch', 0); return; }
      st.set('ch', st.get('ch') - 1);
      if (st.get('ch') > 0) return;
      const t = ctx.foes(Infinity).find((u) => u.id === st.get('t'));
      if (t) ctx.dealDamage(t, { type: 'arts', amount: bb.atk_scale * s.atk });
      ctx.addBuff(ctx.self, { key: 'guide', left: ctx.frames(bb.duration), mods: { aspd: bb.attack_speed } });
      return;
    }
    const [t] = ctx.order(ctx.foes(ctx.self.base.rangeRadius + 0.25));
    if (!ctx.ready || s.disabled || s.flags.silence || !t) return;
    ctx.use();
    st.set('t', t.id);
    st.set('ch', ctx.frames(bb.anim_duration));
    ctx.applyStatus(ctx.self, 'root', { seconds: bb.anim_duration });
  },
});

/** How far a carrier looks for a passenger (敌能-16). Not a blackboard key. */
const BOARD_RADIUS = 0.5;

/** Half the side of talent `bus`'s unload square (0.4, centred on the carrier). Not a blackboard key. */
const UNLOAD_HALF = 0.2;

/**
 * While the carrier can act, other ground enemies within 0.5 that are not a leader and not a machine board, up to
 * `max_cnt` (敌能-16).
 * @param {FoeContext} ctx
 */
function takePassengers(ctx) {
  const self = ctx.self;
  if (ctx.stats(self).disabled) return;
  for (const u of ctx.allies(BOARD_RADIUS)) {
    if (ctx.passengers() >= ctx.bb.max_cnt) break;
    if (u !== self && u.base.levelType !== 'BOSS' && !ctx.tagsOf(u).includes('machine') && !ctx.stats(u).flying) ctx.board(u);
  }
}

/**
 * 载客 (敌能-16): it takes `max_cnt` of a blocker's 阻挡数; while it can act and has room, each other enemy within 0.5
 * tiles that is on the ground, not a leader and not a machine goes aboard; the first time it stands on a 云梯
 * (tile_stairs) its passengers alight there and it carries no more. When it leaves the field they alight too (sim).
 * @type {FoeBehavior}
 */
const Bus = Object.freeze({
  spawn: (ctx) => { ctx.addBuff(ctx.self, { key: 'bus', mods: { blockCnt: ctx.bb.max_cnt - 1 } }); },
  tick: (ctx) => {
    const st = ctx.state;
    if (st.get('done') === 1) return;
    if (ctx.tileKey() === 'tile_stairs') { ctx.alight(); st.set('done', 1); return; }
    takePassengers(ctx);
  },
});

/**
 * `move_speed` of 移动速度 per passenger, 直接乘算 (敌能-16): the cuts add, and the attribute floor (属性-3) is the only
 * floor. No passenger, no buff.
 * @param {FoeContext} ctx
 */
function pace(ctx) {
  const n = ctx.passengers();
  if (ctx.state.get('n') === n) return;
  ctx.state.set('n', n);
  if (n === 0) ctx.removeBuff(ctx.self, 'busSpeed');
  else ctx.setBuff(ctx.self, 'busSpeed', n, { movePct: n * ctx.bb.move_speed });
}

/**
 * 载客 for talent `bus` (敌能-16, 伊利昂的木驮兽 and 铁驮兽): unblockable, slowed by each passenger; its passengers
 * alight when it leaves the field, scattered in a square on its remaining route. `busUnload`'s value is the square's
 * half-width, which the sim reads on that unload. `half_cnt` only swaps the model.
 * @type {FoeBehavior}
 */
const bus = Object.freeze({
  spawn: (ctx) => {
    ctx.addBuff(ctx.self, { key: 'bus', flags: { unblockable: true } });
    ctx.addBuff(ctx.self, { key: 'busUnload', value: UNLOAD_HALF });
  },
  tick: (ctx) => {
    takePassengers(ctx);
    pace(ctx);
  },
});

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const moreFoeBehaviors = Object.freeze({
  CostMeleeAttack: costHit(false), CostRangedAttack: costHit(true), CostHealHit: costHit(null),
  blacksteel_energy, over_energy, dec_energy, steal_energy, AddEnergy, InvisibleCombat, Guide, Bus, bus,
});
