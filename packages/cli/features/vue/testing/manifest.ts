import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `vue/testing` — Vitest + Vue Test Utils.
 *
 * Adds the test runner dependency, a DOM environment (`happy-dom`), a
 * `vp test` script and a self-contained component test asset. The asset is a
 * template file under `files/`, so the scaffold repository's own test run never
 * executes it (the root `vp test` include is scoped to
 * `packages/cli/tests/**`).
 *
 * The shipped `src/App.test.ts` selects its DOM via a per-file
 * `// @vitest-environment happy-dom` annotation and mounts an inline component,
 * so it stays green regardless of which other features (router / i18n / UI kit)
 * the selected preset installs, without needing a new vite-config anchor.
 */
const testingManifest: FeatureManifest = {
  id: "vue/testing",
  title: "Testing",
  description: "Vitest + @vue/test-utils example (happy-dom)",
  promptSection: "ecosystem",
  requires: [{ kind: "framework", id: "vue" }],
  targets: {
    vue: {
      files: [{ src: "files/src/App.test.ts", dest: "src/App.test.ts" }],
      packageJson: {
        scripts: { test: { set: "vp test" } },
        devDependencies: {
          "@vue/test-utils": "^2.5.0",
          "happy-dom": "^21.0.0",
          vitest: "^5.0.0",
        },
      },
    },
  },
};

export default testingManifest;
