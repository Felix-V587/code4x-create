import { useRouteQuery } from '@vueuse/router'

/** Two-way binding between the `q` route query param and a ref. */
export function useSearchQuery() {
  return useRouteQuery('q', '')
}
