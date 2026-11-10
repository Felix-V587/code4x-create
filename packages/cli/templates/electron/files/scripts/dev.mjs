// 开发编排器：在 `vp dev`（渲染进程）的同时运行 `vp pack --watch`
// （主进程 + preload），等首批产物和开发服务器就绪后启动 Electron。
// 当主进程/preload 产物变化时重启 Electron。
//
// 不引入额外依赖：仅使用 Node 内置模块以及 `electron` 二进制路径。
import { spawn } from 'node:child_process'
import { existsSync, watch } from 'node:fs'
import { createConnection } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import electronPath from 'electron'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const rendererUrl = 'http://localhost:5173'
const rendererPort = 5173
const mainBundle = join(root, 'dist', 'main', 'index.cjs')
const preloadBundle = join(root, 'dist', 'preload', 'index.cjs')

const log = (message) => process.stdout.write(`[dev] ${message}\n`)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const children = new Set()
let electron = null
let restartTimer = null
let stopping = false

function launch(command, args, extra = {}) {
  // `detached` 让每个子进程处于自己的进程组中，以便关闭时能杀掉整个
  // 子树：`vp dev`/`vp pack` 会派生出更深的 node 进程（`vite`、tsdown），
  // 否则它们会变成孤儿进程并让端口/socket 保持存活。
  return track(
    spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      detached: true,
      ...extra,
    }),
  )
}

function track(child) {
  children.add(child)
  child.on('exit', () => children.delete(child))
  return child
}

function killAll(signal) {
  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    try {
      // 负 PID 用于定位该子进程的整个进程组。
      process.kill(-child.pid, signal)
    } catch {
      child.kill(signal)
    }
  }
}

function shutdown(code) {
  if (stopping) return
  stopping = true
  if (restartTimer) clearTimeout(restartTimer)
  log('shutting down')
  killAll('SIGTERM')
  // 若子进程忽略 SIGTERM，则升级为 SIGKILL。该定时器未被 unref，
  // 因此即使子进程立即退出，本进程也总会以 `code` 退出。
  setTimeout(() => {
    killAll('SIGKILL')
    process.exit(code)
  }, 1000)
}

function startElectron() {
  const child = launch(electronPath, ['.'], {
    env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl },
  })
  electron = child
  child.on('exit', (code) => {
    // 忽略故意重启或关闭导致的退出。
    if (stopping || child !== electron) return
    log(`electron exited (${code ?? 0})`)
    shutdown(0)
  })
}

function scheduleRestart() {
  if (restartTimer) clearTimeout(restartTimer)
  restartTimer = setTimeout(() => {
    if (stopping) return
    log('main/preload changed — restarting electron')
    const previous = electron
    electron = null
    if (previous) previous.kill('SIGTERM')
    startElectron()
  }, 200)
}

async function waitForFile(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(path)) return true
    await sleep(100)
  }
  return false
}

function waitForPort(port, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const attempt = () => {
      // 使用 `localhost`（而非 127.0.0.1）：Vite 开发服务器默认绑定 IPv6 的 ::1。
      const socket = createConnection({ port, host: 'localhost' })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() > deadline) resolve(false)
        else setTimeout(attempt, 150)
      })
    }
    attempt()
  })
}

async function main() {
  log('starting vp pack --watch (main + preload)')
  launch('vp', ['pack', '--watch'])
  log('starting vp dev (renderer)')
  launch('vp', ['dev'])

  log('waiting for bundles and renderer...')
  const [mainReady, preloadReady, portReady] = await Promise.all([
    waitForFile(mainBundle, 30000),
    waitForFile(preloadBundle, 30000),
    waitForPort(rendererPort, 30000),
  ])
  if (!mainReady || !preloadReady || !portReady) {
    log('timed out waiting for the dev environment')
    shutdown(1)
    return
  }

  log(`launching electron -> ${rendererUrl}`)
  startElectron()

  for (const dir of ['dist/main', 'dist/preload']) {
    const target = join(root, dir)
    if (existsSync(target)) watch(target, scheduleRestart)
  }
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

main().catch((error) => {
  log(`failed: ${error instanceof Error ? error.message : String(error)}`)
  shutdown(1)
})
