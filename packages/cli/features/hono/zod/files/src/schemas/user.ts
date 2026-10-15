import { z } from 'zod'

export const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
})

export type CreateUser = z.infer<typeof CreateUserSchema>

export const RegisterResponseSchema = z.object({
  ok: z.boolean(),
})
