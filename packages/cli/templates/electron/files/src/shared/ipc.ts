import { z } from 'zod'

/**
 * 渲染进程与主进程之间 IPC 接口的唯一事实来源。
 *
 * 三个进程都会导入此模块，因此一个通道的参数与结果形状只声明一次，
 * 不会漂移：
 *   - `src/main/index.ts` 为每个通道注册处理器，并依据这些 schema 双向校验；
 *   - `src/preload/index.ts` 为每个通道暴露恰好一个窄接口函数；
 *   - 渲染进程读取派生出的类型（`src/renderer/src/env.d.ts`）。
 *
 * `args` 始终是元组（无参数时为 `z.tuple([])`），因为 preload 会将
 * 参数作为数组转发给 `ipcRenderer.invoke`。
 */
export const ipc = {
  'app:ping': { args: z.tuple([]), result: z.literal('pong') },
  'app:echo': { args: z.tuple([z.string().min(1)]), result: z.string() },
} as const

export type IpcTable = typeof ipc
export type IpcChannel = keyof IpcTable

/** 通道解析后的参数元组（零参数通道为空元组）。 */
export type IpcArgs<C extends IpcChannel> = z.infer<IpcTable[C]['args']>

/** 通道解析后的结果载荷。 */
export type IpcResult<C extends IpcChannel> = z.infer<IpcTable[C]['result']>

/**
 * 传输信封。`ipcRenderer.invoke` 会以普通的 `Error` 拒绝并丢弃自定义属性，
 * 因此这里显式地对错误建模：主进程绝不让抛出的错误跨越边界——它返回仅携带
 * `message` 的 `{ ok: false }`，而 preload 会将其作为 `Error` 重新抛给
 * 渲染进程。
 */
export type IpcEnvelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } }
