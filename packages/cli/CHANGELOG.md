# @code4x/cli

## 0.3.0

### Minor Changes

- 0527f8a: 单仓库（monorepo / fullstack）生成物接入 Vite+ 任务运行器：根 `package.json` 增加 `vite-plus` 依赖，`build`/`test`/`typecheck`/`dev` 改用 `vp run -r`，`check` 改为整仓 `vp check`；新增根 `vite.config.ts`（monorepo 的 `defaultPackage`、脚本缓存、共享 lint/fmt）。Tier-2 子集新增 `vue-monorepo` 组合覆盖根构建链路。

## 0.2.0

### Minor Changes

- 7d011ae: Interactive project type (standalone / monorepo / full-stack), workspace-aware target folder selection (scans `packages`/`workspaces` patterns and offers folders plus a custom path), a guided Vue feature flow, `--monorepo` / `--fullstack` / `--app` flags, a Vite+ official `vue-ts` baseline, Vue feature changes (remove i18n; add default Reka UI), a standard full-stack workspace (Hono API + Vue web + Electron desktop), and Chinese comments in generated artifacts.
