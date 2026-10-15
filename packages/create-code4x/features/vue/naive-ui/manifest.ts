import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `vue/naive-ui` — naive-ui (default UI kit, docs/06 §4.2 / OQ-13).
 *
 * On-demand components/APIs via `unplugin-vue-components` +
 * `unplugin-auto-import` with `NaiveUiResolver`. The generated declaration files
 * (`auto-imports.d.ts`, `components.d.ts`) are listed in the base `tsconfig.json`
 * `include`, added to the base `.gitignore`, and ignored by lint/fmt in the
 * generated `vite.config.ts`.
 *
 * The template example uses `<n-config-provider>` around a `<n-button>` through
 * the `app-template` anchor — a minimal provider demo without an `app-root`
 * whole-tree wrapping mechanism. Only one UI kit is selectable (`vue/ui` group).
 */
const naiveUiManifest: FeatureManifest = {
  id: "vue/naive-ui",
  title: "Naive UI",
  description: "Component library (naive-ui, auto-imported)",
  requires: [{ kind: "framework", id: "vue" }],
  defaults: true,
  group: "vue/ui",
  targets: {
    vue: {
      packageJson: {
        dependencies: { "naive-ui": "^2.45.0" },
        devDependencies: {
          "unplugin-auto-import": "^21.1.0",
          "unplugin-vue-components": "^32.1.0",
        },
      },
      wiring: [
        {
          anchor: "vite-imports",
          order: 0,
          block: { kind: "import", module: "unplugin-auto-import/vite", defaultAs: "AutoImport" },
        },
        {
          anchor: "vite-imports",
          order: 0,
          block: {
            kind: "import",
            module: "unplugin-vue-components/resolvers",
            named: ["NaiveUiResolver"],
          },
        },
        {
          anchor: "vite-imports",
          order: 0,
          block: {
            kind: "import",
            module: "unplugin-vue-components/vite",
            defaultAs: "Components",
          },
        },
        {
          anchor: "vite-plugins",
          order: 0,
          block: {
            kind: "raw",
            code: [
              "AutoImport({ imports: ['vue'], resolvers: [NaiveUiResolver()], dts: 'auto-imports.d.ts' }),",
              "Components({ resolvers: [NaiveUiResolver()], dts: 'components.d.ts' }),",
            ].join("\n"),
          },
        },
        {
          anchor: "app-template",
          order: 0,
          block: {
            kind: "raw",
            code: [
              "<n-config-provider>",
              '  <n-button type="primary">Naive UI</n-button>',
              "</n-config-provider>",
            ].join("\n"),
          },
        },
      ],
    },
  },
};

export default naiveUiManifest;
