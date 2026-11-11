# 06 · vp 生态模板系统：最佳实践路线与实施方案

> 状态：M6–M14 已落地（M12–M14：2026-11-10）。版本核实日期 2026-10-14（M8b shadcn-vue 依赖集 2026-10-15 核实）。
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

> M8a 完成核心栈 + CSS 引擎组 + UI 套件组（naive-ui 默认 / element-plus 备选 + presets）；M8b 完成 shadcn-vue（copy-paste 组件栈 vendored + `vue-shadcn-tw`）。落地偏差见文末修订记录。

### 4.1 核心栈

| Feature | 版本 | 集成 | 判定 |
|---|---|---|---|
| `vue/router` | `vue-router 5.4`（经典 `createRouter`，非文件路由） | 既有 | 必选 |
| `vue/pinia` | `pinia 4.0.3` | 既有 | 必选 |
| `vue/vueuse` | `@vueuse/core 15.0` | 仅依赖 | 默认开 |
| `vue/vueuse-router` | `@vueuse/router 15.0` | `imports` | 可选 |
| ~~`vue/i18n`~~ | **已移除（M14）**：不再提供国际化选项 | — | — |
| `vue/reka-ui` | `reka-ui 2.11` | 无样式可访问组件原语；`app-script` 引入 Dialog 示例 + `app-template` 渲染 | **默认 UI（M14）** |
| `vue/query` ⟂ `vue/colada` ⟂ `vue/alova` | `@tanstack/vue-query 5.104` / `@pinia/colada 1.4.9` / `alova 3.5.5` | query/colada：`imports`+`app-use`；alova：独立 client（无 `app-use`） | 三选一（`vue/data`） |
| `vue/testing` | `vitest 5` + `@vue/test-utils 2.5` + `happy-dom`（`vite-plus/test`） | scripts+devDeps；模板测试用文件级 `// @vitest-environment happy-dom` + 内联组件（自包含） | 可选 |

### 4.2 UI 套件组（`group: vue/ui`，恰好一个）

| 候选 | 版本/新鲜度 | 集成要点 | 判定（2026-10-14 定案） |
|---|---|---|---|
| `vue/naive-ui` | 2.45.3（活跃） | resolver + AutoImport（`useMessage` 等）；暗色 `<n-config-provider>`+`<n-global-style/>` 经 `app-template` + `when` 桥接 feature 表达（v1 不做 `app-root` 包裹机制）；官方提供 Tailwind preflight 规避选项（`preflight-style-disabled` + `<meta name="naive-ui-style">`） | **默认（用户定案）** |
| `vue/element-plus` | 2.14.7（活跃） | `unplugin-vue-components` + `unplugin-auto-import` 双 resolver；`importStyle:'css'` 零额外依赖；暗色 = `theme-chalk/dark/css-vars.css` + `html.dark` | 备选 |
| `vue/shadcn-vue` | `reka-ui 2.11` 组件栈（copy-paste，非运行时包） | 脚手架提供基线（`components.json` + `cn()` 工具 + `button`/`card`/`input` 组件 + theme 块），不依赖交互式 CLI；**requires `vue/tailwind`**；`group: vue/ui`（与 naive-ui/element-plus 互斥）；依赖集（reka-ui / class-variance-authority / tailwind-merge / clsx / lucide-vue-next / @vueuse/core，dev tw-animate-css）已核实 | **✅ M8b（已落地，2026-10-15）** |
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
- **`.vue` 检查边界**：`vp check`（TS-Go/tsgolint）不覆盖 `.vue`，且 oxlint 尚不解析 SFC script 块 → `build`/`typecheck` 脚本使用 **`vue-tsc -b`**（project references，已在基座 package.json）；UI 套件的 auto-import `dts` 纳入 `tsconfig.app.json` include、`.gitignore` 与 vite.config 的 lint/fmt ignore。
- **`@/` 别名**：`tsconfig.app.json` 的 `paths` **不可带 `baseUrl`**（TS7/tsgolint 已移除该选项，会让生成项目 `vp check` 失败）；`paths` 相对 tsconfig 解析即可，`vite.config` 侧用 `resolve.alias` 对齐。
- 预设：`vue-standard`（router+pinia+vueuse）、`vue-naive-tw`（推荐）、`vue-element-tw`、`vue-unocss-min`（router+pinia+unocss）、`vue-full`（standard + query + testing）。

### 4.5 shadcn-vue 实现注意（M8b 落地结论）

- **无运行时包、无 CLI**：组件以源码 vendored（`ui/button` 2 文件、`ui/card` 7 文件、`ui/input` 2 文件），不依赖 `shadcn-vue` npm 包、生成期不执行交互式 CLI。增量组件走 `npx shadcn-vue add <component>`（`components.json` 已就位，CLI 会写入 `@/components/ui`）。
- **`components.json`**：`style: "new-york"`（锁默认风格保证确定性）、`tailwind.css: "src/style.css"`（我们的组装输出；CLI 后续据此改主题）、`baseColor: neutral`、`cssVariables: true`、`iconLibrary: "lucide"`、aliases 对齐 `@/`。
- **图标库选 `lucide-vue-next`**：registry 源码 import 自 `lucide-vue-next`（`iconLibrary: "lucide"` 在 shadcn-vue 映射到此包），故 vendored 基线与之对齐；更新更活跃的 `@lucide/vue`（1.57.0）会与 `shadcn-vue add` 的产出漂移，暂不采用。
- **theme 块**：经 `css-imports` 锚点、order `10`（`vue/tailwind` 的 `@import 'tailwindcss'` 为 order 0）注入，保证 `@import` 全在 CSS 顶部；块内容为 shadcn-vue manual-install 原文（`@import 'tw-animate-css'` + `@custom-variant dark` + `:root`/`.dark` oklch + `@theme inline` + `@layer base`）。
- **新增 `app-script` 锚点**：`src/App.vue` 的 `<script setup>` 增加 `imports` 锚点——shadcn 是显式 import（无 resolver 自动导入），演示组件需在 script 中 import；空集时零输出（基座 App.vue 字节不变）。
- **互斥归属 `vue/ui`**：shadcn 与 naive-ui/element-plus 争的是「主组件体系」这一个槽位；混用会叠加两套 preflight / 样式 / 装配模型（显式 import vs resolver 自动导入），非合理默认，故与其它套件互斥。
- **`requires vue/tailwind`**：shadcn 是 Tailwind 原生（`@theme`/`@apply`/`@custom-variant`）。经闭包引入 tailwind 后，「shadcn + unocss」解析为 `vue/css` 组两个成员 → `E-CONFLICT`（Tailwind-only 套件的合理结果）。
- **`@vueuse/core` 版本一致**：shadcn 的 input 组件依赖 `@vueuse/core`，声明串与 `vue/vueuse` 完全一致（`^15.0.0`），避免 `E-DEP-VERSION`。
- **暗色模式**：`.dark` 类方式——在 `<html>` 上切换 `dark` 类即生效（theme 变量与 `@custom-variant dark (&:is(.dark *))`）。可用 `@vueuse/core` 的 `useColorMode`（默认即写 `<html>` 的 class）；无需额外组件。
- **vendored 版本与升级**：基线依赖锁定在核实版本（reka-ui 2.11.0 / cva 0.7.1 / clsx 2.1.1 / tailwind-merge 3.7.0 / lucide-vue-next 1.0.0 / tw-animate-css 1.4.0）；组件源码为 registry `new-york` 快照（仅按生成物 formatter 归一化引号/分号），不被 CLI 自动更新——升级路径为按需 `npx shadcn-vue add --overwrite <component>` 或对照 registry 手动同步。
- **安装放行**：本套件未引入额外 `allowBuilds`（依赖均无 postinstall；`esbuild` 已在基座），实测 `pnpm install` 退出 0、无 `ERR_PNPM_IGNORED_BUILDS`。

## 5. Electron 路线图 —— ✅ M9 已落地（2026-10-15）

> 落地偏差与验证证据见文末修订记录。§5.1/§5.2 的机制均已实现；§5.3 能力 features 仍为 P2/P3 待做。

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

### 6.1 场景 A —— 在既有 workspace 内生成（M10 ✅ 2026-10-15）

- 版本策略：宿主 `pnpm-workspace.yaml` 有同包 `catalog` 条目时用 `catalog:`，否则显式 caret（沿用「版本冻结」口径，OQ-14）。匹配**仅按依赖名**，无模糊别名；`dependencies` 与 `devDependencies` 同等处理。
- 宿主数据通路：`ProjectContext.host?: { catalog: Record<string,string>; allowBuilds: string[] }` 为**纯数据**；CLI 的 I/O 层读取宿主 `pnpm-workspace.yaml`（用运行时依赖 `yaml` ^2 解析，非手写）并注入，`resolve`/`render` 保持纯函数。宿主文件名/结构非法时降级为空宿主（不阻断生成）。
- 生成后提示（stderr，不污染 `--json`）：**仅**列出缺失的 `allowBuilds`（diff 宿主已有集合 vs 必需集合）；另以软提示列出「可加入 `catalog:` 以便复用」的非 catalog 依赖。`.code4xrc.json` 的 `workspace` 记录 `requiredAllowBuilds` / `missingAllowBuilds` / `catalogRewrites`；`context.host` 一并写入以保证复现。
- 扫描范围：`vue/tailwind`（v4）在 `nestedWorkspace` 时发出 `@import 'tailwindcss' source('../')`（CSS 位于 `src/`，`../` = 应用包根），**显式**把自动内容检测钉在应用目录内；standalone 保持 `@import 'tailwindcss';` 不变。注：Tailwind v4 默认基址已是 Vite 项目根（应用目录），故宿主文件通常本就不被扫描——`source()` 是「无论调用 cwd / 目录布局如何都保证应用内扫描」的显式兜底（对照实验：把基址指向宿主根即会把宿主文件纳入，见修订记录）。`vue/unocss` 无需处理：其扫描根即 Vite `root`（应用目录）。
- 已验证：`nestedWorkspace` 条件化（不打 `pnpm-workspace.yaml`/`AGENTS.md`）与 harness 的 `<target>/apps/<pos>` 路径语义；catalog 改写 + 缺失提示 + 扫描范围见文末修订记录（含 marker-class 断言）。

### 6.2 场景 B —— 整仓生成（M12 ✅ 2026-11-10）

交互式首问 **Project type**，或参数式 `--monorepo`；`--app <name>` 指定应用目录（缺省按框架取 `api` / `web` / `desktop`）。生成形态：

```text
my-workspace/
├── package.json            # private：vite-plus devDep + Vite+ 任务运行器 scripts
├── pnpm-workspace.yaml     # packages: apps/*, packages/* + 应用所需 allowBuilds
├── vite.config.ts          # defaultPackage + run.cache.scripts + 共享 lint/fmt
├── .gitignore
├── README.md
├── .code4xrc.json          # 工作区级元数据（projectType/appName/workspaceName）
└── apps/<app>/             # 应用按 nestedWorkspace 渲染（不写应用级 workspace yaml）
```

实现口径：

- `Answers` 增 `projectType?: "standalone" | "monorepo"`、`appName?`、`workspaceName?`；`render()` 在 monorepo 分支先按 `nestedWorkspace: true` 渲染应用树，再整体加 `apps/<app>/` 前缀，最后追加根文件。
- 根 `pnpm-workspace.yaml` 由 `collectAllowBuilds(plan, registry)` 直接生成，因此 monorepo 模式不再输出「请宿主补 allowBuilds」提示；`catalog` 改写不生效（新根无 catalog）。
- 根 `package.json` 增 `vite-plus` devDependency（复用应用渲染结果的 range），使根级 `vp` 来自 `node_modules/.bin`，不依赖全局安装。
- 根 scripts 从应用渲染后的 `package.json` 键派生并映射到 Vite+ 任务运行器：`build`/`test`/`typecheck`/`dev` → `vp run -r <script>`；`check` → `vp check`（根配置一次覆盖整仓，避免并发 oxlint-tsgolint）；`preview`/`start`/`dist` 等应用专属脚本 → `vp run --filter ./apps/<app> <script>`。
- 根 `vite.config.ts` 由 `renderMonorepoViteConfig()` 生成：`defaultPackage` 把裸 `vp dev/build/preview/pack` 固定到 `apps/<app>`，`run.cache.scripts` 开启脚本缓存，`lint`/`fmt` 镜像应用设置并以 `**/` 覆盖 workspace 内路径（含 Electron `release/`、unplugin dts、`.code4xrc.json`）。
- 包管理器固定 pnpm（`--pm npm` 等 → `E-INVALID-VALUE`）；install / git init 在根执行。
- 应用仍走 `nestedWorkspace` 条件（Tailwind `source('../')`）。

**与候选形态的偏差**：本轮先落地「workspace 根 + 单个应用」，不做多 blueprint 组合（api + web + desktop + shared 一次生成）；`packages/*` 仅声明 pattern，留给用户按需创建。多应用「工作区蓝图」仍保留为后续方向（OQ-10）。

## 7. 里程碑与排期（粗粒度）

| 里程碑 | 内容 | 依赖 | 预估 |
|---|---|---|---|
| **M6 机制扩展**（✅ 已完成，2026-10-14） | `group` 互斥（复用 E-CONFLICT）、`package.json#fields`、`workspaceYaml.allowBuilds`（map 形状）、MARKER 块注释语法、三个 vite.config `vite-imports` 锚点、排序约定（3c）、**Tier-1 矩阵脚本**（`tests/matrix.test.ts`：全组合 render + 互斥用例 + 同 combo 幂等） | — | 5–7 人日 |
| **M7 Hono 标准化** | 骨架改造（vite.config 升 assembly、`error-handlers` 锚点）+ 基座升级（§3.1）+ env/errors/testing/logging/hardening；preset `hono-standard`；hono 冒烟脚本 | M6 | 3–4 人日 |
| **M8a Vue 全家桶核心**（✅ 已完成，2026-10-15） | 骨架改造（style.css 升 assembly + `css-imports`、`@/` 别名；**未引入 `vite-plugins-pre`**——保留经典 router）+ vueuse/vueuse-router/i18n/query/colada/testing + UI 组（**naive-ui 默认**、element-plus 备选）+ CSS 组（tailwind、unocss）+ presets；三个 preset 生成物 install→build→check（vue-tsc）→preview 200 | M6 | 已完成 |
| **M8b Vue shadcn-vue**（✅ 已完成，2026-10-15） | `vue/shadcn-vue` 组件栈基线（requires tailwind、`group: vue/ui`、vendored button/card/input + theme + `components.json`）+ `vue-shadcn-tw` preset；生成物 install→build→check（vue-tsc）→preview 200 | M8a | 已完成 |
| **M9 Electron 加固**（✅ 已完成，2026-10-15） | `src/shared/ipc.ts` 类型化 IPC + `protocol.handle` 加载 + `!app.isPackaged` 门闩（Electron 45 预适配）；复用既有 electron 冒烟 | M6 | 已完成 |
| **M10 工作区场景 A**（✅ 已完成，2026-10-15） | ProjectContext 宿主信息（catalog/allowBuilds）+ catalog-aware 版本 + stderr 提示（仅缺失项）+ Tailwind 扫描范围 | M6 | 已完成 |
| **M11 CI 收口**（✅ 已完成，2026-10-15） | Tier-2 blessed 轮换（`scripts/tier2-matrix.mjs` + `scripts/tier2-combos.json`，打包 CLI 生成 → install → build → check）+ Tier-3 冒烟（`scripts/tier3-smoke.sh`）纳入 GitHub Actions（`ci.yml` / `nightly.yml`）；combo 清单与 registry 由 `tests/tier2-combos.test.ts` 防漂移；互斥规则与矩阵同源生成（M6 `matrix.test.ts`） | M7–M10 | 3–4 人日 |
| **P3 长尾** | updater/store/tray/多窗口/深链/utilityProcess、primevue、场景 B | 以上 | 按需 |

排序原则：机制（M6，含 Tier-1 矩阵）→ 每框架「骨架 + 高频 feature」（M7–M9）→ 工作区 A（M10）→ CI 收口（M11）→ 长尾。**M6 完成前不动任何框架功能面。**

## 8. 决策记录（2026-10-14 定案）

| # | 问题 | 定案 |
|---|---|---|
| OQ-8 | `ant-design-vue` 去留 | **删除**（不保留 legacy 入口） |
| OQ-9 | `vue/i18n` 是否默认开启 | **已被 M14 取代**：移除 i18n；默认 UI 改为 `vue/reka-ui` |
| OQ-10 | 单仓库模式形态 | 场景 A（嵌套生成增强）先行；场景 B 保留方向 |
| OQ-11 | electron-store / updater 进基座还是 feature | 均为 opt-in feature；store 先做「核心内置 JSON store」 |
| OQ-12 | hono v5 策略 | 仅做 peer 兼容性护栏；GA 后单独里程碑 |
| OQ-13 | Vue UI 默认套件 | **naive-ui**（element-plus 备选；shadcn-vue 新增） |
| OQ-14 | catalog-aware 版本策略边界 | 仅当宿主 catalog 已有该包时用 `catalog:` |
| OQ-15 | `pnpm.onlyBuiltDependencies` 去留 | 保留为旧 pnpm 兼容层，注释标注 |
| OQ-16 | shadcn-vue 依赖集与组件基线 | **定案（M8b）**：`reka-ui ^2.11.0` / `class-variance-authority ^0.7.1` / `clsx ^2.1.1` / `tailwind-merge ^3.7.0` / `lucide-vue-next ^1.0.0` / `@vueuse/core ^15.0.0`（与 vue/vueuse 同串），dev `tw-animate-css ^1.4.0`；vendored `ui/button`+`ui/card`+`ui/input`；`group: vue/ui` |

## 修订记录

- **2026-10-14 对抗性评审修订（oracle，13 条）**：修正 feature 计数（7→6）；验收口径改为「落点脚本化」并补砍量判据；M1 收敛为 `group` + 复用 `E-CONFLICT`，明确「基座块替换靠既有 `when` 条件（`render.ts:62-79`）」与「静态文件不可替换（`render.ts:526`）」；M2 明确 `allowBuilds` 为 map 形状 + 排序确定性 + 单一事实源；M3 拆为渲染器机制（3a MARKER 块注释 / 3b vite.config `imports` 锚点 / 3c 排序约定）并把三框架骨架改造下放 M7–M9；删除 `app-root` 包裹机制（v1）；M4-A 补宿主数据通路（ProjectContext + rc）；场景 B 压缩为方向；M11 只做 Tier-2/3。
- **2026-10-14 用户定案**：Vue UI 默认 = naive-ui；删除 ant-design-vue；新增 shadcn-vue（需 Tailwind，依赖集 M8 核实）；其余 OQ 按推荐定案（见 §8）。
- **2026-10-14 M6 落地**：机制扩展实现并验证——`group` 互斥（E-CONFLICT）、`package.json#fields`、`workspaceYaml.allowBuilds` 结构化发射（三框架模板迁移，嵌套 workspace 不落盘 + stderr 提示 + `rc.workspace.requiredAllowBuilds`）、CSS 块注释标记、三框架 `vite-imports` 锚点（hono vite.config 升 assembly）；Tier-1 组合矩阵落地为 `tests/matrix.test.ts`（registry 驱动、离线、幂等与互斥同源），随 `vp test` 运行。实测：191 测试全绿、三框架 `pnpm-workspace.yaml` 字节级一致、hono 生成 `vite.config.ts` oxfmt 通过。
- **2026-10-14 M7 落地**：Hono 标准化。**基座**：`requestId()` 最先（order 0）→ 基线 logger（order 1，`hono/logging` 经 `when` 替换）、新骨架锚点 `error-handlers`（`app.onError` + `app.notFound`，信封 `{ code, message, details?, requestId }`，`requestId` 取自 `c.get('requestId')`，依赖零新增）、`routes/health.ts`（`/healthz` 存活、`/readyz` 探测失败 → 503，探针为带 TODO 的 no-op）、`vite-plugins` 启用 `shutdownTimeoutMs: 5000`（已核 `@hono/vite-build/node` 适配器选项）、`@hono/node-server` 升 `^2.1.0`（`@hono/vite-dev-server` 仍内嵌 v1，双实例共存无害）。**新 feature**：`hono/env`（standalone `src/env.ts`，requires zod）、`hono/testing`（新增 `vite-config-extra` 锚点 + `src/app.test.ts`，零新依赖）、`hono/logging`（pino + hono-pino，替换基线 logger）、`hono/http-hardening`（内置 timeout/body-limit/compress，order 20/21/22）。**预设**：新增 `hono-standard`（zod+api-guard+testing）与 `hono-full`（+swagger+logging+hardening），`hono-api` 不变。实测：`vp test` 212 全绿；`hono-standard` 生成项目 `pnpm install` → `pnpm build` → 启动 curl `/healthz` 200、`/readyz` 200、未知路由 404 JSON 信封（含 `requestId`）；生成项目 `pnpm run check` 开箱通过；`hono/logging` 变体确认基线 `hono/logger` 消失且输出 pino JSON 行。
- **2026-10-15 M8a 落地**：Vue 全家桶核心 + CSS 引擎 + UI 套件。**基座**：`src/style.css` 升 assembly（`files/src/style.skeleton.css` + `css-imports` `list` 锚点，零 CSS 引擎时与升级前字节一致）；`@/` 别名（`tsconfig` `paths`，**无 `baseUrl`**——TS7/tsgolint 已移除，会让生成项目 `vp check` 失败；`vite.config` `resolve.alias` + `@types/node`）；**未新增 `vite-plugins-pre`**（保留经典 `createRouter`，无插件需先于 `vue()`）。**新 feature**：`vue/vueuse`（依赖型）、`vue/vueuse-router`（requires vueuse+router；独立 composable，不注入未用 import）、`vue/i18n`（vue-i18n `legacy:false`+`globalInjection` + `@intlify/unplugin-vue-i18n`，`imports`/`app-use`/`app-template`/`vite-imports`/`vite-plugins`）、`vue/query` ⟂ `vue/colada`（`group: vue/data`；colada requires pinia 且安装顺序 pinia 在前）、`vue/testing`（vitest+@vue/test-utils+`vp test`+`src/App.test.ts`）、`vue/tailwind` ⟂ `vue/unocss`（`group: vue/css`；unocss 经入口 JS `import 'virtual:uno.css'`，rolldown-Vite 8 不支持 CSS 侧解析）、`vue/naive-ui`（默认）⟂ `vue/element-plus`（`group: vue/ui`；双 resolver，element `importStyle:'css'`；auto-import dts 纳入 tsconfig include/`.gitignore`/lint&fmt ignore）。**预设**：`vue-standard`、`vue-naive-tw`（默认推荐）、`vue-element-tw`、`vue-unocss-min`；`vue-full` 扩为 standard + query + testing（**语义变化**）。**机制微调**：`E-STMT-DUP` 收敛为「不同贡献块之间」判重（同一多行块内重复行合法，element-plus 双 resolver 需要）；`qualifyFeature` 增框架优先解析（裸 token 跨框架共用时优先 `--framework`，如 `testing`）。**未实现**：shadcn-vue（M8b）、ant-design-vue（已删除）。实测：`vp test` 242 全绿；`vp check` 绿；`vue-naive-tw`/`vue-element-tw`/`vue-unocss-min` 生成项目 `pnpm install` → `pnpm build` → `pnpm run check`（含 vue-tsc）→ `vite preview` curl 200 开箱通过；`vue-standard`/`vue-full` 额外 install→build→check 通过；`--features vue/tailwind,vue/unocss` 与 `vue/naive-ui,vue/element-plus` 均以 `E-CONFLICT`（exit 2）退出。
- **2026-10-15 M8a 修补（`vue/testing` 开箱可跑 + install 摩擦）**：`vue/testing` devDeps 增 `happy-dom ^21.0.0`；模板 `src/App.test.ts` 用文件级 `// @vitest-environment happy-dom` 注解（无需新增 vite-config `test` 锚点）并 `mount` 一个仅依赖 `vue` 的内联组件（不再 `mount(App)`，避免依赖 preset 才装的 router/i18n/UI 插件）。同时修 `vue/query` 触发的 `ERR_PNPM_IGNORED_BUILDS`：`@tanstack/vue-query` 传递依赖 `vue-demi`（postinstall），经 `workspaceYaml.allowBuilds` 放行（生成 `pnpm-workspace.yaml` 加 `vue-demi: true`）。实测：`vue-full` 生成项目 `pnpm install`（退出 0）→ `pnpm run test` 全绿 → `build` → `check` → `preview` 200。
- **2026-10-15 M8b 落地（shadcn-vue）**：**新 feature `vue/shadcn-vue`**（`group: vue/ui`，requires `vue/tailwind`）——vendored copy-paste 基线（**无 `shadcn-vue` npm 依赖、无 CLI 执行**）：`components.json`（`style: "new-york"` 锁定、`tailwind.css: src/style.css`、`iconLibrary: "lucide"`、aliases 对齐 `@/`）、`src/lib/utils.ts`（`cn()`）、theme 块（经 `css-imports` 锚点 order `10`，紧随 tailwind 的 order 0；含 `@import 'tw-animate-css'` + `@custom-variant dark` + `:root`/`.dark` oklch + `@theme inline` + `@layer base`）、starter 组件 `ui/button`（2 文件）/`ui/card`（7 文件）/`ui/input`（2 文件，registry `new-york` 源码，仅归一化引号）。**依赖**：`reka-ui ^2.11.0` / `class-variance-authority ^0.7.1` / `clsx ^2.1.1` / `tailwind-merge ^3.7.0` / `lucide-vue-next ^1.0.0`（registry 源码 import 名，而非更新的 `@lucide/vue`）/ `@vueuse/core ^15.0.0`（与 `vue/vueuse` 同串，避免 `E-DEP-VERSION`），dev `tw-animate-css ^1.4.0`。**新增 `app-script` 锚点**（`src/App.vue` 的 `<script setup>`，`imports` kind）——shadcn 为显式 import（无 resolver），演示组件需 script import；空集零输出（基座 App.vue 字节不变，`vue.test.ts` golden 仍过）。**预设** `vue-shadcn-tw`（= `vue-standard` 闭包 + `vue/tailwind` + `vue/shadcn-vue`）。**互斥决策**：归入 `vue/ui`（与 naive-ui/element-plus 互斥）——三者争同一「主组件体系」槽位，混用会叠加两套 preflight/样式/装配模型，非合理默认。实测：`vp check` 绿、`vp test` 255 全绿（新增 `tests/vue-shadcn.test.ts` 13 项）；`vue-shadcn-tw` 生成项目 `pnpm install`（退出 0，无 `ERR_PNPM_IGNORED_BUILDS`；未引入额外 `allowBuilds`）→ `pnpm run build`（vue-tsc + vite，产物 CSS 15.98 kB 含 64 处 oklch）→ `pnpm run check` 开箱通过（无 `--fix`）→ `vite preview` curl 200；`--features vue/shadcn-vue,vue/unocss` 以 `E-CONFLICT`（exit 2，`vue/css`）退出，`-f vue --features vue/shadcn-vue` 经闭包拉入 `vue/tailwind`。
- **2026-10-15 M9 落地（Electron 加固）**：**基座（非新 feature）**改造 electron 模板。**A 类型化 IPC**：新增 `src/shared/ipc.ts`（zod 4 channel 表 `ipc = { 'app:ping': { args: z.tuple([]), result: z.literal('pong') }, 'app:echo': { args: z.tuple([z.string().min(1)]), result: z.string() } } as const` + 派生 `IpcChannel`/`IpcArgs`/`IpcResult`/`IpcEnvelope`）；`src/preload/index.ts` 改为**由表驱动的窄桥**——模块私有泛型 `invoke<C>(channel, ...args)` 承担传输，`window.code4x` 每通道一函数、不暴露 `ipcRenderer`/通用 invoke；错误经 `{ ok:false, error:{ message } }` 信封，preload 侧 `throw new Error(response.error.message)`（**仅 `message` 原生跨 IPC**）。`src/main/index.ts` 用 `register<C>(channel, handler)` 从表注册：`ipc[channel].args.safeParse(rawArgs)` + `ipc[channel].result.safeParse(...)` 双向校验，抛错 → 信封（不泄漏 stack/自定义字段）。**TS 泛型收敛**：以泛型 `channel` 索引 `const ipc` 会把 schema 拓宽为「所有通道的并集」，故 `parsedArgs.data as IpcArgs<C>` 一处显式断言（已有注释；模块级 helper 方案实测仍为并集，故弃用）。Renderer 侧 `src/renderer/src/env.d.ts` 用 `import('../../shared/ipc').IpcArgs/IpcResult` **类型查询**派生 `window.code4x`（文件保持 script 上下文——顶层 `import`/`export` 会让 `declare module '*.vue'`/`'*.css'` 失去 ambient 语义，实测验证）；演示保留 ping，新增 echo（空串触发 args 校验失败 → 展示错误信封）。**B 生产加载**：`protocol.registerSchemesAsPrivileged([{ scheme:'app', privileges:{ standard:true, secure:true, supportFetchAPI:true } }])`（ready 前）+ `protocol.handle('app', ...)`（`net.fetch(pathToFileURL(...))`），**path-traversal guard**（`normalize` + `startsWith(root + sep)`，逃逸 → 403）+ **SPA 回退**（`existsSync` 失败 → `index.html`）；prod `win.loadURL('app://./index.html')`，dev 分支加 `!app.isPackaged && rendererUrl` 门闩；`base: './'` 与 `<meta>` CSP 保持。**C 沙箱/打包正确性**：`zod` 进 `dependencies`（tsdown 默认 externalize production deps），故 `vite.config.ts` 增 `deps.alwaysBundle: ['zod']`；实测 `dist/main/index.cjs` 内联 zod（无 `require("zod")`，其余仅 `require("electron")`/`node:fs`/`node:path`/`node:url`），`dist/preload/index.cjs` **0.86 kB、零外部 require、零 `node:*` 导入**（preload 仅 `import type` 表，zod 编译期擦除；`alwaysBundle` 为「未来 preload 引运行期 schema」兜底）。preload 只 `require("electron")`。**D 测试/文档**：`tests/electron.test.ts` 文件清单加 `src/shared/ipc.ts` + 断言 zod/`alwaysBundle: ['zod']`/`register('app:ping'`；新增 `tests/electron-ipc.test.ts`（表发射、表驱动窄桥、无 `node:` 导入、主进程双向校验、`protocol.handle`+`registerSchemesAsPrivileged`+SPA 回退+traversal guard、`!app.isPackaged` 门闩、env.d.ts 类型派生）。**实测**：`vp check` 绿、根 `vp test` **14 文件 / 263 测试全绿**；`vp -C packages/cli pack` → 生成 `-f electron --features electron/builder` 项目 `pnpm install`（退出 0）→ `pnpm run build`（pack 主 146.96 kB / preload 0.86 kB；renderer 65.24 kB JS）→ `pnpm run check`（无 `--fix`，15 文件格式化 + 8 文件 lint/类型全过）→ `pnpm run dist:dir`（electron-builder 26.15.3，`release/linux-unpacked`）→ **打包态运行** `release/linux-unpacked/app --no-sandbox`（DISPLAY=:0）：`xdotool search --name '^app$'` 命中窗口、日志无 "Failed to load URL"/协议错误、屏幕截图确认渲染层内容（Electron 44.7.1 / Node 24.21.0 / Chromium 152）经 `app://` 正常加载。**dev 路径**：`[dev]` 各阶段 + Electron 启动 + 窗口命中 + 无加载错误 + SIGINT 全组触发 `[dev] shutting down` 且零孤儿进程、端口释放（端口用 5199 实测：宿主 5173 被同机另一项目占用，仅对生成物做临时端口覆盖，模板未改）。**未做**：§5.3 能力 features（updater/store/tray/多窗口/深链/utilityProcess）；`MessageChannelMain` 流式通道仅文档说明、未出示例。
- **2026-10-15 M10 落地（工作区场景 A：在既有 workspace 内生成）**：**纯数据宿主通路**——`ProjectContext` 增 `host?: { catalog: Record<string,string>; allowBuilds: string[] }`（docs/03 §1）；新增运行时依赖 **`yaml` ^2**（`src/io/workspace.ts` 用 `yaml.parse` 解析用户手写的宿主 `pnpm-workspace.yaml`，**非手写字符串匹配**），`detectNestedWorkspace` 重构为复用 `findHostWorkspaceRoot`，新增 `readHostWorkspace`（解析默认 `catalog:` 映射 + `allowBuilds` map / 兼容 `onlyBuiltDependencies` 列表；文件损坏降级为空宿主不阻断生成）。**catalog-aware 版本（OQ-14）**：`render` 的 `applyPackagePatches` 收到 `context.host.catalog` 后，凡 `dependencies`/`devDependencies` 中**依赖名**命中宿主 catalog 即改写为 `"catalog:"`（仅按名匹配，无别名）；无 feature patch 时同样生效（条件从 `patches>0` 放宽为 `patches>0 || catalog`）。新增纯导出 `catalogRewriteNames`（已改写为 catalog 的名，id 排序）与 `catalogCandidates`（可入 catalog 的建议项）。**CLI**：`context.host` 注入；stderr 提示**仅列缺失的 `allowBuilds`**（diff 必需 vs 宿主已有）+ 可选 catalog 复用建议，绝不进 `--json` stdout；rc 的 `workspace` 增记 `missingAllowBuilds`/`catalogRewrites`（保留 `requiredAllowBuilds`），`context.host` 一并落盘。**扫描范围**：`vue/tailwind` 经 `when(context.nestedWorkspace)` 双分支——嵌套发 `@import 'tailwindcss' source('../')`（把 v4 自动内容检测钉在应用包根，隔离宿主/兄弟应用），standalone 字节不变；`vue/unocss` 扫描根即 Vite `root`（应用目录）无需处理。**测试**：新增 `tests/host-workspace.test.ts`（解析/降级/catalog 改写/standalone 对照/确定性/扫描范围）+ `cli.test.ts` 增「catalog + 部分 allowBuilds」与 standalone 对照。实测：`vp check` 绿、`vp test` 278 全绿（15 文件）；端到端见下（宿主 catalog 改写、缺失提示、**marker-class 隔离**）。
  - **端到端证据**：`/tmp/opencode/m10-verify/host`（`packages: [apps/*]` + catalog{vue,vite,vite-plus,zod,tailwindcss} + allowBuilds 仅 {esbuild}）。`-f vue -p vue-naive-tw` 生成 `apps/web`：`package.json` 中 `vue`/`vite`/`vite-plus`/`tailwindcss` → `"catalog:"`，其余保留 caret；stderr 仅列缺失 allowBuilds（本例 esbuild 已满足 → 无该段）+ catalog 复用建议；未写 `pnpm-workspace.yaml`；rc `context.host`/`workspace` 记录齐全。宿主根 `pnpm install`（退出 0，无 `ERR_PNPM_IGNORED_BUILDS`）+ 应用 `pnpm build`（vue-tsc+vite）与 `pnpm run check`（vp check）通过。`-f electron --features electron/builder` 生成 `apps/desktop`：stderr 仅列缺失的 `electron`/`electron-winstaller`（已满足的 `esbuild` 不再重复）。**扫描隔离**：应用内文件放 `bg-[#4d7c01]`、宿主根（应用外）放 `bg-[#9f3a01]` → 生成物 `source('../')` 构建后 CSS 含 `4d7c01`、**不含** `9f3a01`；对照实验把该指令改为指向宿主根的 `source('../../../')` 后 `9f3a01` **出现**（证明该指令确实控制扫描基址，`../` = 应用包根）。standalone 对照（同一 preset 在任何 workspace 之外）：版本为 caret、`@import 'tailwindcss';`（无 `source()`）、stderr 无提示、写 `pnpm-workspace.yaml`。

- **2026-10-15 M11 落地（CI 收口：Tier-2/Tier-3 + GitHub Actions）**：**Tier-2 脚本** `scripts/tier2-matrix.mjs`（Node ESM，零新依赖）——对每个 blessed 组合用**打包 CLI**（`packages/cli/dist/cli.mjs`）生成到 scratch（`TIER2_DIR`，默认 `/tmp/opencode/tier2`）→ `pnpm install`（复用 `pnpm store path` + `--prefer-offline`）→ `pnpm run build` → `pnpm run check`，逐组合打印 PASS/FAIL 与失败步骤的输出尾部（每组合日志落 `logs/<id>.log`），任一失败退出非零；`--subset`（默认，PR）/ `--all`（nightly）/ `--only`。**组合清单** `scripts/tier2-combos.json`（subset：hono base + `hono-standard`、vue base + `vue-naive-tw`、electron `--features electron/builder`；nightly 追加 `hono-full`/`vue-standard`/`vue-element-tw`/`vue-unocss-min`/`vue-shadcn-tw` 与 electron base），运行时对照 `dist/index.mjs` 的 registry 校验每个 framework/preset/feature id（预设须归属其框架），并由 `tests/tier2-combos.test.ts` 对源 registry 做同样断言（防漂移）。**Tier-3 脚本** `scripts/tier3-smoke.sh`（bash `set -euo pipefail`）——hono：install→build（`PORT` 构建期烘焙）→起服务→curl `/healthz` 200→`SIGTERM` 断言退出 0；vue：install→build→`vite preview --host 127.0.0.1`→curl 200；electron：install→build→`electron-builder --dir`→启动解包应用（`DISPLAY` 未设时 `xvfb-run -a`，恒 `--no-sandbox`；断言存活 N 秒且日志无 `Failed to load URL`，xdotool 可选）；日志落 `/tmp/opencode/tier3-*.log`，trap 清理进程与（成功时）目录。**CI**：`.github/workflows/ci.yml`（push/PR：`tier1` = setup-node 24 + pnpm 12.11.2 + cache → `pnpm exec vp install/check/test`；`tier2` `needs: tier1` → `vp -C packages/cli pack` → `node scripts/tier2-matrix.mjs`）与 `.github/workflows/nightly.yml`（`schedule` + `workflow_dispatch`：Tier-2 `--all` 与 Tier-3 冒烟，apt 装 xvfb/xdotool，失败即 job 失败）。根脚本 `ci:tier2` / `ci:tier2:all` / `ci:tier3`。实测：`vp check` 绿、`vp test` **283 全绿（16 文件）**；`node scripts/tier2-matrix.mjs` 子集 **5/5 PASS（wall 20s，复用已暖 store）**、无 `ERR_PNPM_IGNORED_BUILDS`；`bash scripts/tier3-smoke.sh` **hono/vue/electron 全 PASS（wall 23s）**——hono `GET /healthz -> 200` + 优雅 `SIGTERM` exit 0，vue `GET / -> 200`，electron 解包应用存活 10s 且日志无 `Failed to load URL`（本机 `DISPLAY=:0` 走原生显示路径，`xvfb-run` 分支未在本机触发）；两 workflow YAML 经 `yaml.parse` 校验（`ci.yml` jobs=`tier1,tier2`；`nightly.yml` jobs=`tier2-all,tier3`）；脚本退出后 `ss`/`pgrep` 无残留进程/端口，成功的 Tier-3 scratch 目录被清理。
- **M11 偏差**：Tier-1 矩阵已由 M6 交付于 `packages/cli/tests/matrix.test.ts`（非 `scripts/tier1-matrix.ts`，docs/06 §0 表格中的脚本名为早期规划）；M11 未重复建 Tier-1 脚本。Tier-2 运行时 registry 校验依赖已 pack 的 `dist/`（CI 在跑 Tier-2 前先 pack）；`tier2-combos.json` 与 `tier2-matrix.mjs` 分文件存放以让 `.test.ts` 直接读取清单做防漂移断言（清单是单一事实源）。生成组合的 `pnpm install` 会出现 pnpm 的 peer 依赖 *警告*（vite-plus 传递依赖，非硬冲突，退出码 0）。

- **2026-10-15 发布收尾（0.1.0 发布就绪）**：**包级元信息**——新增 `packages/cli/README.md`（npm 页面视角：用法、三框架 feature 矩阵与预设、常用参数、`.code4xrc.json` 生成物说明）与 `packages/cli/LICENSE`（复制根 MIT）；npm 打包会自动纳入包根 `README.md` / `LICENSE`（即使 `files: ["dist"]`），故 tarball 现含 `package/{package.json,README.md,LICENSE,dist/**}`。**changesets 决策**——引入 `@changesets/cli@^3.0.3`（根 devDependency）与根脚本 `changeset` / `changeset:version` / `changeset:publish`（**避开 npm 保留的 `version` 脚本名**）；`.changeset/config.json`：`baseBranch: main`、`access: public`、`commit: false`、`updateInternalDependencies: "patch"`、`changelog: "@changesets/cli/changelog"`，`fixed`/`linked`/`ignore` 留空——**理由**：本仓库仅一个可发布包（`packages/cli`）、无内部包依赖，故 `fixed`/`linked`（多包联动版本）与 `ignore`（排除私有包）均无适用对象，保持最小可用配置；`updateInternalDependencies` 保留默认值以备将来出现内部依赖。**单一入口**——`bumpp`（包内 devDependency，此前无脚本引用）保留但不作为发布入口；**changesets 是发布流程的单一入口**（版本号、CHANGELOG、publish 均走它），消除双轨歧义。**演练证据**——`npm pack` 产出 96 文件 / 66.8 kB（unpacked 224.7 kB），逐条核对：含 `package/package.json`、`package/README.md`、`package/LICENSE`、`package/dist/cli.mjs`、`package/dist/index.mjs`、`package/dist/templates/**`（34 项）、`package/dist/features/**`（53 项）；**不含** `tests/`、`src/`、`vite.config.ts`、`.code4xrc.json`、`features/`、`templates/` 源目录（均为 0 项）。本地 tarball 安装演练（`pnpm add <tgz>` → `node_modules/.bin/create-code4x demo -f hono -y --no-git --no-install`）生成成功（含 `.code4xrc.json`）；`pnpm dlx <tgz> demo2 -f vue -y --no-git --no-install` **亦成功**（pnpm 12 支持本地 tarball dlx）。`npm publish --dry-run --access public` 退出 0、96 文件、仅两条 warning：`TypeScript 7.0 … experimental`（vp pack）与 `"bin[create-code4x]" script name dist/cli.mjs was invalid and removed`——后者为 npm `@npmcli/package-json` 对 `./dist/cli.mjs` → `dist/cli.mjs` 归一化的**误导性措辞**（bin 并未被删除，安装演练已验证 `.bin` 可执行；且 `vp pack` 的 `exports: true` 会把 bin 规范回 `./dist/cli.mjs`，故该 warning 由工具链固有行为产生，非包配置缺陷）。**待补**——`repository` 字段（仓库无 git remote，不编造 URL，待 remote 就位后写入）；npm 凭据与真实发布。约束遵守：未新增 `@changesets/cli` 以外依赖、未改包版本号（保持 `0.1.0`）、未真正发布、生成物/模板行为零改动。

- **2026-10-15 包改名（`create-code4x` → `@code4x/cli`）**：**目录**：发布包目录 `git mv` 为 `packages/cli`（旧目录名即原包名 `create-code4x`，对齐新包名与原始设计草图）。**包名** `@code4x/cli`（发布在 `code4x` npm scope 下）；`version 0.1.0`、`publishConfig.access: "public"`（作用域包必需）、`files: ["dist"]`、`exports`/`prependOnly` 均不变。**bin 保持 `create-code4x`**（`{ "create-code4x": "./dist/cli.mjs" }`）：调用形态变为 `pnpm dlx @code4x/cli`，但命令名延续 `create-*` 惯例。**代码**：`src/cli.ts` 的 `readCliVersion()` 守卫由 `pkg.name === "create-code4x"` 改为 `"@code4x/cli"`（及注释）；路径引用（根 `vite.config.ts` ignorePatterns、`scripts/**`、`.github/workflows/**`、`fixtures/vp-harness/**`、`docs/**`、`README.md`）全部改为 `packages/cli`。**调用含义**：`pnpm create code4x` / `vp create code4x` 会按 npm/vp 简写展开成 `create-code4x`，**不再映射本包**；正确入口为 `pnpm dlx @code4x/cli <dir>`，或经 Vite+ 在 `create.templates` 以**全名** `@code4x/cli` 注册条目（run as-is、不做简写展开）。**可选后续**：新增一个 `@code4x/create` 清单包可恢复 `pnpm create @code4x`（`@org` → `@org/create`）并启用 `vp create @code4x` 组织选择器。约束遵守：无行为变更（模板/features/预设 id 未动）、未 bump 版本、无新依赖、未提交。

- **2026-11-06 远端与发布元信息收口 + 文档同步**：**远端**——新增 GitHub 远端 `github` = `git@github.com:Felix-V587/code4x-create.git`（`.`github/workflows` 的 CI 在该远端运行；Gitee `origin` 保留）。**包元信息**——`packages/cli/package.json` 补 `repository`（`type: git`、`url: git+https://github.com/Felix-V587/code4x-create.git`），消除 0.1.0 发布收尾遗留的唯一元信息缺口。**文档**——`docs/README.md` 状态表补 M10 行、修正「待 git remote / `repository` 待补」的过时表述；`docs/02-architecture.md` §7 将 `M4 / M10–M11` 由 ⏳ 改为 ✅；根 `README.md` 状态行与发布节同步。**核实**——`.changeset/config.json` 的 `$schema`（`@changesets/config@4.0.1`）与锁文件实装的 config 版本一致，非漂移。**仍阻塞**——npm 发布：`~/.npmrc` 中 token 失效（`npm whoami` → 401）；本机 GitHub 连通性无法验证（全局 `ProxyCommand` 指向的 `127.0.0.1:7897` 代理未启动），故 `github` 远端的 `ls-remote` 未通过。

- **2026-11-06 Vue 请求策略层（`vue/alova` + Colada 基础配置）**：**新增 `vue/alova`**（alova 3.5.5，`group: vue/data`）——`src/lib/alova.ts`（`createAlova` + `alova/vue` 的 `vueHook` + `alova/fetch` 的 `adapterFetch()` + `VITE_API_BASE_URL` 回落 `/api` + 15s 超时 + 非 2xx 归一化）、`src/api/todos.ts`（类型化 `alova.Get<Todo[]>()`）、`src/composables/useTodos.ts`（`useRequest` from `alova/client`）；无需 `app.use`，入口保持零改动。**`vue/colada` 补基础配置**——新增 `src/lib/colada.ts`（全局 `staleTime: 30_000`）与同款 `src/api/todos.ts` / `useTodos.ts` 示例，入口改为 `app.use(PiniaColada, coladaOptions)`；依赖升 `^1.4.9`（peer vue ≥3.5.41 / pinia 4 兼容）。**互斥**：`vue/data` 由二选一扩为三选一（query ⟂ colada ⟂ alova），Tier-1 矩阵自动覆盖。**验证**：`vp test` 284 全绿、`vp check` 绿；两组生成物（`-f vue --features alova` / `--features colada`）`pnpm install` → `pnpm build` → `pnpm check`（含 vue-tsc）全通过；Tier-2 nightly 增 `vue-colada` / `vue-alova`。**文档**：站内指南/矩阵/首页计数（22 feature）与包 README 同步。

- **2026-11-10 M14（Vue 能力调整 + 全栈快捷模式 + 注释中文化）**：**Vue**——移除 `vue/i18n`（feature/预设/提示/文档）；新增 `vue/reka-ui`（`group: vue/ui`、`defaults: true`、`promptSection: ui`，依赖 `reka-ui ^2.11.0`，附带 `src/components/RekaDialog.vue` 与 `app-script`/`app-template` 接线），naive-ui 不再默认；`vue/testing` 改用 `vite-plus/test`（移除独立 vitest）。**全栈**——`ProjectType` 增加 `fullstack`；N0 第三项 + `--fullstack`；固定 `apps/api`（hono api-guard+zod+testing）、`apps/web`（vue router/pinia/vueuse/vueuse-router/testing + reka-ui + alova + unocss）、`apps/desktop`（electron/builder）；新 `src/domain/fullstack.ts` 负责多计划 resolve/render、路径前缀、根 `package.json`/`pnpm-workspace.yaml`（allowBuilds + peer rules 并集）/README/rc `stack.apps`；根 `pnpm dev` 并行，Web 强制 5175 避开 Electron 5173；固定 pnpm，拒绝 framework/features/preset/app 覆盖。**注释**——生成物模板/feature 资产中的英文注释统一改为中文（`@code4x` 标记与 `@vitest-environment` 指令保持原样）。实测：`vp test` 341 全绿、`vp check` 绿；全栈生成物 install→build→check→test 全通过。

- **2026-11-10 Vue 基座对齐 Vite+ 官方 vue-ts 模板**：以 `vp create` 的 Vue TS 产物（`demos/demo-vue`）为参照，重构模板依赖与配置——`@vue/tsconfig ^0.9.1` + `tsconfig.json`（`files: []` + references）/`tsconfig.app.json`（extends `tsconfig.dom.json`、`types: ["vite/client"]`、`paths`、auto-import dts）/`tsconfig.node.json`（vite.config.ts）；`build: vue-tsc -b && vp build`、`typecheck: vue-tsc -b`、`dev/preview: vp dev`/`vp preview`；`vite.config.ts` 改用 `lazyPlugins(() => [...])`，feature 插件在回调内注入，去掉旧版插件类型 cast；`vue`/`@types/node`/`@vitejs/plugin-vue`/`typescript ~6.0.3`/`vue-tsc` 对齐官方版本；`vite` 使用 `npm:@voidzero-dev/vite-plus-core@^1.5.0` 显式 alias（与 `vite-plus ^1.5.0` 同版本；Vite+ 要求，嵌套 catalog 场景仍自动改写为 `catalog:`），package.json 同时写 npm/Bun `overrides` 与 Yarn `resolutions`（npm 直接 alias 会被 `@vitejs/plugin-vue` 的 Vite 8 peer 范围拒绝；overrides 后 npm install/build/check 实测通过），并在生成物 `pnpm-workspace.yaml` 写入 `peerDependencyRules.allowedVersions.vite: "*"` 消除 pnpm 告警（`pnpm peers check` 零问题），`vue/testing` 改用 `vite-plus/test`（移除独立 vitest 依赖，复用 Vite+ 内置 runner）；`src/env.d.ts` 改为官方形状，`.gitignore` 补官方条目，新增 `.vscode/extensions.json`（Volar）。生成物 `base` / `vue-naive-tw` / `vue-element-tw` / `vue-unocss-min` / `vue-full` / `vue-shadcn-tw` 六组均 `pnpm install` → `pnpm build`（`vue-tsc -b`）→ `pnpm check` 通过；`vue-full` 额外 `pnpm test` 绿。
- **2026-11-06 Node 支持版本调整**：根与发布包 `engines.node` 由 `^20.19.0 || >=22.12.0` 收紧为 `>=22`；三个生成物模板补 `engines.node: ">=22"`；CI（`ci.yml` / `nightly.yml` / `docs.yml`）统一 `node-version: 26`；文档前置要求改为「Node ≥22（推荐 26+）」，并注明 Vite 8 / Vite+ 实际要求 22.18+。实测：`vp check` / `vp test` 全绿；三框架生成物均带 `engines`，Vue 生成物 install→build→check 通过。
- **2026-11-10 单仓库产物构建切换到 Vite+ 任务运行器**：对齐 Vite+ [Monorepo](https://viteplus.dev/guide/monorepo) / [Run](https://viteplus.dev/guide/run) / [Task Caching](https://viteplus.dev/guide/cache) 文档——**根依赖**：monorepo/fullstack 根 `package.json` 增 `vite-plus` devDependency（monorepo 复用应用 range；fullstack 取三应用最高 range），修复此前根级 `vp run -r build` 报 “This project does not use vite-plus” 的问题，同时保持「不依赖全局 vp」。**根脚本**：`build`/`test`/`typecheck`/`dev` 改用 `vp run -r`（依赖排序 + 任务缓存；根脚本自引用自动剪枝），`check` 改为整仓一次 `vp check`（根 `vite.config.ts` 的 lint/fmt 覆盖全 workspace，避免并发 `oxlint-tsgolint` 的 EBUSY），`preview`/`start`/`dist` 等应用专属脚本走 `vp run --filter ./apps/<app>`；fullstack 新增 `typecheck`，`dev` 用 `vp run -r --parallel dev`。**根配置**：新增 `vite.config.ts`——monorepo `defaultPackage` 覆盖 `dev/build/preview/pack`（裸命令等价 `vp -C apps/<app>`）、`run.cache.scripts: true`、共享 lint/fmt（`**/dist/**`、`**/release/**`、unplugin dts、`.code4xrc.json`）；fullstack 不设 `defaultPackage`。**实测**：`vp check` / `vp test`（343 全绿）；monorepo Vue/Hono/Electron 与 fullstack 生成物均 `pnpm install` → `pnpm build` → `pnpm check` 通过；Vue/Hono 的 `test` 二跑命中缓存（fullstack 二跑 `4/5` 构建缓存命中，仅 Vue `vp build` 因 unplugin dts 读写而不缓存，与 Vite Task 的 read-write 规则一致）；Tier-2 子集新增 `vue-monorepo` 组合（`scripts/tier2-combos.json` + `cliArgsFor` 支持 `monorepo`），PR 档 **6/6 PASS**。文档同步 `website/guide/workspace.md` / `generated-project.md` / `cli.md` 与根 README。
- **2026-11-10 全栈样板代码 + shared-types + AGENTS.md**：**共享包**——新增 `packages/shared-types`（`@<scope>/shared-types`，`Todo` / `CreateTodoInput` / `ApiError` / `HealthStatus`），`vp pack` 构建 `dist/`，类型入口指向 `src/index.ts` 使 `pnpm check` 不依赖构建产物；三个应用以 `workspace:*` 引用。**纵向示例**——`apps/api` 新增 `GET/POST /todos`（zod + `validationHook` + 共享类型约束）与 2 个 Vitest 用例；`apps/web` 的 `Home.vue` 经 Alova 调 `/api/todos`（Vite `server.proxy` 开发期转发到 3000），`src/api/todos.ts` 改用共享 `Todo`；`apps/desktop` 新增 `app:todo` IPC 通道（zod schema 用 `z.ZodType<Todo>` 约束，preload/env/App 三端接线）。**AGENTS.md**——generate 根 `AGENTS.md` + `apps/{api,web,desktop}/AGENTS.md` + `packages/shared-types/AGENTS.md`：写目录职责、命令、协作规则，并按技术栈列出官方 `llms.txt`（Vite+ / Vite / Hono / Zod / Vue / Vue Router / Pinia / VueUse / Alova / Reka UI / UnoCSS / Vitest / Node 均实测 200；Electron / electron-builder / TypeScript / pnpm 无 llms.txt，给官方文档入口）。**验证**——`vp check` 绿、`vp test` **346 全绿**；全栈生成物 `pnpm install` → `pnpm build`（shared-types 先于三应用）→ `pnpm check` → `pnpm test` 全通过；`GET /todos` 运行时 200，Web dev `/api/todos` 经代理 200。**实现**：`src/domain/fullstackScaffold.ts` 负责样板文件与带锚点断言的应用补丁（模板漂移即 `E-FILE-WRITE`），`fullstack.ts` 只保留编排。Tier-2 nightly 新增 `fullstack` 组合（`--only=fullstack` 实测 **PASS 10.1s**）。
- **2026-11-11 全栈生成回归单仓库基准**：排查 0.4.0 全栈/单仓库/标准三种产物——**Hono Vite 插件无需修复**，`apps/api/vite.config.ts` 在 0.4.0 全栈产物中已包含 `devServer({ entry: 'src/index.ts' })` 与 `build({ entry: 'src/index.ts', port, shutdownTimeoutMs: 5000 })`，与 `hono-standard` 标准产物逐字节一致（差异仅为 shared-types/示例接线）；新增回归测试锁住该断言。**真实偏差**：全栈 app plan 之前以 `projectType: "standalone"` 构造并走 `render()`，绕过了单仓库适配；全栈 app 的 `README.md` 仍是 standalone 文案（含不存在的 app 级 `.code4xrc.json` 章节），app 级 `pnpm` 构建策略与根重复。**修复**：`renderApplication()` 导出并成为 monorepo/fullstack 共用的 app 渲染入口；全栈 app plan 改为 `projectType: "monorepo"`；`FULLSTACK_APPS` 改为标准基线组合（api=`hono-standard`，web=`vue-standard` + vueuse-router/testing/reka-ui/alova/unocss，desktop=标准 Electron + `electron/builder`）；新增共享 `adaptNestedApp()`，在 monorepo/fullstack 中统一删除 app 级 `pnpm` 配置、把 README 改写为 workspace 说明并移除 app 级 `.code4xrc.json` 章节；根 `.gitignore` 常量复用。**验证**：`vp check` 绿、`vp test` **349 全绿**；Tier-2 `vue-monorepo` 与 `fullstack` 均 PASS；全栈生成物 install→build→check→test 通过，API Vite 插件断言通过。

- **2026-11-11 全栈 API 切到 `hono-full` + 预设文档化（0.4.1）**：`FULLSTACK_APPS` 的 `apps/api` 由 `hono-standard` 改为 `hono-full`，全栈 API 默认包含 swagger-openapi（`/docs`、`/openapi.json`）、pino logging 与 http-hardening；示例 `/todos` 路由与 shared-types 链接保持不变。文档站 `guide/presets.md` 重写为「模式默认预设 + 各框架预设展开」：Standard 不隐式套预设，Monorepo = 所选 preset + 单仓库适配，Full-stack = `hono-full` / `vue-standard` + extras / Electron 基座 + `electron/builder`；Hono、Vue、Electron 三节列出完整 feature 展开与用途。同步 Hono 框架页、workspace / interactive / cli 指南与根 README。**验证**：`vp check` 绿、`vp test` 全绿；全栈生成物 install→build→check→test 通过；Tier-2 `fullstack` PASS。

- **2026-11-11 单仓库/全栈环境变量、前后端联动、桌面内嵌 API 与强制覆盖**：**环境变量**——monorepo/fullstack 根生成 `.env`（gitignore）与 `.env.example`：`PORT` / `LOG_LEVEL` / `API_DEV_PROXY` / `VITE_API_BASE_URL`；Vue 通过 `envDir: '../../'` 共享读取，Hono 的 `vite.config.ts` 用 `loadEnv()` 读取 `PORT`/`LOG_LEVEL`，生产 `start` 改为 `node --env-file=../../.env dist/index.js`。**前后端联动**——全栈 API 示例挂载到 `/api/todos`；Web dev 代理目标改为 `API_DEV_PROXY`（fullstack 不 rewrite，monorepo Vue 保留 `^/api` 去前缀）；生产可保持 `VITE_API_BASE_URL=/api` 走同源反代或设置绝对 API 地址。**桌面内嵌**——`apps/api` 暴露 `./src/index.ts`，desktop 以 `workspace:*` 依赖并在 `vp pack` 时 bundle（`alwaysBundle` 覆盖 api/hono/zod/pino/openapi 等）；主进程 `protocol.handle('app')` 把 `app://./api/*` 直接交给 Hono `fetch`，渲染层启动即请求 `/api/todos`，打包后无需单独启动后端。**强制覆盖**——新增 `--force`：覆盖任意已存在目标目录（`--overwrite` 仍仅限含 `.code4xrc.json` 的生成目录）；交互模式在目标已存在且非空时 confirm（生成目录 overwrite / 其他目录 force），三种模式通用。**文档**：workspace/cli/generated-project/interactive/troubleshooting/README 同步 env、`/api` 联动、桌面内嵌与 `--force`。**验证**：`vp check` 绿、`vp test` **353 全绿**；Tier-2 `vue-monorepo` / `fullstack` PASS；全栈生成物 install→build→check→test、`dist:dir` 打包通过；`/api/todos` 直连与 Web 代理均 200；desktop 主进程 bundle 无外部 `api`/hono require，包含 `api/todos` 路由。

- **2026-11-11 端口环境变量 + 目标目录 git 提交/分支**：**端口**——根 `.env` 改为 `API_PORT=3030` / `WEB_PORT=8088`（`API_DEV_PROXY=http://localhost:3030`）；Hono workspace 配置按 `API_PORT`/`PORT` 顺序读取，Vue workspace 配置用 `WEB_PORT` 设 `server.port` + `strictPort`，全栈 Web script 恢复为 `vp dev`（端口由 envDir 加载的根 `.env` 决定）。**git 行为**——交互模式下目标目录已存在且位于 git 仓库内时，`Initialize a git repository?` 替换为 `Commit current project` / `Create and switch to a new branch` / `Do nothing`；commit 可输入信息（默认 `chore: scaffold <project>`，生成后 `git add` 当前项目并提交），branch 可输入名称（默认 `code4x/<project>`，写入前切换）；目标未创建但嵌套时保留 skip-init note。`writeProject` 在原子替换时备份并恢复目标 `.git`，避免强制覆盖把仓库元数据删掉。**验证**：`vp check` 绿、`vp test` **358 全绿**（新增 commit/branch e2e）；Tier-2 `vue-monorepo` / `fullstack` PASS；全栈生成物 install→build→check→test、`dist:dir` 通过。

- **2026-11-11 git 操作后的清空选项**：在目标已存在且在 git 仓库内、用户选择 Commit 或 New branch 后，追加确认 `Clear all existing project files? (.git is preserved)`。Yes：设置 `gitClean=true`，跳过后续 overwrite 提示，`writeProject` 以 force 语义清空并保留 `.git`；No：完全走原有 overwrite/force 流程（目标非空时继续确认）。效果：提交/切分支与清空解耦，`git` 仓库始终有效。**验证**：新增 e2e（旧文件被清空、`.git` 保留、提交信息生效）；`vp test` **359 全绿**。

hono 4.13.13 · @hono/node-server **2.1.5（待升级）** · zod 4.6.7 · hono-openapi 1.3.5 · @hono/swagger-ui 0.6.1 · pino 10.4 · hono-pino 0.10.3 · drizzle-orm 0.45.4 · vue 3.5.44 · vue-router 5.4.0 · pinia 4.0.3 · @vueuse/core 15.0.0 · @tanstack/vue-query 5.104.2 · @pinia/colada 1.4.9 · alova 3.5.5 · naive-ui 2.45.3 · element-plus 2.14.7 · shadcn-vue 组件栈（reka-ui 2.11.0 · class-variance-authority 0.7.1 · clsx 2.1.1 · tailwind-merge 3.7.0 · lucide-vue-next 1.0.0 · tw-animate-css 1.4.0，2026-10-15 核实） · tailwindcss 4.3.3 · unocss 66.11.0 · electron 44.7.2 · electron-builder 26.15.3 · electron-updater 6.8.9 · electron-store 12.0.0 · vite 8.3.4（Rolldown）
