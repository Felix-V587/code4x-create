import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `vue/shadcn-vue` — shadcn-vue component baseline (copy-paste, no runtime
 * package).
 *
 * shadcn-vue is distributed as copy-paste component sources, not as an npm
 * dependency; the interactive `shadcn-vue` CLI is deliberately **not** executed
 * at generation time. This feature vendors a lean baseline: `components.json`
 * (`style: "new-york"`, pinned for determinism), the `cn()` helper, the theme
 * block (via the `css-imports` anchor, ordered after Tailwind's own import) and
 * three starter primitives (`button`, `card`, `input`). More components are
 * added later with `npx shadcn-vue add <component>`.
 *
 * Relationships:
 *   - `requires vue/tailwind`: shadcn is Tailwind-native (the theme uses
 *     `@theme` / `@apply` / `@custom-variant`). Springing the Tailwind CSS
 *     engine through the closure also means "shadcn + unocss" resolves to both
 *     members of the `vue/css` group and fails with `E-CONFLICT` — the sane
 *     outcome for a Tailwind-only kit.
 *   - `group: vue/ui`: shadcn-vue competes with the other UI kits for the single
 *     "primary component system" slot. Mixing it with naive-ui / element-plus
 *     would stack two preflight/style/resolution models (explicit imports vs
 *     resolver auto-import) in one scaffold, which is not a sane default — so it
 *     is exclusive, exactly like the other kits.
 *
 * Component sources are the registry `new-york` style (`ui/button`,
 * `ui/card`, `ui/input`), vendored with only import quotes normalised to the
 * generated project's formatter (single quotes, no semicolons). Dark mode uses
 * the `.dark` class on `<html>` (see README); `useColorMode` from
 * `@vueuse/core` toggles it.
 */
const shadcnVueManifest: FeatureManifest = {
  id: "vue/shadcn-vue",
  title: "shadcn-vue",
  description: "Copy-paste components (reka-ui + cva + Tailwind, vendored)",
  requires: [
    { kind: "framework", id: "vue" },
    { kind: "feature", id: "vue/tailwind" },
  ],
  group: "vue/ui",
  targets: {
    vue: {
      files: [
        { src: "files/components.json", dest: "components.json" },
        { src: "files/src/lib/utils.ts", dest: "src/lib/utils.ts" },
        {
          src: "files/src/components/ui/button/Button.vue",
          dest: "src/components/ui/button/Button.vue",
        },
        {
          src: "files/src/components/ui/button/index.ts",
          dest: "src/components/ui/button/index.ts",
        },
        { src: "files/src/components/ui/card/Card.vue", dest: "src/components/ui/card/Card.vue" },
        {
          src: "files/src/components/ui/card/CardContent.vue",
          dest: "src/components/ui/card/CardContent.vue",
        },
        {
          src: "files/src/components/ui/card/CardDescription.vue",
          dest: "src/components/ui/card/CardDescription.vue",
        },
        {
          src: "files/src/components/ui/card/CardFooter.vue",
          dest: "src/components/ui/card/CardFooter.vue",
        },
        {
          src: "files/src/components/ui/card/CardHeader.vue",
          dest: "src/components/ui/card/CardHeader.vue",
        },
        {
          src: "files/src/components/ui/card/CardTitle.vue",
          dest: "src/components/ui/card/CardTitle.vue",
        },
        { src: "files/src/components/ui/card/index.ts", dest: "src/components/ui/card/index.ts" },
        {
          src: "files/src/components/ui/input/Input.vue",
          dest: "src/components/ui/input/Input.vue",
        },
        {
          src: "files/src/components/ui/input/index.ts",
          dest: "src/components/ui/input/index.ts",
        },
      ],
      packageJson: {
        dependencies: {
          // Same string as `vue/vueuse` (a mismatch would be `E-DEP-VERSION`).
          "@vueuse/core": "^15.0.0",
          "class-variance-authority": "^0.7.1",
          clsx: "^2.1.1",
          // The component registry imports icons from `lucide-vue-next`; the
          // newer `@lucide/vue` would diverge from what `shadcn-vue add` emits.
          "lucide-vue-next": "^1.0.0",
          "reka-ui": "^2.11.0",
          "tailwind-merge": "^3.7.0",
        },
        devDependencies: {
          "tw-animate-css": "^1.4.0",
        },
      },
      wiring: [
        {
          // Ordered after `vue/tailwind`'s `@import 'tailwindcss';` (order 0).
          // The block keeps every CSS `@import` at the very top of the file.
          anchor: "css-imports",
          order: 10,
          block: { src: "fragments/theme.css" },
        },
        {
          anchor: "app-script",
          order: 0,
          block: { kind: "import", module: "@/components/ui/button", named: ["Button"] },
        },
        {
          anchor: "app-script",
          order: 0,
          block: {
            kind: "import",
            module: "@/components/ui/card",
            named: ["Card", "CardContent", "CardDescription", "CardHeader", "CardTitle"],
          },
        },
        {
          anchor: "app-script",
          order: 0,
          block: { kind: "import", module: "@/components/ui/input", named: ["Input"] },
        },
        {
          anchor: "app-template",
          order: 0,
          block: {
            kind: "raw",
            code: [
              '<Card class="max-w-sm">',
              "  <CardHeader>",
              "    <CardTitle>shadcn-vue</CardTitle>",
              "    <CardDescription>Copy-paste components on Tailwind CSS.</CardDescription>",
              "  </CardHeader>",
              '  <CardContent class="flex flex-col gap-3">',
              '    <Input placeholder="you@example.com" />',
              "    <Button>Get started</Button>",
              "  </CardContent>",
              "</Card>",
            ].join("\n"),
          },
        },
      ],
    },
  },
};

export default shadcnVueManifest;
