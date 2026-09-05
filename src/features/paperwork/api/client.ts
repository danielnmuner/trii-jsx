import { getJson, postJson } from '../../../shared/api/http'
import type { StockOrderRecord } from '../lib/stockOrders'
import {
  stockOrdersLookupResponseSchema,
  stockOrdersPersistResponseSchema,
} from './schemas'

export async function submitStockOrders(input: {
  fileName: string
  records: StockOrderRecord[]
  sourceFileChecksum: string
  userName: string
}) {
  const payload = await postJson('/orders', {
    file_name: input.fileName,
    records: input.records,
    source_file_checksum: input.sourceFileChecksum,
    user_name: input.userName,
  })

  return stockOrdersPersistResponseSchema.parse(payload)
}

export async function fetchStockOrdersBySymbol(symbol: string, limit = 1, userName?: string) {
  const params = new URLSearchParams({
    symbol,
    limit: String(limit),
  })
  if (userName) {
    params.set('user_name', userName)
  }
  const payload = await getJson(`/orders?${params.toString()}`)
  return stockOrdersLookupResponseSchema.parse(payload)
}

export async function fetchStockOrdersByCreatedMonth(createdMonth: string, limit = 500, userName?: string) {
  const params = new URLSearchParams({
    created_month: createdMonth,
    limit: String(limit),
  })
  if (userName) {
    params.set('user_name', userName)
  }
  const payload = await getJson(`/orders?${params.toString()}`)
  return stockOrdersLookupResponseSchema.parse(payload)
}
