/**
 * `git init`, with nested-repository detection.
 *
 * If the target lives inside an existing repository we skip initializing and
 * return a one-line note (docs/04 §5⑧); the caller prints it.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface GitResult {
  skipped: boolean;
  note?: string;
}

/** Walk upward from `startDir` looking for a `.git` entry. */
export function findRepoRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, ".git"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function initGit(targetDir: string): GitResult {
  const resolved = resolve(targetDir);
  const parentRepo = findRepoRoot(dirname(resolved));
  if (parentRepo) {
    return { skipped: true, note: "inside existing repo, skipping git init" };
  }
  const result = spawnSync("git", ["init"], { cwd: resolved, stdio: "ignore" });
  if (result.error || result.status !== 0) {
    return { skipped: true, note: "git init failed; skipping" };
  }
  return { skipped: false };
}
