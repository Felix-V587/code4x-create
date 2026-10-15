// @code4x:begin vite-imports
// @code4x:end vite-imports
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'

// The cast keeps `tsc`/`vue-tsc` happy: `@vitejs/plugin-vue` returns `vite`'s
// plugin type while `vite-plus`'s config expects its own; a plain object literal
// also trips a TS 5.9 overload-resolution bug.
export default defineConfig({
  resolve: {
    // `@/…` maps to `src/…` (kept in sync with `tsconfig.json` `paths`).
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    // Vite plugins.
    // @code4x:begin vite-plugins
    // @code4x:end vite-plugins
  ],
  lint: {
    // UI-kit unplugins generate these at build time; never lint/format them.
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
} as Parameters<typeof defineConfig>[0])
