// 阵地足球's players (docs/spec/football.md 足球-9…足球-11, 足球-15): a forward or a goalkeeper (talent `football`) chases
// a free ball within its `searchBall` radius, and one within its reach it stops, holds and — at its skill's hit — kicks:
// the forward shoots at our goal or passes to the player nearest it, the goalkeeper clears to the middle column. The
// muscleman (`searchtarget`) chases the nearest of our units that can block. Each is revived at full HP, any number of
// times (`Reborn` with a `duration` only). The skills `slapshot`, `passtheball` and `clearance` are read here; what a
// team does beyond that is teams.js's.
import { KIND } from '@aue/schema';
import { beginRevival, endRebirth, avengerBehaviors } from './avenger.js';
import { MARK, RAGE, DRIBBLE, dist2, anyOf, openGoalTile, clearGoalTile, forwards, nearBall, kickless, teamBehaviors } from './teams.js';

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** The buff of a 门神会 goalkeeper waiting for its forward's pass (锦标-3): it stays where it is. */
export const AWAIT = 'await';
/** Seconds it waits at most (锦标-3; the data's `goalkeeper_nomove`). */
const AWAIT_SECONDS = 2;

/** A forward's reach for a ball (足球-10: 「半径0.2范围内」); a goalkeeper's is its `football.defence`. */
const FORWARD_REACH = 0.2;

/** The skills this file reads, by role: the forward's pass and shot, the goalkeeper's clearance (足球-10). */
export const KICK_SKILLS = Object.freeze(['passtheball', 'slapshot', 'clearance']);

/**
 * The kicks of the players of each team (足球-10): the hit and the end of the skill, seconds from its start — the
 * OnAttack event and the length of its clip in the player's model (PRTS's copy, torappu.prts.wiki/assets/enemy_spine/<key>/):
 * a forward's pass is Skill1 and its shot Skill2, in the order of its skills; a goalkeeper, with no skill clip, clears
 * with Attack. @type {Readonly<Record<string, Readonly<Record<string, readonly [number, number]>>>>}
 */
const TEAM_KICKS = Object.freeze({
  enemy_4012_mumssi: { passtheball: [1.033, 1.467], slapshot: [1.433, 2.033] },
  enemy_4022_mushtm: { passtheball: [0.8, 1.5], slapshot: [0.767, 1.5] },
  enemy_4025_muhrym: { passtheball: [0.8, 1.5], slapshot: [1.3, 2.033] },
  enemy_4028_mukfum: { passtheball: [0.8, 1.5], slapshot: [1.3, 2.033] },
  enemy_4013_mubufn: { clearance: [0.367, 1.333] },
  enemy_4023_mushtb: { clearance: [0.367, 1.333] },
  enemy_4026_muhryb: { clearance: [0.367, 1.333] },
  enemy_4029_mukfub: { clearance: [0.367, 1.333] },
});

/**
 * Each player's kicks (足球-10): a team's, and its elite player's (`_2`) — each elite model's Skill1, Skill2 and Attack
 * have the same lengths and OnAttack times as its player's (both models read, isHarryh/Ark-Models@8a3857c).
 */
export const KICK_TIMES = Object.freeze({ ...TEAM_KICKS, ...Object.fromEntries(Object.entries(TEAM_KICKS).map(([k, v]) => [`${k}_2`, v])) });

/** Whether an enemy is a player (足球-9): it has `football` or `searchtarget`. @param {FoeContext} ctx @param {Unit} u */
const isPlayer = (ctx, u) => !!(ctx.talentOf(u, 'football') || ctx.talentOf(u, 'searchtarget'));

/**
 * Whether a player moves on its own this frame (足球-9): not waiting for the kickoff, not reviving, not blocked, not
 * in a swing, able to move. @param {FoeContext} ctx
 */
export function onItsOwn(ctx) {
  const s = ctx.stats(ctx.self);
  return !ctx.blocked && !ctx.self.swing && !s.immobile && !s.flags.kickoff && !s.flags.sidelined;
}

/**
 * The players on the field, itself too (足球-10). @param {FoeContext} ctx
 */
const players = (ctx) => ctx.enemies().filter((u) => isPlayer(ctx, u) && !ctx.stats(u).flags.sidelined);

/** A goal's nearest distance from a point, squared (足球-10). @param {FoeContext} ctx @param {{ x: number, y: number }} p */
const toOurGoal = (ctx, p) => Math.min(...ctx.goalTiles('ours').map((g) => dist2(p, g)));

/** The unit of a list nearest our goal, the first on the field on a tie (足球-10). @param {FoeContext} ctx @param {Unit[]} list */
const nearestGoal = (ctx, list) => list.toSorted((a, b) => toOurGoal(ctx, a) - toOurGoal(ctx, b) || a.id - b.id)[0] ?? null;

/**
 * A forward's choice (足球-10): it shoots when it is the player nearest our goal or the only player; otherwise it shoots
 * by a chance of 1 in (the players + 1), and passes to the player nearest our goal.
 * @param {FoeContext} ctx @returns {{ skill: 'slapshot' | 'passtheball', to: Unit | null }}
 */
function forwardChoice(ctx) {
  const all = players(ctx), others = all.filter((u) => u !== ctx.self), keeper = ctx.bb.toKeeper ? keeperOf(ctx, others) : null;
  if (keeper) return { skill: 'passtheball', to: keeper };
  if (others.length === 0 || nearestGoal(ctx, all) === ctx.self) return { skill: 'slapshot', to: null };
  if (ctx.draw() < 1 / (all.length + 1)) return { skill: 'slapshot', to: null };
  return { skill: 'passtheball', to: nearestGoal(ctx, others) };
}

/** The goalkeeper nearest it among the other players (锦标-3: 门神会), or null. @param {FoeContext} ctx @param {Unit[]} others */
const keeperOf = (ctx, others) => others.filter((u) => typeof ctx.talentOf(u, 'football')?.clearance_force === 'number')
  .toSorted((a, b) => dist2(ctx.self, a) - dist2(ctx.self, b) || a.id - b.id)[0] ?? null;

/** The middle column's target (足球-10): a random row of the goal's, in the column ⌊their goal ÷ 2⌋. @param {FoeContext} ctx */
function middle(ctx) {
  const mid = ctx.goalTiles('theirs')[0]?.x ?? 12, rows = ctx.goalTiles('ours').map((g) => g.y);
  return { x: Math.floor(mid / 2), y: anyOf(ctx, rows) ?? ctx.self.y };
}

/**
 * Where a kick goes (足球-10, 足球-15): a 战术队 forward's (`aim`) shot and pass at an open tile of our goal; a shot at
 * the centre of a random tile of our goal; a pass at the player chosen; a clearance — a 战术队 goalkeeper's at a tile of
 * our goal it has a clear line to, an 爱球会 goalkeeper's (`toForward`) at the forward nearest our goal — at a random
 * row of the middle column. @param {FoeContext} ctx @param {string} skill @param {Unit | null} to
 * @returns {{ x: number, y: number }}
 */
function kickTarget(ctx, skill, to) {
  const bb = ctx.bb;
  if (skill === 'clearance') {
    const fw = bb.toForward ? nearestGoal(ctx, forwards(ctx)) : null;
    return (bb.aim ? clearGoalTile(ctx) : null) ?? (fw ? { x: fw.x, y: fw.y } : middle(ctx));
  }
  if (bb.aim) return openGoalTile(ctx) ?? { x: 0, y: ctx.self.y };
  if (skill === 'passtheball' && to) return { x: to.x, y: to.y };
  return anyOf(ctx, ctx.goalTiles('ours')) ?? { x: 0, y: ctx.self.y };
}

/** The ball a player kicks, by id from its state, or null. @param {FoeContext} ctx */
const heldBall = (ctx) => ctx.balls().find((b) => b.id === ctx.state.get('ball')) ?? null;

/**
 * The kick under way (足球-10): at its hit the ball still within reach is kicked at its force × the skill's scale toward
 * the target noted at the start — with a 球德联 shot's hurt (足球-15); a 直球队 shot or clearance straight toward our
 * side (锦标-3) —; until the skill's end the player stays.
 * Whether it is under way. @param {FoeContext} ctx
 */
function kickUnderWay(ctx) {
  const st = ctx.state, hit = st.get('hit'), end = st.get('end');
  if (!(end > ctx.frame)) return false;
  if (hit === ctx.frame) {
    const b = heldBall(ctx), reach = st.get('reach'), to = st.get('flat') ? { x: ctx.self.x - 1, y: b?.y ?? 0 } : { x: st.get('tx'), y: st.get('ty') };
    if (b && dist2(ctx.self, b) <= reach * reach) {
      const dx = to.x - b.x, dy = to.y - b.y, d = Math.sqrt(dx * dx + dy * dy), scale = st.get('scale'), hurt = st.get('hurt') ? ctx.skillBb('slapshot') : null;
      ctx.holdBall(b, 1);
      if (d > 0) ctx.kickBall(b, dx / d, dy / d, scale, hurt ? { amount: hurt.ball_damage, every: hurt.damage_duration, seconds: hurt.aoe_duration } : undefined);
    }
  }
  ctx.chase(ctx.self.x, ctx.self.y);
  return true;
}

/**
 * The carry under way (足球-15: 爱球会's 带球): from its start, while the ball is still at its feet — not kicked away,
 * not caught —, the forward goes for the nearest tile of our goal with the ball, faster and taking more block (the buff
 * `dribble`); before its start it stays with the ball held. Whether it is under way. @param {FoeContext} ctx
 */
function dribbleUnderWay(ctx) {
  const st = ctx.state, from = st.get('dFrom'), to = st.get('dTo');
  if (!(to > ctx.frame)) return false;
  const b = heldBall(ctx);
  const reach = st.get('reach');
  if (!b || b.slide || dist2(ctx.self, b) > reach * reach + 1e-9) {
    st.set('dTo', 0);
    ctx.removeBuff(ctx.self, DRIBBLE);
    return false;
  }
  if (ctx.frame < from) { ctx.holdBall(b, 1); return true; }
  if (ctx.frame === from) {
    const bb = ctx.skillBb('slapshot') ?? {};
    ctx.addBuff(ctx.self, { key: DRIBBLE, left: to - from, mods: { blockCnt: bb.block_volume ?? 0, movePct: bb.move_speed ?? 0 } });
  }
  const g = nearestGoal(ctx, /** @type {Unit[]} */ (/** @type {unknown} */ (ctx.goalTiles('ours'))));
  if (g && onItsOwn(ctx)) ctx.chase(g.x, g.y);
  ctx.carry(b);
  return true;
}

/**
 * A kick's hit and end, seconds from its start (足球-10): by KICK_TIMES, none listed at once; in their 锦标 penalty
 * round at the touch (锦标-4: 「射门手将在靠近足球后立即踢出」). @param {FoeContext} ctx @param {string} skill
 * @returns {readonly [number, number]}
 */
const kickTimes = (ctx, skill) => (ctx.penalty() === 'theirs' ? [0, 0] : KICK_TIMES[ctx.self.key]?.[skill] ?? [0, 0]);

/**
 * Starts a kick (足球-10, 足球-15): the ball within reach stops and is held; the skill, its target and its scale are
 * noted, its hit and end by KICK_TIMES (none listed, or their 锦标 penalty round: at once). In our 锦标 penalty round a
 * goalkeeper only stops the ball. An 爱球会 forward's shot is a carry: `duration` seconds
 * on, for `up_duration` seconds. @param {FoeContext} ctx @param {Unit} b @param {Record<string, number>} bb @param {number} reach
 */
function startKick(ctx, b, bb, reach) {
  const goalkeeper = typeof bb.clearance_force === 'number';
  // our 锦标 penalty: their goalkeeper stops the ball and that is the round (锦标-4: 「失球！」)
  if (goalkeeper && ctx.penalty() === 'ours') { ctx.holdBall(b, 1); return; }
  const { skill, to } = goalkeeper ? { skill: 'clearance', to: null } : forwardChoice(ctx);
  const st = ctx.state, shot = skill === 'slapshot' ? ctx.skillBb('slapshot') : null;
  st.set('ball', b.id);
  st.set('reach', reach);
  // their 锦标 penalty: no carry, the touch is the shot (锦标-4)
  if (typeof shot?.up_duration === 'number' && ctx.penalty() !== 'theirs') {
    const from = ctx.frame + ctx.frames(shot.duration ?? 0);
    st.set('dFrom', from);
    st.set('dTo', from + ctx.frames(shot.up_duration));
    ctx.holdBall(b, 1);
    return;
  }
  const [h, e] = kickTimes(ctx, skill), hit = ctx.frames(h), end = Math.max(hit + 1, ctx.frames(e));
  const t = kickTarget(ctx, skill, to);
  ctx.holdBall(b, hit + 1);
  st.set('hit', ctx.frame + hit); st.set('end', ctx.frame + end);
  st.set('tx', t.x); st.set('ty', t.y);
  noteKick(ctx, skill, bb, shot, to);
  if (hit === 0) kickUnderWay(ctx);
}

/**
 * What a kick started notes (足球-10, 足球-15, 锦标-3): its scale, a 球德联 shot's hurt, a 直球队 shot's or clearance's
 * flat line; a 门神会 pass makes its goalkeeper wait for the ball.
 * @param {FoeContext} ctx @param {string} skill @param {Record<string, number>} bb @param {Record<string, number> | null} shot @param {Unit | null} to
 */
function noteKick(ctx, skill, bb, shot, to) {
  const st = ctx.state;
  st.set('scale', skill === 'clearance' ? bb.clearance_force : skill === 'slapshot' ? bb.slapshot_force : bb.passing_force);
  st.set('hurt', typeof shot?.ball_damage === 'number' ? 1 : 0);
  st.set('flat', bb.flat && skill !== 'passtheball' ? 1 : 0);
  if (skill === 'passtheball' && bb.toKeeper && to) ctx.addBuff(to, { key: AWAIT, src: ctx.self.id, left: ctx.frames(AWAIT_SECONDS), flags: { root: true } });
}

/**
 * Whether a goalkeeper may go for a ball (足球-9): its `tile_col_end` is the last column toward our goal it goes to.
 * @param {Record<string, number>} bb @param {{ x: number }} b
 */
const inArea = (bb, b) => typeof bb.tile_col_end !== 'number' || Math.round(b.x) >= bb.tile_col_end;

/** The operator of ours nearest it on the field, or null (足球-15). @param {FoeContext} ctx */
const nearestOperator = (ctx) => ctx.ours().filter((u) => u.kind === KIND.OPERATOR).toSorted((a, b) => dist2(ctx.self, a) - dist2(ctx.self, b) || a.id - b.id)[0] ?? null;

/**
 * `football` (足球-9, 足球-10, 足球-15): on its own, a free ball within its reach is kicked; else it goes for the nearest
 * free ball within its `searchBall` radius. A goalkeeper's reach is its `defence`, a forward's 0.2. A raging 球德联
 * goalkeeper goes for the nearest of our operators instead, a player with no kick of its own (爱球会's muscleman) for
 * ours near the ball.
 * @type {FoeBehavior}
 */
const football = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, reach = typeof bb.defence === 'number' ? bb.defence : FORWARD_REACH;
    // a 门神会 goalkeeper waits for the pass until a ball is within its reach (锦标-3)
    if (ctx.buffValue(ctx.self, AWAIT) !== null && ctx.balls().some((b) => dist2(ctx.self, b) <= reach * reach)) ctx.removeBuff(ctx.self, AWAIT);
    if (kickUnderWay(ctx) || dribbleUnderWay(ctx) || !onItsOwn(ctx)) return;
    const radius = ctx.talent('searchBall')?.range_radius ?? 0;
    if (ctx.buffValue(ctx.self, RAGE) !== null) {
      const op = nearestOperator(ctx);
      if (op) ctx.chase(op.x, op.y);
      return;
    }
    if (kickless(ctx)) { nearBall(ctx, radius); return; }
    const free = ctx.balls().filter((b) => ctx.freeBall(b) && inArea(bb, b)).toSorted((a, b) => dist2(ctx.self, a) - dist2(ctx.self, b) || a.id - b.id);
    const near = free[0];
    if (!near || dist2(ctx.self, near) > radius * radius) return;
    // it stays from the touch on (足球-10): no step of its route takes the ball out of its reach
    if (dist2(ctx.self, near) <= reach * reach) { startKick(ctx, near, bb, reach); ctx.chase(ctx.self.x, ctx.self.y); return; }
    ctx.chase(near.x, near.y);
  },
});

/**
 * `searchtarget` (足球-11, 足球-15): on its own, the muscleman goes for the nearest of our units within `range_radius`
 * that can block (a block count above 0); a 战术队 muscleman with a mark (teams.js) goes for the unit it marked; a 魔球帮
 * muscleman (`nearBall`, 锦标-3) for the one of ours nearest the ball, within that radius of it.
 * @type {FoeBehavior}
 */
const searchtarget = Object.freeze({
  tick: (ctx) => {
    const r = ctx.bb.range_radius;
    if (typeof r !== 'number' || !onItsOwn(ctx)) return;
    const marked = ctx.buffValue(ctx.self, MARK), m = marked !== null ? ctx.unit(marked) : null;
    if (m) { ctx.chase(m.x, m.y); return; }
    if (ctx.bb.nearBall) { nearBall(ctx, r); return; }
    const near = ctx.ours().filter((u) => ctx.stats(u).blockCnt > 0 && dist2(ctx.self, u) <= r * r).toSorted((a, b) => dist2(ctx.self, a) - dist2(ctx.self, b) || a.id - b.id)[0];
    if (near) ctx.chase(near.x, near.y);
  },
});

/** Whether a `Reborn` is a player's (足球-9): a `duration` and no `hp_ratio`. @param {Record<string, unknown>} bb */
export const playerReborn = (bb) => typeof bb.duration === 'number' && !('hp_ratio' in bb);

/**
 * `Reborn` by its shape (敌能-18, 足球-9): a player's — a `duration` only — every knockdown, its HP back to the maximum
 * and `duration` seconds of 敌能-18's reviving; another the avenger's, once, at `hp_ratio`.
 * @type {FoeBehavior}
 */
const Reborn = Object.freeze({
  fatal: (ctx) => (playerReborn(ctx.bb) ? beginRevival(ctx, 1) : avengerBehaviors.Reborn.fatal?.(ctx) ?? false),
  tick: (ctx) => { endRebirth(ctx); },
});

/** Whether a `Reborn` has a shape it understands (敌能-18, 足球-9): the avenger's `hp_ratio`, or a player's. @param {string} k @param {Record<string, unknown>} bb */
export const rebornShape = (k, bb) => k !== 'Reborn' || typeof bb.hp_ratio === 'number' || playerReborn(bb);

/** `periodic_damage` of 0 does nothing (足球-11: the muscleman's). @param {string} k @param {Record<string, unknown>} bb */
export const noPeriodic = (k, bb) => k === 'periodic_damage' && bb.damage === 0 && !('self' in bb);

/** The behaviours of this file and teams.js, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const footballerBehaviors = Object.freeze({ football, searchtarget, Reborn, ...teamBehaviors });
