import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `hono/http-hardening` — built-in timeout / body-limit / compress middleware.
 *
 * Order numbers follow the global reservation table (docs/03 §2.2):
 * `20-39` = rate limiting / hardening. All three are dependency-free built-ins.
 */
const httpHardeningManifest: FeatureManifest = {
  id: "hono/http-hardening",
  title: "HTTP hardening",
  description: "timeout + body limit + compression (built-in)",
  requires: [{ kind: "framework", id: "hono" }],
  targets: {
    hono: {
      wiring: [
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "hono/body-limit", named: ["bodyLimit"] },
        },
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "hono/compress", named: ["compress"] },
        },
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "hono/timeout", named: ["timeout"] },
        },
        {
          anchor: "middlewares",
          order: 20,
          block: { kind: "call", callee: "app.use", expression: "timeout(30_000)" },
        },
        {
          anchor: "middlewares",
          order: 21,
          block: {
            kind: "call",
            callee: "app.use",
            expression: "bodyLimit({ maxSize: 1024 * 1024 })",
          },
        },
        {
          anchor: "middlewares",
          order: 22,
          block: { kind: "call", callee: "app.use", expression: "compress()" },
        },
      ],
    },
  },
};

export default httpHardeningManifest;
