import type { Answers, FrameworkBlueprint } from "../../src/domain/types.ts";

/**
 * Hono framework blueprint (M0 walking skeleton, M7 base upgrade).
 *
 * Assembly anchors: the skeleton owns the semantic *order* (middlewares before
 * routes); `order` only decides within an anchor.
 *
 * Middleware order rationale: `requestId()` runs first (order 0) so that every
 * later middleware, handler and the error envelope can read the same
 * `c.get('requestId')`; the baseline request logger runs right after it
 * (order 1) and is replaced by `hono/logging` (see the `when` guards).
 */
const notLogging = (answers: Answers) => !answers.features.includes("hono/logging");

const honoBlueprint: FrameworkBlueprint = {
  id: "hono",
  title: "Hono",
  assembly: [
    {
      path: "src/index.ts",
      skeleton: "files/src/index.skeleton.ts",
      anchors: {
        imports: { kind: "imports" },
        middlewares: { kind: "list" },
        routes: { kind: "list" },
        "error-handlers": { kind: "list" },
      },
    },
    {
      path: "vite.config.ts",
      skeleton: "files/vite.config.skeleton.ts",
      anchors: {
        // Anchor names are global across a blueprint's assemblies, so this
        // cannot be named `imports` (already owned by the entry file).
        "vite-imports": { kind: "imports" },
        "vite-plugins": { kind: "list" },
        "vite-config-extra": { kind: "list" },
      },
    },
  ],
  static: {
    files: [
      { src: "files/package.json", dest: "package.json" },
      { src: "files/tsconfig.json", dest: "tsconfig.json" },
      { src: "files/_gitignore", dest: ".gitignore" },
      { src: "files/README.md", dest: "README.md" },
      { src: "files/src/routes/health.ts", dest: "src/routes/health.ts" },
    ],
    // Build policy is structural now (pnpm-workspace.yaml is emitted from this
    // union, not copied from `files/`).
    workspaceYaml: { allowBuilds: { esbuild: true } },
    wiring: [
      {
        anchor: "imports",
        order: 0,
        block: { kind: "import", module: "hono/request-id", named: ["requestId"] },
      },
      {
        anchor: "imports",
        order: 0,
        block: { kind: "import", module: "hono/http-exception", named: ["HTTPException"] },
      },
      {
        anchor: "imports",
        order: 0,
        block: { kind: "import", module: "./routes/health", named: ["health"] },
      },
      // Baseline logger: replaced wholesale when `hono/logging` is selected
      // (M1 "replace the baseline block" via a `when` condition on static
      // wiring — both the import and the `app.use` line are suppressed).
      {
        anchor: "imports",
        order: 0,
        when: notLogging,
        block: { kind: "import", module: "hono/logger", named: ["logger"] },
      },
      {
        anchor: "middlewares",
        order: 0,
        block: { kind: "call", callee: "app.use", expression: "requestId()" },
      },
      {
        anchor: "middlewares",
        order: 1,
        when: notLogging,
        block: { kind: "call", callee: "app.use", expression: "logger()" },
      },
      // Health endpoints mount before business routes (`routes` order -10).
      {
        anchor: "routes",
        order: -10,
        block: { kind: "call", callee: "app.route", expression: "'/', health" },
      },
      {
        anchor: "vite-plugins",
        order: 0,
        block: { kind: "raw", code: "devServer({ entry: 'src/index.ts' })," },
      },
      {
        anchor: "vite-plugins",
        order: 1,
        // `shutdownTimeoutMs` enables SIGINT/SIGTERM graceful shutdown in the
        // built server (@hono/vite-build/node >= 1.8).
        block: {
          kind: "raw",
          code: "build({ entry: 'src/index.ts', port, shutdownTimeoutMs: 5000 }),",
        },
      },
      {
        anchor: "error-handlers",
        order: 0,
        block: {
          kind: "raw",
          code: [
            "app.onError((err, c) => {",
            "  if (err instanceof HTTPException) {",
            "    return c.json(",
            "      { code: 'HTTP_EXCEPTION', message: err.message, requestId: c.get('requestId') },",
            "      err.status,",
            "    )",
            "  }",
            "  console.error(err)",
            "  return c.json(",
            "    {",
            "      code: 'INTERNAL_SERVER_ERROR',",
            "      message: 'Internal Server Error',",
            "      requestId: c.get('requestId'),",
            "    },",
            "    500,",
            "  )",
            "})",
            "",
            "app.notFound((c) =>",
            "  c.json({ code: 'NOT_FOUND', message: 'Not Found', requestId: c.get('requestId') }, 404),",
            ")",
          ].join("\n"),
        },
      },
    ],
  },
};

export default honoBlueprint;
