import type { FrameworkBlueprint } from "../../src/domain/types.ts";

/**
 * Electron framework blueprint.
 *
 * A single-package, Vite+-native Electron app:
 *   - `src/main` + `src/preload` are bundled to CommonJS by `vp pack` (tsdown),
 *   - `src/renderer` is a Vue 3 app built by `vp build` (Vite).
 *
 * Two assembled files: `src/main/index.ts` (`imports`) and `vite.config.ts`
 * (`vite-plugins`). The renderer entry is a plain Vite app.
 */
const electronBlueprint: FrameworkBlueprint = {
  id: "electron",
  title: "Electron",
  assembly: [
    {
      path: "src/main/index.ts",
      skeleton: "files/src/main.skeleton.ts",
      anchors: {
        imports: { kind: "imports" },
      },
    },
    {
      path: "vite.config.ts",
      skeleton: "files/vite.config.skeleton.ts",
      anchors: {
        "vite-plugins": { kind: "list" },
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
      { src: "files/scripts/dev.mjs", dest: "scripts/dev.mjs" },
      { src: "files/src/preload/index.ts", dest: "src/preload/index.ts" },
      { src: "files/src/renderer/index.html", dest: "src/renderer/index.html" },
      { src: "files/src/renderer/src/main.ts", dest: "src/renderer/src/main.ts" },
      { src: "files/src/renderer/src/App.vue", dest: "src/renderer/src/App.vue" },
      { src: "files/src/renderer/src/style.css", dest: "src/renderer/src/style.css" },
      { src: "files/src/renderer/src/env.d.ts", dest: "src/renderer/src/env.d.ts" },
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

export default electronBlueprint;
