/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}

// Vite+ provides the renderer build via its bundled Vite; declare the CSS
// side-effect import locally so `vue-tsc`/`vp check` resolve it without a
// direct `vite` dependency (which would shadow Vite+'s aliased core).
declare module '*.css' {
  const css: string
  export default css
}

// The renderer's view of `window.code4x` is derived from the shared channel
// table (`src/shared/ipc.ts`), so argument/result types cannot drift from the
// preload bridge. This file must stay a script (no top-level import/export) so
// the wildcard module declarations above remain ambient.
type IpcChannel = import('../../shared/ipc').IpcChannel
type IpcArgs<C extends IpcChannel> = import('../../shared/ipc').IpcArgs<C>
type IpcResult<C extends IpcChannel> = import('../../shared/ipc').IpcResult<C>

interface Code4xApi {
  platform: string
  versions: {
    electron: string
    node: string
    chrome: string
  }
  ping: () => Promise<IpcResult<'app:ping'>>
  echo: (...args: IpcArgs<'app:echo'>) => Promise<IpcResult<'app:echo'>>
}

interface Window {
  code4x: Code4xApi
}
