import { useRequest } from 'alova/client'
import { listTodos } from '@/api/todos'

/**
 * Component-ready request state:
 * `const { data, loading, error, send } = useTodos()`.
 */
export function useTodos() {
  return useRequest(listTodos)
}
