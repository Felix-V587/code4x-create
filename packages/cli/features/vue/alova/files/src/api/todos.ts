import { alova } from '@/lib/alova'

export interface Todo {
  id: number
  title: string
  done: boolean
}

/** Typed GET method; `await listTodos()` also works without hooks. */
export const listTodos = () => alova.Get<Todo[]>('/todos')
