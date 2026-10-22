// Stand-in for Stronghold's shared/plugins/rules.js (兼容-2). The real module imports no engine code, but
// grantedBondsByMorph is outside the source limits (complexity 21), so the mapping loads this. Kit load imports only
// this function (support/index.js). The branches match the real function: official mode grants nothing from fewer
// than two items; a canGiveBond item must be present; every other item's giveBondId grants when bondOk accepts it;
// plus mode needs one item and grants only the leftmost giveBondId.

/** @param {unknown} it @returns {string | null} */
function itemId(it) {
  if (typeof it === 'string') return it;
  if (it && typeof it === 'object' && typeof /** @type {{ id?: unknown }} */ (it).id === 'string') return /** @type {{ id: string }} */ (it).id;
  return null;
}

/** @param {unknown[]} list @param {(id: string) => unknown} getItem */
function recordsOf(list, getItem) {
  /** @type {Record<string, unknown>[]} */
  const recs = [];
  for (const it of list) {
    const id = itemId(it);
    if (id === null) continue;
    const rec = getItem(id);
    if (rec && typeof rec === 'object') recs.push(/** @type {Record<string, unknown>} */ (rec));
  }
  return recs;
}

/**
 * The bond id this record grants, or '' when it grants none or the id is already listed.
 * @param {Record<string, unknown>} rec @param {(id: string) => boolean} bondOk @param {string[]} out
 */
function bondIdOf(rec, bondOk, out) {
  if (rec.canGiveBond) return '';
  const id = rec.giveBondId;
  if (typeof id !== 'string' || !id || !bondOk(id) || out.includes(id)) return '';
  return id;
}

/**
 * Bonds a 变形同构体 pairing grants.
 * @param {Array<string | { id?: string }> | null | undefined} items
 * @param {(id: string) => unknown} getItem
 * @param {{ mode?: string, bondOk?: (id: string) => boolean }} [opts]
 * @returns {string[]}
 */
export function grantedBondsByMorph(items, getItem, { mode = 'official', bondOk = () => true } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (mode !== 'plus' && list.length < 2) return [];
  const recs = recordsOf(list, getItem);
  if (!recs.some((r) => r.canGiveBond)) return [];
  /** @type {string[]} */
  const out = [];
  for (const r of recs) {
    const id = bondIdOf(r, bondOk, out);
    if (!id) continue;
    out.push(id);
    if (mode === 'plus') break;
  }
  return out;
}
