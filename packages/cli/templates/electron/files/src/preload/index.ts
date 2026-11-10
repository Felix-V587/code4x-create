import { contextBridge, ipcRenderer } from 'electron'
import type { IpcArgs, IpcChannel, IpcEnvelope, IpcResult } from '../shared/ipc'

/**
 * 唯一的泛型传输层。它从不暴露给渲染进程：只有下面这些按通道划分的
 * 窄接口函数会跨越 contextBridge。结果类型由共享通道表派生；运行时
 * 校验由主进程负责，因此这里保持为轻量传输层。
 */
async function invoke<C extends IpcChannel>(
  channel: C,
  ...args: IpcArgs<C>
): Promise<IpcResult<C>> {
  const response = (await ipcRenderer.invoke(channel, args)) as IpcEnvelope<IpcResult<C>>
  if (!response.ok) throw new Error(response.error.message)
  return response.data
}

// 为 `../shared/ipc` 中的每个通道提供一个窄接口函数；绝不暴露 `ipcRenderer`
// 或通用的 `invoke`。新增通道意味着在那里加一个条目、在主进程中加一个
// `register()`，并在这里加一个函数。
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
