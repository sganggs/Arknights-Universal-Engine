// 赞助无人机's drop and 轰隆隆先生's card (docs/spec/foes.md 敌能-80, docs/spec/devices.md 装置-7). The level, not the
// enemy database, names the device and the count. 再部署时间 is on the device page; the extracted record has cost only.
// Content acts through the context (ADR 0055) and does not write simulation state.

/** @typedef {import('@aue/sim').FoeBehavior} FoeBehavior */
/** @typedef {import('@aue/sim').OperatorDef} OperatorDef */
/** @typedef {import('@aue/sim').DeviceDef} DeviceDef */

/**
 * 死亡爆炸予我方可部署装置 (敌能-80): on knockdown, each seat gains floor(cnt) of `token_key`. No token_key, or a cnt
 * that is not a positive number, gives nothing (无默认配置). Not silence-stopped.
 * @type {FoeBehavior}
 */
const loot = Object.freeze({
  death: (ctx) => {
    const bb = /** @type {Record<string, number | string | undefined>} */ (ctx.bb);
    const key = bb.token_key, n = bb.cnt;
    if (typeof key !== 'string' || key === '' || typeof n !== 'number' || !(n > 0)) return;
    ctx.grantLoot(key, Math.floor(n));
  },
});

/** @type {Readonly<Record<string, FoeBehavior>>} */
export const lootBehaviors = Object.freeze({ loot });

/**
 * 轰隆隆先生's card (装置-7) from its device record. Melee, free, never attacking, untargetable, no refund. The
 * redeploy time is the page's, kept on the profile because the record does not carry it. `start` is the token count.
 * @param {string} key @param {DeviceDef} d @param {number} start @returns {OperatorDef}
 */
function rumbleDef(key, d, start) {
  const rumble = /** @type {NonNullable<DeviceDef['rumble']>} */ (d.rumble);
  return {
    name: d.name, position: 'MELEE', cost: d.cost ?? 0, blockCnt: 0, baseAttackTime: d.baseAttackTime, maxHp: d.maxHp,
    atk: d.atk, def: d.def, res: d.res, aspd: d.aspd, tauntLevel: d.tauntLevel, massLevel: d.massLevel, range: [],
    profession: 'TRAP', trait: { free: true, noAttack: true, refund: 0, flags: { untargetable: true } },
    respawnTime: rumble.respawn, char: key, rumble: { ...rumble, start },
  };
}

/**
 * Every seat's 轰隆隆先生 cards (装置-7): for each token whose device profile is one, a record keyed "id#seat" in the
 * operators and that seat's deck. Another token is left to its own card.
 * @param {import('@aue/sim').Content['level']} level @param {Record<string, DeviceDef>} devices
 * @param {Record<string, OperatorDef>} operators changed in place @param {string[][]} decks changed in place
 */
export function withLootCards(level, devices, operators, decks) {
  const tokens = (level.cards?.tokens ?? []).filter((t) => devices[t.key]?.rumble);
  decks.forEach((deck, seat) => {
    for (const t of tokens) {
      const id = `${t.key}#${seat}`;
      operators[id] = rumbleDef(t.key, devices[t.key], t.count);
      deck.push(id);
    }
  });
}
