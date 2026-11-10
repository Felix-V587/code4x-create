import { alova } from '@/lib/alova'

export interface Todo {
  id: number
  title: string
  done: boolean
}

/** 类型化的 GET 方法；`await listTodos()` 也可以在不使用 hooks 的情况下工作。 */
export const listTodos = () => alova.Get<Todo[]>('/todos')
