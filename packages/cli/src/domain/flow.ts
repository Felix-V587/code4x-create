/**
 * Interactive question flow (docs/04 §1.3) — orchestration only.
 *
 * The actual rendering/input is injected via the `Prompter` interface, so the
 * decision logic ("which fields to ask, defaults, cancellation") is testable
 * without a TTY and @clack/prompts stays a production-only detail.
 */

import { basename, isAbsolute, join, relative, resolve } from "node:path";

import type {
  Answers,
  FeatureId,
  FeatureManifest,
  FrameworkId,
  PackageManager,
  PmSource,
  ProjectType,
} from "./types.ts";
import type { Registry } from "./registry.ts";
import { fail } from "./errors.ts";
import { FULLSTACK_APPS, uniqueWorkspaceName } from "./fullstack.ts";
import { groupConflicts, normalizePackageName } from "./resolve.ts";

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

/** A parent-folder choice derived from the current workspace configuration. */
export interface WorkspaceFolderOption {
  /** Workspace-root-relative display path (`"."` = root). */
  dir: string;
  /** cwd-relative path used to compose `targetDir`. */
  relativeDir: string;
  /** Raw workspace patterns that produced the option. */
  patterns: string[];
}

/** Workspace data injected by the I/O layer for the "where?" prompt. */
export interface WorkspaceLayoutInfo {
  root: string;
  cwd: string;
  packages: string[];
  folders: WorkspaceFolderOption[];
}

/** Sentinel value of the "Custom folder…" select option. */
export const CUSTOM_FOLDER = "__custom__";

/** Injected side-effect probes the flow needs (kept out of the pure layer). */
export interface FlowDeps {
  detectPm(targetDir: string): PmDetection;
  nestedGitRepo(targetDir: string): boolean;
  /** Optional: when the invocation cwd is inside a workspace, offer folders. */
  workspaceLayout?(): WorkspaceLayoutInfo | undefined;
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

/** Framework-specific default application directory name (monorepo only). */
const APP_NAME_DEFAULTS: Record<FrameworkId, string> = {
  hono: "api",
  vue: "web",
  electron: "desktop",
};

/** Fill the unbound fields of `partial` by asking, returning a complete `Answers`. */
export async function collectAnswers(
  partial: Partial<Answers>,
  prompter: Prompter,
  registry: Registry,
  deps: FlowDeps,
): Promise<Answers> {
  // N0 — project type (standalone / monorepo / full-stack).
  const projectType: ProjectType =
    partial.projectType ??
    ((await prompter.select({
      message: "Project type",
      initialValue: "standalone",
      options: [
        {
          value: "standalone",
          label: "Standard project",
          hint: "Create a single application in the target directory",
        },
        {
          value: "monorepo",
          label: "Monorepo project",
          hint: "pnpm workspace with the application under apps/",
        },
        {
          value: "fullstack",
          label: "Full-stack project",
          hint: "Hono API + Vue web + Electron desktop in one pnpm workspace",
        },
      ],
    })) as ProjectType);

  // N1 — target directory. Inside an existing workspace, scan the `packages`
  // patterns and offer parent folders (plus a custom path), then ask for the
  // project name; otherwise keep the single free-form path prompt.
  let targetDir = partial.targetDir;
  if (targetDir === undefined) {
    const layout = deps.workspaceLayout?.();
    if (layout && layout.folders.length > 0) {
      prompter.info(`Workspace detected: ${layout.root}`);
      const choice = await prompter.select({
        message: "Where should we create your project?",
        initialValue: layout.folders[0]?.relativeDir,
        options: [
          ...layout.folders.map((folder) => ({
            value: folder.relativeDir,
            label: folder.dir === "." ? "Workspace root" : `${folder.dir}/`,
            hint: `matches ${folder.patterns.join(", ")}`,
          })),
          {
            value: CUSTOM_FOLDER,
            label: "Custom folder…",
            hint: "enter a path relative to the workspace root",
          },
        ],
      });

      let baseDir = choice;
      if (choice === CUSTOM_FOLDER) {
        const fallback = layout.folders[0]?.dir ?? "apps";
        const answer = (
          await prompter.text({
            message: "Custom folder (relative to workspace root)",
            placeholder: fallback,
            defaultValue: fallback,
          })
        ).trim();
        const input = answer === "" ? fallback : answer;
        const absolute = isAbsolute(input) ? input : resolve(layout.root, input);
        baseDir = relative(resolve(layout.cwd), absolute) || ".";
      }

      let name = partial.projectName;
      if (name === undefined) {
        const defaultName =
          projectType === "fullstack"
            ? "my-fullstack"
            : projectType === "monorepo"
              ? "my-workspace"
              : "my-app";
        const answer = (
          await prompter.text({
            message: "Project name",
            placeholder: defaultName,
            defaultValue: defaultName,
          })
        ).trim();
        name = answer === "" ? defaultName : answer;
      }
      targetDir = baseDir === "." ? name : join(baseDir, name);
    } else {
      const placeholder =
        projectType === "fullstack"
          ? "./my-fullstack"
          : projectType === "monorepo"
            ? "./my-workspace"
            : partial.framework
              ? `./${partial.framework}-api`
              : "./my-app";
      const answer = await prompter.text({
        message: "Where should we create your project?",
        placeholder,
        defaultValue: placeholder,
      });
      targetDir = answer.trim() === "" ? placeholder : answer.trim();
    }
  }

  // N2 — framework (dynamic from the registry, no preselection). Full-stack
  // projects use a fixed set of frameworks and skip this question.
  let framework = partial.framework;
  if (projectType === "fullstack") {
    if (partial.framework !== undefined) {
      fail("E-CONFLICT", "full-stack projects use fixed frameworks", {
        fix: "remove --framework; full-stack includes hono, vue and electron",
      });
    }
    framework = "fullstack";
  } else if (framework === undefined) {
    const options = Object.values(registry.frameworks)
      .map((blueprint) => ({ value: blueprint.id, label: blueprint.title }))
      .sort((a, b) => (a.value < b.value ? -1 : 1));
    framework = await prompter.select({ message: "Which framework?", options });
  }

  // Monorepo application name (directory under apps/) + workspace root name.
  // Full-stack uses fixed app names; only the workspace root is named.
  let appName: string | undefined;
  let workspaceName: string | undefined;
  let projectName: string;
  if (projectType === "fullstack") {
    const rawBase = basename(resolve(targetDir));
    workspaceName = uniqueWorkspaceName(
      partial.projectName ?? normalizePackageName(rawBase),
      FULLSTACK_APPS.map((app) => app.name),
    );
    projectName = workspaceName;
    if (partial.projectName === undefined && workspaceName !== normalizePackageName(rawBase)) {
      prompter.info(`Workspace name (package.json): ${workspaceName}`);
    }
  } else if (projectType === "monorepo") {
    if (partial.appName === undefined) {
      const defaultAppName = APP_NAME_DEFAULTS[framework] ?? "app";
      const raw = (
        await prompter.text({
          message: "Application name (directory under apps/)",
          placeholder: defaultAppName,
          defaultValue: defaultAppName,
        })
      ).trim();
      const input = raw === "" ? defaultAppName : raw;
      appName = normalizePackageName(input);
      if (appName !== input) {
        prompter.info(`Application name (package.json): ${appName}`);
      }
    } else {
      appName = partial.appName;
    }
    projectName = normalizePackageName(appName);
    workspaceName = normalizePackageName(basename(resolve(targetDir)));
    // pnpm package names must be unambiguous inside one workspace; keep the
    // root distinct when the directory happens to match the app name.
    if (workspaceName === projectName) workspaceName = `${workspaceName}-workspace`;
  } else {
    const rawBase = basename(resolve(targetDir));
    projectName = partial.projectName ?? normalizePackageName(rawBase);
    if (partial.projectName === undefined && projectName !== rawBase) {
      prompter.info(`Project name (package.json): ${projectName}`);
    }
  }

  // N4 — features. Frameworks with guided sections ask them one by one; the
  // rest keep the flat multiselect (closure is still not prefilled). Full-stack
  // uses a fixed per-app feature set.
  let features = partial.features;
  if (projectType === "fullstack") {
    if (partial.features !== undefined) {
      fail("E-CONFLICT", "full-stack projects use fixed per-app features", {
        fix: "remove --features; full-stack uses the api/web/desktop defaults",
      });
    }
    features = [];
  } else if (features === undefined) {
    const sections = registry.frameworks[framework]?.promptSections ?? [];
    features =
      sections.length > 0
        ? await askGuidedFeatures(framework, prompter, registry)
        : await askFlatFeatures(framework, prompter, registry);
  }

  // N5 — package manager. Monorepo/full-stack projects always use pnpm.
  let packageManager: PackageManager;
  if (projectType === "monorepo" || projectType === "fullstack") {
    if (partial.packageManager !== undefined && partial.packageManager !== "pnpm") {
      fail("E-INVALID-VALUE", "workspace projects use pnpm workspaces", {
        fix: "use --pm pnpm or drop --pm",
      });
    }
    if (partial.packageManager === undefined) {
      prompter.info(
        projectType === "fullstack"
          ? "Full-stack projects use pnpm workspaces."
          : "Monorepo projects use pnpm workspaces.",
      );
    }
    packageManager = "pnpm";
  } else {
    const detection = deps.detectPm(targetDir);
    packageManager = partial.packageManager ?? "npm";
    if (partial.packageManager === undefined) {
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
    projectType,
    features,
    packageManager,
    install,
    git,
  };
  if (projectType === "monorepo") {
    answers.appName = appName;
    answers.workspaceName = workspaceName;
  }
  if (projectType === "fullstack") {
    answers.workspaceName = workspaceName;
    answers.stackApps = FULLSTACK_APPS;
  }
  if (partial.preset !== undefined) answers.preset = partial.preset;
  if (partial.variant !== undefined) answers.variant = partial.variant;
  return answers;
}

/** Framework-prefixed manifests, id-sorted (stable prompt ordering). */
function frameworkManifests(framework: FrameworkId, registry: Registry): FeatureManifest[] {
  return Object.values(registry.features)
    .filter((manifest) => manifest.id.startsWith(`${framework}/`))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

function toOptions(manifests: FeatureManifest[]): SelectOption[] {
  return manifests.map((manifest) => ({
    value: manifest.id,
    label: manifest.title,
    hint: manifest.description,
  }));
}

function noteConflict(
  prompter: Prompter,
  conflict: ReturnType<typeof groupConflicts>[number],
): void {
  prompter.note(`"${conflict.group}" allows only one of: ${conflict.members.join(", ")}`, "group");
}

/** Flat multiselect + same-group re-prompt (frameworks without guided sections). */
async function askFlatFeatures(
  framework: FrameworkId,
  prompter: Prompter,
  registry: Registry,
): Promise<FeatureId[]> {
  const options = toOptions(frameworkManifests(framework, registry));
  if (options.length === 0) return [];
  const message = `Optional integrations for ${framework}`;
  let features = await prompter.multiselect({ message, options, required: false });
  for (;;) {
    const conflict = groupConflicts(features, registry)[0];
    if (!conflict) break;
    noteConflict(prompter, conflict);
    features = await prompter.multiselect({
      message,
      options,
      initialValues: features,
      required: false,
    });
  }
  return features;
}

/** Guided sections in declaration order, then "Other integrations". */
async function askGuidedFeatures(
  framework: FrameworkId,
  prompter: Prompter,
  registry: Registry,
): Promise<FeatureId[]> {
  const manifests = frameworkManifests(framework, registry);
  const sections = registry.frameworks[framework]?.promptSections ?? [];
  const explicit: FeatureId[] = [];
  const seen = new Set<FeatureId>();
  const append = (ids: FeatureId[]): void => {
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      explicit.push(id);
    }
  };
  const compose = (picked: FeatureId[]): FeatureId[] => {
    const composed = [...explicit];
    for (const id of picked) if (!composed.includes(id)) composed.push(id);
    return composed;
  };

  const shadcnId = `${framework}/shadcn-vue`;
  // Prompters normally return option values (qualified ids). Accept a bare
  // token too, so scripted / custom prompters stay ergonomic.
  const qualifyPick = (picked: string, candidates: FeatureManifest[]): FeatureId =>
    candidates.find(
      (manifest) => manifest.id === picked || manifest.id === `${framework}/${picked}`,
    )?.id ?? picked;

  for (const section of sections) {
    // shadcn-vue is Tailwind-native: pin the CSS engine and skip the question
    // instead of letting the closure pick a conflicting engine.
    if (section.id === "css" && seen.has(shadcnId)) {
      prompter.note(
        "shadcn-vue locks the CSS engine to Tailwind; skipping the CSS engine question.",
        "css",
      );
      append([`${framework}/tailwind`]);
      continue;
    }

    const candidates = manifests.filter((manifest) => manifest.promptSection === section.id);
    if (candidates.length === 0) continue;
    const options = toOptions(candidates);

    if (section.mode === "multi") {
      let picked = (
        await prompter.multiselect({
          message: section.title,
          options,
          initialValues: candidates
            .filter((manifest) => manifest.defaults === true)
            .map((manifest) => manifest.id),
          required: false,
        })
      ).map((value) => qualifyPick(value, candidates));
      for (;;) {
        const conflict = groupConflicts(compose(picked), registry)[0];
        if (!conflict) break;
        noteConflict(prompter, conflict);
        picked = (
          await prompter.multiselect({
            message: section.title,
            options,
            initialValues: picked,
            required: false,
          })
        ).map((value) => qualifyPick(value, candidates));
      }
      append(picked);
    } else {
      const noneOption: SelectOption = {
        value: "none",
        label: section.noneLabel ?? "None",
      };
      const selectOptions = [noneOption, ...options];
      let picked = qualifyPick(
        await prompter.select({
          message: section.title,
          options: selectOptions,
          initialValue: candidates.find((manifest) => manifest.defaults === true)?.id ?? "none",
        }),
        candidates,
      );
      for (;;) {
        const conflict = groupConflicts(compose(picked === "none" ? [] : [picked]), registry)[0];
        if (!conflict) break;
        noteConflict(prompter, conflict);
        picked = qualifyPick(
          await prompter.select({
            message: section.title,
            options: selectOptions,
            initialValue: picked,
          }),
          candidates,
        );
      }
      if (picked !== "none") append([picked]);
    }
  }

  const other = manifests.filter((manifest) => manifest.promptSection === undefined);
  if (other.length > 0) {
    const options = toOptions(other);
    let picked = await prompter.multiselect({
      message: "Other integrations",
      options,
      required: false,
    });
    for (;;) {
      const conflict = groupConflicts(compose(picked), registry)[0];
      if (!conflict) break;
      noteConflict(prompter, conflict);
      picked = await prompter.multiselect({
        message: "Other integrations",
        options,
        initialValues: picked,
        required: false,
      });
    }
    append(picked);
  }

  // Safety net: a shadcn selection always carries Tailwind explicitly.
  if (seen.has(shadcnId) && !seen.has(`${framework}/tailwind`)) {
    append([`${framework}/tailwind`]);
  }

  return explicit;
}
