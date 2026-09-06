import { useMemo } from 'react'
import { DataTable } from '../../../shared/ui/DataTable'
import type { PaperworkAnalyticsQueryResult } from '../hooks/usePaperworkAnalytics'
import { TRII_PRO_COMMISSION_RATE, VAT_RATE } from '../lib/analytics'
import { PaperworkExpandableTable } from './PaperworkExpandableTable'

type PaperworkAnalyticsPanelProps = {
  analyticsQuery: PaperworkAnalyticsQueryResult
}

export function PaperworkAnalyticsPanel({ analyticsQuery }: PaperworkAnalyticsPanelProps) {
  const currentPortfolio = useMemo(() => {
    const holdings = analyticsQuery.model.rows
      .filter((row) => row.openQuantity > 0 && row.closePrice !== null && row.averageCost !== null)
      .map((row) => {
        const marketValue = row.openQuantity * (row.closePrice ?? 0)
        const costValue = row.openQuantity * (row.averageCost ?? 0)
        const buyCommission = row.remainingBuyCommission
        const estimatedSellCommission = marketValue * TRII_PRO_COMMISSION_RATE * (1 + VAT_RATE)
        const pnl = marketValue - costValue - buyCommission - estimatedSellCommission
        const pnlPercent = costValue > 0 ? pnl / costValue : 0
        return {
          symbol: row.symbol,
          quantity: row.openQuantity,
          averageCost: row.averageCost ?? 0,
          closePrice: row.closePrice ?? 0,
          marketValue,
          costValue,
          buyCommission,
          estimatedSellCommission,
          pnl,
          pnlPercent,
        }
      })
      .sort((left, right) => right.marketValue - left.marketValue)

    const totalMarketValue = holdings.reduce((sum, row) => sum + row.marketValue, 0)
    const totalCostValue = holdings.reduce((sum, row) => sum + row.costValue, 0)
    const totalQuantity = holdings.reduce((sum, row) => sum + row.quantity, 0)
    const totalPnl = totalMarketValue - totalCostValue
    const totalPnlPercent = totalCostValue > 0 ? totalPnl / totalCostValue : 0
    return {
      holdings: holdings.map((row) => ({
        ...row,
        weight: totalMarketValue > 0 ? row.marketValue / totalMarketValue : 0,
      })),
      totalMarketValue,
      totalCostValue,
      totalQuantity,
      totalPnl,
      totalPnlPercent,
      issuerCount: holdings.length,
    }
  }, [analyticsQuery.model.rows])

  const unmappedRows = useMemo(() => {
    return analyticsQuery.model.unmappedInvoices.slice(0, 10).map((row) => ({
      emitida: formatDateTime(row.issuedAt),
      factura: row.invoiceNumber,
      ref: row.orderReferenceId ?? '--',
      total: formatMoney(row.totalAmount),
      descripcion: row.description ?? '--',
    }))
  }, [analyticsQuery.model.unmappedInvoices])

  const unmappedExamples = useMemo(() => {
    return Array.from(
      new Set(
        analyticsQuery.model.unmappedInvoices
          .map((row) => row.description?.trim())
          .filter((description): description is string => Boolean(description)),
      ),
    ).slice(0, 3)
  }, [analyticsQuery.model.unmappedInvoices])

  const alertRows = useMemo(() => {
    return analyticsQuery.model.alertRows.map((row) => ({
      fecha: formatShortDate(row.tradingDate),
      simbolo: row.symbol,
      lado: formatSideLabel(row.side),
      alerta: formatSignalLabel(row.signal),
      ordenes: formatInteger(row.orderCount),
      facturas: formatInteger(row.invoiceCount),
      'comision orden': formatMoney(row.orderCommission),
      'total factura': formatMoney(row.invoiceTotalAmount),
      diferencia: formatSignedMoney(row.differenceAmount),
      factura: row.invoiceNumbers,
      xml: row.xmlNames,
      detalle: row.detail,
    }))
  }, [analyticsQuery.model.alertRows])

  const dividendRows = useMemo(() => {
    return analyticsQuery.model.dividendRows.map((row) => ({
      emitida: formatDateTime(row.issuedAt),
      simbolo: row.symbol ?? '--',
      descripcion: row.description ?? '--',
      base: formatMoney(row.baseAmount),
      impuesto: formatMoney(row.taxAmount),
      total: formatMoney(row.totalAmount),
      factura: row.invoiceNumber,
      xml: row.sourceXmlName ?? '--',
    }))
  }, [analyticsQuery.model.dividendRows])

  const hasUnmappedInvoices = analyticsQuery.model.summary.unmappedInvoiceCount > 0
  const hasAlerts = analyticsQuery.model.alertRows.length > 0
  const status = analyticsQuery.isError
    ? { label: 'Degradado', tone: 'degraded' }
    : hasUnmappedInvoices
      ? { label: 'Alerta mapeo', tone: 'warning' }
      : analyticsQuery.isLoading
        ? { label: 'Cargando', tone: 'loading' }
        : analyticsQuery.isFetching
          ? { label: 'Sincronizando', tone: 'syncing' }
          : { label: 'Listo', tone: 'ready' }

  return (
    <article className="paperwork-card">
      <header className="paperwork-card__header paperwork-card__header--analytics">
        <div className="paperwork-card__copy paperwork-card__copy--compact">
          <span className="paperwork-card__eyebrow">Analitica</span>
        </div>

        <div className="paperwork-analytics__toolbar">
          <span className={`paperwork-analytics__status paperwork-analytics__status--${status.tone}`}>{status.label}</span>
        </div>
      </header>

      {analyticsQuery.isError ? (
        <div className="paperwork-notice paperwork-notice--error" role="alert">
          {analyticsQuery.error instanceof Error ? analyticsQuery.error.message : 'No se pudo cargar la analitica de cierre.'}
        </div>
      ) : null}

      {hasUnmappedInvoices ? (
        <div className="paperwork-notice paperwork-notice--warning" role="alert">
          {`Se detectaron ${formatInteger(analyticsQuery.model.summary.unmappedInvoiceCount)} factura(s) sin mapeo. Agrega el alias faltante en invoiceSymbolMap.ts.`}
          {unmappedExamples.length > 0 ? ` Ejemplos: ${unmappedExamples.join(' | ')}` : ''}
        </div>
      ) : null}

      <section className="paperwork-section">
        <CurrentPortfolioSection portfolio={currentPortfolio} />
      </section>

      {analyticsQuery.model.rows.length > 0 ? (
        <section className="paperwork-section">
          <div className="paperwork-section__header">
            <h4>Ordenes y facturas</h4>
          </div>
          <PaperworkExpandableTable rows={analyticsQuery.model.tableRows} />
        </section>
      ) : (
        <div className="paperwork-empty">No se encontraron ordenes aprobadas ni facturas en el historial cargado.</div>
      )}

      {hasAlerts ? (
        <section className="paperwork-section">
          <div className="paperwork-section__header">
            <h4>Alertas</h4>
          </div>
          <DataTable rows={alertRows} />
        </section>
      ) : null}

      {dividendRows.length > 0 ? (
        <section className="paperwork-section">
          <div className="paperwork-section__header">
            <h4>Dividendos</h4>
          </div>
          <DataTable rows={dividendRows} />
        </section>
      ) : null}

      {unmappedRows.length > 0 ? (
        <section className="paperwork-section">
          <div className="paperwork-section__header">
            <h4>Requiere mapeo</h4>
          </div>
          <DataTable rows={unmappedRows} />
        </section>
      ) : null}
    </article>
  )
}

function CurrentPortfolioSection(props: {
  portfolio: {
    holdings: Array<{
      symbol: string
      quantity: number
      averageCost: number
      closePrice: number
      marketValue: number
      costValue: number
      buyCommission: number
      estimatedSellCommission: number
      pnl: number
      pnlPercent: number
      weight: number
    }>
    totalMarketValue: number
    totalCostValue: number
    totalQuantity: number
    totalPnl: number
    totalPnlPercent: number
    issuerCount: number
  }
}) {
  const { portfolio } = props

  if (portfolio.holdings.length === 0) {
    return <div className="paperwork-empty">No hay posiciones abiertas para mostrar composicion actual.</div>
  }

  return (
    <div className="paperwork-portfolio">
      <article className="paperwork-chartCard paperwork-chartCard--full paperwork-chartCard--table">
        <div className="paperwork-section__header">
          <h4>Empresas actuales</h4>
        </div>
        <CurrentHoldingsTable holdings={portfolio.holdings} />
      </article>
    </div>
  )
}

function CurrentHoldingsTable(props: {
  holdings: Array<{
    symbol: string
      quantity: number
      averageCost: number
      closePrice: number
      marketValue: number
      buyCommission: number
      estimatedSellCommission: number
      pnl: number
      pnlPercent: number
      weight: number
  }>
}) {
  const rows = props.holdings.map((holding) => ({
    simbolo: holding.symbol,
    acciones: formatInteger(holding.quantity),
    'costo fifo': formatMoney(holding.averageCost),
    'com compra': formatMoney(holding.buyCommission),
    'com venta est': formatMoney(holding.estimatedSellCommission),
    cierre: formatMoney(holding.closePrice),
    'valor actual': formatMoney(holding.marketValue),
    participacion: formatPercent(holding.weight),
    'PyG neta': <span className={toneClassName(holding.pnl)}>{formatSignedMoney(holding.pnl)}</span>,
    'PyG %': <span className={toneClassName(holding.pnl)}>{formatSignedPercent(holding.pnlPercent)}</span>,
  }))

  return <DataTable rows={rows} />
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value))
}

function formatSignedMoney(value: number) {
  const rounded = Math.round(value)
  return `${rounded >= 0 ? '+' : ''}${formatMoney(rounded)}`
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '--'
  }

  return new Intl.DateTimeFormat('en-CA', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
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

function formatSideLabel(value: 'buy' | 'sell' | 'unknown') {
  if (value === 'buy') {
    return 'Compra'
  }
  if (value === 'sell') {
    return 'Venta'
  }
  return '--'
}

function formatSignalLabel(value: string) {
  if (value === 'Missing invoices') {
    return 'Falta factura'
  }
  if (value === 'Extra invoices') {
    return 'Factura extra'
  }
  if (value === 'Comm diff') {
    return 'Dif comision'
  }
  return value
}

function toneClassName(value: number) {
  if (value > 0) {
    return 'paperwork-expandTable__value paperwork-expandTable__value--positive'
  }
  if (value < 0) {
    return 'paperwork-expandTable__value paperwork-expandTable__value--negative'
  }
  return 'paperwork-expandTable__value'
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)
}

function formatSignedPercent(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}`
}
