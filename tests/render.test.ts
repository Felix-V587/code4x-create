import { describe, expect, test } from "vite-plus/test";

import { render } from "../src/domain/render.ts";
import { Code4xError } from "../src/domain/errors.ts";
import type { Registry } from "../src/domain/registry.ts";
import type {
  Answers,
  FeatureManifest,
  PackageJsonPatch,
  Plan,
  WiringBlock,
} from "../src/domain/types.ts";

const ANSWERS: Answers = {
  targetDir: "./app",
  projectName: "app",
  framework: "hono",
  features: [],
};

function plan(features: string[] = []): Plan {
  return { answers: ANSWERS, framework: "hono", explicitFeatures: features, features };
}

function wirings(blocks: WiringBlock[]): Registry["features"][string] {
  return {
    id: "hono/x",
    title: "x",
    description: "x",
    base: { wiring: blocks.map((block, index) => ({ anchor: "imports", order: index, block })) },
  };
}

function registryWith(options: {
  skeleton: string;
  anchors?: Record<
    string,
    { kind: "imports" | "list" | "single"; single?: { default?: WiringBlock } }
  >;
  static?: Registry["frameworks"][string]["static"];
  features?: Record<string, FeatureManifest>;
  assets?: Record<string, string>;
}): Registry {
  return {
    frameworks: {
      hono: {
        id: "hono",
        title: "Hono",
        assembly: [
          {
            path: "src/index.ts",
            anchors: options.anchors ?? { imports: { kind: "imports" } },
            skeleton: options.skeleton,
          },
        ],
        static: options.static ?? {},
      },
    },
    features: options.features ?? {},
    presets: {},
    assets: options.assets ?? {},
  };
}

function expectCode4xError(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error(`expected ${code}, but no error was thrown`);
  } catch (error) {
    expect(error).toBeInstanceOf(Code4xError);
    expect((error as Code4xError).code).toBe(code);
  }
}

describe("render / skeleton markers", () => {
  test("missing declared anchor -> E-MARKER", () => {
    const registry = registryWith({ skeleton: "const x = 1\n" });
    expectCode4xError(() => render(plan(), registry), "E-MARKER");
  });

  test("undeclared marker -> E-MARKER", () => {
    const registry = registryWith({
      skeleton: "// @code4x:begin extra\n// @code4x:end extra\n",
    });
    expectCode4xError(() => render(plan(), registry), "E-MARKER");
  });

  test("duplicate marker -> E-MARKER", () => {
    const registry = registryWith({
      skeleton:
        "// @code4x:begin imports\n// @code4x:end imports\n// @code4x:begin imports\n// @code4x:end imports\n",
    });
    expectCode4xError(() => render(plan(), registry), "E-MARKER");
  });

  test("unclosed marker -> E-MARKER", () => {
    const registry = registryWith({ skeleton: "// @code4x:begin imports\n" });
    expectCode4xError(() => render(plan(), registry), "E-MARKER");
  });

  test("markers are stripped from output", () => {
    const registry = registryWith({
      skeleton: "// @code4x:begin imports\n// @code4x:end imports\nconst x = 1\n",
    });
    const [file] = render(plan(), registry);
    expect(file.contents).toBe("const x = 1\n");
  });
});

describe("render / imports aggregation", () => {
  const skeleton = "// @code4x:begin imports\n// @code4x:end imports\nconst x = 1\n";

  test("dedupes + sorts named imports across features", () => {
    const registry = registryWith({
      skeleton,
      features: {
        "hono/a": wirings([{ kind: "import", module: "x", named: ["b", "a"] }]),
        "hono/b": wirings([{ kind: "import", module: "x", named: ["c", "a"] }]),
      },
    });
    const [file] = render(plan(["hono/a", "hono/b"]), registry);
    expect(file.contents).toBe("import { a, b, c } from 'x'\nconst x = 1\n");
  });

  test("type and value imports render as separate, sorted lines", () => {
    const registry = registryWith({
      skeleton,
      features: {
        "hono/a": wirings([
          { kind: "import", module: "x", named: ["b", "a"] },
          { kind: "import", module: "x", named: ["T", "S"], typeOnly: true },
        ]),
      },
    });
    const [file] = render(plan(["hono/a"]), registry);
    expect(file.contents).toBe(
      "import { a, b } from 'x'\nimport type { S, T } from 'x'\nconst x = 1\n",
    );
  });

  test("relative imports sort last", () => {
    const registry = registryWith({
      skeleton,
      features: {
        "hono/a": wirings([
          { kind: "import", module: "./z", named: ["z"] },
          { kind: "import", module: "pkg", named: ["p"] },
          { kind: "import", module: "../up", named: ["u"] },
        ]),
      },
    });
    const [file] = render(plan(["hono/a"]), registry);
    expect(file.contents).toBe(
      "import { p } from 'pkg'\nimport { u } from '../up'\nimport { z } from './z'\nconst x = 1\n",
    );
  });

  test("differing default imports -> E-IMPORT-CONFLICT", () => {
    const registry = registryWith({
      skeleton,
      features: {
        "hono/a": wirings([{ kind: "import", module: "x", defaultAs: "A" }]),
        "hono/b": wirings([{ kind: "import", module: "x", defaultAs: "B" }]),
      },
    });
    expectCode4xError(() => render(plan(["hono/a", "hono/b"]), registry), "E-IMPORT-CONFLICT");
  });
});

describe("render / empty regions and lists", () => {
  test("empty anchors render zero lines and adjacent blanks collapse", () => {
    const registry = registryWith({
      skeleton:
        "// @code4x:begin imports\n// @code4x:end imports\n\nconst x = 1\n// @code4x:begin middlewares\n// @code4x:end middlewares\n\n// @code4x:begin routes\n// @code4x:end routes\n\nconst y = 2\n",
      anchors: {
        imports: { kind: "imports" },
        middlewares: { kind: "list" },
        routes: { kind: "list" },
      },
    });
    const [file] = render(plan(), registry);
    expect(file.contents).toBe("const x = 1\n\nconst y = 2\n");
  });

  test("list blocks sort by (order, feature rank, id) and duplicate -> E-STMT-DUP", () => {
    const registry = registryWith({
      skeleton: "// @code4x:begin middlewares\n// @code4x:end middlewares\n",
      anchors: { middlewares: { kind: "list" } },
      features: {
        "hono/a": {
          id: "hono/a",
          title: "a",
          description: "a",
          base: {
            wiring: [
              {
                anchor: "middlewares",
                order: 0,
                block: { kind: "call", callee: "app.use", expression: "a()" },
              },
            ],
          },
        },
        "hono/b": {
          id: "hono/b",
          title: "b",
          description: "b",
          base: {
            wiring: [
              {
                anchor: "middlewares",
                order: 0,
                block: { kind: "call", callee: "app.use", expression: "b()" },
              },
            ],
          },
        },
      },
    });
    const [file] = render(plan(["hono/b", "hono/a"]), registry);
    // Plan order is authoritative, independent of explicit selection order.
    expect(file.contents).toBe("app.use(b())\napp.use(a())\n");
  });

  test("duplicate statement -> E-STMT-DUP", () => {
    const registry = registryWith({
      skeleton: "// @code4x:begin middlewares\n// @code4x:end middlewares\n",
      anchors: { middlewares: { kind: "list" } },
      features: {
        "hono/a": {
          id: "hono/a",
          title: "a",
          description: "a",
          base: {
            wiring: [
              {
                anchor: "middlewares",
                order: 0,
                block: { kind: "call", callee: "app.use", expression: "a()" },
              },
            ],
          },
        },
        "hono/b": {
          id: "hono/b",
          title: "b",
          description: "b",
          base: {
            wiring: [
              {
                anchor: "middlewares",
                order: 0,
                block: { kind: "call", callee: "app.use", expression: "a()" },
              },
            ],
          },
        },
      },
    });
    expectCode4xError(() => render(plan(["hono/a", "hono/b"]), registry), "E-STMT-DUP");
  });
});

describe("render / single slot + collisions + anchors", () => {
  test("single anchor with >1 hit -> E-SINGLE-SLOT", () => {
    const registry = registryWith({
      skeleton: "// @code4x:begin main\n// @code4x:end main\n",
      anchors: { main: { kind: "single" } },
      features: {
        "hono/a": {
          id: "hono/a",
          title: "a",
          description: "a",
          base: { wiring: [{ anchor: "main", order: 0, block: { kind: "raw", code: "a" } }] },
        },
        "hono/b": {
          id: "hono/b",
          title: "b",
          description: "b",
          base: { wiring: [{ anchor: "main", order: 0, block: { kind: "raw", code: "b" } }] },
        },
      },
    });
    expectCode4xError(() => render(plan(["hono/a", "hono/b"]), registry), "E-SINGLE-SLOT");
  });

  test("undeclared wiring anchor -> E-UNK-ANCHOR", () => {
    const registry = registryWith({
      skeleton: "// @code4x:begin imports\n// @code4x:end imports\n",
      features: {
        "hono/a": {
          id: "hono/a",
          title: "a",
          description: "a",
          base: { wiring: [{ anchor: "nope", order: 0, block: { kind: "raw", code: "x" } }] },
        },
      },
    });
    expectCode4xError(() => render(plan(["hono/a"]), registry), "E-UNK-ANCHOR");
  });

  test("two different contributions to the same dest -> E-FILE-WRITE", () => {
    const registry = registryWith({
      skeleton: "// @code4x:begin imports\n// @code4x:end imports\n",
      static: { files: [{ src: "files/a", dest: "a.txt" }] },
      features: {
        "hono/a": {
          id: "hono/a",
          title: "a",
          description: "a",
          base: { files: [{ src: "files/a", dest: "a.txt" }] },
        },
      },
      assets: { "hono/files/a": "base\n", "hono/a/files/a": "different\n" },
    });
    expectCode4xError(() => render(plan(["hono/a"]), registry), "E-FILE-WRITE");
  });

  test("identical writes with identical-ok are allowed", () => {
    const registry = registryWith({
      skeleton: "// @code4x:begin imports\n// @code4x:end imports\n",
      static: { files: [{ src: "files/a", dest: "a.txt", onCollision: "identical-ok" }] },
      features: {
        "hono/a": {
          id: "hono/a",
          title: "a",
          description: "a",
          base: { files: [{ src: "files/a", dest: "a.txt" }] },
        },
      },
      assets: { "hono/files/a": "same\n", "hono/a/files/a": "same\n" },
    });
    const files = render(plan(["hono/a"]), registry);
    expect(files.find((file) => file.path === "a.txt")?.contents).toBe("same\n");
  });
});

describe("render / idempotency", () => {
  test("same plan renders byte-identical output twice", () => {
    const registry = registryWith({
      skeleton:
        "// @code4x:begin imports\n// @code4x:end imports\nconst app = 1\n// @code4x:begin middlewares\n// @code4x:end middlewares\n",
      anchors: { imports: { kind: "imports" }, middlewares: { kind: "list" } },
      static: {
        wiring: [
          {
            anchor: "imports",
            order: 0,
            block: { kind: "import", module: "hono/logger", named: ["logger"] },
          },
          {
            anchor: "middlewares",
            order: 0,
            block: { kind: "call", callee: "app.use", expression: "logger()" },
          },
        ],
      },
    });
    const first = render(plan(), registry);
    const second = render(plan(), registry);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe("render / package.json merging", () => {
  const SKELETON = "// @code4x:begin imports\n// @code4x:end imports\n";

  function pkgFeature(pkg: PackageJsonPatch): FeatureManifest {
    return { id: "hono/x", title: "x", description: "x", base: { packageJson: pkg } };
  }

  function packageRegistry(
    basePackage: Record<string, unknown>,
    features: Record<string, FeatureManifest> = {},
  ): Registry {
    return registryWith({
      skeleton: SKELETON,
      static: { files: [{ src: "files/package.json", dest: "package.json" }] },
      features,
      assets: { "hono/files/package.json": `${JSON.stringify(basePackage, null, 2)}\n` },
    });
  }

  function readPackage(registry: Registry, features: string[]): Record<string, unknown> {
    const file = render(plan(features), registry).find((f) => f.path === "package.json");
    expect(file).toBeDefined();
    return JSON.parse(file?.contents ?? "{}") as Record<string, unknown>;
  }

  test("same dependency/version merges silently", () => {
    const registry = packageRegistry(
      { name: "{PROJECT}", dependencies: { hono: "^4.0.0" } },
      {
        "hono/a": pkgFeature({ dependencies: { hono: "^4.0.0" } }),
        "hono/b": pkgFeature({ dependencies: { hono: "^4.0.0" } }),
      },
    );
    const pkg = readPackage(registry, ["hono/a", "hono/b"]);
    expect(pkg.name).toBe("app");
    expect(pkg.dependencies).toEqual({ hono: "^4.0.0" });
  });

  test("same dependency, different version -> E-DEP-VERSION", () => {
    const registry = packageRegistry(
      { name: "{PROJECT}" },
      {
        "hono/a": pkgFeature({ dependencies: { hono: "^4.0.0" } }),
        "hono/b": pkgFeature({ dependencies: { hono: "^5.0.0" } }),
      },
    );
    expectCode4xError(() => render(plan(["hono/a", "hono/b"]), registry), "E-DEP-VERSION");
  });

  test("same script key set twice -> E-SCRIPT-KEY", () => {
    const registry = packageRegistry(
      { name: "{PROJECT}" },
      {
        "hono/a": pkgFeature({ scripts: { build: { set: "a" } } }),
        "hono/b": pkgFeature({ scripts: { build: { set: "b" } } }),
      },
    );
    expectCode4xError(() => render(plan(["hono/a", "hono/b"]), registry), "E-SCRIPT-KEY");
  });

  test("set and append on the same key -> E-SCRIPT-KEY", () => {
    const registry = packageRegistry(
      { name: "{PROJECT}" },
      {
        "hono/a": pkgFeature({ scripts: { build: { set: "a" } } }),
        "hono/b": pkgFeature({ scripts: { build: { append: "b" } } }),
      },
    );
    expectCode4xError(() => render(plan(["hono/a", "hono/b"]), registry), "E-SCRIPT-KEY");
  });

  test("append before set on the same key -> E-SCRIPT-KEY", () => {
    const registry = packageRegistry(
      { name: "{PROJECT}" },
      {
        "hono/a": pkgFeature({ scripts: { build: { append: "a" } } }),
        "hono/b": pkgFeature({ scripts: { build: { set: "b" } } }),
      },
    );
    // plan order drives patch order: a (append) then b (set).
    expectCode4xError(() => render(plan(["hono/a", "hono/b"]), registry), "E-SCRIPT-KEY");
  });

  test("prepend puts the command first, append puts it last; no base -> bare command", () => {
    const registry = packageRegistry(
      { name: "{PROJECT}", scripts: { dev: "echo base", typecheck: "tsc" } },
      {
        "hono/a": pkgFeature({
          scripts: {
            dev: { append: "echo a" },
            typecheck: { prepend: "pre" },
            lint: { prepend: "eslint" },
          },
        }),
        "hono/b": pkgFeature({ scripts: { dev: { append: "echo b" } } }),
      },
    );
    const pkg = readPackage(registry, ["hono/a", "hono/b"]);
    expect(pkg.scripts).toEqual({
      dev: "echo base && echo a && echo b",
      typecheck: "pre && tsc",
      lint: "eslint",
    });
  });

  test("patches are applied on top of the blueprint package.json", () => {
    const registry = packageRegistry(
      { name: "{PROJECT}", version: "0.0.0", dependencies: { hono: "^4.0.0" } },
      {
        "hono/a": pkgFeature({
          dependencies: { "@hono/node-server": "^1.13.0" },
          devDependencies: { tsx: "^4.19.0" },
          scripts: { test: { set: "vitest" } },
        }),
      },
    );
    const pkg = readPackage(registry, ["hono/a"]);
    expect(pkg).toMatchObject({
      name: "app",
      version: "0.0.0",
      dependencies: { hono: "^4.0.0", "@hono/node-server": "^1.13.0" },
      devDependencies: { tsx: "^4.19.0" },
      scripts: { test: "vitest" },
    });
    const file = render(plan(["hono/a"]), registry).find((f) => f.path === "package.json");
    expect(file?.contents).not.toContain("{PROJECT}");
  });
});

describe("render / condition semantics", () => {
  test("`when` receives the resolved selection, not the raw answers tokens", () => {
    const seen: string[][] = [];
    const conditional = (answers: Answers): boolean => {
      seen.push(answers.features);
      return answers.features.includes("hono/zod");
    };
    const registry = registryWith({
      skeleton: "// @code4x:begin imports\n// @code4x:end imports\n",
      features: {
        "hono/zod": {
          id: "hono/zod",
          title: "zod",
          description: "zod",
          base: {
            wiring: [
              {
                anchor: "imports",
                order: 0,
                when: conditional,
                block: { kind: "import", module: "x", named: ["y"] },
              },
            ],
          },
        },
      },
    });
    // Raw answers carry a bare token; the resolved plan features are qualified.
    const p: Plan = {
      answers: { ...ANSWERS, features: ["zod"] },
      framework: "hono",
      explicitFeatures: ["hono/zod"],
      features: ["hono/zod"],
    };
    const [file] = render(p, registry);
    expect(seen).toEqual([["hono/zod"]]);
    expect(file.contents).toContain("import { y } from 'x'");
  });
});

describe("render / HTML comment anchors", () => {
  const htmlSkeleton =
    "<template>\n  <h1>Hi</h1>\n  <!-- @code4x:begin body -->\n  <!-- @code4x:end body -->\n</template>\n";

  function htmlRegistry(
    options: {
      skeleton?: string;
      anchors?: Record<string, { kind: "imports" | "list" | "single" }>;
      features?: Record<string, FeatureManifest>;
    } = {},
  ): Registry {
    return registryWith({
      skeleton: options.skeleton ?? htmlSkeleton,
      anchors: options.anchors ?? { body: { kind: "list" } },
      features: options.features,
    });
  }

  test("renders an HTML-comment region with indentation preserved", () => {
    const registry = htmlRegistry({
      features: {
        "hono/a": {
          id: "hono/a",
          title: "a",
          description: "a",
          base: {
            wiring: [
              {
                anchor: "body",
                order: 0,
                block: { kind: "raw", code: "<router-view />" },
              },
            ],
          },
        },
      },
    });
    const [file] = render(plan(["hono/a"]), registry);
    expect(file.contents).toBe("<template>\n  <h1>Hi</h1>\n  <router-view />\n</template>\n");
    expect(file.contents).not.toContain("@code4x");
  });

  test("empty HTML region renders zero lines", () => {
    const [file] = render(plan(), htmlRegistry());
    expect(file.contents).toBe("<template>\n  <h1>Hi</h1>\n</template>\n");
  });

  test("missing HTML anchor -> E-MARKER", () => {
    expectCode4xError(
      () => render(plan(), htmlRegistry({ skeleton: "<template></template>\n" })),
      "E-MARKER",
    );
  });

  test("undeclared HTML marker -> E-MARKER", () => {
    const registry = htmlRegistry({
      skeleton:
        "<template>\n  <!-- @code4x:begin extra -->\n  <!-- @code4x:end extra -->\n</template>\n",
      anchors: { body: { kind: "list" } },
    });
    expectCode4xError(() => render(plan(), registry), "E-MARKER");
  });

  test("duplicate HTML marker -> E-MARKER", () => {
    const registry = htmlRegistry({
      skeleton:
        "<template>\n  <!-- @code4x:begin body -->\n  <!-- @code4x:end body -->\n  <!-- @code4x:begin body -->\n  <!-- @code4x:end body -->\n</template>\n",
    });
    expectCode4xError(() => render(plan(), registry), "E-MARKER");
  });

  test("nested HTML marker -> E-MARKER", () => {
    const registry = htmlRegistry({
      skeleton:
        "<template>\n  <!-- @code4x:begin body -->\n  <!-- @code4x:begin body -->\n  <!-- @code4x:end body -->\n  <!-- @code4x:end body -->\n</template>\n",
    });
    expectCode4xError(() => render(plan(), registry), "E-MARKER");
  });
});
