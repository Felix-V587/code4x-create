# @code4x/cli

## 0.4.1

### Patch Changes

- b85ce03: 全栈快捷模式的 API 改用 `hono-full` 预设（增加 swagger-openapi、logging、http-hardening）；文档站补充各模式默认预设、Hono/Vue/Electron 预设展开与 Full-stack 应用组合。
- 1ec20a1: 全栈生成改为单仓库派生：app plan 统一按 `projectType: "monorepo"` 与 `renderApplication()` 渲染，全栈基线改用 `hono-standard` / `vue-standard` 等标准预设；monorepo/fullstack 统一做嵌套适配（移除 app 级 `pnpm` 策略、README 改写为 workspace 说明并去掉 app 级 `.code4xrc.json` 章节）。补充 Hono Vite 插件回归断言。

## 0.4.0

### Minor Changes

- be2f34e: 全栈单仓库新增可运行样板代码：`packages/shared-types`（共享 `Todo` / `ApiError` 等类型）、API `GET/POST /todos`、Web `Home.vue` 经 Alova 调用（开发期 `/api` 代理）、Desktop `app:todo` IPC；并生成根与各子项目 `AGENTS.md`（按技术栈列出官方 `llms.txt` 链接，无 llms.txt 的给出官方文档）。

## 0.3.0

### Minor Changes

- 0527f8a: 单仓库（monorepo / fullstack）生成物接入 Vite+ 任务运行器：根 `package.json` 增加 `vite-plus` 依赖，`build`/`test`/`typecheck`/`dev` 改用 `vp run -r`，`check` 改为整仓 `vp check`；新增根 `vite.config.ts`（monorepo 的 `defaultPackage`、脚本缓存、共享 lint/fmt）。Tier-2 子集新增 `vue-monorepo` 组合覆盖根构建链路。

## 0.2.0

### Minor Changes

- 7d011ae: Interactive project type (standalone / monorepo / full-stack), workspace-aware target folder selection (scans `packages`/`workspaces` patterns and offers folders plus a custom path), a guided Vue feature flow, `--monorepo` / `--fullstack` / `--app` flags, a Vite+ official `vue-ts` baseline, Vue feature changes (remove i18n; add default Reka UI), a standard full-stack workspace (Hono API + Vue web + Electron desktop), and Chinese comments in generated artifacts.
