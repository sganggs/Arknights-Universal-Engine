// 抱蛋羽兽 / 拥霜羽兽 lose the egg after 失衡 (docs/spec/foes.md 敌能-57). The talent schedules the tries; the skill is the
// mode. Ability state is per name, so the try is a one-frame buff both can see. They act only through the context
// (ADR 0055). A missing `every` is not filled in: the 0.1 s is the page's, not a fallback.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */

/** One pending forced try. `lostEgg` is the mode, once it has landed. */
const ASK = 'eggAsk';
const LOST = 'lostEgg';

/** @param {FoeContext} ctx */
const lost = (ctx) => ctx.self.buffs.some((b) => b.key === LOST);

/**
 * Stun, freeze or levitate only. A forced trigger cannot break those three; silence and the other unable-to-act
 * states are not in that list (敌能-57).
 * @param {FoeContext} ctx
 */
function held(ctx) {
  const f = ctx.stats(ctx.self).flags;
  return !!(f.stun || f.freeze || f.levitate);
}

/** One try, unless the egg is gone, it is dead, or those three states hold. @param {FoeContext} ctx */
function ask(ctx) {
  const self = ctx.self;
  if (lost(ctx) || self.hp <= 0 || held(ctx) || self.buffs.some((b) => b.key === ASK)) return;
  // Left at 1 so a try the skill does not take expires before the next interval, instead of blocking it.
  ctx.addBuff(self, { key: ASK, left: 1 });
}

/**
 * 失衡 just settled (敌能-57): the first try is this frame. A later 失衡, while the egg is still held, tries again and
 * restarts the interval; a mode already on does not run a second time.
 * @param {FoeContext} ctx
 */
function begin(ctx) {
  if (lost(ctx) || ctx.self.hp <= 0) return;
  ctx.state.set('on', 1);
  ctx.state.set('n', 0);
  ask(ctx);
}

/**
 * Later tries, every `every` seconds, and never during a slide: the page waits until 失衡 has ended (敌能-57).
 * @param {FoeContext} ctx
 */
function retry(ctx) {
  if (ctx.unbalanced || !ctx.state.get('on') || lost(ctx)) return;
  const every = ctx.bb.every;
  if (!(every > 0)) return;
  const span = ctx.frames(every);
  if (!(span > 0)) return;
  const n = ctx.state.get('n') + 1;
  if (n < span) { ctx.state.set('n', n); return; }
  ctx.state.set('n', 0);
  ask(ctx);
}

/** @type {FoeBehavior} */
const speed = Object.freeze({ tick: retry, unbalanceEnd: begin });

/**
 * The mode (敌能-57): no normal attack, unblockable, the talent's final move multiplier, and the block lets go on
 * this frame. `egg` is the page marker, so the other empty `switch` skills stay uncovered. One application.
 * @param {FoeContext} ctx
 */
function take(ctx) {
  if (ctx.bb.egg !== 1 || lost(ctx) || ctx.self.hp <= 0) return;
  if (!ctx.self.buffs.some((b) => b.key === ASK)) return;
  const mul = ctx.talent('speed')?.move_speed;
  if (!(typeof mul === 'number' && mul > 0)) return;
  ctx.removeBuff(ctx.self, ASK);
  ctx.addBuff(ctx.self, { key: LOST, flags: { noAttack: true, unblockable: true }, mods: { moveMul: mul } });
  ctx.release();
}

/** @type {FoeBehavior} */
const switchSkill = Object.freeze({ tick: take, unbalanceEnd: take });

/** The behaviours of this file, by talent and skill name. @type {Readonly<Record<string, FoeBehavior>>} */
export const pengBehaviors = Object.freeze({ speed, switch: switchSkill });
