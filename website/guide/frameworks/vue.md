# Vue

生成一个 Vue 3 + Vite 的 SPA，配置基线对齐 Vite+ 官方 `vue-ts` 模板：`@vue/tsconfig` + project references、`vue-tsc -b`、`lazyPlugins`，并保留 `@/` 别名与可组装的 `src/style.css`。生成后 `vp check`（含 `vue-tsc`）开箱通过。

## 生成结构

```text
my-web/
├── src/
│   ├── main.ts          # 组装点：imports / app-use
│   ├── App.vue          # 组装点：app-template / app-script
│   ├── style.css        # 组装点：css-imports（CSS 引擎与主题注入）
│   ├── router/          # 选择 vue/router 时
│   ├── stores/          # 选择 vue/pinia 时
│   ├── components/      # reka-ui 示例 / shadcn-vue 组件
├── index.html
├── vite.config.ts
├── package.json
├── tsconfig.json          # files: [] + references
├── tsconfig.app.json      # extends @vue/tsconfig/tsconfig.dom.json
├── tsconfig.node.json     # vite.config.ts
├── .vscode/extensions.json
└── .gitignore
```

`@/` 指向 `src/`：`tsconfig.app.json` 的 `paths`（无 `baseUrl`）+ `vite.config` 的 `resolve.alias`。

## Vite+ 基座（对齐官方 vue-ts 模板）

- `tsconfig.json` 只做 project references；应用侧 `tsconfig.app.json` extends `@vue/tsconfig/tsconfig.dom.json`（`types: ["vite/client"]`、`paths`、auto-import dts），Vite 配置侧独立 `tsconfig.node.json`。
- `build` 为 `vue-tsc -b && vp build`，`typecheck` 为 `vue-tsc -b`；`dev` / `preview` 走 `vp dev` / `vp preview`。
- `vite.config.ts` 使用 `vite-plus` 的 `lazyPlugins(() => [...])`，feature 插件注入在回调内；metadata-only 的 `vp check` / `vp fmt` 不会执行插件工厂。
- `vite` 通过 `npm:@voidzero-dev/vite-plus-core@^1.5.0` 别名与 `vite-plus` 同版本锁定；npm/Bun 用 `overrides`、Yarn 用 `resolutions` 固定同一 alias（嵌套 workspace 命中宿主 catalog 时会自动改写为 `"catalog:"`）。
- 生成物 `pnpm-workspace.yaml` 写入 `peerDependencyRules.allowedVersions.vite: "*"`，避免 alias 版本号（1.5.x）与插件声明的 Vite 8 peer 范围产生告警（pnpm `peers check` 通过）。

## 核心能力

| Feature | 说明 | 备注 |
|---|---|---|
| `vue/router` | `vue-router` 经典 `createRouter` | 非文件路由 |
| `vue/pinia` | 状态管理 + `src/stores/counter.ts` | — |
| `vue/vueuse` | `@vueuse/core` | 仅依赖 |
| `vue/vueuse-router` | `@vueuse/router` 组合式函数 | requires vueuse + router |
| `vue/query` ⟂ `vue/colada` ⟂ `vue/alova` | 请求 / 数据层三选一 | `group: vue/data` |
| `vue/testing` | Vitest + `@vue/test-utils` + happy-dom | 示例测试自包含 |

### 请求策略（三选一）

| 选项 | 生成的基础配置 |
|---|---|
| `vue/query` | `src/lib/queryClient.ts` + `app.use(VueQueryPlugin, { queryClient })` |
| `vue/colada` | `src/lib/colada.ts`（全局 `staleTime`）+ `app.use(PiniaColada, coladaOptions)`（requires `vue/pinia`） |
| `vue/alova` | `src/lib/alova.ts`（baseURL / timeout / fetch adapter / 非 2xx 归一化）+ `src/api/todos.ts` + `src/composables/useTodos.ts` |

- 三者共享 `group: vue/data`，只能选一个。
- Colada 与 Alova 都附带 `src/api/todos.ts` 与 `useTodos()` 示例，替换为真实 API 即可。
- `baseURL` 读取 `VITE_API_BASE_URL`，默认 `/api`：

```bash
VITE_API_BASE_URL=https://api.example.com pnpm dev
```

## CSS 引擎与 UI 套件

CSS 引擎二选一（`group: vue/css`）：

| Feature | 说明 |
|---|---|
| `vue/tailwind` | Tailwind CSS v4，CSS-first（`@import "tailwindcss"` + `@theme`） |
| `vue/unocss` | UnoCSS + `presetWind4`，经入口 JS `import 'virtual:uno.css'` |

UI 套件四选一（`group: vue/ui`）：

| Feature | 说明 |
|---|---|
| `vue/reka-ui` | 默认推荐；无样式、可访问的组件原语 + Dialog 示例 |
| `vue/naive-ui` | resolver + AutoImport |
| `vue/element-plus` | 双 resolver + `importStyle: 'css'` |
| `vue/shadcn-vue` | copy-paste 组件栈，requires `vue/tailwind` |

> 同一 group 内多选会报 `E-CONFLICT`（退出码 2）。

### shadcn-vue 说明

`vue/shadcn-vue` 是 **vendored 基线**，不依赖 `shadcn-vue` npm 包，也不在生成期调用 CLI：

- `components.json`（`new-york` 风格，样式输出到 `src/style.css`）
- `src/lib/utils.ts` 的 `cn()`
- 基线组件：`ui/button`、`ui/card`、`ui/input`
- 主题块通过 `css-imports` 以 order 10 注入（排在 Tailwind 之后）

## 预设

| 预设 | 内容 |
|---|---|
| `vue-standard` | router + pinia + vueuse |
| `vue-naive-tw` | standard + naive-ui + tailwind（常用推荐） |
| `vue-element-tw` | standard + element-plus + tailwind |
| `vue-shadcn-tw` | standard + tailwind + shadcn-vue |
| `vue-unocss-min` | router + pinia + unocss |
| `vue-full` | standard + query + testing |

## 常用命令

```bash
pnpm dev          # vp dev
pnpm build        # vue-tsc -b && vp build
pnpm preview      # vp preview
pnpm typecheck    # vue-tsc -b
pnpm check        # vp check
pnpm test         # 仅当选择 vue/testing 时存在
```

## 组合示例

```bash
# 默认推荐
node packages/cli/dist/cli.mjs my-web -p vue-naive-tw -y

# Element Plus
node packages/cli/dist/cli.mjs my-web -p vue-element-tw -y

# 只要路由与状态管理
node packages/cli/dist/cli.mjs my-web -p vue-unocss-min -y

# 自定义组合
node packages/cli/dist/cli.mjs my-web -f vue --features router,pinia,tailwind,shadcn-vue -y
```
