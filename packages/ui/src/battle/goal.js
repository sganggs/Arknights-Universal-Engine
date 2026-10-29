// 阵地足球's goal banner (docs/spec/ui.md 界面-41): each time a side scores, the pack's score panel shows its side —
// 进球！ for our goal, 失球！ for theirs — and plays its clip once, then goes.
import { refNode } from '../node.js';

/** @typedef {import('./coop.js').FootballTask} FootballTask */

/**
 * The goal banner on a UI; null without the pack's score panel. `update` with the match's score shows it when a side's
 * goals went up since the last score given (not on the first one).
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui
 */
export function createGoalBanner(ui) {
  const parts = /** @type {Record<string, any>} */ (ui.ctx.pack).hud?.coopScore;
  if (!parts?.clip || !ui.ctx.pack.screens['coop.score']) return null;
  const scr = ui.open('coop.score'), root = scr.root, ally = refNode(root, parts.ally), enemy = refNode(root, parts.enemy);
  if (!ally || !enemy) return null;
  root.active = false;
  /** @type {{ home: number, away: number } | null} */
  let was = null;
  let seq = 0;
  return {
    screen: scr,
    /** @param {FootballTask | null | undefined} f */
    update(f) {
      if (!f) return;
      const ours = !!was && f.home > was.home, theirs = !!was && f.away > was.away;
      was = { home: f.home, away: f.away };
      if (!ours && !theirs) return;
      const id = ++seq;
      ally.active = ours;
      enemy.active = !ours;
      root.active = true;
      void scr.anim.play(root, parts.clip).then(() => { if (id === seq) root.active = false; });
    },
  };
}
