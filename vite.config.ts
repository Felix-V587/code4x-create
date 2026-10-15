import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Only the package's own tests. Feature `files/` directories ship
    // `*.test.ts` template assets (e.g. hono/testing, vue/testing) that must
    // not run against the repo itself.
    include: ["packages/cli/tests/**/*.test.ts"],
  },
  lint: {
    ignorePatterns: [
      "packages/cli/templates/**",
      "packages/cli/features/**/files/**",
      "packages/cli/features/**/fragments/**",
      "docs/**",
      "fixtures/**",
      "**/dist/**",
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: [
      "packages/cli/templates/**",
      "packages/cli/features/**/files/**",
      "packages/cli/features/**/fragments/**",
      "docs/**",
      "fixtures/**",
      "**/dist/**",
    ],
  },
});
