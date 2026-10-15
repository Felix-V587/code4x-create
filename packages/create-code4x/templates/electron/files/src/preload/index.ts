import { contextBridge, ipcRenderer } from 'electron'
import type { IpcArgs, IpcChannel, IpcEnvelope, IpcResult } from '../shared/ipc'

/**
 * The single generic transport. It is never exposed to the renderer: only the
 * narrow per-channel functions below cross the contextBridge. Results are typed
 * from the shared channel table; the main process owns their runtime
 * validation, so this stays a thin transport.
 */
async function invoke<C extends IpcChannel>(
  channel: C,
  ...args: IpcArgs<C>
): Promise<IpcResult<C>> {
  const response = (await ipcRenderer.invoke(channel, args)) as IpcEnvelope<IpcResult<C>>
  if (!response.ok) throw new Error(response.error.message)
  return response.data
}

// One narrow function per channel in `../shared/ipc`; never expose `ipcRenderer`
// or a generic `invoke`. Adding a channel means an entry there, a `register()`
// in the main process, and a function here.
const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
  ping: (): Promise<IpcResult<'app:ping'>> => invoke('app:ping'),
  echo: (...args: IpcArgs<'app:echo'>): Promise<IpcResult<'app:echo'>> =>
    invoke('app:echo', ...args),
}

contextBridge.exposeInMainWorld('code4x', api)

export type Code4xApi = typeof api
