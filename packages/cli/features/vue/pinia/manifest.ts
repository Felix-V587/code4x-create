import type { FeatureManifest } from "../../../src/domain/types.ts";

/** `vue/pinia` — state management. */
const piniaManifest: FeatureManifest = {
  id: "vue/pinia",
  title: "Pinia",
  description: "State management (adds pinia)",
  promptSection: "ecosystem",
  requires: [{ kind: "framework", id: "vue" }],
  targets: {
    vue: {
      files: [{ src: "files/src/stores/counter.ts", dest: "src/stores/counter.ts" }],
      wiring: [
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "pinia", named: ["createPinia"] },
        },
        {
          anchor: "app-use",
          order: 0,
          block: { kind: "call", callee: "app.use", expression: "createPinia()" },
        },
      ],
      packageJson: { dependencies: { pinia: "^4.0.0" } },
    },
  },
};

export default piniaManifest;
