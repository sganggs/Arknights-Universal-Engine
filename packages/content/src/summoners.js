// Enemies that bring others in, and the 畸变 ones (docs/spec/foes.md 敌能-23, 敌能-24): the 变异 beasts' brood when they
// fall and the 巨岩蛛's split, the 畸变恶性瘤 slowing the unit that blocks it, and the “红标” infiltrators' hologram,
// which keeps them out of the fight while it stands. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** The enemy key a blackboard names (the data keeps it as text). @param {Record<string, number>} bb */
const keyIn = (bb) => String(/** @type {unknown} */ (bb.enemy_key));

/**
 * 死亡召唤 (敌能-23): knocked down — not by a fall when `fall` is 0, not while silenced when `silence` is 1 —, after `delay`
 * seconds `cnt` enemies of `enemy_key` (one by default) appear around the centre of the passable tile nearest it, each
 * up to `offset_bound` off along x and y, on its route.
 * @type {FoeBehavior}
 */
const deathrattle = Object.freeze({
  death: (ctx) => {
    const bb = ctx.bb;
    if ((bb.silence === 1 && ctx.stats(ctx.self).flags.silence) || (bb.fall === 0 && ctx.fell)) return;
    ctx.summon(keyIn(bb), { cnt: bb.cnt ?? 1, delay: bb.delay ?? 0, bound: bb.offset_bound ?? 0, tile: true });
  },
});

/**
 * 分裂 (敌能-23): the skill ready and the enemy able to act and not silenced, `cnt` enemies of `enemy_key` appear at the
 * centre of the passable tile nearest it, on its route; the cooldown starts again.
 * @type {FoeBehavior}
 */
const SummonToken = Object.freeze({
  tick: (ctx) => {
    const s = ctx.stats(ctx.self);
    if (!ctx.ready || s.disabled || s.flags.silence) return;
    ctx.use();
    ctx.summon(keyIn(ctx.bb), { cnt: ctx.bb.cnt ?? 1, tile: true });
  },
});

/**
 * 畸变恶性瘤 (敌能-23): no `range_radius` — while it is blocked, the unit blocking it has 攻击速度 × (1 + `attack_speed`)
 * (直接乘算), one such effect at most. 寒霜 (敌能-35) has `range_radius` (FOE_EXTRAS, the page's 2.5): every one of our
 * units in that radius gets the same multiplier on its own key, so a blocker of the tumour is not retuned to 寒霜's.
 * @param {FoeContext} ctx
 */
function tumorSlow(ctx) {
  const b = ctx.blocker();
  if (b) ctx.lend(b, 'atkSpeedDown', { mods: { aspdPct: ctx.bb.attack_speed } });
}

/** 寒霜 (敌能-35): 攻击速度 × (1 + attack_speed) inside `range_radius`, off while the holder is silenced. @param {FoeContext} ctx */
function frostAura(ctx) {
  const rate = ctx.bb.attack_speed;
  if (typeof rate !== 'number' || ctx.stats(ctx.self).flags.silence) return;
  for (const u of ctx.foes(ctx.bb.range_radius)) if (u.base.neutral !== true) ctx.lend(u, 'frostAspd', { mods: { aspdPct: rate } });
}

/** `atkSpeedDown` (敌能-23, 敌能-35): the tumour when the blackboard has no radius, 寒霜 when it does. @type {FoeBehavior} */
const atkSpeedDown = Object.freeze({
  tick: (ctx) => (typeof ctx.bb.range_radius === 'number' ? frostAura(ctx) : tumorSlow(ctx)),
});

/** The hologram enemy `e` brought in while it is still on the field (敌能-24). @param {FoeContext} ctx */
const ghostOf = (ctx) => {
  const id = ctx.state.get('ghost');
  return id > 0 ? ctx.enemies().find((u) => u.id === id) ?? null : null;
};

/**
 * 全息投影 (敌能-24): one frame after it first takes damage, a hologram of `enemy_key` appears where it stands, on its
 * route; while that stands it makes no normal attacks, cannot be blocked (its block weight × 0) and has 嘲讽等级
 * + `taunt_level`; knocked down, it takes its hologram with it.
 * @type {FoeBehavior}
 */
const createGhost = Object.freeze({
  tick: (ctx) => {
    const st = ctx.state;
    if (!st.get('made') && ctx.hurt) {
      st.set('made', 1);
      const [g] = ctx.summon(keyIn(ctx.bb), {});
      if (g) st.set('ghost', g.id);
    }
    if (ghostOf(ctx)) ctx.lend(ctx.self, 'ghost', { flags: { noAttack: true, unblockable: true }, mods: { taunt: ctx.bb.taunt_level, blockCntMul: 0 } });
  },
  death: (ctx) => {
    const g = ghostOf(ctx);
    if (g) ctx.remove(g);
  },
});

/** 自缚 (敌能-24): the hologram cannot move. @type {FoeBehavior} */
const Bind = Object.freeze({
  spawn: (ctx) => { ctx.addBuff(ctx.self, { key: 'bind', flags: { root: true } }); },
});

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const summonerBehaviors = Object.freeze({ deathrattle, SummonToken, atkSpeedDown, createGhost, Bind });
