import { pinoLogger } from 'hono-pino'

/**
 * Pino-backed request logger. `hono-pino` includes the request id in every log
 * line (its default `referRequestIdKey` is `"requestId"`), so logs and the
 * error envelope share the same id.
 */
export const logger = pinoLogger({
  pino: { level: process.env.LOG_LEVEL ?? 'info' },
})
