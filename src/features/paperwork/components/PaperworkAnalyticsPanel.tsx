import { useMemo, useState } from 'react'
import { DataTable } from '../../../shared/ui/DataTable'
import { getPaperworkPeriodOptions, usePaperworkAnalytics } from '../hooks/usePaperworkAnalytics'

type PaperworkAnalyticsPanelProps = {
  authenticatedUserEmail: string | null
}

const PERIOD_OPTIONS = getPaperworkPeriodOptions()

export function PaperworkAnalyticsPanel({ authenticatedUserEmail }: PaperworkAnalyticsPanelProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>(PERIOD_OPTIONS[0]?.value ?? '1m')
  const activePeriod = PERIOD_OPTIONS.find((option) => option.value === selectedPeriod) ?? PERIOD_OPTIONS[0]
  const analyticsQuery = usePaperworkAnalytics(authenticatedUserEmail, activePeriod.months)

  const reconciliationRows = useMemo(() => {
    return analyticsQuery.model.rows.map((row) => ({
      symbol: row.symbol,
      orders: formatInteger(row.orderCount),
      invoices: formatInteger(row.invoiceCount),
      buys: formatInteger(row.buyCount),
      sells: formatInteger(row.sellCount),
      qty_buy: formatInteger(row.boughtQuantity),
      qty_sell: formatInteger(row.soldQuantity),
      comm_orders: formatMoney(row.orderCommission),
      fee_invoices: formatMoney(row.invoiceFees),
      fee_gap: formatSignedMoney(row.feeGap),
      net: formatSignedMoney(row.realizedNet),
    }))
  }, [analyticsQuery.model.rows])

  const invoiceRows = useMemo(() => {
    return analyticsQuery.model.invoiceRows.slice(0, 20).map((row) => ({
      issued: formatDateTime(row.issuedAt),
      invoice: row.invoiceNumber,
      ref: row.orderReferenceId ?? '--',
      side: row.side.toUpperCase(),
      symbol: row.symbol ?? '--',
      payable: formatMoney(row.payableAmount),
      tax: formatMoney(row.taxAmount),
      description: row.description ?? '--',
    }))
  }, [analyticsQuery.model.invoiceRows])

  const unmappedRows = useMemo(() => {
    return analyticsQuery.model.unmappedInvoices.slice(0, 10).map((row) => ({
      issued: formatDateTime(row.issuedAt),
      invoice: row.invoiceNumber,
      ref: row.orderReferenceId ?? '--',
      payable: formatMoney(row.payableAmount),
      description: row.description ?? '--',
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
  const status = analyticsQuery.isError
    ? { label: 'Degraded', tone: 'degraded' }
    : hasUnmappedInvoices
      ? { label: 'Mapping Alert', tone: 'warning' }
      : analyticsQuery.isLoading
        ? { label: 'Loading', tone: 'loading' }
        : analyticsQuery.isFetching
          ? { label: 'Syncing', tone: 'syncing' }
          : { label: 'Ready', tone: 'ready' }

  return (
    <article className="paperwork-card">
      <header className="paperwork-card__header paperwork-card__header--analytics">
        <div className="paperwork-card__copy">
          <span className="paperwork-card__eyebrow">Analytics</span>
          <h3 className="paperwork-card__title">Orders x Invoices</h3>
          <p>Period reconciliation between approved Trii orders and the Accival invoice archive for the logged-in user.</p>
          <p>{formatCoveredRange(analyticsQuery.coveredMonths)}</p>
          <p>{authenticatedUserEmail ? `Signed in as ${authenticatedUserEmail}` : 'No authenticated email available.'}</p>
        </div>

        <div className="paperwork-analytics__toolbar">
          <div className="paperwork-analytics__months" role="tablist" aria-label="Paperwork periods">
            {PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`paperwork-analytics__monthButton${option.value === activePeriod.value ? ' paperwork-analytics__monthButton--active' : ''}`}
                onClick={() => setSelectedPeriod(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <span className={`paperwork-analytics__status paperwork-analytics__status--${status.tone}`}>{status.label}</span>
        </div>
      </header>

      <div className="paperwork-analytics__metrics">
        <MetricPill label="Invoices" value={formatInteger(analyticsQuery.model.summary.invoiceCount)} />
        <MetricPill label="Mapped" value={formatInteger(analyticsQuery.model.summary.mappedInvoiceCount)} />
        <MetricPill label="Orders" value={formatInteger(analyticsQuery.model.summary.approvedOrderCount)} />
        <MetricPill label="Comm Orders" value={formatMoney(analyticsQuery.model.summary.orderCommission)} />
        <MetricPill label="Fees Invoices" value={formatMoney(analyticsQuery.model.summary.invoiceFees)} />
        <MetricPill label="Fee Gap" value={formatSignedMoney(analyticsQuery.model.summary.feeGap)} tone={toneFromSigned(analyticsQuery.model.summary.feeGap, true)} />
        <MetricPill label="Net" value={formatSignedMoney(analyticsQuery.model.summary.realizedNet)} tone={toneFromSigned(analyticsQuery.model.summary.realizedNet)} />
        <MetricPill label="Unmapped" value={formatInteger(analyticsQuery.model.summary.unmappedInvoiceCount)} tone={analyticsQuery.model.summary.unmappedInvoiceCount > 0 ? 'warning' : undefined} />
      </div>

      {analyticsQuery.isError ? (
        <div className="paperwork-notice paperwork-notice--error" role="alert">
          {analyticsQuery.error instanceof Error ? analyticsQuery.error.message : 'Could not load paperwork analytics.'}
        </div>
      ) : null}

      {hasUnmappedInvoices ? (
        <div className="paperwork-notice paperwork-notice--warning" role="alert">
          {`Unmapped invoice names detected: ${formatInteger(analyticsQuery.model.summary.unmappedInvoiceCount)} record(s). Add the missing issuer alias in invoiceSymbolMap.ts.`}
          {unmappedExamples.length > 0 ? ` Examples: ${unmappedExamples.join(' | ')}` : ''}
        </div>
      ) : null}

      {reconciliationRows.length > 0 ? (
        <section className="paperwork-section">
          <div className="paperwork-section__header">
            <h4>By symbol</h4>
            <p>Approved orders, invoice coverage, fees, and realized net result for the selected period.</p>
          </div>
          <DataTable rows={reconciliationRows} />
        </section>
      ) : (
        <div className="paperwork-empty">No approved orders or invoices were found for the selected period.</div>
      )}

      {invoiceRows.length > 0 ? (
        <section className="paperwork-section">
          <div className="paperwork-section__header">
            <h4>Invoice documents</h4>
            <p>Latest invoice rows for the selected period, including extracted side and explicit symbol mapping.</p>
          </div>
          <DataTable rows={invoiceRows} />
        </section>
      ) : null}

      {unmappedRows.length > 0 ? (
        <section className="paperwork-section">
          <div className="paperwork-section__header">
            <h4>Needs mapping</h4>
            <p>Invoices whose `line_description` does not match any explicit issuer alias in the invoice symbol map.</p>
          </div>
          <DataTable rows={unmappedRows} />
        </section>
      ) : null}
    </article>
  )
}

function MetricPill(props: { label: string; value: string; tone?: 'positive' | 'negative' | 'warning' }) {
  const { label, value, tone } = props
  return (
    <div className={`paperwork-metricPill${tone ? ` paperwork-metricPill--${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
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

function toneFromSigned(value: number, invert = false): 'positive' | 'negative' | undefined {
  if (value === 0) {
    return undefined
  }

  if (invert) {
    return value < 0 ? 'positive' : 'negative'
  }

  return value > 0 ? 'positive' : 'negative'
}

function formatCoveredRange(months: Array<{ label: string }>) {
  if (months.length === 0) {
    return 'No months selected.'
  }

  if (months.length === 1) {
    return `Coverage: ${months[0]?.label ?? '--'}`
  }

  return `Coverage: ${months[months.length - 1]?.label ?? '--'} to ${months[0]?.label ?? '--'}`
}
