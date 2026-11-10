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
  PmSource,
  ProjectContext,
  ProjectType,
  PromptSection,
  Requirement,
  ScriptEdit,
  VirtualFile,
  WiringBlock,
  WiringContribution,
  WorkspaceYamlContribution,
} from "./domain/types.ts";
export { Code4xError, isCode4xError, fail, usage } from "./domain/errors.ts";
export type { ErrorCode } from "./domain/errors.ts";
export type { Preset, Registry, RuntimeAssembly, RuntimeBlueprint } from "./domain/registry.ts";
export { contributionFor } from "./domain/registry.ts";
export {
  expandPreset,
  groupConflicts,
  normalizePackageName,
  parseFeatureTokens,
  qualifyFeature,
  resolve,
} from "./domain/resolve.ts";
export type { GroupConflict } from "./domain/resolve.ts";
export { collectAllowBuilds, render, renderWorkspaceYaml } from "./domain/render.ts";
export { CancelledError, collectAnswers, isCIEnv, resolveInteractive } from "./domain/flow.ts";
export type { FlowDeps, Prompter, SelectOption } from "./domain/flow.ts";
export { findFeaturesRoot, findTemplatesRoot, loadRegistry } from "./io/loadRegistry.ts";
export { createClackPrompter } from "./io/prompts.ts";
export { detectNestedWorkspace } from "./io/workspace.ts";
export { detectPackageManager, detectPackageManagerWithSource } from "./io/pm.ts";
export type { PmDetection } from "./io/pm.ts";
