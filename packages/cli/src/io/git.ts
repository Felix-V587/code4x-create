/**
 * `git init`, with nested-repository detection.
 *
 * If the target lives inside an existing repository we skip initializing and
 * return a one-line note (docs/04 §5⑧); the caller prints it.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

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

export interface GitActionResult {
  ok: boolean;
  skipped?: boolean;
  note?: string;
}

/** Create and switch to a new branch inside an existing repository. */
export function switchNewBranch(repoRoot: string, branch: string): GitActionResult {
  const result = spawnSync("git", ["switch", "-c", branch], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.error) return { ok: false, note: result.error.message };
  if (result.status !== 0) {
    return { ok: false, note: `${result.stderr || result.stdout}`.trim() || "git switch failed" };
  }
  return { ok: true };
}

/**
 * Commit the generated project. When the target is the repo root, stage the
 * whole worktree; when it is nested, stage only that directory so unrelated
 * changes in the host repo are left alone.
 */
export function commitProject(
  repoRoot: string,
  targetDir: string,
  message: string,
): GitActionResult {
  const relativeTarget = relative(resolve(repoRoot), resolve(targetDir));
  const addArgs =
    relativeTarget === "" || relativeTarget === "." ? ["add", "-A"] : ["add", "--", relativeTarget];
  const add = spawnSync("git", addArgs, { cwd: repoRoot, encoding: "utf8" });
  if (add.error) return { ok: false, note: add.error.message };
  if (add.status !== 0) {
    return { ok: false, note: `${add.stderr || add.stdout}`.trim() || "git add failed" };
  }

  const commit = spawnSync("git", ["commit", "-m", message], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (commit.error) return { ok: false, note: commit.error.message };
  if (commit.status !== 0) {
    const output = `${commit.stdout ?? ""}${commit.stderr ?? ""}`.trim();
    if (/nothing to commit|no changes added/i.test(output)) {
      return { ok: true, skipped: true, note: "nothing to commit" };
    }
    return { ok: false, note: output || "git commit failed" };
  }
  return { ok: true };
}

export function initGit(targetDir: string): GitResult {
  const resolved = resolve(targetDir);
  if (findRepoRoot(resolved) === resolved) {
    return { skipped: true, note: "already a git repository, skipping git init" };
  }
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
