#!/usr/bin/env node
/**
 * CLI entry: argument mapping (docs/04 §3.1) + interactive question flow (M4).
 *
 * `prompts` is only the UI of `Answers`: the orchestration lives in
 * `collectAnswers` (domain/flow) and the rendering/input is injected via the
 * `Prompter` interface, so tests run a scripted UI without a TTY.
 */

import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import mri from "mri";

import { Code4xError, isCode4xError, usage } from "./domain/errors.ts";
import {
  expandPreset,
  normalizePackageName,
  parseFeatureTokens,
  resolve as resolvePlan,
} from "./domain/resolve.ts";
import { render } from "./domain/render.ts";
import {
  CancelledError,
  collectAnswers,
  resolveInteractive,
  type Prompter,
} from "./domain/flow.ts";
import { sha256, buildRc, rcVirtualFile, RC_FILENAME, type RcFile } from "./io/rc.ts";
import { loadRegistry } from "./io/loadRegistry.ts";
import { detectPackageManagerWithSource } from "./io/pm.ts";
import { detectNestedWorkspace } from "./io/workspace.ts";
import { findRepoRoot, initGit } from "./io/git.ts";
import { createClackPrompter } from "./io/prompts.ts";
import { runInstall } from "./io/install.ts";
import { writeProject } from "./io/write.ts";
import type { Answers, PackageManager, Plan, ProjectContext, VirtualFile } from "./domain/types.ts";
import type { Registry } from "./domain/registry.ts";

/**
 * CLI version, read at runtime from the nearest `package.json` so all three
 * shapes agree:
 *   - vitest running source (`src/cli.ts` -> repo-root `package.json`);
 *   - the `vp pack` output (`dist/cli.mjs` -> repo-root `package.json`);
 *   - an installed tarball (`…/node_modules/create-code4x/dist/cli.mjs` ->
 *     the package's own `package.json`, which npm always ships).
 */
function readCliVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "..", "package.json"), join(here, "..", "..", "package.json")];
  for (const candidate of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, "utf8")) as {
        name?: unknown;
        version?: unknown;
      };
      if (pkg.name === "create-code4x" && typeof pkg.version === "string") return pkg.version;
    } catch {
      // try the next candidate
    }
  }
  return "0.0.0";
}

export const CLI_VERSION = readCliVersion();

export interface CliIO {
  out: (line: string) => void;
  err: (line: string) => void;
  env: NodeJS.ProcessEnv;
  cwd: string;
  /** Whether stdin is a TTY (injectable for tests). */
  isTTY: boolean;
  /** Prompter factory (production = @clack/prompts; tests = scripted). */
  createPrompter: () => Prompter;
}

const DEFAULT_IO: CliIO = {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  env: process.env,
  cwd: process.cwd(),
  isTTY: Boolean(process.stdin.isTTY),
  createPrompter: createClackPrompter,
};

const VALID_PACKAGE_MANAGERS: readonly PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

const CONFIG_KEYS = new Set([
  "targetDir",
  "projectName",
  "framework",
  "features",
  "packageManager",
  "install",
  "git",
  "preset",
  "variant",
]);

export async function run(argv: string[], overrides: Partial<CliIO> = {}): Promise<number> {
  const io: CliIO = { ...DEFAULT_IO, ...overrides };
  try {
    return await execute(argv, io);
  } catch (error) {
    return reportError(error, io);
  }
}

async function execute(argv: string[], io: CliIO): Promise<number> {
  const parsed = mri(argv, {
    alias: { f: "framework", p: "preset", y: "yes" },
    boolean: ["yes", "install", "git", "json", "overwrite", "dry-run", "CI", "interactive"],
  });

  const registry = loadRegistry();

  const positionalTarget = parsed._[0] !== undefined ? String(parsed._[0]) : undefined;
  const config = parsed.config !== undefined ? readConfig(String(parsed.config), io.cwd) : {};

  const flagFramework = optionalString(parsed.framework);
  const flagPreset = optionalString(parsed.preset);
  const flagPm = optionalString(parsed.pm);
  const flagInstall = optionalBoolean(parsed.install, "--install");
  const flagGit = optionalBoolean(parsed.git, "--git");
  const flagFeatures = normaliseFeatures(parsed.features);
  const yes = Boolean(parsed.yes) || Boolean(parsed.CI);
  const ci = Boolean(parsed.CI);
  const overwrite = Boolean(parsed.overwrite);
  const dryRun = Boolean(parsed["dry-run"]);
  const json = Boolean(parsed.json);

  const interactive = resolveInteractive(
    {
      interactive: parsed.interactive === undefined ? undefined : Boolean(parsed.interactive),
      yes,
      ci,
    },
    io.env,
    io.isTTY,
  );

  // Notes/announcements must not pollute `--json` stdout (JSON only there).
  const note = (line: string): void => {
    if (json) io.err(line);
    else io.out(line);
  };

  // --template alias ({hono,vue} -> framework, preset id -> preset).
  let templateFramework: string | undefined;
  let templatePreset: string | undefined;
  if (parsed.template !== undefined) {
    const value = String(parsed.template);
    if (value === "hono" || value === "vue") {
      templateFramework = value;
      note(`note: --template ${value} -> --framework ${value}`);
    } else if (registry.presets[value]) {
      templatePreset = value;
      note(`note: --template ${value} -> --preset ${value}`);
    } else {
      throw usage("E-INVALID-VALUE", `invalid --template "${value}"`, {
        fix: "expected hono, vue, or a registered preset id",
      });
    }
  }

  // Merge (flag > config > template alias).
  const configFeatures = normaliseFeatures(config.features);
  const configProjectName = optionalString(config.projectName);
  const targetDir = positionalTarget ?? optionalString(config.targetDir);
  if (positionalTarget !== undefined && config.projectName !== undefined) {
    throw usage(
      "E-CONFLICT",
      "project name given by both positional targetDir and config.projectName",
      { fix: "keep only one source of truth" },
    );
  }

  let framework = flagFramework ?? optionalString(config.framework) ?? templateFramework;
  const preset = flagPreset ?? optionalString(config.preset) ?? templatePreset;
  let features = flagFeatures ?? configFeatures;
  const packageManager = flagPm ?? optionalString(config.packageManager);
  const install = flagInstall ?? optionalBoolean(config.install, "install");
  const git = flagGit ?? optionalBoolean(config.git, "git");

  if (config.variant !== undefined && config.variant !== "ts") {
    throw usage("E-INVALID-VALUE", `invalid variant "${JSON.stringify(config.variant)}"`, {
      fix: 'only "ts" is supported',
    });
  }

  // Preset expansion (preset sits below flags/config in the value chain).
  if (preset !== undefined) {
    const expanded = expandPreset(preset, registry);
    framework ??= expanded.framework;
    features ??= expanded.features;
  }

  // Framework inference from features (docs/04 §3.5).
  if (framework === undefined && features !== undefined && features.length > 0) {
    const inferred = inferFramework(features, registry);
    if (inferred) {
      framework = inferred;
      note(`framework inferred: ${inferred} (from features)`);
    }
  }

  if (json && interactive) {
    throw usage("E-INVALID-VALUE", "--json is not supported in interactive mode", {
      fix: "remove --json, or pass -y / --CI",
    });
  }

  const partial: Partial<Answers> = {};
  if (targetDir !== undefined) partial.targetDir = targetDir;
  if (framework !== undefined) partial.framework = framework;
  if (features !== undefined) partial.features = features;
  if (packageManager !== undefined) partial.packageManager = packageManager as PackageManager;
  if (install !== undefined) partial.install = install;
  if (git !== undefined) partial.git = git;
  if (preset !== undefined) partial.preset = preset;
  if (configProjectName !== undefined) partial.projectName = configProjectName;
  if (config.variant === "ts") partial.variant = "ts";

  let answers: Answers;
  if (interactive) {
    const prompter = io.createPrompter();
    prompter.intro("create-code4x");
    try {
      answers = await collectAnswers(partial, prompter, registry, {
        detectPm: (dir) => detectPackageManagerWithSource(io.env, resolve(io.cwd, dir)),
        nestedGitRepo: (dir) => findRepoRoot(dirname(resolve(io.cwd, dir))) !== null,
      });
    } catch (error) {
      if (error instanceof CancelledError) {
        prompter.outro("Operation cancelled");
        return 130;
      }
      throw error;
    }
  } else {
    if (targetDir === undefined) {
      throw usage("E-DIR-REQUIRED", "a project directory is required", {
        fix: "pass it as the first argument, e.g. create-code4x my-api",
      });
    }
    const detection = detectPackageManagerWithSource(io.env, resolve(io.cwd, targetDir));
    answers = {
      targetDir,
      projectName: configProjectName ?? normalizePackageName(basename(resolve(io.cwd, targetDir))),
      framework: framework ?? "hono",
      features: features ?? [],
      packageManager: (packageManager as PackageManager) ?? detection.pm,
      install: install ?? false,
      git: git ?? true,
    };
    if (preset !== undefined) answers.preset = preset;
    if (config.variant === "ts") answers.variant = "ts";
  }

  if (!VALID_PACKAGE_MANAGERS.includes(answers.packageManager as PackageManager)) {
    throw usage("E-INVALID-VALUE", `invalid --pm "${answers.packageManager}"`, {
      fix: VALID_PACKAGE_MANAGERS.join("|"),
    });
  }

  const detection = detectPackageManagerWithSource(io.env, resolve(io.cwd, answers.targetDir));
  const context: ProjectContext = {
    nestedWorkspace: detectNestedWorkspace(answers.targetDir, io.cwd),
    pmFrom: detection.source,
  };

  // Print the fully-expanded manifest before doing anything (docs/04 §3.2).
  if (!json) printManifest(answers, io);

  const plan = resolvePlan(answers, registry, context);
  const rendered = render(plan, registry, context);
  const rc = buildRc(answers, plan, rendered, CLI_VERSION, context);
  const files: VirtualFile[] = [...rendered, rcVirtualFile(rc)];

  if (json) {
    const nextSteps = buildNextSteps(answers);
    io.out(JSON.stringify(buildJsonOutput(answers, plan, files, nextSteps), null, 2));
  }

  const written = writeProject(files, answers.targetDir, { overwrite, dryRun });
  if (dryRun) {
    if (!json) io.out(`dry run: ${written.length} files would be written to ${answers.targetDir}`);
    return 0;
  }

  if (!json) {
    io.out("");
    io.out(summaryLine(answers));
  }

  if (answers.install) {
    const code = runInstall(
      answers.packageManager as PackageManager,
      resolve(io.cwd, answers.targetDir),
    );
    if (code !== 0 && !json) io.err(`install exited with code ${code}`);
  }

  if (answers.git) {
    const result = initGit(resolve(io.cwd, answers.targetDir));
    if (result.skipped && result.note) note(`note: ${result.note}`);
  }

  if (!json) printNextSteps(buildNextSteps(answers), io);
  return 0;
}

// --------------------------------------------------------------------------

function inferFramework(features: string[], registry: Registry): string | undefined {
  const frameworks = new Set<string>();
  for (const token of features) {
    if (token.includes("/")) {
      frameworks.add(token.split("/")[0]);
      continue;
    }
    const match = Object.keys(registry.features).find(
      (id) => id === token || id.endsWith(`/${token}`),
    );
    if (match) frameworks.add(match.split("/")[0]);
  }
  return frameworks.size === 1 ? [...frameworks][0] : undefined;
}

function buildJsonOutput(
  answers: Answers,
  plan: Plan,
  files: VirtualFile[],
  nextSteps: string[],
): object {
  return {
    answers,
    plan: {
      files: files.map((file) => ({
        path: file.path,
        source: file.source,
        hash: sha256(file.contents),
      })),
      features: { explicit: plan.explicitFeatures, resolved: plan.features },
    },
    nextSteps,
  };
}

function buildNextSteps(answers: Answers): string[] {
  const pm = answers.packageManager ?? "npm";
  const steps = [`cd ${answers.targetDir}`];
  if (answers.install) {
    steps.push(`${pm} install`);
  } else {
    steps.push(`${pm} install — skipped (--no-install)`);
  }
  steps.push(`${pm} dev`);
  return steps;
}

function summaryLine(answers: Answers): string {
  const integrations = answers.features.length > 0 ? ` + ${answers.features.join(" + ")}` : "";
  return `✔ Scaffolded ${answers.framework}${integrations} in ${answers.targetDir}  (metadata: ${RC_FILENAME})`;
}

function printManifest(answers: Answers, io: CliIO): void {
  io.out("Scaffold plan:");
  io.out(`  targetDir:  ${answers.targetDir}`);
  io.out(`  package:    ${answers.projectName}`);
  io.out(`  framework:  ${answers.framework}`);
  io.out(`  features:   ${answers.features.length > 0 ? answers.features.join(", ") : "(none)"}`);
  io.out(`  preset:     ${answers.preset ?? "(none)"}`);
  io.out(`  packageMgr: ${answers.packageManager ?? "(none)"}`);
  io.out(`  install:    ${answers.install ? "yes" : "no"}`);
  io.out(`  git:        ${answers.git ? "yes" : "no"}`);
}

function printNextSteps(steps: string[], io: CliIO): void {
  io.out("");
  io.out("Next steps:");
  for (const step of steps) io.out(`  $ ${step}`);
}

function readConfig(path: string, cwd: string): Record<string, unknown> {
  const absolute = resolve(cwd, path);
  let text: string;
  try {
    text = readFileSync(absolute, "utf8");
  } catch {
    throw usage("E-CONFIG-READ", `cannot read config file "${path}"`);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw usage("E-CONFIG-PARSE", `invalid JSON in config file "${path}"`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw usage("E-CONFIG-PARSE", `config file "${path}" must contain a JSON object`);
  }
  for (const key of Object.keys(data)) {
    if (!CONFIG_KEYS.has(key)) {
      throw usage("E-CONFIG-KEY", `unknown config key "${key}"`, {
        fix: `allowed keys: ${[...CONFIG_KEYS].join(", ")}`,
      });
    }
  }
  return data as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function optionalBoolean(value: unknown, flag: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw usage("E-INVALID-VALUE", `${flag} expects a boolean`);
  }
  return value;
}

function normaliseFeatures(value: unknown): string[] | undefined {
  if (typeof value === "string") return parseFeatureTokens(value);
  if (typeof value === "number" || typeof value === "boolean") {
    return parseFeatureTokens(String(value));
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => (typeof entry === "string" ? parseFeatureTokens(entry) : []));
  }
  return undefined;
}

function reportError(error: unknown, io: CliIO): number {
  if (isCode4xError(error)) {
    io.err(`✘ ${error.code} — ${error.message}`);
    if (error.fix) io.err(`  Fix: ${error.fix}`);
    return error.exitCode;
  }
  if (error instanceof Error) {
    io.err(`✘ ${error.message}`);
  } else {
    io.err(`✘ ${String(error)}`);
  }
  return 1;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  void run(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}

export { Code4xError };
export type { RcFile };
