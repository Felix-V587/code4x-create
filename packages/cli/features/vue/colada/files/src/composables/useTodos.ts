import { useQuery } from '@pinia/colada'
import { fetchTodos } from '@/api/todos'

/** 可供组件直接使用、基于 Pinia Colada 缓存的查询状态。 */
export function useTodos() {
  return useQuery({
    key: ['todos'],
    query: fetchTodos,
  })
}
