import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Only the package's own tests. Feature `files/` may ship `*.test.ts`
    // templates (e.g. `hono/testing`) that must not run against the repo.
    include: ["tests/**/*.test.ts"],
  },
  pack: {
    entry: ["src/index.ts", "src/cli.ts"],
    deps: {
      // tsdown <0.23 compatibility: resolve external dependency subpaths.
      // Remove to preserve subpath imports as written (the new default).
      // https://tsdown.dev/options/dependencies#deps-resolvedepsubpath
      resolveDepSubpath: true,
    },
    dts: {
      generator: "tsgo",
    },
    exports: true,
    // Ship the runtime templates + features inside dist so the built CLI can
    // read them. `flatten: false` preserves the directory tree.
    copy: [
      { from: "templates", flatten: false },
      { from: "features", flatten: false },
    ],
  },
});
