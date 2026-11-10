---
"@code4x/cli": minor
---

单仓库（monorepo / fullstack）生成物接入 Vite+ 任务运行器：根 `package.json` 增加 `vite-plus` 依赖，`build`/`test`/`typecheck`/`dev` 改用 `vp run -r`，`check` 改为整仓 `vp check`；新增根 `vite.config.ts`（monorepo 的 `defaultPackage`、脚本缓存、共享 lint/fmt）。Tier-2 子集新增 `vue-monorepo` 组合覆盖根构建链路。
