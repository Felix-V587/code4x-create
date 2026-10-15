/**
 * Host-workspace detection & reading (P0 / M10 scenario A).
 *
 * Walks upward from the *parent* of the target directory looking for a
 * `pnpm-workspace.yaml` or a `package.json` carrying a `workspaces` field.
 * When found, the generated project must not emit its own workspace file, and
 * its versions / build policy are diffed against the host's.
 *
 * The host `pnpm-workspace.yaml` is a real, user-authored file, so it is parsed
 * with the `yaml` package (a runtime dependency) rather than hand-rolled
 * string matching.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { parse as parseYaml } from "yaml";

import type { HostWorkspace } from "../domain/types.ts";

export interface HostWorkspaceLocation extends HostWorkspace {
  /** Absolute path of the host workspace root. */
  root: string;
}

/**
 * The nearest ancestor directory that looks like a workspace root: it contains
 * a `pnpm-workspace.yaml` or a `package.json` with a `workspaces` field.
 */
export function findHostWorkspaceRoot(
  targetDir: string,
  cwd: string = process.cwd(),
): string | null {
  let dir = dirname(resolve(cwd, targetDir));
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    if (hasWorkspacesField(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function detectNestedWorkspace(targetDir: string, cwd: string = process.cwd()): boolean {
  return findHostWorkspaceRoot(targetDir, cwd) !== null;
}

/**
 * Read the host workspace's `catalog:` map and allowed build scripts. Returns
 * `undefined` when the target is not nested; when the ancestor only advertises
 * workspaces through `package.json` (no `pnpm-workspace.yaml`) an empty host is
 * returned, preserving nested semantics without inventing data.
 *
 * A malformed host file degrades to an empty host rather than failing the
 * generation (the user's file, not ours).
 */
export function readHostWorkspace(
  targetDir: string,
  cwd: string = process.cwd(),
): HostWorkspaceLocation | undefined {
  const root = findHostWorkspaceRoot(targetDir, cwd);
  if (root === null) return undefined;

  const file = join(root, "pnpm-workspace.yaml");
  if (!existsSync(file)) return { root, catalog: {}, allowBuilds: [] };

  let data: unknown;
  try {
    data = parseYaml(readFileSync(file, "utf8"));
  } catch {
    return { root, catalog: {}, allowBuilds: [] };
  }
  if (typeof data !== "object" || data === null) return { root, catalog: {}, allowBuilds: [] };

  const record = data as Record<string, unknown>;
  return {
    root,
    catalog: readCatalog(record.catalog),
    allowBuilds: readAllowBuilds(record),
  };
}

/** Coerce a YAML `catalog:` map into a `name -> version string` record. */
function readCatalog(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const catalog: Record<string, string> = {};
  for (const [name, range] of Object.entries(value as Record<string, unknown>)) {
    if (range === null || range === undefined) continue;
    if (typeof range === "string" || typeof range === "number") catalog[name] = String(range);
  }
  return catalog;
}

/**
 * Allowed build scripts. pnpm ≥11 reads the `allowBuilds` map (`{ esbuild: true }`);
 * pnpm 10 used `onlyBuiltDependencies: [esbuild]`. Support both so a host that
 * has not migrated still counts as "satisfied".
 */
function readAllowBuilds(record: Record<string, unknown>): string[] {
  const keys = new Set<string>();
  const map = record.allowBuilds;
  if (typeof map === "object" && map !== null && !Array.isArray(map)) {
    for (const [name, allowed] of Object.entries(map as Record<string, unknown>)) {
      if (allowed) keys.add(name);
    }
  }
  const list = record.onlyBuiltDependencies;
  if (Array.isArray(list)) {
    for (const name of list) if (typeof name === "string") keys.add(name);
  }
  return [...keys];
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
