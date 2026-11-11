import { describe, expect, test } from "vite-plus/test";

import { collectAnswers, type FlowDeps, type Prompter } from "../src/domain/flow.ts";
import type { Registry } from "../src/domain/registry.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import { scriptedPrompter } from "./prompter.ts";

const registry = loadRegistry();

function deps(overrides: Partial<FlowDeps> = {}): FlowDeps {
  return {
    detectPm: () => ({ pm: "npm", source: "default" }),
    nestedGitRepo: () => false,
    targetGit: () => ({ exists: false, repoRoot: null, empty: true }),
    ...overrides,
  };
}

/** Index of the first log line with the given prefix, or -1. */
function indexOf(log: string[], prefix: string): number {
  return log.findIndex((line) => line.startsWith(prefix));
}

describe("collectAnswers / vue guided prompts", () => {
  test("asks the sections in declaration order and collects the selection", async () => {
    const prompter = scriptedPrompter({
      text: ["./app"],
      select: ["standalone", "vue", "none", "naive-ui", "tailwind", "pnpm"],
      multiselect: [[]],
      confirm: [false, false],
    });
    const answers = await collectAnswers({}, prompter, registry, deps());

    expect(answers.framework).toBe("vue");
    expect(answers.features).toEqual(["vue/naive-ui", "vue/tailwind"]);

    const expectedOrder = [
      "select:Project type",
      "select:Which framework?",
      "multiselect:Vue ecosystem",
      "select:Request strategy",
      "select:UI framework",
      "select:CSS engine",
      "select:Package manager",
    ];
    const indexes = expectedOrder.map((prefix) => indexOf(prompter.log, prefix));
    indexes.forEach((index, i) => expect(index, expectedOrder[i]).toBeGreaterThanOrEqual(0));
    for (let i = 1; i < indexes.length; i += 1) {
      expect(indexes[i], `${expectedOrder[i]} after ${expectedOrder[i - 1]}`).toBeGreaterThan(
        indexes[i - 1],
      );
    }
  });

  test("pre-checks defaults and uses the first default for single selects", async () => {
    const base = scriptedPrompter({
      text: ["./app"],
      select: ["standalone", "vue", "none", "naive-ui", "tailwind", "pnpm"],
      multiselect: [["vue/vueuse"]],
      confirm: [false, false],
    });
    const multiCalls: Array<{ message: string; initialValues?: string[] }> = [];
    const selectCalls: Array<{ message: string; initialValue?: string }> = [];
    const prompter: Prompter = {
      ...base,
      async multiselect(options) {
        multiCalls.push({ message: options.message, initialValues: options.initialValues });
        return base.multiselect(options);
      },
      async select(options) {
        selectCalls.push({ message: options.message, initialValue: options.initialValue });
        return base.select(options);
      },
    };

    const answers = await collectAnswers({}, prompter, registry, deps());

    expect(multiCalls.find((call) => call.message === "Vue ecosystem")?.initialValues).toEqual([
      "vue/vueuse",
    ]);
    expect(selectCalls.find((call) => call.message === "Request strategy")?.initialValue).toBe(
      "none",
    );
    expect(selectCalls.find((call) => call.message === "UI framework")?.initialValue).toBe(
      "vue/reka-ui",
    );
    expect(selectCalls.find((call) => call.message === "CSS engine")?.initialValue).toBe(
      "vue/tailwind",
    );
    expect(answers.features).toEqual(["vue/vueuse", "vue/naive-ui", "vue/tailwind"]);
  });

  test("colada is returned explicitly without its pinia closure", async () => {
    const prompter = scriptedPrompter({
      text: ["./app"],
      select: ["standalone", "vue", "colada", "none", "tailwind", "pnpm"],
      multiselect: [[]],
      confirm: [false, false],
    });
    const answers = await collectAnswers({}, prompter, registry, deps());

    expect(answers.features).toContain("vue/colada");
    expect(answers.features).not.toContain("vue/pinia");
  });

  test("shadcn-vue pins Tailwind and skips the CSS engine question", async () => {
    const prompter = scriptedPrompter({
      text: ["./app"],
      select: ["standalone", "vue", "none", "shadcn-vue", "pnpm"],
      multiselect: [[]],
      confirm: [false, false],
    });
    const answers = await collectAnswers({}, prompter, registry, deps());

    expect(answers.features).toEqual(["vue/shadcn-vue", "vue/tailwind"]);
    expect(indexOf(prompter.log, "select:CSS engine")).toBe(-1);
    expect(
      prompter.log.some((line) => line.startsWith("note:css:") && line.includes("shadcn-vue")),
    ).toBe(true);
  });

  test("a bound --features selection skips every guided prompt", async () => {
    const prompter = scriptedPrompter({ select: ["standalone"] });
    const answers = await collectAnswers(
      {
        targetDir: "./app",
        framework: "vue",
        features: ["vue/pinia"],
        packageManager: "pnpm",
        install: false,
        git: false,
      },
      prompter,
      registry,
      deps(),
    );

    expect(answers.features).toEqual(["vue/pinia"]);
    expect(prompter.log).toEqual(["select:Project type"]);
  });

  test("offers section-less features under 'Other integrations'", async () => {
    const synthetic: Registry = {
      frameworks: {
        demo: {
          id: "demo",
          title: "Demo",
          assembly: [],
          static: {},
          promptSections: [{ id: "core", title: "Core", mode: "multi" }],
        },
      },
      features: {
        "demo/alpha": {
          id: "demo/alpha",
          title: "Alpha",
          description: "a",
          promptSection: "core",
        },
        "demo/beta": {
          id: "demo/beta",
          title: "Beta",
          description: "b",
        },
      },
      presets: {},
      assets: {},
    };
    const prompter = scriptedPrompter({
      text: ["./app"],
      select: ["standalone", "demo", "pnpm"],
      multiselect: [["demo/alpha"], ["demo/beta"]],
      confirm: [false, false],
    });
    const answers = await collectAnswers({}, prompter, synthetic, deps());

    expect(answers.features).toEqual(["demo/alpha", "demo/beta"]);
    expect(indexOf(prompter.log, "multiselect:Other integrations")).toBeGreaterThan(
      indexOf(prompter.log, "multiselect:Core"),
    );
  });
});
