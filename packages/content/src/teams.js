// 阵地足球's teams (docs/spec/football.md 足球-15): what a team's players do beyond the standard team's — 战术队 aims at
// an open goal, 爱球会's forward carries the ball and its goalkeeper clears to a forward, 爱球会's muscleman goes for ours
// near the ball, 球德联's shot hurts ours it rolls by and its goalkeeper rages, 战术队's muscleman goes for one of ours
// that hit another player. The page markers (`aim`, `toForward`) are foes.js's FOE_EXTRAS. 阵地足球锦标's teams
// (cup.md 锦标-3) are footballers.js's and blink.js's.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior @typedef {import('@aue/sim').FoeContext} FoeContext @typedef {import('@aue/sim').Unit} Unit */

/** The buff of a 战术队 muscleman chasing a marked unit (足球-15): its value the unit's id. */
export const MARK = 'mark';
/** The buff of a raging 球德联 goalkeeper (足球-15). */
export const RAGE = 'rage';
/** The buff of a forward carrying the ball (足球-15). */
export const DRIBBLE = 'dribble';

/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
export const dist2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);

/** One of a list at random (随机-1), or null for none. @param {FoeContext} ctx @template T @param {T[]} list @returns {T | null} */
export const anyOf = (ctx, list) => (list.length > 0 ? list[Math.floor(ctx.draw() * list.length)] : null);

/**
 * Where a 战术队 forward aims (足球-15): a random tile of our goal with no barrier and no goalkeeper in front; with
 * none, any tile of it. @param {FoeContext} ctx
 */
export function openGoalTile(ctx) {
  const goal = ctx.goalTiles('ours');
  return anyOf(ctx, goal.filter((g) => ctx.goalOpen(g))) ?? anyOf(ctx, goal);
}

/** Where a 战术队 goalkeeper clears (足球-15): a random tile of our goal it has a clear line to, or null. @param {FoeContext} ctx */
export const clearGoalTile = (ctx) => anyOf(ctx, ctx.goalTiles('ours').filter((g) => ctx.clearLine(g.x, g.y)));

/**
 * The forwards on the field (足球-15): players with a pass or a shot of their own.
 * @param {FoeContext} ctx @returns {Unit[]}
 */
export const forwards = (ctx) => ctx.enemies().filter((u) => ctx.talentOf(u, 'football') && !ctx.stats(u).flags.sidelined && typeof ctx.talentOf(u, 'football')?.slapshot_force === 'number' && u !== ctx.self);

/**
 * A muscleman of 爱球会 (足球-15): a `football` player with no kick of its own goes for the one of ours that can block
 * nearest the ball nearest it, within its `searchBall` radius of that ball. Whether it moved.
 * @param {FoeContext} ctx @param {number} radius
 */
export function nearBall(ctx, radius) {
  const t = nearBallTarget(ctx, radius);
  return t ? ctx.chase(t.x, t.y) : false;
}

/**
 * The one of ours that can block nearest the ball nearest this enemy, within `radius` of that ball, or null (足球-15,
 * 锦标-3). @param {FoeContext} ctx @param {number} radius @returns {Unit | null}
 */
export function nearBallTarget(ctx, radius) {
  const ball = ctx.balls().toSorted((a, b) => dist2(ctx.self, a) - dist2(ctx.self, b) || a.id - b.id)[0];
  if (!ball) return null;
  return ctx.ours().filter((u) => ctx.stats(u).blockCnt > 0 && dist2(ball, u) <= radius * radius).toSorted((a, b) => dist2(ball, a) - dist2(ball, b) || a.id - b.id)[0] ?? null;
}

/**
 * Whether an enemy has no kick of its own (足球-15: 爱球会's muscleman): no pass, shot or clearance among its skills.
 * @param {FoeContext} ctx
 */
export const kickless = (ctx) => !ctx.skillBb('passtheball') && !ctx.skillBb('slapshot') && !ctx.skillBb('clearance');

/**
 * 球德联's goalkeeper (足球-15, `rage`): once its HP is at most `hp_ratio` of the maximum, `rage_duration` seconds of
 * 攻击力 + `atk` and 防御力 + `def` (直接乘算), once until its HP is full again (a revival).
 * @type {FoeBehavior}
 */
const rage = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, self = ctx.self, st = ctx.state;
    if (self.hp >= self.maxHp) st.set('raged', 0);
    if (st.get('raged') || !(self.hp <= self.maxHp * bb.hp_ratio)) return;
    st.set('raged', 1);
    ctx.addBuff(self, { key: RAGE, src: self.id, left: ctx.frames(bb.rage_duration), mods: { atkPct: bb.atk, defPct: bb.def } });
  },
});

/**
 * 战术队's muscleman (足球-15, `passiveMarkTarget`): off its cooldown, when an operator of ours hit another player, it
 * marks that operator — `duration` seconds of 移动速度 + `move_speed` and chasing it (searchtarget reads the mark) —
 * and its `cooldown` starts. @type {FoeBehavior}
 */
const passiveMarkTarget = Object.freeze({
  tick: (ctx) => {
    const bb = ctx.bb, st = ctx.state, self = ctx.self;
    if (ctx.frame < st.get('cd')) return;
    const hit = ctx.hits().find((h) => {
      const t = ctx.unit(h.target);
      return h.target !== self.id && t && (ctx.talentOf(t, 'football') || ctx.talentOf(t, 'searchtarget')) && ctx.unit(h.source);
    });
    if (!hit) return;
    st.set('cd', ctx.frame + ctx.frames(bb.cooldown));
    ctx.addBuff(self, { key: MARK, src: self.id, left: ctx.frames(bb.duration), value: hit.source, mods: { movePct: bb.move_speed } });
  },
});

/** The behaviours of this file, by talent name. @type {Readonly<Record<string, FoeBehavior>>} */
export const teamBehaviors = Object.freeze({ rage, passiveMarkTarget });
