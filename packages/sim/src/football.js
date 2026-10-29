// 阵地足球 (docs/spec/football.md): the ball's hook — a hit on a ball deals it nothing and adds to its kick (足球-3) —,
// the abilities' way to make an enemy a ball (足球-2), and the match (足球-6, 足球-7): the team drawn for it, each
// kickoff's layout by the lead, the players' wait, a goal scored — the field cleared, our operators retreat — and the
// time up with its stamps.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { on } from './bus.js';
import { makeBall, ballHit, chargeBall, kicker, FORCE_TO_SPEED, GOAL_TILES, goalOf, scored, clearLine, hurtStep } from './ball.js';
import { kickSlide, stopSlide } from './displacement.js';
import { displace, speedOf } from './routes.js';
import { tileAt } from './level.js';
import { passable } from './paths.js';
import { addBuff, makeBuff } from './buffs.js';
import { releaseAll } from './blocking.js';
import { weightedPick, draw } from './rng.js';
import { withdraw } from './deck.js';
import { withdrawDevice } from './devices.js';
import { makeSpot, expireBalls, goalOpen } from './pitch.js';
import { turnLR } from './lr.js';
import { isCup, isPlayerKey, cupEnd, penaltySide, penaltyWave, startCountdown, stadiumKickoff, stadiumSpeed } from './cup.js';
import { refereeStep } from './referee.js';
import { thunderStep } from './thunder.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/** @typedef {import('./types.js').FootballState} FootballState @typedef {import('./types.js').FootballRules} FootballRules */

/** The owner of the ball's hook (钩子-1). */
const OWNER = 'ball';

/** Whether a unit is a device whose damage with no source is scaled (足球-12). @param {Content} c @param {Unit} u */
const envScaled = (c, u) => u.kind === KIND.DEVICE && typeof c.devices?.[u.key]?.envDamage === 'number';

/**
 * Notes a hit an operator of ours dealt an enemy — not a ball nor a 守门位 — in 阵地足球 (足球-15).
 * @param {World} w @param {Unit} t @param {Unit | null} by
 */
function noteHit(w, t, by) {
  const st = w.football;
  if (st && by?.kind === KIND.OPERATOR && t.kind === KIND.ENEMY && !t.ball && !t.spot) (st.hits ??= []).push([t.id, by.id, w.frame]);
}

/**
 * What a hit on a ball does (足球-3, 锦标-4): while its penalty countdown runs it is summed and kicks nothing; in their
 * penalty round ours count for nothing; else it may kick the ball at its force. @param {World} w @param {Unit} b
 * @param {Unit | null} src @param {number} amount
 */
function hitBall(w, b, src, amount) {
  if (b.ball?.countdown !== undefined) { chargeBall(b, src, amount); return; }
  if (penaltySide(w) === 'theirs' && src && kicker(src)) return;
  const dir = ballHit(b, src, amount);
  if (dir && b.ball) kickSlide(b, dir[0], dir[1], b.ball.force * FORCE_TO_SPEED);
}

/**
 * The ball's hook (足球-2, 足球-3, 足球-12, 足球-15, 钩子-3), once per world in 阵地足球 or while it has a ball or a
 * device whose damage with no source is scaled — hooks are no state (ADR 0057): a hit on a ball deals it nothing, and
 * what it adds may kick the ball at its force (hitBall); damage with no source to such a device is × its `envDamage`;
 * a hit of an operator's on another enemy is noted.
 * @param {World} w @param {Content} c
 */
export function ballHooks(w, c) {
  if (!(w.football || w.units.some((u) => u.ball || envScaled(c, u))) || w.bus?.hooks.get('hpDamage')?.some((h) => h.owner === OWNER)) return;
  on(w, 'hpDamage', (ctx) => {
    const b = ctx.target;
    if (!b.ball) {
      if (!ctx.credit && envScaled(c, b)) ctx.amount *= /** @type {number} */ (c.devices?.[b.key]?.envDamage);
      noteHit(w, b, ctx.credit);
      return;
    }
    hitBall(w, b, ctx.source, ctx.amount);
    ctx.amount = 0;
  }, { owner: OWNER });
}

/** The centres of a goal's tiles (足球-1), in row order. @param {Content} c @param {'ours' | 'theirs'} which */
export function goalTiles(c, which) {
  const m = c.level, key = GOAL_TILES[which], out = [];
  for (let r = 0; r < m.height; r++) for (let col = 0; col < m.width; col++) if (m.tiles[r][col]?.key === key) out.push({ x: col, y: r });
  return out;
}

/**
 * One frame of a player moving on its own toward a point (足球-9): a straight step at its speed (路线-1's speed, none
 * while it cannot move), onto a tile it may stand on — not a 类障碍物地块 (足球-12) —; that is its move this frame. At
 * the point already it stays there, its route not walked (足球-10: still through a kick). Whether it moved or stayed.
 * @param {World} w @param {Content} c @param {Unit} e @param {number} x @param {number} y
 */
export function chaseStep(w, c, e, x, y) {
  const sp = speedOf(c, e), dx = x - e.x, dy = y - e.y, d = Math.sqrt(dx * dx + dy * dy);
  if (!(sp > 0)) return false;
  if (!(d > 0)) { e.ab['@held'] = w.frame; return true; }
  const k = d <= sp ? 1 : sp / d, nx = e.x + dx * k, ny = e.y + dy * k, t = tileAt(c.level, Math.round(ny), Math.round(nx));
  if (!passable(t, false) || t?.obstacle) return false;
  turnLR(e, dx);
  displace(e, nx, ny);
  e.ab['@held'] = w.frame;
  return true;
}

/**
 * The context's 阵地足球 members (足球-2, 足球-9, 足球-13): make the enemy a ball (its hook on at once); the balls on the field;
 * whether a ball is free for it — no other player holds it —; hold a ball — it stops and is this player's for that many
 * frames —; kick a ball at its default force × a scale, which frees it; a goal's tiles; a move toward a point; make
 * the enemy a 守门位.
 * @param {World} w @param {Content} c @param {Unit} e
 * @returns {Pick<import('./foes.js').FoeContext, 'ball' | 'balls' | 'freeBall' | 'holdBall' | 'kickBall' | 'goalTiles' | 'chase' | 'goalSpot' | 'carry'
 *   | 'goalOpen' | 'clearLine' | 'hits' | 'skillBb' | 'ballNeed' | 'countdown' | 'penalty'>}
 */
export function footballContext(w, c, e) {
  return {
    ball: (p) => { makeBall(e, p); ballHooks(w, c); },
    balls: () => w.units.filter((u) => u.ball && u.hp > 0 && !u.hidden && u.ball.goal === undefined),
    freeBall: (b) => !!b.ball && (b.ball.sel === undefined || b.ball.sel === e.id || (b.ball.selUntil ?? 0) <= w.frame),
    holdBall: (b, frames) => { if (!b.ball) return; stopSlide(b); b.ball.sel = e.id; b.ball.selUntil = w.frame + frames; },
    kickBall: (b, ux, uy, scale, hurt) => {
      if (!b.ball) return;
      delete b.ball.sel;
      delete b.ball.selUntil;
      kickSlide(b, ux, uy, b.ball.force * scale * FORCE_TO_SPEED);
      if (hurt) {
        const every = secondsToFrames(hurt.every);
        b.ball.hurt = { amount: hurt.amount, every, next: w.frame + every, until: w.frame + secondsToFrames(hurt.seconds) };
      }
    },
    goalTiles: (which) => goalTiles(c, which),
    ballNeed: (d) => { if (e.ball) e.ball.need = Math.max(0, e.ball.need + d); },
    chase: (x, y) => chaseStep(w, c, e, x, y),
    goalSpot: (block) => makeSpot(e, block),
    carry: (b) => carry(w, c, e, b),
    goalOpen: (g) => goalOpen(w, c, g),
    clearLine: (x, y) => clearLine(w, c, e, { x, y }),
    hits: () => (w.football?.hits ?? []).filter(([, , f]) => f >= w.frame - 1).map(([target, source]) => ({ target, source })),
    skillBb: (name) => c.enemies[e.key]?.skills?.find((s) => s.key === name)?.bb ?? null,
    countdown: (seconds) => startCountdown(w, e, seconds),
    penalty: () => penaltySide(w),
  };
}

/**
 * A player carries a ball (足球-15: 带球): the ball is at its centre, this player's for the frame; a ball that goes into
 * a goal so is scored (足球-5). @param {World} w @param {Content} c @param {Unit} e @param {Unit} b
 */
function carry(w, c, e, b) {
  if (!b.ball || b.slide) return;
  displace(b, e.x, e.y);
  b.ball.sel = e.id;
  b.ball.selUntil = w.frame + 1;
  const goal = goalOf(c, b);
  if (goal) scored(w, b, goal);
}

/** Whether a level's kickoffs follow its waves' tags (足球-6): some wave has one; else the waves go in order. @param {Content} c */
const tagged = (c) => c.level.waves.some((x) => x.tag !== undefined);

/**
 * 阵地足球's state at the start (足球-6): the team drawn by its weight among those that weigh more than 0 (随机-1) — in
 * a level without kickoff tags or teams none is drawn, the standard team (the first) plays —, no goals, the match's end,
 * a 锦标 stadium drawn among the level's by their weights (锦标-2); the first kickoff comes with the first wave.
 * @param {World} w @param {Content} c @returns {FootballState}
 */
export function newFootball(w, c) {
  const f = /** @type {FootballRules} */ (c.level.football), live = f.teams.flatMap((t, i) => (t.weight > 0 ? [i] : []));
  const team = tagged(c) && live.length > 0 ? live[weightedPick(w, live.map((i) => f.teams[i].weight))] : 0, all = f.cup?.stadiums ?? [];
  return { team, home: 0, away: 0, kick: 0, until: secondsToFrames(f.time), ...(all.length > 0 ? { stadium: weightedPick(w, all.map((s) => s.weight ?? 1)) } : {}) };
}

/**
 * The kickoff level of a lead (足球-6): the level of the last entry of the table whose lead it reaches, in the table's
 * order; a lead below 0 counts as 0. @param {FootballRules} f @param {number} lead
 */
export function kickoffLevel(f, lead) {
  let level = 0;
  for (const [cnt, lv] of f.ahead) if (Math.max(0, lead) >= cnt) level = lv;
  return level;
}

/**
 * The wave of the next kickoff (足球-6): the level by our lead; a tag by that level's weights (随机-2); one of the
 * waves of that tag, each as likely (随机-1). In a level without kickoff tags, the wave after the last one (past the
 * last: none, the waves are over); in a 锦标 penalty shootout its next round's (锦标-4). The kickoff's frame is noted.
 * @param {World} w @param {Content} c @param {number} at the frame it begins
 */
export function kickoffWave(w, c, at) {
  const f = /** @type {FootballRules} */ (c.level.football), st = /** @type {FootballState} */ (w.football);
  st.kick = at;
  stadiumKickoff(w, c);
  if (st.pk) return penaltyWave(w, c, at);
  if (!tagged(c)) return w.sched.wave + 1;
  const weights = f.weights[String(kickoffLevel(f, st.home - st.away))] ?? f.weights['0'];
  const tag = weightedPick(w, weights);
  const of = c.level.waves.flatMap((x, i) => (x.tag === tag ? [i] : []));
  return of.length > 0 ? of[Math.floor(draw(w) * of.length)] : 0;
}

/**
 * The player role of an enemy key (足球-6): the role whose name part it carries (`mumssi` the forward …), or null.
 * @param {FootballRules} f @param {string} key
 */
const roleOf = (f, key) => Object.entries(f.roles).find(([part]) => key.includes(`_${part}`))?.[1] ?? null;

/**
 * The enemy a wave's SPAWN brings in (足球-6, 锦标-6): a player of the level's standard team is the drawn team's player
 * of the same role — an elite one (a difficulty's replacement, 关卡-2, or a `_2` the waves name) the drawn team's elite
 * player of that role —; anything else as it is. @param {World} w @param {Content} c @param {string} key
 */
export function teamKey(w, c, key) {
  const f = c.level.football, st = w.football;
  if (!f || !st) return key;
  const role = roleOf(f, key), team = f.teams[st.team];
  if (!role || !team?.players[role]) return key;
  const elite = key.endsWith('_2') || f.teams.some((t) => t.elite?.[role] === key);
  return (elite && team.elite?.[role]) || team.players[role];
}

/** Whether a key is a player of the drawn team, an elite one too (足球-6). @param {FootballRules} f @param {FootballState} st @param {string} key */
function drawnPlayer(f, st, key) {
  const t = f.teams[st.team];
  return !!t && (Object.values(t.players).includes(key) || Object.values(t.elite ?? {}).includes(key));
}

/**
 * What a player brought in now has its base max HP, ATK and move speed multiplied by (足球-17): 1 + the level's
 * fraction × our lead, while we lead; any enemy's move speed by its 锦标 stadium's too (锦标-2: 冻人冬日); null for
 * nothing. @param {World} w @param {Content} c @param {string} key
 * @returns {{ maxHp: number, atk: number, moveSpeed: number } | null}
 */
export function catchUp(w, c, key) {
  const f = c.level.football, st = w.football, up = f?.catchUp, lead = st ? st.home - st.away : 0, fast = st ? stadiumSpeed(w, c) : 1;
  if (!f || !st || !up || lead <= 0 || !drawnPlayer(f, st, key)) return fast === 1 ? null : { maxHp: 1, atk: 1, moveSpeed: fast };
  return { maxHp: 1 + up.maxHp * lead, atk: 1 + up.atk * lead, moveSpeed: (1 + up.moveSpeed * lead) * fast };
}

/**
 * A player brought in by a kickoff waits until the players' wait after it is over (足球-6): it does not walk, attack or
 * use its abilities (the buff `kickoff`) before the frame kickoff + wait. A player of the drawn team; in 阵地足球锦标
 * any player (锦标-1). @param {World} w @param {Content} c @param {Unit} u
 */
export function kickoffWait(w, c, u) {
  const f = c.level.football, st = w.football;
  if (!f || !st || u.ball || !(isCup(c) ? isPlayerKey(c, u.key) : drawnPlayer(f, st, u.key))) return;
  // it ticks this frame too (状态-3): free on the frame the wait is over
  const left = st.kick + secondsToFrames(f.wait) - w.frame + 1;
  if (left > 0) addBuff(u, makeBuff({ key: 'kickoff', src: u.id, left, flags: { kickoff: true, root: true, noAttack: true } }));
}

/** A unit leaves the field quietly: no knockdown, no life lost (足球-5, 足球-7). @param {World} w @param {Unit} u */
function leave(w, u) {
  w.units.splice(w.units.indexOf(u), 1);
  releaseAll(w, u.id);
}

/**
 * After a goal (足球-7): every enemy leaves the field quietly — a caught ball too, its card gone (足球-14) —, the
 * predefined units in effect leave, the ice and slime melt (足球-16), and every operator of ours retreats (撤退-1) — its
 * redeploy time starts.
 * @param {World} w @param {Content} c
 */
function clearField(w, c) {
  for (const u of w.units.filter((x) => x.kind === KIND.ENEMY)) leave(w, u);
  for (const alias of [...w.predefined]) {
    w.predefined = w.predefined.filter((k) => k !== alias);
    w.events.push({ type: 'predefine', key: alias, on: 0 });
    withdrawDevice(w, alias);
  }
  for (const op of w.units.filter((x) => x.kind === KIND.OPERATOR && x.hp > 0)) withdraw(w, c, op);
  for (const p of w.players) delete p.balls;
  if (w.football) delete w.football.cover;
}

/**
 * The goals of a frame counted (足球-7): each ball's points to the side that scored. For whom a ball went in — 1 us
 * (into their goal), 0 them —, −1 for none. @param {FootballState} st @param {Unit[]} balls
 */
function goals(st, balls) {
  let side = -1;
  for (const b of balls) {
    const points = b.ball?.points ?? 1, ours = b.ball?.goal === 1;
    if (ours) st.home += points; else st.away += points;
    side = Math.max(side, ours ? 1 : 0);
  }
  return side;
}

/** The stamps of a match (足球-7): the stamps' net goals it reached. @param {FootballRules} f @param {FootballState} st */
export const footballStamps = (f, st) => f.stamps.filter((n) => st.home - st.away >= n).length;

/**
 * The end of a frame of 阵地足球 (足球-5, 足球-7, 足球-14, 足球-15): a caught ball whose card's time is up comes back; a
 * shot's hurt goes on; the hits before this frame are forgotten; a ball that went into a goal leaves — in a match its points go to the side that scored and the field is cleared for the next
 * kickoff —; at the match's end the battle is over (a 锦标 match's end: 锦标-1).
 * @param {World} w @param {Content} c
 */
export function tickFootball(w, c) {
  expireBalls(w, c);
  refereeStep(w, c);
  thunderStep(w, c);
  for (const b of w.units.filter((u) => u.ball?.hurt)) hurtStep(w, c, b);
  if (w.football?.hits) w.football.hits = w.football.hits.filter(([, , f]) => f >= w.frame);
  const balls = w.units.filter((u) => u.ball?.goal !== undefined);
  for (const b of balls) leave(w, b);
  const st = w.football;
  if (!st) return;
  const side = goals(st, balls);
  if (balls.length > 0) clearField(w, c);
  if (isCup(c)) { cupEnd(w, c, side, () => clearField(w, c)); return; }
  if (w.result < 0 && w.frame + 1 >= st.until) {
    w.result = 1;
    w.events.push({ type: 'end', result: 1 });
  }
}
