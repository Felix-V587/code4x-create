import { afterAll, describe, expect, test } from "vite-plus/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../src/cli.ts";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "code4x-cli-"));
  roots.push(root);
  return root;
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

async function invoke(args: string[], cwd: string) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: {},
    cwd,
  });
  return { code, stdout: out.join("\n"), stderr: err.join("\n") };
}

describe("cli e2e", () => {
  test("-f hono -y generates a complete project", async () => {
    const root = tempRoot();
    const target = join(root, "my-api");
    const { code, stderr } = await invoke(["-f", "hono", "-y", "--no-git", target], root);
    expect(stderr).toBe("");
    expect(code).toBe(0);

    for (const relative of [
      "src/index.ts",
      "package.json",
      "pnpm-workspace.yaml",
      "tsconfig.json",
      ".gitignore",
      "README.md",
      ".code4xrc.json",
    ]) {
      expect(existsSync(join(target, relative)), relative).toBe(true);
    }

    const index = readFileSync(join(target, "src/index.ts"), "utf8");
    expect(index).toContain("import { logger } from 'hono/logger'");
    expect(index).toContain("app.use(logger())");
    expect(index).not.toContain("@code4x");

    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
      name: string;
    };
    expect(pkg.name).toBe("my-api");

    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      generator: { cliVersion: string; preset: string | null };
      answers: { framework: string; features: string[] };
      plan: { features: string[]; sources: Record<string, string>; hashes: Record<string, string> };
    };
    expect(rc.generator.cliVersion).toBe("0.0.0");
    expect(rc.answers.framework).toBe("hono");
    expect(rc.answers.features).toEqual([]);
    expect(rc.plan.features).toEqual([]);
    expect(rc.plan.sources["src/index.ts"]).toBe("assembly");
    expect(rc.plan.hashes["src/index.ts"]).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(join(target, ".git"))).toBe(false);
  });

  test("missing target dir -> E-DIR-REQUIRED, exit 2", async () => {
    const root = tempRoot();
    const { code, stderr } = await invoke(["-f", "hono", "-y"], root);
    expect(code).toBe(2);
    expect(stderr).toContain("E-DIR-REQUIRED");
  });

  test("non-empty dir without --overwrite -> E-DIR-NOT-EMPTY, exit 1", async () => {
    const root = tempRoot();
    const target = join(root, "full");
    mkdirSync(target);
    writeFileSync(join(target, "keep.txt"), "x");
    const { code, stderr } = await invoke(["-f", "hono", "-y", "--no-git", target], root);
    expect(code).toBe(1);
    expect(stderr).toContain("E-DIR-NOT-EMPTY");
  });

  test("--overwrite refuses when no .code4xrc.json guard is present", async () => {
    const root = tempRoot();
    const target = join(root, "stranger");
    mkdirSync(target);
    writeFileSync(join(target, "file.txt"), "x");
    const { code, stderr } = await invoke(
      ["-f", "hono", "-y", "--no-git", "--overwrite", target],
      root,
    );
    expect(code).toBe(1);
    expect(stderr).toContain("E-OVERWRITE-REFUSED");
  });

  test("--overwrite replaces a previously generated project", async () => {
    const root = tempRoot();
    const target = join(root, "regen");
    await invoke(["-f", "hono", "-y", "--no-git", target], root);
    const { code, stderr } = await invoke(
      ["-f", "hono", "-y", "--no-git", "--overwrite", target],
      root,
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(existsSync(join(target, ".code4xrc.json"))).toBe(true);
  });

  test("--features pinia -f hono -> E-FEATURE-FRAMEWORK, exit 1", async () => {
    const root = tempRoot();
    const { code, stderr } = await invoke(
      ["-f", "hono", "--features", "pinia", "-y", "--no-git", join(root, "app")],
      root,
    );
    expect(code).toBe(1);
    expect(stderr).toContain("E-FEATURE-FRAMEWORK");
  });

  test("unknown config key -> E-CONFIG-KEY, exit 2", async () => {
    const root = tempRoot();
    const config = join(root, "config.json");
    writeFileSync(config, JSON.stringify({ framework: "hono", bogus: true }));
    const { code, stderr } = await invoke(
      ["--config", config, "-y", "--no-git", join(root, "app")],
      root,
    );
    expect(code).toBe(2);
    expect(stderr).toContain("E-CONFIG-KEY");
  });

  test("--json emits the documented schema", async () => {
    const root = tempRoot();
    const target = join(root, "json-app");
    const { code, stdout } = await invoke(["-f", "hono", "-y", "--no-git", "--json", target], root);
    expect(code).toBe(0);

    const payload = JSON.parse(stdout) as {
      answers: { framework: string; targetDir: string };
      plan: {
        files: Array<{ path: string; source: string; hash: string }>;
        features: { explicit: string[]; resolved: string[] };
      };
      nextSteps: string[];
    };
    expect(payload.answers.framework).toBe("hono");
    expect(payload.plan.features).toEqual({ explicit: [], resolved: [] });
    expect(payload.plan.files.map((file) => file.path)).toContain("src/index.ts");
    expect(payload.plan.files.every((file) => /^[0-9a-f]{64}$/.test(file.hash))).toBe(true);
    expect(payload.nextSteps).toContain("cd " + target);
  });

  test("-f hono --features zod,api-guard generates a complete feature project", async () => {
    const root = tempRoot();
    const target = join(root, "feature-app");
    const { code, stderr } = await invoke(
      ["-f", "hono", "--features", "zod,api-guard", "-y", "--no-git", target],
      root,
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);

    for (const relative of [
      "src/index.ts",
      "src/schemas/user.ts",
      "package.json",
      ".code4xrc.json",
    ]) {
      expect(existsSync(join(target, relative)), relative).toBe(true);
    }

    const index = readFileSync(join(target, "src/index.ts"), "utf8");
    expect(index).toContain("import { zValidator } from '@hono/zod-validator'");
    expect(index).toContain("import { CreateUserSchema } from './schemas/user'");
    expect(index).toContain("app.use(logger())");
    expect(index).toContain("app.use(cors())");
    expect(index).toContain("app.use(secureHeaders())");
    expect(index).toContain("app.post('/auth/register'");
    expect(index).not.toContain("@code4x");

    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toMatchObject({
      zod: "^4.6.6",
      "@hono/zod-validator": "^0.9.1",
    });

    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      plan: { features: string[]; sources: Record<string, string> };
    };
    expect(rc.plan.features).toEqual(["hono/api-guard", "hono/zod"]);
    expect(rc.plan.sources["src/schemas/user.ts"]).toBe("hono/zod");
    expect(Object.values(rc.plan.sources)).toContain("hono/zod");
  });

  test("bare --features swagger-openapi pulls zod in and wires the docs routes", async () => {
    const root = tempRoot();
    const target = join(root, "swagger-app");
    const { code, stderr } = await invoke(
      ["-f", "hono", "--features", "swagger-openapi", "-y", "--no-git", target],
      root,
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);

    for (const relative of ["src/index.ts", "src/schemas/user.ts", "src/docs/spec.ts"]) {
      expect(existsSync(join(target, relative)), relative).toBe(true);
    }

    const index = readFileSync(join(target, "src/index.ts"), "utf8");
    expect(index).toContain("describeRoute(");
    expect(index).toContain("import { openApiDocumentation } from './docs/spec'");
    expect(index).toContain(
      "app.get('/openapi.json', openAPIRouteHandler(app, { documentation: openApiDocumentation }))",
    );
    expect(index).toContain("app.get('/docs', swaggerUI({ url: '/openapi.json' }))");
    expect(index).not.toContain("@code4x");

    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toMatchObject({
      zod: "^4.6.6",
      "@hono/zod-validator": "^0.9.1",
      "hono-openapi": "^1.3.5",
      "@hono/swagger-ui": "^0.6.1",
    });

    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      plan: { features: string[]; sources: Record<string, string> };
    };
    expect(rc.plan.features).toEqual(["hono/zod", "hono/swagger-openapi"]);
    expect(rc.plan.sources["src/docs/spec.ts"]).toBe("hono/swagger-openapi");
  });
});
