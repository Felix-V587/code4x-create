/**
 * `.code4xrc.json` writer. Records the resolved closure + per-file provenance
 * and sha256 hashes (the sole pre-embedded feature for future add-to-existing).
 */

import { createHash } from "node:crypto";

import type { Answers, Plan, VirtualFile } from "../domain/types.ts";

export const RC_FILENAME = ".code4xrc.json";

export interface RcFile {
  generator: { cliVersion: string; preset: string | null };
  answers: Answers;
  plan: {
    features: string[];
    sources: Record<string, string>;
    hashes: Record<string, string>;
  };
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
  };
}

export function rcVirtualFile(rc: RcFile): VirtualFile {
  return {
    path: RC_FILENAME,
    contents: `${JSON.stringify(rc, null, 2)}\n`,
    source: "metadata",
  };
}
