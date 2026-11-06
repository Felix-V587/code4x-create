# 生成后的项目

## 你会得到什么

- 一个完整可运行的项目目录（`package.json`、源码、配置、README、`.gitignore`）。
- 可选的依赖安装与 `git init`（取决于 `--install` / `--git`）。
- 一份 `.code4xrc.json`，记录本次生成的完整计划与文件哈希。

生成器**不会**写入 `node_modules`（除非 `--install`）或构建产物，也不会写入目标目录之外的文件；依赖安装产生的 store / `node_modules` 由包管理器负责。

## `.code4xrc.json`

每个生成项目根目录都有一份：

```json
{
  "generator": { "cliVersion": "0.1.0", "preset": "vue-naive-tw" },
  "answers": {
    "projectName": "my-web",
    "framework": "vue",
    "features": ["vue/pinia", "vue/router", "vue/naive-ui", "vue/tailwind"],
    "packageManager": "pnpm",
    "install": false,
    "git": true
  },
  "plan": {
    "features": ["vue/pinia", "vue/router", "vue/naive-ui", "vue/tailwind"],
    "sources": { "src/main.ts": "assembly", "src/stores/counter.ts": "vue/pinia" },
    "hashes": { "src/main.ts": "c8f…e91", "package.json": "1bd…44a" }
  }
}
```

| 字段 | 说明 |
|---|---|
| `generator.cliVersion` | 生成时使用的 CLI 版本 |
| `generator.preset` | 使用的预设（没有则为 `null`） |
| `answers` | 归一化后的最终答案 |
| `plan.features` | **解析后的闭包**（显式勾选 + 依赖带入） |
| `plan.sources` | 每个文件来自 assembly 还是哪个 feature |
| `plan.hashes` | 文件内容的 sha256 |
| `context` / `workspace` | 仅嵌套场景出现，见 [在 workspace 中使用](/guide/workspace) |

保留这份文件有两个作用：复现生成参数，以及为将来「给已有项目增量添加 feature」预留比对依据。

## 常用脚本

| 框架 | 脚本 |
|---|---|
| Hono | `dev` / `build` / `start` / `typecheck` / `check`（+ `test`） |
| Vue | `dev` / `build` / `preview` / `typecheck` / `check`（+ `test`） |
| Electron | `dev` / `build` / `start` / `typecheck` / `check`（+ `dist` / `dist:dir`） |

`check` 统一是 `vp check`（格式化 + lint + 类型检查）；Hono/Vue 的 `build` 分别是 `vp build` 与 `vue-tsc --noEmit && vite build`。

## 重新生成 / 覆盖

- 目标目录非空时，非交互模式需要 `--overwrite`。
- `--overwrite` 只允许覆盖包含 `.code4xrc.json` 的目录（即之前由 code4x 生成），防止误删用户项目。
- 覆盖会清空目录后重写；交互模式还提供「Merge (skip-collisions)」保留已有文件。

## 生成物不包含

- 远端模板或网络下载的代码（除依赖安装）。
- React / JS / Bun / Deno 变体。
- 已有项目的增量 feature 迁移。
