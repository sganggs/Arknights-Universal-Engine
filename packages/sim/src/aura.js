// Auras (docs/spec/traits.md 职业-13, docs/spec/field.md 部署-5, 部署-6, docs/spec/devices.md 装置-4, docs/spec/skills.md
// 技能-11): an operator that raises the 生命回复速度 of every operator in its attack range by a share of its attack, an
// operator's talents for every operator of a profession or faction, its talents for the units in its attack range, a
// 替身's slow of the enemies around it, a running skill's modifiers and 鼓舞 for the friendly units in its range, and a
// device's modifiers for every enemy, while the source is on the field — a buff per aura on each of them, kept in step
// every frame, gone with the aura's source.
import { secondsToFrames } from '@aue/math';
import { KIND } from '@aue/schema';
import { statsOf } from './attrs.js';
import { makeBuff, addBuff, removeBuff, retune } from './buffs.js';
import { inKeys, hostile } from './targeting.js';
import { reachKeys } from './reach.js';
import { traitOf, dollNow, summonHeld } from './traits.js';
import { statMods } from './skills.js';
import { tileOf } from './body.js';
import { frontOf, rotateOffset, normDir } from './dir.js';
import { alchemyDef, inAlchemy, groundFoe } from './alchemy.js';
import { ELEMENTS, epOf } from './elements.js';
import { holdsWhen } from './whiles.js';
import { fieldBuffs, stackShare } from './talentaround.js';
import { stayVuln } from './talentfight.js';

/** @typedef {import('./types.js').World} World @typedef {import('./types.js').Content} Content @typedef {import('./types.js').Unit} Unit */
/**
 * What an aura gives one unit: its source, its strength (to see a change), its modifiers and flags; a 鼓舞's ratio.
 * @typedef {{ src: number, value: number, mods: Record<string, number>, flags?: Record<string, boolean>, ratio?: number }} Want
 */

/** The keys of the aura buffs. */
const AURA_KEYS = /^(?:aura|field|range|doll|mod|ally|inspire|alchemy|aspd|fieldRegen|fieldBuff|stackShare|resistRegen|stayVuln):/;
/** Whether a buff is an aura's. @param {{ key: string }} b */
const isAura = (b) => AURA_KEYS.test(b.key);

/**
 * An aura's share of its source's attack now (职业-13): its skill's `attack@atk_to_hp_recovery_ratio` (or the same key
 * without `attack@`) while the skill runs and gives one, else the trait's.
 * @param {Content} c @param {Unit} op @param {number} base
 */
function shareOf(c, op, base) {
  const bb = op.skill && op.skill.active ? c.operators[op.key].skill?.bb ?? {} : {};
  return bb['attack@atk_to_hp_recovery_ratio'] ?? bb.atk_to_hp_recovery_ratio ?? base;
}

/**
 * The regen aura of one source (职业-13): every operator with a tile in its attack range (itself too).
 * @param {Content} c @param {Unit} src @param {Unit[]} ops @param {Map<Unit, Map<string, Want>>} want
 */
function regenAura(c, src, ops, want) {
  const share = traitOf(c, src).regenAura;
  if (!(share > 0)) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, src), amount = shareOf(c, src, share) * statsOf(src).atk;
  for (const u of ops) if (inKeys(u, keys, grid)) want.get(u)?.set(`aura:${src.id}`, { src: src.id, value: amount, mods: { hpRegen: amount } });
}

/**
 * The regen of a talent for the whole field (职业-31: `fieldRegen`): every friendly unit, any player's, gains 生命回复速度 of
 * this share of the source's attack (buff `fieldRegen:<source id>`).
 * @param {Content} c @param {Unit} src @param {Unit[]} ops @param {Map<Unit, Map<string, Want>>} want
 */
function fieldRegen(c, src, ops, want) {
  const share = traitOf(c, src).fieldRegen;
  if (!(share > 0)) return;
  const amount = share * statsOf(src).atk;
  for (const u of ops) want.get(u)?.set(`fieldRegen:${src.id}`, { src: src.id, value: amount, mods: { hpRegen: amount } });
}

/**
 * The regen of a talent for those with 抵抗 (职业-33: `resistRegen`): every friendly unit with a tile in the source's
 * attack range whose 状态抵抗 is lowered (`statusResFlat` below 0) gains 生命回复速度 of this share of the source's attack
 * (buff `resistRegen:<source id>`).
 * @param {Content} c @param {Unit} src @param {Unit[]} ops @param {Map<Unit, Map<string, Want>>} want
 */
function resistRegen(c, src, ops, want) {
  const share = traitOf(c, src).resistRegen;
  if (!(share > 0)) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, src), amount = share * statsOf(src).atk;
  for (const u of ops) if ((statsOf(u).sum.statusResFlat ?? 0) < 0 && inKeys(u, keys, grid)) want.get(u)?.set(`resistRegen:${src.id}`, { src: src.id, value: amount, mods: { hpRegen: amount } });
}

/**
 * Whether a team talent is for an operator (部署-5): its profession (one of the talent's), or one of its factions, is the
 * talent's; every one for a talent for all.
 * @param {import('./types.js').TeamTalent} t @param {import('./types.js').OperatorDef} d
 */
export const teamFits = (t, d) => ('all' in t ? true : 'professions' in t ? t.professions.includes(d.profession ?? '')
  : 'profession' in t ? d.profession === t.profession : (d.powers ?? []).includes(t.power));

/** A team talent's strength (部署-5): the sum of its modifiers' sizes. @param {Record<string, number>} mods */
const sizeOf = (mods) => Object.values(mods).reduce((n, v) => n + Math.abs(v), 0);

/**
 * The on-field team talents of one source (部署-5): every operator on the field the talent is for, any player's — its
 * attribute keys' and its effects' modifiers, a buff `field:<source id>:<n>`; one of 同类效果取最高 (`max`) a buff
 * `field:max:<its keys>` shared by every such talent with those keys, the strongest kept; one of the source's skill only
 * while that runs (or does not); one with `after` once the source has been on the field that many seconds.
 * @param {World} w @param {Content} c @param {Unit} src @param {Unit[]} ops @param {Map<Unit, Map<string, Want>>} want
 */
function fieldTalents(w, c, src, ops, want) {
  (c.operators[src.key].fieldTalents ?? []).forEach((t, i) => {
    if ((t.skill !== undefined && t.skill !== !!src.skill?.active) || (t.after !== undefined && w.frame - src.born < secondsToFrames(t.after))) return;
    const mods = { ...statMods(t.bb), ...t.mods }, size = sizeOf(mods), key = t.max ? `field:max:${Object.keys(mods).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(',')}` : `field:${src.id}:${i}`;
    for (const u of ops) {
      const w = want.get(u);
      if (!w || !teamFits(t, c.operators[u.key]) || (t.max && (w.get(key)?.value ?? -1) >= size)) continue;
      w.set(key, { src: src.id, value: t.max ? size : 0, mods });
    }
  });
}

/** Each level's tiles on a straight road, by the road length asked (部署-5). @type {WeakMap<object, Map<number, Set<number>>>} */
const ROADS = new WeakMap();

/**
 * The tiles (row × width + column) on a straight road of at least `cnt` passable ground tiles, along a row or a column
 * (部署-5: 引星棘刺's 视界) — worked out once for a level.
 * @param {Content['level']} level @param {number} cnt @returns {Set<number>}
 */
export function straightRoads(level, cnt) {
  let byCnt = ROADS.get(level);
  if (!byCnt) ROADS.set(level, (byCnt = new Map()));
  const known = byCnt.get(cnt);
  if (known) return known;
  /** @type {Set<number>} */
  const keys = new Set(), W = level.width, H = level.height, ok = (/** @type {number} */ r, /** @type {number} */ c) => level.tiles[r]?.[c]?.passable === 'ALL';
  /** @param {number} n @param {(i: number) => number[]} at the row and column of the i-th tile of the line */
  const line = (n, at) => {
    for (let i = 0, run = 0; i <= n; i++) {
      const [r, c] = i < n ? at(i) : [-1, -1];
      if (i < n && ok(r, c)) { run++; continue; }
      if (run >= cnt) for (let j = i - run; j < i; j++) { const [rr, cc] = at(j); keys.add(rr * W + cc); }
      run = 0;
    }
  };
  for (let r = 0; r < H; r++) line(W, (i) => [r, i]);
  for (let c = 0; c < W; c++) line(H, (i) => [i, c]);
  byCnt.set(cnt, keys);
  return keys;
}

/**
 * The attack speed one source gives while on the field (部署-5: 引星棘刺's 视界): every friendly unit (summons too, itself
 * too) + `ally`, every enemy (not neutral) + `enemy`; those on a straight road (straightRoads) their extra too — a buff
 * `aspd:<its id>` each.
 * @param {Content} c @param {Unit} src @param {Unit[]} units @param {Map<Unit, Map<string, Want>>} want
 */
function fieldAspd(c, src, units, want) {
  const f = c.operators[src.key].fieldAspd;
  if (!f) return;
  const roads = straightRoads(c.level, f.cnt), W = c.level.width;
  for (const u of units) {
    const ally = u.kind === KIND.OPERATOR;
    if (!ally && !hostile(u)) continue;
    const [r, col] = tileOf(u), v = (ally ? f.ally : f.enemy) + (roads.has(r * W + col) ? (ally ? f.allyExtra : f.enemyExtra) : 0);
    if (v !== 0) want.get(u)?.set(`aspd:${src.id}`, { src: src.id, value: v, mods: { aspd: v } });
  }
}

/**
 * Whether an operator is one an in-range talent is for (部署-6): a ranged one (RANGED or ALL) when the talent says so, a
 * melee one (MELEE or ALL), one of its profession.
 * @param {import('./types.js').RangeTalent} t @param {import('./types.js').OperatorDef} d
 */
const whoFits = (t, d) => (!t.ranged || d.position === 'RANGED' || d.position === 'ALL') && (!t.melee || d.position === 'MELEE' || d.position === 'ALL')
  && (!t.profession || d.profession === t.profession) && (!t.professions || t.professions.includes(d.profession ?? ''));

/** Whether a unit is blocked by any unit, or blocks one. @param {World} w @param {Unit} u */
const inBlock = (w, u) => u.blockedBy >= 0 || w.units.some((x) => x.blockedBy === u.id);

/**
 * The conditions an in-range talent may ask of a unit (部署-6): below or above a share of its maximum HP, blocked (or
 * blocking), an ordinary enemy (not elite nor leader), flying, an element value below half its maximum (职业-29); a
 * share of its maximum HP at most the source's (`hpRatioAtMostSrc`), facing the source's way (`sameDir`, 职业-32); the
 * operator with the highest maximum HP of those with a tile in the source's range, the first by id of equal ones
 * (`maxHpHighest`, 职业-33); 停顿 (`sluggish`), 寒冷 but not 冻结 (`coldOnly`), 冻结 (`frozen`, 职业-34).
 * @type {Readonly<Record<NonNullable<import('./types.js').RangeTalent['when']>['when'], (w: World, u: Unit, v: number, src: Unit, c: Content) => boolean>>}
 */
const UNIT_WHEN = Object.freeze({
  hpBelow: (_w, u, v) => u.hp < v * statsOf(u).maxHp,
  hpAbove: (_w, u, v) => u.hp > v * statsOf(u).maxHp,
  blocked: (w, u) => inBlock(w, u),
  normal: (_w, u) => u.base.levelType === 'NORMAL',
  flying: (_w, u) => statsOf(u).flying,
  epHalf: (_w, u) => ELEMENTS.some((el) => epOf(u, el) < statsOf(u).maxEp / 2),
  hpRatioAtMostSrc: (_w, u, _v, src) => u.hp / statsOf(u).maxHp <= src.hp / statsOf(src).maxHp,
  sameDir: (_w, u, _v, src) => normDir(u.dir) === normDir(src.dir),
  maxHpHighest: (w, u, _v, src, c) => sturdiest(w, c, src) === u,
  sluggish: (_w, u) => holdsStatus(u, 'sluggish'),
  coldOnly: (_w, u) => !statsOf(u).flags.freeze && (holdsStatus(u, 'cold') || holdsStatus(u, 'enemyCold')),
  frozen: (_w, u) => !!statsOf(u).flags.freeze,
});

/** Whether a unit holds a status it is not immune to (职业-34). @param {Unit} u @param {string} key */
const holdsStatus = (u, key) => !statsOf(u).flags[`immune:${key}`] && u.buffs.some((b) => b.key === key);

/** The operator with the highest maximum HP of those with a tile in a source's range, the first by id of equal ones (职业-33). @param {World} w @param {Content} c @param {Unit} src */
function sturdiest(w, c, src) {
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, src);
  /** @type {Unit | null} */
  let best = null;
  for (const u of w.units) if (u.kind === KIND.OPERATOR && u.hp > 0 && inKeys(u, keys, grid) && (!best || statsOf(u).maxHp > statsOf(best).maxHp)) best = u;
  return best;
}

/**
 * Whether a unit stands on one of an area's tiles around a source (offsets from its tile; turned with the source when
 * `rotate`, facing right unturned). @param {Unit} src @param {Unit} u @param {import('./types.js').Cell[]} area @param {boolean} [rotate]
 */
function onArea(src, u, area, rotate = false) {
  const [r, col] = tileOf(src), [ur, uc] = tileOf(u);
  return area.some((x) => { const [dr, dc] = rotate ? rotateOffset(x.row, x.col, src.dir) : [x.row, x.col]; return r + dr === ur && col + dc === uc; });
}

/**
 * The in-range talents of one source (部署-6): the enemies (not neutral units), or the operators the talent is for
 * (whoFits; not the source with `others`), with a tile in its attack range — or standing on its area's tiles around the
 * source, turned with it with `rotate` —, and for which its condition holds when it has one; with `srcWhen`, only while
 * that condition holds on the source (职业-32).
 * @param {World} w @param {Content} c @param {Unit} src @param {Unit[]} units @param {Map<Unit, Map<string, Want>>} want
 */
function rangeTalents(w, c, src, units, want) {
  const talents = c.operators[src.key].rangeTalents ?? [];
  if (talents.length === 0) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, src);
  talents.forEach((t, i) => {
    if ((t.srcWhen && !holdsWhen(w, c, src, t.srcWhen)) || (t.during !== undefined && w.frame - src.born >= secondsToFrames(t.during))) return;
    for (const u of units) {
      const there = t.area ? onArea(src, u, t.area, t.rotate) : inKeys(u, keys, grid);
      if (there && rangeFits(w, c, src, t, u)) want.get(u)?.set(`range:${src.id}:${i}`, { src: src.id, value: 0, mods: t.mods, ...(t.flags ? { flags: t.flags } : {}) });
    }
  });
}

/**
 * Whether an in-range talent is for a unit there (部署-6): an enemy, or an operator it is for (whoFits; not the source
 * with `others`), for which its condition holds. @param {World} w @param {Content} c @param {Unit} src @param {import('./types.js').RangeTalent} t @param {Unit} u
 */
function rangeFits(w, c, src, t, u) {
  const fits = t.side === 'enemy' ? hostile(u) : u.kind === KIND.OPERATOR && whoFits(t, c.operators[u.key]) && !(t.others && u === src);
  return fits && (!t.when || UNIT_WHEN[t.when.when](w, u, t.when.value ?? 0, src, c));
}

/**
 * The slow of a 替身's aura (职业-16): while it fights, every ground enemy (not neutral) in its range moves at × `moveMul`
 * (最终乘算), one buff per 替身.
 * @param {Content} c @param {Unit} src @param {Unit[]} units @param {Map<Unit, Map<string, Want>>} want
 */
function dollAura(c, src, units, want) {
  const a = dollNow(c, src)?.aura;
  if (!a) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, src);
  for (const u of units) if (hostile(u) && !statsOf(u).flying && inKeys(u, keys, grid)) want.get(u)?.set(`doll:${src.id}`, { src: src.id, value: a.moveMul, mods: { moveMul: a.moveMul } });
}

/**
 * The auras a module adds to an operator's trait (职业-20, 职业-21): the enemies (not neutral) it blocks, those its own
 * summons block, or those with a tile in its attack range; the operator on the tile in front of it; its own summons; the
 * operators (summons too, itself too) with a tile in its attack range; every enemy any unit blocks (职业-25) —
 * each with the aura's modifiers and flags, some only while its skill runs — a buff `mod:<its id>:<n>`.
 * @param {World} w @param {Content} c @param {Unit} src @param {Unit[]} units @param {Map<Unit, Map<string, Want>>} want
 */
function moduleAuras(w, c, src, units, want) {
  const list = traitOf(c, src).auras;
  if (list.length === 0) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, src), bySummon = summonHeld(w, src), [fr, fc] = frontOf(...tileOf(src), src.dir);
  /** @type {Record<import('./types.js').ModuleAura['to'], (u: Unit) => boolean>} */
  const holds = {
    blocked: (u) => hostile(u) && u.blockedBy === src.id, summonBlocked: (u) => hostile(u) && bySummon(u), range: (u) => hostile(u) && inKeys(u, keys, grid),
    frontAlly: (u) => u.kind === KIND.OPERATOR && u !== src && tileOf(u)[0] === fr && tileOf(u)[1] === fc, summons: (u) => u.summoner === src.id,
    rangeAllies: (u) => u.kind === KIND.OPERATOR && inKeys(u, keys, grid), blockedAll: (u) => hostile(u) && u.blockedBy >= 0,
  };
  list.forEach((a, i) => {
    if (a.skill && !(src.skill && src.skill.active)) return;
    for (const u of units) if (holds[a.to](u)) want.get(u)?.set(`mod:${src.id}:${i}`, { src: src.id, value: 0, mods: a.mods ?? {}, ...(a.flags ? { flags: a.flags } : {}) });
  });
}

/** The 最终加算 modifier of each attribute a 鼓舞 raises (技能-11). */
const INSPIRE_MOD = Object.freeze({ atk: 'atkFinal', def: 'defFinal', maxHp: 'hpFinal' });

/**
 * What a running skill gives the friendly units in its attack range (技能-11): every operator (summons too) with a tile
 * in it — not the source when the skill says 其他 — gets its modifiers (`ally:<id>`) and, unless `noInspire`, its 鼓舞: a
 * 最终加算 of the source's attribute (without the 鼓舞 it holds itself) × the ratio, of several the highest ratio of each
 * attribute (`inspire:<attribute>`).
 * @param {Content} c @param {Unit} src @param {Unit[]} units @param {Map<Unit, Map<string, Want>>} want
 */
function skillAllies(c, src, units, want) {
  const a = src.skill?.active ? c.operators[src.key].skill?.allies : undefined;
  if (!a) return;
  const grid = { rows: c.level.height, cols: c.level.width }, keys = reachKeys(c, src);
  const s = a.inspire ? statsOf({ ...src, buffs: src.buffs.filter((b) => !b.key.startsWith('inspire:')) }) : null;
  for (const u of units) {
    const w = want.get(u);
    if (!w || u.kind !== KIND.OPERATOR || (a.others && u === src) || !inKeys(u, keys, grid)) continue;
    if (a.mods) w.set(`ally:${src.id}`, { src: src.id, value: 0, mods: a.mods });
    if (s && !traitOf(c, u).noInspire) inspire(w, src, /** @type {NonNullable<typeof a.inspire>} */ (a.inspire), s);
  }
}

/**
 * One unit's 鼓舞 from one source (技能-11): for each attribute, the source's × the ratio, unless it has a higher ratio
 * of that attribute already.
 * @param {Map<string, Want>} w @param {Unit} src @param {NonNullable<import('./types.js').SkillAllies['inspire']>} ratios
 * @param {import('./attrs.js').Stats} s the source's stats without its own 鼓舞
 */
function inspire(w, src, ratios, s) {
  for (const [attr, ratio] of /** @type {[keyof typeof INSPIRE_MOD, number][]} */ (Object.entries(ratios))) {
    const key = `inspire:${attr}`, amount = s[attr] * ratio;
    if (!((w.get(key)?.ratio ?? -Infinity) >= ratio)) w.set(key, { src: src.id, value: amount, ratio, mods: { [INSPIRE_MOD[attr]]: amount } });
  }
}

/**
 * What a 炼金单元 gives the units in it (技能-13), one buff `alchemy:<id>` each: the ground enemies its `foeMods` — with
 * `heavy.mods` for one of 重量 at least `heavy.weight` —, the friendly units (summons too) its `allyMods` and 生命回复速度
 * of `regen` × the attack it keeps.
 * @param {Content} c @param {import('./types.js').Alchemy} a @param {Unit[]} units @param {Map<Unit, Map<string, Want>>} want
 */
function alchemyAura(c, a, units, want) {
  const def = alchemyDef(c, a), key = `alchemy:${a.id}`, regen = (def.regen ?? 0) * a.atk;
  for (const u of units) {
    if (!inAlchemy(a, def, u)) continue;
    if (groundFoe(u)) {
      const heavy = def.heavy && statsOf(u).massLevel >= def.heavy.weight ? def.heavy.mods : undefined, mods = { ...def.foeMods, ...heavy };
      if (Object.keys(mods).length) want.get(u)?.set(key, { src: a.src, value: 0, mods });
      if (def.hitRate) lowerHitRate(def.hitRate, a, u, want.get(u));
    } else if (u.kind === KIND.OPERATOR && (def.allyMods || regen > 0)) {
      want.get(u)?.set(key, { src: a.src, value: regen, mods: { ...def.allyMods, ...(regen > 0 ? { hpRegen: regen } : {}) } });
    }
  }
}

/**
 * A 炼金单元's lower 命中率 on a ground enemy in it (技能-13: 旅骨's 潜水作业): × `mul`, × `heavyMul` for one of 重量 at
 * least `weight`; of several, the highest rate (the least lowered) — one buff `alchemy:hit`.
 * @param {NonNullable<import('./types.js').AlchemyDef['hitRate']>} h @param {import('./types.js').Alchemy} a @param {Unit} u @param {Map<string, Want> | undefined} w
 */
function lowerHitRate(h, a, u, w) {
  const mul = h.heavyMul !== undefined && statsOf(u).massLevel >= (h.weight ?? Infinity) ? h.heavyMul : h.mul, cur = w?.get('alchemy:hit');
  if (w && !(cur && cur.value >= mul)) w.set('alchemy:hit', { src: a.src, value: mul, mods: { hitRateMul: mul } });
}

/**
 * A device's modifiers for every enemy on the field, neutral units aside (装置-4): one buff per device, so the devices'
 * modifiers stack.
 * @param {Content} c @param {Unit} src @param {Unit[]} units @param {Map<Unit, Map<string, Want>>} want
 */
function deviceAura(c, src, units, want) {
  const mods = c.devices?.[src.key]?.enemyMods;
  if (!mods) return;
  for (const u of units) if (u.kind === KIND.ENEMY && u.base.neutral !== true) want.get(u)?.set(`aura:${src.id}`, { src: src.id, value: 0, mods });
}

/**
 * Every aura this frame, before the operators' turns (职业-13, 职业-16, 职业-20, 部署-5, 部署-6, 装置-4, 技能-11): each
 * operator on the field gives its regen aura, its on-field team talents, its in-range talents, its 替身's slow, its
 * module's auras and its running skill's effects on its allies as buffs, each 炼金单元 its modifiers (技能-13), each device
 * its modifiers for the enemies; a unit out of an aura's reach, or whose source left, loses its buff.
 * @param {World} w @param {Content} c
 */
export function auras(w, c) {
  const units = w.units.filter((u) => u.hp > 0), ops = units.filter((u) => u.kind === KIND.OPERATOR);
  /** @type {Map<Unit, Map<string, Want>>} */
  const want = new Map(units.map((u) => [u, new Map()]));
  for (const src of ops) {
    regenAura(c, src, ops, want);
    fieldRegen(c, src, ops, want);
    fieldBuffs(w, c, src, ops, want);
    stackShare(c, src, ops, want);
    resistRegen(c, src, ops, want);
    stayVuln(w, c, src, units, want);
    fieldTalents(w, c, src, ops, want);
    fieldAspd(c, src, units, want);
    rangeTalents(w, c, src, units, want);
    dollAura(c, src, units, want);
    moduleAuras(w, c, src, units, want);
    skillAllies(c, src, units, want);
  }
  for (const src of units) if (src.kind === KIND.DEVICE) deviceAura(c, src, units, want);
  for (const a of w.alchemy ?? []) alchemyAura(c, a, units, want);
  for (const u of w.units) sync(u, want.get(u) ?? new Map());
}

/**
 * A unit's aura buffs as they should be: the ones it should have added or retuned, the others removed.
 * @param {Unit} u @param {Map<string, Want>} want by buff key
 */
function sync(u, want) {
  for (const b of u.buffs.filter((x) => isAura(x) && !want.has(x.key))) removeBuff(u, b);
  for (const [key, x] of want) {
    const b = u.buffs.find((y) => y.key === key);
    if (!b) addBuff(u, makeBuff({ key, src: x.src, value: x.value, mods: x.mods, ...(x.flags ? { flags: x.flags } : {}) }));
    else if (b.value !== x.value) retune(u, b, x.value, x.mods);
  }
}
