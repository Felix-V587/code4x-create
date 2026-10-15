import { describe, expect, test } from "vite-plus/test";

import { Code4xError } from "../src/domain/errors.ts";
import { expandPreset, resolve } from "../src/domain/resolve.ts";
import { render } from "../src/domain/render.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Registry } from "../src/domain/registry.ts";
import type { Answers, VirtualFile } from "../src/domain/types.ts";

const ANSWERS: Answers = {
  targetDir: "./my-app",
  projectName: "my-app",
  framework: "vue",
  features: [],
  packageManager: "pnpm",
  install: false,
  git: true,
};

function generate(featureTokens: string[]): { files: VirtualFile[]; features: string[] } {
  const registry = loadRegistry();
  const plan = resolve({ ...ANSWERS, features: featureTokens }, registry);
  return { files: render(plan, registry), features: plan.features };
}

function file(files: VirtualFile[], path: string): VirtualFile {
  const found = files.find((entry) => entry.path === path);
  expect(found, path).toBeDefined();
  return found as VirtualFile;
}

function pkg(files: VirtualFile[]): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  return JSON.parse(file(files, "package.json").contents) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
}

function capture(fn: () => unknown): Code4xError {
  try {
    fn();
  } catch (error) {
    if (error instanceof Code4xError) return error;
    throw error;
  }
  throw new Error("expected a Code4xError");
}

describe("render / vue/shadcn-vue", () => {
  test("requires vue/tailwind and is exclusive in the vue/ui group", () => {
    const manifest = loadRegistry().features["vue/shadcn-vue"];
    expect(manifest.requires).toContainEqual({ kind: "feature", id: "vue/tailwind" });
    expect(manifest.group).toBe("vue/ui");
  });

  test("selecting shadcn alone pulls Tailwind through the closure", () => {
    const { features } = generate(["vue/shadcn-vue"]);
    expect(features).toContain("vue/tailwind");
    expect(features).toContain("vue/shadcn-vue");
  });

  test("vendors components.json, cn() and the button/card/input primitives", () => {
    const { files } = generate(["vue/shadcn-vue"]);
    for (const path of [
      "components.json",
      "src/lib/utils.ts",
      "src/components/ui/button/Button.vue",
      "src/components/ui/button/index.ts",
      "src/components/ui/card/Card.vue",
      "src/components/ui/card/CardContent.vue",
      "src/components/ui/card/CardDescription.vue",
      "src/components/ui/card/CardFooter.vue",
      "src/components/ui/card/CardHeader.vue",
      "src/components/ui/card/CardTitle.vue",
      "src/components/ui/card/index.ts",
      "src/components/ui/input/Input.vue",
      "src/components/ui/input/index.ts",
    ]) {
      expect(file(files, path).source, path).toBe("vue/shadcn-vue");
    }
    expect(file(files, "src/lib/utils.ts").contents).toContain("twMerge(clsx(inputs))");
    // Component sources keep the `@/` alias the CLI / registry uses.
    expect(file(files, "src/components/ui/button/Button.vue").contents).toContain(
      "from '@/lib/utils'",
    );
  });

  test("components.json has the pinned new-york shape and points at src/style.css", () => {
    const { files } = generate(["vue/shadcn-vue"]);
    const components = JSON.parse(file(files, "components.json").contents) as {
      style: string;
      typescript: boolean;
      tailwind: { config: string; css: string; baseColor: string; cssVariables: boolean };
      aliases: Record<string, string>;
      iconLibrary: string;
    };
    expect(components.style).toBe("new-york");
    expect(components.typescript).toBe(true);
    expect(components.tailwind).toMatchObject({
      config: "",
      css: "src/style.css",
      baseColor: "neutral",
      cssVariables: true,
    });
    expect(components.aliases).toMatchObject({
      components: "@/components",
      ui: "@/components/ui",
      utils: "@/lib/utils",
      lib: "@/lib",
      composables: "@/composables",
    });
    expect(components.iconLibrary).toBe("lucide");
  });

  test("theme block lands after Tailwind's import and carries the oklch tokens", () => {
    const style = file(generate(["vue/shadcn-vue"]).files, "src/style.css").contents;
    const tailwindImport = style.indexOf("@import 'tailwindcss';");
    const animateImport = style.indexOf("@import 'tw-animate-css';");
    expect(tailwindImport).toBeGreaterThanOrEqual(0);
    expect(animateImport).toBeGreaterThan(tailwindImport);
    expect(style).toContain("@custom-variant dark (&:is(.dark *));");
    expect(style).toContain("@theme inline {");
    expect(style).toContain("@layer base {");
    expect(style).toContain("--background: oklch(1 0 0);");
    expect(style).toContain(".dark {");
  });

  test("App.vue imports the primitives and demonstrates them", () => {
    const app = file(generate(["vue/shadcn-vue"]).files, "src/App.vue").contents;
    expect(app).toContain("import { Button } from '@/components/ui/button'");
    expect(app).toContain("from '@/components/ui/card'");
    expect(app).toContain("import { Input } from '@/components/ui/input'");
    expect(app).toContain("<Card");
    expect(app).toContain("<Button>Get started</Button>");
    expect(app).toContain("<Input placeholder=");
  });

  test("declares the registry runtime deps and the tw-animate-css dev dep", () => {
    const deps = pkg(generate(["vue/shadcn-vue"]).files);
    expect(deps.dependencies).toMatchObject({
      "reka-ui": "^2.11.0",
      "class-variance-authority": "^0.7.1",
      clsx: "^2.1.1",
      "tailwind-merge": "^3.7.0",
      "lucide-vue-next": "^1.0.0",
      "@vueuse/core": "^15.0.0",
    });
    expect(deps.devDependencies["tw-animate-css"]).toBe("^1.4.0");
  });
});

describe("resolve / vue/shadcn-vue groups", () => {
  test("shadcn + unocss fails: the closure pulls tailwind, both are in vue/css", () => {
    const registry = loadRegistry();
    const error = capture(() =>
      resolve({ ...ANSWERS, features: ["vue/shadcn-vue", "vue/unocss"] }, registry),
    );
    expect(error.code).toBe("E-CONFLICT");
    expect(error.exitCode).toBe(2);
    expect(error.message).toContain("vue/css");
  });

  test("shadcn + a resolver-based UI kit fails in vue/ui", () => {
    for (const kit of ["vue/naive-ui", "vue/element-plus"]) {
      const registry = loadRegistry();
      const error = capture(() =>
        resolve({ ...ANSWERS, features: ["vue/shadcn-vue", kit] }, registry),
      );
      expect(error.code).toBe("E-CONFLICT");
      expect(error.message).toContain("vue/ui");
    }
  });
});

describe("E-DEP-VERSION / shared @vueuse/core version", () => {
  test("vue/shadcn-vue and vue/vueuse declare the identical @vueuse/core string", () => {
    const registry = loadRegistry();
    const versionOf = (id: string): string | undefined =>
      registry.features[id].targets?.vue?.packageJson?.dependencies?.["@vueuse/core"];
    expect(versionOf("vue/shadcn-vue")).toBe(versionOf("vue/vueuse"));
    expect(versionOf("vue/shadcn-vue")).toBe("^15.0.0");
    // The pair resolves and renders without a dependency-version clash.
    const plan = resolve({ ...ANSWERS, features: ["vue/vueuse", "vue/shadcn-vue"] }, registry);
    expect(() => render(plan, registry)).not.toThrow();
  });

  test("a divergent @vueuse/core string is rejected during package.json merge", () => {
    const registry = loadRegistry();
    const shadcn = registry.features["vue/shadcn-vue"];
    const broken: Registry = {
      ...registry,
      features: {
        ...registry.features,
        "vue/shadcn-vue": {
          ...shadcn,
          targets: {
            ...shadcn.targets,
            vue: {
              ...shadcn.targets?.vue,
              packageJson: {
                ...shadcn.targets?.vue?.packageJson,
                dependencies: {
                  ...shadcn.targets?.vue?.packageJson?.dependencies,
                  "@vueuse/core": "^14.0.0",
                },
              },
            },
          },
        },
      },
    };
    const plan = resolve({ ...ANSWERS, features: ["vue/vueuse", "vue/shadcn-vue"] }, broken);
    const error = capture(() => render(plan, broken));
    expect(error.code).toBe("E-DEP-VERSION");
    expect(error.message).toContain("@vueuse/core");
  });
});

describe("preset / vue-shadcn-tw", () => {
  const registry = loadRegistry();

  test("= vue-standard closure + tailwind + shadcn-vue", () => {
    const preset = expandPreset("vue-shadcn-tw", registry);
    expect(preset.framework).toBe("vue");
    expect(preset.features).toEqual([
      "vue/router",
      "vue/pinia",
      "vue/vueuse",
      "vue/i18n",
      "vue/tailwind",
      "vue/shadcn-vue",
    ]);
  });

  test("generates the shadcn stack and is byte-stable vs the explicit list", () => {
    const preset = expandPreset("vue-shadcn-tw", registry);
    const fromPreset = render(
      resolve({ ...ANSWERS, features: preset.features }, registry),
      registry,
    );
    const reversed = render(
      resolve({ ...ANSWERS, features: [...preset.features].reverse() }, registry),
      registry,
    );
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(fromPreset));

    expect(file(fromPreset, "components.json")).toBeDefined();
    expect(file(fromPreset, "src/components/ui/button/Button.vue")).toBeDefined();
    expect(file(fromPreset, "src/style.css").contents).toContain("@import 'tailwindcss';");
    expect(file(fromPreset, "src/style.css").contents).toContain("@import 'tw-animate-css';");
    // i18n (part of the standard closure) still contributes to App.vue.
    expect(file(fromPreset, "src/App.vue").contents).toContain("{{ $t('hello') }}");
    for (const entry of fromPreset) expect(entry.contents).not.toContain("@code4x");
  });
});
