import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `vue/alova` — Alova request strategy layer.
 *
 * Mutually exclusive with `vue/query` and `vue/colada` (`vue/data` group): the
 * three options all own the app's request/caching layer. Alova needs no
 * `app.use`; the generated `src/lib/alova.ts` instance is the shared entry.
 */
const alovaManifest: FeatureManifest = {
  id: "vue/alova",
  title: "Alova",
  description: "Request strategy library (alova 3, typed API + composables)",
  requires: [{ kind: "framework", id: "vue" }],
  group: "vue/data",
  targets: {
    vue: {
      files: [
        { src: "files/src/lib/alova.ts", dest: "src/lib/alova.ts" },
        { src: "files/src/api/todos.ts", dest: "src/api/todos.ts" },
        { src: "files/src/composables/useTodos.ts", dest: "src/composables/useTodos.ts" },
      ],
      packageJson: { dependencies: { alova: "^3.5.5" } },
    },
  },
};

export default alovaManifest;
