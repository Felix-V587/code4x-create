# Electron

生成一个 Vue 3 渲染层的 Electron 应用：`vp pack` 打包主进程/预加载脚本，`vp build` 构建渲染层，开发期由零依赖脚本编排。

## 生成结构

```text
my-app/
├── src/
│   ├── main/index.ts       # 主进程：窗口、协议、IPC 注册
│   ├── preload/index.ts    # 预加载：表驱动的窄桥
│   ├── shared/ipc.ts       # channel 表 + zod schema + 三端共享类型
│   └── renderer/
│       ├── index.html
│       └── src/{main.ts,App.vue,env.d.ts,style.css}
├── scripts/dev.mjs         # 零依赖开发编排
├── vite.config.ts          # main/preload 用 vp pack，renderer 用 vp build
├── package.json
├── tsconfig.json
└── electron-builder.yml    # 仅选择 electron/builder 时
```

## 类型化 IPC

`src/shared/ipc.ts` 是唯一的 channel 表：

```ts
export const ipc = {
  "app:ping": { args: z.tuple([]), result: z.literal("pong") },
  "app:echo": { args: z.tuple([z.string().min(1)]), result: z.string() },
} as const;
```

- **main**：`register(channel, handler)` 从表注册，参数与返回值都做 `safeParse` 双向校验。
- **preload**：按表生成窄桥，每个 channel 一个函数；**不暴露** `ipcRenderer` 或通用 `invoke`。
- **renderer**：`window.code4x` 的类型由共享表派生。
- **错误信封**：`{ ok: false, error: { message } }`；跨 IPC 只保留 `message`，不泄漏 stack 或自定义字段。

新增通道的顺序：先在 `src/shared/ipc.ts` 加表项，再分别在 main / preload 实现。

## 生产加载：`app://`

- `protocol.registerSchemesAsPrivileged` 在 app ready 前注册 `app` scheme（standard / secure / supportFetchAPI）。
- ready 后用 `protocol.handle('app', …)` 提供 `dist/renderer` 静态文件。
- 未知路径回退到 `index.html`（支持 history 路由与深链）。
- 路径 `..` 逃逸会被拒绝并返回 403（traversal guard）。
- 生产用 `win.loadURL('app://./index.html')`；开发分支有 `!app.isPackaged` 门闩。

## 开发编排

```bash
pnpm dev    # node scripts/dev.mjs
```

- 渲染层 dev server 固定端口 **5173**（端口冲突会直接失败，而不是静默换端口）。
- 主进程/预加载变更会重启 Electron。
- 单实例锁已启用，重复启动会聚焦已有窗口。

## 打包（electron/builder）

```bash
node packages/cli/dist/cli.mjs my-app -f electron --features electron/builder -y
```

生成 `electron-builder.yml` 与脚本：

```bash
pnpm dist       # 生成安装包到 release/
pnpm dist:dir   # 只生成未打包目录，便于 CI 冒烟
```

- 默认产物：Linux AppImage、macOS dmg + zip、Windows nsis。
- `asar` 默认开启。
- 打包前请把 `electron-builder.yml` 里的 `appId` 与 Linux `maintainer` 换成自己的值。
- 上游签名/公证（macOS notarization、Windows code signing）需要自行配置证书，脚手架不提供。

## 常用命令

```bash
pnpm dev        # 开发
pnpm build      # vp pack（main/preload）+ vp build（renderer）
pnpm start      # electron .
pnpm check      # vp check
pnpm typecheck  # vue-tsc --noEmit
```

## 注意

- 渲染层 `env.d.ts` 必须保持 script 上下文（不要加顶层 `import`/`export`），否则 `declare module '*.vue'` 会失效。
- `zod` 在 `dependencies` 中，并通过 `deps.alwaysBundle` 内联进 bundle；预加载脚本保持零外部 `require`，为 Electron 45 的沙箱 preload 做准备。
- `electron/updater`、`electron/store`、托盘、多窗口、深链等能力尚未实现。
