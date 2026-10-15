/**
 * Registry loader — the only place that reads template assets from disk.
 *
 * Path resolution is deliberately pragmatic: we walk up from the module's own
 * directory until we find `templates/<framework>/files`, which works for all
 * three runtime shapes:
 *   - vitest running source (`src/io` -> repo-root `templates`)
 *   - the `vp pack` output (`dist` -> bundled `dist/templates`)
 *   - a locally-linked `bin` (same as the packed output)
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { FeatureManifest, FrameworkBlueprint } from "../domain/types.ts";
import {
  type Preset,
  type Registry,
  type RuntimeAssembly,
  type RuntimeBlueprint,
} from "../domain/registry.ts";
import electronBlueprint from "../../templates/electron/blueprint.ts";
import honoBlueprint from "../../templates/hono/blueprint.ts";
import vueBlueprint from "../../templates/vue/blueprint.ts";
import zodManifest from "../../features/hono/zod/manifest.ts";
import apiGuardManifest from "../../features/hono/api-guard/manifest.ts";
import swaggerOpenapiManifest from "../../features/hono/swagger-openapi/manifest.ts";
import envManifest from "../../features/hono/env/manifest.ts";
import testingManifest from "../../features/hono/testing/manifest.ts";
import loggingManifest from "../../features/hono/logging/manifest.ts";
import httpHardeningManifest from "../../features/hono/http-hardening/manifest.ts";
import piniaManifest from "../../features/vue/pinia/manifest.ts";
import routerManifest from "../../features/vue/router/manifest.ts";
import vueuseManifest from "../../features/vue/vueuse/manifest.ts";
import vueuseRouterManifest from "../../features/vue/vueuse-router/manifest.ts";
import i18nManifest from "../../features/vue/i18n/manifest.ts";
import queryManifest from "../../features/vue/query/manifest.ts";
import coladaManifest from "../../features/vue/colada/manifest.ts";
import vueTestingManifest from "../../features/vue/testing/manifest.ts";
import tailwindManifest from "../../features/vue/tailwind/manifest.ts";
import unocssManifest from "../../features/vue/unocss/manifest.ts";
import naiveUiManifest from "../../features/vue/naive-ui/manifest.ts";
import elementPlusManifest from "../../features/vue/element-plus/manifest.ts";
import builderManifest from "../../features/electron/builder/manifest.ts";

const FRAMEWORK_BLUEPRINTS: FrameworkBlueprint[] = [electronBlueprint, honoBlueprint, vueBlueprint];

/** Implemented feature manifests, keyed by id at load time. */
const FEATURE_MANIFESTS: FeatureManifest[] = [
  zodManifest,
  apiGuardManifest,
  swaggerOpenapiManifest,
  envManifest,
  testingManifest,
  loggingManifest,
  httpHardeningManifest,
  piniaManifest,
  routerManifest,
  vueuseManifest,
  vueuseRouterManifest,
  i18nManifest,
  queryManifest,
  coladaManifest,
  vueTestingManifest,
  tailwindManifest,
  unocssManifest,
  naiveUiManifest,
  elementPlusManifest,
  builderManifest,
];

export function findTemplatesRoot(
  startDir: string = dirname(fileURLToPath(import.meta.url)),
): string {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, "templates");
    if (existsSync(join(candidate, "hono", "files"))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate "templates" directory starting from ${startDir}`);
}

/** `features/` lives next to `templates/` (repo root, or `dist/` after pack). */
export function findFeaturesRoot(): string {
  const features = join(dirname(findTemplatesRoot()), "features");
  if (existsSync(features)) return features;
  throw new Error(`could not locate "features" directory at ${features}`);
}

export function loadRegistry(
  templatesRoot: string = findTemplatesRoot(),
  featuresRoot: string = join(dirname(templatesRoot), "features"),
): Registry {
  const assets: Record<string, string> = {};
  const frameworks: Record<string, RuntimeBlueprint> = {};
  const features: Record<string, FeatureManifest> = {};

  for (const blueprint of FRAMEWORK_BLUEPRINTS) {
    const filesDir = join(templatesRoot, blueprint.id, "files");
    for (const relative of walk(filesDir)) {
      assets[`${blueprint.id}/files/${relative}`] = readFileSync(join(filesDir, relative), "utf8");
    }

    const assembly: RuntimeAssembly[] = blueprint.assembly.map((spec) => {
      const key = `${blueprint.id}/${spec.skeleton}`;
      const skeleton = assets[key];
      if (skeleton === undefined) {
        throw new Error(`missing skeleton "${key}"`);
      }
      return { path: spec.path, anchors: spec.anchors, skeleton };
    });

    frameworks[blueprint.id] = {
      id: blueprint.id,
      title: blueprint.title,
      assembly,
      static: blueprint.static,
    };
  }

  for (const manifest of FEATURE_MANIFESTS) {
    features[manifest.id] = manifest;
    // Asset keys match the renderer convention `${featureId}/${src}`; the
    // manifest module itself is code, not an asset.
    const dir = join(featuresRoot, manifest.id);
    for (const relative of walk(dir)) {
      if (relative === "manifest.ts") continue;
      assets[`${manifest.id}/${relative}`] = readFileSync(join(dir, relative), "utf8");
    }
  }

  const presets: Record<string, Preset> = {
    "hono-api": {
      id: "hono-api",
      framework: "hono",
      features: ["hono/api-guard", "hono/zod", "hono/swagger-openapi"],
    },
    "hono-standard": {
      id: "hono-standard",
      framework: "hono",
      features: ["hono/api-guard", "hono/zod", "hono/testing"],
    },
    "hono-full": {
      id: "hono-full",
      framework: "hono",
      features: [
        "hono/api-guard",
        "hono/zod",
        "hono/testing",
        "hono/swagger-openapi",
        "hono/logging",
        "hono/http-hardening",
      ],
    },
    "vue-full": {
      id: "vue-full",
      framework: "vue",
      features: ["vue/router", "vue/pinia", "vue/vueuse", "vue/i18n", "vue/query", "vue/testing"],
    },
    "vue-standard": {
      id: "vue-standard",
      framework: "vue",
      features: ["vue/router", "vue/pinia", "vue/vueuse", "vue/i18n"],
    },
    "vue-naive-tw": {
      id: "vue-naive-tw",
      framework: "vue",
      features: [
        "vue/router",
        "vue/pinia",
        "vue/vueuse",
        "vue/i18n",
        "vue/naive-ui",
        "vue/tailwind",
      ],
    },
    "vue-element-tw": {
      id: "vue-element-tw",
      framework: "vue",
      features: [
        "vue/router",
        "vue/pinia",
        "vue/vueuse",
        "vue/i18n",
        "vue/element-plus",
        "vue/tailwind",
      ],
    },
    "vue-unocss-min": {
      id: "vue-unocss-min",
      framework: "vue",
      features: ["vue/router", "vue/pinia", "vue/unocss"],
    },
  };

  return {
    frameworks,
    features,
    presets,
    assets,
  };
}

function walk(root: string, prefix = ""): string[] {
  const entries = readdirSync(join(root, prefix), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...walk(root, relative));
    else files.push(relative);
  }
  return files;
}
