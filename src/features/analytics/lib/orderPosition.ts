import type { StockOrdersLookupRecord } from '../../paperwork/api/schemas'

export type OrderPositionSummary = {
  symbol: string
  availableQuantity: number
  weightedAveragePrice: number | null
  deltaValue: number | null
  deltaPct: number | null
}

type PositionLot = {
  quantity: number
  unitPrice: number
}

export function summarizeOrderPosition(symbol: string, records: StockOrdersLookupRecord[], lastPrice: number | null | undefined): OrderPositionSummary {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const lots: PositionLot[] = []

  const approvedRecords = [...records]
    .filter((record) => (record.symbol ?? normalizedSymbol).trim().toUpperCase() === normalizedSymbol)
    .filter((record) => (record.normalized_status ?? '').trim().toLowerCase() === 'approved')
    .sort((left, right) => resolveOrderTimestamp(left) - resolveOrderTimestamp(right))

  for (const record of approvedRecords) {
    const quantity = normalizePositiveNumber(record.filled_quantity)
    const price = normalizePositiveNumber(record.price_per_share)
    const side = (record.order_side ?? '').trim().toLowerCase()

    if (!quantity || !price || !side) {
      continue
    }

    if (side === 'buy') {
      lots.push({
        quantity,
        unitPrice: price,
      })
      continue
    }

    if (side === 'sell') {
      consumeLotsFifo(lots, quantity)
    }
  }

  const availableQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0)
  const totalCost = lots.reduce((sum, lot) => sum + lot.quantity * lot.unitPrice, 0)
  const weightedAveragePrice = availableQuantity > 0 ? totalCost / availableQuantity : null
  const normalizedLastPrice = typeof lastPrice === 'number' && Number.isFinite(lastPrice) ? lastPrice : null
  const deltaValue =
    weightedAveragePrice !== null && normalizedLastPrice !== null
      ? normalizedLastPrice - weightedAveragePrice
      : null
  const deltaPct =
    weightedAveragePrice !== null && weightedAveragePrice > 0 && deltaValue !== null
      ? (deltaValue / weightedAveragePrice) * 100
      : null

  return {
    symbol: normalizedSymbol,
    availableQuantity,
    weightedAveragePrice,
    deltaValue,
    deltaPct,
  }
}

function consumeLotsFifo(lots: PositionLot[], sellQuantity: number) {
  let remaining = sellQuantity

  while (remaining > 0 && lots.length > 0) {
    const head = lots[0]
    if (head.quantity <= remaining) {
      remaining -= head.quantity
      lots.shift()
      continue
    }

    head.quantity -= remaining
    remaining = 0
  }
}

function resolveOrderTimestamp(record: StockOrdersLookupRecord) {
  const createdAt = typeof record.created_at === 'string' ? new Date(record.created_at).getTime() : Number.NaN
  if (Number.isFinite(createdAt)) {
    return createdAt
  }

  const createdAtSymbolPrefix = typeof record.created_at_symbol === 'string' ? record.created_at_symbol.split('#')[0] : ''
  const createdAtSymbolTime = createdAtSymbolPrefix ? new Date(createdAtSymbolPrefix).getTime() : Number.NaN
  if (Number.isFinite(createdAtSymbolTime)) {
    return createdAtSymbolTime
  }

  return Number.MAX_SAFE_INTEGER
}

function normalizePositiveNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}
