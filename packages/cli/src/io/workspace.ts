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
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { parse as parseYaml } from "yaml";

import type { HostWorkspace } from "../domain/types.ts";

export interface HostWorkspaceLocation extends HostWorkspace {
  /** Absolute path of the host workspace root. */
  root: string;
}

/** A selectable parent folder derived from the workspace `packages` patterns. */
export interface WorkspaceFolder {
  /** Workspace-root-relative folder (`"."` = the root itself). */
  dir: string;
  /** Path relative to the invocation cwd, used to build `targetDir`. */
  relativeDir: string;
  /** Workspace patterns that produced this option (diagnostic hint). */
  patterns: string[];
}

/** Detected workspace layout used by the interactive "where?" prompt. */
export interface WorkspaceLayout {
  root: string;
  cwd: string;
  /** Raw `packages` / `workspaces` patterns. */
  packages: string[];
  /** Deduped, id-sorted parent-folder options. */
  folders: WorkspaceFolder[];
}

/**
 * Nearest directory at or above `startDir` that looks like a workspace root:
 * it contains a `pnpm-workspace.yaml` or a `package.json` with `workspaces`.
 */
export function findWorkspaceRootFrom(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    if (hasWorkspacesField(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The nearest ancestor directory that looks like a workspace root from the
 * *parent* of the target directory (a project being generated is not itself
 * the host workspace).
 */
export function findHostWorkspaceRoot(
  targetDir: string,
  cwd: string = process.cwd(),
): string | null {
  return findWorkspaceRootFrom(dirname(resolve(cwd, targetDir)));
}

/**
 * Scan the current workspace's member configuration. Used by the interactive
 * flow to offer parent folders (`apps/`, `packages/`, …) for the new project.
 *
 * Malformed files degrade to an empty pattern list; the workspace root itself
 * is still reported so the flow can fall back to a custom path.
 */
export function readWorkspaceLayout(cwd: string = process.cwd()): WorkspaceLayout | undefined {
  const root = findWorkspaceRootFrom(cwd);
  if (root === null) return undefined;
  const packages = readWorkspacePatterns(root);
  return {
    root,
    cwd: resolve(cwd),
    packages,
    folders: deriveWorkspaceFolders(packages, root, resolve(cwd)),
  };
}

/** `packages:` in pnpm-workspace.yaml, else package.json#workspaces. */
function readWorkspacePatterns(root: string): string[] {
  const workspaceFile = join(root, "pnpm-workspace.yaml");
  if (existsSync(workspaceFile)) {
    try {
      const data = parseYaml(readFileSync(workspaceFile, "utf8")) as unknown;
      if (isRecord(data)) {
        const patterns = readStringList(data.packages);
        if (patterns.length > 0) return patterns;
      }
    } catch {
      // fall through to package.json
    }
  }

  const packageFile = join(root, "package.json");
  if (!existsSync(packageFile)) return [];
  try {
    const pkg = JSON.parse(readFileSync(packageFile, "utf8")) as { workspaces?: unknown };
    if (Array.isArray(pkg.workspaces)) return readStringList(pkg.workspaces);
    if (isRecord(pkg.workspaces)) return readStringList(pkg.workspaces.packages);
  } catch {
    // user file, ignore
  }
  return [];
}

/**
 * Turn glob patterns into parent-folder options. Only patterns whose glob is
 * the final segment are useful for "put a new package here" (`apps/*`,
 * `packages/**`, root-level `*`); exact or complex patterns are skipped and
 * remain reachable through the custom option.
 */
function deriveWorkspaceFolders(patterns: string[], root: string, cwd: string): WorkspaceFolder[] {
  const byDir = new Map<string, Set<string>>();
  for (const raw of patterns) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("!")) continue;
    const normalized = trimmed.replace(/\\/g, "/").replace(/\/+$/, "");
    let dir: string;
    if (normalized === "*" || normalized === "**") {
      dir = ".";
    } else {
      const match = /^(.+?)\/(?:\*|\*\*)$/.exec(normalized);
      if (!match) continue;
      dir = match[1];
    }
    if (dir.includes("*")) continue;
    if (dir !== "." && (isAbsolute(dir) || dir === ".." || dir.startsWith("../"))) continue;
    const set = byDir.get(dir) ?? new Set<string>();
    set.add(trimmed);
    byDir.set(dir, set);
  }

  return [...byDir.entries()]
    .map(([dir, set]) => ({
      dir,
      relativeDir: relative(cwd, resolve(root, dir)) || ".",
      patterns: [...set].sort(),
    }))
    .sort((a, b) => (a.dir === "." ? -1 : b.dir === "." ? 1 : a.dir.localeCompare(b.dir)));
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
