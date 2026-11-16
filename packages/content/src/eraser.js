// 家族灭迹人 and 家族暗影灭迹人 (docs/spec/foes.md 敌能-154). Their pages' 隐匿（解除阻挡1秒后恢复） is 敌能-131's `Stealth`
// and 不会攻击飞行单位 is 敌能-33's `noFly`: both talents come from their FOE_EXTRAS row, so this family adds no behaviour.
// The data's one talent `Passive` holds 清算时刻's bonus — 攻击力+15%, 防御力+15%, 攻击速度+50 — and a `max_stack_cnt` no
// sentence names. The engine has no 清算时刻, so these numbers do nothing (INF-1033): passive.js keeps the name's single
// object and covers this shape through the check below, and none of its hooks acts on it.

/** The data's four numbers and the page marker the row adds (敌能-154). */
const KEYS = Object.freeze(['attack_speed', 'atk', 'def', 'max_stack_cnt', 'page']);

/**
 * The read pages' `Passive` (敌能-154, INF-1030): exactly these keys, every one a number (关卡-2). The same numbers
 * without the marker are not this shape.
 * @param {Record<string, unknown>} bb @returns {boolean}
 */
export const eraserShape = (bb) => Object.keys(bb).length === KEYS.length && KEYS.every((k) => typeof bb[k] === 'number');
