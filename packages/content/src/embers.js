// 深池逐火 (docs/spec/foes.md 敌能-45): a warrior knocked down spends 1 s reborn, then an ember whose HP is a hit
// count, hidden and not attacking, and a warrior again if that lasts. `BornAnim` is a spawn animation with no rule.
// They act only through the context (ADR 0055).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */

/** 1 s of 重生: 无敌, 不可阻挡, 失衡免疫, 不移动, and no attack (敌能-45). */
const REVIVE_FLAGS = Object.freeze({
  invincible: true, untargetable: true, unblockable: true, sidelined: true, noDisplace: true, noAttack: true,
});

/** The ember: 隐匿 and 不进行攻击. No `restore`, so 索敌-2's default window applies. Block and 失衡免疫 are not on it. */
const EMBER_FLAGS = Object.freeze({ stealth: true, noAttack: true });

/** 特殊生命值 alone (敌能-39): not the body's 无法被阻挡 / 不攻击 spawn buff. */
const HIT_FLAGS = Object.freeze({ hitCount: true });

const REVIVE = 'revive';
const EMBER = 'ember';
const HITS = 'hitCount';
const WARRIOR = 0;
const REVIVING = 1;
const ASH = 2;

/** @param {FoeContext} ctx @param {string} key */
const has = (ctx, key) => ctx.self.buffs.some((b) => b.key === key);

/** Drops every buff (敌能-45, the 敌能-18 clear; the whitelist is empty). @param {FoeContext} ctx */
function clearBuffs(ctx) {
  const self = ctx.self;
  for (const key of new Set(self.buffs.map((b) => b.key))) ctx.removeBuff(self, key);
}

/**
 * Starts the ember (敌能-45): base max HP becomes `prop_max_hp` with no rescale, then HP is that maximum. The cache is
 * written before the buffs, or the next refresh would scale a still-positive HP down by the ratio.
 * @param {FoeContext} ctx
 */
function beginEmber(ctx) {
  const self = ctx.self;
  ctx.resetSkills();
  ctx.setBaseMaxHp(ctx.bb.prop_max_hp);
  ctx.addBuff(self, { key: HITS, flags: { ...HIT_FLAGS } });
  ctx.addBuff(self, { key: EMBER, flags: { ...EMBER_FLAGS }, left: ctx.frames(ctx.bb.interval) });
  ctx.setHp(self, ctx.stats(self).maxHp);
  ctx.state.set('phase', ASH);
}

/** Back to the warrior (敌能-45): the saved base, then full HP, after the hit-count buff is gone. @param {FoeContext} ctx */
function endEmber(ctx) {
  const self = ctx.self;
  ctx.setBaseMaxHp(ctx.state.get('baseHp'));
  ctx.removeBuff(self, HITS);
  ctx.state.set('phase', WARRIOR);
  ctx.setHp(self, ctx.stats(self).maxHp);
}

/**
 * A second lethal hit during the 1 s (敌能-45), 生命流失 included: stay, HP back to the warrior maximum. The revive
 * buff is left in place.
 * @param {FoeContext} ctx @returns {boolean}
 */
function holdRevive(ctx) {
  ctx.setHp(ctx.self, ctx.stats(ctx.self).maxHp);
  return true;
}

/**
 * 被击倒 (敌能-45). An ember leaves. A warrior stays for 1 s, buffs cleared, HP at its current maximum. `prop_max_hp`
 * not above 0: it leaves.
 * @param {FoeContext} ctx @returns {boolean}
 */
function onFatal(ctx) {
  const self = ctx.self, st = ctx.state, phase = st.get('phase');
  if (phase === ASH) return false;
  if (phase === REVIVING) return holdRevive(ctx);
  if (!(ctx.bb.prop_max_hp > 0)) return false;
  st.set('baseHp', self.base.maxHp);
  clearBuffs(ctx);
  ctx.setHp(self, ctx.stats(self).maxHp);
  ctx.addBuff(self, { key: REVIVE, flags: { ...REVIVE_FLAGS }, left: ctx.frames(1) });
  st.set('phase', REVIVING);
  return true;
}

/** The 1 s ends into the ember; the ember's `interval` ends back into the warrior (敌能-45). @param {FoeContext} ctx */
function onTick(ctx) {
  const phase = ctx.state.get('phase');
  if (phase === REVIVING && !has(ctx, REVIVE)) beginEmber(ctx);
  else if (phase === ASH && !has(ctx, EMBER)) endEmber(ctx);
}

/**
 * Behaviours by talent or skill name. `BornAnim` is covered and does nothing (敌能-45), as `AtkUp` does.
 * `aura` is not here: that name is 敌能-28, and this blackboard is a different ability.
 * @type {Readonly<Record<string, FoeBehavior>>}
 */
export const emberBehaviors = Object.freeze({
  'Revive[Trigger]': Object.freeze({ fatal: onFatal, tick: onTick }),
  BornAnim: Object.freeze({}),
});
