import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `vue/reka-ui` —— 无样式的可访问组件原语。
 *
 * 作为默认 UI 选项，附带一个可运行的 Dialog 示例；与 naive-ui /
 * element-plus / shadcn-vue 同属 `vue/ui` 互斥组。
 */
const rekaUiManifest: FeatureManifest = {
  id: "vue/reka-ui",
  title: "Reka UI",
  description: "Headless accessible UI primitives (reka-ui)",
  requires: [{ kind: "framework", id: "vue" }],
  defaults: true,
  group: "vue/ui",
  promptSection: "ui",
  targets: {
    vue: {
      files: [
        { src: "files/src/components/RekaDialog.vue", dest: "src/components/RekaDialog.vue" },
      ],
      packageJson: { dependencies: { "reka-ui": "^2.11.0" } },
      wiring: [
        {
          anchor: "app-script",
          order: 0,
          block: {
            kind: "import",
            module: "./components/RekaDialog.vue",
            defaultAs: "RekaDialog",
          },
        },
        {
          anchor: "app-template",
          order: 0,
          block: { kind: "raw", code: "<RekaDialog />" },
        },
      ],
    },
  },
};

export default rekaUiManifest;
