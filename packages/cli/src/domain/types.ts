/**
 * Core domain types (docs/03-feature-wiring-spec.md §1, plus docs/04 additions).
 *
 * Pure types + zero I/O helpers. `Answers`/`Plan`/`Registry` flow through the
 * resolution and materialization pipelines without touching fs / network / env.
 */

// ---------- identifiers ----------
export type FeatureId = string; // "hono/zod"; globally unique within the registry
export type FrameworkId = string; // "hono" | "vue" | ...

/**
 * Dependencies are "existence" constraints, not version ranges. v1 publishes the
 * CLI + templates + features atomically, so a feature/feature pair cannot span
 * CLI versions and ranges would only introduce ordering ambiguity.
 */
export type Requirement =
  | { kind: "framework"; id: FrameworkId } // must match the selected framework
  | { kind: "feature"; id: FeatureId }; // must be in the (transitive) selection

// ---------- answers ----------
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/**
 * Project shape chosen in the interactive flow:
 *   - `standalone`: one application generated directly in `targetDir`;
 *   - `monorepo`: a pnpm workspace root in `targetDir`, with the application
 *     generated under `apps/<appName>/`.
 */
export type ProjectType = "standalone" | "monorepo";

export type Answers = {
  /** Project directory, kept verbatim (filesystem use only). */
  targetDir: string;
  /** Normalized package name (see `normalizePackageName`). */
  projectName: string;
  framework: FrameworkId;
  /**
   * Project shape. Missing means `"standalone"` (kept optional so existing
   * programmatic callers and older rc files stay valid).
   */
  projectType?: ProjectType;
  /** Monorepo only: normalized application directory name under `apps/`. */
  appName?: string;
  /** Monorepo only: normalized workspace-root package name. */
  workspaceName?: string;
  /** User's explicit selection; `resolve()` completes the dependency closure. */
  features: FeatureId[];
  packageManager?: PackageManager;
  install?: boolean;
  git?: boolean;
  preset?: string;
  /** Reserved. Only `"ts"` is legal; v1 does not implement variant logic. */
  variant?: "ts";
};

// ---------- file contributions ----------
export interface FileSpec {
  /** Path relative to the feature (or template) directory; a directory = overlay. */
  src: string;
  /** Path relative to the project root. v1: literal, no interpolation. */
  dest: string;
  when?: Condition;
  /** Directory overlay collision with an existing file: default `error`. */
  onCollision?: "error" | "identical-ok";
}

export type ScriptEdit = { set: string } | { prepend: string } | { append: string };

export type PackageJsonPatch = {
  dependencies?: Record<string, string>; // same name, different version → E-DEP-VERSION
  devDependencies?: Record<string, string>;
  scripts?: Record<string, ScriptEdit>;
  /**
   * Arbitrary top-level `package.json` fields (`description`, `engines`,
   * custom keys, ...). Shallow-merged across contributions in a deterministic
   * order; the same key requested with a different value is a hard error
   * (`E-DEP-VERSION`, the existing "same key, conflicting scalar value during
   * package.json merge" code).
   */
  fields?: Record<string, unknown>;
};

// ---------- assembly contributions ----------
export type WiringBlock =
  | { kind: "import"; module: string; named?: string[]; defaultAs?: string; typeOnly?: boolean }
  | { kind: "call"; callee: string; expression: string } // single line: callee(expression)
  | { kind: "raw"; code: string }; // multi-line escape hatch

export interface WiringContribution {
  /** Must be declared in FrameworkBlueprint.assembly, else E-UNK-ANCHOR. */
  anchor: string;
  order: number;
  /** Mutually-exclusive variants within one feature. */
  when?: Condition;
  /** Either an inline block or a fragment file (relative to the feature dir). */
  block: WiringBlock | { src: string; bind?: Record<string, unknown> };
}

/** Logical export table; cross-feature references use logical names, not paths. */
export type Exports = Record<string, string>;

/** Contribution body: `base` is framework-agnostic, `targets` are per-framework. */
export interface FeatureContribution {
  files?: FileSpec[];
  packageJson?: PackageJsonPatch;
  wiring?: WiringContribution[];
  hooks?: { afterMaterialize?: Hook; afterInstall?: Hook };
  /**
   * Structured `pnpm-workspace.yaml` policy. Only the fixed `allowBuilds` map
   * shape is modelled (pnpm ≥11 reads `allowBuilds`; the renderer hand-rolls
   * the emitter — see `renderWorkspaceYaml`). The union of every contribution
   * is emitted as the generated project's `pnpm-workspace.yaml`.
   */
  workspaceYaml?: WorkspaceYamlContribution;
}

export interface WorkspaceYamlContribution {
  allowBuilds?: Record<string, true>;
}

export interface FeatureManifest {
  /** Prefix = framework id, or "common" for cross-framework features. */
  id: FeatureId;
  title: string;
  description: string;
  requires?: Requirement[];
  /** Default-checked in the prompt flow. */
  defaults?: boolean;
  /**
   * Guided interactive section id (declared by the framework blueprint's
   * `promptSections`). Features without one fall back to the generic
   * multiselect ("Other integrations").
   */
  promptSection?: string;
  /**
   * Mutual-exclusion key, e.g. `vue/ui` or `vue/css`. At most one feature per
   * non-empty group may be selected (resolve → `E-CONFLICT`, usage exit 2).
   */
  group?: string;
  exports?: Exports;
  /** Framework-agnostic contribution (e.g. pure deps). */
  base?: FeatureContribution;
  /** Per-framework specialization. */
  targets?: Partial<Record<FrameworkId, FeatureContribution>>;
}

// ---------- framework blueprints ----------
export interface FrameworkBlueprint {
  id: FrameworkId;
  title: string;
  /** Every file that participates in assembly (entry, config, ...). */
  assembly: AssemblySpec[];
  /** Framework baseline contribution (logger, default deps, ...). */
  static: FeatureContribution;
  /**
   * Guided interactive sections, rendered in declaration order. When present,
   * features are asked section by section instead of one flat multiselect.
   */
  promptSections?: PromptSection[];
}

/**
 * One step of a guided interactive flow. `multi` renders a multiselect (zero or
 * more features); `single` renders a select with an explicit "none" option.
 */
export interface PromptSection {
  /** Stable id referenced by `FeatureManifest.promptSection`. */
  id: string;
  /** Prompt message, e.g. "Vue ecosystem". */
  title: string;
  mode: "single" | "multi";
  /** Label of the implicit none option (single mode only). */
  noneLabel?: string;
}

export interface AssemblySpec {
  /** Project-root-relative output path, e.g. "src/index.ts". */
  path: string;
  /** Skeleton file path, relative to the template directory. */
  skeleton: string;
  anchors: Record<string, AnchorSpec>;
}

export interface AnchorSpec {
  kind: "imports" | "list" | "single";
  /** Empty → adopt the baseline; >1 hit → E-SINGLE-SLOT. */
  single?: { default?: WiringBlock | { src: string } };
}

// ---------- plan ----------
export interface Plan {
  answers: Answers;
  framework: FrameworkId;
  /** Normalized user selection (pre-closure). */
  explicitFeatures: FeatureId[];
  /** Resolved closure in stable topological order (explicit + required). */
  features: FeatureId[];
  /** Ambient project context (nested workspace / PM default source). */
  context?: ProjectContext;
}

// ---------- project context (P0) ----------
/** Where the package-manager *default* came from. */
export type PmSource = "env" | "parent" | "default";

/**
 * Data read from the host workspace (`pnpm-workspace.yaml`) when the target is
 * nested inside an existing workspace. Pure data: the I/O layer parses the host
 * file and injects it here; `resolve`/`render` never touch the filesystem.
 */
export interface HostWorkspace {
  /**
   * The host's default `catalog:` map (package name -> declared range). A
   * generated dependency whose name appears here is emitted as `"catalog:"`.
   */
  catalog: Record<string, string>;
  /**
   * Build scripts the host already allows (`allowBuilds` map keys, plus legacy
   * `onlyBuiltDependencies` list entries). Used to diff the required set.
   */
  allowBuilds: string[];
}

export interface ProjectContext {
  /** True when the target lives under an existing workspace root. */
  nestedWorkspace: boolean;
  /** Source of the PM default value (independent of any explicit `--pm`). */
  pmFrom: PmSource;
  /** Host workspace data, injected only when one was found (nested scenario). */
  host?: HostWorkspace;
}

// ---------- materialization ----------
export interface VirtualFile {
  /** Project-root-relative destination path. */
  path: string;
  contents: string;
  /** Provenance recorded into `.code4xrc.json` (`"assembly"` / `"base"` / feature id). */
  source: string;
}

// ---------- conditions & hooks ----------
/**
 * Conditions observe the *resolved* selection (qualified ids + closure) via
 * `answers.features`; the optional `context` carries ambient facts (nested
 * workspace). Both parameters are data — conditions stay pure.
 */
export type Condition = (answers: Answers, context?: ProjectContext) => boolean;
export type Hook = (ctx: unknown) => void | Promise<void>;
