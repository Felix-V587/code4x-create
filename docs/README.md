# code4x-create 设计文档

通用项目创建脚手架（对标 create-vite）：交互式 / 参数式创建多框架项目，按框架可选集成常用能力（Hono：zod / swagger / env / testing / logging / http-hardening / 中间件；Vue：pinia / vue-router / vueuse / i18n / query / tailwind / unocss / naive-ui / element-plus / shadcn-vue 等；Electron：Vue 3 渲染层 + vp pack 主/预加载进程 + electron-builder 打包）。

## 文档索引

| 文档 | 内容 | 状态 |
|---|---|---|
| [01-ecosystem-research.md](./01-ecosystem-research.md) | 生态调研：create-vite / create-hono 内部实现、feature 组合模式对比、prompt 库与模板拉取现状、测试策略、2025–2026 动向、条件接线先例 | ✅ 已核实（2026-10-12） |
| [02-architecture.md](./02-architecture.md) | 架构与关键技术决策：五层架构、组合模型、决策表、测试策略、仓库布局、MVP 路线、OQ 定案 | ✅ 定稿候选 |
| [03-feature-wiring-spec.md](./03-feature-wiring-spec.md) | 核心机制规格：FeatureManifest 类型草案、组装点(wiring) 语义、错误码、目录结构、hono/vue 走查样例 | ✅ 定稿候选 |
| [04-prompt-flow.md](./04-prompt-flow.md) | 交互问题流 + 参数映射：状态机、逐问呈现、flag/preset/config 优先级、取消语义、边界清单、候选拍板 OQ-A~E | ✅ 定稿候选 |
| [05-vp-integration.md](./05-vp-integration.md) | vp create 集成笔记：机制核实（含源码行号）、正确调用方式、职责边界、子项目规则、验证路线 | ✅ 已核实 |
| [06-template-ecosystem-plan.md](./06-template-ecosystem-plan.md) | 模板系统路线图：机制扩展（互斥/贡献面/锚点）、Hono/Vue/Electron feature 矩阵与版本基线、单仓库模式、里程碑与 OQ | ✅ M6–M11 已落地（§4 Vue、§5 Electron 已 ✅） |

## 实施状态（2026-11-06）

| 里程碑 | 状态 | 说明 |
|---|---|---|
| M0 | ✅ 已完成 | core 类型 + hono base + 非交互生成可运行项目 |
| M1 | ✅ 已完成 | `hono/zod` + `hono/api-guard`（package.json merge + entry wiring） |
| M2 | ✅ 已完成 | `hono/swagger-openapi`（requires zod；`/openapi.json` + `/docs`） |
| M3 | ✅ 已完成 | vue + pinia/router（双 assembly 文件 + 勾选顺序无关） |
| M4 | ✅ 已完成 | 交互式流程（可注入 Prompter）+ 非 TTY 默认语义 + P0 嵌套 workspace 条件化 |
| M5 | ✅ 已完成 | electron 框架：Vue 3 渲染层 + `vp pack` 主/预加载（CJS，`neverBundle: ['electron']`）+ 零依赖 dev 编排脚本；生成→install→build→typecheck→`vp check` 开箱通过，prod 启动（窗口创建）与 dev 编排实测通过 |
| M5+ | ✅ 已完成 | `electron/builder`：electron-builder 打包（`electron-builder.yml` + `dist`/`dist:dir` 脚本；AppImage / dmg+zip / nsis，产物输出 `release/`，asar 默认开启） |
| M6 | ✅ 已完成 | 机制扩展：`group` 互斥（复用 `E-CONFLICT`）、`package.json#fields`、`workspaceYaml.allowBuilds`（map 形状、排序确定性）、MARKER 块注释、三框架 `vite-imports` 锚点、Tier-1 组合矩阵（`tests/matrix.test.ts`，registry 驱动、离线、幂等/互斥同源） |
| M7 | ✅ 已完成 | Hono 标准化：基座升级（`requestId` 最先、`error-handlers` 锚点 + `{code,message,requestId}` 信封、`routes/health.ts`、`shutdownTimeoutMs` 优雅停机、`@hono/node-server` ^2.1）+ 新 feature（`hono/env`、`hono/testing`、`hono/logging`、`hono/http-hardening`）+ 预设 `hono-standard` / `hono-full`；生成项目 install→build→start→curl 冒烟通过 |
| M8a | ✅ 已完成 | Vue 全家桶核心 + CSS 引擎 + UI 套件：基座升级（`@/` 别名、`src/style.css` 组装 + `css-imports` 锚点、`@types/node`）+ `vue/vueuse` / `vue/vueuse-router` / `vue/i18n` / `vue/query` ⟂ `vue/colada` / `vue/testing` + `vue/tailwind` ⟂ `vue/unocss` + `vue/naive-ui`（默认）⟂ `vue/element-plus` + 预设 `vue-standard` / `vue-naive-tw` / `vue-element-tw` / `vue-unocss-min` / 扩展 `vue-full`；三个 UI/引擎预设 install→build→check（含 vue-tsc）→preview 200 开箱通过，互斥 `E-CONFLICT` 实测 |
| M8b | ✅ 已完成 | Vue shadcn-vue：`vue/shadcn-vue`（`group: vue/ui`，requires `vue/tailwind`）——vendored copy-paste 基线（`components.json` + `cn()` + `ui/button`/`ui/card`/`ui/input` + theme 块经 `css-imports` order 10），无 `shadcn-vue` npm 依赖 / 无生成期 CLI；新锚点 `app-script`；预设 `vue-shadcn-tw`；生成物 install（退出 0）→build（vue-tsc）→check（无 `--fix`）→preview 200；`shadcn + unocss` 互斥 `E-CONFLICT`、`shadcn` 单独拉 `tailwind` 实测 |
| M9 | ✅ 已完成 | Electron 加固：`src/shared/ipc.ts` 类型化 IPC（三端共享 zod 表 + 派生类型 + 仅 `message` 的错误信封）+ preload 表驱动窄桥（不暴露 `ipcRenderer`）+ main 双向校验 + `protocol.handle('app', …)` 生产加载（SPA 回退 + traversal guard）+ `!app.isPackaged` 门闩 + `deps.alwaysBundle: ['zod']`（沙箱 preload 零外部 require、Electron 45 预适配）；生成物 install→build→check（无 `--fix`）→`dist:dir`→**打包态运行**窗口命中且无协议错误，dev 编排回归通过 |
| M10 | ✅ 已完成 | 单仓库场景 A：宿主 `ProjectContext`（catalog/allowBuilds）+ catalog-aware 版本改写 + stderr 仅提示缺失项 + Tailwind 扫描范围钉在应用包内；生成物 install→build→check 通过 |
| vp 集成 | ✅ harness 实测通过 | `fixtures/vp-harness/`（两 lane + 观察 lane + lane A build smoke）；hono 模板 vp 原生、vue 模板 vp check 开箱通过；发布后 dlx lane 待验证 |
| M11 | ✅ 已完成 | CI 收口：Tier-2 blessed 轮换（`scripts/tier2-matrix.mjs` + `scripts/tier2-combos.json`，subset/all + registry 防漂移 `tests/tier2-combos.test.ts`）与 Tier-3 冒烟（`scripts/tier3-smoke.sh`：hono `/healthz`+优雅停机、vue preview 200、electron 解包启动）纳入 GitHub Actions（`.github/workflows/ci.yml` / `nightly.yml`）；根脚本 `ci:tier2` / `ci:tier2:all` / `ci:tier3` |
| 0.1.0 发布 | 🟡 流程就绪 | 包级 `README.md` / `LICENSE`、changesets（`.changeset/config.json` + 根脚本 `changeset` / `changeset:version` / `changeset:publish`）就绪；发布演练（`npm pack` 清单核对 + 本地 tarball 安装/`pnpm dlx` 生成 + `npm publish --dry-run`）通过；远端与 `repository` 已就绪（Gitee `origin` + GitHub `github`，包内 `repository` 指向 GitHub）；**待 npm 凭据**（当前 `~/.npmrc` token 返回 401），尚未真正发布 |

## 环境约定

- 本仓库已用 **Vite+** 初始化为 pnpm monorepo（workspace 根 + `packages/cli/`）：根 `vite.config.ts` 只管 lint/fmt，`vp pack` 等面向包的命令用 `vp -C packages/cli …` 或在包目录内执行；详见根目录 AGENTS.md。
- 运行时：Node `>=22`（推荐 26+）；包管理器：pnpm 12；TypeScript ESM。
- 发布包名为 `@code4x/cli`（位于 `packages/cli/`，发布在 `code4x` npm scope 下）；包内 `repository` 已指向 GitHub 仓库（`git+https://github.com/Felix-V587/code4x-create.git`）。

## 文档维护约定

- 调研类结论标注来源（仓库路径 / npm 版本 / URL）；未核实项显式标注「未核实」。
- 设计决策变更时更新对应文档，并在 02 的「决策记录」中追加。
