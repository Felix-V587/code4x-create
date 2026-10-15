import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `vue/query` — TanStack Query (Vue).
 *
 * Mutually exclusive with `vue/colada` (`vue/data` group). Wires the plugin and
 * a shared query client into the entry.
 */
const queryManifest: FeatureManifest = {
  id: "vue/query",
  title: "TanStack Query",
  description: "Async state management (@tanstack/vue-query)",
  requires: [{ kind: "framework", id: "vue" }],
  group: "vue/data",
  targets: {
    vue: {
      files: [{ src: "files/src/lib/queryClient.ts", dest: "src/lib/queryClient.ts" }],
      packageJson: { dependencies: { "@tanstack/vue-query": "^5.104.0" } },
      // `@tanstack/vue-query` pulls `vue-demi`, whose postinstall must be
      // allowed or `pnpm install` fails with `ERR_PNPM_IGNORED_BUILDS`.
      workspaceYaml: { allowBuilds: { "vue-demi": true } },
      wiring: [
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "@tanstack/vue-query", named: ["VueQueryPlugin"] },
        },
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "./lib/queryClient", named: ["queryClient"] },
        },
        {
          anchor: "app-use",
          order: 0,
          block: { kind: "raw", code: "app.use(VueQueryPlugin, { queryClient })" },
        },
      ],
    },
  },
};

export default queryManifest;
