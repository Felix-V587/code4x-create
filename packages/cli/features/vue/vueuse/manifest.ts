import type { FeatureManifest } from "../../../src/domain/types.ts";

/** `vue/vueuse` — VueUse core composables. Dependency only, no wiring. */
const vueuseManifest: FeatureManifest = {
  id: "vue/vueuse",
  title: "VueUse",
  description: "Collection of Vue composition utilities (@vueuse/core)",
  promptSection: "ecosystem",
  requires: [{ kind: "framework", id: "vue" }],
  defaults: true,
  targets: {
    vue: {
      packageJson: { dependencies: { "@vueuse/core": "^15.0.0" } },
    },
  },
};

export default vueuseManifest;
