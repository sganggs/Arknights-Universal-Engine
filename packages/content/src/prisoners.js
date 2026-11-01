// 禁锢 and 解放 of the prisoners (docs/spec/foes.md 敌能-17): a prisoner starts confined — slower attacks, for some more
// defence — and is liberated before its `times`-th attack — stronger, for some armour-piercing, resistant, regenerating,
// dealing arts damage or attacking two targets at once (敌能-153); the first liberation of one with `all` liberates every
// prisoner on the field. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').skills.AttackMods} AttackMods */

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
 * A liberated prisoner's attack (敌能-17): arts with `arts`; with `attack@max_target` that many targets at once — 术师囚犯's
 * 「解放后同时攻击两个目标」 (敌能-153). @param {Record<string, number>} lib @param {AttackMods} mods @returns {AttackMods}
 */
const freedAttack = (lib, mods) => ({
  ...mods,
  ...(lib.arts ? { type: /** @type {const} */ ('arts') } : {}),
  ...(lib['attack@max_target'] > 0 ? { targets: lib['attack@max_target'] } : {}),
});

/**
 * Liberates a prisoner not liberated yet (敌能-17): its 禁锢 buff off, its 解放 buff on.
 * @param {FoeContext} ctx @param {Unit} u
 */
function liberate(ctx, u) {
  const bb = ctx.talentOf(u, 'liberty');
  if (!bb || free(ctx, u)) return;
  ctx.removeBuff(u, 'confinement');
  ctx.setBuff(u, 'liberty', 0, libertyMods(bb));
}

/**
 * 禁锢 (敌能-17): confined from the start; each attack started while confined and not under 麻痹 counts, and before the
 * `times`-th the prisoner is liberated — with `all`, every prisoner on the field with it; liberated, its attacks are
 * `freedAttack`'s, from the attack that liberates it on.
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
    return free(ctx, self) ? freedAttack(lib, mods) : mods;
  },
});

/** The behaviours of this file, by talent name; 解放 acts through 禁锢. @type {Readonly<Record<string, FoeBehavior>>} */
export const prisonerBehaviors = Object.freeze({ confinement, liberty: Object.freeze({}) });
