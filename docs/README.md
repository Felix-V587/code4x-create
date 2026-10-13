# code4x-create 设计文档

通用项目创建脚手架（对标 create-vite）：交互式 / 参数式创建多框架项目，按框架可选集成常用能力（Hono：zod / swagger / 中间件；Vue：pinia / vue-router / vueuse 等）。

## 文档索引

| 文档 | 内容 | 状态 |
|---|---|---|
| [01-ecosystem-research.md](./01-ecosystem-research.md) | 生态调研：create-vite / create-hono 内部实现、feature 组合模式对比、prompt 库与模板拉取现状、测试策略、2025–2026 动向、条件接线先例 | ✅ 已核实（2026-10-12） |
| [02-architecture.md](./02-architecture.md) | 架构与关键技术决策：五层架构、组合模型、决策表、测试策略、仓库布局、MVP 路线、OQ 定案 | ✅ 定稿候选 |
| [03-feature-wiring-spec.md](./03-feature-wiring-spec.md) | 核心机制规格：FeatureManifest 类型草案、组装点(wiring) 语义、错误码、目录结构、hono/vue 走查样例 | ✅ 定稿候选 |
| [04-prompt-flow.md](./04-prompt-flow.md) | 交互问题流 + 参数映射：状态机、逐问呈现、flag/preset/config 优先级、取消语义、边界清单、候选拍板 OQ-A~E | ✅ 定稿候选 |
| [05-vp-integration.md](./05-vp-integration.md) | vp create 集成笔记：机制核实（含源码行号）、正确调用方式、职责边界、子项目规则、验证路线 | ✅ 已核实 |

## 实施状态（2026-10-13）

| 里程碑 | 状态 | 说明 |
|---|---|---|
| M0 | ✅ 已完成 | core 类型 + hono base + 非交互生成可运行项目 |
| M1 | ✅ 已完成 | `hono/zod` + `hono/api-guard`（package.json merge + entry wiring） |
| M2 | ✅ 已完成 | `hono/swagger-openapi`（requires zod；`/openapi.json` + `/docs`） |
| M3 | ⏳ 待做 | vue + pinia/router（框架可插拔 + vite.config 组装） |
| M4 | ✅ 已完成 | 交互式流程（可注入 Prompter）+ 非 TTY 默认语义 + P0 嵌套 workspace 条件化 |
| M4+ | ⏳ 待做 | Tier-1/2 CI、presets、vp 集成 harness 与 0.1.0 发布 |

## 环境约定

- 本仓库已用 **Vite+** 初始化（`vp` 工具链：`vp install` / `vp check` / `vp test` / `vp pack`），详见根目录 AGENTS.md。
- 包管理器：pnpm 12；TypeScript ESM。
- 包名为 `create-code4x`；`repository` 等元信息字段将于发布前补充。

## 文档维护约定

- 调研类结论标注来源（仓库路径 / npm 版本 / URL）；未核实项显式标注「未核实」。
- 设计决策变更时更新对应文档，并在 02 的「决策记录」中追加。
