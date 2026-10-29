// 深池塑能术师 and its 净浊之焰 (docs/spec/foes.md 敌能-93). The caster brings in a flame where it stands, on its own way —
// `SummonFireBall2` while unblocked, `SummonFireBall` while blocked, by their cooldowns, not silenced by 沉默. The flame
// (`Weaken`) cannot be hurt, selected or blocked, is 孤立 and skips the waits of its way; its 攻击力 falls a step each
// 0.1 seconds to 30% at `duration` seconds, when it goes; one of ours on low ground within its tile's square sets it off —
// arts damage and 灼燃损伤 (its `epdamage`) to every one of ours on the ground within its attack radius — and it goes.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** What a flame is (敌能-93): 无敌, 不可选中, 不可阻挡 (no collider), 孤立, no wait of its way holds it, no attack but its blast. */
const FLAME = Object.freeze({ invincible: true, untargetable: true, unblockable: true, noAllyHeal: true, noWait: true, noAttack: true });
/** The fall's step (敌能-93: 「每0.1秒降低一次」), seconds. */
const STEP = 0.1;
/** Half the side of the square around a flame that sets it off (敌能-93: 「1×1正方形区域」). */
const HALF = 0.5;

/**
 * A caster's summon (敌能-93): ready, able to act, blocked or not as the skill asks — silence does not stop it —, it
 * brings in `cnt` of `enemy_key` where it stands, on its way, and the cooldown starts again.
 * @param {boolean} blocked @returns {FoeBehavior}
 */
const summonWhile = (blocked) => Object.freeze({
  tick: (ctx) => {
    const bb = /** @type {Record<string, unknown>} */ (ctx.bb);
    if (!ctx.ready || ctx.stats(ctx.self).disabled || ctx.blocked !== blocked || typeof bb.enemy_key !== 'string') return;
    ctx.use();
    ctx.summon(bb.enemy_key, { cnt: /** @type {number} */ (bb.cnt), bound: 0, tile: false, delay: 0 });
  },
});

/** One of ours on the ground — not flying — on low ground (敌能-93). @param {FoeContext} ctx @param {Unit} u */
const grounded = (ctx, u) => ctx.onLow(u) && !ctx.stats(u).flying;

/** Its blast (敌能-93): every one of ours on the ground within its attack radius takes it; the flame goes. @param {FoeContext} ctx */
function blast(ctx) {
  const self = ctx.self, atk = ctx.stats(self).atk, r = self.base.rangeRadius, ep = ctx.talent('epdamage')?.['attack@ep_damage_ratio'] ?? 0;
  for (const u of ctx.ours().filter((x) => grounded(ctx, x) && (x.x - self.x) * (x.x - self.x) + (x.y - self.y) * (x.y - self.y) <= r * r)) {
    ctx.dealDamage(u, { type: 'arts', amount: atk });
    if (ep > 0) ctx.dealEp(u, 'FIRE', atk * ep);
  }
  ctx.remove(self);
}

/**
 * The flame (敌能-93, `Weaken`): what it is from its spawn; each 0.1 seconds its 攻击力 a step lower — + `atk` × the
 * share of `duration` gone (直接乘算) —; at `duration` seconds it goes; one of ours on low ground within the square of
 * its tile sets it off.
 * @type {FoeBehavior}
 */
const Weaken = Object.freeze({
  spawn: (ctx) => {
    ctx.addBuff(ctx.self, { key: 'flame', flags: { ...FLAME } });
    ctx.state.set('born', ctx.frame);
  },
  tick: (ctx) => {
    const bb = ctx.bb, self = ctx.self, age = ctx.frame - ctx.state.get('born');
    if (age >= ctx.frames(bb.duration)) { ctx.remove(self); return; }
    const share = Math.min(1, (Math.floor(age / ctx.frames(STEP)) * STEP) / bb.duration);
    ctx.setBuff(self, 'flameFade', 0, { atkPct: bb.atk * share });
    if (ctx.ours().some((u) => grounded(ctx, u) && Math.abs(u.x - self.x) <= HALF && Math.abs(u.y - self.y) <= HALF)) blast(ctx);
  },
});

/** The behaviours of this file, by skill or talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const flameBehaviors = Object.freeze({ SummonFireBall: summonWhile(true), SummonFireBall2: summonWhile(false), Weaken });
