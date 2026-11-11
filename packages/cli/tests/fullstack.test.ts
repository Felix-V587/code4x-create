import { describe, expect, test } from "vite-plus/test";

import {
  FULLSTACK_APPS,
  buildFullstackPlans,
  collectFullstackAllowBuilds,
  fullstackRcApps,
  renderFullstack,
  syntheticFullstackPlan,
} from "../src/domain/fullstack.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Answers, ProjectContext, VirtualFile } from "../src/domain/types.ts";

const registry = loadRegistry();

const ANSWERS: Answers = {
  targetDir: "./my-fullstack",
  projectName: "my-fullstack",
  framework: "fullstack",
  projectType: "fullstack",
  features: [],
  packageManager: "pnpm",
  install: false,
  git: true,
  workspaceName: "my-fullstack",
  stackApps: FULLSTACK_APPS,
};

const CONTEXT: ProjectContext = {
  nestedWorkspace: true,
  pmFrom: "default",
  host: { catalog: {}, allowBuilds: [] },
};

function build(): { files: VirtualFile[]; plans: ReturnType<typeof buildFullstackPlans> } {
  const plans = buildFullstackPlans(ANSWERS, registry, CONTEXT);
  return { plans, files: renderFullstack(plans, registry, ANSWERS) };
}

function file(files: VirtualFile[], path: string): VirtualFile {
  const found = files.find((entry) => entry.path === path);
  expect(found, path).toBeDefined();
  return found as VirtualFile;
}

function pkg(files: VirtualFile[], path: string): Record<string, unknown> {
  return JSON.parse(file(files, path).contents) as Record<string, unknown>;
}

describe("fullstack / plans", () => {
  test("uses the fixed api / web / desktop frameworks", () => {
    const { plans } = build();
    expect(plans.map(({ app, plan }) => [app.name, app.framework, plan.framework])).toEqual([
      ["api", "hono", "hono"],
      ["web", "vue", "vue"],
      ["desktop", "electron", "electron"],
    ]);
  });

  test("web includes the full Vue family + reka-ui / alova / unocss, without i18n", () => {
    const { plans } = build();
    const web = plans.find(({ app }) => app.name === "web")?.plan;
    expect(web).toBeDefined();
    for (const id of [
      "vue/router",
      "vue/pinia",
      "vue/vueuse",
      "vue/vueuse-router",
      "vue/testing",
      "vue/reka-ui",
      "vue/alova",
      "vue/unocss",
    ]) {
      expect(web?.features).toContain(id);
    }
    expect(web?.features).not.toContain("vue/i18n");
  });

  test("api uses hono-standard features; desktop ships electron-builder", () => {
    const { plans } = build();
    const api = plans.find(({ app }) => app.name === "api")?.plan;
    expect(api?.features).toEqual(
      expect.arrayContaining(["hono/api-guard", "hono/zod", "hono/testing"]),
    );
    const desktop = plans.find(({ app }) => app.name === "desktop")?.plan;
    expect(desktop?.features).toContain("electron/builder");
  });

  test("allowBuilds and rc apps are deterministic", () => {
    const { plans } = build();
    expect(collectFullstackAllowBuilds(plans, registry)).toEqual([
      "esbuild",
      "electron",
      "electron-winstaller",
    ]);
    expect(fullstackRcApps(plans).map((app) => app.path)).toEqual([
      "apps/api",
      "apps/web",
      "apps/desktop",
    ]);
    const synthetic = syntheticFullstackPlan(ANSWERS, plans, CONTEXT);
    expect(synthetic.framework).toBe("fullstack");
    expect(synthetic.features).toContain("vue/reka-ui");
    expect(synthetic.features).not.toContain("vue/i18n");
  });
});

describe("fullstack / render", () => {
  test("writes three apps under apps/<name> plus the workspace root", () => {
    const { files } = build();
    expect(file(files, "apps/api/src/index.ts").source).toBe("assembly");
    expect(file(files, "apps/api/package.json").contents).toContain('"name": "api"');
    expect(file(files, "apps/web/src/main.ts").source).toBe("assembly");
    expect(file(files, "apps/web/package.json").contents).toContain('"name": "web"');
    expect(file(files, "apps/desktop/src/main/index.ts").source).toBe("assembly");
    expect(file(files, "apps/desktop/package.json").contents).toContain('"name": "desktop"');
    for (const app of ["api", "web", "desktop"]) {
      expect(files.some((entry) => entry.path === `apps/${app}/pnpm-workspace.yaml`)).toBe(false);
    }
  });

  test("root package.json forwards the standard scripts", () => {
    const { files } = build();
    const root = pkg(files, "package.json") as {
      name: string;
      private: boolean;
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(root.name).toBe("my-fullstack");
    expect(root.private).toBe(true);
    expect(root.scripts).toEqual({
      dev: "vp run -r --parallel dev",
      "dev:api": "vp run --filter ./apps/api dev",
      "dev:web": "vp run --filter ./apps/web dev",
      "dev:desktop": "vp run --filter ./apps/desktop dev",
      build: "vp run -r build",
      typecheck: "vp run -r typecheck",
      check: "vp check",
      test: "vp run -r test",
      preview: "vp run --filter ./apps/web preview",
    });
    expect(root.devDependencies["vite-plus"]).toBe("^1.5.0");
  });

  test("root vite.config.ts enables script caching and shared lint/fmt", () => {
    const { files } = build();
    const config = file(files, "vite.config.ts");
    expect(config.source).toBe("fullstack");
    expect(config.contents).not.toContain("defaultPackage");
    expect(config.contents).toContain("cache: { scripts: true }");
    expect(config.contents).toContain("singleQuote: true");
    expect(config.contents).toContain("sortPackageJson: false");
  });

  test("root workspace yaml unions allowBuilds and peer rules", () => {
    const { files } = build();
    const yaml = file(files, "pnpm-workspace.yaml").contents;
    expect(yaml).toContain("packages:\n  - apps/*\n  - packages/*");
    expect(yaml).toContain(
      "allowBuilds:\n  esbuild: true\n  electron: true\n  electron-winstaller: true",
    );
    expect(yaml).toContain("peerDependencyRules:\n  allowedVersions:\n    vite: '*'");
  });

  test("web app wires reka-ui, alova and unocss", () => {
    const { files } = build();
    const app = file(files, "apps/web/src/App.vue").contents;
    expect(app).toContain("import RekaDialog from './components/RekaDialog.vue'");
    expect(app).toContain("<RekaDialog />");
    const main = file(files, "apps/web/src/main.ts").contents;
    expect(main).toContain("import 'virtual:uno.css'");
    const deps = (pkg(files, "apps/web/package.json") as { dependencies: Record<string, string> })
      .dependencies;
    expect(deps["reka-ui"]).toBe("^2.11.0");
    expect(deps.alova).toBeDefined();
    expect(deps.unocss).toBeUndefined();
    const devDeps = (
      pkg(files, "apps/web/package.json") as { devDependencies: Record<string, string> }
    ).devDependencies;
    expect(devDeps.unocss).toBeDefined();
    expect(deps["vue-i18n"]).toBeUndefined();
    const scripts = (pkg(files, "apps/web/package.json") as { scripts: Record<string, string> })
      .scripts;
    expect(scripts.dev).toBe("vp dev --port 5175 --strictPort");
  });

  test("rendering twice is byte-identical", () => {
    const first = build().files;
    const second = build().files;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("workspace root name is deduped against fixed app names", () => {
    const plans = buildFullstackPlans(
      { ...ANSWERS, targetDir: "./web", workspaceName: undefined },
      registry,
      CONTEXT,
    );
    const files = renderFullstack(plans, registry, {
      ...ANSWERS,
      targetDir: "./web",
      workspaceName: undefined,
    });
    expect((pkg(files, "package.json") as { name: string }).name).toBe("web-workspace");
  });
});

describe("fullstack / scaffold", () => {
  test("generates packages/shared-types and wires it into all three apps", () => {
    const { files } = build();
    const shared = pkg(files, "packages/shared-types/package.json") as {
      name: string;
      scripts: Record<string, string>;
      exports: Record<string, unknown>;
    };
    expect(shared.name).toBe("@my-fullstack/shared-types");
    expect(shared.scripts.build).toBe("vp pack");
    expect(shared.exports).toBeDefined();
    expect(file(files, "packages/shared-types/src/index.ts").contents).toContain(
      "export interface Todo",
    );

    for (const app of ["api", "web", "desktop"]) {
      const deps = (
        pkg(files, `apps/${app}/package.json`) as {
          dependencies: Record<string, string>;
        }
      ).dependencies;
      expect(deps["@my-fullstack/shared-types"]).toBe("workspace:*");
    }
  });

  test("ships runnable sample code in api / web / desktop", () => {
    const { files } = build();
    const apiIndex = file(files, "apps/api/src/index.ts").contents;
    expect(apiIndex).toContain("import { todos } from './routes/todos'");
    expect(apiIndex).toContain("app.route('/todos', todos)");
    expect(file(files, "apps/api/src/routes/todos.ts").contents).toContain(
      "import type { CreateTodoInput, Todo } from '@my-fullstack/shared-types'",
    );
    expect(file(files, "apps/api/src/routes/todos.test.ts").contents).toContain(
      "POST /todos validates and appends",
    );

    expect(file(files, "apps/web/src/api/todos.ts").contents).toContain(
      "import type { Todo } from '@my-fullstack/shared-types'",
    );
    expect(file(files, "apps/web/src/views/Home.vue").contents).toContain("useTodos()");
    expect(file(files, "apps/web/vite.config.ts").contents).toContain(
      "target: 'http://localhost:3000'",
    );

    const ipc = file(files, "apps/desktop/src/shared/ipc.ts").contents;
    expect(ipc).toContain("const SampleTodoSchema: z.ZodType<Todo>");
    expect(ipc).toContain("'app:todo': { args: z.tuple([]), result: SampleTodoSchema }");
    expect(file(files, "apps/desktop/src/main/index.ts").contents).toContain("register('app:todo'");
    expect(file(files, "apps/desktop/src/renderer/src/App.vue").contents).toContain("api.todo()");
  });

  test("fullstack apps keep the standard framework Vite configs", () => {
    const { files, plans } = build();
    expect(plans.every(({ plan }) => plan.answers.projectType === "monorepo")).toBe(true);

    const apiConfig = file(files, "apps/api/vite.config.ts").contents;
    expect(apiConfig).toContain("devServer({ entry: 'src/index.ts' })");
    expect(apiConfig).toContain("build({ entry: 'src/index.ts', port, shutdownTimeoutMs: 5000 })");

    expect(file(files, "apps/web/vite.config.ts").contents).toContain("vue(),");
    expect(file(files, "apps/desktop/vite.config.ts").contents).toContain("vue()");
  });

  test("nested apps use workspace READMEs and the root build policy", () => {
    const { files } = build();
    for (const app of ["api", "web", "desktop"]) {
      const appPkg = pkg(files, `apps/${app}/package.json`) as { pnpm?: unknown };
      expect(appPkg.pnpm).toBeUndefined();
      const readme = file(files, `apps/${app}/README.md`).contents;
      expect(readme).toContain("**Workspace app**");
      expect(readme).not.toContain("## `.code4xrc.json`");
    }
  });

  test("generates root and per-project AGENTS.md with stack llms.txt links", () => {
    const { files } = build();
    const root = file(files, "AGENTS.md").contents;
    expect(root).toContain("# my-fullstack — AGENTS");
    expect(root).toContain("https://viteplus.dev/llms.txt");
    expect(root).toContain("pnpm check");

    expect(file(files, "apps/api/AGENTS.md").contents).toContain("https://hono.dev/llms.txt");
    expect(file(files, "apps/api/AGENTS.md").contents).toContain("https://zod.dev/llms.txt");
    expect(file(files, "apps/web/AGENTS.md").contents).toContain("https://vuejs.org/llms.txt");
    expect(file(files, "apps/web/AGENTS.md").contents).toContain("https://alova.js.org/llms.txt");
    expect(file(files, "apps/web/AGENTS.md").contents).toContain("https://unocss.dev/llms.txt");
    expect(file(files, "apps/desktop/AGENTS.md").contents).toContain(
      "https://www.electronjs.org/docs/latest/",
    );
    expect(file(files, "packages/shared-types/AGENTS.md").contents).toContain(
      "https://www.typescriptlang.org/docs/",
    );
  });
});
