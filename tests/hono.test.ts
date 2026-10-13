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

const EXPECTED_INDEX = `import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { logger } from 'hono/logger'

const app = new Hono()
app.use(logger())

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(\`listening on http://localhost:\${info.port}\`)
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
      "src/index.ts",
      "tsconfig.json",
    ]);
  });

  test("src/index.ts matches the golden skeleton", () => {
    const index = files.find((file) => file.path === "src/index.ts");
    expect(index?.source).toBe("assembly");
    expect(index?.contents).toBe(EXPECTED_INDEX);
  });

  test("package.json has the normalized name and no placeholder", () => {
    const pkg = files.find((file) => file.path === "package.json");
    expect(pkg).toBeDefined();
    expect(JSON.parse(pkg?.contents ?? "{}")).toMatchObject({
      name: "my-api",
      type: "module",
      dependencies: { hono: expect.any(String), "@hono/node-server": expect.any(String) },
    });
    expect(pkg?.contents).not.toContain("{PROJECT}");
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
