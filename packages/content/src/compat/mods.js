// Stronghold's names → the engine's where they differ (docs/spec/compat.md 兼容-4): buff flags (属性-2, 状态-5), status
// keys (状态-5) and elements with their bursts' buffs (元素-1, 元素-3), both ways. Modifier keys are the same in both (the engine took Stronghold's names, ADR 0012); one
// the engine does not know stays on the buff and changes nothing.

/** Stronghold's flags → the engine's (反隐 `reveal` is the engine's `unstealth`, 索敌-2). @type {Readonly<Record<string, string>>} */
const FLAG = Object.freeze({ invulnerable: 'invincible', bind: 'root', noHeal: 'noAllyHeal', tremble: 'disarmedCombat', reveal: 'unstealth' });

/** Stronghold's status names → the engine's. @type {Readonly<Record<string, string>>} */
const STATUS_KEY = Object.freeze({ bind: 'root', resist: 'buffres', tremble: 'disarmedCombat' });

/** The engine's status keys → Stronghold's names. @type {Readonly<Record<string, string>>} */
export const STATUS_NAME = Object.freeze(/** @type {Record<string, string>} */ ({ root: 'bind', buffres: 'resist', enemyCold: 'cold', enemyFreeze: 'freeze', disarmedCombat: 'tremble' }));

/** A status as the engine names it. @param {string} key */
export const statusKeyOf = (key) => STATUS_KEY[key] ?? key;

/** Stronghold's element names → the engine's (元素-1). @type {Readonly<Record<string, import('@aue/sim').elements.Element>>} */
export const ELEMENT = Object.freeze({ neural: 'SANITY', erosion: 'WATER', burn: 'FIRE', apoptosis: 'DARK' });

/** The engine's elements → Stronghold's names. @type {Readonly<Record<string, string>>} */
export const ELEMENT_NAME = Object.freeze(Object.fromEntries(Object.entries(ELEMENT).map(([k, v]) => [v, k])));

/** A buff key as the engine names it: Stronghold's `<element>Burst` is the engine's `burst:<ELEMENT>` (元素-3). @param {string} key */
export function buffKeyOf(key) {
  const el = key.endsWith('Burst') ? ELEMENT[key.slice(0, -5)] : undefined;
  return el ? `burst:${el}` : key;
}

/** A buff key as Stronghold names it (the other way of buffKeyOf). @param {string} key */
export function buffNameOf(key) {
  const el = key.startsWith('burst:') ? ELEMENT_NAME[key.slice(6)] : undefined;
  return el ? `${el}Burst` : key;
}

/** A buff's modifiers as the engine reads them: numbers only. @param {Record<string, unknown> | null | undefined} m @returns {Record<string, number>} */
export function modsOf(m) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const [k, v] of Object.entries(m ?? {})) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

/** The engine's flags → Stronghold's names. @type {Readonly<Record<string, string>>} */
const FLAG_NAME = Object.freeze(Object.fromEntries(Object.entries(FLAG).map(([k, v]) => [v, k])));

/**
 * A unit's attribute flags as a kit reads them: the engine's, also under Stronghold's names where it names them
 * otherwise, and `burstLock` during an element burst (元素-3).
 * @param {Record<string, boolean>} flags @param {boolean} bursting @returns {Record<string, boolean>}
 */
export function shFlagsOf(flags, bursting) {
  const out = { ...flags };
  for (const [k, on] of Object.entries(flags)) if (on && Object.hasOwn(FLAG_NAME, k)) out[FLAG_NAME[k]] = true;
  if (bursting) out.burstLock = true;
  return out;
}

/** A buff's flags as the engine names them. @param {Record<string, unknown> | null | undefined} f @returns {Record<string, boolean>} */
export function flagsOf(f) {
  /** @type {Record<string, boolean>} */
  const out = {};
  for (const [k, v] of Object.entries(f ?? {})) if (v) out[FLAG[k] ?? k] = true;
  return out;
}
