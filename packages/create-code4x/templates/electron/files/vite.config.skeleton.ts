import { defineConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'

// Single config, two tools:
//   - `vp build` / `vp dev` drive the Vue renderer rooted at `src/renderer`;
//   - `vp pack` (tsdown) bundles `src/main` + `src/preload` to CommonJS.
// The cast keeps `tsc`/`vue-tsc` happy: `@vitejs/plugin-vue` returns `vite`'s
// plugin type while `vite-plus`'s config expects its own; a plain object literal
// also trips a TS 5.9 overload-resolution bug.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [
    // Vite plugins.
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
    // An application does not ship types or a rewritten `exports` map.
    dts: false,
    exports: false,
    deps: {
      // `electron` is provided by the runtime, never bundled.
      neverBundle: ['electron'],
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
