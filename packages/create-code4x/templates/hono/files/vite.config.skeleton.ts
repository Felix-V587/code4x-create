// @code4x:begin vite-imports
// @code4x:end vite-imports
import build from '@hono/vite-build/node'
import devServer from '@hono/vite-dev-server'
import { defineConfig } from 'vite-plus'

// `PORT` is read when this config loads:
//   - `vp dev` uses it as the live dev-server port (runtime);
//   - `@hono/vite-build/node` bakes it into the built server at BUILD time
//     (set `PORT` when running `vp build` to change the built port).
const port = Number(process.env.PORT ?? 3000)

export default defineConfig({
  server: {
    port,
  },
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
    // Match the generated source style (single quotes, no semicolons) so a
    // fresh `vp check` passes without reformatting.
    singleQuote: true,
    semi: false,
    sortPackageJson: false,
    ignorePatterns: ['dist/**', '.code4xrc.json'],
  },
})
