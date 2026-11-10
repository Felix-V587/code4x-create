import { existsSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import { ipc, type IpcArgs, type IpcChannel, type IpcEnvelope, type IpcResult } from '../shared/ipc'
// @code4x:begin imports
// @code4x:end imports

// 生产环境中，渲染进程通过自定义 `app://` 协议从 `dist/renderer` 提供：
// Electron 的安全检查清单不建议使用 `file://`，而 `protocol.handle` 是当前
// API（`protocol.register*Protocol` 自 Electron 25 起已废弃）。
// `registerSchemesAsPrivileged` 必须在应用就绪之前调用。
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const rendererDir = join(__dirname, '../renderer')

/**
 * 将 `app://` 请求路径解析为 `dist/renderer` 内的文件，若越出该目录
 * 则返回 `null`（路径穿越防护）。`normalize` 会在包含性检查之前
 * 折叠 `..` 路径段。
 */
function resolveRendererFile(pathname: string): string | null {
  const root = normalize(rendererDir)
  const target = normalize(join(root, decodeURIComponent(pathname)))
  if (target !== root && !target.startsWith(root + sep)) return null
  return target
}

/** 刻意的错误信封：只有 `message` 会跨越 IPC 边界。 */
function fail(message: string): IpcEnvelope<never> {
  return { ok: false, error: { message } }
}

/**
 * 为 `../shared/ipc` 中的每个通道注册一个处理器，并依据共享 schema 校验
 * 参数与结果。抛出的错误绝不会带着堆栈或自定义字段跨越边界——只返回
 * `message`。
 */
function register<C extends IpcChannel>(
  channel: C,
  handler: (args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>,
): void {
  ipcMain.handle(channel, async (_event, rawArgs: unknown) => {
    const parsedArgs = ipc[channel].args.safeParse(rawArgs)
    if (!parsedArgs.success) return fail('invalid IPC arguments')
    try {
      // 用泛型通道索引 const 对象 `ipc` 会把 schema 拓宽为所有条目的联合类型，
      // 因此这里将解析后的值重新断言为该通道的元组（上面的 schema 已经校验过
      // 其形状）。
      const args = parsedArgs.data as IpcArgs<C>
      const parsedResult = ipc[channel].result.safeParse(await handler(args))
      return parsedResult.success
        ? { ok: true as const, data: parsedResult.data }
        : fail('invalid IPC result')
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  })
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1024,
    height: 720,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (!app.isPackaged && rendererUrl) {
    void window.loadURL(rendererUrl)
  } else {
    void window.loadURL('app://./index.html')
  }

  // 在用户浏览器中打开外部链接，而不是新建 Electron 窗口。
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
}

// 保持单实例运行；再次启动时聚焦已有窗口。
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows()
    if (window) {
      if (window.isMinimized()) window.restore()
      window.focus()
    }
  })

  void app.whenReady().then(() => {
    protocol.handle('app', (request) => {
      const { pathname } = new URL(request.url)
      const target = resolveRendererFile(pathname)
      if (target === null) return new Response('Forbidden', { status: 403 })
      // 未知路径回退到 `index.html`，以便 history 模式路由和深层链接
      // 能够解析；实际存在的资源则直接提供。
      const file = existsSync(target) ? target : join(rendererDir, 'index.html')
      return net.fetch(pathToFileURL(file).toString())
    })

    // 先在 `../shared/ipc` 中添加通道；这些调用随后会进行类型检查。
    register('app:ping', () => 'pong')
    register('app:echo', (args) => args[0])

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
