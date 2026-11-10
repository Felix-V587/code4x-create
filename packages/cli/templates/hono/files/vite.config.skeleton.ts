// @code4x:begin vite-imports
// @code4x:end vite-imports
import build from '@hono/vite-build/node'
import devServer from '@hono/vite-dev-server'
import { defineConfig } from 'vite-plus'

// `PORT` 在加载此配置时读取：
//   - `vp dev` 将其作为开发服务器运行时端口；
//   - `@hono/vite-build/node` 会在构建时将它固化进构建产物
//     （运行 `vp build` 时设置 `PORT` 以更改构建后的端口）。
const port = Number(process.env.PORT ?? 3000)

export default defineConfig({
  server: {
    port,
  },
  // 功能特性贡献的额外顶层配置（例如来自 `hono/testing` 的 `test` 块）。
  // @code4x:begin vite-config-extra
  // @code4x:end vite-config-extra
  plugins: [
    // Vite 插件。
    // @code4x:begin vite-plugins
    // @code4x:end vite-plugins
  ],
  lint: {
    ignorePatterns: ['dist/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    // 与生成的源码风格保持一致（单引号、无分号），这样全新的 `vp check`
    // 无需重新格式化即可通过。
    singleQuote: true,
    semi: false,
    sortPackageJson: false,
    ignorePatterns: ['dist/**', '.code4xrc.json'],
  },
})
