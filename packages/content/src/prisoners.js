// 禁锢 and 解放 of the prisoners (docs/spec/foes.md 敌能-17): a prisoner starts confined — slower attacks, for some more
// defence — and is liberated before its `times`-th attack — stronger, for some armour-piercing, resistant, regenerating
// or dealing arts damage; the first liberation of one with `all` liberates every prisoner on the field. They act only
// through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** 解放's modifiers from its blackboard (敌能-17). @param {Record<string, number>} bb @returns {Record<string, number>} */
const libertyMods = (bb) => ({
  atkPct: bb.atk ?? 0,
  ...(bb.def_penetrate ? { defIgnorePct: bb.def_penetrate } : {}),
  ...(bb.magic_resistance ? { resFlat: bb.magic_resistance } : {}),
  ...(bb.hp_recovery_per_sec ? { hpRegen: bb.hp_recovery_per_sec } : {}),
});

/** Whether a prisoner is liberated (敌能-17). @param {FoeContext} ctx @param {Unit} u */
const free = (ctx, u) => ctx.buffValue(u, 'liberty') !== null;

/**
 * Liberates a prisoner not liberated yet (敌能-17): its 禁锢 buff off, its 解放 buff on. 杰斯顿·威廉姆斯's 杀手形态 liberates
 * the prisoners on the field with it (敌能-146).
 * @param {FoeContext} ctx @param {Unit} u
 */
export function liberate(ctx, u) {
  const bb = ctx.talentOf(u, 'liberty');
  if (!bb || free(ctx, u)) return;
  ctx.removeBuff(u, 'confinement');
  ctx.setBuff(u, 'liberty', 0, libertyMods(bb));
}

/**
 * 禁锢 (敌能-17): confined from the start; each attack started while confined and not under 麻痹 counts, and before the
 * `times`-th the prisoner is liberated — with `all`, every prisoner on the field with it; liberated, its attacks are
 * arts with `arts`.
 * @type {FoeBehavior}
 */
const confinement = Object.freeze({
  spawn: (ctx) => { ctx.setBuff(ctx.self, 'confinement', 0, { aspd: ctx.bb.attack_speed ?? 0, ...(ctx.bb.def ? { defFlat: ctx.bb.def } : {}) }); },
  attack: (ctx, mods) => {
    const self = ctx.self, lib = ctx.talent('liberty') ?? {};
    if (!free(ctx, self) && !ctx.stats(self).flags.palsy) {
      const n = ctx.state.get('n') + 1;
      ctx.state.set('n', n);
      if (n >= ctx.bb.times) {
        liberate(ctx, self);
        if (lib.all) for (const u of ctx.allies(Infinity)) liberate(ctx, u);
      }
    }
    return free(ctx, self) && lib.arts ? { ...mods, type: 'arts' } : mods;
  },
});

/** The behaviours of this file, by talent name; 解放 acts through 禁锢. @type {Readonly<Record<string, FoeBehavior>>} */
export const prisonerBehaviors = Object.freeze({ confinement, liberty: Object.freeze({}) });
