import type { Hook } from '@hono/zod-validator'

/**
 * 将 `zValidator` 的失败规范化为应用统一的错误信封。
 *
 * `app.onError` / `app.notFound`（见 `src/index.ts`）返回
 * `{ code, message, details?, requestId }`；因此路由错误*和*校验错误
 * 共享同一套响应契约。将这个 hook 传给每个 `zValidator` 调用
 *（见注册路由），而不是在每个路由中单独处理失败。
 */
export const validationHook: Hook<any, any, any> = (result, c) => {
  if (result.success) return
  return c.json(
    {
      code: 'VALIDATION',
      message: 'Validation failed',
      details: result.error.issues,
      requestId: c.get('requestId'),
    },
    400,
  )
}
