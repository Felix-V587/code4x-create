import { describe, expect, test } from "vite-plus/test";

import { Code4xError } from "../src/domain/errors.ts";
import { expandPreset, resolve } from "../src/domain/resolve.ts";
import { render } from "../src/domain/render.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
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
  scripts: Record<string, string>;
} {
  return JSON.parse(file(files, "package.json").contents) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
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

function expectConflict(featureTokens: string[], group: string): void {
  const registry = loadRegistry();
  const error = capture(() => resolve({ ...ANSWERS, features: featureTokens }, registry));
  expect(error.code).toBe("E-CONFLICT");
  expect(error.exitCode).toBe(2);
  expect(error.message).toContain(group);
}

const BASE_MAIN = `import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

const app = createApp(App)

app.mount('#app')
`;

const STYLE_CSS = `:root {
  color-scheme: light dark;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
}

#app {
  padding: 2rem;
}
`;

describe("render / vue base upgrade (M8a)", () => {
  test("src/style.css is assembled and byte-equal to the previous static file", () => {
    const style = file(generate([]).files, "src/style.css");
    expect(style.source).toBe("assembly");
    expect(style.contents).toBe(STYLE_CSS);
    expect(style.contents).not.toContain("@code4x");
  });

  test("tsconfig project references split app and node configs", () => {
    const files = generate([]).files;
    const root = JSON.parse(file(files, "tsconfig.json").contents) as {
      files: string[];
      references: Array<{ path: string }>;
    };
    expect(root.files).toEqual([]);
    expect(root.references).toEqual([
      { path: "./tsconfig.app.json" },
      { path: "./tsconfig.node.json" },
    ]);

    const app = JSON.parse(file(files, "tsconfig.app.json").contents) as {
      extends: string;
      compilerOptions: {
        paths: Record<string, string[]>;
        types: string[];
      };
      include: string[];
    };
    expect(app.extends).toBe("@vue/tsconfig/tsconfig.dom.json");
    expect(app.compilerOptions.types).toEqual(["vite/client"]);
    // `baseUrl` is intentionally omitted: TypeScript 7 (tsgolint) removed it;
    // `paths` resolves relative to the tsconfig since TS 4.1.
    expect(app.compilerOptions.paths["@/*"]).toEqual(["./src/*"]);
    expect(app.include).toContain("auto-imports.d.ts");
    expect(app.include).toContain("components.d.ts");

    const node = JSON.parse(file(files, "tsconfig.node.json").contents) as {
      compilerOptions: { types: string[]; module: string };
      include: string[];
    };
    expect(node.compilerOptions.types).toEqual(["node"]);
    expect(node.compilerOptions.module).toBe("nodenext");
    expect(node.include).toEqual(["vite.config.ts"]);
  });

  test("vite.config.ts resolves @/ to src and ignores the generated dts", () => {
    const vite = file(generate([]).files, "vite.config.ts").contents;
    expect(vite).toContain("import { fileURLToPath } from 'node:url'");
    expect(vite).toContain("'@': fileURLToPath(new URL('./src', import.meta.url))");
    expect(vite).toContain("'auto-imports.d.ts', 'components.d.ts'");
  });

  test("base package.json gains @types/node and .gitignore the generated dts", () => {
    expect(pkg(generate([]).files).devDependencies["@types/node"]).toBe("^24.19.2");
    const gitignore = file(generate([]).files, ".gitignore").contents;
    expect(gitignore).toContain("auto-imports.d.ts");
    expect(gitignore).toContain("components.d.ts");
  });

  test("base main.ts has no feature wiring", () => {
    expect(file(generate([]).files, "src/main.ts").contents).toBe(BASE_MAIN);
  });
});

describe("render / vue/vueuse", () => {
  test("adds @vueuse/core and nothing else (no wiring)", () => {
    const { files } = generate(["vueuse"]);
    expect(pkg(files).dependencies["@vueuse/core"]).toBe("^15.0.0");
    expect(file(files, "src/main.ts").contents).toBe(BASE_MAIN);
    expect(file(files, "vite.config.ts").contents).not.toContain("@vueuse");
  });
});

describe("render / vue/vueuse-router", () => {
  test("requires vueuse + router and ships a standalone composable", () => {
    const { files, features } = generate(["vueuse-router"]);
    expect(features).toContain("vue/vueuse");
    expect(features).toContain("vue/router");
    const composable = file(files, "src/composables/useRouteQuery.ts");
    expect(composable.source).toBe("vue/vueuse-router");
    expect(composable.contents).toContain("from '@vueuse/router'");
    expect(pkg(files).dependencies["@vueuse/router"]).toBe("^15.0.0");
    // Standalone file: the entry stays untouched (an unused import would fail
    // the generated project's lint).
    expect(file(files, "src/main.ts").contents).not.toContain("@vueuse/router");
  });
});

describe("render / vue/reka-ui", () => {
  test("adds reka-ui and ships a wired dialog example", () => {
    const { files } = generate(["reka-ui"]);
    expect(pkg(files).dependencies["reka-ui"]).toBe("^2.11.0");
    const dialog = file(files, "src/components/RekaDialog.vue");
    expect(dialog.source).toBe("vue/reka-ui");
    const app = file(files, "src/App.vue").contents;
    expect(app).toContain("import RekaDialog from './components/RekaDialog.vue'");
    expect(app).toContain("<RekaDialog />");
    // All wiring lives in the app-script/app-template anchors; the entry stays
    // byte-identical to the base.
    expect(file(files, "src/main.ts").contents).toBe(BASE_MAIN);
  });

  test("reka-ui is mutually exclusive with the other vue/ui kits", () => {
    expectConflict(["vue/reka-ui", "vue/naive-ui"], "vue/ui");
    expectConflict(["vue/reka-ui", "vue/element-plus"], "vue/ui");
    expectConflict(["vue/reka-ui", "vue/shadcn-vue"], "vue/ui");
  });
});

describe("render / vue/data (query ⟂ colada ⟂ alova)", () => {
  test("vue/query wires a shared query client", () => {
    const { files } = generate(["query"]);
    expect(file(files, "src/lib/queryClient.ts").contents).toContain("new QueryClient()");
    const main = file(files, "src/main.ts").contents;
    expect(main).toContain("import { VueQueryPlugin } from '@tanstack/vue-query'");
    expect(main).toContain("import { queryClient } from './lib/queryClient'");
    expect(main).toContain("app.use(VueQueryPlugin, { queryClient })");
    expect(pkg(files).dependencies["@tanstack/vue-query"]).toBe("^5.104.0");
    // `@tanstack/vue-query` pulls `vue-demi`, whose postinstall must be allowed
    // for a clean `pnpm install`.
    expect(file(files, "pnpm-workspace.yaml").contents).toContain("vue-demi: true");
  });

  test("vue/colada requires pinia, installs after it and ships defaults + example", () => {
    const { files, features } = generate(["colada"]);
    expect(features).toEqual(["vue/pinia", "vue/colada"]);
    const main = file(files, "src/main.ts").contents;
    expect(main).toContain("app.use(createPinia())");
    expect(main).toContain("import { coladaOptions } from './lib/colada'");
    expect(main).toContain("app.use(PiniaColada, coladaOptions)");
    expect(main.indexOf("app.use(createPinia())")).toBeLessThan(
      main.indexOf("app.use(PiniaColada"),
    );
    expect(pkg(files).dependencies["@pinia/colada"]).toBe("^1.4.9");
    const options = file(files, "src/lib/colada.ts");
    expect(options.source).toBe("vue/colada");
    expect(options.contents).toContain("staleTime: 30_000");
    expect(file(files, "src/api/todos.ts").contents).toContain("fetchTodos");
    expect(file(files, "src/composables/useTodos.ts").contents).toContain("useQuery");
  });

  test("vue/alova ships a configured client and a composable", () => {
    const { files, features } = generate(["alova"]);
    expect(features).toEqual(["vue/alova"]);
    const client = file(files, "src/lib/alova.ts");
    expect(client.source).toBe("vue/alova");
    expect(client.contents).toContain("createAlova(");
    expect(client.contents).toContain("statesHook: vueHook");
    expect(client.contents).toContain("requestAdapter: adapterFetch()");
    expect(client.contents).toContain("baseURL: import.meta.env.VITE_API_BASE_URL");
    expect(client.contents).toContain("timeout: 15_000");
    expect(file(files, "src/api/todos.ts").contents).toContain("alova.Get<Todo[]>");
    expect(file(files, "src/composables/useTodos.ts").contents).toContain("from 'alova/client'");
    expect(pkg(files).dependencies.alova).toBe("^3.5.5");
    // Alova needs no `app.use`; the entry stays byte-identical to the base.
    expect(file(files, "src/main.ts").contents).toBe(BASE_MAIN);
  });

  test("query / colada / alova are mutually exclusive", () => {
    expectConflict(["vue/query", "vue/colada"], "vue/data");
    expectConflict(["vue/query", "vue/alova"], "vue/data");
    expectConflict(["vue/colada", "vue/alova"], "vue/data");
  });
});

describe("render / vue/testing", () => {
  test("uses the bundled vite-plus/test runner with @vue/test-utils + happy-dom", () => {
    const { files } = generate(["testing"]);
    const deps = pkg(files);
    expect(deps.devDependencies.vitest).toBeUndefined();
    expect(deps.devDependencies["@vue/test-utils"]).toBe("^2.5.0");
    expect(deps.devDependencies["happy-dom"]).toBe("^21.0.0");
    expect(deps.scripts.test).toBe("vp test");
    const spec = file(files, "src/App.test.ts");
    expect(spec.source).toBe("vue/testing");
    // Headless + self-contained: per-file DOM env and an inline component.
    // (Build the annotation string at runtime so vitest's own per-file
    // environment scanner does not pick it up from *this* test file.)
    expect(spec.contents).toContain(["@vitest-environment", "happy-dom"].join(" "));
    expect(spec.contents).toContain("from 'vite-plus/test'");
    expect(spec.contents).toContain("from '@vue/test-utils'");
    expect(spec.contents).toContain("mount(");
    expect(spec.contents).not.toContain("./App.vue");
  });
});

describe("render / vue/css (tailwind ⟂ unocss)", () => {
  test("no CSS engine -> empty css-imports region", () => {
    expect(file(generate([]).files, "src/style.css").contents).toBe(STYLE_CSS);
  });

  test("tailwind injects @import 'tailwindcss' and the vite plugin", () => {
    const { files } = generate(["tailwind"]);
    expect(file(files, "src/style.css").contents).toBe(`@import 'tailwindcss';\n${STYLE_CSS}`);
    const vite = file(files, "vite.config.ts").contents;
    expect(vite).toContain("import tailwindcss from '@tailwindcss/vite'");
    expect(vite).toContain("tailwindcss(),");
    const deps = pkg(files).devDependencies;
    expect(deps.tailwindcss).toBe("^4.3.0");
    expect(deps["@tailwindcss/vite"]).toBe("^4.3.0");
  });

  test("unocss imports virtual:uno.css from the entry (no @unocss/reset)", () => {
    const { files } = generate(["unocss"]);
    // The virtual entry is a JS side-effect import, not a CSS `@import`
    // (rolldown-Vite 8 cannot resolve it from CSS).
    expect(file(files, "src/style.css").contents).toBe(STYLE_CSS);
    expect(file(files, "src/main.ts").contents).toContain("import 'virtual:uno.css'");
    const vite = file(files, "vite.config.ts").contents;
    expect(vite).toContain("import UnoCSS from 'unocss/vite'");
    expect(vite).toContain("import { presetWind4 } from 'unocss'");
    expect(vite).toContain("UnoCSS({ presets: [presetWind4()] }),");
    const deps = pkg(files).devDependencies;
    expect(deps.unocss).toBe("^66.11.0");
    expect(deps["@unocss/reset"]).toBeUndefined();
  });

  test("tailwind + unocss are mutually exclusive", () => {
    expectConflict(["vue/tailwind", "vue/unocss"], "vue/css");
  });
});

describe("render / vue/ui (naive-ui / element-plus)", () => {
  test("naive-ui resolves components automatically and renders <n-button>", () => {
    const { files } = generate(["naive-ui"]);
    const vite = file(files, "vite.config.ts").contents;
    expect(vite).toContain("import AutoImport from 'unplugin-auto-import/vite'");
    expect(vite).toContain("from 'unplugin-vue-components/resolvers'");
    expect(vite).toContain(
      "AutoImport({ imports: ['vue'], resolvers: [NaiveUiResolver()], dts: 'auto-imports.d.ts' }),",
    );
    expect(vite).toContain(
      "Components({ resolvers: [NaiveUiResolver()], dts: 'components.d.ts' }),",
    );
    const app = file(files, "src/App.vue").contents;
    expect(app).toContain("<n-config-provider>");
    expect(app).toContain('<n-button type="primary">Naive UI</n-button>');
    const deps = pkg(files);
    expect(deps.dependencies["naive-ui"]).toBe("^2.45.0");
    expect(deps.devDependencies["unplugin-vue-components"]).toBe("^32.1.0");
    expect(deps.devDependencies["unplugin-auto-import"]).toBe("^21.1.0");
  });

  test("element-plus uses the dual resolver with importStyle css", () => {
    const { files } = generate(["element-plus"]);
    const vite = file(files, "vite.config.ts").contents;
    expect(vite).toContain(
      "import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'",
    );
    expect(vite).toContain("resolvers: [ElementPlusResolver({ importStyle: 'css' })],");
    expect(file(files, "src/App.vue").contents).toContain(
      '<el-button type="primary">Element Plus</el-button>',
    );
    const deps = pkg(files);
    expect(deps.dependencies["element-plus"]).toBe("^2.14.0");
  });

  test("naive-ui + element-plus are mutually exclusive", () => {
    expectConflict(["vue/naive-ui", "vue/element-plus"], "vue/ui");
  });
});

describe("resolve / framework-aware bare tokens", () => {
  test("a shared bare token resolves to the selected framework", () => {
    const registry = loadRegistry();
    const vue = resolve({ ...ANSWERS, framework: "vue", features: ["testing"] }, registry);
    expect(vue.explicitFeatures).toEqual(["vue/testing"]);
    const hono = resolve({ ...ANSWERS, framework: "hono", features: ["testing"] }, registry);
    expect(hono.explicitFeatures).toEqual(["hono/testing"]);
  });
});

describe("presets / vue (M8a)", () => {
  const registry = loadRegistry();

  function presetPlan(id: string): ReturnType<typeof render> {
    const preset = expandPreset(id, registry);
    expect(preset.framework).toBe("vue");
    return render(resolve({ ...ANSWERS, features: preset.features }, registry), registry);
  }

  test("vue-standard = router + pinia + vueuse", () => {
    const preset = expandPreset("vue-standard", registry);
    expect(preset.features).toEqual(["vue/router", "vue/pinia", "vue/vueuse"]);
    const files = presetPlan("vue-standard");
    expect(file(files, "src/router/index.ts")).toBeDefined();
    expect(file(files, "src/stores/counter.ts")).toBeDefined();
    for (const entry of files) expect(entry.contents).not.toContain("@code4x");
  });

  test("vue-naive-tw = standard + naive-ui + tailwind; byte-stable vs explicit list", () => {
    const preset = expandPreset("vue-naive-tw", registry);
    const fromPreset = render(
      resolve({ ...ANSWERS, features: preset.features }, registry),
      registry,
    );
    const explicit = render(
      resolve(
        {
          ...ANSWERS,
          features: ["vue/tailwind", "vue/naive-ui", "vue/vueuse", "vue/router", "vue/pinia"],
        },
        registry,
      ),
      registry,
    );
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(fromPreset));
    expect(file(fromPreset, "src/style.css").contents).toContain("@import 'tailwindcss';");
    expect(file(fromPreset, "src/App.vue").contents).toContain("<n-button");
  });

  test("vue-element-tw = standard + element-plus + tailwind", () => {
    const files = presetPlan("vue-element-tw");
    expect(file(files, "src/App.vue").contents).toContain("<el-button");
    expect(file(files, "src/style.css").contents).toContain("@import 'tailwindcss';");
    expect(pkg(files).dependencies["element-plus"]).toBe("^2.14.0");
  });

  test("vue-unocss-min = router + pinia + unocss", () => {
    const preset = expandPreset("vue-unocss-min", registry);
    expect(preset.features).toEqual(["vue/router", "vue/pinia", "vue/unocss"]);
    const files = presetPlan("vue-unocss-min");
    expect(file(files, "src/main.ts").contents).toContain("import 'virtual:uno.css'");
  });

  test("vue-full = standard + query + testing (semantics widened in M8a)", () => {
    const preset = expandPreset("vue-full", registry);
    expect(preset.features).toEqual([
      "vue/router",
      "vue/pinia",
      "vue/vueuse",
      "vue/query",
      "vue/testing",
    ]);
    const files = presetPlan("vue-full");
    expect(file(files, "src/lib/queryClient.ts")).toBeDefined();
    expect(file(files, "src/App.test.ts")).toBeDefined();
    expect(pkg(files).scripts.test).toBe("vp test");
  });

  test("preset selection is byte-stable across all vue presets", () => {
    for (const id of [
      "vue-standard",
      "vue-naive-tw",
      "vue-element-tw",
      "vue-unocss-min",
      "vue-full",
    ]) {
      const preset = expandPreset(id, registry);
      const a = render(resolve({ ...ANSWERS, features: preset.features }, registry), registry);
      const b = render(
        resolve({ ...ANSWERS, features: [...preset.features].reverse() }, registry),
        registry,
      );
      expect(JSON.stringify(b), id).toBe(JSON.stringify(a));
    }
  });
});
