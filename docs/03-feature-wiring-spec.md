# 03 · Feature Manifest 与组装点机制 —— 细化设计稿

> 性质：定稿候选（对应讨论 v1.1）。标注 **[LOD]** = Low-confidence Details（依赖生态 API 精确形状，实现 M1/M2 时核对）。
> 上游：[02-architecture.md](./02-architecture.md)；先例依据：[01-ecosystem-research.md](./01-ecosystem-research.md) §C-1。

## 0. 相对初稿的四点修正

1. **模板托管**：create-vite 全内置已被证实（`files: ["index.js","template-*"]`），维持「打包内置」决策。
2. **Prompt 库**：直接倾向 `@clack/prompts`（create-vite / create-vue / t3 / TanStack 皆在用），`@inquirer/*` 为备选；但「prompts 只是 Answers 的 UI、可整体替换」的架构下限不变。
3. **来源追踪**：吸收 TanStack attribution 实践，折叠进 `.code4xrc.json`（路径 → 来源 + hash），不单独造文件。
4. **排除 create-vite 的字符串 replace 反模式，但讲清差异**：我们同样有标记，但骨架文件是仓库内一等 TS 源、锚点是**行级双向声明**（AssemblySpec 声明的锚点 ↔ 骨架里的标记必须一一对应，缺 / 多 / 重复 = 构建期硬错误而非静默跳过），叠加走「区域贡献 + 有序渲染」而非对任意字符串打补丁，且有 golden + 幂等测试兜底。create-t3（程序化 addPackage）、TanStack（内存分步叠加）、Nx（虚拟 Tree）形态各异，共同教训一致：**共享文件必须经由受控合并与区域贡献，不能散装 patch**。

## 1. 核心 TS 类型草案（`domain/types.ts`，纯类型 + 无 I/O helper）

```ts
// ---------- 特性清单 ----------
export type FeatureId = string            // "hono/zod"; 注册表内必须全局唯一
export type FrameworkId = string          // "hono" | "vue" | ...

// 依赖是"存在性"约束，不含版本区间。理由：v1 CLI+模板+features 原子版本发布，
// feature 与 feature 不可能跨 CLI 版本共存，版本区间只会引入"两个候选满足约束"的顺序歧义。
// [OQ-4/OQ-1] 第三方插件若未来成为生态，再引入 ranges。
export type Requirement =
  | { kind: "framework"; id: FrameworkId }   // 必须匹配用户选择的框架
  | { kind: "feature";  id: FeatureId }      // 必须在(传递)选中集里

export type Answers = {
  projectName: string
  framework: FrameworkId
  features: FeatureId[]           // 用户显式勾选; resolve() 会补全依赖闭包
  packageManager?: "npm" | "pnpm" | "yarn" | "bun"
  install?: boolean
  git?: boolean
  preset?: string
}

// ---- 文件贡献 ----
export interface FileSpec {
  src: string                     // 相对 feature 目录; 目录 = 整目录 overlay
  dest: string                    // 相对项目根。v1: 字面量路径, 无插值
  when?: Condition                // 条件包含
  onCollision?: "error" | "identical-ok"   // 目录 overlay 撞已有文件: 默认 error
}

export type PackageJsonPatch = {
  dependencies?:    Record<string, string>  // 同包名不同 version → E-DEP-VERSION
  devDependencies?: Record<string, string>
  scripts?:         Record<string, ScriptEdit>
  fields?:          Record<string, unknown> // 顶层任意字段(description/engines/…)
}
export type ScriptEdit = { set: string } | { prepend: string } | { append: string }
// 唯一 key 被两个 feature set → E-SCRIPT-KEY; set 与任意 edit 同键 → 错误;
// append/prepend 按应用顺序(拓扑序+id tiebreak)与基线用 " && " 连接。
// fields: 跨贡献浅合并、确定性输出; 同名键不同值 → 硬错误, 复用 E-DEP-VERSION
// (既有「package.json 合并期同名键冲突标量」域名错误, exit 1)。

// ---- 组装贡献 ----
export type WiringBlock =
  | { kind: "import"; module: string; named?: string[]; defaultAs?: string; typeOnly?: boolean }
  | { kind: "call"; callee: string; expression: string }    // 单行: callee(expression)
  | { kind: "raw"; code: string }      // 多行逃生舱; lint 规则劝退, 评审必看

export interface WiringContribution {
  anchor: string                  // 必须在 FrameworkBlueprint.assembly 中声明, 否则 E-UNK-ANCHOR
  order: number
  when?: Condition                // 同一 feature 内互斥变体的写法
  block: WiringBlock | { src: string; bind?: Record<string, unknown> }
  //                              // 后者 = 片段文件(相对 feature 目录), 整段纳入; 多行主推这个
}

// 逻辑导出表: 跨 feature 引用不走裸路径, 走逻辑名(构建期校验目标 feature 存在且路径已产出)
export type Exports = Record<string, string>   // "userSchemas" → "src/schemas/user"

// 贡献体: base 为框架无关部分, targets 为分框架特化
export interface FeatureContribution {
  files?: FileSpec[]
  packageJson?: PackageJsonPatch
  wiring?: WiringContribution[]
  hooks?: { afterMaterialize?: Hook; afterInstall?: Hook }  // 仅留两个窄钩
  // 结构化 pnpm-workspace 策略: 目前只建模 allowBuilds(map 形状, pnpm ≥11)
  workspaceYaml?: { allowBuilds?: Record<string, true> }
}

export interface FeatureManifest {
  id: FeatureId                   // 前缀 = 框架 id 或 "common"(跨框架 feature)
  title: string; description: string
  requires?: Requirement[]
  defaults?: boolean              // prompt 里默认勾选
  group?: string                  // 互斥组(如 "vue/ui"); 同组多选 → E-CONFLICT
  exports?: Exports
  base?: FeatureContribution      // 框架无关(如纯 deps)
  targets?: Partial<Record<FrameworkId, FeatureContribution>>   // 分框架特化
}

// ---------- 框架蓝图 ----------
export interface FrameworkBlueprint {
  id: FrameworkId
  title: string
  assembly: AssemblySpec[]        // 本框架所有会被组装的文件(入口、vite.config 等)
  static: FeatureContribution     // 框架基线贡献(如 logger、默认 deps), 与 feature 同一通道
}

export interface AssemblySpec {
  path: string                    // "src/index.ts"
  skeleton: string                // 指向骨架文件; 骨架内含锚点标记注释
  anchors: Record<string, AnchorSpec>
}
export interface AnchorSpec {
  kind: "imports" | "list" | "single"
  single?: { default?: WiringBlock | { src: string } }   // 空 → 采纳基线; >1 命中 → E-SINGLE-SLOT
}

// 组装入口纯函数签名
export function resolve(answers: Answers, reg: Registry): Plan        // 校验+闭包+排序+冲突检测
export function render(plan: Plan,   reg: Registry): VirtualFile[]   // 纯内存文件树
```

要点：`render` 只吃 `Plan`（含原始 answers + 依赖闭包 + 锚点命中检查），不吃 fs / 网络；**同一 Plan 二次渲染字节级一致**是实现约束，不靠自觉。

### 1.1 项目上下文（`ProjectContext`，M4/M10）

环境事实以**纯数据**注入 `resolve`/`render`（`Plan.context` / 第三个参数），纯函数层不触碰 fs：

```ts
export type PmSource = "env" | "parent" | "default"
export interface HostWorkspace {
  catalog: Record<string, string>   // 宿主 pnpm-workspace.yaml 的默认 catalog: 映射
  allowBuilds: string[]             // allowBuilds map 的键（兼容 onlyBuiltDependencies 列表）
}
export interface ProjectContext {
  nestedWorkspace: boolean          // 目标位于既有 workspace 根之下
  pmFrom: PmSource
  host?: HostWorkspace              // 仅嵌套场景注入
}
```

- `host` 由 CLI 的 I/O 层（`src/io/workspace.ts`）读取宿主 `pnpm-workspace.yaml` 注入；解析用运行时依赖 **`yaml` ^2**（用户手写文件，不做手写匹配）。无法解析时降级为空宿主。
- **catalog-aware 版本（OQ-14）**：`render` 的 `package.json` 合并层在 `host.catalog` 命中**依赖名**时，把版本改写为 `"catalog:"`（`dependencies`/`devDependencies` 同等；仅按名，无别名）。
- **扫描范围**：`vue/tailwind` 依据 `context.nestedWorkspace` 选择 `@import 'tailwindcss' source('../')`（嵌套，钉在应用包根）或 `@import 'tailwindcss';`（standalone）。

## 2. 组装点（wiring）精确规格

### 2.1 锚点声明（框架侧）

骨架文件内标记语法（`templates/hono/files/src/index.ts`）：

```ts
// @code4x:begin imports
// @code4x:end imports
import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

// @code4x:begin middlewares
// @code4x:end middlewares

// @code4x:begin routes
// @code4x:end routes

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`listening on http://localhost:${info.port}`)
})
```

合法性规则（与 create-vite 式脆弱 replace 的分界）：标记**必须是完整独占行**、begin/end 必须配对、每个 AssemblySpec 声明的 anchor 在其骨架里恰好出现一次、未声明标记出现即报错。**跨锚点的语义顺序（中间件先于动态路由）由骨架洞位表达，`order` 只在锚点内部裁决**——避免"用 order 数值编码全局语义"的失控。

`single` 锚点用例：若某集成需要把 `new Hono()` 换成 class 包装（如 `@hono/zod-openapi`），装配不是加一行而是换基准块——`single` 锚点 + 蓝图提供 `default` 块，feature 贡献整段替换。**[LOD]** 该机制是否实际启用取决于 swagger 生态选型（见 §5 OQ-7）。

标记支持三种语法（均为完整独占行，共享同一校验语义）：JS 行注释 `// @code4x:begin <anchor>`、块注释 `/* @code4x:begin <anchor> */`（用于 `.css` 等只支持块注释的骨架）与 HTML 注释 `<!-- @code4x:begin <anchor> -->`（用于 `.vue` / `.html` 骨架）。`parseSkeleton`（`render.ts:44`）的 `MARKER` 正则识别这三种前缀/后缀，整行独占是硬约束。

> 锚点命名作用域提示：锚点名在整个 blueprint 内全局唯一（`collectHits` 按名字跨贡献收集，不区分 assembly）。因此同名锚点不能出现在两个 assembly 中——如 `src/main.ts` 已占用 `imports`，`vite.config.ts` 的顶层 import 锚点须用 `vite-imports`（本次实现即如此）。

### 2.2 block 排序与 tie-break

- 锚点内排序键 = `(block.order, featureTopoRank, feature.id 字典序)`，全稳定（无时钟、与对象 key 顺序无关）。
- 跨 feature 的顺序诉求一律上提到 **feature 级 `requires`** 消化为 topoRank，不给 block 级依赖直通车。
- 同锚点渲染结果中**不同贡献块之间**重复语句 → `E-STMT-DUP`（单个多行 `raw` 块内的重复行允许，见 §2.8）；`imports` 锚点则必须去重聚合（正常形态）。
- blueprint `static` 的 `rank = -1`，同 `order` 下先于所有 feature 渲染（`render.ts` 排序键第二项）。

**全局 `order` 预留表（约定，非代码强制）**：`order` 只在锚点内部裁决；跨锚点语义顺序仍由骨架洞位表达。为避免各 feature 手挑魔数，采用下列数值区间：

| 区间 | 用途 |
|---|---|
| `-10` | pre-*（必须先于基线插件的插件/中间件，如先于 `vue()` 的 `vue-router/vite`；亦用于「先于业务路由挂载」的基座健康路由） |
| `0` | 基座（blueprint `static`；各框架默认值） |
| `10-19` | 安全（CORS / secure-headers / CSRF） |
| `20-39` | 限流 / 硬化（rate-limit / timeout / body-limit / compress） |
| `40-49` | 错误处理（`error-handlers`） |
| `50+` | 业务（路由、文档端点等） |

现有实现与此表一致：swagger 用 `50/51`，api-guard 用 `10/11`，hono 基座 `requestId`=0 / logger=1 / health=-10，`hono/http-hardening` 用 `20/21/22`。

### 2.7 M7 锚点与 feature wiring 记录
Hono blueprint（M7）新增/使用的锚点（全部全局唯一）：

| 锚点 | 所属 assembly | kind | 贡献方 |
|---|---|---|---|
| `error-handlers` | `src/index.ts` | `list` | 基座 static（`app.onError` + `app.notFound`）；预留 `hono/errors` 类扩展 |
| `vite-config-extra` | `vite.config.ts` | `list` | `hono/testing` 的 `test` 块 |
| `routes` | `src/index.ts` | `list` | 基座 health（order -10）+ `hono/zod`（0）+ swagger（50/51） |

feature wiring 摘要：

- `hono/logging`：`imports` 注入 `./logger`，`middlewares` order 1 注入 `app.use(logger)`；基座 static 的 `hono/logger` import 与 `app.use(logger())` 均加 `when: (a) => !a.features.includes("hono/logging")` 以实现「替换基座块」（`render` 对 static wiring 求值 `when`，条件看到解析后闭包）。
- `hono/http-hardening`：`imports` 注入内置 `hono/timeout`/`hono/body-limit`/`hono/compress`，`middlewares` order 20/21/22。
- `hono/testing`：`vite-config-extra` order 0 注入 `test: { include: ['src/**/*.test.ts'] }`；文件 `src/app.test.ts` 走 `module` 内 `app.request()`（无运行时依赖，`vite-plus/test` 由 vp 工具链提供）。
- `hono/env`：仅文件贡献 `src/env.ts`（standalone），**不接入** `imports`——避免向 entry 注入未使用 import（生成项目 `vp check` 的 `no-unused-vars` 会失败）。`requires: hono/zod`。
- `hono/zod`：文件贡献 `src/http/validation.ts`（共享 `validationHook`），`imports` 注入 `./http/validation`；两条路由变体（普通 / swagger）均以 `defaultHook` 位置传入该 hook，使校验失败返回基座同款信封（`{ code: 'VALIDATION', message, details: issues, requestId }`，HTTP 400）。
- 静态文件不可被 feature 替换（`E-FILE-WRITE`）：错误模型与健康路由因此作为 blueprint static（内容随基座走），而非可替换的 feature。

### 2.8 M8a 锚点与 feature wiring 记录（Vue）

Vue blueprint（M8a）锚点（全部全局唯一）：

| 锚点 | 所属 assembly | kind | 贡献方 |
|---|---|---|---|
| `imports` | `src/main.ts` | `imports` | 基座无；`vue/pinia`、`vue/router`、`vue/i18n`、`vue/query`、`vue/colada`、`vue/unocss`（`virtual:uno.css` 副作用 import） |
| `app-use` | `src/main.ts` | `list` | `vue/pinia`、`vue/router`、`vue/i18n`、`vue/query`、`vue/colada` |
| `vite-imports` | `vite.config.ts` | `imports` | UI/CSS/i18n 插件 import（`vue/tailwind`、`vue/unocss`、`vue/naive-ui`、`vue/element-plus`、`vue/i18n`） |
| `vite-plugins` | `vite.config.ts` | `list` | 基座 `vue(),`；上述插件注册 |
| `app-template` | `src/App.vue` | `list` | `vue/router`（`<router-view />`）、`vue/i18n`（`$t` 示例）、`vue/naive-ui`（`<n-config-provider>` + `<n-button>`）、`vue/element-plus`（`<el-button>`） |
| `css-imports` | `src/style.css` | `list` | `vue/tailwind`（`@import 'tailwindcss';`） |

补充说明：

- **无 `vite-plugins-pre` 锚点**：基座保留经典 `createRouter`（非 `vue-router/vite` 文件路由），没有任何随 M8a 发布的插件必须先于 `vue()`；因此不引入该锚点。
- **`@/` 别名**：`tsconfig.json` 用 `paths`（**无 `baseUrl`**——TS7/tsgolint 已移除；`paths` 自 TS 4.1 起相对 tsconfig 解析）声明 `@/* -> ./src/*`，`vite.config.ts` 用 `resolve.alias`（`fileURLToPath(new URL('./src', import.meta.url))`）在打包期对齐；模板 devDependencies 增 `@types/node`。
- **`src/style.css` 升 assembly**：静态文件改为 `files/src/style.skeleton.css`（顶部 `/* @code4x:begin css-imports */` … `/* @code4x:end css-imports */` 区域），零 CSS 引擎时渲染结果与升级前字节一致；`@import` 必须位于文件最前，区域置于顶部。
- **`E-STMT-DUP` 语义收敛**：只在**不同贡献块之间**判重；单个贡献的多行 `raw` 块内允许重复行（`vue/element-plus` 的 `AutoImport`/`Components` 各有一行相同的 `ElementPlusResolver({ importStyle: 'css' })`，属合法形态，`render.ts` 的 `list` 渲染为此保留局部去重）。
- **裸 token 的框架优先解析**：`qualifyFeature(token, known, framework)` 在裸 token 跨框架共用时（如 `testing` = `hono/testing` | `vue/testing`）优先选中 `--framework` 对应项；仍在同框架内多重命中时才 `E-AMBIGUOUS-LIST`。
- **UnoCSS 入口形态**：`virtual:uno.css` 经 `src/main.ts` 的 `imports` 锚点以 **JS 副作用 import** 注入，而非 CSS `@import`——rolldown-Vite 8 下 CSS `@import 'virtual:uno.css'` 解析失败（`[postcss] ENOENT`），JS 导入正常。
- **`vueuse-router` 独立文件**：提供 `src/composables/useRouteQuery.ts` 而非向入口注入未使用 import（会触发生成项目 `vp check` 的 `no-unused-vars`），与 `hono/env` 同策略。
- **`vue/testing`**：devDeps `vitest` + `@vue/test-utils` + `happy-dom` + `test: "vp test"` + `src/App.test.ts` 模板资产。模板测试经**文件级** `// @vitest-environment happy-dom` 注解选择 DOM（无需新增 vite-config `test` 锚点/区域），并 `mount` 一个**内联组件**（仅依赖 `vue`），因此无论 preset 是否装了 router/i18n/UI 套件都开箱可跑。
- **`vue/query` 的 install 放行**：`@tanstack/vue-query` 传递依赖 `vue-demi`（带 postinstall），经 `workspaceYaml.allowBuilds: { "vue-demi": true }` 写入生成 `pnpm-workspace.yaml`，避免 `ERR_PNPM_IGNORED_BUILDS`。

### 2.9 M8b 锚点与 feature wiring 记录（shadcn-vue）

Vue blueprint（M8b）在 M8a 基础上新增一个锚点（全局唯一）：

| 锚点 | 所属 assembly | kind | 贡献方 |
|---|---|---|---|
| `app-script` | `src/App.vue`（`<script setup>`） | `imports` | `vue/shadcn-vue` |

`css-imports`（`src/style.css`）新增一个贡献方：`vue/shadcn-vue` 的 theme 块（order `10`，紧接 `vue/tailwind` 的 order `0`）。

feature wiring 摘要：

- `vue/shadcn-vue`：`requires [{framework vue}, {feature vue/tailwind}]`；`group: vue/ui`。
  - `css-imports` order 10 → 片段文件 `fragments/theme.css`（shadcn-vue manual-install 原文：`@import 'tw-animate-css';` + `@custom-variant dark (&:is(.dark *));` + `:root`/`.dark` oklch 变量 + `@theme inline {}` + `@layer base {}`）。order 10 > tailwind 的 0，保证所有 CSS `@import` 位于文件最前；CSS 组互斥保证 `css-imports` 不会同时出现两个引擎。
  - `app-script`（`imports`）→ `Button`（`@/components/ui/button`）、`Card`/`CardContent`/`CardDescription`/`CardHeader`/`CardTitle`（`@/components/ui/card`）、`Input`（`@/components/ui/input`）。
  - `app-template`（order 0）→ `<Card>` 演示（含 `<CardHeader>`/`<CardTitle>`/`<CardDescription>`/`<CardContent>`/`<Input>`/`<Button>`）。
  - 文件贡献：`components.json`、`src/lib/utils.ts`、`src/components/ui/{button,card,input}/**`（registry `new-york` 源码，仅归一化引号）。
  - 依赖：`reka-ui ^2.11.0`、`class-variance-authority ^0.7.1`、`clsx ^2.1.1`、`tailwind-merge ^3.7.0`、`lucide-vue-next ^1.0.0`、`@vueuse/core ^15.0.0`（与 `vue/vueuse` 同串），dev `tw-animate-css ^1.4.0`。

- **`app-script` 锚点动因**：`vue/naive-ui` / `vue/element-plus` 组件由 `unplugin-vue-components` resolver 自动注册（模板内直接写标签即可）；shadcn-vue 是 copy-paste + 显式 import，`App.vue` 演示组件必须在 `<script setup>` 内 import。新增 `imports` kind 锚点承载这些 import；空集时零输出，基座 `App.vue` 字节不变（`vue.test.ts` golden 未被破坏）。
- **互斥归属**：`vue/shadcn-vue` 归 `vue/ui`（与 naive-ui/element-plus 互斥），理由是三者争同一「主组件体系」槽位；与其它 UI 栈混用会叠加两套 preflight / 样式 / 装配模型（显式 import vs resolver 自动导入），非合理默认。
- **requires 的双重作用**：`requires vue/tailwind` 既满足 shadcn 的 Tailwind 原生依赖，也使「shadcn + unocss」经闭包同时命中 `vue/css` 两个成员 → `E-CONFLICT`（同组互斥的合理结果）。
- **静态文件不可替换**：`components.json` 与组件源码由 feature 独占贡献（无 blueprint 同路径文件）；主题走 assembly（`css-imports`），不直接写 `src/style.css`。

### 2.3 渲染确定性

- imports 聚合：同模块多次贡献 → named 集排序合并；`defaultAs` 冲突 → `E-IMPORT-CONFLICT`；type 与 value 并存输出两行，行内命名排序。
- 输出形态：按模块路径字典序，相对导入（`./`、`../`）统一排尾（简写规则，golden 锁定）。
- 空集干净输出：空区域渲染为"零行"，相邻空行收缩为最多一行。
- **不跑 prettier 钩子**；目标 = 排序 + 缩进正确 + golden 审查。
- 单文件变量插值仅由 blueprint 以 `{PROJECT}` 占位符承担（`package.json.name`）；feature 文件 v1 一律 verbatim 拷贝（无 EJS）。

### 2.4 冲突检测（构建期硬错误枚举）

| 错误码 | 判定条件 |
|---|---|
| `E-CYCLE` / `E-MISSING-REQ` | requires 图有环 / 选了框架外或未选闭包内的 feature |
| `E-UNK-ANCHOR` | wiring.anchor 未在蓝图 assembly 里声明 |
| `E-MARKER` | 骨架缺标记 / 重复标记 / 未声明标记 |
| `E-FILE-WRITE` | 两个内容不同的贡献写同一 dest；或写到骨架/蓝图专属路径（`identical-ok` 例外） |
| `E-DEP-VERSION` | 同 package 不同 version 串（仅相同字符串静默）；亦用于 `package.json#fields` 同名键不同值 |
| `E-SCRIPT-KEY` | scripts 相同键非 `append` 型写两次 |
| `E-CONFLICT` | 同一非空 `group` 选中多个成员（usage 错误，exit 2；`fix:` 列出候选） |
| `E-IMPORT-CONFLICT` / `E-STMT-DUP` | 见 §2.3/§2.2 |
| `E-SINGLE-SLOT` | `single` 锚点命中 >1 块 |
| `E-PLUGIN-WRITE` | hooks 尝试写自身 feature 沙盒范围外的路径 |

全部在 CI 离线全组合结算层（Tier-1）即可抓到，**不需要先跑 install**。

### 2.5 幂等性

`render = f(plan, registry)` 纯函数 ⇒ "同输入双渲染字节等价"零成本获得，直接写成 property-based 测试。增量题（add-to-existing）另需：生成文件 sha256 存入 `.code4xrc.json`，v1.5 重放时先做 drift 检查。**v1 不做重放写入，但 sha 表现在就写。**

### 2.6 Tier-1 组合矩阵

离线、无需 `pnpm install` 的组合验收层（`docs/06` §0 验收 #1 / §M6），落在 `packages/create-code4x/tests/matrix.test.ts`。它**从运行时注册表 `loadRegistry()` 现场枚举**组合——没有手写清单、没有注册表快照——所以新增 feature / `group` 会被自动纳入覆盖。

覆盖范围：

- 每个框架的**零 feature 基座** + **全部单 feature 选择**（单 feature 即「某 group 恰好选一个」的形态）。
- 每个非空 `group`：单成员是合法选择；另取两个成员作为**互斥探针**，断言 `E-CONFLICT`（usage 退出码 2，`fix:` 列出成员）。
- **成对组合**（pairwise）：跳过会冲突的 pair；每条 pair 断言 `resolve()`+`render()` 成功。互斥判定直接复用 `resolve()` 消费的 `groupConflicts()`，输入取自各 manifest 的 `group` 字段——**互斥规则与矩阵同源生成**（`docs/06` 验收 #1）。
- 每个组合断言：`resolve()`+`render()` 成功、输出无 `@code4x` 标记、每个路径只写一次、同一组合二次渲染**字节级一致**（幂等）。
- 成对组合按框架限量（`MAX_PAIRWISE_PER_FRAMEWORK = 64`，确定性等距取子集），保证总渲染量在低数百、数秒内完成；基座 / 单 feature / 互斥探针不受此上限影响。

运行方式：在 `packages/create-code4x` 下 `vp test` 跑全量；按文件过滤用 `vp test tests/matrix.test.ts`。

**明确非目标**：不装依赖、不联网、不 spawn CLI（安装 / 构建 / 冒烟属 Tier-2/3）；`.code4xrc.json` 的来源与哈希属 I/O 层，不在本矩阵断言范围。

## 3. 目录结构与 `.code4xrc.json`

```
packages/cli/src/
  domain/{types,registry,resolve,render,pkgjson}.ts   # 纯函数
  io/{write,pm,git,prompts}.ts                        # 副作用, 薄
templates/
  hono/
    blueprint.ts
    files/  src/index.skeleton.ts  package.json  tsconfig.json  _gitignore  ...
  vue/
    blueprint.ts
    files/  src/main.skeleton.ts  vite.config.skeleton.ts  ...
features/
  hono/
    zod/            manifest.ts  files/src/schemas/user.ts
    swagger-openapi/ manifest.ts  files/src/docs/spec.ts
    api-guard/      manifest.ts                      # 纯 wiring feature, 无 files
  vue/
    pinia/          manifest.ts  files/src/stores/counter.ts
    router/         manifest.ts  files/src/router/index.ts
  common/ README.md                                  # 预留给 targets 型跨框架 feature
presets/{hono-api,vue-full}.ts
```

`.code4xrc.json`（generate 时写入）：

```json
{
  "generator": { "cliVersion": "0.1.0", "preset": null },
  "answers": {
    "projectName": "foo-api", "framework": "hono",
    "features": ["hono/zod", "hono/swagger-openapi"],
    "packageManager": "pnpm", "install": false, "git": true
  },
  "plan": {
    "features": ["hono/zod", "hono/swagger-openapi"],
    "sources": { "src/index.ts": "assembly", "src/schemas/user.ts": "hono/zod" },
    "hashes": { "src/index.ts": "c8f...e91", "package.json": "1bd...44a" }
  },
  "context": { "nestedWorkspace": true, "pmFrom": "env",
    "host": { "catalog": { "vue": "^3.5.0" }, "allowBuilds": ["esbuild"] } },
  "workspace": {
    "requiredAllowBuilds": ["esbuild", "vue-demi"],
    "missingAllowBuilds": ["vue-demi"],
    "catalogRewrites": ["vue"]
  }
}
```

`plan.features` 是「解析后闭包」（显式勾选 + 被依赖带入）；复刻重现用它。`context.host` 与 `workspace` 仅在**嵌套场景**出现：`host` 是注入渲染的宿主数据（复现用），`workspace` 是 diff 结果（`requiredAllowBuilds` 为全部必需项；`missingAllowBuilds` 为宿主缺失项，即 stderr 提示与后续补全的依据；`catalogRewrites` 为被改写为 `"catalog:"` 的依赖名）。

## 4. 端到端走查（渲染期目标产物）

### Hono（vp 原生，2026-10-13 升级）

`{base}` → `src/index.ts`：

```ts
import { Hono } from 'hono'
import { logger } from 'hono/logger'      // ← blueprint.static 贡献

const app = new Hono()
app.use(logger())

export default app
```

模板另含静态 `vite.config.ts`：`@hono/vite-dev-server`（`vp dev`）+ `@hono/vite-build/node`（`vp build` → `dist/index.js`）；`serve` 由插件注入，源码不再自行 serve（避免双起）。scripts：`dev=vp dev`、`build=vp build`、`start=node dist/index.js`；`PORT` 在 dev 为运行时读取、在 build 时固化进产物；生成项目 `vp check` 开箱通过（lint/fmt/typeCheck 已配置）。

`{base + hono/zod}`：只多一行 import + 一条 validated route，`src/schemas/user.ts` 单独落盘：

```ts
import { CreateUserSchema } from './schemas/user'
// routes: app.post('/auth/register', zValidator('json', CreateUserSchema), (c) => c.json({ ok: true }))
```

`{base + zod + swagger-openapi}`（swagger `requires` zod，topoRank 保障写序）：按选型走中间件式（`hono-openapi`）——`app.get('/openapi.json', openAPIRouteHandler(...))` 等；`spec` 片段来自 `./docs/spec`。**[LOD]** 包名/函数名按实现时生态核对。

`{base + api-guard, zod 未选}`：cors/secureHeaders import + 两条 `app.use(...)`，**无 zod 痕迹**。

### Vue

`{base}` `src/main.ts`：

```ts
import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
const app = createApp(App)
app.mount('#app')
```

`{base + pinia}` / `{+ pinia + router}`：逐条插 `app.use(createPinia())` / `app.use(router)` + `import router from './router'`；`vite.config.ts` 为第二个 assembly（`vite-plugins` 锚点，blueprint static 贡献 `vue()`）、`src/App.vue` 为第三个 assembly（`app-template` 锚点，router 注入 `<router-view />`）、`src/style.css` 为第四个 assembly（`css-imports` 锚点，CSS 引擎注入 `@import`）。排序关键点：pinia < router 由 id tiebreak 固定，**与用户勾选顺序无关**——同一组合、不同选择轨迹生成**相同字节**（确定性演示）。M8a 追加：`vue/i18n` 经 `imports`/`app-use`/`app-template`/`vite-imports`/`vite-plugins` 接入；UI 套件（`vue/ui`）与 CSS 引擎（`vue/css`）同组互斥；数据层（`vue/data`）二选一。生成项目 **`vp check` 开箱通过**（vite.config 内置 lint/fmt/typeCheck 配置，`defineConfig` 来自 `vite-plus`）；`dev`/`build` 仍走 plain `vite` 链（vp 深度集成留待后续评估）。

### 复用论证：同一 manifest 抽象如何跨框架

v1 没有任何具体 feature 真正跨框架（pinia 天生 vue-only，zod-validator 天生 hono-only）。复用的是**抽象整层**：resolve/render/merge 引擎、wiring 语义、错误枚举，对两个框架零特化。per-framework 特化收敛在两处：① 框架自己的 `blueprint.assembly` 锚点集；② 跨框架 feature 的 `targets[frameworkId]` 分片。判断：**特化收敛在"贡献体"粒度，不渗入引擎**——引擎保持单份。诚实备注：v1 不为 targets 机制造真实用户（tailwind/sentry 未进首发行列），该契约靠单测假数据先行验证（OQ-6）。

## 5. 开放问题定案状态

| # | 问题 | 定案 |
|---|---|---|
| OQ-1 | `requires` 版本区间 | 不引入（留第三方插件时代） |
| OQ-2 | 生成后跑 prettier | 不跑 |
| OQ-3 | feature 文件变量插值 | v1 verbatim；`package.json.name` / README 两个特例 |
| OQ-4 | sha256 写盘 | 写 |
| OQ-5 | 骨架锚点 vs 整库 EJS | 维持骨架 + 锚点 |
| OQ-6 | `common/*` 跨框架通道 | schema 进、真实例不进 v1（mock 验证） |
| OQ-7 | `single` 槽 v1 启用 | 机制保留；倾向中间件式 → 暂不启用（`hono-openapi` 1.3.5 vs `@hono/zod-openapi` 1.6.3，均已核实存在） |

## 6. 落地建议（M0 起点）

先把 §1 类型置为 `domain/types.ts` 定稿种子；给 `{hono/zod, hono/api-guard}` 写 §2.4 错误码的失败用例驱动（TDD），再拼 render；骨架锚点语义靠 `E-MARKER` 尽早锁死——这是整个机制最富挑战的边缘。
