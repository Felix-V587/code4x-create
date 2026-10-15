import { describe, expect, test } from "vite-plus/test";

import { resolve } from "../src/domain/resolve.ts";
import { render } from "../src/domain/render.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Answers } from "../src/domain/types.ts";

const ANSWERS: Answers = {
  targetDir: "./my-api",
  projectName: "my-api",
  framework: "hono",
  features: [],
  packageManager: "pnpm",
  install: false,
  git: true,
};

const EXPECTED_INDEX = `import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { health } from './routes/health'

const app = new Hono()
app.use(requestId())
app.use(logger())

app.route('/', health)

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json(
      { code: 'HTTP_EXCEPTION', message: err.message, requestId: c.get('requestId') },
      err.status,
    )
  }
  console.error(err)
  return c.json(
    {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal Server Error',
      requestId: c.get('requestId'),
    },
    500,
  )
})

app.notFound((c) =>
  c.json({ code: 'NOT_FOUND', message: 'Not Found', requestId: c.get('requestId') }, 404),
)

export default app
`;

const EXPECTED_VITE_CONFIG = `import build from '@hono/vite-build/node'
import devServer from '@hono/vite-dev-server'
import { defineConfig } from 'vite-plus'

// \`PORT\` is read when this config loads:
//   - \`vp dev\` uses it as the live dev-server port (runtime);
//   - \`@hono/vite-build/node\` bakes it into the built server at BUILD time
//     (set \`PORT\` when running \`vp build\` to change the built port).
const port = Number(process.env.PORT ?? 3000)

export default defineConfig({
  server: {
    port,
  },
  // Extra top-level config contributed by features (e.g. the \`test\` block from
  // \`hono/testing\`).
  plugins: [
    // Vite plugins.
    devServer({ entry: 'src/index.ts' }),
    build({ entry: 'src/index.ts', port, shutdownTimeoutMs: 5000 }),
  ],
  lint: {
    ignorePatterns: ['dist/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    // Match the generated source style (single quotes, no semicolons) so a
    // fresh \`vp check\` passes without reformatting.
    singleQuote: true,
    semi: false,
    sortPackageJson: false,
    ignorePatterns: ['dist/**', '.code4xrc.json'],
  },
})
`;

describe("hono base golden", () => {
  const registry = loadRegistry();
  const plan = resolve(ANSWERS, registry);
  const files = render(plan, registry);

  test("file manifest", () => {
    expect(files.map((file) => file.path).sort()).toEqual([
      ".gitignore",
      "README.md",
      "package.json",
      "pnpm-workspace.yaml",
      "src/index.ts",
      "src/routes/health.ts",
      "tsconfig.json",
      "vite.config.ts",
    ]);
  });

  test("src/index.ts matches the golden skeleton (vp-native, no serve)", () => {
    const index = files.find((file) => file.path === "src/index.ts");
    expect(index?.source).toBe("assembly");
    expect(index?.contents).toBe(EXPECTED_INDEX);
    expect(index?.contents).toContain("export default app");
    expect(index?.contents).not.toContain("@hono/node-server");
    expect(index?.contents).not.toContain("serve(");
  });

  test("requestId runs before the logger, and routes before error handlers", () => {
    const index = files.find((file) => file.path === "src/index.ts")?.contents ?? "";
    expect(index.indexOf("app.use(requestId())")).toBeLessThan(index.indexOf("app.use(logger())"));
    expect(index.indexOf("app.route('/', health)")).toBeLessThan(index.indexOf("app.onError("));
  });

  test("baseline error model emits the { code, message, requestId } envelope", () => {
    const index = files.find((file) => file.path === "src/index.ts")?.contents ?? "";
    expect(index).toContain("import { HTTPException } from 'hono/http-exception'");
    expect(index).toContain("if (err instanceof HTTPException)");
    expect(index).toContain("code: 'NOT_FOUND'");
    expect(index).toContain("code: 'INTERNAL_SERVER_ERROR'");
    expect(index).toContain("requestId: c.get('requestId')");
  });

  test("health routes are a static baseline file with liveness + readiness", () => {
    const health = files.find((file) => file.path === "src/routes/health.ts");
    expect(health?.source).toBe("base");
    expect(health?.contents).toContain(".get('/healthz'");
    expect(health?.contents).toContain(".get('/readyz'");
    expect(health?.contents).toContain("503");
    expect(health?.contents).toContain("TODO");
  });

  test("package.json has the normalized name and vp-native scripts/deps", () => {
    const pkg = files.find((file) => file.path === "package.json");
    expect(pkg).toBeDefined();
    expect(JSON.parse(pkg?.contents ?? "{}")).toMatchObject({
      name: "my-api",
      type: "module",
      scripts: {
        dev: "vp dev",
        build: "vp build",
        start: "node dist/index.js",
        typecheck: "tsc --noEmit",
      },
      dependencies: { hono: expect.any(String), "@hono/node-server": expect.any(String) },
      devDependencies: {
        "vite-plus": expect.any(String),
        "@hono/vite-dev-server": expect.any(String),
        "@hono/vite-build": expect.any(String),
      },
    });
    expect(pkg?.contents).not.toContain("{PROJECT}");
    expect(pkg?.contents).not.toContain("tsx");
    // M7: upgraded Node adapter (v2) for the built server.
    expect(JSON.parse(pkg?.contents ?? "{}").dependencies["@hono/node-server"]).toBe("^2.1.0");
  });

  test("vite.config.ts wires dev-server + build and ignores dist", () => {
    const vite = files.find((file) => file.path === "vite.config.ts");
    expect(vite?.contents).toContain("defineConfig");
    expect(vite?.contents).toContain("vite-plus");
    expect(vite?.contents).toContain("devServer({ entry: 'src/index.ts' })");
    expect(vite?.contents).toContain(
      "build({ entry: 'src/index.ts', port, shutdownTimeoutMs: 5000 })",
    );
    expect(vite?.contents).toContain("ignorePatterns: ['dist/**']");
  });

  test("vite.config.ts is assembled (byte-stable, graceful shutdown enabled)", () => {
    const vite = files.find((file) => file.path === "vite.config.ts");
    expect(vite?.source).toBe("assembly");
    expect(vite?.contents).toBe(EXPECTED_VITE_CONFIG);
  });

  test("tsconfig typechecks src + vite.config.ts", () => {
    const tsconfig = files.find((file) => file.path === "tsconfig.json");
    expect(JSON.parse(tsconfig?.contents ?? "{}")).toMatchObject({
      include: ["src", "vite.config.ts"],
    });
  });

  test("ships a pnpm workspace allowBuilds for esbuild", () => {
    const workspace = files.find((file) => file.path === "pnpm-workspace.yaml");
    expect(workspace?.contents).toBe("allowBuilds:\n  esbuild: true\n");
  });

  test("no assembly markers leak into generated files", () => {
    for (const file of files) {
      expect(file.contents).not.toContain("@code4x");
    }
  });

  test("rendering is idempotent", () => {
    const again = render(resolve(ANSWERS, registry), registry);
    expect(JSON.stringify(again)).toBe(JSON.stringify(files));
  });
});
