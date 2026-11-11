/**
 * Workspace-level environment wiring.
 *
 * A generated monorepo/full-stack workspace keeps one `.env` at the root:
 *   - Vite apps read it through `envDir: '../../'` (so `VITE_*` values work in
 *     dev *and* production builds);
 *   - the Hono app reads `PORT` / `LOG_LEVEL` through `loadEnv()` when its Vite
 *     config loads, and the production start script uses `node --env-file`.
 *
 * The root `.env` is generated with safe defaults and ignored by git; the
 * tracked `.env.example` documents the knobs.
 */

import { lines, patchPackageJson, patchText } from "./patch.ts";
import type { VirtualFile } from "./types.ts";

const ENV_BODY = lines(
  "# Workspace-level environment (also loaded by Vite apps via envDir).",
  "# API",
  "PORT=3000",
  "LOG_LEVEL=info",
  "",
  "# Web: dev-server proxy target for /api.",
  "API_DEV_PROXY=http://localhost:3000",
  "",
  "# Web: API base URL. Keep /api for a same-origin reverse proxy, or set an",
  "# absolute origin such as https://api.example.com/api for a split deployment.",
  "VITE_API_BASE_URL=/api",
);

export function workspaceEnvFiles(): VirtualFile[] {
  return [
    { path: ".env", contents: ENV_BODY, source: "base" },
    {
      path: ".env.example",
      contents: `${lines(
        "# Copy to .env and adjust for this workspace.",
        "# API",
        "PORT=3000",
        "LOG_LEVEL=info",
        "",
        "# Web: dev-server proxy target for /api.",
        "API_DEV_PROXY=http://localhost:3000",
        "",
        "# Web: API base URL. Keep /api for a same-origin reverse proxy, or set an",
        "# absolute origin such as https://api.example.com/api for a split deployment.",
        "VITE_API_BASE_URL=/api",
      )}`,
      source: "base",
    },
  ];
}

/** Hono config reads the root `.env`; production start loads it too. */
export function patchHonoWorkspaceEnv(files: VirtualFile[], appPath: string): void {
  const config = `${appPath}/vite.config.ts`;
  patchText(
    files,
    config,
    "import { defineConfig } from 'vite-plus'",
    lines("import { defineConfig, loadEnv } from 'vite-plus'"),
  );
  patchText(
    files,
    config,
    "const port = Number(process.env.PORT ?? 3000)",
    lines(
      "const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development'",
      "const env = loadEnv(mode, '../../', '')",
      "process.env.LOG_LEVEL ??= env.LOG_LEVEL",
      "const port = Number(process.env.PORT ?? env.PORT ?? 3000)",
    ),
  );
  patchPackageJson(files, `${appPath}/package.json`, (pkg) => {
    const scripts = (pkg.scripts as Record<string, string> | undefined) ?? {};
    if (scripts.start === "node dist/index.js") {
      scripts.start = "node --env-file=../../.env dist/index.js";
    }
    pkg.scripts = scripts;
  });
}

/**
 * Vue config loads the root `.env` and proxies `/api` to the backend.
 * `rewrite` strips the `/api` prefix for backends that do not mount it
 * (standard Hono apps); full-stack API mounts `/api/...` itself.
 */
export function patchVueWorkspaceEnv(
  files: VirtualFile[],
  appPath: string,
  options: { rewrite: boolean },
): void {
  const config = `${appPath}/vite.config.ts`;
  patchText(
    files,
    config,
    "import { defineConfig, lazyPlugins } from 'vite-plus'",
    lines(
      "import { defineConfig, lazyPlugins, loadEnv } from 'vite-plus'",
      "",
      "const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development'",
      "const env = loadEnv(mode, '../../', '')",
      "const apiTarget =",
      "  process.env.API_DEV_PROXY ??",
      "  env.API_DEV_PROXY ??",
      "  `http://localhost:${process.env.PORT ?? env.PORT ?? 3000}`",
    ),
  );
  patchText(
    files,
    config,
    "export default defineConfig({",
    lines("export default defineConfig({", "  envDir: '../../',"),
  );
  const rewrite = options.rewrite
    ? ["        rewrite: (path) => path.replace(/^\\/api/, ''),"]
    : [];
  patchText(
    files,
    config,
    "  plugins: lazyPlugins(() => [",
    lines(
      "  server: {",
      "    // `/api` 转发到后端；目标来自 workspace 根 .env 的 API_DEV_PROXY。",
      "    proxy: {",
      "      '/api': {",
      "        target: apiTarget,",
      "        changeOrigin: true,",
      ...rewrite,
      "      },",
      "    },",
      "  },",
      "  plugins: lazyPlugins(() => [",
    ),
  );
}
