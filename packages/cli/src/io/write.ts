/**
 * Filesystem writer. Materializes the virtual file tree via a sibling staging
 * directory (`.code4x-tmp-<name>-*`) followed by an atomic rename, so a target
 * never contains a half-written project (docs/04 §4).
 *
 * Write order (deliberate):
 *   1. every file whose basename is **not** `package.json` is written into
 *      staging, then the staging dir is atomically renamed onto the target;
 *   2. `package.json` files are written **directly into the final target**
 *      afterwards (creating parent dirs as needed).
 *
 * Reason: Vite+ `vp create` detects the generated project directory by
 * collecting the `package.json` paths the template process wrote and choosing
 * the shallowest one (`runCommandAndDetectProjectDir` in vite-plus). Writing
 * `package.json` into `.code4x-tmp-*` made vp pick the staging dir, so its
 * post-processing (`vp fmt`, the `Next: cd …` hint) targeted a path that no
 * longer existed after the rename. Deferring `package.json` makes the only
 * observed write land on the final path.
 *
 * Trade-off: after the rename there is a sub-millisecond window where the
 * target exists and is complete *except* `package.json`. A crash in that window
 * leaves a directory with a missing `package.json` (still carrying the other
 * files + `.code4xrc.json`, which keeps travelling through staging). This is
 * the documented semantic change; atomicity for the bulk of the tree is
 * unchanged.
 *
 * Non-empty target dirs require `--overwrite` (generated projects only) or
 * `--force` (delete any existing contents). `--overwrite` still refuses to
 * `rm -rf` anything that was not produced by create-code4x; `--force` is the
 * explicit escape hatch.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { fail } from "../domain/errors.ts";
import type { VirtualFile } from "../domain/types.ts";

const WHITELIST = new Set([".git", ".DS_Store", ".code4xrc.json"]);
const TMP_PREFIX = ".code4x-tmp-";

export interface WriteOptions {
  overwrite?: boolean;
  /** Delete any existing target contents (bypasses the generated-project guard). */
  force?: boolean;
  dryRun?: boolean;
}

export interface TargetState {
  exists: boolean;
  /** True when missing or only whitelisted entries (`--force` is unnecessary). */
  empty: boolean;
  /** A previous create-code4x project (`--overwrite` is sufficient). */
  generated: boolean;
}

/** Inspect a target before prompting / writing. */
export function inspectTarget(targetDir: string): TargetState {
  const resolved = resolve(targetDir);
  if (!existsSync(resolved)) return { exists: false, empty: true, generated: false };
  const generated = existsSync(join(resolved, ".code4xrc.json"));
  if (!statSync(resolved).isDirectory()) {
    return { exists: true, empty: false, generated };
  }
  const entries = readdirSync(resolved).filter((entry) => !WHITELIST.has(entry));
  return { exists: true, empty: entries.length === 0, generated };
}

/** Validate the destination; throws `E-DIR-NOT-EMPTY` / `E-OVERWRITE-REFUSED`. */
export function assertWritable(targetDir: string, overwrite: boolean, force = false): void {
  const resolved = resolve(targetDir);
  const state = inspectTarget(resolved);
  if (!state.exists) return;
  if (!statSync(resolved).isDirectory()) {
    fail("E-DIR-NOT-EMPTY", `"${targetDir}" exists and is not a directory`);
  }
  if (state.empty) return;
  if (force) return;
  if (!overwrite) {
    fail("E-DIR-NOT-EMPTY", `directory "${targetDir}" is not empty`, {
      fix: "choose an empty directory, or pass --overwrite (generated) / --force (any directory)",
    });
  }
  if (!state.generated) {
    fail("E-OVERWRITE-REFUSED", `refusing to overwrite "${targetDir}": no .code4xrc.json found`, {
      fix: "pass --force to delete it, or choose an empty directory",
    });
  }
}

/** Write the project atomically; returns the paths written (relative). */
export function writeProject(
  files: VirtualFile[],
  targetDir: string,
  options: WriteOptions = {},
): string[] {
  const resolved = resolve(targetDir);
  const parent = dirname(resolved);
  const name = basename(resolved);

  assertWritable(resolved, options.overwrite ?? false, options.force ?? false);
  if (options.dryRun) return files.map((file) => file.path);

  mkdirSync(parent, { recursive: true });
  sweep(parent, name);

  // `package.json` is deferred until after the rename (see file header).
  const deferred = files.filter((file) => basename(file.path) === "package.json");
  const staged = files.filter((file) => basename(file.path) !== "package.json");

  const staging = mkdtempSync(join(parent, `${TMP_PREFIX}${name}-`));
  try {
    for (const file of staged) {
      const destination = join(staging, file.path);
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, file.contents);
    }
    if (existsSync(resolved)) rmSync(resolved, { recursive: true, force: true });
    renameSync(staging, resolved);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }

  // Write the deferred `package.json` files into the final target.
  for (const file of deferred) {
    const destination = join(resolved, file.path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, file.contents);
  }

  return files.map((file) => file.path);
}

/** Sweep stale staging dirs from previous interrupted runs (same prefix). */
function sweep(parent: string, name: string): void {
  if (!existsSync(parent)) return;
  const prefix = `${TMP_PREFIX}${name}-`;
  for (const entry of readdirSync(parent)) {
    if (entry.startsWith(prefix)) {
      rmSync(join(parent, entry), { recursive: true, force: true });
    }
  }
}
