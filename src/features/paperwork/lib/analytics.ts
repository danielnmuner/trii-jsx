import { summarizeDailyOrderPositionTimeline } from '../../analytics/lib/orderPosition'
import type { StockOrdersLookupRecord, ParsedInvoiceLookupRecord } from '../api/schemas'
import { invoiceSymbolAliasMap } from './invoiceSymbolMap'

export type InvoiceDocumentRow = {
  invoiceNumber: string
  invoiceUuid: string
  issuedAt: string | null
  orderReferenceId: string | null
  side: 'buy' | 'sell' | 'unknown'
  symbol: string | null
  payableAmount: number
  taxAmount: number
  description: string | null
}

export type PaperworkAnalyticsRow = {
  symbol: string
  orderCount: number
  invoiceCount: number
  buyCount: number
  sellCount: number
  boughtQuantity: number
  soldQuantity: number
  orderCommission: number
  invoiceFees: number
  feeGap: number
  realizedNet: number
}

export type PaperworkAnalyticsSummary = {
  approvedOrderCount: number
  invoiceCount: number
  mappedInvoiceCount: number
  unmappedInvoiceCount: number
  buyCount: number
  sellCount: number
  boughtQuantity: number
  soldQuantity: number
  orderCommission: number
  invoiceFees: number
  feeGap: number
  realizedNet: number
}

export type PaperworkAnalyticsModel = {
  summary: PaperworkAnalyticsSummary
  rows: PaperworkAnalyticsRow[]
  invoiceRows: InvoiceDocumentRow[]
  unmappedInvoices: InvoiceDocumentRow[]
}

type BuildPaperworkAnalyticsInput = {
  ordersMonthRecords: StockOrdersLookupRecord[]
  invoicesMonthRecords: ParsedInvoiceLookupRecord[]
  symbolOrderHistoryBySymbol: Record<string, StockOrdersLookupRecord[]>
}

type AggregatedSymbolRow = PaperworkAnalyticsRow & {
  tradingDates: Set<string>
}

export function buildPaperworkAnalytics(input: BuildPaperworkAnalyticsInput): PaperworkAnalyticsModel {
  const approvedOrders = input.ordersMonthRecords
    .filter((record) => normalizeStatus(record.normalized_status) === 'approved')
    .sort((left, right) => resolveOrderTimestamp(left) - resolveOrderTimestamp(right))

  const invoiceRows = input.invoicesMonthRecords
    .map((record) => toInvoiceDocumentRow(record))
    .sort((left, right) => compareDescendingTimestamps(left.issuedAt, right.issuedAt))

  const rowsBySymbol = new Map<string, AggregatedSymbolRow>()
  const ensureRow = (symbol: string) => {
    const normalizedSymbol = symbol.trim().toUpperCase()
    const existing = rowsBySymbol.get(normalizedSymbol)
    if (existing) {
      return existing
    }

    const created: AggregatedSymbolRow = {
      symbol: normalizedSymbol,
      orderCount: 0,
      invoiceCount: 0,
      buyCount: 0,
      sellCount: 0,
      boughtQuantity: 0,
      soldQuantity: 0,
      orderCommission: 0,
      invoiceFees: 0,
      feeGap: 0,
      realizedNet: 0,
      tradingDates: new Set<string>(),
    }
    rowsBySymbol.set(normalizedSymbol, created)
    return created
  }

  for (const record of approvedOrders) {
    const symbol = String(record.symbol ?? '').trim().toUpperCase()
    if (!symbol) {
      continue
    }

    const row = ensureRow(symbol)
    const quantity = normalizeNumber(record.filled_quantity)
    const commission = normalizeNumber(record.commission_amount)
    const side = normalizeSide(record.order_side)
    row.orderCount += 1
    row.orderCommission += commission

    const tradingDate = resolveOrderDateKey(record)
    if (tradingDate) {
      row.tradingDates.add(tradingDate)
    }

    if (side === 'buy') {
      row.buyCount += 1
      row.boughtQuantity += quantity
    } else if (side === 'sell') {
      row.sellCount += 1
      row.soldQuantity += quantity
    }
  }

  for (const invoice of invoiceRows) {
    if (!invoice.symbol) {
      continue
    }

    const row = ensureRow(invoice.symbol)
    row.invoiceCount += 1
    row.invoiceFees += invoice.payableAmount
  }

  for (const row of rowsBySymbol.values()) {
    row.feeGap = row.invoiceFees - row.orderCommission
    const history = input.symbolOrderHistoryBySymbol[row.symbol] ?? []
    if (history.length === 0 || row.tradingDates.size === 0) {
      continue
    }

    const checkpoints = Array.from(row.tradingDates)
      .sort((left, right) => left.localeCompare(right))
      .map((tradingDate) => ({ tradingDate, lastPrice: null }))
    const timeline = summarizeDailyOrderPositionTimeline(row.symbol, history, checkpoints)
    row.realizedNet = checkpoints.reduce((sum, checkpoint) => {
      return sum + normalizeNumber(timeline[checkpoint.tradingDate]?.totalNetProfit)
    }, 0)
  }

  const rows = Array.from(rowsBySymbol.values())
    .map(({ tradingDates: _tradingDates, ...row }) => row)
    .sort((left, right) => {
      const invoiceDelta = right.invoiceFees - left.invoiceFees
      if (invoiceDelta !== 0) {
        return invoiceDelta
      }

      return left.symbol.localeCompare(right.symbol)
    })

  const summary: PaperworkAnalyticsSummary = rows.reduce(
    (accumulator, row) => {
      accumulator.approvedOrderCount += row.orderCount
      accumulator.buyCount += row.buyCount
      accumulator.sellCount += row.sellCount
      accumulator.boughtQuantity += row.boughtQuantity
      accumulator.soldQuantity += row.soldQuantity
      accumulator.orderCommission += row.orderCommission
      accumulator.invoiceFees += row.invoiceFees
      accumulator.feeGap += row.feeGap
      accumulator.realizedNet += row.realizedNet
      return accumulator
    },
    {
      approvedOrderCount: 0,
      invoiceCount: invoiceRows.length,
      mappedInvoiceCount: invoiceRows.filter((row) => row.symbol).length,
      unmappedInvoiceCount: invoiceRows.filter((row) => !row.symbol).length,
      buyCount: 0,
      sellCount: 0,
      boughtQuantity: 0,
      soldQuantity: 0,
      orderCommission: 0,
      invoiceFees: 0,
      feeGap: 0,
      realizedNet: 0,
    },
  )

  return {
    summary,
    rows,
    invoiceRows,
    unmappedInvoices: invoiceRows.filter((row) => !row.symbol),
  }
}

export function inferInvoiceSymbol(
  record: Pick<ParsedInvoiceLookupRecord, 'line_description' | 'line_item_code'>,
) {
  const candidates = [record.line_item_code, record.line_description]
    .map((value) => normalizeInvoiceText(value))
    .filter(Boolean)

  if (candidates.length === 0) {
    return null
  }

  const aliasEntries = Object.entries(invoiceSymbolAliasMap)
    .flatMap(([symbol, aliases]) =>
      aliases.map((alias) => ({
        symbol,
        alias: normalizeInvoiceText(alias),
      })),
    )
    .sort((left, right) => right.alias.length - left.alias.length)

  for (const entry of aliasEntries) {
    if (candidates.some((candidate) => candidate.includes(entry.alias))) {
      return entry.symbol
    }
  }

  return null
}

function toInvoiceDocumentRow(record: ParsedInvoiceLookupRecord): InvoiceDocumentRow {
  const side = normalizeSide(record.extracted_order_side) ?? normalizeInvoiceSide(record.line_description)
  return {
    invoiceNumber: record.invoice_number?.trim() || record.invoice_uuid,
    invoiceUuid: record.invoice_uuid,
    issuedAt: normalizeText(record.issued_at),
    orderReferenceId: normalizeText(record.order_reference_id),
    side: side ?? 'unknown',
    symbol: inferInvoiceSymbol(record),
    payableAmount: normalizeNumber(record.payable_amount),
    taxAmount: normalizeNumber(record.tax_amount),
    description: normalizeText(record.line_description),
  }
}

function compareDescendingTimestamps(left: string | null, right: string | null) {
  const leftTime = left ? new Date(left).getTime() : Number.NEGATIVE_INFINITY
  const rightTime = right ? new Date(right).getTime() : Number.NEGATIVE_INFINITY
  return rightTime - leftTime
}

function resolveOrderDateKey(record: StockOrdersLookupRecord) {
  const createdAt = normalizeText(record.created_at)
  if (createdAt) {
    return createdAt.slice(0, 10)
  }

  const createdAtSymbol = normalizeText(record.created_at_symbol)
  return createdAtSymbol ? createdAtSymbol.slice(0, 10) : null
}

function resolveOrderTimestamp(record: StockOrdersLookupRecord) {
  const createdAt = normalizeText(record.created_at)
  if (createdAt) {
    const timestamp = new Date(createdAt).getTime()
    if (Number.isFinite(timestamp)) {
      return timestamp
    }
  }

  const createdAtSymbol = normalizeText(record.created_at_symbol)
  if (createdAtSymbol) {
    const timestamp = new Date(createdAtSymbol.split('#')[0] ?? '').getTime()
    if (Number.isFinite(timestamp)) {
      return timestamp
    }
  }

  return Number.MAX_SAFE_INTEGER
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase()
}

function normalizeSide(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'buy' || normalized === 'sell') {
    return normalized
  }

  return null
}

function normalizeInvoiceSide(value: string | null | undefined) {
  const normalized = normalizeInvoiceText(value)
  if (!normalized) {
    return null
  }
  if (normalized.includes(' COMPRA ') || normalized.startsWith('COMPRA ') || normalized.endsWith(' COMPRA')) {
    return 'buy'
  }
  if (normalized.includes(' VENTA ') || normalized.startsWith('VENTA ') || normalized.endsWith(' VENTA')) {
    return 'sell'
  }
  return null
}

function normalizeInvoiceText(value: string | null | undefined) {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
  return normalized ? ` ${normalized} ` : ''
}

function normalizeText(value: string | null | undefined) {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function normalizeNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}
