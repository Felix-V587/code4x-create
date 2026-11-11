/**
 * 全栈快捷模式：一次生成 Hono API + Vue Web + Electron 桌面壳的 pnpm 单仓库。
 *
 * 纯函数层：不触碰文件系统；应用计划走现有 `resolve` / `render`，
 * 这里只负责固定组合、路径前缀与工作区根文件。
 */

import { basename } from "node:path";

import { applyFullstackScaffold, sharedTypesPackageName } from "./fullstackScaffold.ts";
import { patchHonoWorkspaceEnv, patchVueWorkspaceEnv, workspaceEnvFiles } from "./workspaceEnv.ts";
import { expandPreset, normalizePackageName, resolve } from "./resolve.ts";
import {
  adaptNestedApp,
  collectAllowBuilds,
  collectPeerDependencyRules,
  renderApplication,
  renderMonorepoViteConfig,
  renderMonorepoWorkspaceYaml,
  WORKSPACE_GITIGNORE,
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
    // Production-grade API preset: docs + logging + hardening.
    preset: "hono-full",
    features: [],
  },
  {
    name: "web",
    framework: "vue",
    // Standard Vue baseline + the full-stack request/UI/CSS layer.
    preset: "vue-standard",
    features: ["vue/vueuse-router", "vue/testing", "vue/reka-ui", "vue/alova", "vue/unocss"],
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

/** Expand an app's standard preset before appending its extra features. */
function presetFeatures(app: StackApp, registry: Registry): FeatureId[] {
  return app.preset === undefined ? [] : [...expandPreset(app.preset, registry).features];
}

/** 为三个固定应用分别构造 Plan（应用按嵌套 workspace 渲染）。 */
export function buildFullstackPlans(
  answers: Answers,
  registry: Registry,
  context?: ProjectContext,
): FullstackAppPlan[] {
  return FULLSTACK_APPS.map((app) => {
    // Full-stack is a monorepo preset: every app is planned exactly like a
    // monorepo app (`projectType: "monorepo"`) and rendered through the shared
    // `renderApplication()`. `render()` must not be called on these plans —
    // that would add a nested workspace root.
    const appAnswers: Answers = {
      targetDir: answers.targetDir,
      projectName: app.name,
      framework: app.framework,
      projectType: "monorepo",
      appName: app.name,
      features: [...presetFeatures(app, registry), ...app.features],
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
    const appPrefix = `apps/${app.name}`;
    for (const file of renderApplication(plan, registry, plan.context)) {
      files.push({ ...file, path: `${appPrefix}/${file.path}` });
    }
    adaptNestedApp(files, appPrefix);
  }

  // 共享类型包 + 三端示例接线 + 根/子项目 AGENTS.md。
  const vitePlus = highestVitePlusRange(files);
  applyFullstackScaffold(files, { workspaceName, vitePlus });
  patchHonoWorkspaceEnv(files, "apps/api");
  patchVueWorkspaceEnv(files, "apps/web", { rewrite: false });

  files.push(
    ...workspaceEnvFiles(),
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
      contents: renderFullstackPackageJson(workspaceName, vitePlus),
      source: "fullstack",
    },
    {
      path: "vite.config.ts",
      contents: renderMonorepoViteConfig(),
      source: "fullstack",
    },
    {
      path: ".gitignore",
      contents: WORKSPACE_GITIGNORE,
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
  const shared = sharedTypesPackageName(workspaceName);
  return `# ${workspaceName}

由 **create-code4x** 生成的标准全栈单仓库（Vite+ 生态）。

## 应用

- \`apps/api\` —— Hono 后端（hono-full：api-guard + zod + testing + swagger-openapi + logging + http-hardening）
- \`apps/web\` —— Vue 前端（router / pinia / vueuse / vueuse-router / testing + reka-ui / alova / unocss）
- \`apps/desktop\` —— Electron 桌面壳（electron-builder）
- \`packages/shared-types\` —— 共享领域类型（\`${shared}\`）

根 \`AGENTS.md\` 汇总 workspace 规则；每个子项目另有自己的 \`AGENTS.md\`（含技术栈 llms.txt 链接）。

## 样板代码

- API：\`GET /api/todos\` / \`POST /api/todos\`（内存存储，zod 校验，\`src/routes/todos.ts\`）
- Web：\`Home.vue\` 经 Alova 调用 \`/api/todos\`（开发期代理到 API）
- Desktop：\`app:todo\` IPC 通道 + 内嵌 Hono API（\`app://./api/*\`），打包后无需单独启动后端
- Shared：\`Todo\` / \`CreateTodoInput\` / \`ApiError\` / \`HealthStatus\`

## 快速开始

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## 环境变量

workspace 根生成 \`.env\`（已 gitignore）与 \`.env.example\`：

- API：\`API_PORT\`（默认 3030）、\`LOG_LEVEL\`
- Web：\`WEB_PORT\`（默认 8088）、\`API_DEV_PROXY\`（开发代理目标）、\`VITE_API_BASE_URL\`（生产 API 地址）

Vite 应用通过 \`envDir: '../../'\` 读取根 \`.env\`；API 的 \`vite.config.ts\` 用 \`loadEnv()\` 读取构建/开发端口，生产 \`pnpm start\` 用 \`node --env-file=../../.env\`。生产部署可保持 \`VITE_API_BASE_URL=/api\` 由同源反向代理转发，或设置绝对 API 地址。

## 常用脚本

根脚本经项目内 Vite+ 任务运行器执行（不需要全局安装 \`vp\`）：

- \`pnpm build\` → \`vp run -r build\`：按依赖顺序构建所有应用
- \`pnpm check\` → \`vp check\`：对整个 workspace 做格式化 + lint + 类型检查
- \`pnpm test\` → \`vp run -r test\`：递归执行各应用测试
- \`pnpm dev\` → \`vp run -r --parallel dev\`：并行启动三端 + 共享类型 watch
- \`pnpm dev:api\`（3030）/ \`pnpm dev:web\`（8088）/ \`pnpm dev:desktop\`（Electron 窗口）：单独启动某个应用
- \`pnpm preview\`：预览前端构建产物

包管理器固定 pnpm；\`packages/*\` 已加入 workspace 配置，可按需放置共享代码。
`;
}
