// 萨卡兹骸骨鞭笞者 / 拷打者, the 血珀 they leave, and 新生血裔's share of that summon (docs/spec/foes.md 敌能-63).
// `Attack`, `Summon` and `Passive` are shared names. Only the blackboards below are this family; any other shape
// stays uncovered (关卡-2) and these hooks do nothing with it. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */

/** 鞭笞者 / 拷打者 `Attack`: the half-strength shot and the leave aura. `range_radius` is the aura, not the shot. */
const ATTACK_KEYS = new Set(['attack@ranged_atk_scale', 'range_radius', 'hp_ratio', 'atk', 'max_stack_cnt']);
/** A death summon of only a count and a key. 骸骨卫士 adds `attack_speed` and `duration` and is not this. */
const SUMMON_KEYS = new Set(['cnt', 'enemy_key']);
/** 血珀. `damage_resistance` must be 0: a non-zero pair would be 庇护, which this does not implement. */
const SEED_KEYS = new Set(['damage_resistance', 'hp_ratio']);

/** One permanent 直接乘算 layer (属性-1 ③). Stacks sum, so n layers are ×(1 + atk·n), not 1.1ⁿ. */
const WHIP_ATK = 'whipAtk';
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

/** @param {Record<string, unknown>} bb */
function attackShape(bb) {
  if (!exactKeys(bb, ATTACK_KEYS)) return false;
  for (const k of ATTACK_KEYS) if (!num(bb[k])) return false;
  return true;
}

/** @param {Record<string, unknown>} bb */
function summonShape(bb) {
  if (!exactKeys(bb, SUMMON_KEYS) || !num(bb.cnt)) return false;
  return typeof bb.enemy_key === 'string' && bb.enemy_key !== '';
}

/** @param {Record<string, unknown>} bb */
function seedShape(bb) {
  if (!exactKeys(bb, SEED_KEYS) || bb.damage_resistance !== 0 || !num(bb.hp_ratio)) return false;
  return true;
}

/**
 * Whether a talent of this name, with this blackboard, is this family (敌能-63). Any other name is not this family's
 * concern: the caller still asks the other owners.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function whipOwns(name, bb) {
  if (name === 'Attack') return attackShape(bb);
  if (name === 'Summon') return summonShape(bb);
  if (name === 'Passive') return seedShape(bb);
  return true;
}

/** @param {FoeContext} ctx */
const bbOf = (ctx) => /** @type {Record<string, unknown>} */ (ctx.bb);

/**
 * Centres, no collider padding (敌能-63). The attack's +0.25 belongs to 敌人攻击-1, not to this aura.
 * @param {number} ax @param {number} ay @param {number} bx @param {number} by @param {number} r
 */
function near(ax, ay, bx, by, r) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy <= r * r;
}

/** One heal and one layer per leaver inside the aura, including once the layer cap is full (敌能-63). @param {FoeContext} ctx */
function onLeave(ctx) {
  const bb = bbOf(ctx);
  if (!attackShape(bb)) return;
  const self = ctx.self;
  const radius = /** @type {number} */ (bb.range_radius);
  const heal = ctx.stats(self).maxHp * /** @type {number} */ (bb.hp_ratio);
  const cap = /** @type {number} */ (bb.max_stack_cnt);
  const atk = /** @type {number} */ (bb.atk);
  for (const u of ctx.departed()) {
    if (u.id === self.id || !near(u.x, u.y, self.x, self.y, radius)) continue;
    ctx.heal(self, heal);
    ctx.addBuff(self, { key: WHIP_ATK, rule: 'stack', stacks: 1, maxStacks: cap, mods: { atkPct: atk } });
  }
}

/** 未被阻挡时 the shot is × `attack@ranged_atk_scale`. Blocked, the engine already hits only the blocker at ×1. */
const Attack = Object.freeze(/** @type {FoeBehavior} */ ({
  tick: (ctx) => { onLeave(ctx); },
  attack: (ctx, mods) => {
    const bb = bbOf(ctx);
    if (!attackShape(bb) || ctx.blocked) return mods;
    return { ...mods, scale: mods.scale * /** @type {number} */ (bb['attack@ranged_atk_scale']) };
  },
}));

/** Death, including a fall: `cnt` of `enemy_key` on its own route, inside the 0.2 square (敌能-22, bound 0.1). */
const Summon = Object.freeze(/** @type {FoeBehavior} */ ({
  death: (ctx) => {
    const bb = bbOf(ctx);
    if (!summonShape(bb)) return;
    ctx.summon(/** @type {string} */ (bb.enemy_key), {
      cnt: /** @type {number} */ (bb.cnt), bound: 0.1, tile: true, delay: 0,
    });
  },
}));

/** 血珀: the four flags at once, then 10% of max HP as 生命流失 every second, the first a second after it appears. */
const Passive = Object.freeze(/** @type {FoeBehavior} */ ({
  spawn: (ctx) => {
    if (!seedShape(bbOf(ctx))) return;
    ctx.addBuff(ctx.self, { key: 'dseed', flags: { ...SEED_FLAGS } });
    ctx.state.set('due', ctx.frame + ctx.frames(1));
  },
  tick: (ctx) => {
    const bb = bbOf(ctx);
    if (!seedShape(bb)) return;
    const due = ctx.state.get('due');
    if (ctx.frame < due) return;
    const self = ctx.self;
    ctx.dealDamage(self, { type: 'true', amount: ctx.stats(self).maxHp * /** @type {number} */ (bb.hp_ratio), hpLoss: true });
    ctx.state.set('due', due + ctx.frames(1));
  },
}));

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const whipBehaviors = Object.freeze({ Attack, Summon, Passive });
