# @code4x/cli

> 一句话：用参数或交互式提问创建 **Hono / Vue / Electron** 项目，并按框架可选集成常用能力（校验、文档、日志、UI 套件、CSS 引擎、类型化 IPC、打包等），开箱即用、确定性生成。

对标 `create-vite` 的多框架脚手架。默认集成 **Vite+（`vp`）** 工具链：生成的 Hono / Vue 项目用 `vp dev` / `vp build` / `vp check`，Electron 项目用 `vp pack` 打包主/预加载进程。

## 用法

要求 Node `>=22`（推荐 `26+`）。

```bash
# pnpm（推荐）
pnpm dlx @code4x/cli my-api -f hono --features zod -y

# npm / yarn / bun 等价形态
npx @code4x/cli@latest my-api -f hono --features zod -y
yarn dlx @code4x/cli my-api -f hono --features zod -y
bun x @code4x/cli my-api -f hono --features zod -y
```

> 命令名（bin）保持 `create-*` 惯例，仍为 `create-code4x`：tarball 安装后可直接 `create-code4x <dir>`；`pnpm dlx @code4x/cli` / `npx @code4x/cli` 只是运行该 bin 的等价入口。

也可经 Vite+ 统一入口。在 `vite.config.ts` 的 `create.templates` 中以**全名** `@code4x/cli` 注册条目（全名 run as-is，不做 `create-` 简写展开），随后 `vp create <name>` 即运行本包：

```ts
export default defineConfig({
  create: {
    templates: [{ name: "code4x", description: "...", template: "@code4x/cli" }],
  },
});
```

```bash
vp create code4x                                        # 交互式（框架 → features → …）
vp create code4x -- my-api -f hono --features zod -y    # 参数化（CI 同此写法）
```

> 旧的 `pnpm create code4x` / `vp create code4x` 简写会展开成 npm 包 `create-code4x`，**已不再映射本包**（本包名为 `@code4x/cli`，Vite+ 简写不会展开成它）。Vite+ 不透传 `--no-interactive`；CI 请把参数放在 `--` 之后。

不传位置参数且处于交互式终端时，会逐项提问（目录 → 框架 → features → 包管理器 → 是否安装 → 是否 `git init`）；在 CI / 非 TTY 下缺失字段取内置默认（`targetDir` 缺失则报 `E-DIR-REQUIRED`）。

## 框架与能力矩阵

### Hono（Node 后端 API）

| Feature id             | 说明                                                             |
| ---------------------- | ---------------------------------------------------------------- |
| `hono/zod`             | 基于 zod 的请求校验（统一错误信封）                              |
| `hono/api-guard`       | CORS + secure-headers 样板                                       |
| `hono/swagger-openapi` | `/openapi.json` 规范 + `/docs` Swagger UI（requires `hono/zod`） |
| `hono/env`             | 基于 zod 的环境变量配置校验（`src/env.ts`）                      |
| `hono/testing`         | Vitest 测试示例（`app.request()`）                               |
| `hono/logging`         | pino + hono-pino 结构化日志                                      |
| `hono/http-hardening`  | timeout + body-limit + compress 中间件                           |

基座自带：request-id 贯穿、`{ code, message, details?, requestId }` 错误信封、`/healthz` 与 `/readyz` 健康检查、优雅停机。

### Vue（SPA）

| Feature id                                             | 说明                                                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `vue/router`                                           | Vue Router（经典 `createRouter`）                                                                                               |
| `vue/pinia`                                            | Pinia 状态管理                                                                                                                  |
| `vue/vueuse`                                           | `@vueuse/core`                                                                                                                  |
| `vue/vueuse-router`                                    | `@vueuse/router`（requires `vue/router` + `vue/vueuse`）                                                                        |
| `vue/i18n`                                             | vue-i18n（`legacy:false`）+ unplugin 自动导入                                                                                   |
| `vue/query` ⟂ `vue/colada` ⟂ `vue/alova`               | 请求策略三选一：TanStack Query ⟂ Pinia Colada ⟂ Alova 3（`group: vue/data`；Colada / Alova 附带基础 client 与 `useTodos` 示例） |
| `vue/testing`                                          | Vitest + `@vue/test-utils` + happy-dom 示例                                                                                     |
| `vue/tailwind` ⟂ `vue/unocss`                          | CSS 引擎二选一（`group: vue/css`）                                                                                              |
| `vue/naive-ui` ⟂ `vue/element-plus` ⟂ `vue/shadcn-vue` | UI 套件三选一（`group: vue/ui`；`vue/shadcn-vue` requires `vue/tailwind`，为 vendored copy-paste 组件栈）                       |

基座自带：`@/` 路径别名、`src/style.css` 组装（`css-imports` 锚点）、Vite+ 官方 `vue-ts` 基线（`@vue/tsconfig` project references + `vue-tsc -b` + `lazyPlugins`；`vite` 通过 npm alias 对齐 `@voidzero-dev/vite-plus-core`）。

### Electron（桌面应用，Vue 3 渲染层）

| Feature id         | 说明                                                        |
| ------------------ | ----------------------------------------------------------- |
| `electron/builder` | 经 electron-builder 打包安装包（AppImage / dmg+zip / nsis） |

基座自带：类型化 IPC（`src/shared/ipc.ts` 共享 zod channel 表 + 三端派生类型 + 仅 `message` 的错误信封）、生产 `app://` 自定义协议加载（含 SPA 回退）、`!app.isPackaged` 门闩。

### 预设

`-p/--preset` 一次选中一组 blessed 组合：

| 预设 id          | 框架 | 组合                                                  |
| ---------------- | ---- | ----------------------------------------------------- |
| `hono-api`       | hono | api-guard + zod + swagger-openapi                     |
| `hono-standard`  | hono | api-guard + zod + testing                             |
| `hono-full`      | hono | standard + swagger-openapi + logging + http-hardening |
| `vue-standard`   | vue  | router + pinia + vueuse + i18n                        |
| `vue-naive-tw`   | vue  | standard + naive-ui + tailwind（默认推荐）            |
| `vue-element-tw` | vue  | standard + element-plus + tailwind                    |
| `vue-shadcn-tw`  | vue  | standard + tailwind + shadcn-vue（vendored 组件）     |
| `vue-unocss-min` | vue  | router + pinia + unocss                               |
| `vue-full`       | vue  | standard + query + testing                            |

## 常用参数

| 参数                                    | 说明                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| `<dir>`                                 | 目标目录（位置参数；缺失且非交互 → `E-DIR-REQUIRED`）                                 |
| `-f, --framework <hono\|vue\|electron>` | 选择框架（不传且 features 同属一个框架时可推断）                                      |
| `--features <a,b>`                      | 逗号分隔的 feature 列表；支持裸名（`zod` → `hono/zod`）与全限定名；`none` 清空        |
| `-p, --preset <id>`                     | 选择预设（见上表）                                                                    |
| `-y, --yes`                             | 全默认（非交互）；与 `--CI` 同义                                                      |
| `--dry-run`                             | 只解析与渲染，不写盘；打印将写入的文件数                                              |
| `--json`                                | 向 stdout 输出机器可读计划（仅非交互路径；含 answers / files / features / nextSteps） |

其他：`--pm <npm\|pnpm\|yarn\|bun>`、`--install/--no-install`、`--git/--no-git`、`--config <file>`、`--overwrite`（护栏：仅允许覆盖含 `.code4xrc.json` 的目录）、`--template <name>`（别名：框架名或预设 id）、`--interactive/--no-interactive`。

退出码：`0` 成功 · `1` 域/生成错误（`E-*`） · `2` 用法错误 · `130` 取消。

## 生成物

生成项目包含 `.code4xrc.json`（元数据，与 `--json` 同源）：记录解析后的 feature 闭包、每个文件的来源与 sha256、生成器版本与预设，以及上下文（如嵌套 workspace、包管理器探测来源）。该文件为将来「给已有项目追加 feature」预留定位钩子。

若目标目录位于既有 pnpm workspace 内，生成物**不写** `pnpm-workspace.yaml`（由宿主负责），并在 stderr 提示宿主需补的 `allowBuilds`（仅缺失项）与可选的 `catalog:` 复用建议。

## 文档

完整参数、默认值、退出码与边界行为见仓库内 [`docs/04-prompt-flow.md`](../../docs/04-prompt-flow.md)；架构、feature 接线规格与生态路线图见 [`docs/`](../../docs/README.md)。本 README 面向 npm 包页面；仓库根 `README.md` 含开发与 CI 说明。

## 许可

MIT
