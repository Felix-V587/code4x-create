/**
 * Full-stack workspace scaffold: shared-types package, runnable examples and
 * AGENTS.md guides.
 *
 * `fullstack.ts` owns orchestration (fixed apps, root files). This module owns
 * the opinionated sample code that turns the three generated apps into one
 * working vertical slice:
 *
 *   packages/shared-types  <- Todo / ApiError shapes (single source of truth)
 *   apps/api               <- GET/POST /todos, typed by shared-types
 *   apps/web               <- Home.vue calls /api/todos through Alova
 *   apps/desktop           <- app:todo IPC channel returning a shared Todo
 *
 * Every patch asserts its anchor so template drift fails generation instead of
 * silently producing a half-wired workspace.
 */

import { fail } from "./errors.ts";
import type { VirtualFile } from "./types.ts";

export interface FullstackScaffoldOptions {
  workspaceName: string;
  /** Root `vite-plus` range (also used by the shared package). */
  vitePlus: string;
}

/**
 * `@scope/shared-types` from the workspace package name. A scoped workspace
 * (`@acme/stack`) keeps its scope; an unscoped one (`my-stack`) becomes
 * `@my-stack/shared-types`.
 */
export function sharedTypesPackageName(workspaceName: string): string {
  const scope = workspaceName.startsWith("@")
    ? workspaceName.slice(1).split("/")[0]
    : workspaceName;
  return `@${scope}/shared-types`;
}

/**
 * Patch the rendered apps and append the workspace scaffold. The caller adds
 * root files afterwards (and sorts everything).
 */
export function applyFullstackScaffold(
  files: VirtualFile[],
  options: FullstackScaffoldOptions,
): void {
  const shared = sharedTypesPackageName(options.workspaceName);

  for (const app of ["api", "web", "desktop"]) {
    patchPackageJson(files, `apps/${app}/package.json`, (pkg) => {
      const dependencies = (pkg.dependencies as Record<string, string> | undefined) ?? {};
      dependencies[shared] = "workspace:*";
      pkg.dependencies = dependencies;
    });
  }

  patchApi(files);
  patchWeb(files, shared);
  patchDesktop(files, shared);

  files.push(
    ...sharedTypesFiles(shared, options.vitePlus),
    {
      path: "apps/api/src/routes/todos.ts",
      contents: renderApiTodos(shared),
      source: "fullstack",
    },
    {
      path: "apps/api/src/routes/todos.test.ts",
      contents: renderApiTodosTest(shared),
      source: "fullstack",
    },
    {
      path: "AGENTS.md",
      contents: renderRootAgents(options.workspaceName, shared),
      source: "fullstack",
    },
    {
      path: "apps/api/AGENTS.md",
      contents: renderApiAgents(shared),
      source: "fullstack",
    },
    {
      path: "apps/web/AGENTS.md",
      contents: renderWebAgents(shared),
      source: "fullstack",
    },
    {
      path: "apps/desktop/AGENTS.md",
      contents: renderDesktopAgents(shared),
      source: "fullstack",
    },
    {
      path: "packages/shared-types/AGENTS.md",
      contents: renderSharedTypesAgents(),
      source: "fullstack",
    },
  );
}

// --------------------------------------------------------------------------
// app patches
// --------------------------------------------------------------------------

function patchApi(files: VirtualFile[]): void {
  patchText(
    files,
    "apps/api/src/index.ts",
    "import { health } from './routes/health'",
    `import { health } from './routes/health'\nimport { todos } from './routes/todos'`,
  );
  patchText(
    files,
    "apps/api/src/index.ts",
    "app.route('/', health)",
    "app.route('/', health)\napp.route('/todos', todos)",
  );
}

function patchWeb(files: VirtualFile[], shared: string): void {
  replaceFile(
    files,
    "apps/web/src/api/todos.ts",
    lines(
      `import type { Todo } from '${shared}'`,
      "import { alova } from '@/lib/alova'",
      "",
      "/** 类型化 GET；Todo 形状来自 packages/shared-types。 */",
      "export const listTodos = () => alova.Get<Todo[]>('/todos')",
    ),
  );

  replaceFile(
    files,
    "apps/web/src/views/Home.vue",
    lines(
      '<script setup lang="ts">',
      "import { useTodos } from '@/composables/useTodos'",
      "",
      "const { data, loading, error, send } = useTodos()",
      "void send()",
      "</script>",
      "",
      "<template>",
      "  <section>",
      "    <h1>Home</h1>",
      "    <p>",
      "      Todos are served by <code>apps/api</code> and typed by <code>packages/shared-types</code>.",
      "    </p>",
      '    <button type="button" :disabled="loading" @click="send()">Refresh</button>',
      '    <p v-if="loading">Loading…</p>',
      '    <p v-else-if="error">Request failed: {{ error.message }}</p>',
      '    <ul v-else-if="data">',
      "      <li v-for=\"todo in data\" :key=\"todo.id\">{{ todo.done ? '✓' : '○' }} {{ todo.title }}</li>",
      "    </ul>",
      "  </section>",
      "</template>",
    ),
  );

  patchText(
    files,
    "apps/web/vite.config.ts",
    "  plugins: lazyPlugins(() => [",
    lines(
      "  server: {",
      "    // Alova 默认请求 `/api`；开发时转发到 apps/api（3000）。",
      "    proxy: {",
      "      '/api': {",
      "        target: 'http://localhost:3000',",
      "        changeOrigin: true,",
      "        rewrite: (path) => path.replace(/^\\/api/, ''),",
      "      },",
      "    },",
      "  },",
      "  plugins: lazyPlugins(() => [",
    ),
  );
}

function patchDesktop(files: VirtualFile[], shared: string): void {
  patchText(
    files,
    "apps/desktop/src/shared/ipc.ts",
    "import { z } from 'zod'",
    lines(`import type { Todo } from '${shared}'`, "import { z } from 'zod'"),
  );
  patchText(
    files,
    "apps/desktop/src/shared/ipc.ts",
    "/**\n * 渲染进程与主进程之间 IPC 接口的唯一事实来源。",
    lines(
      "/** 示例：IPC 结果形状由 shared-types 的 Todo 在编译期约束。 */",
      "const SampleTodoSchema: z.ZodType<Todo> = z.object({",
      "  id: z.string(),",
      "  title: z.string(),",
      "  done: z.boolean(),",
      "  createdAt: z.string(),",
      "})",
      "",
      "/**",
      " * 渲染进程与主进程之间 IPC 接口的唯一事实来源。",
    ),
  );
  patchText(
    files,
    "apps/desktop/src/shared/ipc.ts",
    "  'app:echo': { args: z.tuple([z.string().min(1)]), result: z.string() },",
    lines(
      "  'app:echo': { args: z.tuple([z.string().min(1)]), result: z.string() },",
      "  'app:todo': { args: z.tuple([]), result: SampleTodoSchema },",
    ),
  );

  patchText(
    files,
    "apps/desktop/src/main/index.ts",
    "    register('app:echo', (args) => args[0])",
    lines(
      "    register('app:echo', (args) => args[0])",
      "    // 示例：返回 shared-types 的 Todo 形状（结果由共享 schema 校验）。",
      "    register('app:todo', () => ({",
      "      id: 'todo-1',",
      "      title: 'Try the shared Todo type',",
      "      done: false,",
      "      createdAt: new Date().toISOString(),",
      "    }))",
    ),
  );

  patchText(
    files,
    "apps/desktop/src/preload/index.ts",
    lines(
      "  echo: (...args: IpcArgs<'app:echo'>): Promise<IpcResult<'app:echo'>> =>",
      "    invoke('app:echo', ...args),",
      "}",
    ),
    lines(
      "  echo: (...args: IpcArgs<'app:echo'>): Promise<IpcResult<'app:echo'>> =>",
      "    invoke('app:echo', ...args),",
      "  todo: (): Promise<IpcResult<'app:todo'>> => invoke('app:todo'),",
      "}",
    ),
  );

  patchText(
    files,
    "apps/desktop/src/renderer/src/env.d.ts",
    "  echo: (...args: IpcArgs<'app:echo'>) => Promise<IpcResult<'app:echo'>>",
    lines(
      "  echo: (...args: IpcArgs<'app:echo'>) => Promise<IpcResult<'app:echo'>>",
      "  todo: () => Promise<IpcResult<'app:todo'>>",
    ),
  );

  patchText(
    files,
    "apps/desktop/src/renderer/src/App.vue",
    "import { ref } from 'vue'",
    lines("import { ref } from 'vue'", `import type { Todo } from '${shared}'`),
  );
  patchText(
    files,
    "apps/desktop/src/renderer/src/App.vue",
    "const error = ref('')",
    lines("const error = ref('')", "const todo = ref<Todo | null>(null)"),
  );
  patchText(
    files,
    "apps/desktop/src/renderer/src/App.vue",
    lines("async function echo() {", "  error.value = ''", "  echoOutput.value = ''"),
    lines(
      "async function loadTodo() {",
      "  error.value = ''",
      "  todo.value = await api.todo()",
      "}",
      "",
      "async function echo() {",
      "  error.value = ''",
      "  echoOutput.value = ''",
    ),
  );
  patchText(
    files,
    "apps/desktop/src/renderer/src/App.vue",
    '    <p v-if="error">error: {{ error }}</p>',
    lines(
      '    <button type="button" @click="loadTodo">Load shared Todo</button>',
      "    <p v-if=\"todo\">todo: {{ todo.title }} ({{ todo.done ? 'done' : 'open' }})</p>",
      '    <p v-if="error">error: {{ error }}</p>',
    ),
  );
}

// --------------------------------------------------------------------------
// generated files
// --------------------------------------------------------------------------

function sharedTypesFiles(shared: string, vitePlus: string): VirtualFile[] {
  return [
    {
      path: "packages/shared-types/package.json",
      contents: `${JSON.stringify(
        {
          name: shared,
          version: "0.0.0",
          private: true,
          type: "module",
          main: "./dist/index.mjs",
          types: "./src/index.ts",
          exports: {
            ".": {
              types: "./src/index.ts",
              import: "./dist/index.mjs",
            },
          },
          files: ["dist", "src"],
          scripts: {
            build: "vp pack",
            dev: "vp pack --watch",
            typecheck: "tsc --noEmit",
            check: "vp check",
          },
          devDependencies: {
            typescript: "^5.9.0",
            "vite-plus": vitePlus,
          },
          engines: { node: ">=22" },
        },
        null,
        2,
      )}\n`,
      source: "fullstack",
    },
    {
      path: "packages/shared-types/tsconfig.json",
      contents: lines(
        "{",
        '  "compilerOptions": {',
        '    "target": "esnext",',
        '    "module": "esnext",',
        '    "moduleResolution": "bundler",',
        '    "lib": ["es2023"],',
        '    "types": [],',
        '    "strict": true,',
        '    "skipLibCheck": true,',
        '    "noEmit": true,',
        '    "verbatimModuleSyntax": true',
        "  },",
        '  "include": ["src", "vite.config.ts"]',
        "}",
      ),
      source: "fullstack",
    },
    {
      path: "packages/shared-types/vite.config.ts",
      contents: lines(
        "import { defineConfig } from 'vite-plus'",
        "",
        "export default defineConfig({",
        "  pack: {",
        "    entry: ['src/index.ts'],",
        "    dts: true,",
        "    // 不让 tsdown 改写 package.json 的 exports（由本模板显式维护）。",
        "    exports: false,",
        "  },",
        "  lint: {",
        "    ignorePatterns: ['dist/**'],",
        "    options: { typeAware: true, typeCheck: true },",
        "  },",
        "  fmt: {",
        "    singleQuote: true,",
        "    semi: false,",
        "    sortPackageJson: false,",
        "    ignorePatterns: ['dist/**'],",
        "  },",
        "})",
      ),
      source: "fullstack",
    },
    {
      path: "packages/shared-types/src/index.ts",
      contents: lines(
        "/**",
        " * 全栈示例的共享领域类型。",
        " *",
        " * `apps/api`、`apps/web`、`apps/desktop` 都从这里导入类型，",
        " * 因此接口形状只维护一次。",
        " */",
        "",
        "/** 统一的 API 错误信封（与 apps/api 的 onError / notFound 一致）。 */",
        "export interface ApiError {",
        "  code: string",
        "  message: string",
        "  details?: unknown",
        "  requestId?: string",
        "}",
        "",
        "/** Todo 领域模型。 */",
        "export interface Todo {",
        "  id: string",
        "  title: string",
        "  done: boolean",
        "  createdAt: string",
        "}",
        "",
        "/** POST /todos 请求体。 */",
        "export interface CreateTodoInput {",
        "  title: string",
        "}",
        "",
        "/** GET /healthz、GET /readyz 的响应。 */",
        "export type HealthStatus =",
        "  | { status: 'ok' }",
        "  | { status: 'ready' }",
        "  | { status: 'unavailable'; error: string }",
      ),
      source: "fullstack",
    },
    {
      path: "packages/shared-types/README.md",
      contents: lines(
        `# ${shared}`,
        "",
        "全栈示例的共享 TypeScript 类型（`Todo` / `CreateTodoInput` / `ApiError` / `HealthStatus`）。",
        "",
        "## 使用",
        "",
        "```ts",
        `import type { Todo } from '${shared}'`,
        "```",
        "",
        "类型从 `src/index.ts` 直接解析，因此 `pnpm check` 不依赖构建产物；",
        "`pnpm build` 通过 `vp pack` 在 `dist/` 生成运行时入口与声明文件。",
        "",
        "## 命令",
        "",
        "- `pnpm --filter ./packages/shared-types build`",
        "- `pnpm --filter ./packages/shared-types typecheck`",
        "- `pnpm --filter ./packages/shared-types check`",
      ),
      source: "fullstack",
    },
  ];
}

function renderApiTodos(shared: string): string {
  return lines(
    "import { zValidator } from '@hono/zod-validator'",
    "import { Hono } from 'hono'",
    "import { z } from 'zod'",
    `import type { CreateTodoInput, Todo } from '${shared}'`,
    "import { validationHook } from '../http/validation'",
    "",
    "/** 用共享类型约束 zod schema：字段漂移会在编译期暴露。 */",
    "const CreateTodoSchema: z.ZodType<CreateTodoInput> = z.object({",
    "  title: z.string().min(1),",
    "})",
    "",
    "const todosStore: Todo[] = [",
    "  {",
    "    id: 'todo-1',",
    "    title: 'Read AGENTS.md',",
    "    done: true,",
    "    createdAt: '2026-01-01T00:00:00.000Z',",
    "  },",
    "  {",
    "    id: 'todo-2',",
    "    title: 'Call GET /todos from the web app',",
    "    done: false,",
    "    createdAt: '2026-01-02T00:00:00.000Z',",
    "  },",
    "]",
    "",
    "/** 示例 CRUD：内存存储，重启即重置。 */",
    "export const todos = new Hono()",
    "  .get('/', (c) => c.json(todosStore))",
    "  .post('/', zValidator('json', CreateTodoSchema, validationHook), (c) => {",
    "    const input = c.req.valid('json')",
    "    const todo: Todo = {",
    "      id: crypto.randomUUID(),",
    "      title: input.title,",
    "      done: false,",
    "      createdAt: new Date().toISOString(),",
    "    }",
    "    todosStore.push(todo)",
    "    return c.json(todo, 201)",
    "  })",
  );
}

function renderApiTodosTest(shared: string): string {
  return lines(
    "import { describe, expect, test } from 'vite-plus/test'",
    `import type { Todo } from '${shared}'`,
    "import app from '../index'",
    "",
    "describe('todos route (sample)', () => {",
    "  test('GET /todos returns the seeded list', async () => {",
    "    const response = await app.request('/todos')",
    "    expect(response.status).toBe(200)",
    "    const body = (await response.json()) as Todo[]",
    "    expect(body.length).toBeGreaterThan(0)",
    "    expect(body[0]).toMatchObject({",
    "      id: expect.any(String),",
    "      title: expect.any(String),",
    "      done: expect.any(Boolean),",
    "    })",
    "  })",
    "",
    "  test('POST /todos validates and appends', async () => {",
    "    const response = await app.request('/todos', {",
    "      method: 'POST',",
    "      headers: { 'content-type': 'application/json' },",
    "      body: JSON.stringify({ title: 'Write a test' }),",
    "    })",
    "    expect(response.status).toBe(201)",
    "    const body = (await response.json()) as Todo",
    "    expect(body.title).toBe('Write a test')",
    "  })",
    "})",
  );
}

function renderRootAgents(workspaceName: string, shared: string): string {
  return lines(
    `# ${workspaceName} — AGENTS`,
    "",
    "这是 create-code4x 生成的全栈单仓库（Vite+ / pnpm workspace）。",
    "修改任何子项目前，先阅读对应目录的 `AGENTS.md`。",
    "",
    "## 目录",
    "",
    "- `apps/api` — Hono API（hono-full：zod 校验、OpenAPI 文档、pino 日志、HTTP hardening、Vitest、Vite+ 构建）",
    "- `apps/web` — Vue 3 前端（Vue Router / Pinia / VueUse / Alova / Reka UI / UnoCSS）",
    "- `apps/desktop` — Electron 桌面壳（Vue 渲染层 + zod IPC + electron-builder）",
    `- \`packages/shared-types\` — 共享领域类型 \`${shared}\``,
    "",
    "## 常用命令",
    "",
    "```bash",
    "pnpm install",
    "pnpm dev        # vp run -r --parallel dev",
    "pnpm build      # vp run -r build（依赖顺序）",
    "pnpm check      # vp check（整仓格式化 + lint + 类型检查）",
    "pnpm test       # vp run -r test",
    "```",
    "",
    "单独操作某个子项目：",
    "",
    "```bash",
    "pnpm --filter ./apps/api dev",
    "pnpm --filter ./apps/web build",
    "pnpm --filter ./packages/shared-types build",
    "```",
    "",
    "## 协作规则",
    "",
    "- 共享数据结构先改 `packages/shared-types`，再同步 api / web / desktop 的使用处。",
    "- 不要编辑 `dist/`、`release/` 等构建产物；改源码后重新构建。",
    "- 新增依赖用 `pnpm add`（在对应子项目目录内），不要手写 `node_modules` 路径。",
    "- 提交前至少运行 `pnpm check`；涉及运行时行为时再运行 `pnpm test`。",
    "- 跨进程通信（Electron）只走 `src/shared/ipc.ts` 的通道表。",
    "",
    "## 参考文档（llms.txt）",
    "",
    "- Vite+ — https://viteplus.dev/llms.txt",
    "- Vite — https://vite.dev/llms.txt",
    "- Vitest — https://vitest.dev/llms.txt",
    "- Node.js — https://nodejs.org/llms.txt",
    "- pnpm — https://pnpm.io/（暂无 llms.txt）",
    "- TypeScript — https://www.typescriptlang.org/docs/（暂无 llms.txt）",
  );
}

function renderApiAgents(shared: string): string {
  return lines(
    "# apps/api — Hono API",
    "",
    "本目录是 workspace 的 API 服务，入口 `src/index.ts`，默认端口 3000。",
    "",
    "## 命令",
    "",
    "```bash",
    "pnpm --filter ./apps/api dev",
    "pnpm --filter ./apps/api build",
    "pnpm --filter ./apps/api start",
    "pnpm --filter ./apps/api check",
    "pnpm --filter ./apps/api test",
    "```",
    "",
    "## 约定",
    "",
    "- 路由放 `src/routes/*`，在 `src/index.ts` 用 `app.route()` 注册。",
    "- 请求校验用 `zValidator` + `src/http/validation.ts` 的 `validationHook`；",
    "  错误响应统一为 `{ code, message, details?, requestId }`。",
    `- 领域类型从 \`${shared}\` 导入（\`import type\`），不要重复定义。`,
    "- 示例：`GET /todos` / `POST /todos`（`src/routes/todos.ts`）。",
    "- 预设 `hono-full` 额外提供 `/docs`（Swagger UI）、`/openapi.json`、pino 日志与 timeout/body-limit/compress。",
    "",
    "## 参考文档（llms.txt）",
    "",
    "- Hono — https://hono.dev/llms.txt",
    "- Zod — https://zod.dev/llms.txt",
    "- Vite+ — https://viteplus.dev/llms.txt",
    "- Vite — https://vite.dev/llms.txt",
    "- Vitest — https://vitest.dev/llms.txt",
    "- Node.js — https://nodejs.org/llms.txt",
  );
}

function renderWebAgents(shared: string): string {
  return lines(
    "# apps/web — Vue 3 前端",
    "",
    "本目录是 workspace 的浏览器前端，默认端口 5175，`/api` 代理到 apps/api（3000）。",
    "",
    "## 命令",
    "",
    "```bash",
    "pnpm --filter ./apps/web dev",
    "pnpm --filter ./apps/web build",
    "pnpm --filter ./apps/web preview",
    "pnpm --filter ./apps/web typecheck",
    "pnpm --filter ./apps/web check",
    "pnpm --filter ./apps/web test",
    "```",
    "",
    "## 约定",
    "",
    "- 页面放 `src/views`，路由表在 `src/router/index.ts`。",
    "- 请求统一走 `src/lib/alova.ts`；示例 `src/api/todos.ts` + `src/composables/useTodos.ts`。",
    `- 领域类型从 \`${shared}\` 导入（\`import type\`），不要重复定义。`,
    "- UI 原语优先用 Reka UI；样式用 UnoCSS。",
    "- `src/App.test.ts` 是 Vitest + Vue Test Utils 示例。",
    "",
    "## 参考文档（llms.txt）",
    "",
    "- Vue — https://vuejs.org/llms.txt",
    "- Vue Router — https://router.vuejs.org/llms.txt",
    "- Pinia — https://pinia.vuejs.org/llms.txt",
    "- VueUse — https://vueuse.org/llms.txt",
    "- Alova — https://alova.js.org/llms.txt",
    "- Reka UI — https://reka-ui.com/llms.txt",
    "- UnoCSS — https://unocss.dev/llms.txt",
    "- Vite+ — https://viteplus.dev/llms.txt",
    "- Vite — https://vite.dev/llms.txt",
    "- Vitest — https://vitest.dev/llms.txt",
  );
}

function renderDesktopAgents(shared: string): string {
  return lines(
    "# apps/desktop — Electron 桌面壳",
    "",
    "本目录是 workspace 的 Electron 应用：Vue 渲染层 + 类型化 IPC + electron-builder。",
    "",
    "## 命令",
    "",
    "```bash",
    "pnpm --filter ./apps/desktop dev",
    "pnpm --filter ./apps/desktop build",
    "pnpm --filter ./apps/desktop start",
    "pnpm --filter ./apps/desktop dist",
    "pnpm --filter ./apps/desktop dist:dir",
    "pnpm --filter ./apps/desktop check",
    "```",
    "",
    "## 约定",
    "",
    "- IPC 通道表是 `src/shared/ipc.ts`：参数/结果用 zod 校验，三端共享类型。",
    "- 主进程只通过 `register()` 注册处理器；preload 只暴露窄接口函数，绝不暴露 `ipcRenderer`。",
    `- 示例通道 \`app:todo\` 返回 \`${shared}\` 的 \`Todo\` 形状。`,
    "- 渲染层通过 `app://` 协议加载打包产物，开发期用 Vite dev server。",
    "- 修改 `electron-builder.yml` 后运行 `dist:dir` 验证安装包目录。",
    "",
    "## 参考文档（llms.txt）",
    "",
    "- Vite+ — https://viteplus.dev/llms.txt",
    "- Vite — https://vite.dev/llms.txt",
    "- Vue — https://vuejs.org/llms.txt",
    "- Zod — https://zod.dev/llms.txt",
    "- Node.js — https://nodejs.org/llms.txt",
    "- Electron — https://www.electronjs.org/docs/latest/（暂无 llms.txt）",
    "- electron-builder — https://www.electron.build/（暂无 llms.txt）",
  );
}

function renderSharedTypesAgents(): string {
  return lines(
    "# packages/shared-types — 共享领域类型",
    "",
    "本目录是 workspace 的类型包，被 `apps/api`、`apps/web`、`apps/desktop` 以 `workspace:*` 引用。",
    "",
    "## 命令",
    "",
    "```bash",
    "pnpm --filter ./packages/shared-types build      # vp pack -> dist/",
    "pnpm --filter ./packages/shared-types dev        # vp pack --watch",
    "pnpm --filter ./packages/shared-types typecheck",
    "pnpm --filter ./packages/shared-types check",
    "```",
    "",
    "## 约定",
    "",
    "- `src/index.ts` 是所有共享领域类型的唯一事实来源。",
    "- 类型入口指向 `src/index.ts`，因此 `pnpm check` 不依赖 `dist/`；运行时入口是 `dist/index.mjs`。",
    "- 新增字段时同步修改 api/web/desktop 的使用处与示例测试。",
    "",
    "## 参考文档（llms.txt）",
    "",
    "- Vite+ — https://viteplus.dev/llms.txt",
    "- Vite — https://vite.dev/llms.txt",
    "- Node.js — https://nodejs.org/llms.txt",
    "- TypeScript — https://www.typescriptlang.org/docs/（暂无 llms.txt）",
  );
}

// --------------------------------------------------------------------------
// helpers
// --------------------------------------------------------------------------

function lines(...items: string[]): string {
  return `${items.join("\n")}\n`;
}

function requireFile(files: VirtualFile[], path: string): VirtualFile {
  const file = files.find((entry) => entry.path === path);
  if (file === undefined) {
    fail("E-FILE-WRITE", `fullstack scaffold: missing file "${path}"`);
  }
  return file;
}

function replaceFile(files: VirtualFile[], path: string, contents: string): void {
  requireFile(files, path).contents = contents;
}

function patchText(files: VirtualFile[], path: string, search: string, replacement: string): void {
  const file = requireFile(files, path);
  if (!file.contents.includes(search)) {
    fail("E-FILE-WRITE", `fullstack scaffold: missing anchor in "${path}"`);
  }
  // `lines()` ends with a newline. When the anchor does not consume that
  // newline, trim it from the replacement or every insertion grows a blank
  // line; when the anchor itself ends with one, keep it to avoid joining lines.
  const inline =
    !search.endsWith("\n") && replacement.endsWith("\n") ? replacement.slice(0, -1) : replacement;
  file.contents = file.contents.replace(search, inline);
}

function patchPackageJson(
  files: VirtualFile[],
  path: string,
  mutate: (pkg: Record<string, unknown>) => void,
): void {
  const file = requireFile(files, path);
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(file.contents) as Record<string, unknown>;
  } catch {
    fail("E-FILE-WRITE", `fullstack scaffold: invalid package.json "${path}"`);
  }
  mutate(pkg);
  file.contents = `${JSON.stringify(pkg, null, 2)}\n`;
}
