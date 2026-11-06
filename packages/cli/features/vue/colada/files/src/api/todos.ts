export interface Todo {
  id: number
  title: string
  done: boolean
}

export async function fetchTodos(): Promise<Todo[]> {
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}/todos`)
  if (!response.ok) {
    throw new Error(`Failed to fetch todos: ${response.status}`)
  }
  return response.json() as Promise<Todo[]>
}
