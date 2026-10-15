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
  /** Implemented features (all v1 features are real manifests now). */
  features: Record<FeatureId, FeatureManifest>;
  presets: Record<string, Preset>;
  /**
   * Asset text keyed by `<prefix>/<relative path>`, where prefix is a framework
   * id (blueprint assets) or a feature id (feature assets). Populated by the
   * I/O loader; consumed by the pure renderer.
   */
  assets: Record<string, string>;
}

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
    workspaceYaml: mergeWorkspaceYaml(base.workspaceYaml, target.workspaceYaml),
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
    fields: { ...a.fields, ...b.fields },
  };
}

function mergeWorkspaceYaml(
  a: FeatureContribution["workspaceYaml"],
  b: FeatureContribution["workspaceYaml"],
): FeatureContribution["workspaceYaml"] {
  if (!a) return b;
  if (!b) return a;
  return { allowBuilds: { ...a.allowBuilds, ...b.allowBuilds } };
}
