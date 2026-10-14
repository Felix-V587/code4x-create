import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `hono/logging` — structured logging via pino + hono-pino.
 *
 * Replaces the blueprint's baseline `hono/logger`: the blueprint suppresses
 * both its import and its `app.use(logger())` line with a `when` guard, and
 * this feature wires `src/logger.ts` in the same middleware slot (order 1).
 * Request logs reuse the `requestId` assigned by `hono/request-id`.
 */
const loggingManifest: FeatureManifest = {
  id: "hono/logging",
  title: "Pino logging",
  description: "Structured request logging (pino + hono-pino)",
  requires: [{ kind: "framework", id: "hono" }],
  targets: {
    hono: {
      files: [{ src: "files/src/logger.ts", dest: "src/logger.ts" }],
      wiring: [
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "./logger", named: ["logger"] },
        },
        {
          anchor: "middlewares",
          order: 1,
          block: { kind: "call", callee: "app.use", expression: "logger" },
        },
      ],
      packageJson: {
        dependencies: {
          "hono-pino": "^0.10.3",
          pino: "^10.4.0",
        },
      },
    },
  },
};

export default loggingManifest;
