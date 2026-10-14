import { describe, expect, test } from 'vite-plus/test'

import app from './index'

describe('app', () => {
  test('GET /healthz reports liveness', async () => {
    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ status: 'ok' })
  })

  test('unknown routes use the JSON error envelope', async () => {
    const res = await app.request('/does-not-exist')
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ code: 'NOT_FOUND' })
  })
})
