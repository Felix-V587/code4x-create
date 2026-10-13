/**
 * Filesystem writer. Materializes the virtual file tree via a sibling staging
 * directory (`.code4x-tmp-<name>-*`) followed by an atomic rename, so a target
 * never contains a half-written project (docs/04 §4).
 *
 * Non-empty target dirs require `--overwrite`, which additionally refuses to
 * `rm -rf` anything that was not produced by create-code4x (no `.code4xrc.json`
 * present -> `E-OVERWRITE-REFUSED`).
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
  dryRun?: boolean;
}

/** Validate the destination; throws `E-DIR-NOT-EMPTY` / `E-OVERWRITE-REFUSED`. */
export function assertWritable(targetDir: string, overwrite: boolean): void {
  const resolved = resolve(targetDir);
  if (!existsSync(resolved)) return;
  if (!statSync(resolved).isDirectory()) {
    fail("E-DIR-NOT-EMPTY", `"${targetDir}" exists and is not a directory`);
  }
  const entries = readdirSync(resolved).filter((entry) => !WHITELIST.has(entry));
  if (entries.length === 0) return;
  if (!overwrite) {
    fail("E-DIR-NOT-EMPTY", `directory "${targetDir}" is not empty`, {
      fix: "choose an empty directory, or pass --overwrite to replace a generated project",
    });
  }
  if (!existsSync(join(resolved, ".code4xrc.json"))) {
    fail("E-OVERWRITE-REFUSED", `refusing to overwrite "${targetDir}": no .code4xrc.json found`, {
      fix: "remove the directory manually, or choose an empty one",
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

  assertWritable(resolved, options.overwrite ?? false);
  if (options.dryRun) return files.map((file) => file.path);

  mkdirSync(parent, { recursive: true });
  sweep(parent, name);

  const staging = mkdtempSync(join(parent, `${TMP_PREFIX}${name}-`));
  try {
    for (const file of files) {
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
