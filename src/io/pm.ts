/** Package-manager detection: `npm_config_user_agent` -> fallback `npm`. */

import type { PackageManager } from "../domain/types.ts";

const KNOWN: readonly PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

export function detectPackageManager(env: NodeJS.ProcessEnv = process.env): PackageManager {
  const userAgent = env.npm_config_user_agent;
  if (!userAgent) return "npm";
  const name = userAgent.split(" ")[0]?.split("/")[0];
  return KNOWN.includes(name as PackageManager) ? (name as PackageManager) : "npm";
}
