// 腐败骑士 and 凋零骑士 (docs/spec/foes.md 敌能-145), a pair of leaders: the cross on 腐败骑士's normal attack, 蓄力锤,
// 爆炸箭 and the rage when the partner leaves. `aoe` (partisans.js, cauldron.js) and `ChargeAttack` (glow.js) keep one
// behaviour each and hand the knights' shapes here; `triggerrage` and `TripleAttack` are this file's. They act through
// the context (ADR 0055), except an arrow's blast: it is the expiry of a buff on the carrier, as W's C4 is (敌能-76), so
// it still goes off once 凋零骑士 has left.

import { attrs, body, constants, damage, disarmed, targeting } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit @typedef {import('@aue/sim').World} World @typedef {import('@aue/sim').Buff} Buff */
/** @typedef {import('@aue/sim').skills.AttackMods} AttackMods */

/** range_table's x-5: the tile and the four next to it, the engine's cross (敌能-7, 敌能-26). The only range read here. */
const CROSS = 'x-5';
/** 腐败骑士's `aoe`: the share of its attack on the other four tiles, and their range. */
const AOE_SHARE = 'attack@dekght[aoe].atk_scale', AOE_RANGE = 'attack@dekght[aoe].range_id';
/** 蓄力锤: the 倍率 on the other four tiles (the target's is `atk_scale`), and their range. */
const HAMMER_SHARE = 'dekght[aoe].atk_scale', HAMMER_RANGE = 'dekght[aoe].range_id';
/** 爆炸箭: the fuse in seconds, the 倍率, the range. `n` is the page's 最多3个, not in the data. */
const ARROW_FUSE = 'dekght_2[aoe].interval', ARROW_SCALE = 'dekght_2[aoe].atk_scale', ARROW_RANGE = 'dekght_2[aoe].range_id';
/** The rage's numbers and the page marker. The partner's key, text, is the one key besides them. */
const RAGE_KEYS = Object.freeze(['atk', 'attack_speed', 'move_speed', 'page']);

/** Standing still through the charge. No other ability uses the key, so taking it off takes off no one else's. */
const HOLD = 'rotHammer';
/** One arrow on its carrier; its expiry is the blast. */
const FUSE = 'blastArrow';
/** The rage, for good. */
const RAGE = 'rotRage';

/**
 * Whether a blackboard has exactly these number keys and the cross under `range` (敌能-145). A number written as text is
 * not a number here. @param {Record<string, unknown>} bb @param {readonly string[]} nums @param {string} range
 */
function shaped(bb, nums, range) {
  return Object.keys(bb).length === nums.length + 1 && bb[range] === CROSS && nums.every((k) => typeof bb[k] === 'number');
}

/** 腐败骑士's `aoe` with the page marker (敌能-145). 并驾骑士's, without it, is not. @param {Record<string, unknown>} bb */
export const knightAoe = (bb) => shaped(bb, [AOE_SHARE, 'page'], AOE_RANGE);

/** 蓄力锤 with the page marker (敌能-145). @param {Record<string, unknown>} bb */
export const hammerShape = (bb) => shaped(bb, ['atk_scale', HAMMER_SHARE, 'duration', 'page'], HAMMER_RANGE);

/** 爆炸箭 with the page's target count (敌能-145). @param {Record<string, unknown>} bb */
const arrowShape = (bb) => shaped(bb, [ARROW_FUSE, ARROW_SCALE, 'n'], ARROW_RANGE);

/** The rage with the page marker and the partner's enemy key (敌能-145). @param {Record<string, unknown>} bb */
function rageShape(bb) {
  if (Object.keys(bb).length !== RAGE_KEYS.length + 1 || typeof bb.partner !== 'string' || bb.partner === '') return false;
  return RAGE_KEYS.every((k) => typeof bb[k] === 'number');
}

/**
 * Whether a blackboard of this family's own names is a shape it understands (敌能-145, 关卡-2); any other name passes.
 * `aoe` and `ChargeAttack` are asked through aoeOwns and chargeAttackOwns. @param {string} name @param {Record<string, unknown>} bb
 */
export function rotKnightOwns(name, bb) {
  if (name === 'triggerrage') return rageShape(bb);
  if (name === 'TripleAttack') return arrowShape(bb);
  return true;
}

/**
 * 腐败骑士's normal attack (敌能-145): 敌能-26's cross, the others at `attack@dekght[aoe].atk_scale` of the hit. Any other
 * blackboard leaves the attack as it is. @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods}
 */
export function knightCross(ctx, mods) {
  return knightAoe(ctx.bb) ? { ...mods, cross: true, splashScale: ctx.bb[AOE_SHARE] } : mods;
}

/**
 * Whether it could start a normal attack this frame (敌人攻击-1, 状态-5), so a skill may take that turn (敌能-62): able to
 * act, not silenced (the skills can be), no `noAttack`, not 缴械 or 强制缴械 (状态-12; the page names 缴械), not feared,
 * not under 战栗 while blocked, not disappeared, not in 失衡 (it does not attack then, 位移-3). The attack's own cooldown
 * is not waited for (INF-0921). @param {FoeContext} ctx
 */
function mayStrike(ctx) {
  const s = ctx.stats(ctx.self), f = s.flags;
  return !s.disabled && !f.silence && !f.noAttack && !disarmed(ctx.self) && !f.fear && !(ctx.blocked && f.disarmedCombat) && !ctx.self.hidden && !ctx.unbalanced;
}

/**
 * The charge starts (敌能-145): on the unit blocking it, the one its melee attack hits. This frame's attack is taken and
 * waits a whole interval (敌能-62). A charge of no frames would never end, so it does not start. @param {FoeContext} ctx
 */
function lift(ctx) {
  const t = ctx.blocker(), frames = ctx.frames(ctx.bb.duration);
  if (!ctx.ready || !t || t.hp <= 0 || !(frames > 0) || !mayStrike(ctx)) return;
  ctx.state.set('ch', frames);
  ctx.state.set('aim', t.id + 1);
  ctx.addBuff(ctx.self, { key: HOLD, flags: { root: true } });
  ctx.holdAttack();
}

/** The charge is over, smashed or cut short: it may move again, and the cooldown starts (敌能-145). @param {FoeContext} ctx */
function rest(ctx) {
  ctx.state.set('ch', 0);
  ctx.removeBuff(ctx.self, HOLD);
  ctx.use();
}

/**
 * The smash (敌能-145): only while the target it locked is still on the field. The target at `atk_scale`, the others in
 * its cross at `dekght[aoe].atk_scale` as 溅射, physical skill damage at the attack it has now. @param {FoeContext} ctx
 */
function smash(ctx) {
  const t = ctx.unit(ctx.state.get('aim') - 1);
  if (!t || t.hp <= 0 || t.hidden) return;
  const atk = ctx.stats(ctx.self).atk, bb = ctx.bb;
  for (const u of ctx.around(t, 'cross')) {
    const main = u === t;
    ctx.dealDamage(u, { type: 'phys', amount: atk * (main ? bb.atk_scale : bb[HAMMER_SHARE]), isAttack: false, isSkill: true, ...(main ? {} : { isSplash: true }) });
  }
}

/**
 * 蓄力锤 (敌能-145), one turn: start when it may, or run the charge down. A hindrance, silence or its fall ends the charge
 * without the smash; the `targets` of `ChargeAttack` keep the normal attack off while `ch` runs. @param {FoeContext} ctx
 */
export function hammerTick(ctx) {
  const st = ctx.state;
  if (st.get('ch') <= 0) { lift(ctx); return; }
  const s = ctx.stats(ctx.self);
  if (s.disabled || s.flags.silence || ctx.self.hp <= 0) { rest(ctx); return; }
  st.set('ch', st.get('ch') - 1);
  if (st.get('ch') > 0) return;
  smash(ctx);
  rest(ctx);
}

/**
 * Who 爆炸箭 may pick (敌能-145): those its normal attack could (敌人攻击-1) — within its attack radius + 0.25 and
 * selectable, flyers too (the skill tooltip's 默认可对空), the unit blocking it wherever it stands — and not one that took
 * off; the first `n` by 索敌-5. @param {FoeContext} ctx @returns {Unit[]}
 */
function quarry(ctx) {
  const reach = ctx.self.base.rangeRadius + constants.ALLY_COLLIDER_RADIUS;
  const list = ctx.foes(reach, { canHitFly: true }).filter((u) => !targeting.evadesGround(ctx.self, u));
  const b = ctx.blocker();
  if (b && b.hp > 0 && !list.includes(b)) list.push(b);
  return ctx.order(list).slice(0, ctx.bb.n);
}

/**
 * 爆炸箭 (敌能-145): ready, in its attack's turn and with someone to pick, it takes that turn and puts an arrow on each
 * pick, with the 倍率 and this frame's attack. The skill has no duration, so its cooldown starts now. @param {FoeContext} ctx
 */
function shoot(ctx) {
  if (!arrowShape(ctx.bb) || !ctx.ready || !mayStrike(ctx)) return;
  const picked = quarry(ctx), left = ctx.frames(ctx.bb[ARROW_FUSE]);
  if (picked.length === 0 || !(left > 0)) return;
  ctx.use();
  ctx.holdAttack();
  const atk = ctx.stats(ctx.self).atk;
  for (const t of picked) ctx.addBuff(t, { key: FUSE, value: ctx.bb[ARROW_SCALE], n: atk, left });
}

/**
 * The units an arrow's blast reaches (敌能-145), by 敌能-26's cross: those an enemy fights (operators, neutral units, our
 * devices) on the carrier's tile and the four next to it, on the field; the carrier even under 隐匿, the others not; none
 * that took off, as the archer walks (敌人攻击-1). 迷彩 keeps no one out. @param {World} w @param {Unit} t @returns {Unit[]}
 */
function blastArea(w, t) {
  const [r, c] = body.tileOf(t);
  return w.units.filter((u) => {
    if (u.hp <= 0 || u.hidden || !targeting.friendly(u) || attrs.statsOf(u).flags.liftoff) return false;
    if (u !== t && targeting.stealthed(u)) return false;
    const [ur, uc] = body.tileOf(u);
    return Math.abs(ur - r) + Math.abs(uc - c) <= 1;
  });
}

/**
 * An arrow goes off (敌能-145): arts skill damage of its 倍率 × an attack — 凋零骑士's now while it is on the field, else the
 * one noted at the shot, with no source (敌能-76) — on the carrier, and as 溅射 on the others in the cross. With the
 * content, as the abilities' hits are. @param {World} w @param {Unit} u @param {Buff} b @param {import('@aue/sim').Content} [c]
 */
function burst(w, u, b, c) {
  if (u.hp <= 0) return;
  const src = w.units.find((x) => x.id === b.src) ?? null;
  const amount = b.value * (src ? attrs.statsOf(src).atk : b.n);
  for (const v of blastArea(w, u)) {
    damage.dealDamage(w, src, v, { type: 'arts', amount, isAttack: false, isSkill: true, ...(v === u ? {} : { isSplash: true }) }, c);
  }
}

/**
 * The rage (敌能-145): a partner it saw on the field left since its last turn — knocked down, a fall included, or at its
 * goal (敌能-63's log) —, then the partners on the field now are noted. Once raised it is kept: taken away, it is back the
 * next turn. One buff, however many partners leave. Not silenceable. @param {FoeContext} ctx
 */
function rage(ctx) {
  const bb = /** @type {Record<string, unknown>} */ (ctx.bb), st = ctx.state;
  if (!rageShape(bb)) return;
  for (const d of ctx.departed()) if (st.get(`mate${d.id}`) === 1) st.set('raged', 1);
  for (const u of ctx.enemies()) if (u.key === bb.partner) st.set(`mate${u.id}`, 1);
  if (st.get('raged') !== 1 || ctx.self.buffs.some((x) => x.key === RAGE)) return;
  ctx.addBuff(ctx.self, { key: RAGE, mods: { atkPct: ctx.bb.atk, aspd: ctx.bb.attack_speed, movePct: ctx.bb.move_speed } });
}

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const rotKnightBehaviors = Object.freeze({
  triggerrage: Object.freeze({ tick: rage }),
  TripleAttack: Object.freeze({ tick: shoot }),
});

/** The arrow's blast, by buff key. @type {Readonly<Record<string, import('@aue/sim').buffs.Behavior>>} */
export const rotKnightBuffs = Object.freeze({ [FUSE]: { expire: burst } });
