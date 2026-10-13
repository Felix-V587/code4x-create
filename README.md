# create-code4x

通用项目创建脚手架（对标 create-vite）：以**参数**（v1，已实现）或**交互式提问**（M4，进行中）创建多框架项目，并按框架可选集成常用能力——Hono：`zod` 校验 / `api-guard`（CORS + secure-headers）/ `swagger-openapi` 文档；Vue：`pinia` / `vue-router`（在途）。

**实施状态**：M0–M2 已完成（Hono 基座 + 三个 feature），M3（Vue）与 M4（交互流程 / CI）在途。设计与决策文档见 [docs/](./docs/README.md)。

## 快速开始（仓库内）

```bash
vp install && vp pack
node dist/cli.mjs my-api -f hono --features zod,swagger-openapi -y
cd my-api && pnpm install && pnpm dev
```

生成后：`GET /docs`（Swagger UI）、`GET /openapi.json`（spec，含 `/auth/register` 校验示例路由）。

常用组合：

```bash
node dist/cli.mjs my-api -f hono -y                  # 仅基座
node dist/cli.mjs my-api -f hono --features zod -y   # + zod 校验
node dist/cli.mjs my-api -p hono-api -y              # 预设：api-guard + zod + swagger-openapi
```

发布后形态（尚未发布到 npm）：`pnpm create code4x my-api`。

通过 Vite+ 统一入口（发布后）：`vp create code4x`（交互式）或 `vp create code4x -- my-api -f hono --features zod -y`（参数化；CI 同此写法——vp 不透传 `--no-interactive`，参数放 `--` 后）。本地未发布期的集成验证走 `create.templates` harness，见 [docs/05](./docs/05-vp-integration.md)。

## 参数与行为

完整参数、默认值、退出码与边界行为见 [docs/04-prompt-flow.md](./docs/04-prompt-flow.md)。要点：

- `-f/--framework`、`--features`（裸名唯一解析、`none` 清空）、`-p/--preset`、`--pm`
- `--install/--no-install`、`--git/--no-git`、`-y/--yes`、`--config`、`--json`、`--dry-run`
- `--overwrite`（护栏：仅允许覆盖含 `.code4xrc.json` 的目录）、`--template` 别名
- 生成物包含 `.code4xrc.json`：features 解析闭包 + 文件来源 + sha256（为将来「给已有项目加 feature」预留）

## 开发

```bash
vp install   # 安装依赖
vp check     # 格式化 + lint + 类型检查
vp test      # 单测 + CLI e2e（vitest）
vp pack      # 构建 CLI 与模板资产到 dist/
```

Vite+ 工具链说明见 [AGENTS.md](./AGENTS.md)。

## 仓库结构

```
src/domain/   纯函数层：types / errors / registry / resolve / render（锚点组装、确定性、幂等）
src/io/       副作用薄层：staging 落盘、rc、PM 探测、git、install
templates/    框架骨架与静态文件（hono）
features/     可选能力（hono/zod、hono/api-guard、hono/swagger-openapi）
tests/        单测与 CLI e2e
docs/         设计文档：生态调研 / 架构决策 / wiring 规格 / prompt 流
```

## 许可

MIT
