# 01 · 生态调研

> 调研时间：2026-10-12。方法：官方仓库源码 + npm registry 一手核实。
> 标注约定：「已核实」= 本次抽查亲眼确认；「未核实」= 存疑项。
> 目的：为 code4x-create（通用项目创建脚手架）的设计提供事实依据。

## A. create-vite（v9.2.1）

- **模板交付：始终内置在 npm 包中**，没有远程拉取阶段。已核实 `package.json` 的 `files: ["index.js","template-*","dist"]`（unpkg 抽查）。历史上"设计变化"的印象更可能来自两点：① 生态 starter（React Router / TanStack Start / SvelteKit / Angular / Nuxt 等）改为**委托外部 CLI**（源码 FRAMEWORKS 表的 `customCommand`）；② CHANGELOG 中 tanstack cli `--template` 弃用等演进。
- **CLI 参数**：`mri` 解析 `-t/--template`、`--interactive/--no-interactive`、`--immediate`、`--overwrite`、`--eslint`；`interactive = argInteractive ?? process.stdin.isTTY`；**非交互且未给 template 时缺省 `vanilla-ts`**；非法 template 值会回退交互式选择。
- **Prompt 库**：`@clack/prompts`（已核实为 devDependency；生态最新 1.8.1）；每步 `isCancel → cancel()`。
- **包管理器探测**：`pkgFromUserAgent(process.env.npm_config_user_agent)`。
- **AI agent 感知**：`@vercel/detect-agent` 检测 agent 环境，提示使用 `create-vite <DIR> --no-interactive --template X` 一步完成（AX 优化）。
- **委托命令兼容层**：pnpm 不支持 `--`、yarn1 不支持 `@latest`、bun create 用自带模板（改 `bun x create-`）、deno 用 `deno run -A npm:create-`。
- **测试**：`__tests__/cli.spec.ts`（vitest）对每个模板断言生成文件清单（`readdirSync` + `fileNameMap` 处理 `_gitignore`）与提示文案；`_VITE_TEST_CLI` 环境变量跳过安装。CI 的 changed-files 过滤包含 `packages/create-vite/template**`。
- **engines**：`^20.19.0 || >=22.12.0`（已核实）。

## B. create-hono（v0.19.5）

- **模板来源**：GitHub `honojs/starter` 仓库的 `templates/` 目录，经 `@bluwy/giget-core` 下载；**ref 由 CLI 版本推导（`v{major}.{minor}`）**——实现模板与 CLI 的版本锁定。
- 11 个模板按部署目标划分（cloudflare-workers / vercel / nextjs / deno / …），**没有"基础 + 可选 feature"合成**。
- **Prompt 栈**：`commander` + `@inquirer/{input,select,confirm}`。
- **Flags**：`-t/--template`（choices 强校验）、`-i/--install`、`-p/--pm`、`-o/--offline`（走本地缓存）。
- **安装 hook**：模板落盘后由 EventEmitter emit `dependencies` 再执行安装；deno/netlify 模板跳过；最后统一改写 `package.json.name`。

（B 节来源：`src/index.ts`、`src/hooks/dependencies.ts`）

## C. 多变体脚手架的 feature 组合模式

| 工具 | 组合模式 | 关键证据（仓库路径） |
|---|---|---|
| create-t3-app 7.40.0 | base + **Installer 程序化改共享文件**：`addPackageDependency` / `addPackageScript`（`sort-package-json` 收尾）；按组合选用片段文件（如 `index-drizzle/with-${provider}.ts`） | `cli/src/installers/*.ts`、`cli/src/utils/addPackageScript.ts` |
| create-next-app 16.4.0 | **静态模板目录** × js/ts × TemplateType（`default` / `default-empty` / `default-tw` / `default-tw-empty`）；安装期再程序化调整；`skipPrompt = ciInfo.isCI \|\| opts.yes` | `packages/create-next-app/templates/types.ts`、`index.ts`、`create-app.ts` |
| create-vue 3.24.0 | base + feature overlay 目录 + **入口变体枚举**（pinia/router 4 种预烘焙变体选 1）+ EJS 条件渲染 + `trimBoilerplate` 清理未选样板 | `index.ts`、`utils/trimBoilerplate.ts`、`utils/renderTemplate.ts` |
| TanStack CLI 0.71.1 | **内存 Environment 分阶段叠加**（framework → add-on/example/toolchain/deployment，按 priority 排序 + `dependsOn` 解析）+ `mergePackageJSON` + `ADD_ON_IGNORE_FILES` 黑名单禁止覆盖入口 + `attribution.ts` 按 `appliesTo` 记录文件来源 | `packages/create/src/create-app.ts`、`custom-add-ons/add-on.ts`、`package-json.ts`、`attribution.ts` |
| Nx | **虚拟 Tree + EJS**：`__name__` 文件名替换与内容渲染共用同一 substitutions；`OverwriteStrategy` = overwrite / keepExisting / throwIfExisting | `packages/nx/src/generators/utils/generate-files.ts` |
| plop / hygen | plop 4.0.5（2026-01 活跃；inquirer + Handlebars 胶水）；**hygen 6.2.11（2022-09 后未发版，事实停更；EJS + degit）** | 各 README / npm registry |

- **共享文件改写的通用手法**：JSON 程序化编辑（deps/scripts）+ 字符串 replace 补丁。例：create-vite 的 `setupEslint` 直接 replace `vite.config` 的 import 与 plugins 数组、重写 README 段落——**脆弱但无 AST 依赖**。
- **组合爆炸是文档化的痛点**：create-t3-app 用 `.github/scripts/generate-matrix.js` 生成笛卡尔积并按互斥规则（prisma/drizzle、nextAuth/betterAuth 不可同开）过滤；`e2e.yml` 留有 FIXME：「this is a bit hacky… not sure how to setup the matrix」。

### C-1. 条件化入口接线先例（源码级摘录，第二轮补充）

- **create-vue**：布尔 `needs*` 直接控制渲染哪些 overlay 目录，后渲染覆盖先渲染（`package.json` 走 `deepMerge` + `sortDependencies`；`_gitignore` 为**追加**）；入口文件 = 4 个预烘焙变体选 1（`entry/router-and-pinia` / `entry/pinia` / `entry/router` / `entry/default`，已核实存在）；EJS 为**延迟渲染**（拷贝期不渲染，按目标路径 key 注入 dataStore）；`trimBoilerplate` / `applyOverrides` 均为定点操作。
- **TanStack CLI**：`specialSteps` 实际只有 `rimraf-node-modules`、`post-init-script`，**不是接线机制**；单文件写入后写胜、可 `getDeletedFiles()` 删除；`appliesTo` 把「注入类型 → 目标文件」做成**声明式映射**（如 `vite-plugin → vite.config`）供拼装与归因共用；**入口黑名单**（`ADD_ON_IGNORE_FILES`）保护 main/App/routeTree 不被覆盖。
- **create-t3-app**：`template/extras/` 按 auth×provider 组合存放候选文件，选中后替换占位符拷贝；`addPackageDependency` 直接覆盖（**无冲突检测**）+ `sortPackageJson` 最后统一排序；接线策略是**整文件替换**目标文件，不动共享入口。
- **Nx**：`OverwriteStrategy` 三态控制生成时覆盖行为；虚拟 Tree 便于内存单测。
- **shadcn**：registry item 声明 `cssVars/tailwind/css` 片段 → `deepmerge` 聚合 → PostCSS 定位写入现有文件（声明式注入的另一种先例）。

## D. Prompt 库现状（2026-10，均已核实）

- `@clack/prompts` **1.8.1**（2026-09 最新）：create-vite、create-vue、create-t3-app、TanStack CLI 在用；提供 `isCancel()`、`isCI()/isTTY()`。
- `@inquirer/prompts` **8.7.3**（2026-10-04，活跃）：create-hono 使用模块化子包。
- `prompts` **2.4.2：最后发布 2021-10-07**，事实停更；create-next-app 与 shadcn CLI 仍在用，**不建议新项目采用**。

## E. 模板获取工具

- `giget` **3.3.1**（2026-07，活跃）：磁盘缓存（`XDG_CACHE_HOME/giget`）、`--offline` / `--prefer-offline`、私有仓库 auth（`GIGET_AUTH`；GitHub fine-grained token 需 Contents+Metadata 权限）、`git:` provider 本地 clone、自定义 provider / registry。
- **tiged 2.12.8**（2026-05）：degit 的社区继任者；Vite 官方文档已从 degit 改为推荐 tiged。
- **内置 npm 包**（create-vite 路线）：版本严格同步、离线可用、零网络失败面；代价是包体与发布耦合。
- 若走远端方案：学 create-hono 用 CLI 版本推导 ref 锁定兼容。

## F. 测试 / CI 分层实例

1. **CLI 快照层（≈0 成本）**：create-vite `cli.spec.ts`——文件清单 + 文案断言，`_VITE_TEST_CLI` 跳过安装。
2. **生成项目矩阵层**：t3 `e2e.yml`——`generate-matrix.js` 产出合法组合 → 生成 → `pnpm build`（含 lint/format 矩阵、bun job）；Turbo remote cache、`concurrency: cancel-in-progress`、path filter（仅 `cli/**` 变更触发）。
3. **行为层**：TanStack `blank-smoke.spec.ts`——非交互模式对非空目录 exit 1 并提示 `--force`。
4. **最便宜的生成器单测**：Nx in-memory Tree（`generate-files.spec.ts`）。

## G. 2025–2026 新动向

- **LLM/AX 成为一等公民**：create-vite 引入 `@vercel/detect-agent` 提示 agent 走非交互命令；create-next-app `helpers/generate-agent-files.ts` **生成 AGENTS.md**（规则块随 `next dev` 自动维护、`experimental.agentFeedback`）；TanStack 模板源码带 `@ai_context` 注释。
- **npm create 参数转发怪癖**：npm 7+ 需要 `--` 转发参数；pnpm/yarn1/bun/deno 各有差异（见 A 的兼容层）。
- **Bun/Deno**：create-hono 检测 deno v1 并排除安装步骤；t3 有 bun job 但注明 Next 尚不能用 bun 跑 build。
- **engines 收紧**：create-vite 要求 Node `^20.19.0 || >=22.12.0`。

## 对设计的启示（结论）

1. 模板默认打进 npm 包（离线可用、CLI/模板/feature 版本原子同步）；远网仅作未来可选项，ref 从 CLI 版本推导。
2. 特征合成用「base + 受控贡献」而非模板组合：JSON 结构化合并 + 片段文件 + 组装点；显式建模互斥。
3. 双模 CLI：TTY 默认交互，`--no-interactive`/`--yes` + 逐项 flag；缺省即合法组合；`isCancel → 干净退出`。
4. Prompt 选 @clack/prompts（或 @inquirer/* 模块化包），**不用已停更的 prompts**。
5. 测试三层 + 成本控制；矩阵脚本与互斥规则**同源生成**（避免 t3 的 FIXME 式手工维护）。
