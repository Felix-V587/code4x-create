// @code4x:begin vite-imports
// @code4x:end vite-imports
import { defineConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'

// The cast keeps `tsc`/`vue-tsc` happy: `@vitejs/plugin-vue` returns `vite`'s
// plugin type while `vite-plus`'s config expects its own; a plain object literal
// also trips a TS 5.9 overload-resolution bug.
export default defineConfig({
  plugins: [
    // Vite plugins.
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
    singleQuote: true,
    semi: false,
    sortPackageJson: false,
    ignorePatterns: ['dist/**', '.code4xrc.json'],
  },
} as Parameters<typeof defineConfig>[0])
