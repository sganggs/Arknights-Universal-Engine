// Instance-scoped operations after a sibling is removed (docs/spec/ui.md 界面-8, 界面-28).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUi, refNode } from '../src/index.js';
import { fakeDocument, fakeHost } from './dom.js';

/** @typedef {import('../src/node.js').PackNode} PackNode */
/** @param {string} name @param {Record<string, any>} [comps] @param {PackNode[]} [children] @returns {PackNode} */
const N = (name, comps = {}, children = []) => ({ name, active: true, comps, children });

function setup() {
  const text = N('text', { text: { text: '', size: 20, style: 0, align: 4, color: [1, 1, 1, 1], best: 0, hwrap: 1 } });
  const ui = createUi({ pack: { version: 1, ref: [800, 600], sprites: {}, clips: { hold: { wrap: 0, length: 1, curves: [] } },
    screens: { main: N('main', {}, [N('layer')]), other: N('other', {}, [N('layer'), N('extra')]), pop: N('pop', {}, [text]),
      nested: N('nested', {}, [N('slot', { mark: { screen: 'screen:pop' } }), N('target', { inst: { screen: 'screen:pop', at: '@target' } })]) },
  }, host: fakeHost(fakeDocument()) });
  const scr = ui.open('main'), layer = /** @type {import('../src/node.js').UiNode} */ (scr.one('layer'));
  return { ui, scr, layer };
}

test('[界面-8] queries and text updates stay within a new instance after a sibling is removed', () => {
  const { scr, layer } = setup();
  const a = scr.instantiate(layer, 'pop'), b = scr.instantiate(layer, 'pop');
  scr.remove(a);
  const c = scr.instantiate(layer, 'pop');
  assert.equal(scr.q('text', b).length, 1);
  assert.equal(scr.q('text', c).length, 1);
  scr.text('text', 'B', b);
  scr.text('text', 'C', c);
  assert.equal(refNode(b, '@text')?.txt, 'B');
  assert.equal(refNode(c, '@text')?.txt, 'C');
});

test('[界面-8] removing an instance keeps a clip on another screen with the same parent path', async () => {
  const { ui, scr, layer } = setup(), other = ui.open('other');
  const a = scr.instantiate(layer, 'pop');
  const b = other.instantiate(/** @type {import('../src/node.js').UiNode} */ (other.one('layer')), 'pop');
  const done = other.play('', 'hold', {}, b);
  scr.remove(a);
  assert.equal(ui.anim.playing.length, 1, 'the other screen keeps its clip');
  ui.tick(1.1);
  await done;
});

test('[界面-8] removing a sibling keeps the surviving instance and its clip until its own removal', async () => {
  const { ui, scr, layer } = setup();
  const a = scr.instantiate(layer, 'pop'), b = scr.instantiate(layer, 'pop');
  scr.remove(a);
  const c = scr.instantiate(layer, 'pop');
  const done = scr.play('', 'hold', {}, c);
  scr.remove(b);
  assert.equal(c.gone, false);
  assert.ok(scr.all.includes(c));
  assert.ok(layer.kids.includes(c));
  assert.equal(c.el.parentNode, layer.el);
  assert.equal(ui.anim.playing.length, 1);
  ui.tick(1.1);
  await done;
  scr.remove(c);
  assert.equal(layer.kids.length, 0);
  assert.equal(c.el.parentNode, null);
  assert.equal(scr.q('text').length, 0);
});

test('[界面-8] [界面-28] a later instance keeps named mark and inst references scoped to its own prefab', () => {
  const { scr, layer } = setup();
  const a = scr.instantiate(layer, 'nested'), b = scr.instantiate(layer, 'nested');
  scr.remove(a);
  const c = scr.instantiate(layer, 'nested', 0);
  assert.equal(layer.kids[0], c);
  for (const at of ['slot/pop/text', 'target/pop/text']) {
    assert.equal(scr.q(at, b).length, 1);
    assert.equal(scr.q(at, c).length, 1);
    scr.text(at, 'B', b);
    scr.text(at, 'C', c);
    assert.equal(refNode(b, `@${at}`)?.txt, 'B');
    assert.equal(refNode(c, `@${at}`)?.txt, 'C');
  }
  scr.remove(b);
  assert.equal(scr.q('slot/pop/text', c).length, 1);
});
