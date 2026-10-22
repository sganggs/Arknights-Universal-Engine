// 寻路者甜品商 calls a candy cart; a blocked cart becomes a bomb (docs/spec/foes.md 敌能-82). BornCar's blackboard is
// empty in the data: the ammunition cap is a content extra (FOE_EXTRAS), and which car each dealer calls is CART_OF. The cart's talent reuses the name
// `boom`: the three `attack@s2mode_*` numbers are its shape, and that shape never takes the death blast (敌能-5).

import { roundHalfEven } from '@aue/math';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').skills.AttackMods} AttackMods */

const ATK = 'attack@s2mode_boom_atk';
const BURN = 'attack@s2mode_ep_fire_damage';
const TRAP = 'attack@s2mode_boom_atk_totrap';

/**
 * The candy cart's blackboard (敌能-82): all three numbers. `boom_atk_totrap` is read so the shape owns it; AUE has no
 * 冰淇淋机, and the key never deals that packet.
 * @param {object} bb
 */
export function cartShape(bb) {
  const o = /** @type {Record<string, unknown>} */ (bb);
  return typeof o[ATK] === 'number' && typeof o[BURN] === 'number' && typeof o[TRAP] === 'number';
}

/** The car each dealer's skill names (敌能-82): 甜品商 a 糖果车, 知名甜品商 a 精致糖果车. */
export const CART_OF = Object.freeze({ enemy_1217_rescar: 'enemy_1218_bomscr', enemy_1217_rescar_2: 'enemy_1218_bomscr_2' });

/**
 * BornCar is this family's only when the page's ammunition cap is present (关卡-2); the two dealers that carry it are
 * the two CART_OF names. Any other name is not this check's concern.
 * @param {string} name @param {object} bb
 */
export function bornCarOwns(name, bb) {
  if (name !== 'BornCar') return true;
  return typeof (/** @type {Record<string, unknown>} */ (bb)).max === 'number';
}

/** @param {FoeContext} ctx */
const raw = (ctx) => /** @type {Record<string, unknown>} */ (ctx.bb);

/** @param {Record<string, unknown>} bb @param {string} key */
const num = (bb, key) => (typeof bb[key] === 'number' ? bb[key] : 0);

/**
 * Ready, able to act, and holding at least this cast's cost (敌能-82). Silence is not 不能行动: the page says the
 * skill cannot be silenced.
 * @param {FoeContext} ctx
 */
function canCall(ctx) {
  const cost = ctx.sp;
  return ctx.ready && !ctx.stats(ctx.self).disabled && cost >= 1 && ctx.state.get('ammo') >= cost;
}

/** Spends one cast and brings the named cart in (敌能-22). No `delay` on the blackboard means none (知名甜品商). @param {FoeContext} ctx */
function callCart(ctx) {
  const bb = raw(ctx);
  const key = Object.hasOwn(CART_OF, ctx.self.key) ? CART_OF[/** @type {keyof typeof CART_OF} */ (ctx.self.key)] : '';
  if (!key) return;
  ctx.state.set('ammo', ctx.state.get('ammo') - ctx.sp);
  ctx.use();
  ctx.summon(key, { tile: true, delay: typeof bb.delay === 'number' ? bb.delay : 0 });
}

/**
 * 召唤糖果车 (敌能-82). Ammunition starts full (`max`) and does not regenerate; each cast spends the skill's SP cost.
 * @type {FoeBehavior}
 */
const BornCar = Object.freeze({
  spawn: (ctx) => { ctx.state.set('ammo', num(raw(ctx), 'max')); },
  tick: (ctx) => { if (canCall(ctx)) callCart(ctx); },
});

/** The same tile (敌能-29's tile, which is not one of the eight around it). @param {Unit} u @param {Unit} self */
function sameTile(u, self) {
  return roundHalfEven(u.x) === roundHalfEven(self.x) && roundHalfEven(u.y) === roundHalfEven(self.y);
}

/**
 * Our ground units on the eight tiles around the cart (敌能-82): not its own tile, not flying (不可对空, INF-0589),
 * not neutral (INF-0590). Our devices stay. `around` already drops a unit that took off.
 * @param {FoeContext} ctx
 */
function ring(ctx) {
  const self = ctx.self;
  return ctx.around(self, 'square').filter((u) => !sameTile(u, self) && !ctx.stats(u).flying && u.base.neutral !== true);
}

/** One packet: arts, then 灼燃 (元素-2). Nothing for a unit already at 0 HP, and nothing again for a flyer. @param {FoeContext} ctx @param {Unit} u */
function packet(ctx, u) {
  if (u.hp <= 0 || ctx.stats(u).flying) return;
  const bb = raw(ctx);
  ctx.dealDamage(u, { type: 'arts', amount: num(bb, ATK) });
  ctx.dealEp(u, 'FIRE', num(bb, BURN));
}

/** The eight tiles except this attack's target, then the blocker, then the cart is knocked down (敌能-82). @param {FoeContext} ctx */
function explode(ctx) {
  const who = ctx.blocker();
  for (const u of ring(ctx)) if (u !== who) packet(ctx, u);
  if (who) packet(ctx, who);
  ctx.remove(ctx.self);
}

/**
 * Arms 自爆模式 the first time the cart is blocked and not silenced (敌能-82). Called from the turn and from the
 * attack: the turn runs before the block, so a block that starts on an attack's frame is seen here instead.
 * @param {FoeContext} ctx
 */
function arm(ctx) {
  if (ctx.state.get('mode') || !ctx.blocked || ctx.stats(ctx.self).flags.silence) return;
  ctx.state.set('mode', 1);
}

/** The cart's turn (敌能-82). @param {FoeContext} ctx @returns {void} */
export function cartTick(ctx) { arm(ctx); }

/**
 * Before 自爆模式 the strike is physical (the page), whatever the record's damage type says. In the mode the strike
 * deals nothing and the cart explodes first (敌能-82).
 * @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods}
 */
export function cartAttack(ctx, mods) {
  arm(ctx);
  if (!ctx.state.get('mode')) return { ...mods, type: 'phys' };
  explode(ctx);
  return { ...mods, scale: 0 };
}

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const candycarBehaviors = Object.freeze({ BornCar });
