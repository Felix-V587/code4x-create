/**
 * Tier-2 combo list ↔ registry drift guard (`docs/06` §7 M11).
 *
 * The blessed combos live in `scripts/tier2-combos.json` and are consumed by
 * `scripts/tier2-matrix.mjs` (the packed-CLI Tier-2 runner). This test asserts
 * every referenced id actually exists in the runtime registry — framework ids,
 * preset ids (and that a preset belongs to its framework) and feature ids — so
 * the list and the registry cannot drift. It also pins the M11 blessed set so a
 * silent removal is caught.
 *
 * Offline: no install, no CLI spawn.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Registry } from "../src/domain/registry.ts";

interface Tier2Combo {
  id: string;
  framework: string;
  preset?: string;
  features?: string[];
}

interface Tier2Catalog {
  subset: Tier2Combo[];
  nightlyOnly: Tier2Combo[];
}

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(resolve(here, "../../../scripts/tier2-combos.json"), "utf8"),
) as Tier2Catalog;

const registry: Registry = loadRegistry();
const allCombos: Tier2Combo[] = [...catalog.subset, ...catalog.nightlyOnly];

// The M11 blessed list (docs/06 §7): subset is the PR lane, nightly adds the
// rest. Pinning the ids keeps an accidental deletion from passing silently.
const M11_SUBSET = ["hono-base", "hono-standard", "vue-base", "vue-naive-tw", "electron-builder"];
const M11_NIGHTLY_ONLY = [
  "hono-full",
  "vue-standard",
  "vue-element-tw",
  "vue-unocss-min",
  "vue-shadcn-tw",
  "electron-base",
];

describe("Tier-2 combo list stays in sync with the registry", () => {
  test("pins the M11 blessed subset and nightly set", () => {
    expect(catalog.subset.map((combo) => combo.id)).toEqual(M11_SUBSET);
    expect(catalog.nightlyOnly.map((combo) => combo.id)).toEqual(M11_NIGHTLY_ONLY);
  });

  test("combo ids are unique across the whole list", () => {
    const ids = allCombos.map((combo) => combo.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every framework id exists in the registry", () => {
    for (const combo of allCombos) {
      expect(
        registry.frameworks[combo.framework],
        `unknown framework: ${combo.framework}`,
      ).toBeDefined();
    }
  });

  test("every preset id exists and belongs to its framework", () => {
    for (const combo of allCombos) {
      if (combo.preset === undefined) continue;
      const preset = registry.presets[combo.preset];
      expect(preset, `unknown preset: ${combo.preset}`).toBeDefined();
      expect(preset?.framework, `preset ${combo.preset} framework`).toBe(combo.framework);
    }
  });

  test("every feature id exists and applies to its framework", () => {
    for (const combo of allCombos) {
      for (const feature of combo.features ?? []) {
        const manifest = registry.features[feature];
        expect(manifest, `unknown feature: ${feature}`).toBeDefined();
        const prefix = feature.split("/")[0];
        expect([combo.framework, "common"], `feature ${feature} framework`).toContain(prefix);
      }
    }
  });
});
