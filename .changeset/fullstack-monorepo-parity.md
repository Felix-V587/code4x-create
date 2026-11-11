---
"@code4x/cli": minor
---

全栈生成改为单仓库派生：app plan 统一按 `projectType: "monorepo"` 与 `renderApplication()` 渲染，全栈基线改用 `hono-standard` / `vue-standard` 等标准预设；monorepo/fullstack 统一做嵌套适配（移除 app 级 `pnpm` 策略、README 改写为 workspace 说明并去掉 app 级 `.code4xrc.json` 章节）。补充 Hono Vite 插件回归断言。
