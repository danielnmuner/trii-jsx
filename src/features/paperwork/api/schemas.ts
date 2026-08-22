import { z } from 'zod'

export const stockOrdersPersistResponseSchema = z.object({
  status: z.literal('ok'),
  result: z.object({
    table: z.string(),
    file_name: z.string(),
    source_file_checksum: z.string(),
    received_records: z.number(),
    imported_records: z.number(),
    duplicate_records: z.number(),
    symbols: z.array(z.string()),
  }),
})

export const invoicePersistResponseSchema = z.object({
  status: z.literal('ok'),
  result: z.object({
    bucket: z.string(),
    uploaded_files: z.number(),
    documents: z.array(
      z.object({
        archive_name: z.string(),
        xml_s3_key: z.string(),
        pdf_s3_key: z.string(),
      }),
    ),
  }),
})

export const stockOrdersLookupRecordSchema = z.object({
  imported_at: z.string().nullable(),
  created_at_symbol: z.string().nullable(),
})

export const stockOrdersLookupResponseSchema = z.object({
  status: z.literal('ok'),
  result: z.object({
    lookup_mode: z.enum(['symbol', 'record_checksum', 'created_month']),
    symbol: z.string().optional(),
    record_checksum: z.string().optional(),
    created_month: z.string().optional(),
    record_count: z.number(),
    records: z.array(stockOrdersLookupRecordSchema),
  }),
})

export type StockOrdersPersistResponse = z.infer<typeof stockOrdersPersistResponseSchema>
export type InvoicePersistResponse = z.infer<typeof invoicePersistResponseSchema>
export type StockOrdersLookupResponse = z.infer<typeof stockOrdersLookupResponseSchema>
export type StockOrdersLookupRecord = z.infer<typeof stockOrdersLookupRecordSchema>
