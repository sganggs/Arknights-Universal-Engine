// 扎罗，“狼之主” (docs/spec/foes.md 敌能-148): two forms. The first takes less physical and arts damage, cannot be
// stunned, and casts 溶血骇惧 on our units whenever its SP is full; its first fall is 敌能-18's 重生 with the HP coming
// back over the rebirth, and from that fall on 【远古威慑】 slows our units around it. The second form, from the rebirth's
// end, is invincible for a while, hits harder and quicker, at range and twice a swing, and channels 狂暴怒嗥. The
// shared names keep their single objects — `Passive` in passive.js, `Reborn` in footballers.js — which hand this shape to
// the functions here. Every ability tells the forms apart by 扎罗's own buffs, so each finds them through the context
// alone (ADR 0055).
import { FPS } from '@aue/math';
import { KIND } from '@aue/schema';
import { constants, sp as spRules } from '@aue/sim';
import { beginRebirth, endRebirth } from './avenger.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit */

/** 失衡免疫: the top line of the talents, above both forms. */
const STEADY = 'wolfSteady';
/** The first form's 减伤 and 晕眩 immunity. */
const GUARD = 'wolfGuard';
/** The first form has fallen and 【远古威慑】 is gained: the mark the abilities read the form from. */
const FALLEN = 'wolfFallen';
/** The second form's 攻击力 and 攻击间隔. */
const RAGE = 'wolfRage';
/** 【远古威慑】 on one of our units, lent each turn (敌能-25). */
const AWE = 'ancientAwe';
/** 敌能-18's rebirth buff, and the invincibility after a rebirth (avenger.js). */
const REBORN = 'reborn';
const SAFE = 'reborn:invincible';
/** The tags of 溶血骇惧's 静默 and of 狂暴怒嗥's 自缚 on 扎罗: these come off, a status from anyone else stays. */
const CAGE_TAG = 'fearCage';
const HOWL_TAG = 'wildCalling';

/** Each blackboard as the read page has it: the data's numbers and the page-only ones FOE_EXTRAS adds (敌能-148). */
const PASSIVE_KEYS = Object.freeze(['sp', 'damage_resistance', 'page']);
const REBORN_KEYS = Object.freeze(['duration', 'range_radius', 'attack_speed']);
const RAGE_KEYS = Object.freeze(['atk', 'base_attack_time', 'invincible_time', 'range_radius', 'times']);
const HOWL_KEYS = Object.freeze(['duration', 'sp', 'page']);
const CAGE_KEYS = Object.freeze(['max_target', 'attack_speed', 'duration_s', 'sp', 'hp_ratio', 'duration_bleed', 'hp_ratio_offset', 'duration_wait',
  'init_sp', 'sp_recovery_per_sec']);
/** @type {Readonly<Record<string, readonly string[]>>} */
const OWN = Object.freeze({ Passive2: RAGE_KEYS, WildCalling: HOWL_KEYS, FearCage: CAGE_KEYS });

/** Exactly these keys, every one a number (关卡-2). @param {Record<string, unknown>} bb @param {readonly string[]} keys */
function shaped(bb, keys) {
  return Object.keys(bb).length === keys.length && keys.every((k) => typeof bb[k] === 'number');
}

/** 扎罗's `Passive`: the data's `sp` and `damage_resistance` with the page marker (敌能-148). @param {Record<string, unknown>} bb @returns {boolean} */
export const wolfGuardShape = (bb) => shaped(bb, PASSIVE_KEYS);

/** 扎罗's `Reborn`: the data's `duration` with 【远古威慑】's radius and attack speed from the page (敌能-148). @param {Record<string, unknown>} bb @returns {boolean} */
export const wolfReborn = (bb) => shaped(bb, REBORN_KEYS);

/**
 * Whether a blackboard of `Passive2`, `WildCalling` or `FearCage` is the read page's (关卡-2, 敌能-148): exactly its keys,
 * numbers all. 依然“狼之主” lacks the page's numbers and 血骑士's `Passive2` has other keys. Other names pass.
 * @param {string} name @param {Record<string, unknown>} bb @returns {boolean}
 */
export function wolfOwns(name, bb) {
  return !Object.hasOwn(OWN, name) || shaped(bb, OWN[name]);
}

/** @param {Unit} u @param {string} key */
const has = (u, key) => u.buffs.some((b) => b.key === key);
/** The first form has fallen (敌能-148). @param {FoeContext} ctx */
const fallen = (ctx) => has(ctx.self, FALLEN);
/** The second form: fallen and no longer reviving (敌能-148). @param {FoeContext} ctx */
const secondForm = (ctx) => fallen(ctx) && !has(ctx.self, REBORN);
/** The buff of 溶血骇惧 one 扎罗 gives, its own key, so a cure takes off its own alone (敌能-148). @param {Unit} self */
const cageKey = (self) => `fearCage:${self.id}`;

/** 失衡免疫 (位移-1), in both forms; back at once after the rebirth cleared it. @param {FoeContext} ctx */
function steady(ctx) {
  if (!has(ctx.self, STEADY)) ctx.addBuff(ctx.self, { key: STEADY, flags: { noDisplace: true } });
}

/** The first form: physical and arts damage × (1 − `damage_resistance`) in the 伤判 (伤害-8), immune to 晕眩 (状态-7). @param {FoeContext} ctx */
function guard(ctx) {
  if (has(ctx.self, GUARD)) return;
  const keep = 1 - ctx.bb.damage_resistance;
  ctx.addBuff(ctx.self, { key: GUARD, mods: { physTakenMul: keep, artsTakenMul: keep }, flags: { 'immune:stun': true } });
}

/**
 * 扎罗's `Passive` as it appears (敌能-148): 失衡免疫 and the first form's guard. The data's `sp` is the 血债账款 it adds a
 * second, a count the engine has no object for.
 * @param {FoeContext} ctx @returns {void}
 */
export function wolfGuardSpawn(ctx) {
  steady(ctx);
  guard(ctx);
}

/** Each turn (敌能-148): 失衡免疫 always; the first form's guard until it falls, never after. @param {FoeContext} ctx @returns {void} */
export function wolfGuardTick(ctx) {
  steady(ctx);
  if (!fallen(ctx)) guard(ctx);
  else if (has(ctx.self, GUARD)) ctx.removeBuff(ctx.self, GUARD);
}

/** The rebirth's frames (时间-2). @param {FoeContext} ctx */
const rebirthFrames = (ctx) => ctx.frames(ctx.bb.duration);

/**
 * The first fall (敌能-148): 敌能-18's rebirth with the HP at one frame's share of the maximum; 失衡免疫 back at once,
 * 【远古威慑】 gained, and every 溶血骇惧 this 扎罗 gave ends. The second fall leaves the field.
 * @param {FoeContext} ctx @returns {boolean}
 */
export function wolfFatal(ctx) {
  const n = rebirthFrames(ctx);
  if (!beginRebirth(ctx, n > 0 ? 1 / n : 1)) return false;
  ctx.state.set('fell', 1);
  ctx.state.set('refill', 1);
  ctx.state.set('at', ctx.frame);
  steady(ctx);
  ctx.addBuff(ctx.self, { key: FALLEN });
  const key = cageKey(ctx.self);
  for (const u of ctx.planted(key)) ctx.removeBuff(u, key);
  return true;
}

/** 缓慢回复生命值 (敌能-148): k frames into the rebirth, k ÷ N of the maximum; full on the frame it ends, and no more. @param {FoeContext} ctx */
function refill(ctx) {
  const max = ctx.stats(ctx.self).maxHp, n = rebirthFrames(ctx), k = ctx.frame - ctx.state.get('at');
  const on = has(ctx.self, REBORN) && k < n;
  ctx.setHp(ctx.self, on ? (max * Math.max(1, k)) / n : max);
  if (!on) ctx.state.set('refill', 0);
}

/**
 * 【远古威慑】 (敌能-148): lent each turn (敌能-25) to our units within `range_radius` of its centre — operators, summons and
 * our devices, selectable (索敌-2) save that 迷彩 does not hide one from an aura (阻挡-2), flyers too, not one that took
 * off —: 攻击速度 + `attack_speed` (直接加算).
 * @param {FoeContext} ctx
 */
function awe(ctx) {
  const aspd = ctx.bb.attack_speed;
  for (const u of ctx.foes(ctx.bb.range_radius, { canHitFly: true, ignoreCamou: true })) {
    if (u.kind !== KIND.ENEMY && !ctx.stats(u).flags.liftoff) ctx.lend(u, AWE, { mods: { aspd } });
  }
}

/**
 * Each turn after the first fall (敌能-148): the HP comes back while it revives; the rebirth ends as 敌能-18's (its skills'
 * first cooldowns); 【远古威慑】 through the rebirth and the second form.
 * @param {FoeContext} ctx @returns {void}
 */
export function wolfRebornTick(ctx) {
  if (!ctx.state.get('fell')) return;
  if (!fallen(ctx)) ctx.addBuff(ctx.self, { key: FALLEN });
  if (ctx.state.get('refill')) refill(ctx);
  endRebirth(ctx);
  awe(ctx);
}

/**
 * The second form (敌能-148): on its first frame `invincible_time` s of 无敌 that also cannot be selected (敌能-18's);
 * for good, 攻击力 + `atk` (直接乘算) and 攻击间隔 + `base_attack_time` (直接加算).
 * @param {FoeContext} ctx
 */
function rage(ctx) {
  const self = ctx.self, bb = ctx.bb;
  if (!ctx.state.get('form')) {
    ctx.state.set('form', 1);
    ctx.addBuff(self, { key: SAFE, flags: { invincible: true, untargetable: true }, left: ctx.frames(bb.invincible_time) });
  }
  if (!has(self, RAGE)) ctx.addBuff(self, { key: RAGE, mods: { atkPct: bb.atk, batFlat: bb.base_attack_time } });
}

/** The second form's attack (敌能-148). @param {FoeContext} ctx */
const raging = (ctx) => shaped(ctx.bb, RAGE_KEYS) && ctx.state.get('form') === 1;

/**
 * The second form attacks at range (敌能-148): besides the blocker, whom a ranged enemy reaches within `range_radius` +
 * our collider (常量-2) — no flyer (敌能-63), not one that took off.
 * @param {FoeContext} ctx @param {Unit[]} cands
 */
function reach(ctx, cands) {
  const near = ctx.foes(ctx.bb.range_radius + constants.ALLY_COLLIDER_RADIUS).filter((u) => !ctx.stats(u).flags.liftoff);
  return [...new Set([...cands, ...near])];
}

/** `Passive2` (敌能-148): the second form, its stats, its reach and `times` hits a swing. @type {FoeBehavior} */
const Passive2 = Object.freeze({
  tick: (ctx) => { if (shaped(ctx.bb, RAGE_KEYS) && secondForm(ctx)) rage(ctx); },
  targets: (ctx, cands) => (raging(ctx) ? reach(ctx, cands) : cands),
  attack: (ctx, mods) => (raging(ctx) ? { ...mods, times: mods.times * ctx.bb.times } : mods),
});

/**
 * Free to cast this frame (敌能-148, read as 敌能-62 reads 「大多数技能释放会占用攻击间隔」): able to act, neither silenced
 * nor 静默, not in 恐惧 and not 战栗 while blocked — what holds this frame's attack holds the cast.
 * @param {FoeContext} ctx
 */
function free(ctx) {
  const s = ctx.stats(ctx.self), f = s.flags;
  return !s.disabled && !f.silence && !f.mute && !f.fear && !(f.disarmedCombat && ctx.blocked);
}

/** The channel ends — its last frame, or it cannot act: only its own 自缚 comes off, and the cooldown starts. @param {FoeContext} ctx */
function stopHowl(ctx) {
  ctx.state.set('ch', 0);
  ctx.removeBuff(ctx.self, 'root', HOWL_TAG);
  ctx.use();
}

/** 狂暴怒嗥 (敌能-148): ready in the second form, it channels `duration` s, rooted and not attacking. @param {FoeContext} ctx */
function howl(ctx) {
  const st = ctx.state;
  if (st.get('ch') > 0) {
    if (ctx.stats(ctx.self).disabled) { stopHowl(ctx); return; }
    st.set('ch', st.get('ch') - 1);
    if (st.get('ch') <= 0) stopHowl(ctx);
    return;
  }
  const n = ctx.frames(ctx.bb.duration);
  if (!secondForm(ctx) || !ctx.ready || !free(ctx) || !(n > 0)) return;
  st.set('ch', n);
  ctx.applyStatus(ctx.self, 'root', { frames: n, tag: HOWL_TAG });
  ctx.holdAttack();
}

/** `WildCalling` (敌能-148): no attack while it channels. The 血债账款 it adds a second is not this engine's. @type {FoeBehavior} */
const WildCalling = Object.freeze({
  targets: (ctx, cands) => (ctx.state.get('ch') > 0 ? [] : cands),
  tick: (ctx) => { if (shaped(ctx.bb, HOWL_KEYS)) howl(ctx); },
});

/** SP (技能-2's slot): `sp_recovery_per_sec` a second, whole points up to the cost; none under 阻回 (状态-9). @param {FoeContext} ctx */
function regen(ctx) {
  const st = ctx.state, rate = ctx.bb.sp_recovery_per_sec, cap = ctx.sp;
  if (!(rate > 0) || ctx.stats(ctx.self).flags.noSp || st.get('sp') >= cap) return;
  let slot = st.get('slot') + rate / FPS, sp = st.get('sp');
  while (sp < cap && (1 - slot) / rate < spRules.SLOT_EPSILON) { slot -= 1; sp += 1; }
  st.set('slot', slot);
  st.set('sp', sp);
}

/** What 溶血骇惧 gives a unit (敌能-148): 攻击速度 + `attack_speed` (直接加算) and 无法撤退 (撤退-1). @param {FoeContext} ctx */
const cageOf = (ctx) => ({ mods: { aspd: ctx.bb.attack_speed }, flags: { noRetreat: true } });

/** One effect ended (敌能-148): its buff comes off, `sp` SP back, not past the cost, none under 阻回. @param {FoeContext} ctx @param {Unit | null} u */
function endOne(ctx, u) {
  if (u) ctx.removeBuff(u, cageKey(ctx.self));
  if (!ctx.stats(ctx.self).flags.noSp) ctx.state.set('sp', Math.min(ctx.sp, ctx.state.get('sp') + ctx.bb.sp));
}

/**
 * The k-th second after the cast (敌能-148): 生命流失 (伤害-10) of the unit's maximum HP × `hp_ratio` × min(1, k ÷
 * `duration_bleed`), from 扎罗. @param {FoeContext} ctx @param {Unit} u @param {number} at the frame of the cast
 */
function drain(ctx, u, at) {
  const sec = ctx.frames(1), k = ctx.frame - at;
  if (k <= 0 || k % sec !== 0) return;
  const share = ctx.bb.hp_ratio * Math.min(1, k / sec / ctx.bb.duration_bleed);
  ctx.dealDamage(u, { type: 'true', amount: ctx.stats(u).maxHp * share, hpLoss: true });
}

/**
 * The effects still on (敌能-148): all cured once 扎罗 is at most its HP at the cast + `hp_ratio_offset` of its maximum;
 * one ends when its unit has left. The rest are given again (敌能-25) and drain. Returns how many are left.
 * @param {FoeContext} ctx @returns {number}
 */
function keepCage(ctx) {
  const st = ctx.state, self = ctx.self, n = st.get('n');
  const cured = self.hp <= st.get('hp0') + ctx.bb.hp_ratio_offset * ctx.stats(self).maxHp;
  let live = 0;
  for (let i = 0; i < n; i++) {
    const id = st.get(`id${i}`);
    if (id === 0) continue;
    const u = ctx.unit(id);
    if (cured || !u || u.hp <= 0) { st.set(`id${i}`, 0); endOne(ctx, u); continue; }
    live++;
    ctx.lend(u, cageKey(self), cageOf(ctx));
    drain(ctx, u, st.get(`at${i}`));
  }
  return live;
}

/** The last effect has ended (敌能-148): its 静默 comes off, then `duration_wait` s of 静默. @param {FoeContext} ctx */
function quiet(ctx) {
  ctx.state.set('n', 0);
  ctx.removeBuff(ctx.self, 'mute', CAGE_TAG);
  ctx.applyStatus(ctx.self, 'mute', { seconds: ctx.bb.duration_wait, tag: CAGE_TAG });
}

/**
 * Whom 溶血骇惧 may take (敌能-148): our units on the whole field — no neutral unit —, selectable (索敌-2), flyers too,
 * not one that took off; in attack order (索敌-5).
 * @param {FoeContext} ctx
 */
function cagePicks(ctx) {
  return ctx.order(ctx.foes(Infinity, { canHitFly: true }).filter((u) => u.kind !== KIND.ENEMY && !ctx.stats(u).flags.liftoff));
}

/**
 * 溶血骇惧 (敌能-148): with the SP full, free to and someone to take, up to `max_target` units; the cast takes the attack
 * interval (敌能-62), spends the SP, notes 扎罗's HP and gives it 静默 while the effects last.
 * @param {FoeContext} ctx
 */
function cast(ctx) {
  const st = ctx.state, self = ctx.self;
  if (st.get('sp') < ctx.sp || !ctx.ready || !free(ctx)) return;
  const picked = cagePicks(ctx).slice(0, Math.max(0, Math.floor(ctx.bb.max_target)));
  if (picked.length === 0) return;
  ctx.use();
  ctx.holdAttack();
  st.set('sp', st.get('sp') - ctx.sp);
  st.set('hp0', self.hp);
  st.set('n', picked.length);
  picked.forEach((u, i) => {
    st.set(`id${i}`, u.id);
    st.set(`at${i}`, ctx.frame);
    ctx.lend(u, cageKey(self), cageOf(ctx));
  });
  ctx.applyStatus(self, 'mute', { tag: CAGE_TAG });
}

/** After the first fall nothing of the skill is left: the fall took its effects off, without SP or 静默 (敌能-148). @param {FoeContext} ctx */
function drop(ctx) {
  const st = ctx.state, n = st.get('n');
  for (let i = 0; i < n; i++) st.set(`id${i}`, 0);
  st.set('n', 0);
}

/** `FearCage` (敌能-148): 溶血骇惧, the first form's. @type {FoeBehavior} */
const FearCage = Object.freeze({
  spawn: (ctx) => { if (shaped(ctx.bb, CAGE_KEYS)) ctx.state.set('sp', Math.min(ctx.sp, Math.max(0, ctx.bb.init_sp))); },
  tick: (ctx) => {
    if (!shaped(ctx.bb, CAGE_KEYS)) return;
    if (fallen(ctx)) { drop(ctx); return; }
    regen(ctx);
    if (ctx.state.get('n') > 0 && keepCage(ctx) === 0) quiet(ctx);
    if (ctx.state.get('n') === 0) cast(ctx);
  },
});

/** The behaviours of this family by name; `Passive` and `Reborn` stay with their shared objects. @type {Readonly<Record<string, FoeBehavior>>} */
export const wolfBehaviors = Object.freeze({ Passive2, WildCalling, FearCage });
