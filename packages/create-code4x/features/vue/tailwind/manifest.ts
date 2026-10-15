import type {
  Answers,
  Condition,
  FeatureManifest,
  ProjectContext,
} from "../../../src/domain/types.ts";

/**
 * `vue/tailwind` — Tailwind CSS v4.
 *
 * CSS-first config: the plugin is added to `vite.config.ts`, and the single
 * `src/style.css` line `@import 'tailwindcss';` (via the `css-imports` anchor)
 * pulls in every layer.
 *
 * Preflight vs UI kits (docs/06 §4.3): Tailwind's preflight reset can fight a
 * component library's own reset. With `vue/naive-ui`, disable naive-ui's
 * preflight-style global styles by adding
 * `<meta name="naive-ui-style" content="preflight-style-disabled">` to
 * `index.html`; with `vue/element-plus`, keep the UI stylesheet ordered after
 * Tailwind (import order resolves by the resolver-injected per-component CSS).
 * Only one CSS engine is selectable (`vue/css` group).
 *
 * Scanning scope (docs/06 §6.1): Tailwind v4 auto-detects sources by walking up
 * from the CSS file. Inside a host workspace that would reach sibling apps and
 * host-root files, leaking classes into the generated CSS. When
 * `context.nestedWorkspace` we pin the source base to the app package root via
 * `source('../')` (the CSS file lives in `src/`); standalone the unscoped form
 * is kept byte-for-byte.
 */
const unscoped: Condition = (_answers: Answers, context?: ProjectContext) =>
  context?.nestedWorkspace !== true;
const scopedToApp: Condition = (_answers: Answers, context?: ProjectContext) =>
  context?.nestedWorkspace === true;

const tailwindManifest: FeatureManifest = {
  id: "vue/tailwind",
  title: "Tailwind CSS",
  description: "Utility-first CSS (tailwindcss + @tailwindcss/vite)",
  requires: [{ kind: "framework", id: "vue" }],
  defaults: true,
  group: "vue/css",
  targets: {
    vue: {
      packageJson: {
        devDependencies: {
          "@tailwindcss/vite": "^4.3.0",
          tailwindcss: "^4.3.0",
        },
      },
      wiring: [
        {
          anchor: "vite-imports",
          order: 0,
          block: { kind: "import", module: "@tailwindcss/vite", defaultAs: "tailwindcss" },
        },
        {
          anchor: "vite-plugins",
          order: 0,
          block: { kind: "raw", code: "tailwindcss()," },
        },
        {
          anchor: "css-imports",
          order: 0,
          when: unscoped,
          block: { kind: "raw", code: "@import 'tailwindcss';" },
        },
        {
          anchor: "css-imports",
          order: 0,
          when: scopedToApp,
          block: { kind: "raw", code: "@import 'tailwindcss' source('../');" },
        },
      ],
    },
  },
};

export default tailwindManifest;
