// Enemies that run when hurt (docs/spec/foes.md 敌能-40): 鸭爵 never attacks and cannot be blocked, and the first time
// its HP is lower than last turn it keeps a faster move speed; 简饲源石虫, the first time its HP is strictly below
// half, is unblockable and faster for a few seconds. Not 冲锋 (敌能-19). They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * 不进行攻击 and 无法被阻挡 (敌能-40). A different key from the speed buff: buffs of one key take effect one at a time
 * (状态-2), so the flags and the later speed bonus cannot share a key.
 */
const STILL = Object.freeze({ noAttack: true, unblockable: true });

/**
 * 鸭爵 (敌能-40), talent `run`: from spawn it does not attack and cannot be blocked. The first time `hurt` is set,
 * move speed gains `attack@move_speed` (直接乘算) with no end; a later drop does not add a second copy.
 * @type {FoeBehavior}
 */
const run = Object.freeze({
  spawn: (ctx) => { ctx.addBuff(ctx.self, { key: 'run:still', flags: { ...STILL } }); },
  tick: (ctx) => {
    if (ctx.state.get('ran') || !ctx.hurt) return;
    const pct = ctx.bb['attack@move_speed'];
    if (!(pct > 0)) return;
    ctx.state.set('ran', 1);
    ctx.addBuff(ctx.self, { key: 'run', mods: { movePct: pct } });
  },
});

/**
 * 快跑快跑！ (敌能-40), skill `StartRun`: the first time HP is strictly below half the maximum — the page's 低于50%,
 * which the blackboard does not carry — and the skill is ready, it can act and it is not silenced, it becomes
 * unblockable and faster by `move_speed` (直接乘算) for `block_free_time` seconds. A turn it cannot cast does not
 * spend that one use.
 * @type {FoeBehavior}
 */
const StartRun = Object.freeze({
  tick: (ctx) => {
    const self = ctx.self;
    if (ctx.state.get('used') || !ctx.ready) return;
    const s = ctx.stats(self);
    if (s.disabled || s.flags.silence || self.hp * 2 >= s.maxHp) return;
    ctx.state.set('used', 1);
    ctx.use();
    ctx.addBuff(self, {
      key: 'run', mods: { movePct: ctx.bb.move_speed }, flags: { unblockable: true }, left: ctx.frames(ctx.bb.block_free_time),
    });
  },
});

/** The behaviours of this file, by talent or skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const runnerBehaviors = Object.freeze({ run, StartRun });
