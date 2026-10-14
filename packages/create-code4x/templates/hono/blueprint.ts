import type { FrameworkBlueprint } from "../../src/domain/types.ts";

/**
 * Hono framework blueprint (M0 walking skeleton).
 *
 * Assembly anchors: the skeleton owns the semantic *order* (middlewares before
 * routes); `order` only decides within an anchor. The baseline contribution
 * wires the logger import + `app.use(logger())`.
 */
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
      },
    },
  ],
  static: {
    files: [
      { src: "files/package.json", dest: "package.json" },
      { src: "files/tsconfig.json", dest: "tsconfig.json" },
      { src: "files/_gitignore", dest: ".gitignore" },
      { src: "files/README.md", dest: "README.md" },
    ],
    // Build policy is structural now (pnpm-workspace.yaml is emitted from this
    // union, not copied from `files/`).
    workspaceYaml: { allowBuilds: { esbuild: true } },
    wiring: [
      {
        anchor: "imports",
        order: 0,
        block: { kind: "import", module: "hono/logger", named: ["logger"] },
      },
      {
        anchor: "middlewares",
        order: 0,
        block: { kind: "call", callee: "app.use", expression: "logger()" },
      },
      {
        anchor: "vite-plugins",
        order: 0,
        block: { kind: "raw", code: "devServer({ entry: 'src/index.ts' })," },
      },
      {
        anchor: "vite-plugins",
        order: 1,
        block: { kind: "raw", code: "build({ entry: 'src/index.ts', port })," },
      },
    ],
  },
};

export default honoBlueprint;
