// 守墓石像 (docs/spec/foes.md 敌能-34): on the ground it fights only what blocks it; the first knock-out refills it
// into the statue form, which then takes off and shoots arts. It acts only through the context (ADR 0055). 破碎支柱 is
// not modelled.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** 转换模式 (敌能-34): unblockable, no attack, 失衡免疫, 自缚 as the immobility flag, immune to 浮空. */
const STONE = Object.freeze({ unblockable: true, noAttack: true, noDisplace: true, root: true, 'immune:levitate': true });

/** Drops every buff key the enemy holds (敌能-34). The page gives no whitelist. @param {FoeContext} ctx @param {Unit} self */
function clearBuffs(ctx, self) {
  for (const key of new Set(self.buffs.map((b) => b.key))) ctx.removeBuff(self, key);
}

/**
 * 守墓石像 (敌能-34): melee against its blocker; the first knock-out refills HP at once and holds the statue form for
 * `duration` seconds; then it flies, deals arts and skips flying units.
 * @type {FoeBehavior}
 */
const stone = Object.freeze({
  targets: (ctx, cands) => {
    if (ctx.state.get('fly')) return cands.filter((u) => !ctx.stats(u).flying);
    const b = ctx.blocker();
    return b ? [b] : [];
  },
  attack: (ctx, mods) => (ctx.state.get('fly') ? { ...mods, type: 'arts' } : mods),
  fatal: (ctx) => {
    const self = ctx.self, st = ctx.state, duration = ctx.bb.duration;
    if (st.get('done') || !(duration > 0)) return false;
    st.set('done', 1);
    st.set('form', 1);
    clearBuffs(ctx, self);
    ctx.setHp(self, ctx.stats(self).maxHp);
    ctx.release();
    ctx.resetSkills();
    ctx.addBuff(self, {
      key: 'stone', flags: STONE, left: ctx.frames(duration),
      mods: { defFlat: ctx.bb.def ?? 0, resFlat: ctx.bb.magic_resistance ?? 0 },
    });
    return true;
  },
  tick: (ctx) => {
    const self = ctx.self, st = ctx.state;
    if (!st.get('form') || self.buffs.some((b) => b.key === 'stone')) return;
    st.set('form', 0);
    st.set('fly', 1);
    ctx.addBuff(self, { key: 'flight', flags: { noDisplace: true } });
    ctx.release();
    ctx.fly();
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const statueBehaviors = Object.freeze({ stone });
