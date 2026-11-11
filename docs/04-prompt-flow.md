# 04 · 交互问题流 + 参数映射

> 性质：定稿候选（v1.2）。`[LOD]` = 需生态核对；`[前提修正]` = 对前稿的修订。
> 前提：OQ-1~7 已固化；**prompts 只是 Answers 的 UI**；英文文案 v1（所有文案集中到单一 copy 常量文件，按 i18n 形状组织，但不实现多语言）。
> 相对 03 的类型增补：`Answers` 新增 `targetDir`（项目目录；`projectName` 为归一化后的 package name），并预留 `variant?: "ts"` 字段（仅 `"ts"` 合法，v1 不实现变体逻辑）。

## 1. 问题流状态机

### 1.1 全局不变量（先于一切节点）

- **I1 零副作用分界**：prompt 阶段（含 Ctrl-C）绝不触碰文件系统（读 env / detect 除外）。落盘只在 Answers 完整 + resolve + render 之后（配合 staging + rename）。
- **I2 prompts 层不持有状态**：每个节点是否发出 = `isBound(field)`，绑定值直接来自解析后的 `Partial<Answers>`；clack 回调闭包里不藏任何逻辑。交互会话结束时得到完整 `Answers`，与全 flag 路径得到的**同构**。

### 1.2 流程图

```
P0 预检（非交互层）
 ├─ 解析 argv → Partial<Answers> + 控制位（--yes/--CI/--interactive/--config/--preset/--overwrite/--dry-run）
 ├─ 配置文件、preset 展开、env 模式探测（CI / agent-detect / user-agent → PM 默认值）
 ├─ 未知 flag / 值非法 / 重复互斥 → 按 §3 规则处理
 ├─ TTY 且非 CI/agent 且未 -y → 进入交互节点流 N0..N7（仅未绑定字段）
 └─ CI/agent/-y → 跳过全部提问，缺失字段取默认（projectType = standalone）
D 域校验（resolve() 的 STEP-a）：依赖前缀匹配 / 闭包 / 冲突 / E-MISSING-REQ
 └─ 通过 → 打印一行 manifest → render → 写盘 → PM/安装/git → 收尾文案
```

**交互判定（实现语义）**：`interactive = 显式 --interactive/--no-interactive ?? (!CI && isTTY)`；`-y/--CI` 强制非交互；**非交互模式下缺失字段取默认**（仅 `targetDir` 缺失 → `E-DIR-REQUIRED`）。

### 1.3 节点定义

| # | 节点（Answers 字段） | 触发条件（要问） | 跳过条件（已绑定） | 默认值 | 绑定来源 |
|---|---|---|---|---|---|
| N0 | projectType | 未绑定 | `--monorepo` / `--fullstack`（及 `--no-*`）/ config `monorepo` / `fullstack` | `standalone` | flag > config；交互内选择 |
| N1 | targetDir（→ projectName 派生） | 无 positional | positional 已给 | 普通目录：placeholder `./my-app`（framework 已绑定则 `./hono-api`；monorepo 为 `./my-workspace`）；workspace 内：扫描 packages 的父目录选项 + `Custom folder…`，再问项目名 | 仅 positional；workspace 选项来自 `readWorkspaceLayout` |
| N2 | framework | 未绑定 | `--framework` 合法 / preset 隐含 / features 单框架可推断 | 选项序 [Hono, Vue]，非交互默认 Hono | flag > config > preset > feature 推断 |
| N2b | appName（仅 monorepo，→ projectName/workspaceName） | monorepo 且未绑定 | `--app` / config `appName` | 按框架取 `api` / `web` / `desktop` / `app` | flag > config；交互内输入 |
| N3 | variant | **v1 不存在此问题**（见 1.4） | — | — | Answers 预留 `variant?: "ts"` |
| N4 | features | framework 已定且该框架有可选 feature | `--features` 显式给出（含 `none`）/ preset 隐含 | 无预选；Vue 分步见 §2.1 | flag > config > preset |
| N5 | packageManager | 未绑定 | `--pm` 合法 | user-agent 探测结果；失败默认 `npm`；monorepo 固定 `pnpm`（不问） | flag > config；探测只产默认值 |
| N6 | install | 未绑定 | `--install/--no-install` 或已 -y | false | flag |
| N7 | git | 目标已存在且在 repo 内：Commit / New branch / Do nothing；目标未创建但嵌套：不发问，自动 no + note；否则 init 确认 | `--git/--no-git` 或已 -y | true | flag + targetGit/嵌套检测 |

**跳过粒度**：某字段「已提供」= P0 结束后以**合法值**绑定；非法值不算绑定（走 §3.4 分支）。`--framework vue` **只跳 N2，features 照问**——框架与 features 是独立维度，无膨胀推断；要一次性全定，用 `--yes` / `--preset`。

### 1.4 variant 裁决：v1 = TS-only + node-only

- **vue 的 TS/JS**：砍。杀手论证是自家约束——OQ-3 定 feature 文件 verbatim，JS 变体无法派生（每个 feature 文件都要手工双份，M×N 矩阵翻倍），而目标用户几乎不需要 JS。出口保留：这是「加一个 variant」的增量工程，不伤 AssemblySpec。
- **hono 的 runtime 变体（node/bun）**：砍，但定位为**第一个待加的变体**：bun 差异集中在骨架的 `serve` 尾巴（`@hono/node-server` vs `Bun.serve`），是骨架级而非 feature 级差异；未来在 FrameworkBlueprint 内做 per-variant skeleton，feature wiring（zod 等）不用动。**[LOD]**
- `variant` 字段预留（仅 `"ts"` 合法），纯粹为了让 config 文件未来向后兼容；**勿实现变体逻辑**。

## 2. 各问呈现（文案级）

### N1 目录

普通目录：

```text
┌  Project directory
◆  Where should we create your project?
│    placeholder: ./my-app
│  选中后: ✔ Project name (package.json): hono-api   ← 仅在发生归一化时显示
└
```

默认值策略：框架未知时中性 `./my-app`；若 `--framework`/preset 已绑定再进入交互，placeholder 升级为 `./hono-api`。不用序号后缀——目录存在性走 §5 冲突流程，不赌文件系统。

**当前目录位于 workspace 内**（`readWorkspaceLayout(io.cwd)` 向上找到 `pnpm-workspace.yaml` 或 `package.json#workspaces`）：

```text
◆  Where should we create your project?
│  ● apps/       — matches apps/*
│  ○ packages/   — matches packages/*
│  ○ Custom folder… — enter a path relative to the workspace root
└
◆  Project name  (my-app)
```

- 选项只从「glob 为最后一段」的 pattern 派生（`apps/*`、`packages/**`、根级 `*`）；精确路径与复杂 glob 走 `Custom folder…`。
- 选项的 `relativeDir` 由 `relative(cwd, resolve(workspaceRoot, dir))` 计算，因此 cwd 位于 workspace 子目录时仍生成正确路径。
- 自定义输入相对 workspace 根解析（也接受绝对路径）；空输入回落第一个选项目录。
- `partial.projectName` 已绑定时跳过项目名提问；否则目录名 = 项目名原始输入，package name 仍按 §5④ 归一化。

### N2 框架

```text
◆  Which framework?
│  ● Hono    — Ultrafast web framework; Node/edge, great for APIs
│  ○ Vue     — Progressive SPA framework; batteries via Pinia / Router
└  (交互强制显式选择，不设初始值；非交互/--yes 默认 = Hono)
```

### N2b 应用名（仅 monorepo）

```text
◆  Application name (directory under apps/)
│    placeholder: web
└  归一化后 → package name；workspace 根包名由目标目录名归一化
```

### N4 features（multiselect）

```text
◆  Optional integrations for Hono  (space 切换 / a 全选 / enter 确认；可全不选)
│  ○ [ ] API guard      — secure-headers + CORS boilerplate
│  ○ [ ] Zod validation — typed request validation (adds zod, @hono/zod-validator)
│  ○ [ ] OpenAPI docs   — spec + UI at /openapi.json  (includes Zod validation)
└
```

#### 2.1 Vue 引导式分步（`promptSections`）

Vue blueprint 声明 `promptSections`，feature 通过 `promptSection` 归组；交互依次渲染：

| 步骤 | 章节 | 形态 | 成员（含默认） |
|---|---|---|---|
| 1 | `Vue ecosystem` | multiselect | pinia / router / vueuse（默认）/ vueuse-router / testing |
| 2 | `Request strategy` | select + None | alova / colada / query |
| 3 | `UI framework` | select + None | reka-ui（默认）/ naive-ui / element-plus / shadcn-vue |
| 3 | `CSS engine` | select + None | tailwind（默认）/ unocss |

- 选择 `shadcn-vue` 时自动带入 `vue/tailwind` 并跳过 CSS 问题（避免闭包与 unocss 冲突）。
- 每步选择后立即检查 `group` 冲突；冲突则 note + 重问当前步骤。
- 未归组的 feature 落到末尾 `Other integrations` 多选；无 `promptSections` 的框架保持单次多选。

#### 2.2 全栈快捷模式（N0 = fullstack）

选择 **Full-stack project**（或 `--fullstack`）后跳过 N2/N2b/N4/N5，固定生成：

| 应用 | 框架 | 默认能力 | dev |
|---|---|---|---|
| `apps/api` | Hono | `hono-full`（api-guard + zod + testing + swagger-openapi + logging + http-hardening） | 3030 |
| `apps/web` | Vue | router + pinia + vueuse + vueuse-router + testing + reka-ui + alova + unocss | 8088 |
| `apps/desktop` | Electron | electron/builder | 5173 |

- 固定 pnpm；`--framework` / `--features` / `--preset` / `--app` → `E-CONFLICT`。
- 根 `package.json` 提供 `dev`/`build`/`check`/`test`/`preview` 与 `dev:api`/`dev:web`/`dev:desktop`。
- `.code4xrc.json` 的 `stack.apps` 记录三端计划；`plan.features` 为三端闭包并集。
- Web 默认 8088、API 默认 3030（根 `.env` 的 `WEB_PORT` / `API_PORT`），避免与 Electron 固定渲染器端口 5173 冲突。

呈现决策：**不用 groupMultiselect**（框架已定，选项天然单组；超 ~7 项再考虑分组）；`required: false`；**不把 requires 闭包预填进 selection**——UI 只反映用户勾选，swagger 的 hint 写明 "includes Zod validation"，闭包在 resolve() 补齐并在 summary 行标注 `<hono/zod (required by swagger)>`。这保住「prompts 是 UI」：`Answers.features` = 用户原始勾选，`.code4xrc` 同时存 explicit 与 resolved 两份。

### N5 / N6 / N7（短问）

```text
◆  Package manager   options [pnpm] npm / [npm] yarn / …（默认 = 探测结果；失败提示 "detected: none → npm"）
◆  Install dependencies?         (Y/n)  hint: pnpm install          — default: No
◆  Initialize a git repository?         hint: creates .git + initial branch — default: Yes
```

目标目录**已存在且位于 git 仓库内**时，`Initialize` 换成：

```text
◆  This directory is already in a git repository
   › Commit current project            hint: git add + commit after generation
     Create and switch to a new branch hint: before writing generated files
     Do nothing                        hint: keep current branch/working tree
◆  Commit message / New branch name    （可空，取默认值）
◆  Clear all existing project files?   (y/N)  hint: keeps .git; No = normal overwrite flow
```

**提问语言：英文 v1**。受众与 agent/CI 语境皆为英文；文案集中到单一 copy 常量文件（每 key 一条），未来 i18n = 换字典文件，不引入运行时 i18n 库。

## 3. 参数映射（契约核心）

### 3.1 映射表

| 字段 | flag | 短 | 取值 | 示例 |
|---|---|---|---|---|
| targetDir | 位置参数 | — | 相对/绝对路径 | `create-code4x my-api` |
| projectType | `--monorepo` / `--fullstack`（及 `--no-*`） | — | boolean；config 键 `monorepo` / `fullstack` | `--monorepo` / `--fullstack` |
| appName | `--app` | — | monorepo 应用目录名 | `--app web` |
| framework | `--framework` | `-f` | `hono\|vue` | `-f vue` |
| features | `--features` | — | 逗号列；裸名或全限定名；`none` 清空 | `--features zod,swagger-openapi` |
| preset | `--preset` | `-p` | `hono-api\|hono-standard\|hono-full\|vue-full` | `-p hono-standard` |
| packageManager | `--pm` | — | `npm\|pnpm\|yarn\|bun` | `--pm pnpm` |
| install | `--install/--no-install` | — | boolean | `--install` |
| git | `--git/--no-git` | — | boolean | `--no-git` |
| 全默认 | `--yes` / `--CI` | `-y` | — | 同义 |
| 强制交互 | `--interactive` | — | 覆盖 CI/agent clamp | |
| 配置 | `--config <file>` | — | JSON | |
| 别名 | `--template <name>` | — | 见下 | `--template vue` |
| 预览 | `--dry-run` | — | | |
| 输出 | `--json` | — | 见 §6 | |
| 目录冲突 | `--overwrite` / `--force` | — | boolean；overwrite 仅生成目录，force 任意目录 | |

`--template` 别名：接受且**打印映射说明**——匹配 `{hono, vue}` → `--framework`；匹配 preset id → `--preset`；其余 → 非法值（走 §3.4）。v1 不收 `vue-ts` 类变体 id（不在注册表）。**[OQ-A]**

### 3.2 `--yes` 默认清单（逐项，= CI/agent 路径）

| 字段 | --yes 默认 |
|---|---|
| targetDir | **必须给**（positional 缺失 → `E-DIR-REQUIRED`，绝不静默选 `./my-app`） |
| projectType | `standalone` |
| appName | monorepo 下按框架取 `api` / `web` / `desktop`；standalone 忽略 |
| framework | `hono` |
| features | **[]**（零 feature；"batteries" 路径走 preset） |
| packageManager | user-agent 探测；失败 `npm` |
| install | false |
| git | **true**（嵌套 repo 守护见 §5⑧） |

执行前打印上表展开后的完整 manifest（逐行），保证 CI 日志可审计：**--yes 不是静默，是「记录在案的默认」**。

### 3.3 优先级链（含一处前提修正）

**字段值链：`flag > config file > preset > 交互内默认（用户亲手输入的值）> 内置默认`。**

**[前提修正]** 前稿写的「env/探测」不入值链：**env 只切换模态与产出探测值，永不绑定 Answers 字段**（CI/agent → 模态；user-agent → 仅作为 PM 问题的默认值）。理由：值级 env 会让「config 与 env 谁该赢」类规则扩散；parity 用 config + flag 已完备，拒绝为第三个来源扩链。若未来确有需求，单点放开 `CODE4X_PM`。**[OQ-D]**

- flag 与 config 同字段：flag 赢（CI 管线外层追加 flag 即可调任何 config 系统）。
- preset 是「内容型 bundle」：只携带 `framework + features` 两字段。
- 全链走完：**交互模式**下仍缺字段 → 提问补齐；**非交互**（!TTY / `--no-interactive` / `-y` / CI）→ 缺失字段取内置默认（仅 `targetDir` 缺失 → `E-DIR-REQUIRED`）。

### 3.4 非法值 / 冲突处理（统一规则）

```
IF 会话可交互（TTY && !CI && !agent && !-y）:
    单字段值非法（unknown --framework / --pm / 未注册 feature id）→ 回退该字段提问
ELSE:
    同类非法 → E-INVALID-VALUE 硬错，exit 2（保住「非交互永不沉默改向」底线）

跨字段矛盾（绑定来源之间）：一律硬错，即使在 TTY 也绝不回退交互或私改：
    E-FEATURE-FRAMEWORK: --features pinia + -f hono
    E-MIXED-FRAMEWORK:   features 集横跨多框架

重复 flag（--pm npm --pm pnpm）：标准 last-wins，不报错；boolean 对（--install --no-install）同。
```

E-FEATURE-FRAMEWORK 示例：

```
$ create-code4x my-api -f hono --features pinia
✘ E-FEATURE-FRAMEWORK — feature "vue/pinia" belongs to framework "vue", but --framework is "hono".
  Fix: remove pinia, or run: create-code4x my-api -f vue --features pinia
```

（create-vite 对非法值的「回退交互」被我们**收窄**：仅限单字段值非法；跨字段矛盾牵涉两个显式用户输入，静默回退 = 丢意图，故永远硬错。）

### 3.5 features 取值语法

- `--features a,b`：逗号/空格皆可；裸 id 合法但**必须唯一解析**（`zod` → `hono/zod`，v1 唯一）；含混（未来 `express/zod`）→ `E-AMBIGUOUS-LIST`。
- 不带 `--framework` 时，若全部裸 id 同属一个框架 → **推断并绑定该框架**，打印 `framework inferred: hono (from features)`。这使 `--features zod -y` 也可复现。
- `--features none` ≡ `--no-features`，显式空集。
- preset 展开：`hono-api` = `{ framework: hono, features: [hono/api-guard, hono/zod, hono/swagger-openapi] }`；`hono-standard` = `{ framework: hono, features: [hono/api-guard, hono/zod, hono/testing] }`；`hono-full` = `{ framework: hono, features: [hono/api-guard, hono/zod, hono/testing, hono/swagger-openapi, hono/logging, hono/http-hardening] }`；`vue-standard` = `{ framework: vue, features: [vue/router, vue/pinia, vue/vueuse] }`；`vue-full` = standard + query + testing。
- `--config` 与 Answers **同构**（同一 TS type 的 JSON 投影），额外允许 `preset` 字段；未知键 → `E-CONFIG-KEY`（防手误静默）。config 不能做 flag 做不到的事（否则 parity 集合被隐式扩大）。config 与 positional 同时给 `projectName` → `E-CONFLICT`（单一句柄原则）。

### 3.6 env 行为

- `CI=true`（ci-info 判定）≡ `--CI` ≡ `--yes` + 无 TTY 假设；**manifest 照印**。
- agent-detect（[LOD] create-vite 用 `@vercel/detect-agent`；自嗅探少数 env 亦可）→ 打印：

```
◇ Agent environment detected — switching to non-interactive defaults.
  Control via --preset / --config / flags. Use --interactive to force prompts.
```

> vp 集成注意：`vp create` 不向外部模板透传 `--no-interactive`，CI 请使用 `--` 后的显式参数（如 `vp create code4x -- my-api -f hono -y`）；详见 [05-vp-integration.md](./05-vp-integration.md)。

## 4. 取消 / 中断语义

| 阶段 | 中断源 | 行为 | 副作用清理 |
|---|---|---|---|
| P0/提问 | Ctrl-C / EOF（clack isCancel） | `outro("Operation cancelled")`；exit 130 | 无（I1 分界）：连 targetDir 的 mkdir 都未发生 |
| 写盘 | SIGINT/SIGTERM/进程死亡 | staging 目录（`.code4x-tmp-<name>/`）中途胶着 | staging 由下一次运行同前缀清扫兜底（sweep-first）；**target 出现即为完整项目**——唯一例外：`package.json` 在 rename 后写入（亚毫秒窗口，为兼容 vp 目录探测；见 `src/io/write.ts`） |
| rename | 理论窗口 | 新目录：staging→target rename 原子；overwrite 场景存在 rm-rf→rename 小窗口——视为原子性极限，不追加额外机制 | |
| 安装 spinner | Ctrl-C | 子进程以继承 stdio 方式 spawn，原生 kill 即停；保持文件；打印 "install interrupted, re-run `$ <pm> install`" | 生成文件保留（项目本身已完整） |
| git | Ctrl-C | init 未完成目录保留 | 用户可手删 .git |

**Exit codes**：`0` 成功；`1` 域校验/生成错误（E-*）；`2` usage 错误（解析层）；`130` 取消。clack 层统一：任何 isCancel → 同一 `outro + exit(130)` 路径。npm `--` 转发提醒只进 `--help` 文本一行。

## 5. 边界情况清单（精确行为）

| # | 情况 | 精确行为 |
|---|---|---|
| ① | 目录不存在 | CWD-relative 解析；父目录不存在 → 递归 mkdir |
| ② | 空目录（含仅 `.git` / `.DS_Store` / `.code4xrc.json` 白名单） | 静默继续（或一行 INFO）；交互路径不问 |
| ③ | 非空（白名单外） | 交互：先 confirm 是否覆盖（生成目录 → overwrite，非生成目录 → force）；拒绝则退出 130。**非交互**：无 `--overwrite` / `--force` → `E-DIR-NOT-EMPTY`；`--overwrite` 仅允许含 `.code4xrc.json` 的目录，`--force` 允许任意目录（均 rm-rf 后重写） |
| ④ | package name 归一化 | lowercase、空格/下划线→`-`、非法字符与中文剥离、压缩连字符、空段兜底 `my-app`。**目录名保持用户输入原样**（仅 FS 用途），package.json name 用归一化；交互在选中后一行 INFO 显示；**绝不追加一轮额外 confirm** |
| ⑤ | 大写项目名 | `My-API` → dir 原样，name `my-api`（同④） |
| ⑥ | Windows 保留名（con/nul） | 不特判；fs 报错透传 [已知局限] |
| ⑦ | features ∉ framework | 前缀校验，§3.4 文案 |
| ⑧ | 嵌套 git repo | 目标未创建：跳过 init + note；目标已存在：Commit / Branch / Do nothing；Commit/Branch 后可再选清空（保留 `.git`），否则走 overwrite 流程 |
| ⑨ | `--git` 与 `--no-git` 并存 | last-wins |
| ⑩ | `--config` 不存在/解析失败 | `E-CONFIG-READ` / `E-CONFIG-PARSE` |

## 6. 收尾文案

成功（已安装）：

```
✔ Scaffolded hono + zod + swagger-openapi in ./my-api  (metadata: .code4xrc.json)

Next steps:
  $ cd my-api
  $ pnpm dev

docs: Swagger UI at /docs · spec at /openapi.json
```

未安装分支：`pnpm install` 行替换为 `$ pnpm install — skipped (--no-install)`，dev 行仍给。每框架收尾块由 blueprint 提供数据（允许 feature 声明 `docs:` 行，如 swagger 注 URL）；收尾文案为**从 Plan 派生的纯函数输出**，保证与 `--json` 同源。

**`--json`（OQ-C）**：v1 产出且仅产出 stdout JSON（仅非交互路径合法，interactive 下报错）；schema = `{ answers, plan: { files, features: { explicit, resolved } }, nextSteps: string[] }`，供 agent 消费；成本一个 writer 分支，与 `.code4xrc.json` 同序列化器。

## 7. 候选拍板问题

| # | 问题 | 倾向 |
|---|---|---|
| OQ-A | `--template` 别名兼容 | 接受：`{hono,vue}` → framework、preset id 直通（打印映射行）；成本≈0，讨好 create-* 肌肉记忆 |
| OQ-B | `--overwrite` 语义 | clean（rm -rf）+ 硬护栏：目标含 `.code4xrc.json` → 可直接 rm；否则非交互拒绝、交互二次 confirm（clean 保 determinism，stale 文件残留是另一种幽灵问题） |
| OQ-C | `--json` 进 v1 | 进（agent 是此类工具的真实一等用户；延后则要另补 discovery 机制） |
| OQ-D | 彻底禁 env 绑定 Answers | 维持（env 只服务「机器形态」；私有需求用 config file 覆盖） |
| OQ-E | 中文/多语 UI | 英文 v1；文案常量表现在就按 i18n 形状组织，但不实现切语言 |

## 8. 落地建议

按 §3.2 默认清单写第一组 **parity 测试用例**：交互路径与全 flag 路径产出同一 `.code4xrc.json`（diff 为空）——这是「prompts-as-UI」不变量最便宜的执行器。

---

另注：仓库侧工程命令按根目录 AGENTS.md 走 Vite+（`vp`）工作流；这不影响 CLI **产物**行为——生成出的项目仍写普通 package.json scripts，不依赖用户机器上有 vp。
