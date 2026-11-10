import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `vue/colada` — Pinia Colada.
 *
 * Mutually exclusive with `vue/query` and `vue/alova` (`vue/data` group).
 * Pinia Colada installs on top of Pinia, so `vue/pinia` is required (its
 * `app.use(createPinia())` sorts before `app.use(PiniaColada, ...)` by
 * dependency rank).
 */
const coladaManifest: FeatureManifest = {
  id: "vue/colada",
  title: "Pinia Colada",
  description: "Async state management for Pinia (@pinia/colada)",
  promptSection: "data",
  requires: [
    { kind: "framework", id: "vue" },
    { kind: "feature", id: "vue/pinia" },
  ],
  group: "vue/data",
  targets: {
    vue: {
      files: [
        { src: "files/src/lib/colada.ts", dest: "src/lib/colada.ts" },
        { src: "files/src/api/todos.ts", dest: "src/api/todos.ts" },
        { src: "files/src/composables/useTodos.ts", dest: "src/composables/useTodos.ts" },
      ],
      packageJson: { dependencies: { "@pinia/colada": "^1.4.9" } },
      wiring: [
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "@pinia/colada", named: ["PiniaColada"] },
        },
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "./lib/colada", named: ["coladaOptions"] },
        },
        {
          anchor: "app-use",
          order: 0,
          block: { kind: "raw", code: "app.use(PiniaColada, coladaOptions)" },
        },
      ],
    },
  },
};

export default coladaManifest;
