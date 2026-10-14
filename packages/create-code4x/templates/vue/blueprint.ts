import type { FrameworkBlueprint } from "../../src/domain/types.ts";

/**
 * Vue framework blueprint.
 *
 * Two assembled files exercise multi-file assembly: `src/main.ts`
 * (`imports` + `app-use`) and `vite.config.ts` (`vite-plugins`). The baseline
 * contributes the `vue()` plugin; features add imports + `app.use(...)` calls.
 */
const vueBlueprint: FrameworkBlueprint = {
  id: "vue",
  title: "Vue",
  assembly: [
    {
      path: "src/main.ts",
      skeleton: "files/src/main.skeleton.ts",
      anchors: {
        imports: { kind: "imports" },
        "app-use": { kind: "list" },
      },
    },
    {
      path: "vite.config.ts",
      skeleton: "files/vite.config.skeleton.ts",
      anchors: {
        "vite-plugins": { kind: "list" },
      },
    },
    {
      path: "src/App.vue",
      skeleton: "files/src/App.skeleton.vue",
      anchors: {
        "app-template": { kind: "list" },
      },
    },
  ],
  static: {
    files: [
      { src: "files/package.json", dest: "package.json" },
      {
        src: "files/pnpm-workspace.yaml",
        dest: "pnpm-workspace.yaml",
        // Nested monorepos own the build policy; don't shadow the parent root.
        when: (_answers, context) => !context?.nestedWorkspace,
      },
      { src: "files/tsconfig.json", dest: "tsconfig.json" },
      { src: "files/index.html", dest: "index.html" },
      { src: "files/src/env.d.ts", dest: "src/env.d.ts" },
      { src: "files/src/style.css", dest: "src/style.css" },
      { src: "files/_gitignore", dest: ".gitignore" },
      { src: "files/README.md", dest: "README.md" },
    ],
    wiring: [
      {
        anchor: "vite-plugins",
        order: 0,
        // Trailing comma included so the multiline `plugins` array stays
        // oxfmt-clean (a fresh `vp check` passes without `--fix`).
        block: { kind: "raw", code: "vue()," },
      },
    ],
  },
};

export default vueBlueprint;
