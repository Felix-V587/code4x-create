/**
 * Resolution: `Answers -> Plan`. Pure, no I/O.
 *
 * Responsibilities:
 *   - framework existence validation
 *   - feature name normalization (bare -> qualified, unique resolution)
 *   - framework-prefix validation + cross-framework contradiction detection
 *   - dependency closure (`requires`) + cycle detection + stable topological order
 *   - preset expansion (reused by the CLI)
 */

import { fail } from "./errors.ts";
import type { FeatureId, FrameworkId, Answers, Plan, ProjectContext } from "./types.ts";
import type { Preset, Registry } from "./registry.ts";

const COMMON_PREFIX = "common";

/**
 * docs/04 §5④: lowercase, spaces/underscores -> "-", strip illegal chars
 * (including CJK), collapse hyphens, empty -> "my-app".
 */
export function normalizePackageName(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "my-app";
}

export function expandPreset(id: string, reg: Registry): Preset {
  const preset = reg.presets[id];
  if (!preset) {
    fail("E-INVALID-VALUE", `unknown preset "${id}"`, {
      fix: `known presets: ${Object.keys(reg.presets).sort().join(", ") || "(none)"}`,
    });
  }
  return preset;
}

/** Every implemented feature id -> owning framework (derived from its prefix). */
function knownFrameworks(reg: Registry): Record<FeatureId, FrameworkId> {
  const known: Record<FeatureId, FrameworkId> = {};
  for (const id of Object.keys(reg.features)) {
    known[id] = id.split("/")[0] ?? COMMON_PREFIX;
  }
  return known;
}

/** Resolve a single raw feature token to a qualified feature id. */
export function qualifyFeature(token: string, known: Record<FeatureId, FrameworkId>): FeatureId {
  if (token.includes("/")) return token;

  const candidates = Object.keys(known).filter((id) => id === token || id.endsWith(`/${token}`));
  if (candidates.length === 0) {
    fail("E-INVALID-VALUE", `unknown feature "${token}"`, {
      fix: "use a registered feature id (e.g. hono/zod)",
    });
  }
  const result = candidates.sort();
  const frameworks = new Set(result.map((id) => known[id] ?? id.split("/")[0]));
  if (result.length > 1 || frameworks.size > 1) {
    fail("E-AMBIGUOUS-LIST", `feature "${token}" is ambiguous: ${result.join(", ")}`, {
      fix: "use the fully qualified feature id",
    });
  }
  return result[0];
}

/** Parse a raw `--features` value: comma/space separated, `none` clears. */
export function parseFeatureTokens(raw: string | string[] | undefined): string[] {
  if (raw === undefined) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  const tokens = values
    .flatMap((value) => value.split(/[,\s]+/))
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if (tokens.includes("none")) return [];
  return tokens;
}

export interface GroupConflict {
  /** The shared `group` key (e.g. `vue/ui`). */
  group: string;
  /** Selected members of the group, id-sorted. */
  members: FeatureId[];
}

/**
 * Members of any non-empty `group` selected more than once. Groups keep
 * first-seen order; members are id-sorted for deterministic diagnostics.
 */
export function groupConflicts(ids: FeatureId[], reg: Registry): GroupConflict[] {
  const byGroup = new Map<string, FeatureId[]>();
  for (const id of ids) {
    const group = reg.features[id]?.group;
    if (!group) continue;
    const members = byGroup.get(group);
    if (members) members.push(id);
    else byGroup.set(group, [id]);
  }
  const conflicts: GroupConflict[] = [];
  for (const [group, members] of byGroup) {
    if (members.length > 1) conflicts.push({ group, members: [...members].sort() });
  }
  return conflicts;
}

export function resolve(answers: Answers, reg: Registry, context?: ProjectContext): Plan {
  if (!reg.frameworks[answers.framework]) {
    fail("E-INVALID-VALUE", `unknown framework "${answers.framework}"`, {
      fix: `known frameworks: ${Object.keys(reg.frameworks).sort().join(", ") || "(none)"}`,
    });
  }

  const known = knownFrameworks(reg);

  // 1. qualify + validate each explicit token.
  const explicit: FeatureId[] = [];
  const seen = new Set<FeatureId>();
  const featureFrameworks = new Set<FrameworkId>();
  for (const token of answers.features) {
    const id = qualifyFeature(token, known);
    if (seen.has(id)) continue;
    seen.add(id);

    const prefix = id.split("/")[0] ?? COMMON_PREFIX;
    if (prefix !== COMMON_PREFIX) {
      if (!known[id]) {
        fail("E-INVALID-VALUE", `unknown feature "${id}"`);
      }
      featureFrameworks.add(prefix);
    }
    explicit.push(id);
  }

  // 2. cross-framework contradictions.
  if (featureFrameworks.size > 1) {
    fail(
      "E-MIXED-FRAMEWORK",
      `features span multiple frameworks: ${[...featureFrameworks].sort().join(", ")}`,
      { fix: "features must all belong to the selected framework" },
    );
  }
  const featureFramework = [...featureFrameworks][0];
  if (featureFramework && featureFramework !== answers.framework) {
    const culprit = explicit.find((id) => id.startsWith(`${featureFramework}/`));
    fail(
      "E-FEATURE-FRAMEWORK",
      `feature "${culprit}" belongs to framework "${featureFramework}", but --framework is "${answers.framework}".`,
      { fix: `remove it, or run with -f ${featureFramework}` },
    );
  }

  // 3. every explicit feature must be implemented.
  for (const id of explicit) {
    if (!reg.features[id]) {
      fail("E-INVALID-VALUE", `feature "${id}" is not available in this build`, {
        fix: "it is not implemented yet; check the docs for the current feature set",
      });
    }
  }

  // 4. dependency closure.
  const closure = new Set<FeatureId>(explicit);
  const queue = [...explicit];
  while (queue.length > 0) {
    const id = queue.shift() as FeatureId;
    for (const req of reg.features[id]?.requires ?? []) {
      if (req.kind === "framework") {
        if (req.id !== answers.framework) {
          fail(
            "E-MISSING-REQ",
            `feature "${id}" requires framework "${req.id}", but "${answers.framework}" is selected`,
          );
        }
        continue;
      }
      if (!reg.features[req.id]) {
        fail("E-MISSING-REQ", `feature "${id}" requires missing feature "${req.id}"`);
      }
      if (!closure.has(req.id)) {
        closure.add(req.id);
        queue.push(req.id);
      }
    }
  }

  const features = topoSort(closure, reg);

  // 5. mutual exclusion: at most one member of any non-empty `group`.
  const conflict = groupConflicts(features, reg)[0];
  if (conflict) {
    fail(
      "E-CONFLICT",
      `features in group "${conflict.group}" are mutually exclusive: ${conflict.members.join(", ")}`,
      { fix: `choose exactly one of: ${conflict.members.join(", ")}` },
    );
  }

  return {
    answers,
    framework: answers.framework,
    explicitFeatures: explicit,
    features,
    ...(context ? { context } : {}),
  };
}

/** Stable topological order (deps first), id-lexicographic tie-break. */
function topoSort(ids: Set<FeatureId>, reg: Registry): FeatureId[] {
  const result: FeatureId[] = [];
  const state = new Map<FeatureId, 0 | 1 | 2>();

  const visit = (id: FeatureId): void => {
    const current = state.get(id) ?? 0;
    if (current === 1) {
      fail("E-CYCLE", `circular feature dependency involving "${id}"`);
    }
    if (current === 2) return;
    state.set(id, 1);
    const deps = (reg.features[id]?.requires ?? [])
      .filter((req) => req.kind === "feature")
      .map((req) => req.id)
      .sort();
    for (const dep of deps) visit(dep);
    state.set(id, 2);
    result.push(id);
  };

  for (const id of [...ids].sort()) visit(id);
  return result;
}
