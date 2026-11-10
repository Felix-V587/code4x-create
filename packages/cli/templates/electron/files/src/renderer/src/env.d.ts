/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent
  export default component
}

// Vite+ 通过内置的 Vite 提供渲染进程构建；在本地声明 CSS 副作用的导入，
// 这样 `vue-tsc`/`vp check` 无需直接依赖 `vite`（否则会遮蔽 Vite+ 的别名核心）
// 也能解析它。
declare module '*.css' {
  const css: string
  export default css
}

// 渲染进程看到的 `window.code4x` 由共享通道表（`src/shared/ipc.ts`）派生，
// 因此参数/结果类型不会与 preload 桥接层不一致。此文件必须保持为脚本
// （不包含顶层 import/export），以便上面的通配模块声明保持全局可见。
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
