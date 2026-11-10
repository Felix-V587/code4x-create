import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `vue/i18n` — internationalization.
 *
 * `vue-i18n` in composition mode (`legacy: false`, `globalInjection: true` so the
 * minimal `<p>{{ $t('hello') }}</p>` template example works) plus the official
 * Vite plugin `@intlify/unplugin-vue-i18n` (contributes `vite-imports` +
 * `vite-plugins`, and compiles SFC `<i18n>` blocks / locale resources).
 */
const i18nManifest: FeatureManifest = {
  id: "vue/i18n",
  title: "i18n",
  description: "Internationalization (vue-i18n + @intlify/unplugin-vue-i18n)",
  promptSection: "ecosystem",
  requires: [{ kind: "framework", id: "vue" }],
  defaults: true,
  targets: {
    vue: {
      files: [
        { src: "files/src/i18n.ts", dest: "src/i18n.ts" },
        { src: "files/src/locales/en.ts", dest: "src/locales/en.ts" },
        { src: "files/src/locales/zh-CN.ts", dest: "src/locales/zh-CN.ts" },
      ],
      packageJson: {
        dependencies: { "vue-i18n": "^11.4.0" },
        devDependencies: { "@intlify/unplugin-vue-i18n": "^11.2.0" },
      },
      wiring: [
        {
          anchor: "vite-imports",
          order: 0,
          block: {
            kind: "import",
            module: "@intlify/unplugin-vue-i18n/vite",
            defaultAs: "VueI18nPlugin",
          },
        },
        {
          anchor: "vite-plugins",
          order: 0,
          block: { kind: "raw", code: "VueI18nPlugin({ include: './src/locales/**' })," },
        },
        {
          anchor: "imports",
          order: 0,
          block: { kind: "import", module: "./i18n", named: ["i18n"] },
        },
        {
          anchor: "app-use",
          order: 0,
          block: { kind: "raw", code: "app.use(i18n)" },
        },
        {
          anchor: "app-template",
          order: 0,
          block: { kind: "raw", code: "<p>{{ $t('hello') }}</p>" },
        },
      ],
    },
  },
};

export default i18nManifest;
