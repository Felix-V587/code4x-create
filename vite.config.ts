import { defineConfig } from "vite-plus";

export default defineConfig({
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
