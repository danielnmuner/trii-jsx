import { useEffect, useMemo, useState } from 'react'
import type { DailyClosingRecord } from '../api/schemas'
import type { DailyOrderPositionSummary } from '../lib/orderPosition'
import {
  formatCurrency,
  formatInteger,
  formatMetricValue,
  formatMillionsWhenLarge,
  formatNumber,
  formatPercentFromWhole,
} from '../lib/formatters'
import { isColombiaBusinessDateKey } from '../lib/colombiaBusinessCalendar'
import { SymbolIdentity } from './SymbolIdentity'

type DailyClosingWindow = {
  symbol: string
  recordCount: number
  records: DailyClosingRecord[]
}

type DailyClosingPanelProps = {
  windows: DailyClosingWindow[]
  orderTimelineBySymbol?: Record<string, Record<string, DailyOrderPositionSummary | undefined>>
}

const dailyClosingRangeOptions = [365, 180, 90, 30, 15, 7] as const

export function DailyClosingPanel({ windows, orderTimelineBySymbol = {} }: DailyClosingPanelProps) {
  const [rangeDays, setRangeDays] = useState<(typeof dailyClosingRangeOptions)[number]>(365)
  const visibleWindows = windows.filter((window) => window.records.length > 0)

  return (
    <section className="daily-close-grid" aria-label="Daily closing charts">
      {visibleWindows.map((window) => (
        <DailyClosingCard
          key={window.symbol}
          window={window}
          rangeDays={rangeDays}
          onChangeRangeDays={setRangeDays}
          orderTimeline={orderTimelineBySymbol[window.symbol] ?? {}}
        />
      ))}
    </section>
  )
}

function DailyClosingCard({
  window,
  rangeDays,
  onChangeRangeDays,
  orderTimeline,
}: {
  window: DailyClosingWindow
  rangeDays: (typeof dailyClosingRangeOptions)[number]
  onChangeRangeDays: (value: (typeof dailyClosingRangeOptions)[number]) => void
  orderTimeline: Record<string, DailyOrderPositionSummary | undefined>
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const chartThemeId = useMemo(
    () => `daily-close-${window.symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    [window.symbol],
  )
  const filteredRecords = useMemo(() => {
    if (window.records.length === 0) {
      return window.records
    }

    const epochs = window.records
      .map((record) => new Date(record.source_captured_at ?? `${record.trading_date}T15:00:00-05:00`).getTime())
      .filter((value) => !Number.isNaN(value))

    if (epochs.length === 0) {
      return window.records
    }

    const latestEpoch = Math.max(...epochs)
    const rangeStart = latestEpoch - rangeDays * 24 * 60 * 60 * 1000

    return window.records.filter((record) => {
      if (!isColombiaBusinessDateKey(record.trading_date)) {
        return false
      }
      const epoch = new Date(record.source_captured_at ?? `${record.trading_date}T15:00:00-05:00`).getTime()
      return !Number.isNaN(epoch) && epoch >= rangeStart
    })
  }, [rangeDays, window.records])
  const chart = useMemo(() => buildDailyClosingChart(filteredRecords), [filteredRecords])
  const activeRecord = useMemo(
    () => filteredRecords.find((record) => buildDailyClosingKey(record) === activeKey) ?? null,
    [activeKey, filteredRecords],
  )
  const activePoint = useMemo(() => chart.points.find((point) => point.key === activeKey) ?? null, [activeKey, chart.points])

  useEffect(() => {
    if (!activeKey) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        setActiveKey(null)
        return
      }

      if (target.closest('[data-daily-close-point-hit="true"]')) {
        return
      }

      if (target.closest('[data-daily-close-tooltip="true"]')) {
        return
      }

      setActiveKey(null)
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [activeKey])

  return (
    <article className="daily-close-card">
      <header className="daily-close-card__header">
        <div className="daily-close-card__title">
          <h3>
            <SymbolIdentity symbol={window.symbol} />
          </h3>
        </div>
        <div className="zscore-toolbar" aria-label={`${window.symbol} history range`}>
          {dailyClosingRangeOptions.map((days) => (
            <button
              key={days}
              type="button"
              className={`zscore-toolbar__chip ${rangeDays === days ? 'zscore-toolbar__chip--active' : ''}`}
              onClick={() => onChangeRangeDays(days)}
            >
              {days}D
            </button>
          ))}
        </div>
      </header>

      <div className="daily-close-card__chartShell">
        {activeRecord && activePoint ? (
          <DailyClosingTooltip
            record={activeRecord}
            point={activePoint}
            orderSummary={orderTimeline[activeRecord.trading_date] ?? null}
          />
        ) : null}
        {filteredRecords.length === 0 ? <div className="zscore-chart__empty">No records in selected window</div> : null}

        <svg
          className="daily-close-chart"
          viewBox="0 0 640 280"
          preserveAspectRatio="none"
          aria-label={`${window.symbol} daily closing chart`}
          onMouseLeave={(event) => {
            const relatedTarget = event.relatedTarget
            if (relatedTarget instanceof Element && relatedTarget.closest('[data-daily-close-tooltip="true"]')) {
              return
            }
            setActiveKey(null)
          }}
        >
          <defs>
            <linearGradient id={`${chartThemeId}-volume-bar`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="rgba(28, 37, 55, 0.08)" />
              <stop offset="100%" stopColor="rgba(91, 124, 196, 0.36)" />
            </linearGradient>
            <filter id={`${chartThemeId}-line-glow`} x="-20%" y="-30%" width="140%" height="160%">
              <feGaussianBlur stdDeviation="2.6" result="blur" />
              <feColorMatrix
                in="blur"
                type="matrix"
                values="0 0 0 0 0.118  0 0 0 0 0.863  0 0 0 0 1  0 0 0 0.52 0"
                result="glow"
              />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <line x1="64" y1="18" x2="64" y2="236" className="daily-close-chart__axisLine" />
          <line x1="600" y1="18" x2="600" y2="236" className="daily-close-chart__axisLine daily-close-chart__axisLine--volume" />
          <line x1="64" y1="236" x2="600" y2="236" className="daily-close-chart__axisLine daily-close-chart__axisLine--bottom" />

          {chart.volumeBars.map((bar) => (
            <rect
              key={bar.key}
              x={bar.x - bar.width / 2}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx="2"
              className="daily-close-chart__volumeBar"
              fill={`url(#${chartThemeId}-volume-bar)`}
            />
          ))}

          {chart.yTicks.map((tick) => (
            <g key={tick.key}>
              <line x1="64" y1={tick.y} x2="600" y2={tick.y} className="daily-close-chart__gridLine" />
              <text x="10" y={tick.y + 3} textAnchor="start" className="daily-close-chart__yLabel">
                {tick.label}
              </text>
            </g>
          ))}

          {chart.volumeTicks.map((tick) => (
            <g key={tick.key}>
              <line x1="64" y1={tick.y} x2="600" y2={tick.y} className="daily-close-chart__volumeGuide" />
              <text x="634" y={tick.y + 3} textAnchor="end" className="daily-close-chart__volumeLabel">
                {tick.label}
              </text>
            </g>
          ))}

          <path d={chart.upperBandPath} className="daily-close-chart__band daily-close-chart__band--upper" />
          <path d={chart.middleBandPath} className="daily-close-chart__band daily-close-chart__band--middle" />
          <path d={chart.lowerBandPath} className="daily-close-chart__band daily-close-chart__band--lower" />
          <text x="72" y="32" textAnchor="start" className="daily-close-chart__bandLabel daily-close-chart__bandLabel--ask">
            ASK
          </text>
          <text x="72" y="228" textAnchor="start" className="daily-close-chart__bandLabel daily-close-chart__bandLabel--bid">
            BID
          </text>

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
            d={chart.linePath}
            fill="none"
            stroke="rgba(113, 227, 255, 0.98)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${chartThemeId}-line-glow)`}
          />

          {chart.points.map((point) => {
            const isActive = point.key === activeKey
            const orderSummary = orderTimeline[point.tradingDate]
            const hasBuyOrders = (orderSummary?.buyCount ?? 0) > 0
            const hasSellOrders = (orderSummary?.sellCount ?? 0) > 0

            return (
              <g key={point.key}>
                {hasBuyOrders ? (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isActive ? 5.7 : 4.8}
                    fill="none"
                    stroke="rgba(62, 255, 162, 0.92)"
                    strokeWidth={isActive ? 0.92 : 0.72}
                  />
                ) : null}
                {hasSellOrders ? (
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={hasBuyOrders ? (isActive ? 7.1 : 6.2) : isActive ? 5.7 : 4.8}
                    fill="none"
                    stroke="rgba(255, 82, 118, 0.96)"
                    strokeWidth={isActive ? 0.98 : 0.76}
                  />
                ) : null}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? 3.3 : 2.05}
                  fill={isActive ? 'rgba(179, 244, 255, 1)' : 'rgba(123, 232, 255, 0.98)'}
                  stroke={isActive ? 'rgba(240, 252, 255, 0.92)' : 'rgba(123, 232, 255, 0.34)'}
                  strokeWidth={isActive ? 0.8 : 0.4}
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={9}
                  fill="transparent"
                  className="daily-close-chart__pointHit"
                  data-daily-close-point-hit="true"
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
  orderSummary,
}: {
  record: DailyClosingRecord
  point: { x: number; y: number }
  orderSummary: DailyOrderPositionSummary | null
}) {
  const dailyTone =
    typeof record.daily_change_amount === 'number' && record.daily_change_amount < 0 ? 'negative' : 'positive'
  const alignRight = point.x > 436
  const alignBelow = point.y < 112
  const tooltipWidth = 272
  const tooltipHeight = 204
  const horizontalStyle = alignRight
    ? `clamp(8px, calc(${((point.x / 640) * 100).toFixed(3)}% - ${tooltipWidth + 12}px), calc(100% - ${tooltipWidth + 8}px))`
    : `clamp(8px, ${((point.x / 640) * 100).toFixed(3)}%, calc(100% - ${tooltipWidth + 8}px))`
  const verticalStyle = alignBelow
    ? `clamp(8px, calc(${((point.y / 280) * 100).toFixed(3)}% + 12px), calc(100% - ${tooltipHeight + 8}px))`
    : `clamp(8px, calc(${((point.y / 280) * 100).toFixed(3)}% - ${tooltipHeight + 12}px), calc(100% - ${tooltipHeight + 8}px))`
  const realizedProfitTone = (orderSummary?.realizedProfit ?? 0) < 0 ? 'negative' : 'positive'
  const totalNetProfitTone = (orderSummary?.totalNetProfit ?? 0) < 0 ? 'negative' : 'positive'
  const vsLastTone = (orderSummary?.deltaValue ?? 0) < 0 ? 'negative' : 'positive'
  const hasOrderInventory = Boolean(orderSummary)
  const vsLastLabel =
    !orderSummary || orderSummary.deltaValue === null || orderSummary.deltaPct === null
      ? 'n/a'
      : `${orderSummary.deltaValue >= 0 ? '+' : ''}${formatInteger(orderSummary.deltaValue)} (${orderSummary.deltaPct >= 0 ? '+' : ''}${formatNumber(orderSummary.deltaPct)}%)`

  return (
    <div className="daily-close-tooltip" data-daily-close-tooltip="true" style={{ left: horizontalStyle, top: verticalStyle }}>
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
      <div className="daily-close-tooltip__inventory">
        <div className="daily-close-tooltip__inventoryMetric">
          <span>Qty</span>
          <strong>{hasOrderInventory ? formatInteger(orderSummary?.availableQuantity) : '0'}</strong>
        </div>
        <div className="daily-close-tooltip__inventoryMetric">
          <span>Average</span>
          <strong>{!orderSummary || orderSummary.displayAveragePrice === null ? 'n/a' : formatInteger(orderSummary.displayAveragePrice)}</strong>
        </div>
        <div className="daily-close-tooltip__inventoryMetric daily-close-tooltip__inventoryMetric--detail">
          <span>
            Buys
            {orderSummary && orderSummary.buyOrders.length > 0 ? (
              <span className="daily-close-tooltip__detailTrigger" aria-hidden="true">
                i
              </span>
            ) : null}
          </span>
          <strong>{hasOrderInventory ? formatInteger(orderSummary?.buyCount) : '0'}</strong>
          {orderSummary && orderSummary.buyOrders.length > 0 ? <OrderDetailsPopover orders={orderSummary.buyOrders} /> : null}
        </div>
        <div className="daily-close-tooltip__inventoryMetric daily-close-tooltip__inventoryMetric--detail">
          <span>
            Sells
            {orderSummary && orderSummary.sellOrders.length > 0 ? (
              <span className="daily-close-tooltip__detailTrigger" aria-hidden="true">
                i
              </span>
            ) : null}
          </span>
          <strong>{hasOrderInventory ? formatInteger(orderSummary?.sellCount) : '0'}</strong>
          {orderSummary && orderSummary.sellOrders.length > 0 ? <OrderDetailsPopover orders={orderSummary.sellOrders} /> : null}
        </div>
        <div className="daily-close-tooltip__inventoryMetric">
          <span>P&amp;L</span>
          <strong className={`daily-close-tooltip__inventoryValue daily-close-tooltip__inventoryValue--${realizedProfitTone}`}>
            {hasOrderInventory ? formatInteger(orderSummary?.realizedProfit) : '0'}
          </strong>
        </div>
        <div className="daily-close-tooltip__inventoryMetric">
          <span>Comm</span>
          <strong>{hasOrderInventory ? formatInteger(orderSummary?.totalCommission) : '0'}</strong>
        </div>
        <div className="daily-close-tooltip__inventoryMetric">
          <span>Total</span>
          <strong className={`daily-close-tooltip__inventoryValue daily-close-tooltip__inventoryValue--${totalNetProfitTone}`}>
            {hasOrderInventory ? formatInteger(orderSummary?.totalNetProfit) : '0'}
          </strong>
        </div>
        <div className="daily-close-tooltip__inventoryMetric">
          <span>Vs Last</span>
          <strong className={`daily-close-tooltip__inventorySubtle daily-close-tooltip__inventorySubtle--${vsLastTone}`}>{vsLastLabel}</strong>
        </div>
      </div>
    </div>
  )
}

function OrderDetailsPopover({
  orders,
}: {
  orders: Array<{
    timestamp: string | null
    quantity: number
    price: number
    side: 'buy' | 'sell'
  }>
}) {
  return (
    <div className="daily-close-tooltip__detailPopover">
      <ul className="daily-close-tooltip__detailList">
        {orders.map((order, index) => (
          <li key={`${order.timestamp ?? 'order'}-${order.side}-${order.quantity}-${order.price}-${index}`}>
            <span className="daily-close-tooltip__detailTime">{formatTimeOnly(order.timestamp)}</span>
            <span>{order.side === 'buy' ? 'buy' : 'sell'}</span>
            <strong>{formatInteger(order.quantity)}</strong>
            <span>@</span>
            <strong>{formatInteger(order.price)}</strong>
          </li>
        ))}
      </ul>
    </div>
  )
}

function buildDailyClosingChart(records: DailyClosingRecord[]) {
  if (records.length === 0) {
    return {
      linePath: '',
      upperBandPath: '',
      middleBandPath: '',
      lowerBandPath: '',
      points: [],
      xTicks: [],
      yTicks: [],
      volumeTicks: [],
      volumeBars: [],
    }
  }

  const chartLeft = 64
  const chartRight = 600
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
    .flatMap((record) => [record.last_price, record.high_price, record.low_price, record.best_bid_price, record.best_ask_price])
    .filter((value): value is number => typeof value === 'number' && !Number.isNaN(value))
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const padding = Math.max((maxValue - minValue) * 0.12, maxValue * 0.003, 1)
  const yMin = minValue - padding
  const yMax = maxValue + padding
  const yDomain = yMax - yMin || 1
  const tradedValueMax = Math.max(
    ...records.map((record) => (typeof record.traded_value === 'number' && !Number.isNaN(record.traded_value) ? record.traded_value : 0)),
    1,
  )

  const priceY = (value: number | null | undefined) => {
    const safeValue = typeof value === 'number' && !Number.isNaN(value) ? value : yMin
    return chartBottom - ((safeValue - yMin) / yDomain) * chartHeight
  }

  const xFor = (record: DailyClosingRecord, index: number) => {
    if (records.length === 1) {
      return chartLeft + chartWidth / 2
    }

    const timeValue = new Date(record.source_captured_at ?? `${record.trading_date}T15:00:00-05:00`).getTime()
    const xRatio = Number.isNaN(timeValue) ? index / Math.max(records.length - 1, 1) : (timeValue - minTime) / timeDomain
    return chartLeft + xRatio * chartWidth
  }

  const points = records.map((record, index) => {
    const x = xFor(record, index)
    const lastPrice = typeof record.last_price === 'number' ? record.last_price : yMin
    const y = priceY(lastPrice)
    const tradedValue = typeof record.traded_value === 'number' && !Number.isNaN(record.traded_value) ? record.traded_value : 0
    const volumeHeight = tradedValueMax <= 0 ? 0 : Math.max(1.5, (tradedValue / tradedValueMax) * chartHeight)

    return {
      key: buildDailyClosingKey(record),
      tradingDate: record.trading_date,
      x,
      y,
      label: record.trading_date,
      highY: priceY(record.high_price),
      lowY: priceY(record.low_price),
      bidY: priceY(record.best_bid_price),
      askY: priceY(record.best_ask_price),
      volumeY: chartBottom - volumeHeight,
      volumeHeight,
    }
  })

  const barWidth = computeDynamicBarWidth(
    points.map((point) => point.x),
    chartWidth,
  )

  return {
    linePath: buildSubtleSmoothedPath(points.map((point) => ({ x: point.x, y: point.y }))),
    upperBandPath: buildBandPath(
      points.map((point) => ({ x: point.x, y: point.askY })),
      points.map((point) => ({ x: point.x, y: point.highY })),
    ),
    middleBandPath: buildBandPath(
      points.map((point) => ({ x: point.x, y: point.bidY })),
      points.map((point) => ({ x: point.x, y: point.askY })),
    ),
    lowerBandPath: buildBandPath(
      points.map((point) => ({ x: point.x, y: point.bidY })),
      points.map((point) => ({ x: point.x, y: point.lowY })),
    ),
    points,
    xTicks: buildDailyClosingTicks(records, minTime, timeDomain, chartLeft, chartWidth),
    yTicks: buildDailyClosingYTicks(yMin, yMax, chartTop, chartBottom),
    volumeTicks: buildDailyClosingValueTicks(tradedValueMax, chartTop, chartBottom),
    volumeBars: points.map((point) => ({
      key: point.key,
      x: point.x,
      y: point.volumeY,
      width: barWidth,
      height: point.volumeHeight,
    })),
  }
}

function computeDynamicBarWidth(xs: number[], chartWidth: number) {
  if (xs.length <= 1) {
    return Math.max(2, chartWidth * 0.05)
  }

  let minGap = Number.POSITIVE_INFINITY

  for (let index = 1; index < xs.length; index += 1) {
    const gap = xs[index] - xs[index - 1]
    if (gap > 0 && gap < minGap) {
      minGap = gap
    }
  }

  if (!Number.isFinite(minGap)) {
    return Math.max(1.5, chartWidth / Math.max(xs.length * 2.4, 1))
  }

  return Math.max(1.25, minGap * 0.72)
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

function buildLinearPath(points: Array<{ x: number; y: number }>) {
  if (points.length === 0) {
    return ''
  }

  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
}

function buildSubtleSmoothedPath(points: Array<{ x: number; y: number }>) {
  if (points.length < 3) {
    return buildLinearPath(points)
  }

  const smoothing = 0.16
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index]
    const current = points[index]
    const next = points[index + 1]
    const following = points[index + 2] ?? next

    const controlPoint1 = {
      x: current.x + ((next.x - previous.x) * smoothing),
      y: current.y + ((next.y - previous.y) * smoothing),
    }
    const controlPoint2 = {
      x: next.x - ((following.x - current.x) * smoothing),
      y: next.y - ((following.y - current.y) * smoothing),
    }

    path += ` C ${controlPoint1.x.toFixed(2)} ${controlPoint1.y.toFixed(2)}, ${controlPoint2.x.toFixed(2)} ${controlPoint2.y.toFixed(2)}, ${next.x.toFixed(2)} ${next.y.toFixed(2)}`
  }

  return path
}

function buildBandPath(upper: Array<{ x: number; y: number }>, lower: Array<{ x: number; y: number }>) {
  if (upper.length === 0 || lower.length === 0) {
    return ''
  }

  const top = upper.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ')
  const bottom = [...lower]
    .reverse()
    .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')

  return `${top} ${bottom} Z`
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

function buildDailyClosingValueTicks(tradedValueMax: number, chartTop: number, chartBottom: number) {
  const tickValues = [tradedValueMax, tradedValueMax * 0.5, 0]

  return tickValues.map((value, index) => {
    const ratio = tradedValueMax <= 0 ? 0 : value / tradedValueMax
    const y = chartBottom - ratio * (chartBottom - chartTop)

    return {
      key: `v-${index}`,
      y,
      label: formatValueInMillions(value),
    }
  })
}

function formatValueInMillions(value: number) {
  if (!Number.isFinite(value)) {
    return 'n/a'
  }

  if (value === 0) {
    return '0M'
  }

  const millions = value / 1_000_000
  const digits = Math.abs(millions) >= 1 ? 1 : 2
  return `${formatNumber(millions, digits)}M`
}

function buildDailyClosingKey(record: DailyClosingRecord) {
  return record.source_snapshot_checksum ?? `${record.symbol}-${record.trading_date}`
}

function formatTimeOnly(value: string | null | undefined) {
  if (!value) {
    return '--:--'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '--:--'
  }

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}
