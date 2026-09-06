import { useMemo, useState } from 'react'
import { DataTable } from '../../../shared/ui/DataTable'
import type { PaperworkAnalyticsRow, PaperworkAnomalyRow } from '../lib/analytics'
import { getPaperworkPeriodOptions, usePaperworkAnalytics } from '../hooks/usePaperworkAnalytics'
import { PaperworkExpandableTable } from './PaperworkExpandableTable'

type PaperworkAnalyticsPanelProps = {
  authenticatedUserEmail: string | null
}

const PERIOD_OPTIONS = getPaperworkPeriodOptions()

export function PaperworkAnalyticsPanel({ authenticatedUserEmail }: PaperworkAnalyticsPanelProps) {
  const [activePeriod, setActivePeriod] = useState(PERIOD_OPTIONS[0]?.value ?? '1m')
  const selectedPeriod = PERIOD_OPTIONS.find((option) => option.value === activePeriod) ?? PERIOD_OPTIONS[0]
  const analyticsQuery = usePaperworkAnalytics(authenticatedUserEmail, selectedPeriod.months)

  const currentPortfolio = useMemo(() => {
    const holdings = analyticsQuery.model.rows
      .filter((row) => row.openQuantity > 0 && row.closePrice !== null && row.averageCost !== null)
      .map((row) => {
        const marketValue = row.openQuantity * (row.closePrice ?? 0)
        const costValue = row.openQuantity * (row.averageCost ?? 0)
        const pnl = marketValue - costValue
        const pnlPercent = costValue > 0 ? pnl / costValue : 0
        return {
          symbol: row.symbol,
          quantity: row.openQuantity,
          averageCost: row.averageCost ?? 0,
          closePrice: row.closePrice ?? 0,
          marketValue,
          costValue,
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
    const topWeight = totalMarketValue > 0 ? (holdings[0]?.marketValue ?? 0) / totalMarketValue : 0

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
      topWeight,
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

  const hasUnmappedInvoices = analyticsQuery.model.summary.unmappedInvoiceCount > 0
  const hasAlerts = analyticsQuery.model.anomalies.length > 0
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
          <div className="paperwork-card__title">
            <h3>Cierre</h3>
            <div className="paperwork-helper" tabIndex={0}>
              <span className="paperwork-helper__icon" aria-hidden="true">?</span>
              <div className="paperwork-helper__tooltip" role="tooltip">
                <strong>Que muestra este dashboard</strong>
                <span>Resume cierre operativo por periodo: ordenes, facturas, impuestos, comisiones y estado actual de la posicion al ultimo cierre disponible.</span>
                <span>PyG: ganancia o perdida mark-to-market de la posicion abierta.</span>
                <span>Comision calc: referencia teorica usando 0.125% sobre el bruto operado.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="paperwork-analytics__toolbar">
          <div className="paperwork-analytics__months" role="tablist" aria-label="Periodos de cierre">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`paperwork-analytics__monthButton${option.value === selectedPeriod.value ? ' paperwork-analytics__monthButton--active' : ''}`}
                onClick={() => setActivePeriod(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
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

      <div className="paperwork-analytics__metrics paperwork-analytics__metrics--close">
        <MetricPill
          label="Ordenes / Facturas"
          help="Total de ordenes aprobadas frente al total de facturas del periodo seleccionado."
          value={`${formatInteger(analyticsQuery.model.summary.approvedOrderCount)} / ${formatInteger(analyticsQuery.model.summary.invoiceCount)}`}
        />
        <MetricPill label="Bruto" help="Valor bruto total transado en ordenes aprobadas." value={formatMoney(analyticsQuery.model.summary.tradedGrossAmount)} />
        <MetricPill label="Comision orden" help="Comision consolidada reportada por las ordenes de Trii." value={formatMoney(analyticsQuery.model.summary.orderCommission)} />
        <MetricPill label="Comision calc" help="Referencia teorica usando 12.5 bps sobre el bruto operado." value={formatMoney(analyticsQuery.model.summary.calculatedCommission)} />
        <MetricPill label="Impuesto" help="Impuestos facturados por Accival en el periodo." value={formatMoney(analyticsQuery.model.summary.invoiceTaxAmount)} />
        <MetricPill label="Total factura" help="Total consolidado de facturas del periodo, incluyendo impuestos." value={formatMoney(analyticsQuery.model.summary.invoiceTotalAmount)} />
        <MetricPill label="Qty abierta" help="Cantidad que sigue abierta luego de aplicar PEPS/FIFO a toda la historia del simbolo." value={formatInteger(analyticsQuery.model.summary.openQuantity)} />
        <MetricPill label="PyG" help="Ganancia o perdida mark-to-market de la posicion abierta al ultimo cierre disponible." value={formatSignedMoney(analyticsQuery.model.summary.mtmPnl)} tone={toneFromSigned(analyticsQuery.model.summary.mtmPnl)} />
      </div>

      <section className="paperwork-section">
        <div className="paperwork-section__header">
          <h4>Portafolio actual</h4>
          <p>Solo posiciones abiertas hoy. Separado del cierre operativo del periodo.</p>
        </div>
        <CurrentPortfolioSection portfolio={currentPortfolio} />
      </section>

      <section className={`paperwork-analytics__overviewGrid${hasAlerts ? '' : ' paperwork-analytics__overviewGrid--single'}`}>
        <article className="paperwork-chartCard">
          <div className="paperwork-section__header">
            <h4>Conciliacion comisiones</h4>
            <p>Comision de orden vs total facturado por simbolo.</p>
          </div>
          <CommissionCompareChart rows={analyticsQuery.model.rows} />
        </article>

        {hasAlerts ? (
          <article className="paperwork-chartCard">
            <div className="paperwork-section__header">
              <h4>Alertas</h4>
            </div>
            <AnomalyList anomalies={analyticsQuery.model.anomalies} />
          </article>
        ) : null}
      </section>

      {analyticsQuery.model.rows.length > 0 ? (
        <section className="paperwork-section">
          <PaperworkExpandableTable rows={analyticsQuery.model.rows} invoiceRows={analyticsQuery.model.invoiceRows} />
        </section>
      ) : (
        <div className="paperwork-empty">No se encontraron ordenes aprobadas ni facturas en el periodo seleccionado.</div>
      )}

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

function MetricPill(props: { label: string; help: string; value: string; tone?: 'positive' | 'negative' | 'warning' }) {
  const { label, help, value, tone } = props
  return (
    <div className={`paperwork-metricPill${tone ? ` paperwork-metricPill--${tone}` : ''}`}>
      <span className="paperwork-metricPill__label">
        <span>{label}</span>
        <InlineHelp text={help} />
      </span>
      <strong>{value}</strong>
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
      pnl: number
      pnlPercent: number
      weight: number
    }>
    totalMarketValue: number
    totalCostValue: number
    totalQuantity: number
    totalPnl: number
    totalPnlPercent: number
    topWeight: number
    issuerCount: number
  }
}) {
  const { portfolio } = props

  if (portfolio.holdings.length === 0) {
    return <div className="paperwork-empty">No hay posiciones abiertas para mostrar composicion actual.</div>
  }

  return (
    <div className="paperwork-portfolio">
      <article className="paperwork-chartCard">
        <div className="paperwork-section__header">
          <h4>Ahora</h4>
          <p>Foto actual del portafolio abierto.</p>
        </div>
        <div className="paperwork-portfolio__metrics">
          <MetricPill label="Valor actual" help="Valor de mercado de las posiciones abiertas usando el ultimo cierre disponible." value={formatMoney(portfolio.totalMarketValue)} />
          <MetricPill label="Costo FIFO" help="Costo consolidado remanente de las posiciones abiertas despues de aplicar PEPS/FIFO." value={formatMoney(portfolio.totalCostValue)} />
          <MetricPill label="Acciones" help="Cantidad total de acciones abiertas entre todos los emisores actuales." value={formatInteger(portfolio.totalQuantity)} />
          <MetricPill label="Emisores" help="Cantidad de empresas en las que aun hay posicion abierta." value={formatInteger(portfolio.issuerCount)} />
          <MetricPill label="PyG abierta" help="Ganancia o perdida mark-to-market de las posiciones abiertas al ultimo cierre." value={formatSignedMoney(portfolio.totalPnl)} tone={toneFromSigned(portfolio.totalPnl)} />
          <MetricPill label="PyG %" help="Rendimiento mark-to-market del portafolio abierto sobre su costo FIFO." value={formatSignedPercent(portfolio.totalPnlPercent)} tone={toneFromSigned(portfolio.totalPnl)} />
          <MetricPill label="Concentracion" help="Peso del emisor mas grande dentro del valor actual del portafolio abierto." value={formatPercent(portfolio.topWeight)} tone={portfolio.topWeight >= 0.6 ? 'warning' : undefined} />
          <MetricPill label="Riesgo" help="Lectura simple de riesgo por concentracion del portafolio actual." value={describeConcentrationRisk(portfolio.topWeight)} tone={toneFromRisk(portfolio.topWeight)} />
        </div>
      </article>

      <article className="paperwork-chartCard">
        <div className="paperwork-section__header">
          <h4>Composicion</h4>
          <p>Participacion actual por emisor y cantidad abierta.</p>
        </div>
        <PortfolioCompositionChart holdings={portfolio.holdings} />
      </article>

      <article className="paperwork-chartCard paperwork-chartCard--full">
        <div className="paperwork-section__header">
          <h4>Empresas actuales</h4>
          <p>Solo las acciones que siguen abiertas ahora mismo.</p>
        </div>
        <CurrentHoldingsTable holdings={portfolio.holdings} />
      </article>
    </div>
  )
}

function PortfolioCompositionChart(props: {
  holdings: Array<{
    symbol: string
    quantity: number
    marketValue: number
    pnl: number
    pnlPercent: number
    weight: number
  }>
}) {
  const { holdings } = props
  const radius = 58
  const circumference = 2 * Math.PI * radius
  let offsetCursor = 0

  return (
    <div className="paperwork-composition">
      <div className="paperwork-composition__ringWrap" aria-hidden="true">
        <svg viewBox="0 0 160 160" className="paperwork-composition__ring">
          <circle cx="80" cy="80" r={radius} className="paperwork-composition__track" />
          {holdings.map((holding, index) => {
            const strokeDasharray = `${Math.max(holding.weight * circumference, 0)} ${circumference}`
            const strokeDashoffset = -offsetCursor
            offsetCursor += holding.weight * circumference
            return (
              <circle
                key={holding.symbol}
                cx="80"
                cy="80"
                r={radius}
                className={`paperwork-composition__slice paperwork-composition__slice--${index % 6}`}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
              />
            )
          })}
        </svg>
      </div>

      <div className="paperwork-composition__legend">
        {holdings.map((holding, index) => (
          <div key={holding.symbol} className="paperwork-composition__legendRow">
            <span className="paperwork-composition__legendMain">
              <i className={`paperwork-dot paperwork-composition__dot paperwork-composition__dot--${index % 6}`} />
              <strong>{holding.symbol}</strong>
            </span>
            <span>{formatPercent(holding.weight)}</span>
            <span>{formatInteger(holding.quantity)} accs</span>
            <span className={toneClassName(holding.pnl)}>{formatSignedPercent(holding.pnlPercent)}</span>
          </div>
        ))}
      </div>
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
    pnl: number
    pnlPercent: number
    weight: number
  }>
}) {
  const rows = props.holdings.map((holding) => ({
    simbolo: holding.symbol,
    acciones: formatInteger(holding.quantity),
    'costo fifo': formatMoney(holding.averageCost),
    cierre: formatMoney(holding.closePrice),
    'valor actual': formatMoney(holding.marketValue),
    participacion: formatPercent(holding.weight),
    'PyG %': formatSignedPercent(holding.pnlPercent),
  }))

  return <DataTable rows={rows} />
}

function InlineHelp(props: { text: string }) {
  const { text } = props
  return (
    <span className="paperwork-inlineHelp" tabIndex={0}>
      i
      <span className="paperwork-inlineHelp__tooltip" role="tooltip">
        {text}
      </span>
    </span>
  )
}

function CommissionCompareChart({ rows }: { rows: PaperworkAnalyticsRow[] }) {
  const visibleRows = rows
    .filter((row) => row.orderCommission > 0 || row.invoiceTotalAmount > 0)
    .slice(0, 8)
  const maxValue = Math.max(1, ...visibleRows.flatMap((row) => [row.orderCommission, row.invoiceTotalAmount]))

  if (visibleRows.length === 0) {
    return <div className="paperwork-empty">No hay datos de comisiones disponibles.</div>
  }

  return (
    <div className="paperwork-bars">
      <div className="paperwork-bars__legend">
        <span><i className="paperwork-dot paperwork-dot--cyan" /> Ordenes</span>
        <span><i className="paperwork-dot paperwork-dot--violet" /> Total factura</span>
      </div>
      {visibleRows.map((row) => (
        <div key={row.symbol} className="paperwork-bars__row">
          <div className="paperwork-bars__meta">
            <strong>{row.symbol}</strong>
            <span>{formatSignedMoney(row.feeGap)} diferencia</span>
          </div>
          <div className="paperwork-bars__track">
            <div className="paperwork-bars__fill paperwork-bars__fill--cyan" style={{ width: `${(row.orderCommission / maxValue) * 100}%` }} />
            <div className="paperwork-bars__fill paperwork-bars__fill--violet" style={{ width: `${(row.invoiceTotalAmount / maxValue) * 100}%` }} />
          </div>
          <div className="paperwork-bars__values">
            <span>{formatMoney(row.orderCommission)}</span>
            <span>{formatMoney(row.invoiceTotalAmount)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function AnomalyList({ anomalies }: { anomalies: PaperworkAnomalyRow[] }) {
  return (
    <div className="paperwork-anomalyList">
      <div className="paperwork-anomalyList__header">
        <span>Alerta</span>
        <span>Alcance</span>
        <span>Detalle</span>
      </div>
      {anomalies.slice(0, 8).map((anomaly, index) => (
        <article key={`${anomaly.scope}-${anomaly.signal}-${index}`} className={`paperwork-anomaly paperwork-anomaly--${anomaly.severity}`}>
          <strong>{anomaly.signal}</strong>
          <span>{anomaly.scope}</span>
          <p>{anomaly.detail}</p>
        </article>
      ))}
    </div>
  )
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

function toneFromSigned(value: number): 'positive' | 'negative' | undefined {
  if (value > 0) {
    return 'positive'
  }
  if (value < 0) {
    return 'negative'
  }
  return undefined
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

function toneFromRisk(weight: number): 'positive' | 'negative' | 'warning' | undefined {
  if (weight >= 0.6) {
    return 'warning'
  }
  if (weight >= 0.35) {
    return 'negative'
  }
  return 'positive'
}

function describeConcentrationRisk(weight: number) {
  if (weight >= 0.6) {
    return 'Alto'
  }
  if (weight >= 0.35) {
    return 'Medio'
  }
  return 'Bajo'
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
