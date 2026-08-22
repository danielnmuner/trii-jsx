import { useMemo, useState } from 'react'
import type { DailyClosingRecord } from '../api/schemas'
import {
  formatCurrency,
  formatInteger,
  formatMetricValue,
  formatMillionsWhenLarge,
  formatPercentFromWhole,
} from '../lib/formatters'
import { SymbolIdentity } from './SymbolIdentity'

type DailyClosingWindow = {
  symbol: string
  recordCount: number
  records: DailyClosingRecord[]
}

type DailyClosingPanelProps = {
  windows: DailyClosingWindow[]
}

export function DailyClosingPanel({ windows }: DailyClosingPanelProps) {
  const visibleWindows = windows.filter((window) => window.records.length > 0)

  return (
    <section className="daily-close-grid" aria-label="Daily closing charts">
      {visibleWindows.map((window) => (
        <DailyClosingCard key={window.symbol} window={window} />
      ))}
    </section>
  )
}

function DailyClosingCard({ window }: { window: DailyClosingWindow }) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const chart = useMemo(() => buildDailyClosingChart(window.records), [window.records])
  const activeRecord = useMemo(
    () => window.records.find((record) => buildDailyClosingKey(record) === activeKey) ?? null,
    [activeKey, window.records],
  )
  const activePoint = useMemo(() => chart.points.find((point) => point.key === activeKey) ?? null, [activeKey, chart.points])

  return (
    <article className="daily-close-card">
      <header className="daily-close-card__header">
        <div className="daily-close-card__title">
          <h3>
            <SymbolIdentity symbol={window.symbol} />
          </h3>
        </div>
      </header>

      <div className="daily-close-card__chartShell">
        {activeRecord && activePoint ? <DailyClosingTooltip record={activeRecord} point={activePoint} /> : null}

        <svg
          className="daily-close-chart"
          viewBox="0 0 640 280"
          preserveAspectRatio="none"
          aria-label={`${window.symbol} daily closing chart`}
          onMouseLeave={() => setActiveKey(null)}
        >
          <line x1="64" y1="18" x2="64" y2="236" className="daily-close-chart__axisLine" />
          <line x1="64" y1="236" x2="614" y2="236" className="daily-close-chart__axisLine daily-close-chart__axisLine--bottom" />

          {chart.yTicks.map((tick) => (
            <g key={tick.key}>
              <line x1="64" y1={tick.y} x2="614" y2={tick.y} className="daily-close-chart__gridLine" />
              <text x="10" y={tick.y + 3} textAnchor="start" className="daily-close-chart__yLabel">
                {tick.label}
              </text>
            </g>
          ))}

          {activePoint ? (
            <line
              x1={activePoint.x}
              y1="18"
              x2={activePoint.x}
              y2="236"
              className="daily-close-chart__focusLine"
            />
          ) : null}

          {chart.xTicks.map((tick) => (
            <g key={tick.key}>
              <line x1={tick.x} y1="236" x2={tick.x} y2="240" stroke="rgba(220,228,242,0.18)" strokeWidth="1" />
              <text x={tick.x} y="256" textAnchor="middle" className="daily-close-chart__axisLabel">
                {tick.labelTop}
              </text>
              <text x={tick.x} y="269" textAnchor="middle" className="daily-close-chart__axisLabel daily-close-chart__axisLabel--faint">
                {tick.labelBottom}
              </text>
            </g>
          ))}

          <path
            d={chart.smoothPath}
            fill="none"
            stroke="rgba(123, 194, 248, 0.68)"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {chart.points.map((point) => {
            const isActive = point.key === activeKey
            return (
              <g key={point.key}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? 3.3 : 2.05}
                  fill="rgba(138, 205, 255, 0.88)"
                  stroke={isActive ? 'rgba(244,246,248,0.7)' : 'rgba(255,255,255,0.16)'}
                  strokeWidth={isActive ? 0.7 : 0.32}
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={9}
                  fill="transparent"
                  className="daily-close-chart__pointHit"
                  onMouseEnter={() => setActiveKey(point.key)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Inspect daily closing point for ${window.symbol} on ${point.label}`}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActiveKey(point.key)
                    }
                  }}
                />
              </g>
            )
          })}
        </svg>
      </div>
    </article>
  )
}

function DailyClosingTooltip({
  record,
  point,
}: {
  record: DailyClosingRecord
  point: { x: number; y: number }
}) {
  const dailyTone =
    typeof record.daily_change_amount === 'number' && record.daily_change_amount < 0 ? 'negative' : 'positive'
  const alignRight = point.x > 436
  const alignBelow = point.y < 112
  const tooltipWidth = 236
  const tooltipHeight = 150
  const horizontalStyle = alignRight
    ? `clamp(8px, calc(${((point.x / 640) * 100).toFixed(3)}% - ${tooltipWidth + 12}px), calc(100% - ${tooltipWidth + 8}px))`
    : `clamp(8px, ${((point.x / 640) * 100).toFixed(3)}%, calc(100% - ${tooltipWidth + 8}px))`
  const verticalStyle = alignBelow
    ? `clamp(8px, calc(${((point.y / 280) * 100).toFixed(3)}% + 12px), calc(100% - ${tooltipHeight + 8}px))`
    : `clamp(8px, calc(${((point.y / 280) * 100).toFixed(3)}% - ${tooltipHeight + 12}px), calc(100% - ${tooltipHeight + 8}px))`

  return (
    <div className="daily-close-tooltip" style={{ left: horizontalStyle, top: verticalStyle }}>
      <div className="daily-close-tooltip__priceRow">
        <strong className="daily-close-tooltip__priceValue">{formatMetricValue('last_price', record.last_price)}</strong>
        <span className="daily-close-tooltip__referenceValue">
          {formatMetricValue('last_price', record.previous_close)}{' '}
          <span className={`daily-close-tooltip__referenceDelta daily-close-tooltip__referenceDelta--${dailyTone}`}>
            ({formatPercentFromWhole(record.daily_change_percent)})
          </span>
        </span>
      </div>
      <div className={`daily-close-tooltip__delta daily-close-tooltip__delta--${dailyTone}`}>
        {formatMetricValue('last_price', record.daily_change_amount)} ({formatPercentFromWhole(record.daily_change_percent)})
      </div>
      <div className="daily-close-tooltip__metrics">
        <div className="daily-close-tooltip__metric">
          <span>High</span>
          <strong>{formatCurrency(record.high_price)}</strong>
        </div>
        <div className="daily-close-tooltip__metric">
          <span>Best Ask</span>
          <strong>{formatCurrency(record.best_ask_price)}</strong>
        </div>
        <div className="daily-close-tooltip__metric">
          <span>Low</span>
          <strong>{formatCurrency(record.low_price)}</strong>
        </div>
        <div className="daily-close-tooltip__metric">
          <span>Best Bid</span>
          <strong>{formatCurrency(record.best_bid_price)}</strong>
        </div>
        <div className="daily-close-tooltip__metric">
          <span>Volume</span>
          <strong>{formatMillionsWhenLarge(record.traded_volume, { digits: 0, fallback: 'integer' })}</strong>
        </div>
        <div className="daily-close-tooltip__metric">
          <span>Value</span>
          <strong>{formatMillionsWhenLarge(record.traded_value, { digits: 1, fallback: 'integer' })}</strong>
        </div>
      </div>
    </div>
  )
}

function buildDailyClosingChart(records: DailyClosingRecord[]) {
  if (records.length === 0) {
    return {
      smoothPath: '',
      points: [],
      xTicks: [],
      yTicks: [],
    }
  }

  const chartLeft = 64
  const chartRight = 614
  const chartTop = 18
  const chartBottom = 236
  const chartWidth = chartRight - chartLeft
  const chartHeight = chartBottom - chartTop

  const timestamps = records
    .map((record) => new Date(record.source_captured_at ?? `${record.trading_date}T15:00:00-05:00`).getTime())
    .filter((value) => !Number.isNaN(value))
  const minTime = Math.min(...timestamps)
  const maxTime = Math.max(...timestamps)
  const timeDomain = maxTime - minTime || 1

  const values = records
    .map((record) => record.last_price)
    .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value))
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = Math.max((maxValue - minValue) * 0.12, maxValue * 0.003, 1)
  const yMin = minValue - padding
  const yMax = maxValue + padding
  const yDomain = yMax - yMin || 1

  const points = records.map((record, index) => {
    const timeValue = new Date(record.source_captured_at ?? `${record.trading_date}T15:00:00-05:00`).getTime()
    const xRatio = Number.isNaN(timeValue) ? index / Math.max(records.length - 1, 1) : (timeValue - minTime) / timeDomain
    const x = chartLeft + xRatio * chartWidth
    const lastPrice = typeof record.last_price === 'number' ? record.last_price : yMin
    const y = chartBottom - ((lastPrice - yMin) / yDomain) * chartHeight

    return {
      key: buildDailyClosingKey(record),
      x,
      y,
      label: record.trading_date,
    }
  })

  return {
    smoothPath: buildSmoothPath(points.map((point) => ({ x: point.x, y: point.y }))),
    points,
    xTicks: buildDailyClosingTicks(records, minTime, timeDomain, chartLeft, chartWidth),
    yTicks: buildDailyClosingYTicks(yMin, yMax, chartTop, chartBottom),
  }
}

function buildDailyClosingTicks(
  records: DailyClosingRecord[],
  minTime: number,
  timeDomain: number,
  chartLeft: number,
  chartWidth: number,
) {
  const tickIndexes = Array.from(
    new Set([0, Math.floor((records.length - 1) * 0.33), Math.floor((records.length - 1) * 0.66), records.length - 1]),
  )

  return tickIndexes.map((index) => {
    const record = records[index]
    const timeValue = new Date(record.source_captured_at ?? `${record.trading_date}T15:00:00-05:00`).getTime()
    const xRatio = Number.isNaN(timeValue) ? index / Math.max(records.length - 1, 1) : (timeValue - minTime) / (timeDomain || 1)
    const date = new Date(record.source_captured_at ?? `${record.trading_date}T15:00:00-05:00`)

    return {
      key: `${record.trading_date}-${index}`,
      x: chartLeft + xRatio * chartWidth,
      labelTop: new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Bogota',
        month: 'short',
        day: '2-digit',
      }).format(date),
      labelBottom: new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Bogota',
        weekday: 'short',
      }).format(date),
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

function buildDailyClosingYTicks(yMin: number, yMax: number, chartTop: number, chartBottom: number) {
  const tickCount = 4
  const range = yMax - yMin || 1

  return Array.from({ length: tickCount }, (_, index) => {
    const ratio = index / (tickCount - 1)
    const value = yMax - ratio * range
    const y = chartTop + ratio * (chartBottom - chartTop)

    return {
      key: `y-${index}`,
      y,
      label: formatInteger(value),
    }
  })
}

function buildDailyClosingKey(record: DailyClosingRecord) {
  return record.source_snapshot_checksum ?? `${record.symbol}-${record.trading_date}`
}
