// One talent name `Passive` (docs/spec/foes.md 敌能-63, 敌能-68; cup.md 锦标-2). 血珀's seed shape, R-11's armor shape
// and 龙卷风's wind share this object: a second behaviour under the same name would replace one of them. Any other blackboard stays uncovered
// (关卡-2) and these hooks do nothing with it. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').skills.AttackMods} AttackMods */

/** 血珀. `damage_resistance` must be 0: a non-zero pair would be 庇护, which this does not implement. */
const SEED_KEYS = new Set(['damage_resistance', 'hp_ratio']);
/** 龙卷风 (锦标-2): the radius of its wind alone. */
const WIND_KEYS = new Set(['radius']);
/** 龙卷风 (锦标-2): 无敌, 失衡免疫, it neither attacks nor is blocked. */
const WIND_FLAGS = Object.freeze({ invincible: true, noDisplace: true, noAttack: true, unblockable: true });
/** The buff of an enemy in a 龙卷风's wind (锦标-2): 浮空 while it stays inside. */
const WIND = 'wind';
/** R-11 / R-11a. `targets` is the page's cap (FOE_EXTRAS); 神射机甲 has the scale and not the cap. */
const ARMOR_KEYS = new Set(['attack@ranged.atk_scale', 'targets']);
/**
 * 血珀 (敌能-63). `root` is the immobility flag, not the 束缚 status: 自缚 is not identified as 束缚.
 * `noDisplace` is 失衡免疫 (位移-1). 庇护 0% writes no taken-multiplier.
 */
const SEED_FLAGS = Object.freeze({ root: true, noAttack: true, unblockable: true, noDisplace: true });

/** @param {Record<string, unknown>} bb @param {ReadonlySet<string>} keys */
function exactKeys(bb, keys) {
  const got = Object.keys(bb);
  if (got.length !== keys.size) return false;
  for (const k of got) if (!keys.has(k)) return false;
  return true;
}

/** @param {unknown} n */
const num = (n) => typeof n === 'number';

/** @param {FoeContext} ctx */
const bbOf = (ctx) => /** @type {Record<string, unknown>} */ (ctx.bb);

/** @param {Record<string, unknown>} bb */
function seedShape(bb) {
  if (!exactKeys(bb, SEED_KEYS) || bb.damage_resistance !== 0 || !num(bb.hp_ratio)) return false;
  return true;
}

/** The scale plus the page's target cap, both numbers, and nothing else (敌能-68). @param {Record<string, unknown>} bb */
function armorShape(bb) {
  if (!exactKeys(bb, ARMOR_KEYS)) return false;
  return num(bb['attack@ranged.atk_scale']) && num(bb.targets);
}

/** 龙卷风's wind: the radius, a number, and nothing else (锦标-2). @param {Record<string, unknown>} bb */
const windShape = (bb) => exactKeys(bb, WIND_KEYS) && num(bb.radius);

/**
 * Whether a talent of this name, with this blackboard, is one of the shapes this object implements. Any other name
 * is not this object's concern: the caller still asks the other owners. Exactly one owner of `Passive` (敌能-63, 敌能-68).
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function passiveOwns(name, bb) {
  if (name !== 'Passive') return true;
  return seedShape(bb) || armorShape(bb) || windShape(bb);
}

/** 血珀: the four flags at once, then 10% of max HP as 生命流失 every second, the first a second after it appears. @param {FoeContext} ctx */
function seedSpawn(ctx) {
  if (windShape(bbOf(ctx))) ctx.addBuff(ctx.self, { key: 'tornado', flags: { ...WIND_FLAGS } });
  if (!seedShape(bbOf(ctx))) return;
  ctx.addBuff(ctx.self, { key: 'dseed', flags: { ...SEED_FLAGS } });
  ctx.state.set('due', ctx.frame + ctx.frames(1));
}

/**
 * 龙卷风's wind (锦标-2): every other enemy within `radius` of it is 浮空 while it stays inside — renewed each frame,
 * so it ends once the enemy is out or the wind is gone —, unless it flies or is immune to 浮空. @param {FoeContext} ctx
 */
function windTick(ctx) {
  const self = ctx.self, r = /** @type {number} */ (bbOf(ctx).radius), tag = String(self.id);
  for (const u of ctx.enemies()) {
    if (u === self) continue;
    ctx.removeBuff(u, WIND, tag);
    const dx = u.x - self.x, dy = u.y - self.y, s = ctx.stats(u), immune = s.flags['immune:levitate'] || (u.base.immune ?? []).includes('levitate');
    if (u.hp > 0 && dx * dx + dy * dy <= r * r && !s.flying && !immune) ctx.addBuff(u, { key: WIND, tag, left: 2, flags: { levitate: true } });
  }
}

/** @param {FoeContext} ctx */
function seedTick(ctx) {
  const bb = bbOf(ctx);
  if (windShape(bb)) { windTick(ctx); return; }
  if (!seedShape(bb)) return;
  const due = ctx.state.get('due');
  if (ctx.frame < due) return;
  const self = ctx.self;
  ctx.dealDamage(self, { type: 'true', amount: ctx.stats(self).maxHp * /** @type {number} */ (bb.hp_ratio), hpLoss: true });
  ctx.state.set('due', due + ctx.frames(1));
}

/**
 * Blocked, the melee is the blocker alone (敌能-68). Empty when that unit is no longer a candidate — `noFly` may have
 * dropped a flying blocker — so the hit is not handed to someone else in range.
 * @param {FoeContext} ctx @param {Unit[]} cands @returns {Unit[]}
 */
function armorTargets(ctx, cands) {
  if (!armorShape(bbOf(ctx)) || !ctx.blocked) return cands;
  const b = ctx.blocker();
  return b && cands.includes(b) ? [b] : [];
}

/**
 * Blocked: a melee hit at ×1, no projectile. Unblocked: up to `targets` shots, the scale multiplied in, the same
 * reading as 鞭笞者's `attack@ranged_atk_scale` (敌能-63, 敌能-68).
 * @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods}
 */
function armorAttack(ctx, mods) {
  const bb = bbOf(ctx);
  if (!armorShape(bb)) return mods;
  if (ctx.blocked) return { ...mods, direct: true, targets: 1 };
  const scale = /** @type {number} */ (bb['attack@ranged.atk_scale']);
  return { ...mods, targets: /** @type {number} */ (bb.targets), scale: mods.scale * scale };
}

/** 血珀's drain, R-11's two attacks and 龙卷风's wind. The shape each hook reads decides which one runs. @type {FoeBehavior} */
const Passive = Object.freeze({
  spawn: seedSpawn,
  tick: seedTick,
  targets: armorTargets,
  attack: armorAttack,
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const passiveBehaviors = Object.freeze({ Passive });
