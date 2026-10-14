import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `hono/swagger-openapi` — OpenAPI spec + Swagger UI (middleware style, OQ-7).
 *
 * `requires` the `hono/zod` feature: the dependency closure pulls zod in
 * automatically, and the closure order guarantees zod is ranked before swagger.
 * The spec/documentation metadata is a static feature file (no `{PROJECT}`).
 */
const swaggerOpenapiManifest: FeatureManifest = {
  id: "hono/swagger-openapi",
  title: "OpenAPI docs",
  description: "Spec + Swagger UI at /docs (includes Zod validation)",
  requires: [
    { kind: "framework", id: "hono" },
    { kind: "feature", id: "hono/zod" },
  ],
  targets: {
    hono: {
      files: [{ src: "files/src/docs/spec.ts", dest: "src/docs/spec.ts" }],
      wiring: [
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "hono-openapi", named: ["openAPIRouteHandler"] },
        },
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "@hono/swagger-ui", named: ["swaggerUI"] },
        },
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "./docs/spec", named: ["openApiDocumentation"] },
        },
        {
          anchor: "routes",
          order: 50,
          block: {
            kind: "raw",
            code: "app.get('/openapi.json', openAPIRouteHandler(app, { documentation: openApiDocumentation }))",
          },
        },
        {
          anchor: "routes",
          order: 51,
          block: { kind: "raw", code: "app.get('/docs', swaggerUI({ url: '/openapi.json' }))" },
        },
      ],
      packageJson: {
        dependencies: {
          "@hono/swagger-ui": "^0.6.1",
          "hono-openapi": "^1.3.5",
        },
      },
    },
  },
};

export default swaggerOpenapiManifest;
