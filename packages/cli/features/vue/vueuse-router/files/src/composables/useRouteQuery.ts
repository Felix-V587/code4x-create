import { useRouteQuery } from '@vueuse/router'

/** `q` 路由查询参数与 ref 之间的双向绑定。 */
export function useSearchQuery() {
  return useRouteQuery('q', '')
}
