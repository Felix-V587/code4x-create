# FAQ

## 项目发布了吗？

还没有。版本为 `0.1.0`，发布流程（changesets、包元信息、演练）已就绪，但尚未发布到 npm。当前请从仓库构建使用，见 [快速开始](/guide/getting-started)。

## 为什么包名是 `@code4x/cli`，命令却是 `create-code4x`？

- npm 包名：`@code4x/cli`，用法是 `pnpm dlx @code4x/cli <dir>`。
- bin 名：`create-code4x`，延续 `create-*` 惯例，tarball 安装后可直接运行。

## 为什么 `pnpm create code4x` 不能用？

`pnpm create code4x` 会展开为 `create-code4x`，而本包名不是 `create-code4x`，因此不会映射。正确入口是 `pnpm dlx @code4x/cli`，或在 Vite+ 的 `create.templates` 中以全名 `@code4x/cli` 注册。

## 能给已有项目增量添加 feature 吗？

暂不支持。`.code4xrc.json` 已记录每个文件的来源与 sha256，为将来实现预留，但当前版本没有 `add` 命令。

## 支持 React / JS / Bun / Deno 吗？

不支持。当前是 TS-only、Node-only，框架为 Hono / Vue / Electron。Bun 变体是明确的后续方向（骨架级差异），React 与 JS 变体暂缓。

## 生成时会联网吗？

- 生成本身不访问网络；模板与 feature 资产随 CLI 打包。
- 如果加 `--install`，会调用包管理器安装依赖，这一步需要网络。
- Tier-1 组合矩阵完全离线。

## 生成是确定性的吗？

是。同一组 answers 无论勾选顺序如何，输出字节一致；文件内容不含时间戳或随机值。`.code4xrc.json` 中的 CLI 版本会随版本变化，这属于预期。

## 为什么 Vue 生成物有两个组件库不能同时选？

UI 套件共享同一个「主组件体系」槽位（`group: vue/ui`），混用会叠加两套样式与装配模型，因此设计为互斥。CSS 引擎（`group: vue/css`）与请求/数据层（`group: vue/data`）同理。

## 预设和 features 能一起用吗？

可以，但显式 `--features` 会替换预设的 features，预设的 framework 仍生效。见 [预设](/guide/presets#与-features-的关系)。

## 在 monorepo 里生成会写 `pnpm-workspace.yaml` 吗？

不会。嵌套场景由宿主负责 workspace 配置，生成器只在 stderr 提示缺失的 `allowBuilds` 与可复用 catalog。见 [在 workspace 中使用](/guide/workspace)。

## 如何报告问题或贡献？

请在 GitHub 仓库开 issue / PR：

- 仓库：<https://github.com/Felix-V587/code4x-create>
- 设计文档：<https://github.com/Felix-V587/code4x-create/tree/main/docs>

提交问题时请附上：CLI 版本、命令、完整 stderr、Node/pnpm 版本，以及 `.code4xrc.json`（如可分享）。
