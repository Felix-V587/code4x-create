# 交互式流程

直接在终端运行（不带 `-y` / `--CI`）会进入交互模式。问题按固定顺序出现，已经通过参数、config 或预设确定的字段会跳过。

## 问题顺序

```text
N0 项目类型（Standard project / Monorepo project）
N1 目标文件夹（workspace 内：扫描 packages 后选择 + 项目名）
N2 框架（Hono / Vue / Electron）
N2b 应用名（仅 Monorepo；默认 api / web / desktop）
N4 可选能力（见下）
N5 包管理器（默认 = 探测结果；Monorepo 固定 pnpm）
N6 是否安装依赖（默认 No）
N7 是否初始化 git（默认 Yes）
```

### 项目类型

| 选项 | 行为 |
|---|---|
| Standard project | 在目标目录直接生成单个应用（默认） |
| Monorepo project | 在目标目录生成 pnpm workspace 根，应用位于 `apps/<应用名>/` |

Monorepo 模式下包管理器固定为 `pnpm`，安装与 `git init` 都在 workspace 根执行。生成物的根 `pnpm-workspace.yaml` 会带上应用所需的 `allowBuilds`。

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
1. Vue ecosystem    多选：Pinia / Vue Router / VueUse / VueUse Router / i18n / Testing
2. Request strategy 单选：None / Alova / Pinia Colada / TanStack Query
3. UI framework     单选：None / Naive UI / Element Plus / shadcn-vue
   CSS engine       单选：None / Tailwind CSS / UnoCSS
```

- 默认勾选 VueUse、i18n；UI 默认 Naive UI，CSS 默认 Tailwind。
- 选择 shadcn-vue 时 CSS 引擎自动锁定 Tailwind（该问题会跳过）。
- Hono / Electron 以及没有分步配置的框架仍使用一次多选。

其他规则：

- `--framework vue` 只会跳过框架问题，能力问题仍然会提问；想一次全定请用 `-y` 或 `-p`。
- 能力多选只反映你实际勾选的内容；依赖闭包在解析阶段补齐，并在摘要中标注 `<hono/zod (required by swagger-openapi)>`。
- 交互语言为英文；参数与文档为中文。

## 目录冲突

目标目录非空（白名单 `.git` / `.DS_Store` / `.code4xrc.json` 之外有文件）时，会提供三选：

| 选项 | 行为 |
|---|---|
| Cancel | 中止，退出码 130 |
| Overwrite (clean) | 清空后重写 |
| Merge (skip-collisions) | 保留已有文件，只写入不冲突的文件 |

非交互模式没有 `--overwrite` 时直接报 `E-DIR-NOT-EMPTY`。

## 项目名归一化

目录名原样保留，`package.json#name` 会做归一化：小写、空格/下划线转 `-`、剥离非法字符与中文、压缩连续连字符；空结果回落 `my-app`。

例如目录 `My_API` → 目录仍是 `My_API`，包名是 `my-api`。发生归一化时会显示一行提示，但不会额外要求确认。

Monorepo 模式下应用名同样归一化后作为 `apps/<应用名>` 与应用的包名；workspace 根的包名由目标目录名归一化得到。

## 嵌套 git 仓库

如果目标目录位于一个已有 git 仓库内，会跳过 `git init` 并提示：

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
