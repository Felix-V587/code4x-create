import type { FeatureManifest } from "../../../src/domain/types.ts";

/** `vue/router` — client-side routing. */
const routerManifest: FeatureManifest = {
  id: "vue/router",
  title: "Vue Router",
  description: "Client-side routing (adds vue-router)",
  requires: [{ kind: "framework", id: "vue" }],
  targets: {
    vue: {
      files: [
        { src: "files/src/router/index.ts", dest: "src/router/index.ts" },
        { src: "files/src/views/Home.vue", dest: "src/views/Home.vue" },
      ],
      wiring: [
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "./router", defaultAs: "router" },
        },
        {
          anchor: "app-use",
          order: 0,
          block: { kind: "call", callee: "app.use", expression: "router" },
        },
        {
          anchor: "app-template",
          order: 0,
          block: { kind: "raw", code: "<router-view />" },
        },
      ],
      packageJson: { dependencies: { "vue-router": "^5.0.0" } },
    },
  },
};

export default routerManifest;
