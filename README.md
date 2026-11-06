# code4x-create

通用项目创建脚手架（对标 create-vite）：以**参数**或**交互式提问**创建多框架项目，并按框架可选集成常用能力——Hono（vp 原生：`vp dev` / `vp build` / `vp check`）：`zod` 校验 / `api-guard`（CORS + secure-headers）/ `swagger-openapi` 文档 / `env`（zod 校验配置）/ `testing`（Vitest 示例）/ `logging`（pino）/ `http-hardening`（timeout + body-limit + compress）；Vue（vp 原生 dev/build/check + `vue-tsc`）：`pinia` / `vue-router` / `vueuse` / `vueuse-router` / `i18n`（vue-i18n）/ 请求策略 `query`（TanStack Query）⟂ `colada`（Pinia Colada）⟂ `alova`（alova 3，类型化 client + `useRequest`）/ `testing`（Vitest + @vue/test-utils）/ CSS 引擎 `tailwind` ⟂ `unocss` / UI 套件 `naive-ui`（默认）⟂ `element-plus` ⟂ `shadcn-vue`（copy-paste 组件栈，vendored、需 tailwind）；Electron（vp 原生：`vp pack` 主/预加载 + `vp build` 渲染进程，Vue 3 渲染层）：类型化 IPC（`src/shared/ipc.ts` 共享 zod channel 表 + 三端派生类型 + 仅 `message` 的错误信封）+ 生产 `app://` 自定义协议加载（SPA 回退）；`electron/builder`（经 electron-builder 打包安装包）。

**实施状态**：M0–M4 已完成（Hono + Vue + Electron 三框架；参数式与交互式双模）；**M6 机制扩展 + M7 Hono 标准化 + M8a Vue 全家桶 + M8b shadcn-vue + M9 Electron 加固已完成**（`group` 互斥 / `package.json#fields` / `workspaceYaml.allowBuilds` / Tier-1 组合矩阵；Hono 基座升级 + env/testing/logging/http-hardening；Vue 基座升级（`@/` 别名、`src/style.css` 组装、`css-imports` 锚点）+ vueuse/i18n/query/colada/alova/testing + tailwind/unocss + naive-ui/element-plus + shadcn-vue（vendored 组件 + `app-script` 锚点）+ 预设 `vue-standard`/`vue-naive-tw`/`vue-element-tw`/`vue-unocss-min`/`vue-shadcn-tw`/`vue-full`；Electron 类型化 IPC（共享 zod 表）+ `protocol.handle` `app://` 加载 + `!app.isPackaged` 门闩 + `deps.alwaysBundle: ['zod']`）；vp 集成 harness 已落地实测（`fixtures/vp-harness/`）；CI 已接入 GitHub Actions；发布流程就绪（`repository` 已补，待 npm 凭据后实际发布）。设计与决策文档见 [docs/](./docs/README.md)。

## 快速开始（仓库内）

```bash
vp install && vp -C packages/cli pack
node packages/cli/dist/cli.mjs my-api -f hono --features zod,swagger-openapi -y
cd my-api && pnpm install && pnpm dev
```

生成后：`GET /healthz` / `GET /readyz`（健康检查）、`GET /docs`（Swagger UI）、`GET /openapi.json`（spec，含 `/auth/register` 校验示例路由）；未知路由返回 `{ code, message, requestId }` 错误信封。

常用组合：

```bash
node packages/cli/dist/cli.mjs my-api -f hono -y                  # 仅基座（requestId + health + 错误信封）
node packages/cli/dist/cli.mjs my-api -f hono --features zod -y   # + zod 校验
node packages/cli/dist/cli.mjs my-api -p hono-api -y              # 预设：api-guard + zod + swagger-openapi
node packages/cli/dist/cli.mjs my-api -p hono-standard -y         # 预设：api-guard + zod + testing
node packages/cli/dist/cli.mjs my-api -p hono-full -y             # 预设：standard + swagger-openapi + logging + http-hardening
node packages/cli/dist/cli.mjs my-vue -p vue-standard -y          # 预设：Vue + router + pinia + vueuse + i18n
node packages/cli/dist/cli.mjs my-vue -p vue-naive-tw -y          # 预设（默认推荐）：standard + naive-ui + tailwind
node packages/cli/dist/cli.mjs my-vue -p vue-element-tw -y        # 预设：standard + element-plus + tailwind
node packages/cli/dist/cli.mjs my-vue -p vue-unocss-min -y        # 预设：router + pinia + unocss
node packages/cli/dist/cli.mjs my-vue -p vue-shadcn-tw -y         # 预设：standard + tailwind + shadcn-vue（vendored 组件）
node packages/cli/dist/cli.mjs my-vue -p vue-full -y              # 预设：standard + query + testing
node packages/cli/dist/cli.mjs my-app -f electron -y             # Electron（Vue 渲染层 + vp pack 主/预加载）
node packages/cli/dist/cli.mjs my-app -f electron --features electron/builder -y   # + electron-builder 打包（dist / dist:dir）
```

发布后形态（尚未发布到 npm）：`pnpm dlx @code4x/cli my-api`（等价 `npx @code4x/cli@latest my-api`）。

### 在既有 workspace 内生成（嵌套场景）

把目标目录放在已有 pnpm workspace 内（如 `apps/web`）即可，无需额外参数：

```bash
cd my-workspace
node ../code4x-create/packages/cli/dist/cli.mjs apps/web -p vue-naive-tw -y
```

- 生成物**不写** `pnpm-workspace.yaml`（宿主负责），并在 stderr 提示宿主需补的 `allowBuilds`（**仅列缺失项**）与可选的 `catalog:` 复用建议（不污染 `--json` stdout）。
- 若宿主 `pnpm-workspace.yaml` 的 `catalog:` 已有同名依赖，生成的 `package.json` 该依赖版本自动写为 `"catalog:"`，否则保留显式 caret。
- `vue/tailwind` 在嵌套场景把内容扫描范围钉在应用包内（`@import 'tailwindcss' source('../')`），避免宿主/兄弟应用的文件混入生成的 CSS。
- 这些事实记录在生成物的 `.code4xrc.json`（`context.host` + `workspace`）中以便复现。

通过 Vite+ 统一入口（发布后）：在 `vite.config.ts` 的 `create.templates` 中以**全名** `@code4x/cli` 注册条目（全名 run as-is，不做 `create-` 简写展开），再用 `vp create <name> -- my-api -f hono --features zod -y` 调用（参数化；CI 同此写法——vp 不透传 `--no-interactive`，参数放 `--` 后）。旧的 `vp create code4x` 简写会展开成 `create-code4x`，**已不再映射本包**。本地未发布期的集成验证走 `create.templates` harness，见 [docs/05](./docs/05-vp-integration.md)。

## 参数与行为

完整参数、默认值、退出码与边界行为见 [docs/04-prompt-flow.md](./docs/04-prompt-flow.md)。要点：

- `-f/--framework`、`--features`（裸名唯一解析、`none` 清空）、`-p/--preset`、`--pm`
- `--install/--no-install`、`--git/--no-git`、`-y/--yes`、`--config`、`--json`、`--dry-run`
- `--overwrite`（护栏：仅允许覆盖含 `.code4xrc.json` 的目录）、`--template` 别名
- 生成物包含 `.code4xrc.json`：features 解析闭包 + 文件来源 + sha256（为将来「给已有项目加 feature」预留）

## 开发

要求 Node `>=22`（推荐 `26+`）、pnpm 12。

```bash
vp install                          # 安装依赖（workspace）
vp check                            # 格式化 + lint + 类型检查
vp test                             # 单测 + CLI e2e（vitest）
vp -C packages/cli pack   # 构建 CLI 与模板资产到 packages/cli/dist/
```

Vite+ 工具链说明见 [AGENTS.md](./AGENTS.md)。

### 用户手册（文档站）

用户手册使用 VitePress，位于 `website/`（独立的 pnpm 项目）：

```bash
pnpm -C website install
pnpm -C website dev      # 本地预览
pnpm -C website build    # 构建到 website/.vitepress/dist
```

根脚本 `pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:preview` 为等价入口。GitHub Actions 在 `main` 分支的 `website/**` 变更时自动部署到 GitHub Pages（`.github/workflows/docs.yml`；需先在仓库 Settings → Pages 选择 GitHub Actions）。

## 验证 / CI

三级验证（验收口径见 [docs/06](./docs/06-template-ecosystem-plan.md) §0）：

- **Tier-1（每 PR，离线、秒级）**：离线枚举全组合，`resolve`+`render` 不报错、同组多选报 `E-CONFLICT`、同 combo 二次渲染字节一致（互斥规则与矩阵同源生成）。落点 `packages/cli/tests/matrix.test.ts`，随 `vp test` 运行。
- **Tier-2（PR 子集 / nightly 全量）**：blessed 组合用**打包后的 CLI** 生成 → `pnpm install` → `pnpm run build` → `pnpm run check`。落点 `scripts/tier2-matrix.mjs`；组合清单 `scripts/tier2-combos.json` 与 registry 由 `packages/cli/tests/tier2-combos.test.ts` 防漂移。
- **Tier-3（nightly / 发布前）**：冒烟——hono 起服务 curl `/healthz` 200 + 优雅 `SIGTERM`；vue `build` + `vite preview` 200；electron `electron-builder --dir` 后启动解包应用（无 `DISPLAY` 时自动 `xvfb-run -a`）。落点 `scripts/tier3-smoke.sh`。

本地命令：

```bash
pnpm exec vp -C packages/cli pack   # 先构建发布包 CLI（Tier-2/3 依赖 dist）
pnpm run ci:tier2                              # Tier-2 子集（PR 口径）
pnpm run ci:tier2:all                          # Tier-2 全量（nightly 口径）
pnpm run ci:tier3                              # Tier-3 冒烟
```

CI：`.github/workflows/ci.yml`（`push`/`pull_request`：Tier-1 + Tier-2 子集）、`.github/workflows/nightly.yml`（`schedule`/`workflow_dispatch`：Tier-2 全量 + Tier-3 冒烟）。

## 发布

发布包为 `packages/cli`（包名 `@code4x/cli`，发布在 `code4x` npm scope 下；`publishConfig.access: public`）。版本与发布流程以 **changesets** 为单一入口：

```bash
pnpm changeset           # 记录一条变更（选包 + bump 级别 + 摘要）
pnpm changeset:version   # 汇总 changesets → 改版本号 / CHANGELOG（不提交）
pnpm changeset:publish   # 构建并发布到 npm（public）
```

- 包内 `prepublishOnly` 已配置 `vp run build`（`vp pack`），发布前自动重建 `dist/`；发布 tarball 含 `package.json` / `README.md` / `LICENSE` / `dist/**`（模板与 features 资产随 `dist/` 一起打包）。
- 使用形态：`pnpm dlx @code4x/cli <dir>`（等价 `npx @code4x/cli@latest <dir>`）；命令名（bin）仍为 `create-code4x`，故 tarball 安装后可直接 `create-code4x <dir>`。旧的 `pnpm create code4x` 形式展开为 `create-code4x`，**不再映射本包**。
- 远端已配置：`origin` = Gitee（`git@gitee.com:code4x/code4x-create.git`），`github` = GitHub（`git@github.com:Felix-V587/code4x-create.git`，GitHub Actions CI 在此运行）；包内 `repository` 指向 GitHub 仓库。changesets 的 `baseBranch` 已按 `main` 配置。
- 尚待 npm 凭据（当前 `~/.npmrc` 中 token 已失效，`npm whoami` 返回 401）后才能实际发布。
- 包内 `bumpp` 仍保留于 devDependencies，但**发布流程以 changesets 为准**（决策见 [docs/06](./docs/06-template-ecosystem-plan.md) 修订记录）。

## 仓库结构

```
packages/cli/   发布包（name = @code4x/cli；bin = create-code4x）
  src/domain/   纯函数层：types / errors / registry / resolve / render（锚点组装、确定性、幂等）
  src/io/       副作用薄层：staging 落盘、rc、PM 探测、git、install
  templates/    框架骨架与静态文件（hono/vue/electron）
  features/     可选能力（hono/zod、hono/api-guard、hono/swagger-openapi、hono/env、hono/testing、hono/logging、hono/http-hardening、vue/pinia、vue/router、vue/vueuse、vue/vueuse-router、vue/i18n、vue/query、vue/colada、vue/alova、vue/testing、vue/tailwind、vue/unocss、vue/naive-ui、vue/element-plus、vue/shadcn-vue、electron/builder）
  tests/        单测与 CLI e2e
docs/           设计文档：生态调研 / 架构决策 / wiring 规格 / prompt 流
fixtures/       vp 集成 harness（本地 `vp create code4x` 端到端验证）
website/        用户手册（VitePress，独立 pnpm 项目）
```

## 许可

MIT
