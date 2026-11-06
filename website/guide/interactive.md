# 交互式流程

直接在终端运行（不带 `-y` / `--CI`）会进入交互模式。问题按固定顺序出现，已经通过参数、config 或预设确定的字段会跳过。

## 问题顺序

```text
N1 目标目录
N2 框架（Hono / Vue / Electron）
N4 可选能力（多选，可全不选）
N5 包管理器（默认 = 探测结果）
N6 是否安装依赖（默认 No）
N7 是否初始化 git（默认 Yes）
```

- `--framework vue` 只会跳过 N2，features 仍然会提问；想一次全定请用 `-y` 或 `-p`。
- features 多选只反映你实际勾选的内容；依赖闭包在解析阶段补齐，并在摘要中标注 `<hono/zod (required by swagger-openapi)>`。
- 交互语言为英文；参数与文档为中文。

## 目录冲突

目标目录非空（白名单 `.git` / `.DS_Store` / `.code4xrc.json` 之外有文件）时，会提供三选：

| 选项 | 行为 |
|---|---|
| Cancel | 中止，退出码 130 |
| Overwrite (clean) | 清空后重写 |
| Merge (skip-collisions) | 保留已有文件，只写入不冲突的文件 |

非交互模式没有 `--overwrite` 时直接报 `E-DIR-NOT-EMPTY`。

## 项目名归一化

目录名原样保留，`package.json#name` 会做归一化：小写、空格/下划线转 `-`、剥离非法字符与中文、压缩连续连字符；空结果回落 `my-app`。

例如目录 `My_API` → 目录仍是 `My_API`，包名是 `my-api`。发生归一化时会显示一行提示，但不会额外要求确认。

## 嵌套 git 仓库

如果目标目录位于一个已有 git 仓库内，会跳过 `git init` 并提示：

```text
note: inside existing repo, skipping git init
```

## 取消与中断

| 阶段 | 行为 |
|---|---|
| 提问中 Ctrl-C | 打印 `Operation cancelled`，退出码 `130`，不产生任何文件 |
| 写盘阶段中断 | 使用 staging 目录；下一次运行会清扫同前缀残留；目标目录出现即代表完整项目 |
| 安装阶段 Ctrl-C | 保留已生成文件，提示重新执行包管理器安装 |
| git 阶段 Ctrl-C | 保留目录，可手动删除 `.git` |

## 非交互语义

以下任一条件成立即为非交互：非 TTY、`-y` / `--yes`、`--CI`、`CI` 环境变量为真、`--no-interactive`。

非交互模式下：

- 非法值**不会**回退提问，而是硬错（`E-INVALID-VALUE`，退出码 2）；
- 缺失字段取 [默认值](/guide/cli#yes-默认值)；
- `targetDir` 缺失直接报 `E-DIR-REQUIRED`，不会静默选择 `./my-app`。

`--interactive` 可强制进入交互模式，适合在 CI 容器里手动调试。
