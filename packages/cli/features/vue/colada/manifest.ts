import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `vue/colada` — Pinia Colada.
 *
 * Mutually exclusive with `vue/query` (`vue/data` group). Pinia Colada installs
 * on top of Pinia, so `vue/pinia` is required (its `app.use(createPinia())`
 * sorts before `app.use(PiniaColada, {})` by dependency rank).
 */
const coladaManifest: FeatureManifest = {
  id: "vue/colada",
  title: "Pinia Colada",
  description: "Async state management for Pinia (@pinia/colada)",
  requires: [
    { kind: "framework", id: "vue" },
    { kind: "feature", id: "vue/pinia" },
  ],
  group: "vue/data",
  targets: {
    vue: {
      packageJson: { dependencies: { "@pinia/colada": "^1.4.0" } },
      wiring: [
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "@pinia/colada", named: ["PiniaColada"] },
        },
        {
          anchor: "app-use",
          order: 0,
          block: { kind: "raw", code: "app.use(PiniaColada, {})" },
        },
      ],
    },
  },
};

export default coladaManifest;
