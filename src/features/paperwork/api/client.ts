import { getJson, postJson } from '../../../shared/api/http'
import type { StockOrderRecord } from '../lib/stockOrders'
import {
  parsedInvoicesLookupResponseSchema,
  stockOrdersLookupResponseSchema,
  stockOrdersPersistResponseSchema,
} from './schemas'

export async function submitStockOrders(input: {
  fileName: string
  records: StockOrderRecord[]
  sourceFileChecksum: string
  userEmail: string
}) {
  const payload = await postJson('/orders', {
    file_name: input.fileName,
    records: input.records,
    source_file_checksum: input.sourceFileChecksum,
    user_name: input.userEmail,
  })

  return stockOrdersPersistResponseSchema.parse(payload)
}

export async function fetchStockOrdersBySymbol(symbol: string, limit = 1, userEmail?: string) {
  const params = new URLSearchParams({
    symbol,
    limit: String(limit),
  })
  if (userEmail) {
    params.set('user_name', userEmail)
  }
  const payload = await getJson(`/orders?${params.toString()}`)
  return stockOrdersLookupResponseSchema.parse(payload)
}

export async function fetchStockOrdersByCreatedMonth(createdMonth: string, limit = 500, userEmail?: string) {
  const params = new URLSearchParams({
    created_month: createdMonth,
    limit: String(limit),
  })
  if (userEmail) {
    params.set('user_name', userEmail)
  }
  const payload = await getJson(`/orders?${params.toString()}`)
  return stockOrdersLookupResponseSchema.parse(payload)
}

export async function fetchInvoicesByIssuedMonth(issuedMonth: string, userEmail?: string) {
  const params = new URLSearchParams({
    issued_month: issuedMonth,
  })
  if (userEmail) {
    params.set('user_name', userEmail)
  }
  const payload = await getJson(`/invoices?${params.toString()}`)
  return parsedInvoicesLookupResponseSchema.parse(payload)
}
