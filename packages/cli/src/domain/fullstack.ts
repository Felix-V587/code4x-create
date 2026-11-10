/**
 * 全栈快捷模式：一次生成 Hono API + Vue Web + Electron 桌面壳的 pnpm 单仓库。
 *
 * 纯函数层：不触碰文件系统；应用计划走现有 `resolve` / `render`，
 * 这里只负责固定组合、路径前缀与工作区根文件。
 */

import { basename } from "node:path";

import { normalizePackageName, resolve } from "./resolve.ts";
import {
  collectAllowBuilds,
  collectPeerDependencyRules,
  render,
  renderMonorepoViteConfig,
  renderMonorepoWorkspaceYaml,
  WORKSPACE_YAML_PATH,
} from "./render.ts";
import type { Registry } from "./registry.ts";
import type {
  Answers,
  FeatureId,
  PeerDependencyRules,
  Plan,
  ProjectContext,
  StackApp,
  VirtualFile,
} from "./types.ts";

/** 全栈模式的固定应用清单（显式 feature，闭包由 resolve 补齐）。 */
export const FULLSTACK_APPS: StackApp[] = [
  {
    name: "api",
    framework: "hono",
    features: ["hono/api-guard", "hono/zod", "hono/testing"],
  },
  {
    name: "web",
    framework: "vue",
    features: [
      "vue/router",
      "vue/pinia",
      "vue/vueuse",
      "vue/vueuse-router",
      "vue/testing",
      "vue/reka-ui",
      "vue/alova",
      "vue/unocss",
    ],
  },
  {
    name: "desktop",
    framework: "electron",
    features: ["electron/builder"],
  },
];

export interface FullstackAppPlan {
  app: StackApp;
  plan: Plan;
}

/** 根包名与任一应用重名时追加后缀，避免 `pnpm --filter` 歧义。 */
export function uniqueWorkspaceName(workspaceName: string, appNames: string[]): string {
  return appNames.includes(workspaceName) ? `${workspaceName}-workspace` : workspaceName;
}

/** 为三个固定应用分别构造 Plan（应用按嵌套 workspace 渲染）。 */
export function buildFullstackPlans(
  answers: Answers,
  registry: Registry,
  context?: ProjectContext,
): FullstackAppPlan[] {
  return FULLSTACK_APPS.map((app) => {
    const appAnswers: Answers = {
      targetDir: answers.targetDir,
      projectName: app.name,
      framework: app.framework,
      projectType: "standalone",
      features: [...app.features],
      packageManager: "pnpm",
      install: false,
      git: false,
    };
    const appContext: ProjectContext = {
      nestedWorkspace: true,
      pmFrom: context?.pmFrom ?? "default",
      host: { catalog: {}, allowBuilds: [] },
    };
    return { app, plan: resolve(appAnswers, registry, appContext) };
  });
}

/** 合并三个应用的 `allowBuilds`（首次出现顺序，保持确定性）。 */
export function collectFullstackAllowBuilds(
  plans: FullstackAppPlan[],
  registry: Registry,
): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const { plan } of plans) {
    for (const key of collectAllowBuilds(plan, registry)) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

/** 合并三个应用的 `peerDependencyRules`。 */
export function collectFullstackPeerDependencyRules(
  plans: FullstackAppPlan[],
  registry: Registry,
): PeerDependencyRules | undefined {
  const allowedVersions = new Map<string, string>();
  const allowAny = new Set<string>();
  for (const { plan } of plans) {
    const rules = collectPeerDependencyRules(plan, registry);
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

/** 渲染完整全栈仓库：三个应用树 + 工作区根文件。 */
export function renderFullstack(
  plans: FullstackAppPlan[],
  registry: Registry,
  answers: Answers,
): VirtualFile[] {
  const workspaceName =
    answers.workspaceName ??
    uniqueWorkspaceName(
      normalizePackageName(basename(answers.targetDir)),
      FULLSTACK_APPS.map((app) => app.name),
    );

  const files: VirtualFile[] = [];
  for (const { app, plan } of plans) {
    for (const file of render(plan, registry, plan.context)) {
      files.push({ ...file, path: `apps/${app.name}/${file.path}` });
    }
  }

  // Electron 开发壳固定占用 `http://localhost:5173`；给浏览器应用分配独立
  // 的严格端口，避免 `pnpm dev` 并行启动时冲突。
  patchWebDevPort(files);

  files.push(
    {
      path: WORKSPACE_YAML_PATH,
      contents: renderMonorepoWorkspaceYaml(
        collectFullstackAllowBuilds(plans, registry),
        collectFullstackPeerDependencyRules(plans, registry),
      ),
      source: "base",
    },
    {
      path: "package.json",
      contents: renderFullstackPackageJson(workspaceName, highestVitePlusRange(files)),
      source: "fullstack",
    },
    {
      path: "vite.config.ts",
      contents: renderMonorepoViteConfig(),
      source: "fullstack",
    },
    {
      path: ".gitignore",
      contents: "node_modules\ndist\n*.local\n.DS_Store\n",
      source: "base",
    },
    {
      path: "README.md",
      contents: renderFullstackReadme(workspaceName),
      source: "fullstack",
    },
  );

  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** 供 `.code4xrc.json` 记录的多应用计划。 */
export interface FullstackRcApp {
  name: string;
  path: string;
  framework: string;
  explicitFeatures: FeatureId[];
  features: FeatureId[];
}

export function fullstackRcApps(plans: FullstackAppPlan[]): FullstackRcApp[] {
  return plans.map(({ app, plan }) => ({
    name: app.name,
    path: `apps/${app.name}`,
    framework: app.framework,
    explicitFeatures: plan.explicitFeatures,
    features: plan.features,
  }));
}

/** 单计划字段（rc/json 兼容）使用所有应用 feature 的并集。 */
export function syntheticFullstackPlan(
  answers: Answers,
  plans: FullstackAppPlan[],
  context?: ProjectContext,
): Plan {
  const explicitFeatures = unique(plans.flatMap(({ plan }) => plan.explicitFeatures));
  const features = unique(plans.flatMap(({ plan }) => plan.features));
  return {
    answers,
    framework: "fullstack",
    explicitFeatures,
    features,
    ...(context ? { context } : {}),
  };
}

function unique(ids: FeatureId[]): FeatureId[] {
  return [...new Set(ids)];
}

function patchWebDevPort(files: VirtualFile[]): void {
  const file = files.find((entry) => entry.path === "apps/web/package.json");
  if (!file) return;
  const pkg = JSON.parse(file.contents) as { scripts?: Record<string, string> };
  pkg.scripts ??= {};
  pkg.scripts.dev = "vp dev --port 5175 --strictPort";
  file.contents = `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Root `vite-plus` range: the highest range used by the fixed apps. pnpm
 * dedupes compatible ranges to one version; taking the highest keeps the root
 * task runner at least as new as every app (all trailing `^` ranges).
 */
function highestVitePlusRange(files: VirtualFile[]): string {
  const ranges = files
    .filter((file) => /^apps\/[^/]+\/package\.json$/.test(file.path))
    .map((file) => {
      const pkg = JSON.parse(file.contents) as {
        devDependencies?: Record<string, string>;
      };
      return pkg.devDependencies?.["vite-plus"];
    })
    .filter((range): range is string => typeof range === "string" && range.length > 0);

  const parsed = ranges
    .map((range) => ({ range, parts: /^\^?(\d+)\.(\d+)\.(\d+)/.exec(range)?.slice(1) }))
    .filter((entry): entry is { range: string; parts: string[] } => entry.parts !== undefined)
    .sort((a, b) => {
      for (let index = 0; index < 3; index += 1) {
        const diff = Number(b.parts[index]) - Number(a.parts[index]);
        if (diff !== 0) return diff;
      }
      return 0;
    });
  return parsed[0]?.range ?? ranges[0] ?? "^1.5.0";
}

function renderFullstackPackageJson(workspaceName: string, vitePlus: string): string {
  return `${JSON.stringify(
    {
      name: workspaceName,
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vp run -r --parallel dev",
        "dev:api": "vp run --filter ./apps/api dev",
        "dev:web": "vp run --filter ./apps/web dev",
        "dev:desktop": "vp run --filter ./apps/desktop dev",
        build: "vp run -r build",
        typecheck: "vp run -r typecheck",
        check: "vp check",
        test: "vp run -r test",
        preview: "vp run --filter ./apps/web preview",
      },
      devDependencies: { "vite-plus": vitePlus },
      engines: { node: ">=22" },
    },
    null,
    2,
  )}\n`;
}

function renderFullstackReadme(workspaceName: string): string {
  return `# ${workspaceName}

由 **create-code4x** 生成的标准全栈单仓库（Vite+ 生态）。

## 应用

- \`apps/api\` —— Hono 后端（api-guard + zod + testing）
- \`apps/web\` —— Vue 前端（router / pinia / vueuse / vueuse-router / testing + reka-ui / alova / unocss）
- \`apps/desktop\` —— Electron 桌面壳（electron-builder）

## 快速开始

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## 常用脚本

根脚本经项目内 Vite+ 任务运行器执行（不需要全局安装 \`vp\`）：

- \`pnpm build\` → \`vp run -r build\`：按依赖顺序构建所有应用
- \`pnpm check\` → \`vp check\`：对整个 workspace 做格式化 + lint + 类型检查
- \`pnpm test\` → \`vp run -r test\`：递归执行各应用测试
- \`pnpm dev\` → \`vp run -r --parallel dev\`：并行启动三端
- \`pnpm dev:api\`（3000）/ \`pnpm dev:web\`（5175）/ \`pnpm dev:desktop\`（Electron 窗口）：单独启动某个应用
- \`pnpm preview\`：预览前端构建产物

包管理器固定 pnpm；\`packages/*\` 已加入 workspace 配置，可按需放置共享代码。
`;
}
