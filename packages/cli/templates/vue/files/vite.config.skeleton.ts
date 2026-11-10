// @code4x:begin vite-imports
// @code4x:end vite-imports
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig, lazyPlugins } from 'vite-plus'

// `lazyPlugins` lets Vite+ skip plugin factories during metadata-only passes
// (`vp check` / `vp fmt`); feature plugins are wired inside the callback.
export default defineConfig({
  resolve: {
    // `@/…` maps to `src/…` (kept in sync with `tsconfig.app.json` `paths`).
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: lazyPlugins(() => [
    // Vite plugins.
    // @code4x:begin vite-plugins
    // @code4x:end vite-plugins
  ]),
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
})
