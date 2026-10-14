import { describe, expect, test } from "vite-plus/test";

import { Code4xError } from "../src/domain/errors.ts";
import {
  expandPreset,
  normalizePackageName,
  parseFeatureTokens,
  resolve,
} from "../src/domain/resolve.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Registry } from "../src/domain/registry.ts";
import type { Answers, FeatureManifest } from "../src/domain/types.ts";

function manifest(id: string, requires?: FeatureManifest["requires"]): FeatureManifest {
  return { id, title: id, description: id, requires };
}

function registry(features: Record<string, FeatureManifest> = {}): Registry {
  return {
    frameworks: {
      hono: { id: "hono", title: "Hono", assembly: [], static: {} },
      vue: { id: "vue", title: "Vue", assembly: [], static: {} },
    },
    features,
    presets: { "hono-api": { id: "hono-api", framework: "hono", features: [] } },
    assets: {},
  };
}

function answers(overrides: Partial<Answers>): Answers {
  return {
    targetDir: "./app",
    projectName: "app",
    framework: "hono",
    features: [],
    ...overrides,
  };
}

function capture(fn: () => unknown): Code4xError {
  try {
    fn();
  } catch (error) {
    if (error instanceof Code4xError) return error;
    throw error;
  }
  throw new Error("expected a Code4xError");
}

describe("normalizePackageName", () => {
  test.each([
    ["My API", "my-api"],
    ["foo_bar", "foo-bar"],
    ["  Foo  ", "foo"],
    ["a--b", "a-b"],
    ["中文项目", "my-app"],
    ["", "my-app"],
    ["!!!", "my-app"],
    ["My.API", "myapi"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePackageName(input)).toBe(expected);
  });
});

describe("parseFeatureTokens", () => {
  test("splits on commas and spaces", () => {
    expect(parseFeatureTokens("zod, api-guard")).toEqual(["zod", "api-guard"]);
    expect(parseFeatureTokens(["zod", "api-guard"])).toEqual(["zod", "api-guard"]);
  });

  test("none clears the list", () => {
    expect(parseFeatureTokens("none")).toEqual([]);
    expect(parseFeatureTokens("zod,none")).toEqual([]);
  });
});

describe("resolve", () => {
  test("bare id resolves uniquely and completes the closure in topo order", () => {
    const reg = registry({
      "hono/zod": manifest("hono/zod"),
      "hono/swagger-openapi": manifest("hono/swagger-openapi", [
        { kind: "feature", id: "hono/zod" },
        { kind: "framework", id: "hono" },
      ]),
    });
    const plan = resolve(answers({ features: ["swagger-openapi"] }), reg);
    expect(plan.explicitFeatures).toEqual(["hono/swagger-openapi"]);
    expect(plan.features).toEqual(["hono/zod", "hono/swagger-openapi"]);
  });

  test("framework mismatch -> E-FEATURE-FRAMEWORK", () => {
    const reg = registry({ "vue/pinia": manifest("vue/pinia") });
    const error = capture(() => resolve(answers({ framework: "hono", features: ["pinia"] }), reg));
    expect(error.code).toBe("E-FEATURE-FRAMEWORK");
    expect(error.exitCode).toBe(1);
  });

  test("features spanning frameworks -> E-MIXED-FRAMEWORK", () => {
    const reg = registry({
      "hono/zod": manifest("hono/zod"),
      "vue/pinia": manifest("vue/pinia"),
    });
    const error = capture(() =>
      resolve(answers({ framework: "hono", features: ["hono/zod", "vue/pinia"] }), reg),
    );
    expect(error.code).toBe("E-MIXED-FRAMEWORK");
  });

  test("unknown feature -> E-INVALID-VALUE (usage, exit 2)", () => {
    const error = capture(() => resolve(answers({ features: ["nope"] }), registry()));
    expect(error.code).toBe("E-INVALID-VALUE");
    expect(error.exitCode).toBe(2);
  });

  test("missing requirement -> E-MISSING-REQ", () => {
    const reg = registry({
      "hono/swagger-openapi": manifest("hono/swagger-openapi", [
        { kind: "feature", id: "hono/zod" },
      ]),
    });
    expect(capture(() => resolve(answers({ features: ["hono/swagger-openapi"] }), reg)).code).toBe(
      "E-MISSING-REQ",
    );
  });

  test("cycle -> E-CYCLE", () => {
    const reg = registry({
      "hono/a": manifest("hono/a", [{ kind: "feature", id: "hono/b" }]),
      "hono/b": manifest("hono/b", [{ kind: "feature", id: "hono/a" }]),
    });
    expect(capture(() => resolve(answers({ features: ["hono/a"] }), reg)).code).toBe("E-CYCLE");
  });

  test("implemented feature resolves (hono/zod)", () => {
    const plan = resolve(answers({ framework: "hono", features: ["zod"] }), loadRegistry());
    expect(plan.explicitFeatures).toEqual(["hono/zod"]);
    expect(plan.features).toEqual(["hono/zod"]);
  });

  test("-p hono-api expands to the real feature set (three-piece)", () => {
    const reg = loadRegistry();
    const preset = expandPreset("hono-api", reg);
    expect(preset.framework).toBe("hono");
    expect(preset.features).toEqual(["hono/api-guard", "hono/zod", "hono/swagger-openapi"]);

    const plan = resolve(answers({ framework: preset.framework, features: preset.features }), reg);
    expect(plan.features).toEqual(["hono/api-guard", "hono/zod", "hono/swagger-openapi"]);
  });

  test("swagger requires zod: closure pulls zod in, ordered before swagger", () => {
    const plan = resolve(
      answers({ framework: "hono", features: ["swagger-openapi"] }),
      loadRegistry(),
    );
    expect(plan.explicitFeatures).toEqual(["hono/swagger-openapi"]);
    expect(plan.features).toEqual(["hono/zod", "hono/swagger-openapi"]);
  });

  test("unknown qualified feature is not selectable (E-INVALID-VALUE)", () => {
    const error = capture(() =>
      resolve(answers({ framework: "hono", features: ["hono/future"] }), registry()),
    );
    expect(error.code).toBe("E-INVALID-VALUE");
  });

  test("vue feature under hono framework -> E-FEATURE-FRAMEWORK", () => {
    const error = capture(() =>
      resolve(answers({ framework: "hono", features: ["vue/pinia"] }), loadRegistry()),
    );
    expect(error.code).toBe("E-FEATURE-FRAMEWORK");
  });

  test("bare vue feature resolves under the vue framework", () => {
    const plan = resolve(answers({ framework: "vue", features: ["pinia"] }), loadRegistry());
    expect(plan.explicitFeatures).toEqual(["vue/pinia"]);
    expect(plan.features).toEqual(["vue/pinia"]);
  });

  test("vue-full preset expands to pinia + router", () => {
    const preset = expandPreset("vue-full", loadRegistry());
    expect(preset.framework).toBe("vue");
    expect(preset.features).toEqual(["vue/pinia", "vue/router"]);

    const plan = resolve(
      answers({ framework: preset.framework, features: preset.features }),
      loadRegistry(),
    );
    expect(plan.features).toEqual(["vue/pinia", "vue/router"]);
  });

  test("two features in the same group -> E-CONFLICT (usage, exit 2) naming members", () => {
    const reg = registry({
      "vue/a": { ...manifest("vue/a"), group: "vue/ui" },
      "vue/b": { ...manifest("vue/b"), group: "vue/ui" },
    });
    const error = capture(() =>
      resolve(answers({ framework: "vue", features: ["vue/a", "vue/b"] }), reg),
    );
    expect(error.code).toBe("E-CONFLICT");
    expect(error.exitCode).toBe(2);
    expect(error.message).toContain("vue/ui");
    expect(error.fix).toContain("vue/a");
    expect(error.fix).toContain("vue/b");
  });

  test("a single member of a group resolves", () => {
    const reg = registry({
      "vue/a": { ...manifest("vue/a"), group: "vue/ui" },
      "vue/b": { ...manifest("vue/b"), group: "vue/ui" },
    });
    const plan = resolve(answers({ framework: "vue", features: ["vue/a"] }), reg);
    expect(plan.features).toEqual(["vue/a"]);
  });

  test("a group conflict pulled in through the closure is still rejected", () => {
    const reg = registry({
      "vue/a": { ...manifest("vue/a"), group: "vue/ui" },
      "vue/b": { ...manifest("vue/b", [{ kind: "feature", id: "vue/a" }]), group: "vue/ui" },
    });
    const error = capture(() => resolve(answers({ framework: "vue", features: ["vue/b"] }), reg));
    expect(error.code).toBe("E-CONFLICT");
  });
});
