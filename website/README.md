# @code4x/docs

code4x 的用户手册，使用 [VitePress](https://vitepress.dev/) 构建。

## 本地开发

```bash
pnpm -C website install
pnpm -C website dev
```

构建与预览：

```bash
pnpm -C website build
pnpm -C website preview
```

根目录也提供等价脚本：`pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:preview`。

## 说明

- `website/` 是**独立**的 pnpm 项目（有自己的 `pnpm-workspace.yaml` 与 lockfile），不属于根 workspace；根 `vp install` 不会安装它。
- 页面都在 `website/` 下：`guide/` 为用户指南，`reference/` 为参考，`index.md` 是首页。
- 构建产物在 `website/.vitepress/dist/`（已 gitignore）。

## 部署

`.github/workflows/docs.yml` 在 `main` 分支的 `website/**` 变更时构建并部署到 GitHub Pages：

- `DOCS_BASE=/code4x-create/`（项目页路径）。若改用自定义域名，把它改成 `/`。
- 首次部署前需在仓库 **Settings → Pages → Source** 选择 **GitHub Actions**。
