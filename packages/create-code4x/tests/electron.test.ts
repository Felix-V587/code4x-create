import { describe, expect, test } from "vite-plus/test";

import { resolve } from "../src/domain/resolve.ts";
import { render } from "../src/domain/render.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Answers, ProjectContext, VirtualFile } from "../src/domain/types.ts";

const ANSWERS: Answers = {
  targetDir: "./my-app",
  projectName: "my-app",
  framework: "electron",
  features: [],
  packageManager: "pnpm",
  install: false,
  git: true,
};

function generate(context?: ProjectContext): VirtualFile[] {
  const registry = loadRegistry();
  const plan = resolve(ANSWERS, registry, context);
  return render(plan, registry);
}

function file(files: VirtualFile[], path: string): VirtualFile {
  const found = files.find((entry) => entry.path === path);
  expect(found, path).toBeDefined();
  return found as VirtualFile;
}

describe("render / electron base", () => {
  test("file manifest", () => {
    expect(generate().map((entry) => entry.path)).toEqual([
      ".gitignore",
      "README.md",
      "package.json",
      "pnpm-workspace.yaml",
      "scripts/dev.mjs",
      "src/main/index.ts",
      "src/preload/index.ts",
      "src/renderer/index.html",
      "src/renderer/src/App.vue",
      "src/renderer/src/env.d.ts",
      "src/renderer/src/main.ts",
      "src/renderer/src/style.css",
      "tsconfig.json",
      "vite.config.ts",
    ]);
  });

  test("package.json main points at the packed main bundle", () => {
    const pkg = JSON.parse(file(generate(), "package.json").contents) as {
      name: string;
      type: string;
      main: string;
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      pnpm: { onlyBuiltDependencies: string[] };
    };
    expect(pkg.name).toBe("my-app");
    expect(pkg.type).toBe("module");
    expect(pkg.main).toBe("dist/main/index.cjs");
    expect(pkg.scripts).toMatchObject({
      dev: "node scripts/dev.mjs",
      build: "vp pack && vp build",
      start: "electron .",
      typecheck: "vue-tsc --noEmit",
      check: "vp check",
    });
    expect(pkg.dependencies).toEqual({ vue: "^3.5.0" });
    expect(pkg.devDependencies).toMatchObject({
      "@vitejs/plugin-vue": "^6.0.0",
      "@types/node": "^24.0.0",
      electron: "^44.0.0",
      "vite-plus": "^1.1.0",
      "vue-tsc": "^3.0.0",
    });
    // No direct `vite` dep: it would shadow Vite+'s aliased core and break
    // `vp pack`/`vp build`. Vite+ supplies the renderer build toolchain.
    expect(pkg.devDependencies.vite).toBeUndefined();
    expect(pkg.pnpm.onlyBuiltDependencies).toContain("electron");
  });

  test("vite.config.ts wires the renderer root + vp pack bundle + vue() plugin", () => {
    const vite = file(generate(), "vite.config.ts").contents;
    expect(vite).toContain("root: 'src/renderer'");
    expect(vite).toContain("base: './'");
    expect(vite).toContain("outDir: '../../dist/renderer'");
    expect(vite).toContain("vue(),");
    expect(vite).toContain("'main/index': 'src/main/index.ts'");
    expect(vite).toContain("'preload/index': 'src/preload/index.ts'");
    expect(vite).toContain("format: ['cjs']");
    expect(vite).toContain("neverBundle: ['electron']");
    expect(vite).not.toContain("@code4x");
  });

  test("main process uses a sandboxed preload and the dev URL env var", () => {
    const main = file(generate(), "src/main/index.ts").contents;
    expect(main).toContain("preload: join(__dirname, '../preload/index.cjs')");
    expect(main).toContain("contextIsolation: true");
    expect(main).toContain("sandbox: true");
    expect(main).toContain("nodeIntegration: false");
    expect(main).toContain("process.env.ELECTRON_RENDERER_URL");
    expect(main).toContain("import { app, BrowserWindow, ipcMain, shell } from 'electron'");
    expect(main).toContain("ipcMain.handle('app:ping'");
    expect(main).not.toContain("@code4x");
  });

  test("preload exposes a narrow contextBridge API, never raw ipcRenderer", () => {
    const preload = file(generate(), "src/preload/index.ts").contents;
    expect(preload).toContain("contextBridge.exposeInMainWorld('code4x'");
    expect(preload).toContain("ipcRenderer.invoke('app:ping')");
    expect(preload).not.toContain("exposeInMainWorld('ipcRenderer'");
  });

  test("ships a pnpm workspace allowBuilds for esbuild and electron", () => {
    expect(file(generate(), "pnpm-workspace.yaml").contents).toBe(
      "allowBuilds:\n  esbuild: true\n  electron: true\n",
    );
  });

  test("renderer index.html is CSP-guarded and titled with the project name", () => {
    const html = file(generate(), "src/renderer/index.html").contents;
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("ws://localhost:5173");
    expect(html).toContain("<title>my-app</title>");
    expect(html).not.toContain("{PROJECT}");
  });

  test("no assembly markers leak into generated files", () => {
    for (const entry of generate()) {
      expect(entry.contents).not.toContain("@code4x");
    }
  });

  test("nested workspace suppresses pnpm-workspace.yaml", () => {
    const files = generate({ nestedWorkspace: true, pmFrom: "default" });
    expect(files.some((entry) => entry.path === "pnpm-workspace.yaml")).toBe(false);
    expect(files.some((entry) => entry.path === "package.json")).toBe(true);
  });

  test("rendering is idempotent", () => {
    const first = generate();
    const second = generate();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
