// @code4x:begin vite-imports
// @code4x:end vite-imports
import { defineConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'

// 单一配置，两套工具：
//   - `vp build` / `vp dev` 驱动以 `src/renderer` 为根目录的 Vue 渲染进程；
//   - `vp pack`（tsdown）将 `src/main` + `src/preload` 打包为 CommonJS。
// 这里的类型断言是为了让 `tsc`/`vue-tsc` 通过检查：`@vitejs/plugin-vue` 返回的
// 是 `vite` 的插件类型，而 `vite-plus` 的配置期望自己的插件类型；直接写对象字面量
// 还会触发 TS 5.9 的重载解析 bug。
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [
    // Vite 插件。
    // @code4x:begin vite-plugins
    // @code4x:end vite-plugins
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  pack: {
    entry: {
      'main/index': 'src/main/index.ts',
      'preload/index': 'src/preload/index.ts',
    },
    format: ['cjs'],
    platform: 'node',
    outDir: 'dist',
    // 应用程序不需要发布类型声明，也不需要重写 `exports` 映射。
    dts: false,
    exports: false,
    deps: {
      // `electron` 由运行时提供，绝不打包。
      neverBundle: ['electron'],
      // `zod` 是运行时 `dependencies` 依赖，tsdown 默认会把它外部化。
      // 但沙箱中的 preload 无法 `require()` 外部模块，因此强制将其打入
      // 产物：`dist/preload/index.cjs` 保持自包含。
      alwaysBundle: ['zod'],
    },
  },
  lint: {
    ignorePatterns: ['dist/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    singleQuote: true,
    semi: false,
    sortPackageJson: false,
    ignorePatterns: ['dist/**', '.code4xrc.json'],
  },
} as Parameters<typeof defineConfig>[0])
