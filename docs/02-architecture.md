# 02 · 架构与关键技术决策

> 状态：定稿候选（OQ-1~7 未见异议，按倾向定案）。
> v1 范围：Hono + Vue + Electron；feature：`hono/zod`、`hono/swagger-openapi`、`hono/api-guard`（示例）、`vue/pinia`、`vue/router`。
> 上游依据：[01-ecosystem-research.md](./01-ecosystem-research.md)；机制细节：[03-feature-wiring-spec.md](./03-feature-wiring-spec.md)。

## 1. 五层架构（核心两层必须是纯函数）

```
CLI/Answers（参数 / env / 配置文件 / 交互 prompt —— prompt 只是 Answers 的一个 UI）
      ↓
Resolution：Answers → ProjectPlan（feature 注册表查询、依赖闭包、拓扑排序、冲突检测）   ← 纯函数，无 I/O
      ↓
Materialize：Plan → 虚拟文件树（base 骨架解出 + 逐 feature 叠加：文件 / package.json 合并 / 组装点渲染） ← 纯函数，无 I/O
      ↓
Post（薄 I/O 层）：落盘 → PM 探测 → 可选 install → git init
      ↓
Metadata：.code4xrc.json（闭包 + 来源 + sha256）—— add-to-existing 与 CI 复现的契约
```

纪律：

- Resolution / Materialize 不碰 fs / 网络 / process.env；由此**全组合可以在 CI 离线秒级验证**。
- 非交互模式（`--yes` / CI / agent 检测命中）完全不进入交互层。
- 同一 Plan 二次渲染字节级一致（幂等，用 property-test 保证）。
- 未来「给已有项目加 feature」复用同一 Materializer，因此纯函数边界不是过度设计。

## 2. 功能组合模型（核心决策）

三案对比：

- (a) **全组合静态模板**：3 个可选 feature 就是 8 份拷贝，漂移必然 → 否决（仅保留少量 blessed preset 作 golden 样本）。
- (b) **base + feature 叠加 + 受控合并** → 采纳。
- (c) **纯命令式插件**：可维护性差、不可静态校验 → 仅作窄逃生舱（hook）。

推荐：**声明式 manifest + 组装点**（详见 03）：

- Feature = 类型化 TS manifest + `files/` 目录。
- 共享文件三类策略：
  1. `package.json`：只允许结构化（键级）合并；键冲突 = 构建期硬错误，**绝不静默 last-wins**；渲染后跑 `sort-package-json` 收尾（t3 先例）。
  2. entry / `vite.config` 等代码文件：**不做事后 patch、不用散装 marker**——base 提供骨架与组装点，feature 贡献有序块，渲染期确定性拼装。
  3. 其余任意文件改写：仅 hook 逃生舱，review 层面劝退。
- feature 间交互：建模为**第三个 feature 声明 `requires` 两者**（不求 feature 改另一 feature 的文件）。
- 与业界对照：t3 / create-vue / TanStack / Nx 都是这条路线（受控合并）的命令式变体；create-vite 的字符串 replace 是反模式参照。

## 3. 关键决策表

| 决策 | 结论 | 依据 |
|---|---|---|
| 运行时 | Node ≥20.19 / ≥22.12 + TS ESM + pnpm workspace | create-vite engines 同款（已核实）；CLI 经 npx/corepack 跑在用户机器，Node 摩擦最小 |
| Prompt 库 | `@clack/prompts`（备选 `@inquirer/*`）；`prompts` 已停更勿用 | 生态先例（已核实）；架构下限：prompts 只是 Answers 的 UI，可整体替换 |
| 模板托管 | v1 全部内置 npm 包；远端拉取（giget + CLI 版本推导 ref）留作未来选项 | create-vite 实证；离线与版本原子性；参考 create-hono ref 策略 |
| 组合实现 | 声明式 manifest + 窄 hook；第三方插件 API v1 不承诺稳定 | 可静态校验 / 可快照测试 / 接口冻结成本 |
| 包发布 | 单包 `create-code4x`（`pnpm create code4x` 自动映射）；changesets 发版，`latest`/`next` 双 tag | create-* 生态惯例；将来拆包是机械工作 |
| 首发 scope | hono（zod / swagger-openapi / api-guard）+ vue（pinia / router）+ electron（Vue 3 渲染层）；react 随后 | 走齐矩阵管线比功能面广更重要 |

## 4. 横切原则

- **非交互 parity 是硬约束**：CI 用 full-flag 路径测试非交互完备性（prompt ↔ flag 一一对应由测试保证）。
- **确定性**：排序键不依赖时钟 / 对象 key 顺序；imports 聚合去重按模块路径排序；空区域零输出。
- **metadata**：`.code4xrc.json` 记录解析后闭包 + 来源 + sha256（v1 即写入；这是唯一预埋件）。
- **AI agent 感知**：非交互提示语（学 create-vite）；AGENTS.md 生成后续可作 feature。

## 5. 验证与维护策略（三层）

- **Tier-1（每 PR，秒级）**：离线全组合 materialize + 文件清单 golden 快照 + 合并冲突校验 + 「声明↔实际产出」校验（不装依赖）。
- **Tier-2（PR 子集 / nightly 全量）**：blessed 组合矩阵 → install → typecheck → build；path filter 触发 + 锁文件缓存封顶成本；**互斥规则与矩阵脚本同源生成**（吸取 t3 FIXME 教训）。
- **Tier-3**：生成项目冒烟（hono 起服务 curl 健康端点）。
- 参考先例：create-vite spec 层、t3 `e2e.yml`、TanStack `blank-smoke`、Nx in-memory Tree。

## 6. 仓库布局与发布

```
/                              # pnpm workspace 根（private：工具链 + 文档 + harness）
  package.json                 # private 工作区根（scripts: vp check / vp run -r test …）
  pnpm-workspace.yaml          # packages/* + catalog/overrides
  vite.config.ts               # 根配置：仅 lint / fmt
  packages/create-code4x/      # 发布包（name = create-code4x）
    package.json               # bin / exports / files（发布形态）
    vite.config.ts             # pack 块：entry / copy / dts / exports
    tsconfig.json
    src/
      domain/{types,registry,resolve,render,pkgjson}.ts   # 纯函数（本设计的核心落点）
      io/{write,pm,git,prompts}.ts                        # 副作用，薄
    templates/{hono,vue,electron}/…     # 骨架 + 静态文件（随包发布）
    features/{hono,vue}/…      # manifest + files（随包发布）
    tests/                     # 单测与 CLI e2e（随包走）
  docs/                        # 设计文档（本目录）
  fixtures/                    # vp 集成 harness
```

- 模板、feature 与测试资产现已随发布包 `packages/create-code4x/` 一起走；仓库根仅保留工作区工具链、文档与 harness。
- 先单包组织（目录即拆包边界），未来拆分是机械工作。
- changesets 管理版本；matrix 全绿才发。
- 本仓库使用 Vite+（`vp`）工作流开发（见根目录 AGENTS.md）；包名为 `create-code4x`，`repository` 等元信息将于发布前补充。

## 7. MVP 里程碑（状态更新：2026-10-13）

- ✅ **M0（walking skeleton）**：core 类型（Answers / Plan / FeatureManifest / AssemblySpec）+ hono base + **非交互**生成可运行项目（PM 探测、git init 开关）。
- ✅ **M1**：`hono/zod` + `hono/api-guard`（package.json merge + entry wiring 的真实路径）。
- ✅ **M2**：`hono/swagger-openapi`（requires zod；zod 路由 `when` 双变体 + 中间件式 `/openapi.json`、`/docs`）。
- ✅ **M3**：vue + pinia + router（验证框架可插拔 + vite.config 组装）。
- ✅ **M5**：electron（Vue 3 渲染层 + `vp pack` 主/预加载 CJS + 零依赖 dev 编排脚本；组装锚点复用）。
- ⏳ **M4**：Tier-1/2 CI、完整交互流程、presets → 发布 0.1.0。
- **Defer**：react（低风险增量）、add-to-existing、远程模板、第三方插件、Bun/Deno 变体。

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 组合爆炸 / 矩阵 CI 成本 | 离线 Tier-1 全组合 + blessed 组合轮换；互斥规则同源 |
| 模板漂移 | 单包原子版本 + golden 快照 |
| 组装点机制复杂（最富挑战的边缘） | 错误码失败用例 TDD 先行，尽早锁死语义 |
| 生态 API 不确定项 [LOD] | M1/M2 实现时核对（如 swagger 包形态） |
| 单人维护 | 控制首发 scope；决策文档化（本目录） |

## 附录：决策记录（OQ 定案）

| # | 问题 | 定案 |
|---|---|---|
| OQ-1 | `requires` 引入版本区间？ | 不引入（v1 原子版本发布，跨版本共存为空集） |
| OQ-2 | 生成后跑 prettier？ | 不跑（golden 保证格式） |
| OQ-3 | feature 文件支持变量插值？ | verbatim；仅 `package.json.name` / README 两个内建特例 |
| OQ-4 | 现在写 sha256 到 rc 文件？ | 写（add-to-existing 的唯一预埋件） |
| OQ-5 | 骨架锚点 vs 整库 EJS？ | 骨架 + 锚点（EJS 不解决多贡献者组装） |
| OQ-6 | `common/*` 跨框架通道？ | schema 进、真实例不进 v1（mock 验证） |
| OQ-7 | single 槽 v1 启用？ | 机制保留；倾向中间件式 → 暂不启用。核实：`hono-openapi` 1.3.5（中间件式，"加行"模型）vs `@hono/zod-openapi` 1.6.3（包装类，"换基准块"模型） |
| D-1 | 生成模板与 pnpm ≥10 ignored builds | 模板声明 `pnpm.onlyBuiltDependencies: ["esbuild"]`，规避 `ERR_PNPM_IGNORED_BUILDS` 导致的 install 退出码错误（npm/yarn 下无副作用） |
