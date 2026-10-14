import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `hono/testing` — Vitest example using Hono's built-in `app.request()`.
 *
 * No new runtime dependency: Vitest comes from the vp toolchain and tests
 * import from `vite-plus/test`. The Vitest config is contributed as a `test`
 * block into the `vite-config-extra` anchor of the (assembled) vite.config.
 */
const testingManifest: FeatureManifest = {
  id: "hono/testing",
  title: "Testing",
  description: "Vitest example (app.request()) + test config",
  requires: [{ kind: "framework", id: "hono" }],
  targets: {
    hono: {
      files: [{ src: "files/src/app.test.ts", dest: "src/app.test.ts" }],
      packageJson: {
        scripts: { test: { set: "vp test" } },
      },
      wiring: [
        {
          anchor: "vite-config-extra",
          order: 0,
          block: {
            kind: "raw",
            code: ["test: {", "  include: ['src/**/*.test.ts'],", "},"].join("\n"),
          },
        },
      ],
    },
  },
};

export default testingManifest;
