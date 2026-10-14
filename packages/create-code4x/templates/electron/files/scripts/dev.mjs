// Dev orchestrator: `vp pack --watch` (main + preload) alongside `vp dev`
// (renderer), then launch Electron once the first bundles and the dev server
// are ready. Restart Electron when the main/preload bundles change.
//
// Zero extra dependencies: only Node built-ins plus the `electron` binary path.
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
  // `detached` puts each child in its own process group so shutdown can kill the
  // whole subtree: `vp dev`/`vp pack` fork deeper node processes (`vite`, tsdown)
  // that would otherwise be orphaned and keep the port/socket alive.
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
      // Negative PID targets the child's whole process group.
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
  // Escalate to SIGKILL if a child ignores SIGTERM. The timer is not unref'd so
  // the process always exits with `code`, even when children stop instantly.
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
    // Ignore exits from a deliberate restart or shutdown.
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
      // `localhost` (not 127.0.0.1): Vite's dev server binds IPv6 ::1 by default.
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
