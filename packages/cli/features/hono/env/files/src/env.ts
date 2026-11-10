import { z } from 'zod'

/**
 * 运行时配置，在导入时校验一次。在此声明必需变量，这样缺失或格式错误的值
 * 会在启动时快速失败，而不是稍后以 `undefined` 的形式在处理器深处浮现。
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
})

export const env = EnvSchema.parse(process.env)

export type Env = z.infer<typeof EnvSchema>
