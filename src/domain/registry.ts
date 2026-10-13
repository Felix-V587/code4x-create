/**
 * Runtime registry shape.
 *
 * The registry is the fully-resolved, in-memory description the pure
 * `resolve()` / `render()` functions consume. Crucially it embeds the *text* of
 * every skeleton and static asset (read once by the I/O layer), so rendering
 * never needs filesystem access.
 */

import type {
  AnchorSpec,
  FeatureContribution,
  FeatureId,
  FeatureManifest,
  FrameworkId,
} from "./types.ts";

/** An assembly spec whose `skeleton` field now holds the skeleton *text*. */
export interface RuntimeAssembly {
  /** Project-root-relative output path. */
  path: string;
  anchors: Record<string, AnchorSpec>;
  skeleton: string;
}

export interface RuntimeBlueprint {
  id: FrameworkId;
  title: string;
  assembly: RuntimeAssembly[];
  /** Framework baseline contribution. */
  static: FeatureContribution;
}

/** Preset: a content bundle carrying `framework` + `features` only. */
export interface Preset {
  id: string;
  framework: FrameworkId;
  features: FeatureId[];
}

export interface Registry {
  frameworks: Record<FrameworkId, RuntimeBlueprint>;
  /** Implemented features (`hono/zod`, `hono/api-guard` in M1). */
  features: Record<FeatureId, FeatureManifest>;
  presets: Record<string, Preset>;
  /**
   * M0 scaffolding: known feature ids mapped to their owning framework. Lets
   * non-interactive name resolution and framework-prefix validation behave
   * correctly before any feature is implemented. Selecting a catalog-only
   * feature is a domain error (`E-INVALID-VALUE`); entries are removed as the
   * real manifests land in M1/M2/M3.
   */
  featureCatalog: Record<FeatureId, FrameworkId>;
  /**
   * Asset text keyed by `<prefix>/<relative path>`, where prefix is a framework
   * id (blueprint assets) or a feature id (feature assets). Populated by the
   * I/O loader; consumed by the pure renderer.
   */
  assets: Record<string, string>;
}

/**
 * Known, not-yet-implemented v1 feature ids -> owning framework (see
 * `featureCatalog`). `hono/zod`, `hono/api-guard` and `hono/swagger-openapi`
 * are real manifests now; the vue features land in M3.
 */
export const V1_FEATURE_CATALOG: Record<FeatureId, FrameworkId> = {
  "vue/pinia": "vue",
  "vue/router": "vue",
};

/** Merge a manifest's `base` + `targets[framework]` into a single contribution. */
export function contributionFor(
  manifest: FeatureManifest,
  framework: FrameworkId,
): FeatureContribution {
  const base = manifest.base ?? {};
  const target = manifest.targets?.[framework] ?? {};
  return {
    files: [...(base.files ?? []), ...(target.files ?? [])],
    wiring: [...(base.wiring ?? []), ...(target.wiring ?? [])],
    packageJson: mergePackageJsonPatch(base.packageJson, target.packageJson),
    hooks: { ...base.hooks, ...target.hooks },
  };
}

function mergePackageJsonPatch(
  a: FeatureContribution["packageJson"],
  b: FeatureContribution["packageJson"],
): FeatureContribution["packageJson"] {
  if (!a) return b;
  if (!b) return a;
  return {
    dependencies: { ...a.dependencies, ...b.dependencies },
    devDependencies: { ...a.devDependencies, ...b.devDependencies },
    scripts: { ...a.scripts, ...b.scripts },
  };
}
