/**
 * Minimal install runner. Spawns `<pm> install` inheriting stdio so Ctrl-C
 * kills the child natively (docs/04 §4). Never triggered by default.
 */

import { spawnSync } from "node:child_process";

import type { PackageManager } from "../domain/types.ts";

export function runInstall(packageManager: PackageManager, cwd: string): number {
  const result = spawnSync(packageManager, ["install"], { cwd, stdio: "inherit" });
  return result.status ?? 1;
}
