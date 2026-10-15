import { describe, expect, test } from "vite-plus/test";

import {
  CancelledError,
  collectAnswers,
  resolveInteractive,
  type FlowDeps,
} from "../src/domain/flow.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Registry } from "../src/domain/registry.ts";
import { scriptedPrompter } from "./prompter.ts";

const registry = loadRegistry();

function deps(overrides: Partial<FlowDeps> = {}): FlowDeps {
  return {
    detectPm: () => ({ pm: "npm", source: "default" }),
    nestedGitRepo: () => false,
    ...overrides,
  };
}

describe("resolveInteractive (TTY x CI x flags)", () => {
  const cases: Array<{
    label: string;
    tty: boolean;
    env: NodeJS.ProcessEnv;
    flags: { interactive?: boolean; yes: boolean; ci: boolean };
    expected: boolean;
  }> = [
    {
      label: "TTY, no flags -> interactive",
      tty: true,
      env: {},
      flags: { yes: false, ci: false },
      expected: true,
    },
    {
      label: "TTY + CI env -> non-interactive",
      tty: true,
      env: { CI: "true" },
      flags: { yes: false, ci: false },
      expected: false,
    },
    {
      label: "no TTY -> non-interactive",
      tty: false,
      env: {},
      flags: { yes: false, ci: false },
      expected: false,
    },
    {
      label: "--interactive overrides no TTY",
      tty: false,
      env: {},
      flags: { interactive: true, yes: false, ci: false },
      expected: true,
    },
    {
      label: "--no-interactive forces off on TTY",
      tty: true,
      env: {},
      flags: { interactive: false, yes: false, ci: false },
      expected: false,
    },
    {
      label: "-y forces non-interactive",
      tty: true,
      env: {},
      flags: { yes: true, ci: false },
      expected: false,
    },
    {
      label: "--interactive overrides CI clamp",
      tty: false,
      env: { CI: "1" },
      flags: { interactive: true, yes: false, ci: true },
      expected: true,
    },
    {
      label: "CI=false is not CI",
      tty: true,
      env: { CI: "false" },
      flags: { yes: false, ci: false },
      expected: true,
    },
    {
      label: "CI=0 is not CI",
      tty: false,
      env: { CI: "0" },
      flags: { yes: true, ci: false },
      expected: false,
    },
  ];

  test.each(cases)("$label", ({ tty, env, flags, expected }) => {
    expect(resolveInteractive(flags, env, tty)).toBe(expected);
  });
});

describe("collectAnswers", () => {
  test("fully-bound partial skips every prompt", async () => {
    const prompter = scriptedPrompter({});
    const answers = await collectAnswers(
      {
        targetDir: "./app",
        framework: "hono",
        features: [],
        packageManager: "pnpm",
        install: false,
        git: false,
      },
      prompter,
      registry,
      deps(),
    );
    expect(answers).toEqual({
      targetDir: "./app",
      projectName: "app",
      framework: "hono",
      features: [],
      packageManager: "pnpm",
      install: false,
      git: false,
    });
    expect(prompter.log).toEqual([]);
  });

  test("asks only unbound fields and normalizes the package name", async () => {
    const prompter = scriptedPrompter({
      text: ["./My App"],
      select: ["hono", "npm"],
      multiselect: [[]],
      confirm: [false, false],
    });
    const answers = await collectAnswers({}, prompter, registry, deps());
    expect(answers.projectName).toBe("my-app");
    expect(answers.targetDir).toBe("./My App");
    expect(answers.framework).toBe("hono");
    expect(answers.features).toEqual([]);
    expect(answers.packageManager).toBe("npm");
    expect(answers.install).toBe(false);
    expect(answers.git).toBe(false);
    expect(prompter.log.some((line) => line.startsWith("info:") && line.includes("my-app"))).toBe(
      true,
    );
  });

  test("--framework hono only skips N2 (features still asked)", async () => {
    const prompter = scriptedPrompter({
      text: ["./app"],
      multiselect: [["hono/zod"]],
      select: ["npm"],
      confirm: [false, false],
    });
    const answers = await collectAnswers({ framework: "hono" }, prompter, registry, deps());
    expect(answers.features).toEqual(["hono/zod"]);
    expect(prompter.log.some((line) => line.startsWith("select:Which framework?"))).toBe(false);
  });

  test("nested git repo -> no git question, auto-no + note", async () => {
    const prompter = scriptedPrompter({
      text: ["./app"],
      select: ["hono", "npm"],
      multiselect: [[]],
      confirm: [false],
    });
    const answers = await collectAnswers(
      {},
      prompter,
      registry,
      deps({ nestedGitRepo: () => true }),
    );
    expect(answers.git).toBe(false);
    expect(prompter.log.some((line) => line.includes("skipping git init"))).toBe(true);
    expect(
      prompter.log.some((line) => line.startsWith("confirm:Initialize a git repository?")),
    ).toBe(false);
  });

  test("cancellation propagates as CancelledError", async () => {
    const prompter = scriptedPrompter({ text: ["./app"], cancelAt: "select" });
    await expect(collectAnswers({}, prompter, registry, deps())).rejects.toBeInstanceOf(
      CancelledError,
    );
  });

  test("re-prompts when two features of the same group are selected", async () => {
    // Synthetic registry: no shipped feature has a `group` yet, so the
    // mutual-exclusion UX is exercised with manifests here.
    const groupRegistry: Registry = {
      frameworks: { vue: { id: "vue", title: "Vue", assembly: [], static: {} } },
      features: {
        "vue/naive-ui": {
          id: "vue/naive-ui",
          title: "Naive UI",
          description: "a",
          group: "vue/ui",
        },
        "vue/element-plus": {
          id: "vue/element-plus",
          title: "Element Plus",
          description: "b",
          group: "vue/ui",
        },
      },
      presets: {},
      assets: {},
    };
    const prompter = scriptedPrompter({
      text: ["./app"],
      select: ["vue", "npm"],
      multiselect: [["vue/naive-ui", "vue/element-plus"], ["vue/naive-ui"]],
      confirm: [false, false],
    });
    const answers = await collectAnswers({}, prompter, groupRegistry, deps());
    expect(answers.features).toEqual(["vue/naive-ui"]);
    expect(
      prompter.log.some((line) => line.startsWith("note:group:") && line.includes("vue/ui")),
    ).toBe(true);
    // The initial multiselect plus one re-prompt.
    expect(prompter.log.filter((line) => line.startsWith("multiselect:"))).toHaveLength(2);
  });
});
