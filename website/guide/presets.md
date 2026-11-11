# 预设

预设是 `framework + features` 的内容包，用来一次选定常用组合。

## 模式默认预设

| 模式 | 应用 | 默认预设 / 组合 |
|---|---|---|
| Standard project | 单应用 | **不隐式套预设**：用 `-p <preset>` 或 `--features` 显式选择 |
| Monorepo project | `apps/<app>` | 使用所选框架的 preset / features，再叠加单仓库适配（根 `pnpm-workspace.yaml`、根 `vite.config.ts`、`vp run -r` 脚本、workspace README） |
| Full-stack project | `apps/api` | `hono-full`：api-guard + zod + testing + swagger-openapi + logging + http-hardening |
|  | `apps/web` | `vue-standard` + `vueuse-router` + `testing` + `reka-ui` + `alova` + `unocss` |
|  | `apps/desktop` | Electron 标准基座 + `electron/builder` |
|  | `packages/shared-types` | 无预设：共享 `Todo` / `CreateTodoInput` / `ApiError` / `HealthStatus` 类型 |

Full-stack 本质上是 Monorepo 的快捷方式：三个应用都按单仓库 app 渲染，再统一追加 `packages/shared-types`、示例链路与根/子项目 `AGENTS.md`。

## Hono 预设

| 预设 | 展开的 features | 作用 |
|---|---|---|
| `hono-api` | `api-guard` + `zod` + `swagger-openapi` | API 服务：校验 + `/docs` Swagger UI + `/openapi.json` |
| `hono-standard` | `api-guard` + `zod` + `testing` | 标准后端：校验 + Vitest 示例 |
| `hono-full` | `api-guard` + `zod` + `testing` + `swagger-openapi` + `logging` + `http-hardening` | 生产向完整后端：文档、pino 日志、timeout/body-limit/compress |

> `hono/env`（zod 校验 `process.env`）不在任何预设中，需要单独 `--features env`。

## Vue 预设

| 预设 | 展开的 features | 作用 |
|---|---|---|
| `vue-standard` | `router` + `pinia` + `vueuse` | 标准 Vue 应用基座 |
| `vue-naive-tw` | `router` + `pinia` + `vueuse` + `naive-ui` + `tailwind` | Naive UI + Tailwind（常用推荐） |
| `vue-element-tw` | `router` + `pinia` + `vueuse` + `element-plus` + `tailwind` | Element Plus + Tailwind |
| `vue-shadcn-tw` | `router` + `pinia` + `vueuse` + `tailwind` + `shadcn-vue` | shadcn-vue 组件栈 + Tailwind |
| `vue-unocss-min` | `router` + `pinia` + `unocss` | 最小组合：路由 + 状态 + UnoCSS |
| `vue-full` | `router` + `pinia` + `vueuse` + `query` + `testing` | 完整示例：TanStack Query + Vitest |

Full-stack 的 Web 应用在 `vue-standard` 基础上追加：`vueuse-router`、`testing`、`reka-ui`、`alova`、`unocss`。

## Electron

Electron 目前没有独立预设：标准基座固定包含类型化 IPC、`app://` 协议、preload 窄接口与 Vue 渲染层；全栈模式额外选择 `electron/builder`（electron-builder 打包）。

## 使用

```bash
node packages/cli/dist/cli.mjs my-api -p hono-standard -y
node packages/cli/dist/cli.mjs my-web -p vue-naive-tw -y
node packages/cli/dist/cli.mjs my-stack --fullstack -y
```

也可以写成 `--template <preset-id>`（兼容别名）：

```bash
node packages/cli/dist/cli.mjs my-web --template vue-naive-tw -y
# note: --template vue-naive-tw -> --preset vue-naive-tw
```

## 与 `--features` 的关系

- 预设只携带 `framework` 与 `features` 两个字段。
- 显式给 `--features` 会**替换**预设的 features，但预设的 framework 仍然生效：

```bash
# 框架仍是 vue，features 只有 router + pinia
node packages/cli/dist/cli.mjs my-web -p vue-naive-tw --features router,pinia -y
```

- 依赖闭包会自动补齐（例如 `swagger-openapi` 带入 `zod`，`shadcn-vue` 带入 `tailwind`）。
- 同组多选（如同时给 naive-ui 与 element-plus）会报 `E-CONFLICT`。

## 自定义组合

预设覆盖不到时，直接列 feature：

```bash
node packages/cli/dist/cli.mjs my-web -f vue \
  --features router,pinia,vueuse,query,testing,tailwind,shadcn-vue -y
```

完整的 id、依赖与互斥关系见 [Feature 矩阵](/reference/features)。
