import type { StockOrdersLookupRecord, ParsedInvoiceLookupRecord } from '../api/schemas'
import { invoiceSymbolAliasMap } from './invoiceSymbolMap'

const TRII_PRO_COMMISSION_RATE = 0.00125

export type InvoiceDocumentRow = {
  invoiceNumber: string
  invoiceUuid: string
  issuedAt: string | null
  orderReferenceId: string | null
  side: 'buy' | 'sell' | 'unknown'
  symbol: string | null
  baseAmount: number
  payableAmount: number
  taxAmount: number
  totalAmount: number
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
  tradedGrossAmount: number
  orderCommission: number
  calculatedCommission: number
  invoiceBaseAmount: number
  invoiceTaxAmount: number
  invoiceTotalAmount: number
  feeGap: number
  openQuantity: number
  averageCost: number | null
  closePrice: number | null
  mtmPnl: number | null
}

export type PaperworkAnomalyRow = {
  scope: string
  severity: 'high' | 'medium' | 'low'
  signal: string
  detail: string
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
  tradedGrossAmount: number
  orderCommission: number
  calculatedCommission: number
  invoiceBaseAmount: number
  invoiceTaxAmount: number
  invoiceTotalAmount: number
  feeGap: number
  openQuantity: number
  mtmPnl: number
}

export type PaperworkAnalyticsModel = {
  summary: PaperworkAnalyticsSummary
  rows: PaperworkAnalyticsRow[]
  anomalies: PaperworkAnomalyRow[]
  invoiceRows: InvoiceDocumentRow[]
  unmappedInvoices: InvoiceDocumentRow[]
}

type BuildPaperworkAnalyticsInput = {
  ordersMonthRecords: StockOrdersLookupRecord[]
  invoicesMonthRecords: ParsedInvoiceLookupRecord[]
  symbolOrderHistoryBySymbol: Record<string, StockOrdersLookupRecord[]>
  latestClosingPriceBySymbol: Record<string, number | null>
}

type AggregatedSymbolRow = PaperworkAnalyticsRow

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
      tradedGrossAmount: 0,
      orderCommission: 0,
      calculatedCommission: 0,
      invoiceBaseAmount: 0,
      invoiceTaxAmount: 0,
      invoiceTotalAmount: 0,
      feeGap: 0,
      openQuantity: 0,
      averageCost: null,
      closePrice: null,
      mtmPnl: null,
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
    const grossAmount = Math.abs(normalizeNumber(record.gross_amount))
    const side = normalizeSide(record.order_side)
    row.orderCount += 1
    row.orderCommission += commission
    row.tradedGrossAmount += grossAmount
    row.calculatedCommission += grossAmount * TRII_PRO_COMMISSION_RATE

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
    row.invoiceBaseAmount += invoice.baseAmount
    row.invoiceTaxAmount += invoice.taxAmount
    row.invoiceTotalAmount += invoice.totalAmount
    row.feeGap = row.invoiceTotalAmount - row.orderCommission
  }

  for (const [symbol, row] of rowsBySymbol.entries()) {
    const position = summarizeOpenPosition(
      symbol,
      input.symbolOrderHistoryBySymbol[symbol] ?? [],
      input.latestClosingPriceBySymbol[symbol] ?? null,
    )
    row.openQuantity = position.openQuantity
    row.averageCost = position.averageCost
    row.closePrice = position.closePrice
    row.mtmPnl = position.mtmPnl
  }

  const rows = Array.from(rowsBySymbol.values()).sort((left, right) => {
    const mtmDelta = Math.abs(right.mtmPnl ?? 0) - Math.abs(left.mtmPnl ?? 0)
    if (mtmDelta !== 0) {
      return mtmDelta
    }

    const feeDelta = Math.abs(right.feeGap) - Math.abs(left.feeGap)
    if (feeDelta !== 0) {
      return feeDelta
    }

    return left.symbol.localeCompare(right.symbol)
  })

  const anomalies = buildAnomalies(rows, invoiceRows)

  const summary: PaperworkAnalyticsSummary = rows.reduce(
    (accumulator, row) => {
      accumulator.approvedOrderCount += row.orderCount
      accumulator.buyCount += row.buyCount
      accumulator.sellCount += row.sellCount
      accumulator.boughtQuantity += row.boughtQuantity
      accumulator.soldQuantity += row.soldQuantity
      accumulator.tradedGrossAmount += row.tradedGrossAmount
      accumulator.orderCommission += row.orderCommission
      accumulator.calculatedCommission += row.calculatedCommission
      accumulator.invoiceBaseAmount += row.invoiceBaseAmount
      accumulator.invoiceTaxAmount += row.invoiceTaxAmount
      accumulator.invoiceTotalAmount += row.invoiceTotalAmount
      accumulator.feeGap += row.feeGap
      accumulator.openQuantity += row.openQuantity
      accumulator.mtmPnl += row.mtmPnl ?? 0
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
      tradedGrossAmount: 0,
      orderCommission: 0,
      calculatedCommission: 0,
      invoiceBaseAmount: 0,
      invoiceTaxAmount: 0,
      invoiceTotalAmount: 0,
      feeGap: 0,
      openQuantity: 0,
      mtmPnl: 0,
    },
  )

  return {
    summary,
    rows,
    anomalies,
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

function summarizeOpenPosition(symbol: string, records: StockOrdersLookupRecord[], closePrice: number | null) {
  const normalizedSymbol = symbol.trim().toUpperCase()
  const approvedRecords = [...records]
    .filter((record) => (record.symbol ?? normalizedSymbol).trim().toUpperCase() === normalizedSymbol)
    .filter((record) => normalizeStatus(record.normalized_status) === 'approved')
    .sort((left, right) => resolveOrderTimestamp(left) - resolveOrderTimestamp(right))

  const lots: Array<{ quantity: number; unitPrice: number; remainingCommission: number }> = []

  for (const record of approvedRecords) {
    const quantity = normalizeNumber(record.filled_quantity)
    const price = normalizeNumber(record.price_per_share)
    const commission = normalizeNumber(record.commission_amount)
    const side = normalizeSide(record.order_side)

    if (!quantity || !price || !side) {
      continue
    }

    if (side === 'buy') {
      lots.push({
        quantity,
        unitPrice: price,
        remainingCommission: commission,
      })
      continue
    }

    let remaining = quantity
    while (remaining > 0 && lots.length > 0) {
      const head = lots[0]
      const startingQuantity = head.quantity
      const consumedQuantity = Math.min(head.quantity, remaining)
      const consumedCommission =
        startingQuantity > 0 ? (head.remainingCommission * consumedQuantity) / startingQuantity : 0
      head.remainingCommission = Math.max(0, head.remainingCommission - consumedCommission)

      if (head.quantity <= remaining) {
        remaining -= head.quantity
        lots.shift()
        continue
      }

      head.quantity -= remaining
      remaining = 0
    }
  }

  const openQuantity = lots.reduce((sum, lot) => sum + lot.quantity, 0)
  const costBasis = lots.reduce((sum, lot) => sum + lot.quantity * lot.unitPrice, 0)
  const remainingCommission = lots.reduce((sum, lot) => sum + lot.remainingCommission, 0)
  const averageCost = openQuantity > 0 ? costBasis / openQuantity : null
  const mtmPnl =
    openQuantity > 0 && closePrice !== null
      ? closePrice * openQuantity - costBasis - remainingCommission
      : null

  return {
    openQuantity,
    averageCost,
    closePrice,
    mtmPnl,
  }
}

function buildAnomalies(rows: PaperworkAnalyticsRow[], invoiceRows: InvoiceDocumentRow[]) {
  const anomalies: PaperworkAnomalyRow[] = []

  for (const row of rows) {
    if (row.orderCount > row.invoiceCount) {
      anomalies.push({
        scope: row.symbol,
        severity: 'high',
        signal: 'Missing invoices',
        detail: `${formatCount(row.orderCount - row.invoiceCount)} approved order(s) do not have invoice coverage in the selected period.`,
      })
    } else if (row.invoiceCount > row.orderCount) {
      anomalies.push({
        scope: row.symbol,
        severity: 'medium',
        signal: 'Extra invoices',
        detail: `${formatCount(row.invoiceCount - row.orderCount)} invoice(s) do not reconcile to orders in the selected period.`,
      })
    }

    if (Math.abs(row.feeGap) >= 1_000) {
      anomalies.push({
        scope: row.symbol,
        severity: Math.abs(row.feeGap) >= 5_000 ? 'high' : 'medium',
        signal: 'Comm diff',
        detail: `Invoice total differs from order commissions by ${formatSignedAmount(row.feeGap)} COP.`,
      })
    }
  }

  for (const invoice of invoiceRows.filter((row) => !row.symbol).slice(0, 12)) {
    anomalies.push({
      scope: invoice.invoiceNumber,
      severity: 'high',
      signal: 'Unmapped invoice',
      detail: invoice.description ?? 'The invoice description is empty and cannot be mapped.',
    })
  }

  return anomalies.sort((left, right) => rankSeverity(right.severity) - rankSeverity(left.severity))
}

function rankSeverity(value: PaperworkAnomalyRow['severity']) {
  if (value === 'high') {
    return 3
  }
  if (value === 'medium') {
    return 2
  }
  return 1
}

function toInvoiceDocumentRow(record: ParsedInvoiceLookupRecord): InvoiceDocumentRow {
  const side = normalizeSide(record.extracted_order_side) ?? normalizeInvoiceSide(record.line_description)
  const payableAmount = normalizeNumber(record.payable_amount)
  const taxAmount = normalizeNumber(record.tax_amount)
  const taxExclusiveAmount = normalizeNumber(record.tax_exclusive_amount)
  const taxInclusiveAmount = normalizeNumber(record.tax_inclusive_amount)
  const baseAmount = taxExclusiveAmount || Math.max(0, payableAmount - taxAmount)
  const totalAmount = taxInclusiveAmount || payableAmount || baseAmount + taxAmount

  return {
    invoiceNumber: record.invoice_number?.trim() || record.invoice_uuid,
    invoiceUuid: record.invoice_uuid,
    issuedAt: normalizeText(record.issued_at),
    orderReferenceId: normalizeText(record.order_reference_id),
    side: side ?? 'unknown',
    symbol: inferInvoiceSymbol(record),
    baseAmount,
    payableAmount,
    taxAmount,
    totalAmount,
    description: normalizeText(record.line_description),
  }
}

function compareDescendingTimestamps(left: string | null, right: string | null) {
  const leftTime = left ? new Date(left).getTime() : Number.NEGATIVE_INFINITY
  const rightTime = right ? new Date(right).getTime() : Number.NEGATIVE_INFINITY
  return rightTime - leftTime
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

function formatSignedAmount(value: number) {
  const rounded = Math.round(value)
  return `${rounded >= 0 ? '+' : ''}${rounded.toLocaleString('en-US')}`
}

function formatCount(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString('en-US')
}
