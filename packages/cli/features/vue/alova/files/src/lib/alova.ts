import { createAlova } from 'alova'
import adapterFetch from 'alova/fetch'
import vueHook from 'alova/vue'

/**
 * Shared Alova instance for the app.
 *
 * - `baseURL` comes from `VITE_API_BASE_URL` (fallback `/api`).
 * - `vueHook` is required so `useRequest` / `useWatcher` expose Vue refs.
 * - `responded.onSuccess` normalizes non-2xx responses into rejected promises.
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
