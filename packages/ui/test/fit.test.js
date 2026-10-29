// Background fitting over time (docs/spec/ui.md 界面-30): resizing cannot turn a fitted size into an authored one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, copyRect, FULL_RT } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @param {number[]} [size] @param {number} [ratio] */
function setup(size = [0, 0], ratio = 2) {
  const doc = fakeDocument(), rt = { ...copyRect(FULL_RT), size };
  const bg = { name: 'background', active: true, rt, comps: { bgFit: { ratio } }, children: [] };
  const pack = { version: 1, ref: [1280, 720], sprites: {}, clips: {},
    screens: { main: { name: 'main', active: true, comps: {}, children: [bg] } } };
  const ui = createUi({ pack, host: fakeHost(doc) }), screen = ui.open('main');
  const node = /** @type {NonNullable<ReturnType<typeof screen.one>>} */ (screen.one('background'));
  /** @param {number} w @param {number} h */
  const resize = (w, h) => { ui.resize(w, h); ui.tick(0); return node.box?.slice(); };
  return { ui, screen, node, resize, pack };
}

test('[界面-30] a background covers and centres on its first layout and stays there on subsequent ticks', () => {
  const { ui, node, resize } = setup();
  assert.deepEqual(resize(1280, 720), [-80, 0, 1440, 720]);
  ui.tick(0);
  assert.deepEqual(node.box, [-80, 0, 1440, 720]);
});

test('[界面-30] a background returns to its original size after narrow and wide viewport round trips', () => {
  const { resize } = setup();
  const first = resize(1280, 720);
  for (let i = 0; i < 3; i += 1) {
    assert.deepEqual(resize(600, 720), [-896, 0, 3072, 1536]);
    assert.deepEqual(resize(1280, 720), first, 'returning from a tall canvas');
    assert.deepEqual(resize(2560, 720), [0, -280, 2560, 1280]);
    assert.deepEqual(resize(1280, 720), first, 'returning from a wide canvas');
  }
});

test('[界面-30] an authored larger background survives a viewport round trip without losing its size delta', () => {
  const { resize } = setup([320, 280]);
  const first = resize(1280, 720);
  assert.deepEqual(first, [-160, -140, 1600, 1000], 'INF-0191');
  assert.deepEqual(resize(600, 720), [-896, 0, 3072, 1536]);
  assert.deepEqual(resize(1280, 720), first);
});

test('[界面-30] background fitting still reads runtime changes to its own rect', () => {
  const { node, resize, pack } = setup();
  resize(600, 720);
  node.rt.size = [320, 280];
  assert.deepEqual(resize(1280, 720), [-160, -140, 1600, 1000]);
  node.rt.size = [0, 0];
  assert.deepEqual(resize(1280, 720), [-80, 0, 1440, 720]);
  assert.deepEqual(pack.screens.main.children[0].rt.size, [0, 0], 'the shared prefab is unchanged');
});

test('[界面-30] a background with fixed anchors keeps its larger own rect on every frame', () => {
  const { node, ui, resize } = setup([1800, 1200]);
  node.rt.amin = [0.5, 0.5]; node.rt.amax = [0.5, 0.5];
  assert.deepEqual(resize(1280, 720), [-260, -240, 1800, 1200]);
  ui.tick(0);
  assert.deepEqual(node.box, [-260, -240, 1800, 1200]);
  resize(600, 720);
  assert.deepEqual(resize(1280, 720), [-260, -240, 1800, 1200]);
});

test('[界面-30] an explicit aspect fitter takes priority over background fitting', () => {
  const { node, resize } = setup();
  node.n.comps.aspect = { mode: 3, ratio: 2 };
  assert.deepEqual(resize(1280, 720), [0, 40, 1280, 640]);
  assert.deepEqual(resize(600, 720), [0, 448, 1280, 640]);
  assert.deepEqual(resize(1280, 720), [0, 40, 1280, 640]);
});

test('[界面-30] separate screen instances fit independently after one has been resized', () => {
  const { ui, resize, node } = setup();
  resize(600, 720);
  resize(1280, 720);
  const next = ui.open('main');
  ui.tick(0);
  assert.deepEqual(next.one('background')?.box, [-80, 0, 1440, 720]);
  assert.deepEqual(node.box, next.one('background')?.box);
});
