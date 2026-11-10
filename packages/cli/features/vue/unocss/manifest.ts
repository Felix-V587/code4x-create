import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `vue/unocss` — UnoCSS (presetWind4).
 *
 * The `virtual:uno.css` entry is injected into `src/main.ts` through the
 * `imports` anchor. It is deliberately **not** a CSS `@import`: under the
 * rolldown-based Vite 8 shipped with Vite+, resolving `virtual:uno.css` from a
 * CSS `@import` fails (`[postcss] ENOENT`), while a JS side-effect import works.
 * UnoCSS ships its own reset via `presetWind4`, so `@unocss/reset` is
 * intentionally not added. Only one CSS engine is selectable (`vue/css` group).
 */
const unocssManifest: FeatureManifest = {
  id: "vue/unocss",
  title: "UnoCSS",
  description: "Instant on-demand atomic CSS (unocss, presetWind4)",
  promptSection: "css",
  requires: [{ kind: "framework", id: "vue" }],
  group: "vue/css",
  targets: {
    vue: {
      packageJson: { devDependencies: { unocss: "^66.11.0" } },
      wiring: [
        {
          anchor: "vite-imports",
          order: 0,
          block: { kind: "import", module: "unocss/vite", defaultAs: "UnoCSS" },
        },
        {
          anchor: "vite-imports",
          order: 0,
          block: { kind: "import", module: "unocss", named: ["presetWind4"] },
        },
        {
          anchor: "vite-plugins",
          order: 0,
          block: { kind: "raw", code: "UnoCSS({ presets: [presetWind4()] })," },
        },
        {
          anchor: "imports",
          order: 0,
          block: { kind: "raw", code: "import 'virtual:uno.css'" },
        },
      ],
    },
  },
};

export default unocssManifest;
