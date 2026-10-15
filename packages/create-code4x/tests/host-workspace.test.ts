import { afterAll, describe, expect, test } from "vite-plus/test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolve } from "../src/domain/resolve.ts";
import { catalogCandidates, catalogRewriteNames, render } from "../src/domain/render.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import { detectNestedWorkspace, readHostWorkspace } from "../src/io/workspace.ts";
import type { Answers, ProjectContext, VirtualFile } from "../src/domain/types.ts";

const roots: string[] = [];
function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "code4x-host-"));
  roots.push(dir);
  return dir;
}
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const registry = loadRegistry();

const VUE_ANSWERS: Answers = {
  targetDir: "./apps/web",
  projectName: "web",
  framework: "vue",
  features: [],
  packageManager: "pnpm",
  install: false,
  git: false,
};

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

describe("readHostWorkspace / parsing", () => {
  test("parses the default catalog and allowBuilds map", () => {
    const root = tempRoot();
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      [
        "packages:",
        "  - apps/*",
        "catalog:",
        "  vue: ^3.5.0",
        "  vite: npm:@voidzero-dev/vite-plus-core@1.1.0",
        "  vite-plus: 1.1.0",
        "allowBuilds:",
        "  esbuild: true",
        "  electron: true",
        "",
      ].join("\n"),
    );
    const host = readHostWorkspace(join(root, "apps", "web"));
    expect(host?.root).toBe(root);
    expect(host?.catalog).toEqual({
      vue: "^3.5.0",
      vite: "npm:@voidzero-dev/vite-plus-core@1.1.0",
      "vite-plus": "1.1.0",
    });
    expect(host?.allowBuilds.sort()).toEqual(["electron", "esbuild"]);
  });

  test("supports legacy onlyBuiltDependencies and empty catalogs", () => {
    const root = tempRoot();
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - apps/*\nonlyBuiltDependencies:\n  - esbuild\n",
    );
    const host = readHostWorkspace(join(root, "apps", "web"));
    expect(host?.catalog).toEqual({});
    expect(host?.allowBuilds).toEqual(["esbuild"]);
  });

  test("not nested -> undefined", () => {
    const root = tempRoot();
    expect(readHostWorkspace(join(root, "app"))).toBeUndefined();
  });

  test("malformed host file degrades to an empty host (no throw)", () => {
    const root = tempRoot();
    writeFileSync(join(root, "pnpm-workspace.yaml"), "catalog: [unclosed\n  : :\n");
    const host = readHostWorkspace(join(root, "apps", "web"));
    expect(host).toBeDefined();
    expect(host?.catalog).toEqual({});
    expect(host?.allowBuilds).toEqual([]);
  });

  test("workspaces-only package.json host -> empty data (still nested)", () => {
    const root = tempRoot();
    writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
    expect(detectNestedWorkspace(join(root, "x", "y"))).toBe(true);
    const host = readHostWorkspace(join(root, "x", "y"));
    expect(host?.catalog).toEqual({});
  });
});

describe("render / catalog-aware versions", () => {
  const HOST: ProjectContext = {
    nestedWorkspace: true,
    pmFrom: "env",
    host: { catalog: { vue: "^3.5.0", tailwindcss: "^4.3.0" }, allowBuilds: [] },
  };

  test("deps present in the host catalog become catalog:, others keep caret", () => {
    const plan = resolve({ ...VUE_ANSWERS, features: ["vue/tailwind"] }, registry, HOST);
    const dependencies = pkg(render(plan, registry)).dependencies;
    const devDependencies = pkg(render(plan, registry)).devDependencies;
    expect(dependencies.vue).toBe("catalog:");
    expect(devDependencies.tailwindcss).toBe("catalog:");
    expect(devDependencies["@tailwindcss/vite"]).toBe("^4.3.0");
  });

  test("feature-packaged deps are rewritten too", () => {
    const host: ProjectContext = {
      nestedWorkspace: true,
      pmFrom: "env",
      host: { catalog: { "@vitejs/plugin-vue": "^6.0.0" }, allowBuilds: [] },
    };
    const plan = resolve(VUE_ANSWERS, registry, host);
    expect(pkg(render(plan, registry)).devDependencies["@vitejs/plugin-vue"]).toBe("catalog:");
  });

  test("standalone (no host) keeps caret versions", () => {
    const plan = resolve(VUE_ANSWERS, registry);
    const pkgJson = pkg(render(plan, registry));
    expect(pkgJson.dependencies.vue).toBe("^3.5.0");
    expect(Object.values(pkgJson.devDependencies)).not.toContain("catalog:");
  });

  test("nested + cataloged -> still no pnpm-workspace.yaml, render is deterministic", () => {
    const plan = resolve({ ...VUE_ANSWERS, features: ["vue/tailwind"] }, registry, HOST);
    const first = render(plan, registry);
    const second = render(plan, registry);
    expect(first.map((f) => f.path)).not.toContain("pnpm-workspace.yaml");
    expect(first).toEqual(second);
    expect(catalogRewriteNames(file(first, "package.json").contents)).toEqual([
      "tailwindcss",
      "vue",
    ]);
  });

  test("catalogCandidates lists non-cataloged deps in id order", () => {
    const plan = resolve(VUE_ANSWERS, registry, HOST);
    const candidates = catalogCandidates(file(render(plan, registry), "package.json").contents);
    expect(candidates).not.toHaveProperty("vue");
    expect(Object.keys(candidates)).toEqual(Object.keys(candidates).sort());
    expect(candidates["@vitejs/plugin-vue"]).toBe("^6.0.0");
  });
});

describe("render / tailwind scan scope (nested)", () => {
  test("nested scopes the source base to the app package", () => {
    const context: ProjectContext = {
      nestedWorkspace: true,
      pmFrom: "env",
      host: { catalog: {}, allowBuilds: [] },
    };
    const plan = resolve({ ...VUE_ANSWERS, features: ["vue/tailwind"] }, registry, context);
    const css = file(render(plan, registry), "src/style.css").contents;
    expect(css).toContain("@import 'tailwindcss' source('../');");
    expect(css.match(/@import 'tailwindcss'/g)?.length).toBe(1);
  });

  test("standalone keeps the unscoped import", () => {
    const plan = resolve({ ...VUE_ANSWERS, features: ["vue/tailwind"] }, registry);
    const css = file(render(plan, registry), "src/style.css").contents;
    expect(css).toContain("@import 'tailwindcss';");
    expect(css).not.toContain("source(");
  });

  // Sanity: a real host workspace on disk drives the scoping flag end-to-end.
  test("readHostWorkspace + render wires the scoped form", () => {
    const root = tempRoot();
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    writeFileSync(
      join(root, "pnpm-workspace.yaml"),
      "packages:\n  - apps/*\ncatalog:\n  vue: ^3.5.0\n",
    );
    const host = readHostWorkspace(join(root, "apps", "web"));
    expect(host).toBeDefined();
    const context: ProjectContext = {
      nestedWorkspace: true,
      pmFrom: "env",
      host: { catalog: host?.catalog ?? {}, allowBuilds: host?.allowBuilds ?? [] },
    };
    const plan = resolve({ ...VUE_ANSWERS, features: ["vue/tailwind"] }, registry, context);
    const files = render(plan, registry);
    expect(pkg(files).dependencies.vue).toBe("catalog:");
    expect(file(files, "src/style.css").contents).toContain("source('../')");
  });
});
