import type { StockOrdersLookupRecord, ParsedInvoiceLookupRecord } from '../api/schemas'
import { invoiceSymbolAliasMap } from './invoiceSymbolMap'

export const TRII_PRO_COMMISSION_RATE = 0.00125
export const VAT_RATE = 0.19
const INVOICE_IGNORE_PATTERNS = [
  'SERVICIO ACCESO PREMIUM TRII APP',
]

type InvoiceCategory = 'trade' | 'dividend' | 'ignored'

export type InvoiceDocumentRow = {
  invoiceNumber: string
  invoiceUuid: string
  issuedAt: string | null
  orderReferenceId: string | null
  sourceXmlName: string | null
  side: 'buy' | 'sell' | 'unknown'
  symbol: string | null
  baseAmount: number
  payableAmount: number
  taxAmount: number
  totalAmount: number
  description: string | null
  realizedPnl: number | null
  allocatedQuantity: number | null
  relatedInvoiceNumbers: string | null
  hasRelatedInvoices: boolean
  category: InvoiceCategory
}

export type PaperworkReconciliationRow = {
  symbol: string
  tradingDate: string | null
  side: 'buy' | 'sell' | 'unknown'
  orderCount: number
  invoiceCount: number
  quantity: number
  orderCommission: number
  invoiceTotalAmount: number
  differenceAmount: number
}

type SellExecution = {
  tradingDate: string | null
  quantity: number
  realizedPnl: number
}

export type PaperworkAnalyticsRow = {
  symbol: string
  orderCount: number
  invoiceCount: number
  buyCount: number
  sellCount: number
  boughtQuantity: number
  soldQuantity: number
  buyGrossAmount: number
  sellGrossAmount: number
  tradedGrossAmount: number
  orderCommission: number
  calculatedCommission: number
  invoiceBaseAmount: number
  invoiceTaxAmount: number
  invoiceTotalAmount: number
  feeGap: number
  realizedPnl: number
  openQuantity: number
  averageCost: number | null
  closePrice: number | null
  remainingBuyCommission: number
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
  realizedPnl: number
  openQuantity: number
  mtmPnl: number
}

export type PaperworkAnalyticsModel = {
  summary: PaperworkAnalyticsSummary
  rows: PaperworkAnalyticsRow[]
  tableRows: PaperworkTableRow[]
  anomalies: PaperworkAnomalyRow[]
  alertRows: PaperworkAlertRow[]
  invoiceRows: InvoiceDocumentRow[]
  dividendRows: InvoiceDocumentRow[]
  unmappedInvoices: InvoiceDocumentRow[]
}

export type PaperworkAlertRow = {
  id: string
  signal: string
  severity: 'high' | 'medium' | 'low'
  symbol: string
  tradingDate: string | null
  side: 'buy' | 'sell' | 'unknown'
  orderCount: number
  invoiceCount: number
  orderCommission: number
  invoiceTotalAmount: number
  differenceAmount: number
  invoiceNumbers: string
  xmlNames: string
  detail: string
}

export type PaperworkTableRow = {
  id: string
  label: string
  scope: 'year' | 'month' | 'symbol'
  year: string
  month: string | null
  symbol: string | null
  orderCount: number
  invoiceCount: number
  buyCount: number
  sellCount: number
  boughtQuantity: number
  soldQuantity: number
  buyGrossAmount: number
  sellGrossAmount: number
  tradedGrossAmount: number
  orderCommission: number
  calculatedCommission: number
  invoiceBaseAmount: number
  invoiceTaxAmount: number
  invoiceTotalAmount: number
  feeGap: number
  realizedPnl: number
  openQuantity: number
  averageCost: number | null
  closePrice: number | null
  mtmPnl: number | null
  invoices: InvoiceDocumentRow[]
  children: PaperworkTableRow[]
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

  const allInvoiceRows = input.invoicesMonthRecords
    .map((record) => toInvoiceDocumentRow(record))
    .filter((row) => row.category !== 'ignored')
    .sort((left, right) => compareDescendingTimestamps(left.issuedAt, right.issuedAt))

  const dividendRows = allInvoiceRows.filter((row) => row.category === 'dividend')
  const invoiceRows = allInvoiceRows.filter((row) => row.category === 'trade')

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
      buyGrossAmount: 0,
      sellGrossAmount: 0,
      tradedGrossAmount: 0,
      orderCommission: 0,
      calculatedCommission: 0,
      invoiceBaseAmount: 0,
      invoiceTaxAmount: 0,
      invoiceTotalAmount: 0,
      feeGap: 0,
      realizedPnl: 0,
      openQuantity: 0,
      averageCost: null,
      closePrice: null,
      remainingBuyCommission: 0,
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
    row.calculatedCommission += grossAmount * TRII_PRO_COMMISSION_RATE * (1 + VAT_RATE)

    if (side === 'buy') {
      row.buyCount += 1
      row.boughtQuantity += quantity
      row.buyGrossAmount += grossAmount
    } else if (side === 'sell') {
      row.sellCount += 1
      row.soldQuantity += quantity
      row.sellGrossAmount += grossAmount
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

  const reconciliationRows = buildReconciliationRows(approvedOrders, invoiceRows)
  applyReconciliationAllocations(invoiceRows, reconciliationRows)

  for (const [symbol, row] of rowsBySymbol.entries()) {
    const position = summarizeOpenPosition(
      symbol,
      input.symbolOrderHistoryBySymbol[symbol] ?? [],
      input.latestClosingPriceBySymbol[symbol] ?? null,
    )
    row.openQuantity = position.openQuantity
    row.averageCost = position.averageCost
    row.closePrice = position.closePrice
    row.remainingBuyCommission = position.remainingBuyCommission
    row.mtmPnl = position.mtmPnl
    row.realizedPnl = position.realizedPnl
    applySellResultsToInvoices(invoiceRows, symbol, position.sellExecutions)
  }

  const rows = Array.from(rowsBySymbol.values()).sort((left, right) => {
    const realizedDelta = Math.abs(right.realizedPnl) - Math.abs(left.realizedPnl)
    if (realizedDelta !== 0) {
      return realizedDelta
    }

    const feeDelta = Math.abs(right.feeGap) - Math.abs(left.feeGap)
    if (feeDelta !== 0) {
      return feeDelta
    }

    return left.symbol.localeCompare(right.symbol)
  })

  const tableRows = buildPaperworkTableRows(approvedOrders, invoiceRows, rowsBySymbol)

  const anomalies = buildAnomalies(invoiceRows, reconciliationRows)
  const alertRows = buildAlertRows(invoiceRows, reconciliationRows)

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
      accumulator.realizedPnl += row.realizedPnl
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
      realizedPnl: 0,
      openQuantity: 0,
      mtmPnl: 0,
    },
  )

  return {
    summary,
    rows,
    tableRows,
    anomalies,
    alertRows,
    invoiceRows,
    dividendRows,
    unmappedInvoices: invoiceRows.filter((row) => !row.symbol),
  }
}

export function derivePaperworkAvailableYears(model: PaperworkAnalyticsModel) {
  const years = new Set<string>()

  for (const row of model.tableRows) {
    for (const child of row.children) {
      if (child.scope === 'year' && child.year) {
        years.add(child.year)
      }
    }
  }

  for (const invoice of [...model.invoiceRows, ...model.dividendRows, ...model.unmappedInvoices]) {
    const year = toCalendarYear(invoice.issuedAt)
    if (year) {
      years.add(year)
    }
  }

  return Array.from(years).sort((left, right) => right.localeCompare(left))
}

export function filterPaperworkAnalyticsByYear(model: PaperworkAnalyticsModel, year: string | null) {
  const normalizedYear = normalizePaperworkYear(year)
  if (!normalizedYear) {
    return model
  }

  const rowsBySymbol = new Map(model.rows.map((row) => [row.symbol, row]))
  const tableRows = model.tableRows
    .map((row) => filterSymbolTableRowByYear(row, normalizedYear, rowsBySymbol))
    .filter((row): row is PaperworkTableRow => row !== null)

  const rows = tableRows.map((row) => toAnalyticsRowFromTableRow(row, rowsBySymbol.get(row.label)))
  const invoiceRows = model.invoiceRows.filter((row) => toCalendarYear(row.issuedAt) === normalizedYear)
  const dividendRows = model.dividendRows.filter((row) => toCalendarYear(row.issuedAt) === normalizedYear)
  const unmappedInvoices = model.unmappedInvoices.filter((row) => toCalendarYear(row.issuedAt) === normalizedYear)
  const alertRows = model.alertRows.filter((row) => toCalendarYear(row.tradingDate) === normalizedYear)

  const summary = rows.reduce<PaperworkAnalyticsSummary>(
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
      accumulator.realizedPnl += row.realizedPnl
      accumulator.openQuantity += row.openQuantity
      accumulator.mtmPnl += row.mtmPnl ?? 0
      return accumulator
    },
    {
      approvedOrderCount: 0,
      invoiceCount: invoiceRows.length,
      mappedInvoiceCount: invoiceRows.filter((row) => row.symbol).length,
      unmappedInvoiceCount: unmappedInvoices.length,
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
      realizedPnl: 0,
      openQuantity: 0,
      mtmPnl: 0,
    },
  )

  return {
    ...model,
    summary,
    rows,
    tableRows,
    alertRows,
    invoiceRows,
    dividendRows,
    unmappedInvoices,
  }
}

function buildPaperworkTableRows(
  approvedOrders: StockOrdersLookupRecord[],
  invoiceRows: InvoiceDocumentRow[],
  overallRowsBySymbol: Map<string, AggregatedSymbolRow>,
) {
  const monthRowsByKey = new Map<string, PaperworkTableRow>()

  const ensureMonthRow = (year: string, month: string, symbol: string) => {
    const key = `${month}#${symbol}`
    const existing = monthRowsByKey.get(key)
    if (existing) {
      return existing
    }

    const created: PaperworkTableRow = {
      id: `month-${month}-${symbol}`,
      label: formatMonthName(month),
      scope: 'month',
      year,
      month,
      symbol,
      orderCount: 0,
      invoiceCount: 0,
      buyCount: 0,
      sellCount: 0,
      boughtQuantity: 0,
      soldQuantity: 0,
      buyGrossAmount: 0,
      sellGrossAmount: 0,
      tradedGrossAmount: 0,
      orderCommission: 0,
      calculatedCommission: 0,
      invoiceBaseAmount: 0,
      invoiceTaxAmount: 0,
      invoiceTotalAmount: 0,
      feeGap: 0,
      realizedPnl: 0,
      openQuantity: 0,
      averageCost: null,
      closePrice: null,
      mtmPnl: null,
      invoices: [],
      children: [],
    }
    monthRowsByKey.set(key, created)
    return created
  }

  for (const record of approvedOrders) {
    const symbol = String(record.symbol ?? '').trim().toUpperCase()
    const month = toCalendarMonth(record.created_at) ?? normalizeText(record.created_month)
    if (!symbol || !month) {
      continue
    }

    const year = month.slice(0, 4)
    const row = ensureMonthRow(year, month, symbol)
    const quantity = normalizeNumber(record.filled_quantity)
    const commission = normalizeNumber(record.commission_amount)
    const grossAmount = Math.abs(normalizeNumber(record.gross_amount))
    const side = normalizeSide(record.order_side)

    row.orderCount += 1
    row.orderCommission += commission
    row.tradedGrossAmount += grossAmount
    row.calculatedCommission += grossAmount * TRII_PRO_COMMISSION_RATE * (1 + VAT_RATE)

    if (side === 'buy') {
      row.buyCount += 1
      row.boughtQuantity += quantity
      row.buyGrossAmount += grossAmount
    } else if (side === 'sell') {
      row.sellCount += 1
      row.soldQuantity += quantity
      row.sellGrossAmount += grossAmount
    }
  }

  for (const invoice of invoiceRows) {
    if (!invoice.symbol) {
      continue
    }

    const month = toCalendarMonth(invoice.issuedAt)
    if (!month) {
      continue
    }

    const year = month.slice(0, 4)
    const row = ensureMonthRow(year, month, invoice.symbol)
    row.invoiceCount += 1
    row.invoiceBaseAmount += invoice.baseAmount
    row.invoiceTaxAmount += invoice.taxAmount
    row.invoiceTotalAmount += invoice.totalAmount
    row.invoices.push(invoice)
  }

  for (const [symbol, overallRow] of overallRowsBySymbol.entries()) {
    const sellInvoices = invoiceRows
      .filter((invoice) => invoice.symbol === symbol && invoice.side === 'sell')
      .sort((left, right) => compareAscendingTimestamps(left.issuedAt, right.issuedAt))

    for (const invoice of sellInvoices) {
      const month = toCalendarMonth(invoice.issuedAt)
      if (!month) {
        continue
      }

      const monthRow = monthRowsByKey.get(`${month}#${symbol}`)
      if (!monthRow) {
        continue
      }

      monthRow.realizedPnl += invoice.realizedPnl ?? 0
    }

    const latestMonth = Array.from(monthRowsByKey.values())
      .filter((row) => row.symbol === symbol)
      .sort((left, right) => (right.month ?? '').localeCompare(left.month ?? ''))[0]

    if (latestMonth) {
      latestMonth.averageCost = overallRow.averageCost
      latestMonth.openQuantity = overallRow.openQuantity
      latestMonth.closePrice = overallRow.closePrice
      latestMonth.mtmPnl = overallRow.mtmPnl
    }
  }

  for (const row of monthRowsByKey.values()) {
    row.feeGap = row.invoiceTotalAmount - row.orderCommission
    row.invoices.sort((left, right) => compareDescendingTimestamps(left.issuedAt, right.issuedAt))
  }

  const monthRows = Array.from(monthRowsByKey.values())
  const symbolKeys = Array.from(new Set(monthRows.map((row) => row.symbol).filter((symbol): symbol is string => Boolean(symbol))))

  return symbolKeys
    .sort((left, right) => {
      const leftAbs = Math.abs(overallRowsBySymbol.get(left)?.realizedPnl ?? 0)
      const rightAbs = Math.abs(overallRowsBySymbol.get(right)?.realizedPnl ?? 0)
      if (rightAbs !== leftAbs) {
        return rightAbs - leftAbs
      }
      return left.localeCompare(right)
    })
    .map((symbol) => {
      const symbolMonths = monthRows
        .filter((row) => row.symbol === symbol)
        .sort((left, right) => (right.month ?? '').localeCompare(left.month ?? ''))

      const yearsBySymbol = new Map<string, PaperworkTableRow[]>()
      for (const row of symbolMonths) {
        const current = yearsBySymbol.get(row.year) ?? []
        current.push(row)
        yearsBySymbol.set(row.year, current)
      }

      const yearRows = Array.from(yearsBySymbol.entries())
        .sort((left, right) => right[0].localeCompare(left[0]))
        .map(([year, rows]) =>
          makeGroupRow({
            id: `year-${symbol}-${year}`,
            label: year,
            scope: 'year',
            year,
            month: null,
            children: rows.sort((left, right) => (right.month ?? '').localeCompare(left.month ?? '')),
          }),
        )

      const overallRow = overallRowsBySymbol.get(symbol)

      return {
        ...makeGroupRow({
          id: `symbol-${symbol}`,
          label: symbol,
          scope: 'symbol',
          year: symbolMonths[0]?.year ?? '',
          month: null,
          children: yearRows,
        }),
        averageCost: overallRow?.averageCost ?? null,
        openQuantity: overallRow?.openQuantity ?? 0,
        closePrice: overallRow?.closePrice ?? null,
        mtmPnl: overallRow?.mtmPnl ?? null,
      }
    })
}

function makeGroupRow(input: {
  id: string
  label: string
  scope: 'symbol' | 'year' | 'month'
  year: string
  month: string | null
  children: PaperworkTableRow[]
}): PaperworkTableRow {
  return input.children.reduce<PaperworkTableRow>(
    (accumulator, child) => {
      accumulator.orderCount += child.orderCount
      accumulator.invoiceCount += child.invoiceCount
      accumulator.buyCount += child.buyCount
      accumulator.sellCount += child.sellCount
      accumulator.boughtQuantity += child.boughtQuantity
      accumulator.soldQuantity += child.soldQuantity
      accumulator.buyGrossAmount += child.buyGrossAmount
      accumulator.sellGrossAmount += child.sellGrossAmount
      accumulator.tradedGrossAmount += child.tradedGrossAmount
      accumulator.orderCommission += child.orderCommission
      accumulator.calculatedCommission += child.calculatedCommission
      accumulator.invoiceBaseAmount += child.invoiceBaseAmount
      accumulator.invoiceTaxAmount += child.invoiceTaxAmount
      accumulator.invoiceTotalAmount += child.invoiceTotalAmount
      accumulator.feeGap += child.feeGap
      accumulator.realizedPnl += child.realizedPnl
      return accumulator
    },
    {
      id: input.id,
      label: input.label,
      scope: input.scope,
      year: input.year,
      month: input.month,
      symbol: null,
      orderCount: 0,
      invoiceCount: 0,
      buyCount: 0,
      sellCount: 0,
      boughtQuantity: 0,
      soldQuantity: 0,
      buyGrossAmount: 0,
      sellGrossAmount: 0,
      tradedGrossAmount: 0,
      orderCommission: 0,
      calculatedCommission: 0,
      invoiceBaseAmount: 0,
      invoiceTaxAmount: 0,
      invoiceTotalAmount: 0,
      feeGap: 0,
      realizedPnl: 0,
      openQuantity: 0,
      averageCost: null,
      closePrice: null,
      mtmPnl: null,
      invoices: [],
      children: input.children,
    },
  )
}

function filterSymbolTableRowByYear(
  row: PaperworkTableRow,
  year: string,
  rowsBySymbol: Map<string, PaperworkAnalyticsRow>,
) {
  const matchingYears = row.children.filter((child) => child.scope === 'year' && child.year === year)
  if (matchingYears.length === 0) {
    return null
  }

  const baseRow = rowsBySymbol.get(row.label)
  return {
    ...makeGroupRow({
      id: `${row.id}-${year}`,
      label: row.label,
      scope: 'symbol',
      year,
      month: null,
      children: matchingYears,
    }),
    averageCost: baseRow?.averageCost ?? null,
    openQuantity: baseRow?.openQuantity ?? 0,
    closePrice: baseRow?.closePrice ?? null,
    mtmPnl: baseRow?.mtmPnl ?? null,
  }
}

function toAnalyticsRowFromTableRow(row: PaperworkTableRow, baseRow: PaperworkAnalyticsRow | undefined): PaperworkAnalyticsRow {
  return {
    symbol: row.label,
    orderCount: row.orderCount,
    invoiceCount: row.invoiceCount,
    buyCount: row.buyCount,
    sellCount: row.sellCount,
    boughtQuantity: row.boughtQuantity,
    soldQuantity: row.soldQuantity,
    buyGrossAmount: row.buyGrossAmount,
    sellGrossAmount: row.sellGrossAmount,
    tradedGrossAmount: row.tradedGrossAmount,
    orderCommission: row.orderCommission,
    calculatedCommission: row.calculatedCommission,
    invoiceBaseAmount: row.invoiceBaseAmount,
    invoiceTaxAmount: row.invoiceTaxAmount,
    invoiceTotalAmount: row.invoiceTotalAmount,
    feeGap: row.feeGap,
    realizedPnl: row.realizedPnl,
    openQuantity: baseRow?.openQuantity ?? 0,
    averageCost: baseRow?.averageCost ?? null,
    closePrice: baseRow?.closePrice ?? null,
    remainingBuyCommission: baseRow?.remainingBuyCommission ?? 0,
    mtmPnl: baseRow?.mtmPnl ?? null,
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

  if (candidates.some((candidate) => INVOICE_IGNORE_PATTERNS.some((pattern) => candidate.includes(` ${pattern} `)))) {
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
  const sellExecutions: SellExecution[] = []
  let realizedPnl = 0

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
    let matchedQuantity = 0
    let matchedCostBasis = 0
    let matchedBuyCommission = 0

    while (remaining > 0 && lots.length > 0) {
      const head = lots[0]
      const startingQuantity = head.quantity
      const consumedQuantity = Math.min(head.quantity, remaining)
      const consumedCommission =
        startingQuantity > 0 ? (head.remainingCommission * consumedQuantity) / startingQuantity : 0

      matchedQuantity += consumedQuantity
      matchedCostBasis += consumedQuantity * head.unitPrice
      matchedBuyCommission += consumedCommission
      head.remainingCommission = Math.max(0, head.remainingCommission - consumedCommission)

      if (head.quantity <= remaining) {
        remaining -= head.quantity
        lots.shift()
        continue
      }

      head.quantity -= remaining
      remaining = 0
    }

    const matchedSellCommission = quantity > 0 ? (commission * matchedQuantity) / quantity : 0
    const matchedGross = matchedQuantity * price
    const tradeRealizedPnl = matchedGross - matchedCostBasis - matchedBuyCommission - matchedSellCommission
    realizedPnl += tradeRealizedPnl
    sellExecutions.push({
      tradingDate: toCalendarDate(record.created_at),
      quantity: matchedQuantity,
      realizedPnl: tradeRealizedPnl,
    })
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
    realizedPnl,
    sellExecutions,
    openQuantity,
    averageCost,
    closePrice,
    remainingBuyCommission: remainingCommission,
    mtmPnl,
  }
}

function applySellResultsToInvoices(invoiceRows: InvoiceDocumentRow[], symbol: string, sellExecutions: SellExecution[]) {
  const pnlByDate = new Map<string, { quantity: number; realizedPnl: number }>()

  for (const execution of sellExecutions) {
    const tradingDate = execution.tradingDate?.trim()
    if (!tradingDate) {
      continue
    }

    const current = pnlByDate.get(tradingDate) ?? { quantity: 0, realizedPnl: 0 }
    current.quantity += execution.quantity
    current.realizedPnl += execution.realizedPnl
    pnlByDate.set(tradingDate, current)
  }

  for (const [tradingDate, aggregate] of pnlByDate.entries()) {
    const candidateInvoices = invoiceRows
      .filter(
        (invoice) =>
          invoice.symbol === symbol &&
          invoice.side === 'sell' &&
          toCalendarDate(invoice.issuedAt) === tradingDate,
      )
      .sort((left, right) => compareAscendingTimestamps(left.issuedAt, right.issuedAt))

    if (candidateInvoices.length === 0) {
      continue
    }

    const allocatedPnl = allocateAmountsByWeight(
      aggregate.realizedPnl,
      candidateInvoices.map((invoice) => invoice.totalAmount),
    )

    for (const [index, invoice] of candidateInvoices.entries()) {
      invoice.realizedPnl = allocatedPnl[index] ?? null
    }
  }
}

function applyReconciliationAllocations(invoiceRows: InvoiceDocumentRow[], reconciliationRows: PaperworkReconciliationRow[]) {
  for (const reconciliation of reconciliationRows) {
    const candidateInvoices = invoiceRows
      .filter(
        (invoice) =>
          invoice.symbol === reconciliation.symbol &&
          invoice.side === reconciliation.side &&
          toCalendarDate(invoice.issuedAt) === reconciliation.tradingDate,
      )
      .sort((left, right) => compareAscendingTimestamps(left.issuedAt, right.issuedAt))

    const invoiceGroups = groupInvoicesForAllocation(candidateInvoices)
    const fallbackGroup = invoiceGroups.length > 0 ? invoiceGroups : [candidateInvoices]

    for (const groupInvoices of fallbackGroup) {
      if (groupInvoices.length === 0) {
        continue
      }

      const groupQuantity = reconciliation.quantity * (sumInvoiceTotals(groupInvoices) / Math.max(sumInvoiceTotals(candidateInvoices), 1))
      const allocatedQuantities = allocateQuantitiesByWeight(
        groupQuantity,
        groupInvoices.map((invoice) => invoice.totalAmount),
      )
      const relatedInvoices = groupInvoices.length > 1
        ? groupInvoices.map((invoice) => invoice.invoiceNumber).join(', ')
        : null

      for (const [index, invoice] of groupInvoices.entries()) {
        invoice.allocatedQuantity = allocatedQuantities[index] ?? null
        invoice.relatedInvoiceNumbers = relatedInvoices
        invoice.hasRelatedInvoices = groupInvoices.length > 1
      }
    }
  }
}

function groupInvoicesForAllocation(invoices: InvoiceDocumentRow[]) {
  const byOrderReference = new Map<string, InvoiceDocumentRow[]>()
  const withoutOrderReference: InvoiceDocumentRow[] = []

  for (const invoice of invoices) {
    const orderReferenceId = invoice.orderReferenceId?.trim()
    if (!orderReferenceId) {
      withoutOrderReference.push(invoice)
      continue
    }

    const current = byOrderReference.get(orderReferenceId)
    if (current) {
      current.push(invoice)
    } else {
      byOrderReference.set(orderReferenceId, [invoice])
    }
  }

  const groups = Array.from(byOrderReference.values())
  if (withoutOrderReference.length > 0) {
    groups.push(withoutOrderReference)
  }

  return groups
}

function sumInvoiceTotals(invoices: InvoiceDocumentRow[]) {
  return invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0)
}

function buildReconciliationRows(orders: StockOrdersLookupRecord[], invoices: InvoiceDocumentRow[]) {
  type DraftRow = PaperworkReconciliationRow
  const byKey = new Map<string, DraftRow>()

  const ensureDraft = (symbol: string, tradingDate: string | null, side: DraftRow['side']) => {
    const normalizedSymbol = symbol.trim().toUpperCase()
    const normalizedDate = tradingDate ?? 'unknown-date'
    const key = `${normalizedSymbol}#${normalizedDate}#${side}`
    const existing = byKey.get(key)
    if (existing) {
      return existing
    }

    const created: DraftRow = {
      symbol: normalizedSymbol,
      tradingDate,
      side,
      orderCount: 0,
      invoiceCount: 0,
      quantity: 0,
      orderCommission: 0,
      invoiceTotalAmount: 0,
      differenceAmount: 0,
    }
    byKey.set(key, created)
    return created
  }

  for (const order of orders) {
    const symbol = String(order.symbol ?? '').trim().toUpperCase()
    const side = normalizeSide(order.order_side)
    if (!symbol || !side) {
      continue
    }

    const draft = ensureDraft(symbol, toCalendarDate(order.created_at), side)
    draft.orderCount += 1
    draft.quantity += normalizeNumber(order.filled_quantity)
    draft.orderCommission += normalizeNumber(order.commission_amount)
  }

  for (const invoice of invoices) {
    if (!invoice.symbol) {
      continue
    }

    const draft = ensureDraft(invoice.symbol, toCalendarDate(invoice.issuedAt), invoice.side)
    draft.invoiceCount += 1
    draft.invoiceTotalAmount += invoice.totalAmount
  }

  return Array.from(byKey.values())
    .map((row) => ({
      ...row,
      differenceAmount: row.invoiceTotalAmount - row.orderCommission,
    }))
    .sort((left, right) => {
      const leftTime = left.tradingDate ? new Date(left.tradingDate).getTime() : Number.NEGATIVE_INFINITY
      const rightTime = right.tradingDate ? new Date(right.tradingDate).getTime() : Number.NEGATIVE_INFINITY
      if (left.symbol !== right.symbol) {
        return left.symbol.localeCompare(right.symbol)
      }
      if (rightTime !== leftTime) {
        return rightTime - leftTime
      }
      return left.side.localeCompare(right.side)
    })
}

function buildAnomalies(invoiceRows: InvoiceDocumentRow[], reconciliationRows: PaperworkReconciliationRow[]) {
  const anomalies: PaperworkAnomalyRow[] = []

  for (const reconciliation of reconciliationRows) {
    const label = `${reconciliation.symbol} ${formatShortDate(reconciliation.tradingDate)} ${formatReconciliationSide(reconciliation.side)}`

    if (reconciliation.orderCount > 0 && reconciliation.invoiceCount === 0) {
      anomalies.push({
        scope: label,
        severity: 'high',
        signal: 'Missing invoices',
        detail: `${formatCount(reconciliation.orderCount)} orden(es) no tienen factura conciliada en esa fecha y lado.`,
      })
    } else if (reconciliation.invoiceCount > 0 && reconciliation.orderCount === 0) {
      anomalies.push({
        scope: label,
        severity: 'medium',
        signal: 'Extra invoices',
        detail: `${formatCount(reconciliation.invoiceCount)} factura(s) no tienen orden conciliada en esa fecha y lado.`,
      })
    }

    if (reconciliation.orderCount > 0 && reconciliation.invoiceCount > 0 && Math.abs(reconciliation.differenceAmount) >= 1_000) {
      anomalies.push({
        scope: label,
        severity: Math.abs(reconciliation.differenceAmount) >= 5_000 ? 'high' : 'medium',
        signal: 'Comm diff',
        detail: `Total factura difiere de comision orden por ${formatSignedAmount(reconciliation.differenceAmount)} COP.`,
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

function buildAlertRows(invoiceRows: InvoiceDocumentRow[], reconciliationRows: PaperworkReconciliationRow[]) {
  const currentYear = getCurrentBogotaYear()

  return reconciliationRows
    .filter((row) => row.tradingDate?.startsWith(`${currentYear}-`))
    .flatMap((reconciliation) => {
      const signal =
        reconciliation.orderCount > 0 && reconciliation.invoiceCount === 0
          ? 'Missing invoices'
          : reconciliation.invoiceCount > 0 && reconciliation.orderCount === 0
            ? 'Extra invoices'
            : reconciliation.orderCount > 0 && reconciliation.invoiceCount > 0 && Math.abs(reconciliation.differenceAmount) >= 1_000
              ? 'Comm diff'
              : null

      if (!signal) {
        return []
      }

      const matchedInvoices = invoiceRows
        .filter(
          (invoice) =>
            invoice.symbol === reconciliation.symbol &&
            invoice.side === reconciliation.side &&
            toCalendarDate(invoice.issuedAt) === reconciliation.tradingDate,
        )
        .sort((left, right) => compareAscendingTimestamps(left.issuedAt, right.issuedAt))

      const severity: PaperworkAlertRow['severity'] =
        signal === 'Missing invoices'
          ? 'high'
          : signal === 'Comm diff' && Math.abs(reconciliation.differenceAmount) >= 5_000
            ? 'high'
            : 'medium'

      const invoiceNumbers = matchedInvoices.map((invoice) => invoice.invoiceNumber).join(', ') || '--'
      const xmlNames = matchedInvoices.map((invoice) => invoice.sourceXmlName ?? '--').join(', ') || '--'

      return [{
        id: `${reconciliation.symbol}-${reconciliation.tradingDate}-${reconciliation.side}-${signal}`,
        signal,
        severity,
        symbol: reconciliation.symbol,
        tradingDate: reconciliation.tradingDate,
        side: reconciliation.side,
        orderCount: reconciliation.orderCount,
        invoiceCount: reconciliation.invoiceCount,
        orderCommission: reconciliation.orderCommission,
        invoiceTotalAmount: reconciliation.invoiceTotalAmount,
        differenceAmount: reconciliation.differenceAmount,
        invoiceNumbers,
        xmlNames,
        detail:
          signal === 'Missing invoices'
            ? `${formatCount(reconciliation.orderCount)} orden(es) sin factura conciliada.`
            : signal === 'Extra invoices'
              ? `${formatCount(reconciliation.invoiceCount)} factura(s) sin orden conciliada.`
              : `Diferencia de ${formatSignedAmount(reconciliation.differenceAmount)} COP entre orden y factura.`,
      }]
    })
    .sort((left, right) => {
      const severityDelta = rankSeverity(right.severity) - rankSeverity(left.severity)
      if (severityDelta !== 0) {
        return severityDelta
      }
      return (right.tradingDate ?? '').localeCompare(left.tradingDate ?? '')
    })
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
  const rawDescription = normalizeText(record.line_description)
  const category = classifyInvoiceCategory(rawDescription)
  const description = sanitizeInvoiceDescription(rawDescription)

  return {
    invoiceNumber: record.invoice_number?.trim() || record.invoice_uuid,
    invoiceUuid: record.invoice_uuid,
    issuedAt: normalizeText(record.issued_at),
    orderReferenceId: normalizeText(record.order_reference_id),
    sourceXmlName: extractSourceXmlName(record.source_xml_s3_key),
    side: side ?? 'unknown',
    symbol: inferInvoiceSymbol(record),
    baseAmount,
    payableAmount,
    taxAmount,
    totalAmount,
    description,
    realizedPnl: null,
    allocatedQuantity: null,
    relatedInvoiceNumbers: null,
    hasRelatedInvoices: false,
    category,
  }
}

function classifyInvoiceCategory(description: string | null) {
  const normalized = normalizeInvoiceText(description)
  if (!normalized) {
    return 'ignored' as const
  }

  if (normalized.includes(' DIVIDEND')) {
    return 'dividend' as const
  }

  if (INVOICE_IGNORE_PATTERNS.some((pattern) => normalized.includes(` ${pattern} `))) {
    return 'ignored' as const
  }

  if (normalized.includes(' COBRO DE ADMINISTRACION VALORES ')) {
    return 'ignored' as const
  }

  return 'trade' as const
}

function extractSourceXmlName(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  const fileName = normalized.split('/').pop() ?? normalized
  return fileName.replace(/\.xml$/i, '') || null
}

function trimInvoiceDescription(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  return normalized
    .replace(/^COMIS[IÍ]ON:\s*(COMPRA|VENTA)\s+\S+\s+ACCIONES?\s+ORDINAR(?:IAS?)?\s*/i, '')
    .trim()
}

function sanitizeInvoiceDescription(value: string | null | undefined) {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  const legacyTrimmed = trimInvoiceDescription(normalized) ?? normalized
  const dividendShareCount = extractDividendShareCount(legacyTrimmed)
  if (dividendShareCount) {
    return dividendShareCount
  }

  return legacyTrimmed
    .replace(/\u00a0/g, ' ')
    .replace(/^COMIS\S*:\s*(COMPRA|VENTA)\s+\S+\s+ACCIONES?\s+ORDINAR(?:IAS?)?\s*/i, '')
    .trim()
}

function extractDividendShareCount(value: string) {
  const match = value.match(/(\d+(?:[.,]\d+)?)\s+acciones?/i)
  if (!match?.[1]) {
    return null
  }

  const normalized = match[1].replace(/\.0+$/, '').replace(/,/g, '')
  return `${normalized} Acciones`
}

function compareDescendingTimestamps(left: string | null, right: string | null) {
  const leftTime = left ? new Date(left).getTime() : Number.NEGATIVE_INFINITY
  const rightTime = right ? new Date(right).getTime() : Number.NEGATIVE_INFINITY
  return rightTime - leftTime
}

function compareAscendingTimestamps(left: string | null, right: string | null) {
  const leftTime = left ? new Date(left).getTime() : Number.POSITIVE_INFINITY
  const rightTime = right ? new Date(right).getTime() : Number.POSITIVE_INFINITY
  return leftTime - rightTime
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

function allocateQuantitiesByWeight(totalQuantity: number, weights: number[]) {
  const normalizedTotal = Math.max(0, Math.round(totalQuantity))
  if (normalizedTotal === 0 || weights.length === 0) {
    return weights.map(() => 0)
  }

  const sanitizedWeights = weights.map((weight) => Math.max(0, weight))
  const weightSum = sanitizedWeights.reduce((sum, value) => sum + value, 0)

  if (weightSum <= 0) {
    const base = Math.floor(normalizedTotal / weights.length)
    const remainder = normalizedTotal - base * weights.length
    return weights.map((_, index) => base + (index < remainder ? 1 : 0))
  }

  const exactAllocations = sanitizedWeights.map((weight) => (normalizedTotal * weight) / weightSum)
  const baseAllocations = exactAllocations.map((value) => Math.floor(value))
  let remainder = normalizedTotal - baseAllocations.reduce((sum, value) => sum + value, 0)

  const ranking = exactAllocations
    .map((value, index) => ({
      index,
      fraction: value - Math.floor(value),
    }))
    .sort((left, right) => right.fraction - left.fraction)

  for (const item of ranking) {
    if (remainder <= 0) {
      break
    }
    baseAllocations[item.index] += 1
    remainder -= 1
  }

  return baseAllocations
}

function allocateAmountsByWeight(totalAmount: number, weights: number[]) {
  if (!Number.isFinite(totalAmount) || weights.length === 0) {
    return weights.map(() => 0)
  }

  const sanitizedWeights = weights.map((weight) => Math.max(0, weight))
  const weightSum = sanitizedWeights.reduce((sum, value) => sum + value, 0)

  if (weightSum <= 0) {
    return weights.map(() => totalAmount / weights.length)
  }

  return sanitizedWeights.map((weight) => (totalAmount * weight) / weightSum)
}

function toCalendarDate(value: string | null | undefined) {
  const normalized = normalizeText(value)
  return normalized ? normalized.slice(0, 10) : null
}

function toCalendarMonth(value: string | null | undefined) {
  const normalized = normalizeText(value)
  return normalized ? normalized.slice(0, 7) : null
}

function toCalendarYear(value: string | null | undefined) {
  const normalized = normalizeText(value)
  return normalized ? normalized.slice(0, 4) : null
}

function formatSignedAmount(value: number) {
  const rounded = Math.round(value)
  return `${rounded >= 0 ? '+' : ''}${rounded.toLocaleString('en-US')}`
}

function formatCount(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString('en-US')
}

function formatShortDate(value: string | null) {
  if (!value) {
    return '--'
  }

  const [year, month, day] = value.split('-')
  if (!year || !month || !day) {
    return value
  }

  return `${month}-${day}`
}

function formatReconciliationSide(value: PaperworkReconciliationRow['side']) {
  if (value === 'buy') {
    return 'Compra'
  }
  if (value === 'sell') {
    return 'Venta'
  }
  return '--'
}

function getCurrentBogotaYear() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
  }).format(new Date())
}

function normalizePaperworkYear(value: string | null) {
  const normalized = normalizeText(value)
  return normalized && /^\d{4}$/.test(normalized) ? normalized : null
}

function formatMonthName(value: string) {
  const [year, month] = value.split('-')
  if (!year || !month) {
    return value
  }

  const monthIndex = Number(month) - 1
  const monthNames = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ]

  const monthName = monthNames[monthIndex] ?? value
  return monthName.charAt(0).toUpperCase() + monthName.slice(1)
}
