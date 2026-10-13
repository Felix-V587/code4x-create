import type { Answers, FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `hono/zod` — typed request validation.
 *
 * The route wiring has two mutually-exclusive variants:
 *   - `when` swagger-openapi selected: `describeRoute` + `resolver` (schemas from
 *     `CreateUserSchema`) so the route appears in the generated OpenAPI spec;
 *   - otherwise: the plain `zValidator` route.
 *
 * Conditions observe the *resolved* selection (see `render`), so a bare
 * `--features swagger-openapi` still matches.
 */
const hasSwagger = (answers: Answers) => answers.features.includes("hono/swagger-openapi");
const withoutSwagger = (answers: Answers) => !hasSwagger(answers);

const zodManifest: FeatureManifest = {
  id: "hono/zod",
  title: "Zod validation",
  description: "Typed request validation (adds zod, @hono/zod-validator)",
  requires: [{ kind: "framework", id: "hono" }],
  targets: {
    hono: {
      files: [{ src: "files/src/schemas/user.ts", dest: "src/schemas/user.ts" }],
      wiring: [
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "@hono/zod-validator", named: ["zValidator"] },
        },
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "./schemas/user", named: ["CreateUserSchema"] },
        },
        {
          anchor: "imports",
          order: 0,
          when: hasSwagger,
          block: { kind: "import", module: "hono-openapi", named: ["describeRoute", "resolver"] },
        },
        {
          anchor: "imports",
          order: 0,
          when: hasSwagger,
          block: { kind: "import", module: "./schemas/user", named: ["RegisterResponseSchema"] },
        },
        {
          anchor: "routes",
          order: 0,
          when: withoutSwagger,
          block: { src: "fragments/register-route.ts" },
        },
        {
          anchor: "routes",
          order: 0,
          when: hasSwagger,
          block: { src: "fragments/register-route-swagger.ts" },
        },
      ],
      packageJson: {
        dependencies: {
          "@hono/zod-validator": "^0.9.1",
          zod: "^4.6.6",
        },
      },
    },
  },
};

export default zodManifest;
