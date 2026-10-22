// 弧光镜卫 / 弧光镜卫长 (docs/spec/foes.md 敌能-52): one layer of 抗性降低 per hit that comes through 伤判 with
// damage left. The buff's stacks stay 1, so the mods are the total flat (n × per layer), or 0 below `gate`.
// change1_stack_cnt / change2_stack_cnt are appearance only.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * 抗性降低 (敌能-52). This hit already used the previous DEF and RES.
 * @param {import('@aue/sim').FoeContext} ctx
 */
function resistDown(ctx) {
  const bb = ctx.bb, max = bb.max_stack_cnt;
  if (!(max > 0)) return;
  const n0 = ctx.state.get('n');
  if (n0 >= max) return;
  const n = n0 + 1;
  ctx.state.set('n', n);
  const on = n >= bb.gate;
  const mods = on
    ? { defFlat: (bb.def / max) * n, resFlat: (bb.magic_resistance / max) * n }
    : { defFlat: 0, resFlat: 0 };
  ctx.setBuff(ctx.self, 'def_reduce', n, mods);
}

/** One layer per hit with damage left after 伤判 (敌能-2 `hpDamage`, 敌能-52). Silence does not stop it. @type {FoeBehavior} */
const defReduce = Object.freeze({ hpDamage: resistDown });

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const mirrorBehaviors = Object.freeze({ def_reduce: defReduce });
