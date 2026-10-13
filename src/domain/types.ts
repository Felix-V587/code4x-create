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

export type Answers = {
  /** Project directory, kept verbatim (filesystem use only). */
  targetDir: string;
  /** Normalized package name (see `normalizePackageName`). */
  projectName: string;
  framework: FrameworkId;
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
}

export interface FeatureManifest {
  /** Prefix = framework id, or "common" for cross-framework features. */
  id: FeatureId;
  title: string;
  description: string;
  requires?: Requirement[];
  /** Default-checked in the prompt flow. */
  defaults?: boolean;
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
export type Condition = (answers: Answers) => boolean;
export type Hook = (ctx: unknown) => void | Promise<void>;
