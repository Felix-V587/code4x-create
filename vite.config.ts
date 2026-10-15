import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    // Only the package's own tests. Feature `files/` directories ship
    // `*.test.ts` template assets (e.g. hono/testing, vue/testing) that must
    // not run against the repo itself.
    include: ["packages/create-code4x/tests/**/*.test.ts"],
  },
  lint: {
    ignorePatterns: [
      "packages/create-code4x/templates/**",
      "packages/create-code4x/features/**/files/**",
      "packages/create-code4x/features/**/fragments/**",
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
      "packages/create-code4x/templates/**",
      "packages/create-code4x/features/**/files/**",
      "packages/create-code4x/features/**/fragments/**",
      "docs/**",
      "fixtures/**",
      "**/dist/**",
    ],
  },
});
