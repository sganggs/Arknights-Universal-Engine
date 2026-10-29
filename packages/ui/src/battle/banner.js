// The co-op stage start banner (docs/spec/ui.md 界面-22, 界面-40, 界面-41): when a stage begins, the banner shows its
// task — the title, the stage number, the basic task and, when it has one, the advanced task — and plays its clip once
// (a training's own clip in a training); 堡垒守御's waves have their own banners — the first wave, the others, the last —,
// and 阵地足球 its own once the match begins.
import { refNode, setText } from '../node.js';

/** @typedef {import('../node.js').UiNode} UiNode */
/**
 * A stage that has begun: its number (1-based) and its task's title and texts (关卡-5), in a training or not; or a
 * 堡垒守御 wave whose defence has begun: its number (1-based) of the level's waves, the last or not.
 * @typedef {{ stage: number, title: string, basic: string, advanced?: string, training?: boolean, defence?: { wave: number, waves: number, last: boolean } }} StageStart
 */

/** The banner's title for a task's title (界面-22). @param {string} title */
export const bannerTitle = (title) => `目标·${title}`;

/** The first wave banner's target: hold the level's waves (界面-40). @param {number} waves */
export const holdText = (waves) => `坚守阵地${waves}波次`;

/**
 * The stage start banner on a UI; null without the pack's. `update` with a stage that has begun shows it once per stage
 * (or 堡垒守御 wave).
 * @param {ReturnType<typeof import('../ui.js').createUi>} ui
 */
export function createBanner(ui) {
  const parts = /** @type {Record<string, any>} */ (ui.ctx.pack).hud?.coopStage;
  if (!parts || !ui.ctx.pack.screens['coop.stage']) return null;
  const scr = ui.open('coop.stage'), root = scr.root, at = (/** @type {string | undefined} */ ref) => (ref ? refNode(root, ref) : null);
  const panel = at(parts.panel), d = parts.defence ?? {}, ft = parts.football ? at(parts.football.panel) : null;
  if (!panel) return null;
  const panels = [panel, ft, ...['first', 'wave', 'last'].map((k) => at(d[k]?.panel))].filter((n) => n !== null);
  root.active = true;
  for (const n of panels) n.active = false;
  let shown = '', kicked = false;
  return {
    /** 阵地足球's banner (界面-41), once: its panel as the pack has it, its clip (a training's in a training). */
    football(training = false) {
      if (!ft || kicked) return;
      kicked = true;
      shown = 'football';
      for (const n of panels) n.active = n === ft;
      void scr.anim.play(ft, (training && parts.football.trainingClip) || parts.football.clip).then(() => { if (shown === 'football') ft.active = false; });
    },
    screen: scr, panel,
    /** The stage last shown (0 for none). */
    shown: () => (shown.startsWith('s') ? Number(shown.slice(1)) : 0),
    /** @param {StageStart | null} s */
    update(s) {
      const key = s ? (s.defence ? `w${s.defence.wave}` : `s${s.stage}`) : '';
      if (!s || key === shown) return;
      shown = key;
      const show = s.defence ? defenceBanner(at, d, s) : stageBanner(at, parts, s);
      if (!show) return;
      for (const n of panels) n.active = n === show.panel;
      scr.anim.play(show.panel, show.clip).then(() => { if (shown === key) show.panel.active = false; });
    },
  };
}

/**
 * A stage's banner (界面-22): its texts filled; the conventional panel with its clip, a training's clip in a training.
 * @param {(ref: string | undefined) => UiNode | null} at @param {Record<string, any>} parts @param {StageStart} s
 * @returns {{ panel: UiNode, clip: string } | null}
 */
function stageBanner(at, parts, s) {
  for (const [ref, text] of [[parts.title, bannerTitle(s.title)], [parts.stage, String(s.stage)], [parts.basic, s.basic], [parts.advanced, s.advanced ?? '']]) {
    const n = at(ref);
    if (n) setText(n, text);
  }
  const field = at(parts.advancedField), panel = at(parts.panel);
  if (field) field.active = s.advanced !== undefined;
  return panel ? { panel, clip: (s.training && parts.trainingClip) || parts.clip } : null;
}

/**
 * A 堡垒守御 wave's banner (界面-40): the first wave's with the waves to hold and the wave of the waves (a training's clip
 * in a training), a later wave's with the wave of the waves, the last wave's as the pack has it.
 * @param {(ref: string | undefined) => UiNode | null} at @param {Record<string, any>} d @param {StageStart} s
 * @returns {{ panel: UiNode, clip: string } | null}
 */
function defenceBanner(at, d, s) {
  const w = /** @type {NonNullable<StageStart['defence']>} */ (s.defence), b = w.last ? d.last : w.wave === 1 ? d.first : d.wave;
  const panel = b ? at(b.panel) : null;
  if (!b || !panel) return null;
  for (const [ref, text] of [[b.cur, String(w.wave)], [b.max, String(w.waves)], [b.target, holdText(w.waves)]]) {
    const n = ref ? at(ref) : null;
    if (n) setText(n, text);
  }
  return { panel, clip: (s.training && b.trainingClip) || b.clip };
}
