import { useEffect, useMemo, useState } from 'react'
import type { ZscoreMetricSample, ZscoreOpportunityRecord } from '../api/schemas'
import { formatMetricValue, formatNumber, formatPercentFromWhole, formatTimestamp } from '../lib/formatters'
import { buildZscoreOpportunityPrompt, copyTextToClipboard } from '../lib/zscoreOpportunityClipboard'
import { SymbolIdentity } from './SymbolIdentity'

type ZscoreWindow = {
  symbol: string
  tradingDate: string
  recordCount: number
  records: ZscoreOpportunityRecord[]
}

type ZscoreOpportunityPanelProps = {
  windows: ZscoreWindow[]
}

const zscoreMetricOrder = ['obi_l1', 'obi_top_5', 'spread_bps', 'traded_value', 'traded_volume'] as const

const zscoreMetricLabels: Record<(typeof zscoreMetricOrder)[number], string> = {
  obi_l1: 'OBI L1',
  obi_top_5: 'OBI Top 5',
  spread_bps: 'Spread BPS',
  traded_value: 'Traded Value',
  traded_volume: 'Traded Volume',
}

const zoomHoursOptions = [6, 12, 24, 48] as const

export function ZscoreOpportunityPanel({ windows }: ZscoreOpportunityPanelProps) {
  const visibleWindows = windows.filter((window) => window.records.length > 0)

  return (
    <section className="zscore-grid" aria-label="Z-score opportunities strategic charts">
      {visibleWindows.map((window) => (
        <ZscoreOpportunityCard key={window.symbol} window={window} />
      ))}
    </section>
  )
}

function ZscoreOpportunityCard({ window }: { window: ZscoreWindow }) {
  const [activeChecksum, setActiveChecksum] = useState<string | null>(null)
  const [rangeHours, setRangeHours] = useState<(typeof zoomHoursOptions)[number]>(48)
  const [copyState, setCopyState] = useState<{ key: string; status: 'copied' | 'error' } | null>(null)

  const filteredRecords = useMemo(() => {
    if (window.records.length === 0) {
      return window.records
    }

    const rangeStart = Date.now() - rangeHours * 60 * 60 * 1000
    return window.records.filter((record) => {
      const epoch = new Date(record.captured_at).getTime()
      return !Number.isNaN(epoch) && epoch >= rangeStart
    })
  }, [rangeHours, window.records])

  const chart = useMemo(() => buildZscoreChart(filteredRecords), [filteredRecords])

  const activeRecord = useMemo(() => {
    if (!activeChecksum) {
      return null
    }

    return (
      filteredRecords.find((record) => (record.snapshot_checksum || record.captured_at) === activeChecksum) ??
      null
    )
  }, [activeChecksum, filteredRecords])

  const activePoint = useMemo(() => {
    const activeKey = activeRecord ? activeRecord.snapshot_checksum || activeRecord.captured_at : null
    return chart.points.find((point) => point.key === activeKey) ?? null
  }, [activeRecord, chart.points])

  const strongestPeriodSignal = useMemo(() => buildStrongestPeriodSignal(filteredRecords), [filteredRecords])

  useEffect(() => {
    if (!copyState) {
      return undefined
    }

    const timeoutId = globalThis.setTimeout(() => {
      setCopyState(null)
    }, 1400)

    return () => globalThis.clearTimeout(timeoutId)
  }, [copyState])

  async function handlePointCopy(record: ZscoreOpportunityRecord) {
    const key = record.snapshot_checksum || record.captured_at
    setActiveChecksum(key)

    try {
      await copyTextToClipboard(buildZscoreOpportunityPrompt(record))
      setCopyState({ key, status: 'copied' })
    } catch {
      setCopyState({ key, status: 'error' })
    }
  }

  return (
    <article className="zscore-card">
      <header className="zscore-card__header">
        <div className="zscore-card__title">
          <h3>
            <SymbolIdentity symbol={window.symbol} />
          </h3>
        </div>
        <div className="zscore-toolbar" aria-label={`${window.symbol} zoom range`}>
          {zoomHoursOptions.map((hours) => (
            <button
              key={hours}
              type="button"
              className={`zscore-toolbar__chip ${rangeHours === hours ? 'zscore-toolbar__chip--active' : ''}`}
              onClick={() => setRangeHours(hours)}
            >
              {hours}H
            </button>
          ))}
        </div>
      </header>

      <div className="zscore-card__chartShell">
        {copyState ? (
          <div className={`zscore-copyToast ${copyState.status === 'error' ? 'zscore-copyToast--error' : ''}`}>
            {copyState.status === 'copied' ? 'AI prompt copied' : 'Clipboard unavailable'}
          </div>
        ) : null}
        {activeRecord && activePoint ? <ZscorePointTooltip record={activeRecord} point={activePoint} /> : null}
        {filteredRecords.length === 0 ? (
          <div className="zscore-chart__empty">No records in selected window</div>
        ) : null}

        <svg
          className="zscore-chart"
          viewBox="0 0 640 296"
          preserveAspectRatio="none"
          aria-label={`${window.symbol} z-score opportunity chart`}
          onMouseLeave={() => setActiveChecksum(null)}
        >
          <defs>
            <linearGradient id={`zscore-fill-${window.symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(88, 179, 255, 0.24)" />
              <stop offset="100%" stopColor="rgba(88, 179, 255, 0.02)" />
            </linearGradient>
          </defs>

          {chart.referenceLines.map((line) => (
            <g key={line.key}>
              <line
                x1="44"
                y1={line.y}
                x2="612"
                y2={line.y}
                stroke={line.color}
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.82"
              />
              <text x={line.textX} y={line.y - 4} textAnchor={line.textAnchor} className={`zscore-chart__refLabel ${line.className}`}>
                {line.label}
              </text>
            </g>
          ))}

          {chart.xTicks.map((tick) => (
            <g key={tick.key}>
              <line x1={tick.x} y1="252" x2={tick.x} y2="256" stroke="rgba(220,228,242,0.24)" strokeWidth="1" />
              <text x={tick.x} y="272" textAnchor="middle" className="zscore-chart__axisLabel">
                {tick.labelTop}
              </text>
              <text x={tick.x} y="286" textAnchor="middle" className="zscore-chart__axisLabel zscore-chart__axisLabel--faint">
                {tick.labelBottom}
              </text>
            </g>
          ))}

          <path d={chart.areaPath} fill={`url(#zscore-fill-${window.symbol})`} />
          <path
            d={chart.smoothPath}
            fill="none"
            stroke="rgba(123, 194, 248, 0.62)"
            strokeWidth="1.1"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {chart.points.map((point, pointIndex) => {
            const isActive = activeRecord && point.key === (activeRecord.snapshot_checksum || activeRecord.captured_at)
            const pointRecord = filteredRecords[pointIndex]
            return (
              <g key={point.key}>
                {point.metricCount > 0 ? (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={2.7 + Math.min(point.metricCount, 5) * 0.2}
                    fill="rgba(123, 194, 248, 0.045)"
                  />
                ) : null}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? 3.1 : 1.85}
                  fill="rgba(138, 205, 255, 0.86)"
                  stroke={isActive ? 'rgba(244,246,248,0.72)' : 'rgba(255,255,255,0.14)'}
                  strokeWidth={isActive ? 0.7 : 0.32}
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={10}
                  fill="transparent"
                  className="zscore-chart__pointHit"
                  data-testid="zscore-copy-hit"
                  role="button"
                  aria-label={`Copy AI prompt for ${window.symbol} at ${pointRecord?.captured_at ?? point.key}`}
                  onMouseEnter={() => setActiveChecksum(point.key)}
                  onClick={() => {
                    if (pointRecord) {
                      void handlePointCopy(pointRecord)
                    }
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && pointRecord) {
                      event.preventDefault()
                      void handlePointCopy(pointRecord)
                    }
                  }}
                  tabIndex={0}
                />
              </g>
            )
          })}

          {activePoint ? (
            <line
              x1={activePoint.x}
              y1="16"
              x2={activePoint.x}
              y2="252"
              stroke="rgba(244,246,248,0.2)"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
          ) : null}
        </svg>
      </div>

      <div className="zscore-card__footer">
        <div className="zscore-card__footerItem zscore-card__footerItem--left">
          {strongestPeriodSignal ? (
            <span>
              Peak {strongestPeriodSignal.label} ({strongestPeriodSignal.zScore >= 0 ? '+' : ''}
              {formatNumber(strongestPeriodSignal.zScore)}) {formatPeakTimestamp(strongestPeriodSignal.capturedAt)}
            </span>
          ) : null}
        </div>
        <div className="zscore-card__footerItem zscore-card__footerItem--right">
          <span>
            {formatChartFooterTimestamp(filteredRecords[filteredRecords.length - 1]?.captured_at)} ({filteredRecords.length})
          </span>
        </div>
      </div>
    </article>
  )
}

function ZscorePointTooltip({
  record,
  point,
}: {
  record: ZscoreOpportunityRecord
  point: { x: number; y: number }
}) {
  const dailyChangeTone =
    typeof record.daily_change_amount === 'number' && record.daily_change_amount < 0 ? 'negative' : 'positive'
  const pointMetrics = zscoreMetricOrder
    .map((metricKey) => ({
      metricKey,
      metric: record.triggered_z_scores?.[metricKey],
    }))
    .filter((entry) => entry.metric)
  const alignRight = point.x > 436
  const alignBelow = point.y < 110
  const tooltipWidth = 214
  const tooltipHeight = 134
  const horizontalStyle = alignRight
    ? `clamp(8px, calc(${((point.x / 640) * 100).toFixed(3)}% - ${tooltipWidth + 12}px), calc(100% - ${tooltipWidth + 8}px))`
    : `clamp(8px, ${((point.x / 640) * 100).toFixed(3)}%, calc(100% - ${tooltipWidth + 8}px))`
  const verticalStyle = alignBelow
    ? `clamp(8px, calc(${((point.y / 296) * 100).toFixed(3)}% + 12px), calc(100% - ${tooltipHeight + 8}px))`
    : `clamp(8px, calc(${((point.y / 296) * 100).toFixed(3)}% - ${tooltipHeight + 12}px), calc(100% - ${tooltipHeight + 8}px))`
  const style = {
    left: horizontalStyle,
    top: verticalStyle,
  }

  return (
    <div
      className="zscore-tooltip"
      style={style}
    >
      <div className="zscore-tooltip__timestamp">{formatTimestamp(record.captured_at)}</div>
      <div className="zscore-tooltip__priceRow">
        <strong className="zscore-tooltip__priceValue">{formatMetricValue('last_price', record.last_price)}</strong>
      </div>
      <div className={`zscore-tooltip__delta zscore-tooltip__delta--${dailyChangeTone}`}>
        {formatMetricValue('last_price', record.daily_change_amount)} ({formatPercentFromWhole(record.daily_change_percent)})
      </div>
      {pointMetrics.length > 0 ? (
        <div className="zscore-tooltip__metrics">
          {pointMetrics.map(({ metricKey, metric }) => {
            const zScore = metric?.z_score
            return (
              <div key={metricKey} className="zscore-tooltip__metric">
                <div className="zscore-tooltip__metricHead">
                  <span className="zscore-tooltip__metricSample">{formatSampleMetric(metricKey, metric?.sample_value)}</span>
                  <strong className="zscore-tooltip__metricZ">
                    ({typeof zScore === 'number' ? `${zScore >= 0 ? '+' : ''}${formatNumber(zScore)}${`\u03c3`}` : 'n/a'})
                  </strong>
                </div>
                <span className="zscore-tooltip__metricLabel">{zscoreMetricLabels[metricKey]}</span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function buildZscoreChart(records: ZscoreOpportunityRecord[]) {
  if (records.length === 0) {
    return {
      smoothPath: '',
      areaPath: '',
      points: [],
      referenceLines: [],
      xTicks: [],
    }
  }

  const chartLeft = 44
  const chartRight = 612
  const chartTop = 16
  const chartBottom = 252
  const chartWidth = chartRight - chartLeft
  const chartHeight = chartBottom - chartTop

  const timestamps = records.map((record) => new Date(record.captured_at).getTime()).filter((value) => !Number.isNaN(value))
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const timeDomain = maxTime - minTime || 1

  const latestRecord = records[records.length - 1]
  const referenceValues = [
    latestRecord?.previous_close,
    latestRecord?.high_price,
    latestRecord?.low_price,
    ...records.map((record) => record.last_price),
  ].filter((value): value is number => typeof value === 'number' && !Number.isNaN(value))

  const minValue = Math.min(...referenceValues)
  const maxValue = Math.max(...referenceValues)
  const padding = Math.max((maxValue - minValue) * 0.08, maxValue * 0.004, 1)
  const yMin = minValue - padding
  const yMax = maxValue + padding
  const yDomain = yMax - yMin || 1

  const points = records.map((record, index) => {
    const timeValue = new Date(record.captured_at).getTime()
    const xRatio = Number.isNaN(timeValue) ? index / Math.max(records.length - 1, 1) : (timeValue - minTime) / timeDomain
    const x = chartLeft + xRatio * chartWidth
    const lastPrice = typeof record.last_price === 'number' ? record.last_price : yMin
    const y = chartBottom - ((lastPrice - yMin) / yDomain) * chartHeight
    const metrics = zscoreMetricOrder
      .map((metricKey) => record.triggered_z_scores?.[metricKey])
      .filter((metric): metric is ZscoreMetricSample => Boolean(metric))
    return {
      key: record.snapshot_checksum || record.captured_at,
      x,
      y,
      metricCount: metrics.filter((metric) => typeof metric.z_score === 'number').length,
    }
  })

  const smoothPath = buildSmoothPath(points.map((point) => ({ x: point.x, y: point.y })))
  const areaPath = `${smoothPath} L ${points[points.length - 1].x.toFixed(2)} ${chartBottom} L ${points[0].x.toFixed(2)} ${chartBottom} Z`

  const referenceLines = [
    buildReferenceLine('previous_close', latestRecord?.previous_close, yMin, yDomain, chartTop, chartBottom, 'Prev Close', 'rgba(244,246,248,0.36)', 'neutral', 'left'),
    buildReferenceLine('high_price', latestRecord?.high_price, yMin, yDomain, chartTop, chartBottom, 'High', 'rgba(52,211,153,0.32)', 'positive'),
    buildReferenceLine('low_price', latestRecord?.low_price, yMin, yDomain, chartTop, chartBottom, 'Low', 'rgba(251,113,133,0.32)', 'negative'),
  ].filter(Boolean) as Array<{ key: string; y: number; label: string; color: string; className: string; textX: number; textAnchor: 'start' | 'end' }>

  const xTicks = buildTimeTicks(records, minTime, timeDomain, chartLeft, chartWidth)

  return {
    smoothPath,
    areaPath,
    points,
    referenceLines,
    xTicks,
  }
}

function buildStrongestPeriodSignal(records: ZscoreOpportunityRecord[]) {
  let strongest: { label: string; zScore: number; capturedAt: string } | null = null

  for (const record of records) {
    for (const metricKey of zscoreMetricOrder) {
      const zScore = record.triggered_z_scores?.[metricKey]?.z_score
      if (typeof zScore !== 'number') {
        continue
      }

      if (!strongest || Math.abs(zScore) > Math.abs(strongest.zScore)) {
        strongest = {
          label: zscoreMetricLabels[metricKey],
          zScore,
          capturedAt: record.captured_at,
        }
      }
    }
  }

  return strongest
}

function buildReferenceLine(
  key: string,
  value: number | null | undefined,
  yMin: number,
  yDomain: number,
  chartTop: number,
  chartBottom: number,
  label: string,
  color: string,
  className: string,
  align: 'left' | 'right' = 'right',
) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null
  }

  return {
    key,
    y: chartBottom - ((value - yMin) / yDomain) * (chartBottom - chartTop),
    label: `${label} ${formatMetricValue('last_price', value)}`,
    color,
    className,
    textX: align === 'left' ? 48 : 608,
    textAnchor: align === 'left' ? ('start' as const) : ('end' as const),
  }
}

function buildTimeTicks(records: ZscoreOpportunityRecord[], minTime: number, timeDomain: number, chartLeft: number, chartWidth: number) {
  const tickIndexes = Array.from(
    new Set([0, Math.floor((records.length - 1) * 0.25), Math.floor((records.length - 1) * 0.5), Math.floor((records.length - 1) * 0.75), records.length - 1]),
  )
  return tickIndexes.map((index) => {
    const record = records[index]
    const timeValue = new Date(record.captured_at).getTime()
    const xRatio = Number.isNaN(timeValue) ? index / Math.max(records.length - 1, 1) : (timeValue - minTime) / (timeDomain || 1)
    return {
      key: `${record.captured_at}-${index}`,
      x: chartLeft + xRatio * chartWidth,
      labelTop: new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Bogota',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(record.captured_at)),
      labelBottom: new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Bogota',
        month: 'short',
        day: '2-digit',
      }).format(new Date(record.captured_at)),
    }
  })
}

function buildSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return ''
  }
  if (points.length === 1) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  }

  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[index + 2] ?? p2

    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6

    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return path
}

function formatSampleMetric(metricKey: (typeof zscoreMetricOrder)[number], value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a'
  }

  if (metricKey === 'traded_value') {
    return formatMagnitude(value)
  }
  if (metricKey === 'traded_volume') {
    return formatMagnitude(value)
  }

  return formatMetricValue(metricKey, value)
}

function formatMagnitude(value: number) {
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000) {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value / 1_000_000))} M`
  }
  if (absolute >= 1_000) {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value / 1_000))} K`
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value))
}

function formatChartFooterTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'n/a'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}

function formatPeakTimestamp(value: string | null | undefined) {
  if (!value) {
    return 'n/a'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}
