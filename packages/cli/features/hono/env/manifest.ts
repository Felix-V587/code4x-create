import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `hono/env` — runtime configuration validated once at import time.
 *
 * Ships a standalone `src/env.ts` built on the `hono/zod` feature (no extra
 * dependency). Import `{ env }` from `./env` wherever validated config is
 * needed. The module is intentionally *not* wired into the entry: adding this
 * feature must never inject an unused import into `src/index.ts`.
 */
const envManifest: FeatureManifest = {
  id: "hono/env",
  title: "Env config",
  description: "Zod-validated process.env (adds src/env.ts)",
  requires: [
    { kind: "framework", id: "hono" },
    { kind: "feature", id: "hono/zod" },
  ],
  targets: {
    hono: {
      files: [{ src: "files/src/env.ts", dest: "src/env.ts" }],
    },
  },
};

export default envManifest;
