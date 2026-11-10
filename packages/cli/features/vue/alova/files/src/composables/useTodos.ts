import { useRequest } from 'alova/client'
import { listTodos } from '@/api/todos'

/**
 * 可供组件直接使用的请求状态：
 * `const { data, loading, error, send } = useTodos()`。
 */
export function useTodos() {
  return useRequest(listTodos)
}
