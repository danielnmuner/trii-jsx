import { useMemo } from 'react'
import { DataTable } from '../../../shared/ui/DataTable'
import { buildPaperworkLogoutUrl } from '../auth/client'
import type { PaperworkAnalyticsQueryResult } from '../hooks/usePaperworkAnalytics'
import { TRII_PRO_COMMISSION_RATE, VAT_RATE } from '../lib/analytics'
import { PaperworkExpandableTable } from './PaperworkExpandableTable'

type PaperworkAnalyticsPanelProps = {
  analyticsQuery: PaperworkAnalyticsQueryResult
  selectedYear: string | null
  onYearChange: (year: string) => void
}

function GitHubMark() {
  return (
    <svg
      aria-hidden="true"
      className="paperwork-authIcon"
      viewBox="0 -0.5 25 25"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="m12.301 0h.093c2.242 0 4.34.613 6.137 1.68l-.055-.031c1.871 1.094 3.386 2.609 4.449 4.422l.031.058c1.04 1.769 1.654 3.896 1.654 6.166 0 5.406-3.483 10-8.327 11.658l-.087.026c-.063.02-.135.031-.209.031-.162 0-.312-.054-.433-.144l.002.001c-.128-.115-.208-.281-.208-.466 0-.005 0-.01 0-.014v.001q0-.048.008-1.226t.008-2.154c.007-.075.011-.161.011-.249 0-.792-.323-1.508-.844-2.025.618-.061 1.176-.163 1.718-.305l-.076.017c.573-.16 1.073-.373 1.537-.642l-.031.017c.508-.28.938-.636 1.292-1.058l.006-.007c.372-.476.663-1.036.84-1.645l.009-.035c.209-.683.329-1.468.329-2.281 0-.045 0-.091-.001-.136v.007c0-.022.001-.047.001-.072 0-1.248-.482-2.383-1.269-3.23l.003.003c.168-.44.265-.948.265-1.479 0-.649-.145-1.263-.404-1.814l.011.026c-.115-.022-.246-.035-.381-.035-.334 0-.649.078-.929.216l.012-.005c-.568.21-1.054.448-1.512.726l.038-.022-.609.384c-.922-.264-1.981-.416-3.075-.416s-2.153.152-3.157.436l.081-.02q-.256-.176-.681-.433c-.373-.214-.814-.421-1.272-.595l-.066-.022c-.293-.154-.64-.244-1.009-.244-.124 0-.246.01-.364.03l.013-.002c-.248.524-.393 1.139-.393 1.788 0 .531.097 1.04.275 1.509l-.01-.029c-.785.844-1.266 1.979-1.266 3.227 0 .025 0 .051.001.076v-.004c-.001.039-.001.084-.001.13 0 .809.12 1.591.344 2.327l-.015-.057c.189.643.476 1.202.85 1.693l-.009-.013c.354.435.782.793 1.267 1.062l.022.011c.432.252.933.465 1.46.614l.046.011c.466.125 1.024.227 1.595.284l.046.004c-.431.428-.718 1-.784 1.638l-.001.012c-.207.101-.448.183-.699.236l-.021.004c-.256.051-.549.08-.85.08-.022 0-.044 0-.066 0h.003c-.394-.008-.756-.136-1.055-.348l.006.004c-.371-.259-.671-.595-.881-.986l-.007-.015c-.198-.336-.459-.614-.768-.827l-.009-.006c-.225-.169-.49-.301-.776-.38l-.016-.004-.32-.048c-.023-.002-.05-.003-.077-.003-.14 0-.273.028-.394.077l.007-.003q-.128.072-.08.184c.039.086.087.16.145.225l-.001-.001c.061.072.13.135.205.19l.003.002.112.08c.283.148.516.354.693.603l.004.006c.191.237.359.505.494.792l.01.024.16.368c.135.402.38.738.7.981l.005.004c.3.234.662.402 1.057.478l.016.002c.33.064.714.104 1.106.112h.007c.045.002.097.002.15.002.261 0 .517-.021.767-.062l-.027.004.368-.064q0 .609.008 1.418t.008.873v.014c0 .185-.08.351-.208.466h-.001c-.119.089-.268.143-.431.143-.075 0-.147-.011-.214-.032l.005.001c-4.929-1.689-8.409-6.283-8.409-11.69 0-2.268.612-4.393 1.681-6.219l-.032.058c1.094-1.871 2.609-3.386 4.422-4.449l.058-.031c1.739-1.034 3.835-1.645 6.073-1.645h.098-.005zm-7.64 17.666q.048-.112-.112-.192-.16-.048-.208.032-.048.112.112.192.144.096.208-.032zm.497.545q.112-.08-.032-.256-.16-.144-.256-.048-.112.08.032.256.159.157.256.047zm.48.72q.144-.112 0-.304-.128-.208-.272-.096-.144.08 0 .288t.272.112zm.672.673q.128-.128-.064-.304-.192-.192-.32-.048-.144.128.064.304.192.192.32.044zm.913.4q.048-.176-.208-.256-.24-.064-.304.112t.208.24q.24.097.304-.096zm1.009.08q0-.208-.272-.176-.256 0-.256.176 0 .208.272.176.256.001.256-.175zm.929-.16q-.032-.176-.288-.144-.256.048-.224.24t.288.128.225-.224z" />
    </svg>
  )
}

export function PaperworkAnalyticsPanel({ analyticsQuery, selectedYear, onYearChange }: PaperworkAnalyticsPanelProps) {
  const monthlyOperationCards = useMemo(() => {
    const monthsByKey = new Map<string, {
      key: string
      month: string
      tradedGrossAmount: number
      buyGrossAmount: number
      sellGrossAmount: number
      realizedPnl: number
      invoiceTaxAmount: number
      invoiceTotalAmount: number
      buyCount: number
      sellCount: number
    }>()

    for (const symbolRow of analyticsQuery.model.tableRows) {
      for (const yearRow of symbolRow.children) {
        for (const monthRow of yearRow.children) {
          const key = monthRow.month ?? `${yearRow.year}-${monthRow.label}`
          const current = monthsByKey.get(key) ?? {
            key,
            month: monthRow.label,
            tradedGrossAmount: 0,
            buyGrossAmount: 0,
            sellGrossAmount: 0,
            realizedPnl: 0,
            invoiceTaxAmount: 0,
            invoiceTotalAmount: 0,
            buyCount: 0,
            sellCount: 0,
          }

          current.tradedGrossAmount += monthRow.tradedGrossAmount
          current.buyGrossAmount += monthRow.buyGrossAmount
          current.sellGrossAmount += monthRow.sellGrossAmount
          current.realizedPnl += monthRow.realizedPnl
          current.invoiceTaxAmount += monthRow.invoiceTaxAmount
          current.invoiceTotalAmount += monthRow.invoiceTotalAmount
          current.buyCount += monthRow.buyCount
          current.sellCount += monthRow.sellCount
          monthsByKey.set(key, current)
        }
      }
    }

    return Array.from(monthsByKey.values()).sort((left, right) => right.key.localeCompare(left.key))
  }, [analyticsQuery.model.tableRows])

  const operationCards = useMemo(() => {
    const annualCard = {
      key: `${selectedYear ?? 'all'}-total`,
      month: selectedYear ? `${selectedYear} Total` : 'Total',
      tradedGrossAmount: monthlyOperationCards.reduce((sum, card) => sum + card.tradedGrossAmount, 0),
      buyGrossAmount: monthlyOperationCards.reduce((sum, card) => sum + card.buyGrossAmount, 0),
      sellGrossAmount: monthlyOperationCards.reduce((sum, card) => sum + card.sellGrossAmount, 0),
      realizedPnl: monthlyOperationCards.reduce((sum, card) => sum + card.realizedPnl, 0),
      invoiceTaxAmount: monthlyOperationCards.reduce((sum, card) => sum + card.invoiceTaxAmount, 0),
      invoiceTotalAmount: monthlyOperationCards.reduce((sum, card) => sum + card.invoiceTotalAmount, 0),
      buyCount: monthlyOperationCards.reduce((sum, card) => sum + card.buyCount, 0),
      sellCount: monthlyOperationCards.reduce((sum, card) => sum + card.sellCount, 0),
    }

    return [annualCard, ...monthlyOperationCards]
  }, [monthlyOperationCards, selectedYear])

  const currentPortfolio = useMemo(() => {
    const holdings = analyticsQuery.fullModel.rows
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
  }, [analyticsQuery.fullModel.rows])

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
          <div className="paperwork-analytics__headerMeta">
            <span className="paperwork-card__eyebrow">Analitica</span>
            <span className={`paperwork-analytics__status paperwork-analytics__status--${status.tone}`}>{status.label}</span>
          </div>
        </div>

        <div className="paperwork-analytics__toolbar">
          <a className="paperwork-analytics__switch" href={buildPaperworkLogoutUrl()}>
            <GitHubMark />
            Switch account
          </a>
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

      {monthlyOperationCards.length > 0 ? (
        <section className="paperwork-section">
          {analyticsQuery.availableYears.length > 0 ? (
            <div className="paperwork-yearFilter" aria-label="Filtro anual de paperwork">
              {analyticsQuery.availableYears.map((year) => (
                <button
                  key={year}
                  type="button"
                  className={`paperwork-yearFilter__button${selectedYear === year ? ' is-active' : ''}`}
                  onClick={() => onYearChange(year)}
                  aria-pressed={selectedYear === year}
                >
                  {year}
                </button>
              ))}
            </div>
          ) : null}
          <div className="paperwork-section__header">
            <h4>Operacion por mes</h4>
          </div>
          <MonthlyOperationCards cards={operationCards} />
        </section>
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

function MonthlyOperationCards(props: {
  cards: Array<{
    key: string
    month: string
    tradedGrossAmount: number
    buyGrossAmount: number
    sellGrossAmount: number
    realizedPnl: number
    invoiceTaxAmount: number
    invoiceTotalAmount: number
    buyCount: number
    sellCount: number
  }>
}) {
  return (
    <div className="paperwork-monthCards">
      {props.cards.map((card) => (
        <article key={card.key} className="paperwork-monthCard">
          <header className="paperwork-monthCard__header">
            <strong>{card.month}</strong>
            <span>{`${formatInteger(card.buyCount)}C / ${formatInteger(card.sellCount)}V`}</span>
          </header>
          <div className="paperwork-monthCard__grid">
            <div className="paperwork-monthCard__metric">
              <span>Bruto movido</span>
              <strong>{formatMoney(card.tradedGrossAmount)}</strong>
            </div>
            <div className="paperwork-monthCard__metric paperwork-monthCard__metric--total">
              <span>Total factura</span>
              <strong>{formatMoney(card.invoiceTotalAmount)}</strong>
            </div>
            <div className="paperwork-monthCard__metric paperwork-monthCard__metric--buy">
              <span>Compra</span>
              <strong>{formatMoney(card.buyGrossAmount)}</strong>
            </div>
            <div className="paperwork-monthCard__metric paperwork-monthCard__metric--sell">
              <span>Venta</span>
              <strong>{formatMoney(card.sellGrossAmount)}</strong>
            </div>
            <div className="paperwork-monthCard__metric paperwork-monthCard__metric--tax">
              <span>Impuesto</span>
              <strong>{formatMoney(card.invoiceTaxAmount)}</strong>
            </div>
            <div className="paperwork-monthCard__metric paperwork-monthCard__metric--pnl">
              <span>Utilidad</span>
              <strong className={toneClassName(card.realizedPnl)}>{formatSignedMoney(card.realizedPnl)}</strong>
            </div>
          </div>
        </article>
      ))}
    </div>
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
