// @code4x:begin vite-imports
// @code4x:end vite-imports
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, lazyPlugins } from 'vite-plus'

// `lazyPlugins` 让 Vite+ 在仅处理元数据的阶段（`vp check` / `vp fmt`）
// 跳过插件工厂；功能插件在回调内部装配。
export default defineConfig({
  resolve: {
    // `@/…` 映射到 `src/…`（与 `tsconfig.app.json` 的 `paths` 保持同步）。
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: lazyPlugins(() => [
    // Vite 插件。
    // @code4x:begin vite-plugins
    // @code4x:end vite-plugins
  ]),
  lint: {
    // UI 组件库的 unplugin 会在构建时生成这些文件；不要对它们做 lint/格式化。
    ignorePatterns: ['dist/**', 'auto-imports.d.ts', 'components.d.ts'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    singleQuote: true,
    semi: false,
    sortPackageJson: false,
    ignorePatterns: ['dist/**', '.code4xrc.json', 'auto-imports.d.ts', 'components.d.ts'],
  },
})
