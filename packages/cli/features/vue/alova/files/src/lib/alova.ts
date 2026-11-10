import { createAlova } from 'alova'
import adapterFetch from 'alova/fetch'
import vueHook from 'alova/vue'

/**
 * 应用共享的 Alova 实例。
 *
 * - `baseURL` 来自 `VITE_API_BASE_URL`（回退为 `/api`）。
 * - `vueHook` 是必需的，这样 `useRequest` / `useWatcher` 才能暴露 Vue ref。
 * - `responded.onSuccess` 会将非 2xx 响应规范化为 rejected promise。
 */
export const alova = createAlova({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  statesHook: vueHook,
  requestAdapter: adapterFetch(),
  timeout: 15_000,
  cacheFor: { GET: 60_000 },
  responded: {
    onSuccess: async (response) => {
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      return response.json()
    },
  },
})
