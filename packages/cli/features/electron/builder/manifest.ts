import type { FeatureManifest } from "../../../src/domain/types.ts";

/**
 * `electron/builder` — packaging & installers via electron-builder.
 *
 * Pure packaging: ships an `electron-builder.yml` plus the `dist` / `dist:dir`
 * scripts and the `electron-builder` devDependency. The electron blueprint
 * already emits `dist/main` (CJS, `package.json#main`) and `dist/renderer`, so
 * no wiring is needed.
 */
const builderManifest: FeatureManifest = {
  id: "electron/builder",
  title: "electron-builder",
  description: "Packaging & installers (adds electron-builder)",
  requires: [{ kind: "framework", id: "electron" }],
  defaults: false,
  base: {
    files: [{ src: "files/electron-builder.yml", dest: "electron-builder.yml" }],
    packageJson: {
      devDependencies: { "electron-builder": "^26.15.3" },
      scripts: {
        dist: { set: "vp pack && vp build && electron-builder" },
        "dist:dir": { set: "vp pack && vp build && electron-builder --dir" },
      },
    },
  },
};

export default builderManifest;
