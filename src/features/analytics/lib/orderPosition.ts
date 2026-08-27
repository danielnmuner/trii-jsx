import type { StockOrdersLookupRecord } from '../../paperwork/api/schemas'
import { getBogotaDateKey } from './colombiaBusinessCalendar'

export type OrderPositionSummary = {
  symbol: string
  availableQuantity: number
  weightedAveragePrice: number | null
  deltaValue: number | null
  deltaPct: number | null
}

export type DailyOrderPositionSummary = {
  symbol: string
  tradingDate: string
  availableQuantity: number
  weightedAveragePrice: number | null
  displayAveragePrice: number | null
  vsLastReferencePrice: number | null
  deltaValue: number | null
  deltaPct: number | null
  buyCount: number
  sellCount: number
  realizedProfit: number
  totalCommission: number
  totalNetProfit: number
  buyOrders: DailyOrderSummaryItem[]
  sellOrders: DailyOrderSummaryItem[]
}

type PositionLot = {
  quantity: number
  unitPrice: number
}

export type DailyOrderSummaryItem = {
  timestamp: string | null
  quantity: number
  price: number
  side: 'buy' | 'sell'
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

export function summarizeDailyOrderPositionTimeline(
  symbol: string,
  records: StockOrdersLookupRecord[],
  checkpoints: Array<{ tradingDate: string; lastPrice: number | null | undefined }>,
) {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const lots: PositionLot[] = []
  const approvedRecords = normalizeApprovedRecords(normalizedSymbol, records)
  const orderedCheckpoints = [...checkpoints]
    .filter((checkpoint) => checkpoint.tradingDate.trim().length > 0)
    .sort((left, right) => left.tradingDate.localeCompare(right.tradingDate))

  const summaries: Record<string, DailyOrderPositionSummary> = {}
  let recordIndex = 0

  for (const checkpoint of orderedCheckpoints) {
    let buyCount = 0
    let sellCount = 0
    let realizedProfit = 0
    let totalCommission = 0
    let buyQuantity = 0
    let buyCost = 0
    let sellQuantity = 0
    let sellValue = 0
    let soldCost = 0
    let soldConsumedQuantity = 0
    const buyOrders: DailyOrderSummaryItem[] = []
    const sellOrders: DailyOrderSummaryItem[] = []

    while (recordIndex < approvedRecords.length) {
      const record = approvedRecords[recordIndex]
      const recordTradingDate = resolveOrderDateKey(record)
      if (!recordTradingDate || recordTradingDate > checkpoint.tradingDate) {
        break
      }

      const quantity = normalizePositiveNumber(record.filled_quantity)
      const price = normalizePositiveNumber(record.price_per_share)
      const commission = normalizeNonNegativeNumber(record.commission_amount)
      const side = (record.order_side ?? '').trim().toLowerCase()

      if (quantity && price && side) {
        if (side === 'buy') {
          lots.push({
            quantity,
            unitPrice: price,
          })
          if (recordTradingDate === checkpoint.tradingDate) {
            buyCount += 1
            buyQuantity += quantity
            buyCost += quantity * price
            totalCommission += commission
            buyOrders.push({
              timestamp: resolveOrderIsoTimestamp(record),
              quantity,
              price,
              side: 'buy',
            })
          }
        } else if (side === 'sell') {
          const saleResult = consumeLotsFifoWithProfit(lots, quantity, price)
          if (recordTradingDate === checkpoint.tradingDate) {
            sellCount += 1
            realizedProfit += saleResult.realizedProfit
            totalCommission += commission
            sellQuantity += quantity
            sellValue += quantity * price
            soldCost += saleResult.consumedCost
            soldConsumedQuantity += saleResult.consumedQuantity
            sellOrders.push({
              timestamp: resolveOrderIsoTimestamp(record),
              quantity,
              price,
              side: 'sell',
            })
          }
        }
      }

      recordIndex += 1
    }

    const availableQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0)
    const totalCost = lots.reduce((sum, lot) => sum + lot.quantity * lot.unitPrice, 0)
    const weightedAveragePrice = availableQuantity > 0 ? totalCost / availableQuantity : null
    const averageBuyPrice = buyQuantity > 0 ? buyCost / buyQuantity : null
    const averageSellPrice = sellQuantity > 0 ? sellValue / sellQuantity : null
    const averageSoldCostPrice = soldConsumedQuantity > 0 ? soldCost / soldConsumedQuantity : null
    const displayAveragePrice = weightedAveragePrice ?? averageBuyPrice ?? averageSoldCostPrice
    const vsLastReferencePrice = sellQuantity > 0 ? averageSellPrice : displayAveragePrice
    const normalizedLastPrice =
      typeof checkpoint.lastPrice === 'number' && Number.isFinite(checkpoint.lastPrice) ? checkpoint.lastPrice : null
    const deltaValue =
      vsLastReferencePrice !== null && normalizedLastPrice !== null
        ? normalizedLastPrice - vsLastReferencePrice
        : null
    const deltaPct =
      vsLastReferencePrice !== null && vsLastReferencePrice > 0 && deltaValue !== null
        ? (deltaValue / vsLastReferencePrice) * 100
        : null
    const totalNetProfit = sellCount > 0 ? realizedProfit - totalCommission : 0

    summaries[checkpoint.tradingDate] = {
      symbol: normalizedSymbol,
      tradingDate: checkpoint.tradingDate,
      availableQuantity,
      weightedAveragePrice,
      displayAveragePrice,
      vsLastReferencePrice,
      deltaValue,
      deltaPct,
      buyCount,
      sellCount,
      realizedProfit,
      totalCommission,
      totalNetProfit,
      buyOrders,
      sellOrders,
    }
  }

  return summaries
}

function normalizeApprovedRecords(symbol: string, records: StockOrdersLookupRecord[]) {
  return [...records]
    .filter((record) => (record.symbol ?? symbol).trim().toUpperCase() === symbol)
    .filter((record) => (record.normalized_status ?? '').trim().toLowerCase() === 'approved')
    .sort((left, right) => resolveOrderTimestamp(left) - resolveOrderTimestamp(right))
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

function consumeLotsFifoWithProfit(lots: PositionLot[], sellQuantity: number, sellPrice: number) {
  let remaining = sellQuantity
  let realizedProfit = 0
  let consumedCost = 0
  let consumedQuantityTotal = 0

  while (remaining > 0 && lots.length > 0) {
    const head = lots[0]
    const consumedQuantity = Math.min(head.quantity, remaining)
    realizedProfit += (sellPrice - head.unitPrice) * consumedQuantity
    consumedCost += head.unitPrice * consumedQuantity
    consumedQuantityTotal += consumedQuantity

    if (head.quantity <= remaining) {
      remaining -= head.quantity
      lots.shift()
      continue
    }

    head.quantity -= remaining
    remaining = 0
  }

  return {
    realizedProfit,
    consumedCost,
    consumedQuantity: consumedQuantityTotal,
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

function resolveOrderDateKey(record: StockOrdersLookupRecord) {
  if (typeof record.created_at === 'string' && record.created_at.trim().length > 0) {
    return getBogotaDateKey(record.created_at)
  }

  const createdAtSymbolPrefix = typeof record.created_at_symbol === 'string' ? record.created_at_symbol.split('#')[0] : ''
  if (createdAtSymbolPrefix) {
    return getBogotaDateKey(createdAtSymbolPrefix)
  }

  return null
}

function resolveOrderIsoTimestamp(record: StockOrdersLookupRecord) {
  if (typeof record.created_at === 'string' && record.created_at.trim().length > 0) {
    return record.created_at
  }

  const createdAtSymbolPrefix = typeof record.created_at_symbol === 'string' ? record.created_at_symbol.split('#')[0] : ''
  return createdAtSymbolPrefix || null
}

function normalizePositiveNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

function normalizeNonNegativeNumber(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}
