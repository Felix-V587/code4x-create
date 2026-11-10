import { Hono } from 'hono'

/**
 * 就绪探针。每个探针在其依赖健康时 resolve，否则 reject；第一个 reject
 * 会使 `GET /readyz` 返回 503。
 *
 * TODO：在生产环境中依赖此端点之前，注册真实的探针
 *（数据库 ping、缓存、下游 API）。
 */
const probes: Array<() => Promise<void>> = [
  // 空操作占位：始终就绪。
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
