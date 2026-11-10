import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `vue/element-plus` — Element Plus (alternative UI kit).
 *
 * Dual resolver (`unplugin-vue-components` + `unplugin-auto-import`) with
 * `importStyle: 'css'`, so per-component styles are imported on demand with no
 * extra dependency. The generated declaration files
 * (`auto-imports.d.ts`, `components.d.ts`) are handled like the naive-ui ones
 * (base `tsconfig.json` include, `.gitignore`, lint/fmt ignore). Only one UI kit
 * is selectable (`vue/ui` group).
 */
const elementPlusManifest: FeatureManifest = {
  id: "vue/element-plus",
  title: "Element Plus",
  description: "Component library (element-plus, auto-imported, css styles)",
  promptSection: "ui",
  requires: [{ kind: "framework", id: "vue" }],
  group: "vue/ui",
  targets: {
    vue: {
      packageJson: {
        dependencies: { "element-plus": "^2.14.0" },
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
            named: ["ElementPlusResolver"],
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
              "AutoImport({",
              "  resolvers: [ElementPlusResolver({ importStyle: 'css' })],",
              "  dts: 'auto-imports.d.ts',",
              "}),",
              "Components({",
              "  resolvers: [ElementPlusResolver({ importStyle: 'css' })],",
              "  dts: 'components.d.ts',",
              "}),",
            ].join("\n"),
          },
        },
        {
          anchor: "app-template",
          order: 0,
          block: { kind: "raw", code: '<el-button type="primary">Element Plus</el-button>' },
        },
      ],
    },
  },
};

export default elementPlusManifest;
