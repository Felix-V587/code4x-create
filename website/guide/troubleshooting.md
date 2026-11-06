# 故障排查

## 退出码

| 码 | 含义 |
|---|---|
| `0` | 成功 |
| `1` | 域校验或生成错误 |
| `2` | usage 错误（参数、config、跨字段矛盾） |
| `130` | 用户取消 |

## 错误码

### 使用错误（退出码 2）

| 码 | 含义 | 处理 |
|---|---|---|
| `E-DIR-REQUIRED` | 非交互模式没有提供目标目录 | 在第一个参数给出目录，例如 `create-code4x my-api` |
| `E-INVALID-VALUE` | 参数值非法（未知框架、feature、模板等） | 检查拼写；`--json` 不能在交互模式使用 |
| `E-CONFLICT` | 同组 feature 冲突，或字段来源矛盾 | 二选一；位置参数与 `projectName` 只能留一个 |
| `E-AMBIGUOUS-LIST` | 裸 feature 名无法唯一解析 | 改用全限定名，例如 `vue/pinia` |
| `E-UNKNOWN-FRAMEWORK` | 未知框架 | 只能是 `hono` / `vue` / `electron` |
| `E-CONFIG-READ` | config 文件读不到 | 检查路径 |
| `E-CONFIG-PARSE` | config 不是合法 JSON 对象 | 修正 JSON |
| `E-CONFIG-KEY` | config 含未知键 | 只使用文档列出的键 |

### 生成错误（退出码 1）

| 码 | 含义 |
|---|---|
| `E-DIR-NOT-EMPTY` | 目标目录非空且未给 `--overwrite` |
| `E-OVERWRITE-REFUSED` | 目标目录不含 `.code4xrc.json`，拒绝覆盖 |
| `E-FEATURE-FRAMEWORK` | feature 属于其它框架 |
| `E-MIXED-FRAMEWORK` | features 横跨多个框架 |
| `E-MISSING-REQ` | feature 依赖未满足 |
| `E-CYCLE` | feature 依赖成环 |
| `E-UNK-ANCHOR` | feature 贡献到未知锚点 |
| `E-MARKER` | 骨架标记块损坏 |
| `E-DEP-VERSION` | 两个 feature 要求同一依赖的不同版本 |
| `E-SCRIPT-KEY` | 两个 feature 写入同名 script |
| `E-IMPORT-CONFLICT` | import 名称冲突 |
| `E-STMT-DUP` | 不同贡献块产生重复语句 |
| `E-FILE-WRITE` | 写盘失败（权限、磁盘等） |
| `E-SINGLE-SLOT` / `E-PLUGIN-WRITE` | 预留机制，当前生成流程不会触发 |

> 出现 `E-*` 时，错误信息通常带 `fix:` 行，直接按提示调整即可。

## 常见问题

### `ERR_PNPM_IGNORED_BUILDS`

pnpm 12 默认不执行依赖的构建脚本。生成物已通过 `pnpm-workspace.yaml` 的 `allowBuilds` 声明所需项（如 `esbuild`、`electron`、`vue-demi`）。如果宿主 workspace 缺少对应项，生成时会用 stderr 列出来，补进宿主的 `pnpm-workspace.yaml` 即可：

```yaml
allowBuilds:
  vue-demi: true
```

### 在仓库里运行 `npm` 报 `EBADDEVENGINES`

根 `package.json` 通过 `devEngines.packageManager` 固定了 pnpm。请改用 `pnpm` 或 `vp`，不要用 npm。

### Electron 开发端口冲突

`pnpm dev` 固定使用 5173。端口被占用时会直接失败（这是刻意设计）；先释放端口，或修改 `scripts/dev.mjs` 与 `vite.config.ts` 中的端口。

### Linux 下 Electron 起不来

- 无显示环境时使用 `xvfb-run -a pnpm dev`。
- 容器中通常需要 `--no-sandbox`（Tier-3 冒烟脚本已处理）。
- 托盘等桌面集成能力尚未提供，不同桌面环境的支持不在承诺范围内。

### 目录非空 / 想重新生成

```bash
# 只允许覆盖之前由 code4x 生成的目录
node packages/cli/dist/cli.mjs my-app -f vue --overwrite -y
```

如果不是 code4x 生成的目录，请换一个目标目录；脚手架不会强制删除用户项目。

### Windows 保留名

`con` / `nul` 等保留名不做特殊处理，文件系统报错会直接透传。换一个目录名即可。

### 生成物里为什么没有 `--help`

当前版本尚未内置 `--help`；请以本手册的 [CLI 与参数](/guide/cli) 为准，或在仓库中查看 `packages/cli/README.md`。
