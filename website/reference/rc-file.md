# `.code4xrc.json`

每个生成项目的根目录都有一份 `.code4xrc.json`，记录生成时的完整计划。它有两个用途：

1. **复现**：知道当时用了哪些答案与 feature 闭包；
2. **将来增量添加 feature**：文件来源与 sha256 已预埋（当前版本尚未提供 `add` 命令）。

## 顶层结构

```json
{
  "generator": { "cliVersion": "0.1.0", "preset": "vue-naive-tw" },
  "answers": { },
  "plan": { "features": [], "sources": {}, "hashes": {} },
  "context": { "nestedWorkspace": false, "pmFrom": "default" },
  "workspace": { }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `generator.cliVersion` | string | 生成时使用的 CLI 版本 |
| `generator.preset` | string \| null | 使用的预设 id |
| `answers` | object | 归一化后的最终答案 |
| `plan.features` | string[] | 解析后的 feature 闭包（含依赖带入） |
| `plan.sources` | Record<string, string> | 每个文件来源：`assembly` / `base` / feature id |
| `plan.hashes` | Record<string, string> | 每个文件内容的 sha256（hex） |
| `context` | object | 生成上下文（是否嵌套 workspace、包管理器来源、宿主数据） |
| `workspace` | object? | 仅嵌套场景出现，记录 allowBuilds / catalog 的差异结果 |

`.code4xrc.json` 自身不计入 `plan.sources` / `plan.hashes`。

## `answers`

```json
{
  "targetDir": "apps/web",
  "projectName": "web",
  "framework": "vue",
  "features": ["vue/router", "vue/pinia", "vue/naive-ui", "vue/tailwind"],
  "packageManager": "pnpm",
  "install": false,
  "git": true,
  "variant": "ts",
  "preset": "vue-naive-tw"
}
```

- `variant` 仅在 config 显式提供 `"ts"` 时出现。
- `preset` 仅在使用了预设时出现。

## `plan.sources`

键是项目根相对路径，值是来源：

| 值 | 含义 |
|---|---|
| `assembly` | 由骨架 + 锚点组装生成 |
| `base` | 框架基座静态文件 |
| `<feature id>` | 该 feature 注入的文件，例如 `vue/pinia` |

## `context`

```json
{
  "nestedWorkspace": true,
  "pmFrom": "env",
  "host": {
    "catalog": { "vue": "^3.5.0" },
    "allowBuilds": ["esbuild"]
  }
}
```

| 字段 | 说明 |
|---|---|
| `nestedWorkspace` | 是否在既有 workspace 内生成 |
| `pmFrom` | 包管理器来源：`env`（环境变量）、`parent`（父级/宿主探测）、`default`（回落） |
| `host` | 仅嵌套场景：宿主 catalog 与 allowBuilds |

## `workspace`

仅嵌套场景：

```json
{
  "requiredAllowBuilds": ["esbuild", "vue-demi"],
  "missingAllowBuilds": ["vue-demi"],
  "catalogRewrites": ["vue"]
}
```

| 字段 | 说明 |
|---|---|
| `requiredAllowBuilds` | 本次生成需要的全部构建白名单 |
| `missingAllowBuilds` | 宿主缺少的项（stderr 提示依据） |
| `catalogRewrites` | 被改写为 `"catalog:"` 的依赖名 |

## 稳定性

rc 文件是生成物的元数据，不是公开 API。字段可能随版本增加；读取方应忽略未知字段，不要依赖字段顺序。
