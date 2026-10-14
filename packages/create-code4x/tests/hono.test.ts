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
import { logger } from 'hono/logger'

const app = new Hono()
app.use(logger())

export default app
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
  });

  test("vite.config.ts wires dev-server + build and ignores dist", () => {
    const vite = files.find((file) => file.path === "vite.config.ts");
    expect(vite?.contents).toContain("defineConfig");
    expect(vite?.contents).toContain("vite-plus");
    expect(vite?.contents).toContain("devServer({ entry: 'src/index.ts' })");
    expect(vite?.contents).toContain("build({ entry: 'src/index.ts', port })");
    expect(vite?.contents).toContain("ignorePatterns: ['dist/**']");
  });

  test("vite.config.ts is assembled (byte-stable after the skeleton conversion)", () => {
    const vite = files.find((file) => file.path === "vite.config.ts");
    expect(vite?.source).toBe("assembly");
    expect(vite?.contents).toBe(`import build from '@hono/vite-build/node'
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
  plugins: [
    // Vite plugins.
    devServer({ entry: 'src/index.ts' }),
    build({ entry: 'src/index.ts', port }),
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
`);
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
