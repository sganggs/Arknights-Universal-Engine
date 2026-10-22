// The 枯朽吞噬者 and the 悖谬谍报官 (docs/spec/foes.md 敌能-30, 敌能-31): one devours the operator blocking it and grows
// heavier; the other spends its ammunition on ranged attacks that make the player hit lose deployment cost. They act
// only through the context (ADR 0055).

import { KIND } from '@aue/sim';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/** How near the unit blocking a 枯朽吞噬者 must be for it to devour (敌能-30), in tiles. */
const DEVOUR_REACH = 0.7;

/**
 * 吞噬 (敌能-30): once, blocked by an operator or summon on the ground within 0.7 of it, able to act and not silenced, it
 * devours that unit, then goes into its 饱腹形态: 防御力 + `Stronger`'s `def`, 移动速度 + its `move_speed` (直接乘算).
 * @type {FoeBehavior}
 */
const Devour = Object.freeze({
  tick: (ctx) => {
    const self = ctx.self, s = ctx.stats(self), b = ctx.blocker();
    if (ctx.state.get('done') || !b || s.disabled || s.flags.silence || ctx.stats(b).flying) return;
    const dx = b.x - self.x, dy = b.y - self.y;
    if (dx * dx + dy * dy > DEVOUR_REACH * DEVOUR_REACH || !ctx.devour(b)) return;
    ctx.state.set('done', 1);
    ctx.use();
    const full = ctx.talent('Stronger') ?? {};
    ctx.setBuff(self, 'Stronger', 0, { defFlat: full.def ?? 0, movePct: full.move_speed ?? 0 });
  },
});

/**
 * Whether talent `1` is the spy's (敌能-31): `ammo` is a number (other keys may be there). The same name with another
 * shape is another enemy's (敌能-62), and the spy leaves it alone. @param {Record<string, unknown>} bb
 */
export const spyShape = (bb) => typeof bb.ammo === 'number';

/**
 * 悖谬谍报官 (敌能-31): it comes in with `ammo` rounds. With a round left its attack is a ranged one and spends
 * −`attack@sp` of them, and the next time its attack deals damage to an operator that operator's player loses
 * −`attack@cost` cost for each such attack since (down to 0); with none left it attacks only the unit blocking it, without
 * a projectile.
 * @type {FoeBehavior}
 */
const spy = Object.freeze({
  spawn: (ctx) => { if (spyShape(ctx.bb)) ctx.state.set('ammo', ctx.bb.ammo); },
  targets: (ctx, cands) => {
    if (!spyShape(ctx.bb) || ctx.state.get('ammo') >= 1) return cands;
    const b = ctx.blocker();
    return cands.filter((u) => u === b);
  },
  attack: (ctx, mods) => {
    if (!spyShape(ctx.bb)) return mods;
    const st = ctx.state, ammo = st.get('ammo');
    if (ammo < 1) return { ...mods, direct: true };
    st.set('ammo', ammo + ctx.bb['attack@sp']);
    st.set('owed', st.get('owed') - ctx.bb['attack@cost']);
    return mods;
  },
  hit: (ctx, t) => {
    const owed = ctx.state.get('owed');
    if (!spyShape(ctx.bb) || owed <= 0 || t.kind !== KIND.OPERATOR) return;
    ctx.drainCost(t, owed);
    ctx.state.set('owed', 0);
  },
});

/** The behaviours of this file, by talent or skill name (谍报官's talent is named `1` in the data). @type {Readonly<Record<string, FoeBehavior>>} */
export const devourerBehaviors = Object.freeze({ Devour, 1: spy });
