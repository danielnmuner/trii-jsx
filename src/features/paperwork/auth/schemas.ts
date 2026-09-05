import { z } from 'zod'

export const paperworkAuthSessionSchema = z.object({
  authenticated: z.boolean(),
  user: z
    .object({
      login: z.string(),
      name: z.string().nullable().optional(),
      avatarUrl: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
    })
    .nullable(),
  message: z.string().optional(),
})

export type PaperworkAuthSession = z.infer<typeof paperworkAuthSessionSchema>
