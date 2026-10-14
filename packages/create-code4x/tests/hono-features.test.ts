import { describe, expect, test } from "vite-plus/test";

import { Code4xError } from "../src/domain/errors.ts";
import { expandPreset, resolve } from "../src/domain/resolve.ts";
import { render } from "../src/domain/render.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Registry } from "../src/domain/registry.ts";
import type { Answers, FeatureManifest, VirtualFile } from "../src/domain/types.ts";

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

/** The baseline error model appended to every assembled entry. */
const ERROR_HANDLERS = `app.onError((err, c) => {
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
)`;

function entry(header: string): string {
  return `${header}\n\n${ERROR_HANDLERS}\n\nexport default app\n`;
}

const BASE_ZOD_INDEX = entry(`import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { validationHook } from './http/validation'
import { health } from './routes/health'
import { CreateUserSchema } from './schemas/user'

const app = new Hono()
app.use(requestId())
app.use(logger())

app.route('/', health)
app.post('/auth/register', zValidator('json', CreateUserSchema, validationHook), (c) =>
  c.json({ ok: true }),
)`);

const BASE_ZOD_GUARD_INDEX = entry(`import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import { validationHook } from './http/validation'
import { health } from './routes/health'
import { CreateUserSchema } from './schemas/user'

const app = new Hono()
app.use(requestId())
app.use(logger())
app.use(cors())
app.use(secureHeaders())

app.route('/', health)
app.post('/auth/register', zValidator('json', CreateUserSchema, validationHook), (c) =>
  c.json({ ok: true }),
)`);

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
    expect(schema.contents).toContain("import { z } from 'zod'");
  });

  test("ships the defaultHook that normalizes failures into the error envelope", () => {
    const { files } = generate(["zod"]);
    const hook = file(files, "src/http/validation.ts");
    expect(hook.source).toBe("hono/zod");
    expect(hook.contents).toContain("code: 'VALIDATION'");
    expect(hook.contents).toContain("details: result.error.issues");
    expect(hook.contents).toContain("requestId: c.get('requestId')");
    // The shared hook is consumed by the route (no per-route error body).
    expect(file(files, "src/index.ts").contents).toContain(
      "zValidator('json', CreateUserSchema, validationHook)",
    );
  });

  test("swagger variant also passes the shared validation hook", () => {
    const { files } = generate(["zod", "swagger-openapi"]);
    expect(file(files, "src/index.ts").contents).toContain(
      "zValidator('json', CreateUserSchema, validationHook)",
    );
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
    expect(pkg.devDependencies).toMatchObject({ "vite-plus": expect.any(String) });
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

const BASE_ZOD_SWAGGER_INDEX = entry(`import { Hono } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'
import { zValidator } from '@hono/zod-validator'
import { describeRoute, openAPIRouteHandler, resolver } from 'hono-openapi'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { openApiDocumentation } from './docs/spec'
import { validationHook } from './http/validation'
import { health } from './routes/health'
import { CreateUserSchema, RegisterResponseSchema } from './schemas/user'

const app = new Hono()
app.use(requestId())
app.use(logger())

app.route('/', health)
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
  zValidator('json', CreateUserSchema, validationHook),
  (c) => c.json({ ok: true }),
)

app.get('/openapi.json', openAPIRouteHandler(app, { documentation: openApiDocumentation }))
app.get('/docs', swaggerUI({ url: '/openapi.json' }))`);

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

describe("render / {base + hono/env}", () => {
  test("requires pulls in hono/zod (closure) and renders the same entry as zod", () => {
    const { files, features } = generate(["env"]);
    expect(features).toContain("hono/env");
    expect(features).toContain("hono/zod");
    expect(file(files, "src/index.ts").contents).toBe(BASE_ZOD_INDEX);
  });

  test("ships a standalone zod-validated src/env.ts (not wired into the entry)", () => {
    const { files } = generate(["env"]);
    const env = file(files, "src/env.ts");
    expect(env.source).toBe("hono/env");
    expect(env.contents).toContain("import { z } from 'zod'");
    expect(env.contents).toContain("process.env");
    expect(env.contents).toContain("export const env =");
    expect(file(files, "src/index.ts").contents).not.toContain("./env");
  });

  test("adds no dependency beyond hono/zod's", () => {
    const { files } = generate(["env"]);
    const pkg = JSON.parse(file(files, "package.json").contents) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({
      "@hono/node-server": expect.any(String),
      "@hono/zod-validator": "^0.9.1",
      hono: expect.any(String),
      zod: "^4.6.6",
    });
  });

  test("rendering is idempotent", () => {
    expect(JSON.stringify(generate(["env"]).files)).toBe(JSON.stringify(generate(["env"]).files));
  });
});

describe("render / {base + hono/testing}", () => {
  test("contributes a `test` block into the vite-config-extra anchor", () => {
    const vite = file(generate(["testing"]).files, "vite.config.ts");
    expect(vite.contents).toContain("test: {\n    include: ['src/**/*.test.ts'],\n  },");
  });

  test("base vite.config has no test block", () => {
    const vite = file(generate([]).files, "vite.config.ts");
    expect(vite.contents).not.toContain("test: {");
  });

  test("ships an app.request() example and a test script", () => {
    const { files } = generate(["testing"]);
    const spec = file(files, "src/app.test.ts");
    expect(spec.source).toBe("hono/testing");
    expect(spec.contents).toContain("from 'vite-plus/test'");
    expect(spec.contents).toContain("app.request(");
    const pkg = JSON.parse(file(files, "package.json").contents) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.scripts.test).toBe("vp test");
    // No new runtime deps: Vitest comes from the vp toolchain.
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["@hono/node-server", "hono"]);
  });

  test("rendering is idempotent", () => {
    expect(JSON.stringify(generate(["testing"]).files)).toBe(
      JSON.stringify(generate(["testing"]).files),
    );
  });
});

const LOGGING_INDEX = entry(`import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { requestId } from 'hono/request-id'
import { logger } from './logger'
import { health } from './routes/health'

const app = new Hono()
app.use(requestId())
app.use(logger)

app.route('/', health)`);

describe("render / {base + hono/logging}", () => {
  test("replaces the baseline hono/logger (import + middleware) via the `when` guard", () => {
    const { files } = generate(["logging"]);
    const index = file(files, "src/index.ts").contents;
    expect(index).toBe(LOGGING_INDEX);
    expect(index).not.toContain("hono/logger");
    expect(index).not.toContain("logger()");
    expect(index).toContain("import { logger } from './logger'");
    expect(index).toContain("app.use(logger)");
  });

  test("ships a pino-backed src/logger.ts and the two dependencies", () => {
    const { files } = generate(["logging"]);
    const loggerFile = file(files, "src/logger.ts");
    expect(loggerFile.source).toBe("hono/logging");
    expect(loggerFile.contents).toContain("pinoLogger");
    const pkg = JSON.parse(file(files, "package.json").contents) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toMatchObject({
      "hono-pino": "^0.10.3",
      pino: "^10.4.0",
    });
  });

  test("without logging the baseline logger is untouched", () => {
    const index = file(generate([]).files, "src/index.ts").contents;
    expect(index).toContain("import { logger } from 'hono/logger'");
    expect(index).toContain("app.use(logger())");
  });
});

const HARDENING_INDEX = entry(`import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { compress } from 'hono/compress'
import { HTTPException } from 'hono/http-exception'
import { logger } from 'hono/logger'
import { requestId } from 'hono/request-id'
import { timeout } from 'hono/timeout'
import { health } from './routes/health'

const app = new Hono()
app.use(requestId())
app.use(logger())
app.use(timeout(30_000))
app.use(bodyLimit({ maxSize: 1024 * 1024 }))
app.use(compress())

app.route('/', health)`);

describe("render / {base + hono/http-hardening}", () => {
  test("wires timeout / body-limit / compress at 20/21/22 (after the logger)", () => {
    const { files } = generate(["http-hardening"]);
    expect(file(files, "src/index.ts").contents).toBe(HARDENING_INDEX);
  });

  test("adds no dependencies (built-in middleware)", () => {
    const { files } = generate(["http-hardening"]);
    const pkg = JSON.parse(file(files, "package.json").contents) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(["@hono/node-server", "hono"]);
  });

  test("without hardening none of the middleware appear", () => {
    const index = file(generate([]).files, "src/index.ts").contents;
    expect(index).not.toContain("timeout");
    expect(index).not.toContain("bodyLimit");
    expect(index).not.toContain("compress");
  });
});

describe("presets / hono-standard + hono-full", () => {
  test("hono-standard = base + zod + api-guard + testing", () => {
    const registry = loadRegistry();
    const preset = expandPreset("hono-standard", registry);
    const plan = resolve({ ...ANSWERS, features: preset.features }, registry);
    expect(plan.features).toEqual(["hono/api-guard", "hono/testing", "hono/zod"]);
    const files = render(plan, registry);
    expect(file(files, "src/app.test.ts")).toBeDefined();
    expect(file(files, "src/schemas/user.ts")).toBeDefined();
  });

  test("hono-full = standard + swagger + logging + http-hardening", () => {
    const registry = loadRegistry();
    const preset = expandPreset("hono-full", registry);
    const plan = resolve({ ...ANSWERS, features: preset.features }, registry);
    expect(plan.features).toEqual([
      "hono/api-guard",
      "hono/http-hardening",
      "hono/logging",
      "hono/zod",
      "hono/swagger-openapi",
      "hono/testing",
    ]);
    const files = render(plan, registry);
    expect(file(files, "src/logger.ts")).toBeDefined();
    expect(file(files, "src/docs/spec.ts")).toBeDefined();
    for (const rendered of files) {
      expect(rendered.contents).not.toContain("@code4x");
    }
  });

  test("preset selection is byte-stable against the equivalent explicit feature list", () => {
    const registry = loadRegistry();
    const preset = expandPreset("hono-full", registry);
    const fromPreset = render(
      resolve({ ...ANSWERS, features: preset.features }, registry),
      registry,
    );
    const explicit = render(
      resolve(
        {
          ...ANSWERS,
          features: [
            "hono/http-hardening",
            "hono/testing",
            "hono/logging",
            "hono/zod",
            "hono/api-guard",
            "hono/swagger-openapi",
          ],
        },
        registry,
      ),
      registry,
    );
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(fromPreset));
  });
});

describe("resolve / mutual exclusion", () => {
  test("same-group selections fail with E-CONFLICT", () => {
    const registry = loadRegistry();
    const grouped: FeatureManifest = {
      id: "hono/grouped-a",
      title: "Grouped A",
      description: "test-only",
      group: "hono/mode",
    };
    const groupedB: FeatureManifest = {
      id: "hono/grouped-b",
      title: "Grouped B",
      description: "test-only",
      group: "hono/mode",
    };
    const cloned: Registry = {
      ...registry,
      features: { ...registry.features, [grouped.id]: grouped, [groupedB.id]: groupedB },
    };
    let thrown: unknown;
    try {
      resolve({ ...ANSWERS, features: ["hono/grouped-a", "hono/grouped-b"] }, cloned);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(Code4xError);
    expect((thrown as Code4xError).code).toBe("E-CONFLICT");
  });
});
