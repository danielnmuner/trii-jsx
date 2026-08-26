import { useEffect, useMemo, useState } from 'react'
import type { ZscoreMetricSample, ZscoreOpportunityRecord } from '../api/schemas'
import { formatInteger, formatMetricValue, formatNumber, formatPercentFromWhole, formatTimestamp } from '../lib/formatters'
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

type ZscoreOpportunityBucketRange = ZscoreOpportunityRecord & {
  bucket_min_last_price_10m?: number | null
  bucket_max_last_price_10m?: number | null
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

function shouldHighlightOpportunityValueBar(record: ZscoreOpportunityRecord) {
  const obiL1Zscore = record.triggered_z_scores?.obi_l1?.z_score
  const obiTop5Zscore = record.triggered_z_scores?.obi_top_5?.z_score

  return [obiL1Zscore, obiTop5Zscore].some(
    (zScore) => typeof zScore === 'number' && !Number.isNaN(zScore) && Math.abs(zScore) >= 2,
  )
}

function resolveLevelOnePrice(levels: ZscoreOpportunityRecord['bid_levels'] | ZscoreOpportunityRecord['ask_levels']) {
  const price = levels?.[0]?.price
  return typeof price === 'number' && !Number.isNaN(price) ? price : null
}

function resolveBestBidPrice(record: ZscoreOpportunityRecord) {
  return typeof record.best_bid_price === 'number' && !Number.isNaN(record.best_bid_price)
    ? record.best_bid_price
    : resolveLevelOnePrice(record.bid_levels)
}

function resolveBestAskPrice(record: ZscoreOpportunityRecord) {
  return typeof record.best_ask_price === 'number' && !Number.isNaN(record.best_ask_price)
    ? record.best_ask_price
    : resolveLevelOnePrice(record.ask_levels)
}

function resolveOpportunityTradedValue(record: ZscoreOpportunityRecord) {
  if (typeof record.traded_value === 'number' && !Number.isNaN(record.traded_value)) {
    return record.traded_value
  }
  const sampleValue = record.triggered_z_scores?.traded_value?.sample_value
  return typeof sampleValue === 'number' && !Number.isNaN(sampleValue) ? sampleValue : 0
}

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
  const chartThemeId = useMemo(
    () => `zscore-${window.symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    [window.symbol],
  )

  useEffect(() => {
    if (!copyState) {
      return undefined
    }

    const timeoutId = globalThis.setTimeout(() => {
      setCopyState(null)
    }, 1400)

    return () => globalThis.clearTimeout(timeoutId)
  }, [copyState])

  useEffect(() => {
    if (!activeChecksum) {
      return undefined
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        setActiveChecksum(null)
        return
      }

      if (target.closest('[data-zscore-point-hit="true"]')) {
        return
      }

      if (target.closest('[data-zscore-tooltip="true"]')) {
        return
      }

      setActiveChecksum(null)
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => document.removeEventListener('pointerdown', handlePointerDown, true)
  }, [activeChecksum])

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
            <linearGradient id={`${chartThemeId}-upper-band`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 116, 248, 0.58)" />
              <stop offset="52%" stopColor="rgba(230, 82, 255, 0.38)" />
              <stop offset="100%" stopColor="rgba(138, 92, 255, 0.16)" />
            </linearGradient>
            <linearGradient id={`${chartThemeId}-middle-band`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(45, 214, 255, 0.28)" />
              <stop offset="100%" stopColor="rgba(65, 106, 255, 0.16)" />
            </linearGradient>
            <linearGradient id={`${chartThemeId}-lower-band`} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(148, 96, 255, 0.44)" />
              <stop offset="52%" stopColor="rgba(108, 122, 255, 0.3)" />
              <stop offset="100%" stopColor="rgba(74, 208, 255, 0.14)" />
            </linearGradient>
            <linearGradient id={`${chartThemeId}-value-bar`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="rgba(28, 37, 55, 0.08)" />
              <stop offset="100%" stopColor="rgba(91, 124, 196, 0.36)" />
            </linearGradient>
            <linearGradient id={`${chartThemeId}-value-bar-signal`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="rgba(0, 214, 255, 0.18)" />
              <stop offset="100%" stopColor="rgba(0, 255, 255, 0.74)" />
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
          <line x1="44" y1="16" x2="44" y2="252" className="zscore-chart__axisLine" />
          <line x1="612" y1="16" x2="612" y2="252" className="zscore-chart__axisLine zscore-chart__axisLine--value" />
          <line x1="44" y1="252" x2="612" y2="252" className="zscore-chart__axisLine zscore-chart__axisLine--bottom" />

          {chart.valueBars.map((bar) => (
            <rect
              key={bar.key}
              x={bar.x - bar.width / 2}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx="2"
              className={`zscore-chart__valueBar ${bar.isHighlighted ? 'zscore-chart__valueBar--signal' : ''}`}
              fill={`url(#${bar.isHighlighted ? `${chartThemeId}-value-bar-signal` : `${chartThemeId}-value-bar`})`}
            />
          ))}

          {chart.yTicks.map((tick) => (
            <g key={tick.key}>
              <line
                x1="44"
                y1={tick.y}
                x2="612"
                y2={tick.y}
                className="zscore-chart__gridLine"
              />
              <text x="10" y={tick.y + 3} textAnchor="start" className="zscore-chart__yLabel">
                {tick.label}
              </text>
            </g>
          ))}

          {chart.valueTicks.map((tick) => (
            <g key={tick.key}>
              <line x1="44" y1={tick.y} x2="612" y2={tick.y} className="zscore-chart__valueGuide" />
              <text x="636" y={tick.y + 3} textAnchor="end" className="zscore-chart__valueLabel">
                {tick.label}
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

          <path d={chart.upperBandPath} className="zscore-chart__band zscore-chart__band--upper" fill={`url(#${chartThemeId}-upper-band)`} />
          <path d={chart.middleBandPath} className="zscore-chart__band zscore-chart__band--middle" fill={`url(#${chartThemeId}-middle-band)`} />
          <path d={chart.lowerBandPath} className="zscore-chart__band zscore-chart__band--lower" fill={`url(#${chartThemeId}-lower-band)`} />
          <text x="52" y="30" textAnchor="start" className="zscore-chart__bandLabel zscore-chart__bandLabel--ask">
            ASK
          </text>
          <text x="52" y="244" textAnchor="start" className="zscore-chart__bandLabel zscore-chart__bandLabel--bid">
            BID
          </text>
          <path
            d={chart.linePath}
            fill="none"
            stroke="rgba(113, 227, 255, 0.98)"
            strokeWidth="1.45"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter={`url(#${chartThemeId}-line-glow)`}
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
                    fill="rgba(0, 236, 255, 0.12)"
                  />
                ) : null}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isActive ? 3.1 : 1.85}
                  fill={isActive ? 'rgba(179, 244, 255, 1)' : 'rgba(123, 232, 255, 0.98)'}
                  stroke={isActive ? 'rgba(240, 252, 255, 0.92)' : 'rgba(123, 232, 255, 0.34)'}
                  strokeWidth={isActive ? 0.78 : 0.4}
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={10}
                  fill="transparent"
                  className="zscore-chart__pointHit"
                  data-zscore-point-hit="true"
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
  const recordWithBucketRange = record as ZscoreOpportunityBucketRange
  const dailyChangeTone =
    typeof record.daily_change_amount === 'number' && record.daily_change_amount < 0 ? 'negative' : 'positive'
  const bucketMin =
    typeof recordWithBucketRange.bucket_min_last_price_10m === 'number' && !Number.isNaN(recordWithBucketRange.bucket_min_last_price_10m)
      ? recordWithBucketRange.bucket_min_last_price_10m
      : null
  const bucketMax =
    typeof recordWithBucketRange.bucket_max_last_price_10m === 'number' && !Number.isNaN(recordWithBucketRange.bucket_max_last_price_10m)
      ? recordWithBucketRange.bucket_max_last_price_10m
      : null
  const bucketRangeTone = bucketMin !== null && bucketMax !== null && bucketMin === bucketMax ? 'flat' : 'range'
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
      data-zscore-tooltip="true"
      style={style}
    >
      <div className="zscore-tooltip__timestamp">{formatTimestamp(record.captured_at)}</div>
      <div className="zscore-tooltip__priceRow">
        <strong className="zscore-tooltip__priceValue">{formatMetricValue('last_price', record.last_price)}</strong>
        {bucketMin !== null || bucketMax !== null ? (
          <span className="zscore-tooltip__bucketRange">
            <span className={`zscore-tooltip__bucketValue zscore-tooltip__bucketValue--${bucketRangeTone === 'flat' ? 'flat' : 'max'}`}>
              {formatMetricValue('last_price', bucketMax)}
            </span>
            <span className={`zscore-tooltip__bucketValue zscore-tooltip__bucketValue--${bucketRangeTone === 'flat' ? 'flat' : 'min'}`}>
              {formatMetricValue('last_price', bucketMin)}
            </span>
          </span>
        ) : null}
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
      linePath: '',
      upperBandPath: '',
      middleBandPath: '',
      lowerBandPath: '',
      points: [],
      xTicks: [],
      yTicks: [],
      valueTicks: [],
      valueBars: [],
    }
  }

  const chartLeft = 44
  const chartRight = 612
  const chartTop = 16
  const chartBottom = 252
  const chartWidth = chartRight - chartLeft
  const chartHeight = chartBottom - chartTop

  const referenceValues = [
    ...records.flatMap((record) => [record.high_price, resolveBestAskPrice(record), resolveBestBidPrice(record), record.low_price, record.last_price]),
  ].filter((value): value is number => typeof value === 'number' && !Number.isNaN(value))

  const minValue = Math.min(...referenceValues)
  const maxValue = Math.max(...referenceValues)
  const padding = Math.max((maxValue - minValue) * 0.08, maxValue * 0.004, 1)
  const yMin = minValue - padding
  const yMax = maxValue + padding
  const yDomain = yMax - yMin || 1
  const tradedValueMax = Math.max(
    ...records.map((record) => resolveOpportunityTradedValue(record)),
    1,
  )

  const points = records.map((record, index) => {
    const xRatio = records.length === 1 ? 0.5 : index / Math.max(records.length - 1, 1)
    const x = chartLeft + xRatio * chartWidth
    const lastPrice = typeof record.last_price === 'number' ? record.last_price : yMin
    const y = chartBottom - ((lastPrice - yMin) / yDomain) * chartHeight
    const tradedValue = resolveOpportunityTradedValue(record)
    const bestAskPrice = resolveBestAskPrice(record)
    const bestBidPrice = resolveBestBidPrice(record)
    const barHeight = tradedValueMax <= 0 ? 0 : Math.max(1.5, (tradedValue / tradedValueMax) * chartHeight)
    const metrics = zscoreMetricOrder
      .map((metricKey) => record.triggered_z_scores?.[metricKey])
      .filter((metric): metric is ZscoreMetricSample => Boolean(metric))
    return {
      key: record.snapshot_checksum || record.captured_at,
      x,
      y,
      highY: chartBottom - (((typeof record.high_price === 'number' ? record.high_price : yMin) - yMin) / yDomain) * chartHeight,
      askY: chartBottom - ((((typeof bestAskPrice === 'number' ? bestAskPrice : yMin) - yMin) / yDomain) * chartHeight),
      bidY: chartBottom - ((((typeof bestBidPrice === 'number' ? bestBidPrice : yMin) - yMin) / yDomain) * chartHeight),
      lowY: chartBottom - (((typeof record.low_price === 'number' ? record.low_price : yMin) - yMin) / yDomain) * chartHeight,
      valueY: chartBottom - barHeight,
      valueHeight: barHeight,
      metricCount: metrics.filter((metric) => typeof metric.z_score === 'number').length,
    }
  })

  const xTicks = buildTimeTicks(records, chartLeft, chartWidth)
  const valueBarWidth = computeDynamicBarWidth(
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
    xTicks,
    yTicks: buildPriceTicks(yMin, yMax, chartTop, chartBottom),
    valueTicks: buildValueTicks(tradedValueMax, chartTop, chartBottom),
    valueBars: points.map((point, index) => ({
      key: point.key,
      x: point.x,
      y: point.valueY,
      width: valueBarWidth,
      height: point.valueHeight,
      isHighlighted: shouldHighlightOpportunityValueBar(records[index]),
    })),
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

function buildTimeTicks(records: ZscoreOpportunityRecord[], chartLeft: number, chartWidth: number) {
  const tickIndexes = Array.from(
    new Set([0, Math.floor((records.length - 1) * 0.25), Math.floor((records.length - 1) * 0.5), Math.floor((records.length - 1) * 0.75), records.length - 1]),
  )
  return tickIndexes.map((index) => {
    const record = records[index]
    const xRatio = records.length === 1 ? 0.5 : index / Math.max(records.length - 1, 1)
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

function buildPriceTicks(yMin: number, yMax: number, chartTop: number, chartBottom: number) {
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

function buildValueTicks(tradedValueMax: number, chartTop: number, chartBottom: number) {
  const tickValues = [tradedValueMax, tradedValueMax * 0.5, 0]

  return tickValues.map((value, index) => {
    const ratio = tradedValueMax <= 0 ? 0 : value / tradedValueMax
    const y = chartBottom - ratio * (chartBottom - chartTop)

    return {
      key: `v-${index}`,
      y,
      label: formatMagnitude(value),
    }
  })
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
    return Math.max(1.25, chartWidth / Math.max(xs.length * 2.4, 1))
  }

  return Math.max(1.1, minGap * 0.72)
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
