import { describe, expect, test } from "vite-plus/test";

import { resolve } from "../src/domain/resolve.ts";
import { render } from "../src/domain/render.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Answers, VirtualFile } from "../src/domain/types.ts";

const ANSWERS: Answers = {
  targetDir: "./my-api",
  projectName: "my-api",
  framework: "hono",
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

const BASE_ZOD_INDEX = `import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { logger } from 'hono/logger'
import { CreateUserSchema } from './schemas/user'

const app = new Hono()
app.use(logger())

app.post('/auth/register', zValidator('json', CreateUserSchema), (c) => c.json({ ok: true }))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(\`listening on http://localhost:\${info.port}\`)
})
`;

const BASE_ZOD_GUARD_INDEX = `import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { CreateUserSchema } from './schemas/user'

const app = new Hono()
app.use(logger())
app.use(cors())
app.use(secureHeaders())

app.post('/auth/register', zValidator('json', CreateUserSchema), (c) => c.json({ ok: true }))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(\`listening on http://localhost:\${info.port}\`)
})
`;

describe("render / {base + hono/zod}", () => {
  test("src/index.ts golden (imports aggregated, relative import last, route wired)", () => {
    const { files } = generate(["zod"]);
    expect(file(files, "src/index.ts").contents).toBe(BASE_ZOD_INDEX);
  });

  test("schema file is copied verbatim", () => {
    const { files } = generate(["zod"]);
    const schema = file(files, "src/schemas/user.ts");
    expect(schema.source).toBe("hono/zod");
    expect(schema.contents).toContain("export const CreateUserSchema");
    expect(schema.contents).toContain('import { z } from "zod"');
  });

  test("no markers leak", () => {
    for (const entry of generate(["zod"]).files) {
      expect(entry.contents).not.toContain("@code4x");
    }
  });

  test("package.json gains zod + @hono/zod-validator", () => {
    const { files } = generate(["zod"]);
    const pkg = JSON.parse(file(files, "package.json").contents) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toMatchObject({
      hono: expect.any(String),
      "@hono/node-server": expect.any(String),
      zod: "^4.6.6",
      "@hono/zod-validator": "^0.9.1",
    });
    expect(pkg.devDependencies).toMatchObject({ tsx: expect.any(String) });
  });
});

describe("render / {base + hono/api-guard}", () => {
  test("no cors/secure-headers when api-guard is not selected", () => {
    const index = file(generate(["zod"]).files, "src/index.ts").contents;
    expect(index).not.toContain("cors");
    expect(index).not.toContain("secureHeaders");
  });

  test("middlewares order is stable and after the logger", () => {
    const { files } = generate(["zod", "api-guard"]);
    expect(file(files, "src/index.ts").contents).toBe(BASE_ZOD_GUARD_INDEX);
  });

  test("selection order does not affect the bytes", () => {
    const a = generate(["zod", "api-guard"]).files;
    const b = generate(["api-guard", "zod"]).files;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  test("api-guard alone adds no dependencies", () => {
    const { files } = generate(["api-guard"]);
    const pkg = JSON.parse(file(files, "package.json").contents) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({
      "@hono/node-server": expect.any(String),
      hono: expect.any(String),
    });
  });
});

describe("render / {base + hono/zod + hono/api-guard}", () => {
  test("dependencies merge across features without conflicts", () => {
    const { files } = generate(["zod", "api-guard"]);
    const pkg = JSON.parse(file(files, "package.json").contents) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toMatchObject({
      hono: expect.any(String),
      "@hono/node-server": expect.any(String),
      zod: "^4.6.6",
      "@hono/zod-validator": "^0.9.1",
    });
  });

  test("rendering is idempotent", () => {
    const first = generate(["zod", "api-guard"]).files;
    const second = generate(["zod", "api-guard"]).files;
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

const BASE_ZOD_SWAGGER_INDEX = `import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'
import { zValidator } from '@hono/zod-validator'
import { describeRoute, openAPIRouteHandler, resolver } from 'hono-openapi'
import { logger } from 'hono/logger'
import { openApiDocumentation } from './docs/spec'
import { CreateUserSchema, RegisterResponseSchema } from './schemas/user'

const app = new Hono()
app.use(logger())

app.post(
  '/auth/register',
  describeRoute({
    tags: ['auth'],
    summary: 'Register a new user',
    requestBody: { content: { 'application/json': { schema: resolver(CreateUserSchema) } } },
    responses: {
      201: {
        description: 'User created',
        content: { 'application/json': { schema: resolver(RegisterResponseSchema) } },
      },
    },
  }),
  zValidator('json', CreateUserSchema),
  (c) => c.json({ ok: true }),
)

app.get('/openapi.json', openAPIRouteHandler(app, { documentation: openApiDocumentation }))
app.get('/docs', swaggerUI({ url: '/openapi.json' }))

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(\`listening on http://localhost:\${info.port}\`)
})
`;

describe("render / {base + hono/zod + hono/swagger-openapi}", () => {
  test("src/index.ts golden: describeRoute variant + docs routes", () => {
    const { files } = generate(["zod", "swagger-openapi"]);
    expect(file(files, "src/index.ts").contents).toBe(BASE_ZOD_SWAGGER_INDEX);
  });

  test("bare 'swagger-openapi' token hits the swagger variant (resolved conditions)", () => {
    const { files } = generate(["swagger-openapi"]);
    const index = file(files, "src/index.ts").contents;
    expect(index).toBe(BASE_ZOD_SWAGGER_INDEX);
  });

  test("preset path (qualified ids) hits the same variant (order-independent)", () => {
    const a = generate(["swagger-openapi"]).files;
    const b = generate(["hono/swagger-openapi"]).files;
    const c = generate(["hono/zod", "hono/swagger-openapi"]).files;
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(c)).toBe(JSON.stringify(a));
  });

  test("spec file is copied and provenance recorded", () => {
    const { files } = generate(["swagger-openapi"]);
    const spec = file(files, "src/docs/spec.ts");
    expect(spec.source).toBe("hono/swagger-openapi");
    expect(spec.contents).toContain("openApiDocumentation");
  });

  test("package.json gains hono-openapi + @hono/swagger-ui alongside zod", () => {
    const { files } = generate(["swagger-openapi"]);
    const pkg = JSON.parse(file(files, "package.json").contents) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toMatchObject({
      zod: "^4.6.6",
      "@hono/zod-validator": "^0.9.1",
      "hono-openapi": "^1.3.5",
      "@hono/swagger-ui": "^0.6.1",
    });
  });

  test("without swagger there is no hono-openapi / swagger-ui trace", () => {
    const index = file(generate(["zod"]).files, "src/index.ts").contents;
    expect(index).not.toContain("hono-openapi");
    expect(index).not.toContain("swaggerUI");
    expect(index).not.toContain("openAPIRouteHandler");
    expect(index).not.toContain("describeRoute");
  });

  test("no markers leak", () => {
    for (const entry of generate(["swagger-openapi"]).files) {
      expect(entry.contents).not.toContain("@code4x");
    }
  });
});
