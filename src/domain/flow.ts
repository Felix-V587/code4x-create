/**
 * Interactive question flow (docs/04 §1.3) — orchestration only.
 *
 * The actual rendering/input is injected via the `Prompter` interface, so the
 * decision logic ("which fields to ask, defaults, cancellation") is testable
 * without a TTY and @clack/prompts stays a production-only detail.
 */

import { basename, resolve } from "node:path";

import type { Answers, PackageManager, PmSource } from "./types.ts";
import type { Registry } from "./registry.ts";
import { normalizePackageName } from "./resolve.ts";

export class CancelledError extends Error {
  constructor() {
    super("Operation cancelled");
    this.name = "CancelledError";
  }
}

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export interface Prompter {
  intro(message: string): void;
  outro(message: string): void;
  info(message: string): void;
  note(message: string, title?: string): void;
  text(options: { message: string; placeholder?: string; defaultValue?: string }): Promise<string>;
  select(options: {
    message: string;
    options: SelectOption[];
    initialValue?: string;
  }): Promise<string>;
  multiselect(options: {
    message: string;
    options: SelectOption[];
    initialValues?: string[];
    required?: boolean;
  }): Promise<string[]>;
  confirm(options: { message: string; initialValue?: boolean }): Promise<boolean>;
}

export interface PmDetection {
  pm: PackageManager;
  source: PmSource;
}

/** Injected side-effect probes the flow needs (kept out of the pure layer). */
export interface FlowDeps {
  detectPm(targetDir: string): PmDetection;
  nestedGitRepo(targetDir: string): boolean;
}

/**
 * Interactive-mode decision (create-vite style). Explicit `--interactive` /
 * `--no-interactive` wins; otherwise `-y` / `--CI` force non-interactive, and
 * the fallback is `!CI && isTTY`.
 */
export function resolveInteractive(
  flags: { interactive?: boolean; yes: boolean; ci: boolean },
  env: NodeJS.ProcessEnv,
  isTTY: boolean,
): boolean {
  if (flags.interactive !== undefined) return flags.interactive;
  if (flags.yes) return false;
  if (flags.ci || isCIEnv(env)) return false;
  return isTTY;
}

export function isCIEnv(env: NodeJS.ProcessEnv): boolean {
  const value = env.CI;
  return value !== undefined && value !== "" && value !== "false" && value !== "0";
}

const PM_OPTIONS: readonly PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

/** Fill the unbound fields of `partial` by asking, returning a complete `Answers`. */
export async function collectAnswers(
  partial: Partial<Answers>,
  prompter: Prompter,
  registry: Registry,
  deps: FlowDeps,
): Promise<Answers> {
  // N1 — target directory.
  let targetDir = partial.targetDir;
  if (targetDir === undefined) {
    const placeholder = partial.framework ? `./${partial.framework}-api` : "./my-app";
    const answer = await prompter.text({
      message: "Where should we create your project?",
      placeholder,
      defaultValue: placeholder,
    });
    targetDir = answer.trim() === "" ? placeholder : answer.trim();
  }
  const rawBase = basename(resolve(targetDir));
  const projectName = partial.projectName ?? normalizePackageName(rawBase);
  if (partial.projectName === undefined && projectName !== rawBase) {
    prompter.info(`Project name (package.json): ${projectName}`);
  }

  // N2 — framework (dynamic from the registry, no preselection).
  let framework = partial.framework;
  if (framework === undefined) {
    const options = Object.values(registry.frameworks)
      .map((blueprint) => ({ value: blueprint.id, label: blueprint.title }))
      .sort((a, b) => (a.value < b.value ? -1 : 1));
    framework = await prompter.select({ message: "Which framework?", options });
  }

  // N4 — features (implemented features of the chosen framework; closure not prefilled).
  let features = partial.features;
  if (features === undefined) {
    const options = Object.values(registry.features)
      .filter((manifest) => manifest.id.startsWith(`${framework}/`))
      .map((manifest) => ({
        value: manifest.id,
        label: manifest.title,
        hint: manifest.description,
      }))
      .sort((a, b) => (a.value < b.value ? -1 : 1));
    features =
      options.length === 0
        ? []
        : await prompter.multiselect({
            message: `Optional integrations for ${framework}`,
            options,
            required: false,
          });
  }

  // N5 — package manager (default = detection).
  const detection = deps.detectPm(targetDir);
  let packageManager = partial.packageManager;
  if (packageManager === undefined) {
    const options = PM_OPTIONS.map((value) => ({
      value,
      label: value,
      hint:
        value === detection.pm
          ? detection.source === "default"
            ? "detected: none"
            : `detected via ${detection.source}`
          : undefined,
    }));
    packageManager = (await prompter.select({
      message: "Package manager",
      options,
      initialValue: detection.pm,
    })) as PackageManager;
  }

  // N6 — install (default No).
  let install = partial.install;
  if (install === undefined) {
    install = await prompter.confirm({ message: "Install dependencies?", initialValue: false });
  }

  // N7 — git (default Yes; nested repo -> skip + note).
  let git = partial.git;
  if (git === undefined) {
    if (deps.nestedGitRepo(targetDir)) {
      git = false;
      prompter.note("inside existing repo, skipping git init", "git");
    } else {
      git = await prompter.confirm({
        message: "Initialize a git repository?",
        initialValue: true,
      });
    }
  }

  const answers: Answers = {
    targetDir,
    projectName,
    framework,
    features,
    packageManager,
    install,
    git,
  };
  if (partial.preset !== undefined) answers.preset = partial.preset;
  if (partial.variant !== undefined) answers.variant = partial.variant;
  return answers;
}
