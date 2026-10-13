export type {
  Answers,
  AnchorSpec,
  AssemblySpec,
  Condition,
  Exports,
  FeatureContribution,
  FeatureId,
  FeatureManifest,
  FileSpec,
  FrameworkBlueprint,
  FrameworkId,
  Hook,
  PackageJsonPatch,
  PackageManager,
  Plan,
  Requirement,
  ScriptEdit,
  VirtualFile,
  WiringBlock,
  WiringContribution,
} from "./domain/types.ts";
export { Code4xError, isCode4xError, fail, usage } from "./domain/errors.ts";
export type { ErrorCode } from "./domain/errors.ts";
export type { Preset, Registry, RuntimeAssembly, RuntimeBlueprint } from "./domain/registry.ts";
export { V1_FEATURE_CATALOG, contributionFor } from "./domain/registry.ts";
export {
  expandPreset,
  normalizePackageName,
  parseFeatureTokens,
  qualifyFeature,
  resolve,
} from "./domain/resolve.ts";
export { render } from "./domain/render.ts";
export { findFeaturesRoot, findTemplatesRoot, loadRegistry } from "./io/loadRegistry.ts";
