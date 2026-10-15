import { Hono } from 'hono'

/**
 * Readiness probes. Each probe resolves when its dependency is healthy and
 * rejects otherwise; the first rejection makes `GET /readyz` answer 503.
 *
 * TODO: register real probes (database ping, cache, downstream API) before
 * relying on this endpoint in production.
 */
const probes: Array<() => Promise<void>> = [
  // No-op placeholder: always ready.
  () => Promise.resolve(),
]

export const health = new Hono()
  .get('/healthz', (c) => c.json({ status: 'ok' }))
  .get('/readyz', async (c) => {
    for (const probe of probes) {
      try {
        await probe()
      } catch (error) {
        return c.json(
          {
            status: 'unavailable',
            error: error instanceof Error ? error.message : String(error),
          },
          503,
        )
      }
    }
    return c.json({ status: 'ready' })
  })
