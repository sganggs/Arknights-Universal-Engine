// A copy of an operator in a deck (docs/spec/lockstep.md 同步-9) sounds as the operator: its key "id#seat#n" names the
// same character as "id#seat" (docs/spec/audio.md 音频-2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { soundsOf } from '../src/sounds.js';

test('[音频-2] [同步-9] a second copy\'s key "id#seat#2" gives the operator\'s own bank, as its first copy\'s does', () => {
  const banks = new Set(['battle.ON_UNIT_BORN.char', 'battle.ON_UNIT_BORN.char_special']);
  const keys = /** @type {Record<number, string>} */ ({ 1: 'char_special#0', 2: 'char_special#0#2' });
  const x = { keyOf: (/** @type {number} */ id) => keys[id], seat: 0, stages: 0, has: (/** @type {string} */ b) => banks.has(b),
    operators: { 'char_special#0': {}, 'char_special#0#2': {} }, enemies: {} };
  assert.deepEqual(soundsOf([{ type: 'deploy', id: 1 }, { type: 'deploy', id: 2 }], x), ['battle.ON_UNIT_BORN.char_special', 'battle.ON_UNIT_BORN.char_special']);
});
