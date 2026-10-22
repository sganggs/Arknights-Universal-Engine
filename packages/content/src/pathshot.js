// Ammo shots and the dessert merchant's blocked attack (docs/spec/foes.md 敌能-81).
// `attack@headshot_trapdamage` is extra arts on an 冰淇淋机. AUE has no such device, so the number only identifies the shape.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').FoeContext} FoeContext */
/** @typedef {import('@aue/sim').Unit} Unit */
/** @typedef {import('@aue/sim').skills.AttackMods} AttackMods */

const SCALE = 'attack@headshot_atk_scale';
const SPEND = 'attack@headshot_sp';
const TRAP = 'attack@headshot_trapdamage';
const DISARM = 'attack@headshot_disarmed_duration';
const COMBAT = 'attack@combat_atk_scale';

/** Keys a headshot blackboard may hold. `page`, `ammo` and `see` are content extras, not enemy data. */
const HEAD_KEYS = new Set([SCALE, SPEND, TRAP, DISARM, 'page', 'ammo', 'see']);
/** Keys a merchant blackboard may hold. `page` and `melee` are content extras. */
const COMBAT_KEYS = new Set([COMBAT, 'page', 'melee']);

/** @param {Record<string, unknown>} bb @param {string} key */
const num = (bb, key) => typeof bb[key] === 'number';

/** @param {Record<string, unknown>} bb @param {Set<string>} allowed */
function onlyKeys(bb, allowed) {
  for (const k of Object.keys(bb)) if (!allowed.has(k)) return false;
  return true;
}

/** A content flag is absent or exactly 1. @param {Record<string, unknown>} bb @param {string} key */
const flag = (bb, key) => bb[key] === undefined || bb[key] === 1;

/**
 * The wrecker and messenger shape (敌能-81): scale, a spend and the trap number. Duration and the content extras are
 * optional. Snipers have no trap number; casters carry another ratio. Neither is this shape.
 * @param {Record<string, unknown>} bb
 */
function headShape(bb) {
  if (!num(bb, SCALE) || !num(bb, SPEND) || !num(bb, TRAP)) return false;
  if (!onlyKeys(bb, HEAD_KEYS) || !flag(bb, 'page') || !flag(bb, 'see')) return false;
  if (bb[DISARM] !== undefined && !num(bb, DISARM)) return false;
  return bb.ammo === undefined || num(bb, 'ammo');
}

/**
 * The merchant shape (敌能-81): the blocked scale, and optionally the page marker and `melee`.
 * @param {Record<string, unknown>} bb
 */
function combatShape(bb) {
  if (!num(bb, COMBAT) || !onlyKeys(bb, COMBAT_KEYS)) return false;
  return flag(bb, 'page') && flag(bb, 'melee');
}

/**
 * Whether a talent of this name, with this blackboard, is the shot this file runs (敌能-81). Any other name is not
 * this family's concern: the caller still asks FOE_NEEDS.
 * @param {string} name @param {Record<string, unknown>} bb
 */
export function shotbuffOwns(name, bb) {
  if (name !== 'shotbuff') return true;
  return headShape(bb) || combatShape(bb);
}

/** The read pages (敌能-81). Without the marker the shared name does nothing, so an unread user stays uncovered. @param {FoeContext} ctx */
const read = (ctx) => ctx.bb.page === 1;

/** A messenger: the shot also disarms and silences. The wreckers have no duration. @param {FoeContext['bb']} bb */
const messenger = (bb) => typeof bb[DISARM] === 'number';

/** Already under this shot's attached effect, from any source (敌能-81). @param {FoeContext} ctx @param {Unit} u */
function underEffect(ctx, u) {
  const f = ctx.stats(u).flags;
  return f.silence === true || f.noAttack === true;
}

/** @param {FoeContext} ctx @param {Unit[]} list */
const ground = (ctx, list) => list.filter((u) => !ctx.stats(u).flying);

/** @param {FoeContext} ctx @param {Unit[]} cands */
function blockerOnly(ctx, cands) {
  const b = ctx.blocker();
  return b ? cands.filter((u) => u === b) : [];
}

/**
 * No ammunition: only the blocker. `see` 1 (撕裂者) also drops a flying blocker — its 不会攻击飞行单位 is its own
 * sentence, and the melee fallback is the only place that still differs from 破坏者 (敌能-81).
 * @param {FoeContext} ctx @param {Unit[]} cands
 */
function meleeOf(ctx, cands) {
  const held = blockerOnly(ctx, cands);
  return ctx.bb.see === 1 ? ground(ctx, held) : held;
}

/** Drop units already silenced or disarmed while a clean one remains (敌能-81). @param {FoeContext} ctx @param {Unit[]} list */
function preferClean(ctx, list) {
  const clean = list.filter((u) => !underEffect(ctx, u));
  return clean.length > 0 ? clean : list;
}

/** @param {FoeContext} ctx @param {Unit[]} cands */
function headTargets(ctx, cands) {
  if (ctx.state.get('ammo') < 1) return meleeOf(ctx, cands);
  // 破坏者 / 撕裂者 never lock a flyer. A messenger keeps the engine's list, flying blocker included (敌人攻击-1).
  const list = messenger(ctx.bb) ? cands : ground(ctx, cands);
  return messenger(ctx.bb) ? preferClean(ctx, list) : list;
}

/** @param {FoeContext} ctx @param {Unit[]} cands */
function merchantTargets(ctx, cands) {
  if (ctx.bb.melee !== 1) return cands;
  const list = ground(ctx, cands);
  return ctx.blocked ? blockerOnly(ctx, list) : list;
}

/** @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods} */
function headAttack(ctx, mods) {
  const st = ctx.state;
  if (st.get('ammo') < 1) {
    st.set('live', 0);
    return { ...mods, direct: true };
  }
  // 「攻击时」 and 「成功攻击前」 both spend as the swing starts, before the hit (敌能-81).
  st.set('ammo', st.get('ammo') + ctx.bb[SPEND]);
  st.set('live', 1);
  const scaled = { ...mods, scale: ctx.bb[SCALE] };
  if (messenger(ctx.bb)) return scaled;
  return { ...scaled, square: true, splashScale: 1 };
}

/** @param {FoeContext} ctx @param {AttackMods} mods @returns {AttackMods} */
function merchantAttack(ctx, mods) {
  if (!ctx.blocked) return mods;
  const scaled = { ...mods, scale: ctx.bb[COMBAT] };
  return ctx.bb.melee === 1 ? { ...scaled, direct: true } : scaled;
}

/**
 * `shotbuff` (敌能-81). The read pages carry `page` 1. Ammunition, when the page gives it, starts full and never
 * refills. A messenger's hit applies 缴械 (`noAttack`) and 沉默 only after that hit took HP (敌能-2).
 * @type {FoeBehavior}
 */
const shotbuff = Object.freeze({
  spawn: (ctx) => {
    if (!read(ctx)) return;
    if (typeof ctx.bb.ammo === 'number') ctx.state.set('ammo', ctx.bb.ammo);
    // 撕裂者 selects through 迷彩. The flag has to be on before `enemyTargets` reads it.
    if (ctx.bb.see === 1) ctx.addBuff(ctx.self, { key: 'seeCamou', flags: { seeCamou: true } });
  },
  targets: (ctx, cands) => {
    if (!read(ctx)) return cands;
    return typeof ctx.bb[COMBAT] === 'number' ? merchantTargets(ctx, cands) : headTargets(ctx, cands);
  },
  attack: (ctx, mods) => {
    if (!read(ctx)) return mods;
    return typeof ctx.bb[COMBAT] === 'number' ? merchantAttack(ctx, mods) : headAttack(ctx, mods);
  },
  hit: (ctx, target) => {
    const seconds = ctx.bb[DISARM];
    // `live` is the shot that just started. The spend has already taken the round, so remaining ammunition is not the gate.
    if (!read(ctx) || ctx.state.get('live') !== 1 || typeof seconds !== 'number') return;
    ctx.applyStatus(target, 'silence', { seconds });
    ctx.addBuff(target, { key: 'shotbuffDisarm', left: ctx.frames(seconds), flags: { noAttack: true } });
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const shotbuffBehaviors = Object.freeze({ shotbuff });
