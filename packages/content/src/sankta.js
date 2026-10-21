// 萨科塔 flyers (docs/spec/foes.md 敌能-49): self-fear the first time HP crosses under half, the eye's ammo theft,
// and the head's prayer roar. The numbers the pages add and the data does not are in FOE_EXTRAS. A same-named ability
// whose page was not read lacks them and does not act (关卡-2, INF-0394).

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit */

/**
 * The move column the page's wording picks (敌能-49, INF-0389). `speed_final` 1 is 「最终」: × `move_speed`.
 * Without it the direct column makes the result `move_speed` times the base (`movePct` = `move_speed` − 1).
 * @param {Record<string, number>} bb @returns {Record<string, number> | null}
 */
function speedMods(bb) {
  const v = bb.move_speed;
  if (typeof v !== 'number' || typeof bb.speed_duration !== 'number' || typeof bb.speed_final !== 'number') return null;
  return bb.speed_final === 1 ? { moveMul: v } : { movePct: v - 1 };
}

/**
 * HP crossed from at least half to under it this frame (敌能-49, INF-0388). The stored previous HP moves either way.
 * @param {FoeContext} ctx
 */
function halfCrossed(ctx) {
  const line = ctx.stats(ctx.self).maxHp * ctx.bb.hp_ratio, prev = ctx.state.get('hp');
  ctx.state.set('hp', ctx.self.hp);
  return ctx.state.get('seen') === 1 && prev >= line && ctx.self.hp < line;
}

/**
 * 自惧 (敌能-49). Once, on the crossing frame. A talent, so neither silence nor being unable to act stops it (如无特殊
 * 说明，天赋默认不可沉默). Catalog fear, sourced to itself; the speed is a plain buff.
 * @type {FoeBehavior}
 */
const SelfFear = Object.freeze({
  spawn: (ctx) => { ctx.state.set('hp', ctx.self.hp); ctx.state.set('seen', 1); },
  tick: (ctx) => {
    if (ctx.state.get('done') || typeof ctx.bb.hp_ratio !== 'number') return;
    if (!halfCrossed(ctx)) return;
    const mods = speedMods(ctx.bb);
    if (!mods || typeof ctx.bb.fear !== 'number') return;
    ctx.state.set('done', 1);
    ctx.applyStatus(ctx.self, 'fear', { seconds: ctx.bb.fear });
    ctx.addBuff(ctx.self, { key: 'selfFear', left: ctx.frames(ctx.bb.speed_duration), mods });
  },
});

/**
 * 夺弹 (敌能-49, INF-0391): at the hit, not as the swing starts. `steal` is the page's mark — without it this is not
 * the eye's ability. Cancelling the hit is the whole of 「不造成伤害」.
 * @param {FoeContext} ctx @param {Unit} target
 */
function stealAmmo(ctx, target) {
  const n = ctx.bb['attack@minus_bullet'];
  if (typeof ctx.bb.steal !== 'number' || typeof n !== 'number' || !(n >= 1) || ctx.ammoOf(target) < n) return false;
  ctx.spendAmmo(target, n);
  return true;
}

/**
 * 夺弹 (敌能-49). Flying motion is not a target; 起飞 is not flying. Not the shadow mages' `noFly` (敌能-33).
 * @type {FoeBehavior}
 */
const DamageOrBullet = Object.freeze({
  targets: (ctx, cands) => (typeof ctx.bb.steal === 'number' ? cands.filter((u) => !ctx.stats(u).flying) : cands),
  cancelHit: (ctx, target) => stealAmmo(ctx, target),
});

/** The page's roar, not another skill that shares the name (敌能-49). @param {FoeContext} ctx */
function pageRoar(ctx) {
  const bb = ctx.bb;
  return typeof bb.duration === 'number' && typeof bb.attack_speed === 'number' && typeof bb.air === 'number' && typeof bb.camou === 'number';
}

/** 隐匿 in effect, 无法选中, or 沉睡 (敌能-49, INF-0392). @param {Record<string, boolean>} flags */
const keptOut = (flags) => !!(flags.untargetable || flags.sleep || (flags.stealth && !flags.unstealth));

/** Whether this unit is invited (敌能-49). 不可对空 drops flying; 起飞 is not flying. 无视迷彩 keeps 迷彩. @param {FoeContext} ctx @param {Unit} u */
function keepsInvite(ctx, u) {
  const s = ctx.stats(u);
  if ((ctx.bb.air !== 1 && s.flying) || keptOut(s.flags)) return false;
  return ctx.bb.camou === 1 || !s.flags.camou;
}

/** One roar, while its own 15 s still runs (敌能-49, INF-0393): the cooldown starts the frame that counter hits 0. @param {FoeContext} ctx @param {number} left */
function roarWind(ctx, left) {
  const now = left - 1;
  ctx.state.set('left', now);
  if (now === 0) ctx.use();
}

/** The cast (敌能-49): blocked or with nobody to invite, it still starts. Silence and being unable to act only block this. @param {FoeContext} ctx */
function roarCast(ctx) {
  if (!ctx.ready || !pageRoar(ctx)) return;
  const s = ctx.stats(ctx.self);
  if (s.disabled || s.flags.silence) return;
  const frames = ctx.frames(ctx.bb.duration), mods = { aspd: ctx.bb.attack_speed };
  for (const u of ctx.ours()) if (keepsInvite(ctx, u)) ctx.renew(u, 'invited', frames, mods);
  ctx.state.set('left', frames);
}

/** 祈祷邀约 (敌能-49). The busy counter is this caster's; the buff key is shared, and a new cast replaces its time. @type {FoeBehavior} */
const Roar = Object.freeze({
  tick: (ctx) => {
    const left = ctx.state.get('left');
    if (left > 0) roarWind(ctx, left);
    else roarCast(ctx);
  },
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const sanktaBehaviors = Object.freeze({ SelfFear, DamageOrBullet, Roar });
