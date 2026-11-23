import { z } from 'zod'

export const issuerSchema = z
  .object({
    symbol: z.string(),
    is_active: z.boolean().optional(),
    url: z.string().nullable().optional(),
    added_at: z.string().nullable().optional(),
    updated_at: z.string().nullable().optional(),
  })
  .passthrough()

export const issuersResponseSchema = z.object({
  status: z.literal('ok'),
  result: z.object({
    count: z.number(),
    items: z.array(issuerSchema),
  }),
})

export type Issuer = z.infer<typeof issuerSchema>

export type ActiveIssuers = {
  issuers: Issuer[]
  symbols: string[]
}
