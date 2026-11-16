// Stands in for Stronghold's server/sim/dir.js (兼容-2): the engine's own direction helpers, which keep its names and
// rules (方向-1…方向-4: four facings by name, row 0 at the bottom, facing-RIGHT offsets turned a quarter per step).
import { dir } from '@aue/sim';

export const { DIR_VEC, normDir, dirVec, oppositeDir, rotateOffset, toLocal, dirFromDelta, offsetTile, frontOf, localOrder, localBefore } = dir;
