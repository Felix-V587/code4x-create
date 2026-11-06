import { useQuery } from '@pinia/colada'
import { fetchTodos } from '@/api/todos'

/** Component-ready query state backed by Pinia Colada's cache. */
export function useTodos() {
  return useQuery({
    key: ['todos'],
    query: fetchTodos,
  })
}
