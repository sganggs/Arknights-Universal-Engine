// “复仇者” (docs/spec/foes.md 敌能-8, 敌能-18, 敌能-19): 重生 — the first time its HP runs out it is revived, invincible
// for a while — and 冲锋 — unblocked, it makes the nearest of our units on its way within its radius its next point and
// runs there faster. Its ATK up at low HP is 敌能-8's `atkup` with `AtkUp`'s bonus. They act only through the context
// (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** The flags of 重生 (敌能-18): 无敌 — unselectable by the other side, no damage —, 不可阻挡, and no action. */
const REVIVING = Object.freeze({ invincible: true, untargetable: true, unblockable: true, sidelined: true });

/**
 * The first knockdown stays (敌能-18, and 敌能-78 which has no `hp_ratio`): buffs cleared, HP to `ratio` of the
 * maximum, then `duration` seconds of the reviving flags. A second call does not keep it.
 * @param {FoeContext} ctx @param {number} ratio @returns {boolean}
 */
export function beginRebirth(ctx, ratio) {
  const self = ctx.self, st = ctx.state;
  if (st.get('done')) return false;
  st.set('done', 1);
  st.set('reviving', 1);
  for (const key of new Set(self.buffs.map((b) => b.key))) ctx.removeBuff(self, key);
  ctx.setHp(self, ctx.stats(self).maxHp * ratio);
  ctx.addBuff(self, { key: 'reborn', flags: { ...REVIVING }, left: ctx.frames(ctx.bb.duration) });
  return true;
}

/**
 * When that buff has ended (敌能-18): skills' cooldowns start over, and `invincible` seconds of 无敌 follow when the
 * blackboard says so. 锋盔's `reborn` has no `invincible` (敌能-78), so nothing is added then.
 * @param {FoeContext} ctx
 */
export function endRebirth(ctx) {
  const self = ctx.self, st = ctx.state;
  if (!st.get('reviving') || self.buffs.some((b) => b.key === 'reborn')) return;
  st.set('reviving', 0);
  ctx.resetSkills();
  if (ctx.bb.invincible > 0) ctx.addBuff(self, { key: 'reborn:invincible', flags: { invincible: true, untargetable: true }, left: ctx.frames(ctx.bb.invincible) });
}

/**
 * 重生 (敌能-18): the first time its HP runs out it stays at `hp_ratio` of its maximum for `duration` seconds; when
 * they end its skills' cooldowns start over and it is 无敌 for `invincible` seconds.
 * @type {FoeBehavior}
 */
const Reborn = Object.freeze({
  fatal: (ctx) => beginRebirth(ctx, ctx.bb.hp_ratio),
  tick: (ctx) => { endRebirth(ctx); },
});

/** The squared distance between two units. @param {Unit} a @param {Unit} b */
const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/**
 * 冲锋 (敌能-19): ready, unblocked, able to act and not silenced, with one of our units on its way within `range_radius`
 * — the nearest, the earliest created of equals — it makes the centre of that unit's tile its next point and moves
 * faster by `move_speed` (直接乘算) for `duration` seconds.
 * @type {FoeBehavior}
 */
const Rush = Object.freeze({
  tick: (ctx) => {
    const self = ctx.self, s = ctx.stats(self);
    if (!ctx.ready || ctx.blocked || s.disabled || s.flags.silence) return;
    const [t] = ctx.foes(ctx.bb.range_radius).filter((u) => ctx.onWay(u)).toSorted((a, b) => dist2(a, self) - dist2(b, self) || a.id - b.id);
    if (!t) return;
    ctx.use();
    ctx.detour(Math.round(t.y), Math.round(t.x));
    ctx.addBuff(self, { key: 'rush', mods: { movePct: ctx.bb.move_speed }, left: ctx.frames(ctx.bb.duration) });
  },
});

/** The behaviours of this file, by talent or skill name; `AtkUp` gives its bonus through `atkup` (敌能-8). @type {Readonly<Record<string, FoeBehavior>>} */
export const avengerBehaviors = Object.freeze({ Reborn, Rush, AtkUp: Object.freeze({}) });
