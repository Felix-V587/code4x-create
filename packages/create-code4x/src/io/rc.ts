/**
 * `.code4xrc.json` writer. Records the resolved closure + per-file provenance
 * and sha256 hashes (the sole pre-embedded feature for future add-to-existing).
 */

import { createHash } from "node:crypto";

import type { Answers, Plan, ProjectContext, VirtualFile } from "../domain/types.ts";

export const RC_FILENAME = ".code4xrc.json";

export interface RcFile {
  generator: { cliVersion: string; preset: string | null };
  answers: Answers;
  plan: {
    features: string[];
    sources: Record<string, string>;
    hashes: Record<string, string>;
  };
  context: ProjectContext;
  /**
   * Present only when the project was generated inside a host workspace and the
   * generated app needs host-side `pnpm-workspace.yaml` entries (which are not
   * emitted by design). Records the *requirement* and the outcome of the diff
   * against the host file, so a later run can replay/verify.
   */
  workspace?: {
    /** Every allowed-build key the generated project needs. */
    requiredAllowBuilds: string[];
    /** Required keys absent from the host `allowBuilds` (the actionable diff). */
    missingAllowBuilds: string[];
    /** Dependency names emitted as `"catalog:"` because the host catalogs them. */
    catalogRewrites: string[];
  };
}

export interface RcWorkspace {
  requiredAllowBuilds: string[];
  missingAllowBuilds: string[];
  catalogRewrites: string[];
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Build the rc payload for the rendered files (rc itself excluded). */
export function buildRc(
  answers: Answers,
  plan: Plan,
  files: VirtualFile[],
  cliVersion: string,
  context: ProjectContext = { nestedWorkspace: false, pmFrom: "default" },
  workspace?: RcWorkspace,
): RcFile {
  const sources: Record<string, string> = {};
  const hashes: Record<string, string> = {};
  for (const file of files) {
    sources[file.path] = file.source;
    hashes[file.path] = sha256(file.contents);
  }
  return {
    generator: { cliVersion, preset: answers.preset ?? null },
    answers,
    plan: { features: plan.features, sources, hashes },
    context,
    ...(workspace ? { workspace } : {}),
  };
}

export function rcVirtualFile(rc: RcFile): VirtualFile {
  return {
    path: RC_FILENAME,
    contents: `${JSON.stringify(rc, null, 2)}\n`,
    source: "metadata",
  };
}
