import type { Hook } from '@hono/zod-validator'

/**
 * Normalizes `zValidator` failures into the app-wide error envelope.
 *
 * `app.onError` / `app.notFound` (see `src/index.ts`) return
 * `{ code, message, details?, requestId }`; routing *and* validation errors
 * therefore share one response contract. Pass this hook to every `zValidator`
 * call (see the register route) instead of handling failures per route.
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
