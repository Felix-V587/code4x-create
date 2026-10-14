import { z } from 'zod'

/**
 * Runtime configuration, validated once at import time. Declare required
 * variables here so a missing or malformed value fails fast at startup instead
 * of surfacing later as `undefined` deep inside a handler.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

export const env = EnvSchema.parse(process.env)

export type Env = z.infer<typeof EnvSchema>
