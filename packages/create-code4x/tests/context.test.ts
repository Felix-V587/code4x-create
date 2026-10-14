import { afterAll, describe, expect, test } from "vite-plus/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolve } from "../src/domain/resolve.ts";
import { render } from "../src/domain/render.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import { detectNestedWorkspace } from "../src/io/workspace.ts";
import { detectPackageManagerWithSource } from "../src/io/pm.ts";
import { buildRc } from "../src/io/rc.ts";
import type { Answers, ProjectContext } from "../src/domain/types.ts";

const roots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "code4x-ctx-"));
  roots.push(dir);
  return dir;
}
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

const ANSWERS: Answers = {
  targetDir: "./app",
  projectName: "app",
  framework: "hono",
  features: [],
  packageManager: "npm",
  install: false,
  git: false,
};

const registry = loadRegistry();

describe("detectNestedWorkspace", () => {
  test("ancestor pnpm-workspace.yaml -> true", () => {
    const root = tempDir();
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    expect(detectNestedWorkspace(join(root, "apps", "api"))).toBe(true);
  });

  test("ancestor package.json with workspaces -> true", () => {
    const root = tempDir();
    writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["packages/*"] }));
    expect(detectNestedWorkspace(join(root, "x", "y"))).toBe(true);
  });

  test("no ancestor workspace -> false", () => {
    const root = tempDir();
    expect(detectNestedWorkspace(join(root, "app"))).toBe(false);
  });
});

describe("detectPackageManagerWithSource", () => {
  test("user-agent -> env", () => {
    expect(
      detectPackageManagerWithSource({ npm_config_user_agent: "pnpm/9.0.0 npm/? node/v22" }),
    ).toEqual({ pm: "pnpm", source: "env" });
  });

  test("parent packageManager field -> parent", () => {
    const root = tempDir();
    writeFileSync(join(root, "package.json"), JSON.stringify({ packageManager: "yarn@4.0.0" }));
    expect(detectPackageManagerWithSource({}, join(root, "child"))).toEqual({
      pm: "yarn",
      source: "parent",
    });
  });

  test("nothing -> default npm", () => {
    const root = tempDir();
    expect(detectPackageManagerWithSource({}, join(root, "app"))).toEqual({
      pm: "npm",
      source: "default",
    });
  });
});

describe("render / nested workspace condition", () => {
  test("nested workspace omits pnpm-workspace.yaml", () => {
    const context: ProjectContext = { nestedWorkspace: true, pmFrom: "env" };
    const plan = resolve(ANSWERS, registry, context);
    const files = render(plan, registry);
    expect(files.map((file) => file.path)).not.toContain("pnpm-workspace.yaml");
  });

  test("standalone keeps pnpm-workspace.yaml", () => {
    const context: ProjectContext = { nestedWorkspace: false, pmFrom: "env" };
    const files = render(resolve(ANSWERS, registry, context), registry);
    expect(files.map((file) => file.path)).toContain("pnpm-workspace.yaml");
  });

  test("no context is backward-compatible (standalone)", () => {
    const files = render(resolve(ANSWERS, registry), registry);
    expect(files.map((file) => file.path)).toContain("pnpm-workspace.yaml");
  });

  test("render picks up context from the plan by default", () => {
    const plan = resolve(ANSWERS, registry, { nestedWorkspace: true, pmFrom: "env" });
    expect(render(plan, registry).map((file) => file.path)).not.toContain("pnpm-workspace.yaml");
  });
});

describe("rc context metadata", () => {
  test("buildRc records context", () => {
    const context: ProjectContext = { nestedWorkspace: true, pmFrom: "parent" };
    const plan = resolve(ANSWERS, registry, context);
    const files = render(plan, registry);
    const rc = buildRc(ANSWERS, plan, files, "0.0.0", context);
    expect(rc.context).toEqual({ nestedWorkspace: true, pmFrom: "parent" });
  });
});
