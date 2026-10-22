// The official devices (docs/spec/devices.md 装置-3, 装置-4, docs/spec/field.md 地图-3): what each device a level places is
// beyond its record — its side, the statuses it is immune to, what it gives the enemies while on the field — from its
// PRTS page; the numbers come from the record's own talent blackboard where the data has them. A controller is no unit:
// it sets a rule of the level. A level with a device not profiled here is not supported yet (levelAt refuses it).
import rangeTable from '../data/ranges.json' with { type: 'json' };

/** @typedef {import('@aue/sim').DeviceDef} DeviceDef */

const PRTS = 'https://prts.wiki/index.php?title=';

/** @typedef {{ dealt: number, taken: number }} WorksRule the 工事 rule (地图-3) */

/**
 * Per device: what it adds to its record, or the level rule it sets, with the PRTS revision that says so.
 * @type {Readonly<Record<string, { profile?: (d: DeviceDef) => Partial<DeviceDef>, works?: (d: DeviceDef) => WorksRule, source: string }>>}
 */
export const DEVICE_PROFILES = Object.freeze({
  // 城防路障: 阵营=我方；持有禁疗、孤立、晕眩免疫、冻结免疫、寒冷免疫、沉默免疫、沉睡免疫
  trap_097_hstone: { profile: () => ({ immune: ['stun', 'freeze', 'cold', 'silence', 'sleep'] }), source: `${PRTS}%E5%9F%8E%E9%98%B2%E8%B7%AF%E9%9A%9C&oldid=417801` },
  // 山海密语仪: 阵营=敌方；在场时，所有敌方单位的攻击速度+25，移动速度最终提升至115%（可无限叠加）
  trap_096_gflag: {
    profile: (d) => ({ side: 'ENEMY', enemyMods: { aspd: d.talentBb.attack_speed, moveMul: d.talentBb.move_speed } }),
    source: `${PRTS}%E5%B1%B1%E6%B5%B7%E5%AF%86%E8%AF%AD%E4%BB%AA&oldid=337660`,
  },
  // 堡垒守御的设施（守御-3）：初始模式无敌、不可选中、不可阻挡；晕眩、冻结、浮空、沉睡免疫；各等级的进度与效果取记录的天赋
  trap_205_mufrfm: { profile: (d) => facility('workshop', d), source: `${PRTS}%E5%BB%BA%E7%AD%91%E5%B7%A5%E5%85%B7%E9%97%B4&oldid=424753` },
  trap_206_mufrbk: { profile: (d) => facility('lounge', d), source: `${PRTS}%E4%B8%B4%E6%97%B6%E4%BC%91%E6%81%AF%E8%88%B1&oldid=424752` },
  trap_207_mufrwl: { profile: (d) => facility('platform', d), source: `${PRTS}%E6%B6%B2%E5%8E%8B%E5%BC%8F%E9%AB%98%E5%8F%B0&oldid=428398` },
  trap_208_mufrst: { profile: (d) => facility('roadblock', d), source: `${PRTS}%E6%B7%B7%E5%87%9D%E5%9C%9F%E8%B7%AF%E9%9A%9C&oldid=424762` },
  trap_209_mufrbs: { profile: (d) => facility('gym', d), source: `${PRTS}%E4%BE%BF%E6%90%BA%E5%81%A5%E8%BA%AB%E6%9E%B6&oldid=424759` },
  // 建筑工（守御-4）：普通的每次 +1 进度、5 次后下班，高级的 +3、18 次；登场 duration 秒后撤退；不可选中、不可阻挡
  trap_166_muwork: { profile: (d) => builder('sp', 5, d), source: `${PRTS}%E8%AE%BE%E6%96%BD%E5%BB%BA%E7%AD%91%E5%B7%A5&oldid=398756` },
  trap_202_muworkg: { profile: (d) => builder('sp2', 18, d), source: `${PRTS}%E9%AB%98%E7%BA%A7%E8%AE%BE%E6%96%BD%E5%BB%BA%E7%AD%91%E5%B7%A5&oldid=398813` },
  // 坍塌的杂物堆（守御-6）：防御阶段开始时出看守，第 5 秒起每 2 秒查一次范围 x-2（skill_table sktok_mufrprn_1 的 range_id）
  trap_203_mufrprn: {
    profile: () => ({ rubble: { range: 'x-2', cells: cellsOf('x-2'), branch: 'mufrprn_branch', first: 5, every: 2 } }),
    source: `${PRTS}%E5%9D%8D%E5%A1%8C%E7%9A%84%E6%9D%82%E7%89%A9%E5%A0%86&oldid=380508`,
  },
  // 轰隆隆先生 (装置-7): 1.5s after deploy, stun the cross and break. Respawn is the page's 5s; the record has cost, not respawnTime.
  trap_018_bomb: { profile: () => ({ rumble: { delay: 1.5, stun: 12, respawn: 5 } }), source: `${PRTS}%E8%BD%B0%E9%9A%86%E9%9A%86%E5%85%88%E7%94%9F&oldid=358736` },
  // 地形增伤控制: 位于<玉门天灾工事>中的单位对位于普通地块中的非飞行单位，造成伤害提升至130%，受到伤害降低至70%
  trap_103_ymdgct: {
    works: (d) => ({ dealt: d.talentBb['ymdgct_damage_scale[up].damage_scale'], taken: d.talentBb['ymdgct_damage_scale[down].damage_scale'] }),
    source: `${PRTS}%E5%9C%B0%E5%BD%A2%E5%A2%9E%E4%BC%A4%E6%8E%A7%E5%88%B6&oldid=421599`,
  },
});

/**
 * A facility's profile (守御-3): its kind, its modes' blackboards (the record's first four talents) and, for 混凝土路障, the
 * damage its fifth gives; the immunities of every facility.
 * @param {'workshop' | 'lounge' | 'platform' | 'roadblock' | 'gym'} kind @param {DeviceDef} d @returns {Partial<DeviceDef>}
 */
function facility(kind, d) {
  const talents = /** @type {Record<string, number>[]} */ (/** @type {any} */ (d).talents ?? []);
  if (talents.length < 4) throw new RangeError(`facility ${d.name}: four modes expected, ${talents.length} talents`);
  return { facility: { kind, modes: talents.slice(0, 4), ...(talents[4]?.damage ? { boom: talents[4].damage } : {}) }, immune: ['stun', 'freeze', 'levitate', 'sleep'] };
}

/**
 * A builder's profile (守御-4): the facility key its progress takes (sp or sp2), its hits before it goes, its time on the
 * field (its talent's duration). @param {'sp' | 'sp2'} sp @param {number} hits @param {DeviceDef} d @returns {Partial<DeviceDef>}
 */
const builder = (sp, hits, d) => ({ builder: { sp, hits, life: d.talentBb.duration } });

/** A range's cells (range_table). @param {string} id */
function cellsOf(id) {
  const cells = /** @type {Record<string, { row: number, col: number }[]>} */ (rangeTable.ranges)[id];
  if (!cells) throw new RangeError(`no range ${id}`);
  return cells;
}

/**
 * A level's devices with their profiles, the 工事 rule a controller among them sets, and the devices without a profile.
 * @param {Record<string, DeviceDef>} devices @returns {{ devices: Record<string, DeviceDef>, works?: WorksRule, missing: string[] }}
 */
export function profiledDevices(devices) {
  const missing = Object.keys(devices).filter((k) => !Object.hasOwn(DEVICE_PROFILES, k)), known = Object.entries(devices).filter(([k]) => !missing.includes(k));
  const units = known.filter(([k]) => DEVICE_PROFILES[k].profile), rule = known.find(([k]) => DEVICE_PROFILES[k].works);
  return {
    devices: Object.fromEntries(units.map(([k, d]) => [k, { ...d, .../** @type {(d: DeviceDef) => Partial<DeviceDef>} */ (DEVICE_PROFILES[k].profile)(d) }])),
    ...(rule ? { works: /** @type {(d: DeviceDef) => WorksRule} */ (DEVICE_PROFILES[rule[0]].works)(rule[1]) } : {}),
    missing,
  };
}
