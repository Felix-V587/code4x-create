# 06 · vp 生态模板系统：最佳实践路线与实施方案

> 状态：M6/M7/M8a 已落地（2026-10-15）；M8b 起待做。版本核实日期 2026-10-14。
> 上游依据：[02 架构与决策](./02-architecture.md)、[03 wiring 规格](./03-feature-wiring-spec.md)；本轮 Hono / Vue / Electron 三份外部调研 memo（结论内联在本文，关键来源附链接）。

## 0. 目标与验收口径

**目标**：在 Vite+（vp）生态下构建「开箱可用」的多框架模板系统——单项目与单仓库（工作区）两种场景一次拉齐，把重复配置（lint/fmt/test/ts/构建/打包/中间件装配/UI 集成）在**生成期**收敛掉。

**验收口径**（每个 preset / blessed 组合必须满足，纳入三级验证）：

| # | 口径 | 手段（落点） |
|---|---|---|
| 1 | 离线组合正确性：全组合 `resolve`+`render` 不报错；同组多选报错；同 combo 二次渲染字节级一致 | Tier-1：`scripts/tier1-matrix.ts`（枚举 registry 组合，不装依赖；互斥规则与矩阵同源生成） |
| 2 | 安装零摩擦：`pnpm install` 零退出码、无 `ERR_PNPM_IGNORED_BUILDS`、无 peer 硬冲突 | Tier-2：blessed preset 轮换 `pnpm install` + `vp check` + `typecheck`（生成的 `.vue` 必须走 `vue-tsc`） |
| 3 | 构建可跑：`pnpm build` 绿且产物可启动 | Tier-3 冒烟脚本：hono 起服务 curl `/healthz`；vue `build`+`preview` 命中 200；electron 启动 + AppImage |
| 4 | 一致性与确定性：导入顺序、错误码、preset 闭包在文档与实现间不漂移 | Tier-1 golden 快照 + `--dry-run/--json` 断言 |
| 5 | 版本冻结：模板内锁定依赖主版本，生成期不解析网络 | 模板显式 caret / catalog 双轨（§6.1），实施时按附录基线复核 |
| 6 | 互斥可执行：UI 套件、CSS 引擎、数据层等「一组选一个」由机器保证 | 新 `group` 机制（M1）；单测覆盖「同组多选 → E-CONFLICT」 |

> 注：验收 #1 是纯函数层（不装依赖）；「生成的 `vp check` 绿」属 #2（需要 node_modules）。当前仓库尚无 Tier-1 矩阵脚本（M4+ 待做），本方案的 M6 必须先交付它，否则 #1/#2/#3 无法验收。

**砍量判据（kill criteria）**：若 M6 的渲染器改动（MARKER 语法扩展、vite.config `imports` 锚点、排序约定、`group` 机制）超出人力预算，则砍 M8 为「element-plus + tailwind 单线」，naive-ui / unocss / i18n / query 全部后移；§6.2 场景 B 与 P3 长尾无条件延后。

**非目标**（本阶段不做）：远端模板拉取、第三方插件 API、add-to-existing 写入既有项目（rc 文件已预埋）。

## 1. 现状基线（2026-10-14）

- **框架**：hono / vue / electron 三模板；features：`hono/zod`、`hono/api-guard`、`hono/swagger-openapi`、`vue/pinia`、`vue/router`、`electron/builder`（6 个）。
- **机制**：声明式 `FeatureManifest`（`requires` / `defaults` / `base` + `targets`）+ 组装锚点（`imports` / `list` / `single`）+ `package.json` 结构合并（仅 `dependencies` / `devDependencies` / `scripts`）+ presets + `.code4xrc.json`（闭包/来源/sha256）+ 嵌套 workspace 条件化 + Tier-1/2/3 验证。
- **关键短板**（三份调研共同指向，全部在第 2 节展开）：无互斥（conflicts）表达、`package.json` patch 字段面过窄、hono 的 `vite.config.ts` 是静态文件（无法贡献插件/构建选项）、vue 缺 `vite-plugins-pre` 与样式装配锚点、electron 缺 shared IPC 类型层与自定义协议加载。

## 2. 机制层扩展（P0 —— 先于功能扩张）

原则：**先修机制，再堆功能**；每个扩展都保持「纯函数可测 + 组合可枚举」。

### M1 · 分组互斥（`group`）

- **问题**：UI 套件（element-plus / naive-ui / ant-design-vue）、CSS 引擎（tailwind / unocss）、数据层（TanStack Query / Pinia Colada）必须「一组选一」，`requires` 无法表达。
- **设计（v1 收敛版）**：
  - `FeatureManifest` 仅新增 `group?: string`（如 `vue/ui`、`vue/css`）；解析期同组多选 → 复用既有 **`E-CONFLICT`**（usage 退出码 2，`fix:` 提示候选）。**v1 不做** `conflicts?: FeatureId[]`（逐对冲突目前无真实实例，出现再加）。
  - 交互层：同组 features 渲染为单选语义；`--features a,b` 同组多选报错；`--json`/`--dry-run` 输出冲突诊断。
  - **「替换基座块」不需要新机制**：`render` 已对 blueprint static 的 wiring 求值 `when`（`render.ts:62-79,271-282`，条件看到解析后闭包）——`hono/logging` 只需给基座 `logger()` 的两个块加 `when: (a) => !a.features.includes("hono/logging")`。对称差异需记录：**静态文件不可被 feature 替换**（多贡献写同一路径 = `E-FILE-WRITE`，`render.ts:526`），要「替换 style.css」只能走 assembly 升级（M3）。
- **影响面**：`domain/types.ts`、`resolve.ts`、`flow.ts`、Tier-1 矩阵。
- **明确延后**：`--approve-builds` 交互提示（先用 stderr 提示 + rc 记录）；`single` 槽仅作「同文件同区域」补充防线，不作主机制。

### M2 · 贡献面扩展：`package.json` 通用字段 + workspace 策略

- **问题 A**：patch 仅支持 deps/devDeps/scripts。真实需求：`description`（electron-builder 必需）、`engines`、顶层自定义键；本轮 electron/builder 已因此被迫改基座模板。
- **设计 A**：`PackageJsonPatch` 增加 `fields?: Record<string, unknown>`（浅合并；同名键不同值 = 硬错误，沿用既有 E-* 分类）；`scripts` 保持 `set/prepend/append`。
- **问题 B**：无法贡献 `pnpm-workspace.yaml` 的 `allowBuilds`（本轮 electron-winstaller 暴露该缺口，只能写进基座模板）。
- **设计 B**：新增 `workspaceYaml?: { allowBuilds?: Record<string, true> }`，**形状与模板现状一致（map 形式 `esbuild: true`）**，输出按 key 排序保证确定性：
  - 单项目：合并进生成物的 `pnpm-workspace.yaml`；
  - 嵌套 workspace：不写文件，生成后 stderr 提示 + `.code4xrc.json` 记录建议条目。
- **单一事实源**：`allowBuilds`（pnpm ≥11 读取）为准；`package.json#pnpm.onlyBuiltDependencies` 只作旧版 pnpm 兼容层，模板注释标注「pnpm 12 起忽略」，避免两处策略漂移（是否彻底移除见 OQ-15）。
- **影响面**：`types.ts` / `render.ts`（虚拟文件合并层）/ `rc.ts` / 文档 03。

### M3 · 渲染器与骨架机制（与框架解耦，全部落在 M6）

| # | 缺口（含代码依据） | 设计 |
|---|---|---|
| 3a | **MARKER 语法只认 `//` 与 `<!--`**（`render.ts:44`）→ CSS 骨架无法放任何标记 | 扩展为支持块注释 `/* @code4x:begin x */`（整行匹配），补 parseSkeleton 单测；这是「style.css 升 assembly」的前置 |
| 3b | **vite.config 骨架只有 `vite-plugins` 数组区，feature 无处安放顶层 `import`**（`tailwindcss()` / `unocss()` / `VueI18nPlugin` / `vue-router/vite`） | 三个 vite.config 骨架统一增加 `vite-imports` 锚点（`kind: "imports"`）：插件 import 走 `vite-imports`、注册走 `vite-plugins`。**命名约束**：锚点命名空间在整个 blueprint 内全局（`collectHits` 按名字跨 assembly 收集，同名会互串）——因此不能叫 `imports`（与入口文件的 `imports` 冲突），M6 实现已按 `vite-imports` 落实 |
| 3c | 缺少**全局排序约定**：blueprint static 在等 `order` 下先渲染（rank −1，`render.ts:283-288`），现有 feature 手挑魔数（swagger 用 50/51） | 约定 + 数值预留表：`-10` pre-*（须先于基线的插件/中间件）· `0` 基座 · `10-19` 安全 · `20-39` 限流/硬化 · `40-49` 错误处理 · `50+` 业务；`vite-plugins-pre` 锚点（骨架中声明在 `plugins:` 数组最前）承载「必须先于 vue()」的插件 |
| 3d | 各框架骨架改造（hono vite.config 升 assembly + `error-handlers` 锚点；vue style.css 升 assembly + `css-imports`；electron `src/shared/ipc.ts` + `protocol.handle`） | **归属各框架里程碑（M7/M8/M9）**；M6 只保证 3a–3c 的能力就绪 |

**明确砍掉**：`app-root` 整树包裹锚点 —— naive-ui provider 包裹用「`app-template` + `when` 条件桥接 feature」表达即可（docs/02 §2 既有规则），v1 不做新包裹机制。

### M4 · 单仓库（工作区）模式

- **场景 A（嵌套生成）**：在已有 pnpm workspace 内生成应用（现有 `nestedWorkspace` 语义增强）——
  - **数据通路**：`ProjectContext` 扩展宿主信息（如 `hostCatalog: Record<string,string>`、`hostAllowBuilds: string[]`），由 CLI 的 I/O 层读取宿主 `pnpm-workspace.yaml` 注入（保持 resolve/render 纯函数），并写入 `.code4xrc.json` 以保证复现。
  - 依赖版本：宿主 catalog 已有该包时用 `catalog:`，否则显式 caret（OQ-14）。
  - 生成后 stderr 提示「需在宿主补 allowBuilds/catalog 条目」（不污染 `--json`）。
  - 生成物不打 `pnpm-workspace.yaml`、不打 `AGENTS.md`（现状已做）。
  - vue 的 Tailwind `@source` / unocss 扫描范围按工作区路径生成。
- **场景 B（整仓生成）**：一次生成完整工作区（`apps/api` + `apps/web` + `apps/desktop` + `packages/shared`）——需要新概念「工作区蓝图」（多 blueprint 组合 + 根级文件贡献 + 依赖图排序）。**形态待定，见 OQ-10。**
- **打包注意**：electron-builder × pnpm isolated store —— 推荐「main/preload 全量 bundle（tsdown）+ 仅保留真实运行期依赖」；模板避免原生模块。

### M5 · 预设体系

- presets 从「内容包」升级为「blessed 组合 + 生成后提示」：`hono-standard` / `hono-full` / `vue-standard` / `vue-full` / `vue-element-tw` / `vue-naive-tw` / `vue-unocss-min` / `electron-desktop`（含 builder+ipc）。
- 每个 preset 进入 Tier-2/3 轮换矩阵；README 与 `--list` 输出 preset 的 feature 闭包与互斥说明。

### M6 · 验证与 CI

- **Tier-1（每 PR，离线）**：全组合 materialize + 互斥规则校验（互斥规则与矩阵**同源生成**）+ golden 快照 + package.json 合并冲突校验。
- **Tier-2（PR 子集 / nightly 全量）**：blessed 组合 install → typecheck → build。
- **Tier-3（nightly / 发布前）**：冒烟——hono 起服务 curl `/healthz`；vue `build`+`preview` 200；electron 构建+启动（Linux AppImage 已验证）；`.vue` 类型检查必须走 `vue-tsc`（`vp check` 的 TS-Go 不覆盖 `.vue`，见 §7）。

## 3. Hono 路线图（标准化后端）

### 3.1 基座升级（进 blueprint，零新增依赖）

| 项 | 内容 | 依据 |
|---|---|---|
| request-id | `hono/request-id`，`c.get('requestId')` 贯穿日志与错误体 | 内置模块 |
| 错误模型 | `app.onError` 输出 `{ code, message, details?, requestId }`；handler 抛 `HTTPException`；validator `defaultHook` 归一化 | `hono/http-exception` 内置 |
| 健康检查 | `routes/health.ts`：`/healthz`（存活）、`/readyz`（依赖探测→503） | k8s 命名惯例 |
| 优雅停机 | `@hono/vite-build/node` 的 `shutdownTimeoutMs`（≥1.8.0；模板已 ^1.11.1，默认关闭需显式开） | 依赖 M3 的 vite.config assembly |
| 目录规范 | `routes/*` 子应用 + `app.route()`；`schemas/`、`docs/` | hono 官方 best-practices |

### 3.2 Feature 矩阵

| Feature | 版本（2026-10-14） | 锚点/依赖 | requires / conflicts | 优先级 |
|---|---|---|---|---|
| `hono/env` | zod ^4（手写 schema，无额外依赖） | `src/env.ts`（standalone，**不接入 entry**，避免未用 import） | requires `hono/zod` | ✅ M7 |
| `hono/errors` | 内置 | `error-handlers`（M7 落地：`app.onError` + `app.notFound` 统一信封） | — | ✅ M7（并入基座） |
| `hono/testing` | 内置 `app.request()`；`vite-plus/test` | `vite-config-extra` 锚点（vite.config `test` 块）+ `src/app.test.ts` | — | ✅ M7 |
| `hono/logging` | `pino 10.4` + `hono-pino 0.10.3` | `imports`+`middlewares`；经 `when` 条件替换基座 `logger()`（M1） | **conflicts** 基座 `logger()`（已被替换机制覆盖） | ✅ M7 |
| `hono/http-hardening` | 内置 `timeout`/`body-limit`/`compress` | `middlewares`，order `20/21/22`（预留表 `20-39`） | — | ✅ M7 |
| `hono/rate-limit` | `hono-rate-limiter 0.5.4`（README 自述「开发中」）或内置 `ip-restriction` | `middlewares` | requires `hono/api-guard`；**与 hono v5 不兼容**（peer `^4.10.8`） | P2 |
| `hono/auth-jwt` | 内置 `hono/jwt`；可选 `jose 6.2` | `imports`+`routes` | requires `hono/zod` | P2 |
| `hono/db-drizzle` | `drizzle-orm 0.45.4` + `drizzle-kit` + `drizzle-zod` | `imports`+`src/db.ts`+`vite.config` external | requires `hono/zod`；conflicts 未来 `hono/db-prisma` | P2 |
| `hono/observability` | `@hono/otel 1.2` / `@hono/prometheus 1.0.3` | `middlewares` | 两者互斥 | P3 |
| `hono/swagger-openapi` | 现状 `hono-openapi ^1.3.5` + `@hono/swagger-ui` | 既有 | requires `hono/zod`；**与 `@hono/zod-openapi` 路线互斥**（OQ-7） | — |

> **M7 落地说明**：`hono/env` 未接入 `imports`（standalone 文件）——若在 entry 注入未使用的 import，生成项目的 `vp check`（oxlint `no-unused-vars`）会失败；改由用户按需 `import { env } from './env'`。`hono/errors` 不单独建 feature，错误模型（`error-handlers` 锚点 + `{ code, message, details?, requestId }` 信封）并入基座，`details` 由抛出 `HTTPException` 的处理器自行补充。`hono/zod` 经 `src/http/validation.ts` 的 `validationHook`（`zValidator` 的 `defaultHook`）把校验失败归一化为同一信封（`code: "VALIDATION"`、HTTP 400、`details` = zod issues）；两条路由变体（普通 / swagger）都消费该 hook，无逐路由重复。`hono/testing` 的锚点为新加的 `vite-config-extra`（全局唯一，避免与 `vite-plugins` 语义混淆）。`hono/logging` 的 `app.use(logger)`（logger 本身即中间件）替换基座 `app.use(logger())`；`hono/http-hardening` 只做 `timeout`/`body-limit`/`compress`（`etag`/`csrf` 后移）。

### 3.3 版本与兼容（写入实施清单）

- **zod 4 only**（已满足）；`@hono/zod-openapi` 亦要求 zod ^4。
- `@hono/node-server`：模板 ^1.19.11 → **升级 v2.1.x**（同 API、性能提升、ESM）；`@hono/vite-dev-server` 仍依赖 v1（双实例共存，开发期无害）。
- **hono v5（RC）跟踪**：v5 为 ESM-only、`onError` 签名等 breaking；`hono-openapi` peer 尚不支持 v5 —— 选型时**优先 v5-compatible peer**，把 v5 升级列为独立里程碑（OQ-12）。
- 原生依赖（`better-sqlite3` 等）：`@hono/vite-build/node` 默认 bundle 依赖（`ssr.noExternal: true`）→ 必须 `external` + `allowBuilds`（M2/M3 已覆盖）。
- 安全：`hono ^4.13.13` 已含 serveStatic 修复（GHSA-rmxm-3fg6-px4f）。

## 4. Vue 路线图（全家桶 + UI 生态）—— ✅ M8a 已落地（2026-10-15）

> M8a 完成核心栈 + CSS 引擎组 + UI 套件组（naive-ui 默认 / element-plus 备选 + presets）。**shadcn-vue 属 M8b，未实现**（§4.2 P1 行保留为待办）。落地偏差见文末修订记录。

### 4.1 核心栈

| Feature | 版本 | 集成 | 判定 |
|---|---|---|---|
| `vue/router` | `vue-router 5.4`（经典 `createRouter`，非文件路由） | 既有 | 必选 |
| `vue/pinia` | `pinia 4.0.3` | 既有 | 必选 |
| `vue/vueuse` | `@vueuse/core 15.0` | 仅依赖 | 默认开 |
| `vue/vueuse-router` | `@vueuse/router 15.0` | `imports` | 可选 |
| `vue/i18n` | `vue-i18n 11.4`（`legacy:false`）+ `@intlify/unplugin-vue-i18n 11.2` | `imports`+`app-use`+`vite-plugins`+`src/locales/**` | 默认开（中文场景） |
| `vue/query` ⟂ `vue/colada` | `@tanstack/vue-query 5.104` / `@pinia/colada 1.4` | `imports`+`app-use` | 二选一（M1） |
| `vue/testing` | `vitest 5` + `@vue/test-utils 2.5` + `happy-dom`（`vite-plus/test`） | scripts+devDeps；模板测试用文件级 `// @vitest-environment happy-dom` + 内联组件（自包含） | 可选 |

### 4.2 UI 套件组（`group: vue/ui`，恰好一个）

| 候选 | 版本/新鲜度 | 集成要点 | 判定（2026-10-14 定案） |
|---|---|---|---|
| `vue/naive-ui` | 2.45.3（活跃） | resolver + AutoImport（`useMessage` 等）；暗色 `<n-config-provider>`+`<n-global-style/>` 经 `app-template` + `when` 桥接 feature 表达（v1 不做 `app-root` 包裹机制）；官方提供 Tailwind preflight 规避选项（`preflight-style-disabled` + `<meta name="naive-ui-style">`） | **默认（用户定案）** |
| `vue/element-plus` | 2.14.7（活跃） | `unplugin-vue-components` + `unplugin-auto-import` 双 resolver；`importStyle:'css'` 零额外依赖；暗色 = `theme-chalk/dark/css-vars.css` + `html.dark` | 备选 |
| `vue/shadcn-vue` | `reka-ui 2.11` 组件栈（copy-paste，非运行时包） | 脚手架提供基线（`components.json` + `cn()` 工具 + 少量组件），不依赖交互式 CLI；**requires `vue/tailwind`**；依赖集（reka-ui / class-variance-authority / tailwind-merge / clsx / lucide-vue-next）实施时核实 | **M8b（未实现）**，P1 |
| `vue/primevue` | 5.0.2（预留） | 无前缀组件名 → 真实命名冲突风险 | P3 预留 |

> `ant-design-vue` 已按定案**删除**（上游 2024-11 起停滞；不保留 legacy 入口）。

### 4.3 CSS 引擎组（`group: vue/css`，恰好一个）

| 候选 | 版本 | 集成 | 判定 |
|---|---|---|---|
| `vue/tailwind` | `tailwindcss` + `@tailwindcss/vite 4.3.3` | CSS-first：`@import "tailwindcss"` + `@theme`；与 UI 套件 preflight 冲突需要「后置 UI 样式 / 去掉 preflight layer」策略（各套件有官方或既定做法） | **默认** |
| `vue/unocss` | `unocss 66.11`（presetWind4；presetUno/Wind 已弃用） | `@unocss/vite`；自带 reset，不再引 `@unocss/reset` | 备选 |
| 纯 CSS | — | 现状 | 隐式基线 |

### 4.4 关键实现注意（M8a 落地结论）

- `vue-router/vite` 插件必须先于 `vue()` —— **M8a 未采用文件路由**（保留经典 `createRouter`），因此没有随版本发布的插件需要 `vite-plugins-pre`；该锚点按需再加。
- 样式装配：`src/style.css` 升 assembly（`css-imports`，`list` 锚点）已落地；CSS `@import` 位于文件最前。**`vue/tailwind` 用 CSS `@import 'tailwindcss';`；`vue/unocss` 因 rolldown-Vite 8 无法解析 CSS 侧 `virtual:uno.css`，改为入口 JS 副作用 import（`import 'virtual:uno.css'`）。**
- **`.vue` 检查边界**：`vp check`（TS-Go/tsgolint）不覆盖 `.vue`，且 oxlint 尚不解析 SFC script 块 → `build`/`typecheck` 脚本**必须保留 `vue-tsc --noEmit`**（已在基座 package.json）；UI 套件的 auto-import `dts` 纳入 tsconfig include、`.gitignore` 与 vite.config 的 lint/fmt ignore。
- **`@/` 别名**：`tsconfig` 的 `paths` **不可带 `baseUrl`**（TS7/tsgolint 已移除该选项，会让生成项目 `vp check` 失败）；`paths` 相对 tsconfig 解析即可，`vite.config` 侧用 `resolve.alias` 对齐。
- 预设：`vue-standard`（router+pinia+vueuse+i18n）、`vue-naive-tw`（默认推荐）、`vue-element-tw`、`vue-unocss-min`（router+pinia+unocss）、`vue-full`（已扩为 standard + query + testing，语义变化见修订记录）。

## 5. Electron 路线图

### 5.1 渲染加载（生产）——`protocol.handle` 自定义协议

- 官方安全清单 #18 建议弃用 `file://`；`protocol.register*Protocol` 自 25 起弃用，现行 API 是 `protocol.handle`。
- 模板默认：
  ```ts
  protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
  // whenReady 后：protocol.handle('app', ...) → net.fetch(pathToFileURL(...))，含 SPA 回退（不存在路径 → index.html）
  // prod: win.loadURL('app://./index.html')
  ```
- 保持 `base: './'`（相对资源对标准 scheme 同样正确，且保留回退 `loadFile` 的可能）。
- 路由策略：**默认 `createWebHashHistory`**；文档说明「切 `createWebHistory` 需要自定义协议 + SPA 回退」。
- CSP 继续用 `<meta>`（dev/prod 一致、无每响应成本）；`!app.isPackaged` 门闩防环境变量污染生产。

### 5.2 类型化 IPC 套件（`electron/ipc`，M9）

- 生成 `src/shared/ipc.ts`：channel 表 + zod 校验（args/result 双向），main/preload/renderer 三端共享；preload 只暴露 channel 表对应的窄桥（每通道一函数，永不暴露 `ipcRenderer`）。
- 规则：默认仅 `invoke/handle`；进度 = main→renderer `webContents.send`；大流量 = `MessageChannelMain` 端口（端口只能经 `postMessage` 传递）；错误仅 `message` 原生跨 IPC（自带 envelope）。
- 为 Electron 45 做准备：沙箱 preload 将于 45 移除 Node shims —— preload bundle 不引 `node:*`。
- monorepo 演进：`src/shared/ipc.ts` 可直接提升为 `packages/shared`（M4 场景）。

### 5.3 能力 features（按需）

| Feature | 版本 | 说明 | 优先级 |
|---|---|---|---|
| `electron/updater` | `electron-updater 6.8.9` | builder `publish` 配置生成 `app-update.yml`；`app.isPackaged` 门闩；dev 需 `dev-app-update.yml`；签名是真实成本 | P2 |
| `electron/store` | `electron-store 12`（**ESM-only**） | 需验证 CJS main 打包互操作；否则核心内置 50 行 `userData` JSON store，store 作为 opt-in | P2 |
| `electron/tray-menu` | 内置 | Linux 托盘依赖 DE（appindicator），文档声明不承诺 | P3 |
| `electron/window-manager` | 内置 | `createWindow()` 抽模块 + 多窗口 | P3 |
| `electron/deep-links` | 内置 | macOS `open-url`（ready 前注册）+ builder `mac.extendInfo`；Win/Linux 经 `second-instance` argv（单实例锁已有） | P3 |
| `electron/utility-process` | 内置（≥22） | 重 CPU 任务；需验证 asar 路径 | P3 |

### 5.4 开发编排（保持 + 明确升级路径）

- 保留 **固定 `strictPort: 5173`**（应用场景端口冲突是「响亮失败」，优于脆弱 stdout 解析）；保留零依赖 TCP 等待。
- 保留 **main/preload 变更全量重启 Electron**（electron-vite 同语义；preload-only reload 需处理 `contextBridge` 与 `ipcMain.handle` 重注册，复杂度不划算；文档注明升级路径）。
- 新增 `!app.isPackaged` 门闩（5.1）。

## 6. 单仓库（工作区）模式

### 6.1 场景 A —— 在既有 workspace 内生成（M10）

- 版本策略：宿主 `pnpm-workspace.yaml` 有同包 `catalog` 条目时用 `catalog:`，否则显式 caret（沿用「版本冻结」口径）。
- 生成后提示（stderr，不污染 `--json`）：需在宿主补 `allowBuilds`（esbuild/electron/electron-winstaller…）与可选 catalog 条目；`.code4xrc.json` 记录建议项。
- 扫描范围：Tailwind `@source` / unocss 仅扫应用目录（避免工作区级全量扫描变慢）。
- 已验证：`nestedWorkspace` 条件化（不打 `pnpm-workspace.yaml`/`AGENTS.md`）与 harness 的 `<target>/apps/<pos>` 路径语义。

### 6.2 场景 B —— 整仓生成（P3，形态待定 OQ-10）

候选形态：`create-code4x my-workspace --preset full-stack` → `apps/api`(hono) + `apps/web`(vue) + `apps/desktop`(electron) + `packages/shared`。需要新机制「工作区蓝图」（多 blueprint 组合、根级贡献、workspace 内依赖排序）；electron-builder × pnpm isolated store 需「全量 bundle」策略兜底。**在场景 A 落地并稳定前不展开设计**，仅保留为方向。

## 7. 里程碑与排期（粗粒度）

| 里程碑 | 内容 | 依赖 | 预估 |
|---|---|---|---|
| **M6 机制扩展**（✅ 已完成，2026-10-14） | `group` 互斥（复用 E-CONFLICT）、`package.json#fields`、`workspaceYaml.allowBuilds`（map 形状）、MARKER 块注释语法、三个 vite.config `vite-imports` 锚点、排序约定（3c）、**Tier-1 矩阵脚本**（`tests/matrix.test.ts`：全组合 render + 互斥用例 + 同 combo 幂等） | — | 5–7 人日 |
| **M7 Hono 标准化** | 骨架改造（vite.config 升 assembly、`error-handlers` 锚点）+ 基座升级（§3.1）+ env/errors/testing/logging/hardening；preset `hono-standard`；hono 冒烟脚本 | M6 | 3–4 人日 |
| **M8a Vue 全家桶核心**（✅ 已完成，2026-10-15） | 骨架改造（style.css 升 assembly + `css-imports`、`@/` 别名；**未引入 `vite-plugins-pre`**——保留经典 router）+ vueuse/vueuse-router/i18n/query/colada/testing + UI 组（**naive-ui 默认**、element-plus 备选）+ CSS 组（tailwind、unocss）+ presets；三个 preset 生成物 install→build→check（vue-tsc）→preview 200 | M6 | 已完成 |
| **M8b Vue shadcn-vue** | `vue/shadcn-vue` 组件栈基线（requires tailwind）+ `vue-shadcn-tw` preset | M8a | P1 待做 |
| **M9 Electron 加固** | `src/shared/ipc.ts` 类型化 IPC + `protocol.handle` 加载 + `!app.isPackaged` 门闩（Electron 45 预适配）；复用既有 electron 冒烟 | M6 | 3–4 人日 |
| **M10 工作区场景 A** | ProjectContext 宿主信息 + catalog-aware 版本 + stderr 提示 + 扫描范围 | M6 | 2–3 人日 |
| **M11 CI 收口** | Tier-2 blessed 轮换 + Tier-3 冒烟纳入 CI + 互斥规则与矩阵同源生成 | M7–M10 | 3–4 人日 |
| **P3 长尾** | updater/store/tray/多窗口/深链/utilityProcess、primevue、场景 B | 以上 | 按需 |

排序原则：机制（M6，含 Tier-1 矩阵）→ 每框架「骨架 + 高频 feature」（M7–M9）→ 工作区 A（M10）→ CI 收口（M11）→ 长尾。**M6 完成前不动任何框架功能面。**

## 8. 决策记录（2026-10-14 定案）

| # | 问题 | 定案 |
|---|---|---|
| OQ-8 | `ant-design-vue` 去留 | **删除**（不保留 legacy 入口） |
| OQ-9 | `vue/i18n` 是否默认开启 | 默认开启 |
| OQ-10 | 单仓库模式形态 | 场景 A（嵌套生成增强）先行；场景 B 保留方向 |
| OQ-11 | electron-store / updater 进基座还是 feature | 均为 opt-in feature；store 先做「核心内置 JSON store」 |
| OQ-12 | hono v5 策略 | 仅做 peer 兼容性护栏；GA 后单独里程碑 |
| OQ-13 | Vue UI 默认套件 | **naive-ui**（element-plus 备选；shadcn-vue 新增） |
| OQ-14 | catalog-aware 版本策略边界 | 仅当宿主 catalog 已有该包时用 `catalog:` |
| OQ-15 | `pnpm.onlyBuiltDependencies` 去留 | 保留为旧 pnpm 兼容层，注释标注 |
| OQ-16 | shadcn-vue 依赖集与组件基线 | M8 实施时核实（本轮已启动专项调研） |

## 修订记录

- **2026-10-14 对抗性评审修订（oracle，13 条）**：修正 feature 计数（7→6）；验收口径改为「落点脚本化」并补砍量判据；M1 收敛为 `group` + 复用 `E-CONFLICT`，明确「基座块替换靠既有 `when` 条件（`render.ts:62-79`）」与「静态文件不可替换（`render.ts:526`）」；M2 明确 `allowBuilds` 为 map 形状 + 排序确定性 + 单一事实源；M3 拆为渲染器机制（3a MARKER 块注释 / 3b vite.config `imports` 锚点 / 3c 排序约定）并把三框架骨架改造下放 M7–M9；删除 `app-root` 包裹机制（v1）；M4-A 补宿主数据通路（ProjectContext + rc）；场景 B 压缩为方向；M11 只做 Tier-2/3。
- **2026-10-14 用户定案**：Vue UI 默认 = naive-ui；删除 ant-design-vue；新增 shadcn-vue（需 Tailwind，依赖集 M8 核实）；其余 OQ 按推荐定案（见 §8）。
- **2026-10-14 M6 落地**：机制扩展实现并验证——`group` 互斥（E-CONFLICT）、`package.json#fields`、`workspaceYaml.allowBuilds` 结构化发射（三框架模板迁移，嵌套 workspace 不落盘 + stderr 提示 + `rc.workspace.requiredAllowBuilds`）、CSS 块注释标记、三框架 `vite-imports` 锚点（hono vite.config 升 assembly）；Tier-1 组合矩阵落地为 `tests/matrix.test.ts`（registry 驱动、离线、幂等与互斥同源），随 `vp test` 运行。实测：191 测试全绿、三框架 `pnpm-workspace.yaml` 字节级一致、hono 生成 `vite.config.ts` oxfmt 通过。
- **2026-10-14 M7 落地**：Hono 标准化。**基座**：`requestId()` 最先（order 0）→ 基线 logger（order 1，`hono/logging` 经 `when` 替换）、新骨架锚点 `error-handlers`（`app.onError` + `app.notFound`，信封 `{ code, message, details?, requestId }`，`requestId` 取自 `c.get('requestId')`，依赖零新增）、`routes/health.ts`（`/healthz` 存活、`/readyz` 探测失败 → 503，探针为带 TODO 的 no-op）、`vite-plugins` 启用 `shutdownTimeoutMs: 5000`（已核 `@hono/vite-build/node` 适配器选项）、`@hono/node-server` 升 `^2.1.0`（`@hono/vite-dev-server` 仍内嵌 v1，双实例共存无害）。**新 feature**：`hono/env`（standalone `src/env.ts`，requires zod）、`hono/testing`（新增 `vite-config-extra` 锚点 + `src/app.test.ts`，零新依赖）、`hono/logging`（pino + hono-pino，替换基线 logger）、`hono/http-hardening`（内置 timeout/body-limit/compress，order 20/21/22）。**预设**：新增 `hono-standard`（zod+api-guard+testing）与 `hono-full`（+swagger+logging+hardening），`hono-api` 不变。实测：`vp test` 212 全绿；`hono-standard` 生成项目 `pnpm install` → `pnpm build` → 启动 curl `/healthz` 200、`/readyz` 200、未知路由 404 JSON 信封（含 `requestId`）；生成项目 `pnpm run check` 开箱通过；`hono/logging` 变体确认基线 `hono/logger` 消失且输出 pino JSON 行。
- **2026-10-15 M8a 落地**：Vue 全家桶核心 + CSS 引擎 + UI 套件。**基座**：`src/style.css` 升 assembly（`files/src/style.skeleton.css` + `css-imports` `list` 锚点，零 CSS 引擎时与升级前字节一致）；`@/` 别名（`tsconfig` `paths`，**无 `baseUrl`**——TS7/tsgolint 已移除，会让生成项目 `vp check` 失败；`vite.config` `resolve.alias` + `@types/node`）；**未新增 `vite-plugins-pre`**（保留经典 `createRouter`，无插件需先于 `vue()`）。**新 feature**：`vue/vueuse`（依赖型）、`vue/vueuse-router`（requires vueuse+router；独立 composable，不注入未用 import）、`vue/i18n`（vue-i18n `legacy:false`+`globalInjection` + `@intlify/unplugin-vue-i18n`，`imports`/`app-use`/`app-template`/`vite-imports`/`vite-plugins`）、`vue/query` ⟂ `vue/colada`（`group: vue/data`；colada requires pinia 且安装顺序 pinia 在前）、`vue/testing`（vitest+@vue/test-utils+`vp test`+`src/App.test.ts`）、`vue/tailwind` ⟂ `vue/unocss`（`group: vue/css`；unocss 经入口 JS `import 'virtual:uno.css'`，rolldown-Vite 8 不支持 CSS 侧解析）、`vue/naive-ui`（默认）⟂ `vue/element-plus`（`group: vue/ui`；双 resolver，element `importStyle:'css'`；auto-import dts 纳入 tsconfig include/`.gitignore`/lint&fmt ignore）。**预设**：`vue-standard`、`vue-naive-tw`（默认推荐）、`vue-element-tw`、`vue-unocss-min`；`vue-full` 扩为 standard + query + testing（**语义变化**）。**机制微调**：`E-STMT-DUP` 收敛为「不同贡献块之间」判重（同一多行块内重复行合法，element-plus 双 resolver 需要）；`qualifyFeature` 增框架优先解析（裸 token 跨框架共用时优先 `--framework`，如 `testing`）。**未实现**：shadcn-vue（M8b）、ant-design-vue（已删除）。实测：`vp test` 242 全绿；`vp check` 绿；`vue-naive-tw`/`vue-element-tw`/`vue-unocss-min` 生成项目 `pnpm install` → `pnpm build` → `pnpm run check`（含 vue-tsc）→ `vite preview` curl 200 开箱通过；`vue-standard`/`vue-full` 额外 install→build→check 通过；`--features vue/tailwind,vue/unocss` 与 `vue/naive-ui,vue/element-plus` 均以 `E-CONFLICT`（exit 2）退出。
- **2026-10-15 M8a 修补（`vue/testing` 开箱可跑 + install 摩擦）**：`vue/testing` devDeps 增 `happy-dom ^21.0.0`；模板 `src/App.test.ts` 用文件级 `// @vitest-environment happy-dom` 注解（无需新增 vite-config `test` 锚点）并 `mount` 一个仅依赖 `vue` 的内联组件（不再 `mount(App)`，避免依赖 preset 才装的 router/i18n/UI 插件）。同时修 `vue/query` 触发的 `ERR_PNPM_IGNORED_BUILDS`：`@tanstack/vue-query` 传递依赖 `vue-demi`（postinstall），经 `workspaceYaml.allowBuilds` 放行（生成 `pnpm-workspace.yaml` 加 `vue-demi: true`）。实测：`vue-full` 生成项目 `pnpm install`（退出 0）→ `pnpm run test` 全绿 → `build` → `check` → `preview` 200。

## 附录：版本基线（2026-10-14，实施时复核）

hono 4.13.13 · @hono/node-server **2.1.5（待升级）** · zod 4.6.7 · hono-openapi 1.3.5 · @hono/swagger-ui 0.6.1 · pino 10.4 · hono-pino 0.10.3 · drizzle-orm 0.45.4 · vue 3.5.44 · vue-router 5.4.0 · pinia 4.0.3 · @vueuse/core 15.0.0 · vue-i18n 11.4.14 · @tanstack/vue-query 5.104.2 · @pinia/colada 1.4.8 · naive-ui 2.45.3 · element-plus 2.14.7 · shadcn-vue 组件栈（reka-ui 2.11.0，依赖集待 M8 核实） · tailwindcss 4.3.3 · unocss 66.11.0 · electron 44.7.2 · electron-builder 26.15.3 · electron-updater 6.8.9 · electron-store 12.0.0 · vite 8.3.4（Rolldown）
