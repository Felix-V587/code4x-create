import { z } from 'zod'

/**
 * Single source of truth for the renderer <-> main IPC surface.
 *
 * All three processes import this module, so a channel's argument and result
 * shapes are declared once and cannot drift:
 *   - `src/main/index.ts` registers a handler per channel and validates both
 *     directions against these schemas;
 *   - `src/preload/index.ts` exposes exactly one narrow function per channel;
 *   - the renderer reads the derived types (`src/renderer/src/env.d.ts`).
 *
 * `args` is always a tuple (`z.tuple([])` for none) because the preload forwards
 * the arguments as an array to `ipcRenderer.invoke`.
 */
export const ipc = {
  'app:ping': { args: z.tuple([]), result: z.literal('pong') },
  'app:echo': { args: z.tuple([z.string().min(1)]), result: z.string() },
} as const

export type IpcTable = typeof ipc
export type IpcChannel = keyof IpcTable

/** Parsed argument tuple for a channel (empty tuple for zero-arg channels). */
export type IpcArgs<C extends IpcChannel> = z.infer<IpcTable[C]['args']>

/** Parsed result payload for a channel. */
export type IpcResult<C extends IpcChannel> = z.infer<IpcTable[C]['result']>

/**
 * Wire envelope. `ipcRenderer.invoke` rejects with a plain `Error` that drops
 * custom properties, so errors are modelled explicitly here: the main process
 * never lets a thrown error cross the boundary — it returns `{ ok: false }`
 * carrying only `message`, and the preload rethrows it as an `Error` for the
 * renderer.
 */
export type IpcEnvelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } }
