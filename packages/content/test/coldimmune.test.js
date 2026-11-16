// 寒冷免疫 of the summons whose PRTS page says so (docs/spec/summons.md 召唤-7, status.md 状态-7): their records are
// immune to 寒冷's flag `cold`, so a cold on one of them stays in its list without slowing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KIND } from '@aue/schema';
import { status, attrs } from '@aue/sim';
import { loadTraining } from '../src/operators.js';
import { SUMMON_PAGES, loadToken, tokenAt, effectsOf } from '../src/tokens.js';

/** The summons whose page lists 寒冷 among its immunities, with their owners. */
const COLD_IMMUNE = Object.freeze({ token_10039_ulpia_block: 'char_4145_ulpia', token_10065_demetr_dmtpos: 'char_4037_demetr', token_10071_aglna2_agairp: 'char_1015_aglna2' });

test('[召唤-7] [状态-7] a summon whose page says 寒冷免疫 is immune to cold; one whose page does not say it is not', async () => {
  assert.deepEqual(effectsOf(SUMMON_PAGES.token_10039_ulpia_block).immune, ['stun', 'freeze', 'cold', 'sleep']);
  for (const id of Object.keys(COLD_IMMUNE)) assert.ok(SUMMON_PAGES[id].immune?.includes('寒冷') && effectsOf(SUMMON_PAGES[id]).immune.includes('cold'), id);
  const others = Object.entries(SUMMON_PAGES).filter(([id, p]) => !Object.hasOwn(COLD_IMMUNE, id) && effectsOf(p).immune.includes('cold'));
  assert.deepEqual(others, [], 'no other summon is');
  const id = 'token_10065_demetr_dmtpos', rec = tokenAt(await loadToken(id), id, await loadTraining(COLD_IMMUNE[id]), { elite: 2, level: 90, potential: 1, trust: 0, skill: 0, skillLevel: 7 });
  assert.ok(rec.immune?.includes('cold'), 'its record carries the immunity');
  const u = /** @type {any} */ ({ id: 1, kind: KIND.OPERATOR, base: { maxHp: 1000, aspd: 100, immune: rec.immune }, buffs: [] });
  const foe = /** @type {any} */ ({ id: 2, kind: KIND.ENEMY, base: { immune: [] }, buffs: [] });
  status.applyStatus(u, 'cold', { src: foe, seconds: 3 });
  assert.deepEqual([u.buffs.map((/** @type {any} */ b) => b.key), attrs.statsOf(u).aspd, attrs.statsOf(u).flags.cold], [['enemyCold'], 100, undefined]);
});
