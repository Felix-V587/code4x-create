# Feature 矩阵

Feature id 形如 `框架/能力`。命令行里可以写全限定名，也可以在名字唯一时写裸名（例如 `zod`）。

**依赖会自动补齐闭包**：`swagger-openapi` 会带入 `zod`，`shadcn-vue` 会带入 `tailwind`。显式勾选与闭包结果都会记录在 `.code4xrc.json`。

## Hono（7）

| id | 标题 | requires | 备注 |
|---|---|---|---|
| `hono/zod` | Zod validation | `hono` | 校验错误归一化为 `VALIDATION` 信封 |
| `hono/api-guard` | API guard | `hono` | secure-headers + CORS |
| `hono/swagger-openapi` | OpenAPI docs | `hono`, `hono/zod` | `/openapi.json` + `/docs` |
| `hono/env` | Env config | `hono`, `hono/zod` | 独立 `src/env.ts` |
| `hono/testing` | Testing | `hono` | Vitest + `app.request()` |
| `hono/logging` | Pino logging | `hono` | 替换基线 logger |
| `hono/http-hardening` | HTTP hardening | `hono` | timeout / body-limit / compress |

## Vue（13）

| id | 标题 | requires | group |
|---|---|---|---|
| `vue/router` | Vue Router | `vue` | — |
| `vue/pinia` | Pinia | `vue` | — |
| `vue/vueuse` | VueUse | `vue` | — |
| `vue/vueuse-router` | VueUse Router | `vue`, `vue/vueuse`, `vue/router` | — |
| `vue/i18n` | i18n | `vue` | — |
| `vue/query` | TanStack Query | `vue` | `vue/data` |
| `vue/colada` | Pinia Colada | `vue`, `vue/pinia` | `vue/data` |
| `vue/testing` | Testing | `vue` | — |
| `vue/tailwind` | Tailwind CSS | `vue` | `vue/css` |
| `vue/unocss` | UnoCSS | `vue` | `vue/css` |
| `vue/naive-ui` | Naive UI | `vue` | `vue/ui` |
| `vue/element-plus` | Element Plus | `vue` | `vue/ui` |
| `vue/shadcn-vue` | shadcn-vue | `vue`, `vue/tailwind` | `vue/ui` |

## Electron（1）

| id | 标题 | requires |
|---|---|---|
| `electron/builder` | electron-builder | `electron` |

## 互斥组

同一组内**只能选一个**，多选报 `E-CONFLICT`（退出码 2）：

| group | 成员 |
|---|---|
| `vue/data` | `vue/query` ⟂ `vue/colada` |
| `vue/css` | `vue/tailwind` ⟂ `vue/unocss` |
| `vue/ui` | `vue/naive-ui` ⟂ `vue/element-plus` ⟂ `vue/shadcn-vue` |

## 解析规则

1. **跨框架禁止混选**：features 横跨多个框架报 `E-MIXED-FRAMEWORK`。
2. **feature 必须属于所选框架**：否则报 `E-FEATURE-FRAMEWORK`。
3. **裸名解析**：全限定名精确匹配；裸名在名字唯一时匹配，跨框架同名时优先 `--framework` 指定的框架。
4. **框架推断**：未给 `--framework` 且 features 同属一个框架时自动推断。
5. **确定性**：同一组合、任意勾选顺序，渲染结果字节一致。

## 组装锚点（进阶）

Feature 通过锚点向骨架注入代码；锚点命名空间在单个框架内全局唯一。

| 框架 | 文件 | 锚点 |
|---|---|---|
| Hono | `src/index.ts` | `imports`, `middlewares`, `routes`, `error-handlers` |
| Hono | `vite.config.ts` | `vite-imports`, `vite-plugins`, `vite-config-extra` |
| Vue | `src/main.ts` | `imports`, `app-use` |
| Vue | `vite.config.ts` | `vite-imports`, `vite-plugins` |
| Vue | `src/App.vue` | `app-script`, `app-template` |
| Vue | `src/style.css` | `css-imports` |
| Electron | `src/main/index.ts` | `imports` |
| Electron | `vite.config.ts` | `vite-imports`, `vite-plugins` |

贡献块在锚点内按 `order` 排序，`order` 相同按稳定 id 排序。具体顺序与渲染语义见仓库 `docs/03-feature-wiring-spec.md`。

## 验证层级

| 层级 | 内容 | 频率 |
|---|---|---|
| Tier-1 | 离线枚举全组合、互斥与幂等断言 | 每次 `vp test` / PR |
| Tier-2 | blessed 组合生成 → install → build → check | PR 子集；nightly 全量 |
| Tier-3 | Hono 服务冒烟、Vue preview 200、Electron 解包启动 | nightly / 发布前 |
