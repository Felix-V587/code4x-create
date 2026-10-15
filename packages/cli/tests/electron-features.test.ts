import { describe, expect, test } from "vite-plus/test";

import { Code4xError } from "../src/domain/errors.ts";
import { resolve } from "../src/domain/resolve.ts";
import { render } from "../src/domain/render.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Answers, VirtualFile } from "../src/domain/types.ts";

const ANSWERS: Answers = {
  targetDir: "./my-app",
  projectName: "my-app",
  framework: "electron",
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

describe("resolve / electron/builder", () => {
  test("resolves on the electron framework (bare + qualified tokens)", () => {
    const registry = loadRegistry();
    const bare = resolve({ ...ANSWERS, features: ["builder"] }, registry);
    expect(bare.explicitFeatures).toEqual(["electron/builder"]);
    expect(bare.features).toEqual(["electron/builder"]);

    const qualified = resolve({ ...ANSWERS, features: ["electron/builder"] }, registry);
    expect(qualified.features).toEqual(["electron/builder"]);
  });

  test("rejects a non-electron framework with E-FEATURE-FRAMEWORK", () => {
    const registry = loadRegistry();
    let error: unknown;
    try {
      resolve({ ...ANSWERS, framework: "vue", features: ["electron/builder"] }, registry);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Code4xError);
    expect((error as Code4xError).code).toBe("E-FEATURE-FRAMEWORK");
    expect((error as Code4xError).exitCode).toBe(1);
  });

  test("is not default-checked (defaults: false)", () => {
    const registry = loadRegistry();
    expect(registry.features["electron/builder"]?.defaults).toBe(false);
  });
});

describe("render / {base + electron/builder}", () => {
  test("adds electron-builder.yml (dist payload, release output, per-OS targets)", () => {
    const { files } = generate(["builder"]);
    const yml = file(files, "electron-builder.yml");
    expect(yml.source).toBe("electron/builder");
    expect(yml.contents).toContain("output: release");
    expect(yml.contents).toContain("dist/**");
    expect(yml.contents).toContain("package.json");
    expect(yml.contents).toContain("AppImage");
    expect(yml.contents).toContain("dmg");
    expect(yml.contents).toContain("nsis");
    // Feature assets get no `{PROJECT}` substitution — never emit the token.
    expect(yml.contents).not.toContain("{PROJECT}");
  });

  test("patches package.json (dist scripts + devDependency) with no conflicts", () => {
    const { files } = generate(["builder"]);
    const pkg = JSON.parse(file(files, "package.json").contents) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts.dist).toBe("vp pack && vp build && electron-builder");
    expect(pkg.scripts["dist:dir"]).toBe("vp pack && vp build && electron-builder --dir");
    expect(pkg.devDependencies["electron-builder"]).toBe("^26.15.3");
    // The base scripts survive the merge untouched.
    expect(pkg.scripts.build).toBe("vp pack && vp build");
    expect(pkg.scripts.start).toBe("electron .");
  });

  test("base-only render has no electron-builder trace", () => {
    const { files } = generate([]);
    expect(files.some((entry) => entry.path === "electron-builder.yml")).toBe(false);
    const pkg = JSON.parse(file(files, "package.json").contents) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts.dist).toBeUndefined();
    expect(pkg.scripts["dist:dir"]).toBeUndefined();
    expect(pkg.devDependencies["electron-builder"]).toBeUndefined();
  });

  test("selection order does not affect the bytes", () => {
    const a = generate(["builder"]).files;
    const b = generate(["electron/builder"]).files;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  test("rendering is idempotent", () => {
    const first = generate(["builder"]).files;
    const second = generate(["builder"]).files;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  test("no markers leak", () => {
    for (const entry of generate(["builder"]).files) {
      expect(entry.contents).not.toContain("@code4x");
    }
  });
});
