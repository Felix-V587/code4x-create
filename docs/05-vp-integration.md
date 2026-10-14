# 05 · vp create 集成笔记（Vite+ v1.1.0）

> 目的：记录「通过 Vite+ 统一入口运行 code4x-create」的已核实机制、正确调用方式与集成设计。
> 来源：本机 `node_modules/vite-plus/docs/**` 与 `dist/create/bin.js`（行号可回溯），2026-10-13 核实。

## 1. 机制要点（已核实）

- **名称展开**：`vp create code4x` → 包名 `create-code4x`（未知名自动加 `create-` 前缀；已带 `create-` 的原样；`@org` → `@org/create`；`vite:*` / GitHub / `./` 路径不展开）。⚠️ `code4x-create` 会展开成 `create-code4x-create`（错）。
- **调用方式**：dlx 运行器（pnpm→`pnpm dlx`、npm→`npx`、yarn→`yarn dlx`、bun→`bun x`），stdio 继承（TTY 可用，@clack/prompts 正常）。
- **参数透传**：`vp create <tpl> -- <args>`，`--` 后**原样**传给模板。vp 只对名单内模板（create-vite、@tanstack/cli、sv、nuxt）追加参数；我们不在名单 → 行为完全自主。
- **vp 自身选项不作用于外部模板**：`--directory` 对外部模板直接报错（仅 builtin / bundled @org）；`--no-interactive` **不透传**；外部模板无 vp 环境信号（`VP_CREATE_INTERACTIVE` 仅注入本地 Bingo 模板）。
- **事后托管**：模板退出后 vp 检测产物（监听新写入的 `package.json`；检测不到则跳过集成）→ 写 agent/editor 文件、install、approve-builds 处理、fmt；非 monorepo 下另做 git init + hooks；monorepo 下改为 workspace 注册（根 yaml 加 pattern）+ root install，无 git init。
- **本地模板**（monorepo `create.templates`）：以 `node <binPath>` 执行、参数透传同 `--`、同样进入 monorepo 集成；要求包有 bin。
- **org 清单**（`createConfig.templates`）：仅 `@scope` 触发；暂不采用（清单无 per-entry args；bundled 相对路径为纯复制、不跑 bin，会丢引擎价值）。
- **cwd / positional（实测）**：vp 以推断的父目录（如 `apps/`）作为模板进程 cwd，`--` 后的 positional 相对该 cwd 解析——monorepo 内应传**裸名**（`api`），传 `apps/api` 会双重嵌套。
- **vp 事后改写（实测）**：向 root `pnpm-workspace.yaml` 追加 pattern（观测到未去重）、root 写入 `AGENTS.md`、把生成的 `vite.config.ts` 改写为 `lazyPlugins`（monorepo 集成）、root install；`.code4xrc.json` 在事后处理中保留。

## 2. 正确调用方式（发布后）

```bash
vp create code4x                                          # 交互式（框架 → features → …）
vp create code4x -- my-api -f hono --features zod -y      # 参数化；CI 同此写法
vp create code4x -- api -f hono --features zod            # monorepo 内建子项目（裸名：vp 以推断父目录为 cwd，见 §1）
```

CI 注意：**不能**依赖 `vp create --no-interactive` 透传；把参数放在 `--` 之后。

## 3. 交互层职责边界

| 关注点 | 归属 | 说明 |
|---|---|---|
| 目标目录 | vp 先问（未给位置参数时）→ 我们只消费 positional | `isBound(targetDir)` 即跳过 N1 |
| 框架 / features 选择 | **我们**（单 bin 单入口，N2/N4） | `vp create code4x` 的"选模板"即选框架 |
| PM | 我们（默认=探测值） | dlx 运行器即 PM 线索；保留 N5 |
| install | 我们**永远默认 false** | vp 两条 lane 都会托管 install，避免重复 |
| git | 我们保留 N7 | 嵌套 repo 自动跳过；vp 侧 init 幂等 |
| agent / editor 文件 | vp | 我们完全不碰 |

## 4. 子项目模式（P0 规则，已实现）

- **嵌套 `pnpm-workspace.yaml` 条件化**：目标位于既有 workspace（向上找到 `pnpm-workspace.yaml` 或 `workspaces` 字段）内时**不生成**；esbuild build-gate 归 root 处理。外部模板路径下 vp 不会替我们删除嵌套文件（仅内置 monorepo lane 有删除逻辑）。
- `.code4xrc.json` 记录 `context: { nestedWorkspace, pmFrom }`（为将来 add-to-existing 留定位钩子）。
- workspace 注册交给 vp（`updateWorkspaceConfig`），我们不写。

## 5. 集成验证（harness 已落地，2026-10-13 实测）

`fixtures/vp-harness/`（`pnpm run harness:vp`）：scratch monorepo + `create.templates` 本地条目 + shim 指向本仓库 `packages/create-code4x/dist/cli.mjs`；两条 lane + 一条观察 lane 实测通过：

| lane | 透传参数（`--` 后） | 生成位置 | 结果 |
|---|---|---|---|
| A | `api -f hono --features zod,swagger-openapi -y --no-git` | `apps/api` | ✅ 断言全过 |
| B | `web -f vue -p vue-full -y --no-git` | `apps/web` | ✅ 断言全过 |
| 观察 | 不带 `--approve-builds` | `apps/noapprove` | ✅（热 store 下无 ignored-builds） |

已确认：无嵌套 `pnpm-workspace.yaml`、rc 在 vp 事后处理中保留、`context.nestedWorkspace=true`、root install 执行；**staging 与 vp 目录探测的摩擦已修复**（`package.json` 延后至 rename 后写入，vp 日志恢复 `Scaffolded apps/api` / `Next: cd apps/api`）。

仍待验证：发布后 dlx lane（`vp create code4x -- ...`）；dlx 是否设置 `npm_config_user_agent`；冷 store 下 ignored-builds 行为；vp 重复追加 pattern 的幂等性（vp 侧）。

## 6. 遗留与建议

- 可向 vp 提 issue：外部模板透传 `--no-interactive` 或提供 env 信号（当前 CI 只能用 `--` 显式参数）。
- vp 版本漂移：harness 锁定最低 vp 版本做回归；`createConfig` schema 错误是硬错。
- 包名 `create-code4x` 已核实未被占用（npm 404）。

## 7. hono 模板 vp 原生化（2026-10-13）

spike 实测（`@hono/vite-dev-server@0.26.1` + vite-plus 1.1.0 / rolldown 内核）：

| 能力 | 结果 |
|---|---|
| `vp dev`（dev-server 接管 Hono） | ✅ 200；服务端改动 full-reload（官方 HMR 仅客户端） |
| `vp build` + `@hono/vite-build/node` | ✅ `dist/index.js` 可 `node` 直跑（`serve` 由插件注入，源码不得再 serve） |
| `vp pack`（tsdown） | ⚠️ 产出库 bundle、非可运行 server；且与 `vp build` 共用/互相清空 `dist` → 模板不用 |
| `vp check`（无配置） | ⚠️ 默认失败（fmt 不忽略 `dist`）→ 模板 vite.config 已配 `ignorePatterns` + `typeCheck` |

实现要点：模板 `src/index.ts` 改 `export default app`；devDeps 增 `vite-plus`/`@hono/vite-dev-server`/`@hono/vite-build`（移除 tsx）；`@hono/node-server` 保留（build 插件构建期注入 `serve` 需要）；`PORT` dev 运行时读取、build 固化进产物；harness lane A 增加 `vp build` + 运行 + curl 断言（已通过）。

**vue 模板对齐（2026-10-13）**：生成项目 `vp check` 开箱通过——vite.config 内置 lint/fmt/typeCheck 配置（`defineConfig` 来自 `vite-plus`，与 vp 注入形态一致）；dev/build 保持 plain `vite` 链（vue 的 vp dev/build 深度集成留待后续评估）。hono base 的 `package.json` 亦已对齐 oxfmt（`onlyBuiltDependencies` 多行）。
