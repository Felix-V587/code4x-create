import { afterAll, describe, expect, test } from "vite-plus/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run, type CliIO } from "../src/cli.ts";
import { scriptedPrompter } from "./prompter.ts";

const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "code4x-cli-"));
  roots.push(root);
  return root;
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

async function invoke(args: string[], cwd: string, extra: Partial<CliIO> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    env: {},
    cwd,
    isTTY: false,
    ...extra,
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
      "vite.config.ts",
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
    expect(index).toContain("export default app");
    expect(index).not.toContain("serve(");
    expect(index).not.toContain("@code4x");

    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
      name: string;
    };
    expect(pkg.name).toBe("my-api");

    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      generator: { cliVersion: string; preset: string | null };
      answers: { framework: string; features: string[] };
      plan: { features: string[]; sources: Record<string, string>; hashes: Record<string, string> };
      context: { nestedWorkspace: boolean; pmFrom: string };
    };
    expect(rc.generator.cliVersion).toBe("0.1.0");
    expect(rc.answers.framework).toBe("hono");
    expect(rc.answers.features).toEqual([]);
    expect(rc.plan.features).toEqual([]);
    expect(rc.plan.sources["src/index.ts"]).toBe("assembly");
    expect(rc.plan.hashes["src/index.ts"]).toMatch(/^[0-9a-f]{64}$/);
    expect(rc.context).toEqual({ nestedWorkspace: false, pmFrom: "default" });
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

  test("non-TTY without -y succeeds with defaults (features=[])", async () => {
    const root = tempRoot();
    const target = join(root, "non-tty-app");
    const { code } = await invoke(["-f", "hono", "--no-git", target], root);
    expect(code).toBe(0);
    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      answers: { features: string[]; framework: string };
    };
    expect(rc.answers.framework).toBe("hono");
    expect(rc.answers.features).toEqual([]);
  });

  test("interactive cancel -> exit 130 and zero side effects", async () => {
    const root = tempRoot();
    const target = join(root, "cancel-app");
    const prompter = scriptedPrompter({ text: [target], cancelAt: "select" });
    const { code } = await invoke([], root, { isTTY: true, createPrompter: () => prompter });
    expect(code).toBe(130);
    expect(existsSync(target)).toBe(false);
    expect(prompter.log).toContain("outro:Operation cancelled");
  });

  test("--json in interactive mode -> usage error exit 2", async () => {
    const root = tempRoot();
    const { code, stderr } = await invoke(["--json"], root, {
      isTTY: true,
      createPrompter: () => scriptedPrompter({}),
    });
    expect(code).toBe(2);
    expect(stderr).toContain("E-INVALID-VALUE");
  });

  test("interactive and full-flag paths produce byte-identical .code4xrc.json", async () => {
    const root = tempRoot();
    const target = join(root, "parity-app");
    const prompter = scriptedPrompter({
      text: [target],
      select: ["hono", "npm"],
      multiselect: [[]],
      confirm: [false, false],
    });
    const first = await invoke([], root, { isTTY: true, createPrompter: () => prompter });
    expect(first.code).toBe(0);
    const interactiveRc = readFileSync(join(target, ".code4xrc.json"), "utf8");

    const second = await invoke(["-f", "hono", "--no-git", "--overwrite", target], root);
    expect(second.code).toBe(0);
    const flagRc = readFileSync(join(target, ".code4xrc.json"), "utf8");
    expect(flagRc).toBe(interactiveRc);
  });

  test("nested workspace suppresses pnpm-workspace.yaml and records context", async () => {
    const root = tempRoot();
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    const target = join(root, "apps", "api");
    const { code } = await invoke(["-f", "hono", "-y", "--no-git", target], root);
    expect(code).toBe(0);
    expect(existsSync(join(target, "pnpm-workspace.yaml"))).toBe(false);
    expect(existsSync(join(target, "package.json"))).toBe(true);
    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      context: { nestedWorkspace: boolean; pmFrom: string };
    };
    expect(rc.context).toEqual({ nestedWorkspace: true, pmFrom: "default" });
  });

  test("nested workspace hints the host allowBuilds on stderr and records them in the rc", async () => {
    const root = tempRoot();
    writeFileSync(join(root, "pnpm-workspace.yaml"), "packages: []\n");
    const target = join(root, "apps", "web");
    const { code, stdout, stderr } = await invoke(["-f", "vue", "-y", "--no-git", target], root);
    expect(code).toBe(0);
    // Never on stdout (where `--json` owns the stream).
    expect(stdout).not.toContain("allowBuilds");
    expect(stderr).toContain("allowBuilds:");
    expect(stderr).toContain("esbuild: true");
    expect(existsSync(join(target, "pnpm-workspace.yaml"))).toBe(false);
    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      workspace?: { requiredAllowBuilds: string[] };
    };
    expect(rc.workspace?.requiredAllowBuilds).toContain("esbuild");
  });

  test("-f vue --features pinia,router generates a complete vue project", async () => {
    const root = tempRoot();
    const target = join(root, "vue-app");
    const { code, stderr } = await invoke(
      ["-f", "vue", "--features", "pinia,router", "-y", "--no-git", target],
      root,
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);

    for (const relative of [
      "src/main.ts",
      "vite.config.ts",
      "src/stores/counter.ts",
      "src/router/index.ts",
      "src/views/Home.vue",
      "index.html",
      ".code4xrc.json",
    ]) {
      expect(existsSync(join(target, relative)), relative).toBe(true);
    }

    const main = readFileSync(join(target, "src/main.ts"), "utf8");
    expect(main).toContain("import { createPinia } from 'pinia'");
    expect(main).toContain("import router from './router'");
    expect(main.indexOf("app.use(createPinia())")).toBeLessThan(main.indexOf("app.use(router)"));
    expect(main).not.toContain("@code4x");

    const vite = readFileSync(join(target, "vite.config.ts"), "utf8");
    expect(vite).toContain("vue()");

    const app = readFileSync(join(target, "src/App.vue"), "utf8");
    expect(app).toContain("<router-view />");
    expect(app).not.toContain("@code4x");

    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({
      vue: "^3.5.0",
      pinia: "^4.0.0",
      "vue-router": "^5.0.0",
    });

    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      plan: { features: string[]; sources: Record<string, string> };
    };
    expect(rc.plan.features).toEqual(["vue/pinia", "vue/router"]);
    expect(rc.plan.sources["src/stores/counter.ts"]).toBe("vue/pinia");
    expect(rc.plan.sources["src/router/index.ts"]).toBe("vue/router");
  });

  test("--features pinia (bare, no -f) infers the vue framework", async () => {
    const root = tempRoot();
    const target = join(root, "infer-vue");
    const { code, stdout } = await invoke(["--features", "pinia", "-y", "--no-git", target], root);
    expect(code).toBe(0);
    expect(stdout).toContain("framework inferred: vue");
    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      answers: { framework: string; features: string[] };
    };
    expect(rc.answers.framework).toBe("vue");
    expect(rc.answers.features).toEqual(["pinia"]);
  });

  test("-f electron -y generates a complete electron project", async () => {
    const root = tempRoot();
    const target = join(root, "electron-app");
    const { code, stderr } = await invoke(["-f", "electron", "-y", "--no-git", target], root);
    expect(stderr).toBe("");
    expect(code).toBe(0);

    for (const relative of [
      "src/main/index.ts",
      "src/preload/index.ts",
      "src/renderer/index.html",
      "src/renderer/src/main.ts",
      "src/renderer/src/App.vue",
      "scripts/dev.mjs",
      "vite.config.ts",
      "package.json",
      "pnpm-workspace.yaml",
      "tsconfig.json",
      ".code4xrc.json",
    ]) {
      expect(existsSync(join(target, relative)), relative).toBe(true);
    }

    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
      name: string;
      main: string;
    };
    expect(pkg.name).toBe("electron-app");
    expect(pkg.main).toBe("dist/main/index.cjs");

    const main = readFileSync(join(target, "src/main/index.ts"), "utf8");
    expect(main).toContain("preload: join(__dirname, '../preload/index.cjs')");
    expect(main).toContain("process.env.ELECTRON_RENDERER_URL");
    expect(main).not.toContain("@code4x");

    const vite = readFileSync(join(target, "vite.config.ts"), "utf8");
    expect(vite).toContain("vue(),");
    expect(vite).not.toContain("@code4x");

    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      answers: { framework: string };
      plan: { sources: Record<string, string> };
    };
    expect(rc.answers.framework).toBe("electron");
    expect(rc.plan.sources["src/main/index.ts"]).toBe("assembly");
    expect(rc.plan.sources["vite.config.ts"]).toBe("assembly");
  });

  test("-f electron --features electron/builder -y generates packaging config", async () => {
    const root = tempRoot();
    const target = join(root, "electron-builder-app");
    const { code, stderr } = await invoke(
      ["-f", "electron", "--features", "electron/builder", "-y", "--no-git", target],
      root,
    );
    expect(stderr).toBe("");
    expect(code).toBe(0);

    for (const relative of [
      "src/main/index.ts",
      "src/renderer/src/App.vue",
      "electron-builder.yml",
      "package.json",
      ".code4xrc.json",
    ]) {
      expect(existsSync(join(target, relative)), relative).toBe(true);
    }

    const yml = readFileSync(join(target, "electron-builder.yml"), "utf8");
    expect(yml).toContain("output: release");
    expect(yml).toContain("dist/**");

    const gitignore = readFileSync(join(target, ".gitignore"), "utf8");
    expect(gitignore).toContain("release");

    const pkg = JSON.parse(readFileSync(join(target, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts.dist).toBe("vp pack && vp build && electron-builder");
    expect(pkg.scripts["dist:dir"]).toBe("vp pack && vp build && electron-builder --dir");
    expect(pkg.devDependencies["electron-builder"]).toMatch(/^\^26\./);
    expect(pkg.scripts.build).toBe("vp pack && vp build");

    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      answers: { framework: string; features: string[] };
      plan: { features: string[]; sources: Record<string, string> };
    };
    expect(rc.answers.framework).toBe("electron");
    expect(rc.answers.features).toEqual(["electron/builder"]);
    expect(rc.plan.features).toEqual(["electron/builder"]);
    expect(rc.plan.sources["electron-builder.yml"]).toBe("electron/builder");
  });

  test("--template electron -> --framework electron", async () => {
    const root = tempRoot();
    const target = join(root, "electron-template");
    const { code, stdout } = await invoke(
      ["--template", "electron", "-y", "--no-git", target],
      root,
    );
    expect(code).toBe(0);
    expect(stdout).toContain("--template electron -> --framework electron");
    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      answers: { framework: string };
    };
    expect(rc.answers.framework).toBe("electron");
  });

  test("-p vue-full generates the full vue project", async () => {
    const root = tempRoot();
    const target = join(root, "vue-full");
    const { code } = await invoke(["-p", "vue-full", "-y", "--no-git", target], root);
    expect(code).toBe(0);
    const rc = JSON.parse(readFileSync(join(target, ".code4xrc.json"), "utf8")) as {
      answers: { framework: string; preset: string };
      plan: { features: string[] };
    };
    expect(rc.answers.framework).toBe("vue");
    expect(rc.answers.preset).toBe("vue-full");
    expect(rc.plan.features).toEqual(["vue/pinia", "vue/router"]);
  });

  test("--json stdout is pure JSON even when notes are emitted", async () => {
    const root = tempRoot();
    const target = join(root, "json-pure");
    const { code, stdout, stderr } = await invoke(
      ["--json", "--features", "pinia", "-y", "--no-git", target],
      root,
    );
    expect(code).toBe(0);
    const payload = JSON.parse(stdout) as { answers: { framework: string } };
    expect(payload.answers.framework).toBe("vue");
    expect(stderr).toContain("framework inferred: vue");
  });

  test("non-json keeps notes on stdout", async () => {
    const root = tempRoot();
    const target = join(root, "note-stdout");
    const { code, stdout } = await invoke(["--features", "pinia", "-y", "--no-git", target], root);
    expect(code).toBe(0);
    expect(stdout).toContain("framework inferred: vue");
  });
});
