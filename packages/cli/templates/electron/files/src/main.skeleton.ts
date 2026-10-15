import { existsSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron'
import { ipc, type IpcArgs, type IpcChannel, type IpcEnvelope, type IpcResult } from '../shared/ipc'
// @code4x:begin imports
// @code4x:end imports

// The renderer is served in production from `dist/renderer` over a custom
// `app://` scheme: Electron's security checklist discourages `file://`, and
// `protocol.handle` is the current API (`protocol.register*Protocol` is
// deprecated since Electron 25). `registerSchemesAsPrivileged` must run before
// the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const rendererDir = join(__dirname, '../renderer')

/**
 * Resolve an `app://` request path to a file inside `dist/renderer`, or `null`
 * when it escapes the directory (path-traversal guard). `normalize` collapses
 * `..` segments before the containment check.
 */
function resolveRendererFile(pathname: string): string | null {
  const root = normalize(rendererDir)
  const target = normalize(join(root, decodeURIComponent(pathname)))
  if (target !== root && !target.startsWith(root + sep)) return null
  return target
}

/** Deliberate error envelope: only `message` crosses the IPC boundary. */
function fail(message: string): IpcEnvelope<never> {
  return { ok: false, error: { message } }
}

/**
 * Register one handler per channel in `../shared/ipc`, validating arguments and
 * results against the shared schemas. A thrown error never crosses the boundary
 * with its stack or custom fields — only `message` is returned.
 */
function register<C extends IpcChannel>(
  channel: C,
  handler: (args: IpcArgs<C>) => IpcResult<C> | Promise<IpcResult<C>>,
): void {
  ipcMain.handle(channel, async (_event, rawArgs: unknown) => {
    const parsedArgs = ipc[channel].args.safeParse(rawArgs)
    if (!parsedArgs.success) return fail('invalid IPC arguments')
    try {
      // Indexing the const `ipc` object with a generic channel widens the schema
      // to the union of every entry, so the parsed value is re-asserted as this
      // channel's tuple (the schema above already validated the shape).
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

  // Open external links in the user's browser instead of a new Electron window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
}

// Keep a single running instance; focus the existing window on relaunch.
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
      // Unknown paths fall back to `index.html` so history-mode routers and deep
      // links resolve; assets that exist are served directly.
      const file = existsSync(target) ? target : join(rendererDir, 'index.html')
      return net.fetch(pathToFileURL(file).toString())
    })

    // Add a channel in `../shared/ipc` first; these calls are then type-checked.
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
