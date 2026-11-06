# 快速开始

## 前置要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | `^20.19.0` 或 `>=22.12.0` | 与生成物、CLI 的 `engines` 一致 |
| pnpm | 12 | 推荐包管理器；也能探测 npm / yarn / bun |
| Vite+ | 随项目安装 | 生成物脚本使用 `vp`；仓库开发也需要 `vp` |

> 在仓库内使用 npm 命令可能被根 `devEngines.packageManager` 拦截，请统一用 `pnpm` / `vp`。

## 方式一：从仓库构建（当前可用）

```bash
git clone git@github.com:Felix-V587/code4x-create.git
cd code4x-create
vp install
vp -C packages/cli pack

node packages/cli/dist/cli.mjs my-api -f hono --features zod -y
cd my-api
pnpm install
pnpm dev
```

`vp -C packages/cli pack` 会把 CLI 与模板/feature 资产一起构建到 `packages/cli/dist/`。

## 方式二：发布后使用（尚未发布）

包发布后等价入口是：

```bash
pnpm dlx @code4x/cli my-api -f hono -y
# 或
npx @code4x/cli@latest my-api -f hono -y
```

命令名（bin）仍为 `create-code4x`，因此 tarball 安装后也可以直接 `create-code4x my-api`。

> `pnpm create code4x` / `vp create code4x` 会展开成 `create-code4x`，**不会**映射到本包。经 Vite+ 集成时，请在 `create.templates` 中以全名 `@code4x/cli` 注册。

## 第一条命令

```bash
node packages/cli/dist/cli.mjs my-api -f hono --features zod -y
```

你会先看到展开后的计划：

```text
Scaffold plan:
  targetDir:  my-api
  package:    my-api
  framework:  hono
  features:   hono/zod
  preset:     (none)
  packageMgr: pnpm
  install:    no
  git:        yes
```

生成完成后：

```text
✔ Scaffolded hono + hono/zod in my-api  (metadata: .code4xrc.json)

Next steps:
  $ cd my-api
  $ pnpm install — skipped (--no-install)
  $ pnpm dev
```

`-y` 模式默认 **不安装依赖**、**初始化 git**。想一步到位加 `--install`，或显式 `--no-install --no-git` 做一次性预览。

## 常用第一条命令

```bash
# Hono：只生成基座
node packages/cli/dist/cli.mjs my-api -f hono -y

# Hono：标准后端（api-guard + zod + testing）
node packages/cli/dist/cli.mjs my-api -p hono-standard -y

# Vue：默认推荐（router + pinia + vueuse + i18n + naive-ui + tailwind）
node packages/cli/dist/cli.mjs my-web -p vue-naive-tw -y

# Electron：Vue 3 渲染层 + 类型化 IPC
node packages/cli/dist/cli.mjs my-app -f electron -y

# Electron：再加 electron-builder 打包
node packages/cli/dist/cli.mjs my-app -f electron --features electron/builder -y
```

生成后可运行：

| 框架 | 开发 | 构建 | 检查 |
|---|---|---|---|
| Hono | `pnpm dev`（默认 3000，可用 `PORT` 覆盖） | `pnpm build` | `pnpm check` |
| Vue | `pnpm dev` | `pnpm build` | `pnpm check` |
| Electron | `pnpm dev` | `pnpm build` | `pnpm check` |

## 下一步

- 想了解每个参数：[CLI 与参数](/guide/cli)
- 想按框架深入：[Hono](/guide/frameworks/hono) / [Vue](/guide/frameworks/vue) / [Electron](/guide/frameworks/electron)
- 想知道生成了什么：[生成后的项目](/guide/generated-project)
