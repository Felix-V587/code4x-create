# 交互式流程

直接在终端运行（不带 `-y` / `--CI`）会进入交互模式。问题按固定顺序出现，已经通过参数、config 或预设确定的字段会跳过。

## 问题顺序

```text
N0 项目类型（Standard / Monorepo / Full-stack）
N1 目标文件夹（workspace 内：扫描 packages 后选择 + 项目名）
N2 框架（Hono / Vue / Electron）
N2b 应用名（仅 Monorepo；默认 api / web / desktop）
N4 可选能力（见下）
N5 包管理器（默认 = 探测结果；Monorepo 固定 pnpm）
N6 是否安装依赖（默认 No）
N7 git 行为（初始化 / 提交 / 切换分支，见下）
```

### 项目类型

| 选项 | 行为 |
|---|---|
| Standard project | 在目标目录直接生成单个应用（默认） |
| Monorepo project | 在目标目录生成 pnpm workspace 根，应用位于 `apps/<应用名>/` |
| Full-stack project | 直接生成 `apps/api`(Hono) + `apps/web`(Vue) + `apps/desktop`(Electron) 标准全栈单仓库 |

Monorepo 模式下包管理器固定为 `pnpm`，安装与 `git init` 都在 workspace 根执行。生成物的根 `pnpm-workspace.yaml` 会带上应用所需的 `allowBuilds`。

### 全栈快捷模式

选择 **Full-stack project**（或非交互 `--fullstack`）会跳过框架/能力提问，直接固定为：

- `apps/api`：Hono `hono-full`（api-guard + zod + testing + swagger-openapi + logging + http-hardening）
- `apps/web`：Vue（router / pinia / vueuse / vueuse-router / testing）+ reka-ui + alova + unocss，dev 端口 8088
- `apps/desktop`：Electron 桌面壳 + electron-builder，dev 端口 5173；内嵌 Hono API（`app://./api/*`），打包后无需单独启动后端
- 根 `.env` / `.env.example` 提供 `API_PORT`（3030）/ `WEB_PORT`（8088）/ `LOG_LEVEL` / `API_DEV_PROXY` / `VITE_API_BASE_URL`
- 根 `pnpm dev` 并行启动三端；包管理器固定 pnpm

全栈模式不接受 `--framework` / `--features` / `--preset` / `--app`（会报 `E-CONFLICT`）。

### 目标文件夹

- **普通目录**：直接输入项目目录（等价于原来的 N1）。
- **当前目录已在 workspace 内**：向上查找 `pnpm-workspace.yaml` 或 `package.json#workspaces`，扫描 `packages` 配置并给出父文件夹选项，例如：
  ```text
  ◆  Where should we create your project?
  │  ● apps/       — matches apps/*
  │  ○ packages/   — matches packages/*
  │  ○ Custom folder… — enter a path relative to the workspace root
  └
  ◆  Project name  (my-app)
  ```
  - 选择选项后生成到 `<文件夹>/<项目名>`（例如 `apps/my-api`）。
  - `Custom folder…` 会再询问一个相对 workspace 根的路径，也接受绝对路径。
  - 只有以 `*` / `**` 结尾的 glob（`apps/*`、`packages/**`、根级 `*`）会生成选项；精确路径与复杂 glob 走自定义输入。
  - 若 cwd 位于 workspace 子目录，选项仍相对 workspace 根识别，最终 `targetDir` 会换算成相对 cwd 的路径。

### Vue 的分步选择

选中 Vue 后，可选能力按三步（UI 相关拆成两个问题）依次提问：

```text
1. Vue ecosystem    多选：Pinia / Vue Router / VueUse / VueUse Router / Testing
2. Request strategy 单选：None / Alova / Pinia Colada / TanStack Query
3. UI framework     单选：Reka UI / Naive UI / Element Plus / shadcn-vue
   CSS engine       单选：None / Tailwind CSS / UnoCSS
```

- 默认勾选 VueUse；UI 默认 Reka UI，CSS 默认 Tailwind。
- 选择 shadcn-vue 时 CSS 引擎自动锁定 Tailwind（该问题会跳过）。
- Hono / Electron 以及没有分步配置的框架仍使用一次多选。

其他规则：

- `--framework vue` 只会跳过框架问题，能力问题仍然会提问；想一次全定请用 `-y` 或 `-p`。
- 能力多选只反映你实际勾选的内容；依赖闭包在解析阶段补齐，并在摘要中标注 `<hono/zod (required by swagger-openapi)>`。
- 交互语言为英文；参数与文档为中文。

## 目录冲突

目标目录非空（白名单 `.git` / `.DS_Store` / `.code4xrc.json` 之外有文件）时会先确认是否覆盖：

- 之前由 code4x 生成的目录（含 `.code4xrc.json`）：确认后按 `--overwrite` 语义清空重写。
- 任意其他目录：确认后按 `--force` 语义强制清空重写。

拒绝则退出 130；非交互模式缺少 `--overwrite` / `--force` 时直接报 `E-DIR-NOT-EMPTY`。

## 项目名归一化

目录名原样保留，`package.json#name` 会做归一化：小写、空格/下划线转 `-`、剥离非法字符与中文、压缩连续连字符；空结果回落 `my-app`。

例如目录 `My_API` → 目录仍是 `My_API`，包名是 `my-api`。发生归一化时会显示一行提示，但不会额外要求确认。

Monorepo 模式下应用名同样归一化后作为 `apps/<应用名>` 与应用的包名；workspace 根的包名由目标目录名归一化得到。

## 目标已在 git 仓库内

如果目标目录**已存在**且位于 git 仓库内，不再询问是否 `git init`，改为：

| 选项 | 行为 |
|---|---|
| Commit current project | 生成完成后 `git add` 当前项目并提交；可输入提交信息（默认 `chore: scaffold <project>`） |
| Create and switch to a new branch | 写入文件前切出新分支；可输入分支名（默认 `code4x/<project>`） |
| Do nothing | 保持当前分支与工作区不变 |

选择 Commit 或 New branch 后，若目标目录已有文件，会再询问：

- **Yes**：清空原项目全部文件（保留 `.git`），直接写入新项目，不再触发 overwrite 确认。
- **No**：按原有 overwrite 流程处理（生成目录用 `--overwrite`，任意目录用 `--force`；交互模式继续确认）。

如果目标目录**尚不存在**但位于已有 git 仓库内，跳过 `git init` 并提示：

```text
note: inside existing repo, skipping git init
```

## 取消与中断

| 阶段 | 行为 |
|---|---|
| 提问中 Ctrl-C | 打印 `Operation cancelled`，退出码 `130`，不产生任何文件 |
| 写盘阶段中断 | 使用 staging 目录；下一次运行会清扫同前缀残留；目标目录出现即代表完整项目 |
| 安装阶段 Ctrl-C | 保留已生成文件，提示重新执行包管理器安装 |
| git 阶段 Ctrl-C | 保留目录，可手动删除 `.git` |

## 非交互语义

以下任一条件成立即为非交互：非 TTY、`-y` / `--yes`、`--CI`、`CI` 环境变量为真、`--no-interactive`。

非交互模式下：

- 非法值**不会**回退提问，而是硬错（`E-INVALID-VALUE`，退出码 2）；
- 缺失字段取 [默认值](/guide/cli#yes-默认值)；
- `targetDir` 缺失直接报 `E-DIR-REQUIRED`，不会静默选择 `./my-app`；
- 用 `--monorepo` 进入单仓库模式，`--app <name>` 指定应用名。

`--interactive` 可强制进入交互模式，适合在 CI 容器里手动调试。
