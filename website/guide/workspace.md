# 在 workspace 中使用

code4x 支持两种单仓库（workspace）场景：

| 场景 | 用法 |
|---|---|
| 在**已有 pnpm workspace** 内追加应用 | 目标目录放在 workspace 内，例如 `apps/web` |
| 一次生成**新的单仓库项目** | 交互式选择 Monorepo，或非交互式加 `--monorepo` |

## 场景 A：在既有 workspace 内生成

例如把前端放到 `apps/web`、后端放到 `apps/api`：

```bash
cd my-workspace
node ../code4x-create/packages/cli/dist/cli.mjs apps/web -p vue-naive-tw -y
```

交互式运行时不需要手写路径：生成器会向上查找 workspace 根，扫描 `pnpm-workspace.yaml#packages`（或 `package.json#workspaces`），给出 `apps/`、`packages/` 等父文件夹选项，并提供 `Custom folder…` 自定义输入，随后再问项目名。

```text
◆  Where should we create your project?
│  ● apps/       — matches apps/*
│  ○ packages/   — matches packages/*
│  ○ Custom folder…
└
◆  Project name  (my-app)
```

选中 `apps/` + 项目名 `web` 等价于生成到 `apps/web`。若当前 cwd 位于 workspace 子目录，选项仍按 workspace 根识别，最终路径会换算成相对 cwd。

生成器会向上查找 `pnpm-workspace.yaml`，并自动处理以下事项。

### 不写宿主配置

嵌套场景下**不会**生成 `pnpm-workspace.yaml`；workspace 的成员与构建策略由宿主负责。

### catalog 版本复用

如果宿主 `pnpm-workspace.yaml` 的 `catalog:` 中已有同名依赖，生成的 `package.json` 会把该依赖写成 `"catalog:"`；否则保留显式 caret。

```yaml
# 宿主 pnpm-workspace.yaml
catalog:
  vue: ^3.5.0
  vite: ^8.0.0
```

生成结果中 `vue` / `vite` 变为 `"catalog:"`，其余依赖保持原版本。

### allowBuilds 提示

生成器会计算所需构建脚本白名单，并**只列出宿主缺少的项**（stderr）：

```text
note: nested workspace detected; add to the host pnpm-workspace.yaml:
  allowBuilds:
    vue-demi: true
```

如果宿主已经满足，则不会重复提示。另有可选的 catalog 复用建议：

```text
note: optional — add to the host catalog for version reuse:
  zod: ^4.6.6
```

所有提示都走 stderr，不污染 `--json` 的 stdout。

### Tailwind 扫描范围

选择 `vue/tailwind` 且处于嵌套场景时，生成的 CSS 使用：

```css
@import "tailwindcss" source('../');
```

`../` 是应用包根（CSS 位于 `src/`），用于把 Tailwind v4 的自动内容检测钉在应用目录内，避免扫描到宿主或兄弟应用的文件。standalone 生成时仍是 `@import "tailwindcss";`。

`vue/unocss` 无需特殊处理：它的扫描根就是 Vite 的 `root`（应用目录）。

### 记录到 `.code4xrc.json`

嵌套场景会在 rc 文件中多出：

```json
{
  "context": {
    "nestedWorkspace": true,
    "pmFrom": "env",
    "host": { "catalog": { "vue": "^3.5.0" }, "allowBuilds": ["esbuild"] }
  },
  "workspace": {
    "requiredAllowBuilds": ["esbuild", "vue-demi"],
    "missingAllowBuilds": ["vue-demi"],
    "catalogRewrites": ["vue"]
  }
}
```

- `requiredAllowBuilds`：本次生成需要的全部构建白名单；
- `missingAllowBuilds`：宿主尚缺的项（即 stderr 提示依据）；
- `catalogRewrites`：被改写为 `catalog:` 的依赖名；
- `host`：注入的宿主数据，用于复现。

## 场景 B：生成新的单仓库项目

交互式在第一个问题选择 **Monorepo project**；非交互式使用 `--monorepo`：

```bash
node packages/cli/dist/cli.mjs my-workspace \
  --monorepo --app web -f vue -p vue-naive-tw -y
```

生成结构：

```text
my-workspace/
├── package.json            # private workspace 根，脚本经 Vite+ 任务运行器执行
├── pnpm-workspace.yaml     # packages: apps/*, packages/* + allowBuilds
├── vite.config.ts          # defaultPackage + run.cache + 共享 lint/fmt
├── .gitignore
├── README.md
├── .code4xrc.json          # 工作区级生成元数据
└── apps/
    └── web/                # 完整应用（与 standalone 相同的文件树）
        ├── package.json
        ├── src/
        └── ...
```

要点：

- 应用名来自 `--app`（缺省按框架取 `api` / `web` / `desktop`），写入 `apps/<应用名>`；应用包名同名。
- 根 `package.json` 增加 `vite-plus` devDependency（复用应用声明的版本），脚本通过项目内 Vite+ 任务运行器执行，**不要求全局安装 `vp`**：
  - `pnpm build` → `vp run -r build`（递归构建，按 workspace 依赖排序）
  - `pnpm check` → `vp check`（对整仓做格式化 + lint + 类型检查）
  - `pnpm dev` → `vp run -r dev`；`preview` / `start` / `dist` 等应用专属脚本 → `vp run --filter ./apps/<app> <script>`
- 根 `vite.config.ts` 用 `defaultPackage` 把裸 `vp dev` / `vp build` / `vp preview` / `vp pack` 固定到 `apps/<app>`（等价于隐式 `vp -C apps/<app>`），并开启 `run.cache.scripts`，让 `vp run -r test` 等可缓存脚本命中 Vite Task 缓存；`lint` / `fmt` 与生成应用保持一致，`vp check` 可直接在根执行。
- 若目标目录名恰好与应用名相同（例如目录 `web` + 默认应用 `web`），根包名自动追加 `-workspace`（`web-workspace`），避免 workspace 包名歧义。
- 根 `pnpm-workspace.yaml` 直接写入应用所需的 `allowBuilds`，因此**不会**再输出“请宿主补充 allowBuilds”的提示；应用级 `pnpm` 构建策略会被移除，统一由根配置接管。
- 应用的 `README.md` 会自动加上 workspace 说明（根命令 / `pnpm --filter`），并移除 standalone 才有的 app 级 `.code4xrc.json` 章节。
- 包管理器固定为 pnpm；`--pm npm` 等会报 `E-INVALID-VALUE`。
- 依赖安装与 `git init` 都在 workspace 根执行。
- 应用仍按“嵌套 workspace”渲染：不会生成 `apps/web/pnpm-workspace.yaml`，Tailwind 使用 `source('../')`。
- `.code4xrc.json` 位于 workspace 根，`answers` 记录 `projectType: "monorepo"` / `appName` / `workspaceName`，`plan.sources` 中的路径带 `apps/web/` 前缀。

## 场景 C：全栈快捷单仓库

交互式选择 **Full-stack project**（或 `--fullstack`）会一次生成标准全栈单仓库：

```bash
node packages/cli/dist/cli.mjs my-stack --fullstack -y
```

```text
my-stack/
├── package.json            # dev/build/typecheck/check/test + dev:api/dev:web/dev:desktop
├── pnpm-workspace.yaml     # apps/* + packages/* + allowBuilds + peerDependencyRules
├── vite.config.ts          # run.cache + 共享 lint/fmt（三应用共用）
├── AGENTS.md               # workspace 级 AI 协作规则 + llms.txt 索引
├── .gitignore
├── README.md
├── .code4xrc.json          # stack.apps 记录三端
├── apps/
│   ├── api/                # Hono hono-full（校验/文档/日志/hardening，dev 3000）+ AGENTS.md
│   ├── web/                # Vue 全家桶 + reka-ui + alova + unocss（dev 5175）+ AGENTS.md
│   └── desktop/            # Electron + electron-builder（渲染器 dev 5173）+ AGENTS.md
└── packages/
    └── shared-types/       # 共享领域类型（Todo / ApiError 等）+ AGENTS.md
```

- 根脚本经 Vite+ 任务运行器执行：`pnpm build` → `vp run -r build`，`pnpm test` → `vp run -r test`，`pnpm check` → `vp check`（整仓一次），`pnpm dev` → `vp run -r --parallel dev`。
- `pnpm dev` 并行启动三端 + 共享类型 watch；Web 使用 5175，避免与 Electron 渲染器 5173 冲突。
- 自带一条可运行的纵向样板链路：`apps/api` 的 `GET/POST /todos` → `apps/web` 的 `Home.vue` 经 Alova 调用（开发期 `/api` 代理到 3000）→ `apps/desktop` 的 `app:todo` IPC 通道；类型统一来自 `packages/shared-types`。
- 根与每个子项目都生成 `AGENTS.md`，按技术栈列出官方 `llms.txt` 链接（Electron / electron-builder / TypeScript 等暂无 llms.txt 的给出官方文档入口）。
- 固定 pnpm；不接受 `--framework` / `--features` / `--preset` / `--app`。
- 三个应用都按嵌套 workspace 渲染；`packages/*` 可继续放共享代码。

## 已知边界

- 宿主 `pnpm-workspace.yaml` 损坏时会降级为空宿主，不阻断生成。
- 场景 B 当前生成**一个应用 + workspace 根**；`packages/*` 目录留给后续按需创建。
- 目标目录位于已有 git 仓库内时会跳过 `git init`。
