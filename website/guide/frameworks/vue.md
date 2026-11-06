# Vue

生成一个 Vue 3 + Vite 的 SPA，默认带 `@/` 别名与可组装的 `src/style.css`，生成后 `vp check`（含 `vue-tsc`）开箱通过。

## 生成结构

```text
my-web/
├── src/
│   ├── main.ts          # 组装点：imports / app-use
│   ├── App.vue          # 组装点：app-template / app-script
│   ├── style.css        # 组装点：css-imports（CSS 引擎与主题注入）
│   ├── router/          # 选择 vue/router 时
│   ├── stores/          # 选择 vue/pinia 时
│   ├── locales/         # 选择 vue/i18n 时
│   └── components/ui/   # 选择 vue/shadcn-vue 时
├── index.html
├── vite.config.ts
├── package.json
├── tsconfig.json
└── .gitignore
```

`@/` 指向 `src/`：`tsconfig` 的 `paths`（无 `baseUrl`）+ `vite.config` 的 `resolve.alias`。

## 核心能力

| Feature | 说明 | 备注 |
|---|---|---|
| `vue/router` | `vue-router` 经典 `createRouter` | 非文件路由 |
| `vue/pinia` | 状态管理 + `src/stores/counter.ts` | — |
| `vue/vueuse` | `@vueuse/core` | 仅依赖 |
| `vue/vueuse-router` | `@vueuse/router` 组合式函数 | requires vueuse + router |
| `vue/i18n` | `vue-i18n`（`legacy:false`）+ unplugin 自动导入 | 生成 `src/locales/{en,zh-CN}.ts` |
| `vue/query` ⟂ `vue/colada` | 数据层二选一 | `group: vue/data` |
| `vue/testing` | Vitest + `@vue/test-utils` + happy-dom | 示例测试自包含 |

## CSS 引擎与 UI 套件

CSS 引擎二选一（`group: vue/css`）：

| Feature | 说明 |
|---|---|
| `vue/tailwind` | Tailwind CSS v4，CSS-first（`@import "tailwindcss"` + `@theme`） |
| `vue/unocss` | UnoCSS + `presetWind4`，经入口 JS `import 'virtual:uno.css'` |

UI 套件三选一（`group: vue/ui`）：

| Feature | 说明 |
|---|---|
| `vue/naive-ui` | 默认推荐；resolver + AutoImport |
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
| `vue-standard` | router + pinia + vueuse + i18n |
| `vue-naive-tw` | standard + naive-ui + tailwind（默认推荐） |
| `vue-element-tw` | standard + element-plus + tailwind |
| `vue-shadcn-tw` | standard + tailwind + shadcn-vue |
| `vue-unocss-min` | router + pinia + unocss |
| `vue-full` | standard + query + testing |

## 常用命令

```bash
pnpm dev          # vite
pnpm build        # vue-tsc --noEmit && vite build
pnpm preview      # vite preview
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
node packages/cli/dist/cli.mjs my-web -f vue --features router,pinia,i18n,tailwind,shadcn-vue -y
```
