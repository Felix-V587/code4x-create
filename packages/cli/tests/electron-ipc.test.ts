import { describe, expect, test } from "vite-plus/test";

import { resolve } from "../src/domain/resolve.ts";
import { render } from "../src/domain/render.ts";
import { loadRegistry } from "../src/io/loadRegistry.ts";
import type { Answers, VirtualFile } from "../src/domain/types.ts";

const ANSWERS: Answers = {
  targetDir: "./my-app",
  projectName: "my-app",
  framework: "electron",
  features: [],
  packageManager: "pnpm",
  install: false,
  git: true,
};

function generate(): VirtualFile[] {
  const registry = loadRegistry();
  return render(resolve(ANSWERS, registry), registry);
}

function file(files: VirtualFile[], path: string): VirtualFile {
  const found = files.find((entry) => entry.path === path);
  expect(found, path).toBeDefined();
  return found as VirtualFile;
}

/** Channel ids declared in the generated shared table, e.g. `app:ping`. */
function channelsOf(table: string): string[] {
  return [...table.matchAll(/'([a-z]+:[a-z]+)':/g)].map((match) => match[1]);
}

describe("electron typed IPC (M9)", () => {
  test("the shared table emits channels, derived types and an error envelope", () => {
    const table = file(generate(), "src/shared/ipc.ts").contents;
    expect(channelsOf(table)).toEqual(["app:ping", "app:echo"]);
    expect(table).toContain("export type IpcChannel = keyof IpcTable");
    expect(table).toContain("z.infer<IpcTable[C]['args']>");
    expect(table).toContain("z.infer<IpcTable[C]['result']>");
    // Only `message` is modelled in the envelope.
    expect(table).toContain("type IpcEnvelope<T> = { ok: true; data: T }");
    expect(table).toContain("{ ok: false; error: { message: string } }");
  });

  test("preload exposes one narrow function per channel and no raw ipcRenderer", () => {
    const files = generate();
    const channels = channelsOf(file(files, "src/shared/ipc.ts").contents);
    const preload = file(files, "src/preload/index.ts").contents;

    expect(channels.length).toBeGreaterThan(0);
    for (const channel of channels) {
      expect(preload, `missing bridge fn for ${channel}`).toContain(`invoke('${channel}'`);
    }
    // The generic transport stays module-private: nothing exposes `ipcRenderer`
    // or a broad `invoke` onto `window`.
    expect(preload).not.toContain("exposeInMainWorld('ipcRenderer'");
    expect(preload).toContain("contextBridge.exposeInMainWorld('code4x'");
    // Errors are rethrown with only the message crossing the boundary.
    expect(preload).toContain("throw new Error(response.error.message)");
    // Signals the table drives the arg/result types.
    expect(preload).toContain("import type { IpcArgs, IpcChannel, IpcEnvelope, IpcResult }");
  });

  test("the preload bundle imports no Node builtins (Electron 45 pre-adaptation)", () => {
    const preload = file(generate(), "src/preload/index.ts").contents;
    expect(preload).not.toMatch(/from\s+['"]node:/);
    expect(preload).not.toMatch(/require\(\s*['"]node:/);
  });

  test("main registers handlers from the table with args/result validation", () => {
    const files = generate();
    const channels = channelsOf(file(files, "src/shared/ipc.ts").contents);
    const main = file(files, "src/main/index.ts").contents;

    for (const channel of channels) {
      expect(main, `not registered: ${channel}`).toContain(`register('${channel}'`);
    }
    // Validation runs both directions against the shared schemas.
    expect(main).toContain("ipc[channel].args.safeParse(rawArgs)");
    expect(main).toContain("ipc[channel].result.safeParse(");
    expect(main).toContain("'invalid IPC arguments'");
    expect(main).toContain("'invalid IPC result'");
    // Channels are never hard-wired around the table.
    expect(main).not.toContain("ipcMain.handle('app:");
    // Errors become the deliberate envelope (`{ ok: false, error: { message } }`).
    expect(main).toContain("return { ok: false, error: { message } }");
  });

  test("production loads through a privileged app:// protocol with SPA fallback", () => {
    const main = file(generate(), "src/main/index.ts").contents;
    expect(main).toContain("protocol.registerSchemesAsPrivileged([");
    expect(main).toContain("scheme: 'app'");
    expect(main).toContain("standard: true, secure: true, supportFetchAPI: true");
    expect(main).toContain("protocol.handle('app'");
    expect(main).toContain("void window.loadURL('app://./index.html')");
    // SPA fallback: unknown paths resolve to index.html.
    expect(main).toContain("existsSync(target) ? target : join(rendererDir, 'index.html')");
    // Path-traversal guard.
    expect(main).toContain("!target.startsWith(root + sep)");
    // No `file://` loading left in the base.
    expect(main).not.toContain("loadFile(");
  });

  test("the dev URL branch is gated on !app.isPackaged", () => {
    const main = file(generate(), "src/main/index.ts").contents;
    expect(main).toContain("if (!app.isPackaged && rendererUrl) {");
  });

  test("the renderer derives window.code4x types from the shared table", () => {
    const env = file(generate(), "src/renderer/src/env.d.ts").contents;
    expect(env).toContain("import('../../shared/ipc').IpcArgs");
    expect(env).toContain("import('../../shared/ipc').IpcResult");
    expect(env).toContain("ping: () => Promise<IpcResult<'app:ping'>>");
    // The file stays a script so the `*.vue` / `*.css` shims remain ambient.
    expect(env).not.toMatch(/^import /m);
  });
});
