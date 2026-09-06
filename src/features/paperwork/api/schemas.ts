import { z } from 'zod'

const numberLikeSchema = z.union([z.number(), z.string()])
const nullableNumberLikeSchema = z.union([numberLikeSchema, z.null(), z.undefined()]).transform((value) => {
  if (value == null) {
    return null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
})

export const stockOrdersPersistResponseSchema = z.object({
  status: z.literal('ok'),
  result: z.object({
    user_name: z.string().optional(),
    table: z.string(),
    file_name: z.string(),
    source_file_checksum: z.string(),
    received_records: z.number(),
    imported_records: z.number(),
    duplicate_records: z.number(),
    symbols: z.array(z.string()),
  }),
})

export const stockOrdersLookupRecordSchema = z.object({
  user_name: z.string().nullable().optional(),
  record_checksum: z.string().optional(),
  source_file_checksum: z.string().optional(),
  source_line_number: z.number().nullable().optional(),
  created_at: z.string().nullable().optional(),
  created_month: z.string().nullable().optional(),
  imported_at: z.string().nullable(),
  created_at_symbol: z.string().nullable(),
  symbol: z.string().optional(),
  order_side: z.string().nullable().optional(),
  raw_status: z.string().nullable().optional(),
  normalized_status: z.string().nullable().optional(),
  requested_quantity: z.number().nullable().optional(),
  filled_quantity: z.number().nullable().optional(),
  pending_quantity: z.number().nullable().optional(),
  price_per_share: z.number().nullable().optional(),
  gross_amount: z.number().nullable().optional(),
  commission_amount: z.number().nullable().optional(),
  net_amount: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
})

export const stockOrdersLookupResponseSchema = z.object({
  status: z.literal('ok'),
  result: z.object({
    lookup_mode: z.enum(['symbol', 'record_checksum', 'created_month']),
    user_name: z.string().optional(),
    symbol: z.string().optional(),
    record_checksum: z.string().optional(),
    created_month: z.string().optional(),
    record_count: z.number(),
    records: z.array(stockOrdersLookupRecordSchema),
  }),
})

export const parsedInvoiceLookupRecordSchema = z.object({
  invoice_uuid: z.string(),
  invoice_number: z.string().nullable().optional(),
  user_name: z.string().nullable().optional(),
  order_reference_id: z.string().nullable().optional(),
  issued_at: z.string().nullable().optional(),
  issued_month: z.string().nullable().optional(),
  supplier_tax_id: z.string().nullable().optional(),
  supplier_name: z.string().nullable().optional(),
  customer_tax_id: z.string().nullable().optional(),
  customer_name: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  invoice_type_code: z.string().nullable().optional(),
  payable_amount: nullableNumberLikeSchema,
  tax_exclusive_amount: nullableNumberLikeSchema,
  tax_inclusive_amount: nullableNumberLikeSchema,
  tax_amount: nullableNumberLikeSchema,
  line_description: z.string().nullable().optional(),
  line_item_code: z.string().nullable().optional(),
  extracted_order_side: z.string().nullable().optional(),
  source_xml_checksum: z.string().nullable().optional(),
  source_folder_s3_prefix: z.string().nullable().optional(),
  source_xml_s3_key: z.string().nullable().optional(),
  source_pdf_s3_key: z.string().nullable().optional(),
  imported_at: z.string().nullable().optional(),
})

export const parsedInvoicesLookupResponseSchema = z.object({
  status: z.literal('ok'),
  result: z.object({
    lookup_mode: z.enum(['invoice_uuid', 'order_reference_id', 'issued_month', 'source_xml_checksum']),
    user_name: z.string().optional(),
    invoice_uuid: z.string().optional(),
    order_reference_id: z.string().optional(),
    issued_month: z.string().optional(),
    source_xml_checksum: z.string().optional(),
    record_count: z.number(),
    records: z.array(parsedInvoiceLookupRecordSchema),
  }),
})

export type StockOrdersPersistResponse = z.infer<typeof stockOrdersPersistResponseSchema>
export type StockOrdersLookupResponse = z.infer<typeof stockOrdersLookupResponseSchema>
export type StockOrdersLookupRecord = z.infer<typeof stockOrdersLookupRecordSchema>
export type ParsedInvoicesLookupResponse = z.infer<typeof parsedInvoicesLookupResponseSchema>
export type ParsedInvoiceLookupRecord = z.infer<typeof parsedInvoiceLookupRecordSchema>
