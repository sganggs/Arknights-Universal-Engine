// A chess kit's toggle on a skill whose record reads as instant (docs/spec/compat.md 兼容-5; skills.md 技能-3): under the
// basic rule (DEFAULT) the compat layer says a toggle starts as the piece is about to attack, as Stronghold does — the
// engine, by the record's kind, would start it the moment it is ready with nobody in range. 山's 横扫架势 is such a skill;
// here a kit of the test's own on 推进之王's record, whose S1 (冲锋号令) is AUTO and instant by its record.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { tinyContent, oneWave, spawnAt } from '@aue/testkit';
import { createWorld, step } from '@aue/sim';
import { kitsBehaviors } from '../src/compat/kits.js';
import { defOf } from '../src/compat/records.js';
import { loadTraining, operatorAt } from '../src/operators.js';

const SIEGE = 'char_112_siege';
/** E2 90, 潜能 6, S1 (skchr_siege_1, 冲锋号令) at 专精 3. */
const BUILD = { elite: 2, level: 90, potential: 6, trust: 100, skill: 0, skillLevel: 10 };
/** @type {any} */
let training;

before(async () => {
  training = await loadTraining(SIEGE);
});

/**
 * The tiny level with one sturdy slime that appears at 3 s and walks into range, the piece `siege` on 推进之王's record
 * with a chess kit whose default skill is `spec`, deployed at (1, 1) facing right with its SP full.
 * @param {Record<string, unknown>} spec
 */
function stance(spec) {
  const c = /** @type {any} */ (tinyContent());
  c.level.waves = [oneWave([spawnAt(3, 'slime')])];
  c.enemies.slime.maxHp = 1e9;
  Object.assign(c.level.options, { initialCost: 99, maxCost: 99 });
  const { talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents, ...rest } = operatorAt(training, BUILD);
  void [talentBb, fieldTalents, rangeTalents, critTalents, timedTalents, deployTalents];
  c.operators.siege = { ...rest, respawnTime: 1 };
  c.decks = [['siege']];
  const { world, skills, buffs, traits } = kitsBehaviors({ siege: { factory: () => ({ skill: spec }), chess: true, def: defOf(SIEGE, training, BUILD) } });
  c.behaviors = { world, skills, buffs, traits };
  const w = createWorld(c, { seed: 1, players: 1 });
  step(w, c, [[0, { type: 'deploy', op: 'siege', row: 1, col: 1, dir: 0 }]]);
  const me = /** @type {any} */ (w.units.find((u) => u.key === 'siege'));
  me.skill.sp = me.skill.cost;
  /** Whether the skill started within n frames. @param {number} n */
  const runs = (n) => { for (let i = 0; i < n; i++) if (step(w, c).some((e) => e.type === 'skill' && e.active)) return true; return false; };
  return { w, me, runs };
}

test('[兼容-5] [技能-3] a toggle on an instant-looking record waits for the attack: ready with nobody in range it stays down; with an enemy in range it starts', () => {
  const x = stance({ kind: 'toggle', mods: { atkPct: 0.1 } });
  assert.equal(x.runs(60), false, 'ready, nobody in range: not started');
  assert.equal(x.me.skill.sp, x.me.skill.cost, 'its SP kept');
  assert.equal(x.runs(30 * 12), true, 'the slime walks in: it starts as the piece is about to attack');
  assert.ok(x.w.frame > 30 * 3, 'not before the slime is there');
});

test('[兼容-5] [技能-3] the same record with an instant kit skill still starts when ready, nobody in range', () => {
  const x = stance({ kind: 'instant', mods: { atkPct: 0.1 } });
  assert.equal(x.runs(5), true);
});
