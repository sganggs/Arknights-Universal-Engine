// 集团军火炮 (docs/spec/foes.md 敌能-60): a radius splash on the normal attack, and a burning zone where the main
// target stood when the shell landed. The zone radius is a page extra (`zone`); the data's projectile_range is the
// splash. They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** The ally collider the page's 碰撞判定 adds, in tiles (常量-2). */
const COL = 0.25;

/**
 * 燃烧区域 (敌能-60): shells splash, and a connecting hit on the main target leaves a zone. Not silenceable. Flying
 * units are not targets. The zone stays up after the cannon dies; this hook only runs while the cannon is the source.
 * @type {FoeBehavior}
 */
const ProjectileBoomRange = Object.freeze({
  targets: (ctx, cands) => cands.filter((u) => !ctx.stats(u).flying),
  attack: (ctx, mods) => {
    const radius = ctx.bb['attack@projectile_range'];
    if (typeof radius !== 'number') return mods;
    return { ...mods, splash: { radius, scale: 1, ground: true, side: 'friendly' } };
  },
  landed: (ctx, target) => {
    const life = ctx.bb['attack@projectile_life_time'], arts = ctx.bb['attack@value'], radius = ctx.bb.zone;
    if (typeof life !== 'number' || typeof arts !== 'number' || typeof radius !== 'number') return;
    ctx.zone({
      x: target.x, y: target.y, radius, life, low: 0, high: 0, arts, pad: COL, wide: true,
    });
  },
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const cannonBehaviors = Object.freeze({ ProjectileBoomRange });
