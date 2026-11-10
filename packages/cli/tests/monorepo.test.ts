import { describe, expect, test } from "vite-plus/test";

import { Code4xError } from "../src/domain/errors.ts";
import { render, renderMonorepoWorkspaceYaml } from "../src/domain/render.ts";
import { resolve } from "../src/domain/resolve.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Answers, Plan, VirtualFile } from "../src/domain/types.ts";

const ANSWERS: Answers = {
  targetDir: "./my-app",
  projectName: "my-app",
  framework: "vue",
  features: [],
  packageManager: "pnpm",
  install: false,
  git: true,
};

const MONOREPO: Answers = {
  ...ANSWERS,
  projectType: "monorepo",
  appName: "web",
  workspaceName: "my-workspace",
};

function generate(
  featureTokens: string[] = [],
  overrides: Partial<Answers> = {},
): { files: VirtualFile[]; plan: Plan } {
  const registry = loadRegistry();
  const plan = resolve({ ...ANSWERS, ...overrides, features: featureTokens }, registry);
  return { files: render(plan, registry), plan };
}

function file(files: VirtualFile[], path: string): VirtualFile {
  const found = files.find((entry) => entry.path === path);
  expect(found, path).toBeDefined();
  return found as VirtualFile;
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

function expectInvalidValue(answers: Answers): void {
  const registry = loadRegistry();
  const plan = resolve({ ...answers, features: [] }, registry);
  const error = capture(() => render(plan, registry));
  expect(error.code).toBe("E-INVALID-VALUE");
}

describe("render / monorepo", () => {
  test("prefixes every app file under apps/<appName>/ and omits the app workspace yaml", () => {
    const { files } = generate([], MONOREPO);
    const paths = files.map((entry) => entry.path);

    expect(paths).toContain("apps/web/package.json");
    expect(paths).toContain("apps/web/src/main.ts");
    expect(paths).toContain("apps/web/vite.config.ts");
    expect(paths).not.toContain("apps/web/pnpm-workspace.yaml");

    // Only the workspace-root files live outside the app directory.
    expect(paths.filter((path) => !path.startsWith("apps/web/"))).toEqual([
      ".gitignore",
      "README.md",
      "package.json",
      "pnpm-workspace.yaml",
      "vite.config.ts",
    ]);
  });

  test("app package.json keeps the created app project name", () => {
    const { files } = generate([], MONOREPO);
    const pkg = JSON.parse(file(files, "apps/web/package.json").contents) as { name: string };
    expect(pkg.name).toBe("my-app");
  });

  test("root package.json runs app scripts through the Vite+ task runner", () => {
    const { files } = generate([], MONOREPO);
    const appPkg = JSON.parse(file(files, "apps/web/package.json").contents) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const rootPkg = JSON.parse(file(files, "package.json").contents) as {
      name: string;
      version: string;
      private: boolean;
      type: string;
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
      engines: { node: string };
    };

    expect(rootPkg).toEqual({
      name: "my-workspace",
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: {
        dev: "vp run -r dev",
        build: "vp run -r build",
        preview: "vp run --filter ./apps/web preview",
        typecheck: "vp run -r typecheck",
        check: "vp check",
      },
      devDependencies: { "vite-plus": "^1.5.0" },
      engines: { node: ">=22" },
    });
    // App key order is preserved, and the root reuses the app's toolchain range.
    expect(Object.keys(rootPkg.scripts)).toEqual(Object.keys(appPkg.scripts));
    expect(rootPkg.devDependencies["vite-plus"]).toBe(appPkg.devDependencies["vite-plus"]);
  });

  test("root vite.config.ts wires defaultPackage, script cache and shared lint/fmt", () => {
    const { files } = generate([], MONOREPO);
    const config = file(files, "vite.config.ts");
    expect(config.source).toBe("monorepo");
    expect(config.contents).toContain("defaultPackage: {");
    expect(config.contents).toContain("dev: './apps/web'");
    expect(config.contents).toContain("build: './apps/web'");
    expect(config.contents).toContain("preview: './apps/web'");
    expect(config.contents).toContain("pack: './apps/web'");
    expect(config.contents).toContain("cache: { scripts: true }");
    expect(config.contents).toContain("singleQuote: true");
    expect(config.contents).toContain("semi: false");
    expect(config.contents).toContain("sortPackageJson: false");
    expect(config.contents).toContain("'**/dist/**'");
  });

  test("root pnpm-workspace.yaml has the exact packages + allowBuilds bytes", () => {
    const { files } = generate([], MONOREPO);
    expect(file(files, "pnpm-workspace.yaml").contents).toBe(
      "packages:\n  - apps/*\n  - packages/*\n\nallowBuilds:\n  esbuild: true\n\npeerDependencyRules:\n  allowedVersions:\n    vite: '*'\n",
    );
    expect(file(files, "pnpm-workspace.yaml").source).toBe("base");
  });

  test("root .gitignore has the workspace defaults", () => {
    const { files } = generate([], MONOREPO);
    expect(file(files, ".gitignore").contents).toBe("node_modules\ndist\n*.local\n.DS_Store\n");
  });

  test("root README describes the workspace and the app path", () => {
    const { files } = generate([], MONOREPO);
    const readme = file(files, "README.md");
    expect(readme.source).toBe("monorepo");
    expect(readme.contents.startsWith("# my-workspace\n")).toBe(true);
    expect(readme.contents).toContain("Generated by **create-code4x**");
    expect(readme.contents).toContain("`apps/web` — Vue application");
    expect(readme.contents).toContain("`packages/*`");
    expect(readme.contents).toContain("pnpm install");
    expect(readme.contents).toContain("pnpm dev");
    expect(readme.contents).toContain("vp run -r build");
    expect(readme.contents).toContain("vp check");
    expect(readme.contents).toContain("vp run --filter ./apps/web <script>");
  });

  test("root package.json source is monorepo", () => {
    const { files } = generate([], MONOREPO);
    expect(file(files, "package.json").source).toBe("monorepo");
  });

  test("tailwind scopes its source inside a monorepo only", () => {
    const monorepoCss = file(generate(["vue/tailwind"], MONOREPO).files, "apps/web/src/style.css");
    expect(monorepoCss.contents).toContain("@import 'tailwindcss' source('../');");

    const standaloneCss = file(generate(["vue/tailwind"]).files, "src/style.css");
    expect(standaloneCss.contents).toContain("@import 'tailwindcss';");
    expect(standaloneCss.contents).not.toContain("source('../')");
  });

  test("root workspace yaml unions feature allowBuilds in plan order", () => {
    const { files } = generate(["vue/query"], MONOREPO);
    expect(file(files, "pnpm-workspace.yaml").contents).toBe(
      "packages:\n  - apps/*\n  - packages/*\n\nallowBuilds:\n  esbuild: true\n  vue-demi: true\n\npeerDependencyRules:\n  allowedVersions:\n    vite: '*'\n",
    );
  });

  test("exported workspace yaml emitter is stable", () => {
    expect(renderMonorepoWorkspaceYaml(["esbuild", "vue-demi"])).toBe(
      "packages:\n  - apps/*\n  - packages/*\n\nallowBuilds:\n  esbuild: true\n  vue-demi: true\n",
    );
    expect(renderMonorepoWorkspaceYaml([])).toBe("packages:\n  - apps/*\n  - packages/*\n");
  });

  test("rendering twice is byte-identical", () => {
    const registry = loadRegistry();
    const plan = resolve({ ...MONOREPO, features: ["vue/query", "vue/tailwind"] }, registry);
    const first = render(plan, registry);
    const second = render(plan, registry);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("missing or unsafe appName -> E-INVALID-VALUE", () => {
    for (const appName of [undefined, "", ".", "..", "a/b", "a\\b"]) {
      const answers: Answers = { ...MONOREPO };
      if (appName === undefined) delete answers.appName;
      else answers.appName = appName;
      expectInvalidValue(answers);
    }
  });

  test("missing workspaceName -> E-INVALID-VALUE", () => {
    const answers: Answers = { ...MONOREPO };
    delete answers.workspaceName;
    expectInvalidValue(answers);
  });
});

describe("render / standalone is unchanged", () => {
  test("vue baseline keeps its original file list and bytes", () => {
    const { files } = generate([]);
    expect(files.map((entry) => entry.path)).toEqual([
      ".gitignore",
      ".vscode/extensions.json",
      "README.md",
      "index.html",
      "package.json",
      "pnpm-workspace.yaml",
      "src/App.vue",
      "src/env.d.ts",
      "src/main.ts",
      "src/style.css",
      "tsconfig.app.json",
      "tsconfig.json",
      "tsconfig.node.json",
      "vite.config.ts",
    ]);
    expect(file(files, "package.json").contents).toContain('"name": "my-app"');
    expect(file(files, "package.json").contents).toContain('"dev": "vp dev"');
    expect(file(files, "src/style.css").contents).not.toContain("source('../')");
  });

  test("allowBuilds still emits the app-level workspace yaml", () => {
    const { files } = generate(["vue/query"]);
    const paths = files.map((entry) => entry.path);
    expect(paths.some((path) => path.startsWith("apps/"))).toBe(false);
    expect(file(files, "pnpm-workspace.yaml").contents).toBe(
      "allowBuilds:\n  esbuild: true\n  vue-demi: true\n\npeerDependencyRules:\n  allowedVersions:\n    vite: '*'\n",
    );
  });
});
