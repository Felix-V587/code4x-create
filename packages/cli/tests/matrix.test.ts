/**
 * Tier-1 combination matrix (`docs/06` acceptance #1 / §M6, `docs/03` §Tier-1).
 *
 * Bounded, offline, `pnpm install`-free: combinations are enumerated *from the
 * runtime registry* (`loadRegistry()`), never a hand-written snapshot, so a
 * newly registered feature/group is covered automatically. Every combo runs
 * `resolve()` + `render()` and is checked for marker leakage, single-write path
 * uniqueness and byte-level idempotency.
 *
 * Which pairs conflict is derived from the manifests' `group` fields through
 * `groupConflicts()` — the exact function `resolve()` enforces — so the mutual
 * exclusion rule and the matrix stay one source of truth (§A0
 * "互斥规则与矩阵同源生成").
 *
 * Explicit non-goals (higher tiers): no dependency install, no network, no CLI
 * spawn. `.code4xrc.json` provenance is I/O-layer and intentionally untested
 * here.
 */

import { performance } from "node:perf_hooks";

import { describe, expect, test } from "vite-plus/test";

import { Code4xError } from "../src/domain/errors.ts";
import { render } from "../src/domain/render.ts";
import { groupConflicts, resolve } from "../src/domain/resolve.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Registry } from "../src/domain/registry.ts";
import type { Answers, FeatureId, FrameworkId, VirtualFile } from "../src/domain/types.ts";

/**
 * Upper bound on pairwise combos rendered per framework. The pairwise family
 * grows O(n²); with the shipped registry the largest framework has three
 * features (three pairs), so the cap only matters once the feature surface
 * expands (M7–M9). 64 keeps total renders in the low hundreds while still
 * covering every single feature and a spread of pair interactions.
 */
const MAX_PAIRWISE_PER_FRAMEWORK = 64;

interface Combo {
  framework: FrameworkId;
  /** Canonical (sorted) selection; base is the empty array. */
  features: FeatureId[];
}

interface ConflictCase {
  framework: FrameworkId;
  group: string;
  /** Exactly two id-sorted members of the group, the minimal rejection probe. */
  members: FeatureId[];
}

function answersFor(framework: FrameworkId, features: FeatureId[]): Answers {
  return {
    targetDir: "./matrix-app",
    projectName: "matrix-app",
    framework,
    features,
    packageManager: "pnpm",
    install: false,
    git: false,
  };
}

/**
 * Features that apply to a framework, derived from the registry: same-prefix
 * features plus cross-framework (`common/`) features that declare a target
 * contribution for it. Mirrors `resolve()`'s prefix rules.
 */
function applicableFeatures(reg: Registry, framework: FrameworkId): FeatureId[] {
  return Object.keys(reg.features)
    .filter((id) => {
      const prefix = id.split("/")[0];
      if (prefix === framework) return true;
      return prefix === "common" && reg.features[id].targets?.[framework] !== undefined;
    })
    .sort();
}

/** Non-empty `group` -> members, for the features of one framework. */
function groupsFor(reg: Registry, framework: FrameworkId): Map<string, FeatureId[]> {
  const byGroup = new Map<string, FeatureId[]>();
  for (const id of applicableFeatures(reg, framework)) {
    const group = reg.features[id].group;
    if (!group) continue;
    const members = byGroup.get(group);
    if (members) members.push(id);
    else byGroup.set(group, [id]);
  }
  return byGroup;
}

/** Dependency closure of a single feature, using the real `resolve()`. */
function closureOf(reg: Registry, framework: FrameworkId, feature: FeatureId): FeatureId[] {
  return resolve(answersFor(framework, [feature]), reg).features;
}

/** Union of both features' closures — equal to the pair's own closure. */
function pairClosure(
  reg: Registry,
  framework: FrameworkId,
  a: FeatureId,
  b: FeatureId,
): FeatureId[] {
  return [...new Set([...closureOf(reg, framework, a), ...closureOf(reg, framework, b)])].sort();
}

/**
 * All conflict-free pairs of a framework's features. A pair conflicts when the
 * union of its closures selects more than one member of any `group`; that test
 * is `groupConflicts()`, the resolve-time authority, fed only by manifest data.
 */
function pairFeatures(reg: Registry, framework: FrameworkId, features: FeatureId[]): FeatureId[][] {
  const pairs: FeatureId[][] = [];
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      const a = features[i];
      const b = features[j];
      if (groupConflicts(pairClosure(reg, framework, a, b), reg).length > 0) continue;
      pairs.push([a, b]);
    }
  }
  return pairs;
}

/** Deterministic evenly-spaced subset of a sorted list (no clock, no RNG). */
function capCombos<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const step = items.length / max;
  const capped: T[] = [];
  for (let i = 0; i < max; i++) capped.push(items[Math.floor(i * step)]);
  return capped;
}

/**
 * Build the matrix purely from the registry: base + every single feature +
 * every group's minimal conflict probe + conflict-free pairwise combos.
 */
function buildMatrix(reg: Registry): { combos: Combo[]; conflicts: ConflictCase[] } {
  const combos: Combo[] = [];
  const conflicts: ConflictCase[] = [];
  const seen = new Set<string>();
  const push = (framework: FrameworkId, features: FeatureId[]): void => {
    const sorted = [...features].sort();
    const key = `${framework}\u0000${sorted.join(",")}`;
    if (seen.has(key)) return;
    seen.add(key);
    combos.push({ framework, features: sorted });
  };

  for (const framework of Object.keys(reg.frameworks).sort()) {
    push(framework, []); // zero-feature base
    const features = applicableFeatures(reg, framework);
    // All single-feature selections: this is also every "exactly one choice
    // from a group" case, since a group member is an ordinary feature.
    for (const feature of features) push(framework, [feature]);

    // One conflict probe per group: two members must be rejected.
    const groups = [...groupsFor(reg, framework)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [group, members] of groups) {
      const sorted = [...members].sort();
      if (sorted.length >= 2) conflicts.push({ framework, group, members: sorted.slice(0, 2) });
    }

    // Bounded pairwise family (conflicting pairs are skipped above).
    const pairs = capCombos(pairFeatures(reg, framework, features), MAX_PAIRWISE_PER_FRAMEWORK);
    for (const pair of pairs) push(framework, pair);
  }

  return { combos, conflicts };
}

/** Stable, byte-level serialization used for the idempotency assertion. */
function serialize(files: VirtualFile[]): string {
  return files.map((file) => `${file.path}\u0000${file.contents}`).join("\u0001");
}

const registry = loadRegistry();
const matrix = buildMatrix(registry);

describe("Tier-1 combination matrix: registry-driven enumeration", () => {
  test("covers the zero-feature base plus every single feature of every framework", () => {
    for (const framework of Object.keys(registry.frameworks).sort()) {
      expect(matrix.combos).toContainEqual({ framework, features: [] });
      const singles = matrix.combos
        .filter((combo) => combo.framework === framework && combo.features.length === 1)
        .map((combo) => combo.features[0]);
      // Count + membership come from the registry (no hard-coded snapshot): if
      // a feature is registered, it appears here.
      expect(singles).toEqual(applicableFeatures(registry, framework));
    }
  });

  test("pairwise combos exclude conflicting pairs and honor the deterministic cap", () => {
    for (const framework of Object.keys(registry.frameworks).sort()) {
      const features = applicableFeatures(registry, framework);
      const expected = capCombos(
        pairFeatures(registry, framework, features),
        MAX_PAIRWISE_PER_FRAMEWORK,
      ).map((pair) => pair.join(","));
      const actual = matrix.combos
        .filter((combo) => combo.framework === framework && combo.features.length === 2)
        .map((combo) => combo.features.join(","));
      expect(actual).toEqual(expected);
      // Every kept pair is conflict-free according to the manifests' groups.
      for (const pair of pairFeatures(registry, framework, features)) {
        expect(
          groupConflicts(pairClosure(registry, framework, pair[0], pair[1]), registry),
        ).toEqual([]);
      }
    }
  });

  test("conflict probes are derived from manifest groups (single source of truth)", () => {
    let expectedGroups = 0;
    for (const framework of Object.keys(registry.frameworks).sort()) {
      for (const members of groupsFor(registry, framework).values()) {
        if (members.length >= 2) expectedGroups += 1;
      }
    }
    expect(matrix.conflicts).toHaveLength(expectedGroups);
  });

  for (const framework of Object.keys(registry.frameworks).sort()) {
    test(`renders and re-renders every ${framework} combination offline`, () => {
      const combos = matrix.combos.filter((combo) => combo.framework === framework);
      expect(combos.length).toBeGreaterThan(0);

      const started = performance.now();
      let filesRendered = 0;
      for (const combo of combos) {
        const label = `${framework} [${combo.features.join(", ") || "base"}]`;
        const files = render(resolve(answersFor(framework, combo.features), registry), registry);
        filesRendered += files.length;

        // Each path is produced exactly once.
        const paths = files.map((file) => file.path);
        expect(new Set(paths).size, `duplicate path in ${label}`).toBe(paths.length);

        // No skeleton markers leak into generated output.
        for (const file of files) {
          expect(file.contents, `marker leaked in ${label} -> ${file.path}`).not.toContain(
            "@code4x",
          );
        }

        // Same combo renders byte-identically (pure function).
        const second = render(resolve(answersFor(framework, combo.features), registry), registry);
        expect(serialize(second), `not idempotent: ${label}`).toBe(serialize(files));
      }

      const elapsed = performance.now() - started;
      console.log(
        `[matrix] ${framework}: ${combos.length} combos / ${filesRendered} files in ${elapsed.toFixed(1)}ms`,
      );
    });
  }

  test("same-group selections fail with E-CONFLICT (usage exit 2, fix names members)", () => {
    for (const conflict of matrix.conflicts) {
      const [a, b] = conflict.members;
      let thrown: unknown;
      try {
        resolve(answersFor(conflict.framework, conflict.members), registry);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, `expected E-CONFLICT for ${conflict.group}`).toBeInstanceOf(Code4xError);
      const error = thrown as Code4xError;
      expect(error.code).toBe("E-CONFLICT");
      expect(error.exitCode).toBe(2);
      expect(error.message).toContain(conflict.group);
      expect(error.fix).toContain(a);
      expect(error.fix).toContain(b);
    }
  });
});

describe("Tier-1 matrix is registry-driven (no snapshot)", () => {
  // A cloned registry with two brand-new grouped features: the matrix must pick
  // them up without any edit to the test. The group key is test-only (the
  // shipped registry now uses `vue/ui` for naive-ui / element-plus).
  const extended: Registry = {
    ...registry,
    features: {
      ...registry.features,
      "vue/ui-alpha": {
        id: "vue/ui-alpha",
        title: "Alpha",
        description: "test-only grouped feature",
        group: "vue/ui-probe",
      },
      "vue/ui-beta": {
        id: "vue/ui-beta",
        title: "Beta",
        description: "test-only grouped feature",
        group: "vue/ui-probe",
      },
    },
  };
  const extendedMatrix = buildMatrix(extended);

  test("auto-enumerates a newly registered feature's single selections", () => {
    expect(extendedMatrix.combos).toContainEqual({ framework: "vue", features: ["vue/ui-alpha"] });
    expect(extendedMatrix.combos).toContainEqual({ framework: "vue", features: ["vue/ui-beta"] });
  });

  test("auto-derives exactly-one group choices and an E-CONFLICT probe", () => {
    const conflict = extendedMatrix.conflicts.find((entry) => entry.group === "vue/ui-probe");
    expect(conflict).toBeDefined();
    expect(conflict?.members).toEqual(["vue/ui-alpha", "vue/ui-beta"]);
    // The conflicting pair is never rendered as a valid combo.
    expect(extendedMatrix.combos).not.toContainEqual({
      framework: "vue",
      features: ["vue/ui-alpha", "vue/ui-beta"],
    });
  });
});
