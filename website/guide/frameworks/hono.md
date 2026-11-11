# Hono

生成一个 Vite+ 原生的 Hono 后端：`vp dev` / `vp build` / `vp check`，构建产物用 `@hono/vite-build/node` 输出到 `dist/`。

## 生成结构

```text
my-api/
├── src/
│   ├── index.ts          # 组装文件：imports / middlewares / routes / error-handlers
│   ├── routes/health.ts  # /healthz 与 /readyz
│   └── …                 # feature 注入的文件（schemas、env、docs…）
├── vite.config.ts        # dev-server + build + lint/fmt 配置
├── package.json
├── tsconfig.json
└── .gitignore
```

## 基座能力

| 能力 | 说明 |
|---|---|
| requestId | `requestId()` 第一个执行，日志与错误体共享 `c.get('requestId')` |
| 请求日志 | 基线 `hono/logger`；选择 `hono/logging` 时整体替换为 pino |
| 健康检查 | `GET /healthz` 存活；`GET /readyz` 依赖探测，失败返回 503 |
| 统一错误信封 | `app.onError` / `app.notFound` 输出 `{ code, message, requestId }` |
| 优雅停机 | 构建插件启用 `shutdownTimeoutMs: 5000`，`SIGTERM` 可正常退出 |
| 端口 | `PORT` 在构建期烘焙；不设置时默认 3000 |

未知路由返回 404 JSON 信封：

```json
{ "code": "NOT_FOUND", "message": "Not Found", "requestId": "…" }
```

## 可选能力

| Feature | 作用 | 依赖 / 备注 |
|---|---|---|
| `hono/zod` | 请求校验，`src/http/validation.ts` 统一校验错误为 `VALIDATION` 信封 | 带示例路由 `/auth/register` |
| `hono/api-guard` | CORS + secure-headers 样板 | — |
| `hono/swagger-openapi` | `/openapi.json` + `/docs` Swagger UI | requires `hono/zod` |
| `hono/env` | `src/env.ts`，用 zod 校验环境变量 | requires `hono/zod`；不自动接入入口 |
| `hono/testing` | `src/app.test.ts` + Vitest 配置（`app.request()`） | 零新增依赖 |
| `hono/logging` | pino + hono-pino 结构化日志 | 替换基线 logger |
| `hono/http-hardening` | `timeout` + `body-limit` + `compress` | 中间件顺序 20/21/22 |

> `hono/env` 生成的是独立文件，需要你自己 `import { env } from './env'`，避免入口出现未使用 import。

## 预设

| 预设 | 内容 |
|---|---|
| `hono-api` | api-guard + zod + swagger-openapi |
| `hono-standard` | api-guard + zod + testing |
| `hono-full` | standard + swagger-openapi + logging + http-hardening |

> 全栈快捷模式的 `apps/api` 使用 `hono-full`。

## 常用命令

```bash
pnpm dev          # vp dev，默认 3000
pnpm build        # vp build → dist/
pnpm start        # node dist/index.js
pnpm check        # vp check
pnpm test         # 仅当选择 hono/testing 时存在
```

## 组合示例

```bash
# 最小 API
node packages/cli/dist/cli.mjs my-api -f hono -y

# 带校验 + 文档
node packages/cli/dist/cli.mjs my-api -f hono --features zod,swagger-openapi -y

# 生产向完整后端
node packages/cli/dist/cli.mjs my-api -p hono-full -y
```

## 部署提示

- 构建期设置 `PORT` 可改变产物内烘焙的端口：`PORT=8080 pnpm build`。
- 进程收到 `SIGTERM` 时会在 5 秒内优雅退出，适配大多数容器平台。
- `/readyz` 的探针目前是带 TODO 的 no-op，接入数据库/缓存后请替换为真实探测。
