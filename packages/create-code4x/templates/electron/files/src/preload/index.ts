import { contextBridge, ipcRenderer } from 'electron'

// The only surface the renderer can touch. Never expose `ipcRenderer` directly —
// wrap each channel in a narrow, typed function instead.
const api = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
  ping: (): Promise<string> => ipcRenderer.invoke('app:ping'),
}

contextBridge.exposeInMainWorld('code4x', api)

export type Code4xApi = typeof api
