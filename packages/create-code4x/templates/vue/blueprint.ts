import type { FrameworkBlueprint } from "../../src/domain/types.ts";

/**
 * Vue framework blueprint.
 *
 * Three assembled files exercise multi-file assembly: `src/main.ts`
 * (`imports` + `app-use`), `vite.config.ts` (`vite-imports` + `vite-plugins`)
 * and `src/App.vue` (`app-script` + `app-template`). `src/style.css`
 * (`css-imports`) is the fourth. The baseline contributes the `vue()` plugin;
 * features add imports, `app.use(...)` calls, template fragments and CSS
 * `@import` lines.
 *
 * There is intentionally **no** `vite-plugins-pre` anchor: the baseline keeps
 * classic `createRouter` (not `vue-router/vite` file-based routing), so no
 * shipped plugin has to run before `vue()`.
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
        // Global anchor namespace: the entry file already owns `imports`.
        "vite-imports": { kind: "imports" },
        "vite-plugins": { kind: "list" },
      },
    },
    {
      path: "src/App.vue",
      skeleton: "files/src/App.skeleton.vue",
      anchors: {
        // Script-block imports for component-based kits (shadcn-vue needs
        // explicit `import { Button } from '@/components/ui/button'`, unlike the
        // resolver auto-import of naive-ui / element-plus).
        "app-script": { kind: "imports" },
        "app-template": { kind: "list" },
      },
    },
    {
      path: "src/style.css",
      skeleton: "files/src/style.skeleton.css",
      anchors: {
        // CSS `@import` lines (`@import 'tailwindcss';` / `virtual:uno.css`).
        // Only one CSS engine is selectable (`vue/css` group), so a `list`
        // anchor never sees a duplicate statement.
        "css-imports": { kind: "list" },
      },
    },
  ],
  static: {
    files: [
      { src: "files/package.json", dest: "package.json" },
      { src: "files/tsconfig.json", dest: "tsconfig.json" },
      { src: "files/index.html", dest: "index.html" },
      { src: "files/src/env.d.ts", dest: "src/env.d.ts" },
      { src: "files/_gitignore", dest: ".gitignore" },
      { src: "files/README.md", dest: "README.md" },
    ],
    workspaceYaml: { allowBuilds: { esbuild: true } },
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
