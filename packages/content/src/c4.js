// W's C4 (docs/spec/foes.md 敌能-76). A 3.2 s cast plants a charge on our units; the charge is a buff on the carrier
// so it still goes off if W has left, and it is simply gone when the carrier leaves. The scheduled blast is the buff's
// expiry. A hindrance or W's knockdown blows every charge at once and removes the buff, so expiry does not hit again.
import { KIND } from '@aue/schema';
import { attrs, damage } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').World} World */
/** @typedef {import('@aue/sim').Buff} Buff */

/** Buff key of a planted charge. One cast puts at most one on a carrier. */
const PLANT = 'c4';
/** Behaviour key. Not `C4`: that name is the enemy skill. */
const ACT = 'c4Blast';
/** How many charges one cast plants once W has been below half HP (the page's 至多3个). */
const WIDE = 3;

/** Our operators (summons included) and our devices. Neutrals are enemies; a ground W still cannot plant on 起飞. @param {FoeContext} ctx @param {Unit} u */
const ours = (ctx, u) => u.kind !== KIND.ENEMY && !ctx.stats(u).flags.liftoff;

/**
 * Carriers this cast may plant on, in attack order (索敌-5). Centre distance, the skill's `range_radius`. Flying units
 * only after the one drop below half. @param {FoeContext} ctx @returns {Unit[]}
 */
function picks(ctx) {
  const r = ctx.bb.range_radius;
  if (typeof r !== 'number') return [];
  const sel = ctx.state.get('half') ? { canHitFly: true } : undefined;
  return ctx.order(ctx.foes(r, sel).filter((u) => ours(ctx, u)));
}

/** The first time HP is strictly below half, this skill's cooldown is 0. Once. @param {FoeContext} ctx */
function noteHalf(ctx) {
  if (ctx.state.get('half')) return;
  const s = ctx.stats(ctx.self);
  if (ctx.self.hp * 2 >= s.maxHp) return;
  ctx.state.set('half', 1);
  ctx.state.set('cd', 0);
}

/** One charge's hit: physical, an attack hit, from the skill, on the carrier alone. @param {number} scale @param {number} atk */
const hitOf = (scale, atk) => ({ type: /** @type {'phys'} */ ('phys'), amount: scale * atk, isAttack: true, isSkill: true });

/** The tag of the charges one W plants, so that W takes off its own and no other W's. @param {Unit} self */
const plantTag = (self) => `${ACT}:${self.id}`;

/** Blow every charge this W planted that is still on a unit, then take the buff off so expiry cannot hit again. @param {FoeContext} ctx */
function blowPlanted(ctx) {
  const atk = ctx.stats(ctx.self).atk;
  for (const u of ctx.planted(PLANT)) {
    const b = u.buffs.find((x) => x.key === PLANT && x.src === ctx.self.id);
    if (!b) continue;
    ctx.dealDamage(u, hitOf(b.value, atk));
    ctx.removeBuff(u, PLANT, plantTag(ctx.self));
  }
}

/** The cast is over: W may attack and move again. Only the cast's own 自缚 ends; a 束缚 from elsewhere stays. @param {FoeContext} ctx */
function endCast(ctx) {
  ctx.state.set('ch', 0);
  ctx.removeBuff(ctx.self, 'root', ACT);
}

/**
 * One frame of a cast. Unable to act: every charge blows now. Otherwise the cast runs down and, on its last frame,
 * only ends — the buff already expired at the start of this frame.
 * @param {FoeContext} ctx
 */
function channel(ctx) {
  if (ctx.stats(ctx.self).disabled) {
    blowPlanted(ctx);
    endCast(ctx);
    return;
  }
  ctx.state.set('ch', ctx.state.get('ch') - 1);
  if (ctx.state.get('ch') > 0) return;
  endCast(ctx);
}

/** Start a cast when the skill is ready and someone can carry a charge. The cooldown starts here. @param {FoeContext} ctx */
function begin(ctx) {
  const s = ctx.stats(ctx.self);
  if (!ctx.ready || s.disabled || s.flags.silence) return;
  const picked = picks(ctx).slice(0, ctx.state.get('half') ? WIDE : 1);
  if (picked.length === 0) return;
  const seconds = ctx.bb.cast;
  if (typeof seconds !== 'number' || typeof ctx.bb.atk_scale !== 'number') return;
  const frames = ctx.frames(seconds);
  if (!(frames > 0)) return;
  ctx.use();
  ctx.state.set('ch', frames);
  ctx.applyStatus(ctx.self, 'root', { seconds, tag: ACT });
  for (const u of picked) ctx.addBuff(u, { key: PLANT, act: ACT, tag: plantTag(ctx.self), value: ctx.bb.atk_scale, n: s.atk, left: frames });
}

/**
 * C4 (敌能-76). While `ch` is running it does not attack. The half-HP reset is this skill reading its own HP: the data
 * has no talent for it. A cast that ends this frame does not start the next one; the reset during a cast is the same.
 * @type {FoeBehavior}
 */
const C4 = Object.freeze({
  targets: (ctx, cands) => (ctx.state.get('ch') > 0 ? [] : cands),
  tick: (ctx) => {
    if (ctx.state.get('ch') > 0) {
      channel(ctx);
      noteHalf(ctx);
      return;
    }
    noteHalf(ctx);
    begin(ctx);
  },
  death: (ctx) => {
    blowPlanted(ctx);
    if (ctx.state.get('ch') > 0) endCast(ctx);
  },
});

/**
 * The fuse (敌能-76). W still on the field, even at 0 HP, is the source and the attack is its attack now; once W has
 * left, the attack noted at planting is the amount and the hit has no source. With the content, as the early blast.
 * @param {World} w @param {Unit} u @param {Buff} b @param {import('@aue/sim').Content} [c]
 */
function blast(w, u, b, c) {
  if (u.hp <= 0) return;
  const src = w.units.find((x) => x.id === b.src) ?? null;
  damage.dealDamage(w, src, u, hitOf(b.value, src ? attrs.statsOf(src).atk : b.n), c);
}

/** The behaviours of this file, by skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const c4Behaviors = Object.freeze({ C4 });

/** The planted charge's expiry. @type {Readonly<Record<string, import('@aue/sim').buffs.Behavior>>} */
export const c4Buffs = Object.freeze({ [ACT]: { expire: blast } });
