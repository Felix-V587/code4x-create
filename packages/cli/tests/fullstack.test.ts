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
    };
    expect(root.name).toBe("my-fullstack");
    expect(root.private).toBe(true);
    expect(root.scripts).toEqual({
      dev: "pnpm -r --parallel dev",
      "dev:api": "pnpm --filter ./apps/api dev",
      "dev:web": "pnpm --filter ./apps/web dev",
      "dev:desktop": "pnpm --filter ./apps/desktop dev",
      build: "pnpm -r build",
      check: "pnpm -r check",
      test: "pnpm -r test",
      preview: "pnpm --filter ./apps/web preview",
    });
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
