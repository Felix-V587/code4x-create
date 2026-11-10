# CLI 与参数

## 两种模式

| 模式 | 触发条件 | 行为 |
|---|---|---|
| 交互式 | stdin 是 TTY，且没有 `-y` / `--CI` / `CI` 环境变量 / `--no-interactive` | 逐项提问补齐未提供的字段 |
| 非交互 | 非 TTY、`-y`、`--CI`、`CI=true` 或 `--no-interactive` | 缺失字段取默认值；`targetDir` 缺失直接报 `E-DIR-REQUIRED` |

`--interactive` 可强制覆盖 CI/非 TTY 判定。

## 参数总览

| 参数 | 取值 | 说明 |
|---|---|---|
| `<dir>` | 相对 / 绝对路径 | 目标目录（位置参数；Monorepo 下为 workspace 根） |
| `--monorepo` / `--no-monorepo` | boolean | 生成单仓库（pnpm workspace）项目；交互式默认询问项目类型 |
| `--app <name>` | 目录名 | Monorepo 应用名（`apps/<name>`）；缺省按框架取 `api` / `web` / `desktop` |
| `-f, --framework` | `hono` \| `vue` \| `electron` | 选择框架；未给且 features 同属一个框架时可自动推断 |
| `--features` | 逗号分隔 | 全限定名或裸名；`none` 表示清空 |
| `-p, --preset` | 预设 id | 见 [预设](/guide/presets) |
| `--pm` | `npm` \| `pnpm` \| `yarn` \| `bun` | 包管理器；未给则探测（user-agent / lockfile），失败回落 `npm` |
| `--install` / `--no-install` | boolean | 生成后是否执行安装；`-y` 默认否 |
| `--git` / `--no-git` | boolean | 是否 `git init`；`-y` 默认是 |
| `-y, --yes` | — | 全默认非交互 |
| `--CI` | — | 与 `-y` 同义，并标记 CI 环境 |
| `--interactive` | — | 强制交互，覆盖 CI/非 TTY 判定 |
| `--config <file>` | JSON 文件 | 从文件读取字段，见下 |
| `--template <name>` | 框架名或预设 id | 兼容别名：框架名 → `--framework`，预设 id → `--preset` |
| `--dry-run` | — | 只解析与渲染，不写盘；打印将写入的文件数 |
| `--json` | — | 向 stdout 输出机器可读计划（仅非交互） |
| `--overwrite` | — | 允许覆盖已有目录（护栏见下） |

布尔参数支持 `--no-<name>` 形式；重复参数按 last-wins 处理。

## 取值优先级

```text
flag > config 文件 > preset > 交互中用户输入 > 内置默认
```

- **preset 只携带 `framework` + `features`**。一旦显式给出 `--features`，它会**替换** preset 的 features；preset 的 framework 仍然生效。
- framework 可按 features 反推（例如 `--features zod` → Hono）；跨框架混选会报 `E-MIXED-FRAMEWORK`。
- `CI` 环境变量只切换模式与包管理器探测，不会绑定 answers 字段。

## `--yes` 默认值

| 字段 | 默认 |
|---|---|
| `targetDir` | **必须提供**（否则 `E-DIR-REQUIRED`） |
| `projectType` | `standalone`；用 `--monorepo` 切换 |
| `appName` | Monorepo 下按框架取 `api` / `web` / `desktop` |
| `framework` | `hono` |
| `features` | 空（要用 batteries 请显式给 `-p`） |
| `packageManager` | 探测结果；失败为 `npm`；Monorepo 固定 `pnpm` |
| `install` | `false` |
| `git` | `true` |

执行前会打印完整 plan，因此 `-y` 不是「静默」，而是「记录在案的默认」。

## features 语法

```bash
# 全限定名
--features hono/zod,hono/swagger-openapi

# 裸名（名字唯一时解析；跨框架同名时优先 --framework 指定的框架）
--features zod,swagger-openapi

# 清空
--features none
```

依赖会自动补齐闭包，例如 `hono/swagger-openapi` 会带入 `hono/zod`；`vue/shadcn-vue` 会带入 `vue/tailwind`。

## 单仓库（Monorepo）模式

```bash
node packages/cli/dist/cli.mjs my-workspace --monorepo --app web -f vue -p vue-naive-tw -y
```

- 目标目录是 workspace 根，应用生成到 `apps/<appName>`（默认按框架取 `api` / `web` / `desktop`）。
- 根包名默认取目标目录名；若与应用名相同则追加 `-workspace`，避免 `pnpm --filter` 歧义。
- 根 `package.json` 的脚本转发到应用（`pnpm --filter ./apps/<appName> <script>`）。
- 根 `pnpm-workspace.yaml` 声明 `apps/*`、`packages/*` 并写入应用所需的 `allowBuilds`。
- 包管理器固定 pnpm；`--pm npm` 等会报 `E-INVALID-VALUE`。
- 安装与 `git init` 在 workspace 根执行；`.code4xrc.json` 也位于根，`plan.sources` 路径带 `apps/<appName>/` 前缀。
- 交互式只需在第一个问题选择 **Monorepo project**，目标文件夹与应用名随后分别提问。

详见 [在 workspace 中使用](/guide/workspace)。

## `--config`

支持以下键：`targetDir`、`projectName`、`framework`、`features`、`packageManager`、`install`、`git`、`preset`、`variant`（仅 `"ts"`）、`monorepo`（boolean）、`appName`（string）。

```json
{
  "framework": "vue",
  "preset": "vue-naive-tw",
  "packageManager": "pnpm",
  "install": true,
  "git": false
}
```

```bash
create-code4x my-web --config ./scaffold.json -y
```

- 未知键报 `E-CONFIG-KEY`；文件不存在 / 非法 JSON 报 `E-CONFIG-READ` / `E-CONFIG-PARSE`。
- 位置参数与 `projectName` 同时出现会报 `E-CONFLICT`（二者只能留一个）。

## `--json`

仅是非交互路径合法。输出形如：

```json
{
  "answers": {
    "targetDir": "my-api",
    "projectName": "my-api",
    "projectType": "standalone",
    "framework": "hono",
    "features": ["hono/zod"],
    "packageManager": "pnpm",
    "install": false,
    "git": true
  },
  "plan": {
    "files": [{ "path": "package.json", "source": "assembly", "hash": "…" }],
    "features": { "explicit": ["hono/zod"], "resolved": ["hono/zod"] }
  },
  "nextSteps": ["cd my-api", "pnpm install — skipped (--no-install)", "pnpm dev"]
}
```

提示性 note 一律走 stderr，stdout 只保留 JSON。

## `--overwrite`

- 目标目录非空且不在白名单（仅 `.git`、`.DS_Store`、`.code4xrc.json`）时：非交互模式报 `E-DIR-NOT-EMPTY`。
- `--overwrite` 只允许覆盖**包含 `.code4xrc.json`** 的目录（即之前由 code4x 生成的目录），否则报 `E-OVERWRITE-REFUSED`。
- 交互模式提供 `Cancel / Overwrite (clean) / Merge (skip-collisions)` 三选。

## 退出码

| 码 | 含义 |
|---|---|
| `0` | 成功 |
| `1` | 域校验或生成错误（大部分 `E-*`） |
| `2` | usage 错误（参数解析、config、跨字段矛盾） |
| `130` | 用户取消（Ctrl-C） |

完整错误码见 [故障排查](/guide/troubleshooting)。
