/** Package-manager detection: `npm_config_user_agent` -> parent workspace -> `npm`. */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { PackageManager, PmSource } from "../domain/types.ts";

const KNOWN: readonly PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

export interface PmDetection {
  pm: PackageManager;
  source: PmSource;
}

export function detectPackageManager(env: NodeJS.ProcessEnv = process.env): PackageManager {
  return detectPackageManagerWithSource(env).pm;
}

/**
 * Resolve the PM *default* and where it came from:
 *   - `env`: `npm_config_user_agent` names a known PM (the invoking tool);
 *   - `parent`: nearest ancestor `package.json` with a `packageManager` field;
 *   - `default`: fallback `npm`.
 */
export function detectPackageManagerWithSource(
  env: NodeJS.ProcessEnv = process.env,
  startDir?: string,
): PmDetection {
  const userAgent = env.npm_config_user_agent;
  if (userAgent) {
    const name = userAgent.split(" ")[0]?.split("/")[0];
    if (KNOWN.includes(name as PackageManager)) {
      return { pm: name as PackageManager, source: "env" };
    }
  }
  if (startDir) {
    const parent = findParentPackageManager(startDir);
    if (parent) return { pm: parent, source: "parent" };
  }
  return { pm: "npm", source: "default" };
}

function findParentPackageManager(startDir: string): PackageManager | undefined {
  let dir = resolve(startDir);
  for (;;) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { packageManager?: unknown };
        if (typeof pkg.packageManager === "string") {
          const name = pkg.packageManager.split("@")[0];
          if (KNOWN.includes(name as PackageManager)) return name as PackageManager;
        }
      } catch {
        // ignore malformed parent package.json
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
