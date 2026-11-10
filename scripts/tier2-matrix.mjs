#!/usr/bin/env node
/**
 * Tier-2 blessed combination matrix (`docs/06` §7 M11, §0 acceptance #2).
 *
 * For each blessed combo this script generates a project with the *packed* CLI
 * (`packages/cli/dist/cli.mjs`), then runs `pnpm install` →
 * `pnpm run build` → `pnpm run check` inside it. A per-combo PASS/FAIL summary
 * is printed (with the failing step's output tail) and the process exits
 * non-zero if any combo fails.
 *
 * Combo ids live in `tier2-combos.json`, but every id is *derived-checked*
 * against the runtime registry loaded from `dist/index.mjs` (framework / preset
 * / feature ids) — so the list cannot drift from what the CLI can actually
 * generate. `tests/tier2-combos.test.ts` asserts the same against the source
 * registry.
 *
 * Zero new dependencies: Node built-ins only. CI-safe: no prompts, deterministic
 * scratch dirs, non-zero exit on failure.
 *
 * Usage:
 *   node scripts/tier2-matrix.mjs            # subset (PR)
 *   node scripts/tier2-matrix.mjs --all      # subset + nightly combos
 *   node scripts/tier2-matrix.mjs --only=id1,id2   # targeted local runs
 *
 * Env:
 *   TIER2_DIR         scratch root (default /tmp/opencode/tier2)
 *   TIER2_STORE       pnpm store dir (default: `pnpm store path` from the repo)
 *   TIER2_TIMEOUT_MS  per-command timeout in ms (default 900000 = 15 min)
 */

import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const pkgRoot = join(repoRoot, "packages", "cli");
const distCli = join(pkgRoot, "dist", "cli.mjs");
const distIndex = join(pkgRoot, "dist", "index.mjs");

const catalog = JSON.parse(readFileSync(join(here, "tier2-combos.json"), "utf8"));

/** Combo specs for a mode (`subset` default, or `all`). */
export function combosFor(mode = "subset") {
  const subset = catalog.subset ?? [];
  const nightly = catalog.nightlyOnly ?? [];
  return mode === "all" ? [...subset, ...nightly] : [...subset];
}

function parseArgs(argv) {
  const args = new Set(argv);
  let mode = "subset";
  if (args.has("--all")) mode = "all";
  if (args.has("--subset")) mode = "subset";
  const onlyArg = argv.find((entry) => entry.startsWith("--only="));
  const only = onlyArg
    ? onlyArg
        .slice("--only=".length)
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : undefined;
  return { mode, only };
}

function resolveStoreDir() {
  if (process.env.TIER2_STORE) return process.env.TIER2_STORE;
  const probe = spawnSync("pnpm", ["store", "path"], { cwd: repoRoot, encoding: "utf8" });
  const fromPnpm = probe.status === 0 ? probe.stdout.trim() : "";
  if (fromPnpm) return fromPnpm;
  return join(process.env.TIER2_DIR || "/tmp/opencode/tier2", "store");
}

/** Validate a combo against the registry; returns a list of human problems. */
export function validateCombo(combo, registry) {
  const problems = [];
  if (!registry.frameworks[combo.framework]) {
    problems.push(`unknown framework "${combo.framework}"`);
  }
  if (combo.preset !== undefined) {
    const preset = registry.presets[combo.preset];
    if (!preset) problems.push(`unknown preset "${combo.preset}"`);
    else if (preset.framework !== combo.framework) {
      problems.push(
        `preset "${combo.preset}" belongs to ${preset.framework}, not ${combo.framework}`,
      );
    }
  }
  for (const feature of combo.features ?? []) {
    const manifest = registry.features[feature];
    if (!manifest) {
      problems.push(`unknown feature "${feature}"`);
      continue;
    }
    const prefix = feature.split("/")[0];
    if (prefix !== combo.framework && prefix !== "common") {
      problems.push(`feature "${feature}" does not apply to framework "${combo.framework}"`);
    }
  }
  return problems;
}

/** The CLI argv that materialises one combo (generation only, no install/git). */
export function cliArgsFor(combo, target, cli = distCli) {
  const args = [cli, target, "-f", combo.framework, "-y", "--no-install", "--no-git"];
  if (combo.preset !== undefined) args.push("-p", combo.preset);
  if (combo.features?.length) args.push("--features", combo.features.join(","));
  if (combo.monorepo) args.push("--monorepo");
  return args;
}

/** Run one command, appending combined output to `logPath`; never throws. */
function run(label, command, args, cwd, logFd, timeoutMs) {
  process.stdout.write(`    → ${label}\n`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: ["ignore", logFd, logFd],
    timeout: timeoutMs,
    env: process.env,
  });
  if (result.error) return { ok: false, detail: `${label}: ${result.error.message}` };
  if (result.status !== 0) {
    return { ok: false, detail: `${label}: exit ${result.status ?? result.signal ?? "?"}` };
  }
  return { ok: true };
}

function tail(file, lines) {
  if (!existsSync(file)) return "(no log)";
  const content = readFileSync(file, "utf8");
  return content.split("\n").slice(-lines).join("\n");
}

function runCombo(combo, ctx) {
  const started = Date.now();
  const target = join(ctx.scratchRoot, combo.id);
  const logPath = join(ctx.logRoot, `${combo.id}.log`);
  rmSync(target, { recursive: true, force: true });
  rmSync(logPath, { force: true });
  const logFd = openSync(logPath, "a");

  process.stdout.write(
    `\n=== [${combo.id}] ${combo.framework}${combo.preset ? ` preset=${combo.preset}` : ""}${combo.features?.length ? ` features=${combo.features.join(",")}` : ""}${combo.monorepo ? " monorepo" : ""}\n`,
  );

  const steps = [
    ["generate", { command: process.execPath, args: cliArgsFor(combo, target) }],
    [
      "pnpm install",
      { command: "pnpm", args: ["install", "--store-dir", ctx.storeDir, "--prefer-offline"] },
    ],
    ["pnpm run build", { command: "pnpm", args: ["run", "build"] }],
    ["pnpm run check", { command: "pnpm", args: ["run", "check"] }],
  ];

  let failure;
  for (const [label, { command, args }] of steps) {
    const cwd = label === "generate" ? repoRoot : target;
    const result = run(label, command, args, cwd, logFd, ctx.timeoutMs);
    if (!result.ok) {
      failure = result.detail;
      break;
    }
  }

  closeSync(logFd);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  if (failure) {
    process.stdout.write(`--- FAIL ${combo.id} (${seconds}s) — ${failure}\n`);
    process.stdout.write(tail(logPath, 60));
    process.stdout.write(`\n--- end tail (${logPath})\n`);
    return { id: combo.id, ok: false, seconds: Number(seconds), logPath };
  }
  process.stdout.write(`--- PASS ${combo.id} (${seconds}s)\n`);
  return { id: combo.id, ok: true, seconds: Number(seconds), logPath };
}

async function main() {
  const { mode, only } = parseArgs(process.argv.slice(2));

  if (!existsSync(distCli)) {
    process.stderr.write(
      `error: packed CLI not found at ${distCli}\n` + "run: pnpm exec vp -C packages/cli pack\n",
    );
    return 1;
  }

  const scratchRoot = process.env.TIER2_DIR || "/tmp/opencode/tier2";
  const logRoot = join(scratchRoot, "logs");
  mkdirSync(logRoot, { recursive: true });

  const registry = (await import(pathToFileURL(distIndex).href)).loadRegistry();

  let combos = combosFor(mode);
  if (only) {
    // `--only` searches the whole catalog (subset + nightly), not just the mode.
    const wanted = new Set(only);
    combos = combosFor("all").filter((combo) => wanted.has(combo.id));
  }

  // Derive-check every combo id against the runtime registry before running.
  const drift = combos.flatMap((combo) =>
    validateCombo(combo, registry).map((problem) => `  ${combo.id}: ${problem}`),
  );
  if (drift.length > 0) {
    process.stderr.write("error: tier2 combo list drifted from the registry:\n");
    process.stderr.write(`${drift.join("\n")}\n`);
    return 2;
  }

  const ctx = {
    scratchRoot,
    logRoot,
    storeDir: resolveStoreDir(),
    timeoutMs: Number(process.env.TIER2_TIMEOUT_MS || 900000),
  };

  process.stdout.write(
    `Tier-2 matrix (${mode}): ${combos.length} combo(s)\n` +
      `scratch: ${scratchRoot}\nstore:   ${ctx.storeDir}\n`,
  );

  const results = [];
  for (const combo of combos) results.push(runCombo(combo, ctx));

  const width = Math.max(4, ...results.map((entry) => entry.id.length));
  process.stdout.write("\n===== Tier-2 summary =====\n");
  process.stdout.write(`${"combo".padEnd(width)}  result  time\n`);
  for (const entry of results) {
    process.stdout.write(
      `${entry.id.padEnd(width)}  ${(entry.ok ? "PASS" : "FAIL").padEnd(6)}  ${entry.seconds}s\n`,
    );
  }
  const failed = results.filter((entry) => !entry.ok);
  process.stdout.write(
    `\n${results.length - failed.length}/${results.length} passed in ` +
      `${results.reduce((sum, entry) => sum + entry.seconds, 0).toFixed(1)}s\n`,
  );

  return failed.length > 0 ? 1 : 0;
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      process.stderr.write(`tier2-matrix failed: ${error?.stack ?? String(error)}\n`);
      process.exit(1);
    },
  );
}
