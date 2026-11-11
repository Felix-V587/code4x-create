/**
 * Materialization: `Plan -> VirtualFile[]`. Pure, no I/O.
 *
 * The registry already carries every skeleton/asset as text, so this is a pure
 * function of `(plan, registry)`. Consequence: the same plan renders
 * byte-identically twice (idempotency), which the tests assert directly.
 */

import { fail } from "./errors.ts";
import { contributionFor } from "./registry.ts";
import { patchHonoWorkspaceEnv, patchVueWorkspaceEnv, workspaceEnvFiles } from "./workspaceEnv.ts";
import type { Registry, RuntimeAssembly } from "./registry.ts";
import type {
  AnchorSpec,
  Answers,
  FeatureContribution,
  FeatureId,
  PackageJsonPatch,
  PeerDependencyRules,
  Plan,
  ProjectContext,
  ScriptEdit,
  VirtualFile,
  WiringBlock,
  WiringContribution,
} from "./types.ts";

interface ContributionSource {
  /** Provenance label for `.code4xrc.json` (`"base"` or a feature id). */
  source: string;
  featureId: FeatureId | null;
  rank: number;
  assetPrefix: string;
  contribution: FeatureContribution;
}

interface Hit {
  block: WiringBlock;
  order: number;
  rank: number;
  featureId: string;
}

// Marker lines: `// @code4x:begin <anchor>` (code), `/* @code4x:begin <anchor> */`
// (CSS / block comments) or `<!-- @code4x:begin <anchor> -->` (HTML/template).
// Must be a whole line.
const MARKER = /^([ \t]*)(?:\/\/|<!--|\/\*) @code4x:(begin|end) (\S+?)(?: -->|\s*\*\/)?[ \t]*$/;

export function render(
  plan: Plan,
  reg: Registry,
  context: ProjectContext | undefined = plan.context,
): VirtualFile[] {
  const blueprint = reg.frameworks[plan.framework];
  if (!blueprint) {
    fail("E-INVALID-VALUE", `unknown framework "${plan.framework}"`);
  }

  if (plan.answers.projectType !== "monorepo") {
    return renderApplication(plan, reg, context);
  }

  return renderMonorepo(plan, reg, context, blueprint.title);
}

/**
 * Monorepo materialization: the rendered app tree (as if nested in a workspace)
 * under `apps/<appName>/`, plus the generated workspace-root files.
 */
function renderMonorepo(
  plan: Plan,
  reg: Registry,
  context: ProjectContext | undefined,
  frameworkTitle: string,
): VirtualFile[] {
  const appName = validateAppName(plan.answers.appName);
  const workspaceName = validateWorkspaceName(plan.answers.workspaceName);

  // The generated workspace is its own root: render the app as nested (which
  // suppresses the app-level `pnpm-workspace.yaml` and scopes tailwind), but do
  // not inherit a host catalog (a fresh workspace root must keep the template
  // versions).
  const nestedContext: ProjectContext = {
    nestedWorkspace: true,
    pmFrom: context?.pmFrom ?? "default",
    host: { catalog: {}, allowBuilds: [] },
  };

  const appFiles = renderApplication(plan, reg, nestedContext);
  const prefix = `apps/${appName}`;
  const files: VirtualFile[] = appFiles.map((file) => ({
    ...file,
    path: `${prefix}/${file.path}`,
  }));
  adaptNestedApp(files, prefix);
  if (plan.framework === "hono") patchHonoWorkspaceEnv(files, prefix);
  if (plan.framework === "vue") patchVueWorkspaceEnv(files, prefix, { rewrite: true });

  const appPackage = appFiles.find((file) => file.path === "package.json");
  const scripts = monorepoRootScripts(appPackage?.contents, appName);

  files.push(
    {
      path: WORKSPACE_YAML_PATH,
      contents: renderMonorepoWorkspaceYaml(
        collectAllowBuilds(plan, reg),
        collectPeerDependencyRules(plan, reg),
      ),
      source: "base",
    },
    {
      path: "package.json",
      contents: renderMonorepoPackageJson(
        workspaceName,
        scripts,
        vitePlusRange(appPackage?.contents),
      ),
      source: "monorepo",
    },
    {
      path: "vite.config.ts",
      contents: renderMonorepoViteConfig(appName),
      source: "monorepo",
    },
    ...workspaceEnvFiles(),
    {
      path: ".gitignore",
      contents: WORKSPACE_GITIGNORE,
      source: "base",
    },
    {
      path: "README.md",
      contents: renderMonorepoReadme(workspaceName, appName, frameworkTitle),
      source: "monorepo",
    },
  );

  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function renderApplication(
  plan: Plan,
  reg: Registry,
  context: ProjectContext | undefined,
): VirtualFile[] {
  const blueprint = reg.frameworks[plan.framework];
  if (!blueprint) {
    fail("E-INVALID-VALUE", `unknown framework "${plan.framework}"`);
  }

  const rank = new Map<FeatureId, number>();
  plan.features.forEach((id, index) => rank.set(id, index));

  // `when` conditions must observe the *resolved* selection (qualified ids +
  // dependency closure), not the raw user tokens. e.g. a bare `--features
  // swagger-openapi` normalizes to `hono/swagger-openapi` only in `plan.features`.
  const conditionAnswers: Answers = { ...plan.answers, features: plan.features };

  const contributions: ContributionSource[] = [
    {
      source: "base",
      featureId: null,
      rank: -1,
      assetPrefix: blueprint.id,
      contribution: blueprint.static,
    },
    ...plan.features.map((id) => ({
      source: id,
      featureId: id,
      rank: rank.get(id) ?? 0,
      assetPrefix: id,
      contribution: contributionFor(reg.features[id], plan.framework),
    })),
  ];

  assertKnownAnchors(blueprint.assembly, contributions);

  const outputs = new Map<string, { file: VirtualFile; onCollision?: "error" | "identical-ok" }>();
  const packagePatches = contributions
    .map((c) => c.contribution.packageJson)
    .filter((patch): patch is PackageJsonPatch => patch !== undefined);

  // 1. static files.
  for (const c of contributions) {
    const isBlueprint = c.featureId === null;
    for (const spec of c.contribution.files ?? []) {
      if (spec.when && !spec.when(conditionAnswers, context)) continue;
      const raw = reg.assets[`${c.assetPrefix}/${spec.src}`];
      if (raw === undefined) {
        fail("E-FILE-WRITE", `missing asset "${c.assetPrefix}/${spec.src}"`);
      }
      let contents = raw;
      if (isBlueprint) contents = contents.replaceAll("{PROJECT}", plan.answers.projectName);
      const catalog = context?.host?.catalog;
      if (
        isBlueprint &&
        spec.dest === "package.json" &&
        (packagePatches.length > 0 || catalog !== undefined)
      ) {
        contents = applyPackagePatches(contents, packagePatches, catalog);
      }
      addFile(outputs, spec.dest, contents, c.source, spec.onCollision);
    }
  }

  // 2. assembled files.
  for (const assembly of blueprint.assembly) {
    const contents = renderAssembly(
      assembly,
      blueprint.id,
      contributions,
      conditionAnswers,
      reg.assets,
      context,
    );
    addFile(outputs, assembly.path, contents, "assembly");
  }

  // 3. structured workspace policy (`pnpm-workspace.yaml`). Emitted only for
  //    standalone projects: a nested workspace owns the build policy.
  const allowBuilds = collectAllowBuilds(plan, reg);
  const peerRules = collectPeerDependencyRules(plan, reg);
  if ((allowBuilds.length > 0 || peerRules !== undefined) && !context?.nestedWorkspace) {
    addFile(outputs, WORKSPACE_YAML_PATH, renderWorkspaceYaml(allowBuilds, peerRules), "base");
  }

  return [...outputs.values()]
    .map((entry) => entry.file)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export const WORKSPACE_YAML_PATH = "pnpm-workspace.yaml";

/**
 * Union of every contribution's `workspaceYaml.allowBuilds`, in a deterministic
 * order: the blueprint base first, then features in resolved plan order, keys
 * first-seen (this pinned order — rather than lexicographic sorting — is a
 * byte-compat contract with the templates).
 */
export function collectAllowBuilds(plan: Plan, reg: Registry): string[] {
  const contributions: FeatureContribution[] = [
    reg.frameworks[plan.framework]?.static ?? {},
    ...plan.features.map((id) => contributionFor(reg.features[id], plan.framework)),
  ];
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const contribution of contributions) {
    for (const key of Object.keys(contribution.workspaceYaml?.allowBuilds ?? {})) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Union of `workspaceYaml.peerDependencyRules` across contributions. Keys are
 * sorted so the emitted YAML is deterministic regardless of feature order.
 */
export function collectPeerDependencyRules(
  plan: Plan,
  reg: Registry,
): PeerDependencyRules | undefined {
  const contributions: FeatureContribution[] = [
    reg.frameworks[plan.framework]?.static ?? {},
    ...plan.features.map((id) => contributionFor(reg.features[id], plan.framework)),
  ];
  const allowedVersions = new Map<string, string>();
  const allowAny = new Set<string>();
  for (const contribution of contributions) {
    const rules = contribution.workspaceYaml?.peerDependencyRules;
    if (!rules) continue;
    for (const [name, range] of Object.entries(rules.allowedVersions ?? {})) {
      if (!allowedVersions.has(name)) allowedVersions.set(name, range);
    }
    for (const name of rules.allowAny ?? []) allowAny.add(name);
  }
  if (allowedVersions.size === 0 && allowAny.size === 0) return undefined;
  return {
    ...(allowedVersions.size > 0
      ? {
          allowedVersions: Object.fromEntries(
            [...allowedVersions.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
          ),
        }
      : {}),
    ...(allowAny.size > 0 ? { allowAny: [...allowAny].sort() } : {}),
  };
}

/**
 * Hand-rolled emitter for the modelled `pnpm-workspace.yaml` sections:
 *
 *   allowBuilds:
 *     <key>: true
 *   peerDependencyRules:
 *     allowedVersions:
 *       <name>: "<range>"
 *
 * Two-space indent, deterministic section order, trailing newline. No YAML
 * dependency is added.
 */
export function renderWorkspaceYaml(
  allowBuilds: string[],
  peerRules?: PeerDependencyRules,
): string {
  const sections: string[] = [];
  if (allowBuilds.length > 0) {
    sections.push(`allowBuilds:\n${allowBuilds.map((key) => `  ${key}: true`).join("\n")}`);
  }
  if (peerRules) sections.push(renderPeerDependencyRules(peerRules));
  return sections.length > 0 ? `${sections.join("\n\n")}\n` : "";
}

function renderPeerDependencyRules(rules: PeerDependencyRules): string {
  const lines = ["peerDependencyRules:"];
  const versions = Object.entries(rules.allowedVersions ?? {});
  if (versions.length > 0) {
    lines.push("  allowedVersions:");
    for (const [name, range] of versions) lines.push(`    ${name}: ${yamlQuote(range)}`);
  }
  if (rules.allowAny && rules.allowAny.length > 0) {
    lines.push("  allowAny:");
    for (const name of rules.allowAny) lines.push(`    - ${name}`);
  }
  return lines.join("\n");
}

/** Single-quoted YAML scalar (the form oxfmt produces for `*` / npm specs). */
function yamlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export const WORKSPACE_GITIGNORE =
  "node_modules\ndist\n*.local\n.DS_Store\n.env\n.env.*\n!.env.example\n";

/**
 * Monorepo adaptation for an already-prefixed app tree:
 *   - the workspace root owns `allowBuilds` / peer policy, so the app-level
 *     `pnpm` block is redundant (and misleading) once nested;
 *   - the standalone README's `.code4xrc.json` section describes a file the app
 *     does not have; replace it with a workspace note and root-level commands.
 */
export function adaptNestedApp(files: VirtualFile[], appPath: string): void {
  const packageFile = files.find((entry) => entry.path === `${appPath}/package.json`);
  if (packageFile) {
    const pkg = parsePackageJson(packageFile.contents);
    if (pkg.pnpm !== undefined) {
      delete pkg.pnpm;
      packageFile.contents = `${JSON.stringify(pkg, null, 2)}\n`;
    }
  }

  const readme = files.find((entry) => entry.path === `${appPath}/README.md`);
  if (readme) {
    let contents = readme.contents.replace(/\n## `\.code4xrc\.json`[\s\S]*$/, "");
    contents = `${contents.replace(/\s+$/, "")}\n`;
    const newline = contents.indexOf("\n");
    if (newline !== -1) {
      const note = [
        "",
        `> **Workspace app** — this app lives under \`${appPath}\` in a pnpm workspace.`,
        "> Run `pnpm install`, `pnpm dev`, `pnpm build`, and `pnpm check` from the workspace root,",
        `> or \`pnpm --filter ./${appPath} <script>\` for this app alone.`,
        "> Generation metadata lives in the root `.code4xrc.json`.",
        "",
      ].join("\n");
      contents = `${contents.slice(0, newline + 1)}${note}${contents.slice(newline + 1)}`;
    }
    readme.contents = contents;
  }
}

/**
 * Workspace-root `pnpm-workspace.yaml` for a generated monorepo. The `packages`
 * block is fixed (`apps/*` + `packages/*`); `allowBuilds` is the same
 * deterministic union the standalone emitter uses. No allowBuilds → no section
 * and no blank line.
 */
export function renderMonorepoWorkspaceYaml(
  allowBuilds: string[],
  peerRules?: PeerDependencyRules,
): string {
  const sections = ["packages:\n  - apps/*\n  - packages/*"];
  if (allowBuilds.length > 0) {
    sections.push(`allowBuilds:\n${allowBuilds.map((key) => `  ${key}: true`).join("\n")}`);
  }
  if (peerRules) sections.push(renderPeerDependencyRules(peerRules));
  return `${sections.join("\n\n")}\n`;
}

function renderMonorepoPackageJson(
  workspaceName: string,
  scripts: Record<string, string>,
  vitePlus: string,
): string {
  return `${JSON.stringify(
    {
      name: workspaceName,
      version: "0.0.0",
      private: true,
      type: "module",
      scripts,
      devDependencies: { "vite-plus": vitePlus },
      engines: { node: ">=22" },
    },
    null,
    2,
  )}\n`;
}

/**
 * The app's `vite-plus` range, reused at the workspace root so root-level
 * `vp run` / `vp check` resolve the same toolchain as the app. Vite+ is a
 * project-local CLI here, so a generated workspace never depends on a globally
 * installed `vp`.
 */
function vitePlusRange(appPackageJson: string | undefined): string {
  if (appPackageJson === undefined) return "^1.5.0";
  const pkg = parsePackageJson(appPackageJson);
  const devDependencies = pkg.devDependencies as Record<string, string> | undefined;
  return devDependencies?.["vite-plus"] ?? "^1.5.0";
}

/**
 * Workspace-root `vite.config.ts`. Vite+ reads `defaultPackage` without
 * executing the config, so bare `vp dev|build|preview|pack` at the root behave
 * like `vp -C apps/<app>` (docs: Monorepo → `defaultPackage`). The lint/fmt
 * blocks mirror the generated app settings so a root-level `vp check` covers
 * every package instead of falling back to Vite+ defaults. `run.cache` is a
 * workspace-root-only option; enabling scripts makes `vp run -r test` (and any
 * other cacheable script) replay unchanged work.
 */
export function renderMonorepoViteConfig(appName?: string): string {
  const defaultPackage =
    appName === undefined
      ? ""
      : `  // 在 workspace 根直接执行 \`vp dev\` / \`vp build\` / \`vp preview\` / \`vp pack\`
  // 时，默认作用到应用目录（等价于隐式 \`vp -C apps/${appName}\`）。
  defaultPackage: {
    dev: './apps/${appName}',
    build: './apps/${appName}',
    preview: './apps/${appName}',
    pack: './apps/${appName}',
  },
`;
  return `import { defineConfig } from 'vite-plus'

export default defineConfig({
${defaultPackage}  run: {
    // 让 package.json scripts 也参与 Vite Task 缓存（Vite+ 任务默认已缓存）。
    cache: { scripts: true },
  },
  lint: {
    ignorePatterns: ['**/dist/**', '**/release/**', '**/auto-imports.d.ts', '**/components.d.ts'],
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    singleQuote: true,
    semi: false,
    sortPackageJson: false,
    ignorePatterns: [
      '**/dist/**',
      '**/release/**',
      '**/.code4xrc.json',
      '**/auto-imports.d.ts',
      '**/components.d.ts',
    ],
  },
})
`;
}

function renderMonorepoReadme(
  workspaceName: string,
  appName: string,
  frameworkTitle: string,
): string {
  return `# ${workspaceName}

Generated by **create-code4x**.

## Workspace layout

- \`apps/${appName}\` — ${frameworkTitle} application
- \`packages/*\` — shared packages

## Getting started

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## Environment

The workspace root \`.env\` (generated, gitignored; see \`.env.example\`) is shared by apps:

- API: \`PORT\`, \`LOG_LEVEL\`
- Web: \`API_DEV_PROXY\` (dev proxy target), \`VITE_API_BASE_URL\` (build-time API base)

Vue loads it through \`envDir: '../../'\`; Hono reads it in \`vite.config.ts\` and via
\`node --env-file=../../.env\` in the generated \`start\` script.

Root scripts run through the project-local Vite+ task runner:

- \`pnpm build\` → \`vp run -r build\` (every workspace package, dependency order)
- \`pnpm check\` → \`vp check\` (format + lint + type check across the workspace)
- \`pnpm dev\` → \`vp run -r dev\`

Bare \`vp dev\` / \`vp build\` / \`vp preview\` at the workspace root target \`apps/${appName}\` via \`defaultPackage\`; use \`vp run --filter ./apps/${appName} <script>\` to run one app script explicitly.
`;
}

function validateAppName(value: string | undefined): string {
  if (
    typeof value !== "string" ||
    value === "" ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\")
  ) {
    fail("E-INVALID-VALUE", "monorepo appName must be a safe single path segment", {
      fix: "pass a non-empty app name without path separators (e.g. `web`)",
    });
  }
  return value;
}

function validateWorkspaceName(value: string | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    fail("E-INVALID-VALUE", "monorepo workspaceName is required", {
      fix: "pass a workspace package name (e.g. `my-workspace`)",
    });
  }
  return value;
}

/**
 * Root scripts, mirroring the app's script keys in declaration order. Scripts
 * that describe workspace-wide work use the Vite+ task runner (`-r`), while
 * long-running or app-specific ones stay pinned to `apps/<appName>`. `check`
 * runs once at the root: `vp check` applies the root lint/fmt/type-check
 * settings to every package, avoiding concurrent oxlint-tsgolint instances.
 */
function monorepoRootScripts(
  appPackageJson: string | undefined,
  appName: string,
): Record<string, string> {
  if (appPackageJson === undefined) return {};
  const pkg = parsePackageJson(appPackageJson);
  const appScripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
  const scripts: Record<string, string> = {};
  for (const key of Object.keys(appScripts)) {
    if (key === "check") {
      scripts[key] = "vp check";
    } else if (key === "build" || key === "test" || key === "typecheck" || key === "dev") {
      scripts[key] = `vp run -r ${key}`;
    } else {
      scripts[key] = `vp run --filter ./apps/${appName} ${key}`;
    }
  }
  return scripts;
}

// --------------------------------------------------------------------------
// assembly rendering
// --------------------------------------------------------------------------

interface Region {
  name: string;
  indent: string;
}

type Token = { type: "line"; text: string } | { type: "region"; name: string; indent: string };

function renderAssembly(
  assembly: RuntimeAssembly,
  blueprintId: string,
  contributions: ContributionSource[],
  answers: Answers,
  assets: Registry["assets"],
  context: ProjectContext | undefined,
): string {
  const { tokens, regions } = parseSkeleton(assembly.skeleton, assembly.path);
  const declared = Object.keys(assembly.anchors);

  for (const name of declared) {
    if (!regions.has(name)) {
      fail("E-MARKER", `skeleton "${assembly.path}" is missing anchor "${name}"`);
    }
  }
  for (const name of regions.keys()) {
    if (!declared.includes(name)) {
      fail("E-MARKER", `skeleton "${assembly.path}" has undeclared marker "${name}"`);
    }
  }

  const lines: string[] = [];
  for (const token of tokens) {
    if (token.type === "line") {
      lines.push(token.text);
      continue;
    }
    const spec = assembly.anchors[token.name];
    const rendered = renderRegion(
      token.name,
      spec,
      token.indent,
      contributions,
      answers,
      blueprintId,
      assets,
      context,
    );
    lines.push(...rendered);
  }
  return collapseBlankLines(lines);
}

function parseSkeleton(
  skeleton: string,
  path: string,
): { tokens: Token[]; regions: Map<string, Region> } {
  const tokens: Token[] = [];
  const regions = new Map<string, Region>();
  let open: { name: string; indent: string } | null = null;

  for (const raw of skeleton.split("\n")) {
    const match = MARKER.exec(raw);
    if (!match) {
      if (!open) tokens.push({ type: "line", text: raw });
      continue;
    }
    const [, indent, keyword, name] = match;
    if (keyword === "begin") {
      if (open) {
        fail("E-MARKER", `skeleton "${path}" nests marker "${name}" inside "${open.name}"`);
      }
      if (regions.has(name)) {
        fail("E-MARKER", `skeleton "${path}" repeats anchor "${name}"`);
      }
      open = { name, indent };
    } else {
      if (!open || open.name !== name) {
        fail("E-MARKER", `skeleton "${path}" has unmatched end marker "${name}"`);
      }
      regions.set(name, { name, indent: open.indent });
      tokens.push({ type: "region", name, indent: open.indent });
      open = null;
    }
  }
  if (open) {
    fail("E-MARKER", `skeleton "${path}" has unclosed anchor "${open.name}"`);
  }
  return { tokens, regions };
}

function renderRegion(
  anchor: string,
  spec: AnchorSpec | undefined,
  indent: string,
  contributions: ContributionSource[],
  answers: Answers,
  blueprintId: string,
  assets: Registry["assets"],
  context: ProjectContext | undefined,
): string[] {
  if (!spec) fail("E-UNK-ANCHOR", `no anchor spec for "${anchor}"`);

  const hits = collectHits(anchor, contributions, answers, assets, context);

  if (spec.kind === "imports") {
    return indentLines(renderImports(hits), indent);
  }

  if (spec.kind === "single") {
    if (hits.length > 1) {
      fail("E-SINGLE-SLOT", `single anchor "${anchor}" received ${hits.length} blocks`);
    }
    if (hits.length === 0) {
      const fallback = spec.single?.default;
      if (!fallback) return [];
      const block = resolveBlock(fallback, blueprintId, assets);
      return indentLines(renderBlockLines(block), indent);
    }
    return indentLines(renderBlockLines(hits[0].block), indent);
  }

  // list
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const hit of hits) {
    // A single contribution's (possibly multi-line) block may legitimately
    // repeat a line (e.g. two identical `ElementPlusResolver` option lines for
    // the element-plus unplugins). Only a statement shared across *different*
    // contributions is a duplicate.
    const local = new Set<string>();
    for (const line of renderBlockLines(hit.block)) {
      if (local.has(line)) {
        lines.push(line);
        continue;
      }
      local.add(line);
      if (seen.has(line)) {
        fail("E-STMT-DUP", `duplicate statement in anchor "${anchor}": ${line}`);
      }
      seen.add(line);
      lines.push(line);
    }
  }
  return indentLines(lines, indent);
}

function collectHits(
  anchor: string,
  contributions: ContributionSource[],
  answers: Answers,
  assets: Registry["assets"],
  context: ProjectContext | undefined,
): Hit[] {
  const hits: Hit[] = [];
  for (const c of contributions) {
    for (const wiring of c.contribution.wiring ?? []) {
      if (wiring.anchor !== anchor) continue;
      if (wiring.when && !wiring.when(answers, context)) continue;
      hits.push({
        block: resolveBlock(wiring.block, c.assetPrefix, assets),
        order: wiring.order,
        rank: c.rank,
        featureId: c.featureId ?? "",
      });
    }
  }
  hits.sort(
    (a, b) =>
      a.order - b.order ||
      a.rank - b.rank ||
      (a.featureId < b.featureId ? -1 : a.featureId > b.featureId ? 1 : 0),
  );
  return hits;
}

function resolveBlock(
  block: WiringContribution["block"],
  assetPrefix: string,
  assets: Registry["assets"],
): WiringBlock {
  if ("kind" in block) return block;
  const raw = assets[`${assetPrefix}/${block.src}`];
  if (raw === undefined) {
    fail("E-FILE-WRITE", `missing wiring fragment "${assetPrefix}/${block.src}"`);
  }
  let code = raw;
  for (const [key, value] of Object.entries(block.bind ?? {})) {
    code = code.replaceAll(`{${key}}`, String(value));
  }
  return { kind: "raw", code };
}

function renderBlockLines(block: WiringBlock): string[] {
  switch (block.kind) {
    case "import": {
      const parts: string[] = [];
      if (block.defaultAs) parts.push(block.defaultAs);
      if (block.named && block.named.length > 0) {
        parts.push(`{ ${[...block.named].sort().join(", ")} }`);
      }
      const prefix = block.typeOnly ? "import type" : "import";
      return [`${prefix} ${parts.join(", ")} from '${block.module}'`];
    }
    case "call":
      return [`${block.callee}(${block.expression})`];
    case "raw":
      return block.code.split("\n");
  }
}

// --------------------------------------------------------------------------
// imports aggregation
// --------------------------------------------------------------------------

interface ModuleImports {
  valueDefault?: string;
  valueNamed: Set<string>;
  typeDefault?: string;
  typeNamed: Set<string>;
}

function renderImports(hits: Hit[]): string[] {
  const byModule = new Map<string, ModuleImports>();
  const extras: string[] = [];

  for (const hit of hits) {
    const block = hit.block;
    if (block.kind !== "import") {
      extras.push(...renderBlockLines(block));
      continue;
    }
    let entry = byModule.get(block.module);
    if (!entry) {
      entry = { valueNamed: new Set(), typeNamed: new Set() };
      byModule.set(block.module, entry);
    }
    if (block.defaultAs) {
      if (block.typeOnly) {
        if (entry.typeDefault && entry.typeDefault !== block.defaultAs) {
          fail(
            "E-IMPORT-CONFLICT",
            `module "${block.module}" has conflicting type default imports`,
          );
        }
        entry.typeDefault = block.defaultAs;
      } else {
        if (entry.valueDefault && entry.valueDefault !== block.defaultAs) {
          fail("E-IMPORT-CONFLICT", `module "${block.module}" has conflicting default imports`);
        }
        entry.valueDefault = block.defaultAs;
      }
    }
    const target = block.typeOnly ? entry.typeNamed : entry.valueNamed;
    for (const name of block.named ?? []) target.add(name);
  }

  const modules = [...byModule.keys()].sort((a, b) => {
    const ra = isRelative(a) ? 1 : 0;
    const rb = isRelative(b) ? 1 : 0;
    return ra - rb || (a < b ? -1 : a > b ? 1 : 0);
  });

  const lines: string[] = [];
  for (const module of modules) {
    const entry = byModule.get(module) as ModuleImports;
    const value = formatImportParts(entry.valueDefault, entry.valueNamed);
    if (value.length > 0) lines.push(`import ${value.join(", ")} from '${module}'`);
    const type = formatImportParts(entry.typeDefault, entry.typeNamed);
    if (type.length > 0) lines.push(`import type ${type.join(", ")} from '${module}'`);
  }

  for (const line of extras) lines.push(line);
  return lines;
}

function formatImportParts(defaultAs: string | undefined, named: Set<string>): string[] {
  const parts: string[] = [];
  if (defaultAs) parts.push(defaultAs);
  if (named.size > 0) parts.push(`{ ${[...named].sort().join(", ")} }`);
  return parts;
}

function isRelative(module: string): boolean {
  return module.startsWith("./") || module.startsWith("../");
}

// --------------------------------------------------------------------------
// package.json merging
// --------------------------------------------------------------------------

function applyPackagePatches(
  baseText: string,
  patches: PackageJsonPatch[],
  catalog?: Record<string, string>,
): string {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(baseText) as Record<string, unknown>;
  } catch {
    fail("E-FILE-WRITE", "template package.json is not valid JSON");
  }

  const setKeys = new Set<string>();
  const editKeys = new Set<string>();

  for (const patch of patches) {
    mergeDeps(pkg, "dependencies", patch.dependencies);
    mergeDeps(pkg, "devDependencies", patch.devDependencies);
    mergeFields(pkg, patch.fields);
    const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
    pkg.scripts = scripts;
    for (const [key, edit] of Object.entries(patch.scripts ?? {})) {
      applyScriptEdit(scripts, key, edit, setKeys, editKeys);
    }
  }

  // Host-catalog-aware versions (M10 / OQ-14): any dependency whose *name*
  // appears in the host `catalog:` map is emitted as the `"catalog:"` protocol,
  // regardless of the caret range the template/manifest declared. Matching is
  // by name only — no fuzzy aliasing.
  if (catalog) applyCatalogVersions(pkg, catalog);

  return `${JSON.stringify(pkg, null, 2)}\n`;
}

function applyCatalogVersions(pkg: Record<string, unknown>, catalog: Record<string, string>): void {
  for (const field of ["dependencies", "devDependencies"] as const) {
    const deps = pkg[field] as Record<string, string> | undefined;
    if (!deps) continue;
    for (const name of Object.keys(deps)) {
      if (Object.prototype.hasOwnProperty.call(catalog, name)) deps[name] = "catalog:";
    }
  }
}

/** Dependency names emitted with the `"catalog:"` protocol, id-sorted. */
export function catalogRewriteNames(packageJsonContents: string): string[] {
  const pkg = parsePackageJson(packageJsonContents);
  const names = new Set<string>();
  for (const field of ["dependencies", "devDependencies"] as const) {
    const deps = (pkg[field] as Record<string, string> | undefined) ?? {};
    for (const [name, version] of Object.entries(deps)) {
      if (version === "catalog:") names.add(name);
    }
  }
  return [...names].sort();
}

/**
 * Dependencies still pinned to an explicit range (candidates for the host
 * `catalog:`, i.e. the "could be cataloged for reuse" suggestions), keyed by
 * name with the emitted version. Id-sorted for deterministic output.
 */
export function catalogCandidates(packageJsonContents: string): Record<string, string> {
  const pkg = parsePackageJson(packageJsonContents);
  const candidates: Record<string, string> = {};
  const seen = new Set<string>();
  for (const field of ["dependencies", "devDependencies"] as const) {
    const deps = (pkg[field] as Record<string, string> | undefined) ?? {};
    for (const [name, version] of Object.entries(deps)) {
      if (version === "catalog:" || seen.has(name)) continue;
      seen.add(name);
      candidates[name] = version;
    }
  }
  return Object.fromEntries(Object.entries(candidates).sort(([a], [b]) => (a < b ? -1 : 1)));
}

function parsePackageJson(contents: string): Record<string, unknown> {
  try {
    return JSON.parse(contents) as Record<string, unknown>;
  } catch {
    fail("E-FILE-WRITE", "generated package.json is not valid JSON");
  }
}

/**
 * Shallow-merge `package.json#fields` across contributions. Keys are applied in
 * sorted order within a contribution (contributions themselves are already in a
 * deterministic order), so the output is stable regardless of a manifest's
 * property declaration order. The same key with a different value reuses
 * `E-DEP-VERSION` (the existing "same key, conflicting scalar during
 * package.json merge" domain error, exit 1).
 */
function mergeFields(
  pkg: Record<string, unknown>,
  incoming: Record<string, unknown> | undefined,
): void {
  if (!incoming) return;
  for (const key of Object.keys(incoming).sort()) {
    const value = incoming[key];
    const existing = pkg[key];
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(value)) {
      fail("E-DEP-VERSION", `package.json field "${key}" requested with conflicting values`);
    }
    pkg[key] = value;
  }
}

function mergeDeps(
  pkg: Record<string, unknown>,
  field: "dependencies" | "devDependencies",
  incoming: Record<string, string> | undefined,
): void {
  if (!incoming) return;
  const target = (pkg[field] as Record<string, string> | undefined) ?? {};
  pkg[field] = target;
  for (const [name, version] of Object.entries(incoming)) {
    const existing = target[name];
    if (existing !== undefined && existing !== version) {
      fail(
        "E-DEP-VERSION",
        `dependency "${name}" requested at both "${existing}" and "${version}"`,
      );
    }
    target[name] = version;
  }
}

function applyScriptEdit(
  scripts: Record<string, string>,
  key: string,
  edit: ScriptEdit,
  setKeys: Set<string>,
  editKeys: Set<string>,
): void {
  if ("set" in edit) {
    if (setKeys.has(key) || editKeys.has(key)) {
      fail("E-SCRIPT-KEY", `script "${key}" is set by more than one contribution`);
    }
    setKeys.add(key);
    scripts[key] = edit.set;
    return;
  }
  if (setKeys.has(key)) {
    fail("E-SCRIPT-KEY", `script "${key}" is both set and edited`);
  }
  editKeys.add(key);
  const base = scripts[key];
  if ("prepend" in edit) {
    scripts[key] = base ? `${edit.prepend} && ${base}` : edit.prepend;
  } else {
    scripts[key] = base ? `${base} && ${edit.append}` : edit.append;
  }
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function assertKnownAnchors(
  assembly: RuntimeAssembly[],
  contributions: ContributionSource[],
): void {
  const declared = new Set<string>();
  for (const spec of assembly) for (const name of Object.keys(spec.anchors)) declared.add(name);
  for (const c of contributions) {
    for (const wiring of c.contribution.wiring ?? []) {
      if (!declared.has(wiring.anchor)) {
        fail("E-UNK-ANCHOR", `wiring anchor "${wiring.anchor}" is not declared by any assembly`);
      }
    }
  }
}

function indentLines(lines: string[], indent: string): string[] {
  if (!indent) return lines;
  return lines.map((line) => (line.length === 0 ? "" : indent + line));
}

function collapseBlankLines(lines: string[]): string {
  const out: string[] = [];
  for (const line of lines) {
    const blank = line.trim() === "";
    if (blank && out.length > 0 && out[out.length - 1].trim() === "") continue;
    out.push(line);
  }
  while (out.length > 0 && out[0].trim() === "") out.shift();
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return `${out.join("\n")}\n`;
}

function addFile(
  outputs: Map<string, { file: VirtualFile; onCollision?: "error" | "identical-ok" }>,
  path: string,
  contents: string,
  source: string,
  onCollision?: "error" | "identical-ok",
): void {
  const existing = outputs.get(path);
  if (existing) {
    const identical = existing.file.contents === contents;
    const forgiving = existing.onCollision === "identical-ok" || onCollision === "identical-ok";
    if (identical && forgiving) return;
    fail("E-FILE-WRITE", `multiple contributions write "${path}"`);
  }
  outputs.set(path, { file: { path, contents, source }, onCollision });
}
