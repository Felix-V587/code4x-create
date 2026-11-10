import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `vue/vueuse-router` — route-aware VueUse composables.
 *
 * Ships a standalone composable instead of wiring a (necessarily unused) import
 * into `src/main.ts`: injecting an unused import would fail the generated
 * project's `vp check` (`no-unused-vars`), the same reason `hono/env` stays
 * standalone. Requires both `vue/vueuse` and `vue/router`.
 */
const vueuseRouterManifest: FeatureManifest = {
  id: "vue/vueuse-router",
  title: "VueUse Router",
  description: "VueUse composables for vue-router (@vueuse/router)",
  promptSection: "ecosystem",
  requires: [
    { kind: "framework", id: "vue" },
    { kind: "feature", id: "vue/vueuse" },
    { kind: "feature", id: "vue/router" },
  ],
  targets: {
    vue: {
      files: [
        { src: "files/src/composables/useRouteQuery.ts", dest: "src/composables/useRouteQuery.ts" },
      ],
      packageJson: { dependencies: { "@vueuse/router": "^15.0.0" } },
    },
  },
};

export default vueuseRouterManifest;
