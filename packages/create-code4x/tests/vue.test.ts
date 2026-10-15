import { describe, expect, test } from "vite-plus/test";

import { resolve } from "../src/domain/resolve.ts";
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

const BASE_MAIN = `import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

const app = createApp(App)

app.mount('#app')
`;

const PINIA_MAIN = `import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createPinia } from 'pinia'

const app = createApp(App)
app.use(createPinia())

app.mount('#app')
`;

const ROUTER_MAIN = `import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)

app.mount('#app')
`;

const BOTH_MAIN = `import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { createPinia } from 'pinia'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)

app.mount('#app')
`;

const VITE_CONFIG = `import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'
import vue from '@vitejs/plugin-vue'

// The cast keeps \`tsc\`/\`vue-tsc\` happy: \`@vitejs/plugin-vue\` returns \`vite\`'s
// plugin type while \`vite-plus\`'s config expects its own; a plain object literal
// also trips a TS 5.9 overload-resolution bug.
export default defineConfig({
  resolve: {
    // \`@/…\` maps to \`src/…\` (kept in sync with \`tsconfig.json\` \`paths\`).
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    // Vite plugins.
    vue(),
  ],
  lint: {
    // UI-kit unplugins generate these at build time; never lint/format them.
    ignorePatterns: ['dist/**', 'auto-imports.d.ts', 'components.d.ts'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    singleQuote: true,
    semi: false,
    sortPackageJson: false,
    ignorePatterns: ['dist/**', '.code4xrc.json', 'auto-imports.d.ts', 'components.d.ts'],
  },
} as Parameters<typeof defineConfig>[0])
`;

const APP_BASE = `<script setup lang="ts">
import { ref } from 'vue'

const message = ref('Hello, Vue + Vite!')
</script>

<template>
  <h1>{{ message }}</h1>
</template>
`;

const APP_ROUTER = `<script setup lang="ts">
import { ref } from 'vue'

const message = ref('Hello, Vue + Vite!')
</script>

<template>
  <h1>{{ message }}</h1>
  <router-view />
</template>
`;

describe("render / vue base", () => {
  test("file manifest", () => {
    expect(generate([]).files.map((entry) => entry.path)).toEqual([
      ".gitignore",
      "README.md",
      "index.html",
      "package.json",
      "pnpm-workspace.yaml",
      "src/App.vue",
      "src/env.d.ts",
      "src/main.ts",
      "src/style.css",
      "tsconfig.json",
      "vite.config.ts",
    ]);
  });

  test("src/main.ts golden", () => {
    expect(file(generate([]).files, "src/main.ts").contents).toBe(BASE_MAIN);
  });

  test("vite.config.ts golden with the vue() plugin", () => {
    expect(file(generate([]).files, "vite.config.ts").contents).toBe(VITE_CONFIG);
  });

  test("src/App.vue golden (no router-view without the router feature)", () => {
    expect(file(generate([]).files, "src/App.vue").contents).toBe(APP_BASE);
    expect(file(generate(["pinia"]).files, "src/App.vue").contents).toBe(APP_BASE);
  });

  test("package.json deps + vue-tsc build script", () => {
    const pkg = JSON.parse(file(generate([]).files, "package.json").contents) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({ vue: "^3.5.0" });
    expect(pkg.devDependencies).toMatchObject({
      vite: "^8.0.0",
      "vite-plus": "^1.1.0",
      "@vitejs/plugin-vue": "^6.0.0",
      "vue-tsc": "^3.0.0",
    });
    expect(pkg.scripts.build).toBe("vue-tsc --noEmit && vite build");
    expect(pkg.scripts.check).toBe("vp check");
  });

  test("no markers leak", () => {
    for (const entry of generate(["pinia", "router"]).files) {
      expect(entry.contents).not.toContain("@code4x");
    }
  });
});

describe("render / vue features", () => {
  test("{+pinia}", () => {
    expect(file(generate(["pinia"]).files, "src/main.ts").contents).toBe(PINIA_MAIN);
  });

  test("{+router}", () => {
    expect(file(generate(["router"]).files, "src/main.ts").contents).toBe(ROUTER_MAIN);
  });

  test("{+pinia+router}: pinia before router by id tiebreak", () => {
    expect(file(generate(["pinia", "router"]).files, "src/main.ts").contents).toBe(BOTH_MAIN);
  });

  test("vite.config.ts is unchanged by features (plugins baseline only)", () => {
    expect(file(generate(["pinia", "router"]).files, "vite.config.ts").contents).toBe(VITE_CONFIG);
  });

  test("router contributes <router-view /> to App.vue; pinia does not", () => {
    expect(file(generate(["router"]).files, "src/App.vue").contents).toBe(APP_ROUTER);
    expect(file(generate(["pinia", "router"]).files, "src/App.vue").contents).toBe(APP_ROUTER);
    expect(file(generate(["pinia"]).files, "src/App.vue").contents).not.toContain("router-view");
  });

  test("router ships router + Home view; pinia ships the store", () => {
    const routerFiles = generate(["router"]).files;
    expect(file(routerFiles, "src/router/index.ts").source).toBe("vue/router");
    expect(file(routerFiles, "src/views/Home.vue").source).toBe("vue/router");
    const piniaFiles = generate(["pinia"]).files;
    expect(file(piniaFiles, "src/stores/counter.ts").source).toBe("vue/pinia");
  });

  test("deps merge across vue features", () => {
    const pkg = JSON.parse(file(generate(["pinia", "router"]).files, "package.json").contents) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({
      vue: "^3.5.0",
      pinia: "^4.0.0",
      "vue-router": "^5.0.0",
    });
  });

  test("selection order does not affect the bytes", () => {
    const a = generate(["pinia", "router"]).files;
    const b = generate(["router", "pinia"]).files;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  test("rendering is idempotent", () => {
    const first = generate(["pinia", "router"]).files;
    const second = generate(["pinia", "router"]).files;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("assembly sources are attributed to each file", () => {
    const files = generate(["pinia"]).files;
    expect(file(files, "src/main.ts").source).toBe("assembly");
    expect(file(files, "vite.config.ts").source).toBe("assembly");
    expect(file(files, "src/App.vue").source).toBe("assembly");
  });
});
