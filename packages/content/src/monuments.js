// 堡垒守御's five 丰碑 (docs/spec/foes.md 敌能-69): the first time HP is at or under 80/60/40/20 %, that stage stays.
// Each talent latches itself — ctx.state is per ability name — and adds its own permanent buff, so the four combine.
// They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */

/**
 * The one modifier this blackboard carries (敌能-69). Speed and move speed are 最终乘算 of the blackboard's 1.5, so
 * four stages multiply to the page's 提升至. ATK is 直接乘算 of 1. Block weight is 直接加算 of 1. A direct-multiply
 * 1.5 would be +150%, which is not 「提升至150%」.
 * @param {Record<string, number>} bb @returns {Record<string, number> | null}
 */
function modsOf(bb) {
  if (typeof bb.attack_speed === 'number') return { aspdMul: bb.attack_speed };
  if (typeof bb.move_speed === 'number') return { moveMul: bb.move_speed };
  if (typeof bb.atk === 'number') return { atkPct: bb.atk };
  if (typeof bb.block_cnt === 'number') return { blockCnt: bb.block_cnt };
  return null;
}

/**
 * One HP stage (敌能-69). `parts` is how many fifths of max HP still count as 「不高于」 (4 is 80%, 1 is 20%), so the
 * comparison stays on integers. The buff key is the talent name: four stages are four buffs (状态-2), and a later turn
 * does not add a second copy. Silence is not checked — the pages do not say the talent can be silenced.
 * @param {string} name @param {number} parts @returns {FoeBehavior}
 */
function stage(name, parts) {
  return Object.freeze({
    tick: (ctx) => {
      if (ctx.state.get('on')) return;
      const self = ctx.self;
      if (self.hp * 5 > ctx.stats(self).maxHp * parts) return;
      const mods = modsOf(ctx.bb);
      if (!mods) return;
      ctx.state.set('on', 1);
      ctx.addBuff(self, { key: name, mods });
    },
  });
}

/**
 * 无法被阻挡 (敌能-69), the page-only talent on 狂奔丰碑 (`free` is a data talent name, so not that). Its own key, so it does not share a buff with a stage
 * (状态-2). Not `noAttack`: whether an attack-type NONE enemy attacks is not this family.
 * @type {FoeBehavior}
 */
const unblockable = Object.freeze({
  spawn: (ctx) => { ctx.addBuff(ctx.self, { key: 'unblockable', flags: { unblockable: true } }); },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const monumentBehaviors = Object.freeze({
  hp80: stage('hp80', 4), hp60: stage('hp60', 3), hp40: stage('hp40', 2), hp20: stage('hp20', 1), unblockable,
});
