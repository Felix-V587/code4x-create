import { pinoLogger } from 'hono-pino'

/**
 * 基于 Pino 的请求日志器。`hono-pino` 会在每行日志中包含请求 id
 *（其默认 `referRequestIdKey` 为 `"requestId"`），因此日志与错误信封
 * 共享同一个 id。
 */
export const logger = pinoLogger({
  pino: { level: process.env.LOG_LEVEL ?? 'info' },
})
