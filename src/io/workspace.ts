/**
 * Nested-workspace detection (P0).
 *
 * Walks upward from the *parent* of the target directory looking for a
 * `pnpm-workspace.yaml` or a `package.json` carrying a `workspaces` field.
 * When found, the generated project must not emit its own workspace file.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function detectNestedWorkspace(targetDir: string, cwd: string = process.cwd()): boolean {
  let dir = dirname(resolve(cwd, targetDir));
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return true;
    if (hasWorkspacesField(join(dir, "package.json"))) return true;
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function hasWorkspacesField(pkgPath: string): boolean {
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { workspaces?: unknown };
    return pkg.workspaces !== undefined;
  } catch {
    return false;
  }
}
