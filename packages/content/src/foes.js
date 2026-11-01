// Enemy abilities of the official content (docs/spec/foes.md 敌能-5…敌能-86): behaviours by talent and skill name. The
// game data holds only the multipliers; FOE_EXTRAS adds, per enemy, the parameters PRTS gives (radii, delays, bolts …)
// to the blackboards the behaviours read, or a talent the data does not have. They act only through the context (ADR 0055).

import { moreFoeBehaviors, addEnergy } from './abilities.js';
import { prisonerBehaviors } from './prisoners.js';
import { avengerBehaviors } from './avenger.js';
import { hoverBehaviors } from './hover.js';
import { summonerBehaviors } from './summoners.js';
import { partisanBehaviors } from './partisans.js';
import { elementHitBehaviors, elementHitOwns } from './elementhit.js';
import { nestBehaviors, nestPulseOwns } from './nest.js';
import { radioBehaviors, radioOwns } from './radio.js';
import { devourerBehaviors } from './devourers.js';
import { sarkazBehaviors, stackCapped } from './sarkaz.js';
import { emberBehaviors } from './embers.js';
import { blightBehaviors } from './blight.js';
import { cannonBehaviors } from './cannon.js';
import { bombdBehaviors, bombdOwns } from './bombd.js';
import { refractBehaviors } from './refract.js';
import { statueBehaviors } from './statue.js';
import { auraBehaviors } from './auras.js';
import { chargedBehaviors } from './charged.js';
import { staticBehaviors } from './static.js';
import { ballBehaviors, ballAura, ballBoom, ballBoomTick, PHYSIC_KEYS } from './ball.js';
import { pitchBehaviors, spotAura } from './pitch.js';
import { lostLifeBehaviors } from './lostlife.js';
import { bristleBehaviors, weaknessOwns } from './bristle.js';
import { crowdBehaviors } from './crowd.js';
import { boarBehaviors, boarOwns, boarRush, boarFirst, boarTick, boarSpawn, boarHit } from './boar.js';
import { flameBehaviors } from './flame.js';
import { footballerBehaviors, rebornShape, noPeriodic, KICK_SKILLS } from './footballers.js';
import { timeBehaviors } from './times.js';
import { runnerBehaviors } from './runners.js';
import { takeDmg } from './chalice.js';
import { unbalanceBehaviors } from './unbalance.js';
import { floatBehaviors, takeOffOwns } from './float.js';
import { sanktaBehaviors } from './sankta.js';
import { periodicBehaviors } from './periodic.js';
import { blockDamageBehaviors } from './blockdamage.js';
import { mirrorBehaviors } from './mirror.js';
import { lancerBehaviors, knightShape, knightRush } from './lancer.js';
import { evadeBehaviors, evadeOwns } from './evade.js';
import { carnivalBehaviors, carnivalOwns, danceAura } from './carnival.js';
import { heteroBehaviors, heteroOwns, heteroShield } from './heteroslime.js';
import { pompeiiBehaviors, pompeiiOwns } from './pompeii.js';
import { ninjaBehaviors, ninjaOwns } from './ninja.js';
import { spearBehaviors, spearOwns } from './spear.js';
import { catapultBehaviors, catapultOwns } from './catapult.js';
import { plantBehaviors, plantOwns } from './plant.js';
import { companionBehaviors, companionOwns } from './companion.js';
import { crystalBehaviors, crystalOwns } from './crystal.js';
import { chargeBehaviors, chargeOwns, chargeShape, chargeRush } from './charge.js';
import { bottleBehaviors, bottleOwns } from './firebottle.js';
import { broBehaviors, broOwns, broShield } from './bigbro.js';
import { avalancheBehaviors, avalancheOwns } from './avalanche.js';
import { crossBehaviors, crossOwns } from './crossroad.js';
import { absentBehaviors, absentOwns } from './absent.js';
import { tyrantBehaviors } from './tyrant.js';
import { pengBehaviors } from './peng.js';
import { bombardBehaviors } from './bombard.js';
import { templarBehaviors } from './templar.js';
import { wineBehaviors, wineOwns } from './wine.js';
import { whipBehaviors, whipOwns } from './whip.js';
import { seedBehaviors, bornBugsOwns } from './seeds.js';
import { mudShieldBehaviors, shieldOwns } from './mudshield.js';
import { punchBehaviors, punchOwns } from './punch.js';
import { passiveBehaviors, passiveOwns } from './passive.js';
import { monumentBehaviors } from './monuments.js';
import { defdownBehaviors, defdownOwns, acidShape } from './defdown.js';
import { knightBehaviors, knightOwns } from './knights.js';
import { lassoBehaviors } from './lasso.js';
import { blinkBehaviors, blinkOwns } from './blink.js';
import { fieldAuraBehaviors, healAuraOwns } from './fieldaura.js';
import { vampireBehaviors, vampireOwns } from './vampire.js';
import { c4Behaviors } from './c4.js';
import { glowBehaviors, chargeAttackOwns } from './glow.js';
import { helmKnightBehaviors, rebornOwns } from './helmknights.js';
import { faustBehaviors, faustOwns } from './faust.js';
import { shotbuffBehaviors, shotbuffOwns } from './pathshot.js';
import { lootBehaviors } from './loot.js';
import { candycarBehaviors, cartShape, bornCarOwns, cartTick, cartAttack } from './candycar.js';
import { rockmanBehaviors, stunAttackOwns } from './rockman.js';
import { FOE_EXTRAS } from './foe-extras.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').EnemyDef} EnemyDef */

export { FOE_EXTRAS };

/**
 * An enemy with its extras (FOE_EXTRAS) merged into its talents' and skills' blackboards.
 * @param {string} key @param {EnemyDef} def @returns {EnemyDef}
 */
export function withFoeExtras(key, def) {
  const x = FOE_EXTRAS[key];
  if (!x) return def;
  const talents = { ...def.talents };
  for (const [t, bb] of Object.entries(x.talents ?? {})) talents[t] = { ...talents[t], .../** @type {Record<string, number>} */ (bb) };
  const skills = (def.skills ?? []).map((s) => ({ ...s, bb: { ...s.bb, .../** @type {Record<string, number>} */ (x.skills?.[s.key] ?? {}) } }));
  return { ...def, talents, ...(def.skills ? { skills } : {}) };
}

/**
 * 死亡爆炸 (敌能-5): knocked down and not silenced, it explodes where it fell — with `freeze` s of cold when it has
 * them —; with `add_count`, every other enemy on the field with 能量 gains that many (敌能-13).
 * @type {FoeBehavior['death']}
 */
const deathBlast = (ctx) => {
  const s = ctx.stats(ctx.self), bb = ctx.bb;
  if (s.flags.silence) return;
  ctx.blast({
    x: ctx.self.x, y: ctx.self.y, radius: bb.radius, delay: bb.delay, air: bb.air === 1, sourced: bb.sourced === 1,
    type: bb.arts === 1 ? 'arts' : 'phys', amount: s.atk * bb.atk_scale, status: typeof bb.freeze === 'number' ? { key: 'cold', seconds: bb.freeze } : undefined,
  });
  if (typeof bb.add_count === 'number') for (const u of ctx.allies(Infinity)) if (u !== ctx.self) addEnergy(ctx, u, bb.add_count);
};

/**
 * 冰爆源石虫's death blast (敌能-5), and the candy cart's blocked explosion (敌能-82). The cart's three
 * `attack@s2mode_*` numbers never take the death blast; a death blast's tick and attack do nothing.
 * @type {FoeBehavior}
 */
const boom = Object.freeze({
  death: (ctx) => { if (!cartShape(ctx.bb) && !ballBoom(ctx.bb)) deathBlast(ctx); },
  tick: (ctx) => { if (cartShape(ctx.bb)) cartTick(ctx); else if (ballBoom(ctx.bb)) ballBoomTick(ctx); },
  attack: (ctx, mods) => (cartShape(ctx.bb) ? cartAttack(ctx, mods) : mods),
});

/**
 * 新手祭司学徒 (敌能-58): a `Boom` blackboard with `heal_scale` heals other enemies where it fell, on that frame.
 * The page gives no delay, and 敌能-3's blast would damage 我方, so this is `heal`, not `blast`. FillWater is another talent.
 * @type {FoeBehavior['death']}
 */
const deathHeal = (ctx) => {
  const s = ctx.stats(ctx.self);
  if (s.flags.silence) return;
  const r = ctx.bb.projectile_range, amt = s.atk * ctx.bb.heal_scale;
  for (const u of ctx.allies(r)) if (u !== ctx.self) ctx.heal(u, amt);
};

/**
 * "喷射罐", 辐能源石虫 (敌能-5, 敌能-6), and 新手祭司学徒 (敌能-58): `heal_scale` is the death heal; every other shape
 * keeps the explosion. With `attack@times` (喷射罐's), its attack is a channel of hits over seconds, then a cooldown.
 * @type {FoeBehavior}
 */
const Boom = Object.freeze({
  death: (ctx) => (typeof ctx.bb.heal_scale === 'number' ? deathHeal(ctx) : deathBlast(ctx)),
  attack: (ctx, mods) => (typeof ctx.bb['attack@times'] !== 'number' ? mods
    : { ...mods, type: 'arts', scale: ctx.bb.atk_scale, channel: { hits: ctx.bb['attack@times'], duration: ctx.bb['attack@cooldown'], after: ctx.bb['attack@attack_cd'] } }),
});

/** Whether a `FirstAttack` blackboard is "投石机"'s (敌能-7). @param {Record<string, unknown>} bb */
const throwShape = (bb) => typeof bb['attack@first_atk_scale'] === 'number';

/**
 * "投石机" (敌能-7): the first attack reaches its attack radius, as arts with a cross splash; then melee only. 凶豕兽's
 * shape is its charge's extra hit (敌能-92, boar.js).
 * @type {FoeBehavior}
 */
const FirstAttack = Object.freeze({
  targets: (ctx, cands) => (!throwShape(ctx.bb) || ctx.state.get('thrown') ? cands : [...new Set([...cands, ...ctx.foes(ctx.self.base.rangeRadius + 0.25)])]),
  attack: (ctx, mods) => {
    if (!throwShape(ctx.bb) || ctx.state.get('thrown')) return mods;
    ctx.state.set('thrown', 1);
    return { ...mods, type: 'arts', scale: ctx.bb['attack@first_atk_scale'], cross: true };
  },
  hit: (ctx, target) => { if (boarFirst(ctx.bb) && boarRush(ctx.talent('Rush') ?? {})) boarHit(ctx, target); },
});

/** `rush` by its shape (敌能-53, 敌能-112): 神勇的帕拉杜利斯's charge, else 萨卡兹穿刺手's speed-up. @type {FoeBehavior} */
const rush = Object.freeze({
  targets: (ctx, cands) => (chargeShape(ctx.bb) ? chargeRush.targets?.(ctx, cands) ?? cands : cands),
  tick: (ctx) => { if (chargeShape(ctx.bb)) chargeRush.tick?.(ctx); else lancerBehaviors.rush.tick?.(ctx); },
  hit: (ctx, target, dealt, ranged) => { if (!chargeShape(ctx.bb)) lancerBehaviors.rush.hit?.(ctx, target, dealt, ranged); },
});

/** `Rush` by its shape (敌能-19, 敌能-92, 敌能-95): 凶豕兽's charge, 赏金猎人“骑士”'s speed-up, else 冲锋. @type {FoeBehavior} */
const Rush = Object.freeze({
  spawn: (ctx) => { if (boarRush(ctx.bb)) boarSpawn(ctx); },
  tick: (ctx) => {
    if (boarRush(ctx.bb)) boarTick(ctx);
    else if (knightShape(ctx.bb)) knightRush.tick?.(ctx);
    else avengerBehaviors.Rush.tick?.(ctx);
  },
  hit: (ctx, target, dealt, ranged) => { if (knightShape(ctx.bb)) knightRush.hit?.(ctx, target, dealt, ranged); },
});

/** The 倍率 on a frozen target an `atkup` blackboard gives (敌能-27), or undefined. @param {Record<string, number>} bb */
const frozenScale = (bb) => Object.entries(bb).find(([k]) => k === 'atk_scale' || k.endsWith('[frozen].atk_scale'))?.[1];

/**
 * 低血强化 (敌能-8): ATK up — by its `atk`, else by `AtkUp`'s — while its HP is below half its maximum, or with
 * `hp_ratio` at most that share of it. With an `atk_scale` instead (敌能-27): its attack's 倍率 × that on a target
 * 冻结 as the hit is worked out.
 * @type {FoeBehavior}
 */
const atkup = Object.freeze({
  attack: (ctx, mods) => {
    const k = frozenScale(ctx.bb);
    return k === undefined ? mods : { ...mods, frozen: k };
  },
  tick: (ctx) => {
    if (frozenScale(ctx.bb) !== undefined) return;
    const max = ctx.stats(ctx.self).maxHp, hp = ctx.self.hp, ratio = ctx.bb.hp_ratio;
    const low = ratio === undefined ? hp < max * 0.5 : hp <= max * ratio, has = ctx.self.buffs.some((b) => b.key === 'atkup');
    if (low && !has) ctx.addBuff(ctx.self, { key: 'atkup', mods: { atkPct: ctx.bb.atk ?? ctx.talent('AtkUp')?.atk ?? 0 } });
    else if (!low && has) ctx.removeBuff(ctx.self, 'atkup');
  },
});

/**
 * 帝国前锋精锐's attack while unblocked (敌能-8): ground units within its attack radius at `scale` of its attack; among
 * the most taunting, neutral units first.
 * @type {FoeBehavior}
 */
const ranged = Object.freeze({
  targets: (ctx, cands) => {
    if (ctx.blocked) return cands;
    const near = ctx.foes(ctx.self.base.rangeRadius + 0.25).filter((u) => !ctx.stats(u).flying);
    const top = Math.max(...near.map((u) => ctx.stats(u).taunt)), tied = near.filter((u) => ctx.stats(u).taunt === top);
    return tied.some((u) => u.base.neutral) ? tied.filter((u) => u.base.neutral) : near;
  },
  attack: (ctx, mods) => (ctx.blocked ? mods : { ...mods, scale: mods.scale * ctx.bb.scale, ...(ctx.bb.square ? { square: true } : {}) }),
});

/** A direction along a row or column from the enemy to a unit in line. @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
const toward = (a, b) => (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { dx: Math.sign(b.x - a.x), dy: 0 } : { dx: 0, dy: Math.sign(b.y - a.y) });

/**
 * 直击 (敌能-9): unblocked, able to act, not silenced, cooldown over and someone in line — the bolts at once, or after a
 * charge while it stands for the skill's duration; 隐匿 while unblocked and not in the skill when it has the talent.
 * @type {FoeBehavior}
 */
const CrossAttack = Object.freeze({
  tick: (ctx) => {
    const st = ctx.state;
    if (st.get('busy') > 0) st.set('busy', st.get('busy') - 1);
    if (st.get('charge') > 0) {
      st.set('charge', st.get('charge') - 1);
      if (st.get('charge') === 0) crossFire(ctx);
    } else crossStart(ctx);
    if (ctx.bb.hide === 1) crossHide(ctx);
  },
});

/** 直击's bolts (敌能-9): `bolts` of them in the chosen direction. @param {import('@aue/sim').FoeContext} ctx */
function crossFire(ctx) {
  const bb = ctx.bb, st = ctx.state, atk = ctx.stats(ctx.self).atk;
  for (let i = 0; i < bb.bolts; i++) {
    ctx.bolt({ dx: st.get('dx'), dy: st.get('dy'), type: bb.arts === 1 ? 'arts' : 'phys', amount: atk * (bb.atk_scale ?? 1), ...(bb.stun ? { status: { key: 'stun', seconds: bb.stun } } : {}) });
  }
}

/** 直击 starting (敌能-9): ready, unblocked, able to act, not silenced, someone in line. @param {import('@aue/sim').FoeContext} ctx */
function crossStart(ctx) {
  const bb = ctx.bb, s = ctx.stats(ctx.self), [t] = ctx.inLine();
  if (!ctx.ready || ctx.blocked || s.disabled || s.flags.silence || !t) return;
  const d = toward(ctx.self, t);
  ctx.state.set('dx', d.dx); ctx.state.set('dy', d.dy);
  ctx.use();
  ctx.state.set('busy', ctx.frames(bb.hold));
  if (bb.hold > 0) ctx.applyStatus(ctx.self, 'root', { seconds: bb.hold });
  if (bb.charge > 0) ctx.state.set('charge', ctx.frames(bb.charge));
  else crossFire(ctx);
}

/** 隐匿 (敌能-9): hidden while unblocked and not in the skill. @param {import('@aue/sim').FoeContext} ctx */
function crossHide(ctx) {
  const hidden = ctx.self.buffs.some((b) => b.key === 'hide'), hide = !ctx.blocked && ctx.state.get('busy') === 0;
  if (hide && !hidden) ctx.addBuff(ctx.self, { key: 'hide', flags: { stealth: true } });
  else if (!hide && hidden) ctx.removeBuff(ctx.self, 'hide');
}

/** 掷弹 (敌能-10): once, hurt while unblocked and not silenced — four bomb bolts, then faster and lighter. @type {FoeBehavior} */
const Bomb = Object.freeze({
  tick: (ctx) => {
    const s = ctx.stats(ctx.self);
    if (ctx.state.get('done') || !ctx.hurt || ctx.blocked || s.flags.silence) return;
    ctx.state.set('done', 1);
    for (const [dx, dy] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) ctx.bolt({ dx, dy, type: 'phys', amount: s.atk * ctx.bb.atk_scale, blast: ctx.bb.projectile_range });
    const light = ctx.talent('Light') ?? {};
    ctx.addBuff(ctx.self, { key: 'light', mods: { moveFlat: light.move_speed ?? 0, massFlat: light.mass_level ?? 0 } });
  },
});

/** 强击 (敌能-11): a mark when it appears and whenever its block ends; the next attack with the mark is stronger. @type {FoeBehavior} */
const PowerHit = Object.freeze({
  spawn: (ctx) => { ctx.state.set('mark', 1); },
  tick: (ctx) => { if (ctx.unblocked) ctx.state.set('mark', 1); },
  attack: (ctx, mods) => {
    if (!ctx.state.get('mark')) return mods;
    ctx.state.set('mark', 0);
    return { ...mods, atkPct: (mods.atkPct ?? 0) + ctx.bb.atk };
  },
});

/** Behaviours by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const foeBehaviors = Object.freeze({
  boom, Boom, FirstAttack, atkup, ranged, CrossAttack, Bomb, PowerHit, ...moreFoeBehaviors, ...prisonerBehaviors, ...avengerBehaviors, ...hoverBehaviors,
  ...summonerBehaviors, ...partisanBehaviors, ...sarkazBehaviors, ...elementHitBehaviors, ...devourerBehaviors, ...refractBehaviors, ...statueBehaviors, ...auraBehaviors, ...chargedBehaviors, ...staticBehaviors, ...timeBehaviors, ...runnerBehaviors, takeDmg, ...unbalanceBehaviors,
  ...emberBehaviors,
  ...blightBehaviors,
  ...nestBehaviors,
  ...floatBehaviors,
  ...sanktaBehaviors,
  ...periodicBehaviors,
  ...blockDamageBehaviors,
  ...mirrorBehaviors,
  ...lancerBehaviors,
  ...tyrantBehaviors,
  ...c4Behaviors,
  ...glowBehaviors,
  ...helmKnightBehaviors,
  ...bombdBehaviors,
  ...ballBehaviors,
  ...footballerBehaviors,
  ...pitchBehaviors,
  ...lostLifeBehaviors,
  ...bristleBehaviors,
  ...crowdBehaviors,
  ...boarBehaviors,
  ...flameBehaviors,
  Rush,
  ...pengBehaviors,
  ...bombardBehaviors,
  ...cannonBehaviors,
  ...templarBehaviors,
  ...wineBehaviors,
  ...whipBehaviors,
  ...seedBehaviors,
  ...radioBehaviors,
  ...mudShieldBehaviors,
  ...punchBehaviors,
  ...passiveBehaviors,
  ...monumentBehaviors,
  ...defdownBehaviors,
  ...knightBehaviors,
  ...lassoBehaviors,
  ...blinkBehaviors,
  ...fieldAuraBehaviors,
  ...vampireBehaviors,
  ...faustBehaviors,
  ...shotbuffBehaviors,
  ...lootBehaviors,
  ...candycarBehaviors,
  ...rockmanBehaviors,
  ...evadeBehaviors,
  ...carnivalBehaviors,
  ...heteroBehaviors,
  ...pompeiiBehaviors,
  ...ninjaBehaviors,
  ...spearBehaviors,
  ...catapultBehaviors,
  ...plantBehaviors,
  ...companionBehaviors,
  ...crystalBehaviors,
  ...chargeBehaviors,
  ...bottleBehaviors,
  ...broBehaviors,
  ...avalancheBehaviors,
  ...crossBehaviors,
  ...absentBehaviors,
  rush,
});

/**
 * Talents with no behaviour of their own that are still covered (关卡-2): `dead` is the data's 生命 loss of a neutral
 * unit (合作-9), `Light` is read by `Bomb`, `DmgUp` acts only on devices the engine does not have (敌能-11), `Stronger` is
 * read by `Devour` (敌能-30), `storm` acts only in a 沙尘暴 the engine's levels do not have (敌能-24), `firstattack` is read by
 * 萨卡兹穿刺手's `rush` (敌能-53), `AttributeStorage` and `SkillTrigger` are read by `ForeverEnhance` (敌能-61; the excerpt
 * lists no other user), a player's `searchBall` and its skills `passtheball`, `slapshot` and `clearance` are read by
 * `football` (足球-9, 足球-10).
 */
export const FOE_COVERED = Object.freeze(['dead', 'Light', 'DmgUp', 'Stronger', 'storm', 'firstattack', 'AttributeStorage', 'SkillTrigger', 'searchBall', ...KICK_SKILLS,
  // 温顺的武装大驮兽: it acts only on a 稳固锁链, which only a 接驳地块 brings; the engine has neither (敌能-88)
  'RopeTriggerAbility']);

/**
 * The blackboard keys an ability's behaviour needs that the data tables do not carry (FOE_EXTRAS gives them, from PRTS,
 * enemy by enemy): an enemy whose ability lacks one has no behaviour for it yet (关卡-2).
 */
export const FOE_NEEDS = Object.freeze({
  boom: Object.freeze(['radius', 'delay']), Boom: Object.freeze(['radius', 'delay']), ranged: Object.freeze(['scale']),
  DeadBoom: Object.freeze(['radius', 'delay']), Splash: Object.freeze(['radius']),
  // Expose is complete either way: a radius is 远眺's death aura, none is the scouts (敌能-54). A def-only defup is not 御4 (敌能-35).
  defup: Object.freeze(['range_radius']),
  CrossAttack: Object.freeze(['bolts', 'hold', 'charge']), Targets: Object.freeze(['n']),
  // 尝尝这个！'s radius is only on the page (敌能-62). Talent `1`'s shape is wineOwns, not a key list: ammo and carry differ.
  BlockedBoom: Object.freeze(['radius']),
  // The element is not in the enemy data (敌能-38). A ratio without `el` stays incomplete instead of guessing 凋亡.
  epdamage: Object.freeze(['el']), empty: Object.freeze(['el']), EpDamage: Object.freeze(['el']),
  combat: Object.freeze(['el']), attack: Object.freeze(['el']),
  AttackSpeedUp: Object.freeze(['attack_speed', 'duration', 'stack_cnt']),
  // air/open are the page's 可对空 and 无视无法选择: a warrior without them is not this ability yet. The 战车 skill's
  // page rules are extras too, but an unread enemy with the same keys (改装排污车) is complete from the data alone.
  PollutedDie: Object.freeze(['polluted_damage_low', 'polluted_damage_high', 'projectile_life_time', 'projectile_range', 'air', 'open']),
  PollutedRangedAtk: Object.freeze(['polluted_damage_low', 'polluted_damage_high', 'range_radius', 'projectile_life_time']),
  Bleeding: Object.freeze(['attack@bleeding_damage', 'attack@duration']),
  // 喷气人's 升空 (敌能-48). Another TakeOff blackboard stays incomplete (takeOffOwns).
  TakeOff: Object.freeze(['duration', 'balloon_s[fly].move_speed']),
  SelfFear: Object.freeze(['hp_ratio', 'speed_final']), DamageOrBullet: Object.freeze(['steal']), Roar: Object.freeze(['air', 'camou']),
  periodic_damage: Object.freeze(['self']),
  // 足球-2: a ball's physics, all four from the data.
  physic: PHYSIC_KEYS,
  Weaken: Object.freeze(['duration', 'atk']), SummonFireBall: Object.freeze(['cnt']), SummonFireBall2: Object.freeze(['cnt']), QuillSpray: Object.freeze(['hp_ratio', 'atk_scale', 'range_radius']),
  damage_trigger: Object.freeze(['hp_ratio']), Stab: Object.freeze(['atk_scale', 'ep_damage_ratio']),
  rage: Object.freeze(['hp_ratio', 'atk', 'def', 'rage_duration']), airleakage: Object.freeze(['value', 'kick_times']), airinflation: Object.freeze(['value', 'kick_times']), passiveMarkTarget: Object.freeze(['move_speed', 'duration', 'cooldown']),
  Shield: Object.freeze(['max_block_damage_cnt', 'block_damage_cnt']),
  def_reduce: Object.freeze(['gate']),
  rush: Object.freeze(['dlancer_t[trigger].move_speed', 'dlancer_t[trigger].interval', 'dlancer_t[trigger].trig_cnt', 'paged']),
  firstattack: Object.freeze(['atk_scale', 'paged']),
  AOEAttack: Object.freeze(['once']),
  // `egg` is the page marker for the two read 羽兽; `move_speed` is the shape 斐迪庇第斯 does not have (敌能-57, 关卡-2).
  switch: Object.freeze(['egg']), speed: Object.freeze(['move_speed']),
  Cannon: Object.freeze(['duration', 'interval', 'times']),
  // `zone` is the page's burn radius. The data's projectile_range is the splash, so a same-shape enemy without the
  // page stays uncovered (关卡-2).
  ProjectileBoomRange: Object.freeze(['attack@projectile_range', 'attack@projectile_life_time', 'attack@value', 'zone']),
  ForeverEnhance: Object.freeze(['ammo']),
  // 泥岩小队践行者的法术屏障只覆盖读过页面的两名（敌能-66）。同形的覆面大锤客、泥岩没有这个标记。
  shield: Object.freeze(['page']),
  // The 0.8 is on the two read pages only. 神拳机甲's Punch has the same data keys and stays incomplete (敌能-67).
  Punch: Object.freeze(['radius']),
  // 碎骨's grenade. A flat `def` (−10 / −15) has none of these, so those enemies stay uncovered (敌能-70).
  defdown: Object.freeze(['scale', 'duration', 'square']),
  // 枷锁 is read only where the page was read. The same three numbers on 萨卡兹业余术师 have no `page` (敌能-72, 关卡-2).
  lasso: Object.freeze(['page']),
  // 梅菲斯特's page marker. 荷谟伊英雄 and 歌者 share the talent name and do not have it (敌能-74).
  healaura: Object.freeze(['field']),
  // 吸血 needs the page marker (敌能-75). The heal ratio is already in the enemy data; 虹吸巨刃 has it and no marker.
  vampire: Object.freeze(['page']),
  // The 3.2 s cast is the page's, not the enemy data (敌能-76). Without it the skill stays uncovered.
  C4: Object.freeze(['atk_scale', 'range_radius', 'cast']),
  // 点灯骑士 has the same three numbers and no saved page (敌能-77).
  ChargeAttack: Object.freeze(['page']),
  // The page marker of the three read 锋盔 pages (敌能-78). The rest of the shape is rebornOwns.
  reborn: Object.freeze(['page']),
  // 出场无敌的页面标记（敌能-79）。「寒灾」有 duration，没有 page。致命一击的伤害类型同样只在页面上。
  invincible: Object.freeze(['page']), CriticalHit: Object.freeze(['arts']),
  // The read shotbuff pages (敌能-81). Ammunition is not required: 甜品商 has the marker and no rounds.
  shotbuff: Object.freeze(['page']),
  // 眩晕击 (敌能-83). The data already has atk_scale and stun; `page` marks this page. 配重投石机 has no page, so no marker.
  StunAttack: Object.freeze(['page']),
  // 沸血的标记在这里（敌能-71）。`buff` 的两种形状各带自己的标记，由 knightOwns 认（敌能-71 的 page、敌能-85 的 zeal）。
  enhance: Object.freeze(['page']),
});

/**
 * An enemy's abilities by name with their blackboards (its talents', its skills').
 * @param {EnemyDef} e @returns {[string, Record<string, number | string>][]}
 */
const abilitiesOf = (e) => [...Object.entries(e.talents ?? {}), ...(e.skills ?? []).map((s) => /** @type {[string, Record<string, number | string>]} */ ([s.key, s.bb ?? {}]))];

/**
 * A `Boom` with `heal_scale` is 新手祭司学徒's death heal (敌能-58): it needs the page marker `page`, not the blast's
 * radius and delay. @param {string} k @param {Record<string, unknown>} bb
 */
const healBoom = (k, bb) => k === 'Boom' && typeof bb.heal_scale === 'number';

/** The candy cart's `boom` shape (敌能-82). @param {string} k @param {Record<string, unknown>} bb */
const cartBoom = (k, bb) => k === 'boom' && cartShape(bb);

/**
 * The shape checks of the shared names (关卡-2): each says whether a blackboard of its names is the shape its behaviour
 * understands, and passes every other name. In a list, so that each family adds one entry, not one more `&&`.
 */
const SHAPE_OWNERS = Object.freeze([rebornShape, boarOwns, elementHitOwns, takeOffOwns, wineOwns, whipOwns, bornBugsOwns, radioOwns, shieldOwns, punchOwns, passiveOwns, defdownOwns, knightOwns, blinkOwns, healAuraOwns, vampireOwns, chargeAttackOwns, rebornOwns, faustOwns, shotbuffOwns, bornCarOwns, stunAttackOwns, bombdOwns, evadeOwns, carnivalOwns, heteroOwns, pompeiiOwns, ninjaOwns, spearOwns, catapultOwns, plantOwns, companionOwns, crystalOwns, chargeOwns, bottleOwns, broOwns, avalancheOwns, crossOwns, absentOwns, weaknessOwns]);

/** Shapes whole in themselves, whatever FOE_NEEDS lists for their name (关卡-2). @type {readonly ((k: string, bb: Record<string, unknown>) => boolean)[]} */
const WHOLE_SHAPES = Object.freeze([nestPulseOwns, cartBoom, noPeriodic, (k, bb) => k === 'boom' && ballBoom(bb), (k, bb) => k === 'Shield' && heteroShield(bb), (k, bb) => k === 'defdown' && acidShape(bb),
  (k, bb) => k === 'rush' && chargeShape(bb), (k, bb) => k === 'Shield' && broShield(bb)]);

/** FOE_NEEDS's keys all numbers, a `Boom` with `heal_scale` its page marker (敌能-58). @param {string} k @param {Record<string, unknown>} bb */
const needsMet = (k, bb) => (healBoom(k, bb) ? typeof bb.page === 'number' : (FOE_NEEDS[/** @type {keyof typeof FOE_NEEDS} */ (k)] ?? []).every((n) => typeof bb[n] === 'number'));

/**
 * Whether an ability has what its behaviour needs (关卡-2). A shared talent name only counts when its blackboard is the
 * shape that behaviour understands (敌能-38, 敌能-47, 敌能-63, 敌能-65, 敌能-66, 敌能-67, 敌能-68, 敌能-70, 敌能-71, 敌能-73, 敌能-74, 敌能-75, 敌能-77, 敌能-78, 敌能-79, 敌能-81, 敌能-82, 敌能-83, 敌能-85, 敌能-86, 敌能-118) — an `aura` only with 敌能-28's stack cap (敌能-45), as a ball's (足球-2) or a 守门位's (足球-13); anything else
 * stays incomplete. The nest pulse does not need `el`: the page names 神经损伤. A `Boom` with `heal_scale` needs its page
 * marker (敌能-58). The candy cart's `boom` needs no death-blast radius or delay (敌能-82). A ball's `boom` (足球-16),
 * 异质源石虫's `Shield` (敌能-102) and 酸液源石虫's `defdown` (敌能-101) are whole by their shapes.
 * @param {string} k @param {Record<string, unknown>} bb
 */
const complete = (k, bb) => SHAPE_OWNERS.every((own) => own(k, bb))
  && (k !== 'aura' || stackCapped(bb) || ballAura(bb) || spotAura(bb) || danceAura(bb))
  && (WHOLE_SHAPES.some((f) => f(k, bb)) || needsMet(k, bb));

/**
 * The abilities (talents and skills) of the given enemies — their extras merged — that have no behaviour and are not
 * covered otherwise, or whose behaviour lacks values it needs (FOE_NEEDS) (关卡-2), in order of first appearance.
 * @param {Iterable<EnemyDef>} enemies @returns {string[]}
 */
export function uncoveredAbilities(enemies) {
  const out = new Set();
  for (const e of enemies) {
    for (const [k, bb] of abilitiesOf(e)) if ((!Object.hasOwn(foeBehaviors, k) && !FOE_COVERED.includes(k)) || !complete(k, bb)) out.add(k);
  }
  return [...out];
}

/**
 * An enemy without the abilities whose behaviour lacks values it needs (FOE_NEEDS): in a level being tested they do not
 * act (关卡-8). @param {EnemyDef} e @returns {EnemyDef}
 */
export function withoutIncomplete(e) {
  const talents = Object.entries(e.talents ?? {}).filter(([k, bb]) => complete(k, bb)), skills = (e.skills ?? []).filter((s) => complete(s.key, s.bb ?? {}));
  if (talents.length === Object.keys(e.talents ?? {}).length && skills.length === (e.skills ?? []).length) return e;
  return { ...e, ...(e.talents ? { talents: Object.fromEntries(talents) } : {}), ...(e.skills ? { skills } : {}) };
}
