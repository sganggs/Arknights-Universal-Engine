// Stronghold Protocol as the oracle (ADR 0058, which also runs its operator kits in matches): a pinned commit fetched
// into the engine's .cache/oracle/ (or the directory in AUE_STRONGHOLD_DIR), never committed. Differential tests load
// its modules with loadOracle('server/sim/dir.js') and compare results bit for bit (ADR 0032).
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The pinned oracle: Stronghold Protocol v0.3.1. Moving it is a decision (ADR 0058), not a bot update. */
export const STRONGHOLD = Object.freeze({
  repo: 'https://github.com/sganggs/Stronghold-Protocol.git',
  tag: 'v0.3.1',
  sha: 'b3deebdae4a92642c007d217a1a4573e5d3612c5',
});

/** The engine repository: the nearest directory above this file with a pnpm-workspace.yaml. */
function engineRoot() {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const up = dirname(dir);
    if (up === dir) throw new Error('oracle: no pnpm-workspace.yaml above @aue/testkit');
    dir = up;
  }
  return dir;
}

/** Where the oracle lives. */
export function oracleDir() {
  return process.env.AUE_STRONGHOLD_DIR ? resolve(process.env.AUE_STRONGHOLD_DIR) : join(engineRoot(), '.cache', 'oracle', `stronghold-${STRONGHOLD.sha.slice(0, 12)}`);
}

/** @param {string} dir @param {string[]} args */
const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** The commit checked out in `dir`, or null. @param {string} dir */
function headOf(dir) {
  try { return git(dir, ['rev-parse', 'HEAD']); } catch { return null; }
}

/** Fetches the pinned oracle when it is missing or at another commit; returns its directory. */
export function fetchOracle() {
  const dir = oracleDir();
  if (headOf(dir) === STRONGHOLD.sha) return dir;
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dirname(dir), { recursive: true });
    execFileSync('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', STRONGHOLD.repo, dir], { stdio: 'inherit' });
  }
  git(dir, ['fetch', '--quiet', 'origin', STRONGHOLD.sha]);
  git(dir, ['checkout', '--quiet', '--detach', STRONGHOLD.sha]);
  return dir;
}

/**
 * Imports a module of the oracle. It must have been fetched (aue-check oracle; `pnpm run ci` does it first).
 * @param {string} rel a path inside the Stronghold repository, e.g. 'server/sim/dir.js' @returns {Promise<any>}
 */
export async function loadOracle(rel) {
  const dir = oracleDir();
  if (headOf(dir) !== STRONGHOLD.sha) throw new Error(`the Stronghold oracle is missing or not at ${STRONGHOLD.tag}: run \`pnpm exec aue-check oracle\``);
  return import(pathToFileURL(join(dir, rel)).href);
}
