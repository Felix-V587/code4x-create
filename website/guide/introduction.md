# 介绍

**code4x** 是一个多框架项目脚手架，用法对标 [`create-vite`](https://github.com/vitejs/vite/tree/main/packages/create-vite)，但把「框架骨架」和「可选能力」拆成了两个独立维度：

- 先选框架：**Hono**（后端）、**Vue**（前端 SPA）、**Electron**（桌面端）；
- 再按需勾选能力：校验、OpenAPI、日志、测试、路由、状态管理、CSS 引擎、UI 套件（Reka UI / Naive UI / Element Plus / shadcn-vue）、打包等；
- 生成物默认使用 [Vite+](https://viteplus.dev/)（`vp`）工具链，`install → build → check` 开箱即用。

也可以用预设（preset）一次选定常用组合，例如 `-p vue-naive-tw`。

## 能生成什么

| 框架 | 基座 | 可选能力 | 预设 |
|---|---|---|---|
| Hono | requestId、统一错误信封、健康检查、优雅停机 | zod、api-guard、swagger-openapi、env、testing、logging、http-hardening | `hono-api`、`hono-standard`、`hono-full` |
| Vue | `@/` 别名、CSS 组装、Vite+ check | router、pinia、vueuse、vueuse-router、query / colada / alova（请求策略三选一）、testing、tailwind / unocss、reka-ui / naive-ui / element-plus / shadcn-vue | `vue-standard`、`vue-naive-tw`、`vue-element-tw`、`vue-shadcn-tw`、`vue-unocss-min`、`vue-full` |
| Electron | Vue 3 渲染层、类型化 IPC、`app://` 生产加载、单实例锁 | electron-builder | 无（用 `-f electron` 直接生成） |

完整的 id、依赖与互斥关系见 [Feature 矩阵](/reference/features)。

## 设计原则

### 确定性

同一组 answers（框架 + features + 选项）无论以什么顺序勾选，生成的字节完全一致。渲染器对贡献块做稳定排序，不依赖文件系统顺序或时间戳。

### 骨架 + 锚点

代码文件不做字符串替换。基座提供带 `// @code4x:begin <anchor>` / `// @code4x:end <anchor>` 标记的组装点，feature 以结构化贡献块（imports、middlewares、routes、package.json patch……）注入，渲染期按约定顺序拼装。

### 纯函数核心

`resolve`（解析闭包与冲突）与 `render`（拼装虚拟文件）是纯函数；文件系统、包管理器探测、git、安装都是薄 I/O 层。因此离线即可枚举全组合做测试。

### 不接管宿主策略

在已有 pnpm workspace 内生成时，不写 `pnpm-workspace.yaml`，而是把缺少的 `allowBuilds` 与可复用 `catalog` 以 stderr 提示交给你。详见 [在 workspace 中使用](/guide/workspace)。

## 与其它脚手架的关系

- **vs create-vite**：同样「一条命令 + 可选能力」，但能力不是模板分支的排列组合，而是可组合的 feature 清单。
- **vs create-hono**：基座更接近生产（requestId、错误信封、健康检查、优雅停机），并带可选 OpenAPI / 日志 / 加固。
- **vs create-t3-app**：t3 的 CI 矩阵需要手工维护笛卡尔积；code4x 的互斥规则与组合矩阵同源生成，避免漂移。

## 当前状态

- 版本 `0.1.0`，**尚未发布到 npm**；目前从仓库内构建使用，发布后入口为 `pnpm dlx @code4x/cli`。
- 支持 Node `>=22`（推荐 `26+`）、pnpm 12。
- 设计与决策文档在仓库 [`docs/`](https://github.com/Felix-V587/code4x-create/tree/main/docs)。

## 非目标（当前版本）

以下方向已明确不做或暂缓：

- React、Bun/Deno 变体、JS（非 TS）变体；
- 从远端拉取模板；
- 第三方插件 API；
- 给已有项目增量添加 feature（`.code4xrc.json` 已记录 sha256，为将来预留）；
- 一次生成完整的多应用 workspace（「场景 B」）。
