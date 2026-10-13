import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `hono/api-guard` — pure wiring feature (no files).
 *
 * Baseline middleware order (`order`) places both after the blueprint logger
 * (`order` 0): CORS at 10, secure-headers at 11.
 */
const apiGuardManifest: FeatureManifest = {
  id: "hono/api-guard",
  title: "API guard",
  description: "secure-headers + CORS boilerplate",
  requires: [{ kind: "framework", id: "hono" }],
  targets: {
    hono: {
      wiring: [
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "hono/cors", named: ["cors"] },
        },
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "hono/secure-headers", named: ["secureHeaders"] },
        },
        {
          anchor: "middlewares",
          order: 10,
          block: { kind: "call", callee: "app.use", expression: "cors()" },
        },
        {
          anchor: "middlewares",
          order: 11,
          block: { kind: "call", callee: "app.use", expression: "secureHeaders()" },
        },
      ],
    },
  },
};

export default apiGuardManifest;
